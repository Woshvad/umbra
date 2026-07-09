// solver/src/api.test.ts — the executable contract for the §11 HTTP surface.
//
// Drives the Express app built by `createApp` with STUBBED ledger deps (no live
// sandbox) over Node's built-in `fetch` against an ephemeral `app.listen(0)` server.
// The pure §8 helpers (auction.ts) are the REAL implementations so solve-preview
// proves the deterministic §4 clearing (100.00 / matchedVolume 10) end-to-end.
//
// Proven here:
//   • GET /round/:id calls refreshStats → solver-maintained sealedOrderCount (BLOCKER).
//   • solve-preview returns 100.00 + matchedVolume 10 + curve + rationale:null (CLEAR-02).
//   • No serialized response ever contains the sentinel operator-token (SOLV-04 / T-04-04).
//   • POST /settle on an already-Settled round → 409 envelope (T-04-06).
//   • CORS allows http://localhost:5173 and never '*' for a foreign origin (T-04-09).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import {
  computeClearing,
  matchedAt,
  demandAt,
  supplyAt,
  candidatePrices,
  type OrderView,
} from './auction.js'
import type { AgentResult } from './agent.js'
import { composeBrief } from './brief.js'
import {
  createApp,
  type AppDeps,
  type SealedOrder,
  type RoundView,
  type SettleResult,
} from './api.js'

// The §4 canonical fixture: A Buy 10 @101, B Sell 8 @99, C Sell 5 @100 → clears 100,
// matchedVolume = min(demand@100=10, supply@100=13) = 10.
const SECTION4_VIEWS: OrderView[] = [
  { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
  { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
  { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
]

const SECTION4_SEALED: SealedOrder[] = SECTION4_VIEWS.map((view, i) => ({
  contractId: `#order-${i}`,
  view,
}))

// A sentinel operator token — the secret that MUST NEVER appear in any response body.
// (Stubs close over it the way the real ledger client holds the module-private JWT.)
const SENTINEL_TOKEN = 'SENTINEL-OPERATOR-TOKEN-do-not-leak-7f3a9b'

// A sentinel ANTHROPIC_API_KEY — the agent's secret. proposeClearing stubs close over
// it the way agent.ts holds the module-private key; it must NEVER reach any response.
const SENTINEL_API_KEY = 'sk-ant-SENTINEL-API-KEY-do-not-leak-9c4e2d'

// The deterministic §4 result the agent returns on the fallback path (no key / mismatch /
// SDK error). The NUMBERS are always deterministic; only `rationale`/`verified`/`source`
// distinguish the fallback from the verified-claude path.
const FALLBACK_AGENT_RESULT = (): AgentResult => {
  const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
  return {
    clearingPrice,
    allocations,
    matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
    rationale: 'Cleared at 100.00 by the deterministic §8 algorithm (no AI rationale).',
    verified: false,
    source: 'deterministic-fallback',
  }
}

// Build a deps object with the REAL §8 helpers + caller-supplied ledger stubs.
const makeDeps = (overrides: Partial<AppDeps>): AppDeps => ({
  // Ledger stubs — defaults are inert; tests override per scenario.
  openRound: vi.fn(async (roundId: string): Promise<RoundView> => ({
    roundId,
    status: 'Open',
    openedAt: '2026-06-26T00:00:00Z',
    windowSeconds: 60,
  })),
  queryRound: vi.fn(async (roundId: string): Promise<RoundView | null> => ({
    roundId,
    status: 'Open',
  })),
  readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => []),
  refreshStats: vi.fn(async (): Promise<number> => 0),
  closeRound: vi.fn(async (): Promise<string> => 'Closed'),
  settle: vi.fn(async (): Promise<SettleResult> => ({ clearingPrice: 100, allocations: [] })),
  // Post-settle reconstruction source — default empty; the settled-GET test overrides it.
  readTradeConfirmations: vi.fn(async () => []),
  // Agent stub — defaults to the deterministic fallback (keyless degradation); tests
  // override per scenario to assert the verified-claude path.
  proposeClearing: vi.fn(async (): Promise<AgentResult> => FALLBACK_AGENT_RESULT()),
  // NL parse stub — defaults to null (keyless / unparseable); /parse-order tests override.
  parseOrder: vi.fn(async (): Promise<{ side: 'Buy' | 'Sell'; qty: number; limit: number } | null> => null),
  // WOW-04: default stream stub — no deltas, immediate completion; SSE tests override.
  streamRationale: vi.fn(
    async (
      _views: OrderView[],
      handlers: { onDelta: (d: string) => void; onDone: () => void; onError: () => void },
    ): Promise<void> => {
      handlers.onDone()
    },
  ),
  // WOW-04: the REAL brief composer (pure) so the settled-body brief is genuine.
  composeBrief,
  // Real pure §8 helpers — solve-preview asserts true deterministic clearing.
  computeClearing,
  matchedAt,
  demandAt,
  supplyAt,
  candidatePrices,
  ...overrides,
})

// fetch().json() is typed `unknown` under strict TS — read it as a loose record so
// the response-shape assertions below stay readable (the tests ARE the type check).
const readJson = async (res: Response): Promise<Record<string, any>> =>
  (await res.json()) as Record<string, any>

// Spin the app on an ephemeral port and yield its base URL + teardown.
const listen = (deps: AppDeps): Promise<{ base: string; server: Server }> =>
  new Promise((resolve) => {
    const server = createApp(deps).listen(0, () => {
      const { port } = server.address() as AddressInfo
      resolve({ base: `http://127.0.0.1:${port}`, server })
    })
  })

describe('solver §11 HTTP API', () => {
  let server: Server | undefined

  beforeEach(() => {
    server = undefined
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  it('GET /round/:id refreshes the sealed-order count (solver-maintained, not a seed)', async () => {
    // refreshStats recomputes 3 from 3 stubbed sealed orders; the GET must return THAT.
    const refreshStats = vi.fn(async (): Promise<number> => 3)
    const deps = makeDeps({
      refreshStats,
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Open' })),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.sealedOrderCount).toBe(3)
    // The BLOCKER assertion: the count came FROM refreshStats, called with the round id.
    expect(refreshStats).toHaveBeenCalledWith('R1')
    expect(refreshStats.mock.calls.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /round/:id/solve-preview returns deterministic §4 clearing + matchedVolume', async () => {
    const deps = makeDeps({
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/solve-preview`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.clearingPrice).toBe(100) // §4 canary — 100.00.
    expect(body.matchedVolume).toBe(10) // traded volume at p* (WARNING fix).
    expect(Array.isArray(body.allocations)).toBe(true)
    expect(body.allocations.length).toBeGreaterThan(0)
    expect(Array.isArray(body.curve)).toBe(true)
    expect(body.curve.length).toBeGreaterThan(0)
    // curve points carry {price, demand, supply} for the P6 SVG chart.
    expect(body.curve[0]).toHaveProperty('price')
    expect(body.curve[0]).toHaveProperty('demand')
    expect(body.curve[0]).toHaveProperty('supply')
    // P5: rationale is now POPULATED (was null in P4) + an additive agent block.
    expect(body.rationale).not.toBeNull()
    expect(typeof body.rationale).toBe('string')
    expect(body.agent).toBeDefined()
    expect(body.agent).toHaveProperty('verified')
    expect(body.agent).toHaveProperty('source')
  })

  it('GET /round/:id/solve-preview surfaces the agent rationale + block (verified:true)', async () => {
    const rationale = 'Cleared at 100.00: maximizes matched volume at 10 units; BankB filled first on price priority, BankC partially filled.'
    const proposeClearing = vi.fn(async (): Promise<AgentResult> => {
      const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
      return {
        clearingPrice,
        allocations,
        matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
        rationale,
        verified: true,
        source: 'claude',
      }
    })
    const deps = makeDeps({
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      proposeClearing,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/solve-preview`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    // Deterministic numbers UNCHANGED (P4 backward-compat).
    expect(body.clearingPrice).toBe(100)
    expect(body.matchedVolume).toBe(10)
    expect(Array.isArray(body.curve)).toBe(true)
    expect(body.curve.length).toBeGreaterThan(0)
    // The agent's rationale + provenance block.
    expect(body.rationale).toBe(rationale)
    expect(body.agent).toEqual({ verified: true, source: 'claude' })
    // proposeClearing was called with the sealed views.
    expect(proposeClearing).toHaveBeenCalledTimes(1)
    expect(proposeClearing).toHaveBeenCalledWith(SECTION4_VIEWS)
  })

  it('GET /round/:id/solve-preview deterministic-fallback shape (verified:false)', async () => {
    const proposeClearing = vi.fn(async (): Promise<AgentResult> => {
      const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
      return {
        clearingPrice,
        allocations,
        matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
        rationale: 'Cleared at 100.00 by the deterministic §8 algorithm (no AI rationale).',
        verified: false,
        source: 'deterministic-fallback',
      }
    })
    const deps = makeDeps({
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      proposeClearing,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/solve-preview`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    // P4 numbers unchanged even on the fallback path.
    expect(body.clearingPrice).toBe(100)
    expect(body.matchedVolume).toBe(10)
    // Non-null neutral rationale + the fallback provenance.
    expect(body.rationale).not.toBeNull()
    expect(typeof body.rationale).toBe('string')
    expect(body.agent).toEqual({ verified: false, source: 'deterministic-fallback' })
  })

  it('GET /round/:id terminal-status branch surfaces rationale + agent block', async () => {
    const rationale = 'Cleared at 100.00 on the deterministic §8 result, settled atomically.'
    const proposeClearing = vi.fn(async (): Promise<AgentResult> => {
      const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
      return {
        clearingPrice,
        allocations,
        matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
        rationale,
        verified: true,
        source: 'claude',
      }
    })
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Settled' })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      refreshStats: vi.fn(async (): Promise<number> => 3),
      proposeClearing,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('Settled')
    // Deterministic fields (P4 unchanged).
    expect(body.clearingPrice).toBe(100)
    expect(body.matchedVolume).toBe(10)
    expect(Array.isArray(body.allocations)).toBe(true)
    expect(Array.isArray(body.curve)).toBe(true)
    // P5: rationale (non-null) + agent block.
    expect(body.rationale).toBe(rationale)
    expect(body.agent).toEqual({ verified: true, source: 'claude' })
  })

  it('GET /round/:id post-settle reconstructs from TradeConfirmations (orders retired — not a §8 recompute reading 0)', async () => {
    // After settle, Round.Clear retires the sealed Orders, so readSealedOrders is empty;
    // a §8 recompute on the empty book would read clearingPrice 0 (the bug). The result
    // must instead come from the persisted per-desk TradeConfirmations.
    const confs = [
      { desk: 'bankA::x', side: 'Buy' as const, filledQty: 10, clearingPrice: 100 },
      { desk: 'bankB::x', side: 'Sell' as const, filledQty: 8, clearingPrice: 100 },
      { desk: 'bankC::x', side: 'Sell' as const, filledQty: 2, clearingPrice: 100 },
    ]
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Settled' })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => []), // retired
      refreshStats: vi.fn(async (): Promise<number> => 0),
      readTradeConfirmations: vi.fn(async () => confs),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('Settled')
    // Reconstructed settled facts — NOT 0.
    expect(body.clearingPrice).toBe(100)
    expect(body.matchedVolume).toBe(10) // sum of the Buy-side filledQty
    expect(body.allocations).toHaveLength(3)
    expect(body.curve).toEqual([]) // the curve needs the original orders (retired)
    expect(typeof body.rationale).toBe('string')
    expect(body.rationale).toContain('Settled at 100.00')
    expect(body.agent).toEqual({ verified: true, source: 'deterministic-fallback' })
  })

  it('no secret in any response body — GET /round/:id nor solve-preview leak the operator token or ANTHROPIC_API_KEY', async () => {
    // Stubs close over the sentinel operator token (as the real client holds the JWT)
    // AND the sentinel ANTHROPIC_API_KEY (as agent.ts holds the module-private key) but
    // must never serialize either into a response.
    const proposeClearing = vi.fn(async (): Promise<AgentResult> => {
      void SENTINEL_API_KEY // agent closes over the key, must NOT reach the wire
      const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
      return {
        clearingPrice,
        allocations,
        matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
        rationale: 'Cleared at 100.00 on the deterministic §8 result.',
        verified: true,
        source: 'claude',
      }
    })
    const deps = makeDeps({
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => {
        void SENTINEL_TOKEN // referenced in scope, must NOT reach the wire
        return SECTION4_SEALED
      }),
      refreshStats: vi.fn(async (): Promise<number> => {
        void SENTINEL_TOKEN
        return 3
      }),
      queryRound: vi.fn(async (roundId: string) => {
        void SENTINEL_TOKEN
        return { roundId, status: 'Settled' }
      }),
      proposeClearing,
    })
    const started = await listen(deps)
    server = started.server

    const getRes = await fetch(`${started.base}/round/R1`)
    const getJson = await readJson(getRes)
    const previewRes = await fetch(`${started.base}/round/R1/solve-preview`)
    const previewJson = await readJson(previewRes)

    expect(JSON.stringify(getJson)).not.toContain(SENTINEL_TOKEN)
    expect(JSON.stringify(previewJson)).not.toContain(SENTINEL_TOKEN)
    // The extended ANTHROPIC_API_KEY sentinel sweep — neither response carries the key.
    expect(JSON.stringify(getJson)).not.toContain(SENTINEL_API_KEY)
    expect(JSON.stringify(previewJson)).not.toContain(SENTINEL_API_KEY)
  })

  it('POST /parse-order returns the zod-validated order (200) for well-formed English', async () => {
    const parseOrder = vi.fn(async () => ({ side: 'Buy' as const, qty: 10, limit: 101 }))
    const deps = makeDeps({ parseOrder })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/parse-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'buy up to 10 under 101' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ side: 'Buy', qty: 10, limit: 101 })
    expect(parseOrder).toHaveBeenCalledWith('buy up to 10 under 101')
  })

  it('POST /parse-order returns 422 when the parser cannot produce an order (null)', async () => {
    const parseOrder = vi.fn(async () => null) // keyless / unparseable
    const deps = makeDeps({ parseOrder })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/parse-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'what is the weather today?' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(422)
    expect(body).toHaveProperty('error')
    expect(body.error).toHaveProperty('code', 'PARSE_FAILED')
    expect(body.error).toHaveProperty('message')
  })

  it('POST /parse-order rejects a malformed body (missing text) with 400', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/parse-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error).toHaveProperty('code', 'INVALID_BODY')
    // The parser must NOT be called for an invalid body.
    expect(deps.parseOrder).not.toHaveBeenCalled()
  })

  it('POST /parse-order rejects an oversized body (text > 280 chars) with 400', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/parse-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(281) }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error).toHaveProperty('code', 'INVALID_BODY')
    expect(deps.parseOrder).not.toHaveBeenCalled()
  })

  it('POST /parse-order never echoes the ANTHROPIC_API_KEY (secret sweep on the new endpoint)', async () => {
    // The parseOrder stub closes over the sentinel key exactly as agent.ts holds the real
    // one; neither a 200 order nor a 422 error may serialize it.
    const parseOrder = vi.fn(async (text: string) => {
      void SENTINEL_API_KEY // held in the closure, must NOT reach the wire
      return text.startsWith('buy') ? { side: 'Buy' as const, qty: 10, limit: 101 } : null
    })
    const deps = makeDeps({ parseOrder })
    const started = await listen(deps)
    server = started.server

    const okRes = await fetch(`${started.base}/parse-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'buy up to 10 under 101' }),
    })
    const okJson = await readJson(okRes)
    const failRes = await fetch(`${started.base}/parse-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'gibberish' }),
    })
    const failJson = await readJson(failRes)

    expect(okRes.status).toBe(200)
    expect(failRes.status).toBe(422)
    // Neither the parsed order nor the failure envelope carries the key sentinel.
    expect(JSON.stringify(okJson)).not.toContain(SENTINEL_API_KEY)
    expect(JSON.stringify(failJson)).not.toContain(SENTINEL_API_KEY)
  })

  it('GET /round/:id/rationale-stream emits each delta then the done sentinel (SSE)', async () => {
    // A mocked streamRationale that forwards two deltas then completes.
    const streamRationale = vi.fn(
      async (
        _views: OrderView[],
        handlers: { onDelta: (d: string) => void; onDone: () => void; onError: () => void },
      ): Promise<void> => {
        handlers.onDelta('Cleared ')
        handlers.onDelta('at 100.00.')
        handlers.onDone()
      },
    )
    const deps = makeDeps({
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      streamRationale,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/rationale-stream`)
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    // Both deltas arrived as their own data: frames (JSON-encoded), then the done sentinel.
    expect(text).toContain('data: "Cleared "')
    expect(text).toContain('data: "at 100.00."')
    expect(text).toContain('event: done')
    // The stream was driven from the round's own sealed views.
    expect(streamRationale).toHaveBeenCalledWith(SECTION4_VIEWS, expect.anything())
  })

  it('GET /round/:id/rationale-stream error path → ONE deterministic fallback frame, no key', async () => {
    // The stream closes over the sentinel key (as agent.ts holds the real one) then errors;
    // the route must emit exactly one secret-free fallback frame (the browser still gets text).
    const streamRationale = vi.fn(
      async (
        _views: OrderView[],
        handlers: { onDelta: (d: string) => void; onDone: () => void; onError: () => void },
      ): Promise<void> => {
        void SENTINEL_API_KEY // held in the closure, must NOT reach the wire
        handlers.onError()
      },
    )
    const deps = makeDeps({
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      streamRationale,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/rationale-stream`)
    const text = await res.text()

    expect(res.status).toBe(200)
    // EXACTLY one data: frame (the deterministic single-shot fallback) — no done sentinel.
    const dataFrames = text.split('\n\n').filter((f) => f.startsWith('data:'))
    expect(dataFrames).toHaveLength(1)
    expect(dataFrames[0]).toContain('$100.00') // the §4 deterministic brief
    expect(text).not.toContain('event: done')
    // The key sentinel never appears in the streamed bytes.
    expect(text).not.toContain(SENTINEL_API_KEY)
  })

  it('GET /round/:id (settled) surfaces a shareable brief with no secret (WOW-04)', async () => {
    const rationale = 'Cleared at 100.00 on the deterministic §8 result, settled atomically.'
    const proposeClearing = vi.fn(async (): Promise<AgentResult> => {
      void SENTINEL_API_KEY
      const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
      return {
        clearingPrice,
        allocations,
        matchedVolume: matchedAt(SECTION4_VIEWS, clearingPrice),
        rationale,
        verified: true,
        source: 'claude',
      }
    })
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Settled' })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      refreshStats: vi.fn(async (): Promise<number> => 3),
      proposeClearing,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    // The additive brief is present, names the $100.00 clear, and carries no secret.
    expect(typeof body.brief).toBe('string')
    expect(body.brief).toContain('$100.00')
    expect(body.brief).toContain(rationale)
    expect(JSON.stringify(body)).not.toContain(SENTINEL_API_KEY)
  })

  it('POST /round/:id/settle returns 409 on double-settle (round already Settled)', async () => {
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Settled' })),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/settle`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(409)
    expect(body).toHaveProperty('error')
    expect(body.error).toHaveProperty('code')
    expect(body.error).toHaveProperty('message')
    // settle must NOT have been invoked for an already-terminal round.
    expect(deps.settle).not.toHaveBeenCalled()
  })

  it('POST /round/:id/settle settles a closed round and returns the verified §4 result', async () => {
    const { allocations } = computeClearing(SECTION4_VIEWS)
    const settle = vi.fn(async (): Promise<SettleResult> => ({
      clearingPrice: 100,
      allocations,
      matchedVolume: 10,
      txConfirmations: 1,
    }))
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Closed' })),
      settle,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/settle`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('Settled')
    expect(body.clearingPrice).toBe(100)
    expect(body.matchedVolume).toBe(10)
    expect(Array.isArray(body.allocations)).toBe(true)
    expect(body.txConfirmations).toBe(1)
    expect(settle).toHaveBeenCalledWith('R1')
  })

  it('POST /settle derives matchedVolume from Buy-side allocations when the result omits it (never reads the retired book)', async () => {
    const { allocations } = computeClearing(SECTION4_VIEWS)
    // The live settle ALWAYS sets matchedVolume; this stub omits it to exercise the
    // fallback. readSealedOrders THROWS — the handler must NOT touch the (retired) book.
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Closed' })),
      settle: vi.fn(async (): Promise<SettleResult> => ({ clearingPrice: 100, allocations })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => {
        throw new Error('settle handler must not read the retired order book')
      }),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/settle`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    // Σ Buy-side filledQty = 10 — reconstructed from the verified allocations, NOT a
    // recompute on the emptied book (which would read 0).
    expect(body.matchedVolume).toBe(10)
    expect(deps.readSealedOrders).not.toHaveBeenCalled()
  })

  it('CORS is scoped to http://localhost:5173 and never wildcard for a foreign origin', async () => {
    const deps = makeDeps({ refreshStats: vi.fn(async (): Promise<number> => 0) })
    const started = await listen(deps)
    server = started.server

    const allowed = await fetch(`${started.base}/round/R1`, {
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')

    const foreign = await fetch(`${started.base}/round/R1`, {
      headers: { Origin: 'http://evil.example' },
    })
    expect(foreign.headers.get('access-control-allow-origin')).not.toBe('*')
  })
})
