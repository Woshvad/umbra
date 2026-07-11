// solver/src/x402.test.ts — the PAY-01 x402 gate + wire-envelope proof, OFFLINE.
//
// Two layers:
//   1. Pure helpers (buildAccepts / decodePayment / encodePaymentResponse /
//      constructSelfPayment / toAtomic / fromAtomic) — the x402 v1 wire vocabulary,
//      pinned verbatim from 14-RESEARCH.md §"The x402 Wire Format".
//   2. The default-OFF gate middleware, driven on a throwaway express app (listen(0))
//      via global fetch — mirroring idempotency.test.ts so express.json() ordering and
//      per-route attachment are exercised exactly as in production.
//
// The load-bearing invariant proven here is Pitfall 1: with metering OFF the gate is a
// byte-identical no-op, so the §4 money-shot demo is untouched.

import { describe, it, expect, afterEach, vi } from 'vitest'
import express, { type Express } from 'express'
import type { Server } from 'node:http'
import {
  buildAccepts,
  decodePayment,
  encodePaymentResponse,
  constructSelfPayment,
  toAtomic,
  fromAtomic,
  x402Gate,
  createX402Gate,
  X402_REASON,
  type X402Options,
  type FacilitatorClient,
  type SettlementResponse,
} from './x402.js'

let server: Server | undefined

// Boot a throwaway express app on an ephemeral port; returns its base URL.
const start = (build: (app: Express) => void): Promise<string> =>
  new Promise((resolve) => {
    const app = express()
    app.use(express.json())
    build(app)
    server = app.listen(0, () => {
      const addr = server!.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(`http://127.0.0.1:${port}`)
    })
  })

afterEach(
  () =>
    new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve())
        server = undefined
      } else resolve()
    }),
)

// ── shared test doubles ─────────────────────────────────────────────────────
const baseOpts = (over?: Partial<X402Options>): X402Options => ({
  enabled: true,
  network: 'canton:devnet',
  asset: 'CantonCoin',
  price: '1.00',
  payTo: 'venue::1220deadbeef',
  ...over,
})

const okFacilitator = (over?: Partial<FacilitatorClient>): FacilitatorClient => ({
  verify: async () => ({ valid: true }),
  settle: async () => ({ settled: true, txRef: 'canton-update-0xabc' }),
  ...over,
})

const futureTs = () => Date.now() + 60_000
const decodeHeader = (b64: string): SettlementResponse =>
  JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
// fetch Response.json() is typed `unknown` under @types/node; narrow for assertions.
const body = async (r: { json: () => Promise<unknown> }): Promise<any> => r.json()

// ============================================================================
// Layer 1 — pure wire helpers (Task 1)
// ============================================================================
describe('x402 wire helpers', () => {
  it('buildAccepts builds a v1 402 envelope (Canton primary + USDCx-self second)', () => {
    const accepts = buildAccepts(baseOpts(), { originalUrl: '/round/R1/solve-preview' })
    expect(accepts).toHaveLength(2)

    // v1 field name: maxAmountRequired (NOT the v2 `amount`).
    expect(accepts[0]).toHaveProperty('maxAmountRequired')
    expect(accepts[0]).not.toHaveProperty('amount')
    expect(accepts[0].maxAmountRequired).toBe('100') // 1.00 → 100 atomic (2 dp)

    // primary = the real Canton scheme; second = the honestly-labeled USDCx self-settle.
    expect(accepts[0].scheme).toBe('exact')
    expect(accepts[0].asset).toBe('CantonCoin')
    expect(accepts[0].payTo).toBe('venue::1220deadbeef')
    expect(accepts[0].resource).toBe('/round/R1/solve-preview')

    expect(accepts[1].asset).toBe('USDCx')
    expect(accepts[1].extra).toMatchObject({ custody: 'operator', instrument: 'USDCx' })
  })

  it('MD-04 — buildAccepts is backend-aware (self ⇒ USDCx-only; canton-cc ⇒ CantonCoin-only)', () => {
    // self: only the operator-custody USDCx entry is payable, so it is the ONLY advertised scheme
    // (no unpayable CantonCoin primary a conformant client would try first and always get rejected).
    const self = buildAccepts(baseOpts({ backend: 'self' }), { originalUrl: '/round/R1/solve-preview' })
    expect(self).toHaveLength(1)
    expect(self[0].asset).toBe('USDCx')

    // canton-cc: real $CC via the FTP facilitator ⇒ advertise the CantonCoin scheme only.
    const cc = buildAccepts(baseOpts({ backend: 'canton-cc' }), { originalUrl: '/round/R1/solve-preview' })
    expect(cc).toHaveLength(1)
    expect(cc[0].asset).toBe('CantonCoin')

    // no backend (legacy/tests): the both-entries envelope is preserved (Canton primary + USDCx).
    const both = buildAccepts(baseOpts(), { originalUrl: '/round/R1/solve-preview' })
    expect(both).toHaveLength(2)
    expect(both[0].asset).toBe('CantonCoin')
    expect(both[1].asset).toBe('USDCx')
  })

  it('constructSelfPayment round-trips through decodePayment', () => {
    const header = constructSelfPayment({
      from: 'BankA::1220aaaa',
      to: 'venue::1220deadbeef',
      value: '100',
      holdingCid: 'cid-holding-abc',
      network: 'canton:devnet',
      validBefore: futureTs(),
      nonce: 'nonce-deadbeef',
    })
    const decoded = decodePayment(header)
    expect(decoded.x402Version).toBe(1)
    expect(decoded.scheme).toBe('exact')
    expect(decoded.network).toBe('canton:devnet')
    expect(decoded.payload.from).toBe('BankA::1220aaaa')
    expect(decoded.payload.value).toBe('100')
    expect(decoded.payload.holdingCid).toBe('cid-holding-abc')
    expect(decoded.payload.instrument).toBe('USDCx')
    expect(decoded.payload.nonce).toBe('nonce-deadbeef')
  })

  it('decodePayment rejects a malformed / non-base64 header with a secret-free reason', () => {
    const bad = 'this-is-not-valid-base64-json-@@@'
    try {
      decodePayment(bad)
      throw new Error('expected decodePayment to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toBe(X402_REASON.invalid_payload)
      // the raw (attacker-controlled) header must NEVER be echoed in the error.
      expect((err as Error).message).not.toContain(bad)
    }
  })

  it('decodePayment rejects an oversized header (DoS bound) with invalid_payload', () => {
    expect(() => decodePayment('A'.repeat(9000))).toThrowError(X402_REASON.invalid_payload)
  })

  it('decodePayment rejects a well-formed-but-wrong-shape payload (zod .strict)', () => {
    const rogue = Buffer.from(JSON.stringify({ x402Version: 1, scheme: 'exact' })).toString('base64')
    expect(() => decodePayment(rogue)).toThrowError(X402_REASON.invalid_payload)
  })

  it('toAtomic / fromAtomic scale a decimal fee ↔ atomic units at 2 dp', () => {
    expect(toAtomic('1.00')).toBe('100')
    expect(toAtomic('100.00')).toBe('10000')
    expect(fromAtomic('100')).toBe(1)
    expect(fromAtomic('10000')).toBe(100)
  })

  it('encodePaymentResponse base64-round-trips a SettlementResponse', () => {
    const settlement: SettlementResponse = {
      success: true,
      transaction: 'canton-update-0xabc',
      network: 'canton:devnet',
      payer: 'BankA::1220aaaa',
    }
    const decoded = decodeHeader(encodePaymentResponse(settlement))
    expect(decoded).toEqual(settlement)
  })
})

// ============================================================================
// Layer 2 — the default-OFF gate middleware (Task 2)
// ============================================================================
describe('x402 gate middleware', () => {
  it('off unchanged — a gated route with metering OFF responds byte-identically to an un-gated route', async () => {
    const gate = x402Gate(okFacilitator(), baseOpts({ enabled: false }))
    const handler = (_req: express.Request, res: express.Response) =>
      res.status(200).json({ preview: 'ok', clearingPrice: 100 })
    const base = await start((app) => {
      app.get('/gated', gate, handler)
      app.get('/plain', handler)
    })

    const rg = await fetch(`${base}/gated`)
    const rp = await fetch(`${base}/plain`)

    expect(rg.status).toBe(rp.status)
    expect(rg.status).toBe(200)
    expect(await rg.text()).toBe(await rp.text()) // byte-identical body
    expect(rg.headers.get('x-payment-response')).toBeNull() // no gate side effect
  })

  it('402 envelope — metering on + no X-PAYMENT ⇒ 402 with a Canton primary + USDCx-self accepts[]', async () => {
    const base = await start((app) => {
      app.get('/solve', x402Gate(okFacilitator(), baseOpts()), (_req, res) => res.json({ ran: true }))
    })
    const r = await fetch(`${base}/solve`)
    expect(r.status).toBe(402)
    const j = await body(r)
    expect(j.x402Version).toBe(1)
    expect(typeof j.error).toBe('string')
    expect(Array.isArray(j.accepts)).toBe(true)
    expect(j.accepts[0].asset).toBe('CantonCoin')
    expect(j.accepts[0].maxAmountRequired).toBe('100')
    expect(j.accepts[1].asset).toBe('USDCx')
  })

  it('402 then 200 — a valid X-PAYMENT drives verify→settle→handler + sets X-PAYMENT-RESPONSE', async () => {
    let ran = 0
    const base = await start((app) => {
      app.get('/solve', x402Gate(okFacilitator(), baseOpts()), (_req, res) => {
        ran += 1
        res.json({ ran })
      })
    })

    // no header → 402
    expect((await fetch(`${base}/solve`)).status).toBe(402)
    expect(ran).toBe(0)

    // with a valid payment → 200 + settlement header
    const xpay = constructSelfPayment({
      from: 'BankA::1220aaaa',
      to: 'venue::1220deadbeef',
      value: '100',
      holdingCid: 'cid-1',
      network: 'canton:devnet',
      validBefore: futureTs(),
      nonce: 'nonce-1',
    })
    const r = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': xpay } })
    expect(r.status).toBe(200)
    expect(ran).toBe(1)

    const settleHeader = r.headers.get('x-payment-response')
    expect(settleHeader).toBeTruthy()
    const settlement = decodeHeader(settleHeader!)
    expect(settlement.success).toBe(true)
    expect(settlement.payer).toBe('BankA::1220aaaa')
    expect(settlement.transaction).toBe('canton-update-0xabc')
    expect(settlement.network).toBe('canton:devnet')
  })

  it('reject ladder — absent / malformed / expired / verify-invalid / replayed each 402 with a secret-free reason', async () => {
    const base = await start((app) => {
      app.get('/solve', x402Gate(okFacilitator(), baseOpts()), (_req, res) => res.json({ ran: true }))
      app.get(
        '/solve-bad',
        x402Gate(okFacilitator({ verify: async () => ({ valid: false, reason: X402_REASON.amount_too_low }) }), baseOpts()),
        (_req, res) => res.json({ ran: true }),
      )
    })

    // absent
    expect((await fetch(`${base}/solve`)).status).toBe(402)

    // malformed
    const rm = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': 'garbage-@@@' } })
    expect(rm.status).toBe(402)
    expect((await body(rm)).error).toBe(X402_REASON.invalid_payload)

    // expired (validBefore in the past)
    const expired = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-exp',
      network: 'canton:devnet', validBefore: Date.now() - 1_000, nonce: 'n-exp',
    })
    const re = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': expired } })
    expect(re.status).toBe(402)
    expect((await body(re)).error).toBe(X402_REASON.payment_expired)

    // verify-invalid (facilitator says no) → the facilitator's secret-free reason
    const good = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-bad',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-bad',
    })
    const rv = await fetch(`${base}/solve-bad`, { headers: { 'X-PAYMENT': good } })
    expect(rv.status).toBe(402)
    expect((await body(rv)).error).toBe(X402_REASON.amount_too_low)

    // replayed nonce — pay once, resend the identical payload
    const p = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-replay',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-replay',
    })
    expect((await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': p } })).status).toBe(200)
    const replay = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': p } })
    expect(replay.status).toBe(402)
    expect((await body(replay)).error).toBe(X402_REASON.nonce_replayed)
  })

  it('LO-04 — a re-presented spent holdingCid returns holding_replayed (distinct from invalid_holding)', async () => {
    const base = await start((app) => {
      app.get('/solve', x402Gate(okFacilitator(), baseOpts()), (_req, res) => res.json({ ran: true }))
    })
    const first = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-shared',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-1',
    })
    expect((await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': first } })).status).toBe(200)
    // SAME holdingCid, a FRESH nonce → the holding is already spent → holding_replayed (not invalid_holding).
    const second = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-shared',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-2',
    })
    const r = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': second } })
    expect(r.status).toBe(402)
    expect((await body(r)).error).toBe(X402_REASON.holding_replayed)
  })

  it('MD-01 — rejects a validBefore beyond the acceptance window (payment_expired)', async () => {
    const base = await start((app) => {
      app.get('/solve', x402Gate(okFacilitator(), baseOpts({ maxTimeoutSeconds: 60 })), (_req, res) => res.json({ ran: true }))
    })
    const p = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-far',
      network: 'canton:devnet', validBefore: Date.now() + 3_600_000, nonce: 'n-far',
    })
    const r = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': p } })
    expect(r.status).toBe(402)
    expect((await body(r)).error).toBe(X402_REASON.payment_expired)
  })

  it('MD-01 — a spent nonce is NOT forgotten before its validBefore, even past the base TTL', async () => {
    let t = 1_000_000
    const clock = (): number => t
    // A tiny 100ms base TTL: without the MD-01 floor the nonce would be evicted almost immediately.
    const gate = x402Gate(okFacilitator(), baseOpts({ now: clock, nonceTtlMs: 100, maxTimeoutSeconds: 60 }))
    const base = await start((app) => app.get('/solve', gate, (_req, res) => res.json({ ran: true })))

    const validBefore = t + 50_000 // within the 60s acceptance window, far beyond the 100ms TTL
    const p = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-md01',
      network: 'canton:devnet', validBefore, nonce: 'n-md01',
    })
    expect((await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': p } })).status).toBe(200)

    // Advance the clock well past the base TTL (100ms) but BEFORE validBefore: the nonce must
    // still be remembered, so the identical replay is caught (not silently re-accepted).
    t += 10_000
    const replay = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': p } })
    expect(replay.status).toBe(402)
    expect((await body(replay)).error).toBe(X402_REASON.nonce_replayed)
  })

  it('CR-01 — self backend rejects a spoofed `from` with no valid token (unauthorized_payer) and NEVER settles', async () => {
    const verify = vi.fn(async () => ({ valid: true })) // would pass if ever reached
    const settle = vi.fn(async () => ({ settled: true, txRef: 'x' }))
    const fac: FacilitatorClient = { verify, settle }
    // authenticatePayer returns null (no valid victim token) → reject BEFORE verify/settle.
    const gate = x402Gate(fac, baseOpts({ backend: 'self', authenticatePayer: () => null }))
    const base = await start((app) => app.get('/solve', gate, (_req, res) => res.json({ ran: true })))
    const xpay = constructSelfPayment({
      from: 'Victim::desk', to: 'venue::1', value: '100', holdingCid: 'victim-cid',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-cr01',
    })
    const r = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': xpay } })
    expect(r.status).toBe(402)
    expect((await body(r)).error).toBe(X402_REASON.unauthorized_payer)
    expect(verify).not.toHaveBeenCalled()
    expect(settle).not.toHaveBeenCalled() // the victim's funds are NEVER moved
  })

  it('CR-01 — self backend rejects a `from` that does not match the authenticated caller', async () => {
    const settle = vi.fn(async () => ({ settled: true, txRef: 'x' }))
    const fac: FacilitatorClient = { verify: async () => ({ valid: true }), settle }
    // Authenticated as BankA, but the payload claims from=BankB → unauthorized_payer.
    const gate = x402Gate(fac, baseOpts({ backend: 'self', authenticatePayer: () => 'BankA::desk' }))
    const base = await start((app) => app.get('/solve', gate, (_req, res) => res.json({ ran: true })))
    const xpay = constructSelfPayment({
      from: 'BankB::desk', to: 'venue::1', value: '100', holdingCid: 'cid-x',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-cr01b',
    })
    const r = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': xpay } })
    expect(r.status).toBe(402)
    expect((await body(r)).error).toBe(X402_REASON.unauthorized_payer)
    expect(settle).not.toHaveBeenCalled()
  })

  it('CR-01 — self backend passes the AUTHENTICATED party (not the claimed from) to verify', async () => {
    const verify = vi.fn(async () => ({ valid: true }))
    const fac: FacilitatorClient = { verify, settle: async () => ({ settled: true, txRef: 'tx-ok' }) }
    const gate = x402Gate(fac, baseOpts({ backend: 'self', authenticatePayer: () => 'BankA::desk' }))
    const base = await start((app) => app.get('/solve', gate, (_req, res) => res.json({ ran: true })))
    const xpay = constructSelfPayment({
      from: 'BankA::desk', to: 'venue::1', value: '100', holdingCid: 'cid-ok',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-cr01c',
    })
    const r = await fetch(`${base}/solve`, { headers: { 'X-PAYMENT': xpay } })
    expect(r.status).toBe(200)
    expect(verify).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'BankA::desk')
    const settlement = decodeHeader(r.headers.get('x-payment-response')!)
    expect(settlement.payer).toBe('BankA::desk')
  })

  it('secret sweep — a facilitator/Authorization sentinel never lands in a 402 body or X-PAYMENT-RESPONSE', async () => {
    const SENTINEL = 'SENTINEL-FACILITATOR-KEY-do-not-leak-9f3c2a'
    // A misbehaving facilitator that tries to leak a secret through its reason string:
    // the gate MUST filter it down to an authored secret-free reason.
    const leaky = okFacilitator({ verify: async () => ({ valid: false, reason: SENTINEL }) })
    const base = await start((app) => {
      app.get('/solve', x402Gate(leaky, baseOpts()), (_req, res) => res.json({ ran: true }))
    })
    const xpay = constructSelfPayment({
      from: 'BankA::1', to: 'venue::1', value: '100', holdingCid: 'cid-sec',
      network: 'canton:devnet', validBefore: futureTs(), nonce: 'n-sec',
    })
    const r = await fetch(`${base}/solve`, {
      headers: { 'X-PAYMENT': xpay, Authorization: `Bearer ${SENTINEL}` },
    })
    expect(r.status).toBe(402)
    const bodyText = await r.text()
    expect(bodyText).not.toContain(SENTINEL)
    expect(r.headers.get('x-payment-response') ?? '').not.toContain(SENTINEL)
  })

  it('free paths — an un-gated route is never 402 even when metering is on elsewhere', async () => {
    const base = await start((app) => {
      app.get('/solve', x402Gate(okFacilitator(), baseOpts()), (_req, res) => res.json({ ran: true }))
      app.get('/status', (_req, res) => res.json({ status: 'ok' })) // never gated
    })
    const rs = await fetch(`${base}/status`)
    expect(rs.status).toBe(200)
    expect((await body(rs)).status).toBe('ok')
    // the metered route still 402s without payment (gate is active, just not global)
    expect((await fetch(`${base}/solve`)).status).toBe(402)
  })

  it('createX402Gate bundles a PaymentGate whose middleware honors the default-OFF guard', async () => {
    const gate = createX402Gate({ facilitator: okFacilitator(), ...baseOpts({ enabled: false }) })
    const base = await start((app) => {
      app.get('/solve', gate.middleware, (_req, res) => res.json({ ran: true }))
    })
    const r = await fetch(`${base}/solve`)
    expect(r.status).toBe(200) // disabled ⇒ passthrough
    expect((await body(r)).ran).toBe(true)
  })
})
