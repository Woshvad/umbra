---
phase: 09-auction-depth-live-viz
plan: 04
subsystem: live-price-discovery
tags: [solver, api, privacy, aggregate-feed, small-n-guard, crossing-chart, viz, theatre]

# Dependency graph
requires:
  - phase: 09-auction-depth-live-viz
    plan: 01
    provides: "OrderView side/quantity/limit + readSealedOrders v2 decode the aggregate math reads"
  - phase: 04-solver-service
    provides: "api.ts §11 surface + AppDeps DI + pure §8 helpers (choosePStar/matchedAt/demandAt/supplyAt)"
  - phase: 06-frontend-viz
    provides: "CrossingChart hand-rolled SVG + lib/curve.ts (296,160) + TheatreView running/solved stages"
provides:
  - "GET /round/:id OPEN-window `indicative` block — SCALARS ONLY (indicativePrice | coarse+band, netImbalance, estMatched) with the ≥2-orders-per-side small-N guard; NO curve/candidatePrices during open"
  - "choosePStar threaded through AppDeps/MathPort/buildDeps (reused unchanged for the aggregate feed)"
  - "web IndicativeMeta type on RoundResponse (scalars only, no operator token, no port literal)"
  - "CrossingChart `mode` prop (assembling|locked) — assembling has no red p*; locked is byte-unchanged + a `p* LOCKED @ {price}` verdict"
  - "TheatreView aggregate indicative panel (INDICATIVE / NET IMBALANCE / EST. MATCHED, small-N labeled) + assembling chart during the open window"
affects: [09-06, "order-type entry UI (feeds more orders into the same aggregate feed)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aggregate-only privacy surface: the Operator sees the whole sealed batch but only aggregate SCALARS cross the wire during open — never an order, never a candidate-price curve (Pitfall 1)"
    - "Small-N guard as a first-class, labeled state: exact indicative price withheld unless ≥2 orders on BOTH sides; else a wide-bucket coarse band + coarse:true (UI labels why)"
    - "Prop-driven chart mode (assembling|locked) defaulting to the shipped locked state — zero blast radius on existing call sites; curve.ts reused unchanged"

key-files:
  created: []
  modified:
    - "solver/src/api.ts — buildIndicative helper + OPEN-window indicative attach on GET /round/:id; choosePStar added to AppDeps; buildCurve stays terminal-only"
    - "solver/src/api.test.ts — +3 cases: indicative/no-curve-leak, small-N coarse band, open-body secret sweep; choosePStar wired into makeDeps"
    - "solver/src/index.ts — choosePStar threaded through MathPort + both buildDeps wiring sites"
    - "solver/src/index.test.ts — MathPort literal + import updated for choosePStar"
    - "web/src/solver.ts — IndicativeMeta type + optional `indicative?` on RoundResponse"
    - "web/src/components/CrossingChart.tsx — assembling|locked mode prop; red crossing group + verdict gated on locked"
    - "web/src/views/TheatreView.tsx — indicative aggregate panel + assembling chart during open + mode=locked at close"

key-decisions:
  - "Small-N guard = ≥2 orders on BOTH sides (not just the crossing side): a singleton on either side would let the published price BE that order's limit. §4's single buyer therefore renders COARSE during open — the honest, documented limitation (T-09-04-04)."
  - "Coarse band = round(p*/5)*5 (nearest 5) — a wide bucket that cannot back out a single limit; emitted with coarse:true so the UI shows COARSE — PRIVACY GUARD (< 2 ORDERS ON A SIDE)."
  - "Reused choosePStar (added to AppDeps/MathPort) rather than deriving from computeClearing().clearingPrice — matches the plan's key_links exactly; small additive wiring, no math change."
  - "The assembling CrossingChart is fed curve=[] during open: per the #1 privacy invariant NO per-order/candidate-price curve crosses the wire during the window, so the chart renders the framed/faint state (no red p*); the full crossing locks in from solve-preview at close. Synthesizing a fake depth curve was rejected as misleading."
  - "CrossingChart mode defaults to 'locked' so the shipped solved-state SVG (red p* rule + circle r5 at (296,160) + 15px label) stays byte-identical; the locked verdict row is additive and uses the existing red token (#E2231A) — no new keyframe, no new token."

patterns-established:
  - "OPEN-window responses carry ONLY aggregate scalars; the terminal-status branch (curve/allocations/rationale) is mutually exclusive with the indicative block"
  - "Secret-sweep tests extended to every new response body (the open-window indicative body now asserts absence of the operator token + ANTHROPIC_API_KEY)"

requirements-completed: [AUCT-03, VIZ-01]  # feed + viz shipped & unit-proven; live "updates as orders arrive" deferred to end-of-phase human-check

# Metrics
duration: ~14min
completed: 2026-07-09
---

# Phase 9 Plan 04: Aggregate Indicative Feed + Assembling↔Locked Crossing Summary

**Shipped the privacy-safe live price-discovery surface — the solver publishes AGGREGATE scalars only during the open window (indicative clearing price, net imbalance, est. matched), ≥2-orders-per-side small-N guarded with a labeled coarse band, and NO candidate-price curve; the hand-rolled CrossingChart gained an assembling→locked distinction (no red p* while the window is open; the shipped red p* @ (296,160) locks byte-unchanged at close), all off the settlement path.**

## Performance

- **Duration:** ~14 min
- **Completed:** 2026-07-09
- **Tasks:** 2
- **Files modified:** 7 (5 solver + 2 web; incl. 2 blocking-fix wiring files)

## Accomplishments

- **AUCT-03 aggregate indicative feed (solver, scalars-only, small-N guarded).** `api.ts` GET /round/:id now attaches an `indicative` block **only** when the round is `Open` with ≥1 sealed order: `indicativePrice = choosePStar(views)`, `netImbalance = Σbuy qty − Σsell qty`, `estMatched = matchedAt(views, p*)`. The small-N guard withholds the exact price unless there are ≥2 orders on **both** sides — otherwise it emits `{ coarse: true, band }` (band = nearest-5 bucket) so no single order's limit can be backed out. `buildCurve` stays terminal-status-only — **no `curve`/`candidatePrices` ever cross the wire during open** (Pitfall 1). `choosePStar` was threaded through `AppDeps`/`MathPort`/`buildDeps`.
- **Privacy tests (api.test.ts, +3).** (a) an OPEN round with a 2×2 crossing book returns `indicative` with the exact price 100, `netImbalance` 0, `estMatched` 10, and asserts NO `curve`/`candidatePrices`/`allocations` keys and that no desk identity appears in the body; (b) the §4 single-buyer book yields `coarse:true` + a numeric band, never an exact price; (c) the open-window body is swept for the operator token + `ANTHROPIC_API_KEY` (both absent). Solver suite **87/87** green, `tsc --noEmit` clean.
- **VIZ-01 CrossingChart assembling↔locked.** Added a `mode` prop (`assembling|locked`, default `locked`). Assembling: no red p* rule/dropline/marker/label, faint matched region, caption `ASSEMBLING — CURVE BUILDS AS ORDERS SEAL`. Locked: the shipped solved-state SVG is byte-unchanged (red p* + `circle r5` at (296,160) + 15px mono label) plus a red-square `p* LOCKED @ {price}` verdict. `lib/curve.ts` untouched — `curve.test.ts` (§4 marker 296,160) still green.
- **TheatreView indicative panel + assembling chart.** A compact aggregate panel (1px paper-at-.28 border — the shipped inverted axis-stroke grammar) in the running-stage right column, below the sealed-order count and above the CTAs: three scalar rows (INDICATIVE mono 40 / small-N coarse-band state; NET IMBALANCE signed, buy-blue / sell-pink / paper with a BUY-HEAVY·SELL-HEAVY·BALANCED caption; EST. MATCHED mono 18) + the `AGGREGATE — NO ORDER LEAVES THE SOLVER` note. The assembling chart renders during the open window; `mode="locked"` at close. web build (tsc + vite) + **30/30** vitest green.

## Task Commits

1. **Task 1: AUCT-03 aggregate indicative feed + privacy tests** — `fe13ab5` (feat)
2. **Task 2: VIZ-01 CrossingChart assembling↔locked + Theatre indicative panel** — `d174aaf` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `solver/src/api.ts` — `buildIndicative` (scalars only, small-N guard, nearest-5 band) + OPEN-window attach on GET /round/:id; `choosePStar` added to `AppDeps`; `buildCurve` unchanged (terminal-only)
- `solver/src/api.test.ts` — +3 privacy cases + `choosePStar` in `makeDeps`
- `solver/src/index.ts` — `choosePStar` on `MathPort` + both `buildDeps` wiring sites
- `solver/src/index.test.ts` — `MathPort` literal + import updated (blocking-fix)
- `web/src/solver.ts` — `IndicativeMeta` type + optional `indicative?` on `RoundResponse`
- `web/src/components/CrossingChart.tsx` — `mode` prop; red crossing group + verdict gated on `locked`; faint matched region + `ASSEMBLING` caption in `assembling`
- `web/src/views/TheatreView.tsx` — `IndicativePanel` + assembling chart during open + `mode="locked"` at close; captures `indicative` from the getRound feed

## Decisions Made

- **Small-N guard = ≥2 orders on BOTH sides.** A singleton on either side would make the published indicative price equal to that order's limit. §4 (single buyer) is therefore COARSE during open — the honest, documented residual (T-09-04-04); cryptographic sealing is Phase 10.
- **Coarse band = round(p*/5)*5** — a wide bucket + `coarse:true`, labeled `COARSE — PRIVACY GUARD (< 2 ORDERS ON A SIDE)`.
- **Reused `choosePStar`** (added to the DI surface) rather than deriving from `computeClearing().clearingPrice` — matches the plan's key_links; no math change.
- **Assembling chart fed `curve=[]`** during open: no per-order/candidate-price geometry crosses the wire by privacy design, so the chart shows the framed/faint state (no red p*) and the full crossing locks in at close. A synthesized depth curve was rejected as misleading.
- **`mode` defaults to `locked`** — the shipped solved-state SVG stays byte-identical; the verdict is additive on the existing red token.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `choosePStar` wiring required in `index.ts` + `index.test.ts` (beyond the plan's named `<files>`)**
- **Found during:** Task 1 (`cd solver && npx tsc --noEmit`)
- **Issue:** The plan's key_links call for `indicativePrice = choosePStar(views)`, but `choosePStar` was not on `AppDeps`/`MathPort`. Adding it to `AppDeps` required threading it through `index.ts` (`MathPort` interface + both `buildDeps` wiring sites) and the `index.test.ts` `MathPort` literal, or `tsc` fails.
- **Fix:** Added `choosePStar: AppDeps['choosePStar']` to `MathPort` and wired `math.choosePStar` / `auction.choosePStar` at both sites; updated the test's import + `math` literal.
- **Files modified:** `solver/src/index.ts`, `solver/src/index.test.ts`
- **Verification:** `npx tsc --noEmit` clean; solver 87/87; index.test.ts 2/2 green.
- **Committed in:** `fe13ab5` (Task 1 commit)

**2. [Rule 1 - Bug] JSX comment terminated early by `p*/q` (contained `*/`)**
- **Found during:** Task 2 (`cd web && npm run build`)
- **Issue:** A `{/* ... price/p*/q annotations ... */}` comment in `CrossingChart.tsx` contained the substring `*/`, closing the comment early → `TS1005 '}' expected`.
- **Fix:** Reworded the comment to remove the literal `*/`.
- **Files modified:** `web/src/components/CrossingChart.tsx`
- **Verification:** `npm run build` (tsc + vite) succeeds.
- **Committed in:** `d174aaf` (Task 2 commit)

**Total deviations:** 2 auto-fixed (2 blocking). No scope creep — both were required for the plan's own compile/wiring.

## §4 Canary State (continuous correctness reference)

- Clearing math untouched (`Clearing.daml` / `auction.ts` unchanged) — the §4 daml canary is unaffected by this plan.
- Solver `vitest`: **87/87** green (incl. the 3 new indicative/small-N/secret-sweep cases); `tsc --noEmit` clean.
- web `vitest`: **30/30** green (incl. `curve.test.ts` — the §4 crossing still maps to (296,160)); `npm run build` (tsc + vite) succeeds.
- `git diff` confirms `web/src/lib/curve.ts` is byte-unchanged and the locked CrossingChart SVG marker/rule/label are byte-identical to the shipped solved state.

## Deferred to end-of-phase human verification

Per `config.workflow.human_verify_mode: end-of-phase` and the §3 constraint (the live aggregate feed against a REAL open round needs the running Canton stack, which is OUT OF SCOPE here):

- **Live indicative feed against a real open round:** boot the stack, submit ≥2 orders per side, and confirm the Theatre panel renders only scalars (never an order), the exact indicative price appears once both sides have ≥2 orders, and the coarse band + guard caption show below that threshold.
- **Assembling→locked live behavior:** confirm the curve visibly assembles as orders seal and the red p* locks at close @ 100.00 on the §4 fixture.

These are proven at the unit level here (api.test.ts + curve.test.ts + web build); only the live-stack refresh loop is deferred. No live result is fabricated.

## Known Stubs

None introduced. The assembling chart's `curve=[]` during the open window is **not** a stub — it is the correct privacy-safe behavior (no per-order/candidate-price curve may cross the wire during open); the full curve arrives from solve-preview at close.

## Self-Check: PASSED

- Files verified on disk: `solver/src/api.ts`, `solver/src/api.test.ts`, `web/src/solver.ts`, `web/src/components/CrossingChart.tsx`, `web/src/views/TheatreView.tsx`, `.planning/phases/09-auction-depth-live-viz/09-04-SUMMARY.md`.
- Commits verified in git: `fe13ab5` (Task 1), `d174aaf` (Task 2).
- Gates: solver 87/87 + tsc clean; web 30/30 + build; curve.test.ts §4 marker green; no `curve`/`candidatePrices` in the open-window body (asserted).

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
