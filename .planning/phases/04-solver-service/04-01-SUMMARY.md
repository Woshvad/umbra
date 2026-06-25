---
phase: 04-solver-service
plan: 01
subsystem: solver
tags: [typescript, node-esm, vitest, daml-bindings, clearing-algorithm, tdd]

# Dependency graph
requires:
  - phase: 02-clearing-settlement
    provides: "daml/Umbra/Clearing.daml — the frozen §8 source of truth ported here 1:1"
  - phase: 03-frontend-privacy
    provides: "web/daml.js/umbra-0.1.0 generated bindings (imported by the solver)"
provides:
  - "solver/ Node 20 + TypeScript ESM package scaffolded with spec-pinned deps"
  - "solver/src/auction.ts — pure §8 clearing port (computeClearing/choosePStar/rationByPriority + helpers), the single off-ledger clearing-math dependency for Waves 2-4"
  - "solver/src/auction.test.ts — 6 vitest scenarios (5 mandated + empty-book), §4 canary clears at 100.00"
  - "solver/src/ledger-smoke.ts — proven Node-ESM import of the generated CJS bindings + @daml/ledger"
affects: [solver-ledger-client, solver-api, solver-clock, phase-05-ai-agent]

# Tech tracking
tech-stack:
  added: [express@4.19.2, cors@2.8.5, zod@3.23.8, dotenv@16.6.1, "@daml/ledger@2.10.4", "@daml/types@2.10.4", vitest@2.1.9, tsx@4.19.2, typescript@5.6.3]
  patterns: ["Node-ESM tsconfig (Bundler resolution + esModuleInterop) for generated CJS bindings", "pure-function §8 port mirroring Daml function-for-function", "TDD RED→GREEN with the §4 fixture as the continuous canary"]

key-files:
  created:
    - solver/package.json
    - solver/tsconfig.json
    - solver/vitest.config.ts
    - solver/.env.example
    - solver/.gitignore
    - solver/src/ledger-smoke.ts
    - solver/src/auction.ts
    - solver/src/auction.test.ts
  modified: []

key-decisions:
  - "Generated @daml.js/umbra-0.1.0 bindings import cleanly under Node ESM via direct named imports — no namespace/default fallback needed (Pitfall 6 de-risked)"
  - "Spec-era versions pinned exactly (express 4.19.2 / zod 3.23.8 / dotenv 16.6.1 / vitest 2.1.9); registry-latest majors rejected per CLAUDE.md"
  - "choosePStar mirrors Clearing.daml exactly: for a no-cross round it returns a candidate price (matched 0), NOT 0.0 — the 0.0 branch fires only on an empty order book; the no-cross invariant is matched===0, not price===0"

patterns-established:
  - "Pure §8 port: auction.ts imports nothing and is a function-for-function mirror of daml/Umbra/Clearing.daml; any divergence is rejected by on-ledger Round.Clear re-verification"
  - "Allocation multiset equality in tests via sort key (desk, side, filledQty) before toEqual, mirroring Auction.daml"

requirements-completed: [CLEAR-02, CLEAR-03, SOLV-05]

# Metrics
duration: 12min
completed: 2026-06-26
---

# Phase 4 Plan 01: Solver §8 Clearing Port + Scaffold Summary

**The §8 clearing algorithm now runs in TypeScript bit-identically to Clearing.daml — the §4 fixture clears at exactly 100.00 (A=10 / B=8 / C=2, C residual 3) and the 99-vs-100 tie-break trap is guarded by a dedicated regression test, on a fresh Node-ESM solver package whose generated bindings import cleanly.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3 completed
- **Files created:** 8 (+ package-lock.json)

## Accomplishments
- Scaffolded the greenfield `solver/` Node 20 + TypeScript ESM package with spec-pinned dependencies installed, and **proved the generated `@daml.js/umbra-0.1.0` CJS bindings + `@daml/ledger` import cleanly under Node ESM** (`ledger-smoke.ts` exits 0, prints a real `:Umbra.Auction:Round` templateId) — de-risking RESEARCH Open Question 1 / Pitfall 6 before any client code (unblocks Waves 2-4).
- Ported `daml/Umbra/Clearing.daml` to `solver/src/auction.ts` **function-for-function** as a pure module: the `topPrices` max-matched filter, the `foldl max 0` empty-list seed, descending-buy / ascending-sell price priority, greedy `rationByPriority`, and `Math.round(p*100)/100` rounding are all reproduced exactly.
- Authored the executable contract as **5 mandated vitest scenarios** (+ 1 added empty-book case): the §4 canary, the 99-vs-100 tie-break guard, same-limit ties, all-or-nothing imbalance, and no-cross. All green; `tsc --noEmit` clean.

## Task Commits

Each task was committed atomically (no AI attribution; author = woshvad):

1. **Task 1: Scaffold solver/ + prove bindings import** - `cee76b0` (feat)
2. **Task 2: 5 vitest clearing scenarios (RED)** - `b473553` (test)
3. **Task 3: Port §8 to auction.ts (GREEN)** - `b42ac51` (feat)

_TDD gate sequence: RED (`b473553` test) → GREEN (`b42ac51` feat). No refactor commit needed._

## Files Created/Modified
- `solver/package.json` - Node ESM solver package (`type:module`), pinned deps, dev/test/typecheck/smoke scripts
- `solver/tsconfig.json` - Node-ESM TS config (`module:ESNext`, `moduleResolution:Bundler`, `esModuleInterop`, `strict`)
- `solver/vitest.config.ts` - node environment, `src/**/*.test.ts` glob
- `solver/.env.example` - `JSON_API_URL` / `SOLVER_PORT` / `ROUND_SECONDS` / `ANTHROPIC_API_KEY=` (empty placeholder)
- `solver/.gitignore` - ignores `node_modules/`, `.env`, `dist/`
- `solver/src/ledger-smoke.ts` - Node-ESM import smoke for the generated bindings (Round/Order/RoundStats/Asset/Side) + `@daml/ledger`
- `solver/src/auction.ts` - pure §8 clearing port (`computeClearing`, `choosePStar`, `rationByPriority`, `demandAt`, `supplyAt`, `matchedAt`, `candidatePrices`; types `Side`, `OrderView`, `Allocation`, `ClearingResult`)
- `solver/src/auction.test.ts` - 6 vitest scenarios (section-4 fixture, lower-price tie-break, same-limit ties, imbalance, no-cross + empty-book)

## Verification Results
- `cd solver && npx vitest run src/auction.test.ts` → **6 passed** (the §4 case asserts `clearingPrice===100`, fills A=10/B=8/C=2, C residual 3).
- `cd solver && npx tsc --noEmit` → **clean** (exit 0).
- `cd solver && npx tsx src/ledger-smoke.ts` → exit 0, prints `Round.templateId = …:Umbra.Auction:Round`.
- `git status` → `solver/.env.example` tracked; no `solver/.env` and no `node_modules/` tracked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test corrected to source-of-truth] no-cross scenario assertion**
- **Found during:** Task 3 (GREEN).
- **Issue:** The RED test asserted `choosePStar([Buy@99, Sell@101]) === 0` and `clearingPrice === 0`. The bit-faithful port of `Clearing.daml` returns **101** for this fixture: with `maxMatched = 0`, ALL candidate prices enter `topPrices`, and the `(|imbalance|, price)` tie-break still ranks them (101 has imbalance 8 < 99's imbalance 10), so `choosePStar` returns a candidate price. The Daml `0.0` branch fires only when `ranked` is empty (a genuinely empty order book). The plan's `must_haves` truth ("pStar 0.0") described the empty-book branch, not the no-cross-with-orders case.
- **Fix:** The port was kept bit-identical to Daml (mandatory — the on-ledger `Round.Clear` re-verification is the backstop). The test was corrected to assert the true §8 invariant for a no-cross round — **matched volume at p\* is 0 and every fill is 0** — and a 6th case (`empty order book → pStar 0.0`) was added to exercise the documented `foldl-max-0` / empty-`ranked` seed branch explicitly.
- **Files modified:** `solver/src/auction.test.ts`
- **Commit:** `b42ac51`

## TDD Gate Compliance
- RED gate: `b473553` (`test(...)`) — 5 scenarios authored, failing because `./auction` was absent (correct pre-implementation failure).
- GREEN gate: `b42ac51` (`feat(...)`) — `auction.ts` implemented; all scenarios pass.
- Sequence satisfied (test → feat). No unexpected pass during RED.

## Known Stubs
None. `auction.ts` is fully implemented and exercised by passing tests; `ledger-smoke.ts` is a deliberate one-shot import probe (not a stub of future functionality — `ledger.ts` proper lands in Plan 04-02).

## Notes for Next Plans
- Named imports from `@daml.js/umbra-0.1.0/lib/Umbra/*/module` and the default import of `@daml/ledger` both resolve under Node ESM with the `tsconfig` settings here — Plan 04-02 (`ledger.ts`) can use the same import forms directly, no fallback required.
- `@daml/ledger`'s default export resolves as an object under tsx/esModuleInterop; the `Ledger` constructor is usable (`new Ledger({ token, httpBaseUrl })`) — the absolute-URL gotcha (Pitfall 2) still applies server-side.
- `npm install` reported audit advisories on the spec-era transitive deps; majors were NOT bumped (CLAUDE.md pins them). Documented, not actioned.

## Self-Check: PASSED
- All 8 created files present on disk (package.json, tsconfig.json, vitest.config.ts, .env.example, .gitignore, ledger-smoke.ts, auction.ts, auction.test.ts).
- All 3 task commits present in git history (`cee76b0`, `b473553`, `b42ac51`).
- `vitest run` → 6 passed; `tsc --noEmit` → clean; `ledger-smoke` → exit 0.
