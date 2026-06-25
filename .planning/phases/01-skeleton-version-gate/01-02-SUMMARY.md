---
phase: 01-skeleton-version-gate
plan: 02
subsystem: daml-data-model
tags: [daml, templates, privacy, data-model, clear-placeholder]
requires:
  - "daml/daml.yaml — SDK 2.10.4 pin + source: . (from plan 01)"
provides:
  - "daml/Umbra/Asset.daml — operator-custodied Asset (sig operator / obs owner) + Split/Merge/Reassign"
  - "daml/Umbra/Auction.daml — Order, Round, RoundStats, TradeConfirmation + Side/OrderStatus/RoundStatus/Allocation/ClearResult; Round.Clear + CloseRound placeholders"
  - "daml/Umbra/Roles.daml — Venue with nonconsuming SubmitOrder"
  - "umbra-0.1.0.dar — the compiling DAR (daml build green)"
affects:
  - "Plan 03 (Setup/Tests) creates Assets/Venue/Orders against these frozen templates"
  - "Phase 2 implements the real Round.Clear body (verify + atomic DvP) replacing the placeholder"
  - "Phase 3/4 consume these shapes via @daml.js/umbra codegen"
tech-stack:
  added: []
  patterns:
    - "Daml signatory/observer disclosure IS the privacy model — no stray observers"
    - "Operator-custody Asset (operator sole signatory) — sidesteps multi-party authority for MVP"
    - "Signature-frozen / body-deferred choice (Round.Clear placeholder) to keep cross-layer contract stable"
key-files:
  created:
    - daml/Umbra/Asset.daml
    - daml/Umbra/Auction.daml
    - daml/Umbra/Roles.daml
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - "Freeze all six §7 templates + data types verbatim as the shared cross-layer contract"
  - "Order has NO observer (signatory operator, desk only) — private to those two; the core of the money shot"
  - "TradeConfirmation observer is the singular `desk`; Asset observer is `owner`; Round/RoundStats/Venue observe `desks`"
  - "Round.Clear is a compiling placeholder (assertMsg ... False) — real verify+DvP body is Phase 2"
  - "CloseRound is a minimal operator-only placeholder (flips status=Closed) — real lifecycle is Phase 2"
  - "ClearResult defined as a minimal frozen record (spec §7.4 referenced it but left it undefined)"
metrics:
  duration_min: 4
  completed: 2026-06-25
  tasks: 3
  files: 3
---

# Phase 1 Plan 02: Daml Data Model (Six Templates) Summary

Froze the six spec §7 templates and all shared data types across `daml/Umbra/{Asset,Auction,Roles}.daml`, with the privacy-critical signatory/observer sets reproduced verbatim, and the `Round.Clear` choice declared as a signature-only compiling placeholder (real logic deferred to Phase 2). `daml build` goes green, producing `umbra-0.1.0.dar` — the cross-layer contract every later phase codes against.

> **Bookkeeping note:** the three implementation tasks were executed and committed (9def3de, 0519287, 1915ab6) but the executor's run hit a transient API error (safety classifier unavailable) before writing this SUMMARY and updating STATE/ROADMAP. The committed work was independently re-verified by the orchestrator — `daml build` exits 0 and the signatory/observer audit passed — and this SUMMARY + the STATE/ROADMAP updates complete the plan's bookkeeping.

## What Was Built

### Task 1 — `Asset.daml` (LEDG-03)
- `template Asset` with `signatory operator`, `observer owner`, `ensure quantity >= 0.0`.
- Choices under Operator authority alone: `Split` (→ two Assets), `Merge` (combine same owner/symbol), `Reassign` (transfer to `newOwner`) — the settlement primitives Phase 2's `Clear` uses.
- **Commit:** `9def3de`

### Task 2 — `Auction.daml` data types + four templates (LEDG-01)
- Data types: `Side = Buy | Sell`, `OrderStatus = Sealed | Filled | PartiallyFilled | Unfilled`, `RoundStatus = Open | Closed | Cleared | Settled`, `Allocation {desk, side, filledQty}`, and `ClearResult` (minimal frozen record — §7.4 left it undefined).
- `template Order`: `signatory operator, desk` (**NO observer** — private to those two), `ensure quantity > 0 && limit > 0.0`.
- `template TradeConfirmation`: `signatory operator`, `observer desk` (singular — visible only to its desk).
- `template RoundStats`: `signatory operator`, `observer desks`, `sealedOrderCount : Int` (count only).
- `template Round`: `signatory operator`, `observer desks`; `choice CloseRound` (minimal operator-only placeholder) and `choice Clear` (signature frozen: `clearingPrice : Decimal`, `allocations : [Allocation]`, controller operator → `ClearResult`; body = loud `assertMsg ... False` placeholder).
- **Commit:** `0519287`

### Task 3 — `Roles.daml` Venue (LEDG-01) + build green
- `template Venue`: `signatory operator`, `observer desks`, `nonconsuming choice SubmitOrder` (controller `desk`) creating an `Order` signed by operator + desk; `assertMsg "desk not registered"` guard.
- `daml build` verified green → `.daml/dist/umbra-0.1.0.dar`.
- **Commit:** `1915ab6`

## Verification Results

- **`daml build` exits 0** (authoritative gate) → `Created .daml\dist\umbra-0.1.0.dar`.
- **Signatory/observer audit (security-critical) — all correct, no stray observers:**
  - `Asset`: `signatory operator` / `observer owner` ✓
  - `Order`: `signatory operator, desk` / no observer ✓
  - `TradeConfirmation`: `signatory operator` / `observer desk` (singular) ✓
  - `RoundStats`, `Round`, `Venue`: `observer desks` ✓
- All data types present (`Side`, `OrderStatus`, `RoundStatus`, `Allocation`, `ClearResult`).
- `Round.Clear` body is the loud placeholder (no real clearing/settlement logic) — Phase 2 owns it.

## Deviations from Plan

None functionally — all three tasks executed as written and the build is green. Process deviation only: the SUMMARY.md write + STATE/ROADMAP update were completed by the orchestrator after a transient executor API error (the implementation commits themselves were intact and verified).

## Threat Surface

- **T-01 (cross-desk visibility leak / order forging):** mitigated structurally — `Order` signatory `operator, desk` with no observer; `Venue.SubmitOrder` controlled by `desk`; no broad observers anywhere. The frozen shapes ARE the PRIV-01..04 control (asserted in Phase 3).
- **Input validation:** `ensure` clauses on `Asset` (`quantity >= 0.0`) and `Order` (`quantity > 0 && limit > 0.0`).

## Known Stubs

- `Round.Clear` — compiling placeholder (`assertMsg "Clear not implemented until Phase 2" False`); real verify + atomic DvP body lands in Phase 2.
- `CloseRound` — minimal operator-only placeholder (sets `status = Closed`); real Open→Closed lifecycle/guards in Phase 2.

## Next

- **Plan 03:** `Setup.daml` (`initialize` allocates parties + mints §4 holdings, `exportParties` → `parties.json`, `runCanonicalRound`) + `Tests.daml` (`test_setup_seeds`, `test_asset_split_merge`); `daml start` :7575 smoke.

## Self-Check: PASSED

All three template files exist and compile (`daml build` exit 0); all three task commits exist (9def3de, 0519287, 1915ab6); signatory/observer shapes match spec §7 verbatim with no stray observers.
