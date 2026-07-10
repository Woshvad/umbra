# Phase 14 — Deferred / Out-of-Scope Items

Discoveries logged during execution that are NOT caused by this phase's changes.

## Pre-existing (not introduced by Phase 14)

- **`solver/src/idempotency.test.ts:193` — `tsc --noEmit` error TS2571** ("Object is of
  type 'unknown'"). `(await inflight.json()).error.code` dereferences a `fetch` `Response.json()`
  result, which `@types/node@20.16.5` types as `Promise<unknown>`. Verified present WITHOUT the
  Phase 14 files (`x402.ts` / `x402.test.ts` moved aside → the error remains). This is an OPS-03
  test-file typing gap, unrelated to PAY-01. Left untouched per the executor scope boundary
  (only auto-fix issues caused by the current task). Trivial fix when idempotency.ts is next
  touched: narrow the `.json()` result (as done in `x402.test.ts` via a `body()` helper).
