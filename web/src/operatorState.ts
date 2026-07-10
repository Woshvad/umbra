// web/src/operatorState.ts — the shape of the round/solver state App lifts and
// shares across the three operator views (Theatre → Agent → Settlement), so they
// all drive ONE round (RESEARCH Pattern 8). No I/O, no React — just the types +
// setter signatures the views consume.
import type { SolvePreviewResponse } from './solver'

// IDEN-03 four-eyes Compliance decision (12-01 on-ledger ClearingApproval gate).
// 'idle' = awaiting sign-off (settle CTA blocked); 'approved' = compliance signed off
// (settle CTA unblocked); 'rejected' = withheld (settlement stays blocked). Lifted into
// OperatorViewState so the Theatre control (03) gates the Settlement settle CTA (05).
export type ClearingApprovalDecision = 'idle' | 'approved' | 'rejected'

// The Theatre-local phase machine (distinct from the desk-visible Daml RoundStatus
// that drives the shell StatusIndicator). Open → window running → solving → cleared
// → settling → settled.
export type TheatrePhase =
  | 'open'
  | 'running'
  | 'solving'
  | 'cleared'
  | 'settling'
  | 'settled'

// The lifted round/solver state + setters, threaded into each operator view.
export type OperatorViewState = {
  roundId: string
  phase: TheatrePhase
  setPhase: (p: TheatrePhase) => void
  preview: SolvePreviewResponse | null
  setPreview: (p: SolvePreviewResponse | null) => void
  offline: boolean
  setOffline: (v: boolean) => void
}
