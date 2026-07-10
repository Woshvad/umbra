// TopologyNode (UI-SPEC "VIZ-03 — 07 Network Topology", lines 174-188) — the node-card
// primitive for the topology diagram + the PURE, DOM-free derivation core the view and its
// unit test share. Two card variants:
//   • participant  → 1px ink border, paper fill, `24px 22px 26px` padding; ColumnHeader-style
//                    mono code + role; an `ORDER RESIDENT` label; the resident order rendered
//                    ONLY as a `bg-redact` redaction stripe + `NOT VISIBLE` (cross-node privacy
//                    is structural — a node NEVER renders a rival desk's order contents, only
//                    the redaction motif reused from DeskColumn/RedactionBar); a small
//                    `PARTICIPANT · {id}` caption (or `SAME PARTICIPANT (LOCALNET)` when the
//                    hosting map resolves every node to one participant — the HARD demo-real beat).
//   • operator     → the inverted-surface grammar reused from Theatre (ink fill `#0A0A0A`, paper
//                    text): `OPERATOR · SYNCHRONIZER`; it sees a COUNT of resident participant
//                    NODES (the connected node cards), never contents (venue-blind, matching
//                    Privacy's venue spine). Labeled `NODES RESIDENT` — the value is nodes.length.
//
// The pure core (`nodesFromHosting` / `edges` / `demoRealCaption` + `partyForDesk`) maps the
// credential-free `TopologyMeta` hosting map (solver.ts getTopology, from 11-08/11-03) onto
// node descriptors + connector edges WITHOUT ever carrying an order's contents. TopologyView
// re-exports it (the documented home of the core); Topology.test.tsx exercises it directly.
import { DESKS, GUEST, type DeskMeta } from '../desks'
import type { DeskKey } from '../ledgerContexts'
import type { TopologyMeta } from '../solver'

// ── Verbatim copy tokens (UI-SPEC Copywriting Contract) ────────────────────────────────────
export const DEMO_REAL_BADGE = 'DEMO-REAL · SINGLE-OPERATOR LOCALNET'
export const SAME_PARTICIPANT_CAPTION = 'SAME PARTICIPANT (LOCALNET)'
export const NODE_NOT_VISIBLE = 'NOT VISIBLE'
export const ORDER_RESIDENT_LABEL = 'ORDER RESIDENT'
export const OPERATOR_CODE = 'OPERATOR'
export const OPERATOR_ROLE = 'Venue · Synchronizer'
export const OPERATOR_ID = 'operator'

// The three primary desks (BLUEROCK/MERIDIAN/HALWARD) always render a participant node; the
// GUEST (bankD) node appears ONLY once a guest party is actually hosted (UI-SPEC line 175).
const PRIMARY: DeskMeta[] = DESKS

// The live party id ("bankA::<fp>") whose DeskKey prefix matches `deskKey` — the perParty map
// is keyed by full party ids, so we resolve a desk's party by its prefix (never throws).
export const partyForDesk = (
  perParty: Record<string, string[]>,
  deskKey: DeskKey,
): string | undefined => Object.keys(perParty).find((p) => p.split('::')[0] === deskKey)

// A participant node descriptor — CODE/role/hosting participant + honest caption. It deliberately
// carries NO order contents (no side/quantity/limit): cross-node privacy is structural, so a node
// only ever exposes the redaction stripe, never a rival's order (threat T-11-09-DISCLOSE).
export interface TopoNode {
  id: DeskKey
  code: string
  role: string
  participant?: string
  caption: string
}

// A connector edge (node → synchronizer). Pure data the SVG overlay draws.
export interface TopoEdge {
  from: string
  to: string
}

// The overall demo-real caption: `SAME PARTICIPANT (LOCALNET)` when the hosting map resolves
// every node to one participant (the HARD honesty beat), else the server's distributed caption.
export const demoRealCaption = (meta: Pick<TopologyMeta, 'demoReal' | 'caption'>): string =>
  meta.demoReal ? SAME_PARTICIPANT_CAPTION : meta.caption || 'DISTRIBUTED (MULTI-NODE)'

// Derive the participant node cards from the hosting metadata. A/B/C always; GUEST only when a
// bankD party is hosted. Each node's caption is `SAME PARTICIPANT (LOCALNET)` under demo-real, or
// the per-participant `PARTICIPANT · {id}` when genuinely distributed.
export const nodesFromHosting = (meta: TopologyMeta | null | undefined): TopoNode[] => {
  const perParty = meta?.perParty ?? {}
  const decks: DeskMeta[] = [...PRIMARY]
  if (partyForDesk(perParty, GUEST.key)) decks.push(GUEST)
  return decks.map((d) => {
    const partyId = partyForDesk(perParty, d.key)
    const participant = partyId ? perParty[partyId]?.[0] : undefined
    const caption = meta?.demoReal
      ? SAME_PARTICIPANT_CAPTION
      : `PARTICIPANT · ${participant ?? '—'}`
    return { id: d.key, code: d.code, role: d.role, participant, caption }
  })
}

// The connector edges: every participant node links to the single synchronizer node.
export const edges = (nodes: TopoNode[]): TopoEdge[] =>
  nodes.map((n) => ({ from: n.id, to: OPERATOR_ID }))

// ── Presentation ────────────────────────────────────────────────────────────────────────────

const CARD_PADDING = '24px 22px 26px'

function ParticipantCard({ node }: { node: TopoNode }) {
  return (
    <div
      className="animate-umbra-fade bg-paper"
      style={{ border: '1px solid #0A0A0A', padding: CARD_PADDING }}
    >
      <div className="font-mono text-13 font-bold" style={{ letterSpacing: '.16em' }}>
        {node.code}
      </div>
      <div
        className="font-body text-10 uppercase opacity-55"
        style={{ letterSpacing: '.14em', marginTop: '3px' }}
      >
        {node.role}
      </div>

      <div style={{ marginTop: '18px' }}>
        <div
          className="font-mono text-9 uppercase opacity-55"
          style={{ letterSpacing: '.16em', marginBottom: '9px' }}
        >
          {ORDER_RESIDENT_LABEL}
        </div>
        {/* Cross-node privacy: the resident order is the owner's alone — only the redaction
            stripe crosses the node boundary, never the contents (RedactionBar motif). */}
        <span
          aria-hidden="true"
          className="block bg-ink bg-redact"
          style={{ width: '70px', height: '15px' }}
        />
        <div
          className="font-mono text-9 opacity-60"
          style={{ marginTop: '8px', letterSpacing: '.16em' }}
        >
          {NODE_NOT_VISIBLE}
        </div>
      </div>

      <div
        className="font-mono text-9 uppercase opacity-50"
        style={{ marginTop: '16px', letterSpacing: '.14em' }}
      >
        {node.caption}
      </div>
    </div>
  )
}

function OperatorCard({ count }: { count: number }) {
  return (
    <div
      className="animate-umbra-fade"
      style={{ background: '#0A0A0A', color: '#F4F1EA', padding: CARD_PADDING }}
    >
      <div className="font-mono text-13 font-bold" style={{ letterSpacing: '.16em' }}>
        {OPERATOR_CODE}
      </div>
      <div
        className="font-body text-10 uppercase"
        style={{ letterSpacing: '.14em', marginTop: '3px', opacity: 0.7 }}
      >
        {OPERATOR_ROLE}
      </div>

      <div style={{ marginTop: '18px' }}>
        <div
          className="font-mono text-9 uppercase"
          style={{ letterSpacing: '.16em', marginBottom: '9px', opacity: 0.6 }}
        >
          SEES A COUNT · NEVER CONTENTS
        </div>
        <div className="font-mono text-22 font-bold tabular-nums">{count}</div>
        <div
          className="font-mono text-9 uppercase"
          style={{ marginTop: '6px', letterSpacing: '.16em', opacity: 0.6 }}
        >
          {/* `count` is the number of participant NODES (nodes.length), not sealed orders —
              label it honestly as NODES RESIDENT so the caption matches the value (LW-04). */}
          {count === 1 ? 'NODE' : 'NODES'} RESIDENT
        </div>
      </div>
    </div>
  )
}

// The single node-card component — `participant` (redaction stripe + caption) or the inverted
// `operator` (count-only) variant.
type TopologyNodeProps =
  | { variant: 'participant'; node: TopoNode }
  | { variant: 'operator'; count: number }

export default function TopologyNode(props: TopologyNodeProps) {
  return props.variant === 'operator' ? (
    <OperatorCard count={props.count} />
  ) : (
    <ParticipantCard node={props.node} />
  )
}
