// web/src/lib/truncate.ts — a pure middle-truncation helper for the CRYP-03 Proof-of-
// Correct-Clearing panel (and any crypto-artifact surface). Renders long hashes / proof
// bytes / ciphertext as `0xab12…9f3c` WHILE the full value is preserved by the caller in
// `title` / `aria-label` (10-UI-SPEC Provenance rule 4 + Accessibility "Truncated crypto":
// the artifact is never lossy to a reader or screen reader). Pure + deterministic — no
// React, no I/O — so it is unit-tested in isolation (mirrors leakage.ts / curve.ts).

// Middle-truncate `value` to `head` leading + `tail` trailing chars joined by a single
// ellipsis `…`. A value already short enough to gain nothing is returned VERBATIM (never
// lengthened, never lossy). `head` / `tail` are clamped to ≥0. Truncation only applies when
// it actually shortens the string (length > head + tail + 1), so the output can never be
// longer than the input. Any `0x` prefix is preserved as part of the head slice.
export function middleTruncate(value: string, head = 10, tail = 6): string {
  const h = Math.max(0, Math.floor(head))
  const t = Math.max(0, Math.floor(tail))
  // Only truncate when the ellipsis form is strictly shorter than the original.
  if (value.length <= h + t + 1) return value
  return `${value.slice(0, h)}…${value.slice(value.length - t)}`
}
