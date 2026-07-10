#!/usr/bin/env node
// ============================================================================
// Umbra — OFFLINE realm-shape test for deploy/keycloak/umbra-realm.json (IDEN-01/02).
//
// Asserts the SHAPE of the committed Keycloak realm export WITHOUT booting Keycloak
// or Docker. The live token exchange + live MFA are UAT; this proves the export will
// mint the right tokens with the right RBAC + MFA before we ever boot it.
//
// Run:  node deploy/keycloak/realm.test.mjs   (exit 0 = all shape assertions pass)
// ============================================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const realm = JSON.parse(readFileSync(resolve(__dirname, 'umbra-realm.json'), 'utf8'))

const CANTON_AUDIENCE = 'https://canton.network.global'
const checks = []
const check = (name, fn) => {
  fn()
  checks.push(name)
  console.log(`  ok  ${name}`)
}

// ── Realm identity ──────────────────────────────────────────────────────────
check('realm is "umbra" and enabled', () => {
  assert.equal(realm.realm, 'umbra')
  assert.equal(realm.enabled, true)
})

// ── Clients + flow flags ────────────────────────────────────────────────────
const byId = (id) => realm.clients.find((c) => c.clientId === id)

check('umbra-solver = confidential client-credentials (serviceAccounts on, public off)', () => {
  const solver = byId('umbra-solver')
  assert.ok(solver, 'umbra-solver client is missing')
  assert.equal(solver.serviceAccountsEnabled, true)
  assert.equal(solver.publicClient, false)
  assert.equal(solver.standardFlowEnabled, false)
  assert.ok(
    (solver.defaultClientScopes || []).includes('daml_ledger_api'),
    'umbra-solver must have daml_ledger_api as a default scope',
  )
})

check('umbra-web = public auth-code + PKCE S256', () => {
  const web = byId('umbra-web')
  assert.ok(web, 'umbra-web client is missing')
  assert.equal(web.publicClient, true)
  assert.equal(web.standardFlowEnabled, true)
  assert.equal((web.attributes || {})['pkce.code.challenge.method'], 'S256')
  assert.ok(!('secret' in web), 'a public PKCE client must NOT carry a secret')
  assert.ok(
    (web.defaultClientScopes || []).includes('daml_ledger_api') &&
      (web.defaultClientScopes || []).includes('openid'),
    'umbra-web must have openid + daml_ledger_api default scopes',
  )
})

// ── RBAC roles (IDEN-02) ────────────────────────────────────────────────────
check('realm roles Trader / Compliance / Admin exist', () => {
  const roles = (realm.roles?.realm || []).map((r) => r.name)
  for (const r of ['Trader', 'Compliance', 'Admin']) {
    assert.ok(roles.includes(r), `missing realm role ${r}`)
  }
})

// ── Canton-audience mapper (IDEN-01) ────────────────────────────────────────
check(`daml_ledger_api scope stamps audience ${CANTON_AUDIENCE}`, () => {
  const scope = (realm.clientScopes || []).find((s) => s.name === 'daml_ledger_api')
  assert.ok(scope, 'daml_ledger_api client scope is missing')
  const aud = (scope.protocolMappers || []).find(
    (m) => m.protocolMapper === 'oidc-audience-mapper',
  )
  assert.ok(aud, 'audience mapper is missing from daml_ledger_api scope')
  assert.equal(aud.config['included.custom.audience'], CANTON_AUDIENCE)
  // A role mapper must flow RBAC roles into the token (IDEN-02).
  const roleMapper = (scope.protocolMappers || []).find((m) =>
    /role-mapper$/.test(m.protocolMapper || ''),
  )
  assert.ok(roleMapper, 'a user role mapper must be present on the daml_ledger_api scope')
})

// ── MFA (OTP) bound to settlement-affecting roles (IDEN-02) ──────────────────
check('OTP required action CONFIGURE_TOTP is enabled', () => {
  const totp = (realm.requiredActions || []).find((a) => a.alias === 'CONFIGURE_TOTP')
  assert.ok(totp && totp.enabled === true, 'CONFIGURE_TOTP required action must be enabled')
})

check('OTP is conditionally bound to Compliance AND Admin', () => {
  const condRoles = (realm.authenticatorConfig || [])
    .map((c) => c.config?.condUserRole)
    .filter(Boolean)
  for (const role of ['Compliance', 'Admin']) {
    assert.ok(
      condRoles.includes(role),
      `no conditional-user-role authenticator binds OTP to ${role}`,
    )
  }
  // The conditional subflows must actually invoke the OTP form.
  const hasOtpForm = (realm.authenticationFlows || []).some((f) =>
    (f.authenticationExecutions || []).some((e) => e.authenticator === 'auth-otp-form'),
  )
  assert.ok(hasOtpForm, 'no auth-otp-form execution found — OTP is never enforced')
})

// ── No live secret committed (placeholders only) ────────────────────────────
check('no real client secret committed (placeholder only)', () => {
  const solver = byId('umbra-solver')
  assert.ok(
    /REPLACE|PLACEHOLDER|CHANGE_ME|AT_UAT/i.test(solver.secret || ''),
    'umbra-solver secret must be a placeholder, not a live value',
  )
})

console.log(`\nrealm-shape: ${checks.length} checks passed ✓`)
process.exit(0)
