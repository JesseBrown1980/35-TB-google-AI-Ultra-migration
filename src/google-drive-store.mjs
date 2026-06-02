// google-drive-store.mjs — LEG-4: the GoogleDriveStore adapter.
//
// The SAME named STORE interface the white-room engine (LEG-1) already defines:
//   put(pid, page) · get(pid) · scanByPID(pred) · compact(pid)   // compact = MOVE, never delete
// backed by the 35 TB Google AI Ultra Drive as an append-only cloud-RAM page store.
//
// Honest boundaries (the night's discipline — stated, not hidden):
//  - This is a PAGE store: `page` is the sealed HBP page bytes (string/Buffer), not a per-room record.
//    Drive is network-backed, so these ops are ASYNC (return Promises). The white-room engine's
//    MemoryStore is sync; the drop-in is at the PAGE/seal boundary (batch flush), where async is fine.
//  - It is GATED. With no credentialed transport it throws — exactly like RedisCloudStore — pointing at
//    the one operator-only gate: `gcloud auth application-default login`. No creds are inlined here, ever.
//  - "Cloud-RAM" is NOT proven until a CREDENTIALED transport round-trips a real page (sha16 byte-match).
//    The InMemoryDriveTransport below proves the INTERFACE offline; it is explicitly NOT the cloud.
//  - compact() NEVER deletes (the gc_evidence_deletion guard): it MOVES the page to a `compacted/`
//    folder. Drive trash stays off. Evidence is preserved.
import crypto from "node:crypto";

export const sha16 = (s) =>
  crypto.createHash("sha256").update(Buffer.isBuffer(s) ? s : String(s)).digest("hex").slice(0, 16);

// ---- transport: the minimal Drive I/O surface the store needs ---------------------------------
// A real transport hits the Drive REST API with a bearer token from ADC. The store is written
// against THIS surface so the cloud and the offline fake are true drop-ins for each other.
//   upload(folder, title, bytes) -> id
//   download(folder, title)      -> bytes | null
//   list(folder)                 -> [{ title, bytes }]
//   move(fromFolder, toFolder, title) -> moved:boolean   (copy+remove-pointer; never trashes content)

// Offline, dependency-free transport. CI-green. NOT the cloud — a Map standing in for Drive.
export class InMemoryDriveTransport {
  constructor() { this.folders = new Map(); this.kind = "in-memory(NOT-cloud)"; }
  _f(folder) { if (!this.folders.has(folder)) this.folders.set(folder, new Map()); return this.folders.get(folder); }
  async upload(folder, title, bytes) { this._f(folder).set(title, Buffer.from(bytes)); return `${folder}/${title}`; }
  async download(folder, title) { const b = this._f(folder).get(title); return b ? Buffer.from(b) : null; }
  async list(folder) { return [...this._f(folder).entries()].map(([title, bytes]) => ({ title, bytes: Buffer.from(bytes) })); }
  async move(fromFolder, toFolder, title) {
    const b = this._f(fromFolder).get(title);
    if (b === undefined) return false;
    this._f(toFolder).set(title, Buffer.from(b));   // copy to compacted/ FIRST (evidence preserved)
    this._f(fromFolder).delete(title);              // then drop only the live pointer — content still exists
    return true;
  }
}

// The real Drive transport is GATED: minting it requires ADC, which is an operator-local step.
// We do NOT implement a token grab here (no secrets in this repo); we name the gate and stop.
export function driveTransportFromADC() {
  throw new Error(
    "GATED: GoogleDriveStore needs Application Default Credentials. Run the ONE operator-local gate:\n" +
    "  gcloud auth application-default login\n" +
    "then provide a transport that carries the bearer token by role (never inlined in this repo). " +
    "Until a credentialed transport round-trips a real page (sha16 byte-match), cloud-RAM is NOT proven."
  );
}

// ---- the store: same interface as MemoryStore/RedisCloudStore, page-level, never-delete --------
export class GoogleDriveStore {
  // sector → the Drive folder a page's PID lands in: behcs-rooms/sector-{S}; compacted under behcs-rooms/compacted/sector-{S}
  constructor({ transport, sectorIndex = 0, rootFolder = "behcs-rooms", verifySha = true } = {}) {
    if (!transport) transport = driveTransportFromADC();   // GATED unless a credentialed transport is supplied
    this.t = transport;
    this.sectorIndex = sectorIndex;
    this.liveFolder = `${rootFolder}/sector-${sectorIndex}`;
    this.compactedFolder = `${rootFolder}/compacted/sector-${sectorIndex}`;
    this.verifySha = verifySha;
    this.kind = `google-drive(${transport.kind ?? "live"})`;
    this._index = new Map();     // pid -> { sha16, compacted } — local liveness view; Drive is source of truth
  }

  // put(pid, page): upload the HBP page as a Drive object titled by PID; sha16-verify the round-trip.
  async put(pid, page) {
    const bytes = Buffer.isBuffer(page) ? page : Buffer.from(String(page));
    const want = sha16(bytes);
    await this.t.upload(this.liveFolder, pid, bytes);
    if (this.verifySha) {
      const back = await this.t.download(this.liveFolder, pid);
      const got = back && sha16(back);
      if (got !== want) throw new Error(`put round-trip sha16 mismatch for ${pid}: want ${want}, got ${got}`);
    }
    this._index.set(pid, { sha16: want, compacted: false });
    return { pid, sha16: want };
  }

  async get(pid) {
    let b = await this.t.download(this.liveFolder, pid);
    let compacted = false;
    if (b === null) { b = await this.t.download(this.compactedFolder, pid); compacted = b !== null; }  // still retrievable after compact
    return b === null ? null : { pid, page: b, sha16: sha16(b), compacted };
  }

  async scanByPID(pred) {
    const out = [];
    for (const { title, bytes } of await this.t.list(this.liveFolder)) {
      if (pred(title)) out.push({ pid: title, page: bytes, sha16: sha16(bytes) });
    }
    return out;
  }

  // compact(pid): MOVE live -> compacted, NEVER delete (gc_evidence_deletion guard).
  async compact(pid) {
    const moved = await this.t.move(this.liveFolder, this.compactedFolder, pid);
    if (moved) { const e = this._index.get(pid) ?? {}; this._index.set(pid, { ...e, compacted: true }); }
    return moved;
  }

  async stats() {
    const live = (await this.t.list(this.liveFolder)).length;
    const compacted = (await this.t.list(this.compactedFolder)).length;
    return { live, compacted, kind: this.kind };
  }
}
