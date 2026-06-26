// Auction Theatre (view 03) — UI-SPEC "03 — AUCTION THEATRE" (lines 172-192).
// Operator plane (:4000) via web/src/solver.ts; NO operator token, NO @daml/react
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
// — RESEARCH Pitfall 4). A :4000 reject → SolverError 'OFFLINE' → graceful caption;
// Privacy still renders.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OperatorViewState } from '../operatorState'
import { closeRound, getRound, solvePreview, SolverError } from '../solver'
import CountdownRing from '../components/CountdownRing'

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
}: Props) {
  const [seconds, setSeconds] = useState(WINDOW_SECONDS)
  const [sealedOrderCount, setSealedOrderCount] = useState(0)
  const clockRef = useRef<ReturnType<typeof setInterval>>()

  // ── Close & Solve (RESEARCH Pattern 5) ──────────────────────────────────────────
  // POST /close then GET /solve-preview; the COMPUTING beat is held for the real
  // round-trip. A keyless solver still returns clearingPrice 100.00 + a deterministic
  // rationale (CONTEXT). Network reject → OFFLINE caption.
  const closeAndSolve = useCallback(async () => {
    setPhase('solving')
    try {
      await closeRound(roundId)
      const result = await solvePreview(roundId)
      setPreview(result)
      setPhase('cleared')
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') {
        setOffline(true)
        setPhase('open')
      } else {
        setPhase('open')
      }
    }
  }, [roundId, setPhase, setPreview, setOffline])

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
        if (!cancelled) setSealedOrderCount(r.sealedOrderCount)
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
            onStart={startWindow}
            onClose={() => void closeAndSolve()}
          />
        ) : (
          <SolvedStage phase={phase} preview={preview} />
        )}
      </div>
    </main>
  )
}

// ── Running stage (State A) ────────────────────────────────────────────────────────
function RunningStage({
  phase,
  seconds,
  sealedOrderCount,
  onStart,
  onClose,
}: {
  phase: OperatorViewState['phase']
  seconds: number
  sealedOrderCount: number
  onStart: () => void
  onClose: () => void
}) {
  const open = phase === 'open'
  const caption = open ? 'WINDOW READY' : 'WINDOW OPEN — ORDERS LOCKED & HIDDEN'

  return (
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
          style={{ letterSpacing: '-.02em', margin: '14px 0 0' }}
        >
          ONE PRICE.
          <br />
          NO LEAKS.
        </h2>

        <div style={{ marginTop: '34px' }}>
          <div className="font-mono text-44 font-bold tabular-nums" style={{ lineHeight: 1 }}>
            {sealedOrderCount}
          </div>
          <div
            className="font-body text-10 uppercase"
            style={{ letterSpacing: '.16em', opacity: 0.6, marginTop: '6px' }}
          >
            Sealed orders in the book
          </div>
        </div>

        <div style={{ marginTop: '34px' }}>
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
  // Placeholder until Task 2 wires CrossingChart + PriceReveal.
  return (
    <div className="font-mono text-18 tabular-nums">
      Cleared at {preview.clearingPrice.toFixed(2)} — matched {preview.matchedVolume}.
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
      SOLVER OFFLINE — START THE SERVICE ON :4000
    </p>
  )
}
