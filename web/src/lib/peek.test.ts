// web/src/lib/peek.test.ts — pure unit proof for the WOW-01 adversarial peek helper.
// Asserts the raw JSON Ledger API v2 request shape (mirrors web/src/ledger/v2react.tsx
// fetchAcs L75-85), the empty/403 → UI-SPEC verdict mapping, and that elideBearer never
// leaks the token. No DOM, no live ledger — this module is pure by design.
import { describe, it, expect } from 'vitest'
import {
  buildPeekRequest,
  classifyPeekResult,
  elideBearer,
  filterRowsByTemplate,
  VERDICT_EMPTY,
  VERDICT_FORBIDDEN,
  PEEK_TEMPLATES,
} from './peek'

// A representative per-desk base (desks.ts httpBaseUrlFor(bankA) → /cn/app-user) and a
// realistic 3-segment HS256 JWT + a live rival party id (tokens.json bankB::…).
const BASE = 'http://localhost:5173/cn/app-user/'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOADSEGMENT.SIGNATURESEGMENT'
const RIVAL_PARTY = 'bankB::1220db9951b2d9611792989b2a6e1e4c47d4dae4f23cd68a5ccb801cf6a08a43be9d'
const OFFSET = 42

describe('peek — buildPeekRequest (mirrors fetchAcs wire shape)', () => {
  const req = buildPeekRequest(BASE, TOKEN, RIVAL_PARTY, PEEK_TEMPLATES.Order, OFFSET)

  it('targets POST /v2/state/active-contracts on the desk-own base', () => {
    expect(req.url).toBe(`${BASE}v2/state/active-contracts`)
    expect(req.method).toBe('POST')
  })

  it('filters by the RIVAL party with verbose + the caller-supplied offset', () => {
    expect(req.body.filter.filtersByParty).toHaveProperty(RIVAL_PARTY)
    expect(req.body.filter.filtersByParty[RIVAL_PARTY]).toEqual({})
    expect(req.body.verbose).toBe(true)
    expect(req.body.activeAtOffset).toBe(OFFSET)
  })

  it('NEVER embeds the full token in the request body', () => {
    expect(JSON.stringify(req.body)).not.toContain(TOKEN)
  })

  it('exposes only an elided auth header for display (never the full bearer)', () => {
    expect(req.authHeaderDisplay).not.toContain(TOKEN)
    expect(req.authHeaderDisplay.startsWith('Bearer ')).toBe(true)
  })

  it('echoes the display template without putting it on the wire body', () => {
    expect(req.template).toBe(PEEK_TEMPLATES.Order)
    expect(JSON.stringify(req.body)).not.toContain(PEEK_TEMPLATES.Order)
  })
})

describe('peek — classifyPeekResult → UI-SPEC verdicts', () => {
  it('empty rows → PRIVACY ENFORCED verdict (byte-identical to UI-SPEC)', () => {
    const r = classifyPeekResult(200, [])
    expect(r.empty).toBe(true)
    expect(r.verdict).toBe(VERDICT_EMPTY)
    expect(r.verdict).toBe('0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE')
  })

  it('403 → LEDGER REFUSED THE READ verdict (byte-identical to UI-SPEC)', () => {
    const r = classifyPeekResult(403, null)
    expect(r.forbidden).toBe(true)
    expect(r.verdict).toBe(VERDICT_FORBIDDEN)
    expect(r.verdict).toBe('403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL')
  })

  it('a non-empty rival array → a LOUD leak verdict (regression guard)', () => {
    const r = classifyPeekResult(200, [{ templateId: 'x:Umbra.Auction:Order' }])
    expect(r.leak).toBe(true)
    expect(r.empty).not.toBe(true)
    expect(r.verdict).toMatch(/LEAK|REGRESSION/)
  })
})

describe('peek — elideBearer never leaks', () => {
  it('truncates to the first 8 chars + a single ellipsis', () => {
    const out = elideBearer(TOKEN)
    expect(out).toBe(`Bearer ${TOKEN.slice(0, 8)}…`)
    expect(out).not.toContain(TOKEN)
    expect(out.length).toBeLessThan(`Bearer ${TOKEN}`.length)
  })
})

describe('peek — filterRowsByTemplate (client-side display filter)', () => {
  it('keeps only rows whose templateId matches the module:entity form', () => {
    const rows = [
      { templateId: 'abc123:Umbra.Auction:Order' },
      { templateId: 'abc123:Umbra.Auction:TradeConfirmation' },
    ]
    expect(filterRowsByTemplate(rows, PEEK_TEMPLATES.Order)).toHaveLength(1)
    expect(filterRowsByTemplate(rows, PEEK_TEMPLATES.TradeConfirmation)).toHaveLength(1)
    expect(filterRowsByTemplate([], PEEK_TEMPLATES.Order)).toHaveLength(0)
  })
})
