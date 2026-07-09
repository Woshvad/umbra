// web/src/lib/truncate.test.ts — proves the CRYP-03 middle-truncation helper is a pure,
// deterministic, non-lossy `0xab12…9f3c` renderer (mirrors the vitest style of
// leakage.test.ts / curve.test.ts). The full value must always be recoverable from the
// caller's title/aria-label, so this only governs the DISPLAY form: shorter-or-equal length,
// verbatim when truncation buys nothing, head+tail bytes preserved from the ends.
import { describe, it, expect } from 'vitest'
import { middleTruncate } from './truncate'

// A §4-shaped 32-byte hex hash (the shape of an on-ledger proof/vkey anchor).
const HASH = '0x' + 'ab'.repeat(31) + '9f3c'

describe('middleTruncate — CRYP-03 crypto-artifact display helper', () => {
  it('middle-truncates a long hash to head…tail, strictly shorter than the original', () => {
    const out = middleTruncate(HASH, 10, 6)
    expect(out).toContain('…')
    expect(out.length).toBeLessThan(HASH.length)
    expect(out.startsWith('0x')).toBe(true)
  })

  it('preserves exactly head leading + tail trailing chars around the ellipsis', () => {
    const out = middleTruncate(HASH, 10, 6)
    expect(out).toBe(`${HASH.slice(0, 10)}…${HASH.slice(HASH.length - 6)}`)
    const [headPart, tailPart] = out.split('…')
    expect(headPart).toHaveLength(10)
    expect(tailPart).toHaveLength(6)
  })

  it('returns short values VERBATIM (truncation would not shorten them)', () => {
    expect(middleTruncate('0xabcd', 10, 6)).toBe('0xabcd')
    expect(middleTruncate('', 10, 6)).toBe('')
  })

  it('returns a boundary-length value verbatim (length === head + tail + 1)', () => {
    const boundary = 'a'.repeat(17) // head(10) + tail(6) + 1 ellipsis slot
    expect(middleTruncate(boundary, 10, 6)).toBe(boundary)
    // one char longer → it truncates
    expect(middleTruncate(boundary + 'b', 10, 6)).toContain('…')
  })

  it('honors custom head/tail widths', () => {
    const out = middleTruncate(HASH, 4, 4)
    expect(out).toBe(`${HASH.slice(0, 4)}…${HASH.slice(HASH.length - 4)}`)
  })

  it('clamps negative head/tail to 0 without throwing', () => {
    expect(middleTruncate(HASH, -5, -5)).toBe('…')
    expect(middleTruncate(HASH, -5, 4)).toBe(`…${HASH.slice(HASH.length - 4)}`)
  })

  it('is deterministic — identical input yields identical output', () => {
    expect(middleTruncate(HASH, 8, 8)).toBe(middleTruncate(HASH, 8, 8))
  })
})
