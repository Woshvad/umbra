---
phase: 08-demo-hardening
plan: 03
subsystem: solver
tags: [TRUST-02, WOW-03, agent, api, structured-output, graceful-degradation]
requires:
  - "solver/src/agent.ts createAgent + proposeClearing (05-01)"
  - "solver/src/api.ts createApp(deps) DI factory (04-03)"
  - "solver/src/index.ts buildDeps wiring (04-04 / 05-02)"
provides:
  - "solver/src/agent.ts parseOrder() — server-side NL → validated {side,qty,limit}"
  - "solver/src/agent.ts AGENT_TIMEOUT_MS deadline (Promise.race) in proposeClearing"
  - "POST /parse-order on createApp(deps)"
  - "AppDeps.parseOrder wired once in index.ts buildDeps"
affects:
  - "solver/src/agent.ts"
  - "solver/src/api.ts"
  - "solver/src/index.ts"
tech-stack:
  added: []
  patterns:
    - "Promise.race timeout guard treated as just another degradation rung"
    - "jsonSchemaOutputFormat (NOT zodOutputFormat) + zod safeParse — mirrors proposeClearing"
    - "additive endpoint on the createApp(deps) DI factory + AppDeps wiring in buildDeps"
key-files:
  created: []
  modified:
    - "solver/src/agent.ts"
    - "solver/src/agent.test.ts"
    - "solver/src/api.ts"
    - "solver/src/api.test.ts"
    - "solver/src/index.ts"
    - "solver/src/index.test.ts"
decisions:
  - "Timeout REJECTS with AgentTimeoutError into the existing catch → same deterministic fallback (no separate branch)"
  - "Deadline is DI-configurable (AgentDeps.timeoutMs) → AGENT_TIMEOUT_MS env → DEFAULT_AGENT_TIMEOUT_MS (8000ms)"
  - "parseOrder lives on createAgent (client-injectable for tests) + a standalone module-level export bound to the module-private key"
  - "BuildDepsArgs.parseOrder made required (mirrors proposeClearing); index.test.ts updated to pass the stub"
metrics:
  duration: ~9 min
  completed: 2026-07-09
  tasks: 3
  files: 6
---

# Phase 8 Plan 03: TRUST-02 Degradation Ladder + Timeout & WOW-03 NL Order Parsing Summary

Closed the one real TRUST-02 gap — `proposeClearing` now imposes a `Promise.race` deadline so a slow/hanging Claude call can never stall a round — and added server-side natural-language order parsing (`parseOrder` + `POST /parse-order`) that turns a desk's plain English into a zod-validated `{side, qty, limit}` for confirmation, with the Anthropic key never leaving the solver.

## What Was Built

**Task 1 — TRUST-02 timeout + formalized ladder (`agent.ts`)**
- Added `withTimeout(p, ms)` (a `Promise.race` against a `setTimeout` that rejects `AgentTimeoutError`, timer always cleared) and wrapped the `client.messages.parse(...)` call in it. A timeout rejects into the **existing catch**, landing in the SAME deterministic `fallback()` as every other failure — `proposeClearing` never throws and never hangs.
- Deadline resolution: `AgentDeps.timeoutMs` (DI override, for tests) → `AGENT_TIMEOUT_MS` env → `DEFAULT_AGENT_TIMEOUT_MS = 8000`. A fast successful call is unaffected.
- Formalized the six-rung ladder in a doc comment on `proposeClearing`: **keyless → malformed → zod-invalid → disagreement → SDK-error → TIMEOUT**, all → the deterministic §4 fallback ($100.00, A=10/B=8/C=2).
- Tests: a never-resolving `parse` with `timeoutMs: 20` resolves to $100.00 `verified:false`; a ladder-table test iterates all six rungs and asserts the identical deterministic result + no key leak.

**Task 2 — WOW-03 `parseOrder` (`agent.ts`)**
- Exported `parseOrder(text): Promise<ParsedOrder | null>` mirroring `proposeClearing` exactly: `client.messages.parse` + `output_config.format = jsonSchemaOutputFormat(orderJsonSchema)` + `orderSchema.safeParse`. Uses `jsonSchemaOutputFormat` (NOT `zodOutputFormat`, which hard-imports `zod/v4` absent under pinned `zod@3.23.8` — Pitfall 1).
- `orderSchema` = `{ side: enum[Buy,Sell], qty: int > 0, limit: number > 0 }`; hand-authored `orderJsonSchema` literal (`additionalProperties:false`, all required); `ORDER_SYSTEM_PROMPT` maps "under/at most" → Buy limit and "at least/over" → Sell limit; `claude-haiku-4-5`, temp 0, max_tokens 256.
- Keyless / malformed / thrown / timeout → `null` (the UI shows the error state); never throws, never auto-submits, never logs/returns the key. Reachable both via `createAgent(...).parseOrder` (client-injectable) and a standalone `export const parseOrder` bound to the module-private client.
- Tests: valid Buy, valid Sell (floor limit), malformed→null, non-integer qty→null, keyless→null, SDK-throw→null (no key leak).

**Task 3 — `POST /parse-order` endpoint + wiring (`api.ts`, `index.ts`)**
- Added `parseOrder` to `AppDeps`; registered `POST /parse-order` using the `wrap` pattern: zod `.strict()` body `{ text: string().min(1).max(280) }` (ASVS V5 length cap / prompt-injection blast-radius limiter) → `deps.parseOrder(text)` → 422 `PARSE_FAILED` on null, 400 `INVALID_BODY` on malformed/oversized, else `res.json(order)`. Every `ApiError` message authored secret-free.
- Threaded `parseOrder: agent.parseOrder` through `buildDeps`/`BuildDepsArgs` in `index.ts` (mirrors `proposeClearing`, real server-side key). The `/settle`, `solve-preview`, and GET terminal branches are byte-unchanged.
- Tests: 200 on well-formed English, 422 on null, 400 on missing/oversized body, and an extended ANTHROPIC_API_KEY secret sweep proving neither the 200 order nor the 422 envelope ever serializes the key.

## Verification

- `cd solver && npm test` → **49 tests green** (was 38): agent 17, api 16, index 2, auction 6, ledger 3, clock 5.
- `cd solver && npx tsc --noEmit` → clean.
- `grep -n '/parse-order' solver/src/api.ts` → present (route at L323).
- `zodOutputFormat` appears only in explanatory Pitfall-1 comments — never imported or called (`jsonSchemaOutputFormat` is what runs).
- Every TRUST-02 ladder branch (keyless / malformed / zod-invalid / disagreement / SDK-error / **timeout**) provably clears **$100.00** via the ladder-table test.

## Deviations from Plan

### Auto-fixed / adjustments

**1. [Rule 3 - Blocking] `BuildDepsArgs.parseOrder` made required → `index.test.ts` updated**
- **Found during:** Task 3
- **Issue:** Mirroring `proposeClearing` (a required `BuildDepsArgs` field) makes `parseOrder` required, which breaks the two `buildDeps({...})` calls in `index.test.ts` (a `tsc --noEmit` gate).
- **Fix:** Added a module-level `parseOrder` null-returning stub in `index.test.ts` and passed it into both `buildDeps` calls (the boot-wiring proofs never hit `/parse-order`, so a keyless stub suffices). `index.test.ts` is outside the plan's Task 3 file list but is a required blocking fix to keep the wiring test compiling.
- **Files modified:** `solver/src/index.test.ts`
- **Commit:** 24825ed

**2. [Design choice] Timeout rejects into the existing catch rather than resolving-to-fallback inline**
- Chose to have the deadline `reject(new AgentTimeoutError())` so it flows through the SAME `catch → fallback()` as SDK errors. This literally realizes "treat a timeout exactly like every other failure" with zero new fallback branches, and the secret-free catch log names `AgentTimeout`.

## Security Notes (trust boundary held)

- `ANTHROPIC_API_KEY` remains module-private in `agent.ts`; `parseOrder` never takes it as a param, returns it, or logs it (catch logs a fixed string + `err.name` only).
- The secret-sweep test is extended to `/parse-order` (both 200 and 422 paths) — the sentinel key never appears in any response body.
- NL input is capped at ≤280 chars (T-08-03-INJ mitigation); the parsed order is zod-validated before it can reach the UI and only PREFILLS the ticket — never auto-submitted, still re-verified at `Round.Clear`.
- The timeout deadline is the T-08-03-STALL (DoS) mitigation: a hanging key degrades to the deterministic $100.00 clear; the round never stalls.

## No Known Stubs

`parseOrder` returning `null` is the intended keyless/unparseable degradation contract (the browser renders the error state), not an un-wired stub. No placeholder data flows to the UI.

## Self-Check: PASSED
- solver/src/agent.ts — FOUND (parseOrder, withTimeout, AGENT_TIMEOUT_MS)
- solver/src/api.ts — FOUND (POST /parse-order at L323)
- solver/src/index.ts — FOUND (parseOrder threaded through buildDeps)
- Commits 0c11db6, 7e439cf, 24825ed — all present, all authored woshvad (no Claude attribution)
