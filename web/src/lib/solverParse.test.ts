// web/src/lib/solverParse.test.ts — asserts the §4 solve-preview payload parses to
// clearingPrice===100 / matchedVolume===10, and the agent badge map (Pitfall 5).
import { describe, it, expect } from 'vitest'
import { badgeLabel, parseSolvePreview } from './solverParse'
import type { SolvePreviewResponse } from '../solver'

// The canonical §4 solve-preview payload (mirrors solver/src/api.ts response).
const SECTION4_PREVIEW: SolvePreviewResponse = {
  roundId: 'R1',
  clearingPrice: 100,
  matchedVolume: 10,
  allocations: [
    { desk: 'BLUEROCK', side: 'Buy', filledQty: 10 },
    { desk: 'MERIDIAN', side: 'Sell', filledQty: 8 },
    { desk: 'HALWARD', side: 'Sell', filledQty: 2 },
  ],
  curve: [
    { price: 99, demand: 10, supply: 8 },
    { price: 100, demand: 10, supply: 13 },
    { price: 101, demand: 10, supply: 13 },
  ],
  rationale: 'Cleared at 100.00 — maximises matched volume (10 units).',
  agent: { verified: true, source: 'claude' },
}

describe('solverParse — parseSolvePreview', () => {
  it('parses the §4 payload to clearingPrice===100, matchedVolume===10', () => {
    const p = parseSolvePreview(SECTION4_PREVIEW as unknown)
    expect(p.clearingPrice).toBe(100)
    expect(p.matchedVolume).toBe(10)
    expect(p.allocations).toHaveLength(3)
  })

  it('throws on a malformed payload (missing clearingPrice)', () => {
    expect(() => parseSolvePreview({ matchedVolume: 10 })).toThrow()
  })
})

describe('solverParse — badgeLabel', () => {
  it("maps 'claude' → VERIFIED · CLAUDE", () => {
    expect(badgeLabel('claude')).toBe('VERIFIED · CLAUDE')
  })

  it("maps 'deterministic-fallback' → VERIFIED · DETERMINISTIC", () => {
    expect(badgeLabel('deterministic-fallback')).toBe('VERIFIED · DETERMINISTIC')
  })
})
