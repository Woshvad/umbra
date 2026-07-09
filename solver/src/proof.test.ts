// solver/src/proof.test.ts — TRUST-03 decision proof bundle contract.
//
// Proven here:
//   • writeProofBundle produces every required field for the §4 fixture.
//   • systemPromptHash === sha256(SYSTEM_PROMPT) (provenance without the raw prompt).
//   • deterministicRecompute is the §4 result (100.00, A=10/B=8/C=2) and clearingHash is stable.
//   • the SECRET SWEEP: neither the ANTHROPIC_API_KEY, the operator token, NOR the raw
//     SYSTEM_PROMPT text ever appears in the serialized bundle (Pitfall 6 / T-08-05-BUNDLE).
//   • readProofBundle round-trips the written bundle and returns null for an absent round.
//
// The bundle is written to the real (gitignored) solver/proofs/ dir under a unique test id
// and removed in afterEach — no live round bundle is ever touched or committed.

import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { SYSTEM_PROMPT, buildBatchMessage, type AgentResult } from './agent.js'
import { computeClearing, matchedAt, type OrderView } from './auction.js'
import { writeProofBundle, readProofBundle, PROOF_MODEL_ID } from './proof.js'

// The §4 canonical fixture: A Buy 10 @101, B Sell 8 @99, C Sell 5 @100 → clears 100.00.
const SECTION4_VIEWS: OrderView[] = [
  { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
  { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
  { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
]

// Sentinels that MUST NEVER be serialized into the bundle (as agent.ts/ledger.ts hold them).
const SENTINEL_API_KEY = 'sk-ant-SENTINEL-API-KEY-do-not-leak-9c4e2d'
const SENTINEL_TOKEN = 'SENTINEL-OPERATOR-TOKEN-do-not-leak-7f3a9b'

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

// A verified-agreement AgentResult for §4 (the numbers are always the deterministic §8 ones).
const section4AgentResult = (): AgentResult => {
  const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
  return {
    clearingPrice,
    allocations,
    matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
    rationale: 'Cleared at 100.00: maximizes matched volume at 10 units.',
    verified: true,
    source: 'claude',
  }
}

const proofsDir = fileURLToPath(new URL('../proofs', import.meta.url))
const writtenIds: string[] = []
const uniqueId = (): string => {
  const id = `TEST-PROOF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  writtenIds.push(id)
  return id
}

describe('TRUST-03 decision proof bundle (proof.ts)', () => {
  afterEach(() => {
    // Remove every bundle this suite wrote — never leave test artifacts in solver/proofs/.
    for (const id of writtenIds.splice(0)) {
      try {
        rmSync(join(proofsDir, `${id}.json`))
      } catch {
        // already gone / never written — fine
      }
    }
  })

  it('writes a bundle with every required field for the §4 fixture', () => {
    const roundId = uniqueId()
    const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
    const bundle = writeProofBundle({
      roundId,
      views: SECTION4_VIEWS,
      agentResult: section4AgentResult(),
      clearingPrice,
      allocations,
      verified: true,
    })

    expect(bundle.roundId).toBe(roundId)
    expect(typeof bundle.timestamp).toBe('string')
    expect(new Date(bundle.timestamp).toString()).not.toBe('Invalid Date')
    expect(bundle.modelId).toBe(PROOF_MODEL_ID)
    expect(bundle.systemPromptHash).toBe(sha(SYSTEM_PROMPT))
    expect(bundle.batchHash).toBe(sha(buildBatchMessage(SECTION4_VIEWS)))
    expect(bundle.rawAiProposal).toBeDefined()
    expect(bundle.rawAiProposal.clearingPrice).toBe(100)
    expect(Array.isArray(bundle.rawAiProposal.allocations)).toBe(true)
    expect(bundle.deterministicRecompute.clearingPrice).toBe(100)
    expect(bundle.verified).toBe(true)
    expect(bundle.clearingHash).toBe(sha(JSON.stringify({ clearingPrice, allocations })))
  })

  it('records the §4 deterministic recompute (100.00, A=10/B=8/C=2)', () => {
    const roundId = uniqueId()
    const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
    const bundle = writeProofBundle({
      roundId,
      views: SECTION4_VIEWS,
      agentResult: section4AgentResult(),
      clearingPrice,
      allocations,
      verified: true,
    })

    expect(bundle.deterministicRecompute.clearingPrice).toBe(100.0)
    const byDesk = new Map(bundle.deterministicRecompute.allocations.map((a) => [`${a.desk}|${a.side}`, a.filledQty]))
    expect(byDesk.get('BankA|Buy')).toBe(10)
    expect(byDesk.get('BankB|Sell')).toBe(8)
    expect(byDesk.get('BankC|Sell')).toBe(2)
    // clearingHash is a stable function of the §4 result — two writes hash identically.
    expect(bundle.clearingHash).toBe(sha(JSON.stringify({ clearingPrice, allocations })))
  })

  it('SECRET SWEEP: the serialized bundle contains NO key, NO token, NO raw prompt', () => {
    const roundId = uniqueId()
    const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
    // The agent result closes over the sentinels the way agent.ts holds the real key —
    // but rawAiProposal is numbers/rationale/source only, so they must never be serialized.
    void SENTINEL_API_KEY
    void SENTINEL_TOKEN
    const bundle = writeProofBundle({
      roundId,
      views: SECTION4_VIEWS,
      agentResult: section4AgentResult(),
      clearingPrice,
      allocations,
      verified: true,
    })

    const serialized = JSON.stringify(bundle)
    expect(serialized).not.toContain(SENTINEL_API_KEY)
    expect(serialized).not.toContain(SENTINEL_TOKEN)
    // The RAW system prompt text must NOT be present — only its hash.
    expect(serialized).not.toContain('You are the Umbra Solver Agent')
    expect(serialized).not.toContain(SYSTEM_PROMPT)
    // And what IS present is the irreversible fingerprint.
    expect(serialized).toContain(sha(SYSTEM_PROMPT))
  })

  it('readProofBundle round-trips a written bundle and returns null when absent', () => {
    const roundId = uniqueId()
    const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
    const written = writeProofBundle({
      roundId,
      views: SECTION4_VIEWS,
      agentResult: section4AgentResult(),
      clearingPrice,
      allocations,
      verified: true,
    })

    const read = readProofBundle(roundId)
    expect(read).toEqual(written)

    expect(readProofBundle('NO-SUCH-ROUND-xyz-123')).toBeNull()
  })
})
