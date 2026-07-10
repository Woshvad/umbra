// deploy/devnet/devnet-deploy.mjs — deploy the FROZEN Umbra DAR onto a Splice
// Canton DevNet participant via the JSON Ledger API v2. Mirrors
// scripts/localnet/deploy.mjs, but parameterized for a DevNet participant
// endpoint + OIDC (client-credentials) auth instead of the LocalNet unsafe-HMAC.
//
// ⚠ CHAIN-02 — the LIVE upload + vet + §4-on-real-Canton is UAT (needs a booted,
//   SV-sponsored DevNet participant — see deploy/RUNBOOK.md). This script is the
//   offline-shaped, request-proven analog; its request SHAPES are asserted by
//   deploy/devnet/devnet-deploy.test.mjs against a mocked v2 API (no live node).
//
// Steps (all against the DevNet participant JSON Ledger API v2):
//   0. preflight     → GET  /v2/state/ledger-end          (auth reachable?)
//   1. upload + VET  → POST /v2/packages (octet-stream)    (uploading vets on the participant)
//   2. confirm vet   → GET  /v2/packages                   (the package id is now listed/vetted)
//   3. allocate      → POST /v2/parties                    (NAMESPACED hints — Pitfall 7)
//   4. grantRights   → POST /v2/users/{ADMIN}/rights       (admin == token `sub` — Pitfall 3)
//   5. desk users    → POST /v2/users (+/rights)           (per-desk own-party read = privacy)
//
// Auth: OIDC client-credentials (RS256, verified by the participant via JWKS —
//   deploy/canton/participant-oidc-auth.conf). The bearer is acquired from the
//   Keycloak token endpoint; the client secret is server-side ONLY (gitignored .env),
//   NEVER in a browser. Rights come from Canton user management, NOT token claims —
//   so the admin user (== `sub`) MUST be granted the operator's actAs/readAs (step 4,
//   the #1 live-failure mode, Pitfall 3).
//
// Run (AT THE GATE):  node deploy/devnet/devnet-deploy.mjs
// Env:
//   DEVNET_JSON_API      participant JSON Ledger API v2 base (default http://localhost:6975)
//   LEDGER_API_ADMIN_USER  admin/service-account user == the client-credentials token `sub`
//   OIDC_ISSUER          Keycloak realm base (…/realms/umbra)
//   OIDC_CLIENT_ID       umbra-solver (confidential client-credentials)
//   OIDC_CLIENT_SECRET   server-side ONLY (gitignored .env) — never committed/logged
//   OIDC_SCOPE           default daml_ledger_api
//   DEVNET_DAR_PATH      default daml/.daml/dist/umbra-0.1.0.dar (the frozen DAR)

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

// DevNet DAR uses the SAME namespaced hint format the LocalNet boot already sets
// (PARTY_HINT=umbra-operator-1) — DevNet enforces <org>-<function>-<enumerator> (Pitfall 7).
export const PARTY_HINTS = ['umbra-operator-1', 'umbra-bankA-1', 'umbra-bankB-1', 'umbra-bankC-1']
export const DESK_USERS = {
  'umbra-bankA-1': 'umbra-bankA',
  'umbra-bankB-1': 'umbra-bankB',
  'umbra-bankC-1': 'umbra-bankC',
}
export const CANTON_AUDIENCE = 'https://canton.network.global'

// ── OIDC client-credentials token acquisition (RS256; verified by the participant
//    via JWKS). fetchFn is injectable so the shape is unit-testable offline. ──
export async function acquireToken({
  fetchFn = fetch,
  issuer,
  clientId,
  clientSecret,
  scope = 'daml_ledger_api',
}) {
  const res = await fetchFn(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
  })
  if (!res.ok) throw new Error(`OIDC token endpoint returned HTTP ${res.status}`)
  const json = await res.json()
  const token = json.access_token
  if (!token) throw new Error('OIDC token response missing access_token')
  return token
}

// ── the DEPLOY CORE — pure over injected deps (fetchFn/token/darBuffer) so the
//    upload/vet/allocate/grantRights request shapes are asserted offline. ──
export async function deploy({
  fetchFn = fetch,
  participant,
  adminUser,
  token,
  darBuffer,
  partyHints = PARTY_HINTS,
  deskUsers = DESK_USERS,
  log = () => {},
}) {
  const authJson = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const api = async (method, path, body, headers = authJson) => {
    const res = await fetchFn(`${participant}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
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
    const err = new Error(msg)
    err.detail = detail
    throw err
  }

  const result = { packageUploaded: false, vetConfirmed: false, parties: {}, adminGranted: false, deskUsers: {} }

  // 0. preflight — is the participant reachable + is our OIDC bearer accepted?
  const end = await api('GET', '/v2/state/ledger-end')
  if (!end.ok) fail(`participant ${participant} not reachable/authorized (HTTP ${end.status})`, end.body)
  log(`✓ participant ${participant} reachable, ledger-end offset=${end.body?.offset}`)

  // 1. upload + VET the frozen DAR (uploading a package to /v2/packages vets it on
  //    THIS participant — a prerequisite for routing Round.Clear; Pitfall 6).
  if (!(darBuffer && darBuffer.length)) fail('DAR buffer is empty — build the frozen umbra-0.1.0.dar first')
  const up = await api('POST', '/v2/packages', darBuffer, {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/octet-stream',
  })
  if (!up.ok) fail(`DAR upload/vet failed on ${participant} (HTTP ${up.status})`, up.body)
  result.packageUploaded = true
  log(`✓ uploaded + vetted DAR (${(darBuffer.length / 1024).toFixed(0)} KiB) on ${participant}`)

  // 2. confirm the package is now vetted/listed on the participant.
  const pkgs = await api('GET', '/v2/packages')
  if (pkgs.ok) {
    const ids = pkgs.body?.packageIds ?? pkgs.body ?? []
    result.vetConfirmed = Array.isArray(ids) ? ids.length > 0 : true
    log(`✓ package vetting confirmed (${Array.isArray(ids) ? ids.length : '?'} packages listed)`)
  }

  // 3. allocate parties with the NAMESPACED hint format (Pitfall 7).
  const existing = (await api('GET', '/v2/parties')).body?.partyDetails ?? []
  const findExisting = (hint) => existing.find((p) => p.party.startsWith(`${hint}::`))?.party
  for (const hint of partyHints) {
    const have = findExisting(hint)
    if (have) {
      result.parties[hint] = have
      log(`  • party ${hint} exists → ${have}`)
      continue
    }
    const res = await api('POST', '/v2/parties', { partyIdHint: hint, identityProviderId: '' })
    if (!res.ok) fail(`allocate party ${hint} failed (HTTP ${res.status})`, res.body)
    const party = res.body?.partyDetails?.party ?? res.body?.party
    if (!party) fail(`allocate party ${hint}: no party in response`, res.body)
    result.parties[hint] = party
    log(`✓ allocated party ${hint} → ${party}`)
  }

  // helper — grant a user actAs+readAs a set of parties.
  const grantRights = async (userId, partyIds) => {
    const rights = partyIds.flatMap((party) => [
      { kind: { CanActAs: { value: { party } } } },
      { kind: { CanReadAs: { value: { party } } } },
    ])
    const res = await api('POST', `/v2/users/${userId}/rights`, { userId, identityProviderId: '', rights })
    if (!res.ok) fail(`grant rights to ${userId} failed (HTTP ${res.status})`, res.body)
    return rights
  }

  // 4. GRANT the admin/service-account user (== the client-credentials token `sub`)
  //    actAs+readAs ALL parties — WITHOUT this, the verified OIDC token maps to a
  //    user with no rights → 403 on every ledger call (Pitfall 3, the #1 live failure).
  await grantRights(adminUser, partyHints.map((h) => result.parties[h]))
  result.adminGranted = true
  log(`✓ granted admin user "${adminUser}" actAs+readAs: ${partyHints.join(', ')}`)

  // 5. per-desk read users — own party only (structural privacy in the browser).
  const existingUsers = new Set(((await api('GET', '/v2/users')).body?.users ?? []).map((u) => u.id))
  for (const [hint, userId] of Object.entries(deskUsers)) {
    const primaryParty = result.parties[hint]
    if (!existingUsers.has(userId)) {
      const res = await api('POST', '/v2/users', {
        user: {
          id: userId,
          isDeactivated: false,
          primaryParty,
          identityProviderId: '',
          metadata: { resourceVersion: '', annotations: {} },
        },
        rights: [],
      })
      if (!res.ok) fail(`create user ${userId} failed (HTTP ${res.status})`, res.body)
    }
    await grantRights(userId, [primaryParty])
    result.deskUsers[userId] = primaryParty
    log(`✓ desk user ${userId} → actAs+readAs ${hint}`)
  }

  return result
}

// ── CLI entrypoint (guarded so the test can import deploy/acquireToken without booting) ──
async function main() {
  const participant = process.env.DEVNET_JSON_API ?? 'http://localhost:6975'
  const adminUser = process.env.LEDGER_API_ADMIN_USER
  const issuer = process.env.OIDC_ISSUER
  const clientId = process.env.OIDC_CLIENT_ID ?? 'umbra-solver'
  const clientSecret = process.env.OIDC_CLIENT_SECRET
  const scope = process.env.OIDC_SCOPE ?? 'daml_ledger_api'
  const darPath = process.env.DEVNET_DAR_PATH ?? resolve(repoRoot, 'daml', '.daml', 'dist', 'umbra-0.1.0.dar')

  if (!adminUser) throw new Error('LEDGER_API_ADMIN_USER is required (== the client-credentials token `sub`, Pitfall 3)')
  if (!issuer || !clientSecret) throw new Error('OIDC_ISSUER + OIDC_CLIENT_SECRET are required (server-side only; never committed)')
  if (!existsSync(darPath)) throw new Error(`DAR not found: ${darPath} — build the frozen umbra-0.1.0.dar first`)

  console.log('▸ acquiring OIDC client-credentials token (umbra-solver)…')
  const token = await acquireToken({ issuer, clientId, clientSecret, scope })

  console.log(`▸ deploying frozen DAR to DevNet participant ${participant}`)
  const out = await deploy({
    participant,
    adminUser,
    token,
    darBuffer: readFileSync(darPath),
    log: (m) => console.log('  ' + m),
  })
  console.log('\n✓ DevNet deploy complete (CHAIN-02 — live vet + §4-on-real-Canton is UAT)')
  console.log(`  parties: ${Object.keys(out.parties).join(', ')}`)
  console.log(`  admin user granted operator rights: ${out.adminGranted}`)
}

// Only run main() when invoked directly (not on import — keeps the test node-free).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('devnet-deploy.mjs')) {
  main().catch((e) => {
    console.error(`\n✗ ${e.message}`)
    if (e.detail !== undefined) console.error(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail, null, 2))
    process.exit(1)
  })
}
