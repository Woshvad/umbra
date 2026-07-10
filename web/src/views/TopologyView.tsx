// Network Topology (NEW view 07) — VIZ-03 (11-UI-SPEC lines 162-195). The honest three-node
// cross-node settlement visualization: three participant node cards (+ a GUEST card once a guest
// has joined) each hosting a desk's order as a cross-node REDACTION stripe (contents are the
// owner's alone — structural privacy, never a rival's order), an inverted operator/synchronizer
// node that sees only a COUNT (venue-blind), SVG connector edges that light `#E2231A` red with an
// `AtomicStamp` spanning the whole diagram on settle (one atomic tx across every node), and the
// HARD, NON-REMOVABLE `DEMO-REAL · SINGLE-OPERATOR LOCALNET` honesty badge that stays on-screen
// whenever the hosting map resolves every node to one participant (T-11-09-OVERCLAIM).
//
// Chrome + provenance grammar are the shipped TimeMachineView pattern (lines 484-499); the node
// cards + pure derivation core live in components/TopologyNode.tsx and are RE-EXPORTED here (this
// view is the documented home of the core). Data comes from the credential-free solver.getTopology
// (11-08/11-03) — NO operator token / @daml/react context in this bundle (T-11-09-CRED). A down
// LocalNet degrades to an empty/partial map (never an error); a network reject → OFFLINE_CAPTION.
import { useEffect, useState } from 'react'
import { getTopology, SolverError, OFFLINE_CAPTION, type TopologyMeta } from '../solver'
import type { OperatorViewState } from '../operatorState'
import TopologyNode, {
  nodesFromHosting,
  edges,
  DEMO_REAL_BADGE,
} from '../components/TopologyNode'
import AtomicStamp from '../components/AtomicStamp'

// Re-export the pure derivation core so the view is its documented home (Topology.test.tsx
// imports it directly from the component; consumers may import it from either).
export { nodesFromHosting, edges, demoRealCaption } from '../components/TopologyNode'

// ── Verbatim copy tokens (11-UI-SPEC Copywriting Contract) ──────────────────────────────────
export const HEADLINE = 'ONE TRANSACTION. EVERY NODE.'
export const SECTION_LABEL = 'Network Topology · Cross-Node Settlement'
export const LIMITATION_CAPTION =
  'True 3-validator topology needs three institutions each running a validator — a recorded limitation.'
export const LOADING_CAPTION = 'READING NODE TOPOLOGY…'
export const EMPTY_HEADLINE = 'No round to map yet.'
// Verbatim Copywriting Contract body (UI-SPEC:137) — restored from an earlier rewrite.
export const EMPTY_BODY =
  "Open and run a round in 03 Theatre — each desk's order, its host node, and the atomic settlement spanning them all draw here."

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// The HARD honesty badge — the red-square mono-9 tag grammar (mirrors TimeMachine's
// RECONSTRUCTED). NON-REMOVABLE while nodes resolve to one participant.
function DemoRealBadge() {
  return (
    <>
      <div className="flex items-center" style={{ gap: '8px', marginBottom: '10px' }}>
        <span
          aria-hidden="true"
          style={{ width: '6px', height: '6px', background: '#E2231A', display: 'inline-block' }}
        />
        <span
          className="font-mono text-9 uppercase"
          style={{ letterSpacing: '.16em', color: '#E2231A' }}
        >
          {DEMO_REAL_BADGE}
        </span>
      </div>
      <p
        className="font-body text-13 opacity-70"
        style={{ lineHeight: 1.6, maxWidth: '620px', margin: '0 0 30px' }}
      >
        {LIMITATION_CAPTION}
      </p>
    </>
  )
}

// The hand-rolled diagram: an SVG connector overlay (node → synchronizer) beneath the inverted
// operator node atop a CSS-grid of participant cards. On settle the edges light red and the
// AtomicStamp spans the whole diagram.
function Diagram({ meta, settled }: { meta: TopologyMeta; settled: boolean }) {
  const nodes = nodesFromHosting(meta)
  const edgeList = edges(nodes)
  const n = Math.max(nodes.length, 1)
  const reduced = prefersReducedMotion()
  const stroke = settled ? '#E2231A' : '#0A0A0A'

  return (
    <div style={{ position: 'relative', marginTop: '34px' }}>
      {/* SVG connector overlay — a fan of 1px edges from each participant column up to the
          single synchronizer. Idle ink → red on settle (transition gated by reduced-motion). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        {edgeList.map((e, i) => {
          const x = ((i + 0.5) / n) * 100
          return (
            <line
              key={e.from}
              x1={x}
              y1={64}
              x2={50}
              y2={12}
              stroke={stroke}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ transition: reduced ? 'none' : 'stroke .4s ease' }}
            />
          )
        })}
      </svg>

      {/* Operator / synchronizer node — inverted, top-centered. It sees a COUNT only. */}
      <div style={{ maxWidth: '300px', margin: '0 auto 40px', position: 'relative' }}>
        <TopologyNode variant="operator" count={nodes.length} />
      </div>

      {/* Participant node cards — each hosts a redacted resident order. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gap: '20px',
          position: 'relative',
        }}
      >
        {nodes.map((node) => (
          <TopologyNode key={node.id} variant="participant" node={node} />
        ))}
      </div>

      {/* Atomic finality — the SAME 1 TRANSACTION · ATOMIC stamp as 05 Settlement, spanning
          the whole diagram to signal the tx crosses every node. */}
      <AtomicStamp show={settled} />
    </div>
  )
}

type Props = OperatorViewState

export default function TopologyView({ roundId, phase, offline, setOffline }: Props) {
  const [meta, setMeta] = useState<TopologyMeta | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    getTopology(roundId)
      .then((res) => {
        if (!alive) return
        setMeta(res)
        setLoaded(true)
      })
      .catch((err) => {
        if (!alive) return
        if (err instanceof SolverError && err.code === 'OFFLINE') setOffline(true)
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [roundId, setOffline])

  const settled = phase === 'settled'
  // The badge is non-removable while nodes resolve to one participant — the LocalNet reality
  // (demoReal). Before data loads we conservatively assume the single-operator LocalNet.
  const oneParticipant = meta?.demoReal !== false

  return (
    <main style={{ position: 'relative', padding: '30px 48px 64px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">07</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          {SECTION_LABEL}
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-54 font-bold"
        style={{ lineHeight: 0.96, letterSpacing: '-.02em', margin: '26px 0 20px' }}
      >
        {HEADLINE}
      </h1>

      {/* HARD honesty badge — non-removable while one participant. */}
      {oneParticipant && <DemoRealBadge />}

      {offline ? (
        <div className="font-mono text-11" style={{ letterSpacing: '.14em', opacity: 0.7 }}>
          {OFFLINE_CAPTION}
        </div>
      ) : !loaded ? (
        <div
          className="font-mono text-11 animate-umbra-pulse"
          style={{ letterSpacing: '.14em', opacity: 0.6 }}
        >
          {LOADING_CAPTION}
        </div>
      ) : !meta ? (
        <div style={{ maxWidth: '560px' }}>
          <div className="font-display text-22 font-bold" style={{ marginBottom: '10px' }}>
            {EMPTY_HEADLINE}
          </div>
          <p className="font-body text-13 opacity-70" style={{ lineHeight: 1.6 }}>
            {EMPTY_BODY}
          </p>
        </div>
      ) : (
        <>
          <Diagram meta={meta} settled={settled} />
          <p
            className="font-body text-13 opacity-70"
            style={{ lineHeight: 1.6, maxWidth: '620px', margin: '32px 0 0' }}
          >
            Each node hosts only its own desk&rsquo;s order — a rival&rsquo;s contents are{' '}
            <em>not visible</em> cross-node, and the synchronizer sees a count, never contents. On
            settle, one atomic transaction lights every edge at once.
          </p>
        </>
      )}
    </main>
  )
}
