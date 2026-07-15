// scripts/devnet/verify.mjs — assert the §4 post-settlement truth on the FiveNorth
// Canton DevNet sandbox (the DevNet analog of scripts/localnet/verify-settlement.mjs):
//   • per-desk balances  A:10 BONDX/4000 USDCx · B:12/1800 · C:13/1200
//   • conservation       total 35 BONDX, 7000 USDCx (nothing created/destroyed)
//   • per-desk fill disclosure — each desk PARTY is a stakeholder on ONLY its own
//     TradeConfirmation (Daml-level privacy; a per-desk *token* proof needs per-desk
//     credentials, which the shared m2m client cannot issue).
// Run:  SEAPORT_SECRET=... node scripts/devnet/verify.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const SECRET = process.env.SEAPORT_SECRET
if (!SECRET) throw new Error('SEAPORT_SECRET is required')
const AUTH = 'https://auth.sandbox.fivenorth.io/application/o/token/'
const state = JSON.parse(readFileSync(resolve(repoRoot, 'scripts', '.devnet.json'), 'utf8'))
const LEDGER = state.ledger
const P = state.parties
const PKG = process.env.UMBRA_PACKAGE_ID ?? '6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06'

const tok = (await (await fetch(AUTH, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: 'validator-devnet-m2m', client_secret: SECRET, audience: 'validator-devnet-m2m', scope: 'daml_ledger_api' }),
})).json()).access_token

const api = async (method, path, body) => {
  const r = await fetch(`${LEDGER}${path}`, { method, headers: { Authorization: `Bearer ${tok}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let b; try { b = JSON.parse(t) } catch { b = t }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${String(t).slice(0, 200)}`)
  return b
}
const entityOf = (c) => c.templateId.split(':').pop()
const acsOf = async (party) => {
  const { offset } = await api('GET', '/v2/state/ledger-end')
  const arr = await api('POST', '/v2/state/active-contracts', { filter: { filtersByParty: { [party]: {} } }, verbose: true, activeAtOffset: offset })
  return (Array.isArray(arr) ? arr : []).map((e) => e?.contractEntry?.JsActiveContract?.createdEvent).filter((c) => c && c.templateId?.startsWith(PKG))
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

const opAcs = await acsOf(P.operator)
const holdings = opAcs.filter((c) => entityOf(c) === 'Holding')
const bal = (owner, sym) => sum(holdings.filter((c) => c.createArgument.owner === owner && c.createArgument.instrument.id === sym).map((c) => Number(c.createArgument.amount)))

console.log('=== §4 post-settlement balances (REAL Canton DevNet) ===')
const expected = [['bankA', 'BONDX', 10], ['bankA', 'USDCx', 4000], ['bankB', 'BONDX', 12], ['bankB', 'USDCx', 1800], ['bankC', 'BONDX', 13], ['bankC', 'USDCx', 1200]]
let balOk = true
for (const [hint, sym, want] of expected) {
  const got = bal(P[hint], sym)
  const ok = Math.abs(got - want) < 1e-9
  balOk &&= ok
  console.log(`  ${hint} ${sym}: ${got}  (expect ${want}) ${ok ? '✓' : '✗'}`)
}
const totBond = sum(holdings.filter((c) => c.createArgument.instrument.id === 'BONDX').map((c) => Number(c.createArgument.amount)))
const totCash = sum(holdings.filter((c) => c.createArgument.instrument.id === 'USDCx').map((c) => Number(c.createArgument.amount)))
const consOk = Math.abs(totBond - 35) < 1e-9 && Math.abs(totCash - 7000) < 1e-9
console.log(`  conservation: ${totBond} BONDX / ${totCash} USDCx  (expect 35 / 7000) ${consOk ? '✓' : '✗'}`)

console.log('\n=== per-desk TradeConfirmation disclosure ===')
let privOk = true
for (const hint of ['bankA', 'bankB', 'bankC']) {
  const confs = (await acsOf(P[hint])).filter((c) => entityOf(c) === 'TradeConfirmation')
  const ownOnly = confs.every((c) => c.createArgument.desk === P[hint])
  const ok = confs.length === 1 && ownOnly
  privOk &&= ok
  console.log(`  ${hint}: ${confs.length} confirmation(s) — ${ok ? 'ONLY its own ✓' : 'LEAK ✗'} ` +
    confs.map((c) => `(${c.createArgument.side} ${c.createArgument.filledQty}@${Number(c.createArgument.clearingPrice)})`).join(' '))
}
const opConfs = opAcs.filter((c) => entityOf(c) === 'TradeConfirmation')
console.log(`  operator: ${opConfs.length} confirmations (all desks) ${opConfs.length === 3 ? '✓' : '✗'}`)

console.log(`\n${balOk && consOk && privOk && opConfs.length === 3
  ? '✓ SETTLEMENT VERIFIED on REAL CANTON DEVNET — exact §4 balances, conserved, each desk sees only its own fill'
  : '✗ VERIFICATION FAILED'}`)
