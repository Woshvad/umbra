// web/src/lib/leakage.ts — PURE, DOM-free cost-of-leakage model (WOW-06, UI-SPEC
// "WOW-06 — Cost-of-Leakage Simulator", 05 Settlement). Mirrors the leaf-lib style
// of `balance.ts`/`curve.ts`: no I/O, no React, no DOM, no ledger/solver client —
// just deterministic functions over the SETTLED per-desk receipt numbers already on
// the page (side, filledQty, ownLimit, clearingPrice).
//
// ⚠ ILLUSTRATIVE ONLY — NOT LEDGER DATA. This runs the SAME settled order set through
// a NAIVE simulated public order book (sequential marketable execution → slippage /
// front-run price impact → `$ lost`) beside Umbra's sealed uniform clear (`$0 leaked`),
// so the Settlement panel can show `$X saved`. The numbers here are a didactic model,
// NOT an on-ledger fact; the panel that renders them is deliberately marked as a
// simulation (dashed border + `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag).
//
// Model (RESEARCH "WOW-06 Leakage Sim" + UI-SPEC 297-318): walk the aggressive
// (taker) side sequentially through the book. Unit `i` (0-based depth) executes at a
// premium over the uniform clear of `clearingPrice * (SLIPPAGE_BP_PER_UNIT·i +
// FRONT_RUN_BP) / 10000` — book depth (slippage) grows with each swept unit, plus a
// flat front-run markup for a visible order. `publicBookLost = Σ (executionPrice −
// uniformClear)`. Umbra's sealed uniform clear leaks nothing → `umbraLeaked = 0`;
// `saved = publicBookLost`. Deterministic (no Date/random/DOM) and empty-safe.

import type { Allocation } from '../solver'

// ── Illustrative coefficients (basis points of the uniform clear) ────────────────
// NOT calibrated to any real venue — they only shape the didactic public-book
// slippage curve. Expressed in bp so the model scales with the clearing price.
export const SLIPPAGE_BP_PER_UNIT = 8 // each successive swept unit costs +8bp (book depth)
export const FRONT_RUN_BP = 15 // flat per-unit markup — a visible order gets front-run

// One settled receipt leg the model reads (a superset of the solver `Allocation`
// shape — `side`/`filledQty` — plus the uniform `clearingPrice` and the desk's own
// limit; `ownLimit` is accepted for shape-fidelity with the AUCT-04 receipt but the
// deterministic $lost formula does not depend on any desk's private limit).
export type LeakageLeg = Pick<Allocation, 'side' | 'filledQty'> & {
  clearingPrice: number
  ownLimit?: number | null
}

// The simulator result. `umbraLeaked` is the literal `0` — a sealed uniform clear
// leaks nothing — and `saved === publicBookLost` (all cents in dollars).
export type LeakageResult = {
  publicBookLost: number
  umbraLeaked: 0
  saved: number
}

// Round a dollar amount to cents (deterministic, display-safe).
const toCents = (n: number): number => Math.round(n * 100) / 100

// estimateLeakage — the pure WOW-06 model. Empty-safe (reduce with a 0 seed).
export const estimateLeakage = (legs: LeakageLeg[]): LeakageResult => {
  // The uniform clear — every leg shares it; empty-safe via a 0 seed.
  const clearingPrice = legs.reduce((p, l) => Math.max(p, l.clearingPrice), 0)

  // Aggressive taker sweep = the BUY side (marketable orders walking the ask book);
  // fall back to the SELL side if there is no buy side. Either way this is the
  // matched volume (Σbuy === Σsell at the uniform clear).
  const buyQty = legs
    .filter((l) => l.side === 'Buy')
    .reduce((q, l) => q + Math.max(0, l.filledQty), 0)
  const sellQty = legs
    .filter((l) => l.side === 'Sell')
    .reduce((q, l) => q + Math.max(0, l.filledQty), 0)
  const sweepQty = Math.max(0, Math.round(buyQty > 0 ? buyQty : sellQty))

  // Walk each unit sequentially: unit `i` pays a premium over the clear of
  // clearingPrice·(SLIPPAGE_BP_PER_UNIT·i + FRONT_RUN_BP)/1e4. $lost = Σ premium_i.
  // Expressed as a reduce over the unit indices (empty-safe 0 seed).
  const units = Array.from({ length: sweepQty }, (_, i) => i)
  const publicBookLost = toCents(
    units.reduce(
      (lost, i) => lost + (clearingPrice * (SLIPPAGE_BP_PER_UNIT * i + FRONT_RUN_BP)) / 10000,
      0,
    ),
  )

  // Umbra's sealed uniform clear leaks nothing; the saving is the whole public-book loss.
  return { publicBookLost, umbraLeaked: 0, saved: publicBookLost }
}
