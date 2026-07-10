// solver/src/logger.ts — OPS-01 secret-redacting structured JSON logger (zero-dep).
//
// Every line is a single JSON object with `ts` (ISO-8601), `level`, `msg`, and the
// caller's fields — recursively REDACTED so a value under a secret-shaped key
// (anything containing "token"/"key", or exactly authorization/cookie/secret/password/
// env) is replaced with '[REDACTED]' before it can reach stdout. When a span is active
// the current `trace.id` is attached for log↔trace correlation.
//
// This mirrors — and hardens — the existing secret-free discipline in agent.ts/
// ledger.ts: the PRIMARY guarantee is still that secrets are never passed into log
// fields at the call site; the redactor is belt-and-suspenders on top (T-13-01,
// ASVS V7). No dependency (no pino/winston — locked, 13-CONTEXT Area 1). Callers pass
// `err.name` only, NEVER `err.message` or a raw Error object.

import { trace } from '@opentelemetry/api'

// A key is secret-shaped if it contains "token" or "key" anywhere, or is exactly one of
// authorization/cookie/secret/password/env (case-insensitive). Matches keys like
// `apiKey`, `operatorToken`, `ANTHROPIC_API_KEY`, `Authorization`, `env`.
const SECRET_KEY = /(?:token|key|authorization|cookie|secret|password|env)/i

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
      SECRET_KEY.test(k) ? '[REDACTED]' : redact(v, seen),
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
