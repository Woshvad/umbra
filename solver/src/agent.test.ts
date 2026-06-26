// solver/src/agent.test.ts — the mocked-SDK contract for the AI Solver Agent.
//
// Drives `createAgent({ client?, computeClearing, matchedAt })` with a DI-injected
// FAKE Anthropic client (no network, no real key) and the REAL §8 helpers, so every
// assertion measures the model's proposal against the genuine deterministic §4 result
// (clears 100.00 / matchedVolume 10 / A=10, B=8, C=2).
//
// Proven here (AGENT-01 / AGENT-02 — the verify-don't-trust thesis):
//   • agreement → verified:true, source:'claude', the DETERMINISTIC numbers flow out,
//     only the MODEL's rationale is taken.
//   • agreement is order-insensitive (allocationsEqual compares as a set by desk|side).
//   • disagreement (wrong price/alloc) → gate rejects → deterministic §4 wins (100.00),
//     source:'deterministic-fallback', GENERATED neutral rationale (not the model's).
//   • malformed / null parsed_output → safeParse fails → fallback, no throw.
//   • unavailable (client.parse throws) → fallback, proposeClearing RESOLVES (never
//     rejects), and the ANTHROPIC_API_KEY sentinel never appears in any response/log.
//   • keyless (no client injected) → short-circuits to the deterministic fallback.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeClearing, matchedAt, type OrderView } from './auction.js'
import { createAgent, type AgentResult } from './agent.js'

// The §4 canonical fixture (identical to api.test.ts L36-40): A Buy 10@101,
// B Sell 8@99, C Sell 5@100 → clears 100.00, matchedVolume = min(10, 13) = 10,
// allocations A=10 (Buy), B=8 (Sell), C=2 (Sell).
const SECTION4_VIEWS: OrderView[] = [
  { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
  { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
  { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
]

// Stands in for ANTHROPIC_API_KEY. The agent closes over the real key the way the
// ledger client holds the Operator JWT; this sentinel must NEVER appear in any
// returned value nor any captured console.log/console.error call.
const SENTINEL_KEY = 'SENTINEL-ANTHROPIC-KEY-do-not-leak-9c4f2a'

// A fake Anthropic client whose messages.parse resolves a given parsed_output.
// Mirrors the real `client.messages.parse(...)` → `{ parsed_output }` shape (the DI
// fake is preferred over vi.mock — no module hoisting). The key sentinel is closed
// over here exactly as the real client closes over the API key.
const fakeClientReturning = (parsedOutput: unknown) => ({
  messages: {
    parse: vi.fn(async () => {
      void SENTINEL_KEY // referenced in the closure; must NOT reach any output/log
      return { parsed_output: parsedOutput }
    }),
  },
})

// A fake client whose parse REJECTS — the SDK-error / network-outage path.
const fakeClientThrowing = () => ({
  messages: {
    parse: vi.fn(async () => {
      void SENTINEL_KEY
      throw new Error('network')
    }),
  },
})

describe('AI Solver Agent — verify-don\'t-trust gate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('agreement: verified true, uses the model rationale, returns deterministic numbers', async () => {
    const client = fakeClientReturning({
      clearingPrice: 100,
      allocations: [
        { desk: 'BankA', side: 'Buy', filledQty: 10 },
        { desk: 'BankB', side: 'Sell', filledQty: 8 },
        { desk: 'BankC', side: 'Sell', filledQty: 2 },
      ],
      rationale: 'Cleared at 100.00: maximizes matched volume at 10 units.',
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r: AgentResult = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.verified).toBe(true)
    expect(r.source).toBe('claude')
    expect(r.clearingPrice).toBe(100)
    expect(r.matchedVolume).toBe(10)
    expect(r.rationale).toBe('Cleared at 100.00: maximizes matched volume at 10 units.')

    // The NUMBERS must be the deterministic ones (from computeClearing), never the
    // model's raw object — assert the full deterministic allocation set is present.
    const det = computeClearing(SECTION4_VIEWS)
    expect(r.allocations).toEqual(det.allocations)
  })

  it('agreement is order-insensitive (allocations compared as a set, not by index)', async () => {
    // Same correct fills, but the model emits sells before buys, in a shuffled order.
    const client = fakeClientReturning({
      clearingPrice: 100,
      allocations: [
        { desk: 'BankC', side: 'Sell', filledQty: 2 },
        { desk: 'BankB', side: 'Sell', filledQty: 8 },
        { desk: 'BankA', side: 'Buy', filledQty: 10 },
      ],
      rationale: 'Same fills, different order.',
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.verified).toBe(true)
    expect(r.source).toBe('claude')
    expect(r.clearingPrice).toBe(100)
  })

  it('disagreement: gate rejects, deterministic §4 wins (100.00), source fallback', async () => {
    const client = fakeClientReturning({
      clearingPrice: 99, // WRONG — the §4 fixture clears at 100.00
      allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
      rationale: 'bogus',
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.verified).toBe(false)
    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100) // §4 canary HOLDS — the gate rejected the model
    expect(r.matchedVolume).toBe(10)
    expect(r.rationale).not.toContain('bogus') // generated neutral string, not the model's
    expect(r.rationale.length).toBeGreaterThan(0)
  })

  it('disagreement on allocation only (right price, wrong fills) → fallback', async () => {
    const client = fakeClientReturning({
      clearingPrice: 100, // right price …
      allocations: [
        { desk: 'BankA', side: 'Buy', filledQty: 10 },
        { desk: 'BankB', side: 'Sell', filledQty: 5 }, // … wrong fill (should be 8)
        { desk: 'BankC', side: 'Sell', filledQty: 5 },
      ],
      rationale: 'wrong fills',
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.verified).toBe(false)
    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100)
  })

  it('malformed: parsed_output missing clearingPrice → safeParse fails → fallback', async () => {
    const client = fakeClientReturning({
      allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
      rationale: 'no price field',
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100)
  })

  it('malformed: parsed_output is null → fallback, no throw', async () => {
    const client = fakeClientReturning(null)
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100)
  })

  it('malformed: invalid side enum → safeParse fails → fallback', async () => {
    const client = fakeClientReturning({
      clearingPrice: 100,
      allocations: [{ desk: 'BankA', side: 'Hold', filledQty: 10 }], // not Buy|Sell
      rationale: 'bad side',
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100)
  })

  it('unavailable: SDK throws → fallback, proposeClearing never rejects, no secret leak', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = fakeClientThrowing()
    const agent = createAgent({ client, computeClearing, matchedAt })

    // RESOLVES (never rejects) even though the underlying parse threw.
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100)
    expect(r.matchedVolume).toBe(10)

    // The API-key sentinel never appears in the result …
    expect(JSON.stringify(r)).not.toContain(SENTINEL_KEY)
    // … nor in any captured log line (secret-safe error handling).
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_KEY)
    }
  })

  it('keyless: no client injected → deterministic fallback, no network call', async () => {
    const agent = createAgent({ computeClearing, matchedAt })
    const r = await agent.proposeClearing(SECTION4_VIEWS)

    expect(r.source).toBe('deterministic-fallback')
    expect(r.clearingPrice).toBe(100)
    expect(r.matchedVolume).toBe(10)
    expect(r.verified).toBe(false)
    expect(r.rationale.length).toBeGreaterThan(0)
  })
})
