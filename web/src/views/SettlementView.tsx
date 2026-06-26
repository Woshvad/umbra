// Settlement (view 05) — STUB. Operator plane (:4000) for the aggregate; per-desk
// view sees only its own fill. Plan 04/05 OVERWRITES this stub with the DvpLegs +
// AtomicStamp + BalanceTable simultaneous-settle composition (UI-SPEC "05 —
// SETTLEMENT"). This stub exists only so App routing compiles and the build stays green.
import type { OperatorViewState } from '../operatorState'

type Props = OperatorViewState

export default function SettlementView({ offline }: Props) {
  return (
    <main style={{ position: 'relative', padding: '30px 48px 72px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">05</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Settlement Ledger
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-54 font-bold"
        style={{ letterSpacing: '-.02em', margin: '26px 0 36px' }}
      >
        ONE TRANSACTION. ALL OR NOTHING.
      </h1>

      <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, maxWidth: '560px' }}>
        {offline
          ? 'SOLVER OFFLINE — START THE SERVICE ON :4000'
          : 'Nothing to settle yet. Clear the batch in 03 Theatre — the matched trades then appear here as delivery-vs-payment legs that settle together in a single atomic transaction.'}
      </p>
    </main>
  )
}
