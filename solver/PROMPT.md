# Umbra Solver Agent — Prompt Contract (AGENT-04)

This document is the human-readable contract for the AI Solver Agent (`solver/src/agent.ts`).
It records the three pieces of the Claude call — the **system prompt**, the **user-message
batch JSON**, and the **required response JSON** — and the load-bearing security invariant
that governs them.

> **The model's `clearingPrice` and `allocations` are never used unverified.** The service
> recomputes the deterministic §8 result (`auction.ts`) and only the **rationale** is taken
> from the model — and only when the proposal matches the deterministic result exactly
> (2-decimal clearing price **and** the allocation set keyed by `desk|side → filledQty`). On
> any mismatch, malformed output, SDK error, outage, or missing key, the deterministic result
> settles with a generated neutral rationale. The on-ledger `Round.Clear` re-verifies §8 as the
> final backstop. The AI is strictly additive and **off the settlement path** — a wrong,
> manipulated, or unavailable model can never produce an unfair clear.

The agent runs **Operator-side, post-close only**: it never sees orders while the window is
open, so the sealed-bid privacy guarantee is preserved. With no `ANTHROPIC_API_KEY` it
degrades gracefully (keyless) — the canonical §4 fixture still clears at **$100.00** with a
neutral rationale.

---

## 1. System prompt (verbatim §8 rules + role framing)

> **This block is mirrored from `solver/src/agent.ts` `SYSTEM_PROMPT` — keep the two in sync.**
> The const in `agent.ts` is the single source of truth (the text the model actually sees); this
> document quotes it so the documented rules and the enforced rules never diverge.

```
You are the Umbra Solver Agent. You PROPOSE a uniform clearing for a sealed-bid batch auction; the service VERIFIES your proposal against a deterministic algorithm and the on-ledger contract — your numbers are never used unless they match exactly. Apply these rules precisely (temperature 0, deterministic):
1. Candidate prices = the sorted set of all distinct limit prices across buys and sells.
2. For each price p: demand(p) = Σ qty of buys with limit ≥ p; supply(p) = Σ qty of sells with limit ≤ p; matched(p) = min(demand, supply).
3. Choose p* = the price maximizing matched(p). Tie-breaks IN ORDER: (a) minimize |demand(p) − supply(p)| among the max-matched prices; (b) if still tied, choose the LOWER price. Round p* to 2 decimals.
4. Allocate at p*: eligible buys have limit ≥ p*, eligible sells have limit ≤ p*; traded = matched(p*). The short side fills fully; the long side is rationed by price priority (highest-limit buys first / lowest-limit sells first), integer fills never exceeding traded.
5. Output ONLY the required JSON (no prose outside the schema): clearingPrice (number, 2dp), allocations (one entry per eligible order with desk, side, filledQty), and a 2–3 sentence plain-language rationale.
```

The call is made with `claude-haiku-4-5` at **`temperature: 0`** (the canonical agent, §9) so
the model is as deterministic as possible — but determinism is enforced, not assumed: see the
verify-don't-trust invariant above.

---

## 2. User message (the sealed batch as JSON)

The agent receives the sealed batch only on/after close, as a single JSON object with
service-controlled `desk` ids and numeric `quantity`/`limit` — no contract ids, no tokens. Built
by `buildBatchMessage(views)` in `agent.ts`.

**Shape:**

```json
{
  "buys":  [{ "desk": "<string>", "quantity": <int>, "limit": <number> }],
  "sells": [{ "desk": "<string>", "quantity": <int>, "limit": <number> }]
}
```

**Worked example (the canonical §4 fixture — A Buy 10 @101 / B Sell 8 @99 / C Sell 5 @100):**

```json
{
  "buys":  [{ "desk": "BankA", "quantity": 10, "limit": 101 }],
  "sells": [
    { "desk": "BankB", "quantity": 8, "limit": 99 },
    { "desk": "BankC", "quantity": 5, "limit": 100 }
  ]
}
```

---

## 3. Required response JSON

The model must return **only** schema-valid JSON (no prose outside the schema). Enforced two
ways: the SDK call uses **GA structured outputs** (`output_config.format` via
`jsonSchemaOutputFormat`, no beta header) to force schema-valid output, and the service
re-validates the parsed result with zod (`proposalSchema.safeParse`) before the equality gate.

**Shape (matches `proposalSchema` in `agent.ts`):**

```json
{
  "clearingPrice": <number, 2 decimals>,
  "allocations": [
    { "desk": "<string>", "side": "Buy" | "Sell", "filledQty": <non-negative int> }
  ],
  "rationale": "<2–3 sentence plain-language string>"
}
```

**Worked answer for the §4 fixture (clears at 100.00; A=10 / B=8 / C=2):**

```json
{
  "clearingPrice": 100.00,
  "allocations": [
    { "desk": "BankA", "side": "Buy",  "filledQty": 10 },
    { "desk": "BankB", "side": "Sell", "filledQty": 8 },
    { "desk": "BankC", "side": "Sell", "filledQty": 2 }
  ],
  "rationale": "Cleared at 100.00: this uniform price maximizes matched volume at 10 units. BankB (limit 99) fills fully on price priority; BankC (limit 100) is partially filled to 2 to balance against BankA's demand of 10."
}
```

---

## 4. Structured-output mechanism & fallback

- **Primary (in use):** GA structured outputs — `output_config.format` built with
  `jsonSchemaOutputFormat(proposalJsonSchema)` from `@anthropic-ai/sdk/helpers/json-schema`
  (zod-v4-free), read from `message.parsed_output`. No beta header.
  - *Why `jsonSchemaOutputFormat` and not `zodOutputFormat`:* the SDK's `zodOutputFormat`
    hard-imports `zod/v4` + `z.toJSONSchema`, neither present in the project-pinned
    `zod@3.23.8`. We pass a hand-authored JSON-Schema literal of the same shape and keep zod
    3's `proposalSchema.safeParse` for the verify-side re-validation (Plan 05-01 deviation).
- **Locked fallback** (if GA structured outputs are disabled for the account/region): a single
  `strict: true` `propose_clearing` tool via `client.messages.create` + `tool_choice`, reading
  the JSON from the `tool_use` block. Same `proposalSchema.safeParse`, identical equality gate.

In every degraded path — disabled structured outputs, malformed output, a disagreement with the
deterministic core, an SDK/network error, or a missing key — the service falls back to the
deterministic §8 result with a neutral rationale. The model's numbers are **never used
unverified**.
