// solver/src/payer-auth.ts — CR-01 payer authentication for the x402 `self` backend.
//
// The `self` operator-custody backend moves the fee under OPERATOR authority, so the fee source
// carries NO payer signature. To stop a forged, unauthenticated `from` from seizing a victim's
// Holding (CR-01), the gate must AUTHENTICATE the caller and bind the fee-payer to that verified
// identity. This REUSES the existing dev/OIDC party-token seam — NO new JWT dependency:
//
//   • dev LocalNet (default): the desk presents its unsafe-HS256 party token (the SAME token the
//     JSON API accepts — scripts/localnet/mint-jwt.mjs). We verify the HS256 signature with the
//     server-side dev secret (LOCALNET_JWT_SECRET, default `unsafe`) via node:crypto, then map the
//     token `sub` (a Canton user id, e.g. `umbra-bankA`) to its party through a boot-provided map.
//   • OIDC/DevNet: verify the RS256 token via auth.ts verifyToken (JWKS, pinned aud/iss).
//
// SECURITY: the dev secret / OIDC signing key live server-side ONLY. An attacker cannot mint the
// victim's token, so it cannot authenticate AS the victim — this closes the `from`-spoof. The
// subject→party map is PUBLIC identity data (party ids), never a secret. The token itself is
// never returned, echoed, or logged (only the resolved party id crosses out).
//
// HONEST UAT BOUNDARY: this authenticates the CALLER; it is NOT a payer-SIGNED on-ledger transfer.
// The payer-signed variant remains the canton-cc path (deferred to UAT — see 14-UAT.md).

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import type { PayerAuthenticator } from './x402.js'

// Decode a base64url JWT segment to JSON, or null on any malformation.
const decodeSegment = (seg: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

// Verify an unsafe-HS256 dev party token's signature and return its decoded payload, or null.
// Pins alg:HS256 so a forged `alg:none` / RS token cannot slip through (alg-confusion defense).
export const verifyDevPartyToken = (
  token: string,
  secret: string,
): { sub?: string } | null => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, pl, sig] = parts
  const header = decodeSegment(h)
  if (!header || header.alg !== 'HS256') return null
  const expected = createHmac('sha256', secret).update(`${h}.${pl}`).digest('base64url')
  const got = Buffer.from(sig)
  const want = Buffer.from(expected)
  // Constant-time compare; unequal lengths are an immediate reject (timingSafeEqual throws on those).
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  return decodeSegment(pl) as { sub?: string } | null
}

// Extract the raw bearer token from the request's Authorization header, or null.
const bearerOf = (req: Request): string | null => {
  const h = req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

export interface PayerAuthConfig {
  // Map a VERIFIED token subject (Canton user id) → its party (public identity data). Returns
  // null for an unknown subject (fail-closed — the caller is then rejected unauthorized_payer).
  subjectToParty: (sub: string) => string | null
  // dev HS256 secret (default 'unsafe'); used only on the dev LocalNet path.
  devSecret?: string
  // OIDC verify seam (auth.ts verifyToken). When provided, a token that fails the dev HS256 check
  // is verified as an RS256 JWKS token; its `sub` is then mapped the same way.
  verifyOidc?: (token: string) => Promise<{ payload: { sub?: unknown } }>
}

// Build the PayerAuthenticator the x402 `self` gate consumes. Returns the authenticated party or
// null (no bearer / bad signature / unknown subject) — the gate rejects null as unauthorized_payer.
export const createPayerAuthenticator = (cfg: PayerAuthConfig): PayerAuthenticator => {
  const devSecret = cfg.devSecret ?? 'unsafe'
  return async (req: Request): Promise<string | null> => {
    const token = bearerOf(req)
    if (!token) return null
    // Dev HS256 path first (cheap, no network).
    let sub = verifyDevPartyToken(token, devSecret)?.sub
    // OIDC RS256 fallback (verified via JWKS in auth.ts).
    if (!sub && cfg.verifyOidc) {
      try {
        const { payload } = await cfg.verifyOidc(token)
        sub = typeof payload?.sub === 'string' ? payload.sub : undefined
      } catch {
        return null
      }
    }
    if (!sub) return null
    return cfg.subjectToParty(sub) ?? null
  }
}
