// scripts/verify-privacy.mjs  —  run: node scripts/verify-privacy.mjs
//
// PRIV-05 / T-03-11 LIVE WIRE CHECK (RESEARCH Pitfall 2 — the #1 drift risk).
//
// This is a LIVE check, NOT part of `npm run build`. It requires `daml start`
// (Canton sandbox + JSON API :7575 with --allow-insecure-tokens) plus the seeded
// Open round to be running, and `web/src/tokens.json` minted for the CURRENT boot
// (`npm run tokens`). The orchestrator runs this against a live sandbox (Task 3
// of the plan) — the executor's authoritative gate is `cd web && npm run build`.
//
// What it proves:
//   1. The DAML_LEDGER_ID constant baked into the desk JWTs is correct — a 200 with
//      a `result` array (even empty) confirms it; a 401/UNAUTHENTICATED means the
//      ledgerId is wrong (remedy printed below).
//   2. Per-party isolation at the WIRE: the BankA token's /v1/query for Order returns
//      ONLY BankA's Order — zero of BankB/BankC (the structural-privacy money shot,
//      proven at the API boundary, not by a render-time filter).
//
// The operator token is NOT used here (D6 — no operator token in this path); a desk
// token alone is sufficient because Order is a stakeholder (operator+desk) contract.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// Keep this in sync with web/src/config.ts (DAML_LEDGER_ID) and scripts/mint-tokens.mjs.
const DAML_LEDGER_ID = process.env.DAML_LEDGER_ID ?? 'sandbox'
// Direct base URL for the CLI check (the browser uses the Vite proxy '/'; Node has no proxy).
const JSON_API_URL = process.env.JSON_API_URL ?? 'http://localhost:7575'
// The Daml 2.10 JSON API resolves /v1/query template IDs by PACKAGE ID, not package
// name (`umbra:...` returns "unknownTemplateIds"). Derive the package-id form from the
// generated @daml.js bindings (which the frontend also uses) so this stays correct
// across rebuilds — the bindings' templateId is `<pkgId>:Umbra.Auction:Order`.
function orderTemplateId() {
  const candidates = [
    resolve(REPO_ROOT, 'web', 'daml.js', 'umbra-0.1.0', 'lib', 'Umbra', 'Auction', 'module.js'),
  ]
  for (const p of candidates) {
    try {
      const src = readFileSync(p, 'utf8')
      const m = src.match(/templateId:\s*'([0-9a-f]{64}:Umbra\.Auction:Order)'/)
      if (m) return m[1]
    } catch { /* try next */ }
  }
  console.error('FATAL: could not derive Order templateId from web/daml.js bindings.')
  console.error('Remedy: run `daml codegen js daml/.daml/dist/umbra-0.1.0.dar -o web/daml.js` (or `daml start`).')
  process.exit(1)
}
const ORDER_TEMPLATE = orderTemplateId()

function loadTokens() {
  const path = resolve(REPO_ROOT, 'web', 'src', 'tokens.json')
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    console.error(`FATAL: could not read ${path}`)
    console.error('Remedy: run `daml start`, export parties.json, then `npm run tokens`.')
    process.exit(1)
  }
}

async function queryOrders(token) {
  const res = await fetch(`${JSON_API_URL}/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ templateIds: [ORDER_TEMPLATE] }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

async function main() {
  const tokens = loadTokens()
  const desks = ['bankA', 'bankB', 'bankC'].filter((k) => tokens[k])
  if (!tokens.bankA) {
    console.error('FATAL: web/src/tokens.json has no bankA entry. Re-run `npm run tokens`.')
    process.exit(1)
  }

  console.log(`Verifying ledgerId="${DAML_LEDGER_ID}" against ${JSON_API_URL}/v1/query ...\n`)

  const a = await queryOrders(tokens.bankA.token)
  if (a.status === 401 || (a.body && a.body.status === 401)) {
    console.error('FAIL (401 / UNAUTHENTICATED): the ledgerId constant is wrong.')
    console.error('Remedy: set DAML_LEDGER_ID to the participant id printed in the')
    console.error('        `daml start` logs, then re-run `npm run tokens` and retry.')
    process.exit(1)
  }
  if (a.status !== 200 || !a.body || !Array.isArray(a.body.result)) {
    console.error(`FAIL: unexpected response (status ${a.status}).`)
    console.error(JSON.stringify(a.body, null, 2))
    console.error('Remedy: ensure `daml start` is running and the round is seeded.')
    process.exit(1)
  }

  // ledgerId verified — now assert per-party isolation.
  const bankAParty = tokens.bankA.party
  const aOrders = a.body.result
  console.log(`PASS: ledgerId OK — BankA /v1/query returned ${aOrders.length} Order(s).`)

  const leaked = aOrders.filter((c) => c?.payload?.desk && c.payload.desk !== bankAParty)
  if (leaked.length > 0) {
    console.error(`FAIL (PRIV-05): BankA's wire response contains ${leaked.length} rival order(s):`)
    console.error(JSON.stringify(leaked.map((c) => c.payload.desk), null, 2))
    process.exit(1)
  }
  console.log('PASS (PRIV-05): every Order in BankA\'s response belongs to BankA — no B/C leak.')

  // Best-effort symmetric check (informational): each desk sees only its own.
  for (const k of desks) {
    const r = await queryOrders(tokens[k].token)
    if (r.status === 200 && r.body && Array.isArray(r.body.result)) {
      const mine = r.body.result.filter((c) => c?.payload?.desk === tokens[k].party).length
      const others = r.body.result.length - mine
      console.log(`  ${k}: ${r.body.result.length} order(s) visible, ${others} rival(s).`)
    }
  }

  console.log('\nWire isolation verified. The money shot is REAL at the API boundary.')
}

main().catch((e) => {
  console.error('FATAL: verify-privacy.mjs failed —', e?.message ?? e)
  console.error('Remedy: confirm `daml start` is up on :7575 and tokens.json is minted.')
  process.exit(1)
})
