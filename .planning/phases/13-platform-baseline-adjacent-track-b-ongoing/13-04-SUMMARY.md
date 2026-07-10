---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 04
subsystem: api
tags: [webhooks, hmac, node-crypto, timingsafeequal, retry, backoff, sandbox, clearing]

# Dependency graph
requires:
  - phase: 04 (solver clock/lifecycle)
    provides: clock.ts single-timer + always-clearTimeout hygiene (mirrored for retry)
  - phase: 05 (§8 clearing port)
    provides: auction.ts pure computeClearing (§4 golden — reused byte-unchanged by sandbox)
provides:
  - Signed/retried outbound webhook emitter (HMAC-SHA256, replay-guard, exponential backoff + jitter, in-memory delivery log)
  - Deterministic $100.00 sandbox-round fixture (assertSandboxClears drift guard)
affects: [13-09 (wires webhooks off lifecycle seams + POST /sandbox/round + register endpoints)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HMAC-SHA256 outbound webhook signing over `${ts}.${rawBody}` (Stripe-style, node:crypto only)"
    - "timingSafeEqual signature verify with length-guard (no throw on mismatch)"
    - "Exponential-backoff retry with a single always-cleared timer per delivery (clock.ts hygiene)"
    - "Secret-free delivery log (Error name / HTTP status only, never err.message or the subscription secret)"
    - "Additive sandbox fixture that reuses the byte-unchanged §8 core and asserts the golden $100.00 clear"

key-files:
  created:
    - solver/src/webhooks.ts
    - solver/src/webhooks.test.ts
    - solver/src/sandbox.ts
    - solver/src/sandbox.test.ts
  modified: []

key-decisions:
  - "Per-subscription secret held module-private in the registry Map; register() returns a secret-free handle {id,url,events}"
  - "Injected fetch/wait/random/now deps so retry+backoff is fully unit-testable with no network or real sleeps"
  - "assertSandboxClears takes an optional orders param (defaults to the fixture) so the drift-guard THROW path is directly testable"
  - "Replicated agent.ts allocationsEqual discipline inline in sandbox.ts to avoid pulling the heavy agent.ts (Anthropic SDK) import into a pure fixture module"

patterns-established:
  - "Outbound webhook: sign the EXACT posted body (no re-serialization drift); signature (one-way digest) in header, secret never crosses out"
  - "Drift guard: a new capability ASSERTS the §4 golden ($100.00 / A=10/B=8/C=2) rather than recomputing it"

requirements-completed: [OPS-04]

# Metrics
duration: 6min
completed: 2026-07-10
---

# Phase 13 Plan 04: OPS-04 Signed/Retried Webhooks + $100.00 Sandbox Fixture Summary

**HMAC-SHA256 signed, replay-guarded, exponential-backoff-retried outbound webhook emitter (with a secret-free in-memory delivery log) plus a deterministic sandbox-round fixture that asserts the canonical §4 batch clears at exactly $100.00 with fills A=10/B=8/C=2 — both pure, unit-tested, and leaking no secret.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-10T18:49:27Z
- **Completed:** 2026-07-10T18:55:37Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 created

## Accomplishments
- `webhooks.ts`: `signPayload` (HMAC-SHA256 `sha256=<hex>` over `${ts}.${rawBody}`), `verifySignature` (timingSafeEqual, length-guarded), `isReplayFresh` (X-Umbra-Timestamp replay-guard), and `createWebhooks(deps?)` — a subscription registry with `register`/`unregister`/`emit`/`deliveryLog`, emitting the four `X-Umbra-*` headers and retrying failing sinks with exponential backoff + jitter (~5 attempts) via a single always-cleared timer.
- `sandbox.ts`: `sandboxFixtureOrders()` (canonical §4 three-desk batch) + `assertSandboxClears()` (re-runs the deterministic §8 clear and throws a fixed drift message unless price === $100.00 and the allocation set equals {A:10, B:8, C:2}).
- Secret-sweep proven: the per-subscription secret + `ANTHROPIC_API_KEY`/operator-token sentinels never appear in any emitted payload or the delivery log.
- `auction.ts` left byte-unchanged; the §4 golden and full solver suite (211 tests) stay green.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): failing webhook test** - `73d5ff8` (test)
2. **Task 1 (GREEN): webhook emitter** - `ebd0cbf` (feat)
3. **Task 2 (RED): failing sandbox test** - `cbf24ef` (test)
4. **Task 2 (GREEN): sandbox fixture** - `ea5b21d` (feat)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP commit)

## Files Created/Modified
- `solver/src/webhooks.ts` - HMAC signing, replay-guard, subscription registry, retry/backoff, secret-free delivery log
- `solver/src/webhooks.test.ts` - 8 tests: sign/verify round-trip, replay-guard, header/body signature, retry-to-delivered, retry-to-failed (no double-fire), event filtering, no-secret-echo, secret-sweep
- `solver/src/sandbox.ts` - deterministic §4 fixture + `assertSandboxClears` drift guard (reuses byte-unchanged auction.ts)
- `solver/src/sandbox.test.ts` - 4 tests: fixture shape/determinism, $100.00 clear, throw-on-mutated-limit, throw-on-dropped-desk

## Decisions Made
- Per-subscription secret is module-private in the registry Map; `register()` returns `{id,url,events}` only (no secret echo).
- Injected `fetch`/`wait`/`random`/`now` deps → retry+backoff tested deterministically with no network or real sleeps.
- `assertSandboxClears(orders = fixture)` optional param makes the drift-guard THROW path directly testable.
- Inlined the `desk|side → filledQty` allocation-set equality (agent.ts discipline) in sandbox.ts to keep the pure fixture module free of the heavy agent.ts / Anthropic-SDK import.

## Deviations from Plan

None - plan executed exactly as written. (The tampered-signature test flipped a hex nibble deterministically after an initial no-op tamper landed on a `0` nibble — a test-only fix within the same GREEN step, not a scope change.)

## Issues Encountered
- Initial `verifySignature` tamper test replaced the last hex char with `'0'`, which happened to already be `0` (no-op → false negative). Fixed to flip to a guaranteed-different nibble. No production-code change.

## Threat Model Coverage
- **T-13-09 (Spoofing/Tampering):** HMAC-SHA256 over `ts.rawBody` + timingSafeEqual verify + `isReplayFresh` timestamp guard — mitigated, unit-tested.
- **T-13-10 (Information Disclosure):** per-subscription secret module-private; secret-sweep asserts no secret/API-key/operator-token in payload or delivery log — mitigated.
- **T-13-11 (Tampering / sandbox drift):** `assertSandboxClears` asserts $100.00 / A=10/B=8/C=2; auction.ts byte-unchanged; golden suite green — mitigated.

## User Setup Required
None - no external service configuration required. (Wiring the emitter off live lifecycle seams + exposing `POST /sandbox/round` and authenticated register endpoints is scoped to plan 13-09.)

## Next Phase Readiness
- Pure emitter + fixture ready for 13-09 to wire off the `index.ts`/clock/settle lifecycle seams and expose the sandbox + subscription endpoints.
- No blockers. §4 canary intact; full solver suite (211 tests) + tsc clean.

## Self-Check: PASSED

- All 4 source files present on disk.
- All 4 task commits (73d5ff8, ebd0cbf, cbf24ef, ea5b21d) present in git history.
- Full solver vitest suite: 211/211 green (webhooks 8, sandbox 4, auction §4 $100.00). `tsc --noEmit` clean. `auction.ts` byte-unchanged.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
