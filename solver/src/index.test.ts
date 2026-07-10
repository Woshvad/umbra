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
  choosePStar,
} from './auction.js'
import { createApp, type RoundView, type SealedOrder, type SettleResult } from './api.js'
import { buildDeps, bootTelemetry, type LedgerPort, type MathPort } from './index.js'
import { createAgent, type AgentClient, type AgentResult } from './agent.js'
import type { Clock, RoundState } from './clock.js'
import type { Webhooks, WebhookEvent, WebhookSubscription } from './webhooks.js'

const ROUND_SECONDS = 60

// The real §8 helpers (the API math is never stubbed — keeps shapes honest).
const math: MathPort = { computeClearing, matchedAt, demandAt, supplyAt, candidatePrices, choosePStar }

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

// WOW-03: buildDeps also threads the agent's NL parser; the boot-wiring proofs below
// never hit /parse-order, so a keyless-style null stub suffices.
const parseOrder = vi.fn(async (): Promise<{ side: 'Buy' | 'Sell'; qty: number; limit: number } | null> => null)

// WOW-04: buildDeps threads the rationale streamer + the brief composer; the boot-wiring
// proofs below never hit the SSE / terminal-GET paths, so inert stubs suffice.
const streamRationale = vi.fn(
  async (_views: unknown, handlers: { onError: () => void }): Promise<void> => {
    handlers.onError()
  },
)
const composeBrief = vi.fn((): string => 'brief')

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
  tamperClear: vi.fn(async (): Promise<{ rejected: true; error: string }> => ({ rejected: true, error: 'rejected' })),
  readTradeConfirmations: vi.fn(async () => []),
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

// OPS-04: a spy webhook emitter so the boot-wiring proof can assert round.opened fires off
// the open seam without any network. emit records (event, data); register/unregister inert.
const makeSpyWebhooks = (
  emit: (event: WebhookEvent, data: Record<string, unknown>) => Promise<void>,
): Webhooks => ({
  register: vi.fn((): WebhookSubscription => ({ id: 'sub-1', url: 'https://x', events: [] })),
  unregister: vi.fn((): boolean => true),
  emit: vi.fn(emit),
  deliveryLog: vi.fn(() => []),
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

    const deps = buildDeps({ ledger, math, clock, openRoundClock, roundSeconds: ROUND_SECONDS, proposeClearing, parseOrder, streamRationale, composeBrief })
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

    const deps = buildDeps({ ledger, math, clock, openRoundClock, roundSeconds: ROUND_SECONDS, proposeClearing, parseOrder, streamRationale, composeBrief })
    const started = await listen(createApp(deps))
    server = started.server

    const res = await fetch(`${started.base}/round/R2/close`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(clock.forceClose).toHaveBeenCalledWith('R2')
  })

  // ── OPS-04: round.opened fires off the open seam (buildDeps openRound wrapper) ─────
  it('POST /round fires the round.opened webhook off the open seam (aggregate data only)', async () => {
    const ledger = makeLedger()
    const openRoundClock = vi.fn(
      (roundId: string): RoundState => ({ roundId, status: 'Open', openedAt: 0, deadline: 0 }),
    )
    const clock = makeClock(openRoundClock)

    const emitted: { event: WebhookEvent; data: Record<string, unknown> }[] = []
    const webhooks = makeSpyWebhooks(async (event, data) => {
      emitted.push({ event, data })
    })

    const deps = buildDeps({
      ledger,
      math,
      clock,
      openRoundClock,
      roundSeconds: ROUND_SECONDS,
      proposeClearing,
      parseOrder,
      streamRationale,
      composeBrief,
      webhooks,
    })
    const started = await listen(createApp(deps))
    server = started.server

    const res = await fetch(`${started.base}/round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId: 'R9', desks: ['BankA', 'BankB', 'BankC'] }),
    })
    expect(res.status).toBe(201)

    // The emit is fire-and-forget (scheduled off the request path) — let the microtask drain.
    await new Promise((r) => setTimeout(r, 0))

    // round.opened fired exactly once, off the open seam, carrying aggregate/round data ONLY
    // (roundId + desk COUNT — never a desk identity or order content).
    const opened = emitted.filter((e) => e.event === 'round.opened')
    expect(opened).toHaveLength(1)
    expect(opened[0].data.roundId).toBe('R9')
    expect(opened[0].data.desks).toBe(3)
    // Secret/order-content sweep: the payload carries no desk identity string.
    expect(JSON.stringify(opened[0].data)).not.toContain('BankA')
  })

  it('POST /round still returns 201 even when a webhook emit rejects (fire-and-forget, never blocks the open path)', async () => {
    const ledger = makeLedger()
    const openRoundClock = vi.fn(
      (roundId: string): RoundState => ({ roundId, status: 'Open', openedAt: 0, deadline: 0 }),
    )
    const clock = makeClock(openRoundClock)
    // An emitter that always rejects — the open path must be unaffected.
    const webhooks = makeSpyWebhooks(async () => {
      throw new Error('subscriber unreachable')
    })

    const deps = buildDeps({
      ledger,
      math,
      clock,
      openRoundClock,
      roundSeconds: ROUND_SECONDS,
      proposeClearing,
      parseOrder,
      streamRationale,
      composeBrief,
      webhooks,
    })
    const started = await listen(createApp(deps))
    server = started.server

    const res = await fetch(`${started.base}/round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId: 'R10', desks: ['BankA'] }),
    })
    expect(res.status).toBe(201)
    expect(ledger.openRound).toHaveBeenCalledTimes(1)
    expect(openRoundClock).toHaveBeenCalledWith('R10', ROUND_SECONDS)
  })

  // ── OPS-01: telemetry-first boot ordering (Pitfall 1) ─────────────────────────────
  it('bootTelemetry inits telemetry BEFORE registering shutdown, and shuts down on signal', () => {
    const calls: string[] = []
    let registered: (() => void) | undefined
    bootTelemetry({
      initTelemetry: () => calls.push('init'),
      onSignal: (handler) => {
        calls.push('onSignal')
        registered = handler
      },
      shutdownTelemetry: async () => {
        calls.push('shutdown')
      },
    })

    // init runs FIRST (before instrumented modules / listen), THEN the signal registers.
    expect(calls).toEqual(['init', 'onSignal'])
    expect(typeof registered).toBe('function')
    // Firing the registered SIGTERM/SIGINT handler triggers telemetry shutdown.
    registered!()
    expect(calls).toContain('shutdown')
  })

  // ── OPS-02: the SecretsProvider-injected agent client still fires the boot wiring ──
  it('an injected-client agent (SecretsProvider seam) still fires openRound + openRoundClock', async () => {
    const ledger = makeLedger()
    const openRoundClock = vi.fn(
      (roundId: string): RoundState => ({ roundId, status: 'Open', openedAt: 0, deadline: 0 }),
    )
    const clock = makeClock(openRoundClock)

    // A fake Anthropic client (as index.ts injects the SecretsProvider-resolved client into
    // createAgent). The §4 sealed views aren't exercised on POST /round, so a minimal
    // parse stub suffices — the point is the injected-client agent wires through buildDeps.
    const fakeClient: AgentClient = {
      messages: { parse: vi.fn(async () => ({ parsed_output: {} })) },
    }
    const agent = createAgent({ client: fakeClient, computeClearing, matchedAt })

    const deps = buildDeps({
      ledger,
      math,
      clock,
      openRoundClock,
      roundSeconds: ROUND_SECONDS,
      proposeClearing: agent.proposeClearing,
      parseOrder: agent.parseOrder,
      streamRationale: agent.streamRationale,
      composeBrief,
    })
    const started = await listen(createApp(deps))
    server = started.server

    const res = await fetch(`${started.base}/round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId: 'R7', desks: ['BankA', 'BankB', 'BankC'] }),
    })
    expect(res.status).toBe(201)
    expect(ledger.openRound).toHaveBeenCalledTimes(1)
    expect(openRoundClock).toHaveBeenCalledWith('R7', ROUND_SECONDS)
  })
})
