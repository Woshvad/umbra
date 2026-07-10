import { describe, it, expect } from 'vitest'
import { buildJoinPayload } from './qrPayload'

describe('buildJoinPayload', () => {
  it('encodes the /join URL + roundId as a ?round= query', () => {
    const p = buildJoinPayload('https://umbra.example', 'R1')
    expect(p).toBe('https://umbra.example/join?round=R1')
    expect(p).toContain('/join')
    expect(p).toContain('R1')
  })

  it('trims a trailing slash on the origin (never //join)', () => {
    expect(buildJoinPayload('https://umbra.example/', 'R7')).toBe(
      'https://umbra.example/join?round=R7',
    )
  })

  it('url-encodes the roundId', () => {
    expect(buildJoinPayload('http://localhost:5173', 'R 1')).toBe(
      'http://localhost:5173/join?round=R%201',
    )
  })

  // T-11-10-QR — the no-secret assertion: the payload must never carry a token/JWT.
  it('NEVER contains a token / JWT / bearer substring', () => {
    for (const rid of ['R1', 'R42', 'ROUND-2026']) {
      const p = buildJoinPayload('https://umbra.example', rid)
      expect(p).not.toMatch(/eyJ/) // JWT header prefix (base64 '{"alg"…')
      expect(p.toLowerCase()).not.toContain('bearer')
      expect(p.toLowerCase()).not.toContain('token')
      expect(p.toLowerCase()).not.toContain('jwt')
    }
  })
})
