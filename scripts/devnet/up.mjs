// scripts/devnet/up.mjs — bring up the §4 Umbra fixture on the FiveNorth "Seaport"
// Canton DevNet SANDBOX validator (Route B). Idempotent + re-runnable.
//
// Unlike the LocalNet path (unsafe HS256 + admin `ledger-api-user` on :3975), DevNet uses:
//   • JSON Ledger API v2 at https://ledger-api.validator.devnet.sandbox.fivenorth.io
//   • OIDC client-credentials (Authentik) — the shared m2m client `validator-devnet-m2m`
//     (user id "6"), which has participant-admin rights (allocate parties, grant rights,
//     upload DARs). SECRET comes from env SEAPORT_SECRET — never hardcoded/committed.
//   • the umbra package referenced by EXPLICIT package id (not `#umbra`) so a rival
//     builder's same-named package on this shared validator can never be picked.
//
// Steps: acquire token → allocate operator + bankA/B/C + compliance (reused from
// scripts/.devnet.json if present) → grant user 6 actAs/readAs each → upload the DAR
// (skip if already vetted) → clean our prior umbra contracts → seed Venue + 3
// DeskEligibility + 5 Holdings + OPEN Round R1 + 3 sealed orders + RoundStats →
// write scripts/.devnet.json + solver/.env.devnet for the solver's close/settle.
//
// Run:  SEAPORT_SECRET=... node scripts/devnet/up.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const SECRET = process.env.SEAPORT_SECRET
if (!SECRET) throw new Error('SEAPORT_SECRET is required (the validator-devnet-m2m client secret)')
const AUTH = 'https://auth.sandbox.fivenorth.io/application/o/token/'
const LEDGER = process.env.DEVNET_LEDGER ?? 'https://ledger-api.validator.devnet.sandbox.fivenorth.io'
const CLIENT_ID = 'validator-devnet-m2m'
const AUDIENCE = 'validator-devnet-m2m'
const USER_ID = '6'
// EXPLICIT package id of umbra-sealed-auction 0.1.0. The package NAME is a shared-network
// namespace: an unrelated team already published `umbra` (v0.0.3/v0.0.4) on this validator,
// and their family is mutually upgrade-inconsistent, so ANY new `umbra` upload is rejected.
// We publish under our own name/lineage and pin the id (never `#name`) so nothing ambiguous.
const PKG = process.env.UMBRA_PACKAGE_ID ?? '6800e677629153916aac2f994e4198f95761e03cfdf29cabcd23cafcb1c83f06'
const DAR_PATH = process.env.UMBRA_DAR ?? resolve(repoRoot, 'daml', '.daml', 'dist', 'umbra-sealed-auction-0.1.0.dar')
const STATE_PATH = resolve(repoRoot, 'scripts', '.devnet.json')

// ── token (client-credentials) ────────────────────────────────────────────────────
const getToken = async () => {
  const r = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: SECRET, audience: AUDIENCE, scope: 'daml_ledger_api' }),
  })
  if (!r.ok) throw new Error(`token endpoint HTTP ${r.status}`)
  const j = await r.json()
  if (!j.access_token) throw new Error('no access_token')
  return j.access_token
}
let TOKEN = await getToken()

const api = async (method, path, body, octet = false) => {
  const headers = { Authorization: `Bearer ${TOKEN}` }
  if (body !== undefined) headers['Content-Type'] = octet ? 'application/octet-stream' : 'application/json'
  const r = await fetch(`${LEDGER}${path}`, { method, headers, body: body === undefined ? undefined : octet ? body : JSON.stringify(body) })
  const t = await r.text()
  let parsed; try { parsed = t ? JSON.parse(t) : {} } catch { parsed = t }
  if (!r.ok) throw new Error(`${method} ${path} -> HTTP ${r.status}: ${typeof parsed === 'string' ? parsed.slice(0, 300) : JSON.stringify(parsed).slice(0, 300)}`)
  return parsed
}
const uniq = () => `${Math.floor(Date.now() / 1000)}${Math.floor(Math.random() * 1e4)}`

console.log('=== Umbra → FiveNorth DevNet sandbox bring-up ===\n')

// ── 1. parties (reuse from state if present) ────────────────────────────────────────
let state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : null
const HINTS = ['operator', 'bankA', 'bankB', 'bankC', 'compliance']
if (!state?.parties || HINTS.some((h) => !state.parties[h])) {
  const parties = {}
  for (const h of HINTS) {
    const hint = `umbra-${h}-${uniq()}`
    const res = await api('POST', '/v2/parties', { partyIdHint: hint, identityProviderId: '' })
    parties[h] = res.partyDetails?.party ?? res.party
    console.log(`✓ allocated ${h} → ${parties[h].slice(0, 42)}…`)
  }
  state = { ledger: LEDGER, parties }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n')
} else {
  console.log('✓ reusing parties from scripts/.devnet.json')
}
const P = state.parties
const op = P.operator
const desks = [P.bankA, P.bankB, P.bankC]

// ── 2. grant user 6 actAs+readAs all our parties ────────────────────────────────────
await api('POST', `/v2/users/${USER_ID}/rights`, {
  userId: USER_ID, identityProviderId: '',
  rights: HINTS.flatMap((h) => [{ kind: { CanActAs: { value: { party: P[h] } } } }, { kind: { CanReadAs: { value: { party: P[h] } } } }]),
})
console.log('✓ granted m2m user actAs+readAs operator + 3 desks + compliance')

// ── 3. upload DAR (skip if already vetted) ──────────────────────────────────────────
const pkgs = await api('GET', '/v2/packages')
const have = (pkgs.packageIds ?? pkgs ?? []).includes?.(PKG)
if (have) {
  console.log('✓ umbra DAR already vetted on this validator')
} else {
  const bytes = readFileSync(DAR_PATH)
  await api('POST', '/v2/packages', bytes, true)
  console.log(`✓ uploaded ${DAR_PATH.split(/[\/]/).pop()} (${(bytes.length / 1024).toFixed(0)} KiB) → vetted`)
}

// ── helpers: create / exercise against the EXPLICIT package id ───────────────────────
const create = (actAs, tmpl, args) =>
  api('POST', '/v2/commands/submit-and-wait', {
    commandId: `dn-c-${uniq()}`, actAs: [actAs],
    commands: [{ CreateCommand: { templateId: `${PKG}:${tmpl}`, createArguments: args } }],
  })
const exercise = (actAs, tmpl, cid, choice, arg) =>
  api('POST', '/v2/commands/submit-and-wait', {
    commandId: `dn-e-${uniq()}`, actAs: [actAs],
    commands: [{ ExerciseCommand: { templateId: `${PKG}:${tmpl}`, contractId: cid, choice, choiceArgument: arg } }],
  })
const entityOf = (c) => c.templateId.split(':').pop()
const acs = async (party) => {
  const { offset } = await api('GET', '/v2/state/ledger-end')
  const arr = await api('POST', '/v2/state/active-contracts', { filter: { filtersByParty: { [party]: {} } }, verbose: true, activeAtOffset: offset })
  return (Array.isArray(arr) ? arr : []).map((e) => e?.contractEntry?.JsActiveContract?.createdEvent).filter((c) => c && c.templateId?.startsWith(PKG))
}
const moduleOf = (e) => (e === 'Venue' ? 'Roles' : e === 'Holding' ? 'Holding' : e === 'DeskEligibility' ? 'Compliance' : 'Auction')

// ── 4. clean our prior umbra contracts (idempotent reseed; skip un-archivable) ──────
let cleaned = 0, skipped = 0
for (const c of await acs(op)) {
  const e = entityOf(c)
  try { await exercise(op, `Umbra.${moduleOf(e)}:${e}`, c.contractId, e === 'Order' ? 'Retire' : 'Archive', {}); cleaned++ }
  catch { skipped++ }
}
console.log(`✓ cleaned ${cleaned} prior umbra contract(s)${skipped ? ` (skipped ${skipped})` : ''}`)

// ── 5. seed §4: Venue + DeskEligibility + Holdings + Round R1 + orders ───────────────
await create(op, 'Umbra.Roles:Venue', { operator: op, desks })
for (const d of desks)
  await create(op, 'Umbra.Compliance:DeskEligibility', { operator: op, compliance: op, desk: d, accredited: true, jurisdiction: 'US', sanctionsClear: true })
console.log('✓ Venue + 3 DeskEligibility')
const bond = { issuer: op, id: 'BONDX' }
const cash = { issuer: op, id: 'USDCx' }
const mint = (owner, instrument, amount) => create(op, 'Umbra.Holding:Holding', { operator: op, owner, instrument, amount, lock: null })
await mint(P.bankA, cash, '5000.0'); await mint(P.bankB, bond, '20.0'); await mint(P.bankB, cash, '1000.0'); await mint(P.bankC, bond, '15.0'); await mint(P.bankC, cash, '1000.0')
console.log('✓ 5 §4 Holdings')
// Int/Decimal MUST go on the wire as STRINGS here: this validator rejects a JSON number for
// an Int field ("Expected ujson.Str"), unlike the LocalNet which also accepts numbers. Strings
// are the encoding the browser uses too, so they work on both.
await create(op, 'Umbra.Auction:Round', { operator: op, roundId: 'R1', symbol: 'BONDX', desks, openedAt: new Date().toISOString(), windowSeconds: '60', status: 'Open' })

const opAcs = await acs(op)
const venueCid = opAcs.find((c) => entityOf(c) === 'Venue').contractId
const eligOf = (d) => opAcs.find((c) => entityOf(c) === 'DeskEligibility' && c.createArgument.desk === d).contractId
const submit = (desk, side, quantity, limit) =>
  exercise(desk, 'Umbra.Roles:Venue', venueCid, 'SubmitOrder', { desk, roundId: 'R1', side, quantity: String(quantity), limit, orderType: 'Limit', minQty: null, firmIf: null, eligCid: eligOf(desk) })
await submit(P.bankA, 'Buy', 10, '101.0'); await submit(P.bankB, 'Sell', 8, '99.0'); await submit(P.bankC, 'Sell', 5, '100.0')
await create(op, 'Umbra.Auction:RoundStats', { operator: op, roundId: 'R1', desks, sealedOrderCount: '3' })
console.log('✓ OPEN Round R1 + 3 sealed orders (A Buy 10@101 · B Sell 8@99 · C Sell 5@100) + RoundStats')

// ── 6. write solver DevNet env + parties map ────────────────────────────────────────
const envDevnet = [
  `# Auto-written by scripts/devnet/up.mjs — DevNet (FiveNorth sandbox). Gitignored.`,
  `JSON_API_URL=${LEDGER}`,
  `SOLVER_PORT=4100`,
  `OIDC_TOKEN_URL=${AUTH}`,
  `OIDC_CLIENT_ID=${CLIENT_ID}`,
  `OIDC_CLIENT_SECRET=${SECRET}`,
  `OIDC_AUDIENCE=${AUDIENCE}`,
  `OIDC_JWKS_URL=https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m/jwks/`,
  `OIDC_ISSUER=https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m/`,
  `OIDC_OPERATOR_PARTY=${op}`,
  `COMPLIANCE_PARTY=${P.compliance}`,
  `COMPLIANCE_TOKEN=${TOKEN}`,
  `UMBRA_PACKAGE_ID=${PKG}`,
  `UMBRA_PACKAGE_NAME=${process.env.UMBRA_PACKAGE_NAME ?? 'umbra-sealed-auction'}`,
  ``,
].join('\n')
writeFileSync(resolve(repoRoot, 'solver', '.env.devnet'), envDevnet)
writeFileSync(resolve(repoRoot, 'daml', 'parties.json'), JSON.stringify({ operator: op, bankA: P.bankA, bankB: P.bankB, bankC: P.bankC }, null, 2) + '\n')

// Browser config: each desk reads its OWN party through the Vite '/cn/devnet' proxy
// (the validator emits no CORS headers for :5173).
//
// HONEST LIMITATION: all three desks carry the SAME shared m2m bearer, because the
// hackathon issues ONE client (`validator-devnet-m2m`). Each desk's VIEW is still correct
// (its ACS query filters by its own party), but the token is not SCOPED to that desk — so
// the adversarial "Try to Peek" proof (a rival read must 403) CANNOT hold on DevNet until
// the organizers issue PER-DESK clients. The LocalNet path keeps the real scoped-token
// privacy proof. Do not present DevNet mode as the structural-privacy proof.
writeFileSync(
  resolve(repoRoot, 'web', 'src', 'tokens.json'),
  JSON.stringify(
    {
      bankA: { party: P.bankA, token: TOKEN, base: '/cn/devnet' },
      bankB: { party: P.bankB, token: TOKEN, base: '/cn/devnet' },
      bankC: { party: P.bankC, token: TOKEN, base: '/cn/devnet' },
    },
    null,
    2,
  ) + '\n',
)
console.log('\n✓ wrote solver/.env.devnet + daml/parties.json + web/src/tokens.json (DevNet)')
console.log('  ⚠ desks share ONE m2m token — per-desk views are correct, but the peek proof needs per-desk clients')
console.log('  next: run the solver with .env.devnet, then POST /round/R1/close + /round/R1/settle')
