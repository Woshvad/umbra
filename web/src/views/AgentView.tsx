// Solver Agent (view 04) — STUB. Operator plane (:4000). Plan 04 OVERWRITES this
// stub with the AgentProposal + AgentRationale typewriter composition + the
// VERIFIED · CLAUDE/DETERMINISTIC badge (UI-SPEC "04 — SOLVER AGENT"). This stub
// exists only so App routing compiles and the build stays green.
import type { OperatorViewState } from '../operatorState'

type Props = OperatorViewState

export default function AgentView({ offline }: Props) {
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
        style={{ letterSpacing: '-.02em', margin: '26px 0 36px' }}
      >
        THE AGENT CLEARS THE BOOK
      </h1>

      <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, maxWidth: '560px' }}>
        {offline
          ? 'SOLVER OFFLINE — START THE SERVICE ON :4000'
          : 'No proposal yet. Run the batch in 03 Theatre — once the window closes, SOLVER-AGENT-00 computes the uniform clearing price and narrates its reasoning here.'}
      </p>
    </main>
  )
}
