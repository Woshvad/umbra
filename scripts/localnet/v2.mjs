// scripts/localnet/v2.mjs — a minimal JSON Ledger API v2 client for the LocalNet
// (cn-quickstart / Canton 3.4). Shared by deploy/seed/smoke scripts. The solver
// has its own TS port (solver/src/ledger.ts) with the same wire shapes.
//
// Templates are addressed by the package-NAME form `#umbra:Module:Entity`
// (package-id form is deprecated in 3.4). Commands go to
// POST /v2/commands/submit-and-wait; the ACS is read from
// POST /v2/state/active-contracts at the current ledger-end offset.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

export const PARTICIPANT = process.env.LOCALNET_JSON_API ?? 'http://localhost:3975'
export const PKG = '#umbra-sealed-auction' // package-name reference form
export const parties = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8'))
export const adminToken = mintJwt(process.env.LOCALNET_ADMIN_USER ?? 'ledger-api-user')

const H = (token = adminToken) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

let cmdSeq = 0
const nextCommandId = (tag) => `umbra-${tag}-${Date.now()}-${cmdSeq++}`

export const ledgerEnd = async (token = adminToken) => {
  const r = await fetch(`${PARTICIPANT}/v2/state/ledger-end`, { headers: H(token) })
  if (!r.ok) throw new Error(`ledger-end HTTP ${r.status}`)
  return (await r.json()).offset
}

// Submit a command list as `actAs` (one party or array). Throws on non-200 with the
// Canton error body so encoding/auth mistakes surface immediately.
export const submit = async ({ actAs, readAs = [], commands, token = adminToken, tag = 'cmd' }) => {
  const actAsArr = Array.isArray(actAs) ? actAs : [actAs]
  const r = await fetch(`${PARTICIPANT}/v2/commands/submit-and-wait`, {
    method: 'POST',
    headers: H(token),
    body: JSON.stringify({ commandId: nextCommandId(tag), actAs: actAsArr, readAs, commands }),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`submit(${tag}) HTTP ${r.status}: ${body.slice(0, 600)}`)
  return body ? JSON.parse(body) : {}
}

export const create = (template, createArguments, actAs, token = adminToken) =>
  submit({
    actAs,
    token,
    tag: `create-${template.split(':').pop()}`,
    commands: [{ CreateCommand: { templateId: `${PKG}:${template}`, createArguments } }],
  })

export const exercise = (template, contractId, choice, choiceArgument, actAs, token = adminToken) =>
  submit({
    actAs,
    token,
    tag: `ex-${choice}`,
    commands: [{ ExerciseCommand: { templateId: `${PKG}:${template}`, contractId, choice, choiceArgument } }],
  })

// Read a party's active Umbra contracts. Returns flattened createdEvents
// ({ contractId, templateId, createArgument, signatories, observers, ... }).
export const queryAcs = async (party, token = adminToken) => {
  const activeAtOffset = await ledgerEnd(token)
  const r = await fetch(`${PARTICIPANT}/v2/state/active-contracts`, {
    method: 'POST',
    headers: H(token),
    body: JSON.stringify({ filter: { filtersByParty: { [party]: {} } }, verbose: true, activeAtOffset }),
  })
  if (!r.ok) throw new Error(`active-contracts HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const arr = await r.json()
  return (Array.isArray(arr) ? arr : [])
    .map((e) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c) => c && c.packageName === 'umbra-sealed-auction')
}

// Short entity name from a templateId ("…:Umbra.Auction:Round" → "Round").
export const entityOf = (templateId) => templateId.split(':').pop()
