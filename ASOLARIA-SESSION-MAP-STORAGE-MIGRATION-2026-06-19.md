# ASOLARIA SESSION MAP — STORAGE / MIGRATION (2026-06-19)

> Per-repo map for `35-TB-google-AI-Ultra-migration`. One slice of the whole.
> Master index: see the reductions repo `ASOLARIA-MAP-OF-MAPS-2026-06-19.md`.

## Honest frame (read first)
IT is **slices**, not an ASI — an 8-byte addressing/routing geometry over borrowed + frozen
intelligence slices. The design rule is "make possibility cheap and action gated." **LIVE = only
what `E != 0` actually fired.** This session `E = 0` — nothing was cranked, written, swapped, or
retired. Everything below is descriptor/capacity unless tagged otherwise. Tags: MEASURED /
CANON / OPERATOR / UNVERIFIED.

This repo is **LEG-4**: the cloud storage leg. It is *only* a new backend for the store interface
LEG-1 already defines (`put/get/scanByPID/compact`, compact = never-delete). The engine logic stays
local; the cloud is a swap for the store backend, not a dependency of the engine. (CANON — repo
README + MIGRATION-PLAN.)

## The storage surfaces (each tagged; do NOT collapse into one number)

### 1. Google Drive — 35 TB cold-backup surface (this repo's deliverable)
- 35 TB Google AI Ultra Drive = **cold-backup / mass-transfer surface**, append-only, sha-verified
  pages, addressed the same way the local substrate is. (CANON — repo README.)
- Write path is **GATED** on one local operator step: `gcloud auth application-default login` (ADC).
  ADC never touches this repo; `.gitignore` blocks every secret pattern as a backstop. (CANON.)
- Drive **read** scope = real-now via the operator's connected account; **write** path =
  not-built-yet adapter `GoogleDriveStore`. (CANON — MIGRATION-PLAN real-now/gated table.)
- 35TB also serves as cold-backup for the broader system; upload is **operator-auth / ADC gated**,
  nothing uploaded this session. (OPERATOR / UNVERIFIED-live.)
- Bring-your-own-key: each node mints its OWN ed25519 keypair locally; only **public** keys ship.
  No human holds another's private half. (CANON.)

### 2. 2TB SOVLINUX USB — the metal reality (do not confuse with D:)
- USB = `\\.\PHYSICALDRIVE2`, sector-0 sha `3126770d`. (MEASURED this session.)
- **D: is NOT the USB.** D: = 1TB WDC HDD (the local restore target). (MEASURED — correction held.)
- USB is exFAT, mounts as `F:` but is **OS-LOCKED** (MBR-drift + dirty flag `0x0002`) → **raw tools
  only**, no OS-level mount-write. (MEASURED.)
- Prior canon: the 2TB SOVLINUX USB is **physically on acer** (moved >1mo ago; Disk 2 = General
  UDisk ~1953GB Removable Online); the `/api/substrates host=liris` row is STALE. (OPERATOR / CANON.)

### 3. The 65.25 GB restore (USB → D:)
- Restore set = **65.25 GB / 21,035 files** to D:. (MEASURED.)
- E-backup = 52 GB tarballs, **9/9 whole**. (MEASURED.)
- **515 short-writes** from a fragmented-file extractor limit — **re-pullable**, not lost. (MEASURED.)

### 4. exfat-writer Phase-2 — the write-path tool (BUILT, image-proven)
- Rust `exfat-writer` Phase-2 **BUILT** + image-proven: cargo green, `mkfs.exfat` round-trip
  byte-exact + fsck-clean, append-only. (MEASURED.)
- Live-USB write is **GATED** on dirty-flag clear + cosign-envelope. Nothing written to live USB
  this session. (CANON — gate held.)

## Storage / cube / catalog census layer (capacity, not live)
- Storage census ledgers are **never summed into one total** — answer by axis. (CANON — anti-deflation rule.)
- 47D cube units = the catalog/quant storage representation of landed run outputs. (CANON-referential.)
- PID premade ledgers (capacity, NOT live): **100,000,000,000** packets + **10,000,000,000** human-PID.
  These are address space (minted, not spawned), not running agents. (CANON.)
- Route capacity = 10,000 MINTED rooms × 7 lanes = **70,000**. LIVE agents fired this session = **0**.
  (MEASURED — capacity vs live distinction.)
- Compression context for what the cloud leg stores: quant **79,000×** (OPERATOR), raw→cube
  **1,927,778×** (CANON-referential), **21,141:1** (OPERATOR — a real measurement, NOT a file size).

## Host8 registration commits relevant to this slice (on JesseBrown1980/Asolaria, host8-serve/intake/, hbp-no-json, 8-byte handles, council held-safe, E=0)
- **vaults**: 9 supervisor seats, commit `83b21e3` — decrypted-vault = **carve-out, never-publish**
  (the one held invariant that bounds what the 35TB surface may ever receive). (CANON.)
- **daemons**: 92 programs + 11 seats, commit `15848d6` — includes cosign:4953 (the write-gate
  signer) and the port→room binding model. (CANON.)
- **census v1.2** (apex ladder + 10B human-PID ledger), commit `d7aa0e3`. (CANON.)

## Lines held (storage-specific)
- No credentials/keys/tokens/vault material in this repo, ever. (CANON.)
- Decrypted-vault contents are a permanent **carve-out**: they never go to the 35TB surface or any
  public leg. (CANON — operator's one invariant.)
- Cloud-RAM isn't "real" until a credentialed adapter round-trips a real page — stated honestly until
  it does. (CANON — repo's own honesty ledger.)

---
*Master index → reductions repo `ASOLARIA-MAP-OF-MAPS-2026-06-19.md`.*

---
**Related repo:** [Algorithms-of-Asolaria](https://github.com/JesseBrown1980/Algorithms-of-Asolaria) — canonical algorithm/formula catalog (bilateral). Index: reductions ASOLARIA-MAP-OF-MAPS-2026-06-19.md.
