// Auction Theatre (view 03) — UI-SPEC "03 — AUCTION THEATRE" (lines 172-192).
// Operator plane (:4100) via web/src/solver.ts; NO operator token, NO @daml/react
// context (the solver service is the sole Operator-authority proxy — CONTEXT D6 /
// threat T-06-01). Dark INVERTED surface (#0A0A0A bg / #F4F1EA text).
//
// State A — RUNNING (phase open|running): the 280×280 CountdownRing + a right column
// with the "ONE PRICE. / NO LEAKS." headline, the live sealedOrderCount (from solver
// GET /round/:id), and the START 60s WINDOW / CLOSE & SOLVE CTAs.
// State B — SOLVING / CLEARED (phase solving|cleared|settling|settled): the inline
// SOLVER-AGENT-00 COMPUTING beat, then the chart + reveal (Plan 03 Task 2).
//
// Close & Solve = POST /round/:id/close then GET /round/:id/solve-preview — the reveal
// reads solve-preview (NOT GET, which only attaches result fields at a terminal status
// — RESEARCH Pitfall 4). A :4100 reject → SolverError 'OFFLINE' → graceful caption;
// Privacy still renders.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OperatorViewState } from '../operatorState'
import type { IndicativeMeta } from '../solver'
import {
  approveClearing,
  closeRound,
  getRound,
  rejectClearing,
  solvePreview,
  SolverError,
  OFFLINE_CAPTION,
} from '../solver'
import CountdownRing from '../components/CountdownRing'
import CrossingChart from '../components/CrossingChart'
import PriceReveal from '../components/PriceReveal'
import ComplianceApproval from '../components/ComplianceApproval'
import QrJoin from '../components/QrJoin'

type Props = OperatorViewState

const WINDOW_SECONDS = 60

export default function TheatreView({
  roundId,
  phase,
  setPhase,
  preview,
  setPreview,
  offline,
  setOffline,
  approval,
  setApproval,
}: Props) {
  const [seconds, setSeconds] = useState(WINDOW_SECONDS)
  const [sealedOrderCount, setSealedOrderCount] = useState(0)
  // IDEN-03 four-eyes: guards the Compliance approve/reject round-trip (offline-guarded).
  const [approving, setApproving] = useState(false)
  // AUCT-03: the aggregate indicative scalars (scalars only — never an order). Present
  // only while the window is open with ≥1 sealed order; small-N guarded server-side.
  const [indicative, setIndicative] = useState<IndicativeMeta | undefined>()
  const clockRef = useRef<ReturnType<typeof setInterval>>()

  // ── Close & Solve (RESEARCH Pattern 5) ──────────────────────────────────────────
  // POST /close then GET /solve-preview; the COMPUTING beat is held for the real
  // round-trip. A keyless solver still returns clearingPrice 100.00 + a deterministic
  // rationale (CONTEXT). Network reject → OFFLINE caption.
  const closeAndSolve = useCallback(async () => {
    setPhase('solving')
    // Track whether closeRound already COMMITTED (round flipped to Closed on-ledger).
    // If the solve step then fails, reverting to 'open' would desync the UI from ledger
    // truth — CloseRound is only valid from Open, so the window cannot be reopened
    // (MED-01). On a post-close failure we STAY in 'solving' (the round is Closed and the
    // solve is retryable); only a pre-close failure (closeRound itself threw) reverts to
    // 'open'.
    let closed = false
    try {
      await closeRound(roundId)
      closed = true
      const result = await solvePreview(roundId)
      setPreview(result)
      setPhase('cleared')
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') setOffline(true)
      // Closed on-ledger → keep 'solving' (retry the solve); still Open → back to 'open'.
      setPhase(closed ? 'solving' : 'open')
    }
  }, [roundId, setPhase, setPreview, setOffline])

  // ── IDEN-03 four-eyes Compliance decision (offline-guarded) ──────────────────────
  // APPROVE → approveClearing (unblocks the settle CTA in 05); REJECT → rejectClearing
  // (settlement stays blocked). Both probe the operator-plane solver, so a down :4100
  // surfaces the shipped OFFLINE caption without silently flipping the verdict.
  const decideApproval = useCallback(
    async (decision: 'approved' | 'rejected') => {
      setApproving(true)
      try {
        await (decision === 'approved' ? approveClearing(roundId) : rejectClearing(roundId))
        setApproval(decision)
      } catch (e) {
        if (e instanceof SolverError && e.code === 'OFFLINE') setOffline(true)
      } finally {
        setApproving(false)
      }
    },
    [roundId, setApproval, setOffline],
  )

  // ── Start the 60s window (RESEARCH Pattern 4) ────────────────────────────────────
  // 1s setInterval decrementing 60→0; at 0 it clears the interval and auto-fires
  // Close & Solve (comp startClock). The count itself is data — it still runs under
  // prefers-reduced-motion; only the ring's CSS transition is decorative.
  const startWindow = useCallback(() => {
    setPhase('running')
    setSeconds(WINDOW_SECONDS)
    clearInterval(clockRef.current)
    clockRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s - 1 <= 0) {
          clearInterval(clockRef.current)
          // Defer the close one tick so the ring lands on 00 before the reveal.
          setTimeout(() => void closeAndSolve(), 200)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [setPhase, closeAndSolve])

  // ── Live sealedOrderCount from the solver (UI-SPEC line 180 — read 03) ────────────
  useEffect(() => {
    let cancelled = false
    getRound(roundId)
      .then((r) => {
        if (!cancelled) {
          setSealedOrderCount(r.sealedOrderCount)
          // Scalars only — the solver never sends an order or a candidate-price curve
          // during the open window (present solely when status is Open with ≥1 order).
          setIndicative(r.indicative)
        }
      })
      .catch((e) => {
        if (!cancelled && e instanceof SolverError && e.code === 'OFFLINE') setOffline(true)
      })
    return () => {
      cancelled = true
    }
  }, [roundId, setOffline])

  // Clean up the clock on unmount (RESEARCH Pitfall 6).
  useEffect(() => () => clearInterval(clockRef.current), [])

  const running = phase === 'open' || phase === 'running'

  return (
    <main style={{ position: 'relative', padding: '30px 48px 48px', overflow: 'hidden' }}>
      {/* Section marker */}
      <div className="flex items-baseline" style={{ gap: '14px' }}>
        <span className="font-mono text-13 font-semibold">03</span>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Auction Theatre
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      {/* Dark inverted stage */}
      <div
        style={{
          background: '#0A0A0A',
          color: '#F4F1EA',
          padding: '48px 56px 56px',
          position: 'relative',
          overflow: 'hidden',
          minHeight: '560px',
          marginTop: '24px',
        }}
      >
        {offline ? (
          <OfflineCaption />
        ) : running ? (
          <RunningStage
            phase={phase}
            seconds={seconds}
            sealedOrderCount={sealedOrderCount}
            indicative={indicative}
            onStart={startWindow}
            onClose={() => void closeAndSolve()}
          />
        ) : (
          <>
            <SolvedStage phase={phase} preview={preview} />
            {/* IDEN-03 four-eyes control — gated to the pending state: once the recomputed
                clearing price is revealed (preview present), BEFORE settle. APPROVE unblocks
                the settle CTA in 05 Settlement; REJECT withholds it. Additive below the
                money-shot reveal — the shipped chart/reveal beat is untouched. */}
            {preview && (
              <div
                style={{
                  marginTop: '40px',
                  borderTop: '1px solid rgba(244,241,234,0.16)',
                  paddingTop: '32px',
                }}
              >
                <ComplianceApproval
                  roundId={roundId}
                  clearingPrice={preview.clearingPrice}
                  decision={approval}
                  busy={approving}
                  onApprove={() => void decideApproval('approved')}
                  onReject={() => void decideApproval('rejected')}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* WOW-07 — Guest QR host, BELOW the dark stage (does NOT disturb the shipped
          countdown/reveal beat). Encodes only the /join URL + roundId; the guest token is
          delivered server-side, never in the QR. Carries the HARD OIDC honesty label. */}
      <div style={{ marginTop: '30px' }}>
        <QrJoin roundId={roundId} />
      </div>
    </main>
  )
}

// ── Running stage (State A) ────────────────────────────────────────────────────────
function RunningStage({
  phase,
  seconds,
  sealedOrderCount,
  indicative,
  onStart,
  onClose,
}: {
  phase: OperatorViewState['phase']
  seconds: number
  sealedOrderCount: number
  indicative: IndicativeMeta | undefined
  onStart: () => void
  onClose: () => void
}) {
  const open = phase === 'open'
  const caption = open ? 'WINDOW READY' : 'WINDOW OPEN — ORDERS LOCKED & HIDDEN'
  // AUCT-03: the aggregate indicative panel shows only once the window is open with ≥1
  // sealed order AND the solver has published the (scalars-only) block.
  const showIndicative = sealedOrderCount >= 1 && indicative !== undefined
  // VIZ-01: the assembling crossing appears alongside once orders are sealing. Per the
  // privacy invariant NO per-order/candidate-price curve crosses the wire during the open
  // window, so the assembling chart renders its frame + faint matched region WITHOUT a red
  // p* — the full crossing locks in from solve-preview at close.
  const showAssembling = sealedOrderCount >= 1

  return (
    <div className="flex flex-col" style={{ gap: '40px' }}>
      <div className="flex items-center" style={{ gap: '72px' }}>
        <CountdownRing seconds={seconds} />

        <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
          <span
            className="font-mono text-13 uppercase"
            style={{ letterSpacing: '.16em', opacity: 0.6 }}
          >
            {caption}
          </span>

          <h2
            className="font-display text-56 font-bold"
            style={{ letterSpacing: '-.02em', margin: '14px 0 18px' }}
          >
            ONE PRICE.
            <br />
            NO LEAKS.
          </h2>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '18px' }}>
            <span className="font-mono text-44 font-bold tabular-nums" style={{ lineHeight: 1 }}>
              {sealedOrderCount}
            </span>
            <span
              className="font-body uppercase"
              style={{ fontSize: '12px', letterSpacing: '.2em', opacity: 0.7 }}
            >
              Sealed orders in the book
            </span>
          </div>

          {/* AUCT-03 indicative aggregate panel — scalars only, small-N guarded */}
          {showIndicative && <IndicativePanel indicative={indicative} />}

          <div style={{ display: 'flex', gap: '14px', marginTop: '30px' }}>
          {open ? (
            <button
              type="button"
              onClick={onStart}
              className="font-mono text-13 font-bold uppercase"
              style={{
                background: '#F4F1EA',
                color: '#0A0A0A',
                padding: '16px 30px',
                letterSpacing: '.16em',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Start 60s Window
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-13 font-bold uppercase"
              style={{
                background: '#E2231A',
                color: '#F4F1EA',
                padding: '16px 30px',
                letterSpacing: '.16em',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close &amp; Solve
            </button>
          )}
          </div>
        </div>
      </div>

      {/* VIZ-01 assembling crossing — the chart frame builds as orders seal; NO red p*
          during the open window (red is reserved for the LOCKED clear). No per-order or
          candidate-price curve crosses the wire here, so it renders the framed/faint
          state; the full crossing locks in from solve-preview at close. */}
      {showAssembling && (
        <div style={{ maxWidth: '480px' }}>
          <CrossingChart curve={[]} clearingPrice={0} matchedVolume={0} mode="assembling" />
        </div>
      )}
    </div>
  )
}

// ── AUCT-03 indicative aggregate panel (scalars only, small-N guarded) ───────────────
// A compact sub-panel on the dark stage — 1px paper-at-.28 border (the shipped inverted
// axis-stroke grammar, reduced opacity; not a new color). Three scalar rows: INDICATIVE
// (mono 40, small-N guarded → coarse band + guard caption), NET IMBALANCE (signed,
// buy-blue / sell-pink / paper), EST. MATCHED (mono 18). Scalars only — never an order.
function IndicativePanel({ indicative }: { indicative: IndicativeMeta }) {
  const { indicativePrice, coarse, band, netImbalance, estMatched } = indicative
  // netImbalance/estMatched are withheld under the small-N guard (CR-01) — render those two
  // scalar rows ONLY when both are present (≥2 orders on both sides). In the guarded state
  // the panel shows just the coarse INDICATIVE band + privacy caption; nothing order-derivable.
  const hasScalars = netImbalance !== undefined && estMatched !== undefined
  // Net-imbalance direction + sign color (UI-SPEC: +buy blue / −sell pink / 0 paper).
  const imb = netImbalance ?? 0
  const imbColor = imb > 0 ? '#2B3AF2' : imb < 0 ? '#FF3D9A' : '#F4F1EA'
  const imbDir = imb > 0 ? 'BUY-HEAVY' : imb < 0 ? 'SELL-HEAVY' : 'BALANCED'
  const imbLabel = imb > 0 ? `+${imb}` : `${imb}`

  return (
    <div
      style={{
        border: '1px solid rgba(244,241,234,0.28)',
        padding: '16px 22px',
        marginTop: '18px',
        maxWidth: '460px',
      }}
    >
      {/* Sub-label + aggregate note */}
      <div
        className="font-body uppercase"
        style={{ fontSize: '10px', letterSpacing: '.16em', opacity: 0.55 }}
      >
        Indicative · Aggregate Only
      </div>
      <div
        className="font-mono uppercase"
        style={{ fontSize: '9px', letterSpacing: '.16em', opacity: 0.5, marginTop: '4px' }}
      >
        AGGREGATE — NO ORDER LEAVES THE SOLVER
      </div>

      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap', marginTop: '16px' }}>
        {/* INDICATIVE — exact price past the guard, else a coarse band */}
        <div>
          <div
            className="font-mono uppercase"
            style={{ fontSize: '11px', letterSpacing: '.16em', opacity: 0.6 }}
          >
            Indicative
          </div>
          {coarse ? (
            <>
              <div
                className="font-mono tabular-nums"
                style={{ fontSize: '22px', fontWeight: 600, opacity: 0.8, marginTop: '4px' }}
              >
                ≈ {band} BAND
              </div>
              <div
                className="font-mono uppercase"
                style={{ fontSize: '9px', letterSpacing: '.16em', opacity: 0.55, marginTop: '4px' }}
              >
                COARSE — PRIVACY GUARD (&lt; 2 ORDERS ON A SIDE)
              </div>
            </>
          ) : (
            <div
              className="font-mono tabular-nums"
              style={{ fontSize: '40px', fontWeight: 600, lineHeight: 1, marginTop: '4px' }}
            >
              {indicativePrice?.toFixed(2)}
            </div>
          )}
        </div>

        {/* NET IMBALANCE + EST. MATCHED — withheld under the small-N guard (CR-01) so
            nothing order-derivable is shown; rendered only at ≥2 orders on both sides. */}
        {hasScalars ? (
          <>
            {/* NET IMBALANCE — signed, direction-colored */}
            <div>
              <div
                className="font-mono uppercase"
                style={{ fontSize: '11px', letterSpacing: '.16em', opacity: 0.6 }}
              >
                Net Imbalance
              </div>
              <div
                className="font-mono tabular-nums"
                style={{ fontSize: '22px', fontWeight: 600, color: imbColor, marginTop: '4px' }}
              >
                {imbLabel} <span style={{ fontSize: '11px', opacity: 0.7 }}>BONDX</span>
              </div>
              <div
                className="font-mono uppercase"
                style={{ fontSize: '9px', letterSpacing: '.16em', opacity: 0.55, marginTop: '2px' }}
              >
                {imbDir}
              </div>
            </div>

            {/* EST. MATCHED — aggregate matched volume */}
            <div>
              <div
                className="font-mono uppercase"
                style={{ fontSize: '11px', letterSpacing: '.16em', opacity: 0.6 }}
              >
                Est. Matched
              </div>
              <div
                className="font-mono tabular-nums"
                style={{ fontSize: '18px', fontWeight: 600, marginTop: '4px' }}
              >
                {estMatched} <span style={{ fontSize: '11px', opacity: 0.7 }}>BONDX</span>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div
              className="font-mono uppercase"
              style={{ fontSize: '11px', letterSpacing: '.16em', opacity: 0.6 }}
            >
              Imbalance · Matched
            </div>
            <div
              className="font-mono uppercase"
              style={{ fontSize: '9px', letterSpacing: '.16em', opacity: 0.55, marginTop: '6px', maxWidth: '160px' }}
            >
              WITHHELD — PRIVACY GUARD (&lt; 2 ORDERS ON A SIDE)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Solved stage (State B) — Plan 03 Task 2 fills the chart + reveal ────────────────
function SolvedStage({
  phase,
  preview,
}: {
  phase: OperatorViewState['phase']
  preview: OperatorViewState['preview']
}) {
  if (phase === 'solving' || !preview) {
    // Inline COMPUTING beat — flame square pulses via the Plan-01 animate-umbra-pulse
    // alias, held for the real solve-preview round-trip.
    return (
      <div className="flex items-center" style={{ gap: '11px' }}>
        <span
          className="animate-umbra-pulse"
          style={{ display: 'inline-block', width: '12px', height: '12px', background: '#FF6A1A' }}
        />
        <span className="font-mono text-18 uppercase" style={{ letterSpacing: '.12em' }}>
          SOLVER-AGENT-00 COMPUTING…
        </span>
      </div>
    )
  }
  // CLEARED — the chart + the reveal (the money shot).
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,520px) 1fr',
        gap: '56px',
        alignItems: 'center',
      }}
    >
      <CrossingChart
        curve={preview.curve}
        clearingPrice={preview.clearingPrice}
        matchedVolume={preview.matchedVolume}
        mode="locked"
      />
      <PriceReveal
        clearingPrice={preview.clearingPrice}
        matchedVolume={preview.matchedVolume}
      />
    </div>
  )
}

// ── Solver-offline caption (CONTEXT graceful state) ──────────────────────────────────
function OfflineCaption() {
  return (
    <p
      className="font-mono text-13 uppercase"
      style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, maxWidth: '560px' }}
    >
      {OFFLINE_CAPTION}
    </p>
  )
}
