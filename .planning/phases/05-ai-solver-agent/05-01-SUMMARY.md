---
phase: 05-ai-solver-agent
plan: 01
subsystem: api
tags: [anthropic, claude, structured-outputs, zod, verify-dont-trust, vitest, dependency-injection, secret-hygiene]

# Dependency graph
requires:
  - phase: 04-solver-service
    provides: "computeClearing/matchedAt frozen §8 core (auction.ts), createApp(deps) DI pattern (api.ts), module-private secret discipline (ledger.ts), SECTION4_VIEWS fixture + sentinel-secret sweep (api.test.ts/ledger.test.ts)"
provides:
  - "solver/src/agent.ts: createAgent({client?, computeClearing, matchedAt}) DI factory → proposeClearing(views): Promise<AgentResult>"
  - "AgentResult interface { clearingPrice, allocations, matchedVolume, rationale, verified, source }"
  - "proposalSchema (zod) + SYSTEM_PROMPT (§8 rules verbatim — the single source PROMPT.md mirrors)"
  - "priceEqual (2dp float-safe) + allocationsEqual (desk|side set) + neutralRationale helpers"
  - "@anthropic-ai/sdk@0.106.0 pinned in solver dependencies"
affects: [05-02 (api.ts wiring of proposeClearing into AppDeps + PROMPT.md mirroring SYSTEM_PROMPT), 06-auction-theatre (Solver Agent panel renders rationale + agent block)]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk@0.106.0"]
  patterns: ["DI factory adapter over an external SDK", "verify-don't-trust equality gate (model proposes, deterministic core verifies)", "module-private API-key hygiene (mirrors ledger.ts Operator token)", "jsonSchemaOutputFormat (zod-v4-free) + zod-3 safeParse split"]

key-files:
  created: ["solver/src/agent.ts", "solver/src/agent.test.ts"]
  modified: ["solver/package.json", "solver/.env.example"]

key-decisions:
  - "Used the SDK's jsonSchemaOutputFormat helper (zod-v4-free) for the structured-output call instead of zodOutputFormat, because @anthropic-ai/sdk@0.106.0's zodOutputFormat hard-imports zod/v4 + z.toJSONSchema, neither of which exists in the project-pinned zod@3.23.8. zod@3.23.8 stays unchanged and still drives the verify-side proposalSchema.safeParse."
  - "Installed @anthropic-ai/sdk with --legacy-peer-deps (the established project convention, same as @daml/react): the SDK declares zod as peerOptional ^3.25||^4 vs the pinned 3.23.8."
  - "Deterministic numbers always flow out; the model contributes ONLY rationale, and only on an exact 2dp-price + allocation-set match. Every other path collapses to the deterministic §4 result (100.00)."

patterns-established:
  - "verify-don't-trust gate: recompute the frozen deterministic oracle first, accept the model's text only on exact equality, fall back on any disagreement/malformed/SDK-error/keyless path; proposeClearing never throws."
  - "module-private secret: ANTHROPIC_API_KEY read once at module scope, never exported/returned/logged; catch logs a fixed secret-free string + err.name only; sentinel-key sweep over result + console.log/error."

requirements-completed: [AGENT-01, AGENT-02]

# Metrics
duration: ~18min
completed: 2026-06-26
---

# Phase 5 Plan 1: AI Solver Agent Summary

**Claude (claude-haiku-4-5, temperature 0) proposes a structured-JSON clearing via messages.parse; a verify-don't-trust equality gate (2dp price + allocation-set) recomputes the frozen §8 core and uses the model's numbers never — only its rationale, and only on an exact match — degrading gracefully to the deterministic $100.00 §4 clear on any disagreement, malformed output, SDK error, or missing key, with ANTHROPIC_API_KEY held module-private.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-26T00:06:22Z
- **Completed:** 2026-06-26T01:13:00Z (active work ~18 min)
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified; +package-lock.json)

## Accomplishments
- `solver/src/agent.ts` — `createAgent({client?, computeClearing, matchedAt})` DI factory returning `proposeClearing`, with the structured-output Claude call (`messages.parse` → `parsed_output`), the verify-don't-trust equality gate, the documented forced-tool-use fallback (in a comment), and module-private `ANTHROPIC_API_KEY`.
- `solver/src/agent.test.ts` — 9 mocked-SDK tests: agreement (verified:true, deterministic numbers, model rationale), order-insensitive agreement, disagreement on price, disagreement on allocation, malformed (missing field / null / bad side enum), unavailable (parse throws → fallback, never rejects, no key leak), keyless (no client).
- `@anthropic-ai/sdk@0.106.0` pinned (exact, no caret) in `solver/package.json`; `.env.example` documents `ANTHROPIC_API_KEY` as agent-consumed, server-side, optional.
- Full suite green: 30 tests (the 21 P4 tests stay green + 9 new); `tsc --noEmit` clean; `auction.ts` byte-unchanged.

## Task Commits

1. **Task 1: Install @anthropic-ai/sdk@0.106.0 + env doc** - `a8ef60c` (chore)
2. **Task 2: agent.test.ts — failing mocked-SDK contract (RED)** - `a0ccd50` (test)
3. **Task 3: agent.ts — createAgent + structured-output call + gate + module-private key (GREEN)** - `7b21309` (feat)

_TDD gate sequence: test(`a0ccd50`) → feat(`7b21309`). No refactor commit needed._

## Files Created/Modified
- `solver/src/agent.ts` (created) - The AI Solver Agent: DI factory, proposalSchema (zod), SYSTEM_PROMPT (§8 verbatim), buildBatchMessage, priceEqual/allocationsEqual/neutralRationale, module-private key, verify-don't-trust proposeClearing.
- `solver/src/agent.test.ts` (created) - 9 mocked-SDK tests covering the three thesis paths + malformed variants + keyless + sentinel-key sweep.
- `solver/package.json` (modified) - `@anthropic-ai/sdk: "0.106.0"` (exact pin) added to dependencies; zod/vitest/dotenv unchanged.
- `solver/.env.example` (modified) - `ANTHROPIC_API_KEY` comment updated (agent-consumed, server-side, optional keyless degradation); value stays empty.

## Decisions Made
- **jsonSchemaOutputFormat over zodOutputFormat (forced by the pinned zod).** See deviation 1 below.
- **`--legacy-peer-deps` install.** See deviation 2 below.
- **Numbers always deterministic.** The agreement-path return spreads `det.clearingPrice`/`det.allocations` (never the model's raw object); the model only ever sets `rationale`. This is the load-bearing AGENT-02 invariant and is asserted by the agreement test (`r.allocations` deep-equals `computeClearing(views).allocations`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used `jsonSchemaOutputFormat` instead of `zodOutputFormat` (zod-version incompatibility)**
- **Found during:** Task 1 (install smoke) / Task 3 (implementation)
- **Issue:** The plan + RESEARCH specified `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`. That helper hard-imports `zod/v4` and calls `z.toJSONSchema(...)` — both exist only in **zod 4**. The project pins `zod@3.23.8` (CLAUDE.md-locked, used across `api.ts`), which has no `./v4` subpath and no `toJSONSchema`. Importing the zod helper throws `ERR_PACKAGE_PATH_NOT_EXPORTED: ./v4`. Bumping zod to v4 was rejected (it would break the CLAUDE.md pin and risk the rest of the solver/frontend zod usage mid-hackathon).
- **Fix:** Used the SDK's sibling helper `jsonSchemaOutputFormat` (from `@anthropic-ai/sdk/helpers/json-schema`, verified zod-v4-free) with a hand-authored JSON Schema literal (`proposalJsonSchema`) for the `messages.parse` `output_config.format`, and kept zod@3.23.8's `proposalSchema.safeParse` for the verify-side re-validation. Same `messages.parse` → `message.parsed_output` shape; the equality gate, keyless degradation, and secret hygiene are identical. `jsonSchemaOutputFormat` is listed in RESEARCH's tarball inspection (Sources) as present, so this is a sanctioned same-SDK alternative — not a new package.
- **Files modified:** solver/src/agent.ts
- **Verification:** `node --input-type=module` import smoke for `jsonSchemaOutputFormat` + default `Anthropic` resolves; 9 agent tests + 30-test full suite green; tsc clean. zod stays 3.23.8.
- **Committed in:** `7b21309` (Task 3), documented in the agent.ts header comment.

**2. [Rule 3 - Blocking] `npm install` required `--legacy-peer-deps`**
- **Found during:** Task 1
- **Issue:** `npm install @anthropic-ai/sdk@0.106.0` failed with ERESOLVE — the SDK declares `peerOptional zod@"^3.25.0 || ^4.0.0"` against the pinned `zod@3.23.8`.
- **Fix:** Re-ran with `--legacy-peer-deps`, the established project convention (CLAUDE.md already mandates it for the `@daml/react` React-18 peer-range friction). No alternative/similarly-named package was substituted — this is the exact spec-mandated official SDK at the exact pinned version.
- **Files modified:** solver/package.json (exact `0.106.0` pin), solver/package-lock.json
- **Verification:** SDK resolves; deps OK (`@anthropic-ai/sdk@0.106.0`, `zod@3.23.8` unchanged).
- **Committed in:** `a8ef60c` (Task 1)

**3. [Rule 1 - Verify-command correction] Task 1 automated verify checked a non-existent `helpers/zod` directory**
- **Found during:** Task 1
- **Issue:** The plan's verify command did `accessSync('node_modules/@anthropic-ai/sdk/helpers/zod')` — but the SDK ships `helpers/zod.{js,mjs,d.ts}` **files** (resolved via the `exports` map), not a `helpers/zod` directory, so the literal directory access fails on a correct install. (And `helpers/zod` is moot here anyway given deviation 1.)
- **Fix:** Verified the real artifacts instead: the exact `0.106.0` pin in package.json, `zod@3.23.8` unchanged, and an ESM import smoke for the actually-used `jsonSchemaOutputFormat` subpath + default `Anthropic`.
- **Files modified:** none (verification method only)
- **Verification:** import smoke + pin check both pass.
- **Committed in:** n/a (no code change)

---

**Total deviations:** 3 auto-fixed (2 blocking install/API-compat, 1 verify-command correction)
**Impact on plan:** All necessary to make the spec-mandated SDK work against the CLAUDE.md-pinned zod@3.23.8 without changing the pin. No scope creep; the verify-don't-trust gate, keyless degradation, secret hygiene, and §4 canary (100.00) are exactly as specified. The `zodOutputFormat`→`jsonSchemaOutputFormat` swap is invisible to callers and to PROMPT.md (05-02), and the forced-tool-use fallback remains documented in the agent.ts comment as the locked alternative.

## Issues Encountered
- Discovered the zod-v4 hard dependency inside `@anthropic-ai/sdk@0.106.0`'s `zodOutputFormat` helper only at the import-smoke step (it is not visible from the package metadata, only by inspecting `helpers/zod.mjs`). Resolved via the SDK's own `jsonSchemaOutputFormat` (deviation 1) without touching the pinned zod.

## User Setup Required
None required for the demo — the agent runs **keyless** by design (deterministic fallback; the §4 fixture clears at 100.00 without a key). OPTIONAL: to see a live Claude rationale on the agreement path, set `ANTHROPIC_API_KEY` in `solver/.env` (Anthropic Console → Settings → API Keys; server-side only, read solely by `agent.ts`, never committed).

## Next Phase Readiness
- **Plan 05-02 seam ready:** `AppDeps` gains `proposeClearing: (views: OrderView[]) => Promise<AgentResult>`; `api.ts` `solve-preview` + `GET /round/:id` terminal branch replace `rationale: null` with `agent.rationale` + an additive `agent:{verified,source}` block. `index.ts` `buildDeps` wires the real agent (constructed once at boot, module-private key) into the app.
- **PROMPT.md (05-02):** mirror `SYSTEM_PROMPT` verbatim from `agent.ts` (keep in sync — RESEARCH Pitfall 6).
- **No blockers.** Note for 05-02/verification: the SDK uses `jsonSchemaOutputFormat`, not `zodOutputFormat` (zod stays at 3.23.8) — keep this in mind if a future plan touches the structured-output call.

## Self-Check: PASSED
- FOUND: solver/src/agent.ts
- FOUND: solver/src/agent.test.ts
- FOUND: commit a8ef60c (Task 1)
- FOUND: commit a0ccd50 (Task 2 RED)
- FOUND: commit 7b21309 (Task 3 GREEN)

---
*Phase: 05-ai-solver-agent*
*Completed: 2026-06-26*
