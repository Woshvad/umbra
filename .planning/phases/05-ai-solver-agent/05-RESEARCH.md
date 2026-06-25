# Phase 5: AI Solver Agent - Research

**Researched:** 2026-06-26
**Domain:** Anthropic Claude structured-output integration in a Node 20 + TS solver service (verify-don't-trust gate against a frozen deterministic core)
**Confidence:** HIGH

## Summary

Phase 5 adds one new module — `solver/src/agent.ts` — that calls Claude to **propose** a clearing (price + allocation + a 2–3 sentence rationale) when a round closes, then **verifies that proposal against the frozen deterministic §8 core (`auction.ts`) and never trusts it.** The AI is strictly additive and off the settlement path: `settle` and the on-ledger `Round.Clear` always submit the deterministic `computeClearing` output, so a wrong/malicious/unavailable model can never produce an unfair clear. The work is small, well-bounded, and rides on patterns already proven in P4 (dependency injection, zod validation, module-private secret hygiene, stubbed-dep vitest).

The single highest-risk unknown — the exact `@anthropic-ai/sdk@0.106.0` API for structured JSON output — is now **verified directly against the v0.106.0 tarball and the official structured-outputs docs**. The correct path is `client.messages.parse({ model, temperature: 0, output_config: { format: zodOutputFormat(schema) }, ... })`, reading the typed result from `message.parsed_output`. `zodOutputFormat` is exported from `@anthropic-ai/sdk/helpers/zod`. Structured outputs are GA on `claude-haiku-4-5` with **no beta header**. The forced-tool-use fallback (`strict: true` tool + `tool_choice`) is documented as an equivalent path for accounts/regions without GA structured outputs.

**Primary recommendation:** Build `agent.ts` as a DI-friendly factory `createAgent({ client?, computeClearing, matchedAt })` that returns `proposeClearing(views)` → `{ rationale, verified, source, proposal? }`. Call `client.messages.parse` with `claude-haiku-4-5`, temperature 0, and a zod-derived JSON schema. zod-validate → recompute deterministic → compare for equality → on agreement attach the model rationale (`verified:true, source:"claude"`), on any failure path (mismatch / malformed / SDK error / no key) return the deterministic result with a generated neutral rationale (`verified:false, source:"deterministic-fallback"`). Never read `ANTHROPIC_API_KEY` outside `agent.ts`; never return or log it. Wire `proposeClearing` into `api.ts` `solve-preview` (and the terminal-status branch of `GET /round/:id`) to populate the `rationale` field P4 shipped as `null`, plus a small additive `agent` block.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Call Claude, parse structured JSON, hold `ANTHROPIC_API_KEY` | Solver service (`agent.ts`, server-side) | — | Spec §15 / SOLV-04: the key is server-side only, never in the browser. Mirrors the Operator-token discipline in `ledger.ts`. |
| Deterministic clearing (§8) — the source of truth | Solver service (`auction.ts`, FROZEN) | On-ledger `Round.Clear` (re-verify) | §8/§9: the AI's numbers are never used unverified; `auction.ts` is the off-ledger oracle, `Round.Clear` the final backstop. |
| Verify-don't-trust equality gate | Solver service (`agent.ts`) | — | §9.2: the service recomputes and only ever surfaces a verified allocation. The gate lives next to the Claude call. |
| Expose `rationale` + `agent` block to the UI | Solver service (`api.ts` `solve-preview` / `GET`) | — | §11: the browser drives the demo via the HTTP API; the rationale is presentational, fed to the P6 Solver Agent panel. |
| Render the rationale ("watch the agent think") | Frontend (P6 panel, UI-04 / §12.5) | — | **Out of scope for P5** — deferred to Phase 6. P5 only emits a plain string. |
| Settlement authority | On-ledger `Round.Clear` via `ledger.settle` | — | UNCHANGED by P5. Always the deterministic allocation; the AI is off this path. |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Claude integration (AGENT-01)**
- Model: **`claude-haiku-4-5`** at **temperature 0** (spec §9 "canonical agent"; cheap, fast, structured-output-capable). Sonnet/Opus are noted alternatives only if richer prose is wanted — not the default.
- SDK: **`@anthropic-ai/sdk@0.106.0`** (pinned, server-side). Use **structured outputs** (`output_config.format` = `{ type: "json_schema", ... }`, GA, no beta header) to force `{ clearingPrice: number, allocations: [{desk, side, filledQty}], rationale: string }`. **Fallback:** if structured outputs are unavailable for the account/region, switch to **forced tool use** (`tool_choice` + a single `strict:true` tool with the same JSON schema) and read JSON from the `tool_use` block — same schema, identical downstream handling.
- The system prompt states the §8 auction rules **verbatim**; the user message provides the sealed batch as JSON (`buys`/`sells` with qty+limit). The agent receives the batch only **on/after close** (privacy preserved — it runs as the Operator-side service, not a desk).

**Verify-don't-trust gate (AGENT-02 — the correctness guarantee)**
- Parse the model's JSON → **zod-validate** the shape → **recompute** the deterministic result via `computeClearing` (`auction.ts`) → compare for **equality**: `clearingPrice` equal (to 2dp) AND the allocation set equal (same desks, sides, filledQty).
- If **equal**: settle the **deterministic** allocation (never the model's raw numbers) and attach the model's `rationale`.
- If **mismatch**, malformed JSON, SDK error, timeout, **or no `ANTHROPIC_API_KEY`**: log the divergence (server-side, no secret) and **fall back to the deterministic result** with a generated neutral rationale — the clear still settles correctly. `Round.Clear` is the final on-ledger backstop.
- The AI stays **off the critical path**: `settle` and `GET /round/:id` always carry the deterministic, on-ledger-verified allocation regardless of what Claude said.

**Wiring into the existing API (AGENT-03)**
- `GET /round/:id/solve-preview` calls `agent.ts` (async) to obtain `{ proposal, rationale, verified, source }`, and returns the deterministic `clearingPrice`/`matchedVolume`/`curve` (unchanged) plus the now-populated **`rationale`** (was `null` in P4) and a small `agent` block (`verified: true|false`, `source: "claude" | "deterministic-fallback"`). Response shape stays backward-compatible — P4 consumers ignore the new non-null fields.
- `POST /round/:id/settle` is unchanged in authority: it submits the verified deterministic allocation. The rationale is presentational only.
- Graceful degradation: with **no API key**, the service still serves `solve-preview`/`settle` (deterministic + fallback rationale) so the demo runs keyless; with a key, the Claude rationale appears.

**Prompt contract doc (AGENT-04)**
- `solver/PROMPT.md` documents: the **system prompt verbatim** (the §8 rules + "return ONLY JSON, never prose outside the schema, temperature 0, you PROPOSE and the service VERIFIES"), the **user-message batch JSON** shape, and the **required response JSON** `{ clearingPrice, allocations:[{desk,side,filledQty}], rationale }`. Explicitly states the model's number is never used unverified.

**Testing (mocked SDK — no live API in CI)**
- Mock `@anthropic-ai/sdk` in vitest (no network). Cover: (a) **agreement** — Claude returns the correct §4 clearing → `verified:true`, rationale used; (b) **disagreement** — Claude returns a wrong price/allocation → equality gate rejects → deterministic §4 result wins, `source:"deterministic-fallback"`; (c) **unavailable** — no key / SDK throws → deterministic + neutral rationale, no crash, no secret leaked. A sentinel-token assertion confirms `ANTHROPIC_API_KEY` never appears in any response/log.

### Claude's Discretion
- Exact agent module shape, the zod schema object, the retry/timeout policy on the Claude call, and the precise rationale-fallback wording — at the executor's discretion, guided by spec §9, CLAUDE.md's AI-layer notes, and the structured-outputs source links in CLAUDE.md.
- No separate `AI-SPEC.md` / eval-planner pass is needed: **spec §9 is the AI design contract** and the **verify-don't-trust equality gate is the guardrail/eval** (a wrong proposal is structurally rejected and measured against the deterministic core).

### Deferred Ideas (OUT OF SCOPE)
- Solver Agent **panel** that renders the rationale + "watch the agent think" moment → **Phase 6** (UI-04, §12.5).
- Competing AI solvers (N agents ranked by matched volume / price improvement) → stretch §19.
- `make` targets / demo orchestration → **Phase 7**.
- No change to the deterministic core (`auction.ts`) or the on-ledger backstop (`Round.Clear`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | On round close, the Solver Agent ingests the sealed batch and **proposes** a clearing (price + allocation) by calling Claude with a structured prompt that returns strict JSON, temperature 0 | Code Example 1 (`client.messages.parse` + `zodOutputFormat`, `claude-haiku-4-5`, `temperature: 0`); the batch input is `readSealedOrders(roundId)` → `OrderView[]` (already available, `ledger.ts`/`api.ts`). Privacy preserved: agent runs Operator-side, post-close only. |
| AGENT-02 | The service recomputes the deterministic result and only submits an allocation that passes verification; the AI's numbers are never used unverified (verify-don't-trust) | Code Example 2 (equality gate): zod-validate → `computeClearing(views)` → `priceEqual` (2dp) AND `allocationsEqual` (set by desk+side+filledQty) → fallback on any failure. Settlement path (`ledger.settle`/`Round.Clear`) is unchanged and already deterministic-only. |
| AGENT-03 | Claude returns a 2–3 sentence natural-language rationale for the clearing, rendered in the Solver Agent panel | `rationale: string` is part of the structured-output schema. Wired into `api.ts` `solve-preview` (replaces `rationale: null`) + an additive `agent: { verified, source }` block. Panel rendering itself is P6. |
| AGENT-04 | The prompt contract (system rules verbatim, batch JSON, required JSON response shape) is documented in `solver/PROMPT.md` | "PROMPT.md Contract" section below gives the verbatim system prompt (§8 rules), the user batch JSON shape, and the required response JSON — copy-ready for the doc. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are user-mandated and override default tooling. The planner must verify compliance.

- **Never add Claude as a git contributor.** No `Co-Authored-By`, no "Generated with Claude Code", no Anthropic attribution in any commit/PR. Author/committer stays `woshvad`. (This applies to the `commit_docs` commit at the end of this phase and every plan-execution commit.)
- **`ANTHROPIC_API_KEY` server-side only.** Read solely inside `solver/` (specifically `agent.ts`); never in the frontend, never logged, never committed. `.env` is gitignored; `.env.example` already lists the key (empty).
- **Trusting the model's clearing number is forbidden.** Deterministic §8 recompute + on-ledger `Round.Clear` re-verification are the source of truth (this IS the AGENT-02 gate).
- **`spec.md` is authoritative** — build to spec, do not seek clarification. The §4 fixture must clear at exactly **$100.00** (A=10/B=8/C=2) — the agreement-path fixture.
- **Pinned versions:** `@anthropic-ai/sdk@0.106.0`, `claude-haiku-4-5`, Node 20, TS 5.4–5.6 (project is on 5.6.3), `zod@3.23.x` (already installed at 3.23.8).
- **No Tailwind/React/frontend work in this phase** (P5 is solver-only; the panel is P6).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `0.106.0` | Claude API client + structured-output helpers (`messages.parse`, `zodOutputFormat`) | Spec §6/§9 mandated; current published version (2026-06-24); native structured-output support, no beta header. `[VERIFIED: npm registry + Anthropic docs]` |
| `zod` | `3.23.8` (already installed) | Define the proposal schema; feeds both `zodOutputFormat()` and the verify-side `.safeParse()` | Already a solver dep (used in `api.ts`); one schema serves the SDK helper AND the belt-and-suspenders re-validation. `[VERIFIED: solver/package.json]` |
| `vitest` | `2.1.9` (already installed) | Unit tests with a mocked SDK (no live network) | Established test runner; `vi.mock`/DI patterns already in `api.test.ts`/`ledger.test.ts`. `[VERIFIED: solver/package.json]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | `16.6.1` (already installed) | Load `ANTHROPIC_API_KEY` from `.env` at boot (already called in `index.ts`) | No change needed — `index.ts` already runs `dotenv.config()` first. The key is simply read via `process.env.ANTHROPIC_API_KEY` inside `agent.ts`. `[VERIFIED: solver/package.json + ledger.ts boot notes]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `client.messages.parse` + `zodOutputFormat` (structured outputs) | Forced tool use: a single `strict:true` tool + `tool_choice:{type:"tool",name:...}`, read JSON from the `tool_use` block | Use ONLY if GA structured outputs are disabled for the account/region. Same JSON schema, identical downstream gate. Documented as the locked fallback. `[CITED: platform.claude.com/structured-outputs]` |
| `client.messages.parse` (auto-parse helper) | `client.messages.create` + manual `JSON.parse(content[0].text)` | `parse` gives a typed `parsed_output` and SDK-side validation; manual parse is more code and loses typing. Prefer `parse`. The manual path is a fine fallback if a helper-import quirk appears. `[VERIFIED: v0.106.0 tarball]` |
| `claude-haiku-4-5` | `claude-sonnet-4-6` / `claude-opus-4-8` | Only if demo rationale needs richer prose. Haiku is cheapest ($1/$5 per MTok), fastest, and structured-output-capable — the locked default. `[CITED: models/overview]` |

**Installation:**
```bash
# in solver/
npm install @anthropic-ai/sdk@0.106.0
# zod, vitest, dotenv already present — no new install
```

**Version verification (performed this session):**
- `@anthropic-ai/sdk@0.106.0` — `npm view` confirms version `0.106.0`, published **2026-06-24T18:50:15Z** (current, 2 days old), tarball on the official registry. Runtime deps: `standardwebhooks ^1.0.0`, `json-schema-to-ts ^3.1.1`. **No `postinstall` script** (clean). The `./helpers/*` export pattern resolves `@anthropic-ai/sdk/helpers/zod` and `/helpers/json-schema`; both files (`helpers/zod.js`, `helpers/json-schema.js`) are present in the tarball. `[VERIFIED: npm registry]`

## Package Legitimacy Audit

> One new external package this phase: `@anthropic-ai/sdk`.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@anthropic-ai/sdk@0.106.0` | npm | published 2026-06-24 (this version); package itself is the long-lived official Anthropic SDK | very high (official SDK) | github.com/anthropics/anthropic-sdk-typescript | unavailable (see note) | **Approved** |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

**slopcheck note:** The slopcheck install was **denied by the environment sandbox** (undeclared package, supply-chain policy) and could not be run. Per the legitimacy-gate graceful-degradation rule this would normally downgrade the package to `[ASSUMED]`. However, this single package's legitimacy is independently established to a HIGH bar by direct evidence: it is the **official Anthropic SDK explicitly mandated by `spec.md` §6/§9 and CLAUDE.md** (not a name discovered via web/training search), the exact pinned version `0.106.0` was confirmed on the official npm registry with a clean tarball (no `postinstall`, expected helper files present), and the scoped name `@anthropic-ai/*` is publisher-namespaced. **Recommendation to the planner:** a `checkpoint:human-verify` before the `npm install` is optional here given the spec mandate + registry confirmation, but harmless if added. Do NOT use `npx --yes` or auto-download any other package.

## Architecture Patterns

### System Architecture Diagram

```
                      POST /round/:id/close  (force-close; existing)
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  api.ts : GET /round/:id/solve-preview   (and GET /round/:id terminal) │
  │                                                                        │
  │   readSealedOrders(roundId) ──► OrderView[]  (the sealed batch)        │
  │            │                                                           │
  │            ├───────────────► computeClearing(views)  [auction.ts]      │  ◄── FROZEN deterministic core
  │            │                   = { clearingPrice*, allocations* }      │      (the source of truth)
  │            │                                                           │
  │            └───────────────► agent.proposeClearing(views)  [agent.ts]  │
  │                                      │                                 │
  │                                      ▼                                 │
  │                        ANTHROPIC_API_KEY present? ──no──┐              │
  │                                      │ yes              │              │
  │                                      ▼                  │              │
  │                  client.messages.parse({                │              │
  │                    model:"claude-haiku-4-5",            │              │
  │                    temperature:0,                       │              │
  │                    system: <§8 rules verbatim>,         │              │
  │                    messages:[{batch JSON}],             │              │
  │                    output_config:{format:zodOutputFormat(Schema)} })   │
  │                                      │                  │              │
  │                                      ▼                  │              │
  │                          message.parsed_output          │              │
  │                                      │                  │              │
  │                    zod re-validate + recompute deterministic           │
  │                                      ▼                  │              │
  │                 ┌──── EQUALITY GATE (price 2dp ∧ alloc set) ────┐       │
  │                 │ equal:                       not equal /      │       │
  │                 │  verified:true                malformed /     │       │
  │                 │  source:"claude"              SDK error /     │       │
  │                 │  rationale = model's          no key:         │       │
  │                 │                               verified:false  ◄───────┘
  │                 │                               source:"deterministic-fallback"
  │                 │                               rationale = generated neutral
  │                 └──────────────────────┬────────────────────────┘       │
  │                                        ▼                                 │
  │        response = { clearingPrice*, matchedVolume, allocations*, curve,  │
  │                     rationale,  agent:{ verified, source } }             │  ◄── deterministic numbers ALWAYS;
  └──────────────────────────────────────────────────────────────────────┘      AI only colors `rationale`+`agent`
                                 │
                                 ▼
            POST /round/:id/settle  ──►  ledger.settle  ──►  Round.Clear   ◄── UNCHANGED; deterministic-only,
                                                            (re-verifies §8     re-verified on-ledger
                                                             on-ledger)
```

The arrows show the load-bearing invariant: **the deterministic `computeClearing` output flows to the response and to settlement unconditionally; the agent's output only ever sets `rationale` + the `agent` block, and only when it exactly matches.**

### Recommended Module Shape (`solver/src/agent.ts`)

```
agent.ts
├── proposalSchema (zod)            # { clearingPrice:number, allocations:[{desk,side,filledQty}], rationale:string }
├── SYSTEM_PROMPT (const string)    # §8 rules verbatim (same text mirrored into PROMPT.md)
├── buildBatchMessage(views)        # → user message JSON { buys:[...], sells:[...] }
├── priceEqual / allocationsEqual   # the equality predicates (pure)
├── neutralRationale(result)        # deterministic-fallback wording generator
└── createAgent({ client?, computeClearing, matchedAt })  # DI factory
       └── proposeClearing(views): Promise<AgentResult>
            # AgentResult = { clearingPrice, allocations, matchedVolume,
            #                 rationale, verified, source }
```

**Why a DI factory (`createAgent`)** mirrors `createApp(deps)` in `api.ts`: it lets the test inject a fake Anthropic client (no network, no key) and inject the real `computeClearing`. `index.ts` constructs the real agent once at boot and threads `proposeClearing` into the `AppDeps` passed to `createApp`.

### Pattern 1: Construct the client once, keyless-safe
**What:** Read `process.env.ANTHROPIC_API_KEY` exactly once, inside `agent.ts`. If absent/empty, do NOT construct a client — `proposeClearing` short-circuits to the deterministic fallback. If present, construct `new Anthropic({ apiKey })` once and reuse.
**When to use:** Always — this is the graceful keyless-degradation requirement (demo runs without a key).
**Example:**
```typescript
// Source: pattern mirrors ledger.ts module-private credential + @anthropic-ai/sdk README
import Anthropic from '@anthropic-ai/sdk'

const _apiKey = process.env.ANTHROPIC_API_KEY?.trim()
// Module-private: never exported, never logged, never returned.
const _client: Anthropic | null = _apiKey ? new Anthropic({ apiKey: _apiKey }) : null
```

### Pattern 2: The verify-don't-trust equality gate
**What:** The deterministic recompute is authoritative; the model's output is only accepted if it matches exactly. Every non-match path collapses to the deterministic result.
**When to use:** Every `proposeClearing` call. See Code Example 2.

### Anti-Patterns to Avoid
- **Using `message.parsed_output` (or the model's number) as the settled allocation.** It is ONLY a candidate. Settlement and the response numbers always come from `computeClearing`. Violating this breaks the §9 "verify, don't trust" thesis and the §4 canary if the model drifts.
- **Reading `ANTHROPIC_API_KEY` anywhere but `agent.ts`.** Mirrors the `ledger.ts` rule that the Operator token is module-private. The key must never appear in a response, a log line, or the error envelope.
- **`throw`ing on Claude failure.** A SDK/network/timeout error must be caught inside `proposeClearing` and turned into the deterministic fallback — `solve-preview` must never 500 because Claude is down.
- **Float price comparison with `===` on raw `pStar`.** Compare on the rounded 2dp value (`Math.round(p*100)` integer compare, or `Math.abs(a-b) < 0.005`). `computeClearing` already rounds; the model returns a JSON number that may carry float noise.
- **Putting the §8 rules in two diverging places.** The `SYSTEM_PROMPT` string and `PROMPT.md` must be the same text. Recommend the const is the single source and PROMPT.md quotes it (or a code comment notes they must stay in sync).
- **Letting the model invent desks/sides.** zod-validate `side ∈ {"Buy","Sell"}` and that every allocation desk exists in the batch; a malformed shape is a fallback trigger, not a crash.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Forcing Claude to emit schema-valid JSON | A regex/prompt-only "please return JSON" + custom extraction from prose | `output_config.format` via `zodOutputFormat(schema)` (GA structured outputs) | The SDK + API guarantee schema conformance; prompt-only JSON drifts and needs brittle extraction. |
| Parsing/typing the model response | Manual `JSON.parse(content[0].text)` + hand-written type guards | `client.messages.parse(...)` → typed `message.parsed_output` | The `parse` helper auto-parses and types the output against the zod schema. Manual parse is the documented fallback only. |
| Validating the proposal shape | Hand-written field checks | `proposalSchema.safeParse(...)` (zod, already a dep) | One schema drives both the SDK helper and the verify-side re-check; consistent, declarative, already in the codebase. |
| Mocking the network in tests | A live API call gated on a CI secret | `vi.mock('@anthropic-ai/sdk', ...)` or inject a fake `client` via the DI factory | No network, no key, no flake in CI; deterministic test paths. |
| Clearing math | Re-deriving §8 in `agent.ts` | Call the FROZEN `computeClearing`/`matchedAt` from `auction.ts` | The §8 core is the single source of truth; duplicating it would create a second oracle that can diverge. |

**Key insight:** Phase 5 writes almost no algorithmic code. It is a thin, well-typed adapter: one SDK call, one zod schema reused twice, two equality predicates, and a fallback string. The hard correctness work (the §8 algorithm + on-ledger re-verification) is already done and frozen — `agent.ts` must not touch it.

## Common Pitfalls

### Pitfall 1: ESM helper import path / dual-package resolution
**What goes wrong:** `import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'` fails to resolve, or `import Anthropic from '@anthropic-ai/sdk'` resolves to the wrong CJS/ESM shape under the solver's `"type":"module"` + `moduleResolution:"Bundler"` tsconfig.
**Why it happens:** The package uses an `exports` map with `./helpers/*` (verified: `{ import: ./helpers/*.mjs, require: ./helpers/*.js }`). Under `moduleResolution:"Bundler"` (the solver's setting, per 04-01 notes) subpath exports resolve correctly, but a stricter resolution mode could trip.
**How to avoid:** The solver is already proven to consume ESM-with-exports packages (`@daml/ledger`) under `moduleResolution:"Bundler"` — use a plain default import for `Anthropic` and the named subpath import for `zodOutputFormat`. If a resolution error appears, the documented fallback is `client.messages.create` + manual `JSON.parse(content[0].text)` (no helper import needed) behind the same gate.
**Warning signs:** `tsc --noEmit` error `Cannot find module '@anthropic-ai/sdk/helpers/zod'` or a runtime `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### Pitfall 2: Reading the response from the wrong field
**What goes wrong:** Code reads `response.content[0].text` and JSON-parses it when using `messages.parse`, or expects `parsed_output` when using plain `messages.create`.
**Why it happens:** Two APIs, two response shapes. `parse` → `message.parsed_output` (typed). `create` → `message.content[0].text` (string, manual parse). The forced-tool-use fallback → the `tool_use` block's `.input` (already an object).
**How to avoid:** Pick `messages.parse` + `parsed_output` (recommended) and stick to it. Document which field each path reads. `parsed_output` is typed as `T | null` — null means the SDK could not parse → treat as a fallback trigger.
**Warning signs:** `undefined`/`null` proposal that silently slips past the gate; a `JSON.parse` `SyntaxError` thrown into `solve-preview`.

### Pitfall 3: `max_tokens` omitted or too small truncates the JSON
**What goes wrong:** `messages.create`/`parse` requires `max_tokens`; if omitted it errors, and if too small the JSON (with a multi-sentence rationale) is truncated → unparseable → fallback every time even when the model is right.
**Why it happens:** `max_tokens` is required by the Messages API. The §4 proposal is tiny but the rationale adds tokens.
**How to avoid:** Set a comfortable `max_tokens` (e.g. 1024). The batch is ≤ 3 orders, so this is ample.
**Warning signs:** Always `verified:false` even with a valid key and the §4 fixture; `stop_reason:"max_tokens"` in the raw response.

### Pitfall 4: Secret leaking into the error envelope or a log
**What goes wrong:** A caught SDK error is logged or spread into the response, and Anthropic SDK errors can include request context.
**Why it happens:** Default `console.error(err)` or `{ ...err }` can carry headers/config.
**How to avoid:** In `proposeClearing`'s catch, log only a fixed, secret-free string (e.g. `"[agent] Claude unavailable — falling back to deterministic clearing"`) plus at most `err instanceof Error ? err.name : 'unknown'`. Never log `err.message` verbatim if it could echo config, and never the key. The `api.ts` error middleware already collapses unknown errors to a generic 500 — keep agent errors from ever reaching it by handling them in `agent.ts`.
**Warning signs:** The sentinel-key test (below) finds the key in a response or captured log.

### Pitfall 5: `allocations` set comparison order-sensitivity
**What goes wrong:** Comparing the model's `allocations` array to the deterministic array by index → false mismatch because the model ordered desks differently (e.g. sells before buys).
**Why it happens:** `computeClearing` emits buys-then-sells; the model may emit any order.
**How to avoid:** Compare as a **set keyed by `desk|side`** mapping to `filledQty` (e.g. build a `Map` from each side, assert same keys and equal `filledQty` per key). See Code Example 2.
**Warning signs:** §4 agreement test fails with `verified:false` despite numerically-correct fills.

### Pitfall 6: Drift between `SYSTEM_PROMPT` and `PROMPT.md`
**What goes wrong:** AGENT-04 doc and the actual prompt diverge over edits; the doc no longer reflects what the model sees.
**Why it happens:** Two copies of the same §8 rules.
**How to avoid:** Make the const the source of truth and have PROMPT.md quote it verbatim, with a note ("this block is mirrored from `agent.ts SYSTEM_PROMPT` — keep in sync"). Optionally a tiny test asserts PROMPT.md contains the system-prompt sentinel line.
**Warning signs:** Reviewer notes the doc's rules text differs from the code's string.

## Code Examples

### Example 1: The structured-output Claude call (AGENT-01)
```typescript
// Source: VERIFIED against @anthropic-ai/sdk@0.106.0 tarball type defs +
//         CITED platform.claude.com/docs/en/build-with-claude/structured-outputs
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const proposalSchema = z.object({
  clearingPrice: z.number(),
  allocations: z.array(
    z.object({
      desk: z.string(),
      side: z.enum(['Buy', 'Sell']),
      filledQty: z.number().int().nonnegative(),
    }),
  ),
  rationale: z.string(),
})

const message = await client.messages.parse({
  model: 'claude-haiku-4-5',     // alias; pinned snapshot = claude-haiku-4-5-20251001
  max_tokens: 1024,
  temperature: 0,                // canonical agent (§9)
  system: SYSTEM_PROMPT,         // §8 rules verbatim (see PROMPT.md contract)
  messages: [{ role: 'user', content: JSON.stringify({ buys, sells }) }],
  output_config: { format: zodOutputFormat(proposalSchema) }, // GA, no beta header
})

const candidate = message.parsed_output // typed: z.infer<typeof proposalSchema> | null
```

**Forced-tool-use FALLBACK** (only if GA structured outputs are disabled for the account/region):
```typescript
// Source: CITED platform.claude.com/docs/en/build-with-claude/structured-outputs (strict tool use)
const res = await client.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 1024,
  temperature: 0,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: JSON.stringify({ buys, sells }) }],
  tools: [{
    name: 'propose_clearing',
    description: 'Return the proposed uniform clearing price, allocation, and rationale.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        clearingPrice: { type: 'number' },
        allocations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              desk: { type: 'string' },
              side: { type: 'string', enum: ['Buy', 'Sell'] },
              filledQty: { type: 'integer' },
            },
            required: ['desk', 'side', 'filledQty'],
            additionalProperties: false,
          },
        },
        rationale: { type: 'string' },
      },
      required: ['clearingPrice', 'allocations', 'rationale'],
      additionalProperties: false,
    },
  }],
  tool_choice: { type: 'tool', name: 'propose_clearing' },
})
const toolBlock = res.content.find((b) => b.type === 'tool_use')
const candidate = toolBlock ? proposalSchema.safeParse(toolBlock.input) : null
```

### Example 2: The verify-don't-trust equality gate (AGENT-02)
```typescript
// Source: pattern synthesized from auction.ts (frozen core) + CONTEXT.md decisions
import { computeClearing, matchedAt, type OrderView, type Allocation } from './auction.js'

const priceEqual = (a: number, b: number): boolean =>
  Math.round(a * 100) === Math.round(b * 100) // 2dp equality, float-safe

const allocKey = (al: Allocation): string => `${al.desk}|${al.side}`
const allocationsEqual = (a: Allocation[], b: Allocation[]): boolean => {
  if (a.length !== b.length) return false
  const mb = new Map(b.map((x) => [allocKey(x), x.filledQty]))
  return a.every((x) => mb.get(allocKey(x)) === x.filledQty)
}

export interface AgentResult {
  clearingPrice: number
  allocations: Allocation[]
  matchedVolume: number
  rationale: string
  verified: boolean
  source: 'claude' | 'deterministic-fallback'
}

async function proposeClearing(views: OrderView[]): Promise<AgentResult> {
  // The deterministic result is ALWAYS authoritative.
  const det = computeClearing(views)
  const matchedVolume = matchedAt(views, det.clearingPrice)
  const fallback = (): AgentResult => ({
    ...det,
    matchedVolume,
    rationale: neutralRationale(det, matchedVolume), // generated, no model
    verified: false,
    source: 'deterministic-fallback',
  })

  if (!_client) return fallback() // no key → keyless degradation

  try {
    const message = await _client.messages.parse({ /* Example 1 params */ })
    const parsed = proposalSchema.safeParse(message.parsed_output)
    if (!parsed.success) return fallback() // malformed/null

    const c = parsed.data
    const match =
      priceEqual(c.clearingPrice, det.clearingPrice) &&
      allocationsEqual(c.allocations as Allocation[], det.allocations)

    if (!match) return fallback() // disagreement → deterministic wins

    // Agreement: deterministic NUMBERS, model's RATIONALE.
    return {
      ...det,
      matchedVolume,
      rationale: c.rationale,
      verified: true,
      source: 'claude',
    }
  } catch {
    // SDK error / timeout / network — never throw into the API.
    return fallback()
  }
}
```
Note: even on the agreement path the **numbers come from `det`**, never from `c` — the model only contributes `rationale`.

### Example 3: Wiring into `api.ts` `solve-preview` (AGENT-03, backward-compatible)
```typescript
// solve-preview today returns rationale:null. Replace with the agent result.
// AppDeps gains: proposeClearing: (views: OrderView[]) => Promise<AgentResult>
app.get('/round/:id/solve-preview', wrap(async (req, res) => {
  const { id } = req.params
  const views = (await deps.readSealedOrders(id)).map((s) => s.view)
  const agent = await deps.proposeClearing(views) // never throws
  res.json({
    roundId: id,
    clearingPrice: agent.clearingPrice,   // deterministic (unchanged)
    matchedVolume: agent.matchedVolume,    // deterministic (unchanged)
    allocations: agent.allocations,        // deterministic (unchanged)
    curve: buildCurve(deps, views),        // unchanged
    rationale: agent.rationale,            // P5: now populated (was null)
    agent: { verified: agent.verified, source: agent.source }, // additive block
  })
}))
```
The `GET /round/:id` terminal-status branch gets the same treatment (replace `body.rationale = null`). P4 consumers that read `clearingPrice`/`matchedVolume`/`allocations`/`curve` are unaffected; they simply ignore the now-non-null `rationale` and new `agent` key.

### Example 4: Mocking the SDK in vitest (no network)
```typescript
// Source: pattern mirrors ledger.test.ts (vi.mock '@daml/ledger') + api.test.ts DI
import { describe, it, expect, vi } from 'vitest'

// Preferred: DI a fake client into createAgent (cleanest, no module hoisting).
const fakeClientReturning = (parsedOutput: unknown) => ({
  messages: { parse: vi.fn(async () => ({ parsed_output: parsedOutput })) },
})

// (a) agreement — model returns the correct §4 clearing
it('agreement: verified true, uses model rationale', async () => {
  const client = fakeClientReturning({
    clearingPrice: 100,
    allocations: [
      { desk: 'BankA', side: 'Buy', filledQty: 10 },
      { desk: 'BankB', side: 'Sell', filledQty: 8 },
      { desk: 'BankC', side: 'Sell', filledQty: 2 },
    ],
    rationale: 'Cleared at 100.00: maximizes matched volume at 10 units...',
  })
  const agent = createAgent({ client, computeClearing, matchedAt })
  const r = await agent.proposeClearing(SECTION4_VIEWS)
  expect(r.verified).toBe(true)
  expect(r.source).toBe('claude')
  expect(r.clearingPrice).toBe(100)
  expect(r.rationale).toContain('100')
})

// (b) disagreement — model returns a WRONG price → gate rejects
it('disagreement: deterministic wins, source fallback', async () => {
  const client = fakeClientReturning({
    clearingPrice: 99,                                  // wrong
    allocations: [{ desk: 'BankA', side: 'Buy', filledQty: 10 }],
    rationale: 'bogus',
  })
  const agent = createAgent({ client, computeClearing, matchedAt })
  const r = await agent.proposeClearing(SECTION4_VIEWS)
  expect(r.verified).toBe(false)
  expect(r.source).toBe('deterministic-fallback')
  expect(r.clearingPrice).toBe(100)                    // §4 canary still 100.00
})

// (c) unavailable — client throws (or no key) → fallback, no crash, no leak
it('unavailable: deterministic + neutral rationale, no secret leak', async () => {
  const client = { messages: { parse: vi.fn(async () => { throw new Error('network') }) } }
  const agent = createAgent({ client, computeClearing, matchedAt })
  const r = await agent.proposeClearing(SECTION4_VIEWS)
  expect(r.source).toBe('deterministic-fallback')
  expect(r.clearingPrice).toBe(100)
  expect(JSON.stringify(r)).not.toContain(SENTINEL_KEY) // key never in output
})
```

## PROMPT.md Contract (AGENT-04 — copy-ready content)

`solver/PROMPT.md` should document three blocks. Suggested content (executor may refine wording per discretion):

**1. System prompt (verbatim §8 rules + role framing).** The same string used as `SYSTEM_PROMPT` in `agent.ts`:
> You are the Umbra Solver Agent. You PROPOSE a uniform clearing for a sealed-bid batch auction; the service VERIFIES your proposal against a deterministic algorithm and the on-ledger contract — your numbers are never used unless they match exactly. Apply these rules precisely (temperature 0, deterministic):
> 1. Candidate prices = the sorted set of all distinct limit prices across buys and sells.
> 2. For each price p: demand(p) = Σ qty of buys with limit ≥ p; supply(p) = Σ qty of sells with limit ≤ p; matched(p) = min(demand, supply).
> 3. Choose p* = the price maximizing matched(p). Tie-breaks IN ORDER: (a) minimize |demand(p) − supply(p)| among the max-matched prices; (b) if still tied, choose the LOWER price. Round p* to 2 decimals.
> 4. Allocate at p*: eligible buys have limit ≥ p*, eligible sells have limit ≤ p*; traded = matched(p*). The short side fills fully; the long side is rationed by price priority (highest-limit buys first / lowest-limit sells first), integer fills never exceeding traded.
> 5. Output ONLY the required JSON (no prose outside the schema): clearingPrice (number, 2dp), allocations (one entry per eligible order with desk, side, filledQty), and a 2–3 sentence plain-language rationale.

**2. User message (batch JSON shape):**
```json
{ "buys":  [{ "desk": "BankA", "quantity": 10, "limit": 101 }],
  "sells": [{ "desk": "BankB", "quantity": 8, "limit": 99 },
            { "desk": "BankC", "quantity": 5, "limit": 100 }] }
```

**3. Required response JSON shape:**
```json
{ "clearingPrice": 100.00,
  "allocations": [
    { "desk": "BankA", "side": "Buy",  "filledQty": 10 },
    { "desk": "BankB", "side": "Sell", "filledQty": 8 },
    { "desk": "BankC", "side": "Sell", "filledQty": 2 }
  ],
  "rationale": "Cleared at 100.00: maximizes matched volume at 10 units; Meridian (BankB) filled first on price priority, Halward (BankC) partially filled." }
```

The doc must state explicitly: **"The model's clearingPrice and allocations are never used unverified — the service recomputes the deterministic result and only the rationale is taken from the model when the proposal matches exactly."**

## Runtime State Inventory

> P5 is additive code + one new dependency. No rename/refactor/migration. Checked each category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore keys/IDs change. The §4 fixture (A/B/C, BONDX/USDCx) is unchanged. | None |
| Live service config | None — no external service config (n8n/Datadog/etc.) involved. The solver is local. | None |
| OS-registered state | None — no scheduled tasks/services registered. | None |
| Secrets/env vars | `ANTHROPIC_API_KEY` already present in `.env.example` (empty) and read by `index.ts` `dotenv.config()`. P5 CONSUMES it inside `agent.ts` (no new var name; no rename). | None (key already plumbed; just read it) |
| Build artifacts | `solver/node_modules` gains `@anthropic-ai/sdk` after `npm install`. `@daml.js/umbra-0.1.0` unchanged. | Run `npm install @anthropic-ai/sdk@0.106.0` in `solver/` |

**Nothing found requiring data migration.** The only state change is adding one npm dependency.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top-level `output_format` param + `structured-outputs-2025-11-13` beta header | `output_config.format` (GA, no beta header) via `messages.parse` + `zodOutputFormat` | GA as of the structured-outputs doc; old path works during a transition window | Use `output_config.format`. Do NOT add a beta header. CLAUDE.md's "What NOT to Use" already flags the old `output_format`. `[CITED: structured-outputs]` |
| Manual `JSON.parse(content[0].text)` + hand type-guards | `client.messages.parse(...)` → typed `parsed_output` | SDK helper added (present in 0.106.0) | Less code, SDK-side validation, typed output. Manual parse kept as a resolution-quirk fallback only. `[VERIFIED: 0.106.0 tarball]` |

**Deprecated/outdated:**
- Top-level `output_format` — superseded by `output_config.format` (transition-window only). `[CITED: structured-outputs]`
- `claude-opus-4-1` is deprecated (retire 2026-08-05) — irrelevant here; the locked model is `claude-haiku-4-5`. `[CITED: models/overview]`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GA structured outputs (`output_config.format`) are enabled for THIS Anthropic account/region. | Standard Stack / Code Example 1 | LOW — if disabled, the locked forced-tool-use fallback (Example 1 fallback) produces identical JSON behind the same gate. Already planned for. This is the existing P5 STATE.md flag. |
| A2 | `ANTHROPIC_API_KEY` will be ABSENT in CI and likely in the autonomous demo run (keyless path is the primary tested path). | Testing / graceful degradation | NONE — keyless is a designed, tested path (test c). If a key IS present live, the agreement path additionally lights up. |
| A3 | slopcheck could not run (sandbox-denied); `@anthropic-ai/sdk@0.106.0` legitimacy rests on spec mandate + registry confirmation + clean tarball. | Package Legitimacy Audit | LOW — it is the official, spec-mandated, publisher-namespaced SDK confirmed on the registry with no postinstall. A `checkpoint:human-verify` before install is optional. |

## Open Questions

1. **Is GA structured-output enabled for the account/region used at demo time?**
   - What we know: GA on `claude-haiku-4-5`, no beta header, per official docs.
   - What's unclear: account/region entitlement at runtime (the standing P5 flag in STATE.md).
   - Recommendation: build the primary `messages.parse` path; keep the forced-tool-use fallback ready (locked decision). Either way the equality gate and keyless degradation make this non-blocking — the §4 demo clears at 100.00 regardless.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@anthropic-ai/sdk` | AGENT-01 Claude call | will be after `npm install` | `0.106.0` (confirmed on registry) | none needed — single install step |
| `ANTHROPIC_API_KEY` (env) | live Claude rationale (agreement path) | likely ✗ in CI / autonomous run | — | **keyless degradation** (deterministic + neutral rationale) — designed path |
| `zod` / `vitest` / `dotenv` | schema, tests, env load | ✓ (already in `solver/package.json`) | 3.23.8 / 2.1.9 / 16.6.1 | — |
| Live network to api.anthropic.com | live Claude call | ✗ in CI (and not required) | — | tests mock the SDK; runtime falls back deterministically |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** the API key + live network — both covered by the keyless/deterministic-fallback path, which is a first-class designed behavior, not a degraded mode.

## Validation Architecture

> nyquist_validation is enabled (config). The equality gate + three mocked-SDK paths are the strong Nyquist candidates.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 (already configured) |
| Config file | none standalone — `vitest run` via `solver/package.json` `test` script (proven across 04-01..04) |
| Quick run command | `cd solver && npx vitest run src/agent.test.ts` |
| Full suite command | `cd solver && npm test` (runs all `src/*.test.ts`; currently 21 green) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | Agent calls Claude with structured prompt, temp 0, parses proposal | unit (mocked SDK) | `npx vitest run src/agent.test.ts -t "agreement"` | ❌ Wave 0 (`src/agent.test.ts`) |
| AGENT-02 | Agreement → verified:true, model rationale, deterministic numbers | unit | `npx vitest run src/agent.test.ts -t "agreement"` | ❌ Wave 0 |
| AGENT-02 | Disagreement (wrong price/alloc) → gate rejects, deterministic §4 wins (100.00), source fallback | unit | `npx vitest run src/agent.test.ts -t "disagreement"` | ❌ Wave 0 |
| AGENT-02 | Unavailable (throw / no key) → deterministic + neutral rationale, no crash, key never in output | unit | `npx vitest run src/agent.test.ts -t "unavailable"` | ❌ Wave 0 |
| AGENT-02 | Malformed JSON / wrong shape → safeParse fails → fallback | unit | `npx vitest run src/agent.test.ts -t "malformed"` | ❌ Wave 0 |
| AGENT-03 | `solve-preview` returns populated `rationale` + `agent:{verified,source}`, P4 fields unchanged | unit (extend api.test) | `npx vitest run src/api.test.ts -t "solve-preview"` | ⚠️ exists; extend (currently asserts `rationale` null) |
| AGENT-03 | No secret in any solve-preview/GET response (sentinel key) | unit | `npx vitest run src/api.test.ts -t "secret"` | ⚠️ exists; extend to cover the key sentinel |
| AGENT-04 | `solver/PROMPT.md` exists and contains the system-prompt sentinel + required-response shape | unit (file assertion) | `npx vitest run src/agent.test.ts -t "PROMPT"` | ❌ Wave 0 (optional but cheap) |

### Sampling Rate
- **Per task commit:** `cd solver && npx vitest run src/agent.test.ts` (+ `src/api.test.ts` when `api.ts` changes)
- **Per wave merge:** `cd solver && npm test` (full suite) + `cd solver && npx tsc --noEmit`
- **Phase gate:** full suite green + `tsc` clean before `/gsd-verify-work`; the §4 agreement test asserting 100.00 is the continuous canary.

### Wave 0 Gaps
- [ ] `solver/src/agent.test.ts` — covers AGENT-01/02 (agreement, disagreement, unavailable, malformed, sentinel-key leak; optional PROMPT.md assertion)
- [ ] Extend `solver/src/api.test.ts` — `solve-preview`/`GET` now assert populated `rationale` + `agent` block + secret-free with an `ANTHROPIC_API_KEY` sentinel
- [ ] (No framework install needed — vitest present.)
- [ ] (No new shared fixtures needed — `SECTION4_VIEWS` already defined in `api.test.ts`; reuse/co-locate.)

## Security Domain

> security_enforcement enabled, ASVS Level 1, block_on: high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; the Operator JWT is unchanged (ledger.ts). |
| V3 Session Management | no | Stateless HTTP; no sessions added. |
| V4 Access Control | partial | CORS already scoped to `:5173` (api.ts). No new endpoint; `solve-preview` is existing. |
| V5 Input Validation | **yes** | zod `proposalSchema.safeParse` on the model output (untrusted input); existing zod on POST /round bodies. A malformed/adversarial model response is structurally rejected → fallback. |
| V6 Cryptography | no | No crypto in this phase (the Operator token's HS256 minting lives in ledger.ts, untouched). |
| V7 Error Handling & Logging | **yes** | `ANTHROPIC_API_KEY` and Anthropic SDK error context must never reach a response, log, or the error envelope. agent.ts catches and logs a fixed secret-free string; api.ts middleware already generic-izes unknown errors. |
| V14 Secret Management | **yes** | Key read only in agent.ts via `process.env`, module-private, never exported/returned/logged/committed. `.env` gitignored; `.env.example` empty. Mirrors the ledger.ts Operator-token discipline. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM returns a wrong/unfair clearing (hallucinated price/alloc) | Tampering | The verify-don't-trust equality gate (AGENT-02) + on-ledger `Round.Clear` re-verify — the model is structurally off the settlement path. |
| `ANTHROPIC_API_KEY` leaked to client / logs / git | Information Disclosure | Module-private read in agent.ts; sentinel-key test asserts the key never appears in any response/log; key never in frontend (spec §15 / SOLV-04). |
| Prompt-injection via order data influencing the model | Tampering | Order data is numeric (qty/limit) + desk ids the service controls; even a manipulated rationale is presentational only — numbers come from the deterministic core, never the model. |
| Claude outage causing a demo-time 500 / DoS of the solve flow | Denial of Service | try/catch in proposeClearing → deterministic fallback; `solve-preview` never throws on SDK failure. Keyless degradation tested. |
| SDK error object echoing request config/headers into the envelope | Information Disclosure | Catch and log a fixed string; never spread `err`; api.ts middleware collapses unknown errors to a generic 500. |

## Sources

### Primary (HIGH confidence)
- `@anthropic-ai/sdk@0.106.0` tarball (inspected this session) — confirmed `helpers/zod.js` exporting `zodOutputFormat`, `helpers/json-schema.js` exporting `jsonSchemaOutputFormat`, `messages.parse(...)` → `parsed_output`, `OutputConfig.format: JSONOutputFormat` with `type:'json_schema'`, `temperature?` param, no `postinstall`, deps `standardwebhooks`/`json-schema-to-ts`. `[VERIFIED]`
- npm registry — `@anthropic-ai/sdk@0.106.0` published 2026-06-24T18:50:15Z. `[VERIFIED]`
- platform.claude.com/docs/en/build-with-claude/structured-outputs — `output_config.format`, `zodOutputFormat`/`jsonSchemaOutputFormat`, `parsed_output`, no beta header, Haiku 4.5 supported, strict-tool-use fallback. `[CITED]`
- platform.claude.com/docs/en/about-claude/models/overview — `claude-haiku-4-5` alias / `claude-haiku-4-5-20251001` pinned; pricing $1/$5; structured outputs supported. `[CITED]`
- Codebase (read this session): `solver/src/auction.ts` (frozen §8 core), `api.ts` (solve-preview seam + rationale:null), `ledger.ts` (secret-hygiene pattern), `api.test.ts`/`ledger.test.ts` (DI + vi.mock + sentinel patterns), `package.json`, `.env.example`, `spec.md` §4/§8/§9/§11/§15. `[VERIFIED]`

### Secondary (MEDIUM confidence)
- CLAUDE.md "AI layer" notes + structured-outputs source links — corroborate the SDK/model/structured-output choices (cross-verified against the live docs above). `[CITED]`

### Tertiary (LOW confidence)
- None — every load-bearing API claim was verified against the tarball or the live official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK version, helper exports, and the parse API verified directly from the 0.106.0 tarball + registry.
- Architecture / wiring: HIGH — the seam (`rationale:null`, DI `createApp(deps)`) is read directly from `api.ts`; the pattern mirrors proven P4 modules.
- Verify-don't-trust gate: HIGH — built on the frozen `auction.ts` exports read this session.
- Pitfalls: MEDIUM-HIGH — drawn from the verified API shapes + established codebase pitfalls (ESM resolution, secret hygiene) proven in P4.
- Structured-output account entitlement (A1): MEDIUM — locked fallback removes the risk.

**Research date:** 2026-06-26
**Valid until:** 2026-07-10 (SDK is fast-moving; re-verify the `messages.parse` shape if `@anthropic-ai/sdk` is bumped past 0.106.x)

## RESEARCH COMPLETE

**Phase:** 05 - ai-solver-agent
**Confidence:** HIGH

### Key Findings
- The exact `@anthropic-ai/sdk@0.106.0` structured-output API is verified against the tarball: `client.messages.parse({ model:'claude-haiku-4-5', temperature:0, output_config:{ format: zodOutputFormat(schema) } })` → `message.parsed_output`. `zodOutputFormat` is exported from `@anthropic-ai/sdk/helpers/zod`. No beta header. Haiku 4.5 supports it.
- The forced-tool-use fallback (`strict:true` tool + `tool_choice`) is documented and ready as the locked alternative if GA structured outputs are disabled for the account/region (the standing P5 flag).
- The phase is a thin DI adapter (`createAgent({client?, computeClearing, matchedAt})`) — no algorithmic code. The deterministic `computeClearing` numbers ALWAYS flow to the response/settlement; the model only ever sets `rationale` + the additive `agent:{verified,source}` block, and only on an exact 2dp-price + allocation-set match.
- Three mocked-SDK test paths (agreement → verified:true; disagreement → §4 still 100.00, source fallback; unavailable → deterministic + neutral rationale, no leak) plus a sentinel-key assertion are the Nyquist validation core. vitest/zod/dotenv already present; only `npm install @anthropic-ai/sdk@0.106.0` is new.
- Secret hygiene: `ANTHROPIC_API_KEY` read only in `agent.ts`, module-private, keyless-degradation designed and tested; mirrors the ledger.ts Operator-token discipline.

### File Created
`.planning/phases/05-ai-solver-agent/05-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | SDK version + helper exports + parse API verified from the 0.106.0 tarball and registry |
| Architecture | HIGH | Wiring seam read directly from api.ts; mirrors proven P4 DI modules |
| Pitfalls | MEDIUM-HIGH | Verified API shapes + established P4 codebase pitfalls (ESM resolution, secret hygiene) |

### Open Questions
- GA structured-output entitlement for the runtime account/region (the standing P5 flag) — non-blocking: forced-tool-use fallback + keyless deterministic fallback both guarantee the §4 demo clears at 100.00.

### Ready for Planning
Research complete. The planner can create PLAN.md files for `agent.ts`, the `api.ts` wiring, `PROMPT.md`, and the mocked-SDK tests.
