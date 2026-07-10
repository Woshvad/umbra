// AtomicStamp (UI-SPEC "05 — SETTLEMENT", line 226) — the "1 TRANSACTION · ATOMIC"
// stamp that slams in (animate-umbra-stamp, the Plan-01 alias) once the simultaneous
// settle completes. Absolutely positioned over the legs, rotated -4deg. Red on a
// translucent paper box — the stamp IS the confirmation (no dialog; UI-SPEC line 309).
//
// Reduced-motion (UI-SPEC lines 267-272): reused on BOTH 05 Settlement and 07 Topology,
// so the rotate/scale SLAM (animate-umbra-stamp) must honor `prefers-reduced-motion`.
// When reduced, the class is dropped and the stamp renders in its final resting state
// (static -4deg red box) — the finality is preserved, the motion is not.
type Props = { show: boolean }

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function AtomicStamp({ show }: Props) {
  if (!show) return null
  const reduced = prefersReducedMotion()
  return (
    <div
      className={`${reduced ? '' : 'animate-umbra-stamp'} font-mono text-22 font-bold uppercase`}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%) rotate(-4deg)',
        border: '3px solid #E2231A',
        color: '#E2231A',
        padding: '12px 26px',
        letterSpacing: '.1em',
        background: 'rgba(244,241,234,.82)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      1 TRANSACTION · ATOMIC
    </div>
  )
}
