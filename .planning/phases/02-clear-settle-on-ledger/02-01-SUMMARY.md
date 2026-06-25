---
phase: 02-clear-settle-on-ledger
plan: 01
subsystem: ledger
tags: [daml, clearing, algorithm, tie-break, canary, pure-functions]
requires:
  - "Umbra.Auction (Side, Allocation) — Phase 1 frozen data types"
provides:
  - "Umbra.Clearing — pure §8 clearing math (computeClearing/choosePStar/rationByPriority + demand/supply/matched folds)"
  - "test_clears_at_100 — the §4 continuous correctness canary (CLEAR-04)"
affects:
  - "Plan 02-02 (Round.Clear recompute backstop calls computeClearing)"
  - "Plan 02-03 (settlement tests)"
  - "Phase 4 (TypeScript 1:1 mirror of §8, CLEAR-05 parity)"
tech-stack:
  added: []
  patterns:
    - "Pure, total-on-nonempty Daml functions decoupled from templates via a flat OrderView record (mirrorable in TypeScript)"
    - "Tie-break encoded as sortOn (\\p -> (imbalance, price)) over the max-matched subset — lexicographic tuple Ord = minimize-imbalance-then-lower-price"
    - "foldl max 0 (not maximumBy) for empty-list safety on a no-cross round"
    - "Top-level recursion for rationByPriority (Daml-LF forbids recursive local bindings)"
key-files:
  created:
    - "daml/Umbra/Clearing.daml"
  modified:
    - "daml/Umbra/Tests.daml"
decisions:
  - "Module org: §8 lives in a dedicated Umbra/Clearing.daml (not inline in Auction.daml) so Tests.daml + the future TS solver import the same pure core."
  - "rationByPriority is a top-level recursive function rather than a local `go` helper — Daml-LF does not support recursive local variable bindings."
metrics:
  duration: ~4 min
  completed: 2026-06-25
---

# Phase 2 Plan 01: Pure §8 Clearing Algorithm + test_clears_at_100 Summary

The deterministic §8 uniform-price clearing algorithm now exists as pure Daml functions in `Umbra/Clearing.daml`, and `test_clears_at_100` proves the canonical §4 fixture clears at exactly **$100.00** with fills A=10 / B=8 / C=2 — the build's continuous correctness canary, with the tie-break trap provably avoided.

## What Was Built

- **`daml/Umbra/Clearing.daml`** — module `Umbra.Clearing`, importing `Umbra.Auction (Side(..), Allocation(..))` and `DA.List (sort, sortOn, dedup)`. Pure math, no `Update`/`Script`/`query` (so Phase 4 can mirror it 1:1 in TypeScript):
  - `OrderView` — a flat order view (`desk`/`side`/`quantity`/`limit`) decoupled from the `Order` template.
  - `demandAt` / `supplyAt` / `matchedAt` — §8 step-2 Σ-qty folds (buys limit≥p, sells limit≤p, matched=min).
  - `candidatePrices` — §8 step-1 distinct sorted limits (`sort . dedup`).
  - `choosePStar` — §8 step-3 with the **tie-break trap guard**: `maxMatched = foldl max 0 [...]`, `topPrices = [p | m == maxMatched]`, then `sortOn (\p -> (abs (demand−supply), p)) topPrices` and take head (`0.0` on no-cross).
  - `rationByPriority` — §8 step-4 greedy long-side rationing (top-level recursion), leftover-to-largest rule documented for TS parity.
  - `computeClearing` — §8 steps 4-5: eligible buys sorted DESC by limit, sells ASC, both rationed to `traded`, emits an `Allocation` for every participating order (including C's partial/residual).
- **`test_clears_at_100`** in `Tests.daml` — runs pure `computeClearing` on the §4 fixture; asserts `pStar === 100.0`, the loud `assertMsg "...escaped the max-matched subset" (pStar /= 99.0)`, fills A=10/B=8/C=2 via a `fillOf` helper, and C residual `(5 - fillOf bankC) === 3`.

## Verification Results

- `cd daml && daml build` → **EXIT 0** (Clearing.daml compiles against SDK 2.10.4 stdlib).
- `cd daml && daml test` → **EXIT 0**. Script results: `test_clears_at_100: ok`, `test_setup_seeds: ok`, `test_asset_split_merge: ok` (both Phase-1 tests remain green), plus the Setup scripts.
- Task-1 grep gate: `computeClearing` + `foldl max 0` present in non-comment lines; the only `query`/`queryContractId` mention is inside the module-header comment documenting the module's purity (no actual query calls — pure module confirmed).
- Task-2 canary gate: `CANARY_OK` (`test_clears_at_100` + `100.0` price assert + `fillOf`/`filledQty` fill assert all present).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking compile] rationByPriority recursion lifted to top level**
- **Found during:** Task 1 (`daml build`).
- **Issue:** The RESEARCH-recommended `where go [] _ = ...; go (o::rest) ... = ... go rest ...` failed to compile: Daml-LF error `Local variables defined recursively - recursion can only happen at the top level`.
- **Fix:** Rewrote `rationByPriority` as a top-level recursive function (two equations) instead of a recursive local `go`. Behavior is identical (greedy price-priority fill capped at `min quantity remaining`).
- **Files modified:** `daml/Umbra/Clearing.daml`
- **Commit:** dee3663

**Note (not a deviation):** the RESEARCH snippet's placeholder `sortOn (\o -> negate (intToDecimal 0)) buys` was a known stand-in; it was replaced with the correct descending-limit comparator `sortOn (\o -> negate o.limit)` for buys (sells use ascending `sortOn (.limit)`), exactly as the plan's `<action>` instructed.

## Authentication Gates

None — pure Daml build/test against the SDK-bundled toolchain; no network, no auth, no package installs.

## Known Stubs

None. `computeClearing` is fully implemented and exercised by the canary; no placeholder/empty-data paths.

## For the Next Phase

- Plan 02-02 wires `Round.Clear` to **recompute §8 via `computeClearing` and assert the proposal matches** (the on-ledger security backstop, CLEAR-05/SETL-04). Import `Umbra.Clearing` in `Auction.daml`; build `OrderView`s from fetched `Order`s.
- The `Allocation`/`ClearResult` cross-layer shapes are unchanged; settlement-input `ContractId` fields on `Clear` (Option B per RESEARCH) are additive and land in 02-02.
- Phase 4 mirrors `Umbra.Clearing` 1:1 in TypeScript — keep the function names/semantics stable for parity tests.

## Self-Check: PASSED

- FOUND: daml/Umbra/Clearing.daml
- FOUND: daml/Umbra/Tests.daml (test_clears_at_100 added)
- FOUND commit dee3663 (feat: Clearing.daml)
- FOUND commit 417eafd (test: test_clears_at_100)
- daml build EXIT 0; daml test EXIT 0 with test_clears_at_100 green
