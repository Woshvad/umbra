---
phase: 05-ai-solver-agent
plan: 02
subsystem: api
tags: [anthropic, claude, rationale, verify-dont-trust, dependency-injection, secret-hygiene, prompt-contract, vitest]

# Dependency graph
requires:
  - phase: 05-ai-solver-agent
    provides: "Plan 05-01: createAgent({client?, computeClearing, matchedAt}) → proposeClearing(views): Promise<AgentResult>; AgentResult { clearingPrice, allocations, matchedVolume, rationale, verified, source }; SYSTEM_PROMPT (§8 verbatim); proposalSchema"
  - phase: 04-solver-service
    provides: "createApp(deps) DI surface (api.ts), buildDeps factory (index.ts), api.test/index.test stub harness + sentinel-secret sweep, frozen §8 core (auction.ts)"
provides:
  - "api.ts AppDeps gains proposeClearing: (views: OrderView[]) => Promise<AgentResult>"
  - "solve-preview response: { roundId, clearingPrice, matchedVolume, allocations, curve, rationale, agent:{verified,source} } — rationale now populated (was null), agent block additive"
  - "GET /round/:id terminal branch: body.rationale (was null) + body.agent:{verified,source}; deterministic fields unchanged"
  - "index.ts buildDeps/main(): constructs the real keyless-safe agent once at boot via createAgent({computeClearing, matchedAt}) and threads proposeClearing into AppDeps"
  - "solver/PROMPT.md: the AGENT-04 prompt contract (system prompt verbatim, batch JSON, required response JSON, verify-don't-trust statement)"
affects: [06-auction-theatre (Solver Agent panel renders rationale + agent block from solve-preview / GET terminal)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["additive backward-compatible response wiring (deterministic numbers unchanged, agent fields purely additive)", "verify-don't-trust kept off the settlement path (settle never calls proposeClearing)", "prompt-contract doc mirrored byte-for-byte from the SYSTEM_PROMPT const"]

key-files:
  created: ["solver/PROMPT.md"]
  modified: ["solver/src/api.ts", "solver/src/index.ts", "solver/src/api.test.ts", "solver/src/index.test.ts"]

key-decisions:
  - "Kept the existing computeClearing/matchedAt/buildCurve lines in both handlers and only ADDED rationale + agent:{verified,source} — the minimal-diff canonical choice so the P4 numbers are provably unchanged (the agent's numbers are deterministic-identical but never read for the response numbers)."
  - "index.ts constructs the agent with NO client arg — agent.ts resolves its own module-private ANTHROPIC_API_KEY (or runs keyless); index.ts never reads the key (T-05-01)."
  - "PROMPT.md quotes the SYSTEM_PROMPT const verbatim (verified byte-for-byte against agent.ts) with a keep-in-sync note — the const stays the single source of truth (T-05-04)."

patterns-established:
  - "Backward-compatible API extension: new fields (rationale populated + agent block) are purely additive; P4 consumers reading clearingPrice/matchedVolume/allocations/curve are unaffected."
  - "The AI is wired into read/preview surfaces only (solve-preview + GET terminal); settle stays deterministic-only authority — proven by grep + the unchanged settle handler."

requirements-completed: [AGENT-03, AGENT-04]

# Metrics
duration: ~12min
completed: 2026-06-26
---

# Phase 5 Plan 2: Wire the Agent into the API + Prompt Contract Summary

**The agent's 2–3 sentence rationale is now surfaced through `solve-preview` and the `GET /round/:id` terminal branch as a populated `rationale` + an additive `agent:{verified,source}` block — while the deterministic clearing numbers stay byte-for-byte unchanged and `settle` keeps its deterministic-only authority (the AI is off the settlement path) — with the real keyless-safe agent wired at boot, `ANTHROPIC_API_KEY` proven absent from every response, and `solver/PROMPT.md` documenting the full AGENT-04 prompt contract.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-26T01:18:00Z
- **Completed:** 2026-06-26T01:30:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `solver/src/api.ts` — `AppDeps` gains `proposeClearing: (views: OrderView[]) => Promise<AgentResult>`; `solve-preview` and the `GET /round/:id` terminal branch call `await deps.proposeClearing(views)` and emit `rationale: agent.rationale` (was `null` in P4) + `agent: { verified, source }`. The deterministic `clearingPrice`/`matchedVolume`/`allocations`/`curve` lines are untouched. `settle` and the secret-safe error middleware are unchanged.
- `solver/src/index.ts` — `BuildDepsArgs`/`buildDeps` gain `proposeClearing`; `main()` constructs the real agent once via `createAgent({ computeClearing, matchedAt })` (no `client` arg — keyless-safe, key stays module-private in agent.ts) and threads `agent.proposeClearing` into the deps. The secret-free boot log is unchanged.
- `solver/src/api.test.ts` — extended: a default deterministic-fallback `proposeClearing` stub in `makeDeps`; new tests for the verified-claude path (rationale + `agent:{verified:true,source:'claude'}`), the deterministic-fallback shape (`source:'deterministic-fallback'`, §4 still 100/10), and the GET terminal branch; the secret sweep extended with an `ANTHROPIC_API_KEY` sentinel asserted absent from both responses.
- `solver/src/index.test.ts` — a `proposeClearing` stub supplied to both `buildDeps(...)` args so the boot-wiring proofs keep type-checking.
- `solver/PROMPT.md` (new) — the AGENT-04 contract: the system prompt **verbatim** (byte-for-byte matched to `agent.ts SYSTEM_PROMPT`, keep-in-sync note), the user-message batch JSON shape, the required response JSON `{ clearingPrice, allocations:[{desk,side,filledQty}], rationale }`, the explicit "never used unverified" statement, the §4 worked example (100.00, A=10/B=8/C=2), and the structured-output mechanism + forced-tool-use fallback.
- Full suite green: 33 tests (21 P4 + 9 agent + 2 index + the extended api set, now 8 api tests); `tsc --noEmit` clean; `auction.ts` and the `settle` handler byte-unchanged.

## Task Commits

1. **Task 1: Wire proposeClearing into api.ts + index.ts; extend api.test.ts (TDD)** - `a0d86b9` (feat)
2. **Task 2: solver/PROMPT.md — the AGENT-04 prompt contract** - `6672ed9` (docs)

_Task 1 followed RED→GREEN inline: the 4 new api tests failed against the null seams, then passed after the api.ts/index.ts wiring._

## Files Created/Modified
- `solver/PROMPT.md` (created) — the AGENT-04 prompt contract doc.
- `solver/src/api.ts` (modified) — `AppDeps.proposeClearing`; solve-preview + GET terminal emit rationale + agent block (deterministic numbers unchanged); settle + error middleware untouched.
- `solver/src/index.ts` (modified) — `BuildDepsArgs.proposeClearing`; `main()` constructs the real keyless-safe agent and threads `proposeClearing` into the deps.
- `solver/src/api.test.ts` (modified) — fallback stub + verified/fallback/GET-terminal tests + the `ANTHROPIC_API_KEY` sentinel sweep.
- `solver/src/index.test.ts` (modified) — `proposeClearing` stub supplied to `buildDeps` args.

## Decisions Made
- **Minimal-diff wiring.** Both handlers keep their existing `computeClearing`/`matchedAt`/`buildCurve` lines and only ADD `rationale` + `agent:{verified,source}`, so the P4 numbers are provably unchanged and the diff is small (the agent returns the same deterministic numbers, but they are never read for the response numbers).
- **No client arg at boot.** `createAgent({ computeClearing, matchedAt })` — agent.ts owns the module-private key; `index.ts` never reads `ANTHROPIC_API_KEY` (T-05-01).
- **Verbatim PROMPT.md.** The system-prompt block is verified byte-for-byte against `agent.ts SYSTEM_PROMPT` (a scripted diff) so the documented rules and the enforced rules cannot drift (T-05-04).

## Deviations from Plan

None - plan executed exactly as written. (The plan's note that the SDK uses `jsonSchemaOutputFormat` rather than `zodOutputFormat` — a Plan 05-01 deviation — is carried into PROMPT.md §4 as documentation; no code change here.)

## Threat-Model Compliance
- **T-05-01 (key disclosure):** the wiring surfaces only `agent.rationale` + `{verified,source}` — never the key or an SDK error object; `index.ts` never reads the key. The api.test secret sweep now asserts an `ANTHROPIC_API_KEY` sentinel is absent from both solve-preview and GET responses (alongside the operator-token sentinel). Verified green.
- **T-05-02 (AI numbers tampering):** solve-preview/GET emit the deterministic `computeClearing`/`matchedAt`/`buildCurve` numbers unchanged; `settle` does NOT call `proposeClearing` (grep-confirmed) — the AI is provably off the settlement path. The fallback-shape test asserts §4 still 100/10.
- **T-05-03 (Claude outage):** `proposeClearing` never throws (Plan 05-01); the handlers `await` it with no try/catch needed; the demo still serves 100.00 + a neutral rationale keyless.
- **T-05-04 (PROMPT.md drift):** the system prompt is byte-for-byte matched to the const; keep-in-sync note present.
- **T-05-SC (installs):** no new dependencies; tests use the existing Node `fetch` harness.

## Verification
- `cd solver && npx vitest run` → 33 tests green (6 files).
- `cd solver && npx tsc --noEmit` → clean.
- Grep `api.ts`: `proposeClearing` in AppDeps + solve-preview + GET-terminal only (never in settle); no `rationale: null` / `body.rationale = null` remains; secret-safe error middleware intact.
- Grep `index.ts`: `createAgent({ computeClearing, matchedAt })` (no client arg); secret-free boot log unchanged.
- `solver/PROMPT.md` contains `never used unverified`, `clearingPrice`, `rationale`, `VERIFIES`; SYSTEM_PROMPT block byte-matches `agent.ts`.

## Next Phase Readiness
- **Phase 6 (Auction Theatre) ready:** the Solver Agent panel can render `rationale` + the `agent:{verified,source}` block straight from `GET /round/:id/solve-preview` (live "watch the agent think") and from `GET /round/:id` after settlement. The data contract is backward-compatible and stable.
- **No blockers.** The phase's AGENT-01..04 requirements are complete (01/02 → AGENT-01/02; this plan → AGENT-03/04).

## Self-Check: PASSED
- FOUND: solver/PROMPT.md
- FOUND: solver/src/api.ts (proposeClearing wired)
- FOUND: solver/src/index.ts (createAgent wired)
- FOUND: commit a0d86b9 (Task 1)
- FOUND: commit 6672ed9 (Task 2)

---
*Phase: 05-ai-solver-agent*
*Completed: 2026-06-26*
