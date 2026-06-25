---
phase: 02-clear-settle-on-ledger
plan: 02
subsystem: ledger
tags: [daml, clearing, settlement, dvp, security-keystone]
requires:
  - "Umbra.Clearing.computeClearing (Plan 02-01) — the pure §8 recompute"
  - "Umbra.Asset Split/Merge/Reassign (Phase 1) — settlement primitives"
  - "Order / TradeConfirmation / Round / ClearResult templates (Phase 1)"
provides:
  - "Real Round.Clear body: recompute-§8-and-assert + atomic DvP + per-desk TradeConfirmations + status=Settled"
  - "Option-B additive Clear fields (orderCids, buyerUsdcCid, sellerBondCids)"
  - "moveExact / fillFor settlement helpers in Umbra.Auction"
  - "DECISIONS.md D7 (Option B)"
affects:
  - "Phase 3 (privacy tests exercise Clear) — Clear now settles real DvP"
  - "Phase 4 (TS solver) — must pass the three additive Clear fields"
tech-stack:
  added: []
  patterns:
    - "Recompute-and-assert on-ledger verification (the security keystone)"
    - "Atomic multi-leg DvP in a single Update transaction (all-or-nothing)"
    - "Whole-contract Reassign at the strict Asset.Split `< quantity` boundary"
    - "Leaf math module + re-export to break a module import cycle"
key-files:
  created: []
  modified:
    - "daml/Umbra/Auction.daml — real Round.Clear body + moveExact/fillFor helpers + Side/Allocation re-export"
    - "daml/Umbra/Clearing.daml — Side & Allocation relocated here (leaf module) to break the import cycle"
    - "DECISIONS.md — D7 (Option B)"
    - ".gitignore — ignore canton runtime logs (daml/log)"
decisions:
  - "D7 — Round.Clear locates Assets via additive choice fields (Option B), not a contract key"
  - "Side/Allocation defined in Umbra.Clearing (leaf) and re-exported from Umbra.Auction — required to break the Auction<->Clearing import cycle; record shapes byte-identical"
metrics:
  duration: "~10 min"
  completed: "2026-06-25"
  tasks: 2
  files: 4
---

# Phase 02 Plan 02: Real Round.Clear — Verify + Atomic DvP Summary

**One-liner:** `Round.Clear` is now the real spec-§10 body — it recomputes §8 via `Umbra.Clearing.computeClearing` and asserts the proposed `(clearingPrice, allocations)` matches exactly (the on-ledger security keystone, CLEAR-05/SETL-04), then settles BONDX+USDCx DvP at p* in one atomic transaction under sole operator authority, issues a per-desk `TradeConfirmation`, and sets `status = Settled`.

## What Was Built

- **Recompute-and-assert verification (the keystone).** Inside `Clear`, the operator `fetch`es the sealed orders by `orderCids`, rebuilds `OrderView`s, runs `computeClearing`, and asserts: price equal via `roundBankers 2`; `allocations` equal as an order-independent multiset (`sortOn allocKey`, where `allocKey = (show desk, show side, filledQty)`); and Σbuy == Σsell (defense-in-depth conservation). A wrong price (99.0) or a wrong allocation (A=12) is rejected here regardless of holdings.
- **Atomic DvP settlement** in the single `Clear` `Update` transaction: each seller delivers `filledQty` BONDX to the buyer; the buyer's USDCx is debited and per-seller cash slices of `filledQty * p*` are reassigned. Uses `moveExact` — a top-level helper that `Reassign`s the whole contract when the moved quantity equals the holding (the strict `Asset.Split splitQty < quantity` boundary) and `Split`+`Reassign`s a slice otherwise. An over-move hits the Split guard / `ensure quantity >= 0.0` and rolls back the whole transaction (SETL-03).
- **Per-desk `TradeConfirmation`** (observer = that desk only — privacy field frozen in Phase 1), `status = Settled`, and a `ClearResult` with the confirmation cids returned.
- **Lifecycle guard** `assertMsg (status == Closed || status == Cleared)` prevents settling an Open or already-Settled round (the choice recreates the Round as Settled, so re-exercise fails the guard).
- **Option B (D7):** the `Clear` choice gained additive fields `orderCids : [ContractId Order]`, `buyerUsdcCid : ContractId Asset`, `sellerBondCids : [(Party, ContractId Asset)]`. The named frozen fields and `Allocation`/`ClearResult` shapes are unchanged.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Record Option-B decision (D7) | 1f250bd | DECISIONS.md |
| 2 | Replace Round.Clear placeholder with real verify + atomic DvP body | 3e84c22 | daml/Umbra/Auction.daml, daml/Umbra/Clearing.daml, .gitignore |

## Verification

- `cd daml && daml build` — **exit 0** (authoritative compile gate).
- `cd daml && daml test` — **exit 0**; `test_clears_at_100` (the §4 → $100.00 canary), `test_asset_split_merge`, and `test_setup_seeds` all `ok`. The relocation of `Side`/`Allocation` to `Clearing.daml` (re-exported from `Auction`) is transparent — the canary still computes p*=100.0, A=10/B=8/C=2.
- Acceptance gate greps pass: `computeClearing`, `roundBankers 2`, `Reassign`, `status = Settled`, `status == Closed` all present in `Umbra/Auction.daml`; `queryContractId` absent.
- `Asset.daml` is byte-untouched (not in the diff); `signatory operator` + strict `splitQty < quantity` guard confirmed present.
- Plan 03's three settlement tests (`test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation`) will assert the runtime balances/atomicity/rejection behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Broke the Auction ↔ Clearing module import cycle**
- **Found during:** Task 2 (first `daml build` after adding `import Umbra.Clearing` to `Auction.daml`).
- **Issue:** The plan directs `Auction.Clear` to `import Umbra.Clearing (computeClearing)`, but `Clearing.daml` (from Plan 02-01) already imported `Umbra.Auction (Side, Allocation)`. Daml forbids cyclic module dependencies (no `.hs-boot`); `daml build` failed with `Cyclic module dependency between Umbra.Auction, Umbra.Clearing`.
- **Fix:** Moved the `Side` and `Allocation` data definitions into the leaf `Umbra.Clearing` module (their natural home — they are the clearing math's input/output types) and **re-exported** them from `Umbra.Auction` via its export list (`module Umbra.Auction (module Umbra.Auction, Side(..), Allocation(..)) where`). `Clearing` no longer imports `Auction`, so the cycle is gone. The record/constructor shapes are **byte-identical**, and the cross-layer name `Umbra.Auction.Side` / `Umbra.Auction.Allocation` still resolves unchanged for every existing consumer (Roles, Setup, Tests) — confirmed by `daml test` staying green.
- **Why this honors the constraint:** "Allocation/ClearResult shapes stable" is preserved — the shapes are unchanged and the name is preserved by re-export. `ClearResult` stayed in `Auction.daml` untouched. `Asset.daml` untouched.
- **Files modified:** daml/Umbra/Auction.daml, daml/Umbra/Clearing.daml.
- **Commit:** 3e84c22.

**2. [Rule 3 - Blocking] Side lacks an Ord instance for the multiset sort key**
- **Issue:** `sortOn allocKey` with `a.side` in the key needs `Ord Side`, but `Side` derives only `(Eq, Show)` (frozen) — `No instance for (Ord Side)`.
- **Fix:** Used `show a.side` (Text) in `allocKey` instead of the raw `Side`, keeping `Side`'s frozen deriving clause unchanged.
- **Files modified:** daml/Umbra/Auction.daml.
- **Commit:** 3e84c22.

**3. [Rule 3 - Blocking] Imports for stdlib iterators / choice constructors**
- **Issue:** `Reassign`/`Split` choice constructors, `head`, `when`, and `foldlA` were not in scope.
- **Fix:** Imported `Split(..), Reassign(..)` from `Umbra.Asset`; `head` from `DA.List`; `when, foldlA` from `DA.Action` (`foldlA` is in `DA.Action`, not `DA.Foldable`); `forA_` from `DA.Foldable`.
- **Files modified:** daml/Umbra/Auction.daml.
- **Commit:** 3e84c22.

**4. [Rule 3 - Blocking] Untracked canton runtime logs**
- **Issue:** `daml build`/`daml test` emit `daml/log/canton.log` + `canton_errors.log` (runtime output), left untracked.
- **Fix:** Added `daml/log/`, `canton.log`, `canton_errors.log` to `.gitignore` (generated output, never committed).
- **Files modified:** .gitignore.
- **Commit:** 3e84c22.

## Authentication Gates

None — pure Daml build/test, no external auth.

## Known Stubs

None. The `Clear` body is the real settlement logic. Note that the runtime balance/atomicity/rejection assertions are intentionally deferred to Plan 03's three `daml test` scripts (per the phase plan); this plan delivers the compiling, gated implementation.

## Self-Check: PASSED

- `daml/Umbra/Auction.daml` — FOUND (modified; real Clear body, `git show 3e84c22` includes it).
- `daml/Umbra/Clearing.daml` — FOUND (Side/Allocation relocated).
- `DECISIONS.md` D7 — FOUND.
- Commit 1f250bd — FOUND.
- Commit 3e84c22 — FOUND.
- `daml build` exit 0, `daml test` exit 0 — verified.
