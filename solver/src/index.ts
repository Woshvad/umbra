// solver/src/index.ts — the solver service boot entrypoint.
//
// Boot sequence:
//   1. dotenv.config() FIRST — so JSON_API_URL / SOLVER_PORT / ROUND_SECONDS are
//      in process.env BEFORE ledger.ts constructs its Ledger (which reads
//      JSON_API_URL at module-eval time).
//   2. Construct the in-memory clock (createClock) wired to the ledger closeRound.
//   3. REHYDRATE from a live query(Round) so a sandbox-seeded round (R1) is
//      recognized — the ledger Round.status is authoritative (T-04-10).
//   4. buildDeps(...) assembles the AppDeps for createApp, with the CRITICAL wiring:
//      POST /round → openRound (ledger create) AND openRoundClock (timer start).
//   5. createApp(deps).listen(SOLVER_PORT), logging ONLY ":<port> as <operatorParty>"
//      — never the token, ANTHROPIC_API_KEY, or process.env (SOLV-04 / T-04-04).
//
// The dotenv import + the ledger import are deferred into main() (dynamic import)
// so that importing THIS module for the wiring unit test (index.test.ts) does NOT
// trigger ledger.ts's module-private credential resolution or open a Ledger. The
// test drives buildDeps directly with injected spies.

import { createApp, type AppDeps, type RoundView } from './api.js'
import type { Clock, RoundStatus } from './clock.js'
import type { Health } from './status.js'
import type { Webhooks } from './webhooks.js'
// PAY-01: the x402 metered-access gate type (x402.ts). Type-only at the top so importing this
// module for the boot-wiring unit test never evaluates x402/facilitator; main() dynamically
// imports the createFacilitator + createX402Gate constructors after dotenv (like ledger/agent).
import type { PaymentGate } from './x402.js'

// Default window / port (overridable via env). ROUND_SECONDS drives the auto-close
// timer; SOLVER_PORT is the :4100 bind.
export const DEFAULT_ROUND_SECONDS = 60
export const DEFAULT_SOLVER_PORT = 4100

// The ledger functions index.ts needs to wire into the API + clock. The unit test
// injects spies for these; main() supplies the real ledger.ts implementations.
export interface LedgerPort {
  openRound: AppDeps['openRound']
  queryRound: AppDeps['queryRound']
  readSealedOrders: AppDeps['readSealedOrders']
  refreshStats: AppDeps['refreshStats']
  closeRound: AppDeps['closeRound']
  settle: AppDeps['settle']
  // WOW-02: the dedicated tamper seam (ledger.tamperClear) — mirrors settle wiring.
  tamperClear: AppDeps['tamperClear']
  readTradeConfirmations: AppDeps['readTradeConfirmations']
  // ADJ-02 RFQ + ADJ-03 issuance exercise wrappers (ledger.ts) — threaded onto AppDeps so
  // createApp can serve the /rfq* + /issuance* endpoints. The unit test injects spies.
  postRfq: AppDeps['postRfq']
  listQuotes: AppDeps['listQuotes']
  acceptQuote: AppDeps['acceptQuote']
  openIssuance: AppDeps['openIssuance']
  clearIssuance: AppDeps['clearIssuance']
  payCoupon: AppDeps['payCoupon']
  redeem: AppDeps['redeem']
}

// The pure §8 helpers (auction.ts) the API needs.
export interface MathPort {
  computeClearing: AppDeps['computeClearing']
  matchedAt: AppDeps['matchedAt']
  demandAt: AppDeps['demandAt']
  supplyAt: AppDeps['supplyAt']
  candidatePrices: AppDeps['candidatePrices']
  choosePStar: AppDeps['choosePStar']
}

export interface BuildDepsArgs {
  ledger: LedgerPort
  math: MathPort
  clock: Clock
  // The clock's timer-start (clock.openRoundClock), passed explicitly so the test
  // can assert it fires alongside openRound on POST /round.
  openRoundClock: (roundId: string, windowSeconds: number) => void
  roundSeconds: number
  // The AI Solver Agent's verify-don't-trust proposeClearing (agent.ts). main()
  // constructs the real keyless-safe agent once at boot; the unit test injects a stub.
  proposeClearing: AppDeps['proposeClearing']
  // WOW-03: the agent's server-side NL order parser (agent.ts). Same boot agent, same
  // module-private key; keyless-degrades to null. The unit test injects a stub.
  parseOrder: AppDeps['parseOrder']
  // ADJ-01: the agent's competing-solvers racer (agent.proposeCompeting). Same boot agent +
  // module-private key; keyless-degrades (all entries verified:false, winner null). The
  // deterministic §8 block always settles — advisory leaderboard only. The unit test stubs it.
  proposeCompeting: AppDeps['proposeCompeting']
  // WOW-04: the agent's live rationale streamer (agent.ts messages.stream) + the pure
  // post-round brief composer (brief.ts). Same boot agent for the stream; the brief is
  // a pure import. The unit test injects stubs.
  streamRationale: AppDeps['streamRationale']
  composeBrief: AppDeps['composeBrief']
  // TRUST-03: read the settle-time decision proof bundle (proof.ts). Optional here so the
  // boot-wiring unit test (index.test.ts) need not inject it; buildDeps defaults it to a
  // null reader. main() supplies the real proof.readProofBundle.
  readProofBundle?: AppDeps['readProofBundle']
  // WOW-05: compose + render the on-brand proof-pack PDF (proofpack.ts) for a settled round.
  // Optional for the same reason; buildDeps defaults it to the on-brand HTML fallback.
  buildProofPack?: AppDeps['buildProofPack']
  // CRYP-02/03 + VIZ-02 crypto deps — ALL optional so the index.test.ts boot-wiring path
  // (which never exercises the crypto endpoints) need not inject them; buildDeps defaults
  // each to an inert secret-free stub, exactly like readProofBundle/buildProofPack above.
  // main() supplies the real tlock.ts / zk/*.ts / timemachine.ts implementations.
  timelockEncrypt?: AppDeps['timelockEncrypt']
  timelockDecrypt?: AppDeps['timelockDecrypt']
  drandRoundInfo?: AppDeps['drandRoundInfo']
  generateProof?: AppDeps['generateProof']
  verifyProof?: AppDeps['verifyProof']
  anchorProof?: AppDeps['anchorProof']
  tamperProof?: AppDeps['tamperProof']
  getStageOffsets?: AppDeps['getStageOffsets']
  // VIZ-03 / WOW-07 — the topology hosting map + the guest /join bootstrap. Optional so
  // the boot-wiring unit test (index.test.ts) need not inject them; buildDeps defaults
  // each to an inert, secret-free stub. main() supplies the real topology.ts probe +
  // the guest bootstrap composed from the deploy party map.
  hostingMap?: AppDeps['hostingMap']
  onboardGuest?: AppDeps['onboardGuest']
  // OPS-02: the aggregate-only status source for the token-free /status surface. Optional so
  // the boot-wiring unit test (index.test.ts) need not inject it; buildDeps threads it through
  // unchanged. main() supplies the real ledger-backed source.
  statusSource?: AppDeps['statusSource']
  // OPS-04: the lifecycle webhook emitter (webhooks.ts). Optional so the boot-wiring unit test
  // can inject a SPY emitter to assert round.opened fires off the open seam. When present,
  // buildDeps (a) fires round.opened off the openRound wrapper (FIRE-AND-FORGET — never blocking
  // the open path) and (b) threads the SAME instance into AppDeps so createApp can serve the
  // register/unregister endpoints + fire the settle-seam events. main() also wires round.sealed
  // off the clock close seam via createClock's onClosed into this same instance.
  webhooks?: Webhooks
  // PAY-01: the x402 metered-access gate (x402.ts). Optional so the boot-wiring unit test
  // (index.test.ts) need not inject it; buildDeps threads it through unchanged onto AppDeps so
  // createApp's disabled default (`?? createX402Gate({ enabled: false })`) holds when boot
  // metering is off. main() constructs the enabled, facilitator-backed gate from the X402_* config.
  x402?: PaymentGate
}

// Assemble the AppDeps so the API routes are wired to the ledger + clock.
//
// CRITICAL WIRING: the injected `openRound` calls the REAL ledger openRound AND
// THEN starts the clock via openRoundClock(roundId, roundSeconds) — opening a round
// must arm the auto-close timer. `closeRound` routes through clock.forceClose so a
// force-close cancels the timer (and the clock calls ledger.closeRound). This factory
// is the single path index.ts and index.test.ts both use, so the test's spies prove
// the live wiring.
export const buildDeps = (args: BuildDepsArgs): AppDeps => {
  const { ledger, math, clock, openRoundClock, roundSeconds, proposeClearing, parseOrder, proposeCompeting, streamRationale, composeBrief } =
    args
  // TRUST-03: default to a null reader when not injected (index.test.ts boot-wiring path).
  const readProofBundle: AppDeps['readProofBundle'] = args.readProofBundle ?? (() => null)
  // WOW-05: default to the on-brand HTML fallback when not injected (index.test.ts path).
  const buildProofPack: AppDeps['buildProofPack'] = args.buildProofPack ?? (async () => ({ pdf: false as const, html: '' }))
  // CRYP-02/03 + VIZ-02: inert, secret-free defaults for the boot-wiring path (index.test.ts).
  // main() overrides every one with the real tlock/zk/timemachine implementation.
  const timelockEncrypt: AppDeps['timelockEncrypt'] =
    args.timelockEncrypt ?? (async () => ({ ciphertext: '', targetRound: 0, mode: 'offline', warning: '' }))
  const timelockDecrypt: AppDeps['timelockDecrypt'] = args.timelockDecrypt ?? (async () => ({ plaintext: '' }))
  const drandRoundInfo: AppDeps['drandRoundInfo'] =
    args.drandRoundInfo ?? (async () => ({ targetRound: 0, timeToBeaconMs: 0, chainHash: '' }))
  const generateProof: AppDeps['generateProof'] =
    args.generateProof ?? (async () => ({ proof: {}, publicSignals: [], sizeBytes: 0, ms: 0 }))
  const verifyProof: AppDeps['verifyProof'] = args.verifyProof ?? (async () => false)
  const anchorProof: AppDeps['anchorProof'] = args.anchorProof ?? (async () => ({ proofHash: '', vkeyHash: '' }))
  const tamperProof: AppDeps['tamperProof'] =
    args.tamperProof ?? (async () => ({ rejected: true, verified: false as const, error: '' }))
  const getStageOffsets: AppDeps['getStageOffsets'] = args.getStageOffsets ?? (() => ({}))
  // VIZ-03 / WOW-07: inert, secret-free defaults for the boot-wiring path (index.test.ts).
  // main() overrides both with the real topology probe + guest bootstrap.
  const hostingMap: AppDeps['hostingMap'] =
    args.hostingMap ?? (async () => ({ nodes: [], perParty: {}, demoReal: true, caption: 'SAME PARTICIPANT (LOCALNET)' }))
  const onboardGuest: AppDeps['onboardGuest'] =
    args.onboardGuest ?? (async () => ({ party: '', joinUrl: '/join', roundId: '' }))
  // OPS-04: FIRE-AND-FORGET webhook emit off the open seam — never block/branch the open path
  // on a webhook (hard invariant). No-op when no emitter is injected (index.test default path).
  const emitWebhook = (event: 'round.opened', data: Record<string, unknown>): void => {
    if (!args.webhooks) return
    void Promise.resolve()
      .then(() => args.webhooks!.emit(event, data))
      .catch(() => undefined)
  }
  return {
    // POST /round → ledger create THEN timer start (both), THEN fire round.opened.
    openRound: async (roundId, desks, windowSeconds): Promise<RoundView> => {
      const round = await ledger.openRound(roundId, desks, windowSeconds)
      openRoundClock(round.roundId, roundSeconds)
      // OPS-04 round.opened — aggregate/round data only (id + desk count), never order content.
      emitWebhook('round.opened', { roundId: round.roundId, desks: desks.length })
      return round
    },
    queryRound: ledger.queryRound,
    readSealedOrders: ledger.readSealedOrders,
    refreshStats: ledger.refreshStats,
    readTradeConfirmations: ledger.readTradeConfirmations,
    // POST /round/:id/close → clock.forceClose (cancels the timer, calls ledger.closeRound).
    closeRound: async (roundId): Promise<string> => {
      await clock.forceClose(roundId)
      const state = clock.getState(roundId)
      return state?.status ?? 'Closed'
    },
    settle: ledger.settle,
    // WOW-02: the dedicated tamper seam (never on the /settle path).
    tamperClear: ledger.tamperClear,
    // ADJ-01/02/03: competing solvers (agent) + RFQ + issuance exercise wrappers (ledger).
    proposeCompeting,
    postRfq: ledger.postRfq,
    listQuotes: ledger.listQuotes,
    acceptQuote: ledger.acceptQuote,
    openIssuance: ledger.openIssuance,
    clearIssuance: ledger.clearIssuance,
    payCoupon: ledger.payCoupon,
    redeem: ledger.redeem,
    // The AI Solver Agent — proposes a clearing, the deterministic core verifies it.
    proposeClearing,
    // WOW-03: server-side NL order parsing (same boot agent, key module-private).
    parseOrder,
    // WOW-04: live rationale streaming (same boot agent) + the pure brief composer.
    streamRationale,
    composeBrief,
    // TRUST-03: read-only decision proof bundle for GET /round/:id/proof.
    readProofBundle,
    // WOW-05: on-brand proof-pack PDF for GET /round/:id/proof-pack.pdf.
    buildProofPack,
    // CRYP-02/03 + VIZ-02: timelock, ZK prove/verify/anchor/tamper, stage offsets.
    timelockEncrypt,
    timelockDecrypt,
    drandRoundInfo,
    generateProof,
    verifyProof,
    anchorProof,
    tamperProof,
    getStageOffsets,
    // VIZ-03: the party→participant hosting map (credential-free).
    hostingMap,
    // WOW-07: the guest /join bootstrap (party + URL + roundId; never a token).
    onboardGuest,
    // OPS-02: the aggregate-only status source for the token-free /status surface (optional).
    statusSource: args.statusSource,
    // OPS-04: thread the SAME webhook emitter into createApp for the register/unregister
    // endpoints + the settle-seam emits (round.cleared/round.settled/fill.posted).
    webhooks: args.webhooks,
    // PAY-01: thread the x402 gate through unchanged; undefined ⇒ createApp installs the
    // disabled no-op default (default-OFF byte-unchanged). main() supplies the real gate.
    x402: args.x402,
    computeClearing: math.computeClearing,
    matchedAt: math.matchedAt,
    demandAt: math.demandAt,
    supplyAt: math.supplyAt,
    candidatePrices: math.candidatePrices,
    choosePStar: math.choosePStar,
  }
}

// ── OPS-01 telemetry-first boot (Pitfall 1) ───────────────────────────────────────
// Initialise the OTel provider FIRST, then register graceful shutdown on SIGTERM/SIGINT.
// Called at the top of main() (after dotenv, before the instrumented ledger/agent imports)
// so every request-path span binds to a live provider and the SDK flushes on shutdown.
// Injected callbacks keep the ordering unit-testable without booting the service.
export interface TelemetryBoot {
  initTelemetry: () => void
  onSignal: (handler: () => void) => void
  shutdownTelemetry: () => Promise<void>
}

export const bootTelemetry = (boot: TelemetryBoot): void => {
  boot.initTelemetry() // FIRST — before any instrumented module runs
  boot.onSignal(() => {
    void boot.shutdownTelemetry()
  })
}

// ── Live boot (only runs when executed as the entrypoint, never on import) ────────
const main = async (): Promise<void> => {
  const dotenv = await import('dotenv')
  dotenv.config()

  // OPS-01 Pitfall 1: telemetry initialises AFTER dotenv (so the OTLP endpoint from .env is
  // read) but BEFORE the instrumented ledger/agent modules import — otherwise their
  // request-path spans never attach to a registered provider. shutdownTelemetry flushes the
  // SDK on SIGTERM/SIGINT. The redacting log() replaces the raw boot console output.
  const { initTelemetry, shutdownTelemetry } = await import('./telemetry.js')
  const { log } = await import('./logger.js')
  const { createSecretsProvider } = await import('./secrets.js')
  bootTelemetry({
    initTelemetry,
    onSignal: (handler) => {
      process.once('SIGTERM', handler)
      process.once('SIGINT', handler)
    },
    shutdownTelemetry,
  })

  const roundSeconds = Number(process.env.ROUND_SECONDS ?? DEFAULT_ROUND_SECONDS) || DEFAULT_ROUND_SECONDS
  const solverPort = Number(process.env.SOLVER_PORT ?? DEFAULT_SOLVER_PORT) || DEFAULT_SOLVER_PORT

  // Import the ledger client AFTER dotenv + initTelemetry so it reads JSON_API_URL from .env
  // and its request-path spans bind to the live provider (instrumented module — Pitfall 1).
  const ledger = await import('./ledger.js')
  const auction = await import('./auction.js')
  const { createClock } = await import('./clock.js')
  const { createWebhooks } = await import('./webhooks.js')
  const { createAgent } = await import('./agent.js')
  const { composeBrief } = await import('./brief.js')
  // TRUST-03: the decision proof bundle writer/reader (proof.ts). The write is an ADDITIVE
  // side effect in settleResult below — the deterministic settle path stays byte-unchanged.
  const proof = await import('./proof.js')
  // WOW-05: the on-brand proof-pack renderer + headless-Chrome PDF spawn (proofpack.ts).
  const proofpack = await import('./proofpack.js')
  const { fileURLToPath } = await import('node:url')
  // CRYP-02/03 + VIZ-02: the timelock (tlock.ts), ZK prover/verifier (zk/*.ts), and the
  // VIZ-02 stage→offset capture map (timemachine.ts). Dynamically imported AFTER dotenv so
  // tlock reads DRAND_URL and the zk modules' snarkjs/circomlibjs eval only at live boot
  // (never on the index.test.ts import path). The verification key is the committed §4 fixture.
  const tlock = await import('./tlock.js')
  const zkProve = await import('./zk/prove.js')
  const zkVerify = await import('./zk/verify.js')
  const timemachine = await import('./timemachine.js')
  const { readFileSync } = await import('node:fs')
  const { randomBytes } = await import('node:crypto')
  const vkey = JSON.parse(
    readFileSync(fileURLToPath(new URL('./zk/vkey.json', import.meta.url)), 'utf8'),
  ) as Record<string, unknown>

  // OPS-02: resolve the Anthropic API key through the SecretsProvider seam. The `env`
  // backend returns exactly today's process.env.ANTHROPIC_API_KEY (byte-for-byte); the
  // `vault` backend can swap in at UAT via SECRETS_PROVIDER=vault. When a key resolves,
  // construct the Anthropic client HERE and INJECT it into createAgent; when it is absent
  // (the env backend throws `${name} is unset`), the agent keyless-degrades (the §4 fixture
  // still clears at 100.00). The key is resolved server-side only and NEVER logged/returned.
  // The operator/party-token seam routes through the SAME provider — ledger.ts keeps its
  // proven file-based token resolution unchanged; only the seam is added for the vault swap.
  const secrets = createSecretsProvider()
  let agentClient: import('./agent.js').AgentClient | null = null
  try {
    const apiKey = (await secrets.get('ANTHROPIC_API_KEY')).trim()
    if (apiKey) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      agentClient = new Anthropic({ apiKey }) as unknown as import('./agent.js').AgentClient
    }
  } catch {
    // env backend throws `${name} is unset` when the key is absent → keyless degradation.
    agentClient = null
  }

  // Construct the real AI Solver Agent ONCE at boot, INJECTING the SecretsProvider-resolved
  // client (createAgent prefers an injected client over its module-private one, and
  // keyless-degrades when absent — so the §4 fixture still clears at 100.00 either way).
  const agent = createAgent({
    client: agentClient,
    computeClearing: auction.computeClearing,
    matchedAt: auction.matchedAt,
  })

  // ── PAY-01 x402 metered-access config (default-OFF — the primary invariant) ───────────
  // Read the X402_* config with safe defaults. With X402_ENABLED unset/false the gate is a
  // byte-identical no-op, so the §4 money-shot demo is untouched. network/asset/URL are
  // ENV-DRIVEN placeholders (NO hard-coded Canton CAIP-2 id / facilitator hostname — confirmed
  // at UAT via GET /supported). X402_PAY_TO defaults to the venue = the operator party.
  const x402Enabled = process.env.X402_ENABLED === 'true'
  const x402Backend = (process.env.X402_FACILITATOR ?? 'self') as 'self' | 'canton-cc'
  const x402Network = process.env.X402_NETWORK ?? 'canton:devnet'
  const x402Asset = process.env.X402_ASSET ?? 'CantonCoin'
  const x402Price = process.env.X402_PRICE ?? '1.00'
  const x402PayTo = process.env.X402_PAY_TO ?? ledger.operatorParty
  const x402FacilitatorUrl = process.env.X402_FACILITATOR_URL ?? ''

  // Resolve the canton-cc facilitator key through the SAME SecretsProvider seam as the Anthropic
  // key: server-side ONLY, held module-private in this closure, NEVER logged/returned/echoed. The
  // env backend throws `${name} is unset` when absent → degrade to undefined (the `self` backend
  // needs no key; only `canton-cc` uses it, on the Authorization header inside facilitator.ts).
  let x402FacilitatorKey: string | undefined
  try {
    const k = (await secrets.get('X402_FACILITATOR_KEY')).trim()
    x402FacilitatorKey = k || undefined
  } catch {
    x402FacilitatorKey = undefined
  }

  // Construct the FacilitatorClient behind the Plan 01 interface, then the gate. `self` settles
  // on Umbra's own ledger in operator-custody USDCx via the INJECTED listHoldings/moveFee port;
  // `canton-cc` speaks the FTP /verify+/settle contract for real $CC (live = UAT). The disabled
  // default means an absent/false X402_ENABLED yields a pure no-op (createApp keeps it off too).
  const { createFacilitator } = await import('./facilitator.js')
  const { createX402Gate } = await import('./x402.js')
  const facilitator = createFacilitator({
    backend: x402Backend,
    ledger: { listHoldings: ledger.listHoldings, moveFee: ledger.moveFee },
    facilitatorUrl: x402FacilitatorUrl,
    facilitatorKey: x402FacilitatorKey,
  })
  const x402 = createX402Gate({
    facilitator,
    enabled: x402Enabled,
    network: x402Network,
    asset: x402Asset,
    price: x402Price,
    payTo: x402PayTo,
  })

  // OPS-02: the aggregate-only source for the token-free /status surface. Reports venue
  // health (degraded when the ledger is unreachable) + the CURRENT round's status (never an
  // order/desk/secret) + build/version. api.ts maps the status → display phase via the FSM
  // sealedAlias and adds uptime + the last clear. Live-ledger-optional (degrades cleanly).
  const statusSource = async (): Promise<{ health: Health; roundStatus: RoundStatus | null; build: string }> => {
    const build = process.env.UMBRA_BUILD ?? 'phase-13'
    try {
      const live = await ledger.queryAllRounds()
      const open = live.find((r) => r.status === 'Open')
      const latest = open ?? live[live.length - 1]
      return { health: 'operational', roundStatus: (latest?.status as RoundStatus) ?? null, build }
    } catch {
      return { health: 'degraded', roundStatus: null, build }
    }
  }

  // OPS-04: construct the lifecycle webhook emitter ONCE at boot. It is threaded into BOTH the
  // clock (round.sealed off the close seam) and buildDeps/createApp (round.opened off the open
  // seam + round.cleared/round.settled/fill.posted off the settle seam + the register/unregister
  // endpoints). The per-subscription secret stays module-private inside webhooks.ts.
  const webhooks: Webhooks = createWebhooks()

  // The clock force-closes ON-LEDGER via ledger.closeRound at the window / on demand. OPS-04:
  // onClosed fires round.sealed AFTER the authoritative close — FIRE-AND-FORGET (webhooks.emit
  // never throws to the caller; the clock also guards it) so a webhook can never affect the seal.
  const clock = createClock({
    closeRound: ledger.closeRound,
    onClosed: (roundId) => {
      void Promise.resolve()
        .then(() => webhooks.emit('round.sealed', { roundId }))
        .catch(() => undefined)
    },
  })

  // REHYDRATE: recognize live rounds (the sandbox-seeded R1) so the solver does not
  // treat them as unknown. The ledger Round.status is authoritative.
  try {
    const live = await ledger.queryAllRounds()
    clock.rehydrate(
      live.map((r) => ({
        roundId: r.roundId,
        status: r.status as 'Open' | 'Closed' | 'Cleared' | 'Settled',
        windowSeconds: r.windowSeconds,
      })),
    )
    log('info', 'rehydrated rounds from the ledger', { count: live.length })
  } catch (err) {
    // Boot must not crash if the sandbox is not yet reachable — log a secret-free note
    // (err.name only, never err.message / the raw object) via the redacting logger.
    log('warn', 'rehydrate skipped — ledger not reachable yet (rounds recognized on first request)', {
      error: err instanceof Error ? err.name : 'unknown',
    })
  }

  // Adapt the ledger.ts return shapes onto the API's RoundView / SettleResult
  // (ledger.queryRound returns a CreateEvent<Round>; ledger.settle returns
  // { result, status }). These are thin projections — no behavior change.
  const queryRoundView: LedgerPort['queryRound'] = async (roundId): Promise<RoundView | null> => {
    const c = await ledger.queryRound(roundId)
    if (!c) return null
    return {
      roundId: c.payload.roundId,
      status: c.payload.status,
      desks: c.payload.desks,
      openedAt: c.payload.openedAt,
      windowSeconds: Number(c.payload.windowSeconds),
    }
  }
  const openRoundView: LedgerPort['openRound'] = async (roundId, desks, windowSeconds): Promise<RoundView> => {
    const r = await ledger.openRound(roundId, desks, windowSeconds)
    // VIZ-02: capture the 'open' stage offset (best-effort; a live-ledger read that must
    // NEVER break the open path — an offset is a numeric bookmark, not authority).
    void timemachine.recordStage(roundId, 'open').catch(() => undefined)
    return { roundId: r.roundId, status: r.status }
  }
  const closeRoundStr: LedgerPort['closeRound'] = async (roundId): Promise<string> => {
    const status = String(await ledger.closeRound(roundId))
    // VIZ-02: capture the 'sealed' stage offset at close (best-effort, never fatal).
    void timemachine.recordStage(roundId, 'sealed').catch(() => undefined)
    return status
  }
  const settleResult: LedgerPort['settle'] = async (roundId) => {
    // Capture the §8 allocation BEFORE settle retires the sealed orders (ClearResult
    // carries only the aggregate totalMatched, not per-desk fills). The deterministic
    // computeClearing is the SAME allocation the on-ledger Clear re-verifies.
    const views = (await ledger.readSealedOrders(roundId)).map((s) => s.view)
    const clearing = auction.computeClearing(views)
    const { allocations } = clearing
    const { result } = await ledger.settle(roundId)

    // VIZ-02: capture the 'settled' stage offset (best-effort; NEVER changes settle's return).
    void timemachine.recordStage(roundId, 'settled').catch(() => undefined)

    // TRUST-03: ADDITIVELY persist the immutable decision proof bundle from the LIVE views +
    // the deterministic §8 recompute + an off-authority agent proposal (purely for provenance:
    // verified/source/rawAiProposal). This runs AFTER ledger.settle and NEVER affects the
    // settlement — a write failure is logged secret-free and swallowed so /settle is unchanged.
    try {
      const agentResult = await agent.proposeClearing(views)
      proof.writeProofBundle({
        roundId,
        views,
        agentResult,
        clearingPrice: clearing.clearingPrice,
        allocations: clearing.allocations,
        verified: agentResult.verified,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Proof bundle write skipped (non-fatal)', err instanceof Error ? err.name : 'unknown')
    }

    return {
      clearingPrice: Number(result.clearingPrice),
      allocations,
      matchedVolume: Number(result.totalMatched),
    }
  }

  // WOW-05: compose the on-brand proof-pack for a settled round from the persisted proof bundle
  // + the per-desk TradeConfirmations + the shareable brief, then render + spawn a PDF. Reads
  // ledger truth (restart-proof); interpolates only numbers/hashes/brief — never a secret.
  const buildProofPack: AppDeps['buildProofPack'] = async (roundId) => {
    const bundle = proof.readProofBundle(roundId)
    const confs = await ledger.readTradeConfirmations(roundId)
    const allocations = confs.map((c) => ({ desk: c.desk, side: c.side, filledQty: c.filledQty }))
    const clearingPrice = bundle?.deterministicRecompute.clearingPrice ?? confs[0]?.clearingPrice ?? 0
    const matchedVolume = confs.filter((c) => c.side === 'Buy').reduce((sum, c) => sum + c.filledQty, 0)
    const rationale = bundle?.rawAiProposal.rationale ?? ''
    const brief = composeBrief(clearingPrice, matchedVolume, allocations, rationale)
    const html = proofpack.renderProofPackHtml({
      clearingPrice,
      matchedVolume,
      allocations,
      brief,
      // AUCT-04: embed the per-desk TCA receipts (two-distinct-surplus) in bundle 02.
      receipts: confs.map((c) => ({
        desk: c.desk,
        side: c.side,
        filledQty: c.filledQty,
        clearingPrice: c.clearingPrice,
        ownLimit: c.ownLimit ?? null,
        referencePrice: c.referencePrice ?? c.clearingPrice,
        surplusVsLimit: c.surplusVsLimit ?? 0,
        improvementVsLimitBp: c.improvementVsLimitBp ?? 0,
        improvementVsReferenceBp: c.improvementVsReferenceBp ?? 0,
      })),
      aiBundle: {
        modelId: bundle?.modelId ?? 'claude-haiku-4-5',
        verified: bundle?.verified ?? false,
        source: bundle?.rawAiProposal.source,
        systemPromptHash: bundle?.systemPromptHash,
        clearingHash: bundle?.clearingHash,
      },
    })
    const safeId = roundId.replace(/[^A-Za-z0-9_.-]/g, '_')
    const outPath = fileURLToPath(new URL(`../.tmp/Umbra-Proof-Pack-${safeId}.pdf`, import.meta.url))
    return proofpack.generateProofPackPdf(html, outPath)
  }

  // ── CRYP-03 proof composition (zk/prove.ts over the round's sealed views) ─────────
  // Build the §4 ClearingWitness from the LIVE sealed orders + the deterministic §8 fills,
  // then produce a real Groth16 proof. Each order's salt is a CRYPTOGRAPHICALLY-RANDOM field
  // element (randomBytes(31) = 248 bits, safely below the BN254 scalar field prime), freshly
  // generated per order — a real blinding factor so the published Poseidon commitments are
  // actually hiding (NOT a guessable index; that defeats sealed-bid privacy). The salt stays
  // in the PRIVATE witness — it never leaves zk/prove.ts; only { proof, publicSignals,
  // sizeBytes, ms } return, and the salt is never logged.
  const saltFieldElement = () => BigInt('0x' + randomBytes(31).toString('hex')).toString()
  const generateProof: AppDeps['generateProof'] = async (roundId) => {
    const views = (await ledger.readSealedOrders(roundId)).map((s) => s.view)
    const clearing = auction.computeClearing(views)
    const pStar = clearing.clearingPrice
    const matched = auction.matchedAt(views, pStar)
    const orders = views.map((v) => {
      const alloc = clearing.allocations.find((a) => a.desk === v.desk && a.side === v.side)
      return {
        side: (v.side === 'Buy' ? 1 : 0) as 0 | 1,
        qty: v.quantity,
        limit: v.limit,
        salt: saltFieldElement(), // high-entropy random blinding factor (never logged / returned)
        fill: alloc?.filledQty ?? 0,
      }
    })
    return zkProve.generateClearingProof({ pStar, matched, orders })
  }

  // CRYP-03 OFF-LEDGER verify — a thin pass-through to the real Groth16 check.
  const verifyProof: AppDeps['verifyProof'] = (vk, publicSignals, proof) =>
    zkVerify.verifyClearingProof(vk, publicSignals, proof)

  // CRYP-03 ON-LEDGER anchor — compute the anchor hashes, record ONLY those on-ledger, and
  // return them. DISTINCT from verify: this records "a proof against this circuit existed",
  // it does NOT re-verify (the off-ledger verify is the separate act).
  const anchorProof: AppDeps['anchorProof'] = async (roundId, proof, publicSignals, vk) => {
    const hashes = zkVerify.proofAnchorHashes(proof, publicSignals, vk)
    await ledger.anchorProof(roundId, hashes.proofHash, hashes.vkeyHash)
    return hashes
  }

  // CRYP-03 "break the proof" — generate a valid proof, perturb the FIRST public signal (p*),
  // re-verify → expect false. Mirrors tamperClear: NEVER throws, NEVER anchors; the verbatim
  // (secret-free) rejection is the payload.
  const tamperProof: AppDeps['tamperProof'] = async (roundId) => {
    try {
      const { proof, publicSignals } = await generateProof(roundId)
      const tampered = [...publicSignals]
      tampered[0] = String(BigInt(tampered[0] ?? '0') + 1n) // perturb p* by +1
      const verified = await zkVerify.verifyClearingProof(vkey, tampered, proof)
      return {
        rejected: !verified,
        verified: false as const,
        error: verified
          ? 'UNEXPECTED: the tampered public input verified — investigate the circuit'
          : 'Groth16 verification rejected the tampered public input (p* perturbed by +1).',
      }
    } catch {
      // Secret-free never-throw contract — a prover/verifier outage still yields a clean body.
      return { rejected: true, verified: false as const, error: 'proof generation or verification unavailable' }
    }
  }

  // ── VIZ-03 topology probe (topology.ts) + WOW-07 guest bootstrap ──────────────────
  // The hosting map probes each participant's /v2/parties with the ADMIN bearer
  // (ledger-api-user, the same token xnode-up.mjs uses across :2975/:3975/:4975). The
  // token lives ONLY inside the probe closure — it never crosses into the TopologyResult
  // (credential-free boundary, SOLV-04 / T-11-03-LEAK). Live-ledger-optional: hostingMap
  // catches a down participant per-probe and degrades to an honest partial/empty map.
  const topology = await import('./topology.js')
  const readAdminBearer = (): string => {
    try {
      const raw = readFileSync(fileURLToPath(new URL('../../scripts/.operator-token', import.meta.url)), 'utf8')
      return (JSON.parse(raw) as { token?: string }).token ?? ''
    } catch {
      return ''
    }
  }
  const readDeskParties = (): string[] => {
    try {
      const raw = readFileSync(fileURLToPath(new URL('../../daml/parties.json', import.meta.url)), 'utf8')
      const p = JSON.parse(raw) as Record<string, string>
      // Focus the hosting map on the DESK parties (A/B/C + the guest bankD when present)
      // so demoReal reflects desk residency, not the participants' own admin parties.
      return [p.bankA, p.bankB, p.bankC, p.bankD].filter((x): x is string => Boolean(x))
    } catch {
      return []
    }
  }
  const readGuestParty = (): string => {
    try {
      const raw = readFileSync(fileURLToPath(new URL('../../web/src/tokens.json', import.meta.url)), 'utf8')
      // Read ONLY the guest party id — the scoped token in tokens.json is NEVER surfaced
      // by the bootstrap endpoint (T-11-03-QR).
      return (JSON.parse(raw) as Record<string, { party?: string }>).bankD?.party ?? ''
    } catch {
      return ''
    }
  }
  const hostingMap: AppDeps['hostingMap'] = () => {
    const adminBearer = readAdminBearer()
    const probe = async (base: string): Promise<{ party: string; isLocal: boolean }[]> => {
      const res = await fetch(`${base}/v2/parties`, { headers: { Authorization: `Bearer ${adminBearer}` } })
      if (!res.ok) throw new Error(`/v2/parties HTTP ${res.status}`)
      const json = (await res.json()) as { partyDetails?: { party: string; isLocal: boolean }[] }
      return (json.partyDetails ?? []).map((d) => ({ party: d.party, isLocal: Boolean(d.isLocal) }))
    }
    return topology.hostingMap(probe, { desks: readDeskParties() })
  }
  const onboardGuest: AppDeps['onboardGuest'] = async () => {
    // Pick a live round for the /join deep-link (Open preferred), degrade to R1. No token.
    let roundId = 'R1'
    try {
      const live = await ledger.queryAllRounds()
      const open = live.find((r) => r.status === 'Open') ?? live[0]
      if (open) roundId = open.roundId
    } catch {
      // ledger unreachable — the default deep-link still works once a round exists.
    }
    // The /join URL carries ONLY the roundId (the QR encodes THIS) — never the token.
    return { party: readGuestParty(), joinUrl: `/join?round=${encodeURIComponent(roundId)}`, roundId }
  }

  const deps = buildDeps({
    ledger: {
      openRound: openRoundView,
      queryRound: queryRoundView,
      readSealedOrders: ledger.readSealedOrders,
      refreshStats: ledger.refreshStats,
      closeRound: closeRoundStr,
      settle: settleResult,
      tamperClear: ledger.tamperClear,
      readTradeConfirmations: ledger.readTradeConfirmations,
      // ADJ-02 RFQ + ADJ-03 issuance exercise wrappers (real ledger.ts implementations).
      postRfq: ledger.postRfq,
      listQuotes: ledger.listQuotes,
      acceptQuote: ledger.acceptQuote,
      openIssuance: ledger.openIssuance,
      clearIssuance: ledger.clearIssuance,
      payCoupon: ledger.payCoupon,
      redeem: ledger.redeem,
    },
    math: {
      computeClearing: auction.computeClearing,
      matchedAt: auction.matchedAt,
      demandAt: auction.demandAt,
      supplyAt: auction.supplyAt,
      candidatePrices: auction.candidatePrices,
      choosePStar: auction.choosePStar,
    },
    clock,
    openRoundClock: (roundId, windowSeconds) => clock.openRoundClock(roundId, windowSeconds),
    roundSeconds,
    proposeClearing: agent.proposeClearing,
    parseOrder: agent.parseOrder,
    // ADJ-01: the competing-solvers racer (same boot agent, module-private key).
    proposeCompeting: agent.proposeCompeting,
    streamRationale: agent.streamRationale,
    composeBrief,
    // TRUST-03: serve the settle-time decision proof bundle read-only.
    readProofBundle: proof.readProofBundle,
    // WOW-05: serve the on-brand proof-pack PDF (window.print() HTML fallback).
    buildProofPack,
    // CRYP-02: timelock seal/open + public drand round metadata (tlock.ts).
    timelockEncrypt: (payload, windowMs) => tlock.timelockSeal(payload, windowMs),
    timelockDecrypt: async (ciphertext) => ({ plaintext: await tlock.timelockOpen(ciphertext) }),
    drandRoundInfo: (windowMs) => tlock.drandRoundInfo(windowMs),
    // CRYP-03: ZK prove (off round views) / verify (off-ledger) / anchor (on-ledger) / tamper.
    generateProof,
    verifyProof,
    anchorProof,
    tamperProof,
    // VIZ-02: the recorded stage→offset map for the round (timemachine.ts).
    getStageOffsets: (roundId) => timemachine.getStageOffsets(roundId),
    // VIZ-03: the credential-free party→participant hosting map (topology.ts probe).
    hostingMap,
    // WOW-07: the guest /join bootstrap (party + URL + roundId; never a token).
    onboardGuest,
    // OPS-02: the ledger-backed aggregate status source for the token-free /status surface.
    statusSource,
    // OPS-04: the lifecycle webhook emitter (round.opened off the open seam; register/settle in createApp).
    webhooks,
    // PAY-01: the x402 metered-access gate (default-OFF unless X402_ENABLED=true) — created above
    // from the X402_* config with the facilitator key resolved via the SecretsProvider.
    x402,
  })

  const app = createApp(deps)
  app.listen(solverPort, () => {
    // SECRET-FREE boot log via the redacting JSON logger: only the bound port + the PUBLIC
    // operator party id. NEVER the token, ANTHROPIC_API_KEY, or process.env (SOLV-04 / T-04-04).
    log('info', `solver listening on :${solverPort} as ${ledger.operatorParty}`, {
      port: solverPort,
      operatorParty: ledger.operatorParty,
    })
  })
}

// Run main() only when this file is the process entrypoint — importing it for the
// unit test (buildDeps) must NOT boot the service, connect, or listen.
const isEntrypoint = (): boolean => {
  const entry = process.argv[1]
  if (!entry) return false
  // import.meta.url is a file:// URL; compare its path tail to the invoked script.
  return import.meta.url.endsWith(entry.replace(/\\/g, '/').split('/').pop() ?? '__never__')
}

if (isEntrypoint()) {
  main().catch((err) => {
    // Secret-free fatal log — do not serialize the underlying error (could carry a path).
    // eslint-disable-next-line no-console
    console.error('Solver failed to boot:', err instanceof Error ? err.message : 'unknown error')
    process.exit(1)
  })
}
