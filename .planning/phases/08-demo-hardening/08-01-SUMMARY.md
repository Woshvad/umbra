---
phase: 08-demo-hardening
plan: 01
subsystem: infra
tags: [ci, github-actions, vitest, port-config, vite, react, gitignore]

# Dependency graph
requires:
  - phase: 06-frontend
    provides: web/src/solver.ts operator-plane fetch client + Theatre/Agent/Settlement views
  - phase: 04-solver
    provides: solver/src/index.ts boot + :4100 bind, auction.ts §8 golden fixtures
provides:
  - "Truthful solver port (:4100) across all of web/src — single derived source (solverPort/OFFLINE_CAPTION)"
  - "TRUST-01 CI golden-eval workflow (.github/workflows/ci.yml) — golden vitest always + daml test on main"
  - "solver/proofs/ gitignored (TRUST-03 decision-bundle dir; never commits a bundle or the API key)"
  - "web/.env.example documenting VITE_SOLVER_URL=http://localhost:4100 for a fresh clone"
affects: [08-02, 08-03, 08-04, 08-05, TRUST-03, WOW-02, WOW-04, WOW-05]

# Tech tracking
tech-stack:
  added: [github-actions]
  patterns: ["Single-source derived port: parse SOLVER_BASE_URL once → solverPort → OFFLINE_CAPTION; captions never carry a literal port digit"]

key-files:
  created: [.github/workflows/ci.yml, web/.env.example]
  modified: [web/src/solver.ts, web/src/views/AgentView.tsx, web/src/views/SettlementView.tsx, web/src/views/TheatreView.tsx, web/src/components/AgentProposal.tsx, solver/src/index.ts, .gitignore]

key-decisions:
  - "Reused the existing auction.test.ts §4 fixture (clears 100.00, A=10/B=8/C=2) as the CI golden gate — no new golden test file needed; the vitest suite IS the regression gate."
  - "daml job gated to push on main (github.ref == refs/heads/main) — SDK install is heavy; golden stays on every push + PR."
  - "OFFLINE_CAPTION derives the port from SOLVER_BASE_URL via new URL().port with a try/catch '4100' fallback — no second port literal anywhere (UI-SPEC Reconciliation Note 2)."

patterns-established:
  - "Single derived port source: every solver-plane offline caption imports OFFLINE_CAPTION from web/src/solver.ts; changing the URL default is the only place a port lives."

requirements-completed: [TRUST-01]

# Metrics
duration: 12min
completed: 2026-07-09
---

# Phase 8 Plan 01: Wave-1 Base (Port-Drift Fix + TRUST-01 CI Gate) Summary

**Killed the shipped :4000→:4100 solver port-drift lie across all five web/src files via a single derived OFFLINE_CAPTION, and stood up the TRUST-01 two-job CI golden-eval workflow that asserts the §4 fixture clears at $100.00 on every push/PR.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-09
- **Tasks:** 2
- **Files modified:** 9 (7 modified, 2 created)

## Accomplishments
- Eliminated every `:4000` literal from `web/src` (13 occurrences across 5 files) — the fetch fallback, four rendered offline captions, and all stale comments now reflect the live `:4100` bind. Repo grep for `:4000` in `web/src` returns nothing.
- Introduced a single derived port source in `web/src/solver.ts`: `solverPort` (parsed once from `SOLVER_BASE_URL`) + `OFFLINE_CAPTION`, imported and rendered by AgentView, SettlementView, and TheatreView — no caption carries a literal port digit.
- Flipped `solver/src/index.ts` `DEFAULT_SOLVER_PORT` 4000 → 4100 (SOLVER_PORT env still overrides).
- Created `.github/workflows/ci.yml` — TRUST-01 two-job gate: `golden` (solver vitest on every push/PR touching solver/** or daml/**) + `daml` (SDK install + `daml build && daml test` on main push).
- Gitignored `solver/proofs/` (the Phase-8 TRUST-03 decision-bundle dir) so no per-round bundle or API key can ever be committed.
- Created `web/.env.example` documenting `VITE_SOLVER_URL=http://localhost:4100` (no secrets).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix :4000→:4100 port drift across web/src (single derived port)** - `5d3d27d` (fix)
2. **Task 2: TRUST-01 CI golden-eval workflow + gitignore solver/proofs/ + web/.env.example** - `ad30a58` (chore)

## Files Created/Modified
- `web/src/solver.ts` - Default SOLVER_BASE_URL to :4100 (single port source); added exported `solverPort` (parsed once) + `OFFLINE_CAPTION`; `call()` throws OFFLINE_CAPTION.
- `web/src/views/AgentView.tsx` - Import + render OFFLINE_CAPTION (was literal :4000 caption); comment scrubbed.
- `web/src/views/SettlementView.tsx` - Import + render OFFLINE_CAPTION; comments scrubbed (left the `10/4000` order-size data literal untouched).
- `web/src/views/TheatreView.tsx` - OfflineCaption() renders OFFLINE_CAPTION (WOW-02 operator surface); comments scrubbed.
- `web/src/components/AgentProposal.tsx` - Stale :4000 comment scrubbed to :4100.
- `solver/src/index.ts` - DEFAULT_SOLVER_PORT 4000 → 4100; comment updated.
- `.github/workflows/ci.yml` (NEW) - TRUST-01 golden vitest job (always) + daml test job (main push).
- `web/.env.example` (NEW) - Documents the live solver port.
- `.gitignore` - Added `solver/proofs/` under a Phase-8 secret-hygiene comment.

## Decisions Made
- Reused the existing `solver/src/auction.test.ts` §4 fixture as the CI golden gate — it already asserts 100.00 / A=10·B=8·C=2 plus the 99-vs-100 tie-break trap. No new golden file needed.
- Port is derived once and read everywhere; adding a second `:4100` literal was explicitly avoided (RESEARCH anti-pattern / UI-SPEC Note 2).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. All gates green on the first pass.

## Verification Evidence
- `cd web && npm run build` — passed (tsc --noEmit + vite build, 99 modules).
- `grep -rn ':4000' web/src` — no matches (port-drift lint gate clean across all 5 files).
- `cd solver && npm test` — 36 tests passed (6 files), incl. §4 clears 100.00 / A=10·B=8·C=2.
- `cd solver && npm run typecheck` — clean.
- `git check-ignore -v solver/proofs/anything.json` — reports `.gitignore:37`.
- `web/.env.example` present with `VITE_SOLVER_URL=http://localhost:4100`.
- `ci.yml` — both `golden` and `daml` jobs present with the solver/** · daml/** path filter (string-validated; python/yaml not on box).

## Threat Surface Scan
No new security-relevant surface introduced. Mitigations delivered as planned: T-08-01-CFG (derived port caption), T-08-01-SEC (solver/proofs/ gitignored; .env.example non-secret), T-08-01-CI (golden vitest regression gate). No new endpoints, auth paths, or schema changes.

## Next Phase Readiness
- Wave-1 base is clean: truthful ports, CI gate live, proofs dir ignored, fresh-clone port documented.
- Later Phase-8 waves (WOW-02 tamper on TheatreView, WOW-04 rationale, TRUST-03 proof bundles writing to solver/proofs/) land on this base.
- Note: the `daml` CI job installs the SDK live on GitHub runners — not exercised locally per the phase constraint (no live ledger boot); it is a file deliverable.

## Self-Check: PASSED
- FOUND: .github/workflows/ci.yml
- FOUND: web/.env.example
- FOUND: .planning/phases/08-demo-hardening/08-01-SUMMARY.md
- FOUND commit: 5d3d27d (Task 1)
- FOUND commit: ad30a58 (Task 2)

---
*Phase: 08-demo-hardening*
*Completed: 2026-07-09*
