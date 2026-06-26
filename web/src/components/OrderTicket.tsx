// OrderTicket (UI-SPEC "02 — DESK VIEW", Left — Order Ticket, lines 154-163) — the
// per-party submit affordance. Rendered INSIDE the active desk's own ctx.DamlLedger
// provider, so its `useLedger().exercise(Venue.SubmitOrder, …)` carries that desk's
// OWN token (the authority `controller desk` needs). One order per round: the ticket
// locks once an Order exists in the desk's own stream OR after a successful submit.
//
// Privacy is structural — no privileged venue token / context here; the submit/read
// plane is exclusively the active desk's own connection (threat T-06-01).
//
// Int/Numeric args are passed to Venue.SubmitOrder as STRINGS (RESEARCH Pitfall 1):
// quantity = String(qty) (e.g. '10'); limit = Number(limit).toFixed(1) (e.g. '101.0').
import { useState } from 'react'
import type { Ctx, DeskKey } from '../ledgerContexts'
import { tokens } from '../desks'
import { Order } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Venue } from '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'

type OrderPayload = Order

type Props = {
  ctx: Ctx
  deskKey: DeskKey
  // The desk's existing Order payload (or undefined) — drives the one-per-round lock.
  order?: OrderPayload
}

// §4 / comp seed (UI-SPEC line 37, Copywriting "load demo order"): the canonical
// per-desk demo values — BLUEROCK Buy 10@101 · MERIDIAN Sell 8@99 · HALWARD Sell 5@100.
const DEMO: Record<DeskKey, { side: Side; qty: number; limit: number }> = {
  bankA: { side: Side.Buy, qty: 10, limit: 101 },
  bankB: { side: Side.Sell, qty: 8, limit: 99 },
  bankC: { side: Side.Sell, qty: 5, limit: 100 },
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function OrderTicket({ ctx, deskKey, order }: Props) {
  const ledger = ctx.useLedger()

  const [side, setSide] = useState<Side>(Side.Buy)
  const [qty, setQty] = useState<string>('')
  const [limit, setLimit] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reopened, setReopened] = useState(false)
  const [wiping, setWiping] = useState(false)

  // One order per round: locked when an Order already exists in the desk's own stream
  // OR after a successful in-session submit. RE-OPEN clears the in-session locks (demo
  // affordance) but cannot un-seal an order already on the ledger.
  const ticketLocked = (!!order || submitted) && !reopened

  const sideColor = side === Side.Buy ? '#2B3AF2' : '#FF3D9A'
  const limitQualifier = side === Side.Buy ? '(max)' : '(min)'

  function loadDemo() {
    const d = DEMO[deskKey]
    setSide(d.side)
    setQty(String(d.qty))
    setLimit(d.limit.toFixed(2))
  }

  async function onSeal() {
    if (ticketLocked || submitting) return
    const qtyInt = parseInt(qty, 10)
    const limitNum = Number(limit)
    if (!Number.isFinite(qtyInt) || qtyInt <= 0 || !Number.isFinite(limitNum) || limitNum <= 0) {
      return
    }
    setSubmitting(true)
    try {
      const venues = await ledger.query(Venue)
      const venueCid = venues[0]?.contractId
      if (!venueCid) return
      // Int/Numeric as STRINGS (RESEARCH Pitfall 1).
      await ledger.exercise(Venue.SubmitOrder, venueCid, {
        desk: tokens[deskKey].party,
        roundId: 'R1',
        side,
        quantity: String(qtyInt),
        limit: limitNum.toFixed(1),
      })
      setReopened(false)
      setSubmitted(true)
      if (!prefersReducedMotion()) {
        setWiping(true)
        window.setTimeout(() => setWiping(false), 320)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function onReopen() {
    // Demo affordance: re-enable the inputs. Only meaningful for an in-session submit;
    // a server-side Order keeps the lock (ticketLocked recomputes from `order`).
    setReopened(true)
    setSubmitted(false)
    setWiping(false)
  }

  const sideBtn = (s: Side, label: string, activeColor: string) => {
    const active = side === s
    return (
      <button
        type="button"
        disabled={ticketLocked}
        onClick={() => setSide(s)}
        className="font-mono text-13 font-bold disabled:cursor-not-allowed"
        style={{
          flex: 1,
          padding: '10px 0',
          letterSpacing: '.08em',
          background: active ? activeColor : 'transparent',
          color: active ? '#fff' : 'rgba(10,10,10,.45)',
          borderRight: s === Side.Buy ? '1px solid #0A0A0A' : 'none',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Section label */}
      <div
        className="font-body text-10 uppercase opacity-55"
        style={{ letterSpacing: '.16em' }}
      >
        Order Ticket
      </div>

      {/* Side toggle */}
      <div
        className="flex"
        style={{ border: '1px solid #0A0A0A', margin: '14px 0 26px' }}
      >
        {sideBtn(Side.Buy, 'BUY', '#2B3AF2')}
        {sideBtn(Side.Sell, 'SELL', '#FF3D9A')}
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: '26px' }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
          <span
            className="font-body text-10 uppercase opacity-50"
            style={{ letterSpacing: '.14em' }}
          >
            Quantity
          </span>
          <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
            BONDX
          </span>
        </div>
        <input
          type="text"
          inputMode="numeric"
          disabled={ticketLocked}
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="0"
          className="font-mono text-44 tabular-nums w-full bg-transparent outline-none disabled:opacity-50"
          style={{ fontWeight: 600, borderBottom: '2px solid #0A0A0A', padding: '2px 0 8px' }}
        />
      </div>

      {/* Limit */}
      <div style={{ marginBottom: '30px' }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
          <span
            className="font-body text-10 uppercase opacity-50"
            style={{ letterSpacing: '.14em' }}
          >
            Limit Price {limitQualifier}
          </span>
          <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
            USDCx / unit
          </span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          disabled={ticketLocked}
          value={limit}
          onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="0.00"
          className="font-mono text-44 tabular-nums w-full bg-transparent outline-none disabled:opacity-50"
          style={{ fontWeight: 600, borderBottom: '2px solid #0A0A0A', padding: '2px 0 8px', color: sideColor }}
        />
      </div>

      {/* Submit / status (one-per-round) */}
      {ticketLocked ? (
        <div
          className="flex items-center"
          style={{ border: '1px solid #0A0A0A', padding: '14px 16px', gap: '12px' }}
        >
          <span className="bg-redact" style={{ display: 'inline-block', width: '34px', height: '16px' }} />
          <span className="font-mono text-13 font-bold" style={{ letterSpacing: '.16em' }}>
            SEALED
          </span>
          <button
            type="button"
            onClick={onReopen}
            className="font-mono text-9 uppercase opacity-60 hover:opacity-100"
            style={{ marginLeft: 'auto', letterSpacing: '.16em' }}
          >
            RE-OPEN
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSeal}
          disabled={submitting}
          className="font-mono text-14 font-bold bg-ink text-paper w-full disabled:opacity-60"
          style={{ padding: '18px', letterSpacing: '.18em' }}
        >
          {submitting ? 'SEALING…' : 'SEAL ORDER'}
        </button>
      )}

      {/* load demo order — ghost mono affordance (pre-fills §4 values) */}
      {!ticketLocked && (
        <button
          type="button"
          onClick={loadDemo}
          className="font-mono text-9 uppercase opacity-50 hover:opacity-100"
          style={{ marginTop: '14px', letterSpacing: '.16em' }}
        >
          load demo order
        </button>
      )}

      {/* Seal-wipe overlay (umbraWipe .3s) — gated on prefers-reduced-motion */}
      {wiping && (
        <div
          aria-hidden
          className="bg-redact-wipe animate-umbra-wipe"
          style={{ position: 'absolute', inset: '60px 36px 0 0', pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}
