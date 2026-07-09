---
phase: 09-auction-depth-live-viz
plan: 01
subsystem: clearing-core
tags: [daml, typescript, order-model, clearing, codegen, rulebook, daml.js]

# Dependency graph
requires:
  - phase: 02-clearing-settlement
    provides: "Clearing.daml §8 core (computeClearing/choosePStar/rationByPriority) + Round.Clear recompute-and-assert backstop"
  - phase: 04-solver-service
    provides: "solver/src/auction.ts 1:1 TS mirror + ledger.ts readSealedOrders v2 decode"
  - phase: 06-frontend-viz
    provides: "OrderTicket/DeskColumn SubmitOrder exercise sites"
provides:
  - "Additive OrderType discriminator (Limit|Noncompetitive|AllOrNone|Conditional) + minQty/firmIf on OrderView/Order/Venue.SubmitOrder across both planes"
  - "Regenerated + committed web/daml.js bindings carrying the new Order/SubmitOrder shape (fresh-clone-builds invariant)"
  - "RULEBOOK.md skeleton (AUCT-02 doc anchor) citing both Clearing.daml and auction.ts, with 09-02/09-03 placeholder sections"
affects: [09-02, 09-03, 09-06, "wave-2 clearing math", "order-type entry UI"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive Optional-at-end fields (Daml 3.x SCU): new fields appended, every construction site edited to the Limit default (no field defaults in Daml)"
    - "Effective-limit approach (RESEARCH A1): keep limit:Decimal; do NOT make it Optional — smaller blast radius on the frozen field"
    - "Pure reduction: new fields inert until wave 2; clearing math bodies byte-unchanged so §4 stays $100.00"

key-files:
  created:
    - "RULEBOOK.md — sovereign clearing rulebook skeleton (AUCT-02 anchor)"
  modified:
    - "daml/Umbra/Clearing.daml — data OrderType + appended OrderView fields"
    - "daml/Umbra/Auction.daml — Order fields + relaxed ensure + threaded Round.Clear OrderView build + OrderType(..) re-export"
    - "daml/Umbra/Roles.daml — Venue.SubmitOrder args + threaded create Order"
    - "daml/Umbra/Setup.daml + Tests.daml — every §4 construction site to the Limit default"
    - "solver/src/auction.ts — TS OrderType type + optional OrderView fields (no math change)"
    - "solver/src/ledger.ts — readSealedOrders maps orderType/minQty/firmIf from the v2 wire"
    - "web/src/components/OrderTicket.tsx + DeskColumn.tsx — plain-Limit SubmitOrder payload"
    - "web/daml.js — regenerated bindings (192 files)"

key-decisions:
  - "Effective-limit approach: limit stays Decimal (not Optional); Noncompetitive 'any price' deferred to 09-02 math"
  - "OrderType defined in Clearing.daml (math leaf), re-exported by Umbra.Auction — single shared symbol, no import cycle"
  - "TS OrderView fields are OPTIONAL (orderType?/minQty?/firmIf?) so existing §4 test literals stay valid; Daml fields are required + set at every site"
  - "AUCT-01/AUCT-02 NOT marked complete — this plan is the foundation only; the order-type math + full rulebook land in 09-02/09-03/09-06"

patterns-established:
  - "Pure-reduction wave: extend the data model everywhere with zero observable behavior change; §4 canary is the gate"
  - "Regenerate + commit web/daml.js in the same change as any Auction/Roles/Clearing template edit (Pitfall 4)"

requirements-completed: []  # AUCT-01/AUCT-02 are multi-plan; foundation only this plan — left open for 09-02/09-03/09-06

# Metrics
duration: 22min
completed: 2026-07-09
---

# Phase 9 Plan 01: Additive Order-Model Foundation Summary

**Extended Order/OrderView/Venue.SubmitOrder and the TS mirror with an inert orderType/minQty/firmIf discriminator, regenerated + committed web/daml.js, and laid the RULEBOOK.md skeleton — a pure reduction with §4 still clearing $100.00 / A=10 / B=8 / C=2 and Daml⇄TS golden parity intact.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-09T15:22Z (approx)
- **Completed:** 2026-07-09T15:33Z (approx)
- **Tasks:** 3
- **Files modified:** 11 source files + regenerated web/daml.js (192 files) + 1 new doc

## Accomplishments

- Added `data OrderType = Limit | Noncompetitive | AllOrNone | Conditional` in `Clearing.daml` (re-exported by `Umbra.Auction`) and appended `orderType`/`minQty`/`firmIf` to `OrderView`, `Order`, and `Venue.SubmitOrder`, with a relaxed but stricter-where-it-matters `ensure` (T-09-01-01 mitigation: Noncompetitive skips `limit>0`, MAQ needs `minQty∈[1,quantity]`, Conditional needs `firmIf>0`).
- Kept every clearing-math body byte-unchanged (`demandAt`/`supplyAt`/`choosePStar`/`rationByPriority`/`computeClearing`) — the new fields are inert until wave 2. Full `daml test` green (14 scripts) including `test_clears_at_100` ($100.00 / A=10 / B=8 / C=2).
- Mirrored the model in `solver/src/auction.ts` (optional fields, no math change), decoded the new fields in `ledger.ts::readSealedOrders`, regenerated + committed `web/daml.js`, and wired both desk-plane SubmitOrder sites to submit a plain Limit. Solver suite 83/83 green, `tsc --noEmit` clean, `web` builds against the regenerated bindings.
- Authored `RULEBOOK.md` (AUCT-02 anchor): the max-matched → min-imbalance → lower-price objective, the load-bearing `topPrices` trap guard cited in BOTH planes, greedy rationing, the bp formula, the §4 worked example, the AON scaling caveat, and 09-02/09-03 placeholder sections.

## Task Commits

1. **Task 1: Additive Daml order model** - `924fd8d` (feat)
2. **Task 2: TS mirror + solver decode + regenerated web/daml.js + plain-Limit ticket** - `c2f41d7` (feat)
3. **Task 3: RULEBOOK.md skeleton** - `d8ca041` (docs)

**Plan metadata:** appended after this summary (docs: complete plan)

## Files Created/Modified

- `daml/Umbra/Clearing.daml` - `data OrderType` + three appended `OrderView` fields (math untouched)
- `daml/Umbra/Auction.daml` - `Order` fields + relaxed `ensure`; `Round.Clear` OrderView build threads the fields; `OrderType(..)` re-exported
- `daml/Umbra/Roles.daml` - `Venue.SubmitOrder` args + threaded `create Order`
- `daml/Umbra/Setup.daml`, `daml/Umbra/Tests.daml` - every §4 construction site set to `orderType = Limit; minQty = None; firmIf = None`; §4 assertion literals unchanged
- `solver/src/auction.ts` - `type OrderType` + optional `OrderView` fields (pure functions unchanged)
- `solver/src/ledger.ts` - `readSealedOrders` maps `orderType`(default 'Limit')/`minQty`/`firmIf` from the v2 wire (`Number()` on numeric strings, null→undefined)
- `web/src/components/OrderTicket.tsx`, `web/src/components/DeskColumn.tsx` - SubmitOrder payload carries `orderType: 'Limit', minQty: null, firmIf: null`
- `web/daml.js/**` - regenerated bindings; generated `Order`/`SubmitOrder` now include `orderType: OrderType`, `minQty: Optional<Int>`, `firmIf: Optional<Numeric>`
- `RULEBOOK.md` - new sovereign clearing rulebook skeleton

## Decisions Made

- **Effective-limit approach (RESEARCH A1):** `limit` stays `Decimal`, not `Optional`. Noncompetitive's "willing at any price" will be modelled as an effective ±∞ limit in 09-02, keeping the frozen field's blast radius minimal.
- **OrderType lives in the math leaf (`Clearing.daml`)** and is re-exported by `Umbra.Auction`, so both planes and every consumer share one symbol with no import cycle.
- **TS fields optional, Daml fields required:** the TS `OrderView` fields are optional so existing §4 test literals (which omit them) stay valid; Daml has no field defaults, so every construction site sets them explicitly.
- **Requirements left open:** AUCT-01/AUCT-02 are delivered across 09-02/09-03/09-06; this plan only lands the additive foundation, so neither is marked complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Second desk-plane SubmitOrder site (`DeskColumn.tsx`) missing the new required args**
- **Found during:** Task 2 (`cd web && npm run build`)
- **Issue:** The plan's edit list named `OrderTicket.tsx` but the frontend has a second `Venue.SubmitOrder` exercise in `web/src/components/DeskColumn.tsx`; after codegen made the args required, `tsc` failed there (Pitfall 5 — grep every construction site).
- **Fix:** Appended `orderType: 'Limit', minQty: null, firmIf: null` to the `DeskColumn.tsx` payload (identical plain-Limit default).
- **Files modified:** `web/src/components/DeskColumn.tsx`
- **Verification:** `cd web && npm run build` then passes (tsc + vite build green).
- **Committed in:** `c2f41d7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Necessary for the web build to compile against the regenerated required args. No scope creep — same plain-Limit default as the named site.

## Issues Encountered

- **gsd-tools commit helper swept unstaged planning changes into Task 2.** The Task 2 commit was invoked without `--files`, so the helper committed everything in the working tree — including the orchestrator's pre-existing (uncommitted) `.planning/STATE.md` + `.planning/config.json` Phase-09-start edits and a new `.planning/ui-reviews/.gitignore`. Content is correct and those files needed committing anyway; the only effect is that the planning-state edits landed in the Task 2 commit rather than the final metadata commit. Task 1 and Task 3 (both invoked WITH `--files`) were correctly scoped. Resolution: always pass `--files` to the helper.
- **Pre-existing orphan hash-named dirs under `web/daml.js`.** The 3.4 codegen emits named dependency dirs; the older hash-named dirs remain tracked but are not referenced by the umbra dependency chain (verified: no broken `file:` deps). Harmless leftover; not cleaned in this additive plan.

## §4 Canary State (continuous correctness reference)

- `daml test`: **14/14 scripts ok**, exit 0 — `test_clears_at_100: ok`, plus settlement/atomicity/privacy suites green.
- `solver` vitest: **83/83 green**, including `auction.test.ts` §4 fixture (clears 100.00, A=10/B=8/C=2) and the 99-vs-100 `topPrices` trap witness.
- `tsc --noEmit` (solver) clean; `cd web && npm run build` succeeds against regenerated bindings.
- `git diff` confirms clearing math bodies unchanged (pure-reduction invariant held).

## Next Phase Readiness

- The additive data model is in place for **09-02** (coreClear + two-pass `computeClearing` refactor + Noncompetitive) and **09-06** (order-type entry UI). New fields are inert; wave-2 math can now read them without touching the frozen construction contract.
- RULEBOOK.md placeholder sections are ready for 09-02/09-03 to fill in lockstep, each already cited to the exact symbol in both planes.

## Self-Check: PASSED

- Files verified on disk: `RULEBOOK.md`, `09-01-SUMMARY.md`, `daml/Umbra/Clearing.daml`, regenerated `web/daml.js/umbra-0.1.0/lib/Umbra/Clearing/module.d.ts`.
- Commits verified in git: `924fd8d` (Task 1), `c2f41d7` (Task 2), `d8ca041` (Task 3).

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
