// solver/src/auction.test.ts — the executable contract for the §8 clearing port.
//
// These five scenarios are the TypeScript twin of the Daml `test_clears_at_100`
// canary (daml/Umbra/Tests.daml) plus the four other mandated cases (SOLV-05).
// They are authored BEFORE solver/src/auction.ts exists and are EXPECTED to fail
// at the RED step (the module is absent) — that is the TDD pre-implementation
// state. Task 3 makes them green by porting Clearing.daml 1:1.
//
// Allocation comparison mirrors the Daml multiset equality (Auction.daml lines
// 183-185): both sides are sorted by the key (desk, side, filledQty) before
// toEqual, so allocation ORDER never matters — only the set.
import { describe, it, expect } from 'vitest'
import {
  computeClearing,
  choosePStar,
  matchedAt,
  type Allocation,
  type OrderView,
} from './auction'

// Order-independent multiset sort key, identical to the Daml (desk, side, filledQty).
const byKey = (a: Allocation, b: Allocation) =>
  a.desk.localeCompare(b.desk) || a.side.localeCompare(b.side) || a.filledQty - b.filledQty

const sortAllocs = (xs: Allocation[]) => [...xs].sort(byKey)

// Sum the filledQty across every allocation belonging to one desk.
const fillOf = (allocs: Allocation[], desk: string) =>
  allocs.filter((a) => a.desk === desk).reduce((s, a) => s + a.filledQty, 0)

describe('computeClearing — §8 clearing port', () => {
  // 1. THE canary — the §4 fixture, mirrored EXACTLY from daml/Umbra/Tests.daml
  //    test_clears_at_100: A Buy 10 @101, B Sell 8 @99, C Sell 5 @100.
  it('section-4 fixture clears at 100.00 with fills A=10 / B=8 / C=2 (C residual 3)', () => {
    const views: OrderView[] = [
      { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
      { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
      { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
    ]
    const { clearingPrice, allocations } = computeClearing(views)

    // Price clears at exactly 100.00 — NOT 99 (the tie-break trap).
    expect(clearingPrice).toBe(100)

    // Fills A=10, B=8, C=2.
    expect(fillOf(allocations, 'BankA')).toBe(10)
    expect(fillOf(allocations, 'BankB')).toBe(8)
    expect(fillOf(allocations, 'BankC')).toBe(2)

    // C's residual = order qty (5) − fill (2) == 3 (consumer computes this).
    expect(5 - fillOf(allocations, 'BankC')).toBe(3)

    // Full set equality (order-independent multiset).
    expect(sortAllocs(allocations)).toEqual(
      sortAllocs([
        { desk: 'BankA', side: 'Buy', filledQty: 10 },
        { desk: 'BankB', side: 'Sell', filledQty: 8 },
        { desk: 'BankC', side: 'Sell', filledQty: 2 },
      ]),
    )
  })

  // 5. The 99-vs-100 tie-break regression guard (MANDATORY). Max matched volume
  //    is achieved at BOTH 99 and 100, but at 99 the imbalance is SMALLER —
  //    so a buggy global-imbalance tie-break (no topPrices filter) would wrongly
  //    pick 99. The correct §8 form restricts (a) to the max-matched subset and
  //    then takes the lower price ONLY within it. The §4 fixture is itself this
  //    trap; this is a second, isolated witness.
  //
  //    Fixture: Buy 10 @100, Sell 10 @99.
  //      p=99 : demand=10 (100>=99), supply=10 (99<=99) → matched 10, |10-10|=0
  //      p=100: demand=10 (100>=100), supply=10 (99<=100)→ matched 10, |10-10|=0
  //    Both equal matched (10) and equal imbalance (0); tie-break (b) lower price
  //    selects 99 here (legitimately). To force a 99-vs-100 SPLIT we need
  //    distinct imbalances at equal max-matched. Use:
  //      Buy 10 @100, Buy 2 @99, Sell 10 @99.
  //      p=99 : demand = 10+2 = 12, supply = 10 → matched 10, |12-10| = 2
  //      p=100: demand = 10,        supply = 10 → matched 10, |10-10| = 0
  //    Max matched = 10 at BOTH prices. A global-imbalance bug would still pick
  //    the min-imbalance price = 100 here, which is correct — not a discriminating
  //    trap. The discriminating trap (where the bug picks the LOWER price) is the
  //    §4 shape, so reproduce it directly:
  //      Buy 10 @101, Sell 8 @99, Sell 5 @100  (the §4 fixture).
  //      max matched = 10 at p∈{100,101}; over ALL prices 99 has imbalance 2 < 3,
  //      so the buggy form clears at 99. The correct form clears at 100.
  it('lower-price tie-break: §4-shaped trap clears at 100, not 99 (topPrices filter)', () => {
    const views: OrderView[] = [
      { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
      { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
      { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
    ]
    // Sanity: 99 is NOT a max-matched price (matched(99)=8 < matched(100)=10),
    // so the only way 99 wins is by escaping the topPrices filter.
    expect(matchedAt(views, 99)).toBe(8)
    expect(matchedAt(views, 100)).toBe(10)
    expect(matchedAt(views, 101)).toBe(10)
    expect(choosePStar(views)).toBe(100)
    expect(computeClearing(views).clearingPrice).toBe(100)
    // Loud regression marker: dropping the max-matched filter clears this at 99.
    expect(computeClearing(views).clearingPrice).not.toBe(99)
  })

  // 2. Exact same-limit ties on the long side → greedy price-priority ration.
  //    Two sells at the same limit 100; demand (12) exceeds supply (10) is the
  //    other direction, so flip: two BUYS at the same limit, sell short.
  //    Buy 6 @100 (BankA), Buy 6 @100 (BankB), Sell 8 @100 (BankC).
  //      p=100: demand 12, supply 8 → matched 8. Buy side is long, rationed.
  //    rationByPriority (greedy, equal limits keep input order, leftover-to-largest
  //    only matters for fractional pro-rata which greedy integer fill subsumes):
  //    first buy fills min(6,8)=6, second fills min(6,2)=2 → 6+2 = 8 == traded.
  //    Assert fills sum to traded and never exceed any order quantity.
  it('same-limit ties: equal-limit long side rationed to exactly traded, no over-fill', () => {
    const views: OrderView[] = [
      { desk: 'BankA', side: 'Buy', quantity: 6, limit: 100.0 },
      { desk: 'BankB', side: 'Buy', quantity: 6, limit: 100.0 },
      { desk: 'BankC', side: 'Sell', quantity: 8, limit: 100.0 },
    ]
    const { clearingPrice, allocations } = computeClearing(views)
    expect(clearingPrice).toBe(100)

    const traded = matchedAt(views, 100)
    expect(traded).toBe(8)

    // Sell side (short) fills fully.
    expect(fillOf(allocations, 'BankC')).toBe(8)

    // Buy fills sum to traded, neither exceeds its order quantity (6).
    const buyTotal = fillOf(allocations, 'BankA') + fillOf(allocations, 'BankB')
    expect(buyTotal).toBe(8)
    expect(fillOf(allocations, 'BankA')).toBeLessThanOrEqual(6)
    expect(fillOf(allocations, 'BankB')).toBeLessThanOrEqual(6)
    // Greedy keeps input order: first listed buy fills 6, second the remaining 2.
    expect(fillOf(allocations, 'BankA')).toBe(6)
    expect(fillOf(allocations, 'BankB')).toBe(2)
  })

  // 3. All-or-nothing imbalance: demand ≠ supply at p* → the short side fills
  //    fully and matched volume == min(demand, supply).
  //    Buy 10 @100 (long, demand 10), Sell 4 @100 (short, supply 4).
  it('imbalance: short side fills fully, matched == min(demand, supply)', () => {
    const views: OrderView[] = [
      { desk: 'BankA', side: 'Buy', quantity: 10, limit: 100.0 },
      { desk: 'BankB', side: 'Sell', quantity: 4, limit: 100.0 },
    ]
    const { clearingPrice, allocations } = computeClearing(views)
    expect(clearingPrice).toBe(100)

    const traded = matchedAt(views, 100)
    expect(traded).toBe(4) // min(10, 4)

    // Short side (sell, 4) fills fully; long side (buy) capped at traded = 4.
    expect(fillOf(allocations, 'BankB')).toBe(4)
    expect(fillOf(allocations, 'BankA')).toBe(4)
    // Buy residual = 10 − 4 = 6.
    expect(10 - fillOf(allocations, 'BankA')).toBe(6)
  })

  // 4. No-cross: best buy limit (99) < best sell limit (101) → no price crosses.
  //    Matched volume is 0 at EVERY candidate, so `traded` is 0 and no allocation
  //    crosses. Note: choosePStar mirrors Clearing.daml exactly — with `maxMatched`
  //    = 0 ALL candidate prices are in `topPrices`, and the (imbalance, price)
  //    tie-break still ranks them, so choosePStar returns a candidate price (here
  //    101, the min-imbalance one), NOT 0.0. The 0.0 branch fires only on a
  //    truly empty order list. The load-bearing invariant for a no-cross round is
  //    therefore matched===0 (the caller guards on traded volume, never settling),
  //    which the on-ledger Round.Clear re-verification also enforces.
  it('no-cross: best buy < best sell yields matched 0 and traded volume 0', () => {
    const views: OrderView[] = [
      { desk: 'BankA', side: 'Buy', quantity: 10, limit: 99.0 },
      { desk: 'BankB', side: 'Sell', quantity: 8, limit: 101.0 },
    ]
    // At every candidate price there is no overlap, so matched is 0.
    expect(matchedAt(views, 99)).toBe(0)
    expect(matchedAt(views, 101)).toBe(0)

    // pStar is a candidate price (no cross), but matched volume at it is 0 —
    // the foldl-max-0 seed means no positive traded volume exists.
    const pStar = choosePStar(views)
    expect(matchedAt(views, pStar)).toBe(0)

    const { allocations } = computeClearing(views)
    // Nothing crosses → traded is 0 → every fill is 0.
    expect(allocations.every((a) => a.filledQty === 0)).toBe(true)
  })

  // 4b. Genuinely empty batch → choosePStar hits the empty-`ranked` branch and
  //     returns 0.0 (the documented foldl-max-0 / no-candidate seed).
  it('no-cross: an empty order book has pStar 0.0 and no allocations', () => {
    expect(choosePStar([])).toBe(0)
    const { clearingPrice, allocations } = computeClearing([])
    expect(clearingPrice).toBe(0)
    expect(allocations).toEqual([])
  })
})
