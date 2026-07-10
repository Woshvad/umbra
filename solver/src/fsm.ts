// solver/src/fsm.ts — OPS-03 pure round-lifecycle finite state machine (API-layer guard).
//
// A single pure `transition(from, to)` gates the round lifecycle so a bad/hostile client
// cannot drive an illegal sequence (settle-before-clear, double-settle, reopen). The only
// legal path is the linear:
//
//     Open → Closed → Cleared → Settled   (Settled is terminal)
//
// AUTHORITY (threat T-13-07): the ledger `Round.status` remains the SOURCE OF TRUTH — the
// on-ledger `Round.Clear` / settle guards are the deep backstop. This FSM is a cheap
// API-layer pre-check that rejects an illegal edge with 409 ILLEGAL_TRANSITION before any
// ledger work is attempted. It never mutates ledger state.
//
// ENUM INVARIANT (Pitfall 5 / hard invariant): the wire/Daml `RoundStatus` union
// (`Open | Closed | Cleared | Settled`) is REUSED from clock.ts and is NEVER renamed —
// renaming ripples through ledger.ts + the committed `web/daml.js` bindings and breaks
// decode. `Sealed` is a DISPLAY ALIAS for `Closed` ONLY (see `sealedAlias`); it is not a
// wire state and never enters the enum.

import type { RoundStatus } from './clock.js'

// A minimal, structurally-identical copy of api.ts's (module-private, non-exported)
// ApiError so this pure module stays free of any import from api.ts — importing api.ts
// here would create an api.ts → fsm.ts → api.ts cycle once the guard is wired in 13-07.
// Shape matches api.ts exactly ({ status, code, message, name:'ApiError' }) so the
// secret-safe error middleware serializes it identically to a native ApiError.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// The legal successor set for each state — the linear lifecycle, terminal at Settled.
export const LEGAL: Record<RoundStatus, RoundStatus[]> = {
  Open: ['Closed'],
  Closed: ['Cleared'],
  Cleared: ['Settled'],
  Settled: [],
}

// Pure lifecycle guard: return `to` if the edge is legal, else throw 409 ILLEGAL_TRANSITION.
// The message is authored here and is guaranteed secret-free (only the two status names).
export const transition = (from: RoundStatus, to: RoundStatus): RoundStatus => {
  if (LEGAL[from].includes(to)) return to
  throw new ApiError(409, 'ILLEGAL_TRANSITION', `cannot go ${from}→${to}`)
}

// DISPLAY-ONLY alias: the UI/status surface renders a Closed round as "Sealed" (the auction
// window has sealed shut). This maps for presentation ONLY — it does NOT change the wire
// enum and must NEVER be written back to the ledger status.
export const sealedAlias = (status: RoundStatus): RoundStatus | 'Sealed' =>
  status === 'Closed' ? 'Sealed' : status
