// solver/src/x402.wiring.test.ts — PAY-01 the whole-app wiring proof for the x402 gate.
//
// Where x402.test.ts proves the gate in isolation, THIS drives the REAL createApp (with the
// real per-route attachment) + the REAL buildDeps threading, to prove the two load-bearing
// invariants of Plan 03:
//
//   1. DEFAULT-OFF BYTE-UNCHANGED (the primary invariant): with NO x402 dep injected,
//      createApp installs a DISABLED no-op gate, so the two metered routes
//      (GET /round/:id/solve-preview + POST /competing) respond EXACTLY as before — never 402.
//   2. METERING ON = EXACTLY TWO ROUTES: an injected ENABLED gate makes both metered routes
//      402 with an accepts[] body, while every never-metered path (/health, /status,
//      GET /round/:id, POST /round/:id/settle, /sandbox/round) is NEVER 402 (T-14-11 free-path
//      allow-list). A secret sentinel never lands in a 402 body/header (T-14-12 secret-sweep).
//   3. BOOT THREADING: buildDeps({ x402 }) returns that same gate onto AppDeps; buildDeps with
//      no x402 leaves AppDeps.x402 undefined (so createApp's disabled default holds).

import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import {
  computeClearing,
  matchedAt,
  demandAt,
  supplyAt,
  candidatePrices,
  choosePStar,
  type OrderView,
} from './auction.js'
import type { CompetingResult } from './agent.js'
import { createApp, type AppDeps, type SealedOrder, type RoundView, type SettleResult } from './api.js'
import { createX402Gate, type FacilitatorClient, type PaymentGate } from './x402.js'
import { buildDeps, type BuildDepsArgs, type LedgerPort, type MathPort } from './index.js'
import type { Clock } from './clock.js'

// The §4 canonical fixture ($100.00 / matchedVolume 10) so the metered routes return the real
// deterministic clearing when the gate is a no-op.
const SECTION4_VIEWS: OrderView[] = [
  { desk: 'BankA', side: 'Buy', quantity: 10, limit: 101.0 },
  { desk: 'BankB', side: 'Sell', quantity: 8, limit: 99.0 },
  { desk: 'BankC', side: 'Sell', quantity: 5, limit: 100.0 },
]
const SECTION4_SEALED: SealedOrder[] = SECTION4_VIEWS.map((view, i) => ({ contractId: `#order-${i}`, view }))

// A minimal deps stub covering ONLY the routes this test drives (the two metered routes + the
// free-path allow-list). The pure §8 helpers are the REAL implementations. Cast through unknown
// because the full AppDeps surface is large and the un-exercised deps are never called here.
const makeDeps = (over?: Partial<AppDeps>): AppDeps =>
  ({
    readSealedOrders: async (): Promise<SealedOrder[]> => SECTION4_SEALED,
    refreshStats: async (): Promise<number> => SECTION4_SEALED.length,
    queryRound: async (roundId: string): Promise<RoundView | null> => ({ roundId, status: 'Open' }),
    settle: async (): Promise<SettleResult> => ({ clearingPrice: 100, allocations: [], matchedVolume: 10 }),
    proposeClearing: async () => ({
      clearingPrice: 100,
      allocations: [],
      matchedVolume: 10,
      rationale: 'deterministic §8',
      verified: false,
      source: 'deterministic-fallback' as const,
    }),
    proposeCompeting: async (views: OrderView[]): Promise<CompetingResult> => {
      const { clearingPrice, allocations } = computeClearing(views)
      return {
        winner: null,
        leaderboard: [],
        entries: [],
        deterministic: { clearingPrice, allocations, matchedVolume: matchedAt(views, clearingPrice), surplus: 0 },
      }
    },
    computeClearing,
    matchedAt,
    demandAt,
    supplyAt,
    candidatePrices,
    choosePStar,
    ...over,
  }) as unknown as AppDeps

// An ENABLED gate backed by a stub facilitator (never reached without an X-PAYMENT header, but
// present so the enabled path is exercised end-to-end).
const okFacilitator: FacilitatorClient = {
  verify: async () => ({ valid: true }),
  settle: async () => ({ settled: true, txRef: 'canton-update-0xabc' }),
}
const enabledGate = (over?: Partial<Parameters<typeof createX402Gate>[0]>): PaymentGate =>
  createX402Gate({
    facilitator: okFacilitator,
    enabled: true,
    network: 'canton:devnet',
    asset: 'CantonCoin',
    price: '1.00',
    payTo: 'venue::1220deadbeef',
    ...over,
  })

let server: Server | undefined
const listen = (deps: AppDeps): Promise<string> =>
  new Promise((resolve) => {
    server = createApp(deps).listen(0, () => {
      const { port } = server!.address() as AddressInfo
      resolve(`http://127.0.0.1:${port}`)
    })
  })

afterEach(
  () =>
    new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve())
        server = undefined
      } else resolve()
    }),
)

// Valid /competing body so the metering-OFF path reaches the handler (200, not a 400).
const competingBody = JSON.stringify({
  roundId: 'R1',
  configs: [{ id: 'c1', model: 'claude-haiku-4-5', temperature: 0 }],
})
const readJson = async (r: Response): Promise<any> => r.json()

describe('x402 whole-app wiring (createApp)', () => {
  it('byte-unchanged — NO x402 dep ⇒ the two metered routes respond normally (never 402)', async () => {
    const base = await listen(makeDeps())

    const preview = await fetch(`${base}/round/R1/solve-preview`)
    expect(preview.status).toBe(200)
    expect((await readJson(preview)).clearingPrice).toBe(100) // §4 canary — the money shot is untouched

    const competing = await fetch(`${base}/competing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: competingBody,
    })
    expect(competing.status).toBe(200)
    expect((await readJson(competing)).deterministic.clearingPrice).toBe(100)
  })

  it('metering on ⇒ EXACTLY the two metered routes 402 with an accepts[] body', async () => {
    const base = await listen(makeDeps({ x402: enabledGate() }))

    // GET /round/:id/solve-preview — 402 with a v1 accepts[] envelope.
    const preview = await fetch(`${base}/round/R1/solve-preview`)
    expect(preview.status).toBe(402)
    const pj = await readJson(preview)
    expect(pj.x402Version).toBe(1)
    expect(Array.isArray(pj.accepts)).toBe(true)
    expect(pj.accepts[0].asset).toBe('CantonCoin')

    // POST /competing — 402 BEFORE body validation (roundId is in the body; the gate keys off
    // req.originalUrl, so even an empty body 402s rather than 400).
    const competing = await fetch(`${base}/competing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: competingBody,
    })
    expect(competing.status).toBe(402)
    expect((await readJson(competing)).accepts[0].asset).toBe('CantonCoin')
  })

  it('free paths — /health, /status, GET /round/:id, POST /settle, /sandbox/round are NEVER 402 even with metering on', async () => {
    const base = await listen(makeDeps({ x402: enabledGate() }))

    const health = await fetch(`${base}/health`)
    expect(health.status).not.toBe(402)
    expect(health.status).toBe(200)

    const status = await fetch(`${base}/status`)
    expect(status.status).not.toBe(402)
    expect(status.status).toBe(200)

    const round = await fetch(`${base}/round/R1`)
    expect(round.status).not.toBe(402)
    expect(round.status).toBe(200)

    const settle = await fetch(`${base}/round/R1/settle`, { method: 'POST' })
    expect(settle.status).not.toBe(402) // 200/409 — settlement is NEVER metered (T-14-15)

    const sandbox = await fetch(`${base}/sandbox/round`, { method: 'POST' })
    expect(sandbox.status).not.toBe(402)
    expect(sandbox.status).toBe(201)
  })

  it('secret sweep — no operator/ANTHROPIC/facilitator-key sentinel lands in a 402 body or header', async () => {
    const SENTINEL = 'SENTINEL-FACILITATOR-KEY-do-not-leak-9f3c2a'
    // A misbehaving facilitator that tries to leak the sentinel through its reason string — the
    // gate must filter it to an authored secret-free reason before echoing (T-14-12).
    const leaky: FacilitatorClient = {
      verify: async () => ({ valid: false, reason: SENTINEL }),
      settle: async () => ({ settled: false, txRef: '' }),
    }
    const base = await listen(makeDeps({ x402: enabledGate({ facilitator: leaky }) }))

    const r = await fetch(`${base}/round/R1/solve-preview`, {
      headers: { Authorization: `Bearer ${SENTINEL}` },
    })
    expect(r.status).toBe(402)
    const text = await r.text()
    expect(text).not.toContain(SENTINEL)
    expect(r.headers.get('x-payment-response') ?? '').not.toContain(SENTINEL)
  })
})

// ── Boot threading (Task 2) ─────────────────────────────────────────────────
// buildDeps must thread an injected PaymentGate onto AppDeps.x402 and leave it undefined when
// none is passed (so createApp's `?? createX402Gate({ enabled: false })` default holds).
describe('buildDeps x402 threading', () => {
  // A minimal BuildDepsArgs — only the fields buildDeps reads to assemble AppDeps. The ledger /
  // math ports are inert stubs; this asserts ONLY the x402 threading, not the ledger wiring.
  const minimalArgs = (over?: Partial<BuildDepsArgs>): BuildDepsArgs =>
    ({
      ledger: {} as LedgerPort,
      math: { computeClearing, matchedAt, demandAt, supplyAt, candidatePrices, choosePStar } as MathPort,
      clock: { forceClose: async () => undefined, getState: () => undefined } as unknown as Clock,
      openRoundClock: () => undefined,
      roundSeconds: 60,
      proposeClearing: (async () => ({})) as unknown as BuildDepsArgs['proposeClearing'],
      parseOrder: (async () => null) as unknown as BuildDepsArgs['parseOrder'],
      proposeCompeting: (async () => ({})) as unknown as BuildDepsArgs['proposeCompeting'],
      streamRationale: (async () => undefined) as unknown as BuildDepsArgs['streamRationale'],
      composeBrief: (() => ({})) as unknown as BuildDepsArgs['composeBrief'],
      ...over,
    }) as BuildDepsArgs

  it('threads an injected PaymentGate onto AppDeps.x402', () => {
    const gate = createX402Gate({ enabled: false })
    const deps = buildDeps(minimalArgs({ x402: gate }))
    expect(deps.x402).toBe(gate)
  })

  it('leaves AppDeps.x402 undefined when none is injected (default-OFF holds)', () => {
    const deps = buildDeps(minimalArgs())
    expect(deps.x402).toBeUndefined()
  })
})
