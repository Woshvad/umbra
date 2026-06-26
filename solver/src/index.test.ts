// solver/src/index.test.ts — the injected-dep wiring proof for the boot path.
//
// The WARNING fix: the live open→close→settle gate (Task 3) needs a running
// `daml start` sandbox and cannot run headless. THIS test proves the one piece of
// boot wiring that does NOT need a sandbox — that `POST /round` triggers BOTH the
// ledger `openRound` AND the clock `openRoundClock` — by driving the SAME
// `buildDeps(...)` factory index.ts uses, with vi.fn() spies injected for both.
//
// Reuses the 04-03 api.test stub pattern: real createApp over stubbed deps, an
// ephemeral app.listen(0), and Node's built-in fetch. No live ledger.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import {
  computeClearing,
  matchedAt,
  demandAt,
  supplyAt,
  candidatePrices,
} from './auction.js'
import { createApp, type RoundView, type SealedOrder, type SettleResult } from './api.js'
import { buildDeps, type LedgerPort, type MathPort } from './index.js'
import type { AgentResult } from './agent.js'
import type { Clock, RoundState } from './clock.js'

const ROUND_SECONDS = 60

// The real §8 helpers (the API math is never stubbed — keeps shapes honest).
const math: MathPort = { computeClearing, matchedAt, demandAt, supplyAt, candidatePrices }

// A keyless-safe agent stub — buildDeps requires proposeClearing; the boot-wiring
// proofs below never exercise the terminal/solve-preview path, so a deterministic
// fallback stub suffices.
const proposeClearing = vi.fn(
  async (): Promise<AgentResult> => ({
    clearingPrice: 100,
    allocations: [],
    matchedVolume: 0,
    rationale: 'Cleared at 100.00 by the deterministic §8 algorithm.',
    verified: false,
    source: 'deterministic-fallback',
  }),
)

// A ledger port whose every function is a spy; defaults are inert.
const makeLedger = (overrides: Partial<LedgerPort> = {}): LedgerPort => ({
  openRound: vi.fn(
    async (roundId: string): Promise<RoundView> => ({
      roundId,
      status: 'Open',
      openedAt: '2026-06-26T00:00:00Z',
      windowSeconds: ROUND_SECONDS,
    }),
  ),
  queryRound: vi.fn(async (roundId: string): Promise<RoundView | null> => ({ roundId, status: 'Open' })),
  readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => []),
  refreshStats: vi.fn(async (): Promise<number> => 0),
  closeRound: vi.fn(async (): Promise<string> => 'Closed'),
  settle: vi.fn(async (): Promise<SettleResult> => ({ clearingPrice: 100, allocations: [] })),
  ...overrides,
})

// A minimal clock stub: openRoundClock is the spy under test; the rest are inert.
const makeClock = (
  openRoundClock: (roundId: string, windowSeconds: number) => RoundState,
): Clock => ({
  openRoundClock,
  forceClose: vi.fn(async () => undefined),
  getState: vi.fn((roundId: string): RoundState => ({
    roundId,
    status: 'Closed',
    openedAt: 0,
    deadline: 0,
  })),
  setStatus: vi.fn(),
  rehydrate: vi.fn(),
})

const readJson = async (res: Response): Promise<Record<string, any>> =>
  (await res.json()) as Record<string, any>

const listen = (app: ReturnType<typeof createApp>): Promise<{ base: string; server: Server }> =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo
      resolve({ base: `http://127.0.0.1:${port}`, server })
    })
  })

describe('solver boot wiring (buildDeps)', () => {
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

  it('POST /round triggers BOTH openRound (ledger) and openRoundClock (timer)', async () => {
    const ledger = makeLedger()

    // The spy under test — buildDeps wires openRound → openRoundClock(roundId, ROUND_SECONDS).
    const openRoundClock = vi.fn(
      (roundId: string): RoundState => ({
        roundId,
        status: 'Open',
        openedAt: 0,
        deadline: 0,
      }),
    )
    const clock = makeClock(openRoundClock)

    const deps = buildDeps({ ledger, math, clock, openRoundClock, roundSeconds: ROUND_SECONDS, proposeClearing })
    const app = createApp(deps)
    const started = await listen(app)
    server = started.server

    const res = await fetch(`${started.base}/round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId: 'R2', desks: ['BankA', 'BankB', 'BankC'] }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(body.roundId).toBe('R2')
    expect(body.status).toBe('Open')

    // The wiring proof: ledger create fired once...
    expect(ledger.openRound).toHaveBeenCalledTimes(1)
    expect(ledger.openRound).toHaveBeenCalledWith('R2', ['BankA', 'BankB', 'BankC'], expect.any(Number))

    // ...AND the clock timer started once, with the new round id + ROUND_SECONDS.
    expect(openRoundClock).toHaveBeenCalledTimes(1)
    expect(openRoundClock).toHaveBeenCalledWith('R2', ROUND_SECONDS)
  })

  it('POST /round/:id/close routes through clock.forceClose', async () => {
    const ledger = makeLedger()
    const openRoundClock = vi.fn(
      (roundId: string): RoundState => ({ roundId, status: 'Open', openedAt: 0, deadline: 0 }),
    )
    const clock = makeClock(openRoundClock)

    const deps = buildDeps({ ledger, math, clock, openRoundClock, roundSeconds: ROUND_SECONDS, proposeClearing })
    const started = await listen(createApp(deps))
    server = started.server

    const res = await fetch(`${started.base}/round/R2/close`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(clock.forceClose).toHaveBeenCalledWith('R2')
  })
})
