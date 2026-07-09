// web/src/lib/cryptoUrls.test.ts — pure proof for the Phase-10 crypto operator-plane client
// (CRYP-02 / CRYP-03 / VIZ-02). Two guarantees, no live solver:
//   1. Every client fn targets the EXACT solver route off the single SOLVER_BASE_URL source
//      (08-01) — NEVER a duplicated `:4000` port literal — with the right HTTP method + a
//      credential-free header set (no Authorization / bearer). Asserted via a stubbed `fetch`
//      that captures the URL + init (no network, no DOM).
//   2. The module SOURCE carries no credential: no operator token, no ANTHROPIC_API_KEY, no
//      bearer/Authorization header — a static (comment-stripped) grep so a future edit that
//      leaks a secret into the bundle fails CI. This is the T-10-21 mitigation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Raw module source (Vite `?raw`, typed by vite/client) — for the static credential scan below.
// Avoids node:fs so the app `tsc --noEmit` build (no @types/node) stays clean.
import solverSource from '../solver?raw'
import {
  SOLVER_BASE_URL,
  timelockEncrypt,
  timelockDecrypt,
  generateProof,
  verifyProof,
  anchorProof,
  tamperProof,
  getStageOffsets,
  type ProofEnvelope,
} from '../solver'

const ID = 'R1'
const ENVELOPE: ProofEnvelope = { vkey: {}, publicSignals: ['100', '10'], proof: {} }

// ── stubbed fetch: captures (url, init), returns an ok empty-JSON Response-like ───
type FetchArgs = { url: string; init: RequestInit | undefined }
let calls: FetchArgs[] = []

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cryptoUrls — every Phase-10 client fn targets the exact route off SOLVER_BASE_URL', () => {
  it('timelockEncrypt → POST /round/:id/timelock-encrypt', async () => {
    await timelockEncrypt(ID, 'payload', 30_000)
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/round/${ID}/timelock-encrypt`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('timelockDecrypt → POST /timelock-decrypt (round-agnostic)', async () => {
    await timelockDecrypt('CIPHERTEXT')
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/timelock-decrypt`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('generateProof → POST /round/:id/prove', async () => {
    await generateProof(ID)
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/round/${ID}/prove`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('verifyProof → POST /round/:id/verify-proof', async () => {
    await verifyProof(ID, ENVELOPE)
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/round/${ID}/verify-proof`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('anchorProof → POST /round/:id/anchor-proof', async () => {
    await anchorProof(ID, ENVELOPE)
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/round/${ID}/anchor-proof`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('tamperProof → POST /round/:id/tamper-proof', async () => {
    await tamperProof(ID)
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/round/${ID}/tamper-proof`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('getStageOffsets → GET /round/:id/stage-offsets (no method override)', async () => {
    await getStageOffsets(ID)
    expect(calls[0].url).toBe(`${SOLVER_BASE_URL}/round/${ID}/stage-offsets`)
    // A GET carries no method override (call<T> defaults to GET).
    expect(calls[0].init?.method).toBeUndefined()
  })

  it('interpolates the round id into every round-scoped path', async () => {
    await generateProof('ROUND-XYZ')
    expect(calls[0].url).toContain('/round/ROUND-XYZ/prove')
  })
})

describe('cryptoUrls — no :4000 drift on any constructed URL (08-01)', () => {
  it('no client fn ever builds a URL carrying the killed :4000 port literal', async () => {
    await timelockEncrypt(ID, 'p')
    await timelockDecrypt('c')
    await generateProof(ID)
    await verifyProof(ID, ENVELOPE)
    await anchorProof(ID, ENVELOPE)
    await tamperProof(ID)
    await getStageOffsets(ID)
    expect(calls).toHaveLength(7)
    for (const { url } of calls) {
      expect(url).not.toContain(':4000')
      expect(url.startsWith(SOLVER_BASE_URL)).toBe(true)
    }
  })
})

describe('cryptoUrls — no credential ever leaves the bundle (T-10-21)', () => {
  it('carries no Authorization / bearer header on any request', async () => {
    await timelockEncrypt(ID, 'p')
    await verifyProof(ID, ENVELOPE)
    await getStageOffsets(ID)
    for (const { init } of calls) {
      const headerText = JSON.stringify(init?.headers ?? {}).toLowerCase()
      expect(headerText).not.toContain('authorization')
      expect(headerText).not.toContain('bearer')
    }
  })

  it('the solver.ts source embeds no operator token / Anthropic key / auth header', () => {
    // Strip comments from the module source so the prose ("no :4000", "ANTHROPIC_API_KEY")
    // never false-positives — we assert on the CODE only.
    const code = solverSource
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('//')) // full-line // comments
      .join('\n')

    // No credential literal is baked into the shipped operator-plane client.
    expect(code).not.toContain(':4000') // the killed port drift (08-01)
    expect(code).not.toContain('ANTHROPIC_API_KEY')
    expect(code.toLowerCase()).not.toContain('authorization')
    expect(code.toLowerCase()).not.toContain('bearer')
    expect(code.toLowerCase()).not.toContain('sk-ant') // real Anthropic key prefix
    expect(code.toLowerCase()).not.toMatch(/operator[-_]?token/)

    // Positive: every Phase-10 route literal is present (the client actually wires them).
    for (const path of [
      '/timelock-encrypt',
      '/timelock-decrypt',
      '/prove',
      '/verify-proof',
      '/anchor-proof',
      '/tamper-proof',
      '/stage-offsets',
    ]) {
      expect(code).toContain(path)
    }
  })
})
