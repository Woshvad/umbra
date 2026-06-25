---
phase: 03-privacy-proof-vertical-slice
plan: 01
subsystem: testing
tags: [daml, daml-script, privacy, canton, stakeholder-visibility]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Frozen §7 templates (Order no observer, Asset observer owner, TradeConfirmation observer desk, RoundStats observer desks count-only) + Venue.SubmitOrder + initialize seed"
  - phase: 02-clearing-settlement
    provides: "Real Round.Clear DvP body + seedCanonicalAndClose / canonicalAllocs test helpers + SeedResult Option-B ContractIds"
provides:
  - "test_privacy_orders (PRIV-01/02/04): proves per-party Order/Asset isolation + RoundStats count-only visibility on the ledger"
  - "test_privacy_confirmations (PRIV-03): proves each TradeConfirmation is observed only by its own desk after Round.Clear"
  - "seedOpenRound (CLEAR-01): an Open Round + RoundStats{sealedOrderCount=3} + the 3 §4 orders — the live screenshot-ready state the Phase-3 frontend reads per-party without a solver service"
affects: [03-02, 03-03, frontend, privacy-money-shot, json-api-tokens]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Privacy-as-assertion: query @T party returns only stakeholder contracts, so length===1 + all(_.desk==thisDesk) IS the disclosure proof — a stray observer fails it loudly"
    - "Open-round seed (seedOpenRound) for solver-free live frontend data: count SEEDED to 3, lifecycle/auto-increment deferred to Phase 4"

key-files:
  created: []
  modified:
    - "daml/Umbra/Setup.daml — added seedOpenRound : Script ()"
    - "daml/Umbra/Tests.daml — added RoundStats(..) import + test_privacy_orders + test_privacy_confirmations"

key-decisions:
  - "seedOpenRound leaves the Round status = Open on purpose; live Open->Closed->Cleared->Settled lifecycle and RoundStats auto-increment are Phase 4 (CLEAR-01 / D-deferred). The count is SEEDED to 3, not computed."
  - "Privacy tests are pure additions proving the Phase-1 frozen field shapes; NO template signatory/observer changed (privacy is structural, these are the regression guard)."

patterns-established:
  - "Pattern 1: per-party query @T as the privacy boundary — assert length + all(owner/desk == querier) per desk, symmetrically, plus operator-sees-all"
  - "Pattern 2: notElem cross-leak guard on the querying desk's returned set to prove no foreign desk appears"

requirements-completed: [PRIV-01, PRIV-02, PRIV-03, PRIV-04, CLEAR-01]

# Metrics
duration: 3min
completed: 2026-06-25
---

# Phase 3 Plan 01: Privacy Proof + Open-Round Seed Summary

**Two new green Daml Script tests that PROVE per-party Order/Asset/Confirmation isolation and RoundStats count-only visibility on the ledger, plus a seedOpenRound helper giving the frontend money shot live data without a solver.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-25T16:57:26Z
- **Completed:** 2026-06-25T17:00:03Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `test_privacy_orders` (PRIV-01/02/04): each desk's `query @Order` returns exactly 1 (its own) and zero of the others' — symmetrically for A/B/C; operator (signatory) sees all 3; `query @RoundStats` returns the count-only contract (=3); `query @Asset` is owner-scoped while operator sees all 5.
- `test_privacy_confirmations` (PRIV-03): after a real `Round.Clear` on the §4 fixture, each desk sees exactly its own `TradeConfirmation`, with a `notElem` cross-leak guard; operator sees all 3.
- `seedOpenRound` (CLEAR-01): an Open `Round` + `RoundStats{sealedOrderCount = 3}` + the 3 §4 orders submitted per-desk — the live, screenshot-ready state the Phase-3 frontend reads per-party.
- `daml test` exits 0 with all 14 scripts green (the 6 prior tests + 2 new privacy tests + seedOpenRound + the seed/helper scripts).

## Task Commits

Each task was committed atomically (author woshvad, no Claude attribution):

1. **Task 1: seedOpenRound helper in Setup.daml** - `5041d8a` (feat)
2. **Task 2: test_privacy_orders + test_privacy_confirmations** - `e1aad86` (test)

**Plan metadata:** committed separately (docs: complete plan)

_Note: Task 2 was tagged `tdd="true"`, but its `<behavior>` adds NO new source behavior — it proves the already-frozen Phase-1 disclosure structure. The RED/GREEN cycle therefore collapses to a single test-only commit; the tests pass immediately against the existing structure (expected — they are the regression guard, not a new feature)._

## Files Created/Modified
- `daml/Umbra/Setup.daml` - Added top-level `seedOpenRound : Script ()` (Open Round + RoundStats{count=3} + 3 §4 orders).
- `daml/Umbra/Tests.daml` - Added `RoundStats(..)` to the `Umbra.Auction` import; added `test_privacy_orders` and `test_privacy_confirmations`.

## Decisions Made
- `seedOpenRound` leaves the Round `status = Open` deliberately; the live lifecycle and the solver's RoundStats auto-increment are Phase 4. The count is **seeded** to 3 (per CONTEXT decision — do not build solver lifecycle here).
- Privacy tests are pure additions that prove the Phase-1 frozen field shapes — **no template signatory/observer changed**.

## Deviations from Plan

None - plan executed exactly as written. The copy-ready RESEARCH scripts (Privacy Test 1 / Privacy Test 2) transcribed directly against the verified existing helper names (`initialize`, `seedCanonicalAndClose`, `canonicalAllocs`, `Parties`).

## Issues Encountered
- A pre-existing redundant-import warning (`Allocation, Side` re-export in Auction.daml) appears in `daml build` output but is unrelated to this plan's changes and is out of scope (logged for awareness, not fixed).
- Git reports `LF will be replaced by CRLF` warnings on the Windows working copy — cosmetic, no impact on the DAR or test results.

## Known Stubs
None that block the plan goal. `seedOpenRound`'s `RoundStats.sealedOrderCount = 3` is an **intentional seed** (count is computed by the solver in Phase 4 per CLEAR-01 / CONTEXT decision), documented above — not a stub blocking the money shot.

## Threat Flags
None - no new security-relevant surface introduced. The two tests directly mitigate threat-register entries T-03-01..04 (information disclosure) by asserting per-party visibility boundaries; T-03-05 (spoofing) is proven implicitly by each desk submitting under its own authority.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The on-ledger privacy proof (the security keystone of Phase 3, spec §10) is green and is the ground truth the frontend (Plan 03) renders.
- `seedOpenRound` is ready as the live Open-round seed for the 3-up Privacy view; Plan 02 (per-party JWT minting + codegen) and Plan 03 (frontend Privacy view) can build on it.
- No blockers. `daml test` exit 0; template privacy shapes frozen.

## Self-Check: PASSED

- FOUND: commit `5041d8a` (Task 1, seedOpenRound)
- FOUND: commit `e1aad86` (Task 2, privacy tests)
- FOUND: `daml/Umbra/Setup.daml`
- FOUND: `daml/Umbra/Tests.daml`
- `cd daml && daml test` exits 0; all 14 scripts green (incl. test_privacy_orders, test_privacy_confirmations, seedOpenRound)
- `git diff --stat` on Asset/Auction/Roles templates: empty (privacy shapes frozen)

---
*Phase: 03-privacy-proof-vertical-slice*
*Completed: 2026-06-25*
