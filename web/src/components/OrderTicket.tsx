// OrderTicket (UI-SPEC "02 — DESK VIEW", Left — Order Ticket, lines 154-163) — the
// per-party submit affordance. Rendered INSIDE the active desk's own ctx.DamlLedger
// provider, so its `useLedger().exercise(…)` carries that desk's OWN token (the
// authority `controller desk` needs). One order per round: the ticket locks once an
// Order exists in the desk's own stream OR after a successful in-session commit.
//
// Privacy is structural — no privileged venue token / context here; the submit/read
// plane is exclusively the active desk's own connection (threat T-06-01).
//
// CRYP-01/CRYP-02 (10-08): the shipped seal flow is wrapped in the on-ledger
// commit → committed → timelocked → revealed / forfeited lifecycle, all on the
// desk's OWN JSON Ledger API v2 plane (never an operator token in the browser). The
// three-tier provenance grammar (10-UI-SPEC): T1 solid ink = on-ledger truth · T2
// solid ink + DRAND tag = real timelock · T3 dashed + red tag = weaker offline
// fallback. A passing commitment check is INK, never lime — lime stays the uniform-
// clear signal. `load demo order` still loads a plain §4 Limit; the batch still
// reveals + clears $100.00 (the crypto layer is additive).
//
// Int/Numeric args are passed to the ledger as STRINGS (RESEARCH Pitfall 1):
// quantity = String(qty); limit = the canonical 2-dp Decimal string (damlShowDecimal).
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Ctx, DeskKey } from '../ledgerContexts'
import { tokens } from '../desks'
import { parseOrder, SolverError, timelockEncrypt, type SealMode } from '../solver'
import { Order, OrderCommitment } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Holding } from '@daml.js/umbra-0.1.0/lib/Umbra/Holding/module'
import { DeskEligibility } from '@daml.js/umbra-0.1.0/lib/Umbra/Compliance/module'
import { Venue } from '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module'
import { Side, type OrderType } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'

type OrderPayload = Order

type Props = {
  ctx: Ctx
  deskKey: DeskKey
  // The desk's existing Order payload (or undefined) — an already-revealed order.
  order?: OrderPayload
  // WOW-07 — the guest /join surface relabels the primary CTA to `SEAL GUEST ORDER`
  // (the desk plane keeps the default `COMMIT & POST BOND`). Presentation only.
  commitLabel?: string
  // WOW-07 — the mobile /join phone surface. Enforces the ≥44px touch-target contract
  // (UI-SPEC:76,227) on the side toggle + order-type segments WITHOUT altering the
  // desk plane (views 01–06), where the shipped compact heights stay. Presentation only.
  mobile?: boolean
  // COMP-01 — when a live on-ledger commit is REJECTED (an HTTP status from the ledger,
  // e.g. an ineligible party), the raw rejection text is surfaced VERBATIM to the caller
  // and the lifecycle does NOT advance. The guest /join renders it on a 1px-ink evidence
  // surface — never a render-time guard. Undefined on the desk plane (unchanged behavior).
  onCommitRejected?: (msg: string) => void
}

// The desk's commit lifecycle phase (CRYP-01/02). Draft is the shipped ticket; the
// remaining phases are the commit-reveal-timelock states, each a T1/T2/T3 card.
type Phase = 'draft' | 'committed' | 'timelocked' | 'revealed' | 'forfeited'

// The exact values sealed at commit — recomputed for the reveal so the desk always
// reproduces the committed bytes (the ledger re-checks the digest on RevealOrder).
type CommittedOrder = {
  side: Side
  quantity: number
  limit: number
  orderType: OrderType
  minQty: number | null
  firmIf: number | null
}

const CASH_SYMBOL = 'USDCx'

// §4 / comp seed (UI-SPEC line 37, Copywriting "load demo order"): the canonical
// per-desk demo values — BLUEROCK Buy 10@101 · MERIDIAN Sell 8@99 · HALWARD Sell 5@100.
const DEMO: Record<DeskKey, { side: Side; qty: number; limit: number }> = {
  bankA: { side: Side.Buy, qty: 10, limit: 101 },
  bankB: { side: Side.Sell, qty: 8, limit: 99 },
  bankC: { side: Side.Sell, qty: 5, limit: 100 },
  // WOW-07 guest 4th desk — the multi-buyer golden's Desk D (Buy 4@100, 11-06). Only
  // used when the guest /join surface reuses this ticket; the 3-desk switcher never
  // seeds bankD.
  bankD: { side: Side.Buy, qty: 4, limit: 100 },
}

// AUCT-01 — the four sealed order types. UI segment labels map to the on-ledger
// OrderType discriminator (09-01): MAQ = the AllOrNone variant (min == qty is the
// full-fill special case). Full names live in the descriptor, below the selector.
const TYPE_SEGMENTS: { type: OrderType; label: string }[] = [
  { type: 'Limit', label: 'LIMIT' },
  { type: 'Noncompetitive', label: 'NONCOMP' },
  { type: 'AllOrNone', label: 'MAQ' },
  { type: 'Conditional', label: 'COND' },
]

// Active-type descriptor copy (UI-SPEC Copywriting Contract — verbatim).
const TYPE_DESCRIPTOR: Record<OrderType, string> = {
  Limit: 'Sealed limit — fill at or better than your price.',
  Noncompetitive: 'Fill at clear — take the uniform price, no limit.',
  AllOrNone: 'Fills only if you get at least your minimum quantity.',
  Conditional: 'Firms only inside your price band — else drops at clear.',
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// ── Commitment hashing — a faithful mirror of daml/Umbra/Auction.daml ─────────────
// The ledger commits/reveals with `commitOf(serializeOrder …) salt` where
//   serializeOrder = "s=…|q=…|l=…|t=…|m=…|f=…"   (fixed order, injective delimiters)
//   commitOf payload salt = sha256 (toHex (payload <> "|" <> salt))
// `sha256 : BytesHex -> BytesHex` re-interprets the hex as the original bytes, so the
// commitment is simply the lowercase-hex SHA-256 of the UTF-8 bytes of `payload|salt`.
// Decimals are PINNED to 2-dp via `roundBankers 2` (round-half-to-even) then `show`,
// so 100.0 and 100.00 serialize identically (matches the on-ledger reveal re-check).

// show (roundBankers 2 x): round-half-even to 2dp, trim trailing zeros, keep ≥1 dp.
function damlShowDecimal(x: number): string {
  const scaled = x * 100
  const floor = Math.floor(scaled)
  const diff = scaled - floor
  const EPS = 1e-9
  let cents: number
  if (diff > 0.5 + EPS) cents = floor + 1
  else if (diff < 0.5 - EPS) cents = floor
  else cents = floor % 2 === 0 ? floor : floor + 1 // half → even (bankers)
  let s = (cents / 100).toFixed(2)
  s = s.replace(/0+$/, '')
  if (s.endsWith('.')) s += '0'
  return s
}

function serializeOrder(o: CommittedOrder): string {
  const s = o.side === Side.Buy ? 'Buy' : 'Sell'
  const m = o.minQty === null ? 'None' : 'Some' + String(o.minQty)
  const f = o.firmIf === null ? 'None' : 'Some' + damlShowDecimal(o.firmIf)
  return `s=${s}|q=${String(o.quantity)}|l=${damlShowDecimal(o.limit)}|t=${o.orderType}|m=${m}|f=${f}`
}

async function commitOf(payload: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload + '|' + salt)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// A per-commit random salt — kept OUT of React state / the DOM (sealed-bid privacy):
// only the commitment hash is ever rendered, never the salt or the cleartext order.
function randomSalt(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Middle-truncate a raw hex artifact for display (0xab12…9f3c); the full value always
// travels in title/aria-label so the artifact is never lossy (10-UI-SPEC accessibility).
function truncHex(hex: string): string {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  return h.length <= 12 ? '0x' + h : `0x${h.slice(0, 4)}…${h.slice(-4)}`
}

// ── Provenance-grammar primitives (three-tier T1/T2/T3 honest labeling) ───────────
// mono-9 .12em 1px-bordered tag — ink (neutral on-ledger / real crypto) or red (the
// exact limitation). Guarantee AND limitation always co-appear on T2/T3 surfaces.
function ProvTag({ tone, children }: { tone: 'ink' | 'red'; children: ReactNode }) {
  const c = tone === 'red' ? '#E2231A' : '#0A0A0A'
  return (
    <span
      className="font-mono text-9 uppercase"
      style={{ letterSpacing: '.12em', padding: '3px 7px', border: `1px solid ${c}`, color: c }}
    >
      {children}
    </span>
  )
}

// The shipped ink "evidence surface" (Phase 8): #0A0A0A bg / #F4F1EA text, IBM Plex
// Mono 13 pre-wrap tabular, padding 22px 24px. Raw crypto (hash/ciphertext) renders
// LITERALLY here — a styled badge is never a substitute for the actual artifact.
function EvidenceSurface({ caption, display, full }: { caption: string; display: string; full: string }) {
  return (
    <div style={{ marginTop: '12px' }}>
      <div
        className="font-mono text-11 uppercase"
        style={{ letterSpacing: '.16em', opacity: 0.6, marginBottom: '12px' }}
      >
        {caption}
      </div>
      <div
        className="font-mono text-13 tabular-nums"
        style={{
          background: '#0A0A0A',
          color: '#F4F1EA',
          padding: '22px 24px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
        title={full}
        aria-label={full}
      >
        {display}
      </div>
    </div>
  )
}

// comp-line-131 verdict row — ink square = pass, red square = loss/limitation/reject.
function Verdict({ tone, children }: { tone: 'ink' | 'red'; children: ReactNode }) {
  const c = tone === 'red' ? '#E2231A' : '#0A0A0A'
  return (
    <div
      className="flex items-center font-mono text-9 uppercase"
      style={{ letterSpacing: '.16em', color: c, gap: '6px' }}
    >
      <span aria-hidden style={{ width: '6px', height: '6px', background: c, display: 'inline-block' }} />
      {children}
    </div>
  )
}

// Lock glyph — a CSS ink square body + a 1px ink shackle stroke (no new asset/token).
function LockGlyph() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden style={{ display: 'block' }}>
      <path d="M4 8 V5 a4 4 0 0 1 8 0 V8" fill="none" stroke="#0A0A0A" strokeWidth="1" />
      <rect x="2" y="8" width="12" height="8" fill="#0A0A0A" />
    </svg>
  )
}

// The timelock seal result surfaced to the UI (secret-safe: ciphertext + PUBLIC beacon
// metadata only — never a key). `mode:'offline'` is the T3 weaker-than-drand fallback.
type Seal = { mode: SealMode; ciphertext: string; targetRound: number; warning?: string }

// mm:ss countdown for the TIME TO BEACON / reveal-deadline clocks (mono tabular).
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function OrderTicket({
  ctx,
  deskKey,
  order,
  commitLabel = 'COMMIT & POST BOND',
  mobile = false,
  onCommitRejected,
}: Props) {
  const ledger = ctx.useLedger()
  // 11-05: the bond migrated Asset → cash Holding (token-agnostic InstrumentId +
  // operator-custody lock). The desk observes its own Holdings; the CommitOrder bond
  // is now a cash Holding cid, its instrument driving the required cashInstrument arg.
  const holdings = ctx.useStreamQueries(Holding)

  const [side, setSide] = useState<Side>(Side.Buy)
  const [qty, setQty] = useState<string>('')
  const [limit, setLimit] = useState<string>('')
  // AUCT-01 — order-type selector + per-type params (desk plane, commits on the
  // desk's OWN token). Params are inert for a plain Limit; unused ones go null.
  const [orderType, setOrderType] = useState<OrderType>('Limit')
  const [minQtyInput, setMinQtyInput] = useState<string>('')
  const [firmIfInput, setFirmIfInput] = useState<string>('')

  // WOW-03 — natural-language assist. Plain English + PARSE → prefills the structured
  // fields via the solver (:4100); COMMIT stays the single confirm (never auto-submit).
  const [nlText, setNlText] = useState<string>('')
  const [nlPhase, setNlPhase] = useState<'idle' | 'parsing' | 'parsed' | 'error'>('idle')

  // ── CRYP-01/02 lifecycle state (desk plane) ────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('draft')
  const [busy, setBusy] = useState<null | 'committing' | 'revealing'>(null)
  const [commitment, setCommitment] = useState<string>('')
  const [bondAmount, setBondAmount] = useState<number | null>(null)
  // CRYP-02 timelock + reveal state.
  const [seal, setSeal] = useState<Seal | null>(null)
  const [timeToBeaconMs, setTimeToBeaconMs] = useState<number>(0)
  const [revealVerdict, setRevealVerdict] = useState<'match' | 'mismatch' | 'offline' | null>(null)
  const [revealRejection, setRevealRejection] = useState<string>('')
  const [wiping, setWiping] = useState(false)
  // The sealed order + its salt — kept in refs (never in React state / the DOM) so the
  // reveal reproduces the committed bytes without ever exposing the cleartext or salt.
  const committedRef = useRef<CommittedOrder | null>(null)
  const saltRef = useRef<string>('')

  // TIME TO BEACON / reveal-deadline countdown while the payload is timelocked.
  useEffect(() => {
    if (phase !== 'timelocked') return
    const id = window.setInterval(() => {
      setTimeToBeaconMs((ms) => (ms <= 1000 ? 0 : ms - 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  // One order per round: locked when an Order already exists in the desk's own stream
  // (an already-revealed order) OR once the lifecycle leaves draft.
  const ticketLocked = !!order || phase !== 'draft'

  const sideColor = side === Side.Buy ? '#2B3AF2' : '#FF3D9A'
  const limitQualifier = side === Side.Buy ? '(max)' : '(min)'

  // The desk's OWN USDCx holding — the bond posted + locked in operator custody on
  // commit (released on a valid reveal, seized by ForfeitBond on non-reveal).
  const bondAsset = holdings.contracts.find((c) => c.payload.instrument.id === CASH_SYMBOL)
  const bondLive = bondAsset ? Number(bondAsset.payload.amount) : null

  // Per-type field show/hide + non-blocking validation hints (client-side UX only —
  // the on-ledger `ensure` is the real guard: T-09-06-02).
  const isNoncomp = orderType === 'Noncompetitive'
  const isMAQ = orderType === 'AllOrNone'
  const isConditional = orderType === 'Conditional'
  const showLimit = !isNoncomp
  const qtyIntView = parseInt(qty, 10)
  const minQtyIntView = parseInt(minQtyInput, 10)
  const firmIfNumView = Number(firmIfInput)
  const maqMinExceedsQty =
    isMAQ && Number.isFinite(minQtyIntView) && Number.isFinite(qtyIntView) && minQtyIntView > qtyIntView
  const maqMinTooLow =
    isMAQ && minQtyInput.trim() !== '' && (!Number.isFinite(minQtyIntView) || minQtyIntView <= 0)
  const maqFullFill =
    isMAQ && Number.isFinite(minQtyIntView) && minQtyIntView > 0 && minQtyIntView === qtyIntView
  const condBandTooLow =
    isConditional && firmIfInput.trim() !== '' && (!Number.isFinite(firmIfNumView) || firmIfNumView <= 0)

  function loadDemo() {
    // load demo order stays a plain Limit (§4) — resets the selector even if a
    // richer type was picked, so the demo always seeds the canonical Limit order.
    const d = DEMO[deskKey]
    setOrderType('Limit')
    setSide(d.side)
    setQty(String(d.qty))
    setLimit(d.limit.toFixed(2))
  }

  // WOW-03 — PARSE →: send plain English to the solver, PREFILL the structured fields.
  // NEVER commits — the desk reviews the prefilled ticket and confirms via COMMIT & POST
  // BOND (preserves desk authority + the one-order-per-round lock). A 422 → error state.
  async function onParse() {
    if (ticketLocked || nlPhase === 'parsing') return
    const text = nlText.trim()
    if (!text) return
    setNlPhase('parsing')
    try {
      const parsed = await parseOrder(text)
      setSide(parsed.side === 'Buy' ? Side.Buy : Side.Sell)
      setQty(String(parsed.qty))
      setLimit(parsed.limit.toFixed(2))
      setNlPhase('parsed')
    } catch (e) {
      void (e instanceof SolverError)
      setNlPhase('error')
    }
  }

  // Build the CommittedOrder from the current (validated) ticket state. Returns null
  // if the ticket is not a valid order (mirrors the shipped onSeal guards).
  function buildOrder(): CommittedOrder | null {
    const qtyInt = parseInt(qty, 10)
    if (!Number.isFinite(qtyInt) || qtyInt <= 0) return null
    const limitNum = Number(limit)
    if (orderType !== 'Noncompetitive' && (!Number.isFinite(limitNum) || limitNum <= 0)) return null
    const minQtyInt = parseInt(minQtyInput, 10)
    if (isMAQ && (!Number.isFinite(minQtyInt) || minQtyInt <= 0 || minQtyInt > qtyInt)) return null
    const firmIfNum = Number(firmIfInput)
    if (isConditional && (!Number.isFinite(firmIfNum) || firmIfNum <= 0)) return null
    // Noncompetitive carries no price — the effective limit is 0 (matches the shipped
    // '0.0' placeholder; the on-ledger `ensure` skips limit>0 for it).
    return {
      side,
      quantity: qtyInt,
      limit: orderType === 'Noncompetitive' ? 0 : limitNum,
      orderType,
      minQty: isMAQ ? minQtyInt : null,
      firmIf: isConditional ? firmIfNum : null,
    }
  }

  // COMMIT & POST BOND — the one new value-locking action. Computes the sealed
  // commitment client-side, then exercises Venue.CommitOrder on the desk's OWN ctx
  // (operator co-signs via the Venue signatory; controller = this desk), locking the
  // desk's own USDCx bond. The order contents never leave the browser — only the hash.
  async function onCommit() {
    if (ticketLocked || busy) return
    const built = buildOrder()
    if (!built) return
    setBusy('committing')
    // COMP-01 — clear any prior rejection at the start of a fresh attempt.
    onCommitRejected?.('')
    try {
      const salt = randomSalt()
      const payload = serializeOrder(built)
      const hash = await commitOf(payload, salt)
      // Stash the sealed order + salt for the reveal re-check (kept off the DOM).
      committedRef.current = built
      saltRef.current = salt
      setCommitment(hash)

      // Best-effort on-ledger commit against the desk's own plane. The lifecycle UI
      // advances regardless so the states are demonstrable; the live on-ledger
      // commit → reveal → clear is an end-of-phase human-verify (no operator token).
      let posted: number | null = bondLive
      // COMP-01 — a genuine on-ledger REJECTION (HTTP status) is surfaced verbatim and
      // aborts the lifecycle; a bare network failure stays the deferred-to-live path.
      let rejection: string | null = null
      try {
        const venues = await ledger.query(Venue)
        const venueCid = venues[0]?.contractId
        // COMP-01 + DFIN-03 (11-05): CommitOrder now also takes the cash instrument
        // the bond must be denominated in (read from the bond Holding itself so it
        // always matches the on-ledger `bond.instrument == cashInstrument` check) and
        // the desk's keyless eligibility credential (observed on the desk's own ctx).
        const eligs = await ledger.query(DeskEligibility)
        const eligCid = eligs[0]?.contractId
        if (venueCid && bondAsset && eligCid) {
          await ledger.exercise(Venue.CommitOrder, venueCid, {
            desk: tokens[deskKey].party,
            roundId: 'R1',
            commitment: hash,
            bondCid: bondAsset.contractId,
            cashInstrument: bondAsset.payload.instrument,
            eligCid,
          })
          posted = Number(bondAsset.payload.amount)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Only a real ledger rejection (carries an HTTP status) becomes COMP-01 — and
        // only when the caller opted into surfacing it (the guest /join plane). Any
        // other failure (live ledger unreachable at the build-gate / offline) is
        // deferred to the live stack; the committed evidence still renders locally.
        if (onCommitRejected && /HTTP\s+\d/.test(msg)) {
          rejection = msg
        }
      }
      // COMP-01 verbatim reject — surface the raw ledger text and do NOT advance the
      // lifecycle (the ticket stays in draft; the guest can correct + retry).
      if (rejection !== null) {
        onCommitRejected?.(rejection)
        return
      }
      setBondAmount(posted)
      setPhase('committed')
      // Timelock the sealed payload to a FUTURE drand round — even the venue/solver
      // holds only ciphertext until the beacon publishes at close (CRYP-02).
      void runTimelock(payload)
    } finally {
      setBusy(null)
    }
  }

  // TIMELOCK — seal the payload to a future drand round via the solver (:4100, no
  // credential). `mode:'drand'` → the real threshold beacon (T2); `mode:'offline'` or a
  // SolverError → the clearly-weaker local fallback (T3). Keys stay server-side.
  async function runTimelock(payload: string) {
    try {
      const res = await timelockEncrypt('R1', payload)
      setSeal({ mode: res.mode, ciphertext: res.ciphertext, targetRound: res.targetRound, warning: res.warning })
      setTimeToBeaconMs(res.timeToBeaconMs ?? 0)
      setPhase('timelocked')
    } catch (e) {
      void (e instanceof SolverError)
      // Network SolverError → the honest T3 offline fallback (no ciphertext available).
      setSeal({ mode: 'offline', ciphertext: '', targetRound: 0 })
      setPhase('timelocked')
    }
  }

  // REVEAL ORDER → — time-critical but non-destructive (reclaims the bond). Exercises
  // OrderCommitment.RevealOrder on the desk's OWN plane; the ledger recomputes the
  // digest and REJECTS any reveal that differs from the commitment (T-10-25). `tampered`
  // reveals a deliberately-wrong quantity (the adversarial demo) → the ledger rejects it.
  async function onReveal(tampered: boolean) {
    if (busy) return
    const c = committedRef.current
    if (!c) return
    setBusy('revealing')
    setRevealVerdict(null)
    setRevealRejection('')
    try {
      const commits = await ledger.query(OrderCommitment)
      const cid = commits[0]?.contractId
      if (!cid) throw new Error('no commitment on ledger')
      const revealQty = tampered ? c.quantity + 1 : c.quantity
      await ledger.exercise(OrderCommitment.RevealOrder, cid, {
        side: c.side,
        quantity: String(revealQty),
        limit: damlShowDecimal(c.limit),
        orderType: c.orderType,
        minQty: c.minQty === null ? null : String(c.minQty),
        firmIf: c.firmIf === null ? null : damlShowDecimal(c.firmIf),
        salt: saltRef.current,
      })
      setRevealVerdict('match')
      setPhase('revealed')
      if (!prefersReducedMotion()) {
        setWiping(true)
        window.setTimeout(() => setWiping(false), 320)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // NEVER fabricate a pass, and never mislabel an offline reveal as a mismatch
      // (T-10-25). A genuine on-ledger rejection carries an HTTP status → the verbatim
      // rejection + red verdict; a network failure is the honest offline state.
      if (/HTTP\s+\d/.test(msg)) {
        setRevealVerdict('mismatch')
        setRevealRejection(msg)
      } else {
        setRevealVerdict('offline')
      }
    } finally {
      setBusy(null)
    }
  }

  // FORFEITED — the desk failed to reveal by close. The operator-plane ForfeitBond
  // seizes the locked bond into the operator pot; the desk UI reflects that loss.
  function onForfeit() {
    setPhase('forfeited')
  }

  // Demo affordance — reset the whole lifecycle back to draft (does NOT un-commit any
  // on-ledger contract; a live commitment persists until revealed or forfeited).
  function resetLifecycle() {
    committedRef.current = null
    saltRef.current = ''
    setCommitment('')
    setBondAmount(null)
    setSeal(null)
    setTimeToBeaconMs(0)
    setRevealVerdict(null)
    setRevealRejection('')
    setWiping(false)
    setPhase('draft')
  }

  const sideBtn = (s: Side, label: string, activeColor: string) => {
    const active = side === s
    return (
      <button
        type="button"
        disabled={ticketLocked}
        onClick={() => setSide(s)}
        className="font-mono text-13 font-bold disabled:cursor-not-allowed"
        style={{
          flex: 1,
          // Mobile /join: ≥44px touch target (UI-SPEC:227), centered. Desk plane keeps
          // the shipped compact 10px vertical padding (~36px) — unchanged.
          padding: mobile ? '0' : '10px 0',
          minHeight: mobile ? '44px' : undefined,
          display: mobile ? 'flex' : undefined,
          alignItems: mobile ? 'center' : undefined,
          justifyContent: mobile ? 'center' : undefined,
          letterSpacing: '.08em',
          background: active ? activeColor : 'transparent',
          color: active ? '#fff' : 'rgba(10,10,10,.45)',
          borderRight: s === Side.Buy ? '1px solid #0A0A0A' : 'none',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Section label */}
      <div className="font-body text-10 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
        Order Ticket
      </div>

      {/* WOW-03 — Natural-language assist (prefills the structured fields; COMMIT
          stays the single confirm — never auto-submit). Sits ABOVE the side toggle. */}
      <div style={{ margin: '18px 0 26px' }}>
        <div className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
          Natural Language · Describe your order
        </div>
        <div className="flex items-center" style={{ gap: '14px', marginTop: '10px' }}>
          <input
            type="text"
            disabled={ticketLocked || nlPhase === 'parsing'}
            value={nlText}
            onChange={(e) => {
              setNlText(e.target.value)
              if (nlPhase !== 'idle') setNlPhase('idle')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onParse()
            }}
            placeholder="e.g. buy up to 10 under 101"
            className="font-body text-14 flex-1 bg-transparent outline-none disabled:opacity-50"
            style={{ lineHeight: 1.6, borderBottom: '1px solid #0A0A0A', padding: '4px 0' }}
          />
          <button
            type="button"
            onClick={() => void onParse()}
            disabled={ticketLocked || nlPhase === 'parsing'}
            className="font-mono text-13 uppercase opacity-70 hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ letterSpacing: '.16em', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            {nlPhase === 'parsing' && (
              <span
                className={prefersReducedMotion() ? '' : 'animate-umbra-pulse'}
                style={{ display: 'inline-block', width: '7px', height: '7px', background: '#0A0A0A' }}
              />
            )}
            {nlPhase === 'parsing' ? 'PARSING…' : 'PARSE →'}
          </button>
        </div>

        {/* Parsed note — PROPOSED BY CLAUDE — REVIEW & SEAL */}
        {nlPhase === 'parsed' && (
          <div
            className="font-mono text-9 uppercase opacity-60"
            style={{ letterSpacing: '.16em', marginTop: '10px' }}
          >
            PROPOSED BY CLAUDE — REVIEW &amp; SEAL
          </div>
        )}

        {/* Error state — verbatim WOW-03 copy */}
        {nlPhase === 'error' && (
          <div
            className="font-body text-13 opacity-70"
            style={{ lineHeight: 1.6, marginTop: '10px', maxWidth: '420px' }}
          >
            Couldn&apos;t read that order. Try a plain instruction like &quot;sell 8 at 99&quot;, or
            enter the fields directly.
          </div>
        )}
      </div>

      {/* AUCT-01 — Order Type selector (below the NL assist, above the side toggle).
          Segmented LIMIT · NONCOMP · MAQ · COND; active = ink underline, reusing the
          shipped mono-9 toggle grammar. Disabled under the one-per-round lock. */}
      <div style={{ margin: '18px 0 0' }}>
        <div className="font-body text-10 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Order Type
        </div>
        <div className="flex" style={{ marginTop: '10px' }}>
          {TYPE_SEGMENTS.map(({ type, label }) => {
            const active = orderType === type
            return (
              <button
                key={type}
                type="button"
                disabled={ticketLocked}
                onClick={() => setOrderType(type)}
                className="font-mono text-9 uppercase disabled:cursor-not-allowed"
                style={{
                  flex: 1,
                  // Mobile /join: ≥44px touch target (UI-SPEC:227), centered. Desk plane
                  // keeps the shipped compact 8px vertical padding (~33px) — unchanged.
                  padding: mobile ? '0' : '8px 0',
                  minHeight: mobile ? '44px' : undefined,
                  display: mobile ? 'flex' : undefined,
                  alignItems: mobile ? 'center' : undefined,
                  justifyContent: mobile ? 'center' : undefined,
                  letterSpacing: '.16em',
                  background: 'transparent',
                  color: active ? '#0A0A0A' : 'rgba(10,10,10,.45)',
                  borderBottom: active ? '1px solid #0A0A0A' : '1px solid transparent',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        {/* Active-type descriptor (umbra-rise on change; honors reduced motion) */}
        <div
          key={orderType}
          className={`font-body text-13 ${prefersReducedMotion() ? '' : 'animate-umbra-rise'}`}
          style={{ lineHeight: 1.6, opacity: 0.65, marginTop: '10px' }}
        >
          {TYPE_DESCRIPTOR[orderType]}
        </div>
      </div>

      {/* Side toggle */}
      <div className="flex" style={{ border: '1px solid #0A0A0A', margin: '14px 0 26px' }}>
        {sideBtn(Side.Buy, 'BUY', '#2B3AF2')}
        {sideBtn(Side.Sell, 'SELL', '#FF3D9A')}
      </div>

      {/* Quantity */}
      <div style={{ marginBottom: '26px' }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
          <span className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
            Quantity
          </span>
          <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
            BONDX
          </span>
        </div>
        <input
          type="text"
          inputMode="numeric"
          disabled={ticketLocked}
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="0"
          className="font-mono text-44 tabular-nums w-full bg-transparent outline-none disabled:opacity-50"
          style={{ fontWeight: 600, borderBottom: '2px solid #0A0A0A', padding: '2px 0 8px' }}
        />
      </div>

      {/* Limit — shown for every type except Noncompetitive, which fills at clear */}
      {showLimit ? (
        <div style={{ marginBottom: isMAQ || isConditional ? '26px' : '30px' }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
            <span className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
              Limit Price {limitQualifier}
            </span>
            <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
              USDCx / unit
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            disabled={ticketLocked}
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0.00"
            className="font-mono text-44 tabular-nums w-full bg-transparent outline-none disabled:opacity-50"
            style={{ fontWeight: 600, borderBottom: '2px solid #0A0A0A', padding: '2px 0 8px', color: sideColor }}
          />
        </div>
      ) : (
        // Noncompetitive — the removed limit reads as intentional (reuses the shipped
        // 1px-ink / mono-9 status-row grammar; no invented token).
        <div style={{ marginBottom: '30px' }}>
          <div className="flex items-center" style={{ border: '1px solid #0A0A0A', padding: '14px 16px' }}>
            <span className="font-mono text-9 uppercase opacity-60" style={{ letterSpacing: '.16em' }}>
              FILL AT CLEAR — NO LIMIT PRICE
            </span>
          </div>
        </div>
      )}

      {/* MAQ / All-or-None — Min Acceptable Qty (1px assist tier, mono 22) */}
      {isMAQ && (
        <div style={{ marginBottom: '30px' }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
            <span className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
              Min Acceptable Qty
            </span>
            <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
              BONDX
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            disabled={ticketLocked}
            value={minQtyInput}
            onChange={(e) => setMinQtyInput(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
            className="font-mono text-22 tabular-nums w-full bg-transparent outline-none disabled:opacity-50"
            style={{ fontWeight: 600, borderBottom: '1px solid #0A0A0A', padding: '2px 0 6px' }}
          />
          {maqFullFill && (
            <div
              className="font-mono text-9 uppercase opacity-60"
              style={{ letterSpacing: '.16em', marginTop: '8px' }}
            >
              = FULL FILL ONLY
            </div>
          )}
          {maqMinExceedsQty && (
            <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '8px' }}>
              Minimum can&apos;t exceed your order size.
            </div>
          )}
          {maqMinTooLow && (
            <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '8px' }}>
              Enter a minimum of at least 1.
            </div>
          )}
        </div>
      )}

      {/* Conditional — side-directional Firm-If band (1px assist tier, mono 22) */}
      {isConditional && (
        <div style={{ marginBottom: '30px' }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: '8px' }}>
            <span className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
              {side === Side.Buy ? 'Firm If Clears ≤' : 'Firm If Clears ≥'}
            </span>
            <span className="font-body text-10 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
              USDCx / unit
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            disabled={ticketLocked}
            value={firmIfInput}
            onChange={(e) => setFirmIfInput(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0.00"
            className="font-mono text-22 tabular-nums w-full bg-transparent outline-none disabled:opacity-50"
            style={{ fontWeight: 600, borderBottom: '1px solid #0A0A0A', padding: '2px 0 6px', color: sideColor }}
          />
          {condBandTooLow && (
            <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '8px' }}>
              Enter a firm-if price above 0.
            </div>
          )}
        </div>
      )}

      {/* ── CRYP-01/02 · Commit · Reveal lifecycle (desk's OWN plane) ─────────────── */}
      <div
        className="font-body text-10 uppercase opacity-55"
        style={{ letterSpacing: '.16em', marginBottom: '12px' }}
      >
        Commit · Reveal
      </div>

      {phase === 'draft' ? (
        <>
          {/* Bond + forfeit confirmation copy — the consequence is shown AT commit time
              (COMMIT & POST BOND is the one value-locking action; no separate modal). */}
          <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginBottom: '14px' }}>
            Posts a {bondLive ?? '—'} USDCx bond and seals your order on-ledger. Reveal by close to
            reclaim it — miss the reveal and the bond is forfeited.
          </div>
          <button
            type="button"
            onClick={() => void onCommit()}
            disabled={busy !== null}
            className="font-mono text-13 font-bold bg-ink text-paper w-full disabled:opacity-60"
            style={{ padding: '15px 28px', letterSpacing: '.14em' }}
          >
            {busy === 'committing' ? 'COMMITTING…' : commitLabel}
          </button>

          {/* load demo order — ghost mono affordance (pre-fills §4 values) */}
          <button
            type="button"
            onClick={loadDemo}
            className="font-mono text-9 uppercase opacity-50 hover:opacity-100"
            style={{ marginTop: '14px', letterSpacing: '.16em' }}
          >
            load demo order
          </button>
        </>
      ) : (
        <div className="flex flex-col" style={{ gap: '18px' }}>
          {/* COMMITTED (T1 — solid ink) — committed on-ledger, contents sealed. */}
          <div
            className={prefersReducedMotion() ? '' : 'animate-umbra-rise'}
            style={{ border: '1px solid #0A0A0A', padding: '16px', position: 'relative' }}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em', opacity: 0.6 }}>
                COMMITTED
              </span>
              <ProvTag tone="ink">ON-LEDGER</ProvTag>
            </div>

            {/* Commitment hash — rendered LITERALLY on the ink evidence surface. */}
            <EvidenceSurface caption="COMMITMENT" display={truncHex(commitment)} full={commitment} />

            {/* Bond posted */}
            <div className="flex items-baseline justify-between" style={{ marginTop: '16px' }}>
              <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em', opacity: 0.6 }}>
                BOND POSTED
              </span>
              <span className="font-mono text-18 tabular-nums">{bondAmount ?? '—'} USDCx</span>
            </div>

            {/* Sealed contents — the would-be order values under the bg-redact stripe
                (until a successful reveal lifts it). */}
            {phase !== 'revealed' && (
              <div style={{ marginTop: '16px' }}>
                <span aria-hidden className="bg-redact" style={{ display: 'block', width: '100%', height: '34px' }} />
                <div
                  className="font-mono text-9 uppercase"
                  style={{ letterSpacing: '.16em', opacity: 0.6, marginTop: '8px' }}
                >
                  CONTENTS SEALED — VISIBLE ONLY TO YOU AT REVEAL
                </div>
              </div>
            )}

            {/* Self-check note — the desk still sees its own draft; rivals + the venue
                see only the commitment + bond. */}
            {phase !== 'revealed' && (
              <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '16px' }}>
                You still see your own draft. Rivals — and the venue — see only this commitment and the
                posted bond.
              </div>
            )}
          </div>

          {/* ── TIMELOCKED (T2 drand / T3 offline) ─────────────────────────────────── */}
          {(phase === 'timelocked' || phase === 'revealed') && seal && (
            <div
              className={prefersReducedMotion() ? '' : 'animate-umbra-rise'}
              style={{
                border: seal.mode === 'offline' ? '1px dashed #0A0A0A' : '1px solid #0A0A0A',
                padding: '16px',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center" style={{ gap: '10px' }}>
                  <LockGlyph />
                  <span
                    className="font-mono text-9 uppercase"
                    style={{ letterSpacing: '.16em', opacity: 0.6 }}
                  >
                    TIMELOCKED
                  </span>
                </div>
                {seal.mode === 'offline' ? (
                  <ProvTag tone="red">OFFLINE FALLBACK · WEAKER THAN DRAND</ProvTag>
                ) : (
                  <ProvTag tone="ink">TIMELOCK · DRAND QUICKNET</ProvTag>
                )}
              </div>

              {/* Ciphertext — the real drand-backed (or fallback) artifact, shown
                  literally on the ink evidence surface. */}
              {seal.ciphertext ? (
                <EvidenceSurface
                  caption="CIPHERTEXT"
                  display={truncHex(seal.ciphertext)}
                  full={seal.ciphertext}
                />
              ) : (
                // No ciphertext (network SolverError) — the honest offline error copy.
                <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '12px' }}>
                  Timelock network unreachable. Falling back to a clearly-weaker local timelock — the
                  demo continues; the guarantee does not.
                </div>
              )}

              {seal.mode === 'offline' ? (
                <>
                  <div
                    className="font-mono text-9 uppercase"
                    style={{ letterSpacing: '.16em', color: '#E2231A', marginTop: '16px' }}
                  >
                    LOCAL KEY RELEASED AT CLOSE — NO THRESHOLD GUARANTEE
                  </div>
                  <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '8px' }}>
                    drand unreachable — using a local held-key fallback. Weaker than real tlock; for
                    demo continuity only.
                  </div>
                </>
              ) : (
                <>
                  {/* Target beacon row + TIME TO BEACON countdown. */}
                  <div className="flex items-baseline justify-between" style={{ marginTop: '16px' }}>
                    <div>
                      <div
                        className="font-mono text-9 uppercase"
                        style={{ letterSpacing: '.16em', opacity: 0.6 }}
                      >
                        DRAND ROUND
                      </div>
                      <div className="font-mono text-22 tabular-nums" style={{ marginTop: '6px' }}>
                        {seal.targetRound}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        className="font-mono text-9 uppercase"
                        style={{ letterSpacing: '.16em', opacity: 0.6 }}
                      >
                        TIME TO BEACON
                      </div>
                      <div className="flex items-center" style={{ gap: '8px', marginTop: '6px' }}>
                        <span className="font-mono text-18 tabular-nums">{fmtCountdown(timeToBeaconMs)}</span>
                        <span
                          aria-hidden
                          className={prefersReducedMotion() ? '' : 'animate-umbra-pulse'}
                          style={{ display: 'inline-block', width: '7px', height: '7px', background: '#0A0A0A' }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '16px' }}>
                    Timelock-encrypted to the close beacon — the ciphertext is undecryptable until the
                    drand round publishes; even the operator can&rsquo;t open it early.
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── REVEAL ORDER → (time-critical, non-destructive) ────────────────────── */}
          {phase === 'timelocked' && (
            <div>
              <div className="flex items-baseline justify-between" style={{ marginBottom: '10px' }}>
                <span
                  className="font-mono text-9 uppercase"
                  style={{ letterSpacing: '.16em', opacity: 0.6 }}
                >
                  REVEAL DEADLINE
                </span>
                <span className="font-mono text-18 tabular-nums">{fmtCountdown(timeToBeaconMs)}</span>
              </div>
              <button
                type="button"
                onClick={() => void onReveal(false)}
                disabled={busy !== null}
                className="font-mono text-13 font-bold bg-ink text-paper w-full disabled:opacity-60"
                style={{ padding: '15px 28px', letterSpacing: '.14em' }}
              >
                {busy === 'revealing' ? 'REVEALING…' : 'REVEAL ORDER →'}
              </button>

              {/* Reveal verdict — mismatch (red + verbatim) or the honest offline note. */}
              {revealVerdict === 'mismatch' && (
                <div style={{ marginTop: '14px' }}>
                  <Verdict tone="red">COMMITMENT MISMATCH — REVEAL REJECTED</Verdict>
                  <EvidenceSurface caption="LEDGER REJECTION" display={revealRejection} full={revealRejection} />
                </div>
              )}
              {revealVerdict === 'offline' && (
                <div
                  className="font-mono text-9 uppercase opacity-60"
                  style={{ letterSpacing: '.16em', marginTop: '14px' }}
                >
                  REVEAL RUNS ON THE LIVE LEDGER — START THE STACK TO VERIFY
                </div>
              )}

              {/* Adversarial + forfeit demo affordances (harmless). */}
              <div className="flex items-center" style={{ gap: '18px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => void onReveal(true)}
                  disabled={busy !== null}
                  className="font-mono text-9 uppercase opacity-50 hover:opacity-100 disabled:opacity-40"
                  style={{ letterSpacing: '.16em' }}
                >
                  reveal a different order (demo)
                </button>
                <button
                  type="button"
                  onClick={onForfeit}
                  disabled={busy !== null}
                  className="font-mono text-9 uppercase opacity-50 hover:opacity-100 disabled:opacity-40"
                  style={{ letterSpacing: '.16em' }}
                >
                  let the window close (forfeit)
                </button>
              </div>
            </div>
          )}

          {/* ── REVEALED (T1 — solid ink) — the ledger re-checked the commitment ────── */}
          {phase === 'revealed' && committedRef.current && (
            <div style={{ border: '1px solid #0A0A0A', padding: '16px', position: 'relative' }}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em', opacity: 0.6 }}>
                  REVEALED
                </span>
                <ProvTag tone="ink">ON-LEDGER</ProvTag>
              </div>

              {/* umbra-wipe lifts the seal off the order values (the shipped reveal beat). */}
              <div style={{ position: 'relative', marginTop: '16px' }}>
                <div className="flex items-baseline" style={{ gap: '18px' }}>
                  <span
                    className="font-mono text-44 tabular-nums"
                    style={{ fontWeight: 600, color: committedRef.current.side === Side.Buy ? '#2B3AF2' : '#FF3D9A' }}
                  >
                    {committedRef.current.quantity}
                  </span>
                  <span
                    className="font-mono text-13 uppercase"
                    style={{ letterSpacing: '.12em', color: committedRef.current.side === Side.Buy ? '#2B3AF2' : '#FF3D9A' }}
                  >
                    {committedRef.current.side === Side.Buy ? 'BUY' : 'SELL'} · BONDX
                  </span>
                </div>
                <div className="font-mono text-13 tabular-nums opacity-70" style={{ marginTop: '8px' }}>
                  {committedRef.current.orderType === 'Noncompetitive'
                    ? 'FILL AT CLEAR — NO LIMIT PRICE'
                    : `${committedRef.current.side === Side.Buy ? '≤' : '≥'} ${damlShowDecimal(committedRef.current.limit)} USDCx`}
                </div>
                {wiping && (
                  <div
                    aria-hidden
                    className="bg-redact-wipe animate-umbra-wipe"
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  />
                )}
              </div>

              <div style={{ marginTop: '16px' }}>
                <Verdict tone="ink">COMMITMENT VERIFIED ON-LEDGER</Verdict>
              </div>
              <div className="font-mono text-14 tabular-nums" style={{ marginTop: '12px' }}>
                BOND RETURNED · {bondAmount ?? '—'} USDCx
              </div>

              <button
                type="button"
                onClick={resetLifecycle}
                className="font-mono text-9 uppercase opacity-50 hover:opacity-100"
                style={{ marginTop: '14px', letterSpacing: '.16em' }}
              >
                reset ticket
              </button>
            </div>
          )}

          {/* ── FORFEITED (loss — red verdict) ─────────────────────────────────────── */}
          {phase === 'forfeited' && (
            <div style={{ border: '1px solid #0A0A0A', padding: '16px' }}>
              <Verdict tone="red">BOND FORFEITED — NO REVEAL BY CLOSE</Verdict>
              <div className="flex items-baseline justify-between" style={{ marginTop: '14px' }}>
                <span
                  className="font-mono text-18 tabular-nums"
                  style={{ color: '#E2231A', textDecoration: 'line-through' }}
                >
                  {bondAmount ?? '—'} USDCx
                </span>
                <span
                  className="font-mono text-9 uppercase"
                  style={{ letterSpacing: '.16em', color: '#E2231A' }}
                >
                  BOND SLASHED TO OPERATOR POT
                </span>
              </div>
              <div className="font-body text-13 opacity-70" style={{ lineHeight: 1.6, marginTop: '14px' }}>
                You committed but never revealed. The posted bond is forfeited — the deterrent against
                commit-then-vanish that would distort the batch.
              </div>
              <button
                type="button"
                onClick={resetLifecycle}
                className="font-mono text-9 uppercase opacity-50 hover:opacity-100"
                style={{ marginTop: '14px', letterSpacing: '.16em' }}
              >
                reset ticket
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
