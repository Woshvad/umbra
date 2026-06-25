// solver/src/ledger.test.ts — stubbed-ledger unit tests (NO live sandbox).
//
// The acceptance keystone (SOLV-01 BLOCKER fix): prove that `refreshStats` on a
// freshly-opened round whose sealed-order query returns N orders WRITES the
// recomputed count via `updateStats` (archive+recreate) so `sealedOrderCount`
// advances OFF '0' — and that the Operator token never leaks into a return value
// or a log (SOLV-04 / T-04-04).
//
// We mock `@daml/ledger` so the module-level `new Ledger(...)` in ledger.ts gets a
// fake whose query/create/archive WE control. The token is read at import time from
// the real (gitignored) scripts/.operator-token via node:fs — that read is left
// intact; we assert the token string is never surfaced.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// A sentinel that stands in for the secret token: if it ever appears in a return
// value or a console line, the leak test fails.
const SENTINEL_TOKEN = 'SENTINEL_OPERATOR_TOKEN_DO_NOT_LEAK'

// In-memory ACS the fake Ledger reads/writes. The keys are the generated template
// objects; we match on identity, falling back to templateId.
type Row = { contractId: string; payload: Record<string, unknown> }
const acs = new Map<string, Row[]>()
let cidSeq = 0

const keyFor = (template: { templateId?: string }): string => template.templateId ?? 'unknown'

// The fake Ledger. Records what create/archive were called with so the test can
// assert updateStats fired with the recomputed count.
const createCalls: { key: string; payload: Record<string, unknown> }[] = []
const archiveCalls: { key: string; contractId: string }[] = []

class FakeLedger {
  // The constructor receives { token, httpBaseUrl }. We snapshot the token ONLY to
  // prove ledger.ts passed it to the client (server-side) — never to expose it.
  public readonly _ctorToken: string
  constructor(opts: { token: string; httpBaseUrl: string }) {
    this._ctorToken = opts.token
  }
  async query(template: { templateId?: string }): Promise<Row[]> {
    return acs.get(keyFor(template)) ?? []
  }
  async create(template: { templateId?: string }, payload: Record<string, unknown>): Promise<Row> {
    const key = keyFor(template)
    const row: Row = { contractId: `cid-${++cidSeq}`, payload }
    acs.set(key, [...(acs.get(key) ?? []), row])
    createCalls.push({ key, payload })
    return row
  }
  async archive(template: { templateId?: string }, contractId: string): Promise<unknown> {
    const key = keyFor(template)
    acs.set(key, (acs.get(key) ?? []).filter((r) => r.contractId !== contractId))
    archiveCalls.push({ key, contractId })
    return { archived: { contractId } }
  }
  async exercise(): Promise<unknown> {
    return [undefined, []]
  }
}

vi.mock('@daml/ledger', () => ({ default: FakeLedger }))

// Force the credential read to use a sentinel token regardless of the on-disk file,
// so the leak assertions are deterministic and self-contained.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: (path: unknown, ...rest: unknown[]) => {
      const p = String(path)
      if (p.includes('.operator-token')) {
        return JSON.stringify({ token: SENTINEL_TOKEN, party: 'Operator::test' })
      }
      // @ts-expect-error pass-through to the real impl for anything else
      return actual.readFileSync(path, ...rest)
    },
  }
})

// Import AFTER the mocks so ledger.ts constructs the FakeLedger with the sentinel.
const ledgerMod = await import('./ledger.js')
const { Order } = await import('@daml.js/umbra-0.1.0/lib/Umbra/Auction/module')
const { RoundStats } = await import('@daml.js/umbra-0.1.0/lib/Umbra/Auction/module')

const ORDER_KEY = keyFor(Order as unknown as { templateId?: string })
const STATS_KEY = keyFor(RoundStats as unknown as { templateId?: string })

const seedSealedOrders = (roundId: string, n: number): void => {
  const rows: Row[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      contractId: `order-${i}`,
      payload: {
        operator: 'Operator::test',
        desk: `Bank${i}::test`,
        roundId,
        side: i === 0 ? 'Buy' : 'Sell',
        quantity: String((i + 1) * 10),
        limit: '100.0',
        status: 'Sealed',
      },
    })
  }
  acs.set(ORDER_KEY, rows)
}

const seedFreshStats = (roundId: string): void => {
  acs.set(STATS_KEY, [
    {
      contractId: 'stats-0',
      payload: {
        operator: 'Operator::test',
        roundId,
        desks: ['BankA::test', 'BankB::test', 'BankC::test'],
        sealedOrderCount: '0',
      },
    },
  ])
}

describe('ledger.refreshStats (stubbed ledger — no live sandbox)', () => {
  beforeEach(() => {
    acs.clear()
    createCalls.length = 0
    archiveCalls.length = 0
    cidSeq = 0
  })

  it('advances a fresh round sealedOrderCount off "0" to the recomputed count via updateStats', async () => {
    seedFreshStats('R1')
    seedSealedOrders('R1', 3) // three desks have sealed (BLOCKER scenario)

    const count = await ledgerMod.refreshStats('R1')

    expect(count).toBe(3)
    // updateStats fired: the old RoundStats was archived and a new one recreated.
    expect(archiveCalls.some((c) => c.key === STATS_KEY)).toBe(true)
    const statsCreate = createCalls.filter((c) => c.key === STATS_KEY)
    expect(statsCreate.length).toBeGreaterThan(0)
    // The recreated RoundStats holds the recomputed count as a STRING — off '0'.
    const last = statsCreate[statsCreate.length - 1].payload
    expect(last.sealedOrderCount).toBe('3')
    // Live ACS now reflects the advanced count.
    const live = acs.get(STATS_KEY)!
    expect(live[live.length - 1].payload.sealedOrderCount).toBe('3')
  })

  it('is a no-op write when the recorded count already matches (idempotent)', async () => {
    acs.set(STATS_KEY, [
      {
        contractId: 'stats-0',
        payload: { operator: 'Operator::test', roundId: 'R1', desks: [], sealedOrderCount: '2' },
      },
    ])
    seedSealedOrders('R1', 2)

    const count = await ledgerMod.refreshStats('R1')

    expect(count).toBe(2)
    // No archive+recreate because the count was unchanged.
    expect(archiveCalls.filter((c) => c.key === STATS_KEY).length).toBe(0)
    expect(createCalls.filter((c) => c.key === STATS_KEY).length).toBe(0)
  })

  it('never leaks the Operator token in operatorParty, refreshStats result, or logs', async () => {
    seedFreshStats('R1')
    seedSealedOrders('R1', 1)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const party = ledgerMod.operatorParty
    const result = await ledgerMod.refreshStats('R1')

    // The exported party is the public id, NOT the token.
    expect(party).toBe('Operator::test')
    expect(party).not.toContain(SENTINEL_TOKEN)
    // No exported value serializes to the token.
    expect(JSON.stringify({ party, result })).not.toContain(SENTINEL_TOKEN)
    // Nothing was logged with the token.
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
  })
})
