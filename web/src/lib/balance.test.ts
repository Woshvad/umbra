// web/src/lib/balance.test.ts — asserts BOTH the raw lerp primitive AND the full
// allocations→balances derivation on the canonical §4 fixture (the binding finals
// A:10/4000 · B:12/1800 · C:13/1200), not just the lerp endpoints.
import { describe, it, expect } from 'vitest'
import { lerp, deskBalancesFromAllocations, type DeskBalances } from './balance'
import type { Allocation } from '../solver'

// §4 allocations at clearing price 100.00 (auction.ts computeClearing output):
//   BLUEROCK Buy +10 · MERIDIAN Sell −8 · HALWARD Sell −2 (of 5).
const SECTION4_ALLOCATIONS: Allocation[] = [
  { desk: 'BLUEROCK', side: 'Buy', filledQty: 10 },
  { desk: 'MERIDIAN', side: 'Sell', filledQty: 8 },
  { desk: 'HALWARD', side: 'Sell', filledQty: 2 },
]
const CLEARING = 100

// Before balances chosen so the §4 deltas land on the binding finals:
//   A buys 10 (−1000 cash): 0/5000 → 10/4000
//   B sells 8 (+800 cash):  20/1000 → 12/1800
//   C sells 2 (+200 cash):  15/1000 → 13/1200
const BEFORE: DeskBalances = {
  BLUEROCK: { bondx: 0, usdcx: 5000 },
  MERIDIAN: { bondx: 20, usdcx: 1000 },
  HALWARD: { bondx: 15, usdcx: 1000 },
}

describe('balance — lerp primitive', () => {
  it('lerp endpoints: lerp(x,y,0)===x and lerp(x,y,1)===y', () => {
    expect(lerp(0, 4000, 0)).toBe(0)
    expect(lerp(0, 4000, 1)).toBe(4000)
    expect(lerp(20, 12, 0)).toBe(20)
    expect(lerp(20, 12, 1)).toBe(12)
  })

  it('lerp interpolates the midpoint', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
  })
})

describe('balance — deskBalancesFromAllocations → §4 finals', () => {
  it('derives the binding §4 finals A:10/4000 · B:12/1800 · C:13/1200', () => {
    const after = deskBalancesFromAllocations(SECTION4_ALLOCATIONS, CLEARING, BEFORE)
    expect(after.BLUEROCK).toEqual({ bondx: 10, usdcx: 4000 })
    expect(after.MERIDIAN).toEqual({ bondx: 12, usdcx: 1800 })
    expect(after.HALWARD).toEqual({ bondx: 13, usdcx: 1200 })
  })

  it('does not mutate the before balances', () => {
    deskBalancesFromAllocations(SECTION4_ALLOCATIONS, CLEARING, BEFORE)
    expect(BEFORE.BLUEROCK).toEqual({ bondx: 0, usdcx: 5000 })
  })
})
