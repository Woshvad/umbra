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
import type { Clock } from './clock.js'

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
  readTradeConfirmations: AppDeps['readTradeConfirmations']
}

// The pure §8 helpers (auction.ts) the API needs.
export interface MathPort {
  computeClearing: AppDeps['computeClearing']
  matchedAt: AppDeps['matchedAt']
  demandAt: AppDeps['demandAt']
  supplyAt: AppDeps['supplyAt']
  candidatePrices: AppDeps['candidatePrices']
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
  const { ledger, math, clock, openRoundClock, roundSeconds, proposeClearing, parseOrder } = args
  return {
    // POST /round → ledger create THEN timer start (both).
    openRound: async (roundId, desks, windowSeconds): Promise<RoundView> => {
      const round = await ledger.openRound(roundId, desks, windowSeconds)
      openRoundClock(round.roundId, roundSeconds)
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
    // The AI Solver Agent — proposes a clearing, the deterministic core verifies it.
    proposeClearing,
    // WOW-03: server-side NL order parsing (same boot agent, key module-private).
    parseOrder,
    computeClearing: math.computeClearing,
    matchedAt: math.matchedAt,
    demandAt: math.demandAt,
    supplyAt: math.supplyAt,
    candidatePrices: math.candidatePrices,
  }
}

// ── Live boot (only runs when executed as the entrypoint, never on import) ────────
const main = async (): Promise<void> => {
  const dotenv = await import('dotenv')
  dotenv.config()

  const roundSeconds = Number(process.env.ROUND_SECONDS ?? DEFAULT_ROUND_SECONDS) || DEFAULT_ROUND_SECONDS
  const solverPort = Number(process.env.SOLVER_PORT ?? DEFAULT_SOLVER_PORT) || DEFAULT_SOLVER_PORT

  // Import the ledger client AFTER dotenv so it reads JSON_API_URL from .env.
  const ledger = await import('./ledger.js')
  const auction = await import('./auction.js')
  const { createClock } = await import('./clock.js')
  const { createAgent } = await import('./agent.js')

  // Construct the real AI Solver Agent ONCE at boot. No `client` is passed — agent.ts
  // resolves its own module-private ANTHROPIC_API_KEY (or runs keyless: the §4 fixture
  // still clears at 100.00 with a neutral rationale). index.ts NEVER reads the key.
  const agent = createAgent({
    computeClearing: auction.computeClearing,
    matchedAt: auction.matchedAt,
  })

  // The clock force-closes ON-LEDGER via ledger.closeRound at the window / on demand.
  const clock = createClock({ closeRound: ledger.closeRound })

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
    // eslint-disable-next-line no-console
    console.log(`Rehydrated ${live.length} round(s) from the ledger`)
  } catch (err) {
    // Boot must not crash if the sandbox is not yet reachable — log a secret-free note.
    // eslint-disable-next-line no-console
    console.warn('Rehydrate skipped — ledger not reachable yet (will recognize rounds on first request)')
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
    return { roundId: r.roundId, status: r.status }
  }
  const closeRoundStr: LedgerPort['closeRound'] = async (roundId): Promise<string> =>
    String(await ledger.closeRound(roundId))
  const settleResult: LedgerPort['settle'] = async (roundId) => {
    // Capture the §8 allocation BEFORE settle retires the sealed orders (ClearResult
    // carries only the aggregate totalMatched, not per-desk fills). The deterministic
    // computeClearing is the SAME allocation the on-ledger Clear re-verifies.
    const views = (await ledger.readSealedOrders(roundId)).map((s) => s.view)
    const { allocations } = auction.computeClearing(views)
    const { result } = await ledger.settle(roundId)
    return {
      clearingPrice: Number(result.clearingPrice),
      allocations,
      matchedVolume: Number(result.totalMatched),
    }
  }

  const deps = buildDeps({
    ledger: {
      openRound: openRoundView,
      queryRound: queryRoundView,
      readSealedOrders: ledger.readSealedOrders,
      refreshStats: ledger.refreshStats,
      closeRound: closeRoundStr,
      settle: settleResult,
      readTradeConfirmations: ledger.readTradeConfirmations,
    },
    math: {
      computeClearing: auction.computeClearing,
      matchedAt: auction.matchedAt,
      demandAt: auction.demandAt,
      supplyAt: auction.supplyAt,
      candidatePrices: auction.candidatePrices,
    },
    clock,
    openRoundClock: (roundId, windowSeconds) => clock.openRoundClock(roundId, windowSeconds),
    roundSeconds,
    proposeClearing: agent.proposeClearing,
    parseOrder: agent.parseOrder,
  })

  const app = createApp(deps)
  app.listen(solverPort, () => {
    // SECRET-FREE boot log: only the bound port + the PUBLIC operator party id.
    // NEVER the token, ANTHROPIC_API_KEY, or process.env (SOLV-04 / T-04-04).
    // eslint-disable-next-line no-console
    console.log(`Solver listening on :${solverPort} as ${ledger.operatorParty}`)
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
