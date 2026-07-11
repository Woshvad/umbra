// scripts/localnet/seed.mjs — seed the canonical §4 money-shot state on the real
// Canton LocalNet, then PROVE per-desk privacy structurally.
//
// Mirrors Umbra.Setup:seedOpenRound but over the JSON Ledger API v2:
//   • clean any prior umbra contracts (deterministic seed)
//   • one Venue{operator, desks=[A,B,C]}
//   • the §4 holdings (5 Assets): A 5000 USDCx · B 20 BONDX + 1000 USDCx ·
//     C 15 BONDX + 1000 USDCx
//   • an OPEN Round R1 (BONDX, 60s window)
//   • the 3 §4 orders, each SUBMITTED UNDER ITS OWN DESK AUTHORITY via Venue.SubmitOrder
//     (A Buy 10@101 · B Sell 8@99 · C Sell 5@100)
//   • RoundStats{sealedOrderCount=3}
//
// Then it queries each desk's ACS WITH THAT DESK'S OWN TOKEN and asserts the desk
// sees exactly ONE Order (its own) and none of the others' — the privacy money shot,
// enforced by the ledger (Order signatory = operator+desk, NO observer).
import { create, exercise, queryAcs, parties, entityOf, PARTICIPANT } from './v2.mjs'
import { mintJwt } from './mint-jwt.mjs'

const op = parties.operator
const desks = [parties.bankA, parties.bankB, parties.bankC]
const moduleEntity = (templateId) => templateId.split(':').slice(1).join(':') // "Umbra.Asset:Asset"

console.log(`seeding §4 fixture on ${PARTICIPANT}\n`)

// 1. CLEAN — archive/retire any pre-existing umbra contracts for a deterministic seed.
//    Some credentials cannot be archived under operator authority ALONE: the two-party
//    `ClearingApproval` is signed by operator AND the DISTINCT four-eyes compliance
//    authority (IDEN-03), and four-eyes forbids any single party holding both. Skip
//    those gracefully rather than hard-failing the reseed — a stale, round+price-scoped
//    approval is harmless (the settle path re-verifies round+price on a fresh approval).
const existing = await queryAcs(op)
let cleaned = 0
let skipped = 0
for (const c of existing) {
  const choice = entityOf(c.templateId) === 'Order' ? 'Retire' : 'Archive'
  try {
    await exercise(moduleEntity(c.templateId), c.contractId, choice, {}, op)
    cleaned++
  } catch {
    skipped++ // multi-authority credential (e.g. ClearingApproval) — operator can't solo-archive.
  }
}
console.log(`✓ cleaned ${cleaned} pre-existing umbra contract(s)${skipped ? ` (skipped ${skipped} multi-authority credential(s))` : ''}`)

// 2. Venue.
await create('Umbra.Roles:Venue', { operator: op, desks }, op)

// 3. COMP-01 eligibility credentials — one per desk, created BEFORE any SubmitOrder
//    (the deployed Venue.SubmitOrder fetches eligCid and asserts eligibility
//    on-ledger). operator == compliance for the MVP stub, mirroring Umbra.Setup.
for (const desk of desks) {
  await create(
    'Umbra.Compliance:DeskEligibility',
    { operator: op, compliance: op, desk, accredited: true, jurisdiction: 'US', sanctionsClear: true },
    op,
  )
}
console.log('✓ seeded 3 DeskEligibility credentials (accredited · US · sanctions-clear)')

// 4. §4 holdings as token-agnostic `Umbra.Holding:Holding` (DFIN-01). The retired
//    `Asset` is OFF the live settle path, so the solver's gatherHoldingCids only
//    matches `Holding`s — minting Asset here would leave settle with zero holdings.
//    `instrument` is the {issuer, id} InstrumentId record; a fresh holding is free
//    (lock = None → null). Decimals as strings (numbers also accepted).
const bondInstrument = { issuer: op, id: 'BONDX' }
const cashInstrument = { issuer: op, id: 'USDCx' }
const mintHolding = (owner, instrument, amount) =>
  create('Umbra.Holding:Holding', { operator: op, owner, instrument, amount, lock: null }, op)
await mintHolding(parties.bankA, cashInstrument, '5000.0')
await mintHolding(parties.bankB, bondInstrument, '20.0')
await mintHolding(parties.bankB, cashInstrument, '1000.0')
await mintHolding(parties.bankC, bondInstrument, '15.0')
await mintHolding(parties.bankC, cashInstrument, '1000.0')
console.log('✓ minted 5 §4 Holdings')

// 4. Open Round R1.
await create(
  'Umbra.Auction:Round',
  { operator: op, roundId: 'R1', symbol: 'BONDX', desks, openedAt: new Date().toISOString(), windowSeconds: 60, status: 'Open' },
  op,
)
console.log('✓ opened Round R1 (Open, 60s)')

// 6. The three §4 orders, each under ITS OWN desk authority, eligibility-gated.
//    The deployed SubmitOrder requires orderType/minQty/firmIf + the desk's
//    DeskEligibility cid (§4 orders are plain Limit: minQty/firmIf = None → null).
const acs = await queryAcs(op)
const venue = acs.find((c) => entityOf(c.templateId) === 'Venue')
if (!venue) throw new Error('Venue not found after create')
const eligOf = (desk) => {
  const e = acs.find((c) => entityOf(c.templateId) === 'DeskEligibility' && c.createArgument.desk === desk)
  if (!e) throw new Error(`no DeskEligibility credential found for ${desk}`)
  return e.contractId
}
const submitOrder = (desk, side, quantity, limit) =>
  exercise(
    'Umbra.Roles:Venue',
    venue.contractId,
    'SubmitOrder',
    { desk, roundId: 'R1', side, quantity, limit, orderType: 'Limit', minQty: null, firmIf: null, eligCid: eligOf(desk) },
    desk,
  )
await submitOrder(parties.bankA, 'Buy', 10, '101.0')
await submitOrder(parties.bankB, 'Sell', 8, '99.0')
await submitOrder(parties.bankC, 'Sell', 5, '100.0')
console.log('✓ submitted 3 sealed orders (A Buy 10@101 · B Sell 8@99 · C Sell 5@100)')

// 6. RoundStats{count=3} (the only pre-clear shared info).
await create('Umbra.Auction:RoundStats', { operator: op, roundId: 'R1', desks, sealedOrderCount: 3 }, op)
console.log('✓ seeded RoundStats{sealedOrderCount=3}\n')

// 7. PRIVACY PROOF — each desk, with its OWN token, sees exactly its own order.
const deskUsers = { bankA: 'umbra-bankA', bankB: 'umbra-bankB', bankC: 'umbra-bankC' }
let allGood = true
for (const [hint, userId] of Object.entries(deskUsers)) {
  const token = mintJwt(userId)
  const mine = await queryAcs(parties[hint], token)
  const orders = mine.filter((c) => entityOf(c.templateId) === 'Order')
  const ownOnly = orders.every((o) => o.createArgument.desk === parties[hint])
  const ok = orders.length === 1 && ownOnly
  allGood &&= ok
  console.log(
    `  ${hint}: sees ${orders.length} order(s) — ${ok ? 'ONLY its own ✓' : 'LEAK ✗'} ` +
      `(${orders.map((o) => `${o.createArgument.side} ${o.createArgument.quantity}@${o.createArgument.limit}`).join(', ')})`,
  )
}
// Operator (Order signatory) sees all three.
const opOrders = (await queryAcs(op)).filter((c) => entityOf(c.templateId) === 'Order')
console.log(`  operator: sees ${opOrders.length} orders (all three) ${opOrders.length === 3 ? '✓' : '✗'}`)

console.log(`\n${allGood && opOrders.length === 3 ? '✓ PRIVACY VERIFIED on real Canton — each desk is blind to the others' : '✗ PRIVACY CHECK FAILED'}`)
