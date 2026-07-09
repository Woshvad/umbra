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

// §7.3 (AUCT-01) — the order-type discriminator, byte-mirroring Clearing.daml's
// `data OrderType = Limit | Noncompetitive | AllOrNone | Conditional`. ADDITIVE:
// the §4 orders are plain `Limit`, so the new fields are inert until the wave-2
// clearing math (09-02/09-03) — the pure functions below do NOT read them.
export type OrderType = 'Limit' | 'Noncompetitive' | 'AllOrNone' | 'Conditional'

// A flattened view of one order, decoupled from the Daml `Order` template so the
// math is a pure function of plain data (Clearing.daml lines 45-50). The three
// appended fields mirror the Daml OrderView additions; they are OPTIONAL here so
// the existing §4 test literals (which omit them) stay valid and `orderType`
// defaults semantically to `Limit`. Inert until 09-02/09-03 (no math change).
export interface OrderView {
  desk: string
  side: Side
  quantity: number
  limit: number
  orderType?: OrderType // AUCT-01 discriminator (defaults to Limit)
  minQty?: number // AllOrNone/MAQ only (inert until 09-02)
  firmIf?: number // Conditional only (inert until 09-03)
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

// NONCOMPETITIVE (AUCT-01, 09-02) — byte-mirror of Clearing.daml::isNoncomp. A
// noncomp order is willing at ANY clearing price (effective-limit +∞ buy / 0 sell,
// `limit` ignored for willingness), adds NO candidate price, and rations with TOP
// priority. `orderType` is optional here, so an omitted orderType (existing Limit
// literals) is never Noncompetitive → the predicate is inert on the §4 book.
const isNoncomp = (o: OrderView): boolean => o.orderType === 'Noncompetitive'

// §8 step 2 — Σ qty of buys willing to pay >= p (noncomp buys willing at any p).
export const demandAt = (orders: OrderView[], p: number): number =>
  orders.filter((o) => isBuy(o) && (isNoncomp(o) || o.limit >= p)).reduce((s, o) => s + o.quantity, 0)

// §8 step 2 — Σ qty of sells willing to receive <= p (noncomp sells at any p).
export const supplyAt = (orders: OrderView[], p: number): number =>
  orders.filter((o) => isSell(o) && (isNoncomp(o) || o.limit <= p)).reduce((s, o) => s + o.quantity, 0)

// §8 step 2 — matched volume at p (Clearing.daml matchedAt).
export const matchedAt = (orders: OrderView[], p: number): number =>
  Math.min(demandAt(orders, p), supplyAt(orders, p))

// §8 step 1 — distinct, sorted candidate prices from the COMPETITIVE limits.
// Noncomp orders add NO candidate price (their limit is not a willingness bound),
// so they are excluded here (mirrors Clearing.daml::candidatePrices).
export const candidatePrices = (orders: OrderView[]): number[] =>
  [...new Set(orders.filter((o) => !isNoncomp(o)).map((o) => o.limit))].sort((a, b) => a - b)

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
// `traded` (Clearing.daml 114-118). Equal-limit ties are filled in the (already
// price-sorted, stable) input order — NOT pro-rata; strict pro-rata leftover-to-
// largest is deferred (§4 has no equal-limit tie, so the greedy answer B=8, C=2 is
// exact). Mirrors Clearing.daml's identical greedy rule bit-for-bit.
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

// ALLORNONE / MAQ (AUCT-01, 09-03) — byte-mirror of Clearing.daml::isAon /
// minQtyOf. An order with a `minQty` participates only if its integer fill is
// ≥ minQty at the chosen (price, subset); else it is excluded. All-or-none is the
// special case minQty === quantity (no separate path). `minQty` optional here, so
// an omitted minQty (existing Limit literals) is never AON → the enumeration below
// reduces to the single-subset (∅) case and the §4 book is byte-unchanged.
const isAon = (o: OrderView): boolean => o.minQty !== undefined
const minQtyOf = (o: OrderView): number => o.minQty ?? 0

// TOP-LEVEL recursive powerset — byte-identical enumeration order to
// Clearing.daml::powerset (FULL set first, ∅ last): powerset([a,b]) =
// [[a,b],[a],[b],[]]. The order is load-bearing: the subset index is the
// most-included subset tiebreak.
const powerset = <T,>(xs: T[]): T[][] => {
  if (xs.length === 0) return [[]]
  const [x, ...rest] = xs
  const sub = powerset(rest)
  return [...sub.map((s) => [x, ...s]), ...sub]
}

// Ration a FIXED book at a FIXED price p (subset already applied) → per-order
// fills (eligible only), buys first then sells, in noncomp-first / per-side-limit
// priority order. Mirrors Clearing.daml::fillsAtPrice. Bool→0/1 (Pitfall 6).
const fillsAtPrice = (book: OrderView[], p: number): [OrderView, number][] => {
  const traded = matchedAt(book, p)
  const buys = book
    .filter((o) => isBuy(o) && (isNoncomp(o) || o.limit >= p))
    .sort((a, b) => (isNoncomp(a) ? 0 : 1) - (isNoncomp(b) ? 0 : 1) || b.limit - a.limit)
  const sells = book
    .filter((o) => isSell(o) && (isNoncomp(o) || o.limit <= p))
    .sort((a, b) => (isNoncomp(a) ? 0 : 1) - (isNoncomp(b) ? 0 : 1) || a.limit - b.limit)
  return [...rationByPriority(buys, traded), ...rationByPriority(sells, traded)]
}

// The integer fill of one order in a fills list (0 if excluded/ineligible).
// Reference equality mirrors Clearing.daml's structural `o' == o` (orders in the
// demo book have distinct desks, so the two agree bit-for-bit).
const fillOfOrder = (fills: [OrderView, number][], o: OrderView): number =>
  fills.filter(([o2]) => o2 === o).reduce((s, [, f]) => s + f, 0)

// §8 steps 4-5 (CORE) — clear the batch via BOUNDED (price × subset) enumeration,
// emitting an Allocation for EVERY eligible order (incl. partial fills like C,
// residual = order.quantity − filledQty). Byte-identical mirror of
// Clearing.daml::coreClear.
//
// AllOrNone / MAQ: for each subset S of the AON orders and each candidate price p,
// clear `nonAon ++ S` at p (orders not in S excluded); (p, S) is FEASIBLE only if
// every AON order in the book fills ≥ its minQty. Among feasible (p, S) the winner
// is max matched → min imbalance → lower price → most-included subset (lower
// powerset idx). Matched volume is the PRIMARY key, so the §4 topPrices trap guard
// is preserved. §4 reduction: no AON → powerset([]) === [[]] → one subset (∅) →
// nonAon ++ [] === orders → byte-identical $100.00 / A=10 / B=8 / C=2. Empty /
// no-cross → { 0, [] }. SCALING CAVEAT: 2^k in the AON count (RULEBOOK).
export const coreClear = (orders: OrderView[]): ClearingResult => {
  const aon = orders.filter(isAon)
  const nonAon = orders.filter((o) => !isAon(o))
  const prices = candidatePrices(orders)
  const subsets = powerset(aon)
  type Cand = { m: number; imb: number; p: number; idx: number; fills: [OrderView, number][] }
  const candidates: Cand[] = []
  subsets.forEach((s, idx) => {
    const book = [...nonAon, ...s]
    for (const p of prices) {
      const fills = fillsAtPrice(book, p)
      const feasible = book.filter(isAon).every((o) => fillOfOrder(fills, o) >= minQtyOf(o))
      if (feasible) {
        candidates.push({
          m: matchedAt(book, p),
          imb: Math.abs(demandAt(book, p) - supplyAt(book, p)),
          p,
          idx,
          fills,
        })
      }
    }
  })
  // Rank: max matched → min imbalance → lower price → most-included subset (idx).
  const ranked = [...candidates].sort(
    (a, b) => b.m - a.m || a.imb - b.imb || a.p - b.p || a.idx - b.idx,
  )
  if (ranked.length === 0) return { clearingPrice: 0, allocations: [] }
  const best = ranked[0]
  const allocations: Allocation[] = best.fills.map(([o, f]) => ({
    desk: o.desk,
    side: o.side,
    filledQty: f,
  }))
  // 2-dp round, mirrors Daml roundBankers 2.
  return { clearingPrice: Math.round(best.p * 100) / 100, allocations }
}

// §8 public entry point — a deterministic TWO-PASS wrapper over `coreClear`,
// byte-identical to Clearing.daml::computeClearing (09-02 scaffold; Round.Clear
// re-verifies via the Daml twin, so on-ledger and solver agree). PASS 1 computes
// a provisional clear over the FIRM (non-conditional) orders; PASS 2 firms each
// conditional whose firmIf qualifies vs the PROVISIONAL p*, then re-clears
// firm ++ firmed.
//
// The firming rule is not yet implemented (09-03): `qualifies` is a TOTAL
// pass-through, so firmed == conditional, final == orders, and the wrapper
// reduces to a single coreClear — no behavior change, §4 stays $100.00. Note
// `orderType` is optional in TS, so an undefined orderType (existing Limit
// literals) is never 'Conditional' → always firm (parity with Daml).
export const computeClearing = (orders: OrderView[]): ClearingResult => {
  const firm = orders.filter((o) => o.orderType !== 'Conditional')
  const conditional = orders.filter((o) => o.orderType === 'Conditional')
  const { clearingPrice: provP } = coreClear(firm) // PASS 1: provisional over firm
  const qualifies = (_v: OrderView, _p: number): boolean => true // 09-03 hook (inert)
  const firmed = conditional.filter((v) => qualifies(v, provP)) // PASS 2 (inert now)
  const final = [...firm, ...firmed] // == orders while no conditional firms
  return coreClear(final)
}
