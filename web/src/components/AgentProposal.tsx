// AgentProposal (UI-SPEC "04 — SOLVER AGENT", lines 202-204) — the SOLVER-AGENT-00
// proposal column. Header = flame dot + agent id + the SELECTED tag (reused from the
// DeskColumn tag styling, lines 98-103) + the NEW verify-don't-trust badge mapped from
// `agent.source` via lib/solverParse.badgeLabel (claude → "VERIFIED · CLAUDE",
// deterministic-fallback → "VERIFIED · DETERMINISTIC"). The badge uses INK text only —
// never invent a new color (red/lime/flame are reserved).
//
// Proposal list (1px ink top): Clearing Price → preview.clearingPrice.toFixed(2)
// (= "100.00") · Matched Volume → preview.matchedVolume units (= "10 units") · then a
// per-desk signed fill row from preview.allocations (signed by side: Buy + #2B3AF2,
// Sell − #FF3D9A, 0 rgba(10,10,10,.4)). §4: BLUEROCK +10 · MERIDIAN −8 · HALWARD −2.
//
// Operator-plane DISPLAY only: it reads the lifted SolvePreviewResponse (from :4100 via
// web/src/solver.ts). No operator token, no @daml/react context here (threat T-06-01).
import type { SolvePreviewResponse } from '../solver'
import { codeForParty } from '../desks'
import { badgeLabel } from '../lib/solverParse'

type Props = { preview: SolvePreviewResponse }

// Signed-quantity color (UI-SPEC line 204): Buy + blue / Sell − pink / 0 faded ink.
function fillColor(side: 'Buy' | 'Sell', qty: number): string {
  if (qty === 0) return 'rgba(10,10,10,.4)'
  return side === 'Buy' ? '#2B3AF2' : '#FF3D9A'
}

// Signed numeral text: +n for a Buy fill, −n for a Sell fill, 0 unsigned.
function signedQty(side: 'Buy' | 'Sell', qty: number): string {
  if (qty === 0) return '0'
  return side === 'Buy' ? `+${qty}` : `−${qty}`
}

export default function AgentProposal({ preview }: Props) {
  return (
    <div style={{ padding: '26px 40px 0 0', borderRight: '1px solid #0A0A0A' }}>
      {/* Header — flame dot + agent id + SELECTED tag + the NEW source badge */}
      <div className="flex items-center" style={{ gap: '11px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '11px',
            height: '11px',
            borderRadius: '50%',
            background: '#FF6A1A',
          }}
        />
        <span className="font-mono text-15 font-semibold" style={{ letterSpacing: '.08em' }}>
          SOLVER-AGENT-00
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="font-mono text-9 border"
          style={{ letterSpacing: '.12em', padding: '3px 7px' }}
        >
          SELECTED
        </span>
        {/* The NEW verify-don't-trust badge — same tag styling, ink text. */}
        <span
          className="font-mono text-9 border"
          style={{ letterSpacing: '.12em', padding: '3px 7px' }}
        >
          {badgeLabel(preview.agent.source)}
        </span>
      </div>

      {/* Proposal list — 1px ink top, rows border-bottom rgba(10,10,10,.16) */}
      <div className="border-t" style={{ marginTop: '24px' }}>
        <ProposalRow label="Clearing Price" value={preview.clearingPrice.toFixed(2)} />
        <ProposalRow label="Matched Volume" value={`${preview.matchedVolume} units`} />

        {/* Per-desk signed fill rows (UI-SPEC line 204). */}
        {preview.allocations.map((a) => (
          <div
            key={`${a.desk}-${a.side}`}
            className="flex items-center justify-between"
            style={{ padding: '14px 0', borderBottom: '1px solid rgba(10,10,10,.16)' }}
          >
            <span className="font-mono text-13" style={{ letterSpacing: '.06em' }}>
              {codeForParty(a.desk)}
            </span>
            <span
              className="font-mono text-15 font-semibold tabular-nums"
              style={{ color: fillColor(a.side, a.filledQty) }}
            >
              {signedQty(a.side, a.filledQty)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// One label → 22px mono value proposal row (Clearing Price / Matched Volume).
function ProposalRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{ padding: '16px 0', borderBottom: '1px solid rgba(10,10,10,.16)' }}
    >
      <span
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em' }}
      >
        {label}
      </span>
      <span className="font-mono text-22 font-bold tabular-nums">{value}</span>
    </div>
  )
}
