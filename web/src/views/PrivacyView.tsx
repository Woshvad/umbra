// Privacy View (view 01) — the 3-up money shot (UI-SPEC lines 249-307). Composes:
// frame + SealedRail + section marker + headline + VenueSpine (shared count) + the
// 3-up grid of DeskColumns + closing paragraph. Each DeskColumn is wired to its own
// per-party context (ctxA/ctxB/ctxC) and token — privacy is STRUCTURAL at the wire
// (PRIV-05), never a render-time filter. The active column matches App's activeDesk.
import { ctxA, ctxB, ctxC, type DeskKey } from '../ledgerContexts'
import SealedRail from '../components/SealedRail'
import VenueSpine from '../components/VenueSpine'
import DeskColumn from '../components/DeskColumn'

type Props = {
  activeDesk: DeskKey
  sealedCount: number
}

const COLUMNS = [
  { deskKey: 'bankA' as const, ctx: ctxA },
  { deskKey: 'bankB' as const, ctx: ctxB },
  { deskKey: 'bankC' as const, ctx: ctxC },
]

export default function PrivacyView({ activeDesk, sealedCount }: Props) {
  return (
    <main style={{ position: 'relative', padding: '0 48px 64px', overflow: 'hidden' }}>
      <SealedRail />

      <div style={{ paddingLeft: '42px' }}>
        {/* Section marker */}
        <div className="flex items-baseline" style={{ gap: '14px', paddingTop: '30px' }}>
          <span className="font-mono text-13 font-semibold">01</span>
          <span
            className="font-body text-11 uppercase opacity-55"
            style={{ letterSpacing: '.16em' }}
          >
            Privacy / The Book
          </span>
        </div>
        <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

        {/* Headline — two lines, 2nd indented 120px (verbatim copy) */}
        <h1
          className="font-display text-78 font-bold"
          style={{ lineHeight: '.94', letterSpacing: '-.025em', margin: '34px 0 0 -3px', maxWidth: '1080px' }}
        >
          {"EVERYONE'S BLIND."}
          <br />
          <span style={{ marginLeft: '120px' }}>{"THAT'S THE POINT."}</span>
        </h1>

        {/* Venue spine — the shared count via a desk context (no operator token) */}
        <VenueSpine sealedCount={sealedCount} />

        {/* 3-up grid — internal 1px ink borders, gap 0, last column borderless */}
        <div
          className="border-t"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 0,
            marginTop: '24px',
          }}
        >
          {COLUMNS.map((col, i) => (
            <DeskColumn
              key={col.deskKey}
              deskKey={col.deskKey}
              ctx={col.ctx}
              isActive={col.deskKey === activeDesk}
              isLast={i === COLUMNS.length - 1}
            />
          ))}
        </div>

        {/* Closing paragraph (verbatim, note the emphasised "exists") */}
        <p
          className="font-body text-13 opacity-70"
          style={{ lineHeight: 1.6, maxWidth: '560px', margin: '28px 0 0' }}
        >
          Three desks submit into one batch. Each sees its own ticket in full and nothing of its
          rivals — only that an order <em>exists</em>. The venue itself sees a count, never contents.
        </p>
      </div>
    </main>
  )
}
