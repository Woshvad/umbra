---
phase: 09-auction-depth-live-viz
plan: 03
subsystem: clearing-core
tags: [daml, typescript, clearing, coreClear, allornone, maq, conditional, two-pass, golden-parity, rulebook]

# Dependency graph
requires:
  - phase: 09-auction-depth-live-viz
    provides: "09-02 coreClear kernel + two-pass computeClearing wrapper (the pass-through `qualifies` seam) + Noncompetitive"
  - phase: 09-auction-depth-live-viz
    provides: "09-01 additive OrderType/minQty/firmIf on OrderView/Order + TS mirror; Auction.daml Round.Clear already builds the view with minQty/firmIf and re-verifies via computeClearing"
  - phase: 02-clearing-settlement
    provides: "choosePStar topPrices trap guard / rationByPriority + Round.Clear recompute-and-assert backstop"
provides:
  - "AllOrNone/MAQ clearing via bounded (candidate-price × subset) powerset enumeration + ≥minQty inclusion test inside coreClear — byte-identical in Clearing.daml and auction.ts"
  - "Top-level recursive `powerset` helper (Daml-LF no local recursion) + `fillsAtPrice` + `fillOfOrder` + `isAon`/`minQtyOf` — mirrored function-for-function"
  - "Conditional auto-firming: top-level `qualifies : Side -> Decimal -> Optional Decimal -> Bool` wired into the two-pass computeClearing (PASS 1 provP over firm; PASS 2 firm qualifiers vs provP; NOT a fixpoint)"
  - "Golden parity fixtures test_maq_excluded/included + test_aon_all_or_none_fills/drops + test_conditional_firms/drops (Daml) ⇄ maq/aon/conditional scenarios (auction.test.ts), identical numbers"
  - "RULEBOOK.md complete — all four order-type sections (Limit, Noncompetitive, AllOrNone/MAQ, Conditional) filled, each citing exact symbols in both planes"
affects: [09-05, 09-06, "Round.Clear re-verification (auto-covered)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "coreClear = bounded (price × subset) enumeration; §4 reduction: no minQty ⇒ powerset [] == [[]] ⇒ single ∅ subset ⇒ candidate-price ranking (identical to choosePStar), byte-unchanged"
    - "Subset tiebreak = most-included (lower powerset idx); ranking key (negate matched, imbalance, price, idx) keeps matched as PRIMARY so the 99-vs-100 topPrices trap guard is preserved"
    - "Conditional two-pass lives ENTIRELY inside computeClearing (one impl, three callers: solver / tests / Round.Clear); provP is the firming reference even if final p* moves — NOT a fixpoint"
    - "Daml⇄TS golden parity: matching fixtures with identical expected numbers; §4 canary + 99-vs-100 trap as continuous gate"

key-files:
  created: []
  modified:
    - "daml/Umbra/Clearing.daml — isAon/minQtyOf; top-level powerset; fillsAtPrice/fillOfOrder; coreClear rewritten as bounded (price × subset) enumeration; top-level qualifies; two-pass computeClearing wired to real firming"
    - "solver/src/auction.ts — byte-identical TS mirror of every Clearing.daml change (isAon/minQtyOf/powerset/fillsAtPrice/fillOfOrder/coreClear enumeration/qualifies/two-pass)"
    - "daml/Umbra/Tests.daml — test_maq_excluded/included, test_aon_all_or_none_fills/drops, test_conditional_firms/drops"
    - "solver/src/auction.test.ts — maq excluded/included, aon fills/drops, conditional firms/drops scenarios (identical numbers)"
    - "RULEBOOK.md — AllOrNone/MAQ + Conditional sections filled; status/two-pass/order-types intros de-drifted; all four types complete"

key-decisions:
  - "coreClear does NOT call choosePStar; it re-derives price selection via the enumeration ranking key (negate matched, imbalance, price, idx). This is identical to choosePStar's logic for the single-subset case, so §4 + trap are byte-unchanged, and it keeps AON/MAQ inside one kernel. choosePStar stays exported/unchanged for the open-window indicative feed."
  - "isAon keys on `minQty` PRESENCE (per plan 'minQty present'), not orderType==AllOrNone — fixtures set both, but the operative predicate is minQty. Non-AON orders get minQtyOf 0 so they trivially pass the inclusion test."
  - "Enumerate over the full (price × subset) product with an explicit subset index in the sort key rather than relying on stable-sort parity between Daml sortOn and JS .sort — the idx makes the most-included tiebreak deterministic in both planes without a stability assumption."
  - "qualifies made a TOP-LEVEL function (was a local pass-through stub in 09-02) so it is citable in RULEBOOK and matches the plan artifact `qualifies : Side -> Decimal -> Optional Decimal -> Bool`."
  - "No Auction.daml/Roles.daml/web-bindings change: only pure functions in Clearing.daml changed (the OrderView/OrderType DATA shape is unchanged from 09-01), so codegen output is unaffected and Round.Clear auto-covers both new rules via computeClearing."

patterns-established:
  - "Bounded combinatorial clearing (powerset over a tiny order set) expressed as a top-level recursive helper + explicit-index tiebreak, mirrored byte-for-byte across the two planes"
  - "New order-type rule = extend the pure kernel/wrapper + one golden fixture in BOTH planes with identical numbers, all in one lockstep commit; Round.Clear auto-covers via recompute"

requirements-completed: [AUCT-02]  # AUCT-01 clearing-math complete; AUCT-01 stays OPEN pending the order-type entry UI (09-06)

# Metrics
duration: ~12min
completed: 2026-07-09
---

# Phase 9 Plan 03: AllOrNone/MAQ + Conditional Auto-Firming Summary

**Completed the deterministic order-type rulebook (AUCT-02) by adding the two hardest types in lockstep: (1) AllOrNone/MAQ via a bounded `(candidate-price × subset)` powerset enumeration with a `≥minQty` inclusion test inside `coreClear`, and (2) Conditional auto-firming via the single deterministic two-pass rule (`qualifies` firm-vs-provisional-p*) wired into `computeClearing` — both byte-identical in `Clearing.daml` and `auction.ts`, gated by the §4 canary ($100.00 / A=10 / B=8 / C=2), the 99-vs-100 trap, and six new Daml⇄TS golden-parity fixtures. All four order types now clear deterministically and identically in both planes; the full golden suite is green and RULEBOOK.md is complete.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 (each committed lockstep — Clearing.daml + auction.ts in the same commit)
- **Files modified:** 5 source/doc files (no new files)

## Accomplishments

- **Task 1 — AllOrNone/MAQ bounded subset enumeration (both planes, golden-first).** Rewrote `coreClear` from a single choosePStar-then-ration pass into a bounded `(candidate-price × subset)` enumeration: partition the book into `aon` (orders with a `minQty`) and `nonAon`, enumerate the AON powerset with a **top-level recursive** `powerset` helper (Daml-LF forbids local recursion; full-set-first order identical in both planes), and for each `(subset S, price p)` clear `nonAon ++ S` at `p` via `fillsAtPrice`, keeping `(p, S)` only if every AON order in the book fills `≥ its minQty` (the inclusion test). Rank feasible candidates by `(negate matched, imbalance, price, subsetIdx)` — most-included subset wins ties, and because **matched volume is the primary key the 99-vs-100 `topPrices` trap guard is preserved**. §4 reduces exactly (no AON ⇒ `powerset [] == [[]]` ⇒ single ∅ subset ⇒ candidate-price ranking = choosePStar). Added `test_maq_excluded` (C excluded, A=8/B=8/C=0), `test_maq_included` (A=10/B=8/C=2), `test_aon_all_or_none_fills` (A=7/B=2/C=5), `test_aon_all_or_none_drops` (A=3/B=3/C=0) in Daml + mirroring `maq`/`aon` scenarios in `auction.test.ts` with identical numbers. Filled the RULEBOOK AllOrNone/MAQ section. `daml test` all green; `auction.test.ts` 11/11; `tsc --noEmit` clean. Commit `c094f38`.
- **Task 2 — Conditional auto-firming two-pass + full golden parity gate (both planes).** Promoted `qualifies` from the 09-02 local pass-through stub to a **top-level** `qualifies : Side -> Decimal -> Optional Decimal -> Bool` (buy firms iff `provP <= firmIf`, sell iff `provP >= firmIf`, absent `firmIf` never firms) and wired it into the two-pass `computeClearing`: PASS 1 clears the firm book → `provP`; PASS 2 firms each conditional whose `firmIf` qualifies vs `provP`, drops the rest, and re-clears `firm ++ firmed`. **Exactly two passes — NOT a fixpoint** (`provP` is the firming reference even if the final `p*` moves past it). Added `test_conditional_firms` (firmIf 99 firms → A=10/B=8/C=2) and `test_conditional_drops` (firmIf 101 drops → A=8/B=8/C=0) in Daml + mirroring `conditional` scenarios in `auction.test.ts`. Filled the RULEBOOK Conditional section and de-drifted the status/two-pass/order-types intros. Ran the FULL gate: `daml test` all green (incl. §4 canary + settlement + privacy — `Round.Clear` auto-covers both new rules via `computeClearing`); solver **93/93**; `tsc --noEmit` clean. Commit `65cbd20`.

## Task Commits

1. **Task 1: AllOrNone/MAQ bounded subset enumeration (Daml+TS lockstep)** — `c094f38` (feat)
2. **Task 2: Conditional auto-firming two-pass + full golden parity (Daml+TS lockstep)** — `65cbd20` (feat)

**Plan metadata:** appended after this summary (docs: complete plan).

## Files Created/Modified

- `daml/Umbra/Clearing.daml` — `isAon`/`minQtyOf`; top-level `powerset`; `fillsAtPrice`/`fillOfOrder`; `coreClear` rewritten as the bounded `(price × subset)` enumeration; top-level `qualifies`; two-pass `computeClearing` wired to real firming.
- `solver/src/auction.ts` — byte-identical TS mirror of all of the above.
- `daml/Umbra/Tests.daml` — six new fixtures (`test_maq_excluded`/`included`, `test_aon_all_or_none_fills`/`drops`, `test_conditional_firms`/`drops`).
- `solver/src/auction.test.ts` — six new scenarios (maq excluded/included, aon fills/drops, conditional firms/drops), identical numbers.
- `RULEBOOK.md` — AllOrNone/MAQ + Conditional sections filled; status line, two-pass subsection, and order-types intro de-drifted; all four order-type rules complete, each citing both planes.

## Decisions Made

- **`coreClear` re-derives price selection via the enumeration ranking key rather than calling `choosePStar`.** The key `(negate matched, imbalance, price, idx)` is identical to choosePStar's logic for the single-subset (∅) case, so §4 + the trap are byte-unchanged; this keeps all AON/MAQ handling inside one kernel. `choosePStar` stays exported/unchanged for the open-window indicative feed (api.ts) and the trap regression test.
- **`isAon` keys on `minQty` presence, not `orderType == AllOrNone`.** Matches the plan's "minQty present" instruction; non-AON orders get `minQtyOf 0` and trivially pass any inclusion test. Fixtures set `orderType = AllOrNone` for realism, but the operative predicate is `minQty`.
- **Explicit subset index in the sort key** instead of relying on stable-sort parity between Daml `sortOn` and JS `.sort` — makes the most-included tiebreak deterministic in both planes without a stability assumption.
- **`qualifies` promoted to top-level** (was a local stub in 09-02) so it is citable in RULEBOOK and matches the plan artifact signature.
- **No Auction.daml/Roles.daml/`web/daml.js` change.** Only pure functions in Clearing.daml changed — the `OrderView`/`OrderType` data shape is unchanged from 09-01, so codegen output is unaffected and `Round.Clear` auto-covers both new rules through `computeClearing`.

## Deviations from Plan

None — plan executed as written. The two documented 09-02 seams (extracted `coreClear`, two-pass wrapper with a `qualifies` hook) were exactly the extension points; AON/MAQ went inside `coreClear` and Conditional replaced the pass-through `qualifies`, as specified. RULEBOOK intro/subsection de-drifting (status line, "total pass-through" text, "inert" order-types intro) was in-scope RULEBOOK completion, not a plan deviation.

## §4 Canary State (continuous correctness reference)

- `daml test`: all scripts green, exit 0 — `test_clears_at_100: ok` ($100.00 / A=10 / B=8 / C=2), plus `test_maq_excluded/included`, `test_aon_all_or_none_fills/drops`, `test_conditional_firms/drops`, `test_noncomp_sell_top_priority`, and all settlement/atomicity/privacy suites (`test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation`, `test_privacy_orders`, `test_privacy_confirmations`).
- solver `vitest run`: **93/93 green** — `auction.test.ts` 13/13 incl. §4 fixture, the 99-vs-100 `topPrices` trap witness, noncomp, and the new maq/aon/conditional parity scenarios; `api`/`agent`/`ledger`/`proof`/`proofpack`/`clock`/`index` unaffected.
- `tsc --noEmit` (solver) clean.
- Both clearing planes changed in the SAME commit for each behavior-affecting change (lockstep; no split) — verified: `c094f38` and `65cbd20` each list `Clearing.daml` + `auction.ts` together.

## Next Phase Readiness

- All four order types (Limit, Noncompetitive, AllOrNone/MAQ, Conditional) now clear deterministically and identically in Daml and TS; `Round.Clear` re-verifies all of them via the same `computeClearing`.
- **AUCT-02 (deterministic rulebook documented + enforced identically) is COMPLETE.** RULEBOOK.md is authoritative and drift-free, all sections cite both planes.
- **AUCT-01 stays OPEN** — the clearing math for all four types is done, but the order-type ENTRY UI (OrderTicket LIMIT·NONCOMP·MAQ·COND selector + per-type params + type-aware SubmitOrder) lands in **09-06**. Only then is "desks can submit richer order types" fully delivered.
- 09-05 (AUCT-04 TCA receipt + surplus≥0 proof) and 09-06 (order-type entry UI) are unblocked (wave 4).

## Self-Check: PASSED

- Files verified on disk: `daml/Umbra/Clearing.daml`, `solver/src/auction.ts`, `daml/Umbra/Tests.daml`, `solver/src/auction.test.ts`, `RULEBOOK.md`.
- Symbols verified: `powerset` / `qualifies` present in both `Clearing.daml` and `auction.ts`; `test_conditional` + `test_maq` + `test_aon` present in `Tests.daml`.
- Commits verified in git: `c094f38` (Task 1 AON/MAQ), `65cbd20` (Task 2 Conditional + full gate).

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
