// SealedRail (UI-SPEC lines 254-255) — the rotated decorative rail. Absolutely
// positioned left:8px top:120px, rotate(-90deg) about its left-top origin; text
// `SEALED · SEALED · ...`, IBM Plex Mono 12px, letter-spacing .5em, opacity .32,
// white-space nowrap. Pure decoration — no data.
export default function SealedRail() {
  return (
    <div
      className="font-mono text-12"
      style={{
        position: 'absolute',
        left: '8px',
        top: '120px',
        transform: 'rotate(-90deg)',
        transformOrigin: 'left top',
        whiteSpace: 'nowrap',
        letterSpacing: '.5em',
        // `opacity-32` is not on Tailwind's ×5 scale (it renders fully opaque) — use the
        // exact .32 inline so the rail actually reads as faint decoration.
        opacity: 0.32,
      }}
      aria-hidden="true"
    >
      SEALED · SEALED · SEALED · SEALED · SEALED
    </div>
  )
}
