// CountdownRing (UI-SPEC "03 — AUCTION THEATRE", line 179) — a hand-rolled 280×280
// SVG ring for the 60s window. No chart lib, no in-repo analog (transcribed from
// RESEARCH Pattern 4 + the comp ring markup). The progress circle (r=120) has
// circumference CIRC = 753.98 (2π·120); its stroke-dashoffset is driven by
// 753.98 * (1 - seconds/60), so the arc empties as the window counts down. Ring +
// numeral go red (#E2231A) at seconds ≤ 10; the SVG is rotated -90deg so the arc
// starts at 12 o'clock. The clock itself (the setInterval + auto-fire) lives in the
// parent TheatreView — this component is pure presentation of `seconds`.
//
// This is the dark Theatre surface, so the default ring/numeral color is the paper
// tone #F4F1EA (inverted from the rest of the app).

// 2π·120 — the r=120 progress-circle circumference (UI-SPEC line 179, binding).
const CIRC = 753.98

type Props = { seconds: number }

export default function CountdownRing({ seconds }: Props) {
  // The arc empties as time runs out: at s=60 offset 0 (full), at s=0 offset CIRC (empty).
  const ringDash = CIRC * (1 - seconds / 60)
  const ringColor = seconds <= 10 ? '#E2231A' : '#F4F1EA'
  const padded = String(Math.max(0, seconds)).padStart(2, '0')

  return (
    <div style={{ position: 'relative', width: '280px', height: '280px', flexShrink: 0 }}>
      <svg
        width="280"
        height="280"
        viewBox="0 0 280 280"
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden
      >
        {/* Track — faint full ring */}
        <circle
          cx={140}
          cy={140}
          r={120}
          fill="none"
          stroke="#F4F1EA"
          strokeOpacity={0.14}
          strokeWidth={2}
        />
        {/* Progress — the emptying arc */}
        <circle
          cx={140}
          cy={140}
          r={120}
          fill="none"
          stroke={ringColor}
          strokeWidth={2}
          strokeDasharray={CIRC}
          strokeDashoffset={ringDash}
          strokeLinecap="butt"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s ease' }}
        />
      </svg>

      {/* Center overlay — the seconds numeral + caption */}
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ position: 'absolute', inset: 0 }}
      >
        <span
          className="font-mono text-84 font-semibold tabular-nums"
          style={{ color: ringColor, transition: 'color .3s ease', lineHeight: 1 }}
        >
          {padded}
        </span>
        <span
          className="font-body text-10 uppercase"
          style={{ letterSpacing: '.22em', opacity: 0.6, color: '#F4F1EA', marginTop: '6px' }}
        >
          Seconds to close
        </span>
      </div>
    </div>
  )
}
