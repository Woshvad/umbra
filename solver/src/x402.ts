// solver/src/x402.ts — PAY-01 hand-rolled x402 payment gate for the Umbra solver.
//
// This module implements the x402 **v1** HTTP wire envelope (pinned verbatim in
// 14-RESEARCH.md §"The x402 Wire Format") plus a default-OFF Express gate that mirrors
// idempotency.ts. It has ZERO ledger and ZERO secret concerns: settlement is delegated to
// an injected `FacilitatorClient` (implemented in Plan 02), so this file only speaks HTTP.
//
// WHY HAND-ROLLED (deviation, recorded like the zod / @daml/react peer decisions):
// the published `x402` / `x402-express` / `@x402/express` middleware pull in viem / wagmi /
// @solana/kit / @coinbase/cdp-sdk — they are EVM/Solana-scheme-oriented (EIP-3009/USDC) and
// CANNOT advertise a Canton Coin scheme. We stay wire-compatible with the x402 v1 envelope so
// any real x402 client can pay us byte-faithfully, without a heavy, wrong-chain dependency.
// Zero new npm packages: express + node:Buffer + zod, all already in-tree.
//
// V1 vs V2 (14-RESEARCH.md Pitfall 2): live facilitators speak v1 (`x402Version: 1`,
// `maxAmountRequired`, flat `description`/`mimeType`). v2 renames `maxAmountRequired`→`amount`
// and nests `resource`. ALL v1 field mapping is isolated to `buildAccepts` so a v2 flip is a
// one-function change; confirm the FTP facilitator's version at UAT.
//
// PRIMARY INVARIANT (Pitfall 1): the FIRST line of the handler is `if (!opts.enabled) return
// next()` — with metering OFF the gate is a byte-identical no-op, so the §4 money-shot demo
// (clears $100.00) is untouched.
//
// SECRET DISCIPLINE (Pitfall 4): every error path routes through `send402` with an authored,
// secret-free reason; the gate NEVER throws raw and NEVER interpolates the attacker-controlled
// `X-PAYMENT` header, an operator token, `ANTHROPIC_API_KEY`, or a facilitator key into any
// 402 body or the `X-PAYMENT-RESPONSE` header.

import type { Request, Response, RequestHandler } from 'express'
import { z } from 'zod'

// ── Wire types (x402 v1) ────────────────────────────────────────────────────

// A single entry in the 402 `accepts[]` array (14-RESEARCH.md §1).
export interface PaymentRequirements {
  scheme: string
  network: string
  maxAmountRequired: string // atomic units, decimal STRING (v1 name — NOT the v2 `amount`)
  asset: string
  payTo: string
  resource: string
  description: string
  mimeType?: string
  outputSchema?: unknown | null
  maxTimeoutSeconds: number
  extra?: Record<string, unknown>
}

// The full 402 response body.
export interface PaymentRequirementsResponse {
  x402Version: 1
  error: string
  accepts: PaymentRequirements[]
}

// Umbra's `self`-scheme payment payload (14-RESEARCH.md §2). Umbra-defined (A6) — the payer
// presents its fee-source Holding cid; `validBefore`/`nonce` drive the expiry/replay guard.
// `validBefore` is a unix epoch in MILLISECONDS (documented scale; compared against Date.now).
export interface SelfPaymentPayload {
  from: string
  to: string
  value: string // atomic units, decimal STRING
  instrument: string
  holdingCid: string
  validBefore: number
  nonce: string
}

// The base64-JSON `X-PAYMENT` header decoded (14-RESEARCH.md §2).
export interface PaymentPayload {
  x402Version: 1
  scheme: string
  network: string
  payload: SelfPaymentPayload
}

// The base64-JSON `X-PAYMENT-RESPONSE` header (14-RESEARCH.md §3).
export interface SettlementResponse {
  success: boolean
  errorReason?: string
  transaction: string // Canton update/settlement ref ("" on failure)
  network: string
  payer: string
}

// ── Secret-free reason constants (14-RESEARCH.md §"Standard error-reason strings") ──
export const X402_REASON = {
  invalid_payload: 'invalid_payload',
  wrong_instrument: 'wrong_instrument',
  amount_too_low: 'amount_too_low',
  payment_expired: 'payment_expired',
  nonce_replayed: 'nonce_replayed',
  // CR-01: the caller did not present a verifiable identity that controls the fee source. Used
  // by the `self` operator-custody backend, which has NO on-ledger payer signature and so MUST
  // authenticate the caller before moving funds (never trust the attacker-controlled `from`).
  unauthorized_payer: 'unauthorized_payer',
  invalid_holding: 'invalid_holding',
  // LO-04: a previously-spent holdingCid re-presented within its replay-guard window. DISTINCT
  // from invalid_holding ("never a valid fee source") so a client/operator can tell a replay
  // apart from a genuinely bad cid (mirrors nonce_replayed vs invalid_payload).
  holding_replayed: 'holding_replayed',
  insufficient_funds: 'insufficient_funds',
} as const

export type X402Reason = (typeof X402_REASON)[keyof typeof X402_REASON]

// The set of reasons the gate is willing to echo. A facilitator-supplied reason is only
// forwarded if it is one of these (else collapsed to invalid_payload) so a misbehaving or
// compromised backend cannot leak a secret through its reason string.
const ALLOWED_REASONS: ReadonlySet<string> = new Set(Object.values(X402_REASON))

// A typed, secret-free gate error: carries ONLY a reason code — never the raw header.
export class X402Error extends Error {
  constructor(public readonly reason: X402Reason) {
    super(reason) // message === the constant reason code (secret-free by construction)
    this.name = 'X402Error'
  }
}

// ── Atomic-units mapping (Pitfall 6) ────────────────────────────────────────
// USDCx / the fee is priced with 2 decimal places (minor units). Keep the scale in ONE place.
const ATOMIC_DECIMALS = 2
const ATOMIC_SCALE = 10 ** ATOMIC_DECIMALS // 100

// Decimal fee string → atomic-units string. toAtomic('1.00') === '100'.
export const toAtomic = (decimal: string): string =>
  String(Math.round(Number(decimal) * ATOMIC_SCALE))

// Atomic-units string → decimal number. fromAtomic('100') === 1.
export const fromAtomic = (atomic: string): number => Number(atomic) / ATOMIC_SCALE

// ── zod schema for the decoded X-PAYMENT (V5 input validation, Pitfall Malformed/oversized) ──
// `.strict()` on BOTH the outer object and the nested payload; bounded string lengths so a
// hostile client cannot smuggle an oversized/extra field past the parse.
const selfPaymentPayloadSchema = z
  .object({
    from: z.string().min(1).max(256),
    to: z.string().min(1).max(256),
    value: z.string().min(1).max(64),
    instrument: z.string().min(1).max(64),
    holdingCid: z.string().min(1).max(256),
    validBefore: z.number().int().nonnegative(),
    nonce: z.string().min(1).max(128),
  })
  .strict()

export const paymentPayloadSchema = z
  .object({
    x402Version: z.literal(1),
    scheme: z.string().min(1).max(64),
    network: z.string().min(1).max(128),
    payload: selfPaymentPayloadSchema,
  })
  .strict()

// Max base64 `X-PAYMENT` header length — a DoS bound before we even decode.
const MAX_HEADER_LEN = 8192

// ── Pure envelope helpers ───────────────────────────────────────────────────

// buildAccepts — the v1 field mapping, ISOLATED here (a v2 flip is this one function).
// MD-04: the advertised accepts[] MUST match the configured backend's actual settle capability.
//  • self       → only operator-custody USDCx Holdings can settle (`verify` rejects any non-USDCx
//                 Holding as wrong_instrument), so advertise ONLY the USDCx-self entry. Advertising
//                 an unpayable CantonCoin primary makes a spec-conformant client try accepts[0]
//                 (CantonCoin) first and always get rejected — metered access looks broken.
//  • canton-cc  → real $CC via the FTP facilitator, so advertise the CantonCoin scheme.
//  • undefined  → legacy/no-backend callers (unit tests) keep the both-entries envelope
//                 (Canton primary + USDCx-self second) for backward compatibility.
export const buildAccepts = (
  opts: X402Options,
  req: { originalUrl: string },
): PaymentRequirements[] => {
  const maxAmountRequired = toAtomic(opts.price)
  const resource = req.originalUrl
  const maxTimeoutSeconds = opts.maxTimeoutSeconds ?? 60
  const description = opts.description ?? 'Umbra AI solver — metered access'

  const canton: PaymentRequirements = {
    scheme: 'exact',
    network: opts.network,
    maxAmountRequired,
    asset: opts.asset,
    payTo: opts.payTo,
    resource,
    description,
    mimeType: 'application/json',
    outputSchema: null,
    maxTimeoutSeconds,
    // Canton scheme extras are per the FTP scheme (not yet published upstream — UAT).
    extra: { scheme: 'canton-exact' },
  }

  const usdcxSelf: PaymentRequirements = {
    scheme: 'exact',
    network: opts.network,
    maxAmountRequired,
    asset: 'USDCx',
    payTo: opts.payTo,
    resource,
    // Custody-honesty label (load-bearing): custodian-executed on presented authorization.
    description:
      'operator-custody x402 — custodian-executed on presented authorization; payer-signed is the canton-cc path',
    mimeType: 'application/json',
    outputSchema: null,
    maxTimeoutSeconds,
    extra: { custody: 'operator', instrument: 'USDCx' },
  }

  // MD-04: advertise ONLY the scheme the configured backend can actually settle.
  if (opts.backend === 'self') return [usdcxSelf]
  if (opts.backend === 'canton-cc') return [canton]
  return [canton, usdcxSelf]
}

// decodePayment — base64 → JSON.parse → zod .strict parse. Any failure throws an X402Error
// carrying ONLY a reason code (never the raw, attacker-controlled header).
export const decodePayment = (header: string): PaymentPayload => {
  if (typeof header !== 'string' || header.length === 0 || header.length > MAX_HEADER_LEN) {
    throw new X402Error(X402_REASON.invalid_payload)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  } catch {
    throw new X402Error(X402_REASON.invalid_payload)
  }
  const result = paymentPayloadSchema.safeParse(parsed)
  if (!result.success) throw new X402Error(X402_REASON.invalid_payload)
  return result.data
}

// encodePaymentResponse — base64(JSON) of the settlement, for the X-PAYMENT-RESPONSE header.
export const encodePaymentResponse = (settlement: SettlementResponse): string =>
  Buffer.from(JSON.stringify(settlement)).toString('base64')

// constructSelfPayment — a secret-free base64 X-PAYMENT builder (tests + the optional web
// affordance, CONTEXT Area 4). Round-trips through decodePayment.
export const constructSelfPayment = (args: {
  from: string
  to: string
  value: string
  holdingCid: string
  network: string
  validBefore: number
  nonce: string
  instrument?: string
}): string => {
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: args.network,
    payload: {
      from: args.from,
      to: args.to,
      value: args.value,
      instrument: args.instrument ?? 'USDCx',
      holdingCid: args.holdingCid,
      validBefore: args.validBefore,
      nonce: args.nonce,
    },
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

// ── FacilitatorClient interface (implemented by Plan 02: self | canton-cc) ──
export interface FacilitatorClient {
  // CR-01: `authenticatedPayer` (when supplied by the gate) is the party the CALLER proved it
  // controls (via its verified party token). The `self` backend MUST bind the fee source to this
  // identity — the claimed `payment.payload.from` is unauthenticated and NEVER authorizes a move.
  // The `canton-cc` backend ignores it (its payer authz is the facilitator's own signature check).
  verify(
    requirements: PaymentRequirements,
    payment: PaymentPayload,
    authenticatedPayer?: string,
  ): Promise<{ valid: boolean; reason?: string }>
  settle(
    requirements: PaymentRequirements,
    payment: PaymentPayload,
  ): Promise<{ settled: boolean; txRef: string }>
}

// ── Payer authentication port (CR-01) ────────────────────────────────────────
// Given the metered request, return the party the caller has PROVEN it controls (from its
// verified party token — the same dev HS256 / OIDC token the JSON API uses), or null when no
// verifiable identity is presented. The gate binds the `self` fee-payer to this value so a
// forged `from` can never seize a victim's Holding. Sync or async (a token verify may be async).
export type PayerAuthenticator = (req: Request) => string | null | Promise<string | null>

// ── Gate options + bundle ───────────────────────────────────────────────────
export interface X402Options {
  // Default-OFF invariant: when false the gate is a byte-identical no-op.
  enabled: boolean
  // MD-04 / CR-01: the settlement backend the gate is fronting. Drives (a) which accepts[]
  // scheme is advertised (buildAccepts) and (b) whether payer AUTHENTICATION is REQUIRED (the
  // `self` operator-custody backend has no on-ledger payer signature, so the caller MUST prove
  // control of the fee source via an authenticated party token — see authenticatePayer). Absent
  // ⇒ legacy no-backend behavior (both accepts entries; no auth enforced) for unit tests.
  backend?: 'self' | 'canton-cc'
  network: string
  asset: string
  price: string // decimal fee string (e.g. '1.00'); atomic-encoded via toAtomic
  payTo: string // the venue party id
  description?: string
  maxTimeoutSeconds?: number
  // Clock injection for deterministic expiry/TTL tests. Defaults to Date.now.
  now?: () => number
  // Replay-guard entry lifetime in ms (spent nonce / holdingCid). Default 5 min.
  nonceTtlMs?: number
  // CR-01: authenticate the caller and resolve the fee-payer party. REQUIRED (enforced) when
  // backend === 'self'; when absent under `self` every metered request is rejected
  // unauthorized_payer (fail-closed — never move funds on an unauthenticated `from`).
  authenticatePayer?: PayerAuthenticator
}

// Mirrors `Idempotency` (idempotency.ts:49) — the DI-defaulted middleware bundle.
export interface PaymentGate {
  middleware: RequestHandler
}

const DEFAULT_NONCE_TTL_MS = 5 * 60 * 1000

// A tiny TTL-bounded "spent set" (Map<value, expiryTs>) — the replay guard for spent nonces
// and consumed fee-Holding cids. Single-instance in-memory; a documented Postgres swap is the
// multi-instance path (mirrors idempotency.ts's store note).
interface TtlSet {
  has(value: string): boolean
  // MD-01: `minExpiry` (a unix-ms floor) keeps an entry alive AT LEAST until the payment it
  // guards can no longer be valid — so a nonce/cid is never TTL-evicted while its own payment
  // is still within its validity window and thus replayable.
  add(value: string, minExpiry?: number): void
}

const createTtlSet = (ttlMs: number, now: () => number): TtlSet => {
  const seen = new Map<string, number>()
  return {
    has(value) {
      const expiry = seen.get(value)
      if (expiry === undefined) return false
      if (now() > expiry) {
        seen.delete(value)
        return false
      }
      return true
    },
    add(value, minExpiry) {
      const t = now()
      // Opportunistic sweep of expired entries to bound memory.
      for (const [k, expiry] of seen) if (t > expiry) seen.delete(k)
      // MD-01: expire no sooner than the payment's own validity floor (default TTL otherwise).
      seen.set(value, Math.max(t + ttlMs, minExpiry ?? 0))
    },
  }
}

// Emit a 402 re-advertise. `error` MUST be an authored, secret-free reason — never a token,
// key, raw error text, or the attacker-controlled header.
const send402 = (res: Response, accepts: PaymentRequirements[], error: string): void => {
  res.status(402).json({ x402Version: 1, error, accepts } satisfies PaymentRequirementsResponse)
}

// Only forward a facilitator reason if it is a known secret-free constant.
const safeReason = (reason?: string): X402Reason =>
  reason && ALLOWED_REASONS.has(reason) ? (reason as X402Reason) : X402_REASON.invalid_payload

// The gate factory: bind a facilitator + options to an Express handler. Each instance owns its
// own module-private replay-guard sets (TTL-bounded), mirroring idempotency.ts's private store.
export const x402Gate = (facilitator: FacilitatorClient, opts: X402Options): RequestHandler => {
  const now = opts.now ?? Date.now
  const ttlMs = opts.nonceTtlMs ?? DEFAULT_NONCE_TTL_MS
  // MD-01: the acceptance window for a payment's validBefore. A payment may not declare a
  // validity farther out than this, so a spent nonce/cid (kept alive until validBefore) is
  // never TTL-evicted while still replayable.
  const maxTimeoutMs = (opts.maxTimeoutSeconds ?? 60) * 1000
  const spentNonces = createTtlSet(ttlMs, now)
  const spentHoldings = createTtlSet(ttlMs, now)

  return (req, res, next): void => {
    // PRIMARY INVARIANT (Pitfall 1): default-OFF pass-through — FIRST line, byte-unchanged.
    if (!opts.enabled) return next()

    // Build `resource` from req.originalUrl — NEVER req.params.id (Pitfall 3: /competing's
    // roundId is in the BODY, not the path).
    const requirements = buildAccepts(opts, req)

    const header = req.header('X-PAYMENT')
    if (!header) return void send402(res, requirements, 'X-PAYMENT header is required')

    let payment: PaymentPayload
    try {
      payment = decodePayment(header)
    } catch {
      // decodePayment only ever throws X402Error(invalid_payload); never echo the header.
      return void send402(res, requirements, X402_REASON.invalid_payload)
    }

    const p = payment.payload

    // Expiry + replay guards (Pitfall 5) — cheap synchronous checks before any settle.
    if (!(p.validBefore > now())) return void send402(res, requirements, X402_REASON.payment_expired)
    // MD-01: reject a validBefore beyond the acceptance window. Without this a client could
    // declare validity arbitrarily far out; once the spent-set TTL evicts the nonce/cid the
    // IDENTICAL header would replay while the payment is still "valid".
    if (p.validBefore > now() + maxTimeoutMs) {
      return void send402(res, requirements, X402_REASON.payment_expired)
    }
    if (spentNonces.has(p.nonce)) return void send402(res, requirements, X402_REASON.nonce_replayed)
    if (spentHoldings.has(p.holdingCid)) {
      // LO-04: a re-presented spent holdingCid is a REPLAY, not an invalid fee source.
      return void send402(res, requirements, X402_REASON.holding_replayed)
    }

    // Select the accepts entry matching the presented instrument (else the Canton primary).
    const chosen = requirements.find((a) => a.asset === p.instrument) ?? requirements[0]

    // authenticate → verify → serve → settle-on-2xx, delegated to the injected facilitator. Every
    // failure → send402; the gate never throws raw and never lets a token/key/raw-error reach the
    // client (Pitfall 4). HI-01: settlement is the LAST step and only fires on a 2xx handler.
    void (async () => {
      try {
        // CR-01: the `self` operator-custody backend has NO on-ledger payer signature — the
        // claimed `from`/`holdingCid` are attacker-controlled header fields. Authenticate the
        // CALLER via its party token and bind the fee-payer to that VERIFIED identity; NEVER move
        // funds on an unauthenticated claimed `from`. Fail-closed: no authenticator or no valid
        // token ⇒ reject (an attacker cannot mint the victim's token — the secret is server-side).
        // (canton-cc is not gated here: its payer authorization is the facilitator's own signature.)
        let authedPayer: string | undefined
        if (opts.backend === 'self') {
          const authed = opts.authenticatePayer ? await opts.authenticatePayer(req) : null
          if (!authed) return void send402(res, requirements, X402_REASON.unauthorized_payer)
          // A presented `from` MUST equal the authenticated caller (no paying from another's id).
          if (p.from && p.from !== authed) {
            return void send402(res, requirements, X402_REASON.unauthorized_payer)
          }
          authedPayer = authed
        }

        // HI-01: VERIFY only (no fund movement), then run the wrapped handler, and SETTLE
        // (move funds) ONLY IF the handler responds 2xx. Settling before the handler charged the
        // payer even when the handler then 404s/5xx'd (e.g. a bogus/expired round) — irreversible
        // fee, no compute, no refund. verify is the cheap no-move pre-check; settle is now the
        // LAST step, gated on a serviceable 2xx response.
        const verified = await facilitator.verify(chosen, payment, authedPayer)
        if (!verified.valid) return void send402(res, requirements, safeReason(verified.reason))

        // Intercept the handler's terminal res.json to interpose settlement. A 2xx ⇒ settle, set
        // the X-PAYMENT-RESPONSE header, burn the nonce/cid, then flush the body. A 4xx/5xx ⇒ do
        // NOT settle (payer not charged) and flush the handler's error body unchanged. The send is
        // DEFERRED until settle resolves so the header lands before the body is written.
        const originalJson = res.json.bind(res)
        let interposed = false
        res.json = (bodyOut: unknown): Response => {
          if (interposed) return originalJson(bodyOut)
          interposed = true
          const status = res.statusCode
          if (!(status >= 200 && status < 300)) {
            // Handler failed → charge nothing, move nothing. Flush the handler's response as-is.
            return originalJson(bodyOut)
          }
          void (async () => {
            try {
              const settled = await facilitator.settle(chosen, payment)
              if (!settled.settled) {
                // Could not settle a serviceable response (e.g. the fee source was double-spent
                // between verify and settle) → re-advertise 402; do NOT serve the metered body.
                res.status(402)
                return void originalJson({
                  x402Version: 1,
                  error: X402_REASON.insufficient_funds,
                  accepts: requirements,
                } satisfies PaymentRequirementsResponse)
              }
              // Success: burn the nonce + holdingCid so a resend is rejected. MD-01: keep each
              // spent entry alive until at least the payment's own validBefore (never forgotten
              // while replayable).
              spentNonces.add(p.nonce, p.validBefore)
              spentHoldings.add(p.holdingCid, p.validBefore)
              res.setHeader(
                'X-PAYMENT-RESPONSE',
                encodePaymentResponse({
                  success: true,
                  transaction: settled.txRef,
                  network: opts.network,
                  // CR-01: report the AUTHENTICATED payer (self); claimed `from` only for non-self.
                  payer: authedPayer ?? p.from,
                }),
              )
              originalJson(bodyOut)
            } catch {
              // A settle throw AFTER a 2xx: re-advertise secret-free; the metered body is withheld.
              res.status(402)
              originalJson({
                x402Version: 1,
                error: X402_REASON.invalid_payload,
                accepts: requirements,
              } satisfies PaymentRequirementsResponse)
            }
          })()
          return res
        }
        next()
      } catch {
        // A facilitator throw is collapsed to a secret-free reason — never surfaced raw.
        send402(res, requirements, X402_REASON.invalid_payload)
      }
    })()
  }
}

// A never-settling stub facilitator. A DISABLED gate never calls it (the first handler line
// is `if (!opts.enabled) return next()`), so this only exists to keep the disabled-only
// `createX402Gate({ enabled: false })` construction fully self-contained (Plan 03 DI default).
const NOOP_FACILITATOR: FacilitatorClient = {
  verify: async () => ({ valid: false, reason: X402_REASON.invalid_payload }),
  settle: async () => ({ settled: false, txRef: '' }),
}

// Create a payment-gate unit: a middleware bound to the facilitator + options (mirrors
// createIdempotency). Consumed by the boot wiring in Plan 03.
//
// The `facilitator` + the non-`enabled` options are OPTIONAL so a DISABLED no-op gate can be
// built with just `createX402Gate({ enabled: false })` — the DI default api.ts installs when
// no gate is injected (the primary default-OFF invariant). When metering is enabled main()
// passes the real facilitator + full options.
export const createX402Gate = (
  args: { facilitator?: FacilitatorClient } & Partial<X402Options> & { enabled: boolean },
): PaymentGate => {
  const { facilitator, ...rest } = args
  const opts: X402Options = {
    enabled: rest.enabled,
    backend: rest.backend,
    network: rest.network ?? '',
    asset: rest.asset ?? '',
    price: rest.price ?? '0',
    payTo: rest.payTo ?? '',
    description: rest.description,
    maxTimeoutSeconds: rest.maxTimeoutSeconds,
    now: rest.now,
    nonceTtlMs: rest.nonceTtlMs,
    authenticatePayer: rest.authenticatePayer,
  }
  return { middleware: x402Gate(facilitator ?? NOOP_FACILITATOR, opts) }
}
