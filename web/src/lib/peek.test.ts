// web/src/lib/peek.test.ts — pure unit proof for the WOW-01 adversarial peek helper.
// Asserts the two raw JSON Ledger API v2 request shapes (the out-of-band discovery read,
// mirroring v2react.tsx fetchAcs L82-88; and the informee peek, whose 404/200 behaviour was
// verified live on the FiveNorth DevNet sandbox), the verdict mapping, and that elideBearer
// never leaks the token. No DOM, no live ledger — this module is pure by design.
import { describe, it, expect } from 'vitest'
import {
  buildInformeePeekRequest,
  buildPeekRequest,
  classifyPeekResult,
  CONTRACT_EVENTS_NOT_FOUND,
  elideBearer,
  errorCodeOf,
  extractAcsRows,
  extractInformeeRows,
  filterRowsByTemplate,
  VERDICT_EMPTY,
  VERDICT_FORBIDDEN,
  VERDICT_LEAK,
  VERDICT_NOT_INFORMEE,
  PEEK_TEMPLATES,
} from './peek'

// A representative per-desk base (desks.ts httpBaseUrlFor(bankA) → /cn/app-user) and a
// realistic 3-segment HS256 JWT + live party ids (tokens.json bankA/bankB::…).
const BASE = 'http://localhost:5173/cn/app-user/'
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOADSEGMENT.SIGNATURESEGMENT'
const RIVAL_PARTY = 'bankB::1220db9951b2d9611792989b2a6e1e4c47d4dae4f23cd68a5ccb801cf6a08a43be9d'
const OWN_PARTY = 'bankA::1220db9951b2d9611792989b2a6e1e4c47d4dae4f23cd68a5ccb801cf6a08a43be9d'
const RIVAL_CID = '00a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const OFFSET = 42

describe('peek — buildPeekRequest (discovery read; mirrors fetchAcs wire shape)', () => {
  const req = buildPeekRequest(BASE, TOKEN, RIVAL_PARTY, PEEK_TEMPLATES.Order, OFFSET)

  it('targets POST /v2/state/active-contracts on the supplied base', () => {
    expect(req.url).toBe(`${BASE}v2/state/active-contracts`)
    expect(req.method).toBe('POST')
  })

  it('filters by the requested party with verbose + the caller-supplied offset', () => {
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

describe('peek — buildInformeePeekRequest (the actual proof)', () => {
  const req = buildInformeePeekRequest(BASE, TOKEN, OWN_PARTY, RIVAL_CID, PEEK_TEMPLATES.Order)

  it('targets POST /v2/events/events-by-contract-id on the desk-own base', () => {
    expect(req.url).toBe(`${BASE}v2/events/events-by-contract-id`)
    expect(req.method).toBe('POST')
  })

  it('asks for the RIVAL cid AS OUR OWN party (never as the rival) — the whole point', () => {
    expect(req.body.contractId).toBe(RIVAL_CID)
    expect(req.body.eventFormat.filtersByParty).toHaveProperty(OWN_PARTY)
    expect(req.body.eventFormat.filtersByParty).not.toHaveProperty(RIVAL_PARTY)
    expect(req.requestingParty).toBe(OWN_PARTY)
  })

  it('sends the MANDATORY eventFormat with an empty cumulative filter + verbose', () => {
    // Omitting eventFormat → HTTP 400 MISSING_FIELD "event_format" (verified live).
    expect(req.body.eventFormat).toBeDefined()
    expect(req.body.eventFormat.filtersByParty[OWN_PARTY]).toEqual({ cumulative: [] })
    expect(req.body.eventFormat.verbose).toBe(true)
  })

  it('NEVER embeds the full token in the request body (T-08-02-BEARER)', () => {
    expect(JSON.stringify(req.body)).not.toContain(TOKEN)
    expect(req.authHeaderDisplay).not.toContain(TOKEN)
    expect(req.authHeaderDisplay.startsWith('Bearer ')).toBe(true)
  })

  it('echoes the display template without putting it on the wire body', () => {
    expect(req.template).toBe(PEEK_TEMPLATES.Order)
    expect(JSON.stringify(req.body)).not.toContain(PEEK_TEMPLATES.Order)
  })
})

describe('peek — classifyPeekResult → UI-SPEC verdicts', () => {
  it('404 + CONTRACT_EVENTS_NOT_FOUND → NOT AN INFORMEE (the DevNet-verified proof)', () => {
    const r = classifyPeekResult(404, null, CONTRACT_EVENTS_NOT_FOUND)
    expect(r.notInformee).toBe(true)
    expect(r.leak).not.toBe(true)
    expect(r.inconclusive).not.toBe(true)
    expect(r.verdict).toBe(VERDICT_NOT_INFORMEE)
    expect(r.verdict).toBe('404 — LEDGER REFUSED THE READ · NOT AN INFORMEE')
  })

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

  it('a disclosed rival createdEvent → a LOUD leak verdict (regression guard)', () => {
    const r = classifyPeekResult(200, [{ templateId: 'x:Umbra.Auction:Order' }])
    expect(r.leak).toBe(true)
    expect(r.empty).not.toBe(true)
    expect(r.verdict).toBe(VERDICT_LEAK)
    expect(r.verdict).toMatch(/LEAK|REGRESSION/)
  })

  it('a 200 disclosure is a LEAK even if the template does not match the target', () => {
    // Never downgrade a real disclosure to "privacy enforced" on a template technicality.
    const r = classifyPeekResult(200, [{ templateId: 'x:Umbra.Auction:TradeConfirmation' }])
    expect(r.leak).toBe(true)
    expect(r.verdict).toBe(VERDICT_LEAK)
  })

  it('a 404 that is NOT the informee refusal is inconclusive — never "enforced"', () => {
    const r = classifyPeekResult(404, null, 'NOT_FOUND')
    expect(r.inconclusive).toBe(true)
    expect(r.empty).not.toBe(true)
    expect(r.notInformee).not.toBe(true)
    expect(r.verdict).toBe('')
  })

  it('400/500 are inconclusive — a wire error must not masquerade as privacy', () => {
    for (const status of [400, 401, 500, 502]) {
      const r = classifyPeekResult(status, null, 'MISSING_FIELD')
      expect(r.inconclusive).toBe(true)
      expect(r.verdict).toBe('')
    }
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

describe('peek — extractAcsRows (discovery response → cids)', () => {
  it('pulls createdEvents out of the v2 ACS envelope', () => {
    const body = [
      {
        contractEntry: {
          JsActiveContract: {
            createdEvent: { templateId: 'abc:Umbra.Auction:Order', contractId: RIVAL_CID },
          },
        },
      },
      { contractEntry: { JsIncompleteUnassigned: {} } },
    ]
    const rows = extractAcsRows(body)
    expect(rows).toHaveLength(1)
    expect(rows[0].contractId).toBe(RIVAL_CID)
  })

  it('returns [] for a non-array / empty body (never throws)', () => {
    expect(extractAcsRows(null)).toEqual([])
    expect(extractAcsRows({ code: 'NOPE' })).toEqual([])
    expect(extractAcsRows([])).toEqual([])
  })
})

describe('peek — extractInformeeRows (200 disclosure → LOUD leak)', () => {
  it('pulls the createdEvent out of a 200 events-by-contract-id body', () => {
    const body = {
      created: { createdEvent: { templateId: 'abc:Umbra.Auction:Order', contractId: RIVAL_CID } },
    }
    const rows = extractInformeeRows(body)
    expect(rows).toHaveLength(1)
    expect(classifyPeekResult(200, rows).leak).toBe(true)
  })

  it('returns [] when nothing was disclosed (never throws on a 404 error body)', () => {
    expect(extractInformeeRows(null)).toEqual([])
    expect(extractInformeeRows({ code: CONTRACT_EVENTS_NOT_FOUND })).toEqual([])
    expect(extractInformeeRows({ created: {} })).toEqual([])
  })
})

describe('peek — errorCodeOf (v2 error body → code)', () => {
  it('reads the code off the live 404 refusal body', () => {
    // Verbatim shape observed live on DevNet.
    const body = {
      code: 'CONTRACT_EVENTS_NOT_FOUND',
      cause: 'Contract events not found, or not visible.',
    }
    expect(errorCodeOf(body)).toBe(CONTRACT_EVENTS_NOT_FOUND)
    expect(classifyPeekResult(404, null, errorCodeOf(body)).verdict).toBe(VERDICT_NOT_INFORMEE)
  })

  it('returns undefined for a body with no code (never throws)', () => {
    expect(errorCodeOf(null)).toBeUndefined()
    expect(errorCodeOf({})).toBeUndefined()
    expect(errorCodeOf({ code: 404 })).toBeUndefined()
  })
})
