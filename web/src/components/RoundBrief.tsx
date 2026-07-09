// RoundBrief (WOW-04, 08-07) — UI-SPEC "WOW-04 Shareable Round Brief" (05 Settlement).
// A 1px-ink bordered block below the Settlement CTA / SETTLED confirmation, shown ONLY
// post-settle. Body = the natural-language summary of the settled round (Inter 14px/1.6
// prose) composed SERVER-SIDE (solver/src/brief.ts composeBrief — secret-free, no number
// drift) and read via getBrief; if the solver is unreachable it renders the client-side
// `fallback` composed from the settled preview so the block never stalls. Two ghost-mono
// actions: COPY BRIEF (navigator.clipboard) + DOWNLOAD BRIEF ↓ (Blob → .txt). Ink/paper
// only — no lime/red, no new token/keyframe. The browser holds no operator/Anthropic
// credential (getBrief goes through solver.ts on the operator plane).
import { useEffect, useRef, useState } from 'react'
import { getBrief } from '../solver'

type Props = {
  roundId: string
  // Client-composed brief from the settled preview — the graceful fallback if the server
  // brief is unavailable (offline / not yet on the terminal body). Never number-drifts.
  fallback: string
}

export default function RoundBrief({ roundId, fallback }: Props) {
  const [brief, setBrief] = useState(fallback)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>()

  // Prefer the server brief (proper desk labels + verified rationale); fall back silently.
  useEffect(() => {
    let live = true
    getBrief(roundId)
      .then((b) => {
        if (live && b) setBrief(b)
      })
      .catch(() => {
        /* offline / pre-terminal → keep the client fallback (demo never stalls) */
      })
    return () => {
      live = false
    }
  }, [roundId])

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  const copyBrief = () => {
    void navigator.clipboard?.writeText(brief).then(() => {
      setCopied(true)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1600)
    })
  }

  const downloadBrief = () => {
    const blob = new Blob([brief], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Umbra-Round-Brief-${roundId}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ border: '1px solid #0A0A0A', padding: '22px 24px', marginTop: '34px' }}>
      {/* Sub-label — Inter 10px .16em uppercase opacity .5 (section-marker rhythm). */}
      <div
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.16em' }}
      >
        Round Brief · shareable
      </div>

      {/* Prose — Inter 14px/1.6, the shareable natural-language summary. */}
      <p
        className="font-body text-14"
        style={{ lineHeight: 1.6, margin: '12px 0 0', opacity: 0.9, maxWidth: '640px' }}
      >
        {brief}
      </p>

      {/* Ghost-mono actions — ink/paper only (never lime/red). */}
      <div className="flex items-center" style={{ gap: '12px', marginTop: '20px' }}>
        <button
          type="button"
          onClick={copyBrief}
          className="umbra-ink-ghost font-mono text-13 font-bold uppercase"
          style={{ padding: '11px 22px', letterSpacing: '.14em', cursor: 'pointer' }}
        >
          {copied ? 'COPIED ✓' : 'COPY BRIEF'}
        </button>
        <button
          type="button"
          onClick={downloadBrief}
          className="umbra-ink-ghost font-mono text-13 font-bold uppercase"
          style={{ padding: '11px 22px', letterSpacing: '.14em', cursor: 'pointer' }}
        >
          DOWNLOAD BRIEF ↓
        </button>
      </div>
    </div>
  )
}
