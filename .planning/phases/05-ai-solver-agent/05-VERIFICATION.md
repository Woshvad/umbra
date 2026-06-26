---
phase: 05-ai-solver-agent
verified: 2026-06-26T02:05:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: null
---

# Phase 5: AI Solver Agent Verification Report

**Phase Goal:** Add the autonomous-agent thesis — Claude proposes and narrates the clearing — without ever risking correctness, via a verify-don't-trust equality gate against the deterministic core. Additive, off the settlement path.
**Verified:** 2026-06-26T02:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | On round close the agent ingests the sealed batch and PROPOSES a clearing (price + allocation + rationale) by calling Claude (claude-haiku-4-5, temperature 0) with structured output (AGENT-01) | ✓ VERIFIED | `agent.ts:181-188` `client.messages.parse({ model: 'claude-haiku-4-5', temperature: 0, max_tokens: 1024, system: SYSTEM_PROMPT, messages:[{role:'user',content:buildBatchMessage(views)}], output_config:{ format: jsonSchemaOutputFormat(proposalJsonSchema) } })`; reads `message.parsed_output` (L191). Forced-tool-use fallback documented L177-180. SDK imports + format object smoke-tested live (`json_schema`). |
| 2 | The deterministic computeClearing numbers are ALWAYS authoritative — the model's numbers are never used unverified; the model only sets rationale + agent block, only on exact match (AGENT-02) | ✓ VERIFIED | `agent.ts:160-161` recomputes `det` first; `fallback()` (L163-170) and agreement return (L202-209) BOTH spread `det.clearingPrice`/`det.allocations`, never `c.*` numbers; only `rationale: c.rationale` from the model. Gate L195-199: `priceEqual && allocationsEqual`, mismatch → `fallback()`. Test L65-88 asserts `r.allocations` deep-equals `computeClearing(views).allocations` on agreement. |
| 3 | Agreement (2dp price equal AND allocation-set equal by desk\|side→filledQty) → verified:true, source:'claude', model rationale; §4 fixture is the agreement fixture (100.00, A=10/B=8/C=2) | ✓ VERIFIED | `priceEqual` L101-102 (`Math.round(a*100)===Math.round(b*100)`, float-safe); `allocationsEqual` L107-111 (set keyed by `desk\|side`, order-insensitive). Tests: agreement L65-88, order-insensitive L90-107 both pass; §4 clears at 100/matched 10. |
| 4 | Disagreement / malformed-or-null / SDK error / NO key → deterministic fallback (verified:false, source:'deterministic-fallback', neutral rationale); proposeClearing NEVER throws | ✓ VERIFIED | Keyless short-circuit L173; safeParse-fail L192; mismatch L199; `catch` L210-219 always `return fallback()`, never re-throws. 9 agent tests cover all paths (disagreement-price, disagreement-alloc, malformed-missing-field, null, bad-enum, throws, keyless) — all assert `source==='deterministic-fallback'` + `clearingPrice===100`. |
| 5 | ANTHROPIC_API_KEY read exactly once, module-private, never exported/returned/logged; §4 clears at 100.00 with or without Claude | ✓ VERIFIED | Read once at `agent.ts:136` `process.env.ANTHROPIC_API_KEY?.trim()`; grep confirms this is the ONLY read in `solver/src` (all other hits are comments/sentinels). Never in any return value or `console.*` arg (catch L214-217 logs fixed string + `err.name` only). Sentinel-key sweep (agent.test L178-198 over result + console.log/error; api.test L283-327) asserts absence. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `solver/src/agent.ts` | createAgent DI factory, proposalSchema, SYSTEM_PROMPT, predicates, neutralRationale, module-private key | ✓ VERIFIED | 224 lines; exports `createAgent`, `AgentResult`, `proposalSchema`, `SYSTEM_PROMPT`, `priceEqual`, `allocationsEqual`, `buildBatchMessage`, `neutralRationale`. Wired + data flows real `det`. |
| `solver/src/agent.test.ts` | 9 mocked-SDK tests (agreement/order-insensitive/disagreement×2/malformed×3/unavailable/keyless) + sentinel sweep | ✓ VERIFIED | 211 lines; 9 tests, all green. DI fake client, real §8 helpers, sentinel-key absence asserted. |
| `solver/package.json` | @anthropic-ai/sdk@0.106.0 pinned (exact) | ✓ VERIFIED | Exact pin `"@anthropic-ai/sdk": "0.106.0"` present (grep count 1). zod@3.23.8 unchanged. |
| `solver/src/api.ts` | AppDeps gains proposeClearing; solve-preview + GET terminal emit rationale + agent block; settle unchanged | ✓ VERIFIED | 277 lines. `proposeClearing` in AppDeps (L68), solve-preview (L218), GET terminal (L185) ONLY — not in settle (L232-259). No `rationale: null`/`body.rationale = null` remains. |
| `solver/src/index.ts` | buildDeps wires real createAgent (keyless-safe, no client arg) | ✓ VERIFIED | L110-118 `createAgent({ computeClearing, matchedAt })` (no client arg); threads `agent.proposeClearing` into deps L195. Secret-free boot log unchanged L203. |
| `solver/PROMPT.md` | AGENT-04 contract: system prompt verbatim, batch JSON, response JSON, verify-don't-trust statement | ✓ VERIFIED | 126 lines; SYSTEM_PROMPT block byte-matches agent.ts (L31-36 vs agent.ts L77-82); contains "never used unverified", "VERIFIES", "clearingPrice", "rationale"; §4 worked example; keep-in-sync note; jsonSchemaOutputFormat deviation documented. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| agent.ts | @anthropic-ai/sdk | default Anthropic import + jsonSchemaOutputFormat subpath; client.messages.parse | ✓ WIRED | Imports resolve (smoke-tested); `messages.parse` at L181, `parsed_output` at L191. |
| agent.ts | auction.ts (computeClearing/matchedAt) | injected via createAgent — the deterministic oracle | ✓ WIRED | `det = computeClearing(views)` L161; always recomputed first; auction.ts FROZEN (no diff). |
| agent.ts | process.env.ANTHROPIC_API_KEY | module-private read once; absent → no client | ✓ WIRED | L136-137; keyless degradation path tested. |
| api.ts solve-preview + GET terminal | deps.proposeClearing | await → rationale + agent:{verified,source}; det numbers unchanged | ✓ WIRED | L185, L218; backward-compat asserted in api.test. |
| index.ts buildDeps | agent.ts createAgent | construct real agent once at boot, thread proposeClearing | ✓ WIRED | L110-118, L195. |
| PROMPT.md | agent.ts SYSTEM_PROMPT | quotes const verbatim — single source of truth | ✓ WIRED | Byte-matched system-prompt block + keep-in-sync note. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| agent.ts proposeClearing | `det` / `matchedVolume` | `computeClearing(views)` + `matchedAt(views, p)` (real §8 core) | Yes — real deterministic compute, not static | ✓ FLOWING |
| api.ts solve-preview | `agent.rationale` / `agent.{verified,source}` | `await deps.proposeClearing(views)` (real agent at boot) | Yes — populated (was null in P4) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full solver suite passes | `npx vitest run` | 33 passed (6 files: 6 auction + 5 clock + 3 ledger + 9 agent + 2 index + 8 api) | ✓ PASS |
| TypeScript clean | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| SDK deviation resolves at runtime | `node` import smoke for `Anthropic` + `jsonSchemaOutputFormat` | both `function`; format object `type: json_schema` | ✓ PASS |
| Exact dep pin | `grep '"@anthropic-ai/sdk": "0.106.0"'` | 1 match | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AGENT-01 | 05-01 | Agent proposes clearing via Claude, strict JSON, temperature 0 | ✓ SATISFIED | messages.parse, model claude-haiku-4-5, temperature 0, structured output (Truth 1). |
| AGENT-02 | 05-01 | Verify-don't-trust — deterministic recompute, AI numbers never unverified | ✓ SATISFIED | Equality gate; deterministic numbers always flow; settle never calls proposeClearing (Truth 2, 4). |
| AGENT-03 | 05-02 | 2–3 sentence rationale surfaced through the API | ✓ SATISFIED | solve-preview + GET terminal emit non-null rationale + agent block (api.ts L185-187, L225-226; api.test). |
| AGENT-04 | 05-02 | Prompt contract documented in solver/PROMPT.md | ✓ SATISFIED | PROMPT.md present with all three blocks + verify-don't-trust statement, SYSTEM_PROMPT byte-matched. |

All 4 declared requirement IDs (AGENT-01..04) are mapped to Phase 5 in REQUIREMENTS.md and are satisfied. No orphaned requirements. (Note: REQUIREMENTS.md traceability table still marks AGENT-03/04 as "Pending" and the checkboxes unchecked — a stale documentation artifact, not a code gap; the implementation fully satisfies them. Flagged as Info below.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| agent.ts | 163-170 | `fallback()` returns deterministic numbers | ℹ️ Info | Intentional graceful degradation — `det` is real computed data, not a stub. Not a placeholder. |
| api.ts | 272 | generic 500 `internal solver error` | ℹ️ Info | Deliberate secret-safe error envelope (SOLV-04), not an unimplemented handler. |

No `TODO`/`FIXME`/`TBD`/`XXX`/`PLACEHOLDER`/`not implemented` markers in any phase-5-modified file. No empty handlers, no hardcoded-empty data flowing to output, no `return null` stubs.

### Frozen-Surface Confirmation

- `solver/src/auction.ts` — byte-unchanged: last commit `b42ac51` (Phase 4-01); `git diff --stat` empty. ✓ FROZEN
- `solver/src/ledger.ts` — untouched in Phase 5: last commit `f7af76f`/`85b1e60` (Phase 4-02). `settle` path unchanged. ✓ FROZEN
- `settle` handler (api.ts L232-259) does NOT call `proposeClearing` — grep confirms `proposeClearing` only in AppDeps + solve-preview + GET-terminal. AI is provably off the settlement path. ✓

### UI / Scope Boundary

- No Solver Agent panel built in `web/` (grep for rationale/agent.verified/agent.source → no files). Correctly deferred to Phase 6 (UI-04). ✓

### Git Attribution

All 7 Phase-5 commits authored `woshvad <woshvad@gmail.com>`, committer `woshvad`. No `Co-Authored-By`, no "Generated with", no Claude/Anthropic attribution trailers (the words "Claude"/"Anthropic" appear only as legitimate descriptions of the code in commit bodies, never as attribution). ✓ Complies with the strict project rule.

### Gaps Summary

No gaps. The phase goal is fully achieved: Claude proposes and narrates the clearing (AGENT-01/03), a verify-don't-trust equality gate ensures the deterministic core is always authoritative and the AI's numbers are never used unverified (AGENT-02), the agent is strictly additive and provably off the settlement path (settle untouched, auction.ts/ledger.ts frozen), every non-agreement path degrades gracefully to the §4 deterministic clear (100.00) without throwing, the API key stays module-private and leak-free, and the prompt contract is documented (AGENT-04). All 33 tests green, tsc clean.

The plan-documented deviation (`jsonSchemaOutputFormat` instead of `zodOutputFormat`, forced by the zod@3.23.8 pin vs the SDK helper's zod-v4 hard-dependency) is sound, runtime-verified, and behaviorally equivalent — the verify-don't-trust gate, keyless degradation, and secret hygiene are unaffected.

**Info (non-blocking):** REQUIREMENTS.md still lists AGENT-03/AGENT-04 as `[ ]` / "Pending" in the traceability table despite being fully implemented and tested. Recommend updating those two rows to Complete to keep the requirements ledger accurate; this is a documentation lag, not a code or goal gap.

---

_Verified: 2026-06-26T02:05:00Z_
_Verifier: Claude (gsd-verifier)_
