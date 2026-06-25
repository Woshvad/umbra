// RedactionBar (UI-SPEC line 294) — the privacy motif primitive. A 15px-tall band
// painted with the `bg-redact` repeating-linear-gradient token (Plan-02 Tailwind
// config: `repeating-linear-gradient(90deg,#0A0A0A 0 5px,#262626 5px 7px)`), at the
// given width. The varying widths (62/48/70px) mimic redacted field lengths — a
// rival column shows these because its own query genuinely returns no data.
type Props = { width: number }

export default function RedactionBar({ width }: Props) {
  return <span className="block bg-ink bg-redact" style={{ width: `${width}px`, height: '15px' }} />
}
