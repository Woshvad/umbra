#!/usr/bin/env node
// Mint an unsafe-dev HS256 JWT for the Canton LocalNet JSON Ledger API v2.
//
// The cn-quickstart LocalNet runs the participant ledger API in
// `unsafe-jwt-hmac-256` mode (conf/canton/*/app-auth.conf): it accepts an
// AUDIENCE-BASED token — `{ sub, aud }` signed HS256 with the shared dev secret
// `unsafe`, audience `https://canton.network.global`. `sub` is a Canton user id;
// the party rights (actAs/readAs) come from that user's granted rights, NOT from
// claims in the token. So a token alone proves identity; the user must exist with
// the rights it needs (see localnet-deploy.mjs).
//
// Usage:  node mint-jwt.mjs <sub> [aud]
// Env override: LOCALNET_JWT_SECRET (default "unsafe"),
//               LOCALNET_JWT_AUD    (default "https://canton.network.global")
import { createHmac } from 'node:crypto'

export const LOCALNET_JWT_SECRET = process.env.LOCALNET_JWT_SECRET ?? 'unsafe'
export const LOCALNET_JWT_AUD = process.env.LOCALNET_JWT_AUD ?? 'https://canton.network.global'

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

// Mint an audience-based dev token for Canton user `sub`.
export const mintJwt = (sub, aud = LOCALNET_JWT_AUD, secret = LOCALNET_JWT_SECRET) => {
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const payload = b64url({ sub, aud })
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

// CLI entrypoint: `node mint-jwt.mjs <sub> [aud]` → prints the token (no newline).
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
if (isMain || process.argv[1]?.endsWith('mint-jwt.mjs')) {
  const sub = process.argv[2]
  const aud = process.argv[3] ?? LOCALNET_JWT_AUD
  if (!sub) {
    process.stderr.write('usage: node mint-jwt.mjs <sub> [aud]\n')
    process.exit(1)
  }
  process.stdout.write(mintJwt(sub, aud))
}
