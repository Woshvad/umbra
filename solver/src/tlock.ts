// solver/src/tlock.ts — CRYP-02 timelock seal/open against drand quicknet.
//
// This is the "even the venue can't open it early" guarantee. A payload sealed to a
// FUTURE drand round is UNDECRYPTABLE — by anyone, including the operator/solver that
// holds the ciphertext — until that round's threshold beacon publishes. This is REAL
// cryptography (drand League-of-Entropy quicknet, RFC9380 unchained scheme via
// tlock-js), NOT an app-level "we promise not to peek". `timelockOpen` on a not-yet-due
// ciphertext throws an error whose message contains "too early" (the beacon literally
// does not exist yet); after the beacon, it decrypts to the EXACT original payload.
//
// FALLBACK (threat T-10-09, disposition ACCEPT): when quicknet is unreachable, we drop
// to a LOCAL held-key seal so the demo stays runnable. This path is materially WEAKER —
// there is NO threshold guarantee; a single server-held key gates it. It is therefore
// flagged `mode: 'offline'` + the `OFFLINE_FALLBACK_LABEL` warning on every result, and
// callers/UI MUST surface that label. It is a liveness backstop, never the security claim.
//
// SECURITY (threat T-10-08, mirrors proof.ts / ledger.ts): the offline-fallback key is
// module-private (`node:crypto` randomBytes, AES-256-GCM). It is NEVER exported, NEVER
// returned by any function, and NEVER logged. The drand primary path holds no long-term
// secret at all (the beacon is public). Only ciphertext + public round metadata ever
// cross out of this module.
//
// INTEROP: tlock-js is CommonJS; the solver is ESM. All of
// timelockEncrypt/timelockDecrypt/roundAt/roundTime/mainnetClient/ChainClient are named
// exports of the CJS module (enumerable) so named ESM imports resolve under vitest/tsx.
// `defaultChainOptions` is NOT exported — use `mainnetClient()` (preconfigured quicknet).

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import {
  timelockEncrypt,
  timelockDecrypt,
  roundAt,
  roundTime,
  mainnetClient,
  HttpChainClient,
  HttpCachingChain,
  type ChainClient,
} from 'tlock-js'

// ── drand quicknet config (env-overridable, mirrors ledger.ts PARTICIPANT resolution) ──
// Quicknet: period 3s, genesis 1692803367, scheme bls-unchained-g1-rfc9380. `mainnetClient()`
// is preconfigured to exactly this chain, so it is the default; a custom DRAND_URL/HASH
// builds an HttpCachingChain over `<url>/<hash>`.
const QUICKNET_CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
const DRAND_URL = (process.env.DRAND_URL ?? 'https://api.drand.sh').replace(/\/+$/, '')
const DRAND_CHAIN_HASH = process.env.DRAND_CHAIN_HASH ?? QUICKNET_CHAIN_HASH

// A small safety margin (one beacon period) added to the window so the target round lands
// just AFTER the window closes — never briefly decryptable at close (Pitfall 6: clock skew).
const SAFETY_MARGIN_MS = 3_000

// The honest, load-bearing label every offline result carries (threat T-10-09).
export const OFFLINE_FALLBACK_LABEL = 'OFFLINE FALLBACK · WEAKER THAN DRAND'

// Marker prefix distinguishing an offline held-key ciphertext from a drand AGE-armored one
// (which begins `-----BEGIN AGE ENCRYPTED FILE-----`). timelockOpen routes on this.
const OFFLINE_PREFIX = 'UMBRA-OFFLINE-v1:'

export type SealMode = 'drand' | 'offline'

export interface SealResult {
  ciphertext: string
  targetRound: number
  mode: SealMode
  // Present ONLY when mode === 'offline' — the required weaker-than-drand disclosure.
  warning?: string
}

export interface DrandRoundInfo {
  targetRound: number
  timeToBeaconMs: number
  chainHash: string
}

// Test seam only: inject a ChainClient (e.g. a locally-signed chain) for deterministic CI.
// Production callers omit it and get the live quicknet client.
export interface TlockOptions {
  client?: ChainClient
}

// ── The offline held key — MODULE-PRIVATE. Never exported / returned / logged. ──────────
// A fresh 256-bit key per process, released only at close via offlineOpen below.
const _offlineKey = randomBytes(32)

// AES-256-GCM seal → `UMBRA-OFFLINE-v1:` + base64(iv | tag | ciphertext). The iv/tag are
// public; only `_offlineKey` is secret and it stays in this module.
const offlineSeal = (payload: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', _offlineKey, iv)
  const body = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return OFFLINE_PREFIX + Buffer.concat([iv, tag, body]).toString('base64')
}

const offlineOpen = (ciphertext: string): string => {
  const raw = Buffer.from(ciphertext.slice(OFFLINE_PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const body = raw.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', _offlineKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}

// Resolve the live drand client: the preconfigured quicknet client for the default chain,
// or an HttpCachingChain over a custom DRAND_URL/DRAND_CHAIN_HASH.
const defaultClient = (): ChainClient =>
  DRAND_CHAIN_HASH === QUICKNET_CHAIN_HASH
    ? mainnetClient()
    : new HttpChainClient(new HttpCachingChain(`${DRAND_URL}/${DRAND_CHAIN_HASH}`))

// ── timelockSeal ────────────────────────────────────────────────────────────────────────
// Seal `payload` so it is undecryptable until ~`windowMs` from now. Primary path binds the
// ciphertext to `roundAt(now + windowMs + margin)` on quicknet. On ANY client/network throw
// we fall back to the labeled weaker offline held-key seal (mode: 'offline').
export const timelockSeal = async (
  payload: string,
  windowMs: number,
  opts?: TlockOptions,
): Promise<SealResult> => {
  const client = opts?.client ?? defaultClient()
  try {
    const info = await client.chain().info()
    const targetRound = roundAt(Date.now() + windowMs + SAFETY_MARGIN_MS, info)
    const ciphertext = await timelockEncrypt(targetRound, Buffer.from(payload, 'utf8'), client)
    return { ciphertext, targetRound, mode: 'drand' }
  } catch {
    // quicknet unreachable → liveness backstop. WEAKER: single server-held key, no threshold.
    return {
      ciphertext: offlineSeal(payload),
      targetRound: 0,
      mode: 'offline',
      warning: OFFLINE_FALLBACK_LABEL,
    }
  }
}

// ── timelockOpen ────────────────────────────────────────────────────────────────────────
// Recover the plaintext. Offline ciphertexts open via the module-private held key. drand
// ciphertexts open via timelockDecrypt — which THROWS an error containing "too early" when
// the target beacon has not published yet (the cryptographic early-decrypt block).
export const timelockOpen = async (ciphertext: string, opts?: TlockOptions): Promise<string> => {
  if (ciphertext.startsWith(OFFLINE_PREFIX)) return offlineOpen(ciphertext)
  const client = opts?.client ?? defaultClient()
  const plaintext = await timelockDecrypt(ciphertext, client)
  return plaintext.toString('utf8')
}

// ── drandRoundInfo ──────────────────────────────────────────────────────────────────────
// Public round metadata for a given window, derived entirely from roundAt/roundTime (no
// manual round math): the target round, ms-until-its-beacon, and the chain hash.
export const drandRoundInfo = async (
  windowMs: number,
  opts?: TlockOptions,
): Promise<DrandRoundInfo> => {
  const client = opts?.client ?? defaultClient()
  const info = await client.chain().info()
  const targetRound = roundAt(Date.now() + windowMs, info)
  return {
    targetRound,
    timeToBeaconMs: roundTime(info, targetRound) - Date.now(),
    chainHash: info.hash,
  }
}
