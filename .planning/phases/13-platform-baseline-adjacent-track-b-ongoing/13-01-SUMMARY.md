---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 01
subsystem: infra
tags: [opentelemetry, observability, tracing, metrics, logging, prometheus, otlp, secret-redaction]

# Dependency graph
requires:
  - phase: 05-agent
    provides: agent.ts module-private boot-resource (_client) + secret-free error-logging discipline mirrored by telemetry.ts/logger.ts
  - phase: 04-solver
    provides: clock.ts RoundStatus + solver Node ESM / DI-factory / co-located vitest conventions
provides:
  - "solver/src/telemetry.ts — OTLP-or-console OpenTelemetry bootstrap (initTelemetry/shutdownTelemetry/withSpan/instruments)"
  - "solver/src/logger.ts — zero-dep secret-redacting JSON logger (log/redact)"
  - "alerts/umbra-rules.yml — committed Prometheus/Alertmanager threshold rules (config-only)"
  - "Five named metric instruments: umbra.rounds.opened / clear.latency_ms / settle.latency_ms / agent.verified_total / webhook.delivery_total"
  - "withSpan round.id correlation + ledger.* CLIENT-span labelling for later OPS-01 instrumentation of the request→clear→exercise→agent path"
affects: [OPS-03 idempotency/FSM, OPS-04 webhooks, OPS-05 FIX, ADJ-01 competing solvers — all can now emit spans/metrics/logs through these primitives]

# Tech tracking
tech-stack:
  added:
    - "@opentelemetry/api@1.9.1"
    - "@opentelemetry/sdk-node@0.220.0 (installed; NOT used — see deviation)"
    - "@opentelemetry/exporter-trace-otlp-http@0.220.0"
    - "@opentelemetry/exporter-metrics-otlp-http@0.220.0"
    - "@opentelemetry/sdk-metrics@2.9.0"
    - "@opentelemetry/context-async-hooks@2.9.0 (added — cross-await context propagation)"
  patterns:
    - "Boot-once telemetry provider pair (mirror agent.ts _client) with OTLP/console exporter selection on OTEL_EXPORTER_OTLP_ENDPOINT presence"
    - "Lazy Proxy-backed metric instruments that bind to the live MeterProvider post-init (OTel instruments created pre-registration stay no-op)"
    - "Secret-redacting structured logger as belt-and-suspenders over the existing secret-free call-site discipline"

key-files:
  created:
    - solver/src/telemetry.ts
    - solver/src/telemetry.test.ts
    - solver/src/logger.ts
    - solver/src/logger.test.ts
    - alerts/umbra-rules.yml
  modified:
    - solver/package.json
    - solver/package-lock.json

key-decisions:
  - "NodeSDK exports ZERO spans on the installed sdk-node@0.220.0 / sdk-trace@2.9.0 combo (verified: both traceExporter and spanProcessors paths drop every span even after forceFlush/shutdown) → manual BasicTracerProvider + MeterProvider wiring (RESEARCH sanctioned 'Alternatives Considered' path), which is fully functional and unit-tested"
  - "Added @opentelemetry/context-async-hooks (same official CNCF org as the vetted five) + AsyncLocalStorageContextManager so trace.getActiveSpan() (logger trace.id correlation) and nested spans propagate across await"
  - "Metric instruments exposed as a lazy Proxy so `export const instruments` is a stable contract yet binds to the live provider only after initTelemetry() runs"
  - "Console fallback uses SimpleSpanProcessor (immediate dev visibility); OTLP uses BatchSpanProcessor (batched network export)"

patterns-established:
  - "Exporter selection is a pure selectExporters(endpoint) function (unit-testable without a live collector)"
  - "withSpan(name, roundId, fn) labels ledger.* spans as CLIENT (JSON Ledger API v2 client leg, not in-participant) and records only err.name on error"

requirements-completed: [OPS-01]

# Metrics
duration: 18min
completed: 2026-07-10
---

# Phase 13 Plan 01: OPS-01 Observability Primitives Summary

**OTLP-or-console OpenTelemetry tracing + five named metric instruments + a zero-dep secret-redacting JSON logger + committed Prometheus alert rules — all offline-verified with injected in-memory exporters, no collector required.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-10T19:08:00Z
- **Completed:** 2026-07-10T19:24:00Z
- **Tasks:** 3 (1 pre-approved checkpoint + 2 auto)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- `telemetry.ts`: boot-once tracer+meter providers that degrade to `ConsoleSpanExporter`/`ConsoleMetricExporter` when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset (works with NO collector), select OTLP exporters when it is set; `withSpan` sets a `round.id` attribute and labels `ledger.*` spans as CLIENT; five named instruments via a lazy Proxy.
- `logger.ts`: zero-dep JSON logger emitting `{ts, level, msg, trace.id?, ...redacted-fields}`; recursively redacts token/key/authorization/cookie/secret/password/env keys.
- `alerts/umbra-rules.yml`: Prometheus rule group `umbra` with `SolverDown`, `ClearLatencyP95High`, `SettleLatencyP95High`, `WebhookFailureRateHigh` — metric names are the dot→underscore PromQL projection of the telemetry instruments; live delivery honestly labelled a UAT/ops gate.
- 165 solver vitest green (14 new: 8 telemetry + 6 logger), incl. secret-sweep on span attributes; `tsc --noEmit` clean; §4 fixture still clears **$100.00** (A=10/B=8/C=2).

## Task Commits

1. **Task 1: Dependency-legitimacy checkpoint (5 OpenTelemetry packages)** — satisfied by orchestrator npm-vetting (see below); no code artifact.
2. **Task 2: OTel install + telemetry.ts + logger.ts (+tests)** — `a5354b9` (feat)
3. **Task 3: alerts/umbra-rules.yml threshold config** — `ebf3413` (feat)

Follow-up: **`72b9198`** (chore) — pinned the five `@opentelemetry/*` deps to exact versions (project convention).

## Files Created/Modified
- `solver/src/telemetry.ts` — OTLP-or-console OTel bootstrap; `initTelemetry`, `shutdownTelemetry`, `withSpan`, `instruments`, `selectExporters`.
- `solver/src/telemetry.test.ts` — 8 tests: console-vs-OTLP selection, round.id attribute, ledger CLIENT span, error status (err.name only), five instruments record to an injected in-memory reader, span secret-sweep.
- `solver/src/logger.ts` — `log`, `redact`; recursive secret-key redaction + trace.id correlation.
- `solver/src/logger.test.ts` — 6 tests: redaction (incl. apiKey/operatorToken/authorization/env), nested/array walk, JSON shape, warn/error→stderr routing, secret-sweep.
- `alerts/umbra-rules.yml` — Prometheus alert rules (config-only).
- `solver/package.json` / `solver/package-lock.json` — six `@opentelemetry/*` deps (exact-pinned).

## Decisions Made
- **Manual wiring over NodeSDK** — see Deviation #1. This is the RESEARCH-sanctioned alternative and the only way to ship functional (non-stub) tracing on this version combo.
- **Lazy Proxy instruments** — an OTel instrument created before the global MeterProvider is registered stays permanently no-op; the Proxy defers construction until first use (after `initTelemetry()` at boot), so `export const instruments` is both a stable contract and live.
- **Console = SimpleSpanProcessor, OTLP = BatchSpanProcessor** — immediate visibility in dev, batched network export in prod.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NodeSDK bootstrap replaced with manual BasicTracerProvider + MeterProvider wiring**
- **Found during:** Task 2 (telemetry.ts implementation / import-path verification)
- **Issue:** 13-RESEARCH Pattern 1 sketched `@opentelemetry/sdk-node` NodeSDK, but on the installed `sdk-node@0.220.0` / `sdk-trace@2.9.0` combo NodeSDK's tracer provider exports **zero spans** through the global `trace` API — verified empirically that BOTH the `traceExporter` path and the `spanProcessors` path drop every span, even after `forceFlush()`/`shutdown()` (spans report `isRecording:true` but never reach any exporter). Shipping NodeSDK would have been a non-functional observability stub.
- **Fix:** Used the RESEARCH "Alternatives Considered" manual path: `BasicTracerProvider` (spanProcessors) + `MeterProvider` (readers) registered on the global API, plus an `AsyncLocalStorageContextManager` for cross-`await` context propagation (needed for `trace.getActiveSpan()` log correlation and nested request→clear→exercise→agent spans). Proven end-to-end: spans export to an injected `InMemorySpanExporter`, metrics to an injected reader, and `getActiveSpan()` resolves across an `await`.
- **Files modified:** solver/src/telemetry.ts (sdk-node import removed from the runtime path; kept installed/pinned as the documented future option)
- **Verification:** 8 telemetry tests green (round.id, CLIENT-kind, error status, five live instruments); full solver suite 165 green.
- **Committed in:** a5354b9 (Task 2 commit)

**2. [Rule 3 - Blocking] Added @opentelemetry/context-async-hooks@2.9.0**
- **Found during:** Task 2 (manual-wiring context propagation)
- **Issue:** The manual tracer provider needs a context manager for `getActiveSpan()`/nested-span parenting across `await` (NodeSDK would have supplied this). The package was already present transitively.
- **Fix:** Pinned it explicitly (`--legacy-peer-deps`). It is from the **same official CNCF `open-telemetry` monorepo** (github.com/open-telemetry/opentelemetry-js) the Task-1 checkpoint vetted, same `2.9.0` line as `sdk-metrics`/`sdk-trace` — no new trust surface.
- **Files modified:** solver/package.json, solver/package-lock.json
- **Verification:** Import resolves; cross-await `getActiveSpan()` proven; tsc clean.
- **Committed in:** a5354b9 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — non-functional NodeSDK, 1 blocking — context manager dep).
**Impact on plan:** Both essential to ship *functional* (non-stub) telemetry. Same public API/exports as the plan (`initTelemetry`/`shutdownTelemetry`/`withSpan`/`instruments`, `log`/`redact`) and same behavioural contract (console fallback, round.id, CLIENT ledger span, five instruments, redaction). No scope creep; §4 untouched.

## Checkpoint Resolution (Task 1)

The blocking dependency-legitimacy gate (threat T-13-SC) for the five `@opentelemetry/*` packages was **satisfied by orchestrator npm-vetting**: all five confirmed under the official CNCF `open-telemetry` npm org with source repo github.com/open-telemetry/opentelemetry-js (license Apache-2.0, maintainer `dyladan`, no install-time `postinstall`). Pinned: api@1.9.1, sdk-node@0.220.0, sdk-metrics@2.9.0, exporter-trace-otlp-http@0.220.0, exporter-metrics-otlp-http@0.220.0. The added context-async-hooks@2.9.0 is from the same vetted monorepo.

## Issues Encountered
- NodeSDK span-export failure (documented as Deviation #1) — diagnosed by isolating the export path: a hand-built `BasicTracerProvider` exports correctly while NodeSDK's provider drops spans, pinpointing the sdk-node/sdk-trace-base shim incompatibility on this version combo.

## User Setup Required

Observability is offline-functional today (console exporters). For live OTLP export + dashboards at UAT:
- Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector URL (unset → Console exporters, no collector needed).
- Reference `alerts/umbra-rules.yml` from a Prometheus `rule_files:` and wire Alertmanager routes on the `severity` label. The `up{job="umbra-solver"}` series requires a Prometheus scrape of the solver `/health` endpoint (a later OPS-01 wiring step). Live alert delivery is a UAT/ops gate.

## Next Phase Readiness
- Telemetry + logger primitives are standalone and ready to be threaded into `index.ts main()` (import telemetry FIRST — Pitfall 1) and wired at the open/clear/settle seams by later OPS plans.
- `instruments` are live post-`initTelemetry()`; OPS-03/04/05 and ADJ-01 can record spans/metrics/logs through these without further scaffolding.
- No blockers. Live OTLP/collector + alert delivery remain UAT gates (as planned).

## Self-Check: PASSED

- FOUND: solver/src/telemetry.ts, solver/src/telemetry.test.ts, solver/src/logger.ts, solver/src/logger.test.ts, alerts/umbra-rules.yml
- FOUND commits: a5354b9 (Task 2), ebf3413 (Task 3), 72b9198 (pin chore)
- 165 solver tests green; tsc --noEmit clean; §4 fixture $100.00 intact
- All five `@opentelemetry/*` packages present at pinned exact versions

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
