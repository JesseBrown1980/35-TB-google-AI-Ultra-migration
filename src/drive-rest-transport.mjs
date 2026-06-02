// drive-rest-transport.mjs — the LIVE Drive v3 backend for GoogleDriveStore.
//
// Implements the exact transport interface the adapter expects:
//   upload(folder, title, bytes) -> id    (upsert: update if name exists, else create)
//   download(folder, title)      -> Buffer | null
//   list(folder)                 -> [{ title, bytes }]
//   move(fromFolder, toFolder, title) -> boolean   (re-parent; NEVER trash/delete)
//
// Discipline held:
//  - NO secrets inlined. The bearer token arrives by role via a pluggable getAccessToken()
//    (default throws GATED, pointing at the one operator command). Tokens never live in this repo.
//  - Pluggable fetchImpl so this is unit-testable against a simulated Drive with zero creds.
//  - compact/move re-parents the object; it never deletes (Drive trash stays off) — the
//    gc_evidence_deletion guard, same as MemoryStore.
//  - "folder" is a path like "behcs-rooms/sector-0"; resolved to (and created as) real Drive
//    folders, ids cached. Live round-trip is NOT proven until ADC is loaded and a real page
//    round-trips sha16-clean.
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export function gatedToken() {
  throw new Error(
    "GATED: DriveRestTransport needs an access token by role. The operator runs ONCE, locally:\n" +
    "  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/drive\n" +
    "then pass getAccessToken (e.g. accessTokenViaGcloud). No token is ever inlined in this repo."
  );
}

// Optional opt-in helper: read a short-lived token from the operator's local ADC via gcloud.
// Never stores it; returns it for one batch of calls. Stays out of the repo's bytes.
export async function accessTokenViaGcloud(spawnImpl) {
  const { spawnSync } = spawnImpl ? { spawnSync: spawnImpl } : await import("node:child_process");
  const r = spawnSync("gcloud", ["auth", "application-default", "print-access-token"],
    { encoding: "utf8", shell: true, timeout: 20000 });
  const tok = (r.stdout || "").trim();
  if (!tok) throw new Error("gcloud returned no token — ADC not set? " + (r.stderr || "").slice(0, 200));
  return tok;
}

export class DriveRestTransport {
  constructor({ getAccessToken, fetchImpl, rootFolderId = "root" } = {}) {
    this.getAccessToken = getAccessToken || gatedToken;   // GATED unless a token source is supplied
    this.fetch = fetchImpl || globalThis.fetch;
    this.rootFolderId = rootFolderId;
    this.kind = "drive-rest";
    this._folderCache = new Map();   // path -> id
  }

  async _auth() {
    const t = await this.getAccessToken();
    return { Authorization: `Bearer ${t}` };
  }

  async _json(method, url, { headers = {}, body } = {}) {
    const res = await this.fetch(url, { method, headers: { ...(await this._auth()), ...headers }, body });
    if (!res.ok) throw new Error(`Drive ${method} ${url.slice(0, 80)} -> ${res.status} ${await res.text().catch(() => "")}`);
    return res.json();
  }

  // Resolve (creating as needed) a slash-path of folders to a Drive folder id.
  async _folderId(folderPath) {
    if (this._folderCache.has(folderPath)) return this._folderCache.get(folderPath);
    let parent = this.rootFolderId;
    let acc = "";
    for (const seg of folderPath.split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${seg}` : seg;
      if (this._folderCache.has(acc)) { parent = this._folderCache.get(acc); continue; }
      const q = `name='${seg.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
      const found = await this._json("GET", `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
      let id = found.files?.[0]?.id;
      if (!id) {
        const made = await this._json("POST", `${DRIVE}/files?fields=id`, {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: seg, mimeType: FOLDER_MIME, parents: [parent] }),
        });
        id = made.id;
      }
      this._folderCache.set(acc, id);
      parent = id;
    }
    return parent;
  }

  async _findFileId(folderId, title) {
    const q = `name='${title.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
    const r = await this._json("GET", `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
    return r.files?.[0]?.id ?? null;
  }

  async upload(folder, title, bytes) {
    const folderId = await this._folderId(folder);
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const existing = await this._findFileId(folderId, title);
    if (existing) {                                   // upsert: update content in place
      const res = await this.fetch(`${UPLOAD}/files/${existing}?uploadType=media&fields=id`,
        { method: "PATCH", headers: { ...(await this._auth()), "Content-Type": "application/octet-stream" }, body: buf });
      if (!res.ok) throw new Error(`Drive update ${existing} -> ${res.status}`);
      return existing;
    }
    // multipart create: metadata part + media part
    const boundary = "asoboundary" + buf.length.toString(36);
    const meta = JSON.stringify({ name: title, parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await this.fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { ...(await this._auth()), "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Drive create -> ${res.status} ${await res.text().catch(() => "")}`);
    return (await res.json()).id;
  }

  async _media(fileId) {
    const res = await this.fetch(`${DRIVE}/files/${fileId}?alt=media`, { method: "GET", headers: await this._auth() });
    if (!res.ok) throw new Error(`Drive media ${fileId} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async download(folder, title) {
    const folderId = await this._folderId(folder);
    const id = await this._findFileId(folderId, title);
    return id ? this._media(id) : null;
  }

  async list(folder) {
    const folderId = await this._folderId(folder);
    const out = [];
    let pageToken;
    do {
      const q = `'${folderId}' in parents and mimeType!='${FOLDER_MIME}' and trashed=false`;
      const url = `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=100&spaces=drive` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const page = await this._json("GET", url);
      for (const f of page.files || []) out.push({ title: f.name, bytes: await this._media(f.id) });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  // re-parent: add to compacted folder, remove from live folder. NEVER trashes content.
  async move(fromFolder, toFolder, title) {
    const fromId = await this._folderId(fromFolder);
    const id = await this._findFileId(fromId, title);
    if (!id) return false;
    const toId = await this._folderId(toFolder);
    await this._json("PATCH", `${DRIVE}/files/${id}?addParents=${toId}&removeParents=${fromId}&fields=id,parents`);
    return true;
  }
}
