import { describe, it, expect } from 'vitest'

// CRYP-03 Wave-0 scaffold (INTENTIONALLY FAILING).
// This red turns green in plan 10-04 when the Groth16 verifier + committed §4
// fixtures (vkey.json / proof.json / public.json) land in this directory.
// It deliberately does NOT import the (not-yet-existing) verifier so the suite
// still collects; the single `expect(false).toBe(true)` marks the gap.
describe('CRYP-03 groth16', () => {
  it('accepts the §4 proof and rejects a tampered clearing (implemented in 10-04)', () => {
    expect(false).toBe(true)
  })
})
