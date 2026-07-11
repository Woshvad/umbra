// solver/src/facilitator.ts — PAY-01 the x402 FacilitatorClient backends (self | canton-cc).
//
// This module implements the settlement swap behind the `FacilitatorClient` interface (defined
// in x402.ts, Plan 01): a single `verify`+`settle` contract with a SWAPPABLE backend selected
// by config — the SAME interface-with-backend-select discipline as secrets.ts (env|vault) and
// the drand|offline split of tlock.ts. The gate (x402.ts) carries zero ledger/secret concerns;
// all of that lives here.
//
//   • `self` (DEFAULT — DevNet-capable TODAY): verifies + settles the fee ON Umbra's own
//     Canton ledger in operator-custody USDCx. verify runs the fee-source predicate
//     (owner===payer + USDCx + unlocked + amount ≥ price — the gatherHoldingCids shape); settle
//     moves EXACTLY `price` of the presented Holding to the venue via the operator-authority
//     `moveFee` (reused Holding Split/Reassign — NO new Daml). The ledger surface is INJECTED
//     as a `FacilitatorLedger` port so tests stub it and index.ts wires ledger.ts in (Plan 03).
//
//   • `canton-cc` (offline-mocked; live = UAT): speaks the GENERIC x402 `/verify`+`/settle`
//     HTTP contract (14-RESEARCH.md §4/§5) to the FTP facilitator for real Canton Coin. The
//     transport is an INJECTABLE `fetchImpl` (the tlock.ts stubbed-client seam) so tests drive
//     it against a mock; the network/asset/URL are ENV-DRIVEN — NO hard-coded Canton CAIP-2 id
//     and NO hard-coded facilitator hostname live in this file.
//
// CUSTODY HONESTY (load-bearing, mirrors tlock.ts OFFLINE_FALLBACK_LABEL): the `self` backend
// is a custodian-executed move on the payer's PRESENTED authorization, NOT a payer-signed
// transfer — SELF_CUSTODY_LABEL states this plainly so no UI can over-claim.
//
// SECRET DISCIPLINE (mirrors secrets.ts / ledger.ts): the `canton-cc` facilitator key rides
// ONLY the `Authorization` request header; it is held by the closure, NEVER returned in a
// result object, NEVER logged, NEVER echoed. A non-2xx facilitator response collapses to a
// STATUS-ONLY secret-free reason (the secrets.ts `Vault HTTP ${status}` precedent) — the
// response body (which could carry internals) is deliberately not read into the reason.

import { z } from 'zod'
import type { FacilitatorClient, PaymentPayload, PaymentRequirements } from './x402.js'
import { fromAtomic, X402_REASON } from './x402.js'

// ── The honest custody label (required in code + any UI) ────────────────────────────
export const SELF_CUSTODY_LABEL =
  'operator-custody x402 — custodian-executed on presented authorization; the payer-signed variant is the canton-cc path'

// The operator-custody fee instrument the `self` backend accepts (matches ledger.ts CASH_SYMBOL).
const DEFAULT_CASH_INSTRUMENT = 'USDCx'

// ── HoldingRecord: the secret-free Holding projection ledger.listHoldings returns ──────
// Structural — identical to ledger.ts HoldingRecord (kept here so facilitator.ts has no
// import-time dependency on ledger.ts, which reads the operator credential at module load).
export interface HoldingRecord {
  contractId: string
  owner: string
  instrumentId: string
  amount: number
  locked: boolean
}

// ── FacilitatorLedger: the thin ledger PORT the `self` backend needs (ledger.ts implements it) ──
export interface FacilitatorLedger {
  listHoldings(): Promise<HoldingRecord[]>
  moveFee(holdingCid: string, qty: number, newOwner: string): Promise<string>
}

// ── FacilitatorConfig: the backend selector + per-backend dependencies ──────────────
export interface FacilitatorConfig {
  // Defaults to 'self' (mirrors createSecretsProvider's `?? 'env'`).
  backend?: 'self' | 'canton-cc'
  // self backend: the injected ledger port (ledger.ts listHoldings/moveFee in Plan 03).
  ledger?: FacilitatorLedger
  // canton-cc backend: env-driven base URL + the module-private facilitator key.
  facilitatorUrl?: string
  facilitatorKey?: string
  // Injectable transport for canton-cc (tests stub it; production omits → global fetch).
  fetchImpl?: typeof fetch
  // The self-backend fee instrument (defaults to USDCx).
  cashInstrument?: string
}

// ── self backend — on-ledger verify/settle ──────────────────────────────────────────
// verify: resolve the presented holdingCid from the ledger and run the fee-source predicate.
//   valid iff owner===AUTHENTICATED payer (CR-01 — NOT the unsigned claimed `from`) AND
//   instrumentId===cashInstrument AND !locked AND amount ≥ fromAtomic(requirements.maxAmountRequired).
//   Reject reasons (secret-free): invalid_holding (missing / wrong-owner / locked),
//   wrong_instrument, amount_too_low.
// settle: moveFee(presented cid, the price, requirements.payTo) → { settled:true, txRef }; a
//   moveFee throw collapses to { settled:false, txRef:'' } so the gate cleanly re-advertises.
const selfFacilitator = (ledger: FacilitatorLedger, cashInstrument: string): FacilitatorClient => ({
  async verify(requirements, payment, authenticatedPayer) {
    const p = payment.payload
    const holdings = await ledger.listHoldings()
    const h = holdings.find((x) => x.contractId === p.holdingCid)
    // CR-01: the fee source MUST be owned by the AUTHENTICATED caller (the party the gate proved
    // via its verified token) — NOT the attacker-controlled, unsigned claimed `from`. A missing
    // authenticated identity, or a Holding owned by anyone other than that caller, is not a
    // movable fee source. Missing / wrong-owner / locked all collapse to invalid_holding (T-14-06).
    if (!h || !authenticatedPayer || h.owner !== authenticatedPayer || h.locked) {
      return { valid: false, reason: X402_REASON.invalid_holding }
    }
    if (h.instrumentId !== cashInstrument) {
      return { valid: false, reason: X402_REASON.wrong_instrument }
    }
    // LO-02: the payer's declared `value` MUST equal the charged price (atomic units). Otherwise
    // `value` is decorative — a client that declares a different amount is silently charged the
    // full price. Compare atomic-unit STRINGS (never reconstructed floats — LO-03 discipline).
    if (p.value.trim() !== requirements.maxAmountRequired.trim()) {
      return { valid: false, reason: X402_REASON.amount_too_low }
    }
    const need = fromAtomic(requirements.maxAmountRequired)
    if (!(h.amount >= need)) {
      return { valid: false, reason: X402_REASON.amount_too_low }
    }
    return { valid: true }
  },
  async settle(requirements, payment) {
    const need = fromAtomic(requirements.maxAmountRequired)
    try {
      const txRef = await ledger.moveFee(payment.payload.holdingCid, need, requirements.payTo)
      return { settled: true, txRef }
    } catch {
      // The ledger error is NOT surfaced (secret-free) — the gate re-advertises on !settled.
      return { settled: false, txRef: '' }
    }
  },
})

// ── canton-cc backend — the generic FTP facilitator /verify + /settle contract ──────
// Response schemas (14-RESEARCH.md §4/§5), zod-parsed so a malformed body never crashes the
// gate. Optional fields tolerate the success-vs-error variants of each shape.
const verifyResponseSchema = z
  .object({
    isValid: z.boolean(),
    invalidReason: z.string().optional(),
    payer: z.string().optional(),
  })
  .passthrough()

const settleResponseSchema = z
  .object({
    success: z.boolean(),
    errorReason: z.string().optional(),
    transaction: z.string().optional(),
    network: z.string().optional(),
    payer: z.string().optional(),
  })
  .passthrough()

// A status-only, secret-free reason: only the `Facilitator HTTP <status>` throw carries the
// status; any other failure (a malformed body / network error) collapses to invalid_payload.
const statusReason = (e: unknown): string =>
  e instanceof Error && e.message.startsWith('Facilitator HTTP ') ? e.message : X402_REASON.invalid_payload

const cantonCcFacilitator = (url: string, key: string, fetchImpl: typeof fetch): FacilitatorClient => {
  // POST the pinned { x402Version, paymentPayload, paymentRequirements } body with the Bearer
  // header. The key lives ONLY in this header — never in the body, never returned, never logged.
  const post = async (
    path: '/verify' | '/settle',
    requirements: PaymentRequirements,
    payment: PaymentPayload,
  ): Promise<unknown> => {
    const res = await fetchImpl(`${url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`, // server-side ONLY; never returned/logged
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: payment,
        paymentRequirements: requirements,
      }),
      // MD-03: enforce the ADVERTISED maxTimeoutSeconds — a hung/slow facilitator must not hold
      // the gated client connection open unbounded. A timeout aborts the fetch, which rejects and
      // is caught by verify/settle → mapped to a secret-free reason (never the key/body).
      signal: AbortSignal.timeout((requirements.maxTimeoutSeconds ?? 60) * 1000),
    })
    if (!res.ok) {
      // Secret-free: the key is in the request header we just sent, NOT in this error; the
      // response body is deliberately not echoed (could carry internals) — status ONLY.
      throw new Error(`Facilitator HTTP ${res.status}`)
    }
    return res.json()
  }

  return {
    async verify(requirements, payment) {
      try {
        const body = verifyResponseSchema.parse(await post('/verify', requirements, payment))
        return body.isValid ? { valid: true } : { valid: false, reason: body.invalidReason }
      } catch (e) {
        return { valid: false, reason: statusReason(e) }
      }
    },
    async settle(requirements, payment) {
      try {
        const body = settleResponseSchema.parse(await post('/settle', requirements, payment))
        return body.success
          ? { settled: true, txRef: body.transaction ?? '' }
          : { settled: false, txRef: '' }
      } catch {
        // A non-2xx / malformed settle → not settled; the gate re-advertises (secret-free).
        return { settled: false, txRef: '' }
      }
    },
  }
}

// ── The factory: select the backend by config (default 'self') ──────────────────────
// Mirrors createSecretsProvider: an unrecognized value fails LOUD (secret-free) rather than
// silently degrading; each backend validates its required deps up front.
export const createFacilitator = (config: FacilitatorConfig): FacilitatorClient => {
  const backend = config.backend ?? 'self'
  const cashInstrument = config.cashInstrument ?? DEFAULT_CASH_INSTRUMENT
  switch (backend) {
    case 'self': {
      if (!config.ledger) {
        throw new Error("createFacilitator: backend 'self' requires a FacilitatorLedger port")
      }
      return selfFacilitator(config.ledger, cashInstrument)
    }
    case 'canton-cc': {
      if (!config.facilitatorUrl || !config.facilitatorKey) {
        throw new Error(
          "createFacilitator: backend 'canton-cc' requires facilitatorUrl + facilitatorKey",
        )
      }
      const fetchImpl = config.fetchImpl ?? fetch
      // Strip a trailing slash so `${url}/verify` never double-slashes.
      return cantonCcFacilitator(config.facilitatorUrl.replace(/\/+$/, ''), config.facilitatorKey, fetchImpl)
    }
    default:
      throw new Error(`Unknown X402_FACILITATOR: ${backend} (expected 'self' or 'canton-cc')`)
  }
}
