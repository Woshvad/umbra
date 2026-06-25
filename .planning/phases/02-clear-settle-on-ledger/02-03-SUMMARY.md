---
phase: 02-clear-settle-on-ledger
plan: 03
subsystem: testing
tags: [daml, daml-script, settlement, dvp, atomicity, clearing, submitMustFail]

# Dependency graph
requires:
  - phase: 02-01
    provides: pure §8 computeClearing + test_clears_at_100 canary in Umbra.Clearing
  - phase: 02-02
    provides: real Round.Clear (recompute-§8-verify + atomic DvP + per-desk TradeConfirmation + status=Settled), additive Option-B fields
provides:
  - seedCanonicalAndClose + seedUnderfundedSellerAndClose Script helpers (open Round → submit 3 §4 orders → CloseRound → collect Option-B ContractIds)
  - test_settled_balances (SETL-02) — exact §4 post-balances + conservation + per-desk TradeConfirmation
  - test_atomicity (SETL-03) — underfunded seller → Clear rejected, no-balance-change rollback
  - test_clear_rejects_bad_allocation (SETL-04/CLEAR-05) — bad fills AND wrong price both rejected on-ledger
  - operator-only consuming Order.Retire choice (operator-custody order retirement)
affects: [03-privacy-3up, 04-solver-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed helpers returning a SeedResult record of the Option-B ContractIds the real Clear needs (locate via Script-tier query, pass into the choice)"
    - "Atomicity proof = submitMustFail + sorted before/after Asset snapshot equality"
    - "Rejection proof = submitMustFail on a FUNDED round so failure is by re-verification, not by missing assets"

key-files:
  created: []
  modified:
    - daml/Umbra/Tests.daml
    - daml/Umbra/Auction.daml

key-decisions:
  - "Order retirement inside Clear uses an operator-only consuming Order.Retire choice instead of the built-in `archive` (archive needs every signatory's authority: operator AND desk)"
  - "One seedAndClose generator parameterised by B's BONDX mint (20.0 funded / 5.0 underfunded) backs both seed helpers — keeps the §4 orders + computeClearing result canonical; only the holding is undersized"

patterns-established:
  - "SeedResult record carries Parties + closed Round cid + [Order] cids + buyerUsdcCid + sellerBondCids for any future settlement test/driver"
  - "findAssetCid locates a (owner, symbol) holding from the operator's ACS view at the Script tier (Option-B locate-then-pass)"

requirements-completed: [SETL-01, SETL-02, SETL-03, SETL-04, CLEAR-05]

# Metrics
duration: 5min
completed: 2026-06-25
---

# Phase 2 Plan 3: On-Ledger Settlement Tests Summary

**Three Daml Script settlement tests (settled-balances, atomicity, bad-allocation rejection) driving the real Round.Clear on the §4 fixture — all six scripts green under `daml test`, plus an operator-only Order.Retire fix that unblocked the DvP success path.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-25T16:03:55Z
- **Completed:** 2026-06-25T16:09:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `test_settled_balances` (SETL-02): after a real `Round.Clear` on the §4 fixture, asserts the EXACT post-balances A:10 BONDX/4000.0 USDCx, B:12/1800.0, C:13/1200.0, global conservation (35.0 BONDX, 7000.0 USDCx unchanged vs seed), and a per-desk `TradeConfirmation` (3 created).
- `test_atomicity` (SETL-03): an underfunded seller (B holds 5.0 BONDX, must deliver 8) makes the BONDX leg throw; `Round.Clear` is wrapped in `submitMustFail` and a sorted before/after Asset snapshot is identical — all-or-nothing rollback proven.
- `test_clear_rejects_bad_allocation` (SETL-04/CLEAR-05): on a FUNDED round, both an over-stated allocation (A buys 12) and a correct allocation with a wrong price (99.0) are rejected by the on-ledger recompute-and-assert — rejection is by re-verification, not by missing assets.
- Found and fixed a real bug in the Plan-02 `Round.Clear` body: it retired orders with the built-in `archive`, which fails for lack of desk authority under operator-only authority. Added a consuming `Order.Retire` choice.
- `daml test` exits 0 across all six scripts (3 new Phase-2 tests + 2 seed helpers run as scripts + the 3 prior scripts: `test_setup_seeds`, `test_asset_split_merge`, `test_clears_at_100`).

## Task Commits

Each task was committed atomically:

1. **Task 1: seed helpers** - `968a20f` (feat) — `seedCanonicalAndClose` + `seedUnderfundedSellerAndClose` + `SeedResult`/`findAssetCid`
2. **Task 2: settlement tests + Order.Retire fix** - `736b992` (feat) — three tests + the Rule-1 `archive`→`Retire` fix

_Note: Task 2 was a `tdd="true"` task where the tests ARE the deliverable; the implementation under test (`Round.Clear`) shipped in Plan 02-02, so the cycle was write-tests → run → fix the one real defect they exposed → green._

## Files Created/Modified
- `daml/Umbra/Tests.daml` - Added `SeedResult` record, `findAssetCid`, `seedAndClose`/`seedCanonicalAndClose`/`seedUnderfundedSellerAndClose` helpers, `canonicalAllocs`, and the three settlement tests; extended imports (Round/Order/RoundStatus/TradeConfirmation/CloseRound/Clear, Venue/SubmitOrder, DA.List.sort).
- `daml/Umbra/Auction.daml` - Added an operator-only consuming `Order.Retire` choice; changed `Round.Clear` step 3 from `forA_ orderCids archive` to `forA_ orderCids (`exercise` Retire)`.

## Decisions Made
- **Operator-only `Order.Retire` over `archive`:** `Order` is signed by `operator, desk`. The built-in `archive` requires the authority of every signatory; `Round.Clear` runs with operator authority only, so `archive` failed "missing authorization from bankA". A CONSUMING choice controlled by `operator` archives the contract with just the controller's authority — the correct operator-custody retirement primitive (spec §10 step 3). This keeps DvP a single operator-authority transaction with no counterparty submit.
- **Single parameterised `seedAndClose`:** both seed helpers share one generator parameterised by B's BONDX mint. The §4 orders (and thus `computeClearing`'s canonical A=10/B=8/C=2 @100.0) stay identical; the underfunded variant only mints B an undersized BONDX holding and points `sellerBondCids` at it — so `test_atomicity`'s failure is unambiguously the missing asset (the Split throws), not a bad proposal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Round.Clear` could not retire settled Orders (missing desk authorization)**
- **Found during:** Task 2 (test_settled_balances)
- **Issue:** `Round.Clear` step 3 used `forA_ orderCids archive`. `Order`'s signatories are `operator, desk`, and the built-in `archive` requires authorization from ALL signatories. `Clear` is `controller operator` (operator authority only), so the legitimate settlement path failed with `exercise of Archive in Umbra.Auction:Order ... failed due to a missing authorization from 'bankA'`. The two `submitMustFail` tests masked this (they fail earlier — at re-verification / the BONDX split), but the success path `test_settled_balances` exposed it.
- **Fix:** Added an operator-only consuming `choice Retire : ()` to the `Order` template, and changed `Clear` to `forA_ orderCids (`exercise` Retire)`. A consuming choice archives with only the controller's authority.
- **Files modified:** daml/Umbra/Auction.daml
- **Verification:** `daml test` exits 0; `test_settled_balances` green (orders retired, balances + conservation + confirmations correct); the two rejection tests + atomicity still green for their intended reasons.
- **Committed in:** `736b992` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was required for the SETL-01/SETL-02 success path to settle at all. Scope was confined to the order-retirement primitive (an additive operator-custody choice); no change to the clearing math, the verify backstop, the DvP legs, or any frozen field shape. No scope creep.

## Issues Encountered
- LF→CRLF line-ending warnings from git on Windows (cosmetic, expected on this machine); no functional impact.

## User Setup Required
None - no external service configuration required (pure Daml; no installs this phase).

## Next Phase Readiness
- Phase 2 acceptance gate is fully green: the §4 fixture clears at $100.00, settles atomically to the exact spec §4 balances, rolls back entirely on a failing leg, and rejects any wrong/unfair allocation on-ledger.
- Phase 3 (privacy 3-up + per-party JWT) can now build on a settled-round ledger; the per-desk `TradeConfirmation` (observer = singular desk) is the disclosure surface its `test_privacy_confirmations` will assert.
- The additive Option-B `Clear` signature + the new `Order.Retire` choice are what the Phase-4 TS solver driver will exercise; no `daml codegen js` exists yet (P3), so no stale binding to regenerate.

## Self-Check: PASSED

- FOUND: .planning/phases/02-clear-settle-on-ledger/02-03-SUMMARY.md
- FOUND: daml/Umbra/Tests.daml (3 settlement tests + 2 seed helpers)
- FOUND: daml/Umbra/Auction.daml (Order.Retire + Clear retire fix)
- FOUND commit: 968a20f (Task 1 helpers)
- FOUND commit: 736b992 (Task 2 tests + fix)
- `daml test` EXIT=0 (all six scripts green)

---
*Phase: 02-clear-settle-on-ledger*
*Completed: 2026-06-25*
