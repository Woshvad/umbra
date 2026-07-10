// web/src/components/RfqPanel.test.tsx — the S3 RFQ panel proof (ADJ-02, 13-UI-SPEC S3).
// DOM-free (node-env vitest, the project convention): it exercises the PURE, exported core of
// RfqPanel — best-quote selection, the 1×1 DvP leg derivation (the DvpLegs reuse), and the
// offline-vs-verbatim-reject classifier — against mocked wire shapes, plus a BEHAVIORAL
// credential scan of the desk-plane client fns (postRfq / getRfqQuotes / acceptRfqQuote) via a
// stubbed fetch. The live compose→settle render is proven by the shipped SettlementView visuals
// (DvpLegs + AtomicStamp) this panel REUSES; here we prove the seam is correct and credential-free.
//
// Load-bearing assertions:
//   (a) bestQuoteIndex picks the LOWEST price for a BUY, the HIGHEST for a SELL, -1 when empty.
//   (b) legsFromAccept derives the correct seller/buyer/qty/cash 1×1 DvP leg for both sides.
//   (c) classifyRfqError maps an OFFLINE SolverError → OFFLINE_CAPTION, else a verbatim reject.
//   (d) REQUEST QUOTE → postRfq, ACCEPT BEST QUOTE → acceptRfqQuote hit the single SOLVER_BASE_URL
//       with NO auth/bearer/token/key header (desk-plane, T-13-38).
//   (e) the RfqPanel source is grep-clean of @daml/react / operator-token / Anthropic-key / :4000.
import { describe, it, expect, vi, afterEach } from 'vitest'
// The RfqPanel source as a raw string (Vite `?raw`, typed by vite/client) — the credential
// grep-scan reads it WITHOUT node:fs (this web project has no @types/node).
import rfqSource from './RfqPanel.tsx?raw'
import {
  bestQuoteIndex,
  legsFromAccept,
  classifyRfqError,
  REQUEST_QUOTE,
  ACCEPT_BEST_QUOTE,
  FIRM_SIGNED,
  BEST_MARKER,
  NO_QUOTES_HEADING,
} from './RfqPanel'
import { SOLVER_BASE_URL, OFFLINE_CAPTION, SolverError, postRfq, acceptRfqQuote } from '../solver'
import type { FirmQuote, RfqAcceptResponse } from '../solver'

const q = (contractId: string, dealer: string, price: number, quantity = 10): FirmQuote => ({
  contractId,
  dealer,
  price,
  quantity,
})

describe('S3 RFQ — bestQuoteIndex (side-directional best)', () => {
  it('a BUY requester wants the LOWEST offered price', () => {
    const quotes = [q('c1', 'DEALER-A', 100.5), q('c2', 'DEALER-B', 99.75), q('c3', 'DEALER-C', 101)]
    expect(bestQuoteIndex(quotes, 'Buy')).toBe(1)
  })

  it('a SELL requester wants the HIGHEST bid', () => {
    const quotes = [q('c1', 'DEALER-A', 100.5), q('c2', 'DEALER-B', 99.75), q('c3', 'DEALER-C', 101)]
    expect(bestQuoteIndex(quotes, 'Sell')).toBe(2)
  })

  it('keeps the earliest quote on a tie (stable)', () => {
    const quotes = [q('c1', 'DEALER-A', 100), q('c2', 'DEALER-B', 100)]
    expect(bestQuoteIndex(quotes, 'Buy')).toBe(0)
    expect(bestQuoteIndex(quotes, 'Sell')).toBe(0)
  })

  it('returns -1 for an empty quote set', () => {
    expect(bestQuoteIndex([], 'Buy')).toBe(-1)
  })
})

describe('S3 RFQ — legsFromAccept (1×1 DvP leg reused by DvpLegs)', () => {
  const base: RfqAcceptResponse = {
    rfqId: 'RFQ1',
    quoteCid: 'c2',
    requester: 'bankA::fp',
    dealer: 'DEALER-B',
    side: 'Buy',
    quantity: 10,
    price: 99.75,
    cashAmount: 997.5,
    settled: true,
  }

  it('a BUY requester RECEIVES the bond from the dealer (dealer sells, requester buys)', () => {
    const legs = legsFromAccept(base, 'BLUEROCK')
    expect(legs).toHaveLength(1)
    expect(legs[0]).toEqual({ seller: 'DEALER-B', buyer: 'BLUEROCK', qty: 10, cash: 997.5 })
  })

  it('a SELL requester DELIVERS the bond to the dealer (requester sells, dealer buys)', () => {
    const legs = legsFromAccept({ ...base, side: 'Sell' }, 'BLUEROCK')
    expect(legs[0]).toEqual({ seller: 'BLUEROCK', buyer: 'DEALER-B', qty: 10, cash: 997.5 })
  })

  it('falls back to the raw requester party when no display label is given', () => {
    expect(legsFromAccept(base)[0].buyer).toBe('bankA::fp')
  })
})

describe('S3 RFQ — classifyRfqError (offline vs verbatim reject)', () => {
  it('maps an OFFLINE SolverError to the shipped OFFLINE_CAPTION', () => {
    const c = classifyRfqError(new SolverError(0, 'OFFLINE', OFFLINE_CAPTION))
    expect(c.kind).toBe('offline')
    expect(c.message).toBe(OFFLINE_CAPTION)
  })

  it('renders any other structured solver error verbatim (never summarized)', () => {
    const c = classifyRfqError(new SolverError(422, 'RFQ_REJECTED', 'no dealer eligible for BONDX'))
    expect(c.kind).toBe('reject')
    expect(c.message).toBe('no dealer eligible for BONDX')
  })
})

describe('S3 RFQ — copy contract (verbatim UI-SPEC)', () => {
  it('exposes the exact CTA + tag + empty-state copy', () => {
    expect(REQUEST_QUOTE).toBe('REQUEST QUOTE')
    expect(ACCEPT_BEST_QUOTE).toBe('ACCEPT BEST QUOTE')
    expect(FIRM_SIGNED).toBe('FIRM · SIGNED')
    expect(BEST_MARKER).toBe('BEST')
    expect(NO_QUOTES_HEADING).toBe('NO QUOTES YET')
  })
})

// ── (d) desk-plane credential scan — REQUEST QUOTE / ACCEPT BEST QUOTE ride the single seam ──
describe('S3 RFQ — desk-plane seam is credential-free (T-13-38)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch() {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit = {}) => {
        calls.push({ url: String(url), init })
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
      }),
    )
    return calls
  }

  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ['REQUEST QUOTE → postRfq', () => postRfq({ requester: 'bankA::fp', side: 'Buy', quantity: 10 }), '/rfq'],
    ['ACCEPT BEST QUOTE → acceptRfqQuote', () => acceptRfqQuote('RFQ1', 'c2'), '/rfq/RFQ1/accept'],
  ]

  it.each(cases)('%s hits SOLVER_BASE_URL + %s with no credential', async (_name, fn, path) => {
    const calls = stubFetch()
    await fn()
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    expect(url).toBe(`${SOLVER_BASE_URL}${path}`)
    expect(url).not.toContain(':4000')
    const headerBlob = JSON.stringify(init.headers ?? {}).toLowerCase()
    for (const forbidden of ['authorization', 'bearer', 'token', 'apikey', 'api-key', 'x-anthropic']) {
      expect(headerBlob).not.toContain(forbidden)
    }
    expect(headerBlob).toContain('content-type')
  })
})

// ── (e) grep-clean — the RfqPanel source carries NO operator/@daml-react/Anthropic literal ──
describe('S3 RFQ — RfqPanel.tsx source is grep-clean', () => {
  const src = rfqSource

  it.each(['@daml/react', 'ANTHROPIC', 'sk-ant', 'Authorization', 'Bearer', ':4000'])(
    'contains no %s literal',
    (needle) => {
      expect(src).not.toContain(needle)
    },
  )

  it('imports the reused atomic-DvP visuals (DvpLegs + AtomicStamp), not a new grammar', () => {
    expect(src).toContain("from './DvpLegs'")
    expect(src).toContain("from './AtomicStamp'")
  })
})
