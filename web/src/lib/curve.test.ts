// web/src/lib/curve.test.ts — the §4-value visual assertion for the crossing chart.
// The §4 fixture's clearing crossing (p*=100, q=10) MUST land on the binding marker
// (296,160) and all mapped coords MUST stay inside the binding axis frame.
import { describe, it, expect } from 'vitest'
import { sx, sy, crossingPoint, AXIS_X, AXIS_Y, CROSSING_MARKER } from './curve'
import type { CurvePoint } from '../solver'

// §4 curve: candidatePrices [99,100,101]; demand 10 throughout; supply 8/13/13.
const SECTION4_CURVE: CurvePoint[] = [
  { price: 99, demand: 10, supply: 8 },
  { price: 100, demand: 10, supply: 13 },
  { price: 101, demand: 10, supply: 13 },
]

describe('curve — §4 crossing-chart mapping', () => {
  it('maps the §4 crossing (p*=100, q=10) to the binding marker (296,160) within ±1px', () => {
    const { x, y } = crossingPoint(SECTION4_CURVE, 100, 10)
    expect(Math.abs(x - CROSSING_MARKER.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(y - CROSSING_MARKER.y)).toBeLessThanOrEqual(1)
    expect(x).toBe(296)
    expect(y).toBe(160)
  })

  it('keeps mapped coords inside the binding axis frame x∈[48,460], y∈[20,320]', () => {
    for (const c of SECTION4_CURVE) {
      const x = sx(c.demand)
      const y = sy(c.price)
      expect(x).toBeGreaterThanOrEqual(AXIS_X.min)
      expect(x).toBeLessThanOrEqual(AXIS_X.max)
      expect(y).toBeGreaterThanOrEqual(AXIS_Y.min)
      expect(y).toBeLessThanOrEqual(AXIS_Y.max)
    }
  })

  it('inverts price (higher price → lower y)', () => {
    expect(sy(101)).toBeLessThan(sy(99))
  })
})
