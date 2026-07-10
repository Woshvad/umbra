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

  it('getAccessToken returns the pre-minted dev token from tokens.json (dev path unchanged)', async () => {
    const tokens = tokensJson as Record<string, { token: string }>
    const bankA = await getAccessToken('bankA')
    expect(bankA).toBe(tokens.bankA.token)
    // A dev desk token is a non-empty JWT string (three dot-separated segments).
    expect(bankA.split('.')).toHaveLength(3)
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
