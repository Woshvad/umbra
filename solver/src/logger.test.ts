// solver/src/logger.test.ts — executable contract for the OPS-01 redacting JSON logger.
//
// Proven here:
//   • redact replaces secret-shaped keys (token/key/authorization/cookie/secret/password/
//     env, incl. apiKey/operatorToken/ANTHROPIC_API_KEY) with '[REDACTED]', recursively,
//     while non-secret keys pass through unchanged.
//   • log emits ONE JSON line with ts (ISO), level, msg, and redacted fields; a secret
//     sentinel passed under a secret-shaped key never reaches stdout (secret-sweep).
//   • info/debug → console.log; warn/error → console.error.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { log, redact } from './logger.js'

const SECRET = 'sk-ant-ABCD-must-never-appear-1234'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('redact', () => {
  it('redacts secret-shaped keys and preserves non-secret keys', () => {
    const out = redact({
      apiKey: SECRET,
      operatorToken: SECRET,
      authorization: `Bearer ${SECRET}`,
      env: { ANTHROPIC_API_KEY: SECRET },
      password: 'hunter2',
      secret: 'x',
      cookie: 'sid=abc',
      // non-secret — must pass through
      roundId: 'R1',
      price: 100,
      side: 'Buy',
    }) as Record<string, unknown>

    expect(out.apiKey).toBe('[REDACTED]')
    expect(out.operatorToken).toBe('[REDACTED]')
    expect(out.authorization).toBe('[REDACTED]')
    expect(out.env).toBe('[REDACTED]') // whole `env` subtree dropped by key match
    expect(out.password).toBe('[REDACTED]')
    expect(out.secret).toBe('[REDACTED]')
    expect(out.cookie).toBe('[REDACTED]')
    // non-secret survive
    expect(out.roundId).toBe('R1')
    expect(out.price).toBe(100)
    expect(out.side).toBe('Buy')
    // the raw secret must not survive anywhere in the serialized redaction
    expect(JSON.stringify(out)).not.toContain(SECRET)
  })

  it('redacts nested secret keys and walks arrays', () => {
    const out = redact({
      desks: [
        { desk: 'A', bearerToken: SECRET },
        { desk: 'B', note: 'ok' },
      ],
      nested: { deep: { sessionKey: SECRET, keep: 1 } },
    })
    expect(JSON.stringify(out)).not.toContain(SECRET)
    expect(JSON.stringify(out)).toContain('"desk":"A"')
    expect(JSON.stringify(out)).toContain('"keep":1')
  })

  it('passes primitives through unchanged', () => {
    expect(redact('plain')).toBe('plain')
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBe(null)
  })
})

describe('log', () => {
  it('emits one JSON line with ts/level/msg and redacted fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    log('info', 'round opened', { roundId: 'R1', apiKey: SECRET })

    expect(spy).toHaveBeenCalledTimes(1)
    const line = spy.mock.calls[0][0] as string
    const parsed = JSON.parse(line)
    expect(parsed.level).toBe('info')
    expect(parsed.msg).toBe('round opened')
    expect(parsed.roundId).toBe('R1')
    expect(parsed.apiKey).toBe('[REDACTED]')
    // ts is a valid ISO-8601 timestamp
    expect(typeof parsed.ts).toBe('string')
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts)
    // the raw secret never reaches stdout
    expect(line).not.toContain(SECRET)
  })

  it('has no trace.id when no span is active', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    log('info', 'no span here')
    const parsed = JSON.parse(spy.mock.calls[0][0] as string)
    expect(parsed['trace.id']).toBeUndefined()
  })

  it('routes warn/error to console.error and info/debug to console.log', () => {
    const outSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    log('info', 'i')
    log('debug', 'd')
    log('warn', 'w')
    log('error', 'e')

    expect(outSpy).toHaveBeenCalledTimes(2)
    expect(errSpy).toHaveBeenCalledTimes(2)
  })
})
