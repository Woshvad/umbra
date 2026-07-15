// scripts/localnet/verify-live-flow.mjs — bulletproof the two INTERACTIVE paths the
// browser drives, end to end on the live (cross-node) stack:
//   1. Live SEAL ORDER — a desk submits an Order via the exact ledger.exercise path
//      the UI uses (Venue.SubmitOrder with STRING Int/Decimal args), on its OWN node.
//   2. Close → Settle — drive the solver's /close + /settle on R1 and assert the
//      on-ledger §4 balances, then restore the cross-node R1 (via xnode-up.mjs).
// Run AFTER xnode-up.mjs. Reads the live web/src/tokens.json (per-desk bases).
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const tokens = JSON.parse(readFileSync(resolve(repoRoot, 'web', 'src', 'tokens.json'), 'utf8'))
const parties = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8'))
const op = parties.operator
const admin = mintJwt('ledger-api-user')
const PKG = '#umbra-sealed-auction'
const SOLVER = process.env.SOLVER_URL ?? 'http://localhost:4100'
const baseToUrl = { '/cn/app-user': 'http://localhost:2975', '/cn/sv': 'http://localhost:4975', '': 'http://localhost:3975' }
const urlFor = (k) => baseToUrl[tokens[k].base ?? ''] ?? 'http://localhost:3975'

const api = async (base, token, method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} @${base} -> HTTP ${res.status}: ${text.slice(0, 240)}`)
  return text ? JSON.parse(text) : {}
}
const entityOf = (c) => c.templateId.split(':').pop()
const acsOf = async (base, token, party) => {
  const { offset } = await api(base, token, 'GET', '/v2/state/ledger-end')
  const arr = await api(base, token, 'POST', '/v2/state/active-contracts', { filter: { filtersByParty: { [party]: {} } }, verbose: true, activeAtOffset: offset })
  return (Array.isArray(arr) ? arr : []).map((e) => e?.contractEntry?.JsActiveContract?.createdEvent).filter((c) => c && c.packageName === 'umbra-sealed-auction')
}
const sj = (url, token, body) => fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())

let ok = true

// ── 1. Live SEAL ORDER — exactly what DeskColumn.onSubmit does (STRING args). ─────
console.log('=== 1. live SEAL ORDER (string-arg exercise on the desk\'s own node) ===')
{
  const base = urlFor('bankA')
  const t = tokens.bankA.token
  const party = tokens.bankA.party
  const venue = (await acsOf(base, t, party)).find((c) => entityOf(c) === 'Venue')
  if (!venue) throw new Error('no Venue visible to bankA on its node')
  // The browser sends Int/Decimal as STRINGS — this is the encoding that must work.
  await api(base, t, 'POST', '/v2/commands/submit-and-wait', {
    commandId: `live-${Date.now()}`,
    actAs: [party],
    commands: [{ ExerciseCommand: { templateId: `${PKG}:Umbra.Roles:Venue`, contractId: venue.contractId, choice: 'SubmitOrder', choiceArgument: { desk: party, roundId: 'LIVETEST', side: 'Buy', quantity: '10', limit: '101.0' } } }],
  })
  await new Promise((r) => setTimeout(r, 800))
  const live = (await acsOf(base, t, party)).find((c) => entityOf(c) === 'Order' && c.createArgument.roundId === 'LIVETEST')
  const good = !!live && live.createArgument.quantity === '10' && Number(live.createArgument.limit) === 101
  ok &&= good
  console.log(`  submitted via Venue.SubmitOrder (qty '10', limit '101.0') → ${good ? 'Order created on bankA\'s node ✓' : 'FAILED ✗'}`)
  // cleanup: operator retires the scratch order
  const onOp = (await acsOf('http://localhost:3975', admin, op)).find((c) => entityOf(c) === 'Order' && c.createArgument.roundId === 'LIVETEST')
  if (onOp) await api('http://localhost:3975', admin, 'POST', '/v2/commands/submit-and-wait', { commandId: `live-cleanup-${Date.now()}`, actAs: [op], commands: [{ ExerciseCommand: { templateId: `${PKG}:Umbra.Auction:Order`, contractId: onOp.contractId, choice: 'Retire', choiceArgument: {} } }] })
  console.log('  scratch order retired (cleanup) ✓')
}

// ── 2. Close → Settle via the solver, then assert §4 balances. ────────────────────
console.log('\n=== 2. close → settle via the solver (:4100), then §4 balances ===')
{
  const close = await sj(`${SOLVER}/round/R1/close`, admin /*ignored by solver*/, {})
  console.log(`  POST /round/R1/close  → status ${close.status}`)
  const settle = await fetch(`${SOLVER}/round/R1/settle`, { method: 'POST' }).then((r) => r.json())
  console.log(`  POST /round/R1/settle → status ${settle.status} · price ${settle.clearingPrice} · matched ${settle.matchedVolume}`)
  await new Promise((r) => setTimeout(r, 800))
  const settled = await acsOf('http://localhost:3975', admin, op)
  const bal = (owner, sym) => settled.filter((c) => entityOf(c) === 'Asset' && c.createArgument.owner === owner && c.createArgument.symbol === sym).reduce((a, c) => a + Number(c.createArgument.quantity), 0)
  const want = [['bankA', 'BONDX', 10], ['bankA', 'USDCx', 4000], ['bankB', 'BONDX', 12], ['bankB', 'USDCx', 1800], ['bankC', 'BONDX', 13], ['bankC', 'USDCx', 1200]]
  for (const [k, s, w] of want) {
    const g = bal(parties[k], s)
    const good = Math.abs(g - w) < 1e-9
    ok &&= good
    console.log(`    ${k} ${s}: ${g} (expect ${w}) ${good ? '✓' : '✗'}`)
  }
}

// ── 3. Restore the cross-node R1 (Open) for the live demo. ────────────────────────
console.log('\n=== 3. restore cross-node R1 (Open) ===')
execSync('node scripts/localnet/xnode-up.mjs', { cwd: repoRoot, stdio: 'ignore' })
console.log('  re-ran xnode-up.mjs → R1 Open again')

console.log(`\n${ok ? '✓✓ LIVE FLOW BULLETPROOF — live submit + close→settle both work end-to-end on the cross-node stack' : '✗ live-flow check found a failure'}`)
process.exit(ok ? 0 : 1)
