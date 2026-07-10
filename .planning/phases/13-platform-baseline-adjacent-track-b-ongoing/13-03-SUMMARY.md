---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 03
subsystem: solver
tags: [idempotency, fsm, round-lifecycle, express-middleware, node-crypto, reliability]

# Dependency graph
requires:
  - phase: 13-platform-baseline-adjacent-track-b-ongoing
    plan: "01"
    provides: "solver test/DI conventions (co-located vitest, secret-sweep discipline)"
provides:
  - "Idempotency store + Express middleware (solver/src/idempotency.ts) — dedupe mutating POSTs by (Idempotency-Key, sha256(canonical body)); 422 on cross-body reuse"
  - "Pure round-lifecycle transition guard (solver/src/fsm.ts) — Open->Closed->Cleared->Settled; 409 ILLEGAL_TRANSITION on illegal edges; Sealed display alias"
  - "Error codes: IDEMPOTENCY_KEY_REUSED (422), ILLEGAL_TRANSITION (409); header consumed: Idempotency-Key"
affects: [13-07-endpoint-wiring, reliability, round-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotency keyed by (client key, sha256(canonicalized body)): canonicalJson sorts object keys recursively so JSON reordering never triggers a false 422 (Pitfall 4)"
    - "Response-capture via res.json monkey-patch records the FIRST response after the handler resolves; replays byte-identical status+body without re-executing"
    - "Pure FSM guard with a LEGAL: Record<RoundStatus, RoundStatus[]> table mirroring clock.ts NON_OPEN guard-set; ledger Round.status stays authoritative"
    - "Sealed is a DISPLAY ALIAS for Closed only — the wire/Daml RoundStatus enum is byte-unchanged (grep-asserted), so web/daml.js decode is untouched"

key-files:
  created:
    - solver/src/idempotency.ts
    - solver/src/idempotency.test.ts
    - solver/src/fsm.ts
    - solver/src/fsm.test.ts
  modified: []

key-decisions:
  - "Idempotency middleware is OPT-IN by (method===POST AND Idempotency-Key present) — a request without the header passes through untouched and nothing is stored (RESEARCH Open Question 2)"
  - "422 reuse response emits the secret-safe {error:{code,message}} envelope directly (not a throw) so the middleware is standalone-testable regardless of whether api.ts's error middleware is wired yet"
  - "fsm.ts re-declares a minimal structurally-identical ApiError instead of importing api.ts — importing would create an api.ts<->fsm.ts import cycle once the guard is wired in 13-07; name='ApiError' + {status,code} keeps the envelope identical"
  - "In-memory TTL-bounded store (default 24h) with an injectable now() clock for deterministic TTL tests; documented Postgres swap is the multi-instance path (out of scope for the single-operator demo)"

patterns-established:
  - "Standalone reliability guards unit-tested against a throwaway express app on listen(0) + global fetch, exercising real express.json() ordering before the middleware hashes req.body"
  - "Enum-invariant regression guard: a test greps clock.ts for the exact RoundStatus union and asserts 'Sealed' is absent from the wire enum"

requirements-completed: [OPS-03]

# Metrics
duration: 8min
completed: 2026-07-10
---

# Phase 13 Plan 03: OPS-03 Idempotency Store/Middleware + Round-Lifecycle FSM Summary

**Two pure, standalone solver reliability guards: an idempotency store + Express middleware that dedupes mutating POSTs by `(Idempotency-Key, sha256(canonical body))` (replay the original response, 422 on cross-body reuse, passthrough without a key), and a pure round-lifecycle FSM that rejects illegal transitions (409) while accepting only `Open→Closed→Cleared→Settled` — with `Sealed` as a display alias for `Closed` and the wire/Daml enum left byte-unchanged.**

## Performance

- **Duration:** 8 min
- **Tasks:** 2 (both TDD: RED test commit → GREEN impl commit)
- **Files created:** 4
- **Tests:** 14 new (7 idempotency + 7 FSM); full solver suite 199/199 green

## What Was Built

### Task 1 — `solver/src/idempotency.ts` (+ test)
- `createIdempotency(opts?)` → `{ middleware, store }`; `idempotencyMiddleware(store, opts?)` factory; exported `canonicalJson` helper.
- Opt-in: no-op unless method is `POST` **and** an `Idempotency-Key` header is present.
- `bodyHash = createHash('sha256').update(canonicalJson(req.body ?? {})).digest('hex')`; `canonicalJson` sorts object keys recursively (arrays keep order) so a reordered body is treated as the SAME body (replay), never a false 422.
- Same key + same body → replays the stored `status`+`body`, handler runs exactly once (proven via a call counter).
- Same key + different body → `422 { error: { code: 'IDEMPOTENCY_KEY_REUSED', message } }`.
- TTL-bounded in-memory `Map<key, Entry>` (default 24h) with injectable `now()`; expired entries treated as new.
- Register-order comment: MUST run after `express.json()`. Secret-safe: only `{ bodyHash, status, body, at }` stored — a secret-sweep test asserts an `Authorization` sentinel never lands in the store.

### Task 2 — `solver/src/fsm.ts` (+ test)
- `LEGAL: Record<RoundStatus, RoundStatus[]>` = `{ Open:['Closed'], Closed:['Cleared'], Cleared:['Settled'], Settled:[] }`.
- Pure `transition(from, to)` returns `to` on a legal edge, else throws `ApiError(409, 'ILLEGAL_TRANSITION', 'cannot go from→to')`.
- `sealedAlias(status)` maps `Closed → 'Sealed'` for DISPLAY only; every other status is unchanged.
- Reuses `RoundStatus` from `clock.ts` — the wire/Daml enum is NOT renamed. A test greps `clock.ts` for the exact union and asserts `'Sealed'` is absent.

## Deviations from Plan

None — plan executed exactly as written. Two sanctioned choices within the plan's stated latitude: (1) the 422 reuse response is emitted directly rather than thrown (the plan allowed "throw/emit"), keeping the middleware standalone-testable; (2) `fsm.ts` re-declares a minimal structurally-identical `ApiError` (the plan's explicit fallback) because importing `api.ts` would create an `api.ts↔fsm.ts` cycle once the guard is wired in plan 13-07 — `api.ts` does not export `ApiError`.

## Known Stubs

None. Both modules are complete and fully unit-tested standalone. Wiring the middleware and guard into the Express app (`createApp(deps)` / `index.ts`) is the explicit responsibility of plan 13-07 per this plan's objective.

## Verification

- `cd solver && npx vitest run src/idempotency.test.ts src/fsm.test.ts` → 14/14 green.
- `cd solver && npx tsc --noEmit` → clean.
- `cd solver && npx vitest run` → 199/199 green; §4 fixture still clears at exactly $100.00 (auction/settlement suites unchanged).
- Enum invariant: `clock.ts` `RoundStatus` union is byte-unchanged (`Open | Closed | Cleared | Settled`); `Sealed` is not in the wire enum.

## Self-Check: PASSED

- FOUND: solver/src/idempotency.ts
- FOUND: solver/src/idempotency.test.ts
- FOUND: solver/src/fsm.ts
- FOUND: solver/src/fsm.test.ts
- FOUND commit 356d041 (test: idempotency)
- FOUND commit 234961e (feat: idempotency)
- FOUND commit 838f99c (test: fsm)
- FOUND commit 1ebb910 (feat: fsm)
