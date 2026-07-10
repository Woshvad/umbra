// solver/src/webhooks.ts — OPS-04 signed, retried round-lifecycle webhook emitter.
//
// A Stripe-style OUTBOUND webhook layer: for each registered subscription, an event
// payload is HMAC-SHA256 signed over `${ts}.${rawBody}` with a PER-SUBSCRIPTION secret,
// POSTed with the `X-Umbra-*` headers, and retried with exponential backoff + jitter
// (~5 attempts) — every attempt recorded in an in-memory delivery log. Firing this off
// the live lifecycle seams (open in index.ts; close/clear/settle in the clock/settle
// path) + the authenticated register/`POST /sandbox/round` endpoints lands in 13-09;
// THIS module is the pure, unit-tested emitter + fixture contract.
//
// SECURITY (SOLV-04 discipline, mirrors ledger.ts `_operatorToken` / auth.ts
// `oidcClientSecret`): the per-subscription secret is held module-private inside the
// subscription Map, is NEVER returned by `register`, NEVER placed in a payload, and
// NEVER written to the delivery log. Only the HMAC SIGNATURE (a one-way digest, not the
// secret) crosses out, in the `X-Umbra-Signature` header. `lastError` records an Error
// NAME / HTTP status only (never `err.message` internals — agent.ts logging discipline).
//
// TIMER HYGIENE (mirrors clock.ts T-04-11): the retry delay uses a SINGLE setTimeout
// that ALWAYS clearTimeout()s itself inside its own callback, so a retry timer can never
// linger or double-fire; the per-delivery attempt loop is strictly sequential (one
// in-flight timer per delivery at a time).
//
// SIGNATURE NOTE (RESEARCH Pattern 6 pitfall): a receiver verifies over the RAW body, so
// for OUTBOUND webhooks we sign the EXACT string we POST (no re-serialization drift).

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

// ── Event union — the round-lifecycle events integrators subscribe to ─────────────
export type WebhookEvent =
  | 'round.opened'
  | 'round.sealed'
  | 'round.cleared'
  | 'round.settled'
  | 'fill.posted'

// ── signPayload / verifySignature — HMAC-SHA256 over `${ts}.${rawBody}` ────────────
// `sha256=<hex>` prefixed, Stripe-compatible. The signature is a one-way digest of the
// secret+body — publishing it in a header does NOT reveal the secret.
export const signPayload = (secret: string, ts: string, rawBody: string): string =>
  'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')

// Constant-time compare (timingSafeEqual) so a byte-by-byte timing side channel cannot
// forge a signature. Guards the length mismatch first (timingSafeEqual throws on unequal
// lengths) and returns false rather than throwing.
export const verifySignature = (
  secret: string,
  ts: string,
  rawBody: string,
  signature: string,
): boolean => {
  const expected = Buffer.from(signPayload(secret, ts, rawBody))
  const given = Buffer.from(signature)
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}

// ── isReplayFresh — the X-Umbra-Timestamp replay-guard ────────────────────────────
// Rejects a timestamp that is not a finite number or is older/newer than the replay
// window (defends against a captured payload being replayed after `windowMs`).
export const isReplayFresh = (ts: string, nowMs: number, windowMs: number): boolean => {
  const t = Number(ts)
  if (!Number.isFinite(t)) return false
  return Math.abs(nowMs - t) <= windowMs
}

// ── Subscription + delivery-log shapes ────────────────────────────────────────────
export interface WebhookSubscriptionInput {
  url: string
  secret: string // per-subscription HMAC secret — module-private, NEVER echoed
  events: WebhookEvent[]
}

// The public handle `register` returns — deliberately carries NO secret.
export interface WebhookSubscription {
  id: string
  url: string
  events: WebhookEvent[]
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed'

// A delivery-log record — secret-free by construction (no secret / no err.message).
export interface DeliveryRecord {
  id: string // == X-Umbra-Delivery
  subscriptionId: string
  event: WebhookEvent
  status: DeliveryStatus
  attempts: number
  lastError: string | null // Error NAME or `HTTP <status>` only — never a secret
}

// ── Injectable deps (tests drive fetch/wait/random with no network or real sleep) ──
export interface WebhooksDeps {
  fetch?: typeof fetch
  wait?: (ms: number) => Promise<void>
  random?: () => number
  now?: () => number
  baseDelayMs?: number
  maxAttempts?: number
  replayWindowMs?: number
}

export interface Webhooks {
  register(input: WebhookSubscriptionInput): WebhookSubscription
  unregister(id: string): boolean
  emit(event: WebhookEvent, data: Record<string, unknown>): Promise<void>
  deliveryLog(): DeliveryRecord[]
}

// Default retry delay: a SINGLE setTimeout that always clears itself (clock.ts hygiene)
// so the timer can never linger or double-fire.
const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      resolve()
    }, ms)
  })

export const createWebhooks = (deps: WebhooksDeps = {}): Webhooks => {
  const fetchImpl = deps.fetch ?? fetch
  const wait = deps.wait ?? defaultWait
  const random = deps.random ?? Math.random
  const now = deps.now ?? Date.now
  const baseDelayMs = deps.baseDelayMs ?? 500
  const maxAttempts = deps.maxAttempts ?? 5

  // PRIVATE registry — the secret lives here and is never exposed outside this closure.
  const subs = new Map<string, WebhookSubscriptionInput>()
  // In-memory delivery log (documented Postgres swap; resets on restart).
  const log = new Map<string, DeliveryRecord>()

  // Deliver one event to one subscription, retrying with exponential backoff + jitter.
  const deliverTo = async (
    subId: string,
    sub: WebhookSubscriptionInput,
    event: WebhookEvent,
    data: Record<string, unknown>,
  ): Promise<void> => {
    const deliveryId = randomUUID()
    const ts = String(now())
    // Payload carries ONLY event data (id/ts/event + aggregate numbers) — NO secret.
    const rawBody = JSON.stringify({ id: deliveryId, ts: Number(ts), event, data })
    const signature = signPayload(sub.secret, ts, rawBody)

    const record: DeliveryRecord = {
      id: deliveryId,
      subscriptionId: subId,
      event,
      status: 'pending',
      attempts: 0,
      lastError: null,
    }
    log.set(deliveryId, record)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      record.attempts = attempt
      try {
        const res = await fetchImpl(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Umbra-Signature': signature,
            'X-Umbra-Timestamp': ts,
            'X-Umbra-Event': event,
            'X-Umbra-Delivery': deliveryId,
          },
          body: rawBody,
        })
        if (res.ok) {
          record.status = 'delivered'
          record.lastError = null
          return
        }
        // Secret-free: HTTP status only, never the response body (could carry internals).
        record.lastError = `HTTP ${res.status}`
      } catch (err) {
        // Secret-free: Error NAME only (agent.ts discipline — never err.message).
        record.lastError = err instanceof Error ? err.name : 'FetchError'
      }
      // Backoff before the next attempt (none after the last). Exponential + jitter;
      // a single in-flight timer per delivery (sequential await) — never double-fires.
      if (attempt < maxAttempts) {
        const backoff = baseDelayMs * 2 ** (attempt - 1)
        const jitter = Math.floor(random() * backoff)
        await wait(backoff + jitter)
      }
    }
    record.status = 'failed'
  }

  return {
    register(input): WebhookSubscription {
      const id = randomUUID()
      // Store the full input (incl. secret) PRIVATELY; return a secret-free handle.
      subs.set(id, { url: input.url, secret: input.secret, events: [...input.events] })
      return { id, url: input.url, events: [...input.events] }
    },

    unregister(id): boolean {
      return subs.delete(id)
    },

    // Fan out to every subscription filtering this event; deliveries run concurrently,
    // each with its own sequential retry loop.
    async emit(event, data): Promise<void> {
      const targets = [...subs.entries()].filter(([, s]) => s.events.includes(event))
      await Promise.all(targets.map(([id, s]) => deliverTo(id, s, event, data)))
    },

    // A snapshot of the delivery log (secret-free records only).
    deliveryLog(): DeliveryRecord[] {
      return [...log.values()]
    },
  }
}
