// AgentRationale (UI-SPEC "04 — SOLVER AGENT", lines 206-208) — the rationale column.
// WOW-04 (08-07): the SOURCE is now a LIVE SSE token stream. When a `roundId` is passed
// and EventSource is available, we open `GET /round/:id/rationale-stream` (no auth header —
// operator plane, RESEARCH Pitfall 5) and APPEND each `data:` delta into the SAME ink
// panel, the flame caret riding the live insertion point; the `done` event closes it.
// GRACEFUL FALLBACK (UI-SPEC Reconciliation Note 5): if streaming is unavailable — no
// EventSource, the source errors before any token, or no `roundId` is provided — we fall
// back to the shipped single-shot `rationale` typewriter (~26ms/char, comp startType),
// IDENTICAL appearance, so the demo never stalls. Reduced-motion → full text / per-chunk
// append with NO per-char interval (RESEARCH Pitfall 7); the source + interval are torn
// down on unmount (RESEARCH Pitfall 6).
//
// Below: the "Competing Agents · ranked by matched volume" table. Phase 6 renders ONLY
// the rank-1 real SOLVER-AGENT-00 row; the grid markup is kept for the stretch §19 rows
// but NO AGENT-01/02 is fabricated.
import { useEffect, useRef, useState } from 'react'
import type { SolvePreviewResponse } from '../solver'
import { rationaleStreamUrl } from '../solver'

// `roundId` (optional) enables the WOW-04 live SSE source; without it the panel keeps its
// shipped single-shot behavior verbatim (backward-compatible for existing callers).
type Props = {
  rationale: string | null
  preview?: SolvePreviewResponse | null
  roundId?: string
}

const CHAR_MS = 26

// True when the user has asked for reduced motion (guarded for SSR / no-matchMedia).
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function AgentRationale({ rationale, preview, roundId }: Props) {
  const text = rationale ?? ''
  const [typed, setTyped] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const sourceRef = useRef<EventSource>()

  useEffect(() => {
    // Always tear down any prior run (interval + source) before (re)starting.
    clearInterval(intervalRef.current)
    sourceRef.current?.close()
    sourceRef.current = undefined

    // The shipped single-shot typewriter — the fallback render target (identical look).
    const runSingleShot = (full: string) => {
      clearInterval(intervalRef.current)
      if (!full) {
        setTyped('')
        return
      }
      // Reduced-motion → full text instantly, no interval (Pitfall 7).
      if (prefersReducedMotion()) {
        setTyped(full)
        return
      }
      // Typewriter: slice full[0..i] at ~26ms/char (comp startType).
      setTyped('')
      let i = 0
      intervalRef.current = setInterval(() => {
        i += 1
        setTyped(full.slice(0, i))
        if (i >= full.length) clearInterval(intervalRef.current)
      }, CHAR_MS)
    }

    // WOW-04 live source: append SSE deltas into the panel; the caret rides the insertion
    // point. No per-char interval — tokens arrive over the wire (already reduced-motion
    // friendly: each chunk is appended as-is). On any error before a token → single-shot.
    if (roundId && typeof EventSource !== 'undefined') {
      let received = false
      let acc = ''
      setTyped('')
      const es = new EventSource(rationaleStreamUrl(roundId))
      sourceRef.current = es

      es.onmessage = (ev: MessageEvent<string>) => {
        received = true
        // Each frame is a JSON-encoded string delta (solver writes `data: JSON`).
        let delta: unknown = ev.data
        try {
          delta = JSON.parse(ev.data)
        } catch {
          /* tolerate a raw (non-JSON) frame */
        }
        if (typeof delta !== 'string') return
        acc += delta
        setTyped(acc)
      }
      // `event: done` sentinel → the stream completed cleanly; close (no reconnect).
      es.addEventListener('done', () => {
        es.close()
        sourceRef.current = undefined
      })
      // Error / connection close: stop the auto-reconnect. If NOTHING streamed, fall back
      // to the shipped single-shot rationale so the panel always has text (never stalls).
      es.onerror = () => {
        es.close()
        sourceRef.current = undefined
        if (!received) runSingleShot(text)
      }

      return () => {
        es.close()
        sourceRef.current = undefined
        clearInterval(intervalRef.current)
      }
    }

    // No live source → shipped single-shot typewriter (backward-compatible).
    runSingleShot(text)
    return () => clearInterval(intervalRef.current)
  }, [text, roundId])

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
          <span className="font-mono text-13 tabular-nums">{(preview?.clearingPrice ?? 100).toFixed(2)}</span>
          <span className="font-mono text-13 tabular-nums opacity-70">{preview?.matchedVolume ?? 10} u</span>
        </div>
      </div>
    </div>
  )
}
