// Time Machine (NEW view 06) — VIZ-02 privacy Time Machine (10-UI-SPEC lines 311-341).
// It reconstructs EACH PARTY's exact view at each round stage from AUTHENTIC JSON Ledger
// API v2 events, reusing PrivacyView's redaction motif + the per-party plane. It is the
// "REWIND THE BLINDNESS" money shot: privacy holds OVER TIME, and we PROVE it rather than
// stage it — every bank column mounts its OWN ctx.DamlLedger carrying that desk's own token
// and reads its ACS AT THE SELECTED STAGE OFFSET (the `activeAtOffset` primitive, keyed by
// the operator-plane solver.getStageOffsets map). A rival column genuinely returns ∅ of a
// rival's order (V4 access control at the wire, not a render-time filter).
//
// SECRET BOUNDARY (HARD): the browser holds ONLY the three desk tokens (web/src/tokens.json).
// The operator token NEVER enters the browser. So the OPERATOR (venue) column cannot be
// AUTHENTICALLY read here — its aggregate view is HONESTLY labeled RECONSTRUCTED (T3), and at
// the COMMITTED/TIMELOCKED stage it is redacted like everyone else (the venue-blind beat,
// CRYP-02). The only operator-plane call in this view is the credential-free stage→offset map.
//
// Provenance grammar (honest labeling — 10-UI-SPEC):
//   • VISIBLE (T1)       → an authentic ledger event: real contract data + `LEDGER EVENT @ {offset}`.
//   • BLINDED            → the `bg-redact` stripe + `NOT VISIBLE` (structural privacy / venue-blind).
//   • RECONSTRUCTED (T3) → a DASHED cell + red `RECONSTRUCTED` tag (a stage with no captured event,
//                          or the operator plane we deliberately cannot read in the browser).
//
// The shipped provider (web/src/ledger/v2react.tsx) only ever reads at ledger-END; the time
// machine needs `activeAtOffset`, so — within the file scope of this plan (which does not touch
// v2react.tsx / peek.ts) — each bank column issues its own offset-scoped active-contracts read
// that byte-mirrors v2react.fetchAcs / peek.buildPeekRequest, authenticated as that desk's OWN
// token against that desk's OWN node base. Privacy stays enforced at the wire.
import { useEffect, useState, type CSSProperties } from 'react'
import { ctxA, ctxB, ctxC, type Ctx, type DeskKey } from '../ledgerContexts'
import { UMBRA_PACKAGE_NAME } from '../ledger/v2react'
import { tokens, httpBaseUrlFor, wsBaseUrl, DESKS, deskKeyForParty } from '../desks'
import {
  getStageOffsets,
  OFFLINE_CAPTION,
  SolverError,
  type Stage,
  type StageOffsets,
} from '../solver'
import type { OperatorViewState } from '../operatorState'

// ── Pure, DOM-free core (unit-tested by TimeMachine.test.tsx) ─────────────────────────────

// The five lifecycle stages, in scrubber order, with their VIZ-02 labels (verbatim copy).
export const STAGE_NODES: { key: Stage; label: string }[] = [
  { key: 'open', label: 'OPEN' },
  { key: 'committed', label: 'COMMITTED/TIMELOCKED' },
  { key: 'sealed', label: 'SEALED/REVEALED' },
  { key: 'cleared', label: 'CLEARED' },
  { key: 'settled', label: 'SETTLED' },
]

// Verbatim copy tokens (10-UI-SPEC Copywriting Contract).
export const HEADLINE = 'REWIND THE BLINDNESS.'
export const CAP_NOT_VISIBLE = 'NOT VISIBLE'
export const TAG_RECONSTRUCTED = 'RECONSTRUCTED'
export const ledgerEventCaption = (offset: number): string => `LEDGER EVENT @ ${offset}`

// The COMMITTED/TIMELOCKED stage is the venue-blind beat: contents are ciphertext, so NO
// party (owner, rival, OR the operator) can see order contents — everyone is redacted.
export const isVenueBlindStage = (stage: Stage): boolean => stage === 'committed'

// A live party id → its DeskKey, but ONLY for the three primary desks. The Time Machine
// replays those three; the guest (bankD) joins via the mobile /join route and is not part of
// this 3-up replay, so a guest party must still resolve to undefined here.
//
// Delegates to desks.ts `deskKeyForParty`, which matches on EXACT party identity rather than
// parsing the "::" prefix — the prefix is only the DeskKey on LocalNet. On the shared DevNet
// validator the hint is namespaced against collisions (`umbra-bankA-<ts>::<fp>`), so prefix
// parsing resolved to undefined and this view replayed an empty book.
export const deskKeyOfParty = (party: string): DeskKey | undefined => {
  const key = deskKeyForParty(party)
  return key && (['bankA', 'bankB', 'bankC'] as DeskKey[]).includes(key) ? key : undefined
}

// The compact order shape a VISIBLE cell renders (mono, tabular).
export interface CellOrder {
  side: string
  quantity: string
  limit: string
}

export interface OrderRead {
  desk: DeskKey
  order: CellOrder
}

// "<pkgid>:Umbra.Auction:Order" → "Order"
const entityOf = (templateId: string): string => templateId.split(':').pop() ?? ''

// Parse a raw v2 /state/active-contracts response (a party's AUTHENTIC read) into the Orders
// it contains, keyed by owning desk. Byte-mirrors v2react.fetchAcs's extraction path
// (contractEntry.JsActiveContract.createdEvent, packageName==='umbra'), then reads Order.desk.
// Because each column reads with ITS OWN token, a rival's Order is simply absent from the array
// — the redaction is the wire's, not ours.
export const ordersFromAcs = (rows: unknown[]): OrderRead[] =>
  (Array.isArray(rows) ? rows : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => !!c && c.packageName === UMBRA_PACKAGE_NAME && entityOf(String(c.templateId)) === 'Order',
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any): OrderRead | undefined => {
      const a = (c.createArgument ?? {}) as Record<string, unknown>
      const desk = deskKeyOfParty(String(a.desk ?? ''))
      if (!desk) return undefined
      return {
        desk,
        order: {
          side: String(a.side ?? ''),
          quantity: String(a.quantity ?? ''),
          limit: String(a.limit ?? ''),
        },
      }
    })
    .filter((x): x is OrderRead => !!x)

// The set of desks whose Order the viewer AUTHENTICALLY sees at a given offset.
export const visibleDesksFromAcs = (rows: unknown[]): Set<DeskKey> =>
  new Set(ordersFromAcs(rows).map((o) => o.desk))

export type CellKind = 'visible' | 'blinded' | 'reconstructed'

export interface Cell {
  kind: CellKind
  offset?: number
  order?: CellOrder
}

// The per-(viewer, subject, stage) verdict for a BANK column. `visible` is the viewer's own
// authentic read (the set of desks whose Order it can see at `offset`).
//   • venue-blind stage        → blinded (timelock ciphertext — nobody sees contents)
//   • no captured offset       → reconstructed (T3, honest: no authentic event to replay)
//   • subject in viewer's read → visible (T1, the real event @ offset)
//   • otherwise                → blinded (NOT VISIBLE — the rival is absent at the wire)
export const bankCell = (params: {
  stage: Stage
  offset: number | undefined
  visible: Set<DeskKey>
  subject: DeskKey
  order?: CellOrder
}): Cell => {
  const { stage, offset, visible, subject, order } = params
  if (isVenueBlindStage(stage)) return { kind: 'blinded' }
  if (offset === undefined) return { kind: 'reconstructed' }
  if (visible.has(subject)) return { kind: 'visible', offset, order }
  return { kind: 'blinded' }
}

// The OPERATOR (venue) column. The browser holds NO operator token (secret boundary), so the
// venue's aggregate view can never be AUTHENTICALLY read here → it is honestly RECONSTRUCTED,
// except at the venue-blind stage where it is redacted like every desk (CRYP-02).
export const operatorCell = (params: { stage: Stage; offset: number | undefined }): Cell => {
  if (isVenueBlindStage(params.stage)) return { kind: 'blinded' }
  return { kind: 'reconstructed' }
}

// ── Offset-scoped per-party read (mirrors v2react.fetchAcs, but at a CHOSEN offset) ────────
// Authenticated as `deskKey`'s OWN token against `deskKey`'s OWN node base. No operator token.
async function readAcsAtOffset(deskKey: DeskKey, activeAtOffset: number): Promise<unknown[]> {
  const base = httpBaseUrlFor(deskKey).replace(/\/+$/, '')
  const { party, token } = tokens[deskKey]
  const res = await fetch(`${base}/v2/state/active-contracts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: { filtersByParty: { [party]: {} } },
      verbose: true,
      activeAtOffset,
    }),
  })
  if (!res.ok) return []
  const arr = (await res.json()) as unknown
  return Array.isArray(arr) ? arr : []
}

// ── Presentation ──────────────────────────────────────────────────────────────────────────

const COL_PADDING = '24px 22px 26px'

function ColumnHeader({ code, role }: { code: string; role: string }) {
  return (
    <div>
      <div className="font-mono text-13 font-bold" style={{ letterSpacing: '.16em' }}>
        {code}
      </div>
      <div
        className="font-body text-10 uppercase opacity-55"
        style={{ letterSpacing: '.14em', marginTop: '3px' }}
      >
        {role}
      </div>
    </div>
  )
}

function VisibleCellBody({ order, offset }: { order?: CellOrder; offset: number }) {
  const side = order?.side ? order.side.toUpperCase() : '—'
  const sideColor = order?.side === 'Buy' ? '#2B3AF2' : order?.side === 'Sell' ? '#FF3D9A' : undefined
  return (
    <>
      <div className="flex justify-between font-mono text-13 tabular-nums">
        <span style={{ color: sideColor, fontWeight: 700 }}>{side}</span>
        <span>
          {order ? order.quantity : '—'} @ {order ? order.limit : '—'}
        </span>
      </div>
      <div
        className="font-mono text-9 opacity-60"
        style={{ marginTop: '8px', letterSpacing: '.14em' }}
      >
        {ledgerEventCaption(offset)}
      </div>
    </>
  )
}

function BlindedCellBody() {
  return (
    <>
      <span
        aria-hidden="true"
        className="block bg-ink bg-redact"
        style={{ width: '70px', height: '15px' }}
      />
      <div
        className="font-mono text-9 opacity-60"
        style={{ marginTop: '8px', letterSpacing: '.16em' }}
      >
        {CAP_NOT_VISIBLE}
      </div>
    </>
  )
}

function ReconstructedCellBody() {
  return (
    <div
      className="flex items-center font-mono text-9"
      style={{ letterSpacing: '.16em', color: '#E2231A', gap: '7px' }}
    >
      <span
        aria-hidden="true"
        style={{ width: '6px', height: '6px', background: '#E2231A', display: 'inline-block' }}
      />
      {TAG_RECONSTRUCTED}
    </div>
  )
}

// A single (subject) cell within a viewer column. Dashed border ONLY on the reconstructed T3
// surface; the redaction stripe is aria-hidden with the state conveyed by adjacent text.
function CellFrame({ label, cell }: { label: string; cell: Cell }) {
  const dashed = cell.kind === 'reconstructed'
  const style: CSSProperties = {
    padding: '12px 12px 13px',
    // T3 reconstructed = ink-dashed (red is carried by the tag, not the border); T1 visible = solid
    // ink (truth); blinded = muted redaction surface.
    border: dashed
      ? '1px dashed #0A0A0A'
      : cell.kind === 'visible'
        ? '1px solid #0A0A0A'
        : '1px solid rgba(10,10,10,.14)',
  }
  return (
    <div style={style}>
      <div
        className="font-mono text-9 uppercase opacity-55"
        style={{ letterSpacing: '.16em', marginBottom: '9px' }}
      >
        {label}
      </div>
      {cell.kind === 'visible' && <VisibleCellBody order={cell.order} offset={cell.offset ?? 0} />}
      {cell.kind === 'blinded' && <BlindedCellBody />}
      {cell.kind === 'reconstructed' && <ReconstructedCellBody />}
    </div>
  )
}

// The three subject orders each column is asked "what can you see of these?".
const SUBJECTS: DeskKey[] = ['bankA', 'bankB', 'bankC']
const codeOf = (key: DeskKey): string => DESKS.find((d) => d.key === key)?.code ?? key
const roleOf = (key: DeskKey): string => DESKS.find((d) => d.key === key)?.role ?? ''

// Inner body — rendered INSIDE this desk's own ctx.DamlLedger provider (per-party plane, own
// token). It reads its ACS at the SELECTED stage offset (the time-machine primitive) and shows
// what it can see of each of the three orders.
function BankColumnBody({
  deskKey,
  stage,
  offset,
  isLast,
}: {
  deskKey: DeskKey
  stage: Stage
  offset: number | undefined
  isLast: boolean
}) {
  const [visible, setVisible] = useState<Set<DeskKey>>(new Set())
  const [orders, setOrders] = useState<Partial<Record<DeskKey, CellOrder>>>({})

  useEffect(() => {
    let alive = true
    if (offset === undefined) {
      setVisible(new Set())
      setOrders({})
      return
    }
    readAcsAtOffset(deskKey, offset)
      .then((rows) => {
        if (!alive) return
        const reads = ordersFromAcs(rows)
        setVisible(new Set(reads.map((r) => r.desk)))
        const om: Partial<Record<DeskKey, CellOrder>> = {}
        for (const r of reads) om[r.desk] = r.order
        setOrders(om)
      })
      .catch(() => {
        if (!alive) return
        setVisible(new Set())
        setOrders({})
      })
    return () => {
      alive = false
    }
  }, [deskKey, offset, stage])

  return (
    <div
      className="animate-umbra-fade"
      style={{ padding: COL_PADDING, borderRight: isLast ? 'none' : '1px solid #0A0A0A' }}
    >
      <ColumnHeader code={codeOf(deskKey)} role={`Viewer · ${roleOf(deskKey)}`} />
      <div className="flex flex-col" style={{ marginTop: '18px', gap: '10px' }}>
        {SUBJECTS.map((subject) => (
          <CellFrame
            key={subject}
            label={`${codeOf(subject)} ORDER`}
            cell={bankCell({ stage, offset, visible, subject, order: orders[subject] })}
          />
        ))}
      </div>
    </div>
  )
}

// A bank column: mounts its OWN ctx.DamlLedger (that party's token / node) — the structural
// per-party plane — around the offset-scoped body.
function BankColumn({
  deskKey,
  ctx,
  stage,
  offset,
  isLast,
}: {
  deskKey: DeskKey
  ctx: Ctx
  stage: Stage
  offset: number | undefined
  isLast: boolean
}) {
  const { party, token } = tokens[deskKey]
  return (
    <ctx.DamlLedger
      token={token}
      party={party}
      httpBaseUrl={httpBaseUrlFor(deskKey)}
      wsBaseUrl={wsBaseUrl}
    >
      <BankColumnBody deskKey={deskKey} stage={stage} offset={offset} isLast={isLast} />
    </ctx.DamlLedger>
  )
}

// The OPERATOR (venue) column — presentational only (NO operator token in the browser).
function OperatorColumn({ stage, offset }: { stage: Stage; offset: number | undefined }) {
  const cell = operatorCell({ stage, offset })
  return (
    <div className="animate-umbra-fade" style={{ padding: COL_PADDING }}>
      <ColumnHeader code="OPERATOR" role="Venue · Aggregate" />
      <div className="flex flex-col" style={{ marginTop: '18px' }}>
        <CellFrame label="BATCH · AGGREGATE" cell={cell} />
      </div>
    </div>
  )
}

const BANK_COLUMNS: { deskKey: DeskKey; ctx: Ctx }[] = [
  { deskKey: 'bankA', ctx: ctxA },
  { deskKey: 'bankB', ctx: ctxB },
  { deskKey: 'bankC', ctx: ctxC },
]

function Scrubber({ index, onIndex }: { index: number; onIndex: (i: number) => void }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onIndex(Math.min(STAGE_NODES.length - 1, index + 1))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onIndex(Math.max(0, index - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onIndex(STAGE_NODES.length - 1)
    }
  }
  return (
    <div
      role="group"
      aria-label={`Stage: ${STAGE_NODES[index].label}`}
      onKeyDown={onKeyDown}
      style={{ position: 'relative', marginBottom: '18px' }}
    >
      {/* 1px ink rail */}
      <div className="bg-ink" style={{ position: 'absolute', top: '4px', left: 0, right: 0, height: '1px' }} />
      <div className="flex justify-between" style={{ position: 'relative' }}>
        {STAGE_NODES.map((node, i) => {
          const active = i === index
          return (
            <button
              key={node.key}
              type="button"
              onClick={() => onIndex(i)}
              aria-current={active ? 'step' : undefined}
              aria-label={`Stage: ${node.label}`}
              className="flex flex-col items-start border-0 bg-transparent"
              style={{ padding: 0, cursor: 'pointer', outlineColor: '#0A0A0A' }}
            >
              <span
                aria-hidden="true"
                className={active ? 'bg-ink' : ''}
                style={{
                  width: '8px',
                  height: '8px',
                  border: '1px solid #0A0A0A',
                  background: active ? '#0A0A0A' : 'transparent',
                }}
              />
              <span
                className="font-mono text-9 uppercase"
                style={{
                  letterSpacing: '.16em',
                  marginTop: '9px',
                  opacity: active ? 1 : 0.5,
                }}
              >
                {node.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type Props = OperatorViewState

export default function TimeMachineView({ roundId, offline, setOffline }: Props) {
  const [offsets, setOffsets] = useState<StageOffsets | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let alive = true
    getStageOffsets(roundId)
      .then((res) => {
        if (!alive) return
        setOffsets(res.offsets)
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

  const stage = STAGE_NODES[index].key
  const offset = offsets?.[stage]
  const hasAnyOffset = !!offsets && Object.keys(offsets).length > 0

  return (
    <main style={{ position: 'relative', padding: '30px 48px 64px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">06</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Time Machine · Per-Party Replay
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-54 font-bold"
        style={{ lineHeight: 0.96, letterSpacing: '-.02em', margin: '26px 0 30px' }}
      >
        {HEADLINE}
      </h1>

      {offline ? (
        <div className="font-mono text-11" style={{ letterSpacing: '.14em', opacity: 0.7 }}>
          {OFFLINE_CAPTION}
        </div>
      ) : !loaded ? (
        <div className="font-mono text-11 animate-umbra-pulse" style={{ letterSpacing: '.14em', opacity: 0.6 }}>
          READING STAGE OFFSETS…
        </div>
      ) : !hasAnyOffset ? (
        <div style={{ maxWidth: '560px' }}>
          <div className="font-display text-22 font-bold" style={{ marginBottom: '10px' }}>
            No round to replay yet.
          </div>
          <p className="font-body text-13 opacity-70" style={{ lineHeight: 1.6 }}>
            Open and run a round — commit, reveal, clear, settle — and each party&rsquo;s exact
            view at every stage rebuilds here from authentic ledger events.
          </p>
        </div>
      ) : (
        <>
          <Scrubber index={index} onIndex={setIndex} />

          {/* Per-party grid — internal 1px ink borders, gap 0, last borderless. The 4-up
              grid never re-flows, so on narrow screens it would crush; wrap it in an
              overflow-x:auto rail with a min-width so it scrolls instead. Desktop identical. */}
          <div style={{ overflowX: 'auto', marginTop: '4px' }}>
            <div
              className="border-t"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: 0,
                minWidth: '640px',
              }}
            >
              {BANK_COLUMNS.map((col) => (
                <BankColumn
                  key={`${col.deskKey}-${stage}`}
                  deskKey={col.deskKey}
                  ctx={col.ctx}
                  stage={stage}
                  offset={offset}
                  isLast={false}
                />
              ))}
              <OperatorColumn stage={stage} offset={offset} />
            </div>
          </div>

          <p
            className="font-body text-13 opacity-70"
            style={{ lineHeight: 1.6, maxWidth: '620px', margin: '24px 0 0' }}
          >
            Each column reads its own ledger at the scrubbed offset with its own token — so a
            rival&rsquo;s order is <em>not visible</em> at the wire, and at
            COMMITTED/TIMELOCKED even the venue sees only ciphertext.
          </p>
        </>
      )}
    </main>
  )
}
