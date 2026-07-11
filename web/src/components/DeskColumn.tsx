// DeskColumn (UI-SPEC lines 275-303) — the structural-privacy unit (PRIV-05 /
// threat T-03-10). Each column mounts its OWN `ctx.DamlLedger` carrying that desk's
// own token and queries `Order`/`Asset` via that context's hooks — so a column can
// literally never fetch another desk's data. There is NO render-time filter and NO
// shared/operator token: a rival column shows the redaction stripe because its own
// query genuinely returns nothing.
//
// `isActive` (the column matching the selected switcher desk) renders the real order
// values + the desk's own HOLD line + the lime 10% tint + tag `YOU`. A rival column
// renders the honest redaction state + tag `SEALED` + the red `REDACTED` footer.
//
// CLEAR-01 (live submit path): the desk's OWN token carries the `controller desk`
// authority `Venue.SubmitOrder` needs; an in-browser submit exercises it with Int/
// Decimal as STRINGS (RESEARCH Pitfall 8) and disables the ticket after submit. The
// seeded path (Plan 01) already guarantees a screenshot-ready 3-up, so this is a
// minimal affordance only on the active column — not a full Desk ticket (Phase 6).
import { useState } from 'react'
import type { Ctx, DeskKey } from '../ledgerContexts'
import { tokens, httpBaseUrlFor, wsBaseUrl, DESKS } from '../desks'
import { Order } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import { Venue } from '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'
import { DeskEligibility } from '@daml.js/umbra-0.1.0/lib/Umbra/Compliance/module'
import OrderRow from './OrderRow'
import RedactionBar from './RedactionBar'

const BOND_SYMBOL = 'BONDX'
const CASH_SYMBOL = 'USDCx'

type Props = {
  deskKey: DeskKey
  ctx: Ctx
  isActive: boolean
  isLast: boolean
}

// Inner body — rendered INSIDE this desk's own ctx.DamlLedger provider, so every
// hook here streams only this desk's contracts.
function ActiveBody({ ctx, deskKey }: { ctx: Ctx; deskKey: DeskKey }) {
  const meta = DESKS.find((d) => d.key === deskKey)!
  const orders = ctx.useStreamQueries(Order)
  const assets = ctx.useStreamQueries(Asset)
  const ledger = ctx.useLedger()

  const order = orders.contracts[0]?.payload
  const side = order?.side as Side | undefined
  const sideColor = side === 'Buy' ? '#2B3AF2' : '#FF3D9A'
  const limitOp = side === 'Buy' ? '≤' : '≥'

  // The desk's own holdings (PRIV-04 — Asset owner-scoped). Sum by symbol.
  const bond = assets.contracts
    .filter((c) => c.payload.symbol === BOND_SYMBOL)
    .reduce((acc, c) => acc + Number(c.payload.quantity), 0)
  const cash = assets.contracts
    .filter((c) => c.payload.symbol === CASH_SYMBOL)
    .reduce((acc, c) => acc + Number(c.payload.quantity), 0)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const ticketLocked = submitted || !!order

  async function onSubmit() {
    if (ticketLocked || submitting) return
    setSubmitting(true)
    try {
      const venues = await ledger.query(Venue)
      const venueCid = venues[0]?.contractId
      // COMP-01 (11-05): SubmitOrder now takes the desk's eligibility credential
      // (keyless, D7 Option-B). The desk observes its own DeskEligibility, so query
      // it on this desk's own ctx and pass its cid. Absent (unseeded / build-gate) →
      // the best-effort submit is skipped, same as a missing Venue.
      const eligs = await ledger.query(DeskEligibility)
      const eligCid = eligs[0]?.contractId
      if (!venueCid || !eligCid) return
      // Int/Decimal as STRINGS (RESEARCH Pitfall 8). AUCT-01: plain Limit order
      // (orderType='Limit', minQty/firmIf null) — satisfies the regenerated
      // required SubmitOrder args; the order-type selector UI is plan 09-06.
      await ledger.exercise(Venue.SubmitOrder, venueCid, {
        desk: tokens[deskKey].party,
        roundId: 'R1',
        side: Side.Buy,
        quantity: '10',
        limit: '101.0',
        orderType: 'Limit',
        minQty: null,
        firmIf: null,
        eligCid,
      })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Column header */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-14 font-bold" style={{ letterSpacing: '.06em' }}>
            {meta.code}
          </div>
          <div
            className="font-body text-10 uppercase opacity-55"
            style={{ letterSpacing: '.14em', marginTop: '3px' }}
          >
            {meta.role}
          </div>
        </div>
        <span
          className="font-mono text-9 border"
          style={{ letterSpacing: '.12em', padding: '3px 7px' }}
        >
          YOU
        </span>
      </div>

      {/* Order rows — real values from this desk's own query */}
      <div className="flex flex-col" style={{ marginTop: '22px', gap: '14px' }}>
        <OrderRow
          label="Side"
          value={side ? side.toUpperCase() : '—'}
          valueColor={side ? sideColor : undefined}
          weight={700}
        />
        <OrderRow
          label="Quantity"
          value={order ? String(order.quantity) : '—'}
          unit=" BONDX"
          tabular
        />
        <OrderRow
          label="Limit"
          value={order ? `${limitOp} ${order.limit}` : '—'}
          unit=" USDCx"
          tabular
        />
      </div>

      {/* Holdings divider + HOLD line */}
      <div className="bg-ink" style={{ height: '1px', margin: '20px 0 14px', opacity: 0.18 }} />
      <div className="flex justify-between font-mono text-11 tabular-nums opacity-70">
        <span>HOLD {bond} BONDX</span>
        <span>{cash} USDCx</span>
      </div>

      {/* Footer + (live) submit affordance */}
      <div
        className="font-mono text-9 opacity-60"
        style={{ marginTop: '16px', letterSpacing: '.16em' }}
      >
        YOUR ORDER — VISIBLE ONLY TO YOU
      </div>
      {!order && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={ticketLocked || submitting}
          className="mt-4 border bg-transparent font-mono text-9 hover:bg-ink hover:text-paper disabled:opacity-40"
          style={{ padding: '6px 10px', letterSpacing: '.12em' }}
        >
          {submitting ? 'SEALING…' : submitted ? 'SEALED' : 'SEAL ORDER'}
        </button>
      )}
    </>
  )
}

function RedactedBody({ deskKey }: { deskKey: DeskKey }) {
  const meta = DESKS.find((d) => d.key === deskKey)!
  return (
    <>
      {/* Column header */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-14 font-bold" style={{ letterSpacing: '.06em' }}>
            {meta.code}
          </div>
          <div
            className="font-body text-10 uppercase opacity-55"
            style={{ letterSpacing: '.14em', marginTop: '3px' }}
          >
            {meta.role}
          </div>
        </div>
        <span
          className="font-mono text-9"
          style={{
            letterSpacing: '.12em',
            padding: '3px 7px',
            border: '1px solid rgba(10,10,10,.3)',
          }}
        >
          SEALED
        </span>
      </div>

      {/* Order rows — redaction bars (62/48/70), the HONEST empty state */}
      <div className="flex flex-col" style={{ marginTop: '22px', gap: '14px' }}>
        <OrderRow label="Side" redactedWidth={62} />
        <OrderRow label="Quantity" redactedWidth={48} />
        <OrderRow label="Limit" redactedWidth={70} />
      </div>

      {/* Holdings divider + redacted HOLD line (rival holdings are not visible) */}
      <div className="bg-ink" style={{ height: '1px', margin: '20px 0 14px', opacity: 0.18 }} />
      <div className="flex justify-between">
        <RedactionBar width={70} />
        <RedactionBar width={48} />
      </div>

      {/* Redacted footer (red + 6px square) */}
      <div
        className="flex items-center font-mono text-9"
        style={{ marginTop: '16px', letterSpacing: '.16em', color: '#E2231A', gap: '7px' }}
      >
        <span style={{ width: '6px', height: '6px', background: '#E2231A', display: 'inline-block' }} />
        REDACTED — NOT VISIBLE TO YOU
      </div>
    </>
  )
}

export default function DeskColumn({ deskKey, ctx, isActive, isLast }: Props) {
  const { party, token } = tokens[deskKey]
  return (
    <ctx.DamlLedger token={token} party={party} httpBaseUrl={httpBaseUrlFor(deskKey)} wsBaseUrl={wsBaseUrl}>
      <div
        className="animate-umbra-fade"
        style={{
          padding: '24px 24px 26px',
          position: 'relative',
          borderRight: isLast ? 'none' : '1px solid #0A0A0A',
          background: isActive ? 'rgba(214,251,60,.10)' : 'transparent',
        }}
      >
        {isActive ? <ActiveBody ctx={ctx} deskKey={deskKey} /> : <RedactedBody deskKey={deskKey} />}
      </div>
    </ctx.DamlLedger>
  )
}
