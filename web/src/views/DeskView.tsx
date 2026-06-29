// Desk View (view 02) — the desk-side half of the money shot (UI-SPEC "02 — DESK
// VIEW", lines 148-168). Per-party plane (:7575) via the ACTIVE desk's own ctx: the
// whole body mounts inside `ctxFor[activeDesk].DamlLedger` carrying that desk's own
// token (DeskColumn lines 212-227), so every hook streams ONLY this desk's contracts.
// A rival desk's Order / Asset / TradeConfirmation genuinely never reach this view —
// privacy is structural, not a render-time filter (threat T-06-01 / T-06-04). This view
// holds only the desk's own credential — no privileged venue token / context anywhere.
import { ctxFor, type Ctx, type DeskKey } from '../ledgerContexts'
import { tokens, httpBaseUrlFor, wsBaseUrl, DESKS } from '../desks'
import { Order, TradeConfirmation } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import OrderTicket from '../components/OrderTicket'
import HoldingsPanel from '../components/HoldingsPanel'
import FillCard from '../components/FillCard'

const BOND_SYMBOL = 'BONDX'
const CASH_SYMBOL = 'USDCx'

type Props = {
  activeDesk: DeskKey
}

// Inner body — rendered INSIDE the active desk's own ctx.DamlLedger provider, so every
// hook here reads only this desk's own contracts.
function DeskBody({ ctx, deskKey }: { ctx: Ctx; deskKey: DeskKey }) {
  const orders = ctx.useStreamQueries(Order)
  const order = orders.contracts[0]?.payload

  // Shared own-fill read: when this desk has a TradeConfirmation the batch has settled
  // and the desk's own Assets ALREADY reflect the new balances — so the post-settle
  // holdings are the live sums themselves. HoldingsPanel renders these as the
  // "→ {after} after settle" sub-line (BONDX in the fill-sign color). Daml numbers are
  // STRINGS → Number(...).
  const confirms = ctx.useStreamQueries(TradeConfirmation)
  const assets = ctx.useStreamQueries(Asset)
  const tc = confirms.contracts[0]?.payload

  let bondAfter: number | undefined
  let cashAfter: number | undefined
  let fillColor: string | undefined
  if (tc) {
    bondAfter = assets.contracts
      .filter((c) => c.payload.symbol === BOND_SYMBOL)
      .reduce((a, c) => a + Number(c.payload.quantity), 0)
    cashAfter = assets.contracts
      .filter((c) => c.payload.symbol === CASH_SYMBOL)
      .reduce((a, c) => a + Number(c.payload.quantity), 0)
    fillColor = Number(tc.filledQty) > 0 ? '#2B3AF2' : '#FF3D9A'
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,420px) 1fr',
        gap: 0,
        borderTop: '1px solid #0A0A0A',
      }}
    >
      {/* Left — Order Ticket */}
      <div style={{ padding: '28px 36px 30px 0', borderRight: '1px solid #0A0A0A' }}>
        <OrderTicket ctx={ctx} deskKey={deskKey} order={order} />
      </div>

      {/* Right — Holdings + Fill */}
      <div style={{ padding: '28px 0 0 40px' }}>
        <HoldingsPanel
          ctx={ctx}
          bondAfter={bondAfter}
          cashAfter={cashAfter}
          fillColor={fillColor}
        />
        <FillCard ctx={ctx} deskKey={deskKey} />
      </div>
    </div>
  )
}

export default function DeskView({ activeDesk }: Props) {
  const firm = DESKS.find((d) => d.key === activeDesk)?.code ?? activeDesk
  const ctx = ctxFor[activeDesk]
  const { party, token } = tokens[activeDesk]

  return (
    <main style={{ position: 'relative', padding: '30px 48px 64px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">02</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          {`Desk · ${firm}`}
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-54 font-bold"
        style={{ lineHeight: 0.96, letterSpacing: '-.02em', margin: '26px 0 36px' }}
      >
        ORDERS IN THE DARK
      </h1>

      {/* Per-party provider — the body reads/exercises on THIS desk's own connection */}
      <ctx.DamlLedger token={token} party={party} httpBaseUrl={httpBaseUrlFor(activeDesk)} wsBaseUrl={wsBaseUrl}>
        <DeskBody ctx={ctx} deskKey={activeDesk} />
      </ctx.DamlLedger>
    </main>
  )
}
