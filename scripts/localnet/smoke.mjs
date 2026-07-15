// scripts/localnet/smoke.mjs — prove an Umbra template works on real Canton.
// Creates a Venue via POST /v2/commands/submit-and-wait, then reads it back from
// the ACS. Validates the templateId form, createArguments encoding, and that the
// uploaded DAR's templates are live. Acts as `operator` (admin token has actAs).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const PARTICIPANT = process.env.LOCALNET_JSON_API ?? 'http://localhost:3975'

const parties = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8'))
const token = mintJwt(process.env.LOCALNET_ADMIN_USER ?? 'ledger-api-user')
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

const post = async (path, body) => {
  const res = await fetch(`${PARTICIPANT}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : undefined }
}

// 1. Create a Venue as operator (package-name templateId form `#umbra:Module:Entity`).
const create = await post('/v2/commands/submit-and-wait', {
  commandId: `umbra-smoke-venue-${Date.now()}`,
  actAs: [parties.operator],
  commands: [
    {
      CreateCommand: {
        templateId: '#umbra-sealed-auction:Umbra.Roles:Venue',
        createArguments: {
          operator: parties.operator,
          desks: [parties.bankA, parties.bankB, parties.bankC],
        },
      },
    },
  ],
})
console.log(`CREATE Venue → HTTP ${create.status}`)
console.log(JSON.stringify(create.body, null, 2).slice(0, 700))

// 2. Read it back from the ACS (operator sees it as signatory).
const offset = (await (await fetch(`${PARTICIPANT}/v2/state/ledger-end`, { headers: H })).json()).offset
const acs = await post('/v2/state/active-contracts', {
  filter: { filtersByParty: { [parties.operator]: {} } },
  verbose: true,
  activeAtOffset: offset,
})
const umbra = (Array.isArray(acs.body) ? acs.body : [])
  .map((e) => e?.contractEntry?.JsActiveContract?.createdEvent)
  .filter((c) => c && c.packageName === 'umbra-sealed-auction')
console.log(`\nACS Umbra contracts: ${umbra.length}`)
for (const c of umbra) {
  console.log(`  • ${c.templateId.split(':').slice(1).join(':')}  cid=${c.contractId.slice(0, 16)}…`)
  console.log(`    args=${JSON.stringify(c.createArgument)}`)
}
