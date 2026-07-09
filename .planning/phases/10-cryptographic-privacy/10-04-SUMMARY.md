---
phase: 10-cryptographic-privacy
plan: 04
subsystem: solver
tags: [cryptography, zk, groth16, circom, snarkjs, poseidon, privacy, CRYP-03]
requires:
  - "10-02 crypto toolchain (snarkjs@0.7.6, circomlibjs@0.1.7, circomlib@2.0.5 dev, pinned circom.exe v2.2.3)"
  - "10-02 Wave-0 zk/verify.test.ts scaffold + zk BUILD-artifact gitignore"
  - "solver/src/auction.ts computeClearing (the §4 statement the circuit reduces from)"
provides:
  - "solver/src/zk/clearing.circom: reduced proof-of-correct-clearing circuit (1221 constraints)"
  - "solver/src/zk/build.mjs: circom compile + local pow-12 powers-of-tau + Groth16 setup + vkey export"
  - "solver/src/zk/prove.ts: generateClearingProof (ESM groth16.fullProve, host-side Poseidon)"
  - "solver/src/zk/verify.ts: verifyClearingProof + proofAnchorHashes (off-ledger verify / on-ledger hash anchor)"
  - "committed §4 fixtures: clearing.wasm / clearing_final.zkey / vkey.json"
affects:
  - "10-05 on-ledger proofHash anchor field (RevealOrder/Round.Clear) consumes proofAnchorHashes"
  - "10-09 UI ProofOfClearingPanel surfaces the off-ledger-verify / PoC labeling"
tech-stack:
  added:
    - "circom 2.2.3 reduced clearing circuit (Poseidon(4) commitments + comparators)"
    - "snarkjs@0.7.6 Groth16 (fullProve/verify, ESM programmatic API)"
    - "circomlibjs@0.1.7 buildPoseidon (host-side commitments matching in-circuit params)"
    - "ffjavascript getCurveFromName (build.mjs powers-of-tau, build-only)"
  patterns:
    - "ESM-safe proving via groth16.fullProve — NEVER circom's CommonJS generate_witness.js (Pitfall 3)"
    - "intermediate signals (fb/fs) to keep triple products quadratic (Pitfall 4)"
    - "module-private witness — order values/salts/fills never returned or logged (mirrors proof.ts/ledger.ts)"
    - "node:crypto sha256 anchor hashes (proof.ts sha pattern), off-ledger verify + on-ledger hash anchor"
    - "committed PoC fixtures via gitignore negations so CI verifies without re-running the trusted setup"
key-files:
  created:
    - "solver/src/zk/clearing.circom"
    - "solver/src/zk/build.mjs"
    - "solver/src/zk/prove.ts"
    - "solver/src/zk/verify.ts"
    - "solver/src/zk/zk-deps.d.ts"
    - "solver/src/zk/clearing.wasm"
    - "solver/src/zk/clearing_final.zkey"
    - "solver/src/zk/vkey.json"
  modified:
    - "solver/src/zk/verify.test.ts"
    - "solver/src/zk/.gitignore"
decisions:
  - "Reduced statement: fairness + conservation at the PUBLISHED p*, NOT volume-maximality (in-circuit §8 sort is the documented production path, A4)"
  - "PoC trusted setup: single-contributor LOCAL pow-12 powers-of-tau — labeled cryptographer-review-gated (A5)"
  - "Verification is OFF-LEDGER by design: Canton has NO zk precompile (documented HARD limitation); on-ledger anchors only proofHash + vkeyHash"
  - "clearing.wasm/clearing_final.zkey/vkey.json committed as §4 CI fixtures (gitignore negations); other zk build artifacts stay gitignored"
  - "Live proof generate/verify/tamper is an end-of-phase human-verify"
metrics:
  duration: "~12 min"
  completed: "2026-07-09"
  tasks: 3
  files_changed: 10
---

# Phase 10 Plan 04: CRYP-03 ZK Proof-of-Correct-Clearing PoC Summary

A REAL circom/snarkjs Groth16 proof (not a stub) that the published §4 clearing (p\*=100, matched=10) is a fair, conserving clearing of the *committed* orders — the verifier ACCEPTS the genuine proof, REJECTS a forged public input (p\*=99 → verify false), and REJECTS an inconsistent clearing (matched=12 → witness generation throws), all while the private witness (every order's side/qty/limit/salt/fill) stays hidden and only `[p*, matched, comm…]` are public.

## What Was Built

- **`solver/src/zk/clearing.circom`** (Task 1): the reduced clearing-correctness circuit, copied verbatim from `10-RESEARCH.md`. `Clearing(3)` proves, over N=3 committed orders:
  - **(d) commitment binding** — `Poseidon(side,qty,limit,salt) == comm[i]` (the witnessed orders are exactly the committed ones);
  - **(a) quantity bound** — `fill_i ≤ qty_i`;
  - **(b) limit compliance** — `fill_i>0 ⇒ (buy: limit≥p*) ∧ (sell: limit≤p*)`, via the intermediate `fb`/`fs` signals that keep the triple products quadratic (Pitfall 4);
  - **(c) conservation** — `Σ_buy fill = Σ_sell fill = matched`.
  Compiles to **1221 non-linear constraints** with **5 public inputs** = exactly `[pStar, matched, comm[0..2]]`. Header labels the reduction (A4) and the PoC trusted setup (A5).
- **`solver/src/zk/build.mjs`** (Task 1): one-time ESM build — runs the pinned `circom.exe` (`--r1cs --wasm --sym -l ../../node_modules` for circomlib includes), then a single-contributor LOCAL pow-12 powers-of-tau → Groth16 setup → PoC zkey contribution → `vkey.json` via snarkjs' programmatic API (`powersOfTau.*`, `zKey.*`, `ffjavascript.getCurveFromName('bn128')`). Large intermediates (`*.r1cs/*.sym/*.ptau/clearing_js/`) stay gitignored; the wasm/zkey/vkey are committed.
- **`solver/src/zk/prove.ts`** (Task 2): `generateClearingProof(witness)` computes each order's Poseidon(4) commitment host-side (`circomlibjs buildPoseidon`, matching the in-circuit params), assembles the full circuit input, and calls `snarkjs.groth16.fullProve` (ESM — **never** the CommonJS `generate_witness.js`, Pitfall 3). Returns `{ proof, publicSignals, sizeBytes, ms }` — the private witness never crosses out (T-10-11). Paths resolved via `fileURLToPath(new URL(...))` like `proof.ts`.
- **`solver/src/zk/verify.ts`** (Task 2): `verifyClearingProof(vkey, publicSignals, proof)` is a real `groth16.verify` (OFF-LEDGER by design). `proofAnchorHashes(proof, publicSignals, vkey)` = `{ proofHash: sha(proof‖publicSignals), vkeyHash: sha(vkey) }` (node:crypto sha256, `proof.ts` `sha` pattern) — the on-ledger anchor.
- **`solver/src/zk/zk-deps.d.ts`** (Task 2): minimal ambient types for the untyped `snarkjs` / `circomlibjs` ESM entry points.
- **`solver/src/zk/verify.test.ts`** (Task 3): replaced the Wave-0 red scaffold with 4 real tests (see Verification).
- **Committed §4 fixtures**: `clearing.wasm` / `clearing_final.zkey` / `vkey.json` (gitignore negations added) so CI verifies without re-running the trusted setup.

## How CRYP-03 Is Proven (real, not a stub)

The test generates a genuine Groth16 proof from the §4 witness (A Buy 10 @101 fill 10 · B Sell 8 @99 fill 8 · C Sell 5 @100 fill 2) and checks it against the committed `vkey.json`:
- **Accept** — `verifyClearingProof` returns `true`; `publicSignals == ['100','10', comm0, comm1, comm2]`; none of the salts/private qtys/limits/fills appear in the public signals.
- **Reject forged public input** — doctoring `publicSignals[0]` to `'99'` makes `verifyClearingProof` return `false` (the proof is bound to the real p\*).
- **Reject inconsistent clearing** — `matched=12` (same fills, Σ=10) violates conservation `sb===matched`; `fullProve` cannot build a witness and throws (`ERROR: Error in template Clearing_82 line: 62`). No fake pass is possible.

## Verification

`cd solver`:
- `npx vitest run src/zk/verify.test.ts` → **4/4 green** (accept · forged-reject · inconsistent-reject · deterministic anchor hashes).
- `node src/zk/build.mjs` → reproduces the artifacts (1221 non-linear constraints; wasm/zkey/vkey emitted).
- `npx vitest run` (full solver) → **104 passed** (all Wave-0 reds now green; no remaining intentional failures).
- `npx tsc --noEmit` → **clean**.

## Deviations from Plan

**None** — plan executed as written. Task 1 (circuit + build) landed as a `feat`, Task 2 (prove/verify wrappers) as a `feat`, Task 3 (tests) as a `test`. One additive file not enumerated in `files_modified` was required to typecheck the untyped ESM libs: `solver/src/zk/zk-deps.d.ts` (ambient `snarkjs`/`circomlibjs` declarations) — a Rule 3 blocking-issue fix (the imports otherwise error TS2307 under `moduleResolution: Bundler`). It declares only the entry points used, no behavior.

## Known Stubs

**None.** The proof and verification are real end-to-end. The two documented *reductions* are not stubs of the mechanism:
- The **reduced statement** (fairness + conservation at the published p\*, not volume-maximality) is a deliberately-scoped PoC (A4); the in-circuit §8 sort/tie-break is the labeled production path.
- The **PoC trusted setup** (single local contributor) is labeled cryptographer-review-gated (A5); a production deployment needs a multi-party powers-of-tau ceremony.

## Threat Flags

None — no new network endpoint, auth path, or trust-boundary surface was introduced. The prove/verify functions are pure library wrappers; wiring them into an HTTP endpoint + on-ledger anchor is 10-05/10-09 scope and carries the threat register there (T-10-10/11/12/13, all already dispositioned in the plan).

## Human-Verify (end-of-phase)

- **Live proof generate → verify → tamper**: run `generateClearingProof` on the §4 witness, confirm `verifyClearingProof` accepts, then confirm a forged public input verifies false and an inconsistent clearing fails witness generation, against the committed fixtures on a fresh checkout.

## Self-Check: PASSED

- `solver/src/zk/clearing.circom` — FOUND
- `solver/src/zk/build.mjs` — FOUND
- `solver/src/zk/prove.ts` — FOUND
- `solver/src/zk/verify.ts` — FOUND
- `solver/src/zk/zk-deps.d.ts` — FOUND
- `solver/src/zk/verify.test.ts` — FOUND (real tests, scaffold replaced)
- `solver/src/zk/{vkey.json, clearing.wasm, clearing_final.zkey}` — FOUND + git-tracked
- Commit `8673d7c` (feat, circuit + build + fixtures) — FOUND
- Commit `2463808` (feat, ESM prove/verify + anchor) — FOUND
- Commit `35c69fc` (test, CRYP-03 accept + tamper-reject) — FOUND
- `npx vitest run src/zk/verify.test.ts` green (4/4); full solver `npx vitest run` 104 green; `tsc --noEmit` clean
