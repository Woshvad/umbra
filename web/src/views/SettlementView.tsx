// Settlement (view 05) — UI-SPEC "05 — SETTLEMENT" (lines 214-232). Operator plane
// (:4100) for the AGGREGATE via web/src/solver.ts; NO operator token, NO @daml/react
// context (the solver service is the sole Operator-authority proxy — threat T-06-01).
//
// THE SECOND WOW BEAT (RESEARCH Pattern 7, non-negotiable feel): on SETTLE ATOMICALLY
// we POST /round/:id/settle then drive a SINGLE requestAnimationFrame `settleProgress`
// 0→1 over ~800ms. ALL DvP leg tracks draw on AND ALL balance numerals lerp before→after
// from this ONE clock — guaranteeing simultaneity (atomic = simultaneous; legs are NEVER
// sequenced). Reduced-motion → dur=0 → instant. The rAF is cancelled on unmount.
//
// The aggregate legs + before/after balances are derived from preview.allocations via
// lib/balance.deskBalancesFromAllocations — reading the auction.ts-verified Allocation
// fields {desk, side, filledQty}. At settleProgress=1 the balances are the §4 finals
// BLUEROCK 10/4000 · MERIDIAN 12/1800 · HALWARD 13/1200. A :4100 reject → SolverError
// 'OFFLINE' → graceful caption; Privacy still renders.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OperatorViewState, ClearingApprovalDecision } from '../operatorState'
import type { SolvePreviewResponse, SettlementProvenance } from '../solver'
import { settle, getRound, SolverError, OFFLINE_CAPTION } from '../solver'
import { codeForParty, deskKeyForParty, GUEST } from '../desks'
import { deskBalancesFromAllocations, type DeskBalances, type DeskBalance } from '../lib/balance'
import { estimateLeakage, type LeakageLeg } from '../lib/leakage'
import DvpLegs, { type DvpLeg } from '../components/DvpLegs'
import BalanceTable, { type BalanceRow } from '../components/BalanceTable'
import AtomicStamp from '../components/AtomicStamp'
import RoundBrief from '../components/RoundBrief'
import ProofPackButton from '../components/ProofPackButton'
import TcaReceipts from '../components/TcaReceipts'
import ProofOfClearingPanel from '../components/ProofOfClearingPanel'

type Props = OperatorViewState

// §4 BEFORE balances (matches web/src/lib/balance.test.ts) — chosen so the §4 deltas
// land exactly on the binding finals A:10/4000 · B:12/1800 · C:13/1200.
const BEFORE: DeskBalances = {
  BLUEROCK: { bondx: 0, usdcx: 5000 },
  MERIDIAN: { bondx: 20, usdcx: 1000 },
  HALWARD: { bondx: 15, usdcx: 1000 },
}
// Stable desk display order for the balance table.
const DESK_ORDER = ['BLUEROCK', 'MERIDIAN', 'HALWARD']
// GUEST (Desk D) BEFORE holdings — only used when a guest has actually joined and been
// allocated a fill (WOW-07). §4 stays 3-desk (no guest) so this never perturbs the canary.
const GUEST_BEFORE: DeskBalance = { bondx: 0, usdcx: 5000 }

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Resolve a live party id to its comp CODE, INCLUDING the guest 4th desk (bankD → GUEST).
// `codeForParty` (desks.ts) only knows the three primary desks; the guest is a separate
// export, so map it here so a guest allocation surfaces as a `GUEST` leg/row when present.
function codeOf(party: string): string {
  return deskKeyForParty(party) === GUEST.key ? GUEST.code : codeForParty(party)
}

// Map an allocation list onto display-code desks (BLUEROCK/MERIDIAN/HALWARD, + GUEST when a
// guest has joined) so the BEFORE balances + leg labels line up — the solver keys
// allocations by the live party id.
function codeAllocations(preview: SolvePreviewResponse) {
  return preview.allocations.map((a) => ({ ...a, desk: codeOf(a.desk) }))
}

// NETTED legs (default mode) — collapse the gross legs into one leg per COUNTERPARTY PAIR
// (bilateral seller→buyer netting). This is a display projection, NOT the on-ledger per-party
// CCP netting (`netLegs` in Settlement.daml, which emits one net leg per (party, instrument)
// through a custodian): for a multi-buyer batch a party can still appear in several pair-legs
// here. Totals are the sum of the gross qty + cash, so the balance table stays CONSERVED across
// the toggle. On the §4 single-buyer fixture each seller already has exactly one leg → netted
// === gross (canary safe).
function toNettedLegs(gross: DvpLeg[]): DvpLeg[] {
  const byPair = new Map<string, DvpLeg>()
  for (const leg of gross) {
    const key = `${leg.seller}→${leg.buyer}`
    const cur = byPair.get(key)
    if (cur) {
      cur.qty += leg.qty
      cur.cash += leg.cash
    } else {
      byPair.set(key, { ...leg })
    }
  }
  return [...byPair.values()]
}

// Derive the GROSS DvP legs from the verified allocation — mirroring the on-ledger
// `buildGrossInstructions` (daml/Umbra/Settlement.daml) EXACTLY so the visualization can never
// contradict the settled batch. We expand each side into per-unit party slots ordered by the
// raw party id (the same `sortOn (show desk)` the Daml builder uses — NOT the display code), zip
// the buy-slots ↔ sell-slots position-by-position (uniform price ⇒ any pairing conserves), then
// aggregate each distinct (buyer, seller) pair into one bond+cash leg. This attributes every
// seller's delivery/payment to the ACTUAL buyer it paired with — fixing the multi-buyer /
// guest-4th-buyer mis-attribution where all sellers were collapsed onto the first buyer. Because
// the pairing sorts on the party id (bankA < bankB < bankC < …), the §4 single-buyer fixture
// reduces to the identical two legs (MERIDIAN→BLUEROCK 8/800, HALWARD→BLUEROCK 2/200) — canary
// byte-identical. Labels resolve to the comp desk codes (incl. GUEST) only at the end, via codeOf.
function legsFromPreview(preview: SolvePreviewResponse): DvpLeg[] {
  const filled = preview.allocations.filter((a) => a.filledQty > 0)
  // Per-unit party slots for one side, sorted by raw party id (matches the Daml builder).
  const unitsFor = (side: 'Buy' | 'Sell'): string[] =>
    filled
      .filter((a) => a.side === side)
      .sort((x, y) => (x.desk < y.desk ? -1 : x.desk > y.desk ? 1 : 0))
      .flatMap((a) => Array<string>(a.filledQty).fill(a.desk))
  const buys = unitsFor('Buy')
  const sells = unitsFor('Sell')
  // Zip position-by-position (truncates to the shorter list; on a verified allocation
  // Σbuy === Σsell so no unit is lost), aggregating per (seller, buyer) pair in first-seen order.
  const byPair = new Map<string, { seller: string; buyer: string; qty: number }>()
  const n = Math.min(buys.length, sells.length)
  for (let i = 0; i < n; i++) {
    const buyer = buys[i]!
    const seller = sells[i]!
    const key = `${seller}→${buyer}`
    const cur = byPair.get(key)
    if (cur) cur.qty += 1
    else byPair.set(key, { seller, buyer, qty: 1 })
  }
  return [...byPair.values()].map(({ seller, buyer, qty }) => ({
    seller: codeOf(seller),
    buyer: codeOf(buyer),
    qty,
    cash: qty * preview.clearingPrice,
  }))
}

// Client-side fallback brief — a secret-free NL summary composed from the SETTLED preview
// numbers (mirrors solver/src/brief.ts composeBrief; never drifts the §4 clearing). Used
// only if the server brief (getBrief) is unreachable so the Round Brief block never stalls.
function composeFallbackBrief(preview: SolvePreviewResponse): string {
  const price = preview.clearingPrice.toFixed(2)
  const units = `${preview.matchedVolume} unit${preview.matchedVolume === 1 ? '' : 's'}`
  const filled = codeAllocations(preview).filter((a) => a.filledQty > 0)
  const perDesk = filled
    .map((a) => `${a.desk} ${a.side === 'Buy' ? 'bought' : 'sold'} ${a.filledQty}`)
    .join(', ')
  const headline =
    `This round cleared at a single uniform price of $${price}, ` +
    `matching ${units} of the bond and settling delivery-versus-payment atomically in one transaction.`
  const fills = perDesk
    ? `Per-desk outcomes: ${perDesk}.`
    : `No orders crossed this round, so no desk was filled.`
  const tail = preview.rationale?.trim() ? ` ${preview.rationale.trim()}` : ''
  return `${headline} ${fills}${tail}`
}

// Build the before→after balance rows from the allocations (the aggregate via :4100).
// When a GUEST (Desk D) fill is present the guest row is appended (WOW-07) with its own
// BEFORE balance; §4 has no guest so the table stays the canonical three desks.
function balanceRowsFromPreview(preview: SolvePreviewResponse): BalanceRow[] {
  const coded = codeAllocations(preview)
  const guestPresent = coded.some((a) => a.desk === GUEST.code)
  const before: DeskBalances = guestPresent ? { ...BEFORE, [GUEST.code]: GUEST_BEFORE } : BEFORE
  const after = deskBalancesFromAllocations(coded, preview.clearingPrice, before)
  const order = guestPresent ? [...DESK_ORDER, GUEST.code] : DESK_ORDER
  return order.map((code) => ({
    code,
    before: before[code] ?? { bondx: 0, usdcx: 0 },
    after: after[code] ?? before[code] ?? { bondx: 0, usdcx: 0 },
  }))
}

export default function SettlementView({
  roundId,
  preview,
  setPreview,
  phase,
  setPhase,
  offline,
  setOffline,
  approval,
}: Props) {
  const [settleProgress, setSettleProgress] = useState(phase === 'settled' ? 1 : 0)
  const [stampIn, setStampIn] = useState(phase === 'settled')
  // DFIN-02 — netting toggle, DEFAULT ON (NETTED). Seeded from the settlement meta when the
  // solver emits it, else defaults NETTED. Purely a display switch — balances stay conserved.
  const [netted, setNetted] = useState(preview?.settlement?.netted ?? true)
  const rafRef = useRef<number>()
  const doneRef = useRef<ReturnType<typeof setTimeout>>()

  // ── settleAtomically (RESEARCH Pattern 7 — the simultaneous settle) ────────────────
  const settleAtomically = useCallback(async () => {
    if (phase === 'settling' || phase === 'settled') return
    try {
      await settle(roundId) // POST /round/:id/settle (the atomic DvP transaction)
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') setOffline(true)
      return
    }
    setPhase('settling')
    const dur = prefersReducedMotion() ? 0 : 800
    const start = performance.now()
    // ONE rAF clock drives settleProgress 0→1 — every leg + every balance reads it, so
    // they snap together (simultaneity). Never sequence legs.
    const step = (now: number) => {
      const t = dur ? Math.min(1, (now - start) / dur) : 1
      setSettleProgress(t)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    doneRef.current = setTimeout(() => {
      setPhase('settled')
      setStampIn(true)
      setSettleProgress(1)
    }, dur + 60)
  }, [phase, roundId, setPhase, setOffline])

  // Cancel the rAF + the done-timer on unmount (RESEARCH Pitfall 6 — no leaked clock).
  useEffect(
    () => () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
      clearTimeout(doneRef.current)
    },
    [],
  )

  // (a) Reconcile a STRANDED 'settling' phase on mount. Navigating away DURING the ~800ms
  // settle animation unmounts this view (cancelling its rAF), so remounting leaves phase
  // frozen at 'settling' with no clock to finish it. Complete it immediately on mount.
  useEffect(() => {
    if (phase === 'settling') {
      setSettleProgress(1)
      setStampIn(true)
      setPhase('settled')
    }
    // Mount-only reconciliation — intentionally not re-run on phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (b) Reload reconciliation — the lifted `preview` is in-memory only, so a hard reload of
  // an already Cleared/Settled round lands here with preview=null and the settled record is
  // lost. Re-fetch the terminal GET body (mirrors TcaReceipts/RoundBrief) and rebuild a
  // preview-shaped object so the settlement still renders. A Settled round also restores the
  // completed settle visuals (progress=1, stamp) and phase.
  useEffect(() => {
    if (preview || offline || !roundId) return
    let cancelled = false
    getRound(roundId)
      .then((r) => {
        if (cancelled) return
        if ((r.status === 'Cleared' || r.status === 'Settled') && r.clearingPrice !== undefined) {
          setPreview({
            roundId: r.roundId,
            clearingPrice: r.clearingPrice,
            matchedVolume: r.matchedVolume ?? 0,
            allocations: r.allocations ?? [],
            curve: r.curve ?? [],
            rationale: r.rationale ?? '',
            agent: r.agent ?? { verified: false, source: 'deterministic-fallback' },
            settlement: r.settlement,
          })
          if (r.status === 'Settled') {
            setSettleProgress(1)
            setStampIn(true)
            setPhase('settled')
          }
        }
      })
      .catch((e) => {
        if (!cancelled && e instanceof SolverError && e.code === 'OFFLINE') setOffline(true)
      })
    return () => {
      cancelled = true
    }
    // Mount-only reconciliation — captures the initial (possibly null) preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const settled = phase === 'settled'
  const settling = phase === 'settling'

  // ── Settlement-meta (DFIN-01/02/03) — data-driven, decode-safe defaults ────────────────
  // The solver emits `preview.settlement` on a terminal body; until then we fall back to the
  // honest D13 shipped tag (`CN TOKEN STANDARD (CIP-0056)`) + the §4 `USDCx` cash symbol.
  const meta = preview?.settlement
  const cashSymbol = meta?.cashSymbol ?? 'USDCx'
  const provenance: SettlementProvenance = meta?.provenance ?? 'CN TOKEN STANDARD (CIP-0056)'
  // Gross (per seller→buyer) vs NETTED (one net leg per counterparty pair). Both conserve the
  // balance-table totals; §4 single-buyer reduces to identical legs (canary safe).
  const grossLegs = preview ? legsFromPreview(preview) : []
  const activeLegs = netted ? toNettedLegs(grossLegs) : grossLegs
  // Each DvP leg = one bond delivery + one cash payment (two Instructions).
  const instructionCount = activeLegs.length * 2

  return (
    <main style={{ position: 'relative', padding: '30px 48px 72px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">05</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Settlement Ledger
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      <h1
        className="font-display text-54 font-bold"
        style={{ letterSpacing: '-.02em', margin: '26px 0 34px' }}
      >
        ONE TRANSACTION. ALL OR NOTHING.
      </h1>

      {offline ? (
        <p
          className="font-mono text-13 uppercase"
          style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, maxWidth: '560px' }}
        >
          {OFFLINE_CAPTION}
        </p>
      ) : preview ? (
        <div
          className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]"
          style={{ gap: '56px', alignItems: 'start' }}
        >
          {/* Left — DvP legs + the atomic stamp + the CTA */}
          <div style={{ position: 'relative' }}>
            {/* Settlement-layer header: the HARD data-driven provenance tag (D13 honesty —
                CN TOKEN STANDARD (CIP-0056) / DAML-FINANCE-PATTERN (IN-REPO); the standalone
                library name is unsatisfiable on this stack and NEVER rendered) + the
                NETTED ⇄ GROSS LEGS toggle (default NETTED). */}
            <div className="flex items-center" style={{ gap: '10px', marginBottom: '18px' }}>
              <span
                className="font-mono text-9 uppercase"
                style={{ letterSpacing: '.12em', padding: '3px 7px', border: '1px solid #0A0A0A' }}
              >
                {provenance}
              </span>
              <button
                type="button"
                onClick={() => setNetted((v) => !v)}
                className="font-mono text-9 uppercase"
                style={{
                  marginLeft: 'auto',
                  letterSpacing: '.12em',
                  padding: '3px 7px',
                  border: '1px solid #0A0A0A',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
                aria-pressed={netted}
                title="Toggle multilateral netting — balances stay conserved"
              >
                <span style={{ opacity: netted ? 1 : 0.4 }}>NETTED</span>
                {' ⇄ '}
                <span style={{ opacity: netted ? 0.4 : 1 }}>GROSS LEGS</span>
              </button>
            </div>

            <DvpLegs
              legs={activeLegs}
              settleProgress={settleProgress}
              instructionCount={instructionCount}
              cashSymbol={cashSymbol}
              netted={netted}
            />
            <AtomicStamp show={stampIn} />

            <div style={{ marginTop: '34px' }}>
              {settled ? (
                <div
                  className="flex items-center font-mono text-13 font-semibold uppercase"
                  style={{ gap: '8px', letterSpacing: '.1em', color: '#E2231A' }}
                >
                  <span
                    style={{ width: '8px', height: '8px', background: '#E2231A', display: 'inline-block' }}
                  />
                  SETTLED — both legs, one tx
                </div>
              ) : approval !== 'approved' ? (
                // IDEN-03 four-eyes gate — the settle CTA is BLOCKED until a distinct Compliance
                // sign-off (03 Auction Theatre). Round.Clear itself requires a compliance-signed
                // ClearingApproval on-ledger (12-01), so settlement is withheld either way.
                <FourEyesGate decision={approval} />
              ) : (
                <button
                  type="button"
                  onClick={() => void settleAtomically()}
                  disabled={settling}
                  className="font-mono text-13 font-bold uppercase disabled:opacity-40"
                  style={{
                    background: '#0A0A0A',
                    color: '#F4F1EA',
                    padding: '17px 32px',
                    letterSpacing: '.16em',
                    border: 'none',
                    cursor: settling ? 'default' : 'pointer',
                  }}
                >
                  {settling ? 'SETTLING…' : 'Settle Atomically'}
                </button>
              )}
            </div>

            {/* WOW-04 / WOW-05 — post-settle only (hidden pre-settle). The shareable
                Round Brief (copy/download) + the one-click on-brand proof-pack PDF.
                Both on the operator plane (:4100) via solver.ts — no operator token. */}
            {settled && (
              <>
                <RoundBrief roundId={roundId} fallback={composeFallbackBrief(preview)} />
                {/* AUCT-04 — per-desk best-ex / TCA receipts (two-distinct-surplus + export). */}
                <TcaReceipts roundId={roundId} />
                <ProofPackButton roundId={roundId} />
                {/* WOW-06 — cost-of-leakage SIMULATION. Sits BELOW the on-ledger receipts;
                    the dashed border + SIMULATION tag + disclaimer keep it unmistakably
                    NOT ledger data. Pure client-side math over the settled preview numbers
                    (leakage.ts) — no solver/ledger call in this path (T-09-07-02/03). */}
                <LeakageSimPanel preview={preview} />
              </>
            )}

            {/* CRYP-03 — Proof of Correct Clearing. A POST-CLEAR block (self-gated to
                phase cleared|settled) sitting BELOW the SOLID on-ledger settlement record /
                RoundBrief / receipts / proof-pack / leakage sim — visually DISTINCT (dashed
                T3 off-ledger verify pane) from the solid record above. Operator plane
                (:4100) via solver.ts — no operator token; never disturbs the shipped
                simultaneous-settle beat or the money-shot reveal. */}
            <ProofOfClearingPanel
              roundId={roundId}
              phase={phase}
              preview={preview}
              offline={offline}
            />
          </div>

          {/* Right — before → after balances (lerp in lockstep with settleProgress) */}
          <BalanceTable rows={balanceRowsFromPreview(preview)} settleProgress={settleProgress} />
        </div>
      ) : (
        <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, maxWidth: '560px' }}>
          Nothing to settle yet. Clear the batch in 03 Theatre — the matched trades then
          appear here as delivery-vs-payment legs that settle together in a single atomic
          transaction.
        </p>
      )}
    </main>
  )
}

// IDEN-03 four-eyes gate — the blocked settle affordance shown until Compliance signs off
// (03 Auction Theatre). Reuses the shipped red-square verbatim-reject grammar (ink evidence
// surface); when Compliance has REJECTED, it surfaces the on-ledger four-eyes consequence
// verbatim (Round.Clear aborts without a compliance-signed ClearingApproval). Comp tokens only.
function FourEyesGate({ decision }: { decision: ClearingApprovalDecision }) {
  const rejected = decision === 'rejected'
  return (
    <div style={{ maxWidth: '520px' }}>
      <div className="flex items-center" style={{ gap: '8px' }}>
        <span
          style={{ display: 'inline-block', width: '8px', height: '8px', background: '#E2231A' }}
        />
        <span
          className="font-mono text-13 font-semibold uppercase"
          style={{ letterSpacing: '.1em', color: '#E2231A' }}
        >
          {rejected ? 'REJECTED BY COMPLIANCE — SETTLEMENT WITHHELD' : 'PENDING COMPLIANCE FOUR-EYES SIGN-OFF'}
        </span>
      </div>
      {/* The verbatim on-ledger consequence (ink evidence surface — same treatment as the
          shipped tamper/reject surfaces). Render it, never summarize it. */}
      <div
        className="font-mono text-11"
        style={{
          background: '#0A0A0A',
          color: '#F4F1EA',
          padding: '18px 20px',
          marginTop: '12px',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {rejected
          ? 'Round.Clear rejected — assertClearingApproved: no valid compliance-signed ClearingApproval for this round (IDEN-03 four-eyes). Nothing settled on-ledger.'
          : 'Settlement is blocked pending a second, independent Compliance sign-off. Approve the recomputed clearing price in 03 Auction Theatre to unblock the atomic DvP.'}
      </div>
      <p
        className="font-mono uppercase"
        style={{ fontSize: '9px', letterSpacing: '.14em', opacity: 0.55, marginTop: '10px' }}
      >
        DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT
      </p>
    </div>
  )
}

// WOW-06 — Cost-of-Leakage Simulator (UI-SPEC "WOW-06 — Cost-of-Leakage Simulator").
// A POST-settle, CLIENT-SIDE illustrative panel: it runs the SAME settled order set
// through a naive public order book (lib/leakage.estimateLeakage — slippage + front-run
// → `$X LOST`) beside Umbra's sealed uniform clear (`$0 LEAKED`), showing `$X SAVED`.
// It is UNMISTAKABLY NOT ledger data: a 1px DASHED ink border (the real receipts above
// use SOLID 1px ink), a `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag, and a
// disclaimer footnote. `$X LOST` is red (the leakage); `$0 LEAKED` + the `$X SAVED`
// punchline are INK — never lime (lime stays the clearing-reveal signal). No solver/
// ledger dependency for the sim math — it reads only the settled preview numbers.
function LeakageSimPanel({ preview }: { preview: SolvePreviewResponse }) {
  // Build the leakage legs from the SETTLED preview allocations (qty + side) at the
  // uniform clear — pure client-side, no fetch/ledger/solver call in this path.
  const legs: LeakageLeg[] = preview.allocations
    .filter((a) => a.filledQty > 0)
    .map((a) => ({ side: a.side, filledQty: a.filledQty, clearingPrice: preview.clearingPrice }))
  const { publicBookLost, saved } = estimateLeakage(legs)
  const lost = `$${publicBookLost.toFixed(2)}`
  const savedStr = `$${saved.toFixed(2)}`
  // Reduced-motion → the punchline rises instantly (no keyframe), per the motion contract.
  const rise = prefersReducedMotion() ? '' : ' animate-umbra-rise'

  return (
    <div style={{ marginTop: '34px', border: '1px dashed #0A0A0A', padding: '22px 24px' }}>
      {/* Header — sub-label + right-pushed SIMULATION tag (ink border, neutral-illustrative). */}
      <div className="flex items-center" style={{ gap: '10px' }}>
        <span className="font-body text-10 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Cost of Leakage · Simulation
        </span>
        <span
          className="font-mono text-9 uppercase"
          style={{
            marginLeft: 'auto',
            letterSpacing: '.12em',
            padding: '3px 7px',
            border: '1px solid #0A0A0A',
          }}
        >
          SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA
        </span>
      </div>

      {/* Two columns — SIMULATED PUBLIC BOOK ($X LOST, red) vs UMBRA SEALED CLEAR ($0, ink). */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '22px' }}>
        <div>
          <div className="font-mono text-11 uppercase" style={{ letterSpacing: '.16em', opacity: 0.6 }}>
            SIMULATED PUBLIC BOOK
          </div>
          <div
            className="font-mono text-22 font-semibold tabular-nums"
            style={{ color: '#E2231A', marginTop: '8px' }}
          >
            {lost} LOST
          </div>
          <div
            className="font-mono text-9 uppercase"
            style={{ letterSpacing: '.16em', opacity: 0.55, marginTop: '4px' }}
          >
            SLIPPAGE + FRONT-RUN
          </div>
        </div>
        <div>
          <div className="font-mono text-11 uppercase" style={{ letterSpacing: '.16em', opacity: 0.6 }}>
            UMBRA SEALED CLEAR
          </div>
          <div className="font-mono text-22 font-semibold tabular-nums" style={{ marginTop: '8px' }}>
            $0 LEAKED
          </div>
          <div
            className="font-mono text-9 uppercase"
            style={{ letterSpacing: '.16em', opacity: 0.55, marginTop: '4px' }}
          >
            SEALED UNIFORM PRICE
          </div>
        </div>
      </div>

      {/* Punchline — INK (deliberately NOT lime), umbra-rise on mount. */}
      <div className={`font-mono text-40 font-semibold tabular-nums${rise}`} style={{ marginTop: '22px' }}>
        {savedStr} SAVED VS A PUBLIC BOOK
      </div>

      {/* Disclaimer footnote — verbatim (Inter 13/1.6 opacity .6). */}
      <p className="font-body text-13" style={{ opacity: 0.6, marginTop: '12px', maxWidth: '560px' }}>
        Illustrative model — the same orders run through a naive public order book. No real venue;
        nothing here is on-ledger.
      </p>
    </div>
  )
}
