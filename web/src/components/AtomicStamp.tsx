// AtomicStamp (UI-SPEC "05 — SETTLEMENT", line 226) — the "1 TRANSACTION · ATOMIC"
// stamp that slams in (animate-umbra-stamp, the Plan-01 alias) once the simultaneous
// settle completes. Absolutely positioned over the legs, rotated -4deg. Red on a
// translucent paper box — the stamp IS the confirmation (no dialog; UI-SPEC line 309).
type Props = { show: boolean }

export default function AtomicStamp({ show }: Props) {
  if (!show) return null
  return (
    <div
      className="animate-umbra-stamp font-mono text-22 font-bold uppercase"
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
