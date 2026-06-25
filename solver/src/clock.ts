// solver/src/clock.ts — the in-memory round-lifecycle clock.
//
// A `Map<roundId, RoundState>` tracks the auction window for each open round:
// status, the openedAt/deadline timestamps, and a single per-round setTimeout
// handle that AUTO-ADVANCES the round to Closed when the ROUND_SECONDS window
// expires. A force-close affordance (`forceClose`) cancels that timer and closes
// the round early.
//
// AUTHORITY (threat T-04-10): the map is CACHE / CLOCK state ONLY. The ledger
// `Round.status` is the source of truth — the solver `rehydrate()`s the map from a
// live `query(Round)` on boot so a sandbox-seeded round is recognized, and every
// real lifecycle gate (Clear's on-ledger guard) lives on the ledger, not here.
//
// TIMER HYGIENE (threat T-04-11): `openRoundClock` stores exactly one timer handle
// per round; `forceClose` always `clearTimeout`s it so a force-closed round's timer
// callback can never also fire. `forceClose` is idempotent — a no-op once the round
// has left the Open state.
//
// SECRETS: the clock deals only in roundId / status / timestamps. It never holds the
// Operator token or any secret (SOLV-04).

// The lifecycle states a round can be in (mirrors the ledger RoundStatus).
export type RoundStatus = 'Open' | 'Closed' | 'Cleared' | 'Settled'

// Per-round clock/cache state. `timer` is the live setTimeout handle (cleared on
// force-close / auto-close); `cachedProposal` is an optional slot a later phase
// can use to memoize the computed clearing (unused in P4).
export interface RoundState {
  roundId: string
  status: RoundStatus
  openedAt: number
  deadline: number
  timer?: NodeJS.Timeout
  cachedProposal?: unknown
}

// Statuses that mean the round has already left the Open window — force-close /
// auto-close are no-ops for these (idempotency guard).
const NON_OPEN: ReadonlySet<RoundStatus> = new Set<RoundStatus>(['Closed', 'Cleared', 'Settled'])

// Dependencies injected so the unit tests can stub `closeRound` with no live ledger.
export interface ClockDeps {
  // Force-close the round ON-LEDGER (ledger.ts closeRound). Called on timer expiry
  // and on an explicit forceClose. The ledger status remains authoritative.
  closeRound: (roundId: string) => Promise<unknown>
}

export interface Clock {
  openRoundClock(roundId: string, windowSeconds: number): RoundState
  forceClose(roundId: string): Promise<void>
  getState(roundId: string): RoundState | undefined
  setStatus(roundId: string, status: RoundStatus): void
  rehydrate(
    rounds: { roundId: string; status: RoundStatus; openedAt?: number; windowSeconds?: number }[],
  ): void
}

export const createClock = (deps: ClockDeps): Clock => {
  // Private clock/cache map — never exposed directly; the ledger is authoritative.
  const rounds = new Map<string, RoundState>()

  // Internal close routine shared by the timer callback and forceClose. Idempotent:
  // if the round already left the Open state, do nothing (do not call closeRound twice).
  const close = async (roundId: string): Promise<void> => {
    const state = rounds.get(roundId)
    if (!state || NON_OPEN.has(state.status)) return
    // Cancel the auto-close timer first so it cannot also fire (T-04-11).
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
    await deps.closeRound(roundId)
    state.status = 'Closed'
  }

  return {
    // Record a freshly-opened round and start its ROUND_SECONDS auto-close timer.
    openRoundClock(roundId, windowSeconds): RoundState {
      const openedAt = Date.now()
      const deadline = openedAt + windowSeconds * 1000
      // Auto-advance to Closed when the window expires (the timer drives close()).
      const timer = setTimeout(() => {
        void close(roundId)
      }, windowSeconds * 1000)
      const state: RoundState = { roundId, status: 'Open', openedAt, deadline, timer }
      rounds.set(roundId, state)
      return state
    },

    // Force-close early: cancel the timer + close on-ledger. Idempotent.
    async forceClose(roundId): Promise<void> {
      await close(roundId)
    },

    getState(roundId): RoundState | undefined {
      return rounds.get(roundId)
    },

    // Update the cached status after a clear/settle (the ledger status leads; this
    // keeps the cache in step). Never starts/stops a timer.
    setStatus(roundId, status): void {
      const state = rounds.get(roundId)
      if (state) state.status = status
    },

    // Seed the map from live rounds on boot so the solver recognizes the
    // sandbox-seeded round (the ledger status is authoritative). Only an Open round
    // gets a (best-effort) deadline from its remaining window; no timer is started
    // here — rehydrate is a recognition step, not a re-arm of the auto-close.
    rehydrate(live): void {
      for (const r of live) {
        const openedAt = r.openedAt ?? Date.now()
        const deadline =
          r.windowSeconds !== undefined ? openedAt + r.windowSeconds * 1000 : openedAt
        rounds.set(r.roundId, { roundId: r.roundId, status: r.status, openedAt, deadline })
      }
    },
  }
}
