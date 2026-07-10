// solver/src/auth.ts — the OIDC (DevNet/prod) half of the dual-mode credential seam.
//
// IDEN-01/02. The LocalNet dev loop stays on the unsafe-HMAC path (scripts/.operator-
// token, HS256 secret `unsafe`, resolved in ledger.ts and BYTE-UNCHANGED). This module
// is the additive DevNet/prod path: acquire an RS256 access token from a real OIDC issuer
// (Keycloak) via **client-credentials**, and verify RS256 tokens via **JWKS**.
//
// KEY INSIGHT (dual-mode is trivial): the switch from unsafe-HMAC to real OIDC changes
// only the SIGNING ALGORITHM (HS256/`unsafe` → RS256/JWKS) and the KEY SOURCE — NOT the
// token audience. Both paths use `aud: https://canton.network.global` (mint-jwt.mjs D9 +
// the official Keycloak-for-Canton Audience mapper). So the participant's user-rights
// model is unchanged; only where the token comes from and how it is verified differ.
//
// SECURITY (SOLV-04 discipline, mirrors ledger.ts `_operatorToken`): `OIDC_CLIENT_SECRET`
// is read once at module scope, held module-private, and is NEVER returned by an exported
// function, NEVER spread into a response, and NEVER logged. Only the access token (a
// short-lived bearer) crosses out of `acquireToken`, and `verifyToken` returns only the
// verified JWT payload — never the secret. `.env` is gitignored (D6); the secret never
// reaches the browser (the web client is a secret-less public PKCE client).
//
// VERIFY PINNING: `jwtVerify` is pinned to RS256 (algorithms: ['RS256']) to defeat an
// alg-confusion downgrade (e.g. a forged `alg: none` / HS256 token). The audience is
// asserted to the Canton ledger-API audience. The participant is the authoritative
// gatekeeper; this solver-side verify is defense-in-depth + offline-testable.

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose'

// The Canton ledger-API audience — IDENTICAL across the dev HMAC token and the OIDC
// token (the load-bearing fact that makes dual-mode a pure key-source swap).
export const CANTON_AUDIENCE = 'https://canton.network.global'

// ── OIDC env (module-private; the secret NEVER leaves this module) ────────────────
// Read lazily inside the functions (not frozen at import) so a test can set process.env
// before invoking, and so importing this module never forces the OIDC vars to exist on
// the dev path (ledger.ts only calls acquireToken when OIDC_ISSUER is set).
const oidcIssuer = (): string => requireEnv('OIDC_ISSUER')
const oidcClientId = (): string => requireEnv('OIDC_CLIENT_ID')
// The confidential client secret — resolved only inside acquireToken's request body,
// never returned, never logged, never interpolated into an error message.
const oidcClientSecret = (): string => requireEnv('OIDC_CLIENT_SECRET')
const oidcJwksUrl = (): string => requireEnv('OIDC_JWKS_URL')

const requireEnv = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`OIDC not configured: ${name} is unset`)
  return v
}

// ── JWKS set (cached remote key set; jose handles kid selection + key rotation) ───
// Lazily constructed so importing this module does not require OIDC_JWKS_URL on the dev
// path. Memoized per JWKS URL so repeated verifies reuse the cached keys.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let _jwksUrl: string | null = null
const jwks = (): ReturnType<typeof createRemoteJWKSet> => {
  const url = oidcJwksUrl()
  if (!_jwks || _jwksUrl !== url) {
    _jwks = createRemoteJWKSet(new URL(url))
    _jwksUrl = url
  }
  return _jwks
}

// ── acquireToken: client-credentials form-POST → the RS256 access token ───────────
// Machine-to-machine (umbra-solver confidential client). POSTs the standard
// `grant_type=client_credentials` form to the issuer's token endpoint and returns ONLY
// the access_token string. The client_secret is placed in the request BODY (never a
// header we log, never echoed); a non-2xx throws a SECRET-FREE error (status only — the
// response text could contain internals, so it is NOT interpolated).
export const acquireToken = async (): Promise<string> => {
  const res = await fetch(`${oidcIssuer()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: oidcClientId(),
      client_secret: oidcClientSecret(), // server-side ONLY; never returned/logged
      scope: 'daml_ledger_api',
    }),
  })
  if (!res.ok) {
    // Secret-free: the client_secret is in the request body we just sent, NOT in this
    // error; we deliberately do not echo the response body (could carry internals).
    throw new Error(`OIDC token endpoint HTTP ${res.status}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) {
    throw new Error('OIDC token response missing access_token')
  }
  return json.access_token
}

// ── verifyToken: RS256 JWKS verification pinned to the Canton audience ─────────────
// Defense-in-depth (the participant is the authoritative verifier). Pinned to RS256 to
// defeat alg-confusion; the audience is asserted to CANTON_AUDIENCE. Returns the verified
// result (payload only — never the secret). Rejects (throws) on a bad signature / wrong
// audience / wrong key / expired token — jose raises a typed JWT error in every case.
export const verifyToken = (token: string): Promise<JWTVerifyResult<JWTPayload>> =>
  jwtVerify(token, jwks(), {
    algorithms: ['RS256'], // pin — reject HS256/none downgrade (alg confusion)
    audience: CANTON_AUDIENCE,
    issuer: oidcIssuer(), // pin `iss` to OIDC_ISSUER (MED-03 — defense-in-depth vs a
    // same-audience token from another issuer sharing a JWKS/key set)
  })
