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
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  computeClearing,
  matchedAt,
  demandAt,
  supplyAt,
  candidatePrices,
  choosePStar,
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
  type GuestBootstrap,
} from './api.js'
import type { TopologyResult } from './topology.js'
import type { SealResult, DrandRoundInfo } from './tlock.js'
import type { ClearingProof } from './zk/prove.js'
import type { ProofAnchor } from './zk/verify.js'
import type { StageOffsets } from './timemachine.js'
import type { Webhooks, WebhookEvent, WebhookSubscription } from './webhooks.js'

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

// CRYP-02: a sentinel tlock offline held-key — tlock.ts keeps the real one module-private
// (node:crypto randomBytes). Crypto stubs close over it; it must NEVER reach the wire.
const SENTINEL_TLOCK_KEY = 'TLOCK-OFFLINE-HELD-KEY-do-not-leak-3e8f1a'

// CRYP-03: a sentinel proof WITNESS (an order's private salt/fill) — zk/prove.ts keeps the
// witness inside the module; only proof + public signals cross out. It must NEVER leak.
const SENTINEL_WITNESS = 'WITNESS-SALT-FILL-do-not-leak-6b2d9c'

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
  // WOW-02 tamper seam — default inert; the /tamper-clear tests override per mode.
  tamperClear: vi.fn(async (): Promise<{ rejected: true; error: string }> => ({ rejected: true, error: 'rejected' })),
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
  // TRUST-03: proof-bundle reader — defaults to null (no bundle); /proof tests override.
  readProofBundle: vi.fn(async () => null),
  // WOW-05: proof-pack builder — defaults to the on-brand HTML fallback; /proof-pack.pdf tests override.
  buildProofPack: vi.fn(async () => ({ pdf: false as const, html: '<html>fallback</html>' })),
  // CRYP-02 timelock stubs — inert defaults (drand mode); crypto tests override per scenario.
  timelockEncrypt: vi.fn(
    async (payload: string): Promise<SealResult> => ({
      ciphertext: `-----BEGIN AGE ENCRYPTED FILE-----(${payload.length})`,
      targetRound: 12_345,
      mode: 'drand',
    }),
  ),
  timelockDecrypt: vi.fn(async (): Promise<{ plaintext: string }> => ({ plaintext: '' })),
  drandRoundInfo: vi.fn(
    async (): Promise<DrandRoundInfo> => ({ targetRound: 12_345, timeToBeaconMs: 3_000, chainHash: 'quicknet-chain-hash' }),
  ),
  // CRYP-03 ZK stubs — inert defaults; crypto tests override to assert verdict/anchor shapes.
  generateProof: vi.fn(
    async (): Promise<ClearingProof> => ({ proof: { pi_a: ['1', '2'] }, publicSignals: ['100', '10'], sizeBytes: 806, ms: 7 }),
  ),
  verifyProof: vi.fn(async (): Promise<boolean> => true),
  anchorProof: vi.fn(async (): Promise<ProofAnchor> => ({ proofHash: 'a'.repeat(64), vkeyHash: 'b'.repeat(64) })),
  tamperProof: vi.fn(
    async (): Promise<{ rejected: boolean; verified: false; error: string }> => ({
      rejected: true,
      verified: false,
      error: 'Groth16 verification rejected the tampered public input (p* perturbed by +1).',
    }),
  ),
  // VIZ-02 stage-offset stub — a representative recorded map; the stage-offsets test overrides.
  getStageOffsets: vi.fn(async (): Promise<StageOffsets> => ({ open: 10, sealed: 24, settled: 42 })),
  // VIZ-03 topology stub — a representative demo-real single-participant map; tests override.
  hostingMap: vi.fn(async (): Promise<TopologyResult> => ({
    nodes: [{ participant: 'app-provider', parties: ['bankA::x', 'bankB::y', 'bankC::z'] }],
    perParty: { 'bankA::x': ['app-provider'], 'bankB::y': ['app-provider'], 'bankC::z': ['app-provider'] },
    demoReal: true,
    caption: 'SAME PARTICIPANT (LOCALNET)',
  })),
  // WOW-07 guest bootstrap stub — party + join URL + roundId, NEVER a token; tests override.
  onboardGuest: vi.fn(async (): Promise<GuestBootstrap> => ({
    party: 'bankD::guest',
    joinUrl: '/join?round=R1',
    roundId: 'R1',
  })),
  // Real pure §8 helpers — solve-preview asserts true deterministic clearing.
  computeClearing,
  matchedAt,
  demandAt,
  supplyAt,
  candidatePrices,
  choosePStar,
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

  // ── AUCT-03: the OPEN-window aggregate indicative feed (scalars only, small-N guard) ──
  // A two-sided crossing book with ≥2 orders on BOTH sides — the guard PASSES so the exact
  // indicative price is published. A@101/B@100 buy · C@99/D@100 sell → p*=100, matched=10,
  // netImbalance = (6+4) − (5+5) = 0. Distinct desk names let the test prove NO order leaks.
  const CROSSING_VIEWS: OrderView[] = [
    { desk: 'DeskBuyOne', side: 'Buy', quantity: 6, limit: 101.0 },
    { desk: 'DeskBuyTwo', side: 'Buy', quantity: 4, limit: 100.0 },
    { desk: 'DeskSellOne', side: 'Sell', quantity: 5, limit: 99.0 },
    { desk: 'DeskSellTwo', side: 'Sell', quantity: 5, limit: 100.0 },
  ]
  const CROSSING_SEALED: SealedOrder[] = CROSSING_VIEWS.map((view, i) => ({
    contractId: `#cross-${i}`,
    view,
  }))

  it('GET /round/:id (open) publishes the aggregate indicative block — SCALARS ONLY, no curve/candidate-price leak', async () => {
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Open' })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => CROSSING_SEALED),
      refreshStats: vi.fn(async (): Promise<number> => CROSSING_SEALED.length),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('Open')
    // The indicative block is present with the exact price (guard passes at 2×2 orders).
    expect(body.indicative).toBeDefined()
    expect(body.indicative.indicativePrice).toBe(100) // choosePStar over the crossing book.
    expect(body.indicative.coarse).toBeUndefined()
    expect(body.indicative.band).toBeUndefined()
    expect(body.indicative.netImbalance).toBe(0) // (6+4) − (5+5).
    expect(body.indicative.estMatched).toBe(10) // matchedAt(views, 100).
    // PRIVACY (T-09-04-01/03): NO candidate-price curve / individual-order fields cross the
    // wire during the open window — those exist only at terminal status.
    expect(body).not.toHaveProperty('curve')
    expect(body).not.toHaveProperty('candidatePrices')
    expect(body).not.toHaveProperty('allocations')
    expect(body.indicative).not.toHaveProperty('curve')
    expect(body.indicative).not.toHaveProperty('orders')
    // No individual order's desk identity appears anywhere in the response.
    const wire = JSON.stringify(body)
    for (const v of CROSSING_VIEWS) expect(wire).not.toContain(v.desk)
  })

  it('GET /round/:id (open) small-N guard — coarse band, never an exact price, with <2 orders on a side', async () => {
    // The §4 book has ONE buyer (A) — a singleton buy side. The exact indicative price
    // would BE that order's limit, so the guard withholds it and emits a coarse band.
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Open' })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SECTION4_SEALED),
      refreshStats: vi.fn(async (): Promise<number> => SECTION4_SEALED.length),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.indicative).toBeDefined()
    // GUARD STATE: coarse band, NO exact price (the single-order back-out is prevented).
    expect(body.indicative.coarse).toBe(true)
    expect(typeof body.indicative.band).toBe('number')
    expect(body.indicative.indicativePrice).toBeUndefined()
    // CR-01: netImbalance/estMatched are WITHHELD under the guard — with a singleton side
    // they are order-derivable (netImbalance would equal ±the lone side's quantity, and
    // {imbalance,matched} invert to both orders), so nothing order-derivable may cross.
    expect(body.indicative.netImbalance).toBeUndefined()
    expect(body.indicative.estMatched).toBeUndefined()
    // Only coarse price info crosses — the guarded indicative block has NO other field.
    expect(Object.keys(body.indicative).sort()).toEqual(['band', 'coarse'])
    // Still no candidate-price curve during the open window.
    expect(body).not.toHaveProperty('curve')
    expect(body).not.toHaveProperty('candidatePrices')
  })

  it('GET /round/:id (open) small-N guard — a single sealed order never leaks its side/quantity via netImbalance (CR-01)', async () => {
    // N=1: one lone buy for 7. Pre-fix, netImbalance = +7 published the exact quantity AND
    // side of the ONLY order in the book (and estMatched leaked too). The guard must withhold
    // every order-derivable scalar during the open window — only a coarse price band may cross.
    const SOLO: SealedOrder[] = [
      { contractId: '#solo', view: { desk: 'DeskSolo', side: 'Buy', quantity: 7, limit: 100.0 } },
    ]
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Open' })),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => SOLO),
      refreshStats: vi.fn(async (): Promise<number> => SOLO.length),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.indicative).toBeDefined()
    expect(body.indicative.coarse).toBe(true)
    expect(body.indicative.indicativePrice).toBeUndefined()
    // The lone order's side & quantity stay sealed — no order-derivable scalar crosses.
    expect(body.indicative.netImbalance).toBeUndefined()
    expect(body.indicative.estMatched).toBeUndefined()
    expect(Object.keys(body.indicative).sort()).toEqual(['band', 'coarse'])
    // The order's desk identity never appears anywhere in the response.
    expect(JSON.stringify(body)).not.toContain('DeskSolo')
  })

  it('GET /round/:id (open) response never echoes the operator token or ANTHROPIC_API_KEY (secret sweep on the indicative body)', async () => {
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => {
        void SENTINEL_TOKEN
        return { roundId, status: 'Open' }
      }),
      readSealedOrders: vi.fn(async (): Promise<SealedOrder[]> => {
        void SENTINEL_TOKEN
        void SENTINEL_API_KEY
        return CROSSING_SEALED
      }),
      refreshStats: vi.fn(async (): Promise<number> => {
        void SENTINEL_TOKEN
        return CROSSING_SEALED.length
      }),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.indicative).toBeDefined()
    const wire = JSON.stringify(body)
    expect(wire).not.toContain(SENTINEL_TOKEN)
    expect(wire).not.toContain(SENTINEL_API_KEY)
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

  it('POST /round/:id/tamper-clear (wrong-price) surfaces the verbatim on-ledger rejection', async () => {
    const verbatim = 'submit HTTP 400: DAML_INTERPRETATION_ERROR: clearingPrice does not match recomputed §8 p*'
    const tamperClear = vi.fn(async (): Promise<{ rejected: true; error: string }> => ({ rejected: true, error: verbatim }))
    const deps = makeDeps({ tamperClear })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/tamper-clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'wrong-price' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.rejected).toBe(true)
    // The verbatim ledger rejection is the payload — surfaced, not summarized.
    expect(body.error).toBe(verbatim)
    expect(tamperClear).toHaveBeenCalledWith('R1', 'wrong-price')
  })

  it('POST /round/:id/tamper-clear (overfill) surfaces the conservation/allocation rejection', async () => {
    const verbatim = 'submit HTTP 400: DAML_INTERPRETATION_ERROR: fills not conserved (Σbuy /= Σsell)'
    const tamperClear = vi.fn(async (): Promise<{ rejected: true; error: string }> => ({ rejected: true, error: verbatim }))
    const deps = makeDeps({ tamperClear })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/tamper-clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'overfill' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.rejected).toBe(true)
    expect(body.error).toMatch(/allocations do not match recomputed §8|fills not conserved/)
    expect(tamperClear).toHaveBeenCalledWith('R1', 'overfill')
  })

  it('POST /round/:id/tamper-clear rejects a bad mode with 400 (and never calls tamperClear)', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/tamper-clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'obliterate' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error).toHaveProperty('code', 'INVALID_BODY')
    expect(deps.tamperClear).not.toHaveBeenCalled()
  })

  it('POST /round/:id/tamper-clear never echoes the operator token or API key (secret sweep)', async () => {
    // The tamperClear stub closes over both sentinels exactly as the real ledger/agent do;
    // the surfaced rejection must carry neither.
    const tamperClear = vi.fn(async (): Promise<{ rejected: true; error: string }> => {
      void SENTINEL_TOKEN
      void SENTINEL_API_KEY
      return { rejected: true, error: 'submit HTTP 400: clearingPrice does not match recomputed §8 p*' }
    })
    const deps = makeDeps({ tamperClear })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/tamper-clear`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'wrong-price' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(JSON.stringify(body)).not.toContain(SENTINEL_TOKEN)
    expect(JSON.stringify(body)).not.toContain(SENTINEL_API_KEY)
  })

  it('GET /round/:id/proof returns the decision proof bundle (TRUST-03)', async () => {
    const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
    const bundle = {
      roundId: 'R1',
      timestamp: '2026-07-09T12:00:00.000Z',
      modelId: 'claude-haiku-4-5',
      systemPromptHash: 'a'.repeat(64),
      batchHash: 'b'.repeat(64),
      rawAiProposal: { clearingPrice, allocations, rationale: 'Cleared at 100.00.', source: 'claude' as const },
      deterministicRecompute: { clearingPrice, allocations },
      verified: true,
      clearingHash: 'c'.repeat(64),
    }
    const readProofBundle = vi.fn(async () => bundle)
    const deps = makeDeps({ readProofBundle })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/proof`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.roundId).toBe('R1')
    expect(body.modelId).toBe('claude-haiku-4-5')
    expect(body.systemPromptHash).toBe('a'.repeat(64))
    expect(body.deterministicRecompute.clearingPrice).toBe(100)
    expect(body.verified).toBe(true)
    expect(readProofBundle).toHaveBeenCalledWith('R1')
  })

  it('GET /round/:id/proof returns 404 when no bundle exists', async () => {
    const deps = makeDeps({ readProofBundle: vi.fn(async () => null) })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/NOPE/proof`)
    const body = await readJson(res)

    expect(res.status).toBe(404)
    expect(body.error).toHaveProperty('code', 'PROOF_NOT_FOUND')
  })

  it('GET /round/:id/proof never echoes the operator token or API key (secret sweep)', async () => {
    const { clearingPrice, allocations } = computeClearing(SECTION4_VIEWS)
    const readProofBundle = vi.fn(async () => {
      // The reader closes over the sentinels as proof.ts/agent.ts hold the real ones; the
      // bundle stores only hashes + numbers, so neither may reach the wire.
      void SENTINEL_TOKEN
      void SENTINEL_API_KEY
      return {
        roundId: 'R1',
        timestamp: '2026-07-09T12:00:00.000Z',
        modelId: 'claude-haiku-4-5',
        systemPromptHash: 'a'.repeat(64),
        batchHash: 'b'.repeat(64),
        rawAiProposal: { clearingPrice, allocations, rationale: 'Cleared at 100.00.', source: 'claude' as const },
        deterministicRecompute: { clearingPrice, allocations },
        verified: true,
        clearingHash: 'c'.repeat(64),
      }
    })
    const deps = makeDeps({ readProofBundle })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/proof`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(JSON.stringify(body)).not.toContain(SENTINEL_TOKEN)
    expect(JSON.stringify(body)).not.toContain(SENTINEL_API_KEY)
  })

  it('GET /round/:id/proof-pack.pdf streams a PDF with attachment disposition (WOW-05)', async () => {
    // A real temp file the mocked builder points at — the handler streams it as application/pdf.
    const pdfPath = join(tmpdir(), `umbra-proofpack-test-${Date.now()}.pdf`)
    writeFileSync(pdfPath, '%PDF-1.4 fake proof pack')
    const buildProofPack = vi.fn(async () => ({ pdf: true as const, path: pdfPath }))
    const deps = makeDeps({ buildProofPack })
    const started = await listen(deps)
    server = started.server

    try {
      const res = await fetch(`${started.base}/round/R1/proof-pack.pdf`)
      const text = await res.text()

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/pdf')
      expect(res.headers.get('content-disposition')).toContain('attachment')
      expect(res.headers.get('content-disposition')).toContain('Umbra-Proof-Pack-R1.pdf')
      expect(text).toContain('%PDF-1.4')
      expect(buildProofPack).toHaveBeenCalledWith('R1')
    } finally {
      rmSync(pdfPath, { force: true })
    }
  })

  it('GET /round/:id/proof-pack.pdf serves on-brand HTML when Chrome cannot spawn (fallback)', async () => {
    const html = '<html><style>:root{--paper:#F4F1EA;--ink:#0A0A0A;--lime:#D6FB3C;}</style>proof</html>'
    const buildProofPack = vi.fn(async () => ({ pdf: false as const, html }))
    const deps = makeDeps({ buildProofPack })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/proof-pack.pdf`)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(body).toBe(html)
    // The on-brand fallback still carries the binding brand tokens.
    expect(body).toContain('#D6FB3C')
  })

  it('GET /round/:id/proof-pack.pdf returns a secret-free PROOFPACK_FAILED 500 on builder error', async () => {
    const buildProofPack = vi.fn(async () => {
      void SENTINEL_API_KEY
      void SENTINEL_TOKEN
      throw new Error(`chrome spawn failed with token ${SENTINEL_TOKEN}`)
    })
    const deps = makeDeps({ buildProofPack })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/proof-pack.pdf`)
    const body = await readJson(res)

    expect(res.status).toBe(500)
    expect(body.error).toHaveProperty('code', 'PROOFPACK_FAILED')
    // The verbatim internal error (which held the sentinel) never reaches the client.
    expect(JSON.stringify(body)).not.toContain(SENTINEL_TOKEN)
    expect(JSON.stringify(body)).not.toContain(SENTINEL_API_KEY)
  })

  it('GET /round/:id/proof-pack.pdf (fallback HTML) never leaks the key or operator token', async () => {
    const buildProofPack = vi.fn(async () => {
      void SENTINEL_API_KEY
      void SENTINEL_TOKEN
      return { pdf: false as const, html: '<html>on-brand secret-free proof</html>' }
    })
    const deps = makeDeps({ buildProofPack })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/proof-pack.pdf`)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).not.toContain(SENTINEL_API_KEY)
    expect(body).not.toContain(SENTINEL_TOKEN)
  })

  // ── VIZ-03 topology + WOW-07 guest bootstrap ──────────────────────────────────────
  it('GET /round/:id/topology returns the party→participant hosting map (credential-free)', async () => {
    const hostingMap = vi.fn(async (): Promise<TopologyResult> => ({
      nodes: [{ participant: 'app-provider', parties: ['bankA::x', 'bankB::y', 'bankC::z'] }],
      perParty: { 'bankA::x': ['app-provider'], 'bankB::y': ['app-provider'], 'bankC::z': ['app-provider'] },
      demoReal: true,
      caption: 'SAME PARTICIPANT (LOCALNET)',
    }))
    const deps = makeDeps({ hostingMap })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/topology`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.roundId).toBe('R1')
    expect(body.demoReal).toBe(true)
    // The HARD honesty caption fires when all desks map to one participant (Pitfall 7).
    expect(body.caption).toBe('SAME PARTICIPANT (LOCALNET)')
    expect(body.nodes).toHaveLength(1)
    expect(body.perParty['bankA::x']).toEqual(['app-provider'])
    expect(hostingMap).toHaveBeenCalledTimes(1)
  })

  it('GET /round/:id/topology surfaces a distributed (multi-node) map when desks are split', async () => {
    const hostingMap = vi.fn(async (): Promise<TopologyResult> => ({
      nodes: [
        { participant: 'app-user', parties: ['bankA::x'] },
        { participant: 'sv', parties: ['bankB::y'] },
        { participant: 'app-provider', parties: ['bankC::z'] },
      ],
      perParty: { 'bankA::x': ['app-user'], 'bankB::y': ['sv'], 'bankC::z': ['app-provider'] },
      demoReal: false,
      caption: 'DISTRIBUTED (MULTI-NODE)',
    }))
    const deps = makeDeps({ hostingMap })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/topology`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.demoReal).toBe(false)
    expect(body.nodes).toHaveLength(3)
  })

  it('GET /guest/bootstrap returns party + join URL + roundId and NEVER a token (WOW-07)', async () => {
    const onboardGuest = vi.fn(async (): Promise<GuestBootstrap> => ({
      party: 'bankD::guest',
      joinUrl: '/join?round=R1',
      roundId: 'R1',
    }))
    const deps = makeDeps({ onboardGuest })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/guest/bootstrap`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.party).toBe('bankD::guest')
    expect(body.joinUrl).toBe('/join?round=R1')
    expect(body.roundId).toBe('R1')
    // The scoped guest token is NEVER part of the bootstrap (T-11-03-QR).
    expect(body).not.toHaveProperty('token')
    expect(body).not.toHaveProperty('jwt')
    expect(onboardGuest).toHaveBeenCalledTimes(1)
  })

  it('topology + guest bootstrap never echo the operator token, API key, or a scoped guest token (secret sweep)', async () => {
    // A sentinel scoped guest token — the WOW-07 secret that must live ONLY in tokens.json,
    // never in a GET body or QR. The stubs close over all three sentinels as the real
    // ledger/agent/onboarding hold their secrets; none may reach the wire.
    const SENTINEL_GUEST_TOKEN = 'eyJhbGci-SENTINEL-GUEST-JWT-do-not-leak-4d1e8a'
    const hostingMap = vi.fn(async (): Promise<TopologyResult> => {
      void SENTINEL_TOKEN
      return {
        nodes: [{ participant: 'app-provider', parties: ['bankA::x'] }],
        perParty: { 'bankA::x': ['app-provider'] },
        demoReal: true,
        caption: 'SAME PARTICIPANT (LOCALNET)',
      }
    })
    const onboardGuest = vi.fn(async (): Promise<GuestBootstrap> => {
      // The onboarding holds the scoped guest token (in tokens.json) but returns none of it.
      void SENTINEL_GUEST_TOKEN
      void SENTINEL_API_KEY
      return { party: 'bankD::guest', joinUrl: '/join?round=R1', roundId: 'R1' }
    })
    const deps = makeDeps({ hostingMap, onboardGuest })
    const started = await listen(deps)
    server = started.server

    const topoWire = await fetch(`${started.base}/round/R1/topology`).then((r) => r.text())
    const guestWire = await fetch(`${started.base}/guest/bootstrap`).then((r) => r.text())
    const combined = `${topoWire}\n${guestWire}`

    expect(combined).not.toContain(SENTINEL_TOKEN)
    expect(combined).not.toContain(SENTINEL_API_KEY)
    expect(combined).not.toContain(SENTINEL_GUEST_TOKEN)
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

// ── CRYP-02 / CRYP-03 / VIZ-02 crypto endpoints ─────────────────────────────────────
// The operator-plane crypto surface: timelock seal/open, ZK prove/verify/anchor/tamper,
// and the VIZ-02 stage→offset map. Every response rides the SAME secret-safe envelope; the
// extended secret sweep proves no tlock held key / proof witness / operator token / API key
// ever crosses out. verify-proof (off-ledger verdict) and anchor-proof (on-ledger hash) are
// asserted DISTINCT (the honest split, threat T-10-19).
describe('solver crypto endpoints (CRYP-02/03/VIZ-02)', () => {
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

  // ── CRYP-02 timelock ──────────────────────────────────────────────────────────────
  it('POST /round/:id/timelock-encrypt returns the ciphertext + public round metadata', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/timelock-encrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'BankB Sell 8 @99', windowMs: 30_000 }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.roundId).toBe('R1')
    expect(body.ciphertext).toContain('AGE ENCRYPTED FILE')
    expect(body.mode).toBe('drand')
    expect(body.targetRound).toBe(12_345)
    // drandRoundInfo enrichment (best-effort beacon countdown) on the drand path.
    expect(body.chainHash).toBe('quicknet-chain-hash')
    expect(body.timeToBeaconMs).toBe(3_000)
    expect(deps.timelockEncrypt).toHaveBeenCalledWith('BankB Sell 8 @99', 30_000)
  })

  it('POST /round/:id/timelock-encrypt surfaces the offline-fallback warning (weaker-than-drand)', async () => {
    const timelockEncrypt = vi.fn(
      async (): Promise<SealResult> => ({
        ciphertext: 'UMBRA-OFFLINE-v1:abcd',
        targetRound: 0,
        mode: 'offline',
        warning: 'OFFLINE FALLBACK · WEAKER THAN DRAND',
      }),
    )
    const deps = makeDeps({ timelockEncrypt })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/timelock-encrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'x' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.mode).toBe('offline')
    expect(body.warning).toContain('WEAKER THAN DRAND')
    // drand enrichment is NOT attempted on the offline path.
    expect(deps.drandRoundInfo).not.toHaveBeenCalled()
  })

  it('POST /round/:id/timelock-encrypt rejects a malformed / oversized body with a sanitized 400', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    // Missing payload → 400.
    const res = await fetch(`${started.base}/round/R1/timelock-encrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ windowMs: 30_000 }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error).toHaveProperty('code', 'INVALID_BODY')
    expect(deps.timelockEncrypt).not.toHaveBeenCalled()
  })

  it('POST /timelock-decrypt returns the recovered plaintext', async () => {
    const timelockDecrypt = vi.fn(async (): Promise<{ plaintext: string }> => ({ plaintext: 'BankB Sell 8 @99' }))
    const deps = makeDeps({ timelockDecrypt })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/timelock-decrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ciphertext: '-----BEGIN AGE ENCRYPTED FILE-----...' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.plaintext).toBe('BankB Sell 8 @99')
  })

  it('POST /timelock-decrypt maps a not-yet-due beacon to a secret-free 425 TOO_EARLY', async () => {
    // The real tlock.timelockOpen throws an error containing "too early" before the beacon.
    const timelockDecrypt = vi.fn(async (): Promise<{ plaintext: string }> => {
      throw new Error('unable to decrypt: too early — round 999 has not been published yet')
    })
    const deps = makeDeps({ timelockDecrypt })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/timelock-decrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ciphertext: '-----BEGIN AGE ENCRYPTED FILE-----early' }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(425)
    expect(body.error).toHaveProperty('code', 'TOO_EARLY')
    // The raw thrown message (which named the round) is NOT echoed verbatim.
    expect(JSON.stringify(body)).not.toContain('round 999')
  })

  it('POST /timelock-decrypt rejects a missing ciphertext with a sanitized 400', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/timelock-decrypt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error).toHaveProperty('code', 'INVALID_BODY')
    expect(deps.timelockDecrypt).not.toHaveBeenCalled()
  })

  // ── CRYP-03 prove / verify / anchor / tamper ────────────────────────────────────────
  it('POST /round/:id/prove returns proof + public signals + size/timing (no witness)', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/prove`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.roundId).toBe('R1')
    expect(body.proof).toHaveProperty('pi_a')
    expect(body.publicSignals).toEqual(['100', '10'])
    expect(body.sizeBytes).toBe(806)
    expect(body.ms).toBe(7)
    // No private-witness field ever appears on the wire.
    expect(body).not.toHaveProperty('salt')
    expect(body).not.toHaveProperty('fill')
    expect(deps.generateProof).toHaveBeenCalledWith('R1')
  })

  it('POST /round/:id/verify-proof returns ONLY an off-ledger boolean verdict', async () => {
    const verifyProof = vi.fn(async (): Promise<boolean> => true)
    const deps = makeDeps({ verifyProof })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/verify-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vkey: { protocol: 'groth16' }, publicSignals: ['100', '10'], proof: { pi_a: ['1'] } }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.verified).toBe(true)
    // The off-ledger verdict does NOT carry on-ledger anchor hashes (the honest split).
    expect(body).not.toHaveProperty('proofHash')
    expect(body).not.toHaveProperty('vkeyHash')
  })

  it('POST /round/:id/verify-proof returns { verified:false } for a forged public signal', async () => {
    const verifyProof = vi.fn(async (): Promise<boolean> => false)
    const deps = makeDeps({ verifyProof })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/verify-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vkey: { protocol: 'groth16' }, publicSignals: ['99', '10'], proof: { pi_a: ['1'] } }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.verified).toBe(false)
  })

  it('POST /round/:id/anchor-proof records the hashes on-ledger and returns ONLY them', async () => {
    const anchorProof = vi.fn(
      async (): Promise<ProofAnchor> => ({ proofHash: 'f'.repeat(64), vkeyHash: 'e'.repeat(64) }),
    )
    const deps = makeDeps({ anchorProof })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/anchor-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vkey: { protocol: 'groth16' }, publicSignals: ['100', '10'], proof: { pi_a: ['1'] } }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.roundId).toBe('R1')
    expect(body.proofHash).toBe('f'.repeat(64))
    expect(body.vkeyHash).toBe('e'.repeat(64))
    // The on-ledger anchor does NOT carry a verification verdict (the honest split).
    expect(body).not.toHaveProperty('verified')
    expect(anchorProof).toHaveBeenCalledWith('R1', { pi_a: ['1'] }, ['100', '10'], { protocol: 'groth16' })
  })

  it('verify-proof (off-ledger verdict) and anchor-proof (on-ledger hash) are DISTINCT shapes', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const envelope = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vkey: { protocol: 'groth16' }, publicSignals: ['100', '10'], proof: { pi_a: ['1'] } }),
    }
    const verifyBody = await readJson(await fetch(`${started.base}/round/R1/verify-proof`, envelope))
    const anchorBody = await readJson(await fetch(`${started.base}/round/R1/anchor-proof`, envelope))

    // Off-ledger: a boolean verdict, no hashes. On-ledger: hashes, no verdict.
    expect(verifyBody).toHaveProperty('verified')
    expect(verifyBody).not.toHaveProperty('proofHash')
    expect(anchorBody).toHaveProperty('proofHash')
    expect(anchorBody).toHaveProperty('vkeyHash')
    expect(anchorBody).not.toHaveProperty('verified')
  })

  it('POST /round/:id/verify-proof rejects a malformed proof envelope with a sanitized 400', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    // publicSignals missing → 400 (no verify call).
    const res = await fetch(`${started.base}/round/R1/verify-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vkey: { protocol: 'groth16' }, proof: { pi_a: ['1'] } }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(400)
    expect(body.error).toHaveProperty('code', 'INVALID_BODY')
    expect(deps.verifyProof).not.toHaveBeenCalled()
  })

  it('POST /round/:id/tamper-proof returns the rejected/false verdict (mirrors tamper-clear)', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/tamper-proof`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.rejected).toBe(true)
    expect(body.verified).toBe(false)
    expect(body.error).toContain('rejected the tampered')
    expect(deps.tamperProof).toHaveBeenCalledWith('R1')
  })

  // ── VIZ-02 stage offsets ────────────────────────────────────────────────────────────
  it('GET /round/:id/stage-offsets returns the recorded stage→offset map', async () => {
    const getStageOffsets = vi.fn(async (): Promise<StageOffsets> => ({ open: 10, sealed: 24, cleared: 31, settled: 42 }))
    const deps = makeDeps({ getStageOffsets })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/stage-offsets`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.roundId).toBe('R1')
    expect(body.offsets).toEqual({ open: 10, sealed: 24, cleared: 31, settled: 42 })
    expect(getStageOffsets).toHaveBeenCalledWith('R1')
  })

  // ── Extended secret sweep (T-10-17) ─────────────────────────────────────────────────
  it('no crypto endpoint response echoes the operator token, API key, tlock held key, or proof witness', async () => {
    // Every crypto stub closes over ALL FOUR sentinels exactly as the real tlock/zk/ledger
    // modules hold their real secrets; none may reach the wire on ANY crypto response.
    const deps = makeDeps({
      timelockEncrypt: vi.fn(async (): Promise<SealResult> => {
        void SENTINEL_TOKEN
        void SENTINEL_API_KEY
        void SENTINEL_TLOCK_KEY
        return { ciphertext: '-----BEGIN AGE ENCRYPTED FILE-----secret-free', targetRound: 12_345, mode: 'drand' }
      }),
      drandRoundInfo: vi.fn(async (): Promise<DrandRoundInfo> => {
        void SENTINEL_TLOCK_KEY
        return { targetRound: 12_345, timeToBeaconMs: 3_000, chainHash: 'quicknet' }
      }),
      timelockDecrypt: vi.fn(async (): Promise<{ plaintext: string }> => {
        void SENTINEL_TLOCK_KEY
        return { plaintext: 'BankB Sell 8 @99' }
      }),
      generateProof: vi.fn(async (): Promise<ClearingProof> => {
        void SENTINEL_WITNESS // the private salt/fill witness — stays inside zk/prove.ts
        return { proof: { pi_a: ['1'] }, publicSignals: ['100', '10'], sizeBytes: 806, ms: 7 }
      }),
      verifyProof: vi.fn(async (): Promise<boolean> => {
        void SENTINEL_WITNESS
        return true
      }),
      anchorProof: vi.fn(async (): Promise<ProofAnchor> => {
        void SENTINEL_TOKEN
        void SENTINEL_WITNESS
        return { proofHash: 'a'.repeat(64), vkeyHash: 'b'.repeat(64) }
      }),
      tamperProof: vi.fn(async (): Promise<{ rejected: boolean; verified: false; error: string }> => {
        void SENTINEL_WITNESS
        return { rejected: true, verified: false, error: 'Groth16 rejected the tampered p*.' }
      }),
      getStageOffsets: vi.fn(async (): Promise<StageOffsets> => {
        void SENTINEL_TOKEN
        return { open: 10, sealed: 24, settled: 42 }
      }),
    })
    const started = await listen(deps)
    server = started.server

    const envelope = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vkey: { protocol: 'groth16' }, publicSignals: ['100', '10'], proof: { pi_a: ['1'] } }),
    }
    const wires: string[] = await Promise.all([
      fetch(`${started.base}/round/R1/timelock-encrypt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: 'BankB Sell 8 @99' }),
      }).then((r) => r.text()),
      fetch(`${started.base}/timelock-decrypt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ciphertext: '-----BEGIN AGE ENCRYPTED FILE-----x' }),
      }).then((r) => r.text()),
      fetch(`${started.base}/round/R1/prove`, { method: 'POST' }).then((r) => r.text()),
      fetch(`${started.base}/round/R1/verify-proof`, envelope).then((r) => r.text()),
      fetch(`${started.base}/round/R1/anchor-proof`, envelope).then((r) => r.text()),
      fetch(`${started.base}/round/R1/tamper-proof`, { method: 'POST' }).then((r) => r.text()),
      fetch(`${started.base}/round/R1/stage-offsets`).then((r) => r.text()),
    ])

    const combined = wires.join('\n')
    expect(combined).not.toContain(SENTINEL_TOKEN)
    expect(combined).not.toContain(SENTINEL_API_KEY)
    expect(combined).not.toContain(SENTINEL_TLOCK_KEY)
    expect(combined).not.toContain(SENTINEL_WITNESS)
  })

  it('a crypto endpoint error body never echoes a secret (generic collapse on an internal throw)', async () => {
    // generateProof throws an error whose message embeds a sentinel — the generic 500 collapse
    // must ensure that raw text (and every other sentinel) never reaches the client.
    const generateProof = vi.fn(async (): Promise<ClearingProof> => {
      void SENTINEL_API_KEY
      throw new Error(`snarkjs blew up holding witness ${SENTINEL_WITNESS} and token ${SENTINEL_TOKEN}`)
    })
    const deps = makeDeps({ generateProof })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/prove`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(500)
    expect(body.error).toHaveProperty('code', 'INTERNAL')
    const wire = JSON.stringify(body)
    expect(wire).not.toContain(SENTINEL_TOKEN)
    expect(wire).not.toContain(SENTINEL_API_KEY)
    expect(wire).not.toContain(SENTINEL_WITNESS)
  })
})

// ── OPS-01/02/03: observability + public status + idempotency/FSM reliability ─────────
// The token-free S1 surfaces (/health, /status, /status.html) must expose ZERO private
// order/secret data (T-13-19); mutating POSTs carrying an Idempotency-Key must dedupe
// (replay / 422 cross-body, T-13-20); and the round FSM must reject illegal edges with 409.
describe('solver OPS-01/02/03 surfaces (status + idempotency + FSM)', () => {
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

  it('GET /health returns ok + uptimeSeconds without any token', async () => {
    const started = await listen(makeDeps({}))
    server = started.server

    const res = await fetch(`${started.base}/health`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(typeof body.uptimeSeconds).toBe('number')
  })

  it('GET /status returns aggregate-only health JSON (idle default) — no order/secret keys', async () => {
    const started = await listen(makeDeps({}))
    server = started.server

    const res = await fetch(`${started.base}/status`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    // Default (no statusSource) → an idle, operational venue.
    expect(body.health).toBe('operational')
    expect(body.phase).toBeNull()
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(typeof body.build).toBe('string')
    // The wire shape is a fixed allow-list — no order/desk/limit/allocation field rides along.
    expect(Object.keys(body).sort()).toEqual(['build', 'health', 'phase', 'uptimeSeconds'])
    for (const forbidden of ['allocations', 'orders', 'desk', 'limit', 'sealedOrderCount', 'curve']) {
      expect(body).not.toHaveProperty(forbidden)
    }
  })

  it('GET /status maps the round status → display phase via the FSM sealedAlias (Closed→Sealed)', async () => {
    const started = await listen(
      makeDeps({
        statusSource: () => ({ health: 'operational', roundStatus: 'Closed', build: 'phase-13' }),
      }),
    )
    server = started.server

    const res = await fetch(`${started.base}/status`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    // A Closed round renders as the display phase "Sealed" (auction window sealed shut).
    expect(body.phase).toBe('Sealed')
  })

  it('GET /status + /status.html pass an order-sweep + secret-sweep (T-13-19)', async () => {
    // A statusSource closing over BOTH sentinels (as the real ledger/agent hold their
    // secrets) plus a distinct desk name — none of which may reach either public surface.
    const SENTINEL_DESK = 'DeskThatMustNeverLeak'
    const statusSource = vi.fn(() => {
      void SENTINEL_TOKEN
      void SENTINEL_API_KEY
      void SENTINEL_DESK
      return { health: 'operational' as const, roundStatus: 'Open' as const, build: 'phase-13' }
    })
    const started = await listen(makeDeps({ statusSource }))
    server = started.server

    const jsonWire = await fetch(`${started.base}/status`).then((r) => r.text())
    const htmlRes = await fetch(`${started.base}/status.html`)
    const htmlWire = await htmlRes.text()

    expect(htmlRes.headers.get('content-type')).toContain('text/html')
    // The honest public-health tag is present; the page carries no order/secret data.
    expect(htmlWire).toContain('PUBLIC HEALTH')
    for (const wire of [jsonWire, htmlWire]) {
      expect(wire).not.toContain(SENTINEL_TOKEN)
      expect(wire).not.toContain(SENTINEL_API_KEY)
      expect(wire).not.toContain(SENTINEL_DESK)
    }
  })

  it('POST /round replays the ORIGINAL response for a same key+body (no re-open) — idempotent', async () => {
    const openRound = vi.fn(async (roundId: string): Promise<RoundView> => ({
      roundId,
      status: 'Open',
      openedAt: '2026-07-10T00:00:00Z',
      windowSeconds: 60,
    }))
    const started = await listen(makeDeps({ openRound }))
    server = started.server

    const post = () =>
      fetch(`${started.base}/round`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-abc' },
        body: JSON.stringify({ roundId: 'R9', desks: ['BankA'] }),
      })

    const first = await post()
    const firstJson = await readJson(first)
    const second = await post()
    const secondJson = await readJson(second)

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    // Byte-identical replay of the original response...
    expect(secondJson).toEqual(firstJson)
    // ...and the handler (ledger open) ran EXACTLY once.
    expect(openRound).toHaveBeenCalledTimes(1)
  })

  it('POST /round with a reused key but a DIFFERENT body → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const openRound = vi.fn(async (roundId: string): Promise<RoundView> => ({ roundId, status: 'Open' }))
    const started = await listen(makeDeps({ openRound }))
    server = started.server

    const first = await fetch(`${started.base}/round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-xyz' },
      body: JSON.stringify({ roundId: 'R10', desks: ['BankA'] }),
    })
    expect(first.status).toBe(201)

    const reuse = await fetch(`${started.base}/round`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'key-xyz' },
      body: JSON.stringify({ roundId: 'R10-DIFFERENT', desks: ['BankB'] }),
    })
    const reuseJson = await readJson(reuse)

    expect(reuse.status).toBe(422)
    expect(reuseJson.error).toHaveProperty('code', 'IDEMPOTENCY_KEY_REUSED')
    // The handler ran only for the FIRST body — the reused-key mismatch never re-executed it.
    expect(openRound).toHaveBeenCalledTimes(1)
  })

  it('POST /round/:id/settle on a non-cleared (Open) round → 409 ILLEGAL_TRANSITION (FSM guard)', async () => {
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Open' })),
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/settle`, { method: 'POST' })
    const body = await readJson(res)

    expect(res.status).toBe(409)
    expect(body.error).toHaveProperty('code', 'ILLEGAL_TRANSITION')
    // settle must NOT run for an illegal settle-before-close edge.
    expect(deps.settle).not.toHaveBeenCalled()
  })

  it('POST /round/:id/settle still clears the §4 fixture at $100.00 / matched 10 (FSM legal path)', async () => {
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
    expect(body.clearingPrice).toBe(100) // §4 canary — 100.00 unchanged under the FSM guard.
    expect(body.matchedVolume).toBe(10)
    expect(settle).toHaveBeenCalledWith('R1')

    // After a settle the last clear surfaces on the aggregate /status (public uniform price).
    const status = await readJson(await fetch(`${started.base}/status`))
    expect(status.lastClearPrice).toBe(100)
  })

  // ══ OPS-04 lifecycle webhooks — register/unregister endpoints + settle-seam emits ═══
  // A sentinel subscription secret — accepted by POST /webhooks but NEVER echoed back.
  const SENTINEL_WEBHOOK_SECRET = 'WHSEC-SUBSCRIPTION-SECRET-do-not-leak-4d1c8e'

  // A spy Webhooks that records every emit; register returns a secret-free handle.
  const makeSpyWebhooks = (): {
    webhooks: Webhooks
    emitted: { event: WebhookEvent; data: Record<string, unknown> }[]
  } => {
    const emitted: { event: WebhookEvent; data: Record<string, unknown> }[] = []
    const webhooks: Webhooks = {
      register: vi.fn((): WebhookSubscription => ({ id: 'sub-1', url: 'https://x', events: [] })),
      unregister: vi.fn((): boolean => true),
      emit: vi.fn(async (event: WebhookEvent, data: Record<string, unknown>) => {
        emitted.push({ event, data })
      }),
      deliveryLog: vi.fn(() => []),
    }
    return { webhooks, emitted }
  }

  it('POST /webhooks registers a subscription and NEVER echoes the subscription secret', async () => {
    const deps = makeDeps({}) // default in-memory webhooks (real createWebhooks)
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/webhooks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://subscriber.example/webhook',
        secret: SENTINEL_WEBHOOK_SECRET,
        events: ['round.opened', 'round.settled', 'fill.posted'],
      }),
    })
    const body = await readJson(res)

    expect(res.status).toBe(201)
    expect(typeof body.id).toBe('string')
    expect(body.url).toBe('https://subscriber.example/webhook')
    expect(body.events).toEqual(['round.opened', 'round.settled', 'fill.posted'])
    // T-13-26: the subscription secret must NOT appear anywhere in the response body.
    expect(JSON.stringify(body)).not.toContain(SENTINEL_WEBHOOK_SECRET)
    expect(body.secret).toBeUndefined()
  })

  it('POST /webhooks rejects a malformed body (zod .strict) with a sanitized 400', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    // Missing secret + an unknown event → 400 INVALID_BODY (never a 500 / never env echo).
    const res = await fetch(`${started.base}/webhooks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://x', events: ['not.an.event'] }),
    })
    const body = await readJson(res)
    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_BODY')
  })

  it('DELETE /webhooks/:id unregisters, and 404s an unknown id', async () => {
    const deps = makeDeps({})
    const started = await listen(deps)
    server = started.server

    const reg = await readJson(
      await fetch(`${started.base}/webhooks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://x.example/h', secret: 's', events: ['round.opened'] }),
      }),
    )
    const del = await fetch(`${started.base}/webhooks/${reg.id}`, { method: 'DELETE' })
    const delBody = await readJson(del)
    expect(del.status).toBe(200)
    expect(delBody.unregistered).toBe(true)

    const missing = await fetch(`${started.base}/webhooks/does-not-exist`, { method: 'DELETE' })
    const missingBody = await readJson(missing)
    expect(missing.status).toBe(404)
    expect(missingBody.error.code).toBe('SUBSCRIPTION_NOT_FOUND')
  })

  it('POST /settle fires round.cleared, round.settled, and fill.posted (once per confirmation) — aggregate data only', async () => {
    const { webhooks, emitted } = makeSpyWebhooks()
    const settle = vi.fn(async (): Promise<SettleResult> => ({
      clearingPrice: 100,
      allocations: [
        { desk: 'BankA', side: 'Buy', filledQty: 10 },
        { desk: 'BankB', side: 'Sell', filledQty: 8 },
        { desk: 'BankC', side: 'Sell', filledQty: 2 },
      ],
      matchedVolume: 10,
      txConfirmations: 1,
    }))
    const readTradeConfirmations = vi.fn(async () => [
      { desk: 'BankA', side: 'Buy' as const, filledQty: 10, clearingPrice: 100 },
      { desk: 'BankB', side: 'Sell' as const, filledQty: 8, clearingPrice: 100 },
      { desk: 'BankC', side: 'Sell' as const, filledQty: 2, clearingPrice: 100 },
    ])
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Closed' })),
      settle,
      readTradeConfirmations,
      webhooks,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/settle`, { method: 'POST' })
    expect(res.status).toBe(200)
    // §4 canary intact.
    expect((await readJson(res)).clearingPrice).toBe(100)

    // The emits are fire-and-forget (scheduled off the request path) — drain the microtasks.
    await new Promise((r) => setTimeout(r, 10))

    const events = emitted.map((e) => e.event)
    expect(events).toContain('round.cleared')
    expect(events).toContain('round.settled')
    // fill.posted fires ONCE PER confirmation (3 desks).
    expect(events.filter((e) => e === 'fill.posted')).toHaveLength(3)

    // round.settled carries the public uniform price + matched volume (aggregate only).
    const settled = emitted.find((e) => e.event === 'round.settled')!
    expect(settled.data.clearingPrice).toBe(100)
    expect(settled.data.matchedVolume).toBe(10)
    // Order-content sweep: no sealed order's limit price rides on the aggregate emits.
    const clearedData = JSON.stringify(emitted.find((e) => e.event === 'round.cleared')!.data)
    expect(clearedData).not.toContain('limit')
  })

  it('POST /settle still returns 200 with the byte-unchanged body when a webhook emit rejects', async () => {
    // An emitter that always rejects — the legal settlement path must be unaffected.
    const webhooks: Webhooks = {
      register: vi.fn((): WebhookSubscription => ({ id: 'x', url: 'u', events: [] })),
      unregister: vi.fn(() => true),
      emit: vi.fn(async () => {
        throw new Error('subscriber unreachable')
      }),
      deliveryLog: vi.fn(() => []),
    }
    const settle = vi.fn(async (): Promise<SettleResult> => ({
      clearingPrice: 100,
      allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
      matchedVolume: 10,
      txConfirmations: 1,
    }))
    const deps = makeDeps({
      queryRound: vi.fn(async (roundId: string) => ({ roundId, status: 'Closed' })),
      settle,
      webhooks,
    })
    const started = await listen(deps)
    server = started.server

    const res = await fetch(`${started.base}/round/R1/settle`, { method: 'POST' })
    const body = await readJson(res)
    expect(res.status).toBe(200)
    expect(body.status).toBe('Settled')
    expect(body.clearingPrice).toBe(100)
    expect(body.matchedVolume).toBe(10)
    await new Promise((r) => setTimeout(r, 10)) // let the rejected emit settle harmlessly
  })
})
