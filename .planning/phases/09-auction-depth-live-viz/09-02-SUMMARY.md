---
phase: 09-auction-depth-live-viz
plan: 02
subsystem: clearing-core
tags: [daml, typescript, clearing, coreClear, two-pass, noncompetitive, rulebook, golden-parity]

# Dependency graph
requires:
  - phase: 09-auction-depth-live-viz
    provides: "09-01 additive order model (OrderType/minQty/firmIf on OrderView/Order + TS mirror; effective-limit) — inert until this plan"
  - phase: 02-clearing-settlement
    provides: "Clearing.daml §8 core (choosePStar topPrices trap guard / rationByPriority) + Round.Clear recompute-and-assert backstop"
  - phase: 04-solver-service
    provides: "solver/src/auction.ts 1:1 TS mirror of Clearing.daml"
provides:
  - "coreClear : [OrderView] -> (Decimal,[Allocation]) — the extracted single-pass §8 kernel (both planes)"
  - "computeClearing as a deterministic TWO-PASS wrapper over coreClear (partition firm/conditional; provisional coreClear over firm; pass-through `qualifies` hook) — the seam 09-03 conditional auto-firming rides on"
  - "Noncompetitive order type: any-price demand/supply contribution, excluded from candidatePrices, TOP-priority rationing — mirrored byte-identically in Clearing.daml and auction.ts"
  - "Golden parity fixtures test_noncomp_sell_top_priority (Daml) ⇄ noncomp scenario (auction.test.ts), identical numbers"
  - "RULEBOOK.md: coreClear/two-pass subsection + filled Noncompetitive section citing both planes"
affects: [09-03, 09-05, 09-06, "wave-3 AON/MAQ + Conditional math", "Round.Clear re-verification"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "coreClear = extracted §8 kernel; computeClearing = two-pass wrapper (behavior-preserving: no conditional => final == book => one coreClear)"
    - "Noncompetitive effective-limit: limit stays Decimal but is IGNORED for willingness (predicate OR'd with isNoncomp); noncomp adds no candidate price"
    - "Noncomp-first ration key `(not isNoncomp, per-side limit)` — Daml Ord Bool (False<True) ⇄ TS 0/1 (Pitfall 6); per-side direction preserved (sells ASC or §4 breaks)"
    - "Daml⇄TS golden parity: matching fixtures with identical expected numbers in both planes; §4 canary + 99-vs-100 trap as continuous gate"

key-files:
  created: []
  modified:
    - "daml/Umbra/Clearing.daml — extract coreClear; two-pass computeClearing; isNoncomp; noncomp OR into demandAt/supplyAt; exclude noncomp from candidatePrices; noncomp-first ration key"
    - "solver/src/auction.ts — byte-identical TS mirror of every Clearing.daml change (coreClear, two-pass, isNoncomp, predicates, sort key with Bool→0/1)"
    - "daml/Umbra/Tests.daml — test_noncomp_sell_top_priority golden fixture"
    - "solver/src/auction.test.ts — noncomp scenario (mirrors the Daml fixture) + candidatePrices import"
    - "RULEBOOK.md — coreClear + two-pass wrapper subsection; Noncompetitive section filled, citing both planes' symbols"

key-decisions:
  - "Two-pass wrapper uses a total pass-through `qualifies` stub (NOT `firmed = []`, which the plan forbids) — provP (PASS-1 provisional over firm) is bound and passed to qualifies so there is no unused-binding warning and the 09-03 firming hook is real"
  - "Noncomp ration key keeps the EXISTING per-side limit direction (buys DESC / sells ASC) behind the noncomp-first boolean — a blanket `negate effLimit` for both sides (as the plan text literally suggested) would reverse sell ordering and clear §4 wrongly, so it was NOT used"
  - "candidatePrices explicitly EXCLUDES noncomp orders (`not isNoncomp`) so a noncomp's stored `limit` sentinel (0.0) never leaks in as a spurious candidate price — honors the RULEBOOK 'adds no candidate price of its own' promise under the effective-limit approach"
  - "Noncomp fixture kept on the SELL side (Pitfall 3, single funded buyer) and designed to DISCRIMINATE priority (competitive B qty 5 rationed to 2 while noncomp C qty 4 fills fully) rather than merely fill"

patterns-established:
  - "Extract-then-wrap refactor: pull the kernel into a pure fn, make the public entry a wrapper, keep the §4 canary byte-identical as the behavior-preserving gate"
  - "New order-type rule = OR the type predicate into demand/supply + adjust the ration sort key + one golden fixture in BOTH planes with identical numbers, all in one lockstep commit"

requirements-completed: []  # AUCT-01 (AON/MAQ + Conditional remain) and AUCT-02 (full rulebook) land in 09-03; noncompetitive is only the first slice

# Metrics
duration: ~11min
completed: 2026-07-09
---

# Phase 9 Plan 02: coreClear Two-Pass + Noncompetitive Summary

**Refactored `computeClearing` into an extracted `coreClear` kernel plus a deterministic two-pass wrapper (the 09-03 conditional-firming seam), then shipped the Noncompetitive order type — any-price contribution, no candidate price, top-priority rationing — byte-identically in `Clearing.daml` and `auction.ts`, gated by the §4 canary ($100.00 / A=10 / B=8 / C=2), the 99-vs-100 trap, and a Daml⇄TS golden-parity noncomp fixture (p*=100.00, A=6 / B=2 / C=4).**

## Performance

- **Duration:** ~11 min
- **Tasks:** 2 (each committed lockstep — Clearing.daml + auction.ts in the same commit)
- **Files modified:** 5 source/doc files (no new files)

## Accomplishments

- **Task 1 — coreClear + two-pass wrapper (behavior-preserving, both planes).** Extracted today's `computeClearing` body into `coreClear : [OrderView] -> (Decimal, [Allocation])` — the single-pass §8 kernel (candidate-price select + eligibility + priority rationing). Redefined `computeClearing` as a two-pass wrapper: partition `firm` (non-conditional) vs `conditional`, compute a provisional clear `provP = coreClear firm` (PASS 1), firm each conditional whose `firmIf` qualifies vs `provP` (PASS 2), and re-clear `firm ++ firmed`. The `qualifies` firming test is a **total pass-through** in this plan (the 09-03 hook), so `firmed == conditional`, `final == the whole book`, and the wrapper reduces to exactly one `coreClear` — the §4 fixture is byte-identical before and after. Mirrored function-for-function in `auction.ts` (Daml Bool-free; `orderType` optional so an omitted type is never `Conditional`). `daml test` 16 ok incl. `test_clears_at_100`; solver `auction.test.ts` 6/6; `tsc --noEmit` clean.
- **Task 2 — Noncompetitive (fill-at-clear, top priority, any price), lockstep + golden fixtures.** Added `isNoncomp` and OR'd the noncompetitive predicate into `demandAt`/`supplyAt` (a noncomp buy/sell is willing at any price); **excluded** noncomp orders from `candidatePrices` (they add no candidate price); and extended the `coreClear` ration key to `(not isNoncomp, per-side limit)` so noncompetitive fills **first**, with the existing buys-DESC / sells-ASC direction preserved behind it. TS mirrors the Daml `Ord Bool` with an explicit `0/1` map (Pitfall 6). Added the golden fixture `test_noncomp_sell_top_priority` (Daml) and the `noncomp` scenario (`auction.test.ts`) with **identical** expected numbers — p*=100.00, A=6 / B=2 / C=4 (noncomp C fills its full qty with top priority; competitive B rationed to 2). Filled the RULEBOOK Noncompetitive section citing both planes' exact symbols. Full solver suite **84/84**; `daml test` 16 ok incl. `test_noncomp_sell_top_priority` + `test_clears_at_100`; `tsc --noEmit` clean.

## Task Commits

1. **Task 1: coreClear + two-pass computeClearing wrapper (behavior-preserving)** — `e8fcf06` (refactor)
2. **Task 2: Noncompetitive order type (Daml+TS lockstep + golden fixtures + RULEBOOK)** — `8cd17ec` (feat)

**Plan metadata:** appended after this summary (docs: complete plan).

## Files Created/Modified

- `daml/Umbra/Clearing.daml` — `coreClear` extraction; two-pass `computeClearing`; `isNoncomp`; noncomp OR in `demandAt`/`supplyAt`; noncomp excluded from `candidatePrices`; noncomp-first ration key in `coreClear`.
- `solver/src/auction.ts` — byte-identical TS mirror of all of the above (`coreClear`, two-pass `computeClearing`, `isNoncomp`, predicates, `0/1` sort key).
- `daml/Umbra/Tests.daml` — `test_noncomp_sell_top_priority` (clone of the §4 canary shape).
- `solver/src/auction.test.ts` — `noncomp` scenario + `candidatePrices` import.
- `RULEBOOK.md` — coreClear/two-pass subsection under the objective; Noncompetitive section filled (any-price contribution, no-candidate-price, top-priority key, Bool→0/1 parity note, single-buyer settle caveat) citing `isNoncomp`/`demandAt`/`supplyAt`/`candidatePrices`/`coreClear` in both planes and the two golden fixtures.

## Decisions Made

- **Two-pass hook uses a real pass-through `qualifies`, not `firmed = []`.** The plan explicitly forbids the `[]` placeholder. `provP` is bound (PASS-1 provisional over firm) and passed to a `qualifies _v _p = True` stub, so there is no unused-binding warning (Daml) / no `noUnusedLocals` error (TS), and 09-03 has a genuine firming seam to fill.
- **Per-side ration direction preserved behind the noncomp boolean.** The plan text's generic `negate effLimit` key literally applied to sells would reverse sell ordering (highest limit first) and clear §4 at B=5/C=5 instead of B=8/C=2 — breaking the canary. The correct realization keeps buys DESC / sells ASC and only prepends the noncomp-first boolean. Documented in RULEBOOK + code comments.
- **candidatePrices excludes noncomp.** Under the effective-limit approach a noncomp order still carries a `limit` field (0.0 sentinel), which would otherwise leak in as a spurious candidate price. Excluding `isNoncomp` honors the "adds no candidate price of its own" rule.
- **Noncomp fixture discriminates priority.** Designed so competitive B (qty 5) is rationed to 2 while noncomp C (qty 4) fills fully — reversed priority would give B=5/C=1, so the fixture proves top priority rather than incidental full-fill.

## Deviations from Plan

### Auto-fixed / clarified

**1. [Rule 1 — Correctness] Ration sort-key direction corrected vs the plan's literal `negate effLimit`.**
- **Found during:** Task 2 (designing the noncomp-first key).
- **Issue:** The plan's `[isNoncomp?0:1, -effLimit]` for **both** sides would reverse the sell ordering (sells must sort ASCENDING by limit) and clear the §4 fixture wrongly.
- **Fix:** Keep the existing per-side direction (buys `negate limit` / sells `limit`) behind the noncomp-first boolean; the §4 book (all competitive) reduces to the exact prior single-limit key.
- **Files:** `daml/Umbra/Clearing.daml`, `solver/src/auction.ts`. **Committed in:** `8cd17ec`.

**2. [Rule 2 — Correctness] `candidatePrices` excludes noncomp orders.**
- **Found during:** Task 2.
- **Issue:** The plan noted "candidatePrices unchanged", but under the effective-limit approach a noncomp order's stored `limit` (0.0) would appear as a spurious candidate price, contradicting "adds no candidate price".
- **Fix:** Filter `not (isNoncomp o)` in `candidatePrices` in both planes; asserted by the `candidatePrices(views) == [100]` check in the TS noncomp scenario.
- **Files:** `daml/Umbra/Clearing.daml`, `solver/src/auction.ts`, `solver/src/auction.test.ts`. **Committed in:** `8cd17ec`.

**Total deviations:** 2 (both correctness clarifications; no architectural change, no scope creep). Both preserve the §4 canary and were the correct realization of the plan's stated intent (noncomp fills first, §4 safe, adds no candidate price).

## §4 Canary State (continuous correctness reference)

- `daml test`: **16 ok scripts**, exit 0 — `test_clears_at_100: ok` ($100.00 / A=10 / B=8 / C=2), `test_noncomp_sell_top_priority: ok`, plus all settlement/atomicity/privacy suites green.
- solver `vitest run`: **84/84 green** — `auction.test.ts` 7/7 incl. §4 fixture, the 99-vs-100 `topPrices` trap witness, and the new noncomp parity scenario; `api`/`agent`/`ledger`/`proof`/`proofpack`/`clock`/`index` unaffected.
- `tsc --noEmit` (solver) clean.
- Both clearing planes changed in the SAME commit for each behavior-affecting change (lockstep; no split) — verified in `8cd17ec` file list (`Clearing.daml` + `auction.ts` together).

## Next Phase Readiness

- **09-03** inherits the `coreClear` kernel + two-pass `computeClearing` seam: AON/MAQ bounded enumeration goes inside `coreClear`; Conditional auto-firming replaces the pass-through `qualifies` with the real `firmIf`-vs-`provP` test. `Round.Clear` auto-covers both because it re-verifies through the same `computeClearing`.
- The RULEBOOK Noncompetitive section is authoritative; AON/MAQ and Conditional placeholders remain for 09-03.
- AUCT-01 / AUCT-02 intentionally left OPEN (noncompetitive is only the first order-type slice; full rulebook completes in 09-03).

## Self-Check: PASSED

- Files verified on disk: `daml/Umbra/Clearing.daml`, `solver/src/auction.ts`, `daml/Umbra/Tests.daml`, `solver/src/auction.test.ts`, `RULEBOOK.md`.
- Symbols verified: `coreClear` present in both `Clearing.daml` and `auction.ts`; `test_noncomp` present in `Tests.daml`.
- Commits verified in git: `e8fcf06` (Task 1 refactor), `8cd17ec` (Task 2 noncomp).

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
