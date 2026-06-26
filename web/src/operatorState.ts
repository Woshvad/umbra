// web/src/operatorState.ts — the shape of the round/solver state App lifts and
// shares across the three operator views (Theatre → Agent → Settlement), so they
// all drive ONE round (RESEARCH Pattern 8). No I/O, no React — just the types +
// setter signatures the views consume.
import type { SolvePreviewResponse } from './solver'

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
