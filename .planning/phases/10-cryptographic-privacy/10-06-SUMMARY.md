---
phase: 10-cryptographic-privacy
plan: 06
subsystem: solver HTTP API (:4100)
tags: [CRYP-02, CRYP-03, VIZ-02, timelock, zk-groth16, verify-anchor-split, secret-safe-envelope]
requires: [10-03, 10-04, 10-05]
provides:
  - "solver/src/api.ts: AppDeps crypto fields + 7 zod-validated handlers (timelock-encrypt/decrypt, prove, verify-proof, anchor-proof, tamper-proof, stage-offsets)"
  - "solver/src/index.ts: boot wiring of tlock + zk/prove + zk/verify + timemachine into AppDeps; recordStage armed at open/sealed/settled"
affects: [web operator-plane crypto client, CRYP-02/03 desk UI, VIZ-02 time-machine replay]
tech-stack:
  added: []
  patterns:
    - "additive AppDeps DI (five §11 handlers + /settle byte-unchanged)"
    - "off-ledger-verify vs on-ledger-anchor kept as DISTINCT endpoints (honest split)"
    - "secret-safe { error:{code,message} } envelope + zod .strict() bodies with ASVS V5 size caps"
    - "optional BuildDepsArgs deps defaulted inert (index.test boot-wiring stays green)"
key-files:
  created: []
  modified:
    - solver/src/api.ts
    - solver/src/index.ts
    - solver/src/api.test.ts
decisions:
  - "verify-proof returns ONLY a boolean verdict; anchor-proof returns ONLY the on-ledger hashes — the two acts are deliberately separate endpoints (threat T-10-19)"
  - "timelock-decrypt maps a not-yet-due beacon (error contains 'too early') to a fixed 425 TOO_EARLY; the raw error text is never echoed"
  - "drandRoundInfo is folded into the timelock-encrypt response as best-effort beacon countdown metadata (drand mode only) rather than a separate route"
  - "generateProof derives a deterministic PoC salt per order (String(i+1)); the real reveal salt is the desk's private witness — labeled PoC-grade"
  - "recordStage(open/sealed/settled) is armed in the main()-only ledger adapters (not buildDeps) so index.test.ts boot-wiring never touches a live ledger"
metrics:
  duration: ~20m
  completed: 2026-07-09
  tasks: 2
  files: 3
---

# Phase 10 Plan 06: Solver CRYP-02 / CRYP-03 / VIZ-02 HTTP Endpoints Summary

Exposed the timelock (CRYP-02), zero-knowledge prove/verify/anchor/tamper (CRYP-03), and VIZ-02 stage→offset capabilities as seven zod-validated HTTP endpoints on the solver (:4100), dependency-injected through `AppDeps` and behind the existing secret-safe envelope — with the honest off-ledger-verify / on-ledger-anchor split reflected as two distinct endpoints. The five §11 endpoints and `/settle` are byte-unchanged (pure additions), and the full solver suite (§4 fixture still clears $100.00) stays green.

## What Was Built

- **solver/src/api.ts (additive only — 237 insertions, 0 deletions):**
  - `AppDeps` gains: `timelockEncrypt`, `timelockDecrypt`, `drandRoundInfo`, `generateProof`, `verifyProof`, `anchorProof`, `tamperProof`, `getStageOffsets` (TYPE-only imports from tlock/zk/timemachine — erased at compile, so no snarkjs/tlock-js eval reaches api.ts).
  - Three new `z.object().strict()` bodies with ASVS V5 size caps: `timelockEncryptBody` (payload ≤8192, windowMs ≤24h), `timelockDecryptBody` (ciphertext ≤100k), `proofEnvelopeBody` (vkey/proof records + publicSignals array ≤256).
  - Seven `wrap()`-ed handlers:
    - `POST /round/:id/timelock-encrypt` — seal + best-effort drand beacon countdown; surfaces the offline-fallback `warning`.
    - `POST /timelock-decrypt` — recover plaintext; a not-yet-due beacon → fixed **425 TOO_EARLY** (raw error text never echoed).
    - `POST /round/:id/prove` — real Groth16 proof `{ proof, publicSignals, sizeBytes, ms }` (no witness).
    - `POST /round/:id/verify-proof` — **off-ledger** boolean verdict only.
    - `POST /round/:id/anchor-proof` — **on-ledger** hash anchor `{ proofHash, vkeyHash }` only.
    - `POST /round/:id/tamper-proof` — perturb a public input → rejected verdict (mirrors `/tamper-clear`'s never-throw contract).
    - `GET /round/:id/stage-offsets` — the recorded stage→offset map.
- **solver/src/index.ts (additive boot wiring):**
  - `main()` dynamically imports `tlock.js`, `zk/prove.js`, `zk/verify.js`, `timemachine.js` and loads the committed `zk/vkey.json`.
  - `generateProof` composes the §4 `ClearingWitness` from `ledger.readSealedOrders` + the deterministic §8 fills; `verifyProof`/`anchorProof` bind to `zk/verify`; `tamperProof` generates a valid proof, perturbs p* by +1, re-verifies → false.
  - `recordStage` armed at open→`'open'`, close→`'sealed'`, settle→`'settled'` in the main()-only adapters (best-effort, `settle()` return unchanged).
  - `BuildDepsArgs` gains the eight crypto deps as OPTIONAL; `buildDeps` defaults each inert so the `index.test.ts` boot-wiring path stays green.
- **solver/src/api.test.ts (+14 tests → 50 total):** crypto endpoint happy paths, offline-warning surface, malformed-body 400s, the 425 TOO_EARLY mapping, verify-vs-anchor DISTINCT-shape assertion, and an extended secret sweep with new `SENTINEL_TLOCK_KEY` + `SENTINEL_WITNESS` sentinels asserted absent from every crypto response and error body.

## Task Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | api.ts — AppDeps crypto fields + 7 zod-validated handlers | 6092ce9 |
| 2 | index.ts boot wiring + api.test.ts crypto & secret-sweep tests | d4d95ea |

## Verification

- `cd solver && npx tsc --noEmit` — clean.
- `npx vitest run src/api.test.ts` — 50 passed.
- Full solver suite `npx vitest run` — **126 passed** (11 files); no regressions (auction/tlock/zk/index/ledger all green; §4 fixture clears 100.00).
- `git diff solver/src/api.ts` — 237 insertions, **0 deletions** → the five §11 handlers + `/settle` + `/tamper-clear` + `/proof` + `/proof-pack.pdf` are byte-unchanged.
- verify-proof body has `verified` and NOT `proofHash`; anchor-proof body has `proofHash`/`vkeyHash` and NOT `verified` — the honest split is test-enforced.

## Threat Mitigations Applied

- **T-10-17 (Info Disclosure):** every crypto response rides the secret-safe `{error:{code,message}}` envelope; the extended secret sweep proves the operator token, ANTHROPIC_API_KEY, tlock held key, and proof witness never cross out (including on a thrown-error 500 collapse).
- **T-10-18 (Tampering / malformed input):** all four crypto bodies are `z.object().strict()` with ASVS V5 size caps; malformed → sanitized 400 (dep never called).
- **T-10-19 (Repudiation / verify≠anchor):** verify-proof (off-ledger verdict) and anchor-proof (on-ledger hash) are separate endpoints with distinct, non-overlapping response shapes.
- **T-10-20 (settle regression):** `git diff` proves the byte-frozen §11/settle handlers unchanged; the §4 canary stays green in the full suite.

## Deviations from Plan

None — plan executed exactly as written. (Note: `drandRoundInfo` is surfaced via the timelock-encrypt response as best-effort beacon metadata rather than a dedicated 8th route; the plan lists it as an AppDep, not a route, and the seven-route contract is met exactly.)

## Known Stubs

- **Deterministic PoC salt in `index.ts generateProof`** (`salt: String(i + 1)`): the real reveal salt is the desk's private witness, which `OrderView` does not carry. This is PoC-grade (consistent with the phase-wide "PoC-grade / cryptographer-review-gated" labeling on the trusted setup) and does not affect the §4 clearing or the privacy claim — the commitments remain irreversible Poseidon hashes. A future plan wiring the full commit-reveal witness would replace it with the desk-supplied salt.

## Self-Check: PASSED

All three modified files exist on disk; both task commits (6092ce9, d4d95ea) are present in git history; full solver suite green (126 passed) and tsc clean.
