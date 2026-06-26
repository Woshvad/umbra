// BalanceTable (UI-SPEC "05 — SETTLEMENT", lines 229-230) — the before → after balance
// grid (width 360px). Each desk's BONDX/USDCx numerals LERP from `before` to `after` in
// lockstep with the single `settleProgress` (lib/balance.lerp) — at t=0 all show before,
// at t=1 all show the §4 finals BLUEROCK 10/4000 · MERIDIAN 12/1800 · HALWARD 13/1200.
// The aggregate after-balances are derived by SettlementView from preview.allocations via
// deskBalancesFromAllocations (the Allocation shape confirmed against solver/src/auction.ts).
//
// DISPLAY only — no operator token, no @daml/react context (threat T-06-01).
import { lerp } from '../lib/balance'

// One row's before/after holdings + the desk code.
export type BalanceRow = {
  code: string
  before: { bondx: number; usdcx: number }
  after: { bondx: number; usdcx: number }
}

type Props = { rows: BalanceRow[]; settleProgress: number }

// Whole-unit display (holdings are integer units; round to kill float drift mid-lerp).
const fmt = (n: number): string => String(Math.round(n))

export default function BalanceTable({ rows, settleProgress }: Props) {
  return (
    <div style={{ width: '360px' }}>
      <div
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em' }}
      >
        Balances · before → after
      </div>

      <div className="border-t" style={{ marginTop: '12px' }}>
        {/* Header row */}
        <div
          className="font-body text-9 uppercase opacity-50"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: '20px',
            letterSpacing: '.12em',
            padding: '10px 0',
          }}
        >
          <span>Desk</span>
          <span style={{ textAlign: 'right', minWidth: '90px' }}>BONDX</span>
          <span style={{ textAlign: 'right', minWidth: '90px' }}>USDCx</span>
        </div>

        {/* Per-desk rows — numerals lerp before→after via settleProgress. */}
        {rows.map((r) => (
          <div
            key={r.code}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: '20px',
              alignItems: 'baseline',
              padding: '14px 0',
              borderTop: '1px solid rgba(10,10,10,.16)',
            }}
          >
            <div className="flex flex-col">
              <span className="font-mono text-12 font-semibold" style={{ letterSpacing: '.06em' }}>
                {r.code}
              </span>
              <span
                className="font-body text-9 uppercase opacity-50"
                style={{ letterSpacing: '.12em' }}
              >
                Now
              </span>
            </div>
            <span
              className="font-mono text-18 tabular-nums"
              style={{ textAlign: 'right', minWidth: '90px' }}
            >
              {fmt(lerp(r.before.bondx, r.after.bondx, settleProgress))}
            </span>
            <span
              className="font-mono text-18 tabular-nums"
              style={{ textAlign: 'right', minWidth: '90px' }}
            >
              {fmt(lerp(r.before.usdcx, r.after.usdcx, settleProgress))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
