// scripts/localnet/provision-compliance.mjs — provision the DISTINCT four-eyes
// Compliance authority the live settle path requires (IDEN-03).
//
// The on-ledger four-eyes gate (Umbra.Approval) mandates that the `ClearingApproval`
// be co-signed by a `compliance` party DISTINCT from the `operator` — both
// `ApproveClearing` and `assertClearingApproved` abort when compliance == operator.
// The solver resolves that identity from `scripts/.compliance-token`. Without it,
// `gatherApprovalCid` HARD-FAILS and no round can settle. `deploy.mjs` provisions
// operator + the three desks but NOT this authority, so this script fills the gap:
//   1. allocate a dedicated `compliance` party on the app-provider participant,
//   2. create the `umbra-compliance` user with actAs+readAs that party,
//   3. write scripts/.compliance-token { party, token } for the solver to load.
// Idempotent + re-runnable. Run after deploy.mjs; then (re)start the solver.
//
// Env: LOCALNET_JSON_API (default http://localhost:3975)
//      LOCALNET_ADMIN_USER (default ledger-api-user)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const PARTICIPANT = process.env.LOCALNET_JSON_API ?? 'http://localhost:3975'
const ADMIN_USER = process.env.LOCALNET_ADMIN_USER ?? 'ledger-api-user'
const COMPLIANCE_HINT = 'compliance'
const COMPLIANCE_USER = 'umbra-compliance'

const admin = mintJwt(ADMIN_USER)
const api = async (method, path, body, headers) => {
  const res = await fetch(`${PARTICIPANT}${path}`, {
    method,
    headers: headers ?? { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 240)}`)
  return text ? JSON.parse(text) : {}
}

const operator = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8')).operator

// 1. allocate (or reuse) the dedicated compliance party — MUST be distinct from operator.
const existing = (await api('GET', '/v2/parties')).partyDetails.find(
  (p) => p.party.startsWith(`${COMPLIANCE_HINT}::`) && p.isLocal,
)
const party = existing
  ? existing.party
  : (await api('POST', '/v2/parties', { partyIdHint: COMPLIANCE_HINT, identityProviderId: '' })).partyDetails.party
if (party === operator) throw new Error('compliance party collapsed onto operator — four-eyes needs a distinct party')
console.log(`✓ compliance party ${existing ? 'exists' : 'allocated'} → ${party}`)

// 2. create the umbra-compliance user (actAs+readAs its own party) so its token can approve.
const users = new Set((await api('GET', '/v2/users')).users.map((u) => u.id))
if (!users.has(COMPLIANCE_USER))
  await api('POST', '/v2/users', {
    user: { id: COMPLIANCE_USER, isDeactivated: false, primaryParty: party, identityProviderId: '', metadata: { resourceVersion: '', annotations: {} } },
    rights: [],
  })
await api('POST', `/v2/users/${COMPLIANCE_USER}/rights`, {
  userId: COMPLIANCE_USER,
  identityProviderId: '',
  rights: [
    { kind: { CanActAs: { value: { party } } } },
    { kind: { CanReadAs: { value: { party } } } },
  ],
})
console.log(`✓ user ${COMPLIANCE_USER} (actAs+readAs compliance)`)

// 3. write the compliance credential the solver loads for gatherApprovalCid.
writeFileSync(
  resolve(repoRoot, 'scripts', '.compliance-token'),
  JSON.stringify({ party, token: mintJwt(COMPLIANCE_USER) }, null, 2) + '\n',
)
console.log('✓ wrote scripts/.compliance-token (distinct four-eyes authority) — (re)start the solver to load it')
