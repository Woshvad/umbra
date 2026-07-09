// web/src/lib/leakage.test.ts — proves the WOW-06 cost-of-leakage model is a pure,
// deterministic function over the settled receipt numbers (mirrors the vitest style
// of balance.test.ts / curve.test.ts). The §4-shaped fixture MUST leak $X > 0 on the
// simulated public book while Umbra's sealed clear leaks $0, with saved === lost.
import { describe, it, expect } from 'vitest'
import {
  estimateLeakage,
  SLIPPAGE_BP_PER_UNIT,
  FRONT_RUN_BP,
  type LeakageLeg,
} from './leakage'

// §4-shaped settled legs at the canonical uniform clear (100.00): BLUEROCK Buy 10,
// MERIDIAN Sell 8, HALWARD Sell 2 (matched volume 10 = Σbuy = Σsell).
const SECTION4_LEGS: LeakageLeg[] = [
  { side: 'Buy', filledQty: 10, ownLimit: 101, clearingPrice: 100 },
  { side: 'Sell', filledQty: 8, ownLimit: 99, clearingPrice: 100 },
  { side: 'Sell', filledQty: 2, ownLimit: 100, clearingPrice: 100 },
]

// Closed form for the sweep of `n` units at uniform clear `p`:
//   Σ_{i=0}^{n-1} p·(SLIPPAGE_BP_PER_UNIT·i + FRONT_RUN_BP)/1e4
// For §4 (n=10, p=100): 0.01·(8·45 + 15·10) = 0.01·510 = 5.10.
const EXPECTED_SECTION4_LOST = 5.1

describe('leakage — WOW-06 cost-of-leakage model', () => {
  it('leaks $X>0 on the simulated public book while Umbra leaks $0 (saved === lost)', () => {
    const r = estimateLeakage(SECTION4_LEGS)
    expect(r.publicBookLost).toBeGreaterThan(0)
    expect(r.umbraLeaked).toBe(0)
    expect(r.saved).toBe(r.publicBookLost)
  })

  it('computes the exact §4 public-book loss ($5.10 at the $100 uniform clear)', () => {
    const r = estimateLeakage(SECTION4_LEGS)
    expect(r.publicBookLost).toBe(EXPECTED_SECTION4_LOST)
    expect(r.saved).toBe(EXPECTED_SECTION4_LOST)
  })

  it('is deterministic — identical input yields identical output', () => {
    expect(estimateLeakage(SECTION4_LEGS)).toEqual(estimateLeakage(SECTION4_LEGS))
  })

  it('sweeps the BUY side (matched volume), independent of the sell-leg split', () => {
    // Same buy total (10) but a different sell split → identical loss (the sweep is
    // the buy-side matched volume, not the number of sell legs).
    const oneSeller: LeakageLeg[] = [
      { side: 'Buy', filledQty: 10, ownLimit: 101, clearingPrice: 100 },
      { side: 'Sell', filledQty: 10, ownLimit: 99, clearingPrice: 100 },
    ]
    expect(estimateLeakage(oneSeller).publicBookLost).toBe(EXPECTED_SECTION4_LOST)
  })

  it('0-safe on an empty book — no orders leak nothing', () => {
    expect(estimateLeakage([])).toEqual({ publicBookLost: 0, umbraLeaked: 0, saved: 0 })
  })

  it('0-safe on a single-unit order (front-run markup only, no accumulated slippage)', () => {
    const single: LeakageLeg[] = [{ side: 'Buy', filledQty: 1, ownLimit: 101, clearingPrice: 100 }]
    // i=0 → premium = 100·FRONT_RUN_BP/1e4 = 0.15; no depth slippage yet.
    const expected = Math.round((100 * FRONT_RUN_BP) / 10000 / 0.01) * 0.01
    const r = estimateLeakage(single)
    expect(r.publicBookLost).toBe(expected)
    expect(r.publicBookLost).toBeGreaterThan(0)
    expect(r.umbraLeaked).toBe(0)
  })

  it('exposes the illustrative coefficients as positive named constants', () => {
    expect(SLIPPAGE_BP_PER_UNIT).toBeGreaterThan(0)
    expect(FRONT_RUN_BP).toBeGreaterThan(0)
  })
})
