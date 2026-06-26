---
phase: 06-auction-theatre-settlement-animation
plan: 01
subsystem: ui
tags: [react, vite, tailwind, vitest, fetch, svg, solver-client, two-plane]

# Dependency graph
requires:
  - phase: 04-solver-service
    provides: solver HTTP API :4000 (POST /round, GET /round/:id, /close, /solve-preview, /settle) + frozen response shapes (api.ts), Allocation type (auction.ts)
  - phase: 05-ai-solver-agent
    provides: agent:{verified,source:'claude'|'deterministic-fallback'} + rationale on solve-preview / terminal GET
  - phase: 03-frontend-privacy-money-shot
    provides: web/ shell (Header/Nav/PartySwitcher/StatusIndicator), ctxA/B/C per-party contexts, tailwind binding tokens, PrivacyView frame
provides:
  - "web/src/solver.ts — :4000 fetch client (createRound/getRound/closeRound/solvePreview/settle) + response types + SolverError OFFLINE guard"
  - "web/src/lib/{curve,balance,solverParse}.ts — pure DOM-free helpers (curve→SVG mapping, lerp + deskBalancesFromAllocations, badgeLabel + parseSolvePreview)"
  - "web/vitest.config.ts + vitest@2.1.9 test runner with §4-value unit tests"
  - "tailwind umbra-draw/umbra-pulse/umbra-caret/umbra-leg animation aliases + large fontSize literals (the motion classes Plans 03/04 consume)"
  - "Nav 5-tab enabled union + App routing + lifted operator round/phase/preview/offline state"
  - "four compiling stub views (Desk/Theatre/Agent/Settlement) overwritten by Plans 02-04"
affects: [06-02-desk-view, 06-03-theatre, 06-04-agent-settlement]

# Tech tracking
tech-stack:
  added: [vitest@2.1.9 (web devDep)]
  patterns:
    - "Operator plane via native fetch to :4000 (no operator token / no @daml/react context in the browser)"
    - "Pure DOM-free lib helpers unit-tested on the §4 binding values (no jsdom/RTL needed)"
    - "Lifted operator round state (roundId/phase/preview/offline) shared across the 3 operator views"

key-files:
  created:
    - web/src/solver.ts
    - web/src/lib/curve.ts
    - web/src/lib/balance.ts
    - web/src/lib/solverParse.ts
    - web/src/lib/curve.test.ts
    - web/src/lib/balance.test.ts
    - web/src/lib/solverParse.test.ts
    - web/vitest.config.ts
    - web/src/operatorState.ts
    - web/src/views/DeskView.tsx
    - web/src/views/TheatreView.tsx
    - web/src/views/AgentView.tsx
    - web/src/views/SettlementView.tsx
  modified:
    - web/package.json
    - web/tailwind.config.ts
    - web/src/components/Nav.tsx
    - web/src/App.tsx

key-decisions:
  - "VITE_SOLVER_URL (default http://localhost:4000) is the single solver base-URL drift const, mirroring web/src/config.ts"
  - "Crossing-chart axis tuned with PRICE_MIN/MAX 98.4/101.4 + a derived Q_MAX so the §4 fixture (p*=100,q=10) maps to the binding marker (296,160) exactly"
  - "umbraLeg added as keyframe + alias; umbra-draw/pulse/caret aliases added (keyframes pre-existed with NO alias — they were dead no-ops)"
  - "New web/src/operatorState.ts holds the shared TheatrePhase + OperatorViewState shape spread into the 3 operator views"
  - "DEFAULT_ROUND_ID 'R1' (the seeded round), overridable via VITE_ROUND_ID"

patterns-established:
  - "Two-plane separation: solver.ts (:4000, no token) vs desk ctx (:7575) — operator token never in bundle"
  - "§4 fixture canary asserted in unit tests (100/10, crossing 296/160, allocations→finals A:10/4000·B:12/1800·C:13/1200)"

requirements-completed: [UI-02, UI-04, UI-05, UI-06]

# Metrics
duration: 22min
completed: 2026-06-26
---

# Phase 6 Plan 01: Auction Theatre Scaffold Summary

**The :4000 solver fetch client + offline guard, three pure §4-value-tested lib helpers (curve→SVG, balance derivation, solver-payload parse), the tailwind motion aliases Plans 03/04 consume, a 5-tab Nav, and App routing with lifted operator round state — four compiling view stubs in place, build + vitest green.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-26T02:15:00Z
- **Completed:** 2026-06-26T02:24:00Z
- **Tasks:** 2
- **Files modified:** 17 (13 created, 4 modified)

## Accomplishments

- `web/src/solver.ts` — typed native-fetch client for all 5 operator endpoints, mirroring the frozen `solver/src/api.ts` shapes; `SolverError` throws `OFFLINE` on a network reject and carries the structured `{code,message}` on a non-ok response. No operator token / no `@daml/react` context in the bundle (threat T-06-01/02/03).
- Three pure DOM-free lib helpers with §4-value vitest coverage: `curve.ts` (crossing reproduces the binding marker 296,160), `balance.ts` (`deskBalancesFromAllocations` → the binding finals A:10/4000 · B:12/1800 · C:13/1200, not just lerp endpoints), `solverParse.ts` (`parseSolvePreview` → 100/10, `badgeLabel` map).
- `vitest@2.1.9` wired into `web/` (mirrors solver), `test` script added; 11 tests green.
- `tailwind.config.ts` extended additively: `umbraLeg` keyframe + the large fontSize literals + the **umbra-draw / umbra-pulse / umbra-caret / umbra-leg** animation aliases that make `animate-umbra-draw`/`-pulse`/`-caret` live utility classes (they were keyframes-only before). Every existing binding value byte-unchanged.
- `Nav` widened to the 5-tab enabled union; `App` routes all 5 views and lifts `roundId/phase/preview/offline` operator state (shared across Theatre→Agent→Settlement); four compiling stub views; Privacy view unchanged. `npm run build` green.

## Task Commits

1. **Task 1: solver.ts client + lib helpers + vitest setup with §4-value tests** — `d542623` (feat)
2. **Task 2: tailwind additions + Nav 5-tab + App routing & lifted state + 4 stub views** — `12e4111` (feat)

_Note: Task 1 was authored test-first (the three `.test.ts` files alongside their pure implementations); all §4-value assertions pass._

## Files Created/Modified

- `web/src/solver.ts` — :4000 fetch client + response types + SolverError offline guard
- `web/src/lib/curve.ts` — sx/sy/crossingPoint + binding axis constants (reproduces 296,160)
- `web/src/lib/balance.ts` — lerp + deskBalancesFromAllocations (→ §4 finals)
- `web/src/lib/solverParse.ts` — badgeLabel + parseSolvePreview
- `web/src/lib/{curve,balance,solverParse}.test.ts` — §4-value assertions
- `web/vitest.config.ts` — node-env vitest config (mirrors solver)
- `web/package.json` — vitest@2.1.9 devDep + `test` script
- `web/tailwind.config.ts` — umbraLeg keyframe + fontSize literals + umbra-draw/pulse/caret/leg aliases
- `web/src/components/Nav.tsx` — 5-tab enabled Screen union
- `web/src/App.tsx` — routes 5 views + lifts operator round/phase/preview/offline state
- `web/src/operatorState.ts` — shared TheatrePhase + OperatorViewState shape
- `web/src/views/{DeskView,TheatreView,AgentView,SettlementView}.tsx` — compiling section-marker stubs

## Decisions Made

- **Crossing-chart axis constants** tuned to the binding comp: `PRICE_MIN=98.4, PRICE_MAX=101.4` makes `sy(100)=160`; `Q_MAX` derived so `sx(10)=296` — together reproducing the hand-authored binding marker (296,160). The comp's polylines are artistic (a single linear map can't reproduce both the demand drop and the supply cap exactly), so only the binding crossing is asserted, per the plan.
- **operatorState.ts** introduced (additive) to carry the lifted `TheatrePhase`/`OperatorViewState` shape spread into the three operator views, keeping the stub prop types and the future Plan 03/04 bodies aligned.
- **vitest pinned to exactly 2.1.9** (npm wrote `^2.1.9`; re-pinned) to match `solver/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New `web/src/operatorState.ts` for the shared operator-view prop shape**
- **Found during:** Task 2 (App routing + lifted state + stub views)
- **Issue:** The plan specifies the stubs accept `{ roundId, phase, preview, offline, ... }` matching the App-lifted state, but no shared type module existed; inlining the shape four times would drift.
- **Fix:** Added a small additive `operatorState.ts` exporting `TheatrePhase` + `OperatorViewState`; App builds the object and spreads it into Theatre/Agent/Settlement. This is the lifted-state shape the plan calls for, just centralized.
- **Files modified:** web/src/operatorState.ts (new), web/src/App.tsx, the 3 operator stub views
- **Verification:** `npm run build` green; no operator token introduced.
- **Committed in:** `12e4111` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking/structural — a centralized type for the explicitly-required lifted-state shape).
**Impact on plan:** No scope creep — it realizes the plan's "lift roundId/phase/preview/offline and pass the relevant slice" instruction with a single source-of-truth type. All §4 values and motion aliases match the UI-SPEC exactly.

## Issues Encountered

- The npm `vitest` install rewrote `web/package.json` between my read and edit (caret range + reordered keys). Re-read, re-applied the `test` script, and re-pinned to exact `2.1.9`. No other friction.

## Known Stubs

The four new views are intentional **compiling stubs** (the plan's explicit Task-2 deliverable): each renders the PrivacyView `<main>` frame + the binding 54/56px headline + an Inter 14px placeholder paragraph (with the offline caption wired). Plans 02 (Desk), 03 (Theatre), 04 (Agent/Settlement) OVERWRITE their own stub with the full composition. These are NOT data-flow stubs that block the money shot — Privacy (the live Phase-3 money shot) is untouched and still renders. Documented as planned scaffold, resolved by Plans 02-04.

## Self-Check: PASSED

- web/src/solver.ts — FOUND
- web/src/lib/{curve,balance,solverParse}.ts (+ .test.ts) — FOUND
- web/vitest.config.ts, web/src/operatorState.ts — FOUND
- web/src/views/{DeskView,TheatreView,AgentView,SettlementView}.tsx — FOUND
- Commit d542623 (Task 1) — FOUND
- Commit 12e4111 (Task 2) — FOUND
- `cd web && npm run build` — green; `npx vitest run` — 11/11 green
- tailwind grep: umbra-draw/umbra-pulse/umbra-caret/umbraLeg + '120' — present
- Nav: 5 `enabled: true`; no operator token in web/src

## User Setup Required

None — no external service configuration required. (The solver :4000 must be running for the operator views to fetch live; when down they show the OFFLINE caption and Privacy still renders — the designed graceful fallback.)

## Next Phase Readiness

- The contract + scaffold layer is fixed: Plans 02-04 build against `web/src/solver.ts` types, the pure `lib/*` helpers, the live `animate-umbra-*` classes, and the `OperatorViewState` shape — no codebase exploration needed.
- Plan 04 (aggregate BalanceTable/DvpLegs) should confirm the `Allocation` field names against `solver/src/auction.ts` before wiring (already mirrored here as `{desk,side,filledQty}`).
- No blockers.

---
*Phase: 06-auction-theatre-settlement-animation*
*Completed: 2026-06-26*
