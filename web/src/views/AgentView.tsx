// Solver Agent (view 04) — UI-SPEC "04 — SOLVER AGENT" (lines 196-210). Operator
// plane (:4100) via the lifted SolvePreviewResponse; NO operator token, NO @daml/react
// context (the solver service is the sole Operator-authority proxy — threat T-06-01).
//
// When a `preview` is present: the 2-col grid — left AgentProposal (the proposal list +
// the verified/source badge), right AgentRationale (the typewriter rationale + flame
// caret + the rank-1 competing-agents row). Empty state = the verbatim "No proposal yet"
// paragraph. Offline → the graceful SOLVER OFFLINE caption (Privacy still renders).
import type { OperatorViewState } from '../operatorState'
import { OFFLINE_CAPTION } from '../solver'
import AgentProposal from '../components/AgentProposal'
import AgentRationale from '../components/AgentRationale'
import BreakTheAiPanel from '../components/BreakTheAiPanel'
import SolverLeaderboard from '../components/SolverLeaderboard'

type Props = OperatorViewState

export default function AgentView({ roundId, preview, offline }: Props) {
  return (
    <main style={{ position: 'relative', padding: '30px 48px 64px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">04</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Solver Agent
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-54 font-bold"
        style={{ letterSpacing: '-.02em', margin: '26px 0 34px' }}
      >
        THE AGENT CLEARS THE BOOK
      </h1>

      {offline ? (
        <p
          className="font-mono text-13 uppercase"
          style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, maxWidth: '560px' }}
        >
          {OFFLINE_CAPTION}
        </p>
      ) : preview ? (
        <div
          className="border-t"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,560px) 1fr',
            gap: '56px',
          }}
        >
          <AgentProposal preview={preview} />
          {/* WOW-04: pass roundId to swap the rationale source to the live SSE token
              stream; AgentRationale gracefully falls back to preview.rationale (single-shot
              typewriter) if the stream is unavailable — identical appearance. */}
          <AgentRationale rationale={preview.rationale} preview={preview} roundId={roundId} />
        </div>
      ) : (
        <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, maxWidth: '560px' }}>
          No proposal yet. Run the batch in 03 Theatre — once the window closes,
          SOLVER-AGENT-00 computes the uniform clearing price and narrates its reasoning here.
        </p>
      )}

      {/* WOW-02 — Break the AI: adversarial before/after (verbatim on-ledger reject →
          correct $100.00 clear). Self-contained demo panel BELOW the shipped grid;
          operator plane (:4100) only — no operator token / @daml/react context here. */}
      <BreakTheAiPanel roundId={roundId} offline={offline} />

      {/* ADJ-01 (S2) — competing-solvers leaderboard: a distinct NARRATIVE block below the grid.
          Ranks solver proposals vs the deterministic §8 clear (VERIFIED/UNVERIFIED), marks the
          deterministic result AUTHORITATIVE, and is explicitly NOT a settlement input. Operator
          plane only (:4100 via getCompeting) — no operator token / @daml/react context. `ready`
          gates the race on a cleared round (preview present). */}
      <SolverLeaderboard roundId={roundId} ready={!!preview} offline={offline} />
    </main>
  )
}
