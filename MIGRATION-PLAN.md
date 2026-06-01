# 35 TB Google AI Ultra — Migration Plan (LEG-4)

Honest, bounded plan to extend the already-built local fabric with a cloud
storage leg. Calibrated: each item is marked **real-now** or **gated**, and the
gate is named.

## The fabric's four legs

| Leg | What | Where | State |
|-----|------|-------|-------|
| LEG-1 | white-room **engine** (the scorer; pluggable store + scorer, never-delete) | local | built + tested |
| LEG-2 | prime-sector **allocator** (the address: `BH.SECTOR.P{prime}.R{room}.{sha16}`) | local | built + tested |
| LEG-3 | github **bus** (commit = emit, log = read) | local + GitHub | built + tested |
| LEG-4 | **`GoogleDriveStore`** (the 35 TB cloud sink) | this repo | **planned — gated** |

LEG-4 is *only* a new backend for the **store interface LEG-1 already defines**
(`put/get/scanByPID/compact`). Everything above it is unchanged.

## Real-now vs gated

| Piece | Status | Note |
|-------|--------|------|
| `gcloud` CLI authed | real-now | local operator account |
| Gemini CLI | real-now | optional build-helper |
| Drive **read** scope | real-now | via the operator's connected account |
| **Application Default Credentials** (write path) | **GATED** | one local command: `gcloud auth application-default login` |
| `GoogleDriveStore` adapter | not built | this repo's deliverable |
| Redis Cloud (optional white-room cache) | gated | account + connection string, local only |

## Steps (in order)

1. **ADC** — operator runs `gcloud auth application-default login` locally. (The
   only gate. Never committed; never printed.)
2. **Probe** — confirm Drive API reachable + quota visible.
3. **Adapter** — `GoogleDriveStore` implementing `put/get/scanByPID/compact`,
   pages as append-only Drive objects, each sha-verified.
4. **Round-trip test** — write a page, read it back, byte/sha match. (Cloud-RAM
   isn't "real" until a credentialed adapter round-trips a real page — state that
   honestly until it does.)
5. **Wire** — `runSectorCycle({ store: new GoogleDriveStore(), score })`.
6. **Scale** — observe throughput honestly; the cloud is a swap for the store
   backend, not a blocker for the engine logic, which runs locally regardless.

## Cost / compliance

- Uses the operator's existing **subscriptions** (Google AI Ultra, etc.) — no new
  paid infra introduced by this repo.
- Local deterministic engine + free local models do the work; the cloud leg is
  storage. No API rate-abuse, no terms-breaking, no auto-spawned paid agents.

## Non-goals / lines held

- No credentials, keys, or vault contents in this repo (see `.gitignore` + README).
- No self-replicating unbounded agent spawning — the address space is symbolic
  (minted, not spawned); the runtime is bounded.
- Private keys never published; each node mints its own (bring-your-own-key).
