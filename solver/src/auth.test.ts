// solver/src/auth.test.ts — the OIDC dual-mode (DevNet/prod) credential proof, fully
// OFFLINE against a MOCKED issuer. No real Keycloak, no network: a `jose` RS256 keypair
// mints tokens, a stubbed global `fetch` serves both the JWKS endpoint (the public key)
// and the `/token` endpoint (a signed access_token). Live token exchange against a booted
// Keycloak + a Canton participant configured for the issuer is UAT (RESEARCH Pattern 3).
//
// Proven here:
//   • acquireToken() POSTs grant_type=client_credentials and returns the access_token.
//   • verifyToken() ACCEPTS a correct-audience RS256 token.
//   • verifyToken() REJECTS a wrong-audience token, a token signed by a DIFFERENT key,
//     and an expired token (three distinct rejection axes).
//   • The OIDC_CLIENT_SECRET never appears in a thrown error or a log line (secret-sweep).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

// jose v6 dropped the `KeyLike` alias — infer the key types from generateKeyPair's result.
type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>
type PrivKey = KeyPair['privateKey']

// ── Mocked issuer config (set BEFORE importing auth.ts; auth reads env lazily) ────
const OIDC_ISSUER = 'https://keycloak.test/realms/umbra'
const OIDC_JWKS_URL = 'https://keycloak.test/realms/umbra/protocol/openid-connect/certs'
const OIDC_CLIENT_ID = 'umbra-solver'
// A sentinel confidential secret — MUST NEVER appear in a thrown error or a log line.
const SENTINEL_CLIENT_SECRET = 'SENTINEL-CLIENT-SECRET-do-not-leak-4a91cf'
const AUDIENCE = 'https://canton.network.global'
const KID = 'umbra-test-key-1'

process.env.OIDC_ISSUER = OIDC_ISSUER
process.env.OIDC_JWKS_URL = OIDC_JWKS_URL
process.env.OIDC_CLIENT_ID = OIDC_CLIENT_ID
process.env.OIDC_CLIENT_SECRET = SENTINEL_CLIENT_SECRET

// Import auth AFTER the env is populated.
const auth = await import('./auth.js')

// ── The correct signing keypair + its published JWKS (the issuer's key) ───────────
let correct: KeyPair
// A SECOND, unrelated keypair — its tokens are NOT in the JWKS (wrong-key rejection).
let wrong: KeyPair
let jwksBody: { keys: unknown[] }

const captured: { tokenBodies: string[] } = { tokenBodies: [] }

// Sign an RS256 token with a given private key + claims, using KID so the JWKS selects it.
const signToken = (
  key: PrivKey,
  { aud = AUDIENCE, iss = OIDC_ISSUER, expired = false }: { aud?: string; iss?: string; expired?: boolean } = {},
): Promise<string> => {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(OIDC_CLIENT_ID)
    .setIssuer(iss) // MED-03: verifyToken now pins `iss` to OIDC_ISSUER
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expired ? '-5m' : '5m')
  return jwt.sign(key)
}

// A fetch stub serving the JWKS endpoint + the token endpoint. `accessToken` is what the
// token endpoint returns; `tokenOk` toggles a non-2xx token response (the failure sweep).
const stubFetch = (accessToken: string | null, tokenOk = true) =>
  vi.fn(async (url: unknown, init?: any) => {
    const u = String(url)
    if (u.endsWith('/certs')) {
      return { ok: true, status: 200, json: async () => jwksBody } as unknown as Response
    }
    if (u.endsWith('/protocol/openid-connect/token')) {
      captured.tokenBodies.push(String(init?.body ?? ''))
      if (!tokenOk) return { ok: false, status: 401, json: async () => ({}) } as unknown as Response
      return { ok: true, status: 200, json: async () => ({ access_token: accessToken }) } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  })

beforeEach(async () => {
  if (!correct) {
    correct = await generateKeyPair('RS256', { extractable: true })
    wrong = await generateKeyPair('RS256', { extractable: true })
    const jwk = await exportJWK(correct.publicKey)
    jwksBody = { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }
  }
  captured.tokenBodies = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth.acquireToken (client-credentials, mocked /token)', () => {
  it('POSTs grant_type=client_credentials and returns the minted access_token', async () => {
    const minted = await signToken(correct.privateKey)
    vi.stubGlobal('fetch', stubFetch(minted))

    const token = await auth.acquireToken()

    expect(token).toBe(minted)
    // The request body carried the client-credentials grant + the client id.
    const body = captured.tokenBodies[0]
    expect(body).toContain('grant_type=client_credentials')
    expect(body).toContain(`client_id=${OIDC_CLIENT_ID}`)
    expect(body).toContain('scope=daml_ledger_api')
  })
})

describe('auth.verifyToken (RS256 JWKS verify, mocked JWKS)', () => {
  it('ACCEPTS a correct-audience token signed by the issuer key', async () => {
    const good = await signToken(correct.privateKey)
    vi.stubGlobal('fetch', stubFetch(good))

    const { payload } = await auth.verifyToken(good)

    expect(payload.aud).toBe(AUDIENCE)
    expect(payload.sub).toBe(OIDC_CLIENT_ID)
  })

  it('REJECTS a WRONG-AUDIENCE token', async () => {
    const badAud = await signToken(correct.privateKey, { aud: 'https://evil.example' })
    vi.stubGlobal('fetch', stubFetch(badAud))

    await expect(auth.verifyToken(badAud)).rejects.toThrow()
  })

  it('REJECTS a token signed by a DIFFERENT key (not in the JWKS)', async () => {
    const forged = await signToken(wrong.privateKey) // correct kid, wrong key → sig fails
    vi.stubGlobal('fetch', stubFetch(forged))

    await expect(auth.verifyToken(forged)).rejects.toThrow()
  })

  it('REJECTS an EXPIRED token', async () => {
    const stale = await signToken(correct.privateKey, { expired: true })
    vi.stubGlobal('fetch', stubFetch(stale))

    await expect(auth.verifyToken(stale)).rejects.toThrow()
  })

  it('REJECTS a WRONG-ISSUER token (MED-03 — iss pinned to OIDC_ISSUER)', async () => {
    // Correct key + audience, but minted by a DIFFERENT issuer sharing the JWKS.
    const badIss = await signToken(correct.privateKey, { iss: 'https://evil-issuer.example/realms/umbra' })
    vi.stubGlobal('fetch', stubFetch(badIss))

    await expect(auth.verifyToken(badIss)).rejects.toThrow()
  })
})

describe('auth — the OIDC client secret never leaks (secret-sweep)', () => {
  it('a failed token acquisition throws a secret-free error and logs nothing with the secret', async () => {
    vi.stubGlobal('fetch', stubFetch(null, false)) // token endpoint returns 401
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let caught: unknown
    try {
      await auth.acquireToken()
    } catch (e) {
      caught = e
    }

    // It threw (401), but the message NEVER contains the confidential secret.
    expect(caught).toBeInstanceOf(Error)
    expect(String((caught as Error).message)).not.toContain(SENTINEL_CLIENT_SECRET)
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls, ...warnSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(SENTINEL_CLIENT_SECRET)
    }

    logSpy.mockRestore()
    errSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
