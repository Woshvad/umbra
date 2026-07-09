// solver/src/agent.ts — the AI Solver Agent (AGENT-01 / AGENT-02).
//
// A thin, DI-friendly adapter that, when a round closes, asks Claude to PROPOSE a
// uniform clearing (price + allocation + a 2–3 sentence rationale), then VERIFIES
// that proposal against the FROZEN deterministic §8 core (auction.ts) and NEVER
// trusts it. The deterministic `computeClearing` numbers ALWAYS flow to the response
// and to settlement; the model only ever colors `rationale` + an additive
// `agent:{verified,source}` block, and only on an exact match (2dp price AND the
// allocation set by desk|side→filledQty). The AI is strictly additive and OFF the
// settlement path — a wrong/malicious/unavailable model can never produce an unfair
// clear (the on-ledger Round.Clear re-verifies §8 as the deep backstop).
//
// SECURITY (T-05-01 / spec §15 / ASVS V7, V14): `ANTHROPIC_API_KEY` is read exactly
// ONCE at module scope into a module-private const (mirrors ledger.ts L82-95). It is
// NEVER exported, returned, or logged. The catch logs a FIXED secret-free string +
// at most `err.name`. With no key (or an empty key) we do NOT construct a client —
// `proposeClearing` short-circuits to the deterministic fallback (graceful keyless
// degradation; the §4 fixture clears at 100.00 with or without Claude).
//
// SDK NOTE (deviation from the plan's `zodOutputFormat`): @anthropic-ai/sdk@0.106.0's
// `helpers/zod` (zodOutputFormat) hard-imports `zod/v4` and calls `z.toJSONSchema`,
// neither of which exists in the project's pinned `zod@3.23.8`. We therefore use the
// SDK's sibling helper `jsonSchemaOutputFormat` (from `helpers/json-schema`, zod-v4
// free) with a hand-authored JSON Schema literal for the SDK call, and keep zod's
// `proposalSchema.safeParse` for the verify-side re-validation. Same `messages.parse`
// → `message.parsed_output` shape; the equality gate is unchanged.

import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { z } from 'zod'
import type { Allocation, ClearingResult, OrderView, Side } from './auction.js'

// ── The proposal schema (verify-side, zod 3) ─────────────────────────────────────
// Drives `proposalSchema.safeParse(message.parsed_output)` — the belt-and-suspenders
// re-validation of the (untrusted) model output before the equality gate (ASVS V5).
export const proposalSchema = z.object({
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

// The SDK-side JSON Schema literal (zod-v4-free) passed to jsonSchemaOutputFormat —
// the SAME shape as proposalSchema, in plain JSON Schema. Forces schema-valid JSON
// output (GA structured outputs, no beta header).
const proposalJsonSchema = {
  type: 'object' as const,
  properties: {
    clearingPrice: { type: 'number' as const },
    allocations: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          desk: { type: 'string' as const },
          side: { type: 'string' as const, enum: ['Buy', 'Sell'] },
          filledQty: { type: 'integer' as const },
        },
        required: ['desk', 'side', 'filledQty'],
        additionalProperties: false,
      },
    },
    rationale: { type: 'string' as const },
  },
  required: ['clearingPrice', 'allocations', 'rationale'],
  additionalProperties: false,
}

// ── SYSTEM_PROMPT — the §8 rules VERBATIM + role framing ─────────────────────────
// This const is the SINGLE source of truth for the prompt. PROMPT.md (Plan 05-02)
// MUST quote this block verbatim — keep the two in sync (RESEARCH Pitfall 6).
export const SYSTEM_PROMPT = `You are the Umbra Solver Agent. You PROPOSE a uniform clearing for a sealed-bid batch auction; the service VERIFIES your proposal against a deterministic algorithm and the on-ledger contract — your numbers are never used unless they match exactly. Apply these rules precisely (temperature 0, deterministic):
1. Candidate prices = the sorted set of all distinct limit prices across buys and sells.
2. For each price p: demand(p) = Σ qty of buys with limit ≥ p; supply(p) = Σ qty of sells with limit ≤ p; matched(p) = min(demand, supply).
3. Choose p* = the price maximizing matched(p). Tie-breaks IN ORDER: (a) minimize |demand(p) − supply(p)| among the max-matched prices; (b) if still tied, choose the LOWER price. Round p* to 2 decimals.
4. Allocate at p*: eligible buys have limit ≥ p*, eligible sells have limit ≤ p*; traded = matched(p*). The short side fills fully; the long side is rationed by price priority (highest-limit buys first / lowest-limit sells first), integer fills never exceeding traded.
5. Output ONLY the required JSON (no prose outside the schema): clearingPrice (number, 2dp), allocations (one entry per eligible order with desk, side, filledQty), and a 2–3 sentence plain-language rationale.`

// ── buildBatchMessage — the user-message batch JSON ──────────────────────────────
// The agent receives the sealed batch only on/after close (privacy preserved — it
// runs Operator-side, not as a desk). Numeric qty/limit + service-controlled desk
// ids only; even a manipulated rationale is presentational (T-05-04).
export const buildBatchMessage = (views: OrderView[]): string => {
  const buys = views
    .filter((v) => v.side === 'Buy')
    .map((v) => ({ desk: v.desk, quantity: v.quantity, limit: v.limit }))
  const sells = views
    .filter((v) => v.side === 'Sell')
    .map((v) => ({ desk: v.desk, quantity: v.quantity, limit: v.limit }))
  return JSON.stringify({ buys, sells })
}

// ── The equality predicates (pure) ───────────────────────────────────────────────
// 2dp price equality, float-safe — compare the rounded integer, never raw `===`
// (RESEARCH Pitfall 4; computeClearing already rounds Math.round(p*100)/100).
export const priceEqual = (a: number, b: number): boolean =>
  Math.round(a * 100) === Math.round(b * 100)

// Order-insensitive allocation comparison: a SET keyed by `desk|side` → filledQty
// (RESEARCH Pitfall 5; the model may emit any order, computeClearing emits buys-then-sells).
const allocKey = (al: { desk: string; side: Side }): string => `${al.desk}|${al.side}`
export const allocationsEqual = (a: Allocation[], b: Allocation[]): boolean => {
  if (a.length !== b.length) return false
  const mb = new Map(b.map((x) => [allocKey(x), x.filledQty]))
  return a.every((x) => mb.get(allocKey(x)) === x.filledQty)
}

// ── neutralRationale — the deterministic-fallback wording (no model, no secret) ───
export const neutralRationale = (det: ClearingResult, matchedVolume: number): string =>
  `Cleared at ${det.clearingPrice.toFixed(2)} by the deterministic §8 algorithm, ` +
  `maximizing matched volume at ${matchedVolume} unit${matchedVolume === 1 ? '' : 's'}. ` +
  `This uniform clearing price was computed and re-verified without an AI rationale.`

// ── AgentResult — the public result shape ────────────────────────────────────────
// The NUMBERS (clearingPrice/allocations/matchedVolume) are ALWAYS deterministic.
// `rationale` is the model's only on the agreement path; `verified`/`source` are the
// additive provenance block.
export interface AgentResult {
  clearingPrice: number
  allocations: Allocation[]
  matchedVolume: number
  rationale: string
  verified: boolean
  source: 'claude' | 'deterministic-fallback'
}

// ── Module-private credential (mirror ledger.ts L82-95) ──────────────────────────
// Read ONCE at module scope; NEVER exported, returned, or logged. Empty/absent → no
// client (keyless degradation). The optional `client` injected into createAgent (the
// test fake / the index.ts boot client) overrides this module-private one.
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim()
const _client: Anthropic | null = _apiKey ? new Anthropic({ apiKey: _apiKey }) : null

// ── TRUST-02 deadline (Pitfall 2) ────────────────────────────────────────────────
// `messages.parse` has no built-in deadline, so a slow/hanging key could stall a round
// forever. We race the call against a timer; a timeout is treated EXACTLY like every
// other failure mode — it rejects into the SAME catch → deterministic §4 fallback. The
// deadline is configurable (AgentDeps.timeoutMs override → AGENT_TIMEOUT_MS env → default)
// so a fast successful call is never affected but a demo can never spin forever.
export const DEFAULT_AGENT_TIMEOUT_MS = 8000

// A distinct error so the (secret-free) catch log names 'AgentTimeout', not a network name.
export class AgentTimeoutError extends Error {
  constructor() {
    super('agent request exceeded the deadline')
    this.name = 'AgentTimeout'
  }
}

// Resolve the deadline: an explicit DI override wins, then AGENT_TIMEOUT_MS, else default.
const resolveTimeoutMs = (override?: number): number => {
  if (typeof override === 'number' && override > 0) return override
  const env = Number(process.env.AGENT_TIMEOUT_MS)
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_AGENT_TIMEOUT_MS
}

// Race a promise against a deadline. On timeout the returned promise REJECTS with an
// AgentTimeoutError (so proposeClearing's existing catch handles it → fallback); the
// timer is always cleared so it never keeps the event loop alive.
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentTimeoutError()), ms)
  })
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer))
}

// The minimal client surface the agent uses — lets the test inject a fake without
// constructing a full Anthropic instance. `messages.parse` → `{ parsed_output }`.
export interface AgentClient {
  messages: {
    parse: (args: unknown) => Promise<{ parsed_output: unknown }>
  }
}

export interface AgentDeps {
  client?: AgentClient | null
  computeClearing: (orders: OrderView[]) => ClearingResult
  matchedAt: (orders: OrderView[], p: number) => number
  // Optional deadline override (ms) for the model call — falls back to AGENT_TIMEOUT_MS
  // env then DEFAULT_AGENT_TIMEOUT_MS. Injected by tests to force the timeout branch.
  timeoutMs?: number
}

// ── createAgent — the DI factory (mirrors api.ts createApp(deps)) ─────────────────
export const createAgent = (
  deps: AgentDeps,
): { proposeClearing: (views: OrderView[]) => Promise<AgentResult> } => {
  const { computeClearing, matchedAt } = deps
  // Injected client overrides the module-private one (test fake / boot client).
  const client: AgentClient | null = deps.client ?? (_client as AgentClient | null)
  const timeoutMs = resolveTimeoutMs(deps.timeoutMs)

  // ── TRUST-02 degradation ladder (formalized + locked by agent.test.ts) ──────────
  // proposeClearing NEVER throws. EVERY failure mode maps to the SAME deterministic §4
  // fallback ($100.00, A=10/B=8/C=2 on the canonical fixture, verified:false,
  // source:'deterministic-fallback'). The full ladder, in order:
  //   1. keyless          — no resolved client (short-circuit below)
  //   2. malformed        — parsed_output not the proposal shape (safeParse fails)
  //   3. zod-invalid      — e.g. an out-of-enum side / negative fill (safeParse fails)
  //   4. disagreement     — price OR allocation ≠ the deterministic §8 result (gate rejects)
  //   5. SDK-error        — client.messages.parse throws (network / API error) → catch
  //   6. TIMEOUT          — the call exceeds the deadline → withTimeout rejects → catch
  // The deterministic computeClearing numbers are ALWAYS authoritative; the model only
  // ever colors `rationale` on the exact-match agreement path.
  const proposeClearing = async (views: OrderView[]): Promise<AgentResult> => {
    // The deterministic result is ALWAYS authoritative — recompute it first.
    const det = computeClearing(views)
    const matchedVolume = matchedAt(views, det.clearingPrice)
    const fallback = (): AgentResult => ({
      clearingPrice: det.clearingPrice,
      allocations: det.allocations,
      matchedVolume,
      rationale: neutralRationale(det, matchedVolume),
      verified: false,
      source: 'deterministic-fallback',
    })

    // Keyless degradation — no resolved client, no network call.
    if (!client) return fallback()

    try {
      // GA structured outputs (no beta header). `parsed_output` is the typed result.
      // FALLBACK (if GA structured outputs are disabled for the account/region): a
      // single `strict:true` `propose_clearing` tool via client.messages.create +
      // tool_choice, reading JSON from the tool_use block — same proposalSchema.safeParse,
      // identical equality gate. Documented here as the locked alternative.
      // Race the model call against the deadline (Pitfall 2 / TRUST-02). A timeout
      // rejects with AgentTimeoutError → the catch below → the SAME deterministic fallback.
      const message = await withTimeout(
        client.messages.parse({
          model: 'claude-haiku-4-5', // alias; pinned snapshot claude-haiku-4-5-20251001
          max_tokens: 1024, // ample for ≤3 orders + a short rationale (RESEARCH Pitfall 3)
          temperature: 0, // canonical agent (§9) — deterministic
          system: SYSTEM_PROMPT, // §8 rules verbatim
          messages: [{ role: 'user', content: buildBatchMessage(views) }],
          output_config: { format: jsonSchemaOutputFormat(proposalJsonSchema) },
        }),
        timeoutMs,
      )

      // Belt-and-suspenders: re-validate the (untrusted) model output with zod.
      const parsed = proposalSchema.safeParse(message.parsed_output)
      if (!parsed.success) return fallback() // malformed / null → fallback

      const c = parsed.data
      const match =
        priceEqual(c.clearingPrice, det.clearingPrice) &&
        allocationsEqual(c.allocations as Allocation[], det.allocations)

      if (!match) return fallback() // disagreement → deterministic wins

      // Agreement: the deterministic NUMBERS, the model's RATIONALE only.
      return {
        clearingPrice: det.clearingPrice,
        allocations: det.allocations,
        matchedVolume,
        rationale: c.rationale,
        verified: true,
        source: 'claude',
      }
    } catch (err) {
      // SDK error / timeout / network — NEVER throw into the API (T-05-03).
      // Log ONLY a fixed secret-free string + at most err.name; never err.message,
      // never the raw object, never the key (RESEARCH Pitfall 4 / Anti-Patterns).
      console.error(
        '[agent] Claude unavailable — falling back to deterministic clearing',
        err instanceof Error ? err.name : 'unknown',
      )
      return fallback()
    }
  }

  return { proposeClearing }
}
