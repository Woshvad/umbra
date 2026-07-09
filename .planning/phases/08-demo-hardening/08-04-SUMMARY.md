---
phase: 08-demo-hardening
plan: 04
subsystem: api
tags: [sse, anthropic-streaming, express, zod, daml-round-clear, verify-dont-trust, vitest]

# Dependency graph
requires:
  - phase: 08-03
    provides: TRUST-02 timeout ladder + parseOrder/POST /parse-order on the same tree
  - phase: 05 (AI Solver Agent)
    provides: createAgent DI factory, module-private ANTHROPIC_API_KEY, SYSTEM_PROMPT, buildBatchMessage
  - phase: 04 (Solver Service)
    provides: createApp(deps) DI factory, ledger.settle contract-gathering, secret-safe error envelope
provides:
  - "agent.streamRationale(views, {onDelta,onDone,onError}) over client.messages.stream().on('text')"
  - "brief.ts composeBrief() — pure shareable post-round NL summary"
  - "GET /round/:id/rationale-stream — SSE data: delta frames + done sentinel; single fallback frame on error"
  - "ledger.tamperClear(roundId, 'wrong-price'|'overfill') — attempts a rejected Round.Clear, surfaces the verbatim reject"
  - "POST /round/:id/tamper-clear — verbatim on-ledger rejection payload"
  - "additive `brief` field on the terminal-settled GET body"
affects: [08-06 (BreakTheAiPanel + web tamperClear), 08-07 (AgentRationale live SSE + RoundBrief), 08-05 (proof-pack embeds brief)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSE proxy of Anthropic streaming registered WITHOUT wrap() (streaming, not JSON); onError → one deterministic fallback frame"
    - "Dedicated tamper seam copies settle()'s exact contract-gathering but perturbs only numeric VALUES (Pitfall 3), leaving settle() byte-unchanged"

key-files:
  created: [solver/src/brief.ts]
  modified: [solver/src/ledger.ts, solver/src/ledger.test.ts, solver/src/agent.ts, solver/src/agent.test.ts, solver/src/api.ts, solver/src/api.test.ts, solver/src/index.ts, solver/src/index.test.ts]

key-decisions:
  - "tamperClear is a SEPARATE ledger.ts export (not a settle flag) — settle() stays byte-unchanged per hard constraint"
  - "Overfill mode's faithful verbatim reject is 'allocations do not match recomputed §8' (Daml asserts allocation-match before conservation for a +2 buy leg); test accepts either that or the conservation string"
  - "SSE onError writes ONE deterministic fallback frame (composeBrief with a neutral rationale) then ends — no done sentinel — so the browser typewriter still gets text"
  - "composeBrief is pure over numbers + the verified rationale — it cannot drift the clearing off $100.00"

patterns-established:
  - "AgentClient.messages.stream is optional in the DI surface so a parse-only fake still typechecks; keyless/stream-less → onError"
  - "streamRationale calls through client.messages.stream (not a detached ref) to preserve the SDK stream's `this` binding"

requirements-completed: [WOW-04, WOW-02]

# Metrics
duration: 16min
completed: 2026-07-09
---

# Phase 8 Plan 04: WOW-04 streamRationale/brief + WOW-02 tamperClear Summary

**Solver now streams its clearing rationale token-by-token as SSE with a secret-free single-frame fallback, composes a shareable post-round brief, and exposes a dedicated tamper seam that submits a deliberately wrong Round.Clear and surfaces the verbatim on-ledger rejection — while the real /settle path stays byte-unchanged and still clears $100.00.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-09T13:00:00Z
- **Completed:** 2026-07-09T13:15:00Z
- **Tasks:** 3
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- WOW-02: `ledger.tamperClear(roundId, mode)` mirrors `settle()`'s exact contract-gathering but perturbs only numeric values (`p*-1` / Buy `filledQty+2`), attempts the on-ledger `Round.Clear`, catches the verbatim `submitAndWait` reject, and resolves `{ rejected, error }` — never throws, never settles. Exposed via `POST /round/:id/tamper-clear`.
- WOW-04: `agent.streamRationale` proxies Anthropic `messages.stream().on('text')`; `GET /round/:id/rationale-stream` emits `text/event-stream` `data:` frames + a `done` sentinel, with a single deterministic fallback frame on any error (key/prompt never reach the wire).
- WOW-04: new pure `brief.ts composeBrief()` composes the shareable post-round summary; surfaced additively as `brief` on the terminal-settled GET body with no clearing-number drift.
- The real `settle` path (ledger.ts + api.ts) is byte-unchanged (verified via `git diff`); the §4 fixture still clears at exactly $100.00.
- Secret-sweep extended to `/rationale-stream` (no API key in streamed bytes) and `/tamper-clear` (no operator token / key in the response).

## Task Commits

Each task was committed atomically (author/committer `woshvad`, no Claude attribution):

1. **Task 1: WOW-02 tamperClear + verbatim-reject tests** - `648f2a5` (feat)
2. **Task 2: WOW-04 streamRationale + composeBrief + SSE/brief endpoints** - `46de20f` (feat)
3. **Task 3: WOW-02 POST /round/:id/tamper-clear endpoint + wiring** - `976c73f` (feat)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `solver/src/brief.ts` - NEW: pure `composeBrief()` post-round NL summary (secret-free, no number drift)
- `solver/src/ledger.ts` - Added `tamperClear(roundId, mode)`; `settle()` byte-unchanged
- `solver/src/ledger.test.ts` - Mock emulates the on-ledger recompute-and-assert; asserts both modes submit the tampered shape + surface the verbatim §8 rejection, never leaking the operator token
- `solver/src/agent.ts` - Added `streamRationale` + `AgentMessageStream`/`StreamHandlers` types; optional `messages.stream` on `AgentClient`
- `solver/src/agent.test.ts` - Added streamRationale coverage (deltas→onDone, keyless→onError, stream-error→onError + no leak)
- `solver/src/api.ts` - `AppDeps.streamRationale` + `AppDeps.tamperClear` + `composeBrief`; SSE `GET /round/:id/rationale-stream` (no wrap); `POST /round/:id/tamper-clear`; additive `brief` on terminal GET; `/settle` byte-unchanged
- `solver/src/api.test.ts` - SSE deltas+done, SSE error single fallback frame + no key, settled brief presence + sweep, tamper-clear both modes + 400 bad mode + secret sweep
- `solver/src/index.ts` - Thread `streamRationale`/`composeBrief`/`tamperClear` through `LedgerPort`/`BuildDepsArgs`/`buildDeps`
- `solver/src/index.test.ts` - Provide the three new deps in the two `buildDeps` wiring proofs

## Decisions Made
- Overfill tamper surfaces "allocations do not match recomputed §8" as the faithful first-firing assert (Auction.daml checks allocation-match before conservation for a +2 buy leg); the test accepts either that or the conservation string, since the live verbatim string is deferred to end-of-phase human verification.
- SSE error path writes exactly one fallback frame and ends (no `done` sentinel) — matches the plan's literal contract and keeps "exactly one fallback frame" assertable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended agent.test.ts and index.test.ts to keep the suite + typecheck green**
- **Found during:** Task 2 (WOW-04)
- **Issue:** Making `streamRationale`/`composeBrief` required in `BuildDepsArgs`/`AppDeps` broke the two `buildDeps(...)` calls in `index.test.ts` (missing fields); the new agent behavior also had no direct unit coverage.
- **Fix:** Added inert `streamRationale`/`composeBrief` stubs to `index.test.ts`'s two `buildDeps` calls and a `streamRationale` describe block to `agent.test.ts` (deltas/keyless/error). `index.test.ts`/`agent.test.ts` were not in the plan's `files_modified` list but the changes are required to keep `npm test` + `tsc` green and to unit-cover the new agent seam.
- **Files modified:** solver/src/index.test.ts, solver/src/agent.test.ts
- **Verification:** `npm test` (62 green) + `tsc --noEmit` clean
- **Committed in:** 46de20f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking test/typecheck maintenance)
**Impact on plan:** Necessary to keep the gates green and to cover the new streaming seam directly. No scope creep — no production behavior beyond the plan.

## Issues Encountered
None — baseline suite (49) → 62 tests, all green; typecheck clean throughout.

## User Setup Required
None - no external service configuration required. (Live on-ledger rejection of `tamper-clear` against the Canton LocalNet and real Anthropic streaming are deferred to end-of-phase human verification per config `human_verify_mode: end-of-phase`.)

## Next Phase Readiness
- 08-06 can wire the web `BreakTheAiPanel` to `POST /round/:id/tamper-clear` and `solver.ts openRationaleStream(id)` to `GET /round/:id/rationale-stream`.
- 08-07 can bind `AgentRationale` to the SSE source and render `RoundBrief` from the `brief` field.
- 08-05 proof-pack can embed the `composeBrief` output.
- Deferred human-verify: verbatim live `Round.Clear` reject string on the real ledger; live SSE token streaming with a real ANTHROPIC_API_KEY.

## Self-Check: PASSED
- FOUND: solver/src/brief.ts
- FOUND commits: 648f2a5, 46de20f, 976c73f

---
*Phase: 08-demo-hardening*
*Completed: 2026-07-09*
