import { describe, it, expect } from 'vitest'

// CRYP-02 Wave-0 scaffold (INTENTIONALLY FAILING).
// This red turns green in plan 10-03 when the tlock timelock module lands.
// It deliberately does NOT import the (not-yet-existing) tlock module so the
// suite still collects; the single `expect(false).toBe(true)` marks the gap.
describe('CRYP-02 tlock', () => {
  it('round-trips against drand + blocks early decrypt (implemented in 10-03)', () => {
    expect(false).toBe(true)
  })
})
