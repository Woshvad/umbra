// FillCard (UI-SPEC "02 — DESK VIEW", YOUR FILL, lines 167-168) — the desk's OWN
// post-settlement fill. Rendered INSIDE the active desk's ctx.DamlLedger provider, so
// `useStreamQueries(TradeConfirmation)` returns only this desk's confirmation (privacy:
// no privileged venue token / context here). Daml numbers arrive as STRINGS →
// Number(...) (RESEARCH Pitfall 2). Empty state renders the verbatim comp paragraph.
import type { ReactNode } from 'react'
import type { Ctx, DeskKey } from '../ledgerContexts'
import { Order, TradeConfirmation } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'

type Props = {
  ctx: Ctx
  deskKey: DeskKey
  // WOW-07 — the guest /join surface renders the guest empty copy (UI-SPEC:147) rather
  // than the desk variant, and switches to the "window closed" line (UI-SPEC:148) when the
  // submission window has closed. Presentation only; the desk plane keeps its own copy.
  guest?: boolean
  // Guest-only: true once the observed Round has left `Open` (Closed / Cleared / Settled).
  windowClosed?: boolean
}

// Empty-state copy — verbatim from the Copywriting Contract. Desk keeps its shipped line;
// the guest /join surface renders UI-SPEC:147, or UI-SPEC:148 once the window has closed.
const EMPTY_DESK =
  'Seal your order, then run the auction in 03 Theatre. Your fill — quantity, price and cash — appears here only after the batch clears, and only you can see it.'
const EMPTY_GUEST =
  'Seal your bid, then watch 03 Theatre run. Your fill — quantity, price and cash — appears here only after the batch clears, and only you can see it.'
const EMPTY_GUEST_CLOSED =
  "This round's window is closed. Nothing to submit — but you can still watch it clear and settle."

export default function FillCard({ ctx, guest = false, windowClosed = false }: Props) {
  // deskKey is part of the contract (DeskView passes the active desk) though the read
  // plane is fully scoped by the surrounding provider — kept for signature parity.
  const confirms = ctx.useStreamQueries(TradeConfirmation)
  const orders = ctx.useStreamQueries(Order)

  const tc = confirms.contracts[0]?.payload // own confirmation only (privacy)
  const hasFill = !!tc

  if (!hasFill) {
    const emptyCopy = guest ? (windowClosed ? EMPTY_GUEST_CLOSED : EMPTY_GUEST) : EMPTY_DESK
    return (
      <div style={{ marginTop: '30px' }}>
        <p className="font-body text-13 opacity-65" style={{ lineHeight: 1.6, maxWidth: '420px' }}>
          {emptyCopy}
        </p>
      </div>
    )
  }

  const filledQty = Number(tc.filledQty)
  const clearingPrice = Number(tc.clearingPrice)
  const cashMoved = Number(tc.cashMoved)

  // Original order size (own Order) → the "{n} of {total} BONDX" partial note.
  const orderedQty = orders.contracts[0]?.payload
    ? Number(orders.contracts[0].payload.quantity)
    : undefined
  const isPartial = orderedQty !== undefined && Math.abs(filledQty) < orderedQty

  // Buy fills are positive (#2B3AF2); sell fills are negative (#FF3D9A).
  const fillColor = filledQty > 0 ? '#2B3AF2' : '#FF3D9A'
  const fillSign = filledQty > 0 ? '+' : '−'
  const cashSign = cashMoved > 0 ? '+' : '−'

  const stat = (label: string, value: ReactNode, note?: ReactNode, last?: boolean) => (
    <div style={{ padding: '18px 18px 20px', borderRight: last ? 'none' : '1px solid #0A0A0A' }}>
      <div className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em', marginBottom: '10px' }}>
        {label}
      </div>
      <div className="font-mono text-30 tabular-nums" style={{ fontWeight: 600 }}>
        {value}
      </div>
      {note && (
        <div className="font-mono text-12 tabular-nums opacity-50" style={{ marginTop: '6px' }}>
          {note}
        </div>
      )}
    </div>
  )

  return (
    <div className="animate-umbra-rise" style={{ marginTop: '30px', border: '1px solid #0A0A0A' }}>
      {/* Ink header bar */}
      <div
        className="bg-ink text-paper flex items-baseline justify-between"
        style={{ padding: '12px 18px' }}
      >
        <span className="font-mono text-13 font-bold" style={{ letterSpacing: '.16em' }}>
          YOUR FILL
        </span>
        <span className="font-body text-10 uppercase opacity-65" style={{ letterSpacing: '.14em' }}>
          Visible only to you
        </span>
      </div>

      {/* 3-col stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {stat(
          'Filled',
          <span style={{ color: fillColor }}>
            {fillSign}
            {Math.abs(filledQty)}
          </span>,
          isPartial ? `${Math.abs(filledQty)} of ${orderedQty} BONDX` : undefined,
        )}
        {stat('Clearing Price', clearingPrice.toFixed(2))}
        {stat(
          'Cash Moved',
          <span>
            {cashSign}
            {Math.abs(cashMoved)}
          </span>,
          undefined,
          true,
        )}
      </div>
    </div>
  )
}
