// web/src/components/IssuancePanel.test.tsx — the S4 issuance/coupon panel proof (ADJ-03,
// 13-UI-SPEC S4). DOM-free (node-env vitest, the project convention): it exercises the PURE,
// exported core of IssuancePanel — the canonical issuance fixture, the synthesized crossing
// curve the reused CrossingChart consumes, and the verbatim copy contract — plus a BEHAVIORAL
// credential scan of the theatre-plane client fns (clearIssuance / payCoupon / redeemIssuance)
// via a stubbed fetch, and a source grep-scan that proves the bundle is credential-free and
// that lime is delegated to the reused PriceReveal (never a raw lime literal in this panel).
//
// Load-bearing assertions:
//   (a) ISSUANCE_FIXTURE is a valid single-BONDX tranche with desk bids (client sends bids only).
//   (b) issuanceCurve builds a 3-point crossing: demand DESCENDS, supply ASCENDS, meeting at
//       (uniform price, matched) — so the reused CrossingChart draws a real staircase.
//   (c) the copy contract exposes the verbatim S4 tags (PRIMARY ISSUANCE · UNIFORM-PRICE / LIFECYCLE
//       / COUPON PAID / REDEEMED).
//   (d) RUN CLEAR → clearIssuance, PAY COUPON → payCoupon, REDEEM → redeemIssuance hit the single
//       SOLVER_BASE_URL with NO auth/bearer/token/key header (theatre-plane, T-13-40).
//   (e) the IssuancePanel source is grep-clean of @daml/react / operator-token / Anthropic-key /
//       :4000, reuses CrossingChart + PriceReveal, and carries NO raw lime literal of its own
//       (lime is the reused PriceReveal's — the one allowed uniform-price-reveal use).
import { describe, it, expect, vi, afterEach } from 'vitest'
// The IssuancePanel source as a raw string (Vite `?raw`) — the credential grep-scan reads it
// WITHOUT node:fs (this web project has no @types/node), mirroring RfqPanel.test.tsx.
import issuanceSource from './IssuancePanel.tsx?raw'
import {
  issuanceCurve,
  ISSUANCE_FIXTURE,
  HONEST_TAG,
  LIFECYCLE_TAG,
  COUPON_PAID,
  REDEEMED,
  RUN_CLEAR,
  PAY_COUPON,
  REDEEM,
  COUPON_PERIOD,
  COUPON_PER_UNIT,
  PRINCIPAL_PER_UNIT,
} from './IssuancePanel'
import { SOLVER_BASE_URL, clearIssuance, payCoupon, redeemIssuance } from '../solver'

describe('S4 issuance — ISSUANCE_FIXTURE (client sends bids, never a trusted clear)', () => {
  it('is a single-BONDX tranche with desk bids and a reserve', () => {
    expect(ISSUANCE_FIXTURE.bondInstrument).toBe('BONDX')
    expect(ISSUANCE_FIXTURE.trancheSize).toBeGreaterThan(0)
    expect(ISSUANCE_FIXTURE.bids && ISSUANCE_FIXTURE.bids.length).toBeGreaterThanOrEqual(2)
    for (const b of ISSUANCE_FIXTURE.bids ?? []) {
      expect(b.quantity).toBeGreaterThan(0)
      expect(b.limit).toBeGreaterThan(0)
    }
    // The client never encodes a clearingPrice — the solver derives the uniform price.
    expect(ISSUANCE_FIXTURE).not.toHaveProperty('clearingPrice')
  })
})

describe('S4 issuance — issuanceCurve (the reused CrossingChart staircase)', () => {
  it('builds a 3-point crossing that meets at (uniform price, matched)', () => {
    const curve = issuanceCurve(100, 20)
    expect(curve).toHaveLength(3)
    // Midpoint: demand === supply === matched at the uniform price.
    expect(curve[1]).toMatchObject({ price: 100, demand: 20, supply: 20 })
  })

  it('demand DESCENDS and supply ASCENDS across rising price', () => {
    const curve = issuanceCurve(100, 20)
    expect(curve[0].demand).toBeGreaterThan(curve[1].demand)
    expect(curve[1].demand).toBeGreaterThan(curve[2].demand)
    expect(curve[0].supply).toBeLessThan(curve[1].supply)
    expect(curve[1].supply).toBeLessThan(curve[2].supply)
  })

  it('never emits a negative quantity (clamped at 0)', () => {
    const curve = issuanceCurve(100, 1)
    for (const c of curve) {
      expect(c.demand).toBeGreaterThanOrEqual(0)
      expect(c.supply).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('S4 issuance — copy contract (verbatim UI-SPEC)', () => {
  it('exposes the exact S4 tags + secondary-control copy', () => {
    expect(HONEST_TAG).toBe('PRIMARY ISSUANCE · UNIFORM-PRICE')
    expect(LIFECYCLE_TAG).toBe('LIFECYCLE')
    expect(COUPON_PAID).toBe('COUPON PAID')
    expect(REDEEMED).toBe('REDEEMED')
    expect(RUN_CLEAR).toBe('RUN ISSUANCE CLEAR')
    expect(PAY_COUPON).toBe('PAY COUPON')
    expect(REDEEM).toBe('REDEEM')
  })
})

// ── (d) theatre-plane credential scan — the lifecycle rides the single seam, no credential ──
describe('S4 issuance — theatre-plane seam is credential-free (T-13-40)', () => {
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
    ['RUN CLEAR → clearIssuance', () => clearIssuance(ISSUANCE_FIXTURE), '/issuance'],
    ['PAY COUPON → payCoupon', () => payCoupon('ISS1', COUPON_PERIOD, COUPON_PER_UNIT), '/issuance/ISS1/coupon'],
    ['REDEEM → redeemIssuance', () => redeemIssuance('ISS1', PRINCIPAL_PER_UNIT), '/issuance/ISS1/redeem'],
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

// ── (e) grep-clean — IssuancePanel.tsx carries NO operator/@daml-react/Anthropic literal ──
describe('S4 issuance — IssuancePanel.tsx source is grep-clean', () => {
  const src = issuanceSource

  it.each(['@daml/react', 'ANTHROPIC', 'sk-ant', 'Authorization', 'Bearer', ':4000'])(
    'contains no %s literal',
    (needle) => {
      expect(src).not.toContain(needle)
    },
  )

  it('reuses the shipped crossing/reveal visuals (CrossingChart + PriceReveal)', () => {
    expect(src).toContain("from './CrossingChart'")
    expect(src).toContain("from './PriceReveal'")
  })

  it('carries the PRIMARY ISSUANCE honest tag', () => {
    expect(src).toContain('PRIMARY ISSUANCE')
  })

  it('introduces NO raw lime hex of its own — lime is delegated to the reused PriceReveal', () => {
    // The one allowed lime use (UI-SPEC lines 90-96) is the reused PriceReveal hero slab; this
    // panel must not paint its own lime. (#D6FB3C appears only inside CrossingChart/PriceReveal.)
    expect(src).not.toContain('#D6FB3C')
  })
})
