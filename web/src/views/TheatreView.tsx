// Auction Theatre (view 03) — STUB. Operator plane (:4000) via web/src/solver.ts,
// dark inverted surface. Plan 03 OVERWRITES this stub with the CountdownRing +
// CrossingChart + PriceReveal money-shot composition (UI-SPEC "03 — AUCTION THEATRE").
// This stub exists only so App routing compiles and the build stays green.
import type { OperatorViewState } from '../operatorState'

type Props = OperatorViewState

export default function TheatreView({ offline }: Props) {
  return (
    <main style={{ position: 'relative', padding: '30px 48px 48px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">03</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Auction Theatre
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-56 font-bold"
        style={{ letterSpacing: '-.02em', margin: '26px 0 36px' }}
      >
        ONE PRICE.
        <br />
        NO LEAKS.
      </h1>

      <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, maxWidth: '560px' }}>
        {offline
          ? 'SOLVER OFFLINE — START THE SERVICE ON :4000'
          : 'Open the 60s window, then Close & Solve — SOLVER-AGENT-00 computes the single uniform clearing price and reveals it here.'}
      </p>
    </main>
  )
}
