// solver/src/auction.ts — the deterministic §8 clearing algorithm, ported 1:1
// from daml/Umbra/Clearing.daml. PURE module: no I/O, no imports.
//
// This is the single off-ledger source of clearing math. The on-ledger
// `Round.Clear` (Phase 2) re-verifies §8 with the Daml original, so any
// divergence here is rejected on-ledger AND breaks the §4 canary — the port
// must mirror Clearing.daml function-for-function, including the three
// load-bearing invariants:
//   (1) choosePStar filters to the max-matched `topPrices` subset FIRST, then
//       tie-breaks by (|demand−supply|, price). Dropping the filter clears the
//       §4 fixture at 99 instead of 100 (the documented trap).
//   (2) computeClearing sorts eligible buys DESCENDING by limit (most-aggressive
//       first) and eligible sells ASCENDING by limit, then greedily rations.
//   (3) price is rounded with Math.round(p*100)/100 (mirrors Daml roundBankers 2).
// Unit quantities stay integer `number`s end-to-end; no float drift.

// §7.3 — order side (Clearing.daml line 31).
export type Side = 'Buy' | 'Sell'

// A flattened view of one order, decoupled from the Daml `Order` template so the
// math is a pure function of plain data (Clearing.daml lines 45-50).
export interface OrderView {
  desk: string
  side: Side
  quantity: number
  limit: number
}

// §7.7 — the solver's verified output, re-checked on-ledger (Clearing.daml 37-41).
export interface Allocation {
  desk: string
  side: Side
  filledQty: number
}

// computeClearing's return shape — mirrors Daml `(Decimal, [Allocation])`.
export interface ClearingResult {
  clearingPrice: number
  allocations: Allocation[]
}

const isBuy = (o: OrderView): boolean => o.side === 'Buy'
const isSell = (o: OrderView): boolean => o.side === 'Sell'

// §8 step 2 — Σ qty of buys willing to pay >= p (Clearing.daml 59-61).
export const demandAt = (orders: OrderView[], p: number): number =>
  orders.filter((o) => isBuy(o) && o.limit >= p).reduce((s, o) => s + o.quantity, 0)

// §8 step 2 — Σ qty of sells willing to receive <= p (Clearing.daml 64-66).
export const supplyAt = (orders: OrderView[], p: number): number =>
  orders.filter((o) => isSell(o) && o.limit <= p).reduce((s, o) => s + o.quantity, 0)

// §8 step 2 — matched volume at p (Clearing.daml 69-70).
export const matchedAt = (orders: OrderView[], p: number): number =>
  Math.min(demandAt(orders, p), supplyAt(orders, p))

// §8 step 1 — distinct, sorted candidate prices from all limits (Clearing.daml 73-74).
export const candidatePrices = (orders: OrderView[]): number[] =>
  [...new Set(orders.map((o) => o.limit))].sort((a, b) => a - b)

// §8 step 3 — choose p* with the TWO-LEVEL tie-break, applied IN ORDER over the
// max-matched subset only (Clearing.daml 87-101). The `topPrices` filter is the
// trap guard: without it the §4 fixture clears at 99 (imbalance 2 < 3) not 100.
export const choosePStar = (orders: OrderView[]): number => {
  const prices = candidatePrices(orders)
  const matches = prices.map((p) => [p, matchedAt(orders, p)] as const)
  // `foldl max 0` — total on the empty list, seeds the no-cross round at 0 matched.
  const maxMatched = matches.reduce((m, [, mm]) => Math.max(m, mm), 0)
  // Trap guard: keep only the prices that achieve max matched volume.
  const topPrices = matches.filter(([, mm]) => mm === maxMatched).map(([p]) => p)
  // Tie-break (a) minimize |demand−supply| THEN (b) lower price — over topPrices.
  const ranked = [...topPrices].sort((a, b) => {
    const ia = Math.abs(demandAt(orders, a) - supplyAt(orders, a))
    const ib = Math.abs(demandAt(orders, b) - supplyAt(orders, b))
    return ia - ib || a - b
  })
  // No candidates => no cross; caller guards (Daml returns 0.0).
  return ranked.length ? ranked[0] : 0
}

// §8 step 4 — ration `traded` units across an already-price-ordered list,
// most-aggressive-first, integer fills never exceeding each order's quantity nor
// `traded` (Clearing.daml 114-118). The leftover-to-largest rule for fractional
// pro-rata among equal-limit ties is subsumed by this greedy integer pass; §4 has
// no equal-limit tie so the greedy answer (B=8, C=2) is exact.
export const rationByPriority = (
  ordered: OrderView[],
  remaining: number,
): [OrderView, number][] => {
  const out: [OrderView, number][] = []
  let rem = remaining
  for (const o of ordered) {
    const f = Math.min(o.quantity, rem)
    out.push([o, f])
    rem -= f
  }
  return out
}

// §8 steps 4-5 — clear the batch: pick p*, compute traded volume, ration both
// sides by price priority, emit an Allocation for EVERY eligible order (incl.
// partial fills like C, whose residual is order.quantity − filledQty)
// (Clearing.daml 125-138). Buys DESC by limit, sells ASC by limit.
export const computeClearing = (orders: OrderView[]): ClearingResult => {
  const pStar = choosePStar(orders)
  const traded = matchedAt(orders, pStar)
  const buys = orders
    .filter((o) => isBuy(o) && o.limit >= pStar)
    .sort((a, b) => b.limit - a.limit) // DESC by limit (most-aggressive buy first)
  const sells = orders
    .filter((o) => isSell(o) && o.limit <= pStar)
    .sort((a, b) => a.limit - b.limit) // ASC by limit (most-aggressive sell first)
  const buyFills = rationByPriority(buys, traded)
  const sellFills = rationByPriority(sells, traded)
  const allocations: Allocation[] = [
    ...buyFills.map(([o, f]) => ({ desk: o.desk, side: 'Buy' as Side, filledQty: f })),
    ...sellFills.map(([o, f]) => ({ desk: o.desk, side: 'Sell' as Side, filledQty: f })),
  ]
  // 2-dp round, mirrors Daml roundBankers 2.
  return { clearingPrice: Math.round(pStar * 100) / 100, allocations }
}
