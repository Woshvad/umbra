// solver/src/fsm.test.ts — the OPS-03 round-lifecycle FSM proof, PURE + OFFLINE.
//
// Proven here:
//   • Every LEGAL edge returns its target: Open→Closed→Cleared→Settled.
//   • Every ILLEGAL edge throws a 409 ILLEGAL_TRANSITION:
//       - Open→Settled (settle before clear)
//       - Settled→* (terminal / double-settle)
//       - Closed→Open (no reopen)
//       - Cleared→Closed / Open→Cleared (skipping steps)
//   • sealedAlias maps Closed→'Sealed' for DISPLAY only; all other statuses are unchanged.
//   • The wire/Daml RoundStatus union is NOT renamed — clock.ts still declares exactly
//     `Open | Closed | Cleared | Settled` (grep assertion; `Sealed` is not in the enum).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LEGAL, transition, sealedAlias } from './fsm.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('round-lifecycle FSM', () => {
  it('accepts the full legal path Open→Closed→Cleared→Settled', () => {
    expect(transition('Open', 'Closed')).toBe('Closed')
    expect(transition('Closed', 'Cleared')).toBe('Cleared')
    expect(transition('Cleared', 'Settled')).toBe('Settled')
  })

  it('rejects settle-before-clear (Open→Settled) with 409 ILLEGAL_TRANSITION', () => {
    try {
      transition('Open', 'Settled')
      throw new Error('expected transition to throw')
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string }
      expect(err.status).toBe(409)
      expect(err.code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('rejects any transition out of the terminal Settled state (double-settle)', () => {
    for (const to of ['Open', 'Closed', 'Cleared', 'Settled'] as const) {
      expect(() => transition('Settled', to)).toThrowError()
      try {
        transition('Settled', to)
      } catch (e) {
        const err = e as { status?: number; code?: string }
        expect(err.status).toBe(409)
        expect(err.code).toBe('ILLEGAL_TRANSITION')
      }
    }
  })

  it('rejects reopen (Closed→Open) and step-skips (Open→Cleared, Cleared→Closed)', () => {
    for (const [from, to] of [
      ['Closed', 'Open'],
      ['Open', 'Cleared'],
      ['Cleared', 'Closed'],
    ] as const) {
      try {
        transition(from, to)
        throw new Error(`expected ${from}→${to} to throw`)
      } catch (e) {
        const err = e as { status?: number; code?: string }
        expect(err.status).toBe(409)
        expect(err.code).toBe('ILLEGAL_TRANSITION')
      }
    }
  })

  it('LEGAL table encodes exactly the linear lifecycle', () => {
    expect(LEGAL).toEqual({
      Open: ['Closed'],
      Closed: ['Cleared'],
      Cleared: ['Settled'],
      Settled: [],
    })
  })

  it('sealedAlias maps Closed→Sealed for DISPLAY only, leaving others unchanged', () => {
    expect(sealedAlias('Closed')).toBe('Sealed')
    expect(sealedAlias('Open')).toBe('Open')
    expect(sealedAlias('Cleared')).toBe('Cleared')
    expect(sealedAlias('Settled')).toBe('Settled')
  })

  it('does NOT rename the wire/Daml RoundStatus enum — clock.ts union is unchanged', () => {
    const clockSrc = readFileSync(join(here, 'clock.ts'), 'utf8')
    // The exact wire union must still be present and must NOT contain 'Sealed'.
    expect(clockSrc).toContain(
      "export type RoundStatus = 'Open' | 'Closed' | 'Cleared' | 'Settled'",
    )
    expect(clockSrc).not.toContain("'Sealed'")
  })
})
