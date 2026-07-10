// web/src/lib/leaderboard.test.ts — pure unit proof for the S2 leaderboard display helper
// (rankForDisplay: sort + badge + config-tag) AND a behavioral credential-scan of the ADJ-01/02/03
// client fns: every fn hits the single SOLVER_BASE_URL/call<T>() (NO :4000 literal, NO auth header,
// NO operator/Anthropic credential in the constructed request) — the ADJ-01 T-13-36 mitigation.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { rankForDisplay, formatConfigTag, badgeFor } from './leaderboard'
import type { RankedProposal } from '../solver'
import {
  SOLVER_BASE_URL,
  getCompeting,
  postRfq,
  getRfqQuotes,
  acceptRfqQuote,
  openIssuance,
  clearIssuance,
  payCoupon,
  redeemIssuance,
} from '../solver'

// A minimal RankedProposal factory (only the fields rankForDisplay reads matter).
const mk = (
  model: string,
  temperature: number,
  matchedVolume: number,
  surplus: number,
  verified = true,
): RankedProposal => ({
  config: { id: `${model}-${temperature}`, model, temperature },
  verified,
  clearingPrice: 100,
  matchedVolume,
  surplus,
  rationale: 'r',
})

describe('leaderboard — formatConfigTag (honest model·temp tag)', () => {
  it('shortens known model families and formats temperature to one decimal', () => {
    expect(formatConfigTag({ model: 'claude-haiku-4-5', temperature: 0 })).toBe('HAIKU · t0.0')
    expect(formatConfigTag({ model: 'claude-sonnet-4-6', temperature: 0.4 })).toBe('SONNET · t0.4')
    expect(formatConfigTag({ model: 'claude-opus-4-8', temperature: 1 })).toBe('OPUS · t1.0')
  })

  it('degrades an unknown model id to its uppercase (never invents a family)', () => {
    expect(formatConfigTag({ model: 'mystery-1', temperature: 0.2 })).toBe('MYSTERY-1 · t0.2')
  })
})

describe('leaderboard — badgeFor (verify-don-t-trust)', () => {
  it('maps verified→VERIFIED and unverified→UNVERIFIED', () => {
    expect(badgeFor(true)).toBe('VERIFIED')
    expect(badgeFor(false)).toBe('UNVERIFIED')
  })
})

describe('leaderboard — rankForDisplay (sort + rank + badge)', () => {
  it('sorts by matched volume desc, then surplus desc', () => {
    const rows = rankForDisplay([
      mk('claude-haiku-4-5', 0, 8, 12),
      mk('claude-sonnet-4-6', 0.4, 10, 4),
      mk('claude-opus-4-8', 0, 10, 18),
    ])
    expect(rows.map((r) => r.matchedVolume)).toEqual([10, 10, 8])
    // tie on matched (10) broken by surplus desc → opus(18) before sonnet(4)
    expect(rows[0].configTag).toBe('OPUS · t0.0')
    expect(rows[1].configTag).toBe('SONNET · t0.4')
    expect(rows[2].configTag).toBe('HAIKU · t0.0')
  })

  it('zero-pads the rank numeral (01, 02, …)', () => {
    const rows = rankForDisplay([mk('claude-haiku-4-5', 0, 10, 18), mk('claude-sonnet-4-6', 0, 8, 4)])
    expect(rows.map((r) => r.rank)).toEqual(['01', '02'])
  })

  it('maps the verified flag to the VERIFIED/UNVERIFIED badge', () => {
    const rows = rankForDisplay([
      mk('claude-haiku-4-5', 0, 10, 18, true),
      mk('claude-sonnet-4-6', 0, 8, 4, false),
    ])
    expect(rows[0].badge).toBe('VERIFIED')
    expect(rows[1].badge).toBe('UNVERIFIED')
  })

  it('does not mutate the input array (pure)', () => {
    const input = [mk('claude-haiku-4-5', 0, 8, 4), mk('claude-opus-4-8', 0, 10, 18)]
    const before = input.map((p) => p.config.model)
    rankForDisplay(input)
    expect(input.map((p) => p.config.model)).toEqual(before)
  })
})

// ── ADJ-01/02/03 credential-free client scan (T-13-36) ────────────────────────────
// Stub fetch, invoke each new client fn, and assert the CONSTRUCTED request rides the single
// SOLVER_BASE_URL (no :4000 literal) and carries NO auth/bearer/token/key header — the browser
// bundle never holds an operator token or the Anthropic key.
describe('solver client — ADJ-01/02/03 fns are credential-free (no :4000, no auth header)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Capture the (url, init) of the single fetch each fn makes; resolve an empty ok body.
  function stubFetch(): { calls: Array<{ url: string; init: RequestInit }> } {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit = {}) => {
        calls.push({ url: String(url), init })
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as Response)
      }),
    )
    return { calls }
  }

  // Each entry: a fn invocation + the expected relative path it must hit.
  const invocations: Array<[string, () => Promise<unknown>, string]> = [
    ['getCompeting', () => getCompeting('R1', [{ id: 'a', model: 'claude-haiku-4-5', temperature: 0 }]), '/competing'],
    ['postRfq', () => postRfq({ requester: 'DESK', side: 'Buy', quantity: 5 }), '/rfq'],
    ['getRfqQuotes', () => getRfqQuotes('RFQ1'), '/rfq/RFQ1/quotes'],
    ['acceptRfqQuote', () => acceptRfqQuote('RFQ1', 'Q1'), '/rfq/RFQ1/accept'],
    [
      'openIssuance',
      () => openIssuance({ issuer: 'ISS', bondInstrument: 'BONDX', cashInstrument: 'USDCx', trancheSize: 100 }),
      '/issuance',
    ],
    [
      'clearIssuance',
      () => clearIssuance({ issuer: 'ISS', bondInstrument: 'BONDX', cashInstrument: 'USDCx', trancheSize: 100 }),
      '/issuance',
    ],
    ['payCoupon', () => payCoupon('ISS1', 0, 2.5), '/issuance/ISS1/coupon'],
    ['redeemIssuance', () => redeemIssuance('ISS1', 100), '/issuance/ISS1/redeem'],
  ]

  it.each(invocations)('%s hits SOLVER_BASE_URL + %s with no credential', async (_name, fn, path) => {
    const { calls } = stubFetch()
    await fn()
    expect(calls).toHaveLength(1)
    const { url, init } = calls[0]
    // Rooted at the single source of truth, exact route, no drifted :4000 port literal.
    expect(url).toBe(`${SOLVER_BASE_URL}${path}`)
    expect(url).not.toContain(':4000')
    // No auth/bearer/token/key header on any adjacent request.
    const headerBlob = JSON.stringify(init.headers ?? {}).toLowerCase()
    for (const forbidden of ['authorization', 'bearer', 'token', 'apikey', 'api-key', 'x-anthropic']) {
      expect(headerBlob).not.toContain(forbidden)
    }
    // The one header is content-type: application/json (call<T> default), nothing else sensitive.
    expect(headerBlob).toContain('content-type')
  })
})
