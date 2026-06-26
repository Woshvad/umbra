// DvpLegs (UI-SPEC "05 — SETTLEMENT", lines 220-225) — the delivery-vs-payment legs.
// Each leg is a paired asset(→, ink) + cash(←, red) arrow on a `120px 1fr 120px` grid.
// The draw-on is driven by the SINGLE `settleProgress` (0→1) lifted from SettlementView's
// one rAF clock — ALL legs share it, so they snap together SIMULTANEOUSLY (never
// sequenced; RESEARCH Pattern 7 / Anti-pattern "never sequence legs"). The track widths
// scale `${settleProgress*100}%` (the comp's HTML-div approach — RESEARCH A3).
//
// §4 legs: leg1 MERIDIAN → BLUEROCK 8 BONDX / 800 USDCx, leg2 HALWARD → BLUEROCK
// 2 BONDX / 200 USDCx (derived from preview.allocations by SettlementView).
//
// DISPLAY only — no operator token, no @daml/react context (threat T-06-01).

// One settlement leg: a seller delivers `qty` BONDX to a buyer who pays `cash` USDCx.
export type DvpLeg = { seller: string; buyer: string; qty: number; cash: number }

type Props = { legs: DvpLeg[]; settleProgress: number }

export default function DvpLegs({ legs, settleProgress }: Props) {
  const pct = `${settleProgress * 100}%`
  return (
    <div>
      <div
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em' }}
      >
        Delivery vs Payment · {legs.length} legs
      </div>

      <div className="border-t" style={{ position: 'relative', marginTop: '12px' }}>
        {legs.map((leg, i) => (
          <div
            key={`${leg.seller}-${leg.buyer}-${i}`}
            style={{ padding: '24px 0', borderBottom: '1px solid rgba(10,10,10,.18)' }}
          >
            {/* Asset arrow (→, ink): seller · track + chip · buyer */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 120px',
                gap: '18px',
                alignItems: 'center',
              }}
            >
              <span
                className="font-mono text-15 font-semibold"
                style={{ textAlign: 'right' }}
              >
                {leg.seller}
              </span>
              <ArrowTrack
                color="#0A0A0A"
                direction="right"
                pct={pct}
                label={`${leg.qty} BONDX →`}
                labelColor="#0A0A0A"
              />
              <span className="font-mono text-15 font-semibold">{leg.buyer}</span>
            </div>

            {/* Cash arrow (←, red): empty · track + label · empty */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 120px',
                gap: '18px',
                alignItems: 'center',
                marginTop: '14px',
              }}
            >
              <span />
              <ArrowTrack
                color="#E2231A"
                direction="left"
                pct={pct}
                label={`← ${leg.cash} USDCx`}
                labelColor="#E2231A"
              />
              <span />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// A 2px track that scales its filled width by `pct` (the shared settleProgress) with a
// CSS-triangle arrowhead at the leading edge + a centered label chip on paper.
function ArrowTrack({
  color,
  direction,
  pct,
  label,
  labelColor,
}: {
  color: string
  direction: 'left' | 'right'
  pct: string
  label: string
  labelColor: string
}) {
  const arrowhead =
    direction === 'right'
      ? { right: '-1px', borderLeft: `9px solid ${color}` }
      : { left: '-1px', borderRight: `9px solid ${color}` }
  return (
    <div style={{ position: 'relative', height: '18px' }}>
      {/* Faint full-width rail so the track has a path before it draws on. */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: 0,
          right: 0,
          height: '2px',
          background: color,
          opacity: 0.18,
        }}
      />
      {/* The drawing-on filled track (width = settleProgress). */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: direction === 'right' ? 0 : undefined,
          right: direction === 'left' ? 0 : undefined,
          height: '2px',
          width: pct,
          background: color,
        }}
      >
        {/* Arrowhead at the leading edge (CSS triangle). */}
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            ...arrowhead,
          }}
        />
      </div>
      {/* Centered label chip on paper. */}
      <span
        className="font-mono text-13 font-semibold"
        style={{
          position: 'absolute',
          top: '-2px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#F4F1EA',
          padding: '0 8px',
          color: labelColor,
        }}
      >
        {label}
      </span>
    </div>
  )
}
