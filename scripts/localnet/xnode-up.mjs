// scripts/localnet/xnode-up.mjs — set up the CROSS-NODE money shot for the BROWSER.
// Distributes the three desks across participant nodes, writes the frontend config
// (daml/parties.json + web/src/tokens.json with per-desk proxy bases), and seeds an
// OPEN Round R1 cross-node (each desk submits from its OWN node). The solver
// (operator on app-provider) then clears/settles via the UI exactly as single-node.
//
// Topology: operator + bankC → app-provider (:3975); bankA → app-user (:2975);
// bankB → sv (:4975). To return to single-node: `node scripts/localnet/seed.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const PROVIDER = 'http://localhost:3975'
const USER = 'http://localhost:2975'
const SV = 'http://localhost:4975'
const PKG = '#umbra'
const admin = mintJwt('ledger-api-user')
const op = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8')).operator

const api = async (base, token, method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} @${base} -> HTTP ${res.status}: ${text.slice(0, 280)}`)
  return text ? JSON.parse(text) : {}
}
const entityOf = (c) => c.templateId.split(':').pop()
const moduleOf = (e) =>
  e === 'Venue' ? 'Roles' : e === 'Asset' ? 'Asset' : e === 'Holding' ? 'Holding' : e === 'DeskEligibility' ? 'Compliance' : 'Auction'
const acsOf = async (base, token, party) => {
  const { offset } = await api(base, token, 'GET', '/v2/state/ledger-end')
  const arr = await api(base, token, 'POST', '/v2/state/active-contracts', {
    filter: { filtersByParty: { [party]: {} } },
    verbose: true,
    activeAtOffset: offset,
  })
  return (Array.isArray(arr) ? arr : [])
    .map((e) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c) => c && c.packageName === 'umbra')
}
const create = (base, token, actAs, tmpl, args) =>
  api(base, token, 'POST', '/v2/commands/submit-and-wait', {
    commandId: `xu-c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    actAs: [actAs],
    commands: [{ CreateCommand: { templateId: `${PKG}:${tmpl}`, createArguments: args } }],
  })
const exercise = (base, token, actAs, tmpl, cid, choice, arg) =>
  api(base, token, 'POST', '/v2/commands/submit-and-wait', {
    commandId: `xu-e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    actAs: [actAs],
    commands: [{ ExerciseCommand: { templateId: `${PKG}:${tmpl}`, contractId: cid, choice, choiceArgument: arg } }],
  })
const grant = (base, userId, partyIds) =>
  api(base, admin, 'POST', `/v2/users/${userId}/rights`, {
    userId,
    identityProviderId: '',
    rights: partyIds.flatMap((party) => [
      { kind: { CanActAs: { value: { party } } } },
      { kind: { CanReadAs: { value: { party } } } },
    ]),
  })
const provisionDesk = async (base, hint) => {
  const existing = (await api(base, admin, 'GET', '/v2/parties')).partyDetails.find((p) => p.party.startsWith(`${hint}::`) && p.isLocal)
  const party = existing
    ? existing.party
    : (await api(base, admin, 'POST', '/v2/parties', { partyIdHint: hint, identityProviderId: '' })).partyDetails.party
  const userId = `umbra-${hint}`
  const users = new Set((await api(base, admin, 'GET', '/v2/users')).users.map((u) => u.id))
  if (!users.has(userId))
    await api(base, admin, 'POST', '/v2/users', {
      user: { id: userId, isDeactivated: false, primaryParty: party, identityProviderId: '', metadata: { resourceVersion: '', annotations: {} } },
      rights: [],
    })
  await grant(base, userId, [party])
  return { party, token: mintJwt(userId) }
}
const venueObservedBy = async (base, token, party) =>
  (await acsOf(base, token, party)).find((c) => entityOf(c) === 'Venue' && c.createArgument.desks.includes(party))

console.log('=== cross-node bring-up (browser money shot) ===\n')

// 1. Distribute desks: bankA→app-user, bankB→sv, bankC→app-provider (with operator).
const A = await provisionDesk(USER, 'bankA')
const B = await provisionDesk(SV, 'bankB')
const C = await provisionDesk(PROVIDER, 'bankC')
await grant(PROVIDER, 'ledger-api-user', [op]) // operator's admin can act/read as operator
console.log(`✓ bankA (Buyer)  → app-user (:2975)     ${A.party.slice(0, 22)}…`)
console.log(`✓ bankB (Seller) → sv       (:4975)     ${B.party.slice(0, 22)}…`)
console.log(`✓ bankC (Seller) → app-provider (:3975) ${C.party.slice(0, 22)}…\n`)

// 2. Write the frontend config: party map + desk tokens (with per-desk proxy bases).
writeFileSync(
  resolve(repoRoot, 'daml', 'parties.json'),
  JSON.stringify({ operator: op, bankA: A.party, bankB: B.party, bankC: C.party }, null, 2) + '\n',
)
writeFileSync(
  resolve(repoRoot, 'web', 'src', 'tokens.json'),
  JSON.stringify(
    {
      bankA: { party: A.party, token: A.token, base: '/cn/app-user' },
      bankB: { party: B.party, token: B.token, base: '/cn/sv' },
      bankC: { party: C.party, token: C.token, base: '' },
    },
    null,
    2,
  ) + '\n',
)
writeFileSync(
  resolve(repoRoot, 'scripts', '.operator-token'),
  JSON.stringify({ party: op, token: mintJwt('ledger-api-user') }, null, 2) + '\n',
)
console.log('✓ wrote daml/parties.json + web/src/tokens.json (per-desk bases) + scripts/.operator-token\n')

// 3. Full-clean the operator ACS, then seed Venue + §4 Assets + Round R1 cross-node.
for (const c of await acsOf(PROVIDER, admin, op)) {
  const e = entityOf(c)
  await exercise(PROVIDER, admin, op, `Umbra.${moduleOf(e)}:${e}`, c.contractId, e === 'Order' ? 'Retire' : 'Archive', {}).catch(() => {})
}
await create(PROVIDER, admin, op, 'Umbra.Roles:Venue', { operator: op, desks: [A.party, B.party, C.party] })
// COMP-01: one DeskEligibility per desk (operator == compliance stub). observer = desk,
// so it replicates to that desk's node and the cross-node SubmitOrder can fetch it on-ledger.
for (const d of [A.party, B.party, C.party])
  await create(PROVIDER, admin, op, 'Umbra.Compliance:DeskEligibility', { operator: op, compliance: op, desk: d, accredited: true, jurisdiction: 'US', sanctionsClear: true })
// §4 holdings as token-agnostic `Umbra.Holding:Holding` (DFIN-01). The retired `Asset`
// is OFF the live settle path, so the solver's gatherHoldingCids only matches `Holding`s.
// instrument = {issuer, id} InstrumentId record; a fresh holding is free (lock = null).
const bondInstrument = { issuer: op, id: 'BONDX' }
const cashInstrument = { issuer: op, id: 'USDCx' }
const mint = (owner, instrument, amount) => create(PROVIDER, admin, op, 'Umbra.Holding:Holding', { operator: op, owner, instrument, amount, lock: null })
await mint(A.party, cashInstrument, '5000.0')
await mint(B.party, bondInstrument, '20.0')
await mint(B.party, cashInstrument, '1000.0')
await mint(C.party, bondInstrument, '15.0')
await mint(C.party, cashInstrument, '1000.0')
await create(PROVIDER, admin, op, 'Umbra.Auction:Round', { operator: op, roundId: 'R1', symbol: 'BONDX', desks: [A.party, B.party, C.party], openedAt: new Date().toISOString(), windowSeconds: 60, status: 'Open' })
console.log('✓ seeded Venue + 3 DeskEligibility + 5 §4 Holdings + OPEN Round R1 (operator on app-provider)')

// 4. Each desk submits its sealed order FROM ITS OWN NODE.
await new Promise((r) => setTimeout(r, 1800))
const vA = await venueObservedBy(USER, A.token, A.party)
const vB = await venueObservedBy(SV, B.token, B.party)
const vC = await venueObservedBy(PROVIDER, C.token, C.party)
if (!vA || !vB || !vC) throw new Error(`Venue replication incomplete: A=${!!vA} B=${!!vB} C=${!!vC}`)
// Each desk's own eligibility cid (from the operator's ACS; the desk observes its own credential).
const opAcs = await acsOf(PROVIDER, admin, op)
const eligOf = (party) => {
  const e = opAcs.find((c) => entityOf(c) === 'DeskEligibility' && c.createArgument.desk === party)
  if (!e) throw new Error(`no DeskEligibility credential for ${party}`)
  return e.contractId
}
await exercise(USER, A.token, A.party, 'Umbra.Roles:Venue', vA.contractId, 'SubmitOrder', { desk: A.party, roundId: 'R1', side: 'Buy', quantity: 10, limit: '101.0', orderType: 'Limit', minQty: null, firmIf: null, eligCid: eligOf(A.party) })
await exercise(SV, B.token, B.party, 'Umbra.Roles:Venue', vB.contractId, 'SubmitOrder', { desk: B.party, roundId: 'R1', side: 'Sell', quantity: 8, limit: '99.0', orderType: 'Limit', minQty: null, firmIf: null, eligCid: eligOf(B.party) })
await exercise(PROVIDER, C.token, C.party, 'Umbra.Roles:Venue', vC.contractId, 'SubmitOrder', { desk: C.party, roundId: 'R1', side: 'Sell', quantity: 5, limit: '100.0', orderType: 'Limit', minQty: null, firmIf: null, eligCid: eligOf(C.party) })
await create(PROVIDER, admin, op, 'Umbra.Auction:RoundStats', { operator: op, roundId: 'R1', desks: [A.party, B.party, C.party], sealedOrderCount: 3 })
console.log('✓ orders submitted FROM THEIR OWN NODES — A@app-user · B@sv · C@app-provider + RoundStats{3}\n')

// 5. Privacy proof: each desk's node holds only its own order.
await new Promise((r) => setTimeout(r, 1500))
const ordersAt = async (base, token, party) => (await acsOf(base, token, party)).filter((c) => entityOf(c) === 'Order' && c.createArgument.roundId === 'R1')
const a1 = await ordersAt(USER, A.token, A.party)
const b1 = await ordersAt(SV, B.token, B.party)
const c1 = await ordersAt(PROVIDER, C.token, C.party)
console.log('=== per-node privacy ===')
console.log(`  bankA @ app-user node sees ${a1.length} order — ${a1.length === 1 && a1[0].createArgument.desk === A.party ? 'only its own ✓' : '✗'}`)
console.log(`  bankB @ sv node       sees ${b1.length} order — ${b1.length === 1 && b1[0].createArgument.desk === B.party ? 'only its own ✓' : '✗'}`)
console.log(`  bankC @ app-provider  sees ${c1.length} order — ${c1.length === 1 && c1[0].createArgument.desk === C.party ? 'only its own ✓' : '✗'}`)
console.log('\n✓ cross-node R1 ready — restart the solver + web; the browser desks now talk to 3 different nodes')
