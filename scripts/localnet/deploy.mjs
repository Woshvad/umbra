// scripts/localnet/deploy.mjs — deploy Umbra onto the real Canton LocalNet
// (cn-quickstart) via the JSON Ledger API v2. Idempotent and re-runnable.
//
// Steps (all against the app-provider participant, default :3975):
//   1. Upload the Umbra DAR             → POST /v2/packages         (if the .dar exists)
//   2. Allocate parties operator/bankA/bankB/bankC → POST /v2/parties
//   3. Grant the admin user (ledger-api-user) actAs+readAs ALL 4 parties
//      → the solver acts with this one token (full operator + seed authority)
//   4. Create per-desk users umbra-bankA/B/C, each with actAs+readAs its OWN party
//      → the browser uses these tokens; the participant returns ONLY that desk's
//        contracts (STRUCTURAL privacy — the money shot, enforced by the ledger)
//   5. Write the party map + dev tokens:
//        daml/parties.json            { operator, bankA, bankB, bankC }   (full ::ns ids)
//        web/src/tokens.json          { bankA:{party,token}, bankB, bankC } (browser; gitignored)
//        scripts/.operator-token      { party, token }                    (solver; gitignored)
//        scripts/localnet/.deploy.json full record (participant, packageId, subs)
//
// Auth: unsafe-jwt-hmac-256 — audience-based dev tokens { sub, aud } HS256/"unsafe",
// aud "https://canton.network.global" (conf/canton/*/app-auth.conf). Rights come
// from Canton user management, NOT from token claims — hence steps 3-4.
//
// Run:  node scripts/localnet/deploy.mjs
// Env:  LOCALNET_JSON_API (default http://localhost:3975)
//       LOCALNET_ADMIN_USER (default ledger-api-user)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt, LOCALNET_JWT_AUD } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

const PARTICIPANT = process.env.LOCALNET_JSON_API ?? 'http://localhost:3975'
const ADMIN_USER = process.env.LOCALNET_ADMIN_USER ?? 'ledger-api-user'
const DAR_PATH = resolve(repoRoot, 'daml', '.daml', 'dist', 'umbra-0.1.0.dar')

// The Umbra party hints and the per-desk user ids that read them.
const PARTY_HINTS = ['operator', 'bankA', 'bankB', 'bankC']
const DESK_USERS = { bankA: 'umbra-bankA', bankB: 'umbra-bankB', bankC: 'umbra-bankC' }

const adminToken = mintJwt(ADMIN_USER)
const authJson = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }

// ── thin v2 helpers ─────────────────────────────────────────────────────────────
const api = async (method, path, body, headers = authJson) => {
  const res = await fetch(`${PARTICIPANT}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = text
  }
  return { ok: res.ok, status: res.status, body: parsed }
}

const fail = (msg, detail) => {
  console.error(`\n✗ ${msg}`)
  if (detail !== undefined) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
  process.exit(1)
}

// ── 0. preflight ─────────────────────────────────────────────────────────────────
const end = await api('GET', '/v2/state/ledger-end')
if (!end.ok) fail(`participant ${PARTICIPANT} not reachable/authorized (HTTP ${end.status})`, end.body)
console.log(`✓ participant ${PARTICIPANT} reachable, ledger-end offset=${end.body.offset}`)

// ── 1. upload DAR to ALL participants ──────────────────────────────────────────────
// The app-provider participant is required (the operator's node); app-user + sv are
// best-effort so the package is VETTED everywhere — a prerequisite for §19 cross-node
// transactions (Canton refuses to route a tx whose package a stakeholder hasn't vetted).
if (existsSync(DAR_PATH)) {
  const dar = readFileSync(DAR_PATH)
  const others = ['http://localhost:2975', 'http://localhost:4975']
  const up = await api('POST', '/v2/packages', dar, {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/octet-stream',
  })
  if (!up.ok) fail(`DAR upload failed on ${PARTICIPANT} (HTTP ${up.status})`, up.body)
  console.log(`✓ vetted DAR (${(dar.length / 1024).toFixed(0)} KiB) on ${PARTICIPANT}`)
  for (const base of others.filter((b) => b !== PARTICIPANT)) {
    try {
      const res = await fetch(`${base}/v2/packages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/octet-stream' },
        body: dar,
      })
      console.log(res.ok ? `✓ vetted DAR on ${base} (cross-node)` : `… ${base} -> HTTP ${res.status} (cross-node skipped)`)
    } catch {
      console.log(`… ${base} unreachable — cross-node vetting skipped`)
    }
  }
} else {
  console.log(`… DAR not found (${DAR_PATH}) — skipping upload (build it, then re-run)`)
}

// ── 2. allocate parties (idempotent) ──────────────────────────────────────────────
const existingParties = (await api('GET', '/v2/parties')).body?.partyDetails ?? []
const findExisting = (hint) => existingParties.find((p) => p.party.startsWith(`${hint}::`))?.party

const parties = {}
for (const hint of PARTY_HINTS) {
  const have = findExisting(hint)
  if (have) {
    parties[hint] = have
    console.log(`  • party ${hint} exists → ${have}`)
    continue
  }
  const res = await api('POST', '/v2/parties', {
    partyIdHint: hint,
    identityProviderId: '',
  })
  if (!res.ok) fail(`allocate party ${hint} failed (HTTP ${res.status})`, res.body)
  // POST returns { partyDetails: { party } } (singular)
  const party = res.body?.partyDetails?.party ?? res.body?.party
  if (!party) fail(`allocate party ${hint}: no party in response`, res.body)
  parties[hint] = party
  console.log(`✓ allocated party ${hint} → ${party}`)
}

// ── 3/4. users + rights ────────────────────────────────────────────────────────────
const existingUsers = new Set(((await api('GET', '/v2/users')).body?.users ?? []).map((u) => u.id))

const ensureUser = async (id, primaryParty) => {
  if (existingUsers.has(id)) {
    console.log(`  • user ${id} exists`)
    return
  }
  const res = await api('POST', '/v2/users', {
    user: {
      id,
      isDeactivated: false,
      primaryParty,
      identityProviderId: '',
      metadata: { resourceVersion: '', annotations: {} },
    },
    rights: [],
  })
  if (!res.ok) fail(`create user ${id} failed (HTTP ${res.status})`, res.body)
  console.log(`✓ created user ${id} (primaryParty ${primaryParty})`)
}

const grantRights = async (userId, partyIds) => {
  const rights = partyIds.flatMap((party) => [
    { kind: { CanActAs: { value: { party } } } },
    { kind: { CanReadAs: { value: { party } } } },
  ])
  const res = await api('POST', `/v2/users/${userId}/rights`, {
    userId,
    identityProviderId: '',
    rights,
  })
  if (!res.ok) fail(`grant rights to ${userId} failed (HTTP ${res.status})`, res.body)
  console.log(`✓ granted ${userId} actAs+readAs: ${partyIds.map((p) => p.split('::')[0]).join(', ')}`)
}

// Admin/solver user: act as ALL four parties (seed + operator authority).
await grantRights(ADMIN_USER, PARTY_HINTS.map((h) => parties[h]))

// Per-desk read users: own party only (structural privacy in the browser).
for (const [hint, userId] of Object.entries(DESK_USERS)) {
  await ensureUser(userId, parties[hint])
  await grantRights(userId, [parties[hint]])
}

// ── 5. write party map + dev tokens ────────────────────────────────────────────────
const partiesJson = {
  operator: parties.operator,
  bankA: parties.bankA,
  bankB: parties.bankB,
  bankC: parties.bankC,
}
writeFileSync(resolve(repoRoot, 'daml', 'parties.json'), JSON.stringify(partiesJson, null, 2) + '\n')

const deskTokens = {}
for (const [hint, userId] of Object.entries(DESK_USERS)) {
  deskTokens[hint] = { party: parties[hint], token: mintJwt(userId) }
}
const webSrc = resolve(repoRoot, 'web', 'src')
mkdirSync(webSrc, { recursive: true })
writeFileSync(resolve(webSrc, 'tokens.json'), JSON.stringify(deskTokens, null, 2) + '\n')

const operatorToken = { party: parties.operator, token: mintJwt(ADMIN_USER) }
writeFileSync(resolve(repoRoot, 'scripts', '.operator-token'), JSON.stringify(operatorToken, null, 2) + '\n')

const deployRecord = {
  participant: PARTICIPANT,
  audience: LOCALNET_JWT_AUD,
  adminUser: ADMIN_USER,
  parties: partiesJson,
  deskUsers: DESK_USERS,
  deployedAt: new Date().toISOString(),
}
writeFileSync(resolve(__dirname, '.deploy.json'), JSON.stringify(deployRecord, null, 2) + '\n')

console.log('\n✓ LocalNet deploy complete')
console.log(`  parties.json      → daml/parties.json`)
console.log(`  desk tokens       → web/src/tokens.json (bankA/bankB/bankC)`)
console.log(`  operator token    → scripts/.operator-token (solver only)`)
console.log(`  deploy record     → scripts/localnet/.deploy.json`)
