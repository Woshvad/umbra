// web/src/lib/solverUrls.test.ts — pure unit proof for the WOW-04/WOW-05 URL builders.
// Asserts rationaleStreamUrl (SSE) + proofPackUrl (PDF download) are composed off the
// single SOLVER_BASE_URL source of truth (08-01) — NEVER a duplicated `:4000` port
// literal — and hit the exact solver routes. No DOM, no network: these are pure string
// builders (EventSource / <a download> consume the result elsewhere).
import { describe, it, expect } from 'vitest'
import { rationaleStreamUrl, proofPackUrl, SOLVER_BASE_URL } from '../solver'

const ID = 'R1'

describe('solverUrls — rationaleStreamUrl (WOW-04 SSE)', () => {
  it('builds ${SOLVER_BASE_URL}/round/<id>/rationale-stream', () => {
    expect(rationaleStreamUrl(ID)).toBe(`${SOLVER_BASE_URL}/round/${ID}/rationale-stream`)
  })

  it('is rooted at SOLVER_BASE_URL (no duplicated host/port)', () => {
    expect(rationaleStreamUrl(ID).startsWith(SOLVER_BASE_URL)).toBe(true)
  })

  it('carries no :4000 port literal (the killed drift, 08-01)', () => {
    expect(rationaleStreamUrl(ID)).not.toContain(':4000')
  })

  it('interpolates the round id into the path', () => {
    expect(rationaleStreamUrl('ROUND-XYZ')).toContain('/round/ROUND-XYZ/rationale-stream')
  })
})

describe('solverUrls — proofPackUrl (WOW-05 PDF download)', () => {
  it('builds ${SOLVER_BASE_URL}/round/<id>/proof-pack.pdf', () => {
    expect(proofPackUrl(ID)).toBe(`${SOLVER_BASE_URL}/round/${ID}/proof-pack.pdf`)
  })

  it('is rooted at SOLVER_BASE_URL (no duplicated host/port)', () => {
    expect(proofPackUrl(ID).startsWith(SOLVER_BASE_URL)).toBe(true)
  })

  it('carries no :4000 port literal (the killed drift, 08-01)', () => {
    expect(proofPackUrl(ID)).not.toContain(':4000')
  })

  it('ends at the .pdf route so <a download> saves a PDF', () => {
    expect(proofPackUrl(ID).endsWith('/proof-pack.pdf')).toBe(true)
  })
})

describe('solverUrls — no credential in either URL', () => {
  it('neither builder embeds a bearer/token/key query param', () => {
    for (const url of [rationaleStreamUrl(ID), proofPackUrl(ID)]) {
      expect(url.toLowerCase()).not.toContain('bearer')
      expect(url.toLowerCase()).not.toContain('token')
      expect(url.toLowerCase()).not.toContain('key')
    }
  })
})
