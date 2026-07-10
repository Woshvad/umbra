// ComplianceApproval (IDEN-03 four-eyes control) — the minimal on-screen Compliance
// approve/reject gate that makes the four-eyes SEPARATION visible on the operator plane.
// Mounted on 03 Auction Theatre AFTER the Close&Solve reveal (the recomputed clearing
// price is known), BEFORE settle. APPROVE unblocks the settle CTA (05 Settlement); REJECT
// withholds it — Round.Clear itself requires a compliance-signed ClearingApproval on-ledger
// (12-01) and would abort without one (IDEN-03), so settlement stays blocked either way.
//
// Honest labeling (CLAUDE.md rule 2 — no invented visual language; binds ONLY to the comp
// tokens paper #F4F1EA / ink #0A0A0A / lime #D6FB3C / red #E2231A + IBM Plex Mono via
// font-mono): this ships a DEV COMPLIANCE PARTY stand-in; a LIVE human Compliance operator
// (a distinct, MFA'd identity) approving against a booted stack is UAT (mirrors 12-01/12-02).
//
// Pure presentation: no solver/@daml-react context here — the parent (TheatreView) owns the
// approveClearing/rejectClearing calls (offline-guarded) and the shared approval state. This
// component only renders the price + the APPROVE/REJECT pair + the four-eyes / dev-honesty
// labels, and is designed for the dark inverted stage (#0A0A0A bg / #F4F1EA text).
import type { ClearingApprovalDecision } from '../operatorState'

type Props = {
  roundId: string
  clearingPrice: number
  decision: ClearingApprovalDecision
  onApprove: () => void
  onReject: () => void
  busy?: boolean
}

// Paper-on-dark hairline (the shipped inverted panel grammar reused from TheatreView's
// IndicativePanel — reduced-opacity paper stroke, NOT a new color token).
const PANEL_BORDER = '1px solid rgba(244,241,234,0.28)'

// The shared button grammar from RunningStage (font-mono 13 bold uppercase, 16/30 pad,
// .16em tracking) — only the fill/ink pairing changes per action.
const BTN_BASE: React.CSSProperties = {
  padding: '16px 30px',
  letterSpacing: '.16em',
  border: 'none',
}

export default function ComplianceApproval({
  roundId,
  clearingPrice,
  decision,
  onApprove,
  onReject,
  busy = false,
}: Props) {
  return (
    <div style={{ border: PANEL_BORDER, padding: '22px 26px', maxWidth: '520px' }}>
      {/* Header — the FOUR-EYES tag + the HARD dev-honesty micro-label */}
      <div className="flex items-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
        <span
          className="font-mono text-9 uppercase"
          style={{
            letterSpacing: '.16em',
            padding: '3px 7px',
            border: '1px solid rgba(244,241,234,0.5)',
          }}
        >
          COMPLIANCE · FOUR-EYES
        </span>
        <span
          className="font-mono uppercase"
          style={{
            marginLeft: 'auto',
            fontSize: '9px',
            letterSpacing: '.14em',
            opacity: 0.55,
          }}
        >
          DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT
        </span>
      </div>

      {/* The recomputed clearing price awaiting sign-off (IBM Plex Mono / font-mono) */}
      <div style={{ marginTop: '18px' }}>
        <div
          className="font-mono uppercase"
          style={{ fontSize: '11px', letterSpacing: '.16em', opacity: 0.6 }}
        >
          Recomputed Clearing Price — Round {roundId}
        </div>
        <div
          className="font-mono tabular-nums"
          style={{ fontSize: '44px', fontWeight: 600, lineHeight: 1, marginTop: '6px' }}
        >
          ${clearingPrice.toFixed(2)}
        </div>
      </div>

      {/* State machine: PENDING (APPROVE/REJECT) → APPROVED (lime) | REJECTED (red) */}
      {decision === 'idle' ? (
        <>
          <p
            className="font-body"
            style={{ fontSize: '12px', opacity: 0.7, lineHeight: 1.6, margin: '16px 0 18px', maxWidth: '440px' }}
          >
            A second, independent Compliance sign-off is required before this batch can settle.
            Approve to release the atomic DvP; reject to withhold it.
          </p>
          <div style={{ display: 'flex', gap: '14px' }}>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="font-mono text-13 font-bold uppercase disabled:opacity-40"
              style={{ ...BTN_BASE, background: '#D6FB3C', color: '#0A0A0A', cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'SIGNING…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              className="font-mono text-13 font-bold uppercase disabled:opacity-40"
              style={{ ...BTN_BASE, background: '#E2231A', color: '#F4F1EA', cursor: busy ? 'default' : 'pointer' }}
            >
              Reject
            </button>
          </div>
        </>
      ) : decision === 'approved' ? (
        <div style={{ marginTop: '18px' }}>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#D6FB3C' }} />
            <span
              className="font-mono text-13 font-semibold uppercase"
              style={{ letterSpacing: '.1em', color: '#D6FB3C' }}
            >
              APPROVED — CLEARED FOR SETTLEMENT
            </span>
          </div>
          <p
            className="font-mono uppercase"
            style={{ fontSize: '9px', letterSpacing: '.14em', opacity: 0.55, marginTop: '8px' }}
          >
            SIGNED BY DEV COMPLIANCE PARTY · SETTLE CTA UNBLOCKED IN 05 SETTLEMENT
          </p>
        </div>
      ) : (
        <div style={{ marginTop: '18px' }}>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#E2231A' }} />
            <span
              className="font-mono text-13 font-semibold uppercase"
              style={{ letterSpacing: '.1em', color: '#E2231A' }}
            >
              REJECTED — SETTLEMENT WITHHELD
            </span>
          </div>
          <p
            className="font-mono uppercase"
            style={{ fontSize: '9px', letterSpacing: '.14em', opacity: 0.55, marginTop: '8px', lineHeight: 1.6, maxWidth: '440px' }}
          >
            ROUND.CLEAR REQUIRES A COMPLIANCE-SIGNED CLEARINGAPPROVAL (IDEN-03 FOUR-EYES);
            WITHOUT IT THE ON-LEDGER GATE ABORTS SETTLEMENT.
          </p>
        </div>
      )}
    </div>
  )
}
