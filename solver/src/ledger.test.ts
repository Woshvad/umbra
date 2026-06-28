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
        const { contractId, choice, templateId } = cmd.ExerciseCommand
        if (choice === 'Archive' || choice === 'Retire') {
          acs = acs.filter((c) => c.contractId !== contractId)
          archiveCalls.push({ template: templateId, cid: contractId })
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

beforeEach(() => {
  acs = []
  cidSeq = 0
  createCalls.length = 0
  archiveCalls.length = 0
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
