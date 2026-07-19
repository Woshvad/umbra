// web/src/auth/oidc.test.ts — the desk PKCE login proof (IDEN-01/02), fully OFFLINE.
// Three guarantees, no browser, no Keycloak:
//   1. buildOidcSettings is a PUBLIC auth-code + PKCE config: response_type 'code',
//      client_id 'umbra-web', and NO client_secret key (a public client carries none).
//   2. DUAL-MODE: with VITE_OIDC_AUTHORITY unset (the test env), getAccessToken() returns
//      the pre-minted dev token from tokens.json — the dev path is unchanged.
//   3. SECRET-LESS BUNDLE: a comment-stripped scan of the module SOURCE (Vite ?raw) proves
//      no `client_secret` / secret string is present — so nothing leaks into the built JS.
import { describe, it, expect } from 'vitest'
// Raw module source for the static secret scan (Vite ?raw — avoids node:fs so the app
// tsc --noEmit build, which has no @types/node, stays clean). Mirrors cryptoUrls.test.ts.
import oidcSource from './oidc?raw'
import tokensJson from '../tokens.json'
import { buildOidcSettings, getAccessToken, oidcEnabled, OIDC_CLIENT_ID } from './oidc'

const SETTINGS = buildOidcSettings('https://keycloak.test/realms/umbra', 'http://localhost:5173')

describe('oidc — buildOidcSettings is a public auth-code + PKCE config', () => {
  it('uses response_type "code" (auth-code + PKCE)', () => {
    expect(SETTINGS.response_type).toBe('code')
  })

  it('is the PUBLIC umbra-web client', () => {
    expect(SETTINGS.client_id).toBe('umbra-web')
    expect(OIDC_CLIENT_ID).toBe('umbra-web')
  })

  it('has NO client_secret key (public PKCE client)', () => {
    expect('client_secret' in SETTINGS).toBe(false)
    expect((SETTINGS as unknown as Record<string, unknown>).client_secret).toBeUndefined()
  })

  it('requests the openid + daml_ledger_api scopes and lands on /callback', () => {
    expect(SETTINGS.scope).toBe('openid daml_ledger_api')
    expect(SETTINGS.redirect_uri).toBe('http://localhost:5173/callback')
  })
})

describe('oidc — dual-mode dev-token fallback (VITE_OIDC_AUTHORITY unset)', () => {
  it('reports OIDC disabled in the test env', () => {
    expect(oidcEnabled()).toBe(false)
  })

  it('getAccessToken returns exactly what tokens.json holds — which is now NOTHING', async () => {
    const tokens = tokensJson as Record<string, { token?: string }>
    const bankA = await getAccessToken('bankA')
    expect(bankA).toBe(tokens.bankA.token ?? '')
    // DEPLOY INVARIANT (this assertion is the point): tokens.json is token-free, so the dev
    // fallback yields ''. The ledger bearer now lives in the solver and is injected
    // server-side by its ledger proxy, never bundled into the client JS. If someone
    // reintroduces a token into tokens.json — the exact regression that would leak a
    // credential into a public deploy — this line fails loudly.
    expect(bankA).toBe('')
    expect(bankA.split('.')).not.toHaveLength(3) // not a JWT: there is no JWT here
  })
})

describe('oidc — the module bundle carries NO client secret (T-secret-less-public-client)', () => {
  // Strip block + line comments so prose that MENTIONS the word never trips the scan
  // (the honesty comments deliberately explain WHY there is no secret).
  const code = oidcSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('has no client_secret key in the actual code', () => {
    expect(code).not.toContain('client_secret')
  })

  it('has no "secret" string anywhere in the actual code', () => {
    expect(code.toLowerCase()).not.toContain('secret')
  })
})
