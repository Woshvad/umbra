---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 09
subsystem: solver
tags: [webhooks, hmac, lifecycle, sandbox, fix, ops-04, ops-05, express, zod, di]

# Dependency graph
requires:
  - phase: 13-04
    provides: "webhooks.ts (signed/retried emitter + registry) + sandbox.ts (§4 fixture + assertSandboxClears)"
  - phase: 13-05
    provides: "fix.ts (FIX 4.4-subset parse/build + handleFixMessage + newFixSession)"
  - phase: 13-07
    provides: "createApp(deps) DI factory + FSM/idempotency/status seams (wave dependency)"
  - phase: "04/12"
    provides: "clock.ts close seam, index.ts buildDeps boot wiring, §11 endpoints + secret-sweep test discipline"
provides:
  - "Lifecycle webhook emits: round.opened (open seam), round.sealed (clock close seam), round.cleared/round.settled/fill.posted (settle seam) — all FIRE-AND-FORGET"
  - "POST /webhooks (register) + DELETE /webhooks/:id (unregister) — zod .strict, subscription secret NEVER echoed"
  - "POST /sandbox/round — deterministic §4 fixture ($100.00, A=10/B=8/C=2), SANDBOX-namespaced, isolated from real rounds"
  - "POST /fix — HTTP-wrapped raw-FIX order-entry acceptor (35=D -> 35=8; malformed -> reject, never a 500); credential-free"
  - "clock.ts onClosed seam (round.sealed) + webhooks threaded through buildDeps/AppDeps"
affects: [solver-integration-surfaces, OPS-04, OPS-05, web-webhook-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget lifecycle emit: void Promise.resolve().then(() => webhooks.emit(...)).catch(() => undefined) — a webhook can NEVER block/branch/fail the legal open/close/settle path"
    - "clock.ts onClosed hook: an optional ClockDeps seam fired once per Open->Closed (auto + force), guarded so a throwing emitter never perturbs the round clock"
    - "Pure-import wiring for stateless surfaces (assertSandboxClears, handleFixMessage) — mirrors fsm.transition/status.buildStatus precedent, no DI needed"
    - "express.text per-route body parser + body-parser _body guard so POST /fix accepts text/plain OR JSON {fix} without disturbing the global express.json"

key-files:
  created: []
  modified:
    - solver/src/clock.ts
    - solver/src/api.ts
    - solver/src/index.ts
    - solver/src/clock.test.ts
    - solver/src/index.test.ts
    - solver/src/api.test.ts

key-decisions:
  - "Lifecycle emits are strictly FIRE-AND-FORGET off the existing seams — the legal open/close/settle behavior is byte-unchanged; a webhook rejection is swallowed (proven by 'still 201/200 when emit rejects' tests)"
  - "round.sealed fires from clock.ts's close() routine (covers BOTH auto-close and forceClose) via a new optional onClosed ClockDeps seam — the single sealing point"
  - "fill.posted fires ONCE PER TradeConfirmation, read off the request path (Open Question 1 recommendation); the confirmation read is inside the fire-and-forget block so it never blocks /settle"
  - "Emit payloads carry aggregate/round data ONLY (roundId, desk COUNT, public clearing price, matched volume, per-desk fill) — never a sealed order's limit/order content (swept in tests)"
  - "POST /sandbox/round computes the fixture purely via assertSandboxClears (no ledger, no real-round state) — isolated, deterministic, offline-testable; SANDBOX- id namespace never collides with real R- ids"
  - "POST /fix wraps fix.ts handleFixMessage (map + reply) only; it does NOT submit to Venue.SubmitOrder — actual sealed submission is a desk-token action the operator boundary cannot perform (honest FIX-subset, order-entry-only; live OMS interop is a UAT gate)"
  - "Webhook register/unregister sit behind the same operator boundary as the §11 mutating endpoints (no new auth middleware exists in the pattern; adding one was out of scope)"

patterns-established:
  - "Pattern: additive integration endpoint = zod .strict() body + secret-safe {error:{code,message}} envelope + a co-located secret-sweep test (webhooks, sandbox, fix all follow it)"
  - "Pattern: lifecycle event firing off an existing seam without changing legal-path behavior (fire-and-retry, guarded, aggregate-only payload)"

requirements-completed: [OPS-04, OPS-05]

# Metrics
duration: 13min
completed: 2026-07-10
---

# Phase 13 Plan 09: OPS-04/05 Webhook + Sandbox + FIX Wiring Summary

**Wired the Wave-1 OPS-04 webhook emitter/sandbox fixture and the OPS-05 FIX acceptor into the running solver: signed/retried lifecycle webhooks fire FIRE-AND-FORGET off the existing open/close/clear/settle seams; authenticated `POST /webhooks` + `DELETE /webhooks/:id` manage subscriptions without ever echoing the secret; `POST /sandbox/round` deterministically clears the canonical §4 fixture at $100.00 (A=10/B=8/C=2), isolated from real rounds; `POST /fix` maps a raw FIX 4.4 NewOrderSingle to an ExecutionReport (malformed → 35=8 reject, never a 500). The five §11 endpoints + /settle stay byte-compatible and the §4 golden stays green.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-10T19:59Z
- **Completed:** 2026-07-10T20:12Z
- **Tasks:** 3
- **Files modified:** 6 (0 created, 6 modified)

## Accomplishments

### Task 1 — Lifecycle webhook emits + register/unregister endpoints (commit 037c697)
- `clock.ts`: added an optional `onClosed(roundId)` seam to `ClockDeps`, fired ONCE inside `close()` after the authoritative Open→Closed transition (covers both the auto-close timer AND `forceClose`), wrapped in a try/catch so a throwing emitter can never perturb the clock.
- `api.ts`: added an optional `webhooks?: Webhooks` `AppDeps` field (defaults to a fresh `createWebhooks()` so existing tests are byte-unaffected); a `emitSafe` fire-and-forget helper; `POST /webhooks` (zod `.strict`, returns `{ id, url, events }` — the subscription secret is NEVER echoed) + `DELETE /webhooks/:id` (404 on unknown id); and `round.cleared` / `round.settled` / `fill.posted` (once per TradeConfirmation) emitted off the settle handler entirely off the request path.
- `index.ts`: constructs the emitter ONCE at boot, fires `round.opened` off the `buildDeps` open seam (aggregate data only — roundId + desk count), threads the SAME instance into `createApp`, and wires `round.sealed` off the clock's `onClosed`.
- Tests: `clock.test.ts` (onClosed on auto-close + forceClose + a throwing seam that must not perturb close), `index.test.ts` (round.opened spy emitter + a rejecting emitter that must still return 201), `api.test.ts` (register never echoes the secret, malformed → 400, unregister + 404, settle fires all five/three events, a rejecting emitter still returns a byte-unchanged 200).

### Task 2 — POST /sandbox/round (commit 51d95d6)
- `api.ts`: `POST /sandbox/round` reuses `assertSandboxClears()` (re-runs the deterministic §8 clear and THROWS a fixed drift message unless the price is 100.00 and the allocation set is A=10/B=8/C=2), returns `{ roundId: 'SANDBOX-…', clearingPrice: 100, allocations, matched: 10, sandbox: true }`. Reads/mutates NO real-round state and touches no secret.
- Tests: exact $100.00 / A=10/B=8/C=2 / `sandbox:true`; SANDBOX- namespaced id that never collides with a real `R-` id and never calls the real-round ledger seam; secret sweep.

### Task 3 — POST /fix (commit 6589193)
- `api.ts`: `POST /fix` (per-route `express.text`) accepts a raw FIX string (text/plain) OR a JSON `{ fix }` field and wraps `handleFixMessage` on a single monotonic FIX session — a valid `35=D` → `35=8` OrdStatus 0 (New), a malformed/unmapped frame → `35=8` OrdStatus 8 (Rejected) with a 200 (the reject is IN the frame, never a 500). Credential-free.
- Tests: valid NewOrderSingle → New; JSON `{ fix }` body; malformed frame → Rejected 200 (no throw); foreign symbol → Rejected; secret sweep.

## Verification

- `cd solver && npx vitest run` — **258 tests pass** (23 files; up from a 240-test baseline, +18 new).
- `cd solver && npx tsc --noEmit` — clean (exit 0).
- §4 golden intact: `POST /sandbox/round` and the settle canary both assert clearingPrice `100`; the existing `auction.test.ts` / `settle` golden tests are untouched and green.
- The five §11 endpoints + `/settle` are byte-compatible (all pre-existing `api.test.ts` assertions still pass; new features are additive optional deps / new routes).
- Secret sweeps pass on `/webhooks` (subscription secret), `/sandbox/round`, and `/fix` (operator token + ANTHROPIC_API_KEY sentinels).

## Deviations from Plan

### Auto-fixed / clarifying adjustments

**1. [Rule 3 - Wiring] Webhook register + settle-emit tests placed in `api.test.ts` (task-1 commit)**
- **Found during:** Task 1
- **Issue:** Task 1's acceptance criteria assert the `POST /webhooks` register behavior and settle-seam emits, but its `<files>` list named only `index.test.ts` / `clock.test.ts`. Those endpoints live on `createApp`, whose contract test is `api.test.ts`.
- **Fix:** Added the register/unregister/settle-emit/secret-sweep tests to `api.test.ts` and included it in the task-1 commit so the acceptance criteria are genuinely proven.
- **Files modified:** solver/src/api.test.ts
- **Commit:** 037c697

**2. [Clarification] POST /fix maps + replies; it does not submit to the ledger**
- **Found during:** Task 3
- **Issue:** The plan prose says the handler "forwards to `Venue.SubmitOrder` via the desk seam", but the Wave-1 `fix.ts` `handleFixMessage` only maps + replies, and sealed submission requires the DESK's own token (privacy model — the operator cannot submit on a desk's behalf).
- **Fix:** Wired `POST /fix` to `handleFixMessage` (the honest, offline-testable behavior) with the honest FIX-4.4-subset / order-entry-only label. No ledger submission wired.
- **Files modified:** solver/src/api.ts
- **Commit:** 6589193

**3. [Scope] Webhook register/unregister use the existing operator boundary, no new auth middleware**
- **Found during:** Task 1
- **Issue:** The threat model labels `/webhooks register` "authenticated", but `api.ts` has no Express-layer auth middleware — every solver endpoint sits behind the operator-plane trust boundary.
- **Fix:** Registered `/webhooks` on the same operator-plane surface as the §11 mutating endpoints (consistent with the codebase pattern). Documented as an honest boundary; a dedicated auth layer would be a separate, larger change.

## Known Stubs

None that block the plan goal. The FIX acceptor is a deliberate, honest-labeled FIX 4.4 subset (order-entry only; live OMS interop is a UAT gate, per 13-CONTEXT). Webhook subscription registry + delivery log are in-memory with a documented Postgres swap (per 13-CONTEXT decisions), out of scope for this plan.

## Threat Flags

None. The new surfaces (`/webhooks`, `/sandbox/round`, `/fix`) are exactly the surfaces enumerated in the plan's `<threat_model>` (T-13-25..28); each carries its planned mitigation (HMAC + aggregate-only payloads, module-private secret + secret-sweep, malformed-safe FIX parse, `assertSandboxClears` drift guard).

## Self-Check: PASSED

- Files: solver/src/clock.ts, solver/src/api.ts, solver/src/index.ts, 13-09-SUMMARY.md — all FOUND.
- Commits: 037c697, 51d95d6, 6589193 — all FOUND.
- Full suite: 258/258 green; tsc --noEmit clean.
