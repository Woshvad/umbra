#!/usr/bin/env node
// ============================================================================
// Umbra — OFFLINE mocked-v2 test for deploy/devnet/devnet-deploy.mjs (CHAIN-02).
//
// Drives the deploy CORE and acquireToken against a MOCKED JSON Ledger API v2 +
// mocked Keycloak token endpoint (a recording fetch), with NO live participant,
// NO Docker, NO SV-sponsored node. Proves the request SHAPES are well-formed:
//   • OIDC client-credentials form-POST (grant_type + client_id + scope)
//   • DAR upload/VET   → POST /v2/packages with application/octet-stream + a body
//   • vet confirmation → GET  /v2/packages
//   • party allocation → POST /v2/parties for each NAMESPACED hint (umbra-*-1, Pitfall 7)
//   • grantRights      → POST /v2/users/{ADMIN}/rights with CanActAs+CanReadAs
//                        for ALL parties (admin == token `sub`, Pitfall 3)
//   • per-desk users   → own-party read only
//
// The LIVE upload+vet + §4-on-real-Canton is CHAIN-02 UAT (needs a booted node).
//
// Run:  node deploy/devnet/devnet-deploy.test.mjs   (exit 0 = all shape assertions pass)
// ============================================================================
import assert from 'node:assert/strict'
import { deploy, acquireToken, PARTY_HINTS, DESK_USERS, CANTON_AUDIENCE } from './devnet-deploy.mjs'

const checks = []
const check = (name, fn) => {
  fn()
  checks.push(name)
  console.log(`  ok  ${name}`)
}

// ── a recording fetch that emulates the v2 API + the Keycloak token endpoint ──
const makeRecordingFetch = () => {
  const calls = []
  const json = (obj) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(obj),
    json: async () => obj,
  })
  const fetchFn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', headers: opts.headers ?? {}, body: opts.body })
    // Keycloak token endpoint.
    if (url.includes('/protocol/openid-connect/token')) return json({ access_token: 'MOCK.RS256.TOKEN' })
    // JSON Ledger API v2.
    if (url.endsWith('/v2/state/ledger-end')) return json({ offset: 42 })
    if (url.endsWith('/v2/packages') && (opts.method ?? 'GET') === 'POST') return json({})
    if (url.endsWith('/v2/packages')) return json({ packageIds: ['umbra-pkg-hash'] })
    if (url.endsWith('/v2/parties') && (opts.method ?? 'GET') === 'POST') {
      const hint = JSON.parse(opts.body).partyIdHint
      return json({ partyDetails: { party: `${hint}::mocknamespace` } })
    }
    if (url.endsWith('/v2/parties')) return json({ partyDetails: [] })
    if (url.endsWith('/v2/users') && (opts.method ?? 'GET') === 'POST') return json({})
    if (url.endsWith('/v2/users')) return json({ users: [] })
    if (/\/v2\/users\/.+\/rights$/.test(url)) return json({})
    return json({})
  }
  return { fetchFn, calls }
}

// ── acquireToken shape (client-credentials form-POST) ──
await (async () => {
  const { fetchFn, calls } = makeRecordingFetch()
  const token = await acquireToken({
    fetchFn,
    issuer: 'https://keycloak.umbra.dev:8443/realms/umbra',
    clientId: 'umbra-solver',
    clientSecret: 'MOCK_SECRET_NOT_REAL',
    scope: 'daml_ledger_api',
  })
  check('acquireToken returns the issuer access_token', () => {
    assert.equal(token, 'MOCK.RS256.TOKEN')
  })
  check('acquireToken posts a client-credentials form to the token endpoint', () => {
    const c = calls.find((x) => x.url.includes('/protocol/openid-connect/token'))
    assert.ok(c, 'no call to the token endpoint')
    assert.equal(c.method, 'POST')
    assert.equal(c.headers['Content-Type'], 'application/x-www-form-urlencoded')
    const form = c.body.toString()
    assert.match(form, /grant_type=client_credentials/)
    assert.match(form, /client_id=umbra-solver/)
    assert.match(form, /scope=daml_ledger_api/)
  })
})()

// ── deploy core shapes (upload+vet+allocate+grantRights) ──
const { fetchFn, calls } = makeRecordingFetch()
const ADMIN = 'umbra-solver'
const result = await deploy({
  fetchFn,
  participant: 'http://localhost:6975',
  adminUser: ADMIN,
  token: 'MOCK.RS256.TOKEN',
  darBuffer: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // a tiny fake DAR (ZIP magic)
})

check('preflight reads /v2/state/ledger-end with a Bearer token', () => {
  const c = calls.find((x) => x.url.endsWith('/v2/state/ledger-end'))
  assert.ok(c, 'no ledger-end preflight')
  assert.match(c.headers.Authorization, /^Bearer /)
})

check('DAR upload/VET is a POST /v2/packages with octet-stream + a body', () => {
  const c = calls.find((x) => x.url.endsWith('/v2/packages') && x.method === 'POST')
  assert.ok(c, 'no DAR upload POST')
  assert.equal(c.headers['Content-Type'], 'application/octet-stream')
  assert.ok(c.body && c.body.length > 0, 'upload body (DAR bytes) must be non-empty')
  assert.equal(result.packageUploaded, true)
})

check('vet is CONFIRMED via GET /v2/packages', () => {
  const c = calls.find((x) => x.url.endsWith('/v2/packages') && x.method === 'GET')
  assert.ok(c, 'no GET /v2/packages vet confirmation')
  assert.equal(result.vetConfirmed, true)
})

check('parties are allocated with the NAMESPACED hint format (Pitfall 7)', () => {
  const posted = calls
    .filter((x) => x.url.endsWith('/v2/parties') && x.method === 'POST')
    .map((x) => JSON.parse(x.body).partyIdHint)
  for (const hint of PARTY_HINTS) {
    assert.ok(posted.includes(hint), `party hint ${hint} was not allocated`)
    assert.match(hint, /^umbra-[A-Za-z0-9]+-\d+$/, `${hint} is not <org>-<function>-<enumerator>`)
  }
})

check('grantRights gives the admin (== token sub) actAs+readAs ALL parties (Pitfall 3)', () => {
  const c = calls.find((x) => x.url === `http://localhost:6975/v2/users/${ADMIN}/rights` && x.method === 'POST')
  assert.ok(c, 'no grantRights POST for the admin user')
  const body = JSON.parse(c.body)
  const acts = body.rights.filter((r) => r.kind.CanActAs).length
  const reads = body.rights.filter((r) => r.kind.CanReadAs).length
  assert.equal(acts, PARTY_HINTS.length, 'admin must actAs every party')
  assert.equal(reads, PARTY_HINTS.length, 'admin must readAs every party')
  assert.equal(result.adminGranted, true)
})

check('per-desk users get own-party read only (structural privacy)', () => {
  for (const [hint, userId] of Object.entries(DESK_USERS)) {
    const c = calls.find((x) => x.url === `http://localhost:6975/v2/users/${userId}/rights` && x.method === 'POST')
    assert.ok(c, `no rights grant for desk user ${userId}`)
    const body = JSON.parse(c.body)
    // exactly one party (its own) → 1 actAs + 1 readAs.
    assert.equal(body.rights.length, 2, `${userId} must hold rights to exactly one party`)
    assert.ok(result.deskUsers[userId].startsWith(`${hint}::`))
  }
})

check('the Canton audience constant stays https://canton.network.global', () => {
  assert.equal(CANTON_AUDIENCE, 'https://canton.network.global')
})

console.log(`\ndevnet-deploy shape: ${checks.length} checks passed ✓`)
process.exit(0)
