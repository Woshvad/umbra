// solver/src/settlement.test.ts — the executable Daml⇄TS parity contract for the
// pure Batch/Instruction settlement mirror (`settlement.ts`).
//
// The 2×2 multibuyer golden mirrors the Daml `test_multibuyer_golden` /
// `test_netting_conserves` numbers EXACTLY (daml/Umbra/Tests.daml): two buyers
// (A buys 6, D buys 4), two sellers (B sells 7, C sells 3) crossing at ONE uniform
// price p*=100. If the TS mirror ever drifts from the Daml Settlement layer, these
// numbers diverge and this suite goes red — the parity gate for the topology viz +
// receipts (T-11-07-PARITY).
//
// The §4 reduction case proves the generalized N-buyer builder collapses to the
// canonical single-buyer legs A↔B 8@100 / A↔C 2@100 at $100.00 (Pitfall 5: §4 stays
// single-buyer-shaped and byte-identical).

import { describe, it, expect } from 'vitest'
import type { Allocation } from './auction'
import {
  grossLegs,
  netLegs,
  conserves,
  netAmount,
  batchParties,
  type Instruction,
  type InstrumentRef,
} from './settlement'

// Token-agnostic instruments (DFIN-03), operator-issued — the SAME shape the Daml
// golden uses (`InstrumentId {issuer = operator, id}`).
const OPERATOR = 'operator::test'
const CASH: InstrumentRef = { issuer: OPERATOR, id: 'USDCx' }
const BOND: InstrumentRef = { issuer: OPERATOR, id: 'BONDX' }
const INSTS = [BOND, CASH]

// Find the single net leg touching (party, instrument); undefined if none.
const netLegFor = (legs: Instruction[], party: string, inst: InstrumentRef) =>
  legs.filter(
    (l) =>
      l.instrument.id === inst.id &&
      l.instrument.issuer === inst.issuer &&
      (l.sender === party || l.receiver === party),
  )

describe('settlement.ts — Daml⇄TS parity mirror of Umbra.Settlement', () => {
  // THE 2×2 multibuyer golden — mirrors daml/Umbra/Tests.daml::test_multibuyer_golden
  // + test_netting_conserves (A buys 6, D buys 4; B sells 7, C sells 3 @ p*=100).
  describe('2×2 multibuyer golden (parity with test_multibuyer_golden)', () => {
    const price = 100
    const allocs: Allocation[] = [
      { desk: 'bankA', side: 'Buy', filledQty: 6 },
      { desk: 'bankD', side: 'Buy', filledQty: 4 },
      { desk: 'bankB', side: 'Sell', filledQty: 7 },
      { desk: 'bankC', side: 'Sell', filledQty: 3 },
    ]

    it('gross AND netted batches both conserve per instrument', () => {
      const gross = grossLegs(price, allocs, CASH, BOND)
      const net = netLegs(OPERATOR, gross)
      expect(conserves(gross, INSTS)).toBe(true)
      expect(conserves(net, INSTS)).toBe(true)
    })

    it('netting yields EXACTLY one net leg per (party, instrument) — 8 legs', () => {
      const net = netLegs(OPERATOR, grossLegs(price, allocs, CASH, BOND))
      // A bond+6/cash−600, D bond+4/cash−400, B bond−7/cash+700, C bond−3/cash+300.
      expect(net).toHaveLength(8)
      for (const party of ['bankA', 'bankB', 'bankC', 'bankD']) {
        for (const inst of INSTS) {
          expect(netLegFor(net, party, inst)).toHaveLength(1)
        }
      }
      // Each net leg is party↔custodian, so the operator IS the counterparty of every
      // net leg — but because the gross batch conserves, the custodian's OWN net over
      // each instrument is exactly zero (it creates/destroys no value).
      expect(batchParties(net)).toContain(OPERATOR)
      expect(netAmount(net, OPERATOR, BOND)).toBe(0)
      expect(netAmount(net, OPERATOR, CASH)).toBe(0)
    })

    it('net amounts match the Daml golden economics (buyers get bond, sellers cash)', () => {
      const net = netLegs(OPERATOR, grossLegs(price, allocs, CASH, BOND))
      // Buyers are OWED bond (positive net), OWE cash (negative net).
      expect(netAmount(net, 'bankA', BOND)).toBe(6) // A bought 6
      expect(netAmount(net, 'bankD', BOND)).toBe(4) // D bought 4
      expect(netAmount(net, 'bankA', CASH)).toBe(-600)
      expect(netAmount(net, 'bankD', CASH)).toBe(-400)
      // Sellers are OWED cash (positive net), OWE bond (negative net).
      expect(netAmount(net, 'bankB', CASH)).toBe(700) // sold 7 @100
      expect(netAmount(net, 'bankC', CASH)).toBe(300) // sold 3 @100
      expect(netAmount(net, 'bankB', BOND)).toBe(-7)
      expect(netAmount(net, 'bankC', BOND)).toBe(-3)
    })

    it('gross legs preserve every desk economics: Σ cash = Σ bond×p* = 1000, Σ bond = 10', () => {
      const gross = grossLegs(price, allocs, CASH, BOND)
      const cashTotal = gross
        .filter((l) => l.instrument.id === 'USDCx')
        .reduce((s, l) => s + l.amount, 0)
      const bondTotal = gross
        .filter((l) => l.instrument.id === 'BONDX')
        .reduce((s, l) => s + l.amount, 0)
      expect(cashTotal).toBe(1000) // (600 + 100) B + (300) C ... 700+300
      expect(bondTotal).toBe(10) // 7 (B) + 3 (C)
    })
  })

  // §4 single-buyer reduction — mirrors daml/Umbra/Tests.daml::test_settled_balances
  // (A sole buyer 10, B sells 8, C sells 2 @ p*=100). The generalized builder MUST
  // collapse to the two canonical §4 legs A↔B 8@100 / A↔C 2@100 (Pitfall 5).
  describe('§4 single-buyer reduction (A↔B 8@100 / A↔C 2@100)', () => {
    const price = 100
    const allocs: Allocation[] = [
      { desk: 'bankA', side: 'Buy', filledQty: 10 },
      { desk: 'bankB', side: 'Sell', filledQty: 8 },
      { desk: 'bankC', side: 'Sell', filledQty: 2 },
    ]

    it('produces exactly the two §4 bilateral DvP legs (bond seller→A, cash A→seller)', () => {
      const gross = grossLegs(price, allocs, CASH, BOND)
      expect(conserves(gross, INSTS)).toBe(true)

      // A↔B 8@100: bond B→A 8, cash A→B 800.
      expect(gross).toContainEqual({ sender: 'bankB', receiver: 'bankA', instrument: BOND, amount: 8 })
      expect(gross).toContainEqual({ sender: 'bankA', receiver: 'bankB', instrument: CASH, amount: 800 })
      // A↔C 2@100: bond C→A 2, cash A→C 200.
      expect(gross).toContainEqual({ sender: 'bankC', receiver: 'bankA', instrument: BOND, amount: 2 })
      expect(gross).toContainEqual({ sender: 'bankA', receiver: 'bankC', instrument: CASH, amount: 200 })
      // Exactly four legs (two matched pairs), no stray legs.
      expect(gross).toHaveLength(4)
    })

    it('netting the §4 batch is one net leg per (party, instrument): A bond+10/cash−1000', () => {
      const net = netLegs(OPERATOR, grossLegs(price, allocs, CASH, BOND))
      expect(conserves(net, INSTS)).toBe(true)
      expect(netAmount(net, 'bankA', BOND)).toBe(10)
      expect(netAmount(net, 'bankA', CASH)).toBe(-1000)
      expect(netAmount(net, 'bankB', CASH)).toBe(800)
      expect(netAmount(net, 'bankC', CASH)).toBe(200)
      // One leg per (party, instrument) for the three §4 desks.
      for (const party of ['bankA', 'bankB', 'bankC']) {
        for (const inst of INSTS) {
          const legs = netLegFor(net, party, inst)
          expect(legs.length).toBeLessThanOrEqual(1)
        }
      }
    })
  })

  // A deliberately one-sided (non-conserving) batch is caught by `conserves`.
  it('conserves() rejects a malformed non-conserving batch (a one-sided leg)', () => {
    const bad: Instruction[] = [
      { sender: 'bankB', receiver: 'bankA', instrument: BOND, amount: 8 },
      // Missing the balancing cash leg → BOND conserves but... add a self-leg / negative to trip screens.
      { sender: 'bankA', receiver: 'bankA', instrument: CASH, amount: 800 }, // self-leg
    ]
    expect(conserves(bad, INSTS)).toBe(false)
  })
})
