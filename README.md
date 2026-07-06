# 35-TB-google-AI-Ultra-migration

Plan and tooling to add a **Google AI Ultra 35 TB Drive** as a cloud storage leg
— a "cloud-RAM" sink — for the Asolaria multi-substrate project: an append-only
place to land large local run outputs and read them back, addressed the same way
the local substrate is.

## Status

Adapter scaffold and offline round-trip path are built; the **local** substrate
(HDD/USB) is the proven base. This repo adds the **cloud** leg, and real Google
Drive cloud writes remain **gated on one local operator auth step** (Google
Application Default Credentials) that runs on the operator's own machine and
**never touches this repository**.

## Architecture — the cloud leg is a drop-in store

The fabric already defines a pluggable storage interface:

```
put(pid, value) · get(pid) · scanByPID(prefix) · compact()    // compact = never-delete
```

Existing backends: in-memory and local-disk. **LEG-4 adds `GoogleDriveStore`** —
the same interface, backed by the 35 TB Drive (Drive API, append-only objects,
sha-verified pages). Because it's the same interface, nothing above it changes; a
sector cycle just runs `runSectorCycle({ store, score })` with the new store.

## Run / migration order

1. Operator authenticates **locally**: `gcloud auth application-default login` (once)
2. Drive reachability probe
3. `GoogleDriveStore` adapter (implements the store interface)
4. sha round-trip test — write a page, read it back, hashes match
5. wire into the cycle: `runSectorCycle({ store, score })`
6. scale

## Security — please read

- **No credentials, keys, tokens, or vault material live in this repo. Ever.**
  The `.gitignore` blocks every common secret pattern as a backstop.
- Credentials stay **local**, loaded by role into the tooling, never printed.
- **Bring your own keys.** If you run this, your CLI/agent generates **your own**
  ed25519 keypair on **your** machine. The project publishes **public** keys and
  the architecture; **private keys never leave the machine that minted them.**
  That is the whole model — asymmetric crypto works precisely *because* the private
  half is never shared. No human ever holds another human's private key.

  ```bash
  # each new node mints its own identity (example):
  ssh-keygen -t ed25519 -f ./node.ed25519 -N ""     # private stays here; publish node.ed25519.pub
  ```

## Part of

The broader Asolaria multi-substrate project. Companion public repos:
`bigpickle-rebuild`, `asolaria-behcs-256`, `asolaria-federation-1024`.

## License

Operator's choice — add a `LICENSE` file before wide distribution (MIT/Apache-2.0
are common for this kind of work).
