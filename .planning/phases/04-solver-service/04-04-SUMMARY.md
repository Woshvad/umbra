---
phase: 04-solver-service
plan: 04
subsystem: solver
tags: [typescript, node-esm, in-memory-clock, fake-timers, dotenv, rehydrate, dependency-injection, vitest, secret-boundary]

# Dependency graph
requires:
  - phase: 04-solver-service
    plan: 02
    provides: "solver/src/ledger.ts Operator client (openRound/queryRound/readSealedOrders/refreshStats/closeRound/settle/operatorParty)"
  - phase: 04-solver-service
    plan: 03
    provides: "solver/src/api.ts createApp(deps) Express factory (5 §11 endpoints, secret-safe envelope) + AppDeps/RoundView/SealedOrder/SettleResult types"
provides:
  - "solver/src/clock.ts — createClock(deps) in-memory round clock: openRoundClock (ROUND_SECONDS auto-close timer), forceClose (cancel+close, idempotent), getState, setStatus, rehydrate; type RoundState. The map is cache/clock state only; the ledger Round.status stays authoritative."
  - "solver/src/index.ts — boot entrypoint: dotenv.config() first, rehydrate from ledger.queryAllRounds, buildDeps(...) wiring POST /round → openRound + openRoundClock(roundId, ROUND_SECONDS) and POST /round/:id/close → clock.forceClose, createApp(deps).listen(SOLVER_PORT) with secret-free logging. Exports buildDeps + LedgerPort/MathPort for the wiring test."
  - "solver/src/ledger.ts — added queryAllRounds() (live Round projection for boot rehydrate)"
  - "solver/src/clock.test.ts — 5 fake-timer vitest (auto-close-once, force-close-cancels-timer, idempotency, unknown-round no-op, rehydrate-no-timer)"
  - "solver/src/index.test.ts — 2 injected-dep vitest: POST /round fires BOTH openRound + openRoundClock(roundId, ROUND_SECONDS); POST /round/:id/close routes through clock.forceClose"
affects: [phase-05-ai-agent (cachedProposal seam on RoundState), phase-06-frontend (countdown ring reads the clock deadline), phase-07-live-e2e (the deferred live gate runs here)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-memory Map<roundId, RoundState> clock as CACHE only — the ledger Round.status is authoritative; boot rehydrates from a live query(Round)"
    - "Per-round single setTimeout(ROUND_SECONDS*1000) auto-close; forceClose always clearTimeout()s it so the timer callback can never double-fire (T-04-11)"
    - "Fake-timer vitest (vi.useFakeTimers + advanceTimersByTimeAsync) — never real sleeps"
    - "buildDeps(...) DI factory: the SAME path index.ts boot and index.test.ts use, so injected spies prove POST /round → openRound + openRoundClock without a sandbox (the WARNING fix)"
    - "Entrypoint-guarded main(): importing index.ts for the unit test does NOT boot/connect/listen (dotenv + ledger are dynamic-imported inside main)"
    - "Shape adapters in main() project ledger.ts returns (CreateEvent<Round> / { result, status }) onto the API's RoundView / SettleResult"

key-files:
  created:
    - solver/src/clock.ts
    - solver/src/clock.test.ts
    - solver/src/index.ts
    - solver/src/index.test.ts
  modified:
    - solver/src/ledger.ts
    - solver/.env.example

key-decisions:
  - "The clock map is cache/clock state ONLY (status/openedAt/deadline/timer); the ledger Round.status is authoritative and boot rehydrates from a live query(Round). The timer drives an internal close() shared by auto-close and forceClose so closeRound fires at most once per round (idempotent)."
  - "index.ts defers dotenv + ledger.ts to a dynamic import inside an entrypoint-guarded main(), so importing the module for the wiring unit test does NOT run ledger.ts's module-private credential resolution or open a Ledger — index.test.ts stays ledger-free, reusing the 04-03 api.test stub pattern."
  - "POST /round wiring lives in buildDeps: the injected openRound calls ledger.openRound THEN openRoundClock(roundId, ROUND_SECONDS). index.test.ts injects vi.fn() spies for both and asserts both fire once on a real POST /round — the WARNING fix (automated cover beyond tsc)."
  - "buildDeps.closeRound routes through clock.forceClose (which cancels the timer and calls ledger.closeRound), so POST /round/:id/close is timer-safe; LedgerPort.closeRound remains in the interface for completeness."
  - "main() carries thin shape adapters: queryRound projects CreateEvent<Round> → RoundView; settle projects ClearResult → SettleResult with allocations RECOMPUTED via computeClearing on the sealed orders read just before settle (ClearResult carries only aggregate totalMatched, not per-desk fills) and matchedVolume = Number(totalMatched)."

requirements-completed: [SOLV-01, SOLV-02]  # autonomous portion: window enforcement + on-close orchestration wired; live on-ledger confirmation is the deferred Task-3 gate

# Metrics
duration: 5min
completed: 2026-06-26
---

# Phase 4 Plan 04: Round Clock + Boot Wiring Summary

**The solver service is now wired end-to-end off-ledger: an in-memory `Map<roundId, RoundState>` clock enforces the `ROUND_SECONDS` (default 60) window with a single per-round auto-close timer and an idempotent force-close, and `index.ts` boots the service — `dotenv.config()` first, rehydrate from a live `query(Round)`, `buildDeps(...)` wiring `POST /round → openRound + openRoundClock(roundId, ROUND_SECONDS)` and `POST /round/:id/close → clock.forceClose`, then `createApp(deps).listen(SOLVER_PORT)` with a secret-free `:<port> as <operatorParty>` boot log — all proven by 21 green vitest (the `POST /round → openRound + openRoundClock` wiring proven by an injected-dep test with no sandbox). The live on-ledger E2E (Task 3) is a deferred human-verification checkpoint.**

## Performance
- **Duration:** ~5 min
- **Tasks:** 2 autonomous completed; 1 live-E2E checkpoint deferred
- **Files created:** 4 (`clock.ts`, `clock.test.ts`, `index.ts`, `index.test.ts`); 2 modified (`ledger.ts`, `.env.example`)

## Accomplishments
- **In-memory round clock (Task 1):** `createClock(deps)` holds a private `Map<string, RoundState>`. `openRoundClock(roundId, windowSeconds)` records `status:'Open'` + `openedAt`/`deadline` and arms a single `setTimeout(windowSeconds*1000)` that auto-advances to `Closed` via a shared internal `close()`. `forceClose(roundId)` cancels that timer (`clearTimeout`) and closes early; it is idempotent (a no-op once the round left the Open state) and safe on an unknown round. `rehydrate(rounds)` seeds the map from live rounds WITHOUT arming a timer (recognition, not re-arm). `getState`/`setStatus` round out the surface. The clock deals only in roundId/status/timestamps — it holds no token or secret (SOLV-04).
- **Fake-timer tests:** `clock.test.ts` uses `vi.useFakeTimers()` (never real sleeps): advancing time past the window calls the stubbed `closeRound` exactly once and transitions to `Closed`; force-closing at half the window cancels the timer so advancing past the original deadline does NOT call `closeRound` a second time (T-04-11); `forceClose` is idempotent; an unknown-round force-close is a no-op; `rehydrate` does not auto-close.
- **Boot wiring (Task 2):** `index.ts` exports `buildDeps(...)` — the single DI factory both boot and the test use. The injected `openRound` calls `ledger.openRound` THEN `openRoundClock(roundId, ROUND_SECONDS)` (opening a round arms the timer); `closeRound` routes through `clock.forceClose`. `main()` (entrypoint-guarded) loads `dotenv.config()` FIRST, reads `SOLVER_PORT` (default 4000) + `ROUND_SECONDS` (default 60), dynamic-imports `ledger.ts`/`auction.ts`/`clock.ts`, rehydrates from `ledger.queryAllRounds()`, assembles `deps` (with thin RoundView/SettleResult adapters), and `createApp(deps).listen(SOLVER_PORT)`.
- **Secret-free logging (SOLV-04 / T-04-04):** every boot log line is secret-free — `Solver listening on :<port> as <operatorParty>` (public party id only), a rehydrate count, a secret-free rehydrate-skipped warning, and a fatal handler that logs `err.message` only. No token, no `ANTHROPIC_API_KEY`, no `process.env` dump.
- **Injected-dep wiring proof (the WARNING fix):** `index.test.ts` drives `POST /round` against an ephemeral `app.listen(0)` via Node `fetch` (reusing the 04-03 api.test stub pattern, no sandbox) and asserts BOTH `openRound` (once) AND `openRoundClock` (once, with the new roundId + `ROUND_SECONDS`) fired — the automated cover for the boot wiring beyond `tsc --noEmit`. A second test confirms `POST /round/:id/close` routes through `clock.forceClose`.
- **`ledger.queryAllRounds`:** added a secret-free live-Round projection (`{ roundId, status, windowSeconds, openedAt }`, windowSeconds coerced off the wire string) so boot rehydrate can seed the clock and recognize the sandbox-seeded round `R1`.

## Task Commits
Each task committed atomically (no AI attribution; author = woshvad):
1. **Task 1: In-memory round clock — ROUND_SECONDS auto-close + force-close** — `9f1c6a9` (feat)
2. **Task 2: Boot index.ts — dotenv, rehydrate-from-ledger, wire clock+ledger, listen** — `51af854` (feat)

## Files Created/Modified
- `solver/src/clock.ts` — in-memory clock. Exports: `createClock(deps): Clock` → `{ openRoundClock, forceClose, getState, setStatus, rehydrate }`; types `Clock`, `RoundState`, `RoundStatus`, `ClockDeps`.
- `solver/src/clock.test.ts` — 5 fake-timer vitest.
- `solver/src/index.ts` — boot entrypoint. Exports: `buildDeps(args): AppDeps`, `LedgerPort`, `MathPort`, `BuildDepsArgs`, `DEFAULT_ROUND_SECONDS`, `DEFAULT_SOLVER_PORT`; entrypoint-guarded `main()` (dotenv → rehydrate → wire → listen).
- `solver/src/index.test.ts` — 2 injected-dep wiring vitest (POST /round → openRound + openRoundClock; close → forceClose).
- `solver/src/ledger.ts` — **modified**: added `queryAllRounds()` for boot rehydrate.
- `solver/.env.example` — **modified**: documented `JSON_API_URL` / `SOLVER_PORT` / `ROUND_SECONDS` / `ANTHROPIC_API_KEY` (present-but-unused until Phase 5), no secret values.

## Verification Results
- `cd solver && npx vitest run src/clock.test.ts` → **5 passed** (auto-close-once, force-close-cancels-timer, idempotency, unknown-round no-op, rehydrate-no-timer).
- `cd solver && npx vitest run src/index.test.ts` → **2 passed** (POST /round fires both openRound + openRoundClock with ROUND_SECONDS; close → forceClose).
- `cd solver && npx vitest run` (full suite) → **21 passed** (6 auction + 5 clock + 3 ledger + 5 api + 2 index).
- `cd solver && npx tsc --noEmit` → **clean** (exit 0).
- Grep: every `console.*` in `index.ts` is secret-free (port + `operatorParty`, counts, `err.message`); no token / `ANTHROPIC_API_KEY` / `process.env` dump.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking shape mismatch] ledger.ts returns did not satisfy the API's RoundView / SettleResult**
- **Found during:** Task 2 (tsc --noEmit).
- **Issue:** `api.ts`'s `AppDeps` expects `queryRound → RoundView` and `settle → SettleResult { clearingPrice, allocations }`, but the real `ledger.ts` returns `CreateEvent<Round>` and `{ result: ClearResult, status }` respectively (the api.test stubs masked this; index.ts wires the REAL functions). `tsc` exit 2.
- **Fix:** Added thin projection adapters inside `main()` — `queryRoundView` maps the Round payload onto `RoundView`; `settleResult` returns `clearingPrice`/`matchedVolume` from the ledger `ClearResult` and RECOMPUTES `allocations` via `computeClearing` on the sealed orders read just before settle (ClearResult carries only aggregate `totalMatched`, not per-desk fills — consistent with the §8 verify-don't-trust core). No behavior change; the live on-ledger Clear remains the authority.
- **Files modified:** `solver/src/index.ts`
- **Commit:** `51af854`

**2. [Rule 3 - Missing helper for the rehydrate call site] ledger.queryAllRounds**
- **Found during:** Task 2 (index.ts rehydrate).
- **Issue:** Boot rehydrate needs a LIST of live rounds; `ledger.ts` only exposed `queryRound` (single). Without it the rehydrate call site could not compile or seed the clock.
- **Fix:** Added `queryAllRounds()` to `ledger.ts` — a secret-free projection of every live Round (`roundId`/`status`/`windowSeconds`/`openedAt`, windowSeconds coerced off the Int wire-string). Pure additive read; no existing export changed.
- **Files modified:** `solver/src/ledger.ts`
- **Commit:** `51af854`

## Deferred Human-Verification Checkpoint (Task 3 — live E2E)

**Status: DEFERRED — not attempted headless (no live ledger in this execution environment).** Consistent with Phases 1–3, the project defers live-`daml start` E2E to end-of-phase / Phase 7 acceptance. This executor ran headless with no sandbox on :7575, so the live on-ledger gate was intentionally not run and intentionally not treated as a blocker.

**What is already proven green (no sandbox needed), so the deferral is low-risk:** the §8 clearing math (Plan 04-01), the Operator wire layer + `refreshStats` count-write + Option-B `Round.Clear` (Plan 04-02), the 5 §11 endpoint shapes + secret-safe envelope + 409 double-settle + CORS scope (Plan 04-03), the clock timers + force-close idempotency, and the `POST /round → openRound + openRoundClock` wiring (this plan) — 21 vitest green + tsc clean across all four plans.

**Remaining to verify LIVE (the one path unit tests cannot cover — needs `daml start` :7575 + the real on-ledger DvP):**
1. `cd daml && daml start` (seeds Open round `R1` + 3 §4 orders), then `node scripts/mint-tokens.mjs`.
2. `cd solver && cp .env.example .env` (leave `ANTHROPIC_API_KEY` empty), `npm run dev` → expect `Solver listening on :4000 as operator::…` with NO token printed.
3. SOLVER-MAINTAINS-THE-COUNT: `POST /round` opens a FRESH round (`R2`) at `sealedOrderCount: 0`; after a desk seals an order, `GET /round/R2` shows the count ADVANCED off 0 (refreshStats wrote it — not the Phase-3 R1 seed).
4. Canonical demo on `R1`: `GET /round/R1` (count 3) → `POST …/close` (Closed) → `GET …/solve-preview` (`clearingPrice: 100`, `matchedVolume: 10`, non-empty curve, `rationale: null`) → `POST …/settle` (Settled, 100) → second `POST …/settle` → HTTP 409.
5. Secret boundary: no response body or boot log contains the Operator token or any `ANTHROPIC_API_KEY` value.

**Resume signal:** Type "approved" once a fresh round's sealedOrderCount advances off 0, solve-preview shows 100.00 + matchedVolume 10, settle reaches Settled with the 409 double-settle guard and no secret in any response — or describe what failed.

## Known Stubs
None. `clock.ts` and `index.ts` are fully implemented; every method has a real body. `RoundState.cachedProposal` is a deliberate, documented forward seam for Phase 5 (the memoized clearing proposal) — typed `unknown` and intentionally unused in P4, not an unwired stub. The live on-ledger drive is the deferred human gate above, not a code stub.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. The clock is in-memory cache state (no network, no credential); `index.ts` adds no new endpoint (it mounts the Plan 04-03 `createApp`); boot logging is the declared T-04-04 mitigation; the timer hygiene (single handle, clearTimeout on force-close) is the declared T-04-11 mitigation; rehydrate-from-ledger is the declared T-04-10 mitigation. No new trust boundary introduced.

## Self-Check: PASSED
- `solver/src/clock.ts` present on disk.
- `solver/src/clock.test.ts` present on disk.
- `solver/src/index.ts` present on disk.
- `solver/src/index.test.ts` present on disk.
- Commit `9f1c6a9` (Task 1) present in git history.
- Commit `51af854` (Task 2) present in git history.
- `vitest run` → 21 passed; `tsc --noEmit` → clean.
