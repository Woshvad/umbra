// scripts/localnet/xnode-moneyshot.mjs — the §19 capstone: run the ENTIRE §4
// money shot with the three desks hosted on DIFFERENT Canton participant nodes
// (true cross-node sub-transaction privacy), then clear + atomically settle and
// verify the exact §4 balances — all over real multi-node Canton.
//
// Topology (round XR1; uses fresh xbank* desks, fully separable from R1):
//   operator + xbankC → app-provider (:3975)
//   xbankA (Buyer)    → app-user     (:2975)   ← its own node
//   xbankB (Seller)   → sv           (:4975)   ← its own node
//
// Each desk SUBMITS its sealed order from ITS OWN participant (a cross-node tx
// co-signed by the operator). Operator-custody Assets live on app-provider, so the
// operator drives Round.Clear there exactly as in the single-node flow — Canton
// coordinates the legs that touch the remote desks' nodes.
//
// This does a full clean of the operator's ACS first, so afterwards re-run
// `node scripts/localnet/seed.mjs` to restore the single-node R1 the browser uses.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const PROVIDER = 'http://localhost:3975'
const USER = 'http://localhost:2975'
const SV = 'http://localhost:4975'
const PKG = '#umbra'
const RID = 'XR1'
const parties = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8'))
const op = parties.operator
const admin = mintJwt('ledger-api-user') // per-participant admin user id

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
const moduleOf = (e) => (e === 'Venue' ? 'Roles' : e === 'Asset' ? 'Asset' : 'Auction')
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
    commandId: `xr-c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    actAs: [actAs],
    commands: [{ CreateCommand: { templateId: `${PKG}:${tmpl}`, createArguments: args } }],
  })
const exercise = (base, token, actAs, tmpl, cid, choice, arg) =>
  api(base, token, 'POST', '/v2/commands/submit-and-wait', {
    commandId: `xr-e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    actAs: [actAs],
    commands: [{ ExerciseCommand: { templateId: `${PKG}:${tmpl}`, contractId: cid, choice, choiceArgument: arg } }],
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
  await api(base, admin, 'POST', `/v2/users/${userId}/rights`, {
    userId,
    identityProviderId: '',
    rights: [{ kind: { CanActAs: { value: { party } } } }, { kind: { CanReadAs: { value: { party } } } }],
  })
  return { party, token: mintJwt(userId) }
}
const venueObservedBy = async (base, token, party) =>
  (await acsOf(base, token, party)).find((c) => entityOf(c) === 'Venue' && c.createArgument.desks.includes(party))

console.log('=== §19 cross-node money shot (round XR1) ===\n')

// 1. Provision three desks, each on its own node (xbankC co-locates with operator).
const A = await provisionDesk(USER, 'xbankA')
const B = await provisionDesk(SV, 'xbankB')
const C = await provisionDesk(PROVIDER, 'xbankC')
console.log(`✓ xbankA (Buyer)  → app-user (:2975)     ${A.party.slice(0, 24)}…`)
console.log(`✓ xbankB (Seller) → sv       (:4975)     ${B.party.slice(0, 24)}…`)
console.log(`✓ xbankC (Seller) → app-provider (:3975) ${C.party.slice(0, 24)}…\n`)

// 2. Full clean of the operator's ACS (deterministic; R1 restored later via seed.mjs).
for (const c of await acsOf(PROVIDER, admin, op)) {
  const e = entityOf(c)
  await exercise(PROVIDER, admin, op, `Umbra.${moduleOf(e)}:${e}`, c.contractId, e === 'Order' ? 'Retire' : 'Archive', {}).catch(() => {})
}
console.log('✓ cleaned operator ACS\n')

// 3. Operator (app-provider) creates the Venue observing all three cross-node desks + §4 Assets.
await create(PROVIDER, admin, op, 'Umbra.Roles:Venue', { operator: op, desks: [A.party, B.party, C.party] })
const mint = (owner, symbol, quantity) => create(PROVIDER, admin, op, 'Umbra.Asset:Asset', { operator: op, owner, symbol, quantity })
await mint(A.party, 'USDCx', '5000.0')
await mint(B.party, 'BONDX', '20.0')
await mint(B.party, 'USDCx', '1000.0')
await mint(C.party, 'BONDX', '15.0')
await mint(C.party, 'USDCx', '1000.0')
await create(PROVIDER, admin, op, 'Umbra.Auction:Round', { operator: op, roundId: RID, symbol: 'BONDX', desks: [A.party, B.party, C.party], openedAt: new Date().toISOString(), windowSeconds: 60, status: 'Open' })
console.log('✓ operator seeded Venue + 5 §4 holdings + Round XR1 (app-provider)')

// 4. Each desk submits its sealed order FROM ITS OWN NODE (cross-node, co-signed by operator).
await new Promise((r) => setTimeout(r, 1800)) // allow the Venue to replicate to the remote desk nodes
const vA = await venueObservedBy(USER, A.token, A.party)
const vB = await venueObservedBy(SV, B.token, B.party)
const vC = await venueObservedBy(PROVIDER, C.token, C.party)
if (!vA || !vB || !vC) throw new Error(`Venue replication incomplete: A=${!!vA} B=${!!vB} C=${!!vC}`)
await exercise(USER, A.token, A.party, 'Umbra.Roles:Venue', vA.contractId, 'SubmitOrder', { desk: A.party, roundId: RID, side: 'Buy', quantity: 10, limit: '101.0' })
await exercise(SV, B.token, B.party, 'Umbra.Roles:Venue', vB.contractId, 'SubmitOrder', { desk: B.party, roundId: RID, side: 'Sell', quantity: 8, limit: '99.0' })
await exercise(PROVIDER, C.token, C.party, 'Umbra.Roles:Venue', vC.contractId, 'SubmitOrder', { desk: C.party, roundId: RID, side: 'Sell', quantity: 5, limit: '100.0' })
console.log('✓ orders submitted FROM THEIR OWN NODES — A@app-user · B@sv · C@app-provider\n')

// 5. PRIVACY: each desk node holds only its own order; rival nodes are blind.
await new Promise((r) => setTimeout(r, 1500))
const ordersAt = async (base, token, party) => (await acsOf(base, token, party)).filter((c) => entityOf(c) === 'Order' && c.createArgument.roundId === RID)
const aOnUser = await ordersAt(USER, A.token, A.party)
const bOnSv = await ordersAt(SV, B.token, B.party)
// Query the SV node as its OWN local desk (xbankB) — the admin user has no party
// rights on sv. xbankA's order has no sv-local stakeholder, so it never reaches here.
const aLeakOnSv = (await acsOf(SV, B.token, B.party)).filter((c) => entityOf(c) === 'Order' && c.createArgument.desk === A.party)
console.log('=== cross-node privacy ===')
console.log(`  xbankA's order present on the app-USER node:  ${aOnUser.length === 1 ? 'YES ✓' : 'NO ✗'}`)
console.log(`  xbankB's order present on the SV node:        ${bOnSv.length === 1 ? 'YES ✓' : 'NO ✗'}`)
console.log(`  xbankA's order leaked onto the SV node?       ${aLeakOnSv.length === 0 ? 'NO ✓ (physically partitioned)' : 'LEAK ✗'}`)

// 6. CLEAR + SETTLE: operator drives Round.Clear on app-provider (every operator-signed
//    contract lives there via co-signature). §4 clears at 100.0 — A=10/B=8/C=2.
const acs = await acsOf(PROVIDER, admin, op)
const orderCids = acs.filter((c) => entityOf(c) === 'Order' && c.createArgument.roundId === RID).map((c) => c.contractId)
const biggest = (owner, sym) => acs.filter((c) => entityOf(c) === 'Asset' && c.createArgument.owner === owner && c.createArgument.symbol === sym).sort((x, y) => Number(y.createArgument.quantity) - Number(x.createArgument.quantity))[0].contractId
const round = acs.find((c) => entityOf(c) === 'Round' && c.createArgument.roundId === RID)
await exercise(PROVIDER, admin, op, 'Umbra.Auction:Round', round.contractId, 'CloseRound', {})
const closed = (await acsOf(PROVIDER, admin, op)).find((c) => entityOf(c) === 'Round' && c.createArgument.roundId === RID)
await exercise(PROVIDER, admin, op, 'Umbra.Auction:Round', closed.contractId, 'Clear', {
  clearingPrice: 100,
  allocations: [
    { desk: A.party, side: 'Buy', filledQty: 10 },
    { desk: B.party, side: 'Sell', filledQty: 8 },
    { desk: C.party, side: 'Sell', filledQty: 2 },
  ],
  orderCids,
  buyerUsdcCid: biggest(A.party, 'USDCx'),
  sellerBondCids: [{ _1: B.party, _2: biggest(B.party, 'BONDX') }, { _1: C.party, _2: biggest(C.party, 'BONDX') }],
})
console.log('\n✓ atomic DvP Round.Clear settled cross-node (operator on app-provider)\n')

// 7. VERIFY §4 balances (operator view) + each desk's fill confirmation on its own node.
const settled = await acsOf(PROVIDER, admin, op)
const bal = (owner, sym) => settled.filter((c) => entityOf(c) === 'Asset' && c.createArgument.owner === owner && c.createArgument.symbol === sym).reduce((a, c) => a + Number(c.createArgument.quantity), 0)
const want = [[A.party, 'BONDX', 10], [A.party, 'USDCx', 4000], [B.party, 'BONDX', 12], [B.party, 'USDCx', 1800], [C.party, 'BONDX', 13], [C.party, 'USDCx', 1200]]
console.log('=== §4 post-settlement balances (cross-node) ===')
let ok = true
for (const [p, s, w] of want) {
  const g = bal(p, s)
  const good = Math.abs(g - w) < 1e-9
  ok &&= good
  console.log(`  ${p.split('::')[0].padEnd(7)} ${s}: ${String(g).padStart(5)} (expect ${w}) ${good ? '✓' : '✗'}`)
}
const confA = (await acsOf(USER, A.token, A.party)).filter((c) => entityOf(c) === 'TradeConfirmation')
const confB = (await acsOf(SV, B.token, B.party)).filter((c) => entityOf(c) === 'TradeConfirmation')
console.log(`\n  xbankA fill confirmation on the app-USER node: ${confA.length === 1 ? 'YES ✓' : 'NO ✗'}`)
console.log(`  xbankB fill confirmation on the SV node:       ${confB.length === 1 ? 'YES ✓' : 'NO ✗'}`)
console.log(
  `\n${ok && aOnUser.length === 1 && bOnSv.length === 1 && aLeakOnSv.length === 0 && confA.length === 1 && confB.length === 1
    ? '✓✓ CROSS-NODE MONEY SHOT COMPLETE — desks on separate nodes, orders partitioned, atomic DvP settled to exact §4 balances'
    : '✗ cross-node money shot incomplete'}`,
)
