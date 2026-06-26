// AgentRationale (UI-SPEC "04 — SOLVER AGENT", lines 206-208) — the rationale column.
// An ink panel renders the solver `rationale` text TYPEWRITER-revealed (~26ms/char,
// comp startType) + a flame caret consuming the Plan-01 `animate-umbra-caret` alias.
// Robust to a keyless solver: `rationale` is always present (deterministic fallback —
// CONTEXT), so the panel always has text. Reduced-motion → render the full text instantly
// (RESEARCH Pitfall 7); the interval is cleared on unmount (RESEARCH Pitfall 6).
//
// Below: the "Competing Agents · ranked by matched volume" table. Phase 6 renders ONLY
// the rank-1 real SOLVER-AGENT-00 row; the grid markup is kept for the stretch §19 rows
// but NO AGENT-01/02 is fabricated.
import { useEffect, useRef, useState } from 'react'

type Props = { rationale: string | null }

const CHAR_MS = 26

// True when the user has asked for reduced motion (guarded for SSR / no-matchMedia).
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function AgentRationale({ rationale }: Props) {
  const text = rationale ?? ''
  const [typed, setTyped] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    // Always clear any prior run before (re)starting.
    clearInterval(intervalRef.current)

    if (!text) {
      setTyped('')
      return
    }
    // Reduced-motion → full text instantly, no interval (Pitfall 7).
    if (prefersReducedMotion()) {
      setTyped(text)
      return
    }
    // Typewriter: slice text[0..i] at ~26ms/char (comp startType).
    setTyped('')
    let i = 0
    intervalRef.current = setInterval(() => {
      i += 1
      setTyped(text.slice(0, i))
      if (i >= text.length) clearInterval(intervalRef.current)
    }, CHAR_MS)

    // Clear the interval on unmount / text change (Pitfall 6).
    return () => clearInterval(intervalRef.current)
  }, [text])

  return (
    <div style={{ padding: '26px 0 0' }}>
      <div
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em' }}
      >
        Rationale
      </div>

      {/* Ink panel — typed rationale + flame caret (animate-umbra-caret alias). */}
      <div
        className="font-mono text-15"
        style={{
          background: '#0A0A0A',
          color: '#F4F1EA',
          padding: '22px 24px',
          minHeight: '120px',
          marginTop: '12px',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}
      >
        {typed}
        <span
          className="animate-umbra-caret"
          style={{
            display: 'inline-block',
            width: '9px',
            height: '18px',
            marginLeft: '2px',
            background: '#FF6A1A',
            verticalAlign: 'text-bottom',
          }}
        />
      </div>

      {/* Competing Agents — Phase 6 renders ONLY the rank-1 real row. */}
      <div
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em', margin: '28px 0 12px' }}
      >
        Competing Agents · ranked by matched volume
      </div>
      <div className="border-t">
        {/* The single real rank-1 row; the grid is the stretch-§19 table markup. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '14px 1fr auto auto',
            gap: '12px',
            alignItems: 'center',
            padding: '13px 12px',
            background: 'rgba(255,106,26,.08)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#FF6A1A',
            }}
          />
          <span className="font-mono text-13 font-semibold" style={{ letterSpacing: '.06em' }}>
            SOLVER-AGENT-00
          </span>
          <span className="font-mono text-13 tabular-nums">100.00</span>
          <span className="font-mono text-13 tabular-nums opacity-70">10 u</span>
        </div>
      </div>
    </div>
  )
}
