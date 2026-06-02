// google-drive-store.test.mjs — proves the LEG-4 adapter satisfies the STORE interface
// OFFLINE (InMemoryDriveTransport), and that the cloud path is honestly GATED.
// Run: node --test test/google-drive-store.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import {
  GoogleDriveStore, InMemoryDriveTransport, driveTransportFromADC, sha16,
} from "../src/google-drive-store.mjs";

const mk = () => new GoogleDriveStore({ transport: new InMemoryDriveTransport(), sectorIndex: 0 });
const PID = "BH.SECTOR.P2.R0000000.A1B2C3D4";
const PAGE = "WHITEROOM|pid=" + PID + "|score=0.81|verdict=genius|json=0";

test("cloud path is GATED without a credentialed transport", () => {
  assert.throws(() => driveTransportFromADC(), /GATED.*gcloud auth application-default login/s);
  assert.throws(() => new GoogleDriveStore({}), /GATED.*gcloud auth application-default login/s);
});

test("put -> get round-trips the page sha16 byte-for-byte", async () => {
  const s = mk();
  const r = await s.put(PID, PAGE);
  assert.equal(r.sha16, sha16(PAGE), "put reports the page sha16");
  const back = await s.get(PID);
  assert.ok(back, "page retrievable");
  assert.equal(back.sha16, sha16(PAGE), "get sha16 == put sha16 (byte-match)");
  assert.equal(back.page.toString(), PAGE, "exact bytes back");
  assert.equal(back.compacted, false);
});

test("put round-trip self-verifies and rejects a corrupting transport", async () => {
  const bad = new InMemoryDriveTransport();
  bad.download = async () => Buffer.from("tampered");   // return wrong bytes on read-back
  const s = new GoogleDriveStore({ transport: bad });
  await assert.rejects(() => s.put(PID, PAGE), /round-trip sha16 mismatch/);
});

test("scanByPID filters live pages", async () => {
  const s = mk();
  await s.put("BH.SECTOR.P2.R0000000.AAAA", "pageA");
  await s.put("BH.SECTOR.P2.R0000001.BBBB", "pageB");
  const hits = await s.scanByPID((pid) => pid.includes(".R0000000."));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pid, "BH.SECTOR.P2.R0000000.AAAA");
});

test("compact NEVER deletes — moves live->compacted, page still retrievable (gc_evidence_deletion guard)", async () => {
  const s = mk();
  await s.put(PID, PAGE);
  assert.equal((await s.stats()).live, 1);
  const moved = await s.compact(PID);
  assert.equal(moved, true);
  const st = await s.stats();
  assert.equal(st.live, 0, "out of live");
  assert.equal(st.compacted, 1, "moved to compacted, not gone");
  const back = await s.get(PID);
  assert.ok(back, "STILL retrievable after compact — evidence preserved");
  assert.equal(back.compacted, true);
  assert.equal(back.page.toString(), PAGE, "compacted bytes intact");
});

test("interface parity: exposes put/get/scanByPID/compact/stats + a kind tag", () => {
  const s = mk();
  for (const m of ["put", "get", "scanByPID", "compact", "stats"]) {
    assert.equal(typeof s[m], "function", `has ${m}()`);
  }
  assert.match(s.kind, /^google-drive\(/, "kind names the backing transport");
});
