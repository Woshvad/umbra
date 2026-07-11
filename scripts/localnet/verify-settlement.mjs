// scripts/localnet/verify-settlement.mjs — assert the on-ledger §4 post-settlement
// truth on the real Canton LocalNet (spec §10, the HackCanton judges' check):
//   • per-desk balances  A:10 BONDX/4000 USDCx · B:12/1800 · C:13/1200
//   • conservation       total 35 BONDX, 7000 USDCx (nothing created/destroyed)
//   • per-desk privacy    each desk sees ONLY its own TradeConfirmation
import { queryAcs, parties, entityOf } from './v2.mjs'
import { mintJwt } from './mint-jwt.mjs'

const op = parties.operator
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const nameOf = (p) => p.split('::')[0]

// Balances: sum every Holding (split across many contracts after DvP) per owner+instrument.
// The §4 settle path rides token-agnostic `Holding` (DFIN-01), NOT the retired `Asset`:
// symbol → instrument.id, quantity → amount.
const holdings = (await queryAcs(op)).filter((c) => entityOf(c.templateId) === 'Holding')
const bal = (owner, symbol) =>
  sum(
    holdings
      .filter((c) => c.createArgument.owner === owner && c.createArgument.instrument.id === symbol)
      .map((c) => Number(c.createArgument.amount)),
  )

const expected = [
  ['bankA', 'BONDX', 10],
  ['bankA', 'USDCx', 4000],
  ['bankB', 'BONDX', 12],
  ['bankB', 'USDCx', 1800],
  ['bankC', 'BONDX', 13],
  ['bankC', 'USDCx', 1200],
]
console.log('=== §4 post-settlement balances (on real Canton) ===')
let balOk = true
for (const [hint, sym, want] of expected) {
  const got = bal(parties[hint], sym)
  const ok = Math.abs(got - want) < 1e-9
  balOk &&= ok
  console.log(`  ${hint} ${sym}: ${got}  (expect ${want}) ${ok ? '✓' : '✗'}`)
}
const totBond = sum(holdings.filter((c) => c.createArgument.instrument.id === 'BONDX').map((c) => Number(c.createArgument.amount)))
const totCash = sum(holdings.filter((c) => c.createArgument.instrument.id === 'USDCx').map((c) => Number(c.createArgument.amount)))
const consOk = Math.abs(totBond - 35) < 1e-9 && Math.abs(totCash - 7000) < 1e-9
console.log(`  conservation: ${totBond} BONDX / ${totCash} USDCx  (expect 35 / 7000) ${consOk ? '✓' : '✗'}`)

// Privacy: each desk sees ONLY its own TradeConfirmation (observer = singular desk).
console.log('\n=== per-desk TradeConfirmation privacy ===')
const deskUsers = { bankA: 'umbra-bankA', bankB: 'umbra-bankB', bankC: 'umbra-bankC' }
let privOk = true
for (const [hint, userId] of Object.entries(deskUsers)) {
  const confs = (await queryAcs(parties[hint], mintJwt(userId))).filter((c) => entityOf(c.templateId) === 'TradeConfirmation')
  const ownOnly = confs.every((c) => c.createArgument.desk === parties[hint])
  const ok = confs.length === 1 && ownOnly
  privOk &&= ok
  console.log(
    `  ${hint}: ${confs.length} confirmation(s) — ${ok ? 'ONLY its own ✓' : 'LEAK ✗'} ` +
      confs.map((c) => `(${c.createArgument.side} ${c.createArgument.filledQty}@${Number(c.createArgument.clearingPrice)})`).join(' '),
  )
}
const opConfs = (await queryAcs(op)).filter((c) => entityOf(c.templateId) === 'TradeConfirmation')
console.log(`  operator: ${opConfs.length} confirmations (all desks) ${opConfs.length === 3 ? '✓' : '✗'}`)

console.log(
  `\n${balOk && consOk && privOk && opConfs.length === 3
    ? '✓ SETTLEMENT VERIFIED on real Canton — exact §4 balances, conserved, each desk sees only its own fill'
    : '✗ VERIFICATION FAILED'}`,
)
