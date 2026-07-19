// web/scripts/ensure-tokens.mjs — guarantee web/src/tokens.json exists before build/test.
//
// WHY THIS EXISTS: desks.ts / auth/oidc.ts `import` web/src/tokens.json, so Vite needs the
// file to resolve at build time — but the file is GITIGNORED and always will be. It used to
// carry a live bearer, and a gitignore is the last line of defence against re-committing one.
// A clean clone (a Vercel build, CI, a new machine) therefore has no tokens.json and cannot
// build at all. This script closes that gap WITHOUT tracking anything credential-shaped.
//
// Resolution order:
//   1. web/src/tokens.json already exists  → LEAVE IT ALONE. Never clobber a local dev file
//      (e.g. a LocalNet run's per-desk scoped tokens, or a fresh `scripts/devnet/up.mjs` run).
//   2. UMBRA_PARTIES env is set            → write it verbatim. This is the deploy knob: point
//      a Vercel build at a different party set without touching the repo.
//   3. otherwise                           → copy web/src/parties.default.json, the committed,
//      PUBLIC, token-free party map.
//
// HARD RULE: whatever this writes must contain NO `token` field. Party ids and the `base` path
// prefix are public identifiers; a bearer is not, and the browser no longer holds one — the
// solver's ledger proxy injects it server-side (solver/src/ledgerproxy.ts). A `token` reaching
// this file would be bundled into the shipped client JS, which is the exact leak the deploy
// work removed. So we STRIP it defensively and fail loudly if the env knob smuggles one in.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'src', 'tokens.json')
const fallback = resolve(here, '..', 'src', 'parties.default.json')

if (existsSync(target)) {
  console.log('✓ web/src/tokens.json present — left untouched')
  process.exit(0)
}

let source
let origin
if (process.env.UMBRA_PARTIES) {
  origin = 'UMBRA_PARTIES env'
  try {
    source = JSON.parse(process.env.UMBRA_PARTIES)
  } catch {
    console.error('✗ UMBRA_PARTIES is not valid JSON')
    process.exit(1)
  }
} else {
  origin = 'web/src/parties.default.json'
  source = JSON.parse(readFileSync(fallback, 'utf8'))
}

// Defensive strip: a bearer must never be written into a file that gets bundled.
const cleaned = {}
let stripped = false
for (const [desk, entry] of Object.entries(source)) {
  const { token, ...rest } = entry ?? {}
  if (token) stripped = true
  cleaned[desk] = rest
}
if (stripped) {
  console.error(
    '✗ refusing to write a bearer into web/src/tokens.json — it would be bundled into the\n' +
      '  shipped client JS. The ledger credential belongs in the solver (LEDGER_PROXY_TOKEN /\n' +
      '  OIDC_CLIENT_SECRET), which injects it server-side. Remove `token` from the source.',
  )
  process.exit(1)
}

writeFileSync(target, JSON.stringify(cleaned, null, 2) + '\n')
console.log(`✓ wrote web/src/tokens.json from ${origin} (token-free: ${Object.keys(cleaned).join(', ')})`)
