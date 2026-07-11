// solver/src/payer-auth.test.ts — CR-01 payer-authentication seam, OFFLINE.
//
// Proves the load-bearing security property behind the CR-01 fix: an attacker WITHOUT the
// server-side signing secret cannot mint a token that authenticates as any party, so it cannot
// spoof a victim's `from` to seize the victim's Holding. Also proves the alg-confusion defense
// and the fail-closed behavior (no bearer / unknown subject → null → the gate rejects).

import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import type { Request } from 'express'
import { verifyDevPartyToken, createPayerAuthenticator } from './payer-auth.js'

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url')

// Mint an unsafe-HS256 dev party token (matches scripts/localnet/mint-jwt.mjs).
const mintDev = (sub: string, secret: string): string => {
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({ sub, aud: 'https://canton.network.global' })
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

const reqWith = (auth?: string): Request =>
  ({ header: (n: string) => (n.toLowerCase() === 'authorization' ? auth : undefined) }) as unknown as Request

describe('payer-auth (CR-01)', () => {
  it('verifies a correctly-signed dev token and extracts sub', () => {
    expect(verifyDevPartyToken(mintDev('umbra-bankA', 'unsafe'), 'unsafe')?.sub).toBe('umbra-bankA')
  })

  it('REJECTS a token signed with the wrong secret (an attacker cannot forge the victim identity)', () => {
    expect(verifyDevPartyToken(mintDev('umbra-bankA', 'attacker-secret'), 'unsafe')).toBeNull()
  })

  it('REJECTS an alg:none downgrade (alg-confusion defense)', () => {
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'umbra-bankA' })}.`
    expect(verifyDevPartyToken(none, 'unsafe')).toBeNull()
  })

  it('authenticator maps a verified subject to its party', async () => {
    const auth = createPayerAuthenticator({
      subjectToParty: (s) => (s === 'umbra-bankA' ? 'BankA::party' : null),
      devSecret: 'unsafe',
    })
    expect(await auth(reqWith(`Bearer ${mintDev('umbra-bankA', 'unsafe')}`))).toBe('BankA::party')
  })

  it('authenticator returns null for a forged token (fail-closed)', async () => {
    const auth = createPayerAuthenticator({ subjectToParty: () => 'BankA::party', devSecret: 'unsafe' })
    expect(await auth(reqWith(`Bearer ${mintDev('umbra-bankA', 'wrong')}`))).toBeNull()
  })

  it('authenticator returns null when no bearer is present (fail-closed)', async () => {
    const auth = createPayerAuthenticator({ subjectToParty: () => 'BankA::party' })
    expect(await auth(reqWith(undefined))).toBeNull()
  })

  it('authenticator returns null for a verified token whose subject is unmapped (fail-closed)', async () => {
    const auth = createPayerAuthenticator({ subjectToParty: () => null, devSecret: 'unsafe' })
    expect(await auth(reqWith(`Bearer ${mintDev('umbra-unknown', 'unsafe')}`))).toBeNull()
  })
})
