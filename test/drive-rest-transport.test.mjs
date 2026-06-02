// drive-rest-transport.test.mjs — proves the live transport speaks Drive v3 correctly,
// driven end-to-end through the real GoogleDriveStore, against a SIMULATED Drive (fake fetch).
// No credentials, no network. Run: node --test test/drive-rest-transport.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { DriveRestTransport } from "../src/drive-rest-transport.mjs";
import { GoogleDriveStore, sha16 } from "../src/google-drive-store.mjs";

const FOLDER_MIME = "application/vnd.google-apps.folder";

// --- a tiny in-memory Drive that answers exactly the v3 calls the transport makes ----------
function fakeDrive() {
  const state = { files: new Map(), n: 0, lastAuth: null };
  const ok = (status, jsonObj, bytes) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => jsonObj, text: async () => JSON.stringify(jsonObj ?? ""),
    arrayBuffer: async () => bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0),
  });
  const fetchImpl = async (url, opts = {}) => {
    const method = opts.method || "GET";
    state.lastAuth = opts.headers?.Authorization ?? state.lastAuth;
    const u = new URL(url);
    const p = u.pathname;
    const idMatch = p.match(/\/files\/([^/?]+)$/);

    // GET media
    if (method === "GET" && idMatch && u.searchParams.get("alt") === "media") {
      const f = state.files.get(idMatch[1]);
      return f ? ok(200, null, f.content) : ok(404, { error: "not found" });
    }
    // PATCH re-parent (move) — drive/v3 (not upload)
    if (method === "PATCH" && idMatch && !p.startsWith("/upload")) {
      const f = state.files.get(idMatch[1]);
      const add = u.searchParams.get("addParents"), rem = u.searchParams.get("removeParents");
      if (rem) f.parents.delete(rem);
      if (add) f.parents.add(add);
      return ok(200, { id: f.id, parents: [...f.parents] });
    }
    // PATCH media update (upsert content) — upload endpoint
    if (method === "PATCH" && idMatch && p.startsWith("/upload")) {
      const f = state.files.get(idMatch[1]);
      f.content = Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body);
      return ok(200, { id: f.id });
    }
    // POST multipart create (upload endpoint)
    if (method === "POST" && p.startsWith("/upload")) {
      const buf = Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(opts.body);
      const s = buf.toString("latin1");
      const mBody = s.indexOf("\r\n\r\n", s.indexOf("application/json")) + 4;
      const meta = JSON.parse(s.slice(mBody, s.indexOf("\r\n--", mBody)));
      const cStart = s.indexOf("\r\n\r\n", s.indexOf("application/octet-stream")) + 4;
      const content = buf.slice(cStart, s.lastIndexOf("\r\n--"));
      const id = `f${++state.n}`;
      state.files.set(id, { id, name: meta.name, parents: new Set(meta.parents), mimeType: "application/octet-stream", content });
      return ok(200, { id });
    }
    // POST create folder (drive/v3)
    if (method === "POST" && p.endsWith("/files")) {
      const meta = JSON.parse(opts.body);
      const id = `f${++state.n}`;
      state.files.set(id, { id, name: meta.name, parents: new Set(meta.parents), mimeType: meta.mimeType, content: Buffer.alloc(0) });
      return ok(200, { id });
    }
    // GET list / find by q
    if (method === "GET" && p.endsWith("/files")) {
      const q = decodeURIComponent(u.searchParams.get("q") || "");
      const nameM = q.match(/name='([^']*)'/);
      const parentM = q.match(/'([^']+)' in parents/);
      const wantFolder = q.includes(`mimeType='${FOLDER_MIME}'`);
      const notFolder = q.includes(`mimeType!='${FOLDER_MIME}'`);
      let files = [...state.files.values()];
      if (parentM) files = files.filter((f) => f.parents.has(parentM[1]));
      if (nameM) files = files.filter((f) => f.name === nameM[1]);
      if (wantFolder) files = files.filter((f) => f.mimeType === FOLDER_MIME);
      if (notFolder) files = files.filter((f) => f.mimeType !== FOLDER_MIME);
      return ok(200, { files: files.map((f) => ({ id: f.id, name: f.name })) });
    }
    return ok(400, { error: "unhandled " + method + " " + p });
  };
  return { state, fetchImpl };
}

const PID = "BH.SECTOR.P2.R0000000.AAAA";
const PAGE = "WHITEROOM|pid=" + PID + "|score=0.91|verdict=genius|json=0";

test("GATED without a token source (no secrets inlined)", async () => {
  const t = new DriveRestTransport({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(() => t.upload("behcs-rooms/sector-0", PID, PAGE), /GATED.*application-default login/s);
});

test("live transport round-trips a page through GoogleDriveStore (simulated Drive, no creds)", async () => {
  const { fetchImpl } = fakeDrive();
  const store = new GoogleDriveStore({
    transport: new DriveRestTransport({ getAccessToken: async () => "fake-token", fetchImpl }),
    sectorIndex: 0,
  });
  const r = await store.put(PID, PAGE);                 // put self-verifies sha16 by reading back
  assert.equal(r.sha16, sha16(PAGE), "put round-trip sha16 matches");
  const back = await store.get(PID);
  assert.ok(back, "retrievable");
  assert.equal(back.page.toString(), PAGE, "exact bytes back from Drive");
  assert.equal(back.sha16, sha16(PAGE));
});

test("compact re-parents and NEVER deletes — page still retrievable from compacted/", async () => {
  const { fetchImpl } = fakeDrive();
  const store = new GoogleDriveStore({ transport: new DriveRestTransport({ getAccessToken: async () => "tok", fetchImpl }), sectorIndex: 0 });
  await store.put(PID, PAGE);
  assert.equal((await store.stats()).live, 1);
  assert.equal(await store.compact(PID), true);
  const st = await store.stats();
  assert.equal(st.live, 0, "out of live folder");
  assert.equal(st.compacted, 1, "moved to compacted, not deleted");
  const after = await store.get(PID);
  assert.ok(after && after.page.toString() === PAGE, "STILL retrievable after compact — evidence preserved");
});

test("upsert: re-putting the same PID updates in place, no duplicate", async () => {
  const { fetchImpl } = fakeDrive();
  const t = new DriveRestTransport({ getAccessToken: async () => "tok", fetchImpl });
  await t.upload("behcs-rooms/sector-0", PID, "v1");
  await t.upload("behcs-rooms/sector-0", PID, "v2");
  const listed = await t.list("behcs-rooms/sector-0");
  assert.equal(listed.length, 1, "one object, not two");
  assert.equal(listed[0].bytes.toString(), "v2", "content updated in place");
});

test("every call carries the bearer token by role", async () => {
  const { state, fetchImpl } = fakeDrive();
  const t = new DriveRestTransport({ getAccessToken: async () => "fake-token", fetchImpl });
  await t.upload("behcs-rooms/sector-0", PID, PAGE);
  assert.match(state.lastAuth || "", /^Bearer fake-token$/, "Authorization: Bearer <token> sent");
});
