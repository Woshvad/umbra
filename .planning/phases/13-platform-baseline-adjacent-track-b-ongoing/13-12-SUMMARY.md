---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 12
subsystem: ui
tags: [react, typescript, vite, solver-client, competing-solvers, adj-01, leaderboard]

# Dependency graph
requires:
  - phase: 13-11
    provides: solver /competing, /rfq*, /issuance* endpoints + agent.ts RankedProposal/CompetingResult wire shapes
provides:
  - Credential-free web client fns for the ADJ-01/02/03 endpoints (getCompeting, postRfq, getRfqQuotes, acceptRfqQuote, openIssuance, clearIssuance, payCoupon, redeemIssuance) mirroring the api.ts wire shapes
  - web/src/lib/leaderboard.ts rankForDisplay (matched↓, surplus↓) + formatConfigTag + badgeFor display helper (unit-tested)
  - S2 SolverLeaderboard competing-solvers panel mounted on the Agent view (04)
affects: [13-13, 13-14, S3-RFQ-panel, S4-issuance-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-fetching narrative panel gated on round-cleared readiness (ready={!!preview}), degrading offline→OFFLINE_CAPTION / non-offline-reject→empty"
    - "fetch-mock credential scan test: stub global fetch, invoke each client fn, assert URL == SOLVER_BASE_URL+path with no auth header (T-13-36)"

key-files:
  created:
    - web/src/lib/leaderboard.ts
    - web/src/lib/leaderboard.test.ts
    - web/src/components/SolverLeaderboard.tsx
  modified:
    - web/src/solver.ts
    - web/src/views/AgentView.tsx

key-decisions:
  - "Mirrored the AUTHORITATIVE agent.ts RankedProposal shape (nested config:{id,model,temperature}) over the plan's flat configTag sketch (STATE 10-07 lesson)"
  - "clearIssuance aliases openIssuance because the wire POST /issuance opens+clears atomically in one request (no separate clear endpoint to mirror)"
  - "Leaderboard auto-races on round-clear (read-only, no CTA per UI-SPEC) rather than a button trigger"

patterns-established:
  - "Ink-not-lime winner marking: rank-1 verified proposal gets an ink left-rule + ink weight, never lime (lime reserved to the true uniform-price reveal)"
  - "Persistent honest tag + distinct AUTHORITATIVE marker to keep AI narrative surfaces off the settlement path"

requirements-completed: [ADJ-01]

# Metrics
duration: ~20min
completed: 2026-07-10
---

# Phase 13 Plan 12: ADJ-01 Web Surface Summary

**Credential-free web client seam for the competing/RFQ/issuance endpoints plus the S2 competing-solvers leaderboard on the Agent view — ranked VERIFIED/UNVERIFIED proposals with a distinct DETERMINISTIC §8 CLEAR — AUTHORITATIVE marker, ink-not-lime winner, and a persistent NOT A SETTLEMENT INPUT tag.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-10T21:49:00Z
- **Completed:** 2026-07-10T21:56:00Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Extended `web/src/solver.ts` with 8 credential-free client fns + byte-mirrored wire types for the ADJ-01/02/03 endpoints, all riding the single `SOLVER_BASE_URL`/`call<T>()` (no `:4000`, no auth header, no operator/Anthropic credential).
- Added the pure `rankForDisplay` display helper (sort by matched↓, surplus↓; VERIFIED/UNVERIFIED badge; honest `HAIKU · t0.0` config tag) with 15 co-located unit tests including a fetch-mock credential scan (T-13-36).
- Built and mounted the S2 `SolverLeaderboard` panel on the Agent view below the proposal/rationale grid: empty / COMPUTING / OFFLINE / ranked states, the AUTHORITATIVE deterministic block, and the ink-not-lime rank-1 winner (T-13-37).

## Task Commits

Each task was committed atomically (author/committer = woshvad, no Claude attribution):

1. **Task 1: solver.ts client seam + leaderboard display helper + test** - `8c3925b` (feat)
2. **Task 2: SolverLeaderboard (S2) mounted on AgentView** - `22207e0` (feat)

## Files Created/Modified
- `web/src/solver.ts` - +8 client fns (getCompeting/postRfq/getRfqQuotes/acceptRfqQuote/openIssuance/clearIssuance/payCoupon/redeemIssuance) + mirrored CompetingResponse/RankedProposal/RFQ/issuance types
- `web/src/lib/leaderboard.ts` - rankForDisplay + formatConfigTag + badgeFor (pure, DOM-free)
- `web/src/lib/leaderboard.test.ts` - ranking/badge/tag units + fetch-mock credential scan
- `web/src/components/SolverLeaderboard.tsx` - S2 leaderboard panel (operator-plane display only)
- `web/src/views/AgentView.tsx` - mount SolverLeaderboard below the grid (ready={!!preview})

## Decisions Made
- **Wire-shape fidelity over sketch:** the plan sketched a flat `{configTag, model, temperature, ...}` RankedProposal, but the authoritative `agent.ts` shape nests the tag under `config: {id, model, temperature}`. Mirrored the real shape (the read_first / STATE 10-07 lesson); `formatConfigTag` derives the `HAIKU · t0.0` display tag from `config`.
- **clearIssuance = openIssuance alias:** the wire exposes a single combined `POST /issuance` that opens AND clears in one request (api.ts L1414-1434). There is no separate clear endpoint to mirror, so `clearIssuance` is the same combined call, named for the future S4 clear-reveal caller — documented inline. Both exports required by the seam contract are present.
- **Read-only auto-race:** UI-SPEC states S2 has no primary CTA, so the panel auto-fetches `getCompeting` when the round has cleared (`ready={!!preview}`) rather than exposing a trigger button.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RankedProposal shape corrected to the authoritative wire shape**
- **Found during:** Task 1 (solver.ts client seam)
- **Issue:** The plan's action sketch described a flat `RankedProposal {configTag, model, temperature, ...}`; the frozen `agent.ts`/`api.ts` wire nests these under `config: {id, model, temperature}`. Mirroring the sketch would decode-skew against the real `/competing` response.
- **Fix:** Typed `RankedProposal.config = {id, model, temperature}` (byte-mirror), and moved the display formatting into `lib/leaderboard.ts formatConfigTag` (which builds the `HAIKU · t0.0` tag from `config`).
- **Files modified:** web/src/solver.ts, web/src/lib/leaderboard.ts
- **Verification:** `npx tsc --noEmit` clean; 15 leaderboard tests green; the fetch-mock scan invokes `getCompeting` against the real signature.
- **Committed in:** 8c3925b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wire-shape fidelity, per read_first instruction)
**Impact on plan:** Necessary for correct decoding of the `/competing` response. No scope creep — the plan's 8 exports and both artifacts ship as specified.

## Issues Encountered
None - both tasks executed cleanly. Full web suite (100 tests, 13 files) + `tsc --noEmit` + `npm run build` all green.

## Threat Model Compliance
- **T-13-36 (Information Disclosure):** All 8 client fns ride `SOLVER_BASE_URL`/`call<T>()` with no auth header. Bundle scan: no `:4000`, `localhost:4100` appears exactly once (the single legit `SOLVER_BASE_URL` default), no `anthropic`/`sk-ant`/`ANTHROPIC_API_KEY`. fetch-mock test asserts no authorization/bearer/token/key header on any adjacent request.
- **T-13-37 (Tampering — misrepresent AI as authoritative):** persistent `LEADERBOARD · NARRATIVE — NOT A SETTLEMENT INPUT` tag + distinct `DETERMINISTIC §8 CLEAR — AUTHORITATIVE` block; rank-1 winner marked with ink weight/left-rule, never lime (no `#D6FB3C` in the component).

## User Setup Required
None - no external service configuration required. The panel and client seam are additive and credential-free; live behavior requires the solver running on `:4100` (existing operation).

## Next Phase Readiness
- The credential-free client fns for RFQ (S3) and issuance (S4) are in place — subsequent panels import them without editing `solver.ts`.
- S2 leaderboard is live on the Agent view; live UAT (races real solver configs against a booted stack) is the honest end-to-end confirmation step.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*

## Self-Check: PASSED
- All 5 files verified on disk (solver.ts, lib/leaderboard.ts + test, SolverLeaderboard.tsx, AgentView.tsx) + SUMMARY.md.
- Both task commits verified in git log (8c3925b, 22207e0).
- web suite 100/100 green, tsc clean, build clean, bundle grep-clean (no :4000, single :4100, no anthropic/key).
