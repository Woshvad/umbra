// DvpLegs (UI-SPEC "05 — SETTLEMENT", lines 220-225 + Phase-11 "Settlement deltas") — the
// delivery-vs-payment legs of the Batch/Instruction settlement. Each leg is a paired
// asset(→, ink) + cash(←, red) arrow on a `120px 1fr 120px` grid. The draw-on is driven by
// the SINGLE `settleProgress` (0→1) lifted from SettlementView's one rAF clock — ALL legs
// share it, so they snap together SIMULTANEOUSLY (atomicity = simultaneity; never sequenced;
// RESEARCH Pattern 7 / Anti-pattern "never sequence legs"). The track widths scale
// `${settleProgress*100}%` (the comp's HTML-div approach — RESEARCH A3).
//
// §4 legs: leg1 MERIDIAN → BLUEROCK 8 BONDX / 800 USDCx, leg2 HALWARD → BLUEROCK
// 2 BONDX / 200 USDCx (derived from preview.allocations by SettlementView).
//
// Phase-11 deltas (all data-driven — DFIN-01/02/03):
//   • the sub-label is `Delivery vs Payment · Batch/Instruction · {N} instructions`
//     (`instructionCount`) + the `ALLOCATED → APPROVED → SETTLED` settlement-finality
//     micro-grammar (the Batch settle commit IS the finality) — NEVER the standalone library
//     name (unsatisfiable on this LF-2.1 / SDK-3.4.11 stack; the honest provenance tag lives
//     in SettlementView, `CN TOKEN STANDARD (CIP-0056)` / `DAML-FINANCE-PATTERN (IN-REPO)`).
//   • the cash arrow reads the token-agnostic instrument `symbol` from data (`← {cash}
//     {symbol}`, defaults `USDCx`) — never a hardcoded literal (DFIN-03).
//   • `netted` labels the current netting mode (net-per-counterparty-pair vs gross legs) — a
//     DISPLAY projection, NOT the on-ledger per-party CCP netting (`netLegs`, one net leg per
//     party·instrument through a custodian); the legs themselves are already computed for the
//     mode by SettlementView and just rendered here off the SAME shared `settleProgress` clock
//     (both modes stay simultaneous, conserving).
//
// DISPLAY only — no operator token, no @daml/react context (threat T-06-01).

// One settlement leg: a seller delivers `qty` bond units to a buyer who pays `cash` of the
// (token-agnostic) cash instrument.
export type DvpLeg = { seller: string; buyer: string; qty: number; cash: number }

type Props = {
  legs: DvpLeg[]
  settleProgress: number
  // The Batch/Instruction count for the sub-label `… · {N} instructions` (DFIN-01).
  // Defaults to one bond + one cash instruction per leg when not supplied by the caller.
  instructionCount?: number
  // The token-agnostic cash instrument symbol for the cash arrow (DFIN-03; defaults USDCx).
  cashSymbol?: string
  // The active netting mode (default NETTED) — labels the finality line, never re-sequences.
  netted?: boolean
}

export default function DvpLegs({
  legs,
  settleProgress,
  instructionCount,
  cashSymbol = 'USDCx',
  netted = true,
}: Props) {
  const pct = `${settleProgress * 100}%`
  // Each DvP leg is a bond delivery + a cash payment (two Instructions) unless the caller
  // passes an authoritative count from the settlement meta.
  const nInstructions = instructionCount ?? legs.length * 2
  return (
    <div>
      <div
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em' }}
      >
        Delivery vs Payment · Batch/Instruction · {nInstructions} instructions
      </div>

      {/* Settlement-finality micro-grammar (mono-9, opacity .6) — the Batch settle commit is
          the finality signal. The mode tag reflects the netting toggle in SettlementView. */}
      <div
        className="font-mono text-9 uppercase"
        style={{ letterSpacing: '.14em', opacity: 0.6, marginTop: '6px' }}
      >
        ALLOCATED → APPROVED → SETTLED · {netted ? 'NETTED' : 'GROSS LEGS'}
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
                label={`← ${leg.cash} ${cashSymbol}`}
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
