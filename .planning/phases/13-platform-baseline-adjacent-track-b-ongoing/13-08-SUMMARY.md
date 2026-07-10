---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 08
subsystem: database
tags: [daml, canton, issuance, uniform-price, coupon, redemption, cip-0056, keyless, codegen]

# Dependency graph
requires:
  - phase: 13-06
    provides: "Umbra.Rfq keyless template (co-committed into the regenerated web/daml.js here)"
  - phase: 11
    provides: "Holding (CIP-0056) + Instrument + Settlement.settleBatch DvP + moveExactHolding"
  - phase: "02/09"
    provides: "§8 computeClearing uniform-price clearing kernel (reused for issuance)"
provides:
  - "Umbra.Issuance — keyless uniform-price primary bond issuance reusing §8 computeClearing"
  - "ClearIssuance mints CIP-0056 Holdings to winners at ONE uniform price + collects cash"
  - "Coupon lifecycle choice — pro-rata cash to current holders, per-period double-pay guard"
  - "Redeem lifecycle choice — repay principal + retire (archive) bond Holdings, cash conserved"
  - "Regenerated + committed web/daml.js with Umbra.Rfq (13-06) + Umbra.Issuance (13-08) bindings"
affects: [solver-issuance-orchestration, web-issuance-panel, ADJ-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Issuance-as-a-thin-layer over §8: issuer = one Sell of trancheSize; bids = Buys; computeClearing gives the uniform price + allocation (NOT a parallel mechanism)"
    - "Lifecycle state machine on a keyless recreated round (cleared flag + couponsPaid marker) — double-pay guard without contract keys"
    - "Fan-out cash payments (issuer → N holders) reuse settleBatch's threaded source; single per-winner collection uses moveExactHolding"

key-files:
  created:
    - daml/Umbra/Issuance.daml
  modified:
    - daml/Umbra/Tests.daml
    - web/daml.js

key-decisions:
  - "Issuance tranche uses a DISTINCT instrument id ('BOND2'), so the §4 secondary-market 'BONDX' is provably untouched (BONDX total byte-identical at 35.0)"
  - "issuer == operator in scenarios (operator-custody MVP, consistent with §4's InstrumentId operator convention); the template stays general (issuer field distinct)"
  - "ClearIssuance collects each winner's cash via moveExactHolding (one source→issuer); Coupon/Redeem fan-out issuer→N holders via settleBatch (threaded remainder)"
  - "Over-mint guard is on-ledger: minted bond == cleared cross (buyFills == sellFills) AND <= trancheSize"
  - "Double-pay guard is a keyless per-round couponsPaid marker carried across the recreated round (period-scoped, not a blanket block)"

patterns-established:
  - "Pattern: primary issuance clears through the exact §8 kernel (auction engine proven issuance-capable, not secondary-market-only)"
  - "Pattern: keyless bond lifecycle (Coupon/Redeem) via fetch-by-cid + assert + settleBatch DvP"

requirements-completed: [ADJ-03]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 13 Plan 08: ADJ-03 Keyless Primary Issuance + Coupon/Redeem Lifecycle Summary

**Keyless `Umbra.Issuance` — a uniform-price EasyAuction that reuses the §8 `computeClearing` to allocate a new bond tranche at ONE price and mint CIP-0056 `Holding`s to winners, plus double-pay-guarded `Coupon` and holding-retiring `Redeem` lifecycle choices; web/daml.js regenerated with Rfq + Issuance bindings.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-10T19:49Z
- **Completed:** 2026-07-10T19:56Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified/regenerated)

## Accomplishments
- `Umbra.Issuance` (keyless): `IssuanceRound.ClearIssuance` builds the §8 order book (issuer as one `Sell` of `trancheSize`, each sealed bid as a `Buy`), calls the SAME `computeClearing` for a single uniform price + per-winner allocation, mints CIP-0056-conformant bond `Holding`s, and collects each winner's cash to the issuer — with an on-ledger over-mint guard (`buyFills == sellFills`, `<= trancheSize`).
- `Coupon` choice pays cash pro-rata to current holders (deterministic per-unit) via `settleBatch`, with a per-round `couponsPaid` marker rejecting a second payment for the same period.
- `Redeem` choice repays principal to holders and retires (archives) the bond `Holdings`, contracting the tranche supply to zero while conserving cash.
- Regenerated and committed `web/daml.js` (`daml codegen js`), picking up BOTH `Umbra.Rfq` (13-06) and `Umbra.Issuance` (13-08) — fresh-clone invariant preserved; web `tsc --noEmit` clean.
- `daml test` green across the new issuance/coupon/redeem scenarios AND the §4 golden (`test_clears_at_100` still $100.00); `Clearing.daml` / `Round.Clear` byte-unchanged.

## Task Commits

Each task was committed atomically (author/committer `woshvad`, no Claude attribution):

1. **Task 1: Issuance.daml — keyless uniform-price mint + Coupon + Redeem** - `332083f` (feat)
2. **Task 2: Tests.daml — ADJ-03 scenarios + §4 regression** - `c825910` (test)
3. **Task 3: Regenerate + commit web/daml.js (Rfq + Issuance bindings)** - `19531d3` (chore)

## Files Created/Modified
- `daml/Umbra/Issuance.daml` - Keyless `IssuanceRound` template with `ClearIssuance` (reuse §8 + mint), `Coupon` (pro-rata, double-pay-guarded), `Redeem` (retire + conserve); `IssuanceBid` / `ClearIssuanceResult` data types.
- `daml/Umbra/Tests.daml` - `test_issuance_uniform_price`, `test_issuance_coupon_prorata`, `test_issuance_redeem` + `seedClearedIssuance` helper; imports `Umbra.Issuance`.
- `web/daml.js` - Regenerated `@daml.js/umbra-0.1.0` bindings including new `Umbra/Rfq` and `Umbra/Issuance` modules (existing modules refreshed for the new package hash).

## Decisions Made
- **Distinct tranche instrument ("BOND2"):** issuance mints a separate instrument id so the §4 "BONDX" bond is provably untouched (asserted: BONDX total unchanged at 35.0). Cleaner than reusing BONDX and mixing supply.
- **issuer == operator in scenarios:** operator-custody MVP, matching §4's `InstrumentId operator` convention; the template keeps `issuer` as a distinct field so a non-operator issuer works unchanged.
- **Cash-move mechanism split:** per-winner collection (winner→issuer, one source each) uses `moveExactHolding`; fan-out lifecycle payments (issuer→N holders, one source threaded) reuse `settleBatch` — the proven atomic DvP path — rather than hand-threading remainders.
- **On-ledger guards:** over-mint (`buyFills == sellFills` and `<= trancheSize`) and double-coupon (`notElem period couponsPaid`) are asserted in the choice bodies (threats T-13-22 / T-13-23).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed redundant Daml imports flagged by the typechecker**
- **Found during:** Task 2 (running `daml test`)
- **Issue:** `daml test` warned that `Allocation(..)` (Issuance.daml) and `ClearIssuanceResult(..)` (Tests.daml) imports were redundant (record-dot access needs neither).
- **Fix:** Dropped the unused import members; re-ran `daml test` (exit 0, no Issuance warnings).
- **Files modified:** daml/Umbra/Issuance.daml, daml/Umbra/Tests.daml
- **Verification:** `daml test` exit 0; warning no longer emitted for Issuance.daml.
- **Committed in:** `c825910` (Task 2 commit)

**2. [Design choice] settleBatch used for coupon/redeem fan-out payments**
- **Found during:** Task 1 (implementing Coupon/Redeem)
- **Issue:** The plan sketch named `moveExactHolding` for cash movement, but paying N holders from ONE issuer source requires threading the source remainder across legs.
- **Fix:** Reused `Umbra.Settlement.settleBatch` (the proven threaded, atomic DvP path) for the issuer→N-holders fan-out; kept `moveExactHolding` for the single-source per-winner collection in `ClearIssuance`. Same keyless Holding choices underneath; no new mechanism.
- **Files modified:** daml/Umbra/Issuance.daml
- **Verification:** Coupon/Redeem scenarios conserve cash on-ledger (before/after totals equal); `daml test` exit 0.
- **Committed in:** `332083f` (Task 1) / scenarios `c825910` (Task 2)

---

**Total deviations:** 2 (1 Rule-1 warning cleanup, 1 design choice for correct fan-out threading)
**Impact on plan:** No scope change. Both keep the module keyless and reuse the proven §8 + settleBatch paths; §4 golden and Clearing.daml untouched.

## Issues Encountered
None — the §4 golden stayed green throughout; the discriminating issuance fixture (bids A@102 / B@101 / C@100 against a reserve-100 tranche) clears at 101.0 with A=6 / B=4 / C=0, proving §8 rationing (10 issued, not a naive 15).

## User Setup Required
None - no external service configuration required. (Live Canton LocalNet issuance/coupon/redeem E2E is an existing UAT gate; this plan is offline-verified via `daml test`.)

## Next Phase Readiness
- Ledger layer for ADJ-03 is complete and offline-verified; solver orchestration (open an issuance round, gather bids, drive `ClearIssuance`) and an optional web issuance panel are the natural follow-ups (later plans).
- `web/daml.js` now exposes `Umbra.Rfq` + `Umbra.Issuance` bindings for any web/solver client wiring.

## Self-Check: PASSED

- `daml/Umbra/Issuance.daml` — FOUND
- `web/daml.js/umbra-0.1.0/lib/Umbra/Issuance/module.js` — FOUND (regenerated binding)
- `13-08-SUMMARY.md` — FOUND
- Commits `332083f`, `c825910`, `19531d3` — all FOUND in git history
- `daml test` exit 0 (issuance/coupon/redeem + §4 golden $100.00); Issuance.daml keyless; `Clearing.daml` byte-unchanged; web `tsc --noEmit` clean.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
