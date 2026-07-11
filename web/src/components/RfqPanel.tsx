// RfqPanel (S3 — ADJ-02 RFQ side-mode panel, 13-UI-SPEC lines 172-188) — a MINIMAL
// additive panel on the 02 Desk view, BELOW the OrderTicket. Flow: compose an RFQ
// (instrument fixed BONDX / side / qty) → REQUEST QUOTE → one or more signed FIRM
// quotes → ACCEPT BEST QUOTE → it settles via the SAME atomic Canton DvP path, REUSING
// the shipped settlement visuals (DvpLegs + AtomicStamp) — no new settlement grammar.
//
// Honesty (UI-SPEC line 188): the RFQ accept is a 1×1 DvP that REUSES the same
// Settlement/Round.Clear atomic machinery — the panel labels it as such and never
// implies a separate settlement engine. The best quote is highlighted with a 1px-ink
// emphasis + BEST marker; every quote is tagged FIRM · SIGNED.
//
// Desk-plane DISCIPLINE (threat T-13-38): this panel submits on the desk's OWN identity
// via the credential-free web seam (postRfq / getRfqQuotes / acceptRfqQuote over the
// single SOLVER_BASE_URL call<T>()). There is NO operator token, NO per-party ledger
// React context, and NO model key here — same discipline as OrderTicket. The bundle stays
// grep-clean (proven in RfqPanel.test.tsx). A network reject surfaces the
// shipped OFFLINE_CAPTION; a structured (non-offline) reject renders VERBATIM on the ink
// evidence surface (the BreakTheAiPanel verbatim-reject convention).
import { useEffect, useRef, useState } from 'react'
import {
  postRfq,
  getRfqQuotes,
  acceptRfqQuote,
  SolverError,
  OFFLINE_CAPTION,
  type FirmQuote,
  type RfqAcceptResponse,
  type Side,
} from '../solver'
import DvpLegs, { type DvpLeg } from './DvpLegs'
import AtomicStamp from './AtomicStamp'

// ── Copy contract (13-UI-SPEC S3 + Copywriting Contract, verbatim) ─────────────────────
export const REQUEST_QUOTE = 'REQUEST QUOTE'
export const ACCEPT_BEST_QUOTE = 'ACCEPT BEST QUOTE'
export const AWAITING_QUOTES = 'AWAITING QUOTES…'
export const NO_QUOTES_HEADING = 'NO QUOTES YET'
export const NO_QUOTES_BODY = 'Post an RFQ to request a signed firm quote from a dealer.'
export const FIRM_SIGNED = 'FIRM · SIGNED'
export const BEST_MARKER = 'BEST'
// The persistent honest tag — the panel MUST make its 1×1-DvP, same-machinery nature clear.
export const HONEST_TAG = 'RFQ · 1×1 DVP — SAME ATOMIC SETTLEMENT'
const BOND_SYMBOL = 'BONDX'
const CASH_SYMBOL = 'USDCx'

// ── Pure helpers (DOM-free, credential-free — unit-tested in RfqPanel.test.tsx) ─────────

// The BEST quote index for a side: a BUY requester wants the LOWEST offered price; a SELL
// requester wants the HIGHEST bid. Ties keep the earliest quote (stable). Empty → -1.
export function bestQuoteIndex(quotes: FirmQuote[], side: Side): number {
  if (quotes.length === 0) return -1
  let best = 0
  for (let i = 1; i < quotes.length; i++) {
    const better = side === 'Buy' ? quotes[i].price < quotes[best].price : quotes[i].price > quotes[best].price
    if (better) best = i
  }
  return best
}

// The 1×1 DvP legs derived from an accepted RFQ quote — the SAME shape DvpLegs renders for
// the batch (no new grammar). A BUY requester receives `quantity` BONDX from the dealer and
// pays `cashAmount` cash; a SELL requester delivers the bond and receives the cash. The bond
// seller is whoever gives up the bond. `requesterLabel` lets the caller show the firm code.
export function legsFromAccept(res: RfqAcceptResponse, requesterLabel: string = res.requester): DvpLeg[] {
  const buyerIsRequester = res.side === 'Buy'
  return [
    {
      seller: buyerIsRequester ? res.dealer : requesterLabel,
      buyer: buyerIsRequester ? requesterLabel : res.dealer,
      qty: res.quantity,
      cash: res.cashAmount,
    },
  ]
}

// Classify a solver failure: a network reject (SolverError code OFFLINE) → the shipped
// OFFLINE_CAPTION; any other (structured, secret-free) error → its verbatim message, shown
// on the ink evidence surface. Never fabricates a settle; never summarizes a reject.
export function classifyRfqError(e: unknown): { kind: 'offline' | 'reject'; message: string } {
  if (e instanceof SolverError && e.code === 'OFFLINE') return { kind: 'offline', message: OFFLINE_CAPTION }
  return { kind: 'reject', message: e instanceof Error ? e.message : 'quote request rejected' }
}

// ── Component ───────────────────────────────────────────────────────────────────────────
type Props = {
  // The desk's OWN party id (the RFQ requester) — the desk-plane identity, NOT a token.
  requester: string
  // The desk's display code (BLUEROCK / MERIDIAN / …) for the honest leg label.
  firm: string
}

type Phase = 'idle' | 'awaiting' | 'quotes' | 'settling' | 'settled' | 'offline'

// Max quote polls before falling back to the NO QUOTES YET empty state (bounded, no leak).
const MAX_POLLS = 8
const POLL_MS = 1000

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// The mono 9px .12em ink-border tag styling reused across the comp (honest-label tags).
const inkTag: React.CSSProperties = { letterSpacing: '.12em', padding: '3px 7px' }

export default function RfqPanel({ requester, firm }: Props) {
  const [side, setSide] = useState<Side>('Buy')
  // The side the RFQ was POSTED with — frozen at request time. Ranking/acceptance MUST use
  // this, never the live `side` toggle: flipping side after quotes arrive would otherwise
  // re-rank and select the WORST quote. `side` still drives the compose UI/color only.
  const [postedSide, setPostedSide] = useState<Side>('Buy')
  const [qty, setQty] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [rfqId, setRfqId] = useState<string>('')
  const [quotes, setQuotes] = useState<FirmQuote[]>([])
  const [accepted, setAccepted] = useState<RfqAcceptResponse | null>(null)
  const [reject, setReject] = useState<string>('')
  const [settleProgress, setSettleProgress] = useState<number>(0)
  const [stampIn, setStampIn] = useState<boolean>(false)

  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const pollsRef = useRef<number>(0)
  const rafRef = useRef<number>()
  const doneRef = useRef<ReturnType<typeof setTimeout>>()

  const reduced = prefersReducedMotion()
  const qtyInt = parseInt(qty, 10)
  const qtyValid = Number.isFinite(qtyInt) && qtyInt > 0
  const busy = phase === 'awaiting' || phase === 'settling'
  const sideColor = side === 'Buy' ? '#2B3AF2' : '#FF3D9A'

  // Cancel any live poll / rAF / done-timer on unmount (no leaked clock).
  useEffect(
    () => () => {
      clearInterval(pollRef.current)
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
      clearTimeout(doneRef.current)
    },
    [],
  )

  // Poll the desk-visible firm quotes while awaiting. First quote arrival → the quotes list;
  // MAX_POLLS with none → the honest NO QUOTES YET empty state; an OFFLINE reject → offline.
  useEffect(() => {
    if (phase !== 'awaiting' || !rfqId) return
    pollsRef.current = 0
    const tick = async () => {
      pollsRef.current += 1
      try {
        const res = await getRfqQuotes(rfqId)
        if (res.quotes.length > 0) {
          clearInterval(pollRef.current)
          setQuotes(res.quotes)
          setPhase('quotes')
        } else if (pollsRef.current >= MAX_POLLS) {
          clearInterval(pollRef.current)
          setPhase('idle')
        }
      } catch (e) {
        clearInterval(pollRef.current)
        const { kind, message } = classifyRfqError(e)
        if (kind === 'offline') setPhase('offline')
        else {
          setReject(message)
          setPhase('idle')
        }
      }
    }
    pollRef.current = setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => clearInterval(pollRef.current)
  }, [phase, rfqId])

  // REQUEST QUOTE — post the RFQ on the desk's OWN identity (credential-free seam).
  async function onRequest() {
    if (busy || !qtyValid) return
    setReject('')
    setQuotes([])
    setAccepted(null)
    setPostedSide(side) // freeze the ranking side to what we post
    setPhase('awaiting')
    try {
      const res = await postRfq({ requester, side, quantity: qtyInt })
      setRfqId(res.rfqId)
      // The poll effect (keyed on phase==='awaiting' + rfqId) takes over from here.
    } catch (e) {
      const { kind, message } = classifyRfqError(e)
      if (kind === 'offline') setPhase('offline')
      else {
        setReject(message)
        setPhase('idle')
      }
    }
  }

  // ACCEPT BEST QUOTE — single confirm, NO dialog. Accepts the best quote by its ContractId
  // → the SAME atomic DvP settle (one rAF settleProgress clock; DvpLegs + AtomicStamp).
  async function onAcceptBest() {
    if (busy) return
    const bi = bestQuoteIndex(quotes, postedSide)
    if (bi < 0) return
    setReject('')
    setPhase('settling')
    try {
      const res = await acceptRfqQuote(rfqId, quotes[bi].contractId)
      setAccepted(res)
      // ONE rAF clock drives settleProgress 0→1 so the leg snaps together (simultaneity =
      // atomicity — never sequenced), mirroring SettlementView's shipped settle beat.
      const dur = reduced ? 0 : 800
      const start = performance.now()
      const step = (now: number) => {
        const t = dur ? Math.min(1, (now - start) / dur) : 1
        setSettleProgress(t)
        if (t < 1) rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
      doneRef.current = setTimeout(() => {
        setSettleProgress(1)
        setStampIn(true)
        setPhase('settled')
      }, dur + 60)
    } catch (e) {
      const { kind, message } = classifyRfqError(e)
      if (kind === 'offline') setPhase('offline')
      else {
        setReject(message)
        setPhase('quotes')
      }
    }
  }

  const bi = bestQuoteIndex(quotes, postedSide)
  const settling = phase === 'settling'
  const settled = phase === 'settled'
  const legs = accepted ? legsFromAccept(accepted, firm) : []

  return (
    <section style={{ marginTop: '64px' }}>
      {/* Header — the section label + the persistent honest (1×1-DvP) tag. */}
      <div className="flex items-center" style={{ gap: '11px' }}>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Request for Quote
        </span>
        <span style={{ flex: 1 }} />
        <span className="font-mono text-9 border uppercase" style={inkTag}>
          {HONEST_TAG}
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      {phase === 'offline' ? (
        <p
          className="font-mono text-13 uppercase"
          style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, maxWidth: '560px', marginTop: '22px' }}
        >
          {OFFLINE_CAPTION}
        </p>
      ) : settling || settled ? (
        // ── Settling / settled — REUSE the atomic-DvP visuals (no new grammar) ───────────
        <div style={{ position: 'relative', marginTop: '26px', maxWidth: '720px' }}>
          <DvpLegs legs={legs} settleProgress={settleProgress} instructionCount={2} cashSymbol={CASH_SYMBOL} />
          <AtomicStamp show={stampIn} />
          <div style={{ marginTop: '30px' }}>
            {settled ? (
              <div
                className="flex items-center font-mono text-13 font-semibold uppercase"
                // UI-REVIEW: a SUCCESSFUL settle stamp is INK, not brand red — red is
                // reserved for down/reject signals (the reject/error states stay red).
                style={{ gap: '8px', letterSpacing: '.1em', color: '#0A0A0A' }}
              >
                <span style={{ width: '8px', height: '8px', background: '#0A0A0A', display: 'inline-block' }} />
                SETTLED · ATOMIC — one DvP transaction
              </div>
            ) : (
              <div
                className="flex items-center font-mono text-13 uppercase"
                style={{ gap: '10px', letterSpacing: '.16em', opacity: 0.7 }}
              >
                <span
                  className={reduced ? '' : 'animate-umbra-pulse'}
                  style={{ display: 'inline-block', width: '8px', height: '8px', background: '#0A0A0A' }}
                />
                SETTLING…
              </div>
            )}
          </div>
          <p className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, maxWidth: '560px', marginTop: '18px' }}>
            The accepted quote settles as a 1×1 delivery-versus-payment on the SAME atomic Canton machinery as the
            batch — one transaction, all-or-nothing. Not a separate settlement engine.
          </p>
        </div>
      ) : phase === 'awaiting' ? (
        // ── Awaiting — reduced-motion-friendly pulse ─────────────────────────────────────
        <div className="flex items-center" style={{ gap: '11px', marginTop: '26px' }}>
          <span
            className={reduced ? '' : 'animate-umbra-pulse'}
            style={{ display: 'inline-block', width: '11px', height: '11px', background: '#0A0A0A' }}
          />
          <span className="font-mono text-13 uppercase" style={{ letterSpacing: '.16em', opacity: 0.7 }}>
            {AWAITING_QUOTES}
          </span>
        </div>
      ) : (
        // ── Compose (idle) — instrument / side / qty → REQUEST QUOTE, then the quote list ─
        <div style={{ marginTop: '26px', maxWidth: '560px' }}>
          {/* Instrument (fixed BONDX) + Side toggle (reuse the OrderTicket toggle grammar). */}
          <div className="flex items-baseline justify-between" style={{ marginBottom: '10px' }}>
            <span className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
              Instrument
            </span>
            <span className="font-mono text-13 font-semibold">{BOND_SYMBOL}</span>
          </div>

          <div className="flex" style={{ border: '1px solid #0A0A0A', margin: '0 0 24px' }}>
            {(['Buy', 'Sell'] as Side[]).map((s) => {
              const active = side === s
              const activeColor = s === 'Buy' ? '#2B3AF2' : '#FF3D9A'
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className="font-mono text-13 font-bold"
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    letterSpacing: '.08em',
                    background: active ? activeColor : 'transparent',
                    color: active ? '#fff' : 'rgba(10,10,10,.45)',
                    borderRight: s === 'Buy' ? '1px solid #0A0A0A' : 'none',
                  }}
                >
                  {s.toUpperCase()}
                </button>
              )
            })}
          </div>

          {/* Quantity — mono input (BONDX). */}
          <div style={{ marginBottom: '24px' }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
              <span className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
                Quantity
              </span>
              <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
                {BOND_SYMBOL}
              </span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="font-mono text-44 tabular-nums w-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red"
              style={{ fontWeight: 600, borderBottom: '2px solid #0A0A0A', padding: '2px 0 8px', color: sideColor }}
            />
          </div>

          {/* REQUEST QUOTE — ink-fill primary (matching the established primary button). */}
          <button
            type="button"
            onClick={() => void onRequest()}
            disabled={!qtyValid}
            className="font-mono text-13 font-bold bg-ink text-paper w-full disabled:opacity-40"
            style={{ padding: '15px 28px', letterSpacing: '.14em' }}
          >
            {REQUEST_QUOTE}
          </button>

          {/* Verbatim (non-offline) reject — the raw secret-free message on the ink surface. */}
          {reject && (
            <div style={{ marginTop: '18px' }}>
              <div className="flex items-center" style={{ gap: '6px', marginBottom: '8px' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#E2231A' }} />
                <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em', color: '#E2231A' }}>
                  QUOTE REQUEST REJECTED
                </span>
              </div>
              <div
                className="font-mono text-13 tabular-nums"
                style={{
                  background: '#0A0A0A',
                  color: '#F4F1EA',
                  padding: '22px 24px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {reject}
              </div>
            </div>
          )}

          {/* Quotes-in — firm signed quotes, best emphasized; else the NO QUOTES YET empty. */}
          {phase === 'quotes' && quotes.length > 0 ? (
            <div style={{ marginTop: '30px' }}>
              <div className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
                Firm Quotes
              </div>
              <div className="border-t" style={{ marginTop: '12px' }}>
                {quotes.map((q, i) => {
                  const isBest = i === bi
                  return (
                    <div
                      key={q.contractId}
                      className="flex items-center"
                      style={{
                        gap: '14px',
                        padding: '14px 0 14px 14px',
                        borderBottom: '1px solid rgba(10,10,10,.16)',
                        borderLeft: isBest ? '2px solid #0A0A0A' : '2px solid transparent',
                      }}
                    >
                      <span className="font-mono text-13 font-semibold" style={{ opacity: isBest ? 1 : 0.7 }}>
                        {q.dealer}
                      </span>
                      <span className="font-mono text-9 border uppercase" style={inkTag}>
                        {FIRM_SIGNED}
                      </span>
                      {isBest && (
                        <span className="font-mono text-9 border uppercase" style={{ ...inkTag, fontWeight: 700 }}>
                          {BEST_MARKER}
                        </span>
                      )}
                      <span style={{ flex: 1 }} />
                      <span className="font-mono text-15 font-semibold tabular-nums">{q.price.toFixed(2)}</span>
                      <span className="font-body text-9 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
                        {CASH_SYMBOL}/unit
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* ACCEPT BEST QUOTE — single confirm, no dialog → the atomic DvP settle. */}
              <button
                type="button"
                onClick={() => void onAcceptBest()}
                className="font-mono text-13 font-bold bg-ink text-paper w-full"
                style={{ padding: '15px 28px', letterSpacing: '.14em', marginTop: '22px' }}
              >
                {ACCEPT_BEST_QUOTE}
              </button>
            </div>
          ) : (
            !reject && (
              <div style={{ marginTop: '30px' }}>
                <p className="font-display text-22 font-bold" style={{ letterSpacing: '-.02em' }}>
                  {NO_QUOTES_HEADING}
                </p>
                <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, marginTop: '12px' }}>
                  {NO_QUOTES_BODY}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </section>
  )
}
