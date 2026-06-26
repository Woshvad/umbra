// web/src/lib/balance.ts — PURE, DOM-free balance helpers for the settlement
// animation (UI-SPEC "05 — SETTLEMENT", BalanceTable; RESEARCH Pattern 7).
//
//   • `lerp` — the comp's before→after interpolation, driven by the single rAF
//     `settleProgress` 0→1 so EVERY desk row lerps in lockstep (atomic = simultaneous).
//   • `deskBalancesFromAllocations` — derive each desk's after-balance from the
//     solver `Allocation[]` + the clearing price: signed BONDX delta = +filledQty
//     for Buy / −filledQty for Sell; signed USDCx delta = ∓filledQty·clearingPrice
//     (cash flows opposite the asset). On the §4 fixture at 100.00 the finals are
//     BLUEROCK 10/4000 · MERIDIAN 12/1800 · HALWARD 13/1200.
//
// No I/O, no React, no DOM (pure-fn style of solver/src/auction.ts).

import type { Allocation } from '../solver'

// Linear interpolation x→y by t∈[0,1]. lerp(x,y,0)===x, lerp(x,y,1)===y.
export const lerp = (x: number, y: number, t: number): number => x + (y - x) * t

// One desk's holdings of the two symbols.
export type DeskBalance = { bondx: number; usdcx: number }
// A keyed map of desk → balance.
export type DeskBalances = Record<string, DeskBalance>

// Derive every desk's AFTER balance from the clearing allocations + the before
// balances. BONDX moves with the trade (+ buy / − sell); USDCx moves opposite
// (a buyer pays cash, a seller receives it).
export const deskBalancesFromAllocations = (
  allocations: Allocation[],
  clearingPrice: number,
  before: DeskBalances,
): DeskBalances => {
  // Start from the before balances (clone so the input is never mutated).
  const after: DeskBalances = {}
  for (const [desk, bal] of Object.entries(before)) {
    after[desk] = { bondx: bal.bondx, usdcx: bal.usdcx }
  }
  for (const a of allocations) {
    const sign = a.side === 'Buy' ? 1 : -1
    const bondxDelta = sign * a.filledQty
    const usdcxDelta = -sign * a.filledQty * clearingPrice
    const cur = after[a.desk] ?? { bondx: 0, usdcx: 0 }
    after[a.desk] = { bondx: cur.bondx + bondxDelta, usdcx: cur.usdcx + usdcxDelta }
  }
  return after
}
