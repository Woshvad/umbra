---
phase: 10-cryptographic-privacy
plan: 07
subsystem: api
tags: [typescript, fetch-client, timelock, zk-proof, groth16, drand, vitest, react]

# Dependency graph
requires:
  - phase: 10-cryptographic-privacy (10-06)
    provides: the 7 zod-validated solver crypto endpoints (timelock-encrypt/decrypt, prove, verify-proof, anchor-proof, tamper-proof, stage-offsets) whose response shapes this client mirrors
  - phase: 08-wow (08-01/08-07)
    provides: web/src/solver.ts operator-plane client scaffold (SOLVER_BASE_URL single-port source, call<T>(), SolverError OFFLINE, OFFLINE_CAPTION) + the pure solverUrls.test.ts pattern
provides:
  - "web/src/solver.ts typed operator-plane client for every Phase-10 solver endpoint (timelockEncrypt/Decrypt, generateProof/verifyProof/anchorProof/tamperProof, getStageOffsets) + envelope-safe response types"
  - "web/src/lib/cryptoUrls.test.ts pure URL + no-credential proof (stubbed fetch route assertions + comment-stripped source scan)"
affects: [10-08 OrderTicket timelock/commit view, 10-09 ProofOfClearingPanel, 10-10 TimeMachineView]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase-10 crypto client fns reuse the shipped call<T>()/SolverError/OFFLINE_CAPTION grammar (no new fetch layer)"
    - "verify (off-ledger, T3) vs anchor (on-ledger hash, T1) are DISTINCT client shapes so consuming views can render honest-labeling provenance"
    - "vite ?raw source import (typed by vite/client) drives a build-clean static credential scan — no node:fs, so the app tsc (no @types/node) stays green"

key-files:
  created:
    - web/src/lib/cryptoUrls.test.ts
  modified:
    - web/src/solver.ts

key-decisions:
  - "Mirrored the ACTUAL solver/src/api.ts response shapes verbatim over the plan's approximate type sketch: verify-proof returns { verified } (not the sketched { ok }); verify/anchor POST the full proof envelope { vkey, publicSignals, proof } (not a bare hashes arg); tamper-proof carries verified:false alongside { rejected, error }"
  - "Static credential scan reads solver.ts via a vite ?raw import (typed by vite/client) instead of node:fs — the app build tsconfig has no @types/node, so node:fs would break `tsc --noEmit`"

patterns-established:
  - "Pattern 1: every Phase-10 client path is built off the single SOLVER_BASE_URL (no :4000, no port literal) and carries no auth header — the browser never holds the operator token or ANTHROPIC_API_KEY"
  - "Pattern 2: envelope-safe response types expose only ciphertext + PUBLIC beacon metadata / opaque proof JSON / hashes / offsets / booleans — never a witness, salt, beacon private share, or key"

requirements-completed: [CRYP-01, CRYP-02, CRYP-03, VIZ-02]

# Metrics
duration: 7min
completed: 2026-07-09
---

# Phase 10 Plan 07: Typed Phase-10 Crypto Operator-Plane Client Summary

**Extended web/src/solver.ts with a credential-free, envelope-safe TypeScript client for all seven Phase-10 solver crypto endpoints (drand timelock, Groth16 prove/verify/anchor/tamper, VIZ-02 stage-offsets), plus a pure vitest that locks it to the single solver port with zero secret in the bundle.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-09T23:08:00Z
- **Completed:** 2026-07-09T23:11:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Seven typed client fns (`timelockEncrypt`, `timelockDecrypt`, `generateProof`, `verifyProof`, `anchorProof`, `tamperProof`, `getStageOffsets`) + their response types (`TimelockSealResponse`, `TimelockPlaintext`, `DrandRoundInfo`, `ProofArtifact`, `ProofEnvelope`, `VerifyVerdict`, `AnchorResult`, `TamperProofResponse`, `StageOffsetsResponse`), all off `SOLVER_BASE_URL` via the shipped `call<T>()`.
- Response types mirror the ACTUAL `solver/src/api.ts` shapes exactly (verify → `{ verified }`, envelope-bodied verify/anchor, tamper `verified:false`) so the Wave-5 views decode without drift.
- Honest-labeling grammar honored in the types/comments: verify (off-ledger T3) and anchor (on-ledger hash T1) kept distinct; the offline seal `warning` documented as the T3 weaker-than-drand disclosure.
- `cryptoUrls.test.ts`: 11 tests — stubbed-fetch route/method assertions (no `:4000`), no-Authorization-header checks, and a comment-stripped source scan proving no operator token / Anthropic key / auth header in the bundle.

## Task Commits

Each task was committed atomically:

1. **Task 1: web/src/solver.ts — Phase-10 crypto client fns + response types** - `9f85515` (feat)
2. **Task 2: cryptoUrls.test.ts — pure URL + no-credential unit test** - `04e3b59` (test)

## Files Created/Modified
- `web/src/solver.ts` - Added the Phase-10 crypto types + 7 client fns (143 insertions; existing five endpoints byte-unchanged).
- `web/src/lib/cryptoUrls.test.ts` - New pure URL + no-credential proof (11 tests).

## Decisions Made
- **Mirror api.ts over the plan's type sketch.** The plan sketched `VerifyVerdict ({ ok })` and `anchorProof(id, hashes)`, but `solver/src/api.ts` (authoritative per CLAUDE.md) returns `{ roundId, verified }` and both verify/anchor accept the proof envelope `{ vkey, publicSignals, proof }`. The client mirrors the real wire shapes so it actually decodes the solver's responses; type names kept from the plan where sensible (`VerifyVerdict`, `AnchorResult`, `TamperProofResponse`).
- **Static scan via `?raw`, not `node:fs`.** The app build (`tsc --noEmit`) has no `@types/node`; `node:fs` broke the build. Switched the source read to a `../solver?raw` import (typed by the referenced `vite/client`), keeping both the app build and vitest green.

## Deviations from Plan

None affecting scope — the two decisions above are faithful mirroring of the authoritative `api.ts` and a build-compatibility fix, not new functionality. No architectural change; the view components were not touched (the shared-seam invariant held).

## Issues Encountered
- Initial `cryptoUrls.test.ts` used `node:fs` + an untyped arrow param, which passed vitest but failed `npm run build` (`tsc --noEmit`: `Cannot find module 'node:fs'`, implicit-any). Resolved by importing the source via `../solver?raw` and annotating `(line: string)`. Full build + suite green after the fix (committed within the Task 2 commit before finalization).

## User Setup Required
None - no external service configuration required. (Live drand/ZK/timelock behavior against a running solver + Canton LocalNet remains an end-of-phase human-verification item, per the Phase-10 plan; this plan is build-time only and never boots :3975.)

## Next Phase Readiness
- The shared seam (`web/src/solver.ts`) is complete and stable, so the three Wave-5 view plans (10-08 OrderTicket, 10-09 ProofOfClearingPanel, 10-10 TimeMachineView) can consume the typed client in parallel without touching solver.ts (no merge conflicts).
- Gate green: `cd web && npm run build` succeeds; full web `npx vitest run` = 48 passed (7 files); `tsc --noEmit` clean; grep-clean of `:4000` / operator-token / Anthropic-key in code.

## Self-Check: PASSED
- `web/src/solver.ts` — FOUND (modified, commit 9f85515)
- `web/src/lib/cryptoUrls.test.ts` — FOUND (created, commit 04e3b59)
- Commit 9f85515 — FOUND in git log
- Commit 04e3b59 — FOUND in git log

---
*Phase: 10-cryptographic-privacy*
*Completed: 2026-07-09*
