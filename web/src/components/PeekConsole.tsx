// PeekConsole (WOW-01 — Try-to-Peek Adversarial Privacy Console, 08-UI-SPEC lines
// 164-190) — mounted onto the 01 Privacy money-shot view. It renders the verbatim
// REQUEST + RESPONSE on the ink evidence surface (same treatment as AgentRationale
// L68-92) + a red-square verdict. The credibility is the raw wire, not a styled badge
// (UI-SPEC note 3).
//
// ── THE PROOF (mechanism deviates from UI-SPEC L176-177; see peek.ts + 08-UI-SPEC) ──
// Canton disclosure is stakeholder/informee-based, not token-based. So we ask the ledger,
// AS THE ACTIVE DESK'S OWN PARTY with the ACTIVE DESK'S OWN TOKEN, to hand over a RIVAL's
// contract by contract id:
//
//   step 1 (discovery, out of band)  POST {rivalBase}v2/state/active-contracts
//                                    as the RIVAL, with the RIVAL's OWN token → rival cid
//   step 2 (the peek)                POST {base}v2/events/events-by-contract-id
//                                    as OUR party, with OUR token, for that cid → 404
//
// Step 1 is a deliberate GIFT TO THE ATTACKER and is surfaced honestly in the REQUEST pane.
// bankA could never discover bankB's cid legitimately — that is the point. The demo bundle
// already carries all three desk tokens (tokens.json, by design, for the party switcher), so
// we hand the attacker the rival's exact contract id — and, on DevNet, a bearer with read
// rights on all three desks. The ledger still answers "not visible". The proof is stronger
// for being generous.
//
// The previous mechanism (active-contracts filtered TO the rival party, using our token) is
// NOT used: it tests credential scoping, which a shared-token network defeats — on DevNet all
// three desks share one m2m bearer with readAs on every party, so that read SUCCEEDS and the
// money-shot panel renders a FALSE LEAK banner. Asking as our own party removes the auth
// variable entirely: LocalNet and DevNet both return the same 404. One proof, both nets.
//
// Node/CORS failure is kept a DISTINCT path (Pitfall 4 / T-08-02-NODE) — an unreachable node
// must never masquerade as "privacy enforced" — as is the no-target case (absence of a rival
// contract is not a privacy proof).
import { useMemo, useState } from 'react'
import { DESKS, httpBaseUrlFor, tokens } from '../desks'
import type { DeskKey } from '../ledgerContexts'
import {
  buildInformeePeekRequest,
  buildPeekRequest,
  classifyPeekResult,
  errorCodeOf,
  extractAcsRows,
  extractInformeeRows,
  filterRowsByTemplate,
  PEEK_TEMPLATES,
  type InformeePeekRequest,
  type PeekOutcome,
  type PeekRow,
  type PeekTemplate,
} from '../lib/peek'

type Props = { activeDesk: DeskKey }
type Phase = 'idle' | 'running' | 'returned'

// What the out-of-band discovery read handed us — rendered honestly in the REQUEST pane.
type Discovery = { url: string; rivalCode: string; contractId: string }

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

// Verbatim REQUEST-pane text: the honest discovery preamble, then method + URL, the elided
// bearer, and the wire body (which carries OUR OWN party as the requesting party — the whole
// point is legible on the wire).
const requestText = (req: InformeePeekRequest, d: Discovery, meCode: string): string =>
  [
    `// HANDED TO THE ATTACKER (out of band, using ${d.rivalCode}'s OWN token):`,
    `//   POST ${d.url}  ← as ${d.rivalCode}, a legitimate self-read`,
    `//   → ${d.contractId}`,
    `// ${meCode} could never learn that contract id legitimately. We give it away anyway.`,
    `// Now ${meCode} asks the ledger for it, as ${meCode}, with ${meCode}'s own token:`,
    ``,
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
  const [requestBlock, setRequestBlock] = useState('')
  const [responseText, setResponseText] = useState('')
  const [outcome, setOutcome] = useState<PeekOutcome | null>(null)
  const [errored, setErrored] = useState(false)

  // Keep the rival valid if the active desk changes under us.
  const effectiveRival: DeskKey = rivals.some((r) => r.key === rivalKey)
    ? rivalKey
    : rivals[0]?.key ?? 'bankB'

  const codeOf = (k: DeskKey): string => DESKS.find((d) => d.key === k)?.code ?? k

  const attempt = async (): Promise<void> => {
    setPhase('running')
    setErrored(false)
    setOutcome(null)
    setResponseText('')
    setRequestBlock('')

    const meCode = codeOf(activeDesk)
    const rivalCode = codeOf(effectiveRival)

    // The peeking desk: its OWN node, its OWN bearer, its OWN party (never an operator
    // token — none exists in this bundle; threat T-08-02-OPTOK).
    const base = httpBaseUrlFor(activeDesk)
    const token = tokens[activeDesk].token
    const ownParty = tokens[activeDesk].party
    const authHeader = `Bearer ${token}`

    // The rival's own node + bearer — used ONLY for the out-of-band cid discovery below.
    const rivalBase = httpBaseUrlFor(effectiveRival)
    const rivalToken = tokens[effectiveRival].token
    const rivalParty = tokens[effectiveRival].party
    const rivalAuth = `Bearer ${rivalToken}`

    try {
      // ── Step 1: DISCOVERY (the gift to the attacker) ────────────────────────────────
      // Read the rival's own ACS with the RIVAL's OWN token — a legitimate self-read that
      // any desk can make of its own book. This is how the attacker gets a cid it could
      // never obtain legitimately. It is NOT part of the proof; it is a handicap we accept.
      const endRes = await fetch(`${rivalBase}v2/state/ledger-end`, {
        headers: { Authorization: rivalAuth },
      })
      if (!endRes.ok) throw new Error(`ledger-end HTTP ${endRes.status}`)
      const end = (await endRes.json()) as { offset: number }

      const discReq = buildPeekRequest(rivalBase, rivalToken, rivalParty, template, end.offset)
      const discRes = await fetch(discReq.url, {
        method: 'POST',
        headers: { Authorization: rivalAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify(discReq.body),
      })
      if (!discRes.ok) throw new Error(`discovery HTTP ${discRes.status}`)
      const discRows = filterRowsByTemplate(extractAcsRows(await discRes.json()), template)
      const rivalCid = discRows.find((r) => typeof r.contractId === 'string')?.contractId

      // No target → a plain note, NOT a verdict. Absence of a rival contract is not a
      // privacy proof, and must never be dressed up as one.
      if (!rivalCid) {
        setErrored(true)
        setResponseText(
          `// ${rivalCode} has no live ${template} to peek at yet — nothing to prove.\n` +
            `// (seal a ${rivalCode} order, or settle the round for a TradeConfirmation, then retry)`,
        )
        setPhase('returned')
        return
      }

      // ── Step 2: THE PEEK — ask AS OURSELVES for the rival's contract ────────────────
      // Our token always permits our own party, so the ONLY thing that can refuse us here is
      // Canton's stakeholder projection. Identical on LocalNet and DevNet.
      const req = buildInformeePeekRequest(base, token, ownParty, rivalCid, template)
      setRequestBlock(
        requestText(req, { url: discReq.url, rivalCode, contractId: rivalCid }, meCode),
      )

      const res = await fetch(req.url, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      const raw = await res.text()
      setResponseText(prettify(raw))

      const parsed = safeParse(raw)
      const rows: PeekRow[] | null = res.ok ? extractInformeeRows(parsed) : null
      setOutcome(classifyPeekResult(res.status, rows, errorCodeOf(parsed)))
      setPhase('returned')
    } catch (e) {
      // Node/CORS failure — NOT a privacy result (T-08-02-NODE). Render it plainly and
      // withhold the red-square verdict so an unreachable node can't fake "enforced".
      setErrored(true)
      setResponseText(
        `// could not reach the ledger at ${base} — ${
          e instanceof Error ? e.message || e.name : 'network error'
        }\n// (start the ledger + seed, then retry)`,
      )
      setPhase('returned')
    }
  }

  const running = phase === 'running'
  // Only a real, conclusive privacy result earns the red-square verdict row.
  const showVerdict =
    phase === 'returned' && !!outcome && !errored && !outcome.inconclusive && !!outcome.verdict

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
            {phase === 'idle' || !requestBlock ? IDLE_HINT : requestBlock}
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
      {showVerdict && outcome && (
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

// Local safe JSON parse (returns null on failure) so the extractors never throw on an error body.
const safeParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
