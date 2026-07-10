---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 10
subsystem: api
tags: [anthropic, competing-solvers, deterministic-referee, ranking, vitest, tdd]

# Dependency graph
requires:
  - phase: 13-07
    provides: agent.ts verify-don't-trust gate (priceEqual/allocationsEqual referee, withTimeout degradation, module-private key)
provides:
  - "proposeCompeting(views, configs) — additive competing-solver ranking on the deterministic §8 verify gate"
  - "RankedProposal / CompetingResult / SolverConfig types + pure rankProposals + computeSurplus helpers"
  - "createAgent().proposeCompeting method + top-level proposeCompeting export bound to the module-private client"
affects: [ADJ-01, competing-solvers, agent-leaderboard, web-leaderboard-panel, solver-api]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Competing solvers refereed by the deterministic §8 recompute — verify-only eligibility, AI off the settlement path"
    - "Per-config concurrent race via Promise.all; each config degrades to verified:false (never throws), reusing withTimeout + secret-free catch"

key-files:
  created: []
  modified:
    - solver/src/agent.ts
    - solver/src/agent.test.ts

key-decisions:
  - "proposeClearing left byte-unchanged; proposeCompeting added alongside (the only line touched in the existing surface is the createAgent return object gaining the new method member)"
  - "Leaderboard = verified proposals only, ranked (matchedVolume desc, surplus desc); an additive `entries` field surfaces EVERY config's honest outcome (incl. referee-rejected) for the narrative panel"
  - "surplus = total gains-from-trade (Σ buys fill·(limit−p) + Σ sells fill·(p−limit)); §4 = 18 at $100.00 — the (matched, surplus) tiebreak primitive"
  - "Ranking primitive unit-tested directly on synthetic RankedProposal[] (verified proposals all tie by construction since they equal the referee, so the comparator is tested in isolation)"

patterns-established:
  - "Pattern: competing AI configs race concurrently, deterministic recompute is the referee, winner is narrative-only and never a settlement input"
  - "Pattern: a failing/timeout/keyless config resolves to a verified:false entry excluded from the ranked leaderboard — proposeCompeting never throws"

requirements-completed: [ADJ-01]

# Metrics
duration: 8min
completed: 2026-07-10
---

# Phase 13 Plan 10: ADJ-01 Competing AI Solvers Summary

**Additive `proposeCompeting(views, configs)` races N solver configs concurrently, refereed by the deterministic §8 recompute (verified only when priceEqual && allocationsEqual), and returns a narrative leaderboard ranked by (matchedVolume, surplus) — the deterministic clear still settles unconditionally, AI off the settlement path.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-10T21:17:00Z
- **Completed:** 2026-07-10T21:22:00Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 2

## Accomplishments
- `proposeCompeting` runs each `SolverConfig` (model/temperature/systemPrompt) concurrently via `Promise.all`, reusing the existing per-call internals (structured-output parse + zod re-validate + `withTimeout`).
- The deterministic §8 recompute is the REFEREE: a proposal is `verified` ONLY when it equals the deterministic result; only verified proposals rank. The winner is narrative — no settlement path consults it.
- A diverging / malformed / keyless / SDK-error / timed-out config degrades to a `verified:false` entry (excluded from the ranked leaderboard) and `proposeCompeting` never throws.
- The `deterministic` block always carries the authoritative §8 numbers; on the §4 fixture that is $100.00 / A=10 B=8 C=2 / matchedVolume 10 / surplus 18.
- Secret discipline preserved: the ANTHROPIC_API_KEY sentinel never appears in any `CompetingResult` nor any log line (asserted).

## Task Commits

Each task was committed atomically (author/committer = woshvad, zero Claude attribution):

1. **Task 1 (RED): failing tests for proposeCompeting** - `d4efabe` (test)
2. **Task 1 (GREEN): proposeCompeting implementation** - `84fdb15` (feat)

**Plan metadata:** see final `docs(13-10)` commit.

_TDD task: RED (test) → GREEN (feat); no refactor needed._

## Files Created/Modified
- `solver/src/agent.ts` - Added `SolverConfig` / `RankedProposal` / `CompetingResult` types, pure `computeSurplus` + `rankProposals`, module-level `runCompetingConfig` + `proposeCompetingWith`, the `createAgent().proposeCompeting` method, and a top-level `proposeCompeting` export bound to the module-private client + real §8. `proposeClearing` body byte-unchanged.
- `solver/src/agent.test.ts` - Added 7 competing-solver tests: referee gate (two-agree/one-diverge), deterministic block ($100.00/A=10/B=8/C=2/surplus 18), throwing-config degradation + secret sweep, hanging-config timeout, keyless (winner null), the `rankProposals` ordering primitive, and `computeSurplus` §4=18.

## Decisions Made
- Additive-only: `proposeClearing` untouched; the sole edit to the existing surface is the `createAgent` return object gaining the `proposeCompeting` member.
- `leaderboard` holds verified-only ranked proposals; an additive `entries` field lists every config's honest outcome (verified flag included) so the referee-rejected competitors are observable/narratable without polluting the ranking.
- The ranking comparator is unit-tested in isolation because, by construction, every verified proposal equals the referee and therefore ties on (matched, surplus) — the primitive is proven directly on synthetic inputs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `proposeCompeting` is ready to be surfaced by a later plan's solver API endpoint + the web Agent-view leaderboard panel.
- The referee guarantee (deterministic §8 settles unconditionally; AI advisory-only) holds — no settlement code path calls `proposeCompeting`.
- Full solver suite green (265 tests); §4 still clears $100.00; `npx tsc --noEmit` clean.

## Self-Check: PASSED

- FOUND: `solver/src/agent.ts`
- FOUND: `.planning/phases/13-platform-baseline-adjacent-track-b-ongoing/13-10-SUMMARY.md`
- FOUND commit `d4efabe` (test RED gate)
- FOUND commit `84fdb15` (feat GREEN gate)

## TDD Gate Compliance
- RED gate: `d4efabe` (`test(13-10)`) — 7 failing tests before implementation.
- GREEN gate: `84fdb15` (`feat(13-10)`) — implementation, all 40 agent+auction tests green (265 full suite).
- REFACTOR: not required.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
