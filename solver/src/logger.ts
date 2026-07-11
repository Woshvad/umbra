// solver/src/logger.ts — OPS-01 secret-redacting structured JSON logger (zero-dep).
//
// Every line is a single JSON object with `ts` (ISO-8601), `level`, `msg`, and the
// caller's fields — recursively REDACTED so a value under a secret-shaped key
// (whose FINAL word-component is token/key, or which is exactly authorization/cookie/
// secret/password/env) is replaced with '[REDACTED]' before it can reach stdout. Benign
// keys that merely contain a secret substring (tokenCount, keyframes, environment) are NOT
// over-redacted (LO-03). When a span is active
// the current `trace.id` is attached for log↔trace correlation.
//
// This mirrors — and hardens — the existing secret-free discipline in agent.ts/
// ledger.ts: the PRIMARY guarantee is still that secrets are never passed into log
// fields at the call site; the redactor is belt-and-suspenders on top (T-13-01,
// ASVS V7). No dependency (no pino/winston — locked, 13-CONTEXT Area 1). Callers pass
// `err.name` only, NEVER `err.message` or a raw Error object.

import { trace } from '@opentelemetry/api'

// LO-03: match secret-shaped keys by WORD COMPONENT, not raw substring, so benign keys
// that merely CONTAIN a secret word are not over-redacted (`tokenCount`, `monkey`,
// `turnkey`, `keyframes`, `environment`, `event`) while real secret keys in any common
// casing still redact. Two tiers:
//   • EXACT_SECRET — redacts only when it is the WHOLE key (authorization/cookie/secret/
//     password/env) so `environment`/`eventId` pass through.
//   • SUFFIX_SECRET — redacts when it is the FINAL word-component (camelCase / _-/ split),
//     so `apiKey`/`operatorToken`/`ANTHROPIC_API_KEY`/`sessionKey`/`bearerToken`/`clientSecret`/
//     `OIDC_CLIENT_SECRET`/`LOCALNET_JWT_SECRET` redact but `tokenCount` (token is a PREFIX) does
//     not. `secret` is a suffix component too (not only a whole-key EXACT match) so compound
//     secret keys like `clientSecret` are caught (secret-hygiene fix).
const EXACT_SECRET = new Set(['authorization', 'cookie', 'secret', 'password', 'env'])
const SUFFIX_SECRET = new Set(['key', 'token', 'secret'])

// Split a key into lowercase word components on camelCase boundaries + non-alphanumeric
// separators: `ANTHROPIC_API_KEY` → [anthropic, api, key]; `operatorToken` → [operator, token].
const keyComponents = (key: string): string[] =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean)

const isSecretKey = (key: string): boolean => {
  if (EXACT_SECRET.has(key.toLowerCase())) return true
  const comps = keyComponents(key)
  const last = comps[comps.length - 1]
  return last !== undefined && SUFFIX_SECRET.has(last)
}

// Recursively redact secret-shaped keys. Arrays are walked element-wise; primitives pass
// through unchanged. Cycles are guarded so a self-referential object can't loop forever.
export const redact = (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return '[CIRCULAR]'
  seen.add(value as object)

  if (Array.isArray(value)) return value.map((v) => redact(v, seen))

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      isSecretKey(k) ? '[REDACTED]' : redact(v, seen),
    ]),
  )
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Emit one JSON line: { ts, level, msg, trace.id?, ...redact(fields) }. The active span's
// traceId (when present) is added under `trace.id` for correlation. `fields` is redacted;
// `msg`/`level` are caller-controlled fixed strings (never a secret — call-site discipline).
export const log = (
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> = {},
): void => {
  const traceId = trace.getActiveSpan()?.spanContext().traceId
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(traceId ? { 'trace.id': traceId } : {}),
    ...(redact(fields) as Record<string, unknown>),
  }
  const line = JSON.stringify(record)
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}
