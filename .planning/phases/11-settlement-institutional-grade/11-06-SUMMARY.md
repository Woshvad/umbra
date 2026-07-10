---
phase: 11-settlement-institutional-grade
plan: 06
subsystem: testing
tags: [daml, daml-script, settlement, batch, dvp, compliance, privacy, golden-test]

# Dependency graph
requires:
  - phase: 11-05
    provides: "generalized Round.Clear (N-buyer × M-seller Batch DvP), DeskEligibility gate wired into SubmitOrder/CommitOrder/IssueHolding, cash/bondInstrument params (token-agnostic)"
  - phase: 11-04
    provides: "Umbra.Settlement pure Batch/Instruction layer (buildGrossInstructions/netLegs/conservationOk/settleBatch)"
  - phase: 11-02
    provides: "DeskEligibility credential + isEligible + assertDeskEligible gate primitive"
provides:
  - "test_multibuyer_golden — 2×2 batch clears at one uniform p*=100 through the real generalized Round.Clear, conserves cash+bond, correct per-desk fills (DFIN-02)"
  - "test_cash_instrument_agnostic — same batch settles with a non-USDCx (EURt) cash instrument unchanged (DFIN-03)"
  - "test_ineligible_submit_rejected — ineligible desk rejected on-ledger at SubmitOrder AND CommitOrder (COMP-01, first enforcement point)"
  - "test_ineligible_holding_rejected — ineligible receiver rejected on-ledger at Venue.IssueHolding (COMP-01, second enforcement point)"
  - "test_privacy_guest_fill — guest 4th desk sees only its own order+fill; rivals see none (WOW-07)"
  - "seedMultiBuyerRound — reusable 2×2 golden seed parameterized by cash instrument id, with an eligible guest desk"
affects: [11-07, phase-11-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Golden through the REAL Round.Clear (not the pure Settlement layer) — recompute-§8-and-assert + Batch DvP proven end-to-end for N buyers × M sellers"
    - "Registered-but-ineligible desk + positive control isolates the eligibility gate from a mere registration failure"
    - "Cash-instrument parameterization on a seed helper proves token-agnosticism without duplicating the seed body"

key-files:
  created: []
  modified:
    - "daml/Umbra/Setup.daml — seedMultiBuyerRound + MultiBuyerSeed record (2×2 golden seed, guest desk, cash-instrument param)"
    - "daml/Umbra/Tests.daml — 5 new tests + IssueHolding/Venue(..) imports"

key-decisions:
  - "2×2 book A Buy 6@101 / D Buy 4@100 / B Sell 7@99 / C Sell 3@100 clears at a UNIQUE p*=100 (max-matched 10 at 100 only), so computeClearing's re-verification accepts the fully-filled allocation deterministically (no rationing ambiguity)"
  - "Negatives use submitMustFail on the keyless assertDeskEligible gate (11-05), not a contract key; the ineligible desk is REGISTERED in the Venue so registration passes and only eligibility can reject"
  - "COMP-01 rejection isolated from registration failure by a positive control (same desk + eligible credential succeeds)"
  - "seedMultiBuyerRound is parameterized by cash instrument id (Text) rather than duplicated, so the EURt swap reuses the identical batch body (DFIN-03)"

patterns-established:
  - "Guest desk = first-class eligibility-gated participant; per-party privacy is structural (same signatory/observer shape as A/B/C), not a special case"
  - "Positive control alongside every submitMustFail negative to prove the assert under test is the actual cause"

requirements-completed: [DFIN-02, DFIN-03, COMP-01, WOW-07]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 11 Plan 06: Multi-Buyer / Token-Agnostic / Compliance / Guest-Privacy Goldens Summary

**Five on-ledger Daml tests locking the Phase-11 generalizations: a 2×2 multi-buyer golden and a non-USDCx cash-swap both settling through the real generalized Round.Clear, COMP-01 on-ledger rejection at both enforcement points, and a guest 4th-desk own-fill privacy proof — §4 canary unaffected.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-10
- **Completed:** 2026-07-10
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **DFIN-02:** `test_multibuyer_golden` drives a 2-buyer × 2-seller batch (A buys 6, D buys 4; B sells 7, C sells 3) through the REAL generalized `Round.Clear` — the recompute-§8-and-assert backstop accepts the verified allocation, the Batch DvP settles atomically, per-instrument totals are conserved (1000 cash / 10 bond unchanged), and every desk's post-settle position matches its fill. This proves the settlement path is genuinely N-buyer × M-seller, not the single-funded-buyer §4 shortcut.
- **DFIN-03:** `test_cash_instrument_agnostic` runs the identical 2×2 batch with a swapped-in `EURt` cash instrument; it settles unchanged (sellers receive EURt, `totalOf USDCx == 0`), proving nothing on the settlement path is hardcoded to "USDCx".
- **COMP-01 (both points):** `test_ineligible_submit_rejected` rejects a registered-but-ineligible desk on-ledger at both `SubmitOrder` and `CommitOrder` (plus a substituted rival credential), isolated from a registration failure by a positive control; `test_ineligible_holding_rejected` rejects an ineligible receiver at `Venue.IssueHolding`.
- **WOW-07:** `test_privacy_guest_fill` proves a guest 4th desk (bankD) sees only its own sealed order (pre-clear) and only its own fill (post-clear), with rivals seeing none of the guest's — structural per-party privacy identical to A/B/C.
- **§4 canary green:** `test_clears_at_100` (and `test_settled_balances`, `test_commit_reveal_clears_at_100`) unaffected; full `daml test` exits 0 with 36 scripts green.

## Task Commits

Each task was committed atomically:

1. **Task 1: multibuyer golden + cash-agnostic + seedMultiBuyerRound** — `f4bc33d` (test)
2. **Task 2: COMP-01 negatives + guest own-fill privacy** — `ba70427` (test)

## Files Created/Modified

- `daml/Umbra/Setup.daml` — added `MultiBuyerSeed` record + `seedMultiBuyerRound : Text -> Script MultiBuyerSeed` (2×2 golden, guest desk, all four eligibility-gated, cash-instrument parameterized).
- `daml/Umbra/Tests.daml` — added `test_multibuyer_golden`, `test_cash_instrument_agnostic`, `test_ineligible_submit_rejected`, `test_ineligible_holding_rejected`, `test_privacy_guest_fill`; widened Roles import to `Venue(..)` + `IssueHolding(..)`.

## Decisions Made

- **Unique-price 2×2 book:** chose A Buy 6@101 / D Buy 4@100 / B Sell 7@99 / C Sell 3@100 so max-matched (10) occurs at exactly one candidate price (100). Everyone is fully filled, so `computeClearing`'s allocation is deterministic and the on-ledger re-verification accepts it without rationing ambiguity.
- **Registered-but-ineligible negative shape:** the ineligible desk is registered in the Venue (`desk elem desks` passes) so the only possible rejection cause is `assertDeskEligible`; each `submitMustFail` is paired with a positive control that succeeds, proving the eligibility assert — not a registration failure — is the cause.
- **Parameterized seed over duplication:** `seedMultiBuyerRound` takes the cash instrument id, so the DFIN-03 EURt test reuses the exact batch body.

## Deviations from Plan

None - plan executed exactly as written. Two trivial import widenings were required to compile the planned tests (`Venue(..)` for the `createCmd Venue` in the registered-but-ineligible setup, and `IssueHolding(..)` for the holding-issuance negative). These are mechanical import fixes to reference already-existing 11-05 choices, not scope changes.

## Issues Encountered

- Initial compile error `Not in scope: data constructor 'Venue'` — the `Venue` type was imported without its constructor. Fixed by importing `Venue(..)`. Full suite green afterward.

## Notes / Honest Limitations

- These are OFFLINE `daml test` (Daml Script) proofs. The live 3-node cross-node guest-QR-on-a-phone UAT (WOW-07) and live multi-buyer settle remain end-of-phase human-verification items per the Phase 1–3 precedent (see 11-RESEARCH live-UAT checklist).
- The 2×2 golden is mirrored in the solver plane (Daml⇄TS parity) by 11-07 — this plan is the ledger-side half.
- Pre-existing benign `DsWarning` at Tests.daml:16 (redundant `Side, Allocation` import, also re-exported from `Umbra.Clearing`) is unchanged by this plan and left as-is (out of scope).
- COMP-01/eligibility remains the honestly-labeled STUB ATTESTATION (real KYC vendor is Track B); the proven property is that participation is gated on-ledger by an authority-signed credential a desk cannot self-issue.

## Next Phase Readiness

- Ledger-side acceptance evidence for DFIN-02 / DFIN-03 / COMP-01 / WOW-07 is complete and green.
- 11-07 (solver multi-buyer mirror) can proceed against `seedMultiBuyerRound`'s 2×2 fixture.
- No blockers introduced.

---
*Phase: 11-settlement-institutional-grade*
*Completed: 2026-07-10*

## Self-Check: PASSED

- Files exist: `daml/Umbra/Setup.daml`, `daml/Umbra/Tests.daml`, `11-06-SUMMARY.md` — all FOUND.
- Commits exist: `f4bc33d` (Task 1), `ba70427` (Task 2) — both FOUND.
- All 5 new tests present in Tests.daml and green via `daml test` (0 DsError, 36 scripts ok).
- §4 canary (`test_clears_at_100`) green.
- Commits authored by `woshvad <woshvad@gmail.com>` with NO Claude/AI attribution.
