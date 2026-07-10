// solver/src/settlement.ts — the PURE TypeScript mirror of `Umbra.Settlement`
// (Daml⇄TS parity, CLEAR-05 discipline). It transforms a VERIFIED allocation at the
// uniform clearing price p* into `Instruction` DvP legs, nets them per
// (party, instrument) through a settlement custodian (CCP), and proves per-instrument
// conservation — function-for-function byte-mirroring daml/Umbra/Settlement.daml
// (buildGrossInstructions / netLegs / conservationOk).
//
// This is the SOURCE the topology viz + receipts read: the gross legs are always
// derivable (bilateral DvP) and the netted legs are the default projection (one leg
// per (party, instrument)). It is DOM-free / no fetch / deterministic — a pure
// function of plain data, unit-testable without the ledger, exactly like `auction.ts`.
//
// It settles NOTHING on-ledger (that is `ledger.ts` settle() via the Daml
// `settleBatch`); this module is the off-ledger twin the Daml `test_netting_conserves`
// / `test_multibuyer_golden` numbers are checked against for parity.

import type { Allocation, Side } from './auction.js'

// The token-agnostic instrument reference (DFIN-03), mirroring the Daml
// `InstrumentId {issuer, id}`. `issuer` disambiguates the same textual `id` across
// registries; `id` is the human symbol ("BONDX" / "USDCx"). A leg NEVER hardcodes a
// symbol string — it references this pair.
export interface InstrumentRef {
  issuer: string
  id: string
}

// A single DvP leg: `sender` delivers `amount` of `instrument` to `receiver`.
// Byte-mirror of the Daml `Instruction` record. Pure data.
export interface Instruction {
  sender: string
  receiver: string
  instrument: InstrumentRef
  amount: number
}

// Structural instrument equality (mirrors the Daml derived `Eq` on InstrumentId).
const instrEq = (a: InstrumentRef, b: InstrumentRef): boolean =>
  a.issuer === b.issuer && a.id === b.id

// Order-preserving dedup keeping the FIRST occurrence (mirrors DA.List.dedup).
const dedup = <T,>(xs: T[], eq: (a: T, b: T) => boolean): T[] => {
  const out: T[] = []
  for (const x of xs) if (!out.some((y) => eq(y, x))) out.push(x)
  return out
}

// Expand one side of the verified allocation into a flat list of per-unit party
// slots, ordered deterministically by desk (so the pairing below is stable). Each
// filled unit becomes one slot; a 0-fill or opposite-side row contributes nothing.
// Byte-mirror of Settlement.daml::unitsFor (`sortOn show desk`, `replicate`).
export const unitsFor = (side: Side, allocs: Allocation[]): string[] =>
  allocs
    .filter((a) => a.side === side && a.filledQty > 0)
    .sort((a, b) => (a.desk < b.desk ? -1 : a.desk > b.desk ? 1 : 0))
    .flatMap((a) => Array<string>(a.filledQty).fill(a.desk))

// Build the GROSS DvP legs from the VERIFIED allocation at p*. Generalizes the
// single-buyer fold to N buyers × M sellers, byte-mirroring
// Settlement.daml::buildGrossInstructions:
//   * every Sell desk delivers `filledQty` of `bondInstrument` to buyer(s);
//   * each buyer pays `filledQty * p*` of `cashInstrument`.
// Because the clearing price is UNIFORM the cash owed per matched unit is identical,
// so ANY unit pairing conserves — we pair the desk-sorted buy-unit slots against the
// desk-sorted sell-unit slots position-by-position (`zip`), then aggregate each
// distinct (buyer, seller) pair into one bond leg (seller→buyer) + one cash leg
// (buyer→seller). On a VERIFIED allocation Σbuy == Σsell, so `zip` loses no unit.
export const grossLegs = (
  price: number,
  allocations: Allocation[],
  cashInstrument: InstrumentRef,
  bondInstrument: InstrumentRef,
): Instruction[] => {
  const buys = unitsFor('Buy', allocations)
  const sells = unitsFor('Sell', allocations)
  const n = Math.min(buys.length, sells.length)
  const pairs: [string, string][] = []
  for (let i = 0; i < n; i++) pairs.push([buys[i], sells[i]])
  const distinctPairs = dedup(pairs, (a, b) => a[0] === b[0] && a[1] === b[1])
  const unitsOf = (pr: [string, string]): number =>
    pairs.filter(([b, s]) => b === pr[0] && s === pr[1]).length
  const legs: Instruction[] = []
  for (const pr of distinctPairs) {
    const [buyer, seller] = pr
    const units = unitsOf(pr)
    // BOND leg: seller delivers `units` to buyer; CASH leg: buyer pays units*p*.
    legs.push({ sender: seller, receiver: buyer, instrument: bondInstrument, amount: units })
    legs.push({ sender: buyer, receiver: seller, instrument: cashInstrument, amount: units * price })
  }
  return legs
}

// Every party mentioned in a batch (as sender or receiver), de-duplicated
// (mirrors Settlement.daml::batchParties).
export const batchParties = (legs: Instruction[]): string[] =>
  dedup([...legs.map((l) => l.sender), ...legs.map((l) => l.receiver)], (a, b) => a === b)

// Net position of `party` in `inst` across a batch: Σ received − Σ delivered.
// Positive = the party is owed (a net receive); negative = the party owes; zero = flat.
// Byte-mirror of Settlement.daml::netAmount.
export const netAmount = (legs: Instruction[], party: string, inst: InstrumentRef): number =>
  legs
    .filter((l) => l.receiver === party && instrEq(l.instrument, inst))
    .reduce((s, l) => s + l.amount, 0) -
  legs
    .filter((l) => l.sender === party && instrEq(l.instrument, inst))
    .reduce((s, l) => s + l.amount, 0)

// Multilateral netting through a settlement `custodian` (DEFAULT ON). Collapses the
// gross legs to EXACTLY ONE net `Instruction` per (party, instrument) with a non-zero
// net: a positive net becomes a receive from the custodian (sender = custodian), a
// negative net a deliver to the custodian (receiver = custodian). The gross list is
// NOT mutated (callers keep it for the topology viz / gross receipts). Byte-mirror of
// Settlement.daml::netLegs (parties OUTER, instruments INNER — the emission order is
// load-bearing for parity with the Daml `concat [oneLeg p i | p <- parties, i <- insts]`).
export const netLegs = (custodian: string, legs: Instruction[]): Instruction[] => {
  const insts = dedup(legs.map((l) => l.instrument), instrEq)
  const parties = batchParties(legs).filter((p) => p !== custodian)
  const out: Instruction[] = []
  for (const party of parties) {
    for (const inst of insts) {
      const net = netAmount(legs, party, inst)
      if (net > 0) {
        out.push({ sender: custodian, receiver: party, instrument: inst, amount: net })
      } else if (net < 0) {
        out.push({ sender: party, receiver: custodian, instrument: inst, amount: -net })
      }
    }
  }
  return out
}

// Per-instrument conservation predicate — the fail-loud gate `Round.Clear` asserts on
// the built legs. A batch is conserving iff, for every instrument, every party's net
// summed over ALL parties is zero (no value created/destroyed), AND every leg is
// well-formed (non-negative amount, no self-leg). Byte-mirror of
// Settlement.daml::conservationOk. Uses an epsilon on the summed-net check because JS
// numbers are IEEE-754 (Daml uses exact Decimal) — the golden values are integer /
// integer×price so the drift is 0 in practice, but the tolerance keeps a fractional
// p* honest.
export const conserves = (legs: Instruction[], instruments: InstrumentRef[]): boolean => {
  const parties = batchParties(legs)
  const instrumentConserves = (inst: InstrumentRef): boolean =>
    Math.abs(parties.reduce((s, p) => s + netAmount(legs, p, inst), 0)) < 1e-9
  return (
    legs.every((l) => l.amount >= 0) &&
    legs.every((l) => l.sender !== l.receiver) &&
    instruments.every(instrumentConserves)
  )
}
