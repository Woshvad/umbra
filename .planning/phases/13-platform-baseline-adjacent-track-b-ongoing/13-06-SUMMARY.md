---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 06
subsystem: ledger
tags: [daml, rfq, settlement, dvp, keyless, privacy, adj-02]

# Dependency graph
requires:
  - phase: 11-settlement-cn-token-standard
    provides: "Umbra.Holding (keyless operator-custody), Umbra.Settlement.settleBatch atomic DvP, Umbra.Instrument.InstrumentId"
  - phase: 02-clearing-settlement
    provides: "Umbra.Clearing.Side (Buy | Sell)"
provides:
  - "Umbra.Rfq module — keyless RfqRequest + firm signed Quote templates"
  - "RfqRequest.AcceptQuote choice — requester accepts best quote, settles a 1×1 batch via settleBatch (same atomic DvP path as Round.Clear)"
  - "Four Daml Script scenarios: firm-quote, accept-best, conservation, structural RFQ privacy"
affects: [13-08 (web/daml.js codegen picks up Rfq.daml), rfq-solver-orchestration, rfq-web-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RFQ as a keyless side-mode that REUSES settleBatch (no parallel settlement engine)"
    - "Firm quote = signatory dealer (binding commitment, unforgeable)"
    - "Operator co-submits AcceptQuote as settlement custodian for read-visibility of operator-custodied holdings"

key-files:
  created:
    - daml/Umbra/Rfq.daml
  modified:
    - daml/Umbra/Tests.daml

key-decisions:
  - "Rfq.daml is KEYLESS (fetch-by-ContractId + assertMsg) per D7 — grep-clean of key/maintainer"
  - "AcceptQuote controller = requester; the choice body runs under RfqRequest signatory authority (operator ∈ signatories) so settleBatch's operator-custody Holding choices are authorized"
  - "Quote is signatory operator, dealer (firm/binding) with observer requester only (structural per-requester privacy)"
  - "The requester's `side` on RfqRequest drives the DvP leg direction (Buy = pays cash/receives bond; Sell = delivers bond/receives cash)"

patterns-established:
  - "RFQ 1×1 batch: one bond leg + one cash leg marshaled as [Instruction] + [(owner, instrument, cid)] sources into settleBatch operator … — identical machinery to Round.Clear"
  - "Test co-submission via submitMulti [requester, operator] [] so the operator (custodian) can read the operator-custodied source Holdings"

requirements-completed: [ADJ-02]

# Metrics
duration: ~12min
completed: 2026-07-10
---

# Phase 13 Plan 06: Rfq.daml keyless RFQ side-mode Summary

**Keyless RFQ templates (RfqRequest + firm signatory-dealer Quote) where the requester accepts the best quote and it settles a 1×1 batch through the SAME atomic Umbra.Settlement.settleBatch DvP path — proving the Canton DvP machinery serves illiquid single-bond RFQ trades with firm quotes and structural per-requester privacy.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-10
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- New `Umbra.Rfq` module: keyless `RfqRequest` (signatory operator, requester; observer = invited dealer set) + firm `Quote` (signatory operator, dealer; observer requester).
- `AcceptQuote` choice builds a 1×1 DvP batch (bond leg + cash leg at the firm price) and calls `settleBatch operator …` — no new settlement mechanism; cash and bond conserve; all-or-nothing.
- Four ADJ-02 Daml Script scenarios proving firm-quote authority, accept-best pricing, per-instrument conservation, and structural RFQ privacy.
- The §4 secondary-market golden still clears exactly $100.00 (A=10 / B=8 / C=2); `Clearing.daml` and `Round.Clear` byte-unchanged; `daml test` exit 0.

## Task Commits

Each task was committed atomically (author/committer = woshvad, zero Claude attribution):

1. **Task 1: Rfq.daml — keyless RfqRequest + firm Quote + AcceptQuote (settleBatch)** - `d52f07f` (feat)
2. **Task 2: Tests.daml — ADJ-02 RFQ scenarios** - `6063c3a` (test)

## Files Created/Modified
- `daml/Umbra/Rfq.daml` (created) - `Umbra.Rfq` module: keyless `RfqRequest` + firm `Quote` templates + `AcceptQuote` choice reusing `settleBatch` for a 1×1 atomic DvP.
- `daml/Umbra/Tests.daml` (modified) - Added `import Umbra.Rfq` and four scenarios: `test_rfq_accept_settles`, `test_rfq_best_quote`, `test_rfq_quote_is_firm`, `test_rfq_privacy`.

## Decisions Made
- **Keyless throughout (D7):** No `key`/`maintainer` in `Rfq.daml`; every cross-contract read is `fetch quoteCid` + `assertMsg` (instrument / requester / quantity / operator match), mirroring `Holding.daml`.
- **Authority via signatory delegation:** `AcceptQuote` is `controller requester`, but its body executes with the RfqRequest signatories' authority (operator + requester). Since operator is a signatory, the operator-custody `Holding` choices inside `settleBatch` (all `controller operator`) are authorized — no separate authorization mechanism needed.
- **Firm quote = dealer signature:** `Quote` is `signatory operator, dealer`, so a quote cannot exist without dealer authority (unforgeable). `observer requester` is the sole disclosure — quotes are structurally private per requester.
- **Requester `side` drives leg direction:** a `Buy` request means the requester pays cash and receives the bond; `Sell` is the mirror. One bond `Instruction` + one cash `Instruction` at `q.price`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AcceptQuote settle failed on read-visibility when the requester submitted alone**
- **Found during:** Task 2 (`test_rfq_accept_settles` / `test_rfq_best_quote`)
- **Issue:** With `submit requester do exerciseCmd … AcceptQuote`, `settleBatch`'s `fetch` of the dealer's operator-custodied source `Holding` failed with "contract not visible to the reading parties" — the dealer's bond holding is disclosed only to `{dealer, operator}`, not to the submitting requester. Authority delegation (operator ∈ RfqRequest signatories) grants authorization but not submission-time read visibility.
- **Fix:** The two settle tests co-submit via `submitMulti [requester, operator] []`, so the operator — a signatory of `RfqRequest` and the settlement custodian — is an acting party and can read the operator-custodied source Holdings. This mirrors reality (settlement is operator-mediated, exactly as `Round.Clear` runs under operator custody) and matches how the `RfqRequest`/`Quote` creates already co-sign with the operator. `Rfq.daml` was left as planned (controller = requester).
- **Files modified:** daml/Umbra/Tests.daml
- **Verification:** `daml test` exit 0 — `test_rfq_accept_settles` and `test_rfq_best_quote` now pass with correct post-settle balances and per-instrument conservation.
- **Committed in:** `6063c3a` (Task 2 commit)

**2. [Rule 3 - Blocking] Removed an ambiguously-typed literal comparison**
- **Found during:** Task 2 (`test_rfq_best_quote`)
- **Issue:** `assertMsg "…" (100.0 < 101.0)` failed to typecheck — a bare Decimal-literal comparison has no `NumericScale` constraint to resolve (`Ambiguous type variable`).
- **Fix:** Removed the trivial (non-discriminating) literal assert; the real, discriminating proof that the accepted price 100 was used is the settled amount (bankC receives exactly 500, not 505).
- **Files modified:** daml/Umbra/Tests.daml
- **Verification:** `daml build`/`daml test` succeed; the accept-best test still proves the correct price via settled balances.
- **Committed in:** `6063c3a` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). Both confined to `Tests.daml`; `Rfq.daml` shipped exactly as planned.
**Impact on plan:** No scope creep. The template design was unchanged; the fixes were test-harness authorization/visibility and a Daml typing nuance.

## Issues Encountered
- None beyond the two auto-fixed deviations above.

## Known Stubs
None — all RFQ templates are fully wired and exercised on-ledger by the scenarios; no placeholder/empty-value stubs.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. T-13-16 (quote forgery) is mitigated by `signatory operator, dealer` (proven by `test_rfq_quote_is_firm`); T-13-17 (RFQ leak) by the explicit observer sets (proven by `test_rfq_privacy`); T-13-18 (settlement bypass) by reusing `settleBatch`'s DvP-integrity checks (the §4 golden + `daml test` regression gate stays green).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `daml/Umbra/Rfq.daml` is ready for `web/daml.js` regeneration in plan 13-08 (centralized codegen — deliberately NOT regenerated here per the plan).
- The on-ledger RFQ templates are ready for later solver-orchestration and web-panel plans.
- Blocker: none.

## Self-Check: PASSED

- FOUND: daml/Umbra/Rfq.daml
- FOUND: daml/Umbra/Tests.daml
- FOUND: .planning/phases/13-platform-baseline-adjacent-track-b-ongoing/13-06-SUMMARY.md
- FOUND commit: d52f07f (Task 1)
- FOUND commit: 6063c3a (Task 2)

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
