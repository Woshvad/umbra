// solver/src/fix.ts — OPS-05: a hand-rolled FIX 4.4 order-entry subset acceptor.
//
// Lets an institutional desk submit a SEALED bid from its existing OMS over a
// familiar protocol (FIX 4.4) which maps to a `Venue.SubmitOrder` shape — WITHOUT a
// heavy FIX-engine dependency (dependency-minimalism, RESEARCH Pattern 7) and WITHOUT
// exposing any credential. This module is the pure protocol logic only:
//   • framing helpers  — bodyLength(9) / checkSum(10) to the exact FIX-spec ranges
//   • parse            — parseFix: SOH-delimited tag=value → an ordered tag→value Map
//   • build            — buildFix: re-serialize with 8/9/…/10 ordering, computing 9+10 last
//   • map              — fixToSubmitOrder: 35=D (NewOrderSingle) → a zod-validated sealed order
//   • acceptor         — handleFixMessage: 35=D → 35=8 ExecutionReport; malformed → 35=8 reject
//   • session          — Logon(A)/Heartbeat(0)/Logout(5) with a monotonic MsgSeqNum(34)
//
// HONEST LABEL (RESEARCH Pattern 7): "FIX 4.4 subset — order entry only; live OMS
// interop is a UAT gate." The HTTP-wrapped raw-FIX endpoint (POST a raw FIX string,
// get a raw ExecutionReport string) is wired in plan 13-09; this module is fully
// offline-testable in vitest against a known-good vector, with no socket lifecycle.
//
// SECURITY (T-13-12 … T-13-15 / ASVS V3, V5, V7):
//   • parseFix / handleFixMessage NEVER throw — a malformed frame degrades to a clean
//     35=8 reject (bounds-checked parse, mirrors agent.ts parseOrder never-throw discipline).
//   • fixToSubmitOrder re-validates every mapped field with a zod schema mirroring
//     agent.ts orderSchema — only numeric/enum fields for the BONDX Limit instrument
//     reach the domain; a foreign/out-of-range field → null (no free text reaches the AI).
//   • CREDENTIAL-FREE: this acceptor sits BEHIND the operator boundary and reads NO
//     operator token / ANTHROPIC_API_KEY. Nothing secret is ever interpolated into a
//     built FIX message (proven by the secret-sweep in fix.test.ts).

import { z } from 'zod'

// SOH — the FIX field separator (\x01). Every tag=value pair is SOH-terminated.
const SOH = '\x01'

// The single instrument this venue accepts over FIX (the §4 fixture bond).
const SYMBOL = 'BONDX'

// ── FixFields — an ORDER-PRESERVING tag→value map ────────────────────────────────
// A JS Map preserves insertion order, so parse→build round-trips byte-exact: the
// body fields re-serialize in their original sequence (8 and 9 are forced first, 10 last).
export type FixFields = Map<string, string>

// ── The sealed-order shape produced from a 35=D NewOrderSingle ────────────────────
// Byte-mirrors the {side, qty, limit} that a `Venue.SubmitOrder` needs; the desk still
// confirms/seals on-ledger — this only maps the wire order to the domain shape.
export interface SubmitOrder {
  side: 'Buy' | 'Sell'
  qty: number
  limit: number
}

// Verify-side zod schema (zod 3) — mirrors agent.ts orderSchema. Re-validates the
// (untrusted) inbound FIX fields before they can reach the domain: an integer qty > 0
// and a number limit > 0 (ASVS V5). Any failure → null (never throw).
const submitOrderSchema = z.object({
  side: z.enum(['Buy', 'Sell']),
  qty: z.number().int().positive(),
  limit: z.number().positive(),
})

// ── bodyLength(9) — FIX-spec byte count ──────────────────────────────────────────
// = the byte count from AFTER `9=<n>\x01` up to and INCLUDING the `\x01` before `10=`.
// Anchored on SOH boundaries so a value containing digits can never mis-locate the range.
export function bodyLength(msg: string): number {
  if (typeof msg !== 'string') return 0
  const nine = msg.indexOf(SOH + '9=')
  if (nine < 0) return 0
  const nineEnd = msg.indexOf(SOH, nine + 1) // the SOH terminating `9=<n>`
  if (nineEnd < 0) return 0
  const bodyStart = nineEnd + 1
  const ten = msg.indexOf(SOH + '10=') // the SOH immediately before `10=`
  if (ten < 0 || ten + 1 < bodyStart) return 0
  // [bodyStart, ten+1) — includes the SOH before `10=`.
  return Buffer.byteLength(msg.slice(bodyStart, ten + 1), 'latin1')
}

// ── checkSum(10) — FIX-spec modular checksum ─────────────────────────────────────
// = (sum of ALL bytes up to and INCLUDING the `\x01` before `10=`) mod 256, 3-digit
// zero-padded. Given a string with no `10=` yet, sums the whole string (buildFix relies
// on this: it passes the pre-checksum prefix which already ends with that SOH).
export function checkSum(msg: string): string {
  if (typeof msg !== 'string') return '000'
  const ten = msg.indexOf(SOH + '10=')
  const end = ten < 0 ? msg.length : ten + 1 // up to and incl the SOH before `10=`
  const buf = Buffer.from(msg.slice(0, end), 'latin1')
  let sum = 0
  for (const b of buf) sum += b
  return String(sum % 256).padStart(3, '0')
}

// ── parseFix — SOH-delimited tag=value → an ordered Map (never throws) ────────────
// A malformed frame (empty, no fields, an empty/non-numeric tag, a segment without `=`,
// or no MsgType(35)) maps to null — the caller degrades to a clean reject.
export function parseFix(raw: string): FixFields | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const segs = raw.split(SOH).filter((s) => s.length > 0)
  if (segs.length === 0) return null
  const fields: FixFields = new Map()
  for (const seg of segs) {
    const eq = seg.indexOf('=')
    if (eq <= 0) return null // no `=`, or an empty tag → malformed
    const tag = seg.slice(0, eq)
    if (!/^\d+$/.test(tag)) return null // a FIX tag is a positive integer
    fields.set(tag, seg.slice(eq + 1))
  }
  if (!fields.has('35')) return null // every FIX message carries a MsgType(35)
  return fields
}

// ── buildFix — re-serialize with correct 8/9/…/10 ordering, computing 9 and 10 last ─
// 8(BeginString) and 9(BodyLength) are forced FIRST, then the body fields in their map
// order, then 10(CheckSum) LAST. Any stale 8/9/10 in the input map are IGNORED and
// recomputed — so buildFix(parseFix(vector)) === vector byte-for-byte.
export function buildFix(fields: FixFields): string {
  const beginString = fields.get('8') ?? 'FIX.4.4'
  let bodyStr = ''
  for (const [tag, val] of fields) {
    if (tag === '8' || tag === '9' || tag === '10') continue
    bodyStr += `${tag}=${val}${SOH}`
  }
  const bl = Buffer.byteLength(bodyStr, 'latin1')
  const preCsum = `8=${beginString}${SOH}9=${bl}${SOH}${bodyStr}`
  // preCsum ends with the SOH before `10=`, so checkSum(preCsum) sums the exact range.
  return `${preCsum}10=${checkSum(preCsum)}${SOH}`
}

// ── fixToSubmitOrder — 35=D NewOrderSingle → a zod-validated sealed order ─────────
// Maps 55 Symbol(BONDX) / 54 Side(1 Buy | 2 Sell) / 38 OrderQty / 44 Price / 40
// OrdType(2 Limit) → {side, qty, limit}. A foreign symbol, a non-Limit type, an
// out-of-range Side, or a non-positive/non-integer qty → null. NEVER throws.
export function fixToSubmitOrder(fields: FixFields | null): SubmitOrder | null {
  try {
    if (!fields || fields.get('35') !== 'D') return null
    if (fields.get('55') !== SYMBOL) return null // only the BONDX instrument
    if (fields.get('40') !== '2') return null // only OrdType 2 (Limit)
    const sideRaw = fields.get('54')
    const side = sideRaw === '1' ? 'Buy' : sideRaw === '2' ? 'Sell' : undefined
    const qty = Number(fields.get('38'))
    const limit = Number(fields.get('44'))
    const parsed = submitOrderSchema.safeParse({ side, qty, limit })
    return parsed.success ? parsed.data : null
  } catch {
    return null // defense-in-depth: any unexpected throw degrades to a clean null
  }
}

// ── FixSession — minimal session state with a monotonic outbound MsgSeqNum(34) ────
// SenderCompID(49) is the venue; TargetCompID(56) is the desk. outSeqNum increments on
// EVERY outbound message (session-integrity control, ASVS V3 / T-13-13).
export interface FixSession {
  senderCompId: string
  targetCompId: string
  outSeqNum: number
}

export function newFixSession(
  senderCompId = 'UMBRA_VENUE',
  targetCompId = 'UMBRA_OMS',
): FixSession {
  return { senderCompId, targetCompId, outSeqNum: 0 }
}

// A framed outbound message with common session tags (35/49/56/34) + extra body fields.
// bumps the monotonic MsgSeqNum. buildFix recomputes 9/10, so the placeholders are inert.
function buildOutbound(session: FixSession, msgType: string, extra: Array<[string, string]>): string {
  session.outSeqNum += 1
  const fields: FixFields = new Map()
  fields.set('8', 'FIX.4.4')
  fields.set('9', '0') // recomputed by buildFix
  fields.set('35', msgType)
  fields.set('49', session.senderCompId)
  fields.set('56', session.targetCompId)
  fields.set('34', String(session.outSeqNum))
  for (const [tag, val] of extra) fields.set(tag, val)
  fields.set('10', '000') // recomputed by buildFix
  return buildFix(fields)
}

// An ExecutionReport(35=8). ordStatus: '0' New (accepted) | '8' Rejected. Only mapped,
// non-secret fields are echoed; OrderID/ExecID are derived from the seq counter (no PII,
// no credential). execType mirrors ordStatus (150).
function buildExecReport(
  session: FixSession,
  ordStatus: '0' | '8',
  order: SubmitOrder | null,
  reason?: string,
): string {
  const seq = session.outSeqNum + 1 // the value buildOutbound will assign
  const extra: Array<[string, string]> = [
    ['37', `ORD-${seq}`], // OrderID
    ['17', `EXEC-${seq}`], // ExecID
    ['150', ordStatus], // ExecType (0 New / 8 Rejected)
    ['39', ordStatus], // OrdStatus (0 New / 8 Rejected)
    ['55', SYMBOL], // Symbol (always the venue instrument)
  ]
  if (order) {
    extra.push(['54', order.side === 'Buy' ? '1' : '2'])
    extra.push(['38', String(order.qty)])
    extra.push(['44', String(order.limit)])
    extra.push(['40', '2']) // Limit
  }
  if (ordStatus === '8') extra.push(['58', reason ?? 'Rejected']) // Text — fixed, secret-free
  return buildOutbound(session, '8', extra)
}

// ── handleFixMessage — the acceptor entry point (NEVER throws) ────────────────────
// • 35=D valid & mappable → a 35=8 ExecutionReport, OrdStatus 0 (New).
// • 35=D unmappable, OR a malformed frame, OR an unknown MsgType → a 35=8 reject, OrdStatus 8.
// • 35=A / 35=0 / 35=5 (Logon/Heartbeat/Logout) → the same session control type echoed back.
// Every branch bumps the monotonic MsgSeqNum via buildOutbound/buildExecReport.
export function handleFixMessage(raw: string, session: FixSession): string {
  const fields = parseFix(raw)
  if (!fields) {
    // Malformed frame — a clean reject, never a throw (T-13-12).
    return buildExecReport(session, '8', null, 'Malformed FIX frame')
  }
  const msgType = fields.get('35')
  switch (msgType) {
    case 'A': // Logon
    case '0': // Heartbeat
    case '5': // Logout
      return buildOutbound(session, msgType, [])
    case 'D': {
      const order = fixToSubmitOrder(fields)
      if (!order) return buildExecReport(session, '8', null, 'Unmapped order')
      return buildExecReport(session, '0', order) // New (accepted)
    }
    default:
      return buildExecReport(session, '8', null, 'Unsupported MsgType')
  }
}
