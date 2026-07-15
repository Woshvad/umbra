// scripts/localnet/probe-xnode.mjs — feasibility proof for §19 true cross-node
// sub-transaction privacy. Proves a desk party hosted on the app-USER participant
// (:2975) can submit a sealed Order CO-SIGNED by the operator hosted on the
// app-PROVIDER participant (:3975) — a single Canton transaction spanning two
// participant nodes — and that the order then lives on BOTH stakeholders' nodes
// while a third desk on app-provider cannot see it.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const PROVIDER = 'http://localhost:3975' // operator's node
const USER = 'http://localhost:2975' // a desk's node
const PKG = '#umbra-sealed-auction'
const parties = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8'))
const op = parties.operator

const api = async (base, token, method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} @${base} -> HTTP ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}
const admin = mintJwt('ledger-api-user') // the per-participant admin user id
const acsOf = async (base, token, party) => {
  const { offset } = await api(base, token, 'GET', '/v2/state/ledger-end')
  const arr = await api(base, token, 'POST', '/v2/state/active-contracts', {
    filter: { filtersByParty: { [party]: {} } },
    verbose: true,
    activeAtOffset: offset,
  })
  return (Array.isArray(arr) ? arr : [])
    .map((e) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c) => c && c.packageName === 'umbra-sealed-auction')
}
const entityOf = (t) => t.templateId.split(':').pop()

// 1. Allocate a desk party LOCAL to app-user.
let xdesk
const existing = (await api(USER, admin, 'GET', '/v2/parties')).partyDetails.find((p) => p.party.startsWith('xdesk::') && p.isLocal)
if (existing) {
  xdesk = existing.party
  console.log(`• xdesk exists (local to app-user): ${xdesk.slice(0, 28)}…`)
} else {
  const r = await api(USER, admin, 'POST', '/v2/parties', { partyIdHint: 'xdesk', identityProviderId: '' })
  xdesk = r.partyDetails.party
  console.log(`✓ allocated xdesk LOCAL to app-user: ${xdesk.slice(0, 28)}…`)
}

// 2. User + rights for xdesk on app-user.
const users = new Set((await api(USER, admin, 'GET', '/v2/users')).users.map((u) => u.id))
if (!users.has('umbra-xdesk')) {
  await api(USER, admin, 'POST', '/v2/users', {
    user: { id: 'umbra-xdesk', isDeactivated: false, primaryParty: xdesk, identityProviderId: '', metadata: { resourceVersion: '', annotations: {} } },
    rights: [],
  })
}
await api(USER, admin, 'POST', '/v2/users/umbra-xdesk/rights', {
  userId: 'umbra-xdesk',
  identityProviderId: '',
  rights: [{ kind: { CanActAs: { value: { party: xdesk } } } }, { kind: { CanReadAs: { value: { party: xdesk } } } }],
})
const xtoken = mintJwt('umbra-xdesk')
console.log('✓ umbra-xdesk user + actAs/readAs rights on app-user')

// 3. Operator (app-provider) creates a Venue observing xdesk (replicates cross-node).
await api(PROVIDER, admin, 'POST', '/v2/commands/submit-and-wait', {
  commandId: `xnode-venue-${Date.now()}`,
  actAs: [op],
  commands: [{ CreateCommand: { templateId: `${PKG}:Umbra.Roles:Venue`, createArguments: { operator: op, desks: [xdesk] } } }],
})
console.log('✓ operator created a Venue observing xdesk (app-provider)')

// 4. xdesk (app-user) sees the replicated Venue and exercises SubmitOrder — CROSS-NODE.
await new Promise((r) => setTimeout(r, 1500)) // allow topology/contract replication
const venuesOnUser = (await acsOf(USER, xtoken, xdesk)).filter((c) => entityOf(c) === 'Venue')
console.log(`• xdesk sees ${venuesOnUser.length} Venue(s) replicated onto app-user`)
const venue = venuesOnUser.find((c) => c.createArgument.desks.includes(xdesk))
if (!venue) throw new Error('cross-node FAIL: Venue did not replicate to app-user (xdesk cannot observe it)')

await api(USER, xtoken, 'POST', '/v2/commands/submit-and-wait', {
  commandId: `xnode-order-${Date.now()}`,
  actAs: [xdesk],
  commands: [
    {
      ExerciseCommand: {
        templateId: `${PKG}:Umbra.Roles:Venue`,
        contractId: venue.contractId,
        choice: 'SubmitOrder',
        choiceArgument: { desk: xdesk, roundId: 'XNODE', side: 'Buy', quantity: 7, limit: '100.0' },
      },
    },
  ],
})
console.log('✓ xdesk (app-user) submitted an Order co-signed by operator (app-provider) — CROSS-NODE TX')

// 5. Verify the order lives on BOTH nodes, and a third app-provider desk cannot see it.
await new Promise((r) => setTimeout(r, 1200))
const onUser = (await acsOf(USER, xtoken, xdesk)).filter((c) => entityOf(c) === 'Order' && c.createArgument.roundId === 'XNODE')
const onProvider = (await acsOf(PROVIDER, admin, op)).filter((c) => entityOf(c) === 'Order' && c.createArgument.roundId === 'XNODE')
const bankAtoken = mintJwt('umbra-bankA')
const onBankA = (await acsOf(PROVIDER, bankAtoken, parties.bankA)).filter((c) => entityOf(c) === 'Order' && c.createArgument.roundId === 'XNODE')

console.log('')
console.log(`  xdesk on app-USER node      sees the XNODE order: ${onUser.length === 1 ? 'YES ✓' : 'NO ✗'}`)
console.log(`  operator on app-PROVIDER    sees the XNODE order: ${onProvider.length === 1 ? 'YES ✓ (co-signatory)' : 'NO ✗'}`)
console.log(`  bankA (other desk)          sees the XNODE order: ${onBankA.length === 0 ? 'NO ✓ (blind)' : 'LEAK ✗'}`)
console.log(
  `\n${onUser.length === 1 && onProvider.length === 1 && onBankA.length === 0
    ? '✓ CROSS-NODE PROVEN — a two-participant Canton transaction; the order is partitioned to its stakeholders’ nodes only'
    : '✗ cross-node claim not satisfied'}`,
)
