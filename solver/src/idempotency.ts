// solver/src/idempotency.ts — OPS-03 idempotency store + Express middleware.
//
// Makes mutating POSTs safe to retry: a client attaches an `Idempotency-Key` header
// and, if the same key + same request body arrives again, the ORIGINAL stored response
// is replayed WITHOUT re-executing the handler (no double-submit, no double-settle).
// A same-key-DIFFERENT-body replay is rejected with 422 IDEMPOTENCY_KEY_REUSED so a
// buggy/hostile client cannot smuggle a new payload under a reused key.
//
// KEYING (threat T-13-06): the store is keyed by `${method} ${baseUrl}${path} ${key}` —
// the client `Idempotency-Key` NAMESPACED by the HTTP method + route path (HI-02) so a key
// is scoped to the single endpoint it was issued for and cannot cross-replay an unrelated
// endpoint whose empty body canonicalizes to the same hash. Each entry also records a
// sha256 of the CANONICALIZED body (object keys sorted recursively) so a mere JSON key
// reorder is NOT mistaken for a different body (Pitfall 4 — false 422).
//
// OPT-IN: the middleware is a no-op unless BOTH (a) the method is POST and (b) an
// `Idempotency-Key` header is present. A request without the header passes through
// untouched and nothing is stored.
//
// REGISTER ORDER: this middleware MUST be registered AFTER `express.json()` so `req.body`
// is already parsed when we hash it (mirrors api.ts line ~370).
//
// STORE (threat T-13-08): an in-memory `Map<key, Entry>`, TTL-bounded (default 24h),
// mirroring clock.ts's private round map. It holds ONLY { bodyHash, status, response body,
// timestamp } — never a token, header, or secret. A documented Postgres-backed swap is the
// multi-instance path (out of scope for the single-operator demo).
//
// AUTHORITY: this is an API-layer dedupe guard; the ledger `Round.status` stays the source
// of truth for the round lifecycle (see fsm.ts).

import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { createHash } from 'node:crypto'

// A stored idempotency record: the canonical body hash + the FIRST response to reproduce.
interface Entry {
  bodyHash: string
  status: number
  body: unknown
  at: number
}

export interface IdempotencyOptions {
  // Entry lifetime in ms; an entry older than this is treated as new. Default 24h.
  ttlMs?: number
  // Clock injection for deterministic TTL tests. Defaults to Date.now.
  now?: () => number
}

export interface Idempotency {
  middleware: RequestHandler
  // Exposed for tests + a future admin/metrics read; never serialized to a client.
  store: Map<string, Entry>
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

// Canonicalize an arbitrary JSON value: sort object keys recursively so the hash is
// stable under key reordering (arrays keep order — position is semantically meaningful).
export const canonicalJson = (value: unknown): string => {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon)
    if (v && typeof v === 'object') {
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = canon((v as Record<string, unknown>)[k])
      }
      return sorted
    }
    return v
  }
  return JSON.stringify(canon(value))
}

// sha256 over the canonicalized body — the second half of the (key, bodyHash) identity.
const hashBody = (body: unknown): string =>
  createHash('sha256').update(canonicalJson(body ?? {})).digest('hex')

// The middleware factory: bind a store + options to an Express handler.
export const idempotencyMiddleware = (
  store: Map<string, Entry>,
  opts?: IdempotencyOptions,
): RequestHandler => {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS
  const now = opts?.now ?? Date.now

  return (req: Request, res: Response, next: NextFunction): void => {
    // Opt-in: only mutating POSTs carrying an Idempotency-Key are deduped.
    if (req.method !== 'POST') return next()
    const key = req.header('Idempotency-Key')
    if (!key) return next()

    // HI-02: namespace the store identity by HTTP method + route path so an idempotency
    // key is scoped to the SINGLE endpoint it was issued for. Many mutating POSTs accept
    // an empty/optional body that canonicalizes to the same `{}` hash (POST /round,
    // /round/:id/settle, /round/:id/close, /sandbox/round). Keying by the raw
    // Idempotency-Key alone lets one key reused across two of these cross-replay the wrong
    // endpoint's stored response (e.g. /round's 201 replayed for /settle, which then never
    // runs). Composing method + baseUrl + path scopes the key to its operation.
    const storeKey = `${req.method} ${req.baseUrl}${req.path} ${key}`

    const bodyHash = hashBody(req.body)
    const existing = store.get(storeKey)

    if (existing && now() - existing.at <= ttlMs) {
      if (existing.bodyHash !== bodyHash) {
        // Same key, different body → refuse (secret-safe envelope, never echoes the body).
        res
          .status(422)
          .json({
            error: {
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Idempotency-Key was reused with a different request body',
            },
          })
        return
      }
      // Replay the ORIGINAL response; the handler is never invoked.
      res.status(existing.status).json(existing.body)
      return
    }

    // First time for this key: capture the FIRST response, then run the handler once.
    const originalJson = res.json.bind(res)
    res.json = (body: unknown): Response => {
      // res.statusCode is already set by the handler's res.status(...) call.
      // HI-01: only memoize a FINAL/SUCCESS response (status < 400). A transient 5xx
      // (e.g. a settle blip forwarded to the secret-safe error middleware as 500) must
      // NOT be cached — caching it would replay the stale error for the whole TTL and
      // NEVER re-attempt, converting a recoverable blip into a stuck round. Skipping the
      // store.set on an error status means a 5xx does NOT consume the idempotency key
      // (Stripe-style semantics), so a retry under the same key re-executes the handler.
      // (A deterministic 4xx recomputes to the same result, so it need not be cached.)
      if (res.statusCode < 400) {
        store.set(storeKey, { bodyHash, status: res.statusCode, body, at: now() })
      }
      return originalJson(body)
    }
    next()
  }
}

// Create an idempotency unit: a fresh in-memory store + a middleware bound to it.
export const createIdempotency = (opts?: IdempotencyOptions): Idempotency => {
  const store = new Map<string, Entry>()
  return { middleware: idempotencyMiddleware(store, opts), store }
}
