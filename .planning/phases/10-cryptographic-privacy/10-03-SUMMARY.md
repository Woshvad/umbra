---
phase: 10-cryptographic-privacy
plan: 03
subsystem: solver
tags: [cryptography, timelock, drand, tlock, privacy, CRYP-02]
requires:
  - "tlock-js@0.9.0 + drand quicknet (RFC9380 unchained)"
  - "10-02 Wave-0 tlock.test.ts scaffold"
provides:
  - "solver/src/tlock.ts: timelockSeal / timelockOpen / drandRoundInfo (drand quicknet + labeled offline fallback)"
  - "OFFLINE_FALLBACK_LABEL constant"
affects:
  - "future reveal/commit integration (CRYP-01 payload can be sealed to a drand round)"
tech-stack:
  added:
    - "tlock-js@0.9.0 (drand quicknet timelock, RFC9380)"
    - "@noble/curves bls12-381 (test-only: local self-signed drand chain)"
    - "node:crypto AES-256-GCM (offline fallback held key)"
  patterns:
    - "module-private secret (mirrors proof.ts / ledger.ts) — key never exported/returned/logged"
    - "env resolution mirroring ledger.ts PARTICIPANT (DRAND_URL / DRAND_CHAIN_HASH)"
    - "dependency-injected ChainClient test seam for deterministic crypto in CI"
key-files:
  created:
    - "solver/src/tlock.ts"
  modified:
    - "solver/src/tlock.test.ts"
    - "DECISIONS.md"
decisions:
  - "drand quicknet (chain 52db9ba7…c84e971, RFC9380) is the primary timelock; env-overridable"
  - "CI determinism via a locally-signed BLS12-381 chain (mocked beacon), NOT live quicknet"
  - "offline fallback is AES-256-GCM held-key, flagged OFFLINE FALLBACK · WEAKER THAN DRAND"
  - "live real-time quicknet round-trip is an end-of-phase human-verify"
metrics:
  duration: "~20 min"
  completed: "2026-07-09"
  tasks: 2
  files_changed: 3
---

# Phase 10 Plan 03: CRYP-02 Timelock Module Summary

REAL drand-backed timelock in `solver/src/tlock.ts` — a payload sealed to a future quicknet round is cryptographically undecryptable (throws "too early") by anyone holding the ciphertext, including the operator/solver, until the threshold beacon publishes, then recovers the exact payload; with a clearly-labeled weaker offline held-key fallback for when quicknet is unreachable.

## What Was Built

- **`solver/src/tlock.ts`** (Task 1):
  - `timelockSeal(payload, windowMs, opts?)` → `{ ciphertext, targetRound, mode: 'drand' }`, binding the ciphertext to `roundAt(now + windowMs + margin)` on quicknet via `timelockEncrypt`. On any client/network throw it drops to the offline held-key seal and returns `mode: 'offline'` + `warning: OFFLINE FALLBACK · WEAKER THAN DRAND`.
  - `timelockOpen(ciphertext, opts?)` → routes on a `UMBRA-OFFLINE-v1:` marker: offline ciphertexts open via the module-private AES-256-GCM key; drand ciphertexts open via `timelockDecrypt` (which throws `"too early"` before the beacon exists).
  - `drandRoundInfo(windowMs, opts?)` → `{ targetRound, timeToBeaconMs, chainHash }`, all derived from `roundAt`/`roundTime` (no manual round math).
  - Env: `DRAND_URL` / `DRAND_CHAIN_HASH` (quicknet defaults), mirroring `ledger.ts` PARTICIPANT resolution. Quicknet default uses tlock-js `mainnetClient()`; a custom hash builds an `HttpCachingChain`.
  - The offline key is module-private (`node:crypto` `randomBytes(32)`) — never exported, returned, or logged. The drand path holds no long-term secret.
- **`solver/src/tlock.test.ts`** (Task 2): replaced the Wave-0 red scaffold with 5 deterministic tests (see Verification).

## How CRYP-02 Is Proven Deterministically

The genuinely-future real-time quicknet round-trip depends on live network + wall-clock beacon timing, so CI uses a **locally-signed BLS12-381 chain** (a "mocked beacon" per the plan). This is genuine tlock IBE crypto composing exactly as against quicknet — same RFC9380 scheme, same `hashToCurve` DST (`BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_`), same on-verify beacon check (`disableBeaconVerification: false`, signatures are valid) — only with a chain whose beacons the test can sign on demand:
- Sealing to a **past** round of this chain = "beacon already published" → post-beacon exact recovery.
- Sealing to a **future** round = "beacon does not exist yet" → the cryptographic early-decrypt block (`"too early"`).

This is real crypto, not a stub: the early-decrypt block is enforced by IBE/threshold math (the beacon signature literally doesn't exist), not by an app check.

## Verification

`cd solver`:
- `npx vitest run src/tlock.test.ts` → **5/5 green**:
  1. BLOCKS early decrypt with a `"too early"` error before the target beacon.
  2. Recovers the EXACT payload after the beacon has published.
  3. Falls back to a labeled WEAKER-THAN-DRAND offline seal when quicknet is unreachable, and still recovers.
  4. `drandRoundInfo` reports target round + chain hash from `roundAt`/`roundTime`.
  5. SECRET-SWEEP: no key/salt in any result object, thrown error, or module export.
- `npx tsc --noEmit` → **clean**.
- `npx vitest run` (full solver) → **100 passed**, plus **1 remaining intentional Wave-0 red** (see Deferred Issues).

## Deviations from Plan

**None** — plan executed as written. The two tasks (module, then tests) landed as a `feat` + `test` pair, matching the TDD structure: the module lands first (the Wave-0 scaffold stays red), then the real tests replace the scaffold and go green.

## Deferred Issues (out of scope for 10-03)

- **`solver/src/zk/verify.test.ts` is still red** — `expect(false).toBe(true)`, the intentional Wave-0 scaffold for **CRYP-03 (groth16), which lands in plan 10-04**. It is a pending scaffold for the next plan, not a regression introduced here, and fixing it would violate the task scope boundary. The full solver suite therefore shows `1 failed | 100 passed`; every non-CRYP-03 test (including all 5 CRYP-02 tests) is green. This red clears in 10-04.

## Known Stubs

- The **offline fallback** is an intentional, documented WEAKER path (threat T-10-09, disposition ACCEPT), not a stub of the primary guarantee. It is explicitly flagged `mode: 'offline'` + `OFFLINE FALLBACK · WEAKER THAN DRAND` on every result. The primary drand path is fully real.

## Human-Verify (end-of-phase)

- **Live real-time quicknet round-trip**: seal against live quicknet with a short real window, wait for the wall-clock beacon, confirm early-open is blocked and post-beacon open recovers the payload. Deferred per plan (CI uses the deterministic local chain).

## Self-Check: PASSED

- `solver/src/tlock.ts` — FOUND
- `solver/src/tlock.test.ts` — FOUND (real tests, scaffold replaced)
- Commit `038011b` (feat, tlock module + DECISIONS.md) — FOUND
- Commit `bdaed8e` (test, CRYP-02 tests) — FOUND
- `npx vitest run src/tlock.test.ts` green (5/5); `tsc --noEmit` clean
