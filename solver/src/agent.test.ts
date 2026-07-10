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
// ADJ-01 — competing-solver ranking (additive; referee = deterministic §8).
import {
  rankProposals,
  computeSurplus,
  type RankedProposal,
  type SolverConfig,
  type CompetingResult,
} from './agent.js'

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

// A fake client whose parse NEVER settles — the slow/hanging-key path (TRUST-02 timeout).
// proposeClearing must still resolve (to the deterministic fallback) via its deadline.
const fakeClientNeverResolving = () => ({
  messages: {
    parse: vi.fn(
      () =>
        new Promise<{ parsed_output: unknown }>(() => {
          void SENTINEL_KEY // held in the closure exactly as the real key is; never leaks
          /* intentionally never resolves */
        }),
    ),
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

  it('timeout: a never-resolving parse → deterministic §4 fallback (100.00), never hangs, no leak', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = fakeClientNeverResolving()
    // A tiny deadline so the test resolves fast — the parse below never settles.
    const agent = createAgent({ client, computeClearing, matchedAt, timeoutMs: 20 })

    const r = await agent.proposeClearing(SECTION4_VIEWS)

    // Resolved to the deterministic fallback — NOT hung, NOT thrown.
    expect(r.source).toBe('deterministic-fallback')
    expect(r.verified).toBe(false)
    expect(r.clearingPrice).toBe(100) // §4 canary HOLDS on the timeout path
    expect(r.matchedVolume).toBe(10)

    // The API-key sentinel never appears in the result nor any captured log line.
    expect(JSON.stringify(r)).not.toContain(SENTINEL_KEY)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_KEY)
    }
  })

  // ── The formalized TRUST-02 degradation ladder, locked as a table ────────────────
  // EVERY failure mode maps to the IDENTICAL deterministic §4 result ($100.00, A=10/
  // B=8/C=2), verified:false, source:'deterministic-fallback'. keyless / malformed /
  // zod-invalid / disagreement / SDK-error / timeout — all the same.
  it('degradation ladder: all six failure modes clear the deterministic §4 result ($100.00)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const det = computeClearing(SECTION4_VIEWS)

    // Each entry builds a fresh agent for one rung of the ladder.
    const rungs: { mode: string; make: () => { proposeClearing: (v: OrderView[]) => Promise<AgentResult> } }[] = [
      {
        mode: 'keyless',
        make: () => createAgent({ computeClearing, matchedAt }),
      },
      {
        mode: 'malformed',
        make: () =>
          createAgent({
            client: fakeClientReturning({
              allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
              rationale: 'no price field',
            }),
            computeClearing,
            matchedAt,
          }),
      },
      {
        mode: 'zod-invalid',
        make: () =>
          createAgent({
            client: fakeClientReturning({
              clearingPrice: 100,
              allocations: [{ desk: 'BankA', side: 'Hold', filledQty: 10 }], // not Buy|Sell
              rationale: 'bad side',
            }),
            computeClearing,
            matchedAt,
          }),
      },
      {
        mode: 'disagreement',
        make: () =>
          createAgent({
            client: fakeClientReturning({
              clearingPrice: 99, // WRONG — §4 clears at 100.00
              allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
              rationale: 'bogus',
            }),
            computeClearing,
            matchedAt,
          }),
      },
      {
        mode: 'sdk-error',
        make: () => createAgent({ client: fakeClientThrowing(), computeClearing, matchedAt }),
      },
      {
        mode: 'timeout',
        make: () => createAgent({ client: fakeClientNeverResolving(), computeClearing, matchedAt, timeoutMs: 20 }),
      },
    ]

    for (const rung of rungs) {
      const r = await rung.make().proposeClearing(SECTION4_VIEWS)
      expect(r.source, rung.mode).toBe('deterministic-fallback')
      expect(r.verified, rung.mode).toBe(false)
      expect(r.clearingPrice, rung.mode).toBe(100) // the §4 canary — identical on every rung
      expect(r.matchedVolume, rung.mode).toBe(10)
      expect(r.allocations, rung.mode).toEqual(det.allocations)
      expect(JSON.stringify(r), rung.mode).not.toContain(SENTINEL_KEY)
    }
  })
})

// ── WOW-03: server-side natural-language order parsing (structured output + zod) ────
describe('AI Solver Agent — parseOrder (NL → validated {side,qty,limit})', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('valid: a well-formed structured order → the typed {side,qty,limit}', async () => {
    const client = fakeClientReturning({ side: 'Buy', qty: 10, limit: 101 })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const order = await agent.parseOrder('buy up to 10 under 101')

    expect(order).toEqual({ side: 'Buy', qty: 10, limit: 101 })
    // The key sentinel the fake client closes over never rides out in the result.
    expect(JSON.stringify(order)).not.toContain(SENTINEL_KEY)
  })

  it('valid: a Sell order with a floor limit → the typed object', async () => {
    const client = fakeClientReturning({ side: 'Sell', qty: 8, limit: 99 })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const order = await agent.parseOrder('sell 8, no less than 99')

    expect(order).toEqual({ side: 'Sell', qty: 8, limit: 99 })
  })

  it('malformed: a non-order payload (zod safeParse fails) → null', async () => {
    // qty 0 (not positive) + a missing side → the verify-side zod rejects it.
    const client = fakeClientReturning({ qty: 0, limit: -5 })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const order = await agent.parseOrder('what is the weather today?')

    expect(order).toBeNull()
  })

  it('malformed: a non-integer qty → null', async () => {
    const client = fakeClientReturning({ side: 'Buy', qty: 10.5, limit: 101 })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const order = await agent.parseOrder('buy ten and a half')

    expect(order).toBeNull()
  })

  it('keyless: no client injected → null (key never leaves the server)', async () => {
    const agent = createAgent({ computeClearing, matchedAt })
    const order = await agent.parseOrder('buy up to 10 under 101')

    expect(order).toBeNull()
  })

  it('unavailable: the SDK throws → null, never rejects, no secret leak', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = fakeClientThrowing()
    const agent = createAgent({ client, computeClearing, matchedAt })
    const order = await agent.parseOrder('buy up to 10 under 101')

    expect(order).toBeNull()
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_KEY)
    }
  })
})

// ── WOW-04: streamRationale (messages.stream → onDelta/onDone/onError) ───────────────
describe('AI Solver Agent — streamRationale (live rationale as text deltas)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // A fake MessageStream: registers the text cb via .on, then fires the deltas when
  // finalMessage() awaits (mirrors the real SDK where deltas arrive during streaming).
  const fakeStreamClient = (deltas: string[]) => {
    let onText: (d: string) => void = () => {}
    const stream = {
      on(_event: 'text', cb: (d: string) => void) {
        onText = cb
        return stream
      },
      async finalMessage() {
        void SENTINEL_KEY // held in the closure exactly as the real key is; never leaks
        for (const d of deltas) onText(d)
        return {}
      },
    }
    return {
      messages: {
        parse: vi.fn(async () => ({ parsed_output: null })),
        stream: vi.fn(() => stream),
      },
    }
  }

  const fakeStreamThrowing = () => ({
    messages: {
      parse: vi.fn(async () => ({ parsed_output: null })),
      stream: vi.fn(() => {
        void SENTINEL_KEY
        throw new Error('stream boom')
      }),
    },
  })

  it('forwards each text delta then calls onDone (no onError)', async () => {
    const client = fakeStreamClient(['Cleared ', 'at 100.00.'])
    const agent = createAgent({ client, computeClearing, matchedAt })

    const deltas: string[] = []
    let done = false
    let errored = false
    await agent.streamRationale(SECTION4_VIEWS, {
      onDelta: (d) => deltas.push(d),
      onDone: () => {
        done = true
      },
      onError: () => {
        errored = true
      },
    })

    expect(deltas).toEqual(['Cleared ', 'at 100.00.'])
    expect(done).toBe(true)
    expect(errored).toBe(false)
  })

  it('keyless: no client injected → onError exactly once, no delta/done, no network', async () => {
    const agent = createAgent({ computeClearing, matchedAt })

    let deltas = 0
    let done = 0
    let err = 0
    await agent.streamRationale(SECTION4_VIEWS, {
      onDelta: () => {
        deltas++
      },
      onDone: () => {
        done++
      },
      onError: () => {
        err++
      },
    })

    expect(deltas).toBe(0)
    expect(done).toBe(0)
    expect(err).toBe(1)
  })

  it('stream error → onError, never throws, no secret leak in logs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = fakeStreamThrowing()
    const agent = createAgent({ client, computeClearing, matchedAt })

    let err = 0
    // RESOLVES (never rejects) even though the underlying stream threw.
    await agent.streamRationale(SECTION4_VIEWS, {
      onDelta: () => {},
      onDone: () => {},
      onError: () => {
        err++
      },
    })

    expect(err).toBe(1)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_KEY)
    }
  })
})

// ── ADJ-01: proposeCompeting — competing AI solvers, refereed by deterministic §8 ────
// N configs race; the deterministic §8 recompute is the REFEREE — a proposal is
// eligible/`verified` ONLY when it equals the deterministic result (priceEqual &&
// allocationsEqual). The leaderboard ranks the verified set by (matchedVolume desc,
// surplus desc); the winner is NARRATIVE, never a settlement input. A failing/timeout
// config degrades to `verified:false` (excluded from the ranking) and never throws.
describe('AI Solver Agent — proposeCompeting (competing solvers, deterministic referee)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The correct §4 proposal (matches the deterministic result exactly).
  const CORRECT = {
    clearingPrice: 100,
    allocations: [
      { desk: 'BankA', side: 'Buy', filledQty: 10 },
      { desk: 'BankB', side: 'Sell', filledQty: 8 },
      { desk: 'BankC', side: 'Sell', filledQty: 2 },
    ],
    rationale: 'Cleared at 100.00 — maximizes matched volume at 10 units.',
  }

  // A fake client that returns a per-model parsed_output (each config calls parse with
  // its own `model`, so the fake can make some configs agree and others diverge/fail).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fakeByModel = (byModel: Record<string, unknown>, throwing: string[] = []) => ({
    messages: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parse: vi.fn(async (args: any) => {
        void SENTINEL_KEY // closed over exactly as the real key is; must never leak
        if (throwing.includes(args.model)) throw new Error('network')
        return { parsed_output: byModel[args.model] ?? null }
      }),
    },
  })

  const CONFIGS: SolverConfig[] = [
    { id: 'haiku', model: 'claude-haiku-4-5', temperature: 0 },
    { id: 'sonnet', model: 'claude-sonnet-4-6', temperature: 0 },
    { id: 'rogue', model: 'claude-opus-4-8', temperature: 1 },
  ]

  it('referee gate: only equal-to-deterministic proposals are verified (a diverging one is excluded)', async () => {
    const client = fakeByModel({
      'claude-haiku-4-5': { ...CORRECT, rationale: 'haiku says 100.00' },
      'claude-sonnet-4-6': { ...CORRECT, rationale: 'sonnet says 100.00' },
      // rogue diverges — WRONG price → gate rejects → excluded from the leaderboard.
      'claude-opus-4-8': {
        clearingPrice: 99,
        allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
        rationale: 'rogue says 99',
      },
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const res: CompetingResult = await agent.proposeCompeting(SECTION4_VIEWS, CONFIGS)

    // Two verified (haiku, sonnet); the diverging rogue is excluded from the ranking.
    expect(res.leaderboard).toHaveLength(2)
    expect(res.leaderboard.every((p) => p.verified)).toBe(true)
    expect(res.leaderboard.map((p) => p.config.id).sort()).toEqual(['haiku', 'sonnet'])

    // The winner is a verified proposal (narrative), never null here.
    expect(res.winner).not.toBeNull()
    expect(res.winner?.verified).toBe(true)

    // rogue appears among the honest per-config entries as verified:false, excluded above.
    const rogue = res.entries.find((e) => e.config.id === 'rogue')
    expect(rogue?.verified).toBe(false)
  })

  it('deterministic block carries the authoritative §8 numbers ($100.00 / A=10 B=8 C=2)', async () => {
    const client = fakeByModel({
      'claude-haiku-4-5': CORRECT,
      'claude-sonnet-4-6': CORRECT,
      'claude-opus-4-8': CORRECT,
    })
    const agent = createAgent({ client, computeClearing, matchedAt })
    const res = await agent.proposeCompeting(SECTION4_VIEWS, CONFIGS)

    const det = computeClearing(SECTION4_VIEWS)
    expect(res.deterministic.clearingPrice).toBe(100)
    expect(res.deterministic.matchedVolume).toBe(10)
    expect(res.deterministic.allocations).toEqual(det.allocations)
    // §4 surplus: A (101−100)·10 + B (100−99)·8 + C (100−100)·2 = 18.
    expect(res.deterministic.surplus).toBe(18)
  })

  it('a throwing config degrades to verified:false, is excluded, and proposeCompeting never throws', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = fakeByModel({ good: CORRECT }, ['boom'])
    const agent = createAgent({ client, computeClearing, matchedAt })

    const res = await agent.proposeCompeting(SECTION4_VIEWS, [
      { id: 'good', model: 'good', temperature: 0 },
      { id: 'boom', model: 'boom', temperature: 0 },
    ])

    expect(res.leaderboard).toHaveLength(1)
    expect(res.leaderboard[0].config.id).toBe('good')
    const boom = res.entries.find((e) => e.config.id === 'boom')
    expect(boom?.verified).toBe(false)

    // The API-key sentinel never leaks into the result nor any captured log line.
    expect(JSON.stringify(res)).not.toContain(SENTINEL_KEY)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_KEY)
    }
  })

  it('a hanging config times out → verified:false, never hangs, winner still the good config', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = {
      messages: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parse: vi.fn((args: any) =>
          args.model === 'slow'
            ? new Promise<{ parsed_output: unknown }>(() => {
                void SENTINEL_KEY /* never resolves */
              })
            : Promise.resolve({ parsed_output: CORRECT }),
        ),
      },
    }
    // A tiny deadline so the slow config trips the timeout fast.
    const agent = createAgent({ client, computeClearing, matchedAt, timeoutMs: 20 })

    const res = await agent.proposeCompeting(SECTION4_VIEWS, [
      { id: 'fast', model: 'fast', temperature: 0 },
      { id: 'slow', model: 'slow', temperature: 0 },
    ])

    expect(res.leaderboard).toHaveLength(1)
    expect(res.leaderboard[0].config.id).toBe('fast')
    expect(res.entries.find((e) => e.config.id === 'slow')?.verified).toBe(false)
    expect(res.winner?.config.id).toBe('fast')
  })

  it('keyless: no client injected → no verified proposals, winner null, deterministic still $100.00', async () => {
    const agent = createAgent({ computeClearing, matchedAt })
    const res = await agent.proposeCompeting(SECTION4_VIEWS, CONFIGS)

    expect(res.leaderboard).toHaveLength(0)
    expect(res.winner).toBeNull()
    expect(res.deterministic.clearingPrice).toBe(100)
    // Every entry degraded to verified:false (keyless), none ranked.
    expect(res.entries.every((e) => !e.verified)).toBe(true)
  })

  it('rankProposals: verified set sorted by (matchedVolume desc, surplus desc); unverified excluded', () => {
    const mk = (id: string, verified: boolean, matched: number, surplus: number): RankedProposal => ({
      config: { id, model: 'm', temperature: 0 },
      verified,
      clearingPrice: 100,
      matchedVolume: matched,
      surplus,
      rationale: '',
    })
    const ranked = rankProposals([
      mk('low', true, 8, 5),
      mk('high', true, 10, 1),
      mk('mid', true, 10, 3),
      mk('bad', false, 99, 99), // unverified — must be excluded entirely
    ])
    // matched desc (10,10,8); among the 10s surplus desc (mid 3 > high 1).
    expect(ranked.map((r) => r.config.id)).toEqual(['mid', 'high', 'low'])
    expect(ranked.every((r) => r.verified)).toBe(true)
  })

  it('computeSurplus: §4 total gains-from-trade = 18 at the $100.00 clear', () => {
    const det = computeClearing(SECTION4_VIEWS)
    expect(computeSurplus(SECTION4_VIEWS, det.allocations, det.clearingPrice)).toBe(18)
  })
})
