---
phase: 06-auction-theatre-settlement-animation
plan: 03
subsystem: web-frontend
tags: [ui, theatre, countdown-ring, crossing-chart, price-reveal, operator-plane, money-shot]
requires:
  - web/src/solver.ts (closeRound/getRound/solvePreview/SolverError — Plan 01)
  - web/src/lib/curve.ts (sx/sy/crossingPoint mapping — Plan 01)
  - web/src/operatorState.ts (OperatorViewState/TheatrePhase — Plan 01)
  - web/tailwind.config.ts (animate-umbra-slam/-draw/-pulse + 56/84/120/34 fontSize — Plan 01)
provides:
  - web/src/views/TheatreView.tsx (03 running + solved states; close->solve-preview)
  - web/src/components/CountdownRing.tsx (280x280 SVG ring)
  - web/src/components/CrossingChart.tsx (hand-rolled supply/demand SVG — reused by Plan 04 AgentView)
  - web/src/components/PriceReveal.tsx (lime 100.00 hero slab)
affects:
  - 06-04 (AgentView reuses CrossingChart)
tech-stack:
  added: []
  patterns: [hand-rolled-svg, setInterval-clock, css-keyframe-reveal, operator-plane-fetch]
key-files:
  created:
    - web/src/components/CountdownRing.tsx
    - web/src/components/CrossingChart.tsx
    - web/src/components/PriceReveal.tsx
  modified:
    - web/src/views/TheatreView.tsx
decisions:
  - "Static binding §4 polylines (supply 48,260… / demand 48,110…) NOT hard-coded — step paths derived from live solve-preview curve via lib/curve sx/sy so the chart stays data-driven; the §4 fixture still lands on the binding marker (296,160), proven by the Plan-01 curve.test.ts."
  - "p* rule/dropline/marker positioned by crossingPoint(curve, clearingPrice, matchedVolume) (returns (296,160) for §4), not literal coords — keeps the marker correct if the round drifts off the canonical fixture."
  - "CountdownRing is pure presentation of `seconds`; the clock (setInterval + auto-fire) lives in TheatreView so the timer lifecycle (cleanup on unmount, auto-close at 0) is owned where the round state is."
metrics:
  duration: ~5 min
  completed: 2026-06-26
---

# Phase 6 Plan 03: Auction Theatre Summary

The reveal half of the money shot — a 60s SVG countdown ring + live sealedOrderCount drive a Close & Solve that closes the round and reads solve-preview, slamming the lime $100.00 hero onto the dark stage beside a hand-rolled supply/demand crossing chart marking p*=100/q=10, all on the operator plane (:4000) with zero operator token in the browser.

## What Was Built

**Task 1 — CountdownRing + Theatre running state** (commit b2cee36)
- `CountdownRing.tsx`: hand-rolled 280×280 SVG (no chart lib), `viewBox 0 0 280 280` rotated -90deg. Faint track circle r=120 + progress circle with `CIRC=753.98` (2π·120) and `strokeDashoffset = 753.98*(1 - seconds/60)`. Ring + 84px mono numeral go red (#E2231A) at seconds ≤ 10; CSS `transition: stroke-dashoffset 1s linear, stroke .3s ease`. Zero-padded 2-digit numeral + "Seconds to close" caption.
- `TheatreView.tsx` (overwrote the Plan-01 stub): the PrivacyView `<main>` frame (`padding 30px 48px 48px`) → section marker "03 · Auction Theatre" + ink rule → the dark inverted stage (`#0A0A0A`/`#F4F1EA`, `padding 48px 56px 56px`, `min-height 560px`). Running state = flex row gap 72px: the ring + a right column ("WINDOW READY"/"WINDOW OPEN — ORDERS LOCKED & HIDDEN" caption, "ONE PRICE. / NO LEAKS." 56px headline, live `sealedOrderCount` 44px mono, and the CTA — START 60s WINDOW paper/ink when open, CLOSE & SOLVE red/paper when running).
- Clock + actions: `startWindow()` sets phase running + a 1s setInterval 60→0; at 0 it clears the interval and auto-fires `closeAndSolve()`. `closeAndSolve()` sets phase solving, `await closeRound(roundId)` then `await solvePreview(roundId)` → setPreview + phase cleared; `SolverError.code==='OFFLINE'` → setOffline(true). `sealedOrderCount` fetched via `getRound(roundId)`. Interval cleaned up on unmount (`useEffect(() => () => clearInterval(ref.current), [])`). Offline → "SOLVER OFFLINE — START THE SERVICE ON :4000" caption (no crash).

**Task 2 — CrossingChart (UI-05) + PriceReveal + solved state** (commit 25d8819)
- `CrossingChart.tsx`: hand-rolled `viewBox 0 0 480 360` (no chart lib). Axes (x=48, y=320, stroke #F4F1EA opacity .5), matched-region rect (x48 y160 w248 h160 fill #D6FB3C .16), step supply polyline (`animate-umbra-draw`, strokeDasharray 640) + dashed step demand polyline — both derived from the live `curve` points via `lib/curve` sx/sy. Red p* rule + dropline + `circle r=5 #E2231A` positioned by `crossingPoint(curve, clearingPrice, matchedVolume)` (→ (296,160) for §4). "100.00"/"q=10"/"p*" annotations + QTY/PRICE axis caps + the "▮ MATCHED 10 @ 100.00" lime-swatch legend + "SUPPLY × DEMAND" label.
- `PriceReveal.tsx`: "CLEARS AT" 30px label → the lime hero slab (`display:inline-block; background:#D6FB3C; color:#0A0A0A; padding:10px 26px 14px`) with `animate-umbra-slam`, the 120px mono `clearingPrice.toFixed(2)` ("100.00"), and the red skewX(-12deg) sliver. Two sub-stats (Matched Volume / Uniform Price "1 for all", 34px mono) + VIEW SETTLEMENT → CTA.
- `TheatreView` solved state: 2-col grid `minmax(0,520px) 1fr; gap:56px`. Phase solving → inline flame 12×12 `animate-umbra-pulse` square + "SOLVER-AGENT-00 COMPUTING…" (18px mono). Phase cleared (preview present) → CrossingChart (left) + PriceReveal (right). Robust to a keyless solver (clearingPrice always 100.00 from the deterministic core).

## Verification

- `cd web && npm run build` → green (tsc --noEmit + vite build, 99 modules).
- `npx vitest run src/lib/curve.test.ts` → 3 green (§4 crossing maps to (296,160)); full web suite 11/11 green.
- Acceptance greps: `753.98` in CountdownRing; `closeRound`/`solvePreview` in TheatreView (close→solve-preview, NOT GET); OFFLINE caption present; `clearInterval` on unmount; `viewBox="0 0 480 360"` + (296,160) marker via crossingPoint; `animate-umbra-draw` (chart) / `animate-umbra-pulse` (TheatreView) / `animate-umbra-slam` + `text-120` + `#D6FB3C` (PriceReveal) all consumed; no chart lib (recharts/d3/chart.js absent); no operator token / `@daml/react` context / `useLedger` / `DamlLedger` in any of the 4 Plan-03 files (grep-clean — T-06-01 mitigated).

## Deviations from Plan

None — plan executed as written. The plan permitted deriving the step paths from the live curve vs. hard-coding the binding §4 polylines (RESEARCH Pattern 6 + the curve.test mapping); the data-driven derivation was chosen so the chart reflects the actual solve-preview response while still reproducing the binding (296,160) crossing for §4.

## Threat Model Compliance

- T-06-01 (op-token disclosure): mitigated — grep confirms no operator token / operator `@daml/react` context in TheatreView/CountdownRing/CrossingChart/PriceReveal; all operator actions route through `web/src/solver.ts` → :4000.
- T-06-03 (graceful DoS): mitigated — a :4000 reject → `SolverError 'OFFLINE'` → caption; no crash; Privacy still renders.
- T-06-06 (price tampering): the reveal displays the solver's returned `clearingPrice`; the curve.test asserts the §4 chart maps to the binding crossing (catches UI drift); on-ledger `Round.Clear` remains the source of truth.

## Self-Check: PASSED

- web/src/components/CountdownRing.tsx — FOUND
- web/src/components/CrossingChart.tsx — FOUND
- web/src/components/PriceReveal.tsx — FOUND
- web/src/views/TheatreView.tsx — FOUND (modified)
- Commit b2cee36 — FOUND
- Commit 25d8819 — FOUND
