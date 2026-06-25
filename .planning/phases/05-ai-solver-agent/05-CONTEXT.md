# Phase 5: AI Solver Agent - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per user directive "run phases 4–6 without my input, go with recommended")

<domain>
## Phase Boundary

Add the autonomous-agent thesis to the **existing** solver service (`solver/`): when a round closes, the **Solver Agent** ingests the sealed batch and **proposes** a clearing (price + allocation) by calling **Claude** (`@anthropic-ai/sdk`) with a structured prompt returning strict JSON at temperature 0, plus a 2–3 sentence natural-language rationale. The service then **verifies, doesn't trust**: it recomputes the deterministic §8 result (`auction.ts`) and only ever settles an allocation that passes verification — the AI's numbers are never used unverified, and the on-ledger `Round.Clear` re-verifies again. The AI layer is **strictly additive and off the critical settlement path**.

**In scope (P5):** `solver/src/agent.ts` (Claude call + structured output + verify-don't-trust gate), wiring the rationale into `api.ts` `solve-preview`/`GET` (the `rationale` field that P4 shipped as `null`), `solver/PROMPT.md` (the prompt contract), unit tests with a **mocked** SDK (agreement / disagreement-rejected / unavailable paths), and the `ANTHROPIC_API_KEY` env plumbing (server-side only).
**Out of scope (deferred):** The Solver Agent **panel UI** that renders the rationale → **Phase 6** (UI-04 theatre / §12.5). Competing solvers, multi-agent ranking → stretch §19. No change to the deterministic core (`auction.ts`) or the on-ledger backstop (`Round.Clear`).
</domain>

<decisions>
## Implementation Decisions

### Claude integration (AGENT-01)
- Model: **`claude-haiku-4-5`** at **temperature 0** (the spec §9 "canonical agent"; cheap, fast, structured-output-capable per CLAUDE.md). Sonnet/Opus are noted alternatives only if richer prose is wanted — not the default.
- SDK: **`@anthropic-ai/sdk@0.106.0`** (pinned, server-side). Use **structured outputs** (`output_config.format` = `{ type: "json_schema", ... }`, GA, no beta header) to force the response into `{ clearingPrice: number, allocations: [{desk, side, filledQty}], rationale: string }`. **Fallback:** if structured outputs are unavailable for the account/region, switch to **forced tool use** (`tool_choice` + a single `strict:true` tool with the same JSON schema) and read the JSON from the `tool_use` block — same schema, identical downstream handling.
- The system prompt states the §8 auction rules **verbatim**; the user message provides the sealed batch as JSON (`buys`/`sells` with qty+limit, anonymized to desk ids the service maps back). The agent receives the batch only **on/after close** (privacy preserved — it runs as the Operator-side service, not a desk).

### Verify-don't-trust gate (AGENT-02 — the correctness guarantee)
- Parse the model's JSON → **zod-validate** the shape → **recompute** the deterministic result via `computeClearing` (`auction.ts`) → compare for **equality**: `clearingPrice` equal (to 2dp) AND the allocation set equal (same desks, sides, filledQty). 
- If **equal**: settle the **deterministic** allocation (never the model's raw numbers) and attach the model's `rationale`.
- If **mismatch**, malformed JSON, SDK error, timeout, **or no `ANTHROPIC_API_KEY`**: log the divergence (server-side, no secret) and **fall back to the deterministic result** with a generated neutral rationale — the clear still settles correctly. The AI can never produce a wrong/unfair clear; `Round.Clear` is the final on-ledger backstop.
- This keeps the AI **off the critical path**: `settle` and `GET /round/:id` always carry the deterministic, on-ledger-verified allocation regardless of what Claude said.

### Wiring into the existing API (AGENT-03)
- `GET /round/:id/solve-preview` calls `agent.ts` (async) to obtain `{ proposal, rationale, verified, source }`, and returns the deterministic `clearingPrice`/`matchedVolume`/`curve` (unchanged) plus the now-populated **`rationale`** (was `null` in P4) and a small `agent` block (`verified: true|false`, `source: "claude" | "deterministic-fallback"`) for the Phase-6 panel. Response shape stays backward-compatible — P4 consumers ignore the new non-null fields.
- `POST /round/:id/settle` is unchanged in authority: it submits the verified deterministic allocation. The rationale is presentational only.
- Graceful degradation: with **no API key**, the service still serves `solve-preview`/`settle` (deterministic + fallback rationale) so the demo runs keyless; with a key, the Claude rationale appears.

### Prompt contract doc (AGENT-04)
- `solver/PROMPT.md` documents: the **system prompt verbatim** (the §8 rules + "return ONLY JSON, never prose outside the schema, temperature 0, you PROPOSE and the service VERIFIES"), the **user-message batch JSON** shape, and the **required response JSON** `{ clearingPrice, allocations:[{desk,side,filledQty}], rationale }`. Explicitly states the model's number is never used unverified.

### Testing (mocked SDK — no live API in CI)
- Mock `@anthropic-ai/sdk` in vitest (no network). Cover: (a) **agreement** — Claude returns the correct §4 clearing → `verified:true`, rationale used; (b) **disagreement** — Claude returns a wrong price/allocation → equality gate rejects → deterministic §4 result wins, `source:"deterministic-fallback"`; (c) **unavailable** — no key / SDK throws → deterministic + neutral rationale, no crash, no secret leaked. A sentinel-token assertion confirms `ANTHROPIC_API_KEY` never appears in any response/log.

### Claude's Discretion
- Exact agent module shape, the zod schema object, the retry/timeout policy on the Claude call, and the precise rationale-fallback wording — at the executor's discretion, guided by spec §9, CLAUDE.md's AI-layer notes, and the structured-outputs source links in CLAUDE.md.
- No separate `AI-SPEC.md` / eval-planner pass is needed: **spec §9 is the AI design contract** and the **verify-don't-trust equality gate is the guardrail/eval** (a wrong proposal is structurally rejected and measured against the deterministic core). This is the hackathon-appropriate, spec-locked choice.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `solver/src/auction.ts` — `computeClearing` (+ `matchedAt`/`demandAt`/`supplyAt`/`candidatePrices`): the deterministic §8 oracle the agent's proposal is verified against. Output type mirrors Daml `Allocation`.
- `solver/src/api.ts` — `createApp(deps)`; `solve-preview`/`GET` already carry a nullable `rationale` + `agent`-ready shape (P4 forward-compat seam); `settle` submits the deterministic allocation.
- `solver/src/ledger.ts` — `readSealedOrders(roundId)` gives the agent its batch input; the Operator boundary + secret hygiene pattern (token module-private) to mirror for `ANTHROPIC_API_KEY`.
- `solver/.env.example` — already lists `ANTHROPIC_API_KEY=` (present-but-unused in P4; P5 consumes it).
- `solver/package.json` — add `@anthropic-ai/sdk@0.106.0`.

### Established Patterns
- Secrets server-side only (D6 / spec §15): `ANTHROPIC_API_KEY` read in `agent.ts`, never returned/logged; same discipline as the Operator token in `ledger.ts`.
- zod request/response validation already in `api.ts`; reuse for the Claude JSON shape.
- vitest with dependency injection / module mocks (the api.test/ledger.test stub pattern) — mock the SDK the same way.
- Node 20 + TS ESM; `@anthropic-ai/sdk` built on Node 20 (CLAUDE.md).

### Integration Points
- `agent.ts` ↔ Anthropic API (server-side, `ANTHROPIC_API_KEY`); ↔ `auction.ts` (verify) ; ↔ `ledger.ts` (`readSealedOrders` batch) ; ↔ `api.ts` (`solve-preview` rationale + `agent` block).
- The rationale string is consumed by the **Phase 6** Solver Agent panel (UI-04 / §12.5) — keep it a plain 2–3 sentence string.
</code_context>

<specifics>
## Specific Ideas

- The §4 fixture is the agreement-path fixture: a correct Claude proposal says clearingPrice 100.00, A=10/B=8/C=2 — which equals the deterministic result, so `verified:true`. Use this exact batch in the agreement test.
- Rationale example to anchor tone (spec §9): "Cleared at 100.00: maximizes matched volume at 10 units; Meridian filled first on price priority, Halward partially filled." 2–3 sentences, plain language, no JSON.
- Keep the demo robust: the money shot must clear at 100.00 **whether or not** Claude is reachable — the deterministic core + fallback rationale guarantee it.
</specifics>

<deferred>
## Deferred Ideas

- Solver Agent **panel** that renders the rationale + "watch the agent think" moment → **Phase 6** (UI-04, §12.5).
- Competing AI solvers (N agents ranked by matched volume / price improvement) → stretch §19.
- `make` targets / demo orchestration → **Phase 7**.
</deferred>
