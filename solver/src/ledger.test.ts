// solver/src/ledger.test.ts — stubbed-ledger unit tests for the JSON Ledger API v2
// client (NO live LocalNet). We stub global `fetch` with an in-memory ACS so the
// v2 wire calls (ledger-end / active-contracts / submit-and-wait) are deterministic,
// and mock node:fs so the module-private Operator credential is a known sentinel.
//
// Keystones preserved from the v1 suite:
//   • SOLV-01: `refreshStats` on a fresh round whose sealed-order query returns N
//     WRITES the recomputed count via archive+recreate so sealedOrderCount advances
//     off 0 (and is an idempotent no-op when the count already matches).
//   • SOLV-04 / T-04-04: the Operator JWT never appears in operatorParty, a result,
//     or a log line.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SENTINEL_TOKEN = 'SENTINEL_OPERATOR_TOKEN_DO_NOT_LEAK'
// IDEN-03 (12-02): a DISTINCT compliance token so the four-eyes settle path runs its
// real distinct-authority branch in the stubbed ledger (never the operator token).
const SENTINEL_COMPLIANCE_TOKEN = 'SENTINEL_COMPLIANCE_TOKEN_DO_NOT_LEAK'

// ── In-memory ACS the fake participant reads/writes ──────────────────────────────
interface Created {
  contractId: string
  templateId: string
  createArgument: Record<string, any>
  packageName: string
  signatories: string[]
  observers: string[]
}
let acs: Created[] = []
let cidSeq = 0
const createCalls: { template: string; args: Record<string, any> }[] = []
const archiveCalls: { template: string; cid: string }[] = []
// WOW-02: every `Clear` exercise the client submits (captured to assert the TAMPERED shape).
// IDEN-03: `approvalCid` captured too, to assert the four-eyes credential is threaded.
const clearCalls: {
  clearingPrice: number
  allocations: { desk: string; side: string; filledQty: number }[]
  approvalCid?: string
}[] = []
// ADJ-02/03: capture every non-lifecycle exercise the client submits, so the RFQ +
// issuance wrappers can be asserted on choice + argument-marshaling shape (no live ledger).
const exerciseCalls: { template: string; choice: string; contractId: string; arg: Record<string, any> }[] = []

const umbra = (templateId: string, createArgument: Record<string, any>, contractId = `cid-${++cidSeq}`): Created => ({
  contractId,
  templateId,
  createArgument,
  packageName: 'umbra',
  signatories: [],
  observers: [],
})

// A fetch stub implementing the three v2 endpoints the client uses.
const mockFetch = vi.fn(async (url: unknown, opts?: any) => {
  const u = String(url)
  if (u.endsWith('/v2/state/ledger-end')) {
    return { ok: true, status: 200, json: async () => ({ offset: 1 }) } as unknown as Response
  }
  if (u.endsWith('/v2/state/active-contracts')) {
    const entries = acs.map((c) => ({ contractEntry: { JsActiveContract: { createdEvent: c } } }))
    return { ok: true, status: 200, json: async () => entries } as unknown as Response
  }
  if (u.endsWith('/v2/commands/submit-and-wait')) {
    const body = JSON.parse(opts.body)
    for (const cmd of body.commands) {
      if (cmd.CreateCommand) {
        const t = cmd.CreateCommand.templateId
        acs.push(umbra(t, cmd.CreateCommand.createArguments))
        createCalls.push({ template: t, args: cmd.CreateCommand.createArguments })
      } else if (cmd.ExerciseCommand) {
        const { contractId, choice, templateId, choiceArgument } = cmd.ExerciseCommand
        // ADJ-02/03: record EVERY exercise (choice + args) for the wrapper-shape assertions.
        exerciseCalls.push({ template: templateId, choice, contractId, arg: choiceArgument ?? {} })
        if (choice === 'Archive' || choice === 'Retire') {
          acs = acs.filter((c) => c.contractId !== contractId)
          archiveCalls.push({ template: templateId, cid: contractId })
        } else if (choice === 'ApproveClearing') {
          // IDEN-03: Compliance approves a ClearingApprovalRequest → the two-party-signed
          // ClearingApproval is born (mirrors the on-ledger choice body). Copy the request's
          // {operator, compliance, roundId, clearingPrice} onto the new ClearingApproval.
          const req = acs.find((c) => c.contractId === contractId)
          if (req) {
            acs.push(umbra('#umbra:Umbra.Approval:ClearingApproval', { ...req.createArgument }))
          }
        } else if (choice === 'Clear') {
          // Emulate the on-ledger recompute-and-assert backstop (Auction.daml 183/187/192)
          // for the §4 fixture (correct clear = price 100, A=10 Buy / B=8 Sell / C=2 Sell).
          // The assert ORDER is faithful: price → allocation → conservation. The verbatim
          // body is what submitAndWait surfaces (WOW-02); a tampered Clear NEVER mutates acs.
          const arg = choiceArgument as {
            clearingPrice: number
            allocations: { desk: string; side: string; filledQty: number }[]
            approvalCid?: string
          }
          clearCalls.push({
            clearingPrice: arg.clearingPrice,
            allocations: arg.allocations,
            approvalCid: arg.approvalCid,
          })
          const buyTotal = arg.allocations.filter((a) => a.side === 'Buy').reduce((s, a) => s + a.filledQty, 0)
          const sellTotal = arg.allocations.filter((a) => a.side === 'Sell').reduce((s, a) => s + a.filledQty, 0)
          const expected: Record<string, number> = { 'bankA::test|Buy': 10, 'bankB::test|Sell': 8, 'bankC::test|Sell': 2 }
          const allocMatches =
            arg.allocations.length === 3 &&
            arg.allocations.every((a) => expected[`${a.desk}|${a.side}`] === a.filledQty)
          if (Number(arg.clearingPrice) !== 100) {
            return {
              ok: false,
              status: 400,
              text: async () => 'DAML_INTERPRETATION_ERROR: Unhandled exception: clearingPrice does not match recomputed §8 p*',
            } as unknown as Response
          }
          if (!allocMatches) {
            return {
              ok: false,
              status: 400,
              text: async () => 'DAML_INTERPRETATION_ERROR: Unhandled exception: allocations do not match recomputed §8',
            } as unknown as Response
          }
          if (buyTotal !== sellTotal) {
            return {
              ok: false,
              status: 400,
              text: async () => 'DAML_INTERPRETATION_ERROR: Unhandled exception: fills not conserved (Σbuy /= Σsell)',
            } as unknown as Response
          }
          // A correct Clear would settle — not exercised by the tamper tests.
        }
      }
    }
    return { ok: true, status: 200, text: async () => '' } as unknown as Response
  }
  return { ok: false, status: 404, text: async () => 'not found' } as unknown as Response
})

// node:fs is read at import time for the Operator token + the party map.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: (path: unknown, ...rest: unknown[]) => {
      const p = String(path)
      if (p.includes('.compliance-token')) {
        // IDEN-03 (12-02 HIGH-02): a DISTINCT compliance identity (party != operator)
        // so gatherApprovalCid exercises the REAL distinct-authority four-eyes path
        // (not the operator-held fallback, which now hard-fails without an opt-in).
        return JSON.stringify({ token: SENTINEL_COMPLIANCE_TOKEN, party: 'compliance::test' })
      }
      if (p.includes('.operator-token')) {
        return JSON.stringify({ token: SENTINEL_TOKEN, party: 'operator::test' })
      }
      if (p.includes('parties.json')) {
        return JSON.stringify({
          operator: 'operator::test',
          bankA: 'bankA::test',
          bankB: 'bankB::test',
          bankC: 'bankC::test',
        })
      }
      // @ts-expect-error pass-through to the real impl for anything else
      return actual.readFileSync(path, ...rest)
    },
  }
})

// Import AFTER the fs mock so module-scope credential resolution uses the sentinel.
const ledgerMod = await import('./ledger.js')

const seedOrder = (roundId: string, desk: string, side: string, qty: number, i: number): void => {
  acs.push(
    umbra(
      '#umbra:Umbra.Auction:Order',
      { operator: 'operator::test', desk, roundId, side, quantity: String(qty), limit: '100.0', status: 'Sealed' },
      `order-${i}`,
    ),
  )
}
const seedStats = (roundId: string, count: number): void => {
  acs.push(
    umbra(
      '#umbra:Umbra.Auction:RoundStats',
      { operator: 'operator::test', roundId, desks: [], sealedOrderCount: String(count) },
      'stats-0',
    ),
  )
}

// Seed the canonical §4 world for a settleable (Closed) round: 3 sealed orders, the
// buyer's USDCx + each seller's BONDX operator-custody Holding (v2 wire: instrument is
// the InstrumentId {issuer, id} record, amount a string, lock null), and the Round
// contract. tamperClear gathers exactly these (mirroring settle) before submitting a
// TAMPERED Clear. DFIN-01/03: settle()/tamperClear() now read `Holding`, NOT `Asset`.
const seedSection4World = (roundId: string): void => {
  // A Buy 10 @101, B Sell 8 @99, C Sell 5 @100 → clears 100, A=10 / B=8 / C=2.
  const usdc = { issuer: 'operator::test', id: 'USDCx' }
  const bond = { issuer: 'operator::test', id: 'BONDX' }
  acs.push(
    umbra('#umbra:Umbra.Auction:Order', { operator: 'operator::test', desk: 'bankA::test', roundId, side: 'Buy', quantity: '10', limit: '101.0', status: 'Sealed' }, 'order-A'),
    umbra('#umbra:Umbra.Auction:Order', { operator: 'operator::test', desk: 'bankB::test', roundId, side: 'Sell', quantity: '8', limit: '99.0', status: 'Sealed' }, 'order-B'),
    umbra('#umbra:Umbra.Auction:Order', { operator: 'operator::test', desk: 'bankC::test', roundId, side: 'Sell', quantity: '5', limit: '100.0', status: 'Sealed' }, 'order-C'),
    umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankA::test', instrument: usdc, amount: '5000.0', lock: null }, 'holding-A-usdc'),
    umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankB::test', instrument: bond, amount: '20.0', lock: null }, 'holding-B-bond'),
    umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankC::test', instrument: bond, amount: '15.0', lock: null }, 'holding-C-bond'),
    umbra('#umbra:Umbra.Auction:Round', { operator: 'operator::test', roundId, symbol: 'BONDX', desks: ['bankA::test', 'bankB::test', 'bankC::test'], openedAt: '2026-07-09T00:00:00Z', windowSeconds: '60', status: 'Closed' }, 'round-0'),
  )
}

beforeEach(() => {
  acs = []
  cidSeq = 0
  createCalls.length = 0
  archiveCalls.length = 0
  clearCalls.length = 0
  exerciseCalls.length = 0
  vi.stubGlobal('fetch', mockFetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ledger.refreshStats (stubbed v2 participant — no live LocalNet)', () => {
  it('advances a fresh round sealedOrderCount off 0 to the recomputed count via archive+recreate', async () => {
    seedStats('R1', 0)
    seedOrder('R1', 'bankA::test', 'Buy', 10, 0)
    seedOrder('R1', 'bankB::test', 'Sell', 8, 1)
    seedOrder('R1', 'bankC::test', 'Sell', 5, 2)

    const count = await ledgerMod.refreshStats('R1')

    expect(count).toBe(3)
    // The old RoundStats was archived and a new one created with the recomputed count.
    expect(archiveCalls.some((c) => c.template.endsWith(':RoundStats'))).toBe(true)
    const statsCreates = createCalls.filter((c) => c.template.endsWith(':RoundStats'))
    expect(statsCreates.length).toBeGreaterThan(0)
    expect(statsCreates[statsCreates.length - 1].args.sealedOrderCount).toBe(3)
    // Live ACS reflects the advanced count.
    const liveStats = acs.find((c) => c.templateId.endsWith(':RoundStats'))
    expect(Number(liveStats!.createArgument.sealedOrderCount)).toBe(3)
  })

  it('is a no-op write when the recorded count already matches (idempotent)', async () => {
    seedStats('R1', 2)
    seedOrder('R1', 'bankA::test', 'Buy', 10, 0)
    seedOrder('R1', 'bankB::test', 'Sell', 8, 1)

    const count = await ledgerMod.refreshStats('R1')

    expect(count).toBe(2)
    expect(archiveCalls.filter((c) => c.template.endsWith(':RoundStats')).length).toBe(0)
    expect(createCalls.filter((c) => c.template.endsWith(':RoundStats')).length).toBe(0)
  })

  it('never leaks the Operator token in operatorParty, a result, or logs', async () => {
    seedStats('R1', 0)
    seedOrder('R1', 'bankA::test', 'Buy', 10, 0)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const party = ledgerMod.operatorParty
    const result = await ledgerMod.refreshStats('R1')

    expect(party).toBe('operator::test')
    expect(JSON.stringify({ party, result })).not.toContain(SENTINEL_TOKEN)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})

// ── WOW-02: tamperClear — attempt a WRONG Round.Clear, surface the verbatim reject ──
describe('ledger.tamperClear (WOW-02 — the on-ledger recompute-and-assert backstop)', () => {
  it('wrong-price: submits clearingPrice 99 → verbatim "clearingPrice does not match recomputed §8 p*"', async () => {
    seedSection4World('R1')

    const result = await ledgerMod.tamperClear('R1', 'wrong-price')

    // Resolves (NEVER throws) with the verbatim on-ledger rejection.
    expect(result.rejected).toBe(true)
    expect(result.error).toContain('clearingPrice does not match recomputed §8 p*')
    // It actually SUBMITTED the tampered price (99 = correct 100 - 1) — still a valid Decimal.
    expect(clearCalls).toHaveLength(1)
    expect(clearCalls[0].clearingPrice).toBe(99)
    // The buyer over-fill was NOT applied on this mode — allocations stay the correct §8 set.
    const buyLeg = clearCalls[0].allocations.find((a) => a.side === 'Buy')
    expect(buyLeg?.filledQty).toBe(10)
  })

  it('overfill: submits an over-filled Buy leg → verbatim allocation/conservation rejection', async () => {
    seedSection4World('R1')

    const result = await ledgerMod.tamperClear('R1', 'overfill')

    expect(result.rejected).toBe(true)
    // The real Daml asserts allocation-match before conservation; either verbatim string
    // is a faithful "the ledger, not the AI, rejected it" (Auction.daml 187/192).
    expect(result.error).toMatch(/allocations do not match recomputed §8|fills not conserved \(Σbuy \/= Σsell\)/)
    // It SUBMITTED the over-filled Buy leg (10 + 2 = 12) at the still-correct price.
    expect(clearCalls).toHaveLength(1)
    expect(clearCalls[0].clearingPrice).toBe(100)
    const buyLeg = clearCalls[0].allocations.find((a) => a.side === 'Buy')
    expect(buyLeg?.filledQty).toBe(12)
  })

  it('never throws and never leaks the Operator token in the surfaced rejection', async () => {
    seedSection4World('R1')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrong = await ledgerMod.tamperClear('R1', 'wrong-price')
    // Reset the world between attempts (a rejected atomic Clear changes nothing on-ledger,
    // but the test re-seeds to keep each attempt independent of query ordering).
    acs = []
    clearCalls.length = 0
    seedSection4World('R1')
    const over = await ledgerMod.tamperClear('R1', 'overfill')

    for (const r of [wrong, over]) {
      expect(r.rejected).toBe(true)
      expect(JSON.stringify(r)).not.toContain(SENTINEL_TOKEN)
    }
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})

// ── IDEN-03: settle threads a compliance-signed four-eyes approval into Round.Clear ──
describe('ledger.settle (IDEN-03 four-eyes — requests + collects a ClearingApproval)', () => {
  it('proposes a ClearingApprovalRequest, collects the approval, and threads its cid into the §4 Clear', async () => {
    seedSection4World('R1')

    const { result } = await ledgerMod.settle('R1')

    // §4 clears at 100.00 / matched 10 — the four-eyes step does not perturb the numbers.
    expect(result.clearingPrice).toBe(100)
    expect(result.totalMatched).toBe(10)

    // Exactly one Clear, at the correct price, carrying a NON-EMPTY four-eyes approvalCid.
    expect(clearCalls).toHaveLength(1)
    expect(clearCalls[0].clearingPrice).toBe(100)
    expect(typeof clearCalls[0].approvalCid).toBe('string')
    expect((clearCalls[0].approvalCid ?? '').length).toBeGreaterThan(0)

    // The operator PROPOSED a ClearingApprovalRequest and a compliance-signed
    // ClearingApproval was collected (request → approve → collect wiring).
    expect(createCalls.some((c) => c.template.endsWith(':ClearingApprovalRequest'))).toBe(true)
    const appr = acs.find((c) => c.templateId.endsWith(':ClearingApproval'))
    expect(appr).toBeTruthy()
    // The threaded cid is exactly the collected on-ledger ClearingApproval.
    expect(clearCalls[0].approvalCid).toBe(appr!.contractId)
  })

  it('the collected approval carries the recomputed §4 price (100) and the round id', async () => {
    seedSection4World('R1')

    await ledgerMod.settle('R1')

    const appr = acs.find((c) => c.templateId.endsWith(':ClearingApproval'))!
    expect(Number(appr.createArgument.clearingPrice)).toBe(100)
    expect(appr.createArgument.roundId).toBe('R1')
    expect(appr.createArgument.operator).toBe('operator::test')
  })

  it('never leaks the Operator token through the four-eyes settle path', async () => {
    seedSection4World('R1')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = await ledgerMod.settle('R1')

    expect(JSON.stringify(result)).not.toContain(SENTINEL_TOKEN)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})

// ── ADJ-02: RFQ orchestration (post → firm quote → list → accept→settleBatch) ────────
describe('ledger RFQ wrappers (ADJ-02 — post/quote/list/accept over JSON Ledger API v2)', () => {
  const bond = { issuer: 'operator::test', id: 'BONDX' }
  const usdc = { issuer: 'operator::test', id: 'USDCx' }

  const seedRfqAcceptWorld = (): { rfqCid: string; quoteCid: string } => {
    // A Buy-side RFQ from bankA for 10 units; bankB quotes 100.0; the holdings needed for
    // the 1×1 DvP (dealer delivers bond, requester pays cash) are seeded operator-custody.
    acs.push(
      umbra('#umbra:Umbra.Rfq:RfqRequest', {
        operator: 'operator::test', requester: 'bankA::test', dealers: ['bankB::test'],
        instrument: bond, side: 'Buy', quantity: '10',
      }, 'rfq-1'),
      umbra('#umbra:Umbra.Rfq:Quote', {
        operator: 'operator::test', dealer: 'bankB::test', requester: 'bankA::test',
        instrument: bond, price: '100.0', quantity: '10',
      }, 'quote-1'),
      // bankB (dealer) delivers the bond; bankA (requester) pays the cash.
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankB::test', instrument: bond, amount: '20.0', lock: null }, 'h-bond-B'),
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankA::test', instrument: usdc, amount: '5000.0', lock: null }, 'h-cash-A'),
    )
    return { rfqCid: 'rfq-1', quoteCid: 'quote-1' }
  }

  it('postRfq creates an RfqRequest with the quantity marshaled as a STRING', async () => {
    const posted = await ledgerMod.postRfq('bankA::test', 'Buy', 10, ['bankB::test'])

    expect(posted.rfqId).toBe('cid-1')
    expect(posted.requester).toBe('bankA::test')
    const create = createCalls.find((c) => c.template.endsWith(':RfqRequest'))
    expect(create).toBeTruthy()
    // Int marshaled as a string (Option-B); dealers exclude the requester.
    expect(create!.args.quantity).toBe('10')
    expect(typeof create!.args.quantity).toBe('string')
    expect(create!.args.dealers).toEqual(['bankB::test'])
    expect(create!.args.instrument).toEqual(bond)
  })

  it('createQuote creates a firm Quote with price + quantity marshaled as STRINGS', async () => {
    const q = await ledgerMod.createQuote('bankB::test', 'bankA::test', 100.5, 10)

    expect(q.quoteCid).toBe('cid-1')
    const create = createCalls.find((c) => c.template.endsWith(':Quote'))
    expect(create).toBeTruthy()
    expect(create!.args.price).toBe('100.5')
    expect(create!.args.quantity).toBe('10')
    expect(typeof create!.args.price).toBe('string')
  })

  it('listQuotes returns the requester-visible firm quotes (dealer/price/quantity)', async () => {
    seedRfqAcceptWorld()

    const quotes = await ledgerMod.listQuotes('rfq-1')

    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ contractId: 'quote-1', dealer: 'bankB::test', price: 100, quantity: 10 })
  })

  it('acceptQuote gathers the bond+cash source cids like settle() and exercises AcceptQuote', async () => {
    seedRfqAcceptWorld()

    const summary = await ledgerMod.acceptQuote('rfq-1', 'quote-1')

    // Secret-free settle summary — scalars + party/contract ids only.
    expect(summary).toMatchObject({
      rfqId: 'rfq-1', quoteCid: 'quote-1', requester: 'bankA::test', dealer: 'bankB::test',
      side: 'Buy', quantity: 10, price: 100, cashAmount: 1000, settled: true,
    })
    // Exactly one AcceptQuote exercise on the RfqRequest, carrying the gathered source cids.
    const accept = exerciseCalls.find((e) => e.choice === 'AcceptQuote')
    expect(accept).toBeTruthy()
    expect(accept!.contractId).toBe('rfq-1')
    expect(accept!.arg.quoteCid).toBe('quote-1')
    // Buy: dealer (bankB) delivers bond, requester (bankA) pays cash → gathered source cids.
    expect(accept!.arg.bondSourceCid).toBe('h-bond-B')
    expect(accept!.arg.cashSourceCid).toBe('h-cash-A')
    expect(accept!.arg.cashInstrument).toEqual(usdc)
  })

  it('never leaks the Operator token through the RFQ post/quote/list/accept path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { rfqCid, quoteCid } = seedRfqAcceptWorld()
    const quotes = await ledgerMod.listQuotes(rfqCid)
    const summary = await ledgerMod.acceptQuote(rfqCid, quoteCid)

    expect(JSON.stringify({ quotes, summary })).not.toContain(SENTINEL_TOKEN)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})

// ── ADJ-03: primary issuance orchestration (open → clear/mint, coupon, redeem) ───────
describe('ledger issuance wrappers (ADJ-03 — clear/mint, coupon, redeem over JSON Ledger API v2)', () => {
  const bond2 = { issuer: 'operator::test', id: 'BOND2' }
  const usdc = { issuer: 'operator::test', id: 'USDCx' }

  // A cleared issuance world: an IssuanceRound (cleared) + two current bond holders + the
  // issuer's cash for the coupon/redeem legs. bondInstrument = the DISTINCT "BOND2" tranche
  // (never the §4 "BONDX").
  const seedClearedIssuance = (cid = 'iss-cleared'): string => {
    acs.push(
      umbra('#umbra:Umbra.Issuance:IssuanceRound', {
        operator: 'operator::test', issuer: 'issuer::test', bondInstrument: bond2, cashInstrument: usdc,
        trancheSize: '100', reservePrice: '99.0', bids: [], cleared: true, couponsPaid: [],
      }, cid),
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankA::test', instrument: bond2, amount: '10.0', lock: null }, 'h-bond2-A'),
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankB::test', instrument: bond2, amount: '5.0', lock: null }, 'h-bond2-B'),
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'issuer::test', instrument: usdc, amount: '100000.0', lock: null }, 'h-cash-issuer'),
    )
    return cid
  }

  it('openIssuance creates an IssuanceRound with Int/Decimal fields marshaled as STRINGS', async () => {
    const opened = await ledgerMod.openIssuance('issuer::test', 'BOND2', 'USDCx', 100, 99, [
      { desk: 'bankA::test', quantity: 60, limit: 101 },
    ])

    expect(opened.issuanceId).toBe('cid-1')
    const create = createCalls.find((c) => c.template.endsWith(':IssuanceRound'))
    expect(create).toBeTruthy()
    expect(create!.args.trancheSize).toBe('100')
    expect(create!.args.reservePrice).toBe('99')
    expect(create!.args.cleared).toBe(false)
    expect(create!.args.couponsPaid).toEqual([])
    // Bids marshal quantity + limit as strings; the tranche uses the DISTINCT BOND2 instrument.
    expect(create!.args.bids).toEqual([{ desk: 'bankA::test', quantity: '60', limit: '101' }])
    expect(create!.args.bondInstrument).toEqual(bond2)
  })

  it('clearIssuance re-derives §8, gathers winner cash cids, and exercises ClearIssuance', async () => {
    // Book: issuer Sell 100 @99, bankA Buy 60 @101, bankB Buy 50 @100 → uniform clear.
    acs.push(
      umbra('#umbra:Umbra.Issuance:IssuanceRound', {
        operator: 'operator::test', issuer: 'issuer::test', bondInstrument: bond2, cashInstrument: usdc,
        trancheSize: '100', reservePrice: '99.0',
        bids: [
          { desk: 'bankA::test', quantity: '60', limit: '101.0' },
          { desk: 'bankB::test', quantity: '50', limit: '100.0' },
        ],
        cleared: false, couponsPaid: [],
      }, 'iss-open'),
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankA::test', instrument: usdc, amount: '1000000.0', lock: null }, 'h-cash-A'),
      umbra('#umbra:Umbra.Holding:Holding', { operator: 'operator::test', owner: 'bankB::test', instrument: usdc, amount: '1000000.0', lock: null }, 'h-cash-B'),
    )

    const cleared = await ledgerMod.clearIssuance('iss-open')

    // A SINGLE uniform issuance price + the minted-holdings summary (the cleared cross).
    expect(cleared.totalIssued).toBe(100)
    expect(typeof cleared.clearingPrice).toBe('number')
    const ex = exerciseCalls.find((e) => e.choice === 'ClearIssuance')
    expect(ex).toBeTruthy()
    expect(ex!.contractId).toBe('iss-open')
    // winnerCashCids marshaled as the { _1: party, _2: cid } tuple wire shape.
    expect(Array.isArray(ex!.arg.winnerCashCids)).toBe(true)
    for (const t of ex!.arg.winnerCashCids) {
      expect(typeof t._1).toBe('string')
      expect(typeof t._2).toBe('string')
    }
    // Only winning desks are charged; the total minted equals the cleared cross (100).
    const chargedTotal = cleared.winners.reduce((s, w) => s + w.filledQty, 0)
    expect(chargedTotal).toBe(100)
  })

  it('payCoupon enumerates the current bond holders and exercises Coupon (pro-rata, strings)', async () => {
    const cid = seedClearedIssuance()

    const paid = await ledgerMod.payCoupon(cid, 1, 2.5)

    // 10 + 5 units held × 2.5 = 37.5 total coupon.
    expect(paid.holders).toBe(2)
    expect(paid.totalPaid).toBe(37.5)
    const ex = exerciseCalls.find((e) => e.choice === 'Coupon')
    expect(ex).toBeTruthy()
    expect(ex!.arg.period).toBe('1')
    expect(ex!.arg.couponPerUnit).toBe('2.5')
    expect(typeof ex!.arg.period).toBe('string')
    expect(ex!.arg.holderBondCids).toEqual(['h-bond2-A', 'h-bond2-B'])
    expect(ex!.arg.issuerCashCid).toBe('h-cash-issuer')
  })

  it('redeem enumerates holders and exercises Redeem at the principal price (string-marshaled)', async () => {
    const cid = seedClearedIssuance()

    const redeemed = await ledgerMod.redeem(cid, 100)

    expect(redeemed.holders).toBe(2)
    expect(redeemed.totalRepaid).toBe(1500) // (10 + 5) × 100
    const ex = exerciseCalls.find((e) => e.choice === 'Redeem')
    expect(ex).toBeTruthy()
    expect(ex!.arg.principalPerUnit).toBe('100')
    expect(ex!.arg.holderBondCids).toEqual(['h-bond2-A', 'h-bond2-B'])
  })

  it('never leaks the Operator token through the issuance clear/coupon/redeem path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const cid = seedClearedIssuance()
    const paid = await ledgerMod.payCoupon(cid, 1, 2.5)
    const redeemed = await ledgerMod.redeem(cid, 100)

    expect(JSON.stringify({ paid, redeemed })).not.toContain(SENTINEL_TOKEN)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})
