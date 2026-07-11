// solver/src/webhooks.test.ts — the executable contract for the OPS-04 signed,
// retried webhook emitter (T-13-09 / T-13-10).
//
// TDD: authored BEFORE solver/src/webhooks.ts exists — EXPECTED to fail at the RED
// step (the module is absent). Proven here:
//   • signPayload / verifySignature round-trip via timingSafeEqual (a tampered
//     signature fails; a length-mismatched signature fails).
//   • isReplayFresh rejects a stale X-Umbra-Timestamp (older than the replay window).
//   • emit signs the exact POSTed body and sets the four X-Umbra-* headers.
//   • A failing-then-recovering sink retries with backoff and the delivery log ends
//     status:'delivered' with the right attempt count; an always-failing sink ends
//     status:'failed' after ~5 attempts; the retry timer never double-fires.
//   • Only subscriptions filtering the emitted event are delivered to.
//   • SECRET-SWEEP: the per-subscription secret + ANTHROPIC_API_KEY / operator-token
//     sentinels never appear in any emitted payload or the delivery log.
//
// fetch + wait + random are injected — no real network, no real sleeps.

import { createHmac } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import {
  signPayload,
  verifySignature,
  isReplayFresh,
  createWebhooks,
  WebhookLimitError,
  type WebhookEvent,
} from './webhooks.js'

// A realistic-looking per-subscription secret sentinel that must NEVER leak.
const SECRET = 'whsec_super_secret_do_not_leak_ABC123'
// Sentinels for the other server-side secrets that must never reach a payload/log.
const ANTHROPIC_SENTINEL = 'sk-ant-LEAKED_KEY_SENTINEL'
const OPERATOR_SENTINEL = 'operator-token-LEAKED_SENTINEL'

// A minimal Response-shaped stub the injected fetch returns.
const res = (ok: boolean, status: number) => ({ ok, status }) as unknown as Response

describe('webhooks — HMAC signing + replay guard', () => {
  it('signPayload/verifySignature round-trip via timingSafeEqual', () => {
    const ts = '1700000000000'
    const body = JSON.stringify({ event: 'round.cleared', roundId: 'R1', clearingPrice: 100 })
    const sig = signPayload(SECRET, ts, body)

    // Shape: `sha256=<hex>` over `${ts}.${rawBody}`.
    expect(sig.startsWith('sha256=')).toBe(true)
    expect(sig).toBe(
      // recompute independently for a fixed witness
      'sha256=' + createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex'),
    )

    expect(verifySignature(SECRET, ts, body, sig)).toBe(true)
    // Tampered signature fails (flip the last hex nibble to a guaranteed-different one).
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')
    expect(verifySignature(SECRET, ts, body, tampered)).toBe(false)
    // Wrong secret fails.
    expect(verifySignature('wrong-secret', ts, body, sig)).toBe(false)
    // Length mismatch fails (no timingSafeEqual throw).
    expect(verifySignature(SECRET, ts, body, 'sha256=deadbeef')).toBe(false)
  })

  it('isReplayFresh rejects a stale X-Umbra-Timestamp', () => {
    const now = 1_700_000_000_000
    const windowMs = 300_000 // 5 min
    // Fresh (within window) → accepted.
    expect(isReplayFresh(String(now - 1000), now, windowMs)).toBe(true)
    // Stale (older than the window) → rejected.
    expect(isReplayFresh(String(now - windowMs - 1), now, windowMs)).toBe(false)
    // Non-numeric → rejected.
    expect(isReplayFresh('not-a-number', now, windowMs)).toBe(false)
  })
})

describe('webhooks — emit / retry / delivery log', () => {
  const deps = (fetchImpl: typeof fetch) => ({
    fetch: fetchImpl,
    wait: async () => {}, // no real sleeps
    random: () => 0, // deterministic jitter
    baseDelayMs: 1,
    maxAttempts: 5,
    now: () => 1_700_000_000_000,
  })

  it('signs the exact POSTed body and sets the four X-Umbra-* headers', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchStub = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init }
      return res(true, 200)
    })
    const wh = createWebhooks(deps(fetchStub as unknown as typeof fetch))
    wh.register({ url: 'https://sink.example/hook', secret: SECRET, events: ['round.cleared'] })

    await wh.emit('round.cleared', { roundId: 'R1', clearingPrice: 100 })

    expect(captured).not.toBeNull()
    const init = captured!.init
    const headers = init.headers as Record<string, string>
    const body = String(init.body)
    expect(init.method).toBe('POST')
    expect(headers['X-Umbra-Event']).toBe('round.cleared')
    expect(headers['X-Umbra-Delivery']).toBeTruthy()
    expect(headers['X-Umbra-Timestamp']).toBeTruthy()
    // The signature verifies over the EXACT posted body + timestamp header.
    expect(
      verifySignature(SECRET, headers['X-Umbra-Timestamp'], body, headers['X-Umbra-Signature']),
    ).toBe(true)
  })

  it('failing-then-recovering sink retries then records status:delivered with attempt count', async () => {
    let calls = 0
    const fetchStub = vi.fn(async () => {
      calls += 1
      return calls < 3 ? res(false, 500) : res(true, 200)
    })
    const wh = createWebhooks(deps(fetchStub as unknown as typeof fetch))
    wh.register({ url: 'https://sink.example/hook', secret: SECRET, events: ['round.settled'] })

    await wh.emit('round.settled', { roundId: 'R1', clearingPrice: 100 })

    const log = wh.deliveryLog()
    expect(log).toHaveLength(1)
    expect(log[0].status).toBe('delivered')
    expect(log[0].attempts).toBe(3)
    expect(log[0].lastError).toBeNull()
    expect(calls).toBe(3)
  })

  it('always-failing sink records status:failed after ~5 attempts (timer never double-fires)', async () => {
    let calls = 0
    const fetchStub = vi.fn(async () => {
      calls += 1
      throw new Error('ECONNREFUSED sink down')
    })
    const wh = createWebhooks(deps(fetchStub as unknown as typeof fetch))
    wh.register({ url: 'https://sink.example/hook', secret: SECRET, events: ['fill.posted'] })

    await wh.emit('fill.posted', { roundId: 'R1', desk: 'BankA', filledQty: 10 })

    const log = wh.deliveryLog()
    expect(log[0].status).toBe('failed')
    expect(log[0].attempts).toBe(5)
    expect(calls).toBe(5) // exactly maxAttempts — no double-fire
    // lastError is secret-free (Error name only, never err.message internals leaked as a secret).
    expect(typeof log[0].lastError).toBe('string')
  })

  it('delivers ONLY to subscriptions filtering the emitted event', async () => {
    const hit: string[] = []
    const fetchStub = vi.fn(async (url: string) => {
      hit.push(url)
      return res(true, 200)
    })
    const wh = createWebhooks(deps(fetchStub as unknown as typeof fetch))
    wh.register({ url: 'https://a.example/hook', secret: SECRET, events: ['round.opened'] })
    wh.register({ url: 'https://b.example/hook', secret: SECRET, events: ['round.cleared'] })

    await wh.emit('round.cleared', { roundId: 'R1', clearingPrice: 100 })

    expect(hit).toEqual(['https://b.example/hook'])
  })

  it('register does not echo the subscription secret', async () => {
    const wh = createWebhooks(deps((async () => res(true, 200)) as unknown as typeof fetch))
    const sub = wh.register({ url: 'https://a.example/hook', secret: SECRET, events: ['round.opened'] })
    // Whatever register returns must not carry the secret back out.
    expect(JSON.stringify(sub)).not.toContain(SECRET)
    expect(wh.unregister(typeof sub === 'string' ? sub : sub.id)).toBe(true)
  })

  it('SECRET-SWEEP: no subscription secret / API key / operator token in any payload or the delivery log', async () => {
    const bodies: string[] = []
    const fetchStub = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      // Fail once so a delivery record captures an error path too.
      return bodies.length < 2 ? res(false, 503) : res(true, 200)
    })
    const wh = createWebhooks(deps(fetchStub as unknown as typeof fetch))
    wh.register({ url: 'https://sink.example/hook', secret: SECRET, events: ['round.settled', 'fill.posted'] })

    const events: WebhookEvent[] = ['round.settled', 'fill.posted']
    for (const e of events) {
      await wh.emit(e, { roundId: 'R1', clearingPrice: 100, note: 'aggregate only' })
    }

    const blob = bodies.join('\n') + '\n' + JSON.stringify(wh.deliveryLog())
    expect(blob).not.toContain(SECRET)
    expect(blob).not.toContain(ANTHROPIC_SENTINEL)
    expect(blob).not.toContain(OPERATOR_SENTINEL)
    expect(blob).not.toContain('sk-ant-')
  })
})

// ── DoS bounds (T-13): the registry + delivery log must never grow without limit ──────
describe('webhooks — DoS bounds (subscription cap + rotating delivery log)', () => {
  it('register past the subscription cap throws WebhookLimitError', () => {
    const wh = createWebhooks({ maxSubscriptions: 2 })
    wh.register({ url: 'https://a.example/hook', secret: SECRET, events: ['round.opened'] })
    wh.register({ url: 'https://b.example/hook', secret: SECRET, events: ['round.opened'] })
    // The third register is past the ceiling → rejected (api.ts maps this to a 429).
    expect(() => wh.register({ url: 'https://c.example/hook', secret: SECRET, events: ['round.opened'] })).toThrow(
      WebhookLimitError,
    )
  })

  it('the delivery log is bounded — oldest records are evicted past maxDeliveryLog', async () => {
    const fetchStub = vi.fn(async () => res(true, 200))
    const wh = createWebhooks({
      fetch: fetchStub as unknown as typeof fetch,
      wait: async () => {},
      maxDeliveryLog: 3,
    })
    wh.register({ url: 'https://sink.example/hook', secret: SECRET, events: ['round.settled'] })

    // Emit far more than the cap; each emit records a delivery. The log must stay bounded.
    for (let i = 0; i < 20; i++) {
      await wh.emit('round.settled', { roundId: `R${i}`, clearingPrice: 100 })
    }

    expect(wh.deliveryLog().length).toBeLessThanOrEqual(3)
    expect(wh.deliveryLog().length).toBe(3)
  })
})
