#!/usr/bin/env node
// scripts/localnet/guest-onboard.mjs — WOW-07 guest 4th-desk onboarding.
//
// Provisions the guest desk (bankD / "Guest") so the mobile /join flow can submit a
// sealed bid and see ONLY its own fill: allocate a `bankD` party via POST /v2/parties,
// create the `umbra-bankD` Canton user, grant it CanActAs/CanReadAs rights on the party,
// mint its SCOPED HS256 token (mintJwt('umbra-bankD')), and MERGE a `bankD` entry into
// web/src/tokens.json in the SAME `{ party, token, base }` shape as bankA/B/C — leaving
// the existing desks untouched. Mirrors xnode-up.mjs's provisionDesk (allocate → user →
// rights → token) exactly; this script ONLY provisions the party + token (the
// DeskEligibility credential + the §4 seed are the Setup/Compliance job, not this).
//
// HONEST LIMITATION (11-RESEARCH Open Question 2 / Pitfall 7): LocalNet has only THREE
// participants, so a genuine 4th validator is NOT available. The guest is CO-HOSTED on an
// existing participant (app-user :2975) and labeled honestly in the topology view
// (`DEMO-REAL · SINGLE-OPERATOR LOCALNET`) — a real 4th institution is the recorded
// live-UAT limitation, not something this script fakes.
//
// SECURITY (V2/V4 / T-11-03-QR): the scoped guest token is written ONLY into
// web/src/tokens.json (the D6 boundary the desks already use) — it is NEVER printed to
// stdout (so it can never be copied into a QR) and NEVER embedded in any URL. The QR the
// operator shows carries only the /join URL + roundId. HONEST DELIVERY MODEL: tokens.json is
// gitignored (never committed to source), but desks.ts `import`s it, so Vite BUNDLES the
// scoped token into the shipped client JS — it is a browser-readable DEV token (the same D6
// dev-token model as bankA/B/C, scoped actAs/readAs bankD only), NOT a server-side-delivered
// secret. Real guest auth is OIDC (Phase 12). This is why /join carries the HARD
// `DEV SCOPED TOKEN … REAL GUEST AUTH IS OIDC (PHASE 12)` label.
//
// Usage:  node scripts/localnet/guest-onboard.mjs
// Idempotent: if tokens.json already carries a bankD entry the script skips (exit 0).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

// Co-host the guest on app-user (:2975) — the same participant bankA lives on. Its
// tokens.json proxy base matches bankA's `/cn/app-user` routing.
const USER = 'http://localhost:2975'
const GUEST_BASE = '/cn/app-user'
const GUEST_HINT = 'bankD'
const GUEST_USER = 'umbra-bankD'

const admin = mintJwt('ledger-api-user')
const tokensPath = resolve(repoRoot, 'web', 'src', 'tokens.json')

// v2 fetch helper (verbatim from xnode-up.mjs) — the Authorization header carries the
// admin bearer; it is never echoed into any file or log.
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

// Grant CanActAs + CanReadAs on the party to the user (mirrors xnode-up.mjs:58-66).
const grant = (base, userId, partyIds) =>
  api(base, admin, 'POST', `/v2/users/${userId}/rights`, {
    userId,
    identityProviderId: '',
    rights: partyIds.flatMap((party) => [
      { kind: { CanActAs: { value: { party } } } },
      { kind: { CanReadAs: { value: { party } } } },
    ]),
  })

// Allocate → user → rights → scoped token (mirrors xnode-up.mjs:67-81 provisionDesk).
// Returns { party, token } — the token is handled ONLY by the tokens.json writer below.
const provisionGuest = async (base, hint) => {
  const existing = (await api(base, admin, 'GET', '/v2/parties')).partyDetails.find(
    (p) => p.party.startsWith(`${hint}::`) && p.isLocal,
  )
  const party = existing
    ? existing.party
    : (await api(base, admin, 'POST', '/v2/parties', { partyIdHint: hint, identityProviderId: '' })).partyDetails.party
  const users = new Set((await api(base, admin, 'GET', '/v2/users')).users.map((u) => u.id))
  if (!users.has(GUEST_USER))
    await api(base, admin, 'POST', '/v2/users', {
      user: {
        id: GUEST_USER,
        isDeactivated: false,
        primaryParty: party,
        identityProviderId: '',
        metadata: { resourceVersion: '', annotations: {} },
      },
      rights: [],
    })
  await grant(base, GUEST_USER, [party])
  return { party, token: mintJwt(GUEST_USER) }
}

const main = async () => {
  console.log('=== WOW-07 guest onboarding (bankD, co-hosted on app-user :2975) ===\n')

  // Idempotency: a bankD entry already in tokens.json means the guest is provisioned.
  let tokens = {}
  try {
    tokens = JSON.parse(readFileSync(tokensPath, 'utf8'))
  } catch {
    tokens = {}
  }
  if (tokens.bankD?.party && tokens.bankD?.token) {
    console.log(`✓ guest already provisioned (${tokens.bankD.party.slice(0, 22)}…) — skipping\n`)
    return
  }

  const guest = await provisionGuest(USER, GUEST_HINT)

  // MERGE the guest into tokens.json in the SAME { party, token, base } shape as the
  // existing desks — leaving bankA/B/C byte-unchanged. The token lands ONLY here.
  const merged = {
    ...tokens,
    bankD: { party: guest.party, token: guest.token, base: GUEST_BASE },
  }
  writeFileSync(tokensPath, JSON.stringify(merged, null, 2) + '\n')

  // HONEST print — party id (truncated) + base only. The token is NEVER printed (so it
  // cannot land in a QR); it lives solely in tokens.json.
  console.log(`✓ bankD (Guest) → app-user (:2975)  ${guest.party.slice(0, 22)}…`)
  console.log(`✓ merged bankD { party, token, base:'${GUEST_BASE}' } into web/src/tokens.json (token NOT printed)\n`)
  console.log('HONEST LIMITATION: the guest is CO-HOSTED on an existing participant — LocalNet')
  console.log('has only three participants, so a genuine 4th validator is a live-UAT item, not a')
  console.log('4th node. The topology view labels this DEMO-REAL · SINGLE-OPERATOR LOCALNET.')
  console.log('\nThe /join QR carries only the /join URL + roundId — never the scoped token.')
}

// CLI entrypoint only (never on import) — mirrors mint-jwt.mjs's guard.
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain || process.argv[1]?.endsWith('guest-onboard.mjs')) {
  main().catch((err) => {
    process.stderr.write(`guest-onboard failed: ${err instanceof Error ? err.message : 'unknown error'}\n`)
    process.exit(1)
  })
}
