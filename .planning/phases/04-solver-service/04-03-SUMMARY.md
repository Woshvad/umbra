---
phase: 04-solver-service
plan: 03
subsystem: solver
tags: [typescript, node-esm, express, cors, zod, http-api, vitest, secret-boundary]

# Dependency graph
requires:
  - phase: 04-solver-service
    plan: 01
    provides: "solver/src/auction.ts pure §8 helpers (computeClearing/matchedAt/demandAt/supplyAt/candidatePrices) + OrderView/Allocation/ClearingResult types"
  - phase: 04-solver-service
    plan: 02
    provides: "solver/src/ledger.ts Operator client (openRound/queryRound/readSealedOrders/refreshStats/closeRound/settle)"
provides:
  - "solver/src/api.ts — createApp(deps) Express 4.19 factory exposing the 5 spec §11 endpoints on :4000 with CORS(:5173), zod-validated POST /round, a secret-safe error envelope, refreshStats-backed sealedOrderCount on GET, and matchedAt-derived matchedVolume on solve-preview/settle"
  - "solver/src/api.test.ts — 5 vitest tests (refreshStats wire, §4 solve-preview 100.00 + matchedVolume 10, no-secret-in-response, double-settle 409, CORS scope) over stubbed ledger deps + real §8 helpers"
affects: [solver-clock (Plan 04-04), phase-05-ai-agent (rationale seam), phase-06-frontend-chart (curve points)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createApp(deps) dependency-injection factory: ledger functions + pure §8 helpers injected so tests run with no live sandbox"
    - "express 4 async handlers wrapped in a wrap() bridge — next(err) forwarding (express 4 does not auto-catch async rejections)"
    - "Secret-safe error middleware: ApiError carries an authored secret-free message; any non-ApiError collapses to a generic 500 so a raw exception never reaches the client"
    - "CORS scoped to a literal origin (http://localhost:5173), never '*'"
    - "Tests drive HTTP via Node built-in fetch against app.listen(0) — no supertest dependency"

key-files:
  created:
    - solver/src/api.ts
    - solver/src/api.test.ts
  modified: []

key-decisions:
  - "matchedVolume is NOT a field on ClearingResult — solve-preview/settle/GET derive it at the route via matchedAt(views, clearingPrice). This is the populated-from-helper field, not a declared-but-undefined stub (the RESEARCH WARNING fix)."
  - "GET /round/:id calls refreshStats(id) FIRST so the returned sealedOrderCount is the solver-recomputed value (BLOCKER fix), then queryRound for status; clearingPrice/matchedVolume/curve/rationale are added only once status is Cleared/Settled."
  - "AppDeps re-declares minimal RoundView/SealedOrder/SettleResult shapes (structurally compatible with ledger.ts returns) so api.ts depends on a narrow injected interface, not the ledger module directly — keeps the unit tests ledger-free."
  - "fetch().json() is typed unknown under strict TS; tests use a readJson() helper casting to Record<string, any> so response-shape assertions stay readable (the tests ARE the type check)."

requirements-completed: [SOLV-03, SOLV-04, CLEAR-02]
requirements-advanced: [SOLV-01]  # GET /round/:id is the live refreshStats call site; full open→close→settle lifecycle orchestration completes in Plan 04-04

# Metrics
duration: 6min
completed: 2026-06-26
---

# Phase 4 Plan 03: Solver Express API (§11 surface) Summary

**`solver/src/api.ts` is the consumer-facing HTTP contract of the solver — a `createApp(deps)` Express 4.19 factory exposing exactly the five spec §11 endpoints on :4000, with CORS locked to the Vite origin, a zod-validated `POST /round`, a structured error envelope that never serializes the Operator token or Anthropic key, a `refreshStats`-backed `sealedOrderCount` on GET (solver-maintained, not a stale seed), and a deterministic `solve-preview` that returns the §4 fixture's 100.00 clearing price + matchedVolume 10 + supply/demand curve + `rationale:null` without settling — all proven by five vitest tests against stubbed ledger deps and the real §8 helpers.**

## Performance
- **Duration:** ~6 min
- **Tasks:** 2 completed
- **Files created:** 2 (`api.ts` 258 lines, `api.test.ts` 211 lines)

## Accomplishments
- **The 5 §11 endpoints (Task 1):** `createApp(deps)` mounts `express.json()` + `cors({ origin: 'http://localhost:5173' })` and wires `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle` — exactly the spec surface, no extra public routes. Ledger functions and the pure §8 helpers are dependency-injected via the `AppDeps` interface so the test suite runs with no live sandbox.
- **refreshStats wire (the BLOCKER fix):** `GET /round/:id` calls `refreshStats(id)` FIRST and returns that recomputed count as `sealedOrderCount` — the count the solver maintains, advancing off a stale Phase-3 seed — then reads status via `queryRound`. After clear/settle the body additively gains `clearingPrice / matchedVolume / curve / rationale:null`.
- **matchedVolume derivation (the WARNING fix):** `solve-preview` runs `computeClearing(views)` then derives `matchedVolume = matchedAt(views, clearingPrice)` (the field is NOT on `ClearingResult`), builds `curve` from `candidatePrices().map(p => ({ price, demand: demandAt, supply: supplyAt }))`, and returns `rationale:null` — computing the proposal but NOT settling. The `curve` points are exactly the data the Phase-6 SVG crossing chart needs; `rationale` is the additive seam for the Phase-5 Claude rationale.
- **Secret boundary (SOLV-04 / V7):** a single error middleware produces `{ error: { code, message } }`. Known `ApiError`s carry an authored, secret-free message; any other thrown error collapses to a generic `500 internal solver error` so a raw exception (which could embed a path/token) never reaches the client. No response or envelope references the Operator token, `ANTHROPIC_API_KEY`, `process.env`, or request headers. zod validation failures on `POST /round` map to a sanitized `400` (field + reason only).
- **Double-settle guard (T-04-06):** `POST /round/:id/settle` re-queries the round and returns `409 ALREADY_SETTLED` if the status is already `Cleared`/`Settled`, layered on top of `Round.Clear`'s on-ledger lifecycle guard — and `settle` is never invoked for a terminal round.
- **Five API tests (Task 2):** vitest over `createApp` with stubbed ledger deps + the REAL §8 helpers, driven through Node's built-in `fetch` against an ephemeral `app.listen(0)` server (no supertest dependency). Proven: `GET` returns `sealedOrderCount===3` AND the `refreshStats` spy was called with the round id; `solve-preview` returns `clearingPrice===100`, `matchedVolume===10`, a non-empty `{price,demand,supply}` curve, and `rationale===null`; the sentinel operator-token string never appears in `JSON.stringify` of the GET or solve-preview bodies; double-settle → `409` envelope; CORS allows `http://localhost:5173` and is not `*` for a foreign origin.

## Task Commits
Each task committed atomically (no AI attribution; author = woshvad):
1. **Task 1: Express §11 API — 5 endpoints, CORS, zod, refreshStats, secret-safe envelope** — `c20e3b3` (feat)
2. **Task 2: API tests — refreshStats wire, §4 solve-preview, secret-safe, 409, CORS** — `e2d6878` (test)

## Files Created
- `solver/src/api.ts` — Express app factory. Exports: `createApp(deps): Express`, `ALLOWED_ORIGIN`, and the injected-dependency types `AppDeps` / `SealedOrder` / `RoundView` / `SettleResult`. Routes: `POST /round` (zod), `GET /round/:id` (refreshStats → live sealedOrderCount), `POST /round/:id/close`, `GET /round/:id/solve-preview` (matchedVolume = matchedAt, curve, rationale:null, no settle), `POST /round/:id/settle` (409 on double-settle).
- `solver/src/api.test.ts` — 5 vitest tests over stubbed ledger deps + real §8 helpers via Node fetch on `app.listen(0)`.

## Verification Results
- `cd solver && npx vitest run src/api.test.ts` → **5 passed** (refreshStats count===3 + spy called; solve-preview 100.00 + matchedVolume 10 + curve + rationale:null; no sentinel token in GET/solve-preview; 409 double-settle; CORS scoped).
- `cd solver && npx vitest run` (full suite) → **14 passed** (6 auction + 3 ledger + 5 api).
- `cd solver && npx tsc --noEmit` → **clean** (exit 0).
- Grep checks: CORS origin is the literal `http://localhost:5173` (not `*`); `refreshStats(` is called in the GET /round/:id handler; `matchedAt(` derives matchedVolume; no response/envelope references the token/key/`process.env`/headers; exactly five public routes registered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking type error] fetch().json() typed `unknown` under strict TS**
- **Found during:** Task 2 (api.test.ts).
- **Issue:** Node's `fetch().json()` resolves to `unknown` (TS 5.6 lib.dom), so every `body.sealedOrderCount` / `body.clearingPrice` assertion failed `tsc --noEmit` with TS18046 ('body' is of type 'unknown'). Tests ran green but the typecheck gate (exit 2) blocked the acceptance criterion.
- **Fix:** Added a `readJson(res): Promise<Record<string, any>>` helper that casts the parsed body once, and routed all four `await res.json()` call sites through it. The assertions ARE the runtime contract; the cast only satisfies the static gate. No behavior change.
- **Files modified:** `solver/src/api.test.ts`
- **Commit:** `e2d6878`

## Known Limitations
- **Unit-level only (no live ledger):** the tests stub the ledger deps by design — they prove the route wiring, shapes, secret boundary, 409 guard, and CORS, but NOT a live open→close→settle reaching `Settled` at 100.00 (that needs a booted `daml start` sandbox and is the phase-verification human gate, per 04-RESEARCH §Validation).
- **GET-after-clear path is forward-only:** the `clearingPrice/matchedVolume/curve/rationale` block on `GET /round/:id` recomputes from the round's (now-retired) sealed orders via `readSealedOrders`; for the canonical demo the orders are read pre-settle, but a fully-settled round whose Orders were retired by `Round.Clear` would return an empty book here. The live solve-preview-before-settle path (the demo flow) is the exercised one; the GET-after-settle enrichment is additive and validated structurally, not against a live post-settle ACS.

## Known Stubs
None. `api.ts` is fully implemented; every route has a real body. `rationale:null` is the deliberate Phase-5 seam (documented forward-compatible field), not an unwired stub — the field is intentionally null in P4 and Phase 5 fills it. The ledger deps are injected (real implementations live in `ledger.ts`); only the unit tests substitute fakes.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. The endpoints, CORS scope, zod validation, secret-safe envelope, and double-settle 409 are exactly the T-04-04 / T-04-08 / T-04-09 / T-04-06 mitigations the plan declared. No new network endpoint, auth path, or trust-boundary schema change was introduced.

## Self-Check: PASSED
- `solver/src/api.ts` present on disk (258 lines).
- `solver/src/api.test.ts` present on disk (211 lines).
- Commit `c20e3b3` (Task 1) present in git history.
- Commit `e2d6878` (Task 2) present in git history.
- `vitest run` → 14 passed; `tsc --noEmit` → clean.
