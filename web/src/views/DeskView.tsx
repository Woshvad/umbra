// Desk View (view 02) — STUB. Per-party plane (:7575) via the active desk's ctx.
// Plan 02 OVERWRITES this stub with the full OrderTicket / HoldingsPanel / FillCard
// composition (UI-SPEC "02 — DESK VIEW"). This stub exists only so App routing
// compiles and `npm run build` stays green.
import type { DeskKey } from '../ledgerContexts'
import { DESKS } from '../desks'

type Props = {
  activeDesk: DeskKey
}

export default function DeskView({ activeDesk }: Props) {
  const firm = DESKS.find((d) => d.key === activeDesk)?.code ?? activeDesk
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
        style={{ letterSpacing: '-.02em', margin: '26px 0 36px' }}
      >
        ORDERS IN THE DARK
      </h1>

      <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, maxWidth: '560px' }}>
        Seal your order, then run the auction in 03 Theatre. Your fill — quantity, price and cash —
        appears here only after the batch clears, and only you can see it.
      </p>
    </main>
  )
}
