// solver/src/fix.test.ts — the executable contract for the OPS-05 hand-rolled
// FIX 4.4 order-entry subset acceptor (T-13-12 … T-13-15).
//
// TDD: authored BEFORE solver/src/fix.ts exists — EXPECTED to fail at the RED step
// (the module is absent). Proven here:
//   • bodyLength(9) + checkSum(10) equal the PRECOMPUTED values of a hard-coded
//     known-good FIX 4.4 NewOrderSingle vector (the FIX-spec regression anchor).
//   • buildFix(parseFix(vector)) === vector (byte-exact round-trip).
//   • a 35=D message maps to the correct sealed {side, qty, limit} via fixToSubmitOrder.
//   • a foreign symbol / out-of-range field maps to null (never throws).
//   • a malformed frame → a 35=8 ExecutionReport reject; handleFixMessage NEVER throws.
//   • session Logon(A)/Heartbeat(0)/Logout(5) recognized; MsgSeqNum(34) is monotonic.
//   • SECRET-SWEEP: no operator-token / ANTHROPIC_API_KEY sentinel appears in any
//     built FIX output (the acceptor is credential-free, behind the operator boundary).

import { describe, it, expect } from 'vitest'
import {
  parseFix,
  buildFix,
  bodyLength,
  checkSum,
  fixToSubmitOrder,
  handleFixMessage,
  newFixSession,
} from './fix.js'

const SOH = '\x01'

// ── The known-good FIX 4.4 NewOrderSingle vector (35=D) ──────────────────────────
// Hard-coded, with independently-precomputed BodyLength(9)=70 and CheckSum(10)=065.
// A desk (UMBRA_OMS) submits a Buy of 10 BONDX at a 100 limit (OrdType 2 = Limit).
const VECTOR =
  '8=FIX.4.4' + SOH +
  '9=70' + SOH +
  '35=D' + SOH +
  '49=UMBRA_OMS' + SOH +
  '56=UMBRA_VENUE' + SOH +
  '34=1' + SOH +
  '55=BONDX' + SOH +
  '54=1' + SOH +
  '38=10' + SOH +
  '44=100' + SOH +
  '40=2' + SOH +
  '10=065' + SOH

const EXPECTED_BODYLENGTH = 70
const EXPECTED_CHECKSUM = '065'

// Sentinels that must NEVER appear in any FIX output.
const OPERATOR_TOKEN_SENTINEL = 'operator_token_do_not_leak_XYZ789'
const ANTHROPIC_KEY_SENTINEL = 'sk-ant-DO-NOT-LEAK-abc123'

describe('fix — framing helpers (BodyLength / CheckSum) against a known-good vector', () => {
  it('bodyLength matches the precomputed FIX-spec value', () => {
    expect(bodyLength(VECTOR)).toBe(EXPECTED_BODYLENGTH)
  })

  it('checkSum matches the precomputed 3-digit value (mod 256, zero-padded)', () => {
    expect(checkSum(VECTOR)).toBe(EXPECTED_CHECKSUM)
  })

  it('checkSum is always a 3-digit zero-padded string', () => {
    expect(checkSum(VECTOR)).toMatch(/^\d{3}$/)
  })
})

describe('fix — parse / build round-trip', () => {
  it('parseFix decodes the SOH-delimited tag=value pairs', () => {
    const f = parseFix(VECTOR)
    expect(f).not.toBeNull()
    expect(f!.get('35')).toBe('D')
    expect(f!.get('55')).toBe('BONDX')
    expect(f!.get('54')).toBe('1')
    expect(f!.get('38')).toBe('10')
    expect(f!.get('44')).toBe('100')
    expect(f!.get('40')).toBe('2')
  })

  it('buildFix(parseFix(vector)) === vector (byte-exact, recomputing 9 and 10)', () => {
    const f = parseFix(VECTOR)
    expect(f).not.toBeNull()
    expect(buildFix(f!)).toBe(VECTOR)
  })

  it('buildFix recomputes BodyLength/CheckSum even if the input map carries stale 9/10', () => {
    const f = parseFix(VECTOR)!
    f.set('9', '999') // stale
    f.set('10', '111') // stale
    expect(buildFix(f)).toBe(VECTOR)
  })
})

describe('fix — parseFix never throws on malformed input', () => {
  it('empty / SOH-only / no-MsgType / non-numeric-tag → null (no throw)', () => {
    expect(parseFix('')).toBeNull()
    expect(parseFix(SOH + SOH)).toBeNull()
    expect(parseFix('49=X' + SOH)).toBeNull() // no 35=
    expect(parseFix('=D' + SOH)).toBeNull() // empty tag
    expect(parseFix('foo=bar' + SOH)).toBeNull() // non-numeric tag
    expect(parseFix('35' + SOH)).toBeNull() // no '='
  })
})

describe('fix — fixToSubmitOrder maps 35=D → a validated sealed order', () => {
  it('a Buy NewOrderSingle → {side:Buy, qty:10, limit:100}', () => {
    const order = fixToSubmitOrder(parseFix(VECTOR)!)
    expect(order).toEqual({ side: 'Buy', qty: 10, limit: 100 })
  })

  it('a Sell NewOrderSingle → {side:Sell, ...}', () => {
    const sell = VECTOR.replace('54=1' + SOH, '54=2' + SOH)
    const order = fixToSubmitOrder(parseFix(sell)!)
    expect(order?.side).toBe('Sell')
  })

  it('a foreign symbol (55≠BONDX) → null', () => {
    const foreign = VECTOR.replace('55=BONDX' + SOH, '55=AAPL' + SOH)
    expect(fixToSubmitOrder(parseFix(foreign)!)).toBeNull()
  })

  it('a non-Limit OrdType (40≠2) → null', () => {
    const market = VECTOR.replace('40=2' + SOH, '40=1' + SOH)
    expect(fixToSubmitOrder(parseFix(market)!)).toBeNull()
  })

  it('a zero / negative / non-integer qty → null (zod re-validation)', () => {
    const zero = VECTOR.replace('38=10' + SOH, '38=0' + SOH)
    expect(fixToSubmitOrder(parseFix(zero)!)).toBeNull()
    const frac = VECTOR.replace('38=10' + SOH, '38=1.5' + SOH)
    expect(fixToSubmitOrder(parseFix(frac)!)).toBeNull()
  })

  it('an out-of-range Side (54=9) → null (never throws)', () => {
    const bad = VECTOR.replace('54=1' + SOH, '54=9' + SOH)
    expect(fixToSubmitOrder(parseFix(bad)!)).toBeNull()
  })
})

describe('fix — handleFixMessage: 35=D → 35=8 ExecutionReport, malformed → reject', () => {
  it('a valid 35=D returns a 35=8 with OrdStatus 0 (New) and never throws', () => {
    const session = newFixSession()
    const report = handleFixMessage(VECTOR, session)
    const f = parseFix(report)
    expect(f).not.toBeNull()
    expect(f!.get('35')).toBe('8') // ExecutionReport
    expect(f!.get('39')).toBe('0') // OrdStatus New
    // The report is itself a well-framed FIX message (checksum self-consistent).
    expect(checkSum(report)).toBe(f!.get('10'))
  })

  it('a malformed frame returns a 35=8 with OrdStatus 8 (Rejected) and does NOT throw', () => {
    const session = newFixSession()
    let report = ''
    expect(() => {
      report = handleFixMessage('utter garbage not fix', session)
    }).not.toThrow()
    const f = parseFix(report)
    expect(f).not.toBeNull()
    expect(f!.get('35')).toBe('8')
    expect(f!.get('39')).toBe('8') // Rejected
  })

  it('a 35=D with an unmappable field (foreign symbol) → 35=8 Rejected', () => {
    const session = newFixSession()
    const foreign = VECTOR.replace('55=BONDX' + SOH, '55=AAPL' + SOH)
    const f = parseFix(handleFixMessage(foreign, session))!
    expect(f.get('35')).toBe('8')
    expect(f.get('39')).toBe('8')
  })
})

describe('fix — session layer: Logon/Heartbeat/Logout + monotonic MsgSeqNum', () => {
  it('recognizes Logon(A)/Heartbeat(0)/Logout(5)', () => {
    const s = newFixSession()
    const logon = '8=FIX.4.4' + SOH + '9=0' + SOH + '35=A' + SOH + '49=UMBRA_OMS' + SOH + '56=UMBRA_VENUE' + SOH + '34=1' + SOH + '10=000' + SOH
    const hb = '8=FIX.4.4' + SOH + '9=0' + SOH + '35=0' + SOH + '49=UMBRA_OMS' + SOH + '56=UMBRA_VENUE' + SOH + '34=2' + SOH + '10=000' + SOH
    const logout = '8=FIX.4.4' + SOH + '9=0' + SOH + '35=5' + SOH + '49=UMBRA_OMS' + SOH + '56=UMBRA_VENUE' + SOH + '34=3' + SOH + '10=000' + SOH
    expect(parseFix(handleFixMessage(logon, s))!.get('35')).toBe('A')
    expect(parseFix(handleFixMessage(hb, s))!.get('35')).toBe('0')
    expect(parseFix(handleFixMessage(logout, s))!.get('35')).toBe('5')
  })

  it('MsgSeqNum(34) is strictly monotonic across outbound messages', () => {
    const s = newFixSession()
    const r1 = parseFix(handleFixMessage(VECTOR, s))!
    const r2 = parseFix(handleFixMessage(VECTOR, s))!
    const r3 = parseFix(handleFixMessage('garbage', s))!
    const n1 = Number(r1.get('34'))
    const n2 = Number(r2.get('34'))
    const n3 = Number(r3.get('34'))
    expect(n2).toBeGreaterThan(n1)
    expect(n3).toBeGreaterThan(n2)
  })
})

describe('fix — SECRET-SWEEP: no credential leaks into any FIX output', () => {
  it('no operator-token / ANTHROPIC_API_KEY sentinel appears in a built ExecutionReport', () => {
    const prevOp = process.env.OPERATOR_TOKEN
    const prevKey = process.env.ANTHROPIC_API_KEY
    process.env.OPERATOR_TOKEN = OPERATOR_TOKEN_SENTINEL
    process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY_SENTINEL
    try {
      const s = newFixSession()
      const outputs = [
        handleFixMessage(VECTOR, s),
        handleFixMessage('garbage', s),
        buildFix(parseFix(VECTOR)!),
      ]
      for (const out of outputs) {
        expect(out).not.toContain(OPERATOR_TOKEN_SENTINEL)
        expect(out).not.toContain(ANTHROPIC_KEY_SENTINEL)
        expect(out.toLowerCase()).not.toContain('sk-ant-')
      }
    } finally {
      if (prevOp === undefined) delete process.env.OPERATOR_TOKEN
      else process.env.OPERATOR_TOKEN = prevOp
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prevKey
    }
  })
})
