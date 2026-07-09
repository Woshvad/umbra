// PeekConsole (WOW-01 — Try-to-Peek Adversarial Privacy Console, 08-UI-SPEC lines
// 164-190) — mounted onto the 01 Privacy money-shot view. Authenticated as the
// CURRENTLY-SELECTED desk's OWN token (never an operator token — none exists in this
// bundle; threat T-08-02-OPTOK), it fires a RAW JSON Ledger API v2
// `POST /v2/state/active-contracts` filtered to a RIVAL desk party for
// `Umbra.Auction:Order` (and, as a second target, `TradeConfirmation`) and renders the
// verbatim REQUEST + RESPONSE on the ink evidence surface (same treatment as
// AgentRationale L68-92) + a red-square verdict. The credibility is the raw wire, not a
// styled badge (UI-SPEC note 3).
//
// The wire flow mirrors web/src/ledger/v2react.tsx fetchAcs (L75-85):
//   GET  {base}v2/state/ledger-end          → { offset }
//   POST {base}v2/state/active-contracts     buildPeekRequest(...).body
// with `base = httpBaseUrlFor(activeDesk)` so the query hits the desk's OWN node
// (Pitfall 4 / T-08-02-NODE) — a network/CORS failure must NOT masquerade as the
// empty-privacy result, so it is rendered as a distinct node-unreachable note.
import { useMemo, useState } from 'react'
import { DESKS, httpBaseUrlFor, tokens } from '../desks'
import type { DeskKey } from '../ledgerContexts'
import {
  buildPeekRequest,
  classifyPeekResult,
  filterRowsByTemplate,
  PEEK_TEMPLATES,
  type PeekOutcome,
  type PeekRequest,
  type PeekRow,
  type PeekTemplate,
} from '../lib/peek'

type Props = { activeDesk: DeskKey }
type Phase = 'idle' | 'running' | 'returned'

// True when the user has asked for reduced motion (shipped guard — AgentRationale L19-25).
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Pretty-print a raw JSON response for verbatim display; leave non-JSON text as-is.
const prettify = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

// Extract v2 createdEvent rows (contractEntry.JsActiveContract.createdEvent — fetchAcs L83).
const extractRows = (parsed: unknown): PeekRow[] =>
  (Array.isArray(parsed) ? parsed : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c: unknown): c is PeekRow => !!c && typeof (c as PeekRow).templateId === 'string')

// Verbatim REQUEST-pane text: method + URL, the elided bearer, and the wire body.
const requestText = (req: PeekRequest): string =>
  [
    `${req.method} ${req.url}`,
    `Authorization: ${req.authHeaderDisplay}`,
    `Content-Type: application/json`,
    ``,
    JSON.stringify(req.body, null, 2),
  ].join('\n')

const INK_SURFACE: React.CSSProperties = {
  background: '#0A0A0A',
  color: '#F4F1EA',
  padding: '22px 24px',
  minHeight: '96px',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const IDLE_HINT =
  'Pick a rival and a target, then attempt the peek. The raw JSON Ledger API v2 request and its response appear here — unedited.'

export default function PeekConsole({ activeDesk }: Props) {
  // The two rival desks (everyone who is NOT the active desk).
  const rivals = useMemo(() => DESKS.filter((d) => d.key !== activeDesk), [activeDesk])
  const [rivalKey, setRivalKey] = useState<DeskKey>(rivals[0]?.key ?? 'bankB')
  const [template, setTemplate] = useState<PeekTemplate>(PEEK_TEMPLATES.Order)

  const [phase, setPhase] = useState<Phase>('idle')
  const [request, setRequest] = useState<PeekRequest | null>(null)
  const [responseText, setResponseText] = useState('')
  const [outcome, setOutcome] = useState<PeekOutcome | null>(null)
  const [errored, setErrored] = useState(false)

  // Keep the rival valid if the active desk changes under us.
  const effectiveRival: DeskKey = rivals.some((r) => r.key === rivalKey)
    ? rivalKey
    : rivals[0]?.key ?? 'bankB'

  const attempt = async (): Promise<void> => {
    setPhase('running')
    setErrored(false)
    setOutcome(null)
    setResponseText('')
    setRequest(null)

    const base = httpBaseUrlFor(activeDesk)
    const token = tokens[activeDesk].token // this desk's OWN bearer (never operator)
    const rivalParty = tokens[effectiveRival].party
    const authHeader = `Bearer ${token}`

    try {
      // 1) desk's OWN ledger-end (its own node) → offset
      const endRes = await fetch(`${base}v2/state/ledger-end`, {
        headers: { Authorization: authHeader },
      })
      if (!endRes.ok) throw new Error(`ledger-end HTTP ${endRes.status}`)
      const end = (await endRes.json()) as { offset: number }

      // 2) the RAW rival-party active-contracts POST (built by the pure helper)
      const req = buildPeekRequest(base, token, rivalParty, template, end.offset)
      setRequest(req)

      const res = await fetch(req.url, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      const raw = await res.text()
      setResponseText(prettify(raw))

      let rows: PeekRow[] | null = null
      if (res.ok) {
        rows = filterRowsByTemplate(extractRows(safeParse(raw)), template)
      }
      setOutcome(classifyPeekResult(res.status, rows))
      setPhase('returned')
    } catch (e) {
      // Node/CORS failure — NOT a privacy result (T-08-02-NODE). Render it plainly and
      // withhold the red-square verdict so an unreachable node can't fake "enforced".
      setErrored(true)
      setResponseText(
        `// could not reach ${activeDesk}'s node at ${base} — ${
          e instanceof Error ? e.name : 'network error'
        }\n// (start LocalNet + seed, then retry)`,
      )
      setPhase('returned')
    }
  }

  const running = phase === 'running'

  return (
    <section style={{ margin: '42px 0 0', maxWidth: '760px' }}>
      {/* Sub-label + rule — section-marker rhythm */}
      <div
        className="font-body text-10 uppercase opacity-55"
        style={{ letterSpacing: '.16em' }}
      >
        Adversarial · Try to Peek
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '10px 0 0' }} />

      {/* Target selector — two ghost-mono toggles (privacy is structural, not Order-specific) */}
      <div className="flex items-center" style={{ gap: '18px', margin: '18px 0 0' }}>
        {(
          [
            ['Order', PEEK_TEMPLATES.Order],
            ['TradeConfirmation', PEEK_TEMPLATES.TradeConfirmation],
          ] as const
        ).map(([label, value]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTemplate(value)}
            className="font-mono text-9 uppercase"
            style={{
              letterSpacing: '.16em',
              paddingBottom: '3px',
              borderBottom: template === value ? '1px solid #0A0A0A' : '1px solid transparent',
              opacity: template === value ? 1 : 0.5,
              background: 'transparent',
            }}
          >
            rival {label}
          </button>
        ))}
      </div>

      {/* Rival-desk chooser — the two non-active desks */}
      <div className="flex items-center" style={{ gap: '10px', margin: '14px 0 0' }}>
        <span
          className="font-body text-10 uppercase opacity-50"
          style={{ letterSpacing: '.14em' }}
        >
          Peek at
        </span>
        {rivals.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRivalKey(r.key)}
            className="font-mono text-11"
            style={{
              letterSpacing: '.06em',
              padding: '4px 10px',
              border: '1px solid #0A0A0A',
              background: effectiveRival === r.key ? '#0A0A0A' : 'transparent',
              color: effectiveRival === r.key ? '#F4F1EA' : '#0A0A0A',
            }}
          >
            {r.code}
          </button>
        ))}
      </div>

      {/* ATTEMPT PEEK CTA (ink bg / paper) */}
      <div style={{ margin: '20px 0 0' }}>
        <button
          type="button"
          onClick={() => void attempt()}
          disabled={running}
          className="font-mono text-13 font-bold uppercase"
          style={{
            letterSpacing: '.16em',
            padding: '14px 26px',
            background: '#0A0A0A',
            color: '#F4F1EA',
            opacity: running ? 0.6 : 1,
            cursor: running ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {running && (
            <span
              className={prefersReducedMotion() ? '' : 'animate-umbra-pulse'}
              style={{ display: 'inline-block', width: '8px', height: '8px', background: '#E2231A' }}
            />
          )}
          {running ? 'ATTEMPTING…' : 'ATTEMPT PEEK'}
        </button>
      </div>

      {/* Two-pane wire evidence — REQUEST / RESPONSE on the ink evidence surface */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          margin: '18px 0 0',
        }}
      >
        <div>
          <div
            className="font-mono text-12 uppercase opacity-60"
            style={{ letterSpacing: '.16em', marginBottom: '8px' }}
          >
            Request
          </div>
          <div className="font-mono text-13 tabular-nums" style={INK_SURFACE}>
            {phase === 'idle' || !request ? IDLE_HINT : requestText(request)}
          </div>
        </div>
        <div>
          <div
            className="font-mono text-12 uppercase opacity-60"
            style={{ letterSpacing: '.16em', marginBottom: '8px' }}
          >
            Response
          </div>
          <div className="font-mono text-13 tabular-nums" style={INK_SURFACE}>
            {phase === 'idle' ? IDLE_HINT : running ? '…' : responseText || '[]'}
          </div>
        </div>
      </div>

      {/* Red-square verdict row (comp line 131 grammar) — only for a real privacy result */}
      {phase === 'returned' && outcome && !errored && (
        <div className="flex items-center" style={{ gap: '6px', margin: '16px 0 0' }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#E2231A' }} />
          <span
            className="font-mono text-9 uppercase"
            style={{ letterSpacing: '.16em', color: '#E2231A' }}
          >
            {outcome.verdict}
          </span>
        </div>
      )}

      {/* Self-check note — privacy blinds rivals, not yourself */}
      <p
        className="font-body text-13 opacity-70"
        style={{ lineHeight: 1.6, maxWidth: '560px', margin: '16px 0 0' }}
      >
        Your own order is still fully visible to you — privacy blinds rivals, not yourself.
      </p>
    </section>
  )
}

// Local safe JSON parse (returns null on failure) so extractRows never throws on a 403 body.
const safeParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
