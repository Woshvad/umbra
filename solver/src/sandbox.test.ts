// solver/src/sandbox.test.ts — the executable contract for the OPS-04 sandbox round
// fixture (T-13-11: sandbox drift guard).
//
// TDD: authored BEFORE solver/src/sandbox.ts exists — EXPECTED to fail at the RED step.
// The sandbox round is a STABLE, never-drifting API contract for third-party integration
// tests: it ALWAYS seeds the canonical §4 batch and MUST clear at exactly $100.00 with
// fills A=10 / B=8 / C=2. Proven here:
//   • sandboxFixtureOrders() returns the canonical §4 three-desk batch.
//   • assertSandboxClears() passes for the fixture (p*=100.00, A=10/B=8/C=2) and returns
//     the ClearingResult (the 13-09 `POST /sandbox/round` endpoint reuses it to settle).
//   • A MUTATED fixture makes assertSandboxClears() THROW (the drift guard fires).
//   • It reuses the byte-unchanged §8 core (auction.ts) — no auction.ts edit.

import { describe, it, expect } from 'vitest'
import { sandboxFixtureOrders, assertSandboxClears } from './sandbox.js'
import type { OrderView } from './auction.js'

const fillOf = (allocs: { desk: string; filledQty: number }[], desk: string) =>
  allocs.filter((a) => a.desk === desk).reduce((s, a) => s + a.filledQty, 0)

describe('sandbox — deterministic §4 fixture ($100.00)', () => {
  it('sandboxFixtureOrders returns the canonical §4 three-desk batch', () => {
    const orders = sandboxFixtureOrders()
    expect(orders).toHaveLength(3)
    const desks = orders.map((o) => o.desk).sort()
    expect(desks).toEqual(['BankA', 'BankB', 'BankC'])
    // The fixture is deterministic — two calls produce equal batches.
    expect(sandboxFixtureOrders()).toEqual(orders)
  })

  it('assertSandboxClears passes: clears at exactly $100.00 with fills A=10 / B=8 / C=2', () => {
    const result = assertSandboxClears()
    expect(result.clearingPrice).toBe(100)
    expect(fillOf(result.allocations, 'BankA')).toBe(10)
    expect(fillOf(result.allocations, 'BankB')).toBe(8)
    expect(fillOf(result.allocations, 'BankC')).toBe(2)
  })

  it('assertSandboxClears THROWS on a mutated fixture (drift guard fires)', () => {
    // Perturb a limit so the §4 batch no longer clears at 100 / A=10 B=8 C=2.
    const mutated: OrderView[] = sandboxFixtureOrders().map((o) =>
      o.desk === 'BankA' ? { ...o, limit: 90 } : o,
    )
    expect(() => assertSandboxClears(mutated)).toThrow()
  })

  it('assertSandboxClears THROWS when the winning allocation set drifts', () => {
    // Drop a desk → the allocation set can no longer equal {A:10, B:8, C:2}.
    const mutated = sandboxFixtureOrders().filter((o) => o.desk !== 'BankC')
    expect(() => assertSandboxClears(mutated)).toThrow()
  })
})
