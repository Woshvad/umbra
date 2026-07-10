// solver/src/facilitator.test.ts — PAY-01 FacilitatorClient backend proof, fully OFFLINE.
//
// Proven here (no live ledger, no live facilitator):
//   • self backend (STUBBED FacilitatorLedger): verify accepts a matching fee-source cid and
//     rejects wrong-owner / wrong-instrument / insufficient-amount / locked / missing with the
//     exact secret-free reasons; settle calls moveFee(cid, price, payTo) and returns its txRef;
//     a moveFee throw collapses to { settled:false, txRef:'' } (the gate re-advertises).
//   • canton-cc backend (STUBBED fetchImpl): verify/settle POST the pinned x402 /verify+/settle
//     bodies with an Authorization: Bearer header; isValid/invalidReason + success/transaction
//     map to the interface; a non-2xx yields a status-only secret-free reason.
//   • secret-sweep: the facilitatorKey sentinel never appears in ANY returned result object.
//   • factory: unknown backend + missing deps fail loud (secret-free).
// Live self (booted LocalNet) + live canton-cc ($CC via the FTP facilitator) are UAT gates.

import { describe, it, expect, vi } from 'vitest'
import {
  createFacilitator,
  SELF_CUSTODY_LABEL,
  type FacilitatorLedger,
  type HoldingRecord,
} from './facilitator.js'
import type { PaymentPayload, PaymentRequirements } from './x402.js'

// A sentinel facilitator key — MUST NEVER appear in a returned result object.
const SENTINEL_KEY = 'SENTINEL-FACILITATOR-KEY-do-not-leak-9c4e21'
const FAC_URL = 'https://facilitator.test/x402'

// ── Fixture builders ──────────────────────────────────────────────────────────────
const PAYER = 'BankA::desk'
const VENUE = 'Operator::venue'
const CID = 'cid-fee-1'

// maxAmountRequired is ATOMIC ('100' ⇒ fromAtomic ⇒ 1.00 fee). The USDCx Holding amount is in
// whole units, so amount 5 ≥ the 1-unit fee.
const reqs = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: 'exact',
  network: 'canton:devnet',
  maxAmountRequired: '100',
  asset: 'USDCx',
  payTo: VENUE,
  resource: '/round/r1/solve-preview',
  description: 'metered',
  maxTimeoutSeconds: 60,
  ...over,
})

const payment = (over: Partial<PaymentPayload['payload']> = {}): PaymentPayload => ({
  x402Version: 1,
  scheme: 'exact',
  network: 'canton:devnet',
  payload: {
    from: PAYER,
    to: VENUE,
    value: '100',
    instrument: 'USDCx',
    holdingCid: CID,
    validBefore: Date.now() + 60_000,
    nonce: 'nonce-1',
    ...over,
  },
})

// A stubbed FacilitatorLedger over an in-memory holdings list + a recording moveFee.
const stubLedger = (
  holdings: HoldingRecord[],
  moveFee: FacilitatorLedger['moveFee'] = vi.fn(async () => 'umbra-x402-cid-moved'),
): FacilitatorLedger => ({
  listHoldings: async () => holdings,
  moveFee,
})

const holding = (over: Partial<HoldingRecord> = {}): HoldingRecord => ({
  contractId: CID,
  owner: PAYER,
  instrumentId: 'USDCx',
  amount: 5,
  locked: false,
  ...over,
})

// ── self backend (STUBBED FacilitatorLedger) ────────────────────────────────────────
describe('self backend — on-ledger verify/settle', () => {
  it('exports the honest operator-custody label', () => {
    expect(SELF_CUSTODY_LABEL).toContain('operator-custody')
    expect(SELF_CUSTODY_LABEL).toContain('canton-cc')
  })

  it('verify ACCEPTS a matching fee-source cid (owner + USDCx + unlocked + amount ≥ price)', async () => {
    const fac = createFacilitator({ backend: 'self', ledger: stubLedger([holding()]) })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({ valid: true })
  })

  it('verify REJECTS a missing cid → invalid_holding', async () => {
    const fac = createFacilitator({ backend: 'self', ledger: stubLedger([]) })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({
      valid: false,
      reason: 'invalid_holding',
    })
  })

  it('verify REJECTS a wrong-owner holding → invalid_holding', async () => {
    const fac = createFacilitator({
      backend: 'self',
      ledger: stubLedger([holding({ owner: 'BankB::desk' })]),
    })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({
      valid: false,
      reason: 'invalid_holding',
    })
  })

  it('verify REJECTS a locked holding → invalid_holding', async () => {
    const fac = createFacilitator({
      backend: 'self',
      ledger: stubLedger([holding({ locked: true })]),
    })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({
      valid: false,
      reason: 'invalid_holding',
    })
  })

  it('verify REJECTS a wrong-instrument holding → wrong_instrument', async () => {
    const fac = createFacilitator({
      backend: 'self',
      ledger: stubLedger([holding({ instrumentId: 'BONDX' })]),
    })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({
      valid: false,
      reason: 'wrong_instrument',
    })
  })

  it('verify REJECTS an insufficient-amount holding → amount_too_low', async () => {
    const fac = createFacilitator({
      backend: 'self',
      ledger: stubLedger([holding({ amount: 0.5 })]),
    })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({
      valid: false,
      reason: 'amount_too_low',
    })
  })

  it('settle calls moveFee(cid, price, payTo) and returns its txRef', async () => {
    const moveFee = vi.fn(async () => 'umbra-x402-cid-settled')
    const fac = createFacilitator({ backend: 'self', ledger: stubLedger([holding()], moveFee) })
    const out = await fac.settle(reqs(), payment())
    expect(moveFee).toHaveBeenCalledWith(CID, 1, VENUE)
    expect(out).toEqual({ settled: true, txRef: 'umbra-x402-cid-settled' })
  })

  it('settle collapses a moveFee throw to { settled:false, txRef:"" }', async () => {
    const moveFee = vi.fn(async () => {
      throw new Error('x402 fee: presented holding is locked')
    })
    const fac = createFacilitator({ backend: 'self', ledger: stubLedger([holding()], moveFee) })
    await expect(fac.settle(reqs(), payment())).resolves.toEqual({ settled: false, txRef: '' })
  })
})

// ── canton-cc backend (STUBBED fetchImpl) ───────────────────────────────────────────
describe('canton-cc backend — FTP facilitator /verify + /settle', () => {
  const okJson = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  it('verify POSTs the pinned /verify body + Bearer header and maps isValid:true', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${FAC_URL}/verify`)
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SENTINEL_KEY}`)
      const sent = JSON.parse(String(init?.body))
      expect(sent).toMatchObject({
        x402Version: 1,
        paymentPayload: { holdingCid: CID },
        paymentRequirements: { maxAmountRequired: '100' },
      })
      return okJson({ isValid: true, payer: PAYER })
    })
    const fac = createFacilitator({
      backend: 'canton-cc',
      facilitatorUrl: FAC_URL,
      facilitatorKey: SENTINEL_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({ valid: true })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('verify maps isValid:false + invalidReason', async () => {
    const fetchImpl = vi.fn(async () => okJson({ isValid: false, invalidReason: 'insufficient_funds' }))
    const fac = createFacilitator({
      backend: 'canton-cc',
      facilitatorUrl: FAC_URL,
      facilitatorKey: SENTINEL_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({
      valid: false,
      reason: 'insufficient_funds',
    })
  })

  it('verify on a non-2xx yields a STATUS-ONLY secret-free reason', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: false,
          status: 402,
          json: async () => ({ error: `denied for ${SENTINEL_KEY}` }),
          text: async () => `denied for ${SENTINEL_KEY}`,
        }) as unknown as Response,
    )
    const fac = createFacilitator({
      backend: 'canton-cc',
      facilitatorUrl: FAC_URL,
      facilitatorKey: SENTINEL_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const out = await fac.verify(reqs(), payment())
    expect(out.valid).toBe(false)
    expect(out.reason).toContain('402')
    expect(out.reason).not.toContain(SENTINEL_KEY)
    expect(out.reason).not.toContain('denied')
  })

  it('settle POSTs the pinned /settle body and maps success:true → txRef', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(`${FAC_URL}/settle`)
      return okJson({ success: true, transaction: 'canton-tx-abc', network: 'canton:devnet', payer: PAYER })
    })
    const fac = createFacilitator({
      backend: 'canton-cc',
      facilitatorUrl: FAC_URL,
      facilitatorKey: SENTINEL_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(fac.settle(reqs(), payment())).resolves.toEqual({
      settled: true,
      txRef: 'canton-tx-abc',
    })
  })

  it('settle maps success:false → { settled:false, txRef:"" }', async () => {
    const fetchImpl = vi.fn(async () =>
      okJson({ success: false, errorReason: 'insufficient_funds', transaction: '', network: 'canton:devnet', payer: PAYER }),
    )
    const fac = createFacilitator({
      backend: 'canton-cc',
      facilitatorUrl: FAC_URL,
      facilitatorKey: SENTINEL_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(fac.settle(reqs(), payment())).resolves.toEqual({ settled: false, txRef: '' })
  })

  it('trims a trailing slash on facilitatorUrl (no double slash on the path)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(`${FAC_URL}/verify`)
      return okJson({ isValid: true })
    })
    const fac = createFacilitator({
      backend: 'canton-cc',
      facilitatorUrl: `${FAC_URL}/`,
      facilitatorKey: SENTINEL_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await fac.verify(reqs(), payment())
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})

// ── secret-sweep: the facilitatorKey never lands in a returned result ────────────────
describe('secret discipline', () => {
  it('the facilitatorKey sentinel never appears in ANY returned result object', async () => {
    const bodies: Array<() => Response> = [
      () => ({ ok: true, status: 200, json: async () => ({ isValid: true }) }) as unknown as Response,
      () =>
        ({ ok: true, status: 200, json: async () => ({ isValid: false, invalidReason: 'insufficient_funds' }) }) as unknown as Response,
      () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'x' }) as unknown as Response,
      () =>
        ({ ok: true, status: 200, json: async () => ({ success: true, transaction: 't', network: 'n', payer: 'p' }) }) as unknown as Response,
      () =>
        ({ ok: true, status: 200, json: async () => ({ success: false, errorReason: 'insufficient_funds', transaction: '', network: 'n', payer: 'p' }) }) as unknown as Response,
    ]
    for (const make of bodies) {
      const fac = createFacilitator({
        backend: 'canton-cc',
        facilitatorUrl: FAC_URL,
        facilitatorKey: SENTINEL_KEY,
        fetchImpl: vi.fn(async () => make()) as unknown as typeof fetch,
      })
      const v = await fac.verify(reqs(), payment())
      const s = await fac.settle(reqs(), payment())
      expect(JSON.stringify(v)).not.toContain(SENTINEL_KEY)
      expect(JSON.stringify(s)).not.toContain(SENTINEL_KEY)
    }
  })
})

// ── factory: loud secret-free failures ──────────────────────────────────────────────
describe('createFacilitator factory', () => {
  it('defaults to the self backend', async () => {
    const fac = createFacilitator({ ledger: stubLedger([holding()]) })
    await expect(fac.verify(reqs(), payment())).resolves.toEqual({ valid: true })
  })

  it('throws loud on an unrecognized backend value', () => {
    expect(() => createFacilitator({ backend: 'bogus' as never })).toThrow(/Unknown X402_FACILITATOR/)
  })

  it("throws when backend 'self' has no ledger port", () => {
    expect(() => createFacilitator({ backend: 'self' })).toThrow(/self/)
  })

  it("throws when backend 'canton-cc' is missing url or key", () => {
    expect(() => createFacilitator({ backend: 'canton-cc', facilitatorUrl: FAC_URL })).toThrow(/canton-cc/)
  })
})
