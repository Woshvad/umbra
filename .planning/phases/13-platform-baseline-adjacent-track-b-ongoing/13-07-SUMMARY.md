---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 07
subsystem: solver
tags: [solver, api, observability, opentelemetry, secrets, vault, status-page, idempotency, fsm, ops-01, ops-02, ops-03]

# Dependency graph
requires:
  - phase: 13-platform-baseline-adjacent-track-b-ongoing
    plan: 01
    provides: "telemetry.ts (initTelemetry/shutdownTelemetry/withSpan/instruments) + logger.ts (redacting log())"
  - phase: 13-platform-baseline-adjacent-track-b-ongoing
    plan: 02
    provides: "secrets.ts (createSecretsProvider — env|vault) + status.ts (buildStatus/renderStatusHtml)"
  - phase: 13-platform-baseline-adjacent-track-b-ongoing
    plan: 03
    provides: "idempotency.ts (createIdempotency/idempotencyMiddleware) + fsm.ts (transition/sealedAlias)"
provides:
  - "Telemetry-first solver boot: initTelemetry() before the instrumented ledger/agent imports + shutdownTelemetry() on SIGTERM/SIGINT (index.ts bootTelemetry())"
  - "SecretsProvider-resolved ANTHROPIC_API_KEY injected into createAgent (env backend byte-for-byte; keyless-degrade preserved)"
  - "Request-path spans (round.settle → clear.compute → ledger.exercise.clear CLIENT) + metrics (umbra.rounds.opened, umbra.clear.latency_ms, umbra.settle.latency_ms, umbra.agent.verified_total{source})"
  - "Token-free public surfaces: GET /health, GET /status (aggregate JSON), GET /status.html (brand page)"
  - "OPS-03 reliability: opt-in idempotency middleware on mutating POSTs + FSM transition() guard on settle/close (409 ILLEGAL_TRANSITION)"
affects: [13-08 (web status/observability panels), ops-uat (OTLP collector + Vault + alert delivery)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Telemetry-first boot ordering: dotenv → initTelemetry() → instrumented (ledger/agent) dynamic imports (Pitfall 1)"
    - "Optional AppDeps (statusSource, idempotency) so createApp stays backward-compatible — existing test constructions untouched"
    - "Duck-typed ApiError recognition in the error middleware so fsm.ts's structurally-identical ApiError serializes into the same secret-safe envelope (no api↔fsm import cycle)"
    - "Aggregate-only /status: explicit allow-list StatusInput + last-clear tracked in-closure at settle (never a per-order field)"
    - "no-op-safe telemetry: withSpan/instruments run inertly when initTelemetry() has not been called (tests unaffected)"

key-files:
  created: []
  modified:
    - solver/src/index.ts
    - solver/src/api.ts
    - solver/src/ledger.ts
    - solver/.env.example
    - solver/src/index.test.ts
    - solver/src/api.test.ts

key-decisions:
  - "Telemetry initializes AFTER dotenv (so the OTLP endpoint from .env is read) but BEFORE the ledger/agent dynamic imports — dotenv only populates process.env and is not an instrumented module"
  - "The settle route folds the FSM in as transition(status, 'Cleared') (it performs the Closed→Cleared Round.Clear step): Open→409 ILLEGAL_TRANSITION; the existing TERMINAL_STATUSES double-settle guard is KEPT verbatim (ALREADY_SETTLED) so its code stays byte-compatible"
  - "ledger.ts token resolution left UNCHANGED (proven file-based dev token / OIDC path); only the ANTHROPIC_API_KEY seam routes through the SecretsProvider — the operator/party-token vault swap is a documented seam, not a behavior change"
  - "Idempotency middleware registered AFTER express.json() and AFTER cors (so a replayed response still carries CORS headers); opt-in — a no-op unless a POST carries an Idempotency-Key header"
  - "close route FSM guard preserves idempotent re-close (Closed→Closed skipped) and rejects only Cleared/Settled→Closed as illegal"

requirements-completed: [OPS-01, OPS-02, OPS-03]

# Metrics
duration: ~22min
completed: 2026-07-10
---

# Phase 13 Plan 07: API/boot integration of the wave-1 OPS modules Summary

**Wired the Wave-1 foundation modules (telemetry, logger, secrets, status, idempotency, fsm) into the running solver: telemetry-first boot with SIGTERM shutdown and nested request-path spans/metrics on the clear/settle path, the token-free `/health` + `/status` + `/status.html` public surfaces (aggregate-only, secret-swept), a SecretsProvider-resolved Anthropic client, opt-in idempotency dedupe, and an FSM transition guard — all additive, with every existing §11 endpoint byte-compatible and the §4 fixture still clearing at $100.00.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-10
- **Tasks:** 3 (committed as 2 atomic commits — Tasks 2 & 3 share `api.ts`/`api.test.ts`)
- **Files modified:** 6 (0 created, 6 modified)
- **Tests:** solver suite 230 → 240 green (+10); `npx tsc --noEmit` clean

## Accomplishments
- **OPS-01 boot (index.ts):** `bootTelemetry()` initializes the OTel provider FIRST (after dotenv, before the instrumented ledger/agent dynamic imports) and registers `shutdownTelemetry()` on `SIGTERM`/`SIGINT`. The raw boot `console.log`/`console.warn` lines are replaced with the redacting JSON `log()` (secret-free `:${port} as ${operatorParty}` preserved).
- **OPS-01 spans/metrics (api.ts + ledger.ts):** the settle route is wrapped in a `round.settle` span; solve-preview's §8 compute in a `clear.compute` span; the ledger Round.Clear exercise in a CLIENT-kind `ledger.exercise.clear` span (honestly labelled a JSON Ledger API v2 client call, not in-participant). Metrics emitted at their seams: `umbra.rounds.opened`, `umbra.clear.latency_ms`, `umbra.settle.latency_ms`, `umbra.agent.verified_total{source}`.
- **OPS-02 secrets (index.ts):** `createSecretsProvider().get('ANTHROPIC_API_KEY')` resolves the key at boot (env backend === today's `process.env` value); when present the Anthropic client is constructed here and INJECTED into `createAgent`; when absent the env backend throws `... is unset` → keyless degradation preserved (§4 still clears $100.00).
- **OPS-02 status (api.ts + status.ts):** token-free `GET /health` (`{status:'ok', uptimeSeconds}`), `GET /status` (aggregate JSON via `buildStatus`), and `GET /status.html` (self-contained brand page via `renderStatusHtml`). Phase renders through the FSM `sealedAlias` (Closed→"Sealed"); the last clear price/time is tracked in-closure at settle and surfaced on `/status`.
- **OPS-03 reliability (api.ts + idempotency.ts + fsm.ts):** the idempotency middleware (opt-in on `Idempotency-Key`) dedupes mutating POSTs (replay returns the original response; same-key-different-body → 422 IDEMPOTENCY_KEY_REUSED); the settle/close handlers gate through `transition()` (settle-before-clear → 409 ILLEGAL_TRANSITION), folding in the existing double-settle guard.
- **`.env.example`:** documented `OTEL_EXPORTER_OTLP_ENDPOINT` (commented — unset uses console exporters), `SECRETS_PROVIDER=env`, `VAULT_ADDR`, `VAULT_TOKEN`.

## Task Commits

Each task was committed atomically (author/committer = woshvad, zero Claude attribution):

1. **Task 1: index.ts boot — telemetry-first + SIGTERM + SecretsProvider + .env.example** - `4737ab0` (feat) — `solver/src/index.ts`, `solver/.env.example`, `solver/src/index.test.ts`
2. **Tasks 2 + 3: api.ts spans/metrics + /health,/status,/status.html + idempotency mw + FSM guard** - `01b85b0` (feat) — `solver/src/api.ts`, `solver/src/ledger.ts`, `solver/src/api.test.ts` (Tasks 2 & 3 both touch `api.ts`/`api.test.ts`, so they landed in one atomic commit rather than splitting a single file across two commits)

## Files Created/Modified
- `solver/src/index.ts` (modified) — `bootTelemetry()` helper + telemetry-first boot ordering + SIGTERM/SIGINT shutdown; SecretsProvider-resolved, injected Anthropic client; ledger-backed aggregate `statusSource`; redacting `log()` adopted for the boot/rehydrate lines.
- `solver/src/api.ts` (modified) — token-free `/health`, `/status`, `/status.html`; `withSpan`/`instruments` on the clear/settle path; opt-in idempotency middleware; FSM `transition()` guard on settle/close; duck-typed `ApiError` recognition in the error middleware; optional `statusSource`/`idempotency` AppDeps.
- `solver/src/ledger.ts` (modified) — CLIENT-kind `ledger.exercise.clear` span around the settle Round.Clear exercise (token/credential never touches a span).
- `solver/.env.example` (modified) — OTEL/SECRETS_PROVIDER/VAULT env keys.
- `solver/src/index.test.ts` (modified) — `bootTelemetry` init-before-shutdown ordering test + injected-client agent boot-wiring test (2 tests added).
- `solver/src/api.test.ts` (modified) — `/health`, `/status` (aggregate + sealedAlias phase + order/secret sweep), `/status.html`, idempotency replay + 422, settle FSM 409, §4 clear-still-$100.00 + last-clear-on-status (8 tests added).

## Decisions Made
- **Telemetry ordering:** `dotenv.config()` runs first (populates `process.env`, no instrumentation), then `initTelemetry()` (reads the now-loaded `OTEL_EXPORTER_OTLP_ENDPOINT`), then the instrumented ledger/agent dynamic imports — satisfying Pitfall 1 while still loading the collector endpoint from `.env`.
- **Settle FSM folding:** modelled settle as `transition(round.status, 'Cleared')` (the route runs the Closed→Cleared Round.Clear step). Legal from Closed (200, §4 stays $100.00); Open → 409 ILLEGAL_TRANSITION. The pre-existing `TERMINAL_STATUSES` double-settle check is kept verbatim (ALREADY_SETTLED 409) so no consumer of that code breaks — the guard is at least as strict, never weaker.
- **No api↔fsm import cycle:** fsm.ts keeps its own structurally-identical `ApiError`; the api.ts error middleware now duck-types any `{status, code, message, name:'ApiError'}` error, so the FSM 409 serializes into the same secret-safe `{error:{code,message}}` envelope.
- **ledger.ts token untouched (hard invariant):** only the `ANTHROPIC_API_KEY` seam routes through the SecretsProvider; the operator/party-token vault swap is left as a documented seam so ledger.ts's proven file-based/OIDC token handling stays byte-for-byte.
- **Backward compatibility:** new `AppDeps` fields (`statusSource`, `idempotency`) are OPTIONAL, so every existing test/`buildDeps` construction compiles and behaves unchanged; the idempotency middleware is opt-in and CORS is registered before it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Error middleware could not serialize the FSM's ApiError**
- **Found during:** Task 3 (settle/close FSM guard)
- **Issue:** `fsm.ts` defines its OWN `ApiError` (to avoid an api↔fsm import cycle). The api.ts error middleware used `err instanceof ApiError` (api.ts's class), so a `transition()` 409 would have fallen through to the generic 500 — the FSM guard would never surface as a 409.
- **Fix:** Added `isApiErrorShaped()` — a duck-typed recognizer (`status:number`, `code:string`, `message:string`, `name==='ApiError'`) used by the error middleware. fsm.ts's own comment already anticipated this ("the secret-safe error middleware serializes it identically"). Preserves the existing api.ts `ApiError` path exactly.
- **Files modified:** solver/src/api.ts
- **Verification:** the new "settle on Open → 409 ILLEGAL_TRANSITION" api.test.ts assertion passes; all existing 409/500 envelope tests stay green.
- **Committed in:** `01b85b0`

**2. [Rule 2 - Missing critical functionality] No server-startup before the status surface / added last-clear-on-status wiring**
- **Found during:** Task 2 (status endpoints)
- **Issue:** `/status` needed a live aggregate source (phase + last clear) that the plan sketched but did not fully wire; a bare status route would have been a stub.
- **Fix:** Tracked the last clear (price/time) in a createApp closure set at settle, computed uptime from a boot timestamp, and added a ledger-backed `statusSource` in index.ts (health degrades when the ledger is unreachable). `/status` is fully live, not a placeholder.
- **Files modified:** solver/src/api.ts, solver/src/index.ts
- **Verification:** api.test.ts "settle still clears $100.00 + last-clear-on-status" asserts `/status.lastClearPrice === 100`.
- **Committed in:** `01b85b0` (api.ts) / `4737ab0` (index.ts statusSource)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — correctness wiring the plan implied). No architectural changes, no scope creep; every change is additive and backward-compatible.
**Impact on plan:** None negative — the plan's intent (live observability + live status page + idempotent/FSM-guarded mutation) is fully realized.

## Issues Encountered
- None beyond the two auto-fixed deviations above. The Wave-1 modules were designed to slot in cleanly (telemetry/instruments are no-op-safe when uninitialized, so tests never needed to boot the OTel SDK).

## Known Stubs
None — `/status`, `/health`, spans, metrics, secrets resolution, idempotency, and the FSM guard are all fully wired and exercised by tests. The `vault` SecretsProvider backend and a live OTLP collector are intentionally deferred to UAT (documented in `.env.example` / 13-CONTEXT deferred), with the `env` backend + console exporters as the working defaults.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. T-13-19 (status/telemetry disclosure) mitigated by aggregate-only `buildStatus` + order-sweep + secret-sweep on `/status` and `/status.html` + the redacting logger + only `round.id` as a span attribute; T-13-20 (tampering) by the idempotency dedupe (replay/422) + `transition()` 409; T-13-21 (secrets) by the server-side-only, injected, never-returned/logged Anthropic client. Secret-sweep discipline extended to the three new endpoints.

## User Setup Required
None for the local demo — `SECRETS_PROVIDER=env` and unset `OTEL_EXPORTER_OTLP_ENDPOINT` are the working defaults (console span/metric exporters, `.env` key resolution). For UAT: set `OTEL_EXPORTER_OTLP_ENDPOINT` to a collector, and optionally `SECRETS_PROVIDER=vault` + `VAULT_ADDR`/`VAULT_TOKEN`.

## Next Phase Readiness
- The token-free `/status` JSON + `/status.html` are ready for a web status panel / public-health link in later 13 plans.
- Live OTLP export, a Vault instance, and alert delivery are UAT/ops gates (instrumentation + abstraction shipped and verified offline).
- Blocker: none.

## Self-Check: PASSED

- FOUND: solver/src/index.ts
- FOUND: solver/src/api.ts
- FOUND: solver/src/ledger.ts
- FOUND: solver/.env.example
- FOUND: solver/src/index.test.ts
- FOUND: solver/src/api.test.ts
- FOUND: .planning/phases/13-platform-baseline-adjacent-track-b-ongoing/13-07-SUMMARY.md
- FOUND commit: 4737ab0 (Task 1)
- FOUND commit: 01b85b0 (Tasks 2 & 3)

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
