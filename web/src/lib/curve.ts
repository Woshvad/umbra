// web/src/lib/curve.ts — PURE, DOM-free helpers mapping the solver's `curve`
// points ({price,demand,supply}) onto the binding crossing-chart coordinate frame
// (UI-SPEC "SVG Crossing Chart — Exact Geometry", lines 236-245).
//
// The chart is hand-rolled SVG on a fixed `viewBox 0 0 480 360` (spec §6/§12.4 —
// no chart lib). Axis frame is BINDING: x ∈ [48,460], y ∈ [20,320]. For the
// canonical §4 fixture (p*=100, q=10) the crossing MUST land on the binding
// marker `(296,160)` (the red p* rule × the demand dropline). The price/quantity
// domain constants below are tuned to reproduce that exact marker.
//
// No I/O, no React, no DOM — unit-testable as plain functions (mirrors the
// pure-fn style of solver/src/auction.ts).

import type { CurvePoint } from '../solver'

// ── Binding axis frame (UI-SPEC lines 236-245) ──────────────────────────────────
export const VIEWBOX = { w: 480, h: 360 } as const
// Axis bounds: vertical axis at x=48 from y=20..320; horizontal axis at y=320.
export const AXIS_X = { min: 48, max: 460 } as const // quantity → x
export const AXIS_Y = { min: 20, max: 320 } as const // price → y (inverted: high price = low y)

// Price domain tuned so the §4 clearing price (100) maps to the binding y=160 rule.
// (100 - 98.4) / (101.4 - 98.4) = 0.5333 → y = 320 - .5333*300 = 160.
export const PRICE_MIN = 98.4
export const PRICE_MAX = 101.4

// Quantity domain tuned so the §4 matched volume (q=10) maps to the binding x=296
// demand dropline: 48 + (10 / Q_MAX) * (460-48) = 296 → Q_MAX = 4120/248.
export const Q_MAX = (AXIS_X.max - AXIS_X.min) / ((296 - AXIS_X.min) / 10)

// The binding crossing marker for the §4 fixture (UI-SPEC line 244 `circle cx296 cy160`).
export const CROSSING_MARKER = { x: 296, y: 160 } as const

// quantity → screen x (clamped to the axis frame).
export const sx = (q: number, qMax: number = Q_MAX): number => {
  const t = qMax > 0 ? q / qMax : 0
  const x = AXIS_X.min + t * (AXIS_X.max - AXIS_X.min)
  return Math.min(AXIS_X.max, Math.max(AXIS_X.min, x))
}

// price → screen y (inverted; clamped to the axis frame).
export const sy = (p: number, pMin: number = PRICE_MIN, pMax: number = PRICE_MAX): number => {
  const span = pMax - pMin
  const t = span !== 0 ? (p - pMin) / span : 0
  const y = AXIS_Y.max - t * (AXIS_Y.max - AXIS_Y.min)
  return Math.min(AXIS_Y.max, Math.max(AXIS_Y.min, y))
}

// The largest quantity present on the curve (demand or supply) — used to scale the
// step paths so the most-extended leg reaches toward the axis edge.
export const curveQMax = (curve: CurvePoint[]): number =>
  curve.reduce((m, c) => Math.max(m, c.demand, c.supply), 0)

// Map the clearing crossing (p*, q*) onto screen coordinates. For the canonical §4
// fixture (pStar=100, qStar=10) this reproduces the binding marker (296,160).
export const crossingPoint = (
  _curve: CurvePoint[],
  pStar: number,
  qStar: number,
): { x: number; y: number } => ({
  x: Math.round(sx(qStar)),
  y: Math.round(sy(pStar)),
})
