// solver/src/status.test.ts — the OPS-02 / S1 public-health proof. This is the load-bearing
// privacy assertion for the ONE deliberately-public surface: /status JSON and /status.html
// expose ONLY aggregate health and leak ZERO private order data and ZERO secrets.
//
// Proven here:
//   • buildStatus emits ONLY the allow-listed aggregate keys (subset of {health, phase,
//     lastClearPrice, lastClearAt, uptimeSeconds, build}) — no order/desk/limit/token field.
//   • buildStatus omits optional clear fields when absent (fresh venue).
//   • renderStatusHtml contains the honest tag, the four row labels, the health strings,
//     and the UMBRA wordmark.
//   • ORDER-SWEEP + SECRET-SWEEP: neither the JSON nor the HTML contains any order field
//     sentinel (side/qty/limit/desk/bid/fill) or any secret sentinel (ANTHROPIC_API_KEY /
//     operator token / VAULT_TOKEN).

import { describe, it, expect } from 'vitest'
import { buildStatus, renderStatusHtml, type StatusInput } from './status.js'

// Fixture aggregate input — the canonical $100.00 clear, operational venue, Cleared phase.
const FIXTURE: StatusInput = {
  health: 'operational',
  phase: 'Cleared',
  lastClearPrice: 100.0,
  lastClearAt: '2026-07-10T14:32:07Z',
  uptimeSeconds: 3 * 3600 + 12 * 60 + 5,
  build: 'umbra@0.1.0+phase13',
}

// The complete allow-list of keys the aggregate surface may EVER emit.
const ALLOWED_KEYS = new Set(['health', 'phase', 'lastClearPrice', 'lastClearAt', 'uptimeSeconds', 'build'])

// Order-field sentinels — the QUOTED-KEY forms an order object would serialize to. A private
// order leaking into the public surface manifests as one of these JSON keys/values. Quoted
// forms avoid false positives against prose (e.g. "client-side" is not the order field
// "side"). NONE may appear in /status JSON or /status.html.
const ORDER_SENTINELS = ['"side"', '"quantity"', '"qty"', '"limitprice"', '"limit"', '"desk"', '"bidder"', '"perdeskfill"', '"fill"', '"orderid"', '"sealed"', '"buy"', '"sell"']

// Secret sentinels — no key/token material may appear anywhere in the public output.
const SECRET_SENTINELS = ['ANTHROPIC_API_KEY', 'sk-ant-', 'VAULT_TOKEN', 'operator-token', 'OPERATOR_TOKEN', 'Bearer ']

describe('buildStatus — aggregate-only key discipline', () => {
  it('emits ONLY the allow-listed aggregate keys', () => {
    const s = buildStatus(FIXTURE)
    for (const k of Object.keys(s)) {
      expect(ALLOWED_KEYS.has(k), `unexpected key ${k}`).toBe(true)
    }
    expect(s.health).toBe('operational')
    expect(s.phase).toBe('Cleared')
    expect(s.lastClearPrice).toBe(100.0)
  })

  it('omits optional clear fields when absent (fresh venue, idle phase)', () => {
    const s = buildStatus({ health: 'operational', phase: null, uptimeSeconds: 10, build: 'b' })
    expect(s).not.toHaveProperty('lastClearPrice')
    expect(s).not.toHaveProperty('lastClearAt')
    expect(s.phase).toBeNull()
  })

  it('ORDER-SWEEP + SECRET-SWEEP: the JSON body carries no order or secret sentinel', () => {
    const json = JSON.stringify(buildStatus(FIXTURE)).toLowerCase()
    for (const sentinel of ORDER_SENTINELS) {
      // 'buy'/'sell' etc. must not appear as JSON content (there are no such keys/values).
      expect(json.includes(sentinel.toLowerCase()), `order sentinel leaked: ${sentinel}`).toBe(false)
    }
    const jsonRaw = JSON.stringify(buildStatus(FIXTURE))
    for (const sentinel of SECRET_SENTINELS) {
      expect(jsonRaw.includes(sentinel), `secret sentinel leaked: ${sentinel}`).toBe(false)
    }
  })
})

describe('renderStatusHtml — S1 brand document', () => {
  const html = renderStatusHtml(buildStatus(FIXTURE))

  it('contains the persistent honest-label tag', () => {
    expect(html).toContain('PUBLIC HEALTH · NO PRIVATE ORDER DATA')
  })

  it('contains the four metric row labels', () => {
    expect(html).toContain('PHASE')
    expect(html).toContain('LAST CLEAR')
    expect(html).toContain('UPTIME')
    expect(html).toContain('BUILD')
  })

  it('contains the health-state string and the UMBRA wordmark', () => {
    expect(html).toContain('OPERATIONAL')
    expect(html).toContain('>UMBRA<')
    expect(html).toContain('UMBRA VENUE STATUS')
  })

  it('renders the aggregate last-clear as a public uniform price', () => {
    expect(html).toContain('$100.00 @ 14:32:07 UTC')
  })

  it('includes the feed-unreachable notice copy', () => {
    expect(html).toContain('STATUS UNAVAILABLE — cannot reach the venue. Retrying…')
  })

  it('renders the idle empty-state when there is no active round', () => {
    const idle = renderStatusHtml(buildStatus({ health: 'operational', phase: null, uptimeSeconds: 5, build: 'b' }))
    expect(idle).toContain('NO ACTIVE ROUND')
    expect(idle).toContain('— IDLE')
  })

  it('ORDER-SWEEP: the HTML contains no private order field sentinel', () => {
    const lower = html.toLowerCase()
    for (const sentinel of ORDER_SENTINELS) {
      expect(lower.includes(sentinel.toLowerCase()), `order sentinel leaked into HTML: ${sentinel}`).toBe(false)
    }
  })

  it('SECRET-SWEEP: the HTML contains no secret/token sentinel', () => {
    for (const sentinel of SECRET_SENTINELS) {
      expect(html.includes(sentinel), `secret sentinel leaked into HTML: ${sentinel}`).toBe(false)
    }
  })

  it('renders the degraded / offline health states with the red dot', () => {
    const degraded = renderStatusHtml(buildStatus({ ...FIXTURE, health: 'degraded' }))
    expect(degraded).toContain('DEGRADED')
    expect(degraded).toContain('#E2231A')
    const offline = renderStatusHtml(buildStatus({ ...FIXTURE, health: 'offline' }))
    expect(offline).toContain('OFFLINE')
  })
})
