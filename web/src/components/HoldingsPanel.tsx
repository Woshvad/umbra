// HoldingsPanel (UI-SPEC "02 — DESK VIEW", Right — Holdings, lines 165-166) — the desk's
// OWN live BONDX/USDCx, summed from its own Assets. Rendered INSIDE the active desk's
// ctx.DamlLedger provider, so `useStreamQueries(Asset)` streams only this desk's
// holdings (PRIV-04 — Asset is owner-scoped; no privileged venue token / context here).
// Daml numbers arrive as STRINGS → Number(...) before summing (RESEARCH Pitfall 2).
import type { Ctx } from '../ledgerContexts'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'

const BOND_SYMBOL = 'BONDX'
const CASH_SYMBOL = 'USDCx'

type Props = {
  ctx: Ctx
  // Optional post-settlement deltas (from FillCard's own TradeConfirmation) — drive the
  // "→ {after} after settle" sub-line. bondAfter colors with the fill sign.
  bondAfter?: number
  cashAfter?: number
  fillColor?: string
}

function HoldingCell({
  symbol,
  amount,
  after,
  afterColor,
  borderRight,
}: {
  symbol: string
  amount: number
  after?: number
  afterColor?: string
  borderRight?: boolean
}) {
  return (
    <div
      style={{
        padding: '18px 22px 18px 0',
        borderRight: borderRight ? '1px solid #0A0A0A' : 'none',
        paddingLeft: borderRight ? 0 : '22px',
      }}
    >
      <div className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em', marginBottom: '10px' }}>
        {symbol}
      </div>
      <div className="font-mono text-40 tabular-nums" style={{ fontWeight: 600 }}>
        {amount}
      </div>
      {after !== undefined && (
        <div className="font-mono text-12 tabular-nums" style={{ marginTop: '6px', color: afterColor }}>
          → {after} after settle
        </div>
      )}
    </div>
  )
}

export default function HoldingsPanel({ ctx, bondAfter, cashAfter, fillColor }: Props) {
  const assets = ctx.useStreamQueries(Asset)

  // The desk's own holdings — sum by symbol (DeskColumn lines 51-56 pattern).
  const bond = assets.contracts
    .filter((c) => c.payload.symbol === BOND_SYMBOL)
    .reduce((acc, c) => acc + Number(c.payload.quantity), 0)
  const cash = assets.contracts
    .filter((c) => c.payload.symbol === CASH_SYMBOL)
    .reduce((acc, c) => acc + Number(c.payload.quantity), 0)

  return (
    <div>
      <div className="font-body text-10 uppercase opacity-55" style={{ letterSpacing: '.16em', marginBottom: '14px' }}>
        Holdings
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderTop: '1px solid #0A0A0A',
          borderBottom: '1px solid #0A0A0A',
        }}
      >
        <HoldingCell
          symbol={BOND_SYMBOL}
          amount={bond}
          after={bondAfter}
          afterColor={fillColor}
          borderRight
        />
        <HoldingCell symbol={CASH_SYMBOL} amount={cash} after={cashAfter} afterColor="rgba(10,10,10,.6)" />
      </div>
    </div>
  )
}
