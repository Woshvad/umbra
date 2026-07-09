import { describe, it, expect } from 'vitest'
import { bls12_381 as bls } from '@noble/curves/bls12-381'
import { sha256 } from '@noble/hashes/sha256'
import type { ChainClient } from 'tlock-js'
import {
  timelockSeal,
  timelockOpen,
  drandRoundInfo,
  OFFLINE_FALLBACK_LABEL,
} from './tlock.js'
import * as tlockModule from './tlock.js'

// CRYP-02 — REAL drand timelock, tested DETERMINISTICALLY (no live quicknet in CI).
//
// The determinism trick (per the plan: "a MOCKED beacon for determinism"): we stand up a
// LOCAL drand chain — a BLS12-381 keypair we generate here — and SIGN the round beacons
// ourselves. This is genuine tlock IBE crypto composing exactly as it does against
// quicknet (same RFC9380 scheme, same hashToCurve DST, same beacon verification), only
// with a chain whose beacons we can produce on demand. Sealing to a PAST round of this
// chain means "the beacon already published" (post-beacon recovery); sealing to a FUTURE
// round means "the beacon does not exist yet" (the cryptographic early-decrypt block).
//
// The genuinely-future, real-time quicknet round-trip is an END-OF-PHASE human-verify —
// it depends on live network + wall-clock beacon timing and is intentionally NOT gated here.

const DST = 'BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_'
const G2 = bls.G2.ProjectivePoint

// A deterministic local drand chain (quicknet-compatible RFC9380 scheme). `genesisOffsetSec`
// places genesis in the past so early round numbers are already "due" and decryptable.
const localChain = (genesisOffsetSec = 1000): ChainClient => {
  const sk = 0x2691f0aa5c3e17b94d8e2f6c1a70b3d95e8471c206af39b8e0d4c7f21a635e8n
  const publicKey = G2.BASE.multiply(sk).toHex(true)
  const period = 3
  const info = {
    public_key: publicKey,
    period,
    genesis_time: Math.floor(Date.now() / 1000) - genesisOffsetSec,
    hash: 'ab'.repeat(32),
    groupHash: 'cd'.repeat(32),
    schemeID: 'bls-unchained-g1-rfc9380',
    metadata: { beaconID: 'umbra-localtest' },
  }
  const sign = (round: number): string => {
    const buf = Buffer.alloc(8)
    buf.writeBigUInt64BE(BigInt(round))
    // hashToCurve returns an H2CPoint whose runtime value is a G1 ProjectivePoint
    // (it has multiply/toHex); the static type omits them, so narrow it explicitly.
    const Hm = bls.G1.hashToCurve(sha256(buf), { DST }) as unknown as {
      multiply(s: bigint): { toHex(compressed: boolean): string }
    }
    return Hm.multiply(sk).toHex(true)
  }
  const beacon = (round: number) => {
    const signature = sign(round)
    return {
      round,
      signature,
      randomness: Buffer.from(sha256(Buffer.from(signature, 'hex'))).toString('hex'),
    }
  }
  return {
    options: { disableBeaconVerification: false },
    chain: () => ({ info: async () => info }),
    get: async (round: number) => beacon(round),
    latest: async () => beacon(1),
  } as unknown as ChainClient
}

// A client that models an unreachable quicknet: every access throws.
const unreachableChain = (): ChainClient =>
  ({
    options: { disableBeaconVerification: false },
    chain: () => ({
      info: async () => {
        throw new Error('quicknet unreachable (simulated network failure)')
      },
    }),
    get: async () => {
      throw new Error('quicknet unreachable (simulated network failure)')
    },
    latest: async () => {
      throw new Error('quicknet unreachable (simulated network failure)')
    },
  }) as unknown as ChainClient

const PAYLOAD = JSON.stringify({ desk: 'BankA', side: 'Buy', quantity: 10, limit: 100.0, salt: 'r1' })

describe('CRYP-02 tlock — real drand timelock (deterministic local chain)', () => {
  it('BLOCKS early decrypt with a "too early" error before the target beacon', async () => {
    const client = localChain()
    // Seal to a round ~60s in the FUTURE → its beacon does not exist yet.
    const sealed = await timelockSeal(PAYLOAD, 60_000, { client })
    expect(sealed.mode).toBe('drand')

    await expect(timelockOpen(sealed.ciphertext, { client })).rejects.toThrow(/too early/i)
  })

  it('recovers the EXACT payload after the beacon has published', async () => {
    const client = localChain()
    // Seal to a round well in the PAST of the local chain → beacon already published.
    const sealed = await timelockSeal(PAYLOAD, -500_000, { client })
    expect(sealed.mode).toBe('drand')
    expect(sealed.targetRound).toBeGreaterThan(0)

    const opened = await timelockOpen(sealed.ciphertext, { client })
    expect(opened).toBe(PAYLOAD)
  })

  it('falls back to a labeled WEAKER-THAN-DRAND offline seal when quicknet is unreachable, and still recovers', async () => {
    const client = unreachableChain()
    const sealed = await timelockSeal(PAYLOAD, 60_000, { client })

    // The fallback is explicitly flagged weaker — mode + the honest label.
    expect(sealed.mode).toBe('offline')
    expect(sealed.warning).toBe(OFFLINE_FALLBACK_LABEL)
    expect(sealed.warning).toMatch(/weaker than drand/i)

    // It still decrypts at close (via the module-private held key), even with no drand client.
    const opened = await timelockOpen(sealed.ciphertext)
    expect(opened).toBe(PAYLOAD)
  })

  it('drandRoundInfo reports the target round + chain hash from roundAt/roundTime', async () => {
    const client = localChain()
    const info = await drandRoundInfo(60_000, { client })
    expect(info.targetRound).toBeGreaterThan(0)
    expect(info.timeToBeaconMs).toBeGreaterThan(0) // a future window → beacon still ahead
    expect(info.chainHash).toBe('ab'.repeat(32))
  })

  it('SECRET-SWEEP: no key/salt appears in any result, thrown error, or module export', async () => {
    // 1. The offline result object carries ONLY public fields — never the held key.
    const offline = await timelockSeal(PAYLOAD, 60_000, { client: unreachableChain() })
    expect(Object.keys(offline).sort()).toEqual(['ciphertext', 'mode', 'targetRound', 'warning'])
    const offlineJson = JSON.stringify(offline)
    // No 64-hex-char run (a 32-byte AES key) anywhere in the serialized result.
    expect(offlineJson).not.toMatch(/[0-9a-f]{64}/i)

    // 2. The drand result object is equally clean.
    const drand = await timelockSeal(PAYLOAD, -500_000, { client: localChain() })
    expect(Object.keys(drand).sort()).toEqual(['ciphertext', 'mode', 'targetRound'])

    // 3. The "too early" error message leaks no secret — only the public round rejection.
    let earlyErr = ''
    try {
      await timelockOpen(
        (await timelockSeal(PAYLOAD, 60_000, { client: localChain() })).ciphertext,
        { client: localChain() },
      )
    } catch (e) {
      earlyErr = e instanceof Error ? e.message : String(e)
    }
    expect(earlyErr).toMatch(/too early/i)
    expect(earlyErr).not.toMatch(/[0-9a-f]{64}/i)

    // 4. The module exports NO key/salt/secret — neither by name nor as a raw Buffer/hex value.
    for (const [name, value] of Object.entries(tlockModule)) {
      expect(name).not.toMatch(/key|salt|secret/i)
      expect(Buffer.isBuffer(value)).toBe(false)
    }
  })
})
