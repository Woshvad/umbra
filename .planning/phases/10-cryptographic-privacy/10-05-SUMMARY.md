---
phase: 10-cryptographic-privacy
plan: 05
subsystem: solver + web bindings
tags: [CRYP-01, VIZ-02, commit-reveal, bond-forfeit, proof-anchor, daml-codegen]
requires: [10-01]
provides:
  - "solver/src/ledger.ts: readOrderCommitments / forfeitNonRevealed / anchorProof / currentOffset"
  - "solver/src/timemachine.ts: recordStage / getStageOffsets stage->offset map"
  - "web/daml.js: regenerated bindings with OrderCommitment + ProofAnchor + Venue.CommitOrder"
affects: [desk-plane commit-reveal UI, VIZ-02 time-machine replay]
tech-stack:
  added: []
  patterns: ["additive operator-plane exports (settle byte-unchanged)", "clock.ts-style in-memory cache map", "committed daml codegen bindings"]
key-files:
  created:
    - solver/src/timemachine.ts
    - solver/src/timemachine.test.ts
  modified:
    - solver/src/ledger.ts
    - web/daml.js (9 generated files)
decisions:
  - "New crypto ops are separate exported functions appended to ledger.ts — settle()/tamperClear() stay byte-unchanged (git diff proves zero deletions)"
  - "timemachine offset source is injectable (default currentOffset) so the unit test runs ledger-free"
  - "web/daml.js regenerated + committed so a fresh clone builds without the Daml SDK"
metrics:
  duration: ~15m
  completed: 2026-07-09
  tasks: 3
  files: 12
---

# Phase 10 Plan 05: Solver CRYP-01 Wiring + VIZ-02 Offset Capture Summary

Wired the CRYP-01 on-ledger commit-reveal primitives into the operator-plane solver (bond forfeit + proof anchor + public offset read), added the VIZ-02 stage->offset capture map, and regenerated the committed web/daml.js bindings — all additive, with settle() and the §4 clearing path byte-unchanged.

## What Was Built

- **solver/src/ledger.ts (additive):**
  - `readOrderCommitments(roundId)` — privacy-safe projection `{ contractId, desk, commitment, bondCid }` of still-live OrderCommitments (a valid RevealOrder or ForfeitBond consumes the contract, so anything the ACS still returns is un-revealed).
  - `forfeitNonRevealed(roundId)` — iterates the still-live OrderCommitments and exercises `ForfeitBond` (controller operator) on each, seizing each non-revealer's locked bond into the operator pot; resolves the count forfeited.
  - `anchorProof(roundId, proofHash, vkeyHash)` — creates a `ProofAnchor` recording only the two hashes (no proof bytes / witness / order data).
  - `currentOffset()` — public wrapper over the module-private `ledgerEnd()` (returns only the numeric offset).
- **solver/src/timemachine.ts** — module-scoped `Map<roundId, Partial<Record<Stage, number>>>` with `recordStage(roundId, stage, offset?, source?)` (offset defaults to `currentOffset()`, injectable for tests) and `getStageOffsets(roundId)` (returns a copy; missing stages absent). Mirrors the clock.ts cache/clock pattern; the ledger stays authoritative.
- **solver/src/timemachine.test.ts** — 6 ledger-free tests (five-stage round-trip, explicit offset, missing-stage absence, last-write-wins, per-round isolation, unknown-round empty map).
- **web/daml.js** — regenerated from the current `daml/Umbra` sources: Auction module now exports `OrderCommitment` + `ProofAnchor`; OrderCommitment carries `RevealOrder`/`ForfeitBond`; Roles Venue exports `CommitOrder`/`AnchorProof`.

## Task Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | ledger.ts CRYP-01 operator-plane primitives | e0de4d7 |
| 2 (RED) | failing test for stage->offset map | 92ef8e1 |
| 2 (GREEN) | timemachine.ts implementation | d29f699 |
| 3 | regenerate + commit web/daml.js | 02b620e |

## Verification

- `cd solver && npx tsc --noEmit` — clean.
- `npx vitest run src/timemachine.test.ts` — 6 passed.
- Full solver suite `npx vitest run` — 110 passed (11 files); no regressions.
- `git diff solver/src/ledger.ts` — zero deletions; settle()/tamperClear() bodies byte-unchanged (additive block only).
- Token-leak grep — the operator token appears only in the pre-existing private `authHeaders`/`ledgerEnd`/`submitAndWait` helpers, never in any new export.
- `web/daml.js` grep — `exports.OrderCommitment`, `exports.ProofAnchor`, `Venue.CommitOrder`, `Venue.AnchorProof`, `RevealOrder`, `ForfeitBond` all present.
- `cd web && npm run build` (tsc + vite) — succeeds against the regenerated bindings (the two `commonjs-external` notes are pre-existing benign warnings).

## Threat Mitigations Applied

- **T-10-14 (Elevation of Privilege):** ForfeitBond/AnchorProof are controller-operator on-ledger; the new exports return only ids/counts — the operator token stays module-private (never returned/logged).
- **T-10-15 (Tampering / settle regression):** new functions are separate appended exports; `git diff` proves settle()/tamperClear() byte-unchanged; the full suite (incl. §4 clearing) stays green.
- **T-10-16 (Repudiation / stale bindings):** web/daml.js regenerated + committed; the web build gate confirms the new exports resolve.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None introduced by this plan. (The pre-existing `REFERENCE_PRICE_STUB` in settle() is untouched and out of scope.)

## Self-Check: PASSED

All created/modified files exist on disk; all four task commits (e0de4d7, 92ef8e1, d29f699, 02b620e) present in git history.
