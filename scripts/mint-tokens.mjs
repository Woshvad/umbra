// scripts/mint-tokens.mjs — per-party HS256 dev-JWT minter (PRIV-05, the wire-level credential)
// Run: node scripts/mint-tokens.mjs   (or: cd web && npm run tokens)
//
// ZERO-DEPENDENCY: signs with Node's built-in `node:crypto` (createHmac) — NO
// `jsonwebtoken` install. This satisfies the Plan 03-02 Task-1 supply-chain gate
// by selecting the "zero-dep crypto path" (no third-party crypto dependency).
//
// ── SECURITY BOUNDARY (D6 / threat T-03-06) ────────────────────────────────────
// The browser bundle must hold ONLY the three DESK tokens (bankA/bankB/bankC) +
// the JSON API URL — never the operator's broad-authority token, never the
// Anthropic key. Therefore:
//   • DESK tokens  -> web/src/tokens.json   (imported by the Privacy view; gitignored)
//   • OPERATOR token -> scripts/.operator-token  (CLI / live-verify curl / Phase-4
//     service ONLY; gitignored; NEVER imported under web/src).
// The center "venue count" is read with a DESK token (RoundStats observer = desks),
// so no operator token is ever needed in the browser.
//
// These are dev-sandbox bearer credentials under `daml start --allow-insecure-tokens`
// (D5): HS256 over an arbitrary/empty secret, the signature is NOT cryptographically
// validated by the JSON API in dev. NEVER use this path for any deploy.

import { createHmac } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// The single drift constant (RESEARCH Pitfall 2). Keep in sync with web/src/config.ts.
const LEDGER_ID = process.env.DAML_LEDGER_ID ?? 'sandbox'
const APP_ID = 'umbra'
const DEV_SECRET = '' // arbitrary under --allow-insecure-tokens (dev-only, D5)

// ── Locate parties.json (D4: read fresh, never hard-code per-boot IDs) ──────────
// Prefer daml/parties.json (the `daml start` export carries the real
// hint::<fingerprint> IDs the sandbox actually knows). Fall back to repo-root
// parties.json. Both are gitignored, per-boot ephemeral.
const candidates = [
  resolve(repoRoot, 'daml', 'parties.json'),
  resolve(repoRoot, 'parties.json'),
]
const partiesPath = candidates.find(existsSync)
if (!partiesPath) {
  console.error(
    'parties.json not found. Run `daml start` to export parties.json (daml/ or repo root), then re-run `node scripts/mint-tokens.mjs`.',
  )
  process.exit(1)
}

const parties = JSON.parse(readFileSync(partiesPath, 'utf8'))
// parties = { operator, bankA, bankB, bankC } each a party id ("hint::fingerprint")
for (const k of ['operator', 'bankA', 'bankB', 'bankC']) {
  if (!parties[k]) {
    console.error(`parties.json (${partiesPath}) is missing "${k}". Re-export via daml start.`)
    process.exit(1)
  }
}

// ── HS256 JWT minting (base64url over header.payload, signed with DEV_SECRET) ──
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const mint = (party) => {
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const payload = b64url({
    'https://daml.com/ledger-api': {
      ledgerId: LEDGER_ID,
      applicationId: APP_ID,
      actAs: [party],
      readAs: [party],
    },
  })
  const sig = createHmac('sha256', DEV_SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

// ── DESK tokens -> web/src/tokens.json (browser-readable; gitignored) ──────────
const deskTokens = {
  bankA: { party: parties.bankA, token: mint(parties.bankA) },
  bankB: { party: parties.bankB, token: mint(parties.bankB) },
  bankC: { party: parties.bankC, token: mint(parties.bankC) },
}
const webSrc = resolve(repoRoot, 'web', 'src')
mkdirSync(webSrc, { recursive: true })
const tokensPath = resolve(webSrc, 'tokens.json')
writeFileSync(tokensPath, JSON.stringify(deskTokens, null, 2) + '\n')

// ── OPERATOR token -> scripts/.operator-token (CLI-only; gitignored; NOT in web/src) ──
const operatorToken = { party: parties.operator, token: mint(parties.operator) }
const operatorPath = resolve(__dirname, '.operator-token')
writeFileSync(operatorPath, JSON.stringify(operatorToken, null, 2) + '\n')

console.log(`Read parties from: ${partiesPath}`)
console.log(`Wrote DESK tokens (bankA, bankB, bankC) -> ${tokensPath}`)
console.log(`Wrote OPERATOR token (CLI/out-of-browser only) -> ${operatorPath}`)
console.log(`ledgerId="${LEDGER_ID}" applicationId="${APP_ID}"`)
