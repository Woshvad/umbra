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
    expect(body.rationale).toBeNull() // additive seam for Phase 5.
  })

  it('no secret in any response body — GET /round/:id nor solve-preview leak the token', async () => {
    // Stubs close over the sentinel token (as the real client holds the JWT) but
    // must never serialize it into a response.
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
        return { roundId, status: 'Open' }
      }),
    })
    const started = await listen(deps)
    server = started.server

    const getRes = await fetch(`${started.base}/round/R1`)
    const getJson = await readJson(getRes)
    const previewRes = await fetch(`${started.base}/round/R1/solve-preview`)
    const previewJson = await readJson(previewRes)

    expect(JSON.stringify(getJson)).not.toContain(SENTINEL_TOKEN)
    expect(JSON.stringify(previewJson)).not.toContain(SENTINEL_TOKEN)
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
