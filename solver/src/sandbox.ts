// solver/src/sandbox.ts — OPS-04 deterministic sandbox-round fixture (T-13-11).
//
// The sandbox round is a STABLE, never-varying API contract third-party integrators run
// their tests against: it ALWAYS seeds and clears the canonical §4 batch — three desks
// (A/B/C) that clear at EXACTLY $100.00 with fills A=10 / B=8 / C=2 — isolated from real
// rounds. `POST /sandbox/round` (wired in 13-09) reuses `sandboxFixtureOrders()` to seed
// and `assertSandboxClears()` to compute + guard the clear before settling.
//
// SOURCE OF TRUTH: this module imports the PURE §8 core from auction.ts and does NOT
// modify it (Pitfall 6 — keep auction.ts / Clearing.daml / Round.Clear byte-unchanged).
// The fixture is byte-identical to the golden auction.test.ts / daml Tests.daml batch, so
// the sandbox can NEVER drift from $100.00 without the golden test also failing.
//
// DRIFT GUARD: `assertSandboxClears` re-runs the deterministic clear and throws a fixed,
// secret-free message unless the price is exactly 100.00 AND the allocation SET equals
// {A:10, B:8, C:2} — the same order-insensitive equality discipline as agent.ts
// `allocationsEqual` (keyed by desk|side → filledQty).

import {
  computeClearing,
  type Allocation,
  type ClearingResult,
  type OrderView,
  type Side,
} from './auction.js'

// The canonical §4 batch — IDENTICAL to the golden auction.test.ts fixture:
//   A Buy 10 @101, B Sell 8 @99, C Sell 5 @100 → p*=100.00, fills A=10 / B=8 / C=2.
// Returned fresh each call (deterministic, never-varying) so a caller can never mutate
// the shared fixture.
export const sandboxFixtureOrders = (): OrderView[] => [
  { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
  { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
  { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
]

// The expected winning allocation SET for the §4 fixture (A=10 / B=8 / C=2).
const EXPECTED_ALLOCATIONS: Allocation[] = [
  { desk: 'BankA', side: 'Buy', filledQty: 10 },
  { desk: 'BankB', side: 'Sell', filledQty: 8 },
  { desk: 'BankC', side: 'Sell', filledQty: 2 },
]

const SANDBOX_PRICE = 100.0

// Fixed, secret-free failure message (never interpolates order/secret data).
const SANDBOX_DRIFT_MESSAGE =
  'sandbox drift: canonical §4 fixture no longer clears at $100.00 with fills A=10 / B=8 / C=2'

// Order-insensitive allocation-SET equality — mirrors agent.ts allocationsEqual (a map
// keyed by desk|side → filledQty; order never matters).
const allocKey = (a: { desk: string; side: Side }): string => `${a.desk}|${a.side}`
const allocationsEqual = (a: Allocation[], b: Allocation[]): boolean => {
  if (a.length !== b.length) return false
  const mb = new Map(b.map((x) => [allocKey(x), x.filledQty]))
  return a.every((x) => mb.get(allocKey(x)) === x.filledQty)
}

// Run the deterministic §8 clear over the given orders (default: the §4 fixture) and
// ASSERT it clears at exactly $100.00 with the canonical A=10 / B=8 / C=2 set. Throws the
// fixed drift message on ANY mismatch; returns the ClearingResult on success so the
// 13-09 sandbox endpoint can settle it.
export const assertSandboxClears = (
  orders: OrderView[] = sandboxFixtureOrders(),
): ClearingResult => {
  const result = computeClearing(orders)
  const ok =
    result.clearingPrice === SANDBOX_PRICE &&
    allocationsEqual(result.allocations, EXPECTED_ALLOCATIONS)
  if (!ok) throw new Error(SANDBOX_DRIFT_MESSAGE)
  return result
}
