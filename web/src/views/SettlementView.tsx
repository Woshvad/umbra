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
import type { OperatorViewState } from '../operatorState'
import type { SolvePreviewResponse } from '../solver'
import { settle, SolverError, OFFLINE_CAPTION } from '../solver'
import { codeForParty } from '../desks'
import { deskBalancesFromAllocations, type DeskBalances } from '../lib/balance'
import DvpLegs, { type DvpLeg } from '../components/DvpLegs'
import BalanceTable, { type BalanceRow } from '../components/BalanceTable'
import AtomicStamp from '../components/AtomicStamp'

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Map an allocation list onto display-code desks (BLUEROCK/MERIDIAN/HALWARD) so the
// BEFORE balances + leg labels line up — the solver keys allocations by the live party
// id, which `codeForParty` (desks.ts) resolves to the comp code.
function codeAllocations(preview: SolvePreviewResponse) {
  return preview.allocations.map((a) => ({ ...a, desk: codeForParty(a.desk) }))
}

// Derive the DvP legs from the allocations: every Sell desk delivers filledQty BONDX to
// the (single) Buy desk and is paid filledQty·clearingPrice USDCx. §4 → 2 legs.
// Labels resolve to the comp desk codes (BLUEROCK/MERIDIAN/HALWARD), not raw party ids.
function legsFromPreview(preview: SolvePreviewResponse): DvpLeg[] {
  const coded = codeAllocations(preview)
  const buyer = coded.find((a) => a.side === 'Buy' && a.filledQty > 0)?.desk ?? '—'
  return coded
    .filter((a) => a.side === 'Sell' && a.filledQty > 0)
    .map((a) => ({
      seller: a.desk,
      buyer,
      qty: a.filledQty,
      cash: a.filledQty * preview.clearingPrice,
    }))
}

// Build the before→after balance rows from the allocations (the aggregate via :4100).
function balanceRowsFromPreview(preview: SolvePreviewResponse): BalanceRow[] {
  const after = deskBalancesFromAllocations(codeAllocations(preview), preview.clearingPrice, BEFORE)
  return DESK_ORDER.map((code) => ({
    code,
    before: BEFORE[code] ?? { bondx: 0, usdcx: 0 },
    after: after[code] ?? BEFORE[code] ?? { bondx: 0, usdcx: 0 },
  }))
}

export default function SettlementView({
  roundId,
  preview,
  phase,
  setPhase,
  offline,
  setOffline,
}: Props) {
  const [settleProgress, setSettleProgress] = useState(phase === 'settled' ? 1 : 0)
  const [stampIn, setStampIn] = useState(phase === 'settled')
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

  const settled = phase === 'settled'
  const settling = phase === 'settling'

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
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 360px',
            gap: '56px',
            alignItems: 'start',
          }}
        >
          {/* Left — DvP legs + the atomic stamp + the CTA */}
          <div style={{ position: 'relative' }}>
            <DvpLegs legs={legsFromPreview(preview)} settleProgress={settleProgress} />
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
