// web/src/auth/oidc.ts — the DESK browser login half of the dual-mode auth (IDEN-01/02).
//
// DUAL-MODE, honestly labeled:
//   • VITE_OIDC_AUTHORITY SET   ⇒ real OIDC: each desk logs in via AUTH-CODE + PKCE
//     (oidc-client-ts UserManager) against Keycloak; the desk's access_token is the
//     bearer forwarded to the Canton JSON Ledger API v2.
//   • VITE_OIDC_AUTHORITY UNSET ⇒ dev LocalNet path (BYTE-UNCHANGED): the pre-minted
//     per-desk dev token from tokens.json is used, exactly as before Phase 12.
//
// PUBLIC CLIENT — NO SECRET (D6 / RESEARCH Anti-Pattern): `umbra-web` is a PUBLIC OIDC
// client. It uses PKCE (`response_type: 'code'`), which needs NO client secret. There is
// NO client_secret anywhere in this module or the shipped bundle — the confidential
// `umbra-solver` secret lives ONLY server-side in the solver's .env (see auth.ts). A
// co-located test greps this module's source to assert the secret string is ABSENT.
//
// The oidc-client-ts runtime is imported DYNAMICALLY (only when OIDC is enabled AND we
// are in a browser), so importing this module in a node/unit-test context never touches
// window/localStorage — the dev-fallback path is pure and offline-testable.

import type { UserManagerSettings, User, UserManager } from 'oidc-client-ts'
import type { DeskKey } from '../ledgerContexts'
import tokensJson from '../tokens.json'

type DeskToken = { party: string; token: string; base?: string }
const tokens = tokensJson as Record<DeskKey, DeskToken>

// The public OIDC client id (guide's `wallet-web-ui` analogue). PUBLIC — never a secret.
export const OIDC_CLIENT_ID = 'umbra-web'
// The ledger-API scopes the desk token must carry (openid + the Canton ledger scope).
export const OIDC_SCOPE = 'openid daml_ledger_api'

// The configured issuer authority (Keycloak realm URL). Unset ⇒ dev-token fallback.
export const oidcAuthority = (): string | undefined => import.meta.env.VITE_OIDC_AUTHORITY
export const oidcEnabled = (): boolean => Boolean(oidcAuthority())

// ── The PKCE UserManager settings (PURE — unit-testable without a browser) ────────
// response_type 'code' = auth-code + PKCE (oidc-client-ts adds the code_verifier/
// code_challenge automatically). There is deliberately NO `client_secret` key: a public
// PKCE client must never carry one. The redirect lands on the SPA's /callback route.
export const buildOidcSettings = (authority: string, origin: string): UserManagerSettings => ({
  authority,
  client_id: OIDC_CLIENT_ID, // PUBLIC — no secret
  redirect_uri: `${origin}/callback`,
  response_type: 'code', // auth-code + PKCE
  scope: OIDC_SCOPE,
})

// ── Lazily-constructed UserManager (browser-only; dynamic import) ─────────────────
// Constructed on first use so importing this module never loads the oidc-client-ts
// runtime (or touches window/localStorage) on the dev path or in unit tests.
let _um: UserManager | null = null
const getUserManager = async (): Promise<UserManager> => {
  const authority = oidcAuthority()
  if (!authority) throw new Error('OIDC is not enabled (VITE_OIDC_AUTHORITY unset)')
  if (typeof window === 'undefined') throw new Error('OIDC UserManager requires a browser context')
  if (_um) return _um
  const { UserManager } = await import('oidc-client-ts')
  _um = new UserManager(buildOidcSettings(authority, window.location.origin))
  return _um
}

// Kick off the auth-code redirect to Keycloak (browser). No-op-throws if OIDC disabled.
export const signinRedirect = async (): Promise<void> => {
  const um = await getUserManager()
  await um.signinRedirect()
}

// Complete the auth-code exchange after Keycloak redirects back to /callback (browser).
export const completeSignin = async (): Promise<User> => {
  const um = await getUserManager()
  return um.signinRedirectCallback()
}

// ── getAccessToken: the bearer a desk column forwards to the ledger (dual-mode) ────
// OIDC ⇒ the signed-in user's access_token (auth-code + PKCE). Dev ⇒ the pre-minted
// per-desk token from tokens.json (byte-unchanged). Returns '' when OIDC is enabled but
// the desk has not completed login yet (the caller routes to signinRedirect()).
export const getAccessToken = async (desk: DeskKey): Promise<string> => {
  if (!oidcEnabled()) {
    // Dev LocalNet path — the pre-minted desk token (unchanged since Phase 11).
    return tokens[desk]?.token ?? ''
  }
  const um = await getUserManager()
  const user = await um.getUser()
  return user?.access_token ?? ''
}
