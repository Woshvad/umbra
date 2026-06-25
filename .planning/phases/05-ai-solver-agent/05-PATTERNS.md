# Phase 5: AI Solver Agent - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 6 (3 new, 3 modified)
**Analogs found:** 5 / 6 (PROMPT.md is a doc artifact — no code analog)

All analogs are in-repo (`solver/src/`). Phase 5 is a thin DI adapter that reuses
proven Phase 4 patterns: `createApp(deps)`-style factory, module-private secret
hygiene, zod `safeParse`, and stubbed-dependency vitest. No new architecture.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `solver/src/agent.ts` (NEW) | service (DI factory) | request-response (external API → verify gate) | `solver/src/api.ts` (`createApp(deps)` factory) + `solver/src/ledger.ts` (secret hygiene) | role-match (factory) + exact (secret pattern) |
| `solver/src/agent.test.ts` (NEW) | test | request-response (mocked SDK) | `solver/src/api.test.ts` + `solver/src/ledger.test.ts` | exact (DI fakes + `vi.mock` + sentinel-token) |
| `solver/src/api.ts` (MODIFIED) | controller (HTTP routes) | request-response | itself — extend the `rationale:null` seam at L208 & L175 | self (in-place edit) |
| `solver/PROMPT.md` (NEW) | config (prompt contract doc) | n/a (static doc) | **none** — RESEARCH-driven content | no analog |
| `solver/package.json` (MODIFIED) | config | n/a | itself (deps block L12-20) | self |
| `solver/.env.example` (MODIFIED) | config | n/a | itself (`ANTHROPIC_API_KEY=` already present, L15) | self (likely no change) |

## Pattern Assignments

### `solver/src/agent.ts` (service, DI factory) — NEW

Mirrors **two** analogs: the `createApp(deps)` DI factory from `api.ts` for testability,
and the module-private credential discipline from `ledger.ts` for `ANTHROPIC_API_KEY`.

**Pattern A — DI factory (copy shape from `api.ts` L54-68, L118).**
`api.ts` defines an injected `AppDeps` interface and a `createApp(deps): Express`
factory. `agent.ts` mirrors this as `createAgent({ client?, computeClearing, matchedAt }): { proposeClearing }`.
The optional `client` is what the test injects (a fake Anthropic) and what `index.ts`
constructs once at boot.

`api.ts` L118 — the factory entry the agent factory mirrors:
```typescript
export const createApp = (deps: AppDeps): Express => {
```

**Pattern B — module-private secret, never exported/logged (copy from `ledger.ts` L82-95).**
This is the load-bearing security pattern. `ledger.ts` reads the Operator token into a
module-private `const`, exports ONLY the public party string, and constructs the client
once with the token closed over:
```typescript
// solver/src/ledger.ts L82-95
// Module-private credential. `_operatorToken` NEVER leaves this module.
const { token: _operatorToken, party: _operatorParty } = resolveOperatorCredential()

// Exported: the Operator PARTY string only (safe to surface; it is a public id).
// The token is intentionally NOT exported and NOT part of any return value.
export const operatorParty: string = _operatorParty

const ledger = new Ledger({
  token: _operatorToken,
  httpBaseUrl: process.env.JSON_API_URL ?? 'http://localhost:7575/',
})
```
`agent.ts` applies the identical discipline to `ANTHROPIC_API_KEY` (RESEARCH Pattern 1):
read `process.env.ANTHROPIC_API_KEY?.trim()` once, module-private; if absent do NOT
construct a client (keyless degradation); if present `new Anthropic({ apiKey })` once.
Never export, return, or log the key.

**Pattern C — zod `safeParse` on untrusted input (copy from `api.ts` L84-93, L128-134).**
`api.ts` validates request bodies with a strict zod schema and `safeParse`:
```typescript
// solver/src/api.ts L128-134
const parsed = openRoundBody.safeParse(req.body ?? {})
if (!parsed.success) {
  const issue = parsed.error.issues[0]
  ...
}
```
`agent.ts` reuses this exact `safeParse`-then-branch shape on the model's `parsed_output`
(the proposal schema). A failed parse is a fallback trigger, not a throw.

**Pattern D — verify against the frozen `auction.ts` oracle (copy intent from `ledger.ts` L237-296).**
`ledger.ts` `settle` computes `computeClearing(views)` + `matchedAt(views, price)` and
submits ONLY that deterministic output (verify-don't-trust). `agent.ts` does the same
recompute but uses it as the equality oracle: accept the model's `rationale` only when
`clearingPrice` (2dp) and the allocation set match. The deterministic numbers always
flow out — the model only ever colors `rationale` + the `agent` block (RESEARCH Example 2).

Relevant `auction.ts` exports (the oracle, FROZEN — do not modify):
```typescript
// solver/src/auction.ts
export const computeClearing = (orders: OrderView[]): ClearingResult  // L104
export const matchedAt = (orders: OrderView[], p: number): number     // L54
export interface Allocation { desk: string; side: Side; filledQty: number }  // L30
export interface OrderView  { desk: string; side: Side; quantity: number; limit: number }  // L22
```
Note `computeClearing` already rounds `Math.round(pStar*100)/100` (L120) — compare on
the 2dp integer (`Math.round(a*100) === Math.round(b*100)`), never raw float `===`.

**Secret-safe error handling (copy from `index.ts` L122-126 & `api.ts` L248-255).**
`index.ts` catches a boot error and logs only `err instanceof Error ? err.message : 'unknown'`
(never the raw object). `agent.ts`'s `proposeClearing` catch must log a FIXED secret-free
string + at most `err.name`, then return the deterministic fallback — never `throw` into
the API (a Claude outage must not 500 `solve-preview`).

---

### `solver/src/api.ts` (controller) — MODIFIED in place

Two surgical edits at existing seams P4 deliberately left as `rationale:null`. No new
route, no shape break — P4 consumers ignore the now-populated fields.

**Edit 1 — `solve-preview` handler (`api.ts` L191-211).** Replace the static
`rationale: null` (L208) with the agent result. Current seam:
```typescript
// solver/src/api.ts L202-209
res.json({
  roundId: id,
  clearingPrice,
  matchedVolume,
  allocations,
  curve,
  rationale: null, // additive seam for Phase 5 (Claude rationale).
})
```
Call `deps.proposeClearing(views)` (added to `AppDeps`), then emit deterministic numbers
(unchanged) + `rationale: agent.rationale` + `agent: { verified, source }`
(RESEARCH Example 3). The agent call never throws.

**Edit 2 — `GET /round/:id` terminal branch (`api.ts` L167-176).** Same treatment:
replace `body.rationale = null` (L175) with the agent rationale + `agent` block.

**Add to `AppDeps` (`api.ts` L54-68):** one field
`proposeClearing: (views: OrderView[]) => Promise<AgentResult>` alongside the existing
injected ledger + math helpers. `index.ts` (`buildDeps` L66-91) wires the real agent in.

**Preserve the secret-safe error envelope (`api.ts` L243-255)** — the existing middleware
already collapses unknown errors to a generic 500; keep agent errors from ever reaching it
by handling them in `agent.ts`.

---

### `solver/src/agent.test.ts` (test) — NEW

Reuses both vitest analogs. The DI-fake-client path is preferred (cleanest, no module
hoisting); `vi.mock` is the fallback.

**Pattern A — DI fakes + REAL §8 helpers (copy from `api.test.ts` L36-75).**
`api.test.ts` defines `SECTION4_VIEWS` (the §4 fixture, L36-40) and a `makeDeps` builder
that injects stubbed I/O but the REAL `computeClearing`/`matchedAt`. `agent.test.ts`
reuses `SECTION4_VIEWS` and passes the real `computeClearing`/`matchedAt` into
`createAgent`, injecting only a fake Anthropic client (RESEARCH Example 4):
```typescript
// fixture is identical to api.test.ts L36-40 — reuse/co-locate
const SECTION4_VIEWS: OrderView[] = [
  { desk: 'BankA', side: 'Buy',  quantity: 10, limit: 101.0 },
  { desk: 'BankB', side: 'Sell', quantity: 8,  limit: 99.0 },
  { desk: 'BankC', side: 'Sell', quantity: 5,  limit: 100.0 },
]
const fakeClientReturning = (parsedOutput: unknown) => ({
  messages: { parse: vi.fn(async () => ({ parsed_output: parsedOutput })) },
})
```

**Pattern B — sentinel-secret leak assertion (copy from `api.test.ts` L47-49, L174-175 and `ledger.test.ts` L18, L179-183).**
Both analogs define a `SENTINEL_TOKEN` and assert `JSON.stringify(...).not.toContain(...)`
across responses AND captured `console.log`/`console.error` calls:
```typescript
// solver/src/ledger.test.ts L179-183 — the log+return sentinel sweep to mirror
expect(JSON.stringify({ party, result })).not.toContain(SENTINEL_TOKEN)
for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
  expect(JSON.stringify(call)).not.toContain(SENTINEL_TOKEN)
}
```
`agent.test.ts` defines a `SENTINEL_KEY` for `ANTHROPIC_API_KEY` and asserts it never
appears in `JSON.stringify(result)` nor any captured log line.

**Pattern C — `vi.mock` of an external package (fallback; copy from `ledger.test.ts` L61-78).**
If DI injection of the client is insufficient, mock the SDK exactly as `ledger.test.ts`
mocks `@daml/ledger`: `vi.mock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }))`,
importing the agent module AFTER the mock.

**Three required paths (RESEARCH Example 4 + Test Map):** (a) agreement → `verified:true`,
`source:"claude"`, `clearingPrice===100`, rationale from model; (b) disagreement (wrong
price) → gate rejects, `source:"deterministic-fallback"`, §4 canary still `100`;
(c) unavailable (client `parse` throws) → fallback, no crash, sentinel key absent.
Optional: malformed-shape (safeParse fails) → fallback; PROMPT.md file assertion.

---

### `solver/PROMPT.md` (config doc) — NEW — NO CODE ANALOG

This is a documentation artifact with no in-repo code analog. Content is RESEARCH-driven:
copy the three blocks verbatim from RESEARCH "PROMPT.md Contract" (05-RESEARCH.md L495-525):
(1) the system prompt = the §8 rules verbatim (the SAME string used as `SYSTEM_PROMPT` in
`agent.ts` — keep in sync, RESEARCH Pitfall 6), (2) the user-message batch JSON shape,
(3) the required response JSON shape. Must state explicitly that the model's
clearingPrice/allocations are never used unverified. Closest in-repo style reference for a
doc that mirrors a `.daml`/`.ts` source is the header-comment convention in `auction.ts`
L1-15 ("ported 1:1 from … must mirror function-for-function").

---

### `solver/package.json` (config) — MODIFIED

Add one dependency to the `dependencies` block (`package.json` L12-20, alphabetical):
```json
"@anthropic-ai/sdk": "0.106.0"
```
`zod@3.23.8`, `vitest@2.1.9`, `dotenv@16.6.1` already present — no other change. Run
`npm install @anthropic-ai/sdk@0.106.0` in `solver/`. `"type": "module"` (L5) already set;
the SDK's `./helpers/*` subpath exports resolve under the solver's `moduleResolution`
(RESEARCH Pitfall 1).

---

### `solver/.env.example` (config) — MODIFIED (likely no-op)

`ANTHROPIC_API_KEY=` already present at L15 with the correct server-side-only comment.
Phase 5 only needs to update the comment ("PRESENT-BUT-UNUSED in Phase 4" → "consumed by
agent.ts") if desired; no functional change. The key is already loaded by `index.ts`
`dotenv.config()` (L96).

## Shared Patterns

### Secret hygiene (`ANTHROPIC_API_KEY`)
**Source:** `solver/src/ledger.ts` L82-95 (module-private token, export party only) + `index.ts` L186-189 (secret-free boot log).
**Apply to:** `agent.ts` (read key once, module-private, never export/return/log) and the `agent.test.ts` sentinel-key sweep.
```typescript
// ledger.ts L83-87 — the discipline to copy for the API key
const { token: _operatorToken, party: _operatorParty } = resolveOperatorCredential()
export const operatorParty: string = _operatorParty   // public id ONLY; token never exported
```

### Verify-don't-trust (deterministic oracle is authoritative)
**Source:** `solver/src/auction.ts` (FROZEN `computeClearing`/`matchedAt`) consumed by `ledger.ts` L237-296 (`settle` submits ONLY deterministic output).
**Apply to:** `agent.ts` equality gate — recompute, accept model's rationale only on exact 2dp-price + allocation-set match; numbers always come from `det`, never the model.

### zod `safeParse` on untrusted input
**Source:** `solver/src/api.ts` L84-93 (strict schema) + L128-134 (`safeParse` → branch).
**Apply to:** `agent.ts` proposal-shape validation of `message.parsed_output`.

### DI factory for testability
**Source:** `solver/src/api.ts` `createApp(deps)` L54-68, L118 + `index.ts` `buildDeps` L66-91.
**Apply to:** `agent.ts` `createAgent({ client?, computeClearing, matchedAt })`; `index.ts` constructs the real agent once and threads `proposeClearing` into `AppDeps`.

### Stubbed-dependency vitest + sentinel-secret sweep
**Source:** `solver/src/api.test.ts` L36-75 (DI fakes + real §8 + `SECTION4_VIEWS`) + `solver/src/ledger.test.ts` L61-78 (`vi.mock` external pkg) + L179-183 (log+return sentinel sweep).
**Apply to:** `agent.test.ts` (all three paths) and the extension of `api.test.ts` `solve-preview` assertion (now `rationale` non-null + `agent` block, key sentinel).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `solver/PROMPT.md` | config (prompt doc) | n/a | Documentation artifact; no in-repo code analog. Content is RESEARCH-driven (05-RESEARCH.md L495-525). Mirror the `SYSTEM_PROMPT` const verbatim. |

## Metadata

**Analog search scope:** `solver/src/` (all modules read this session).
**Files scanned:** `api.ts`, `ledger.ts`, `auction.ts`, `api.test.ts`, `ledger.test.ts`, `index.ts`, `package.json`, `.env.example`.
**Pattern extraction date:** 2026-06-26

## PATTERN MAPPING COMPLETE

**Phase:** 05 - ai-solver-agent
**Files classified:** 6
**Analogs found:** 5 / 6

### Coverage
- Files with exact/self analog: 4 (`agent.test.ts`, `api.ts`, `package.json`, `.env.example`)
- Files with role-match analog: 1 (`agent.ts` — `createApp` factory + `ledger.ts` secret pattern)
- Files with no analog: 1 (`PROMPT.md` — doc artifact, RESEARCH-driven)

### Key Patterns Identified
- `agent.ts` = DI factory (`createAgent`, mirrors `api.ts createApp(deps)`) + module-private secret (`ANTHROPIC_API_KEY`, mirrors `ledger.ts` `_operatorToken` L82-95); deterministic numbers from `auction.ts` always flow out, model only colors `rationale`.
- `api.ts` edits are two in-place seam replacements (`rationale:null` at L208 + L175) plus one `AppDeps` field — backward-compatible.
- `agent.test.ts` reuses `api.test.ts`'s `SECTION4_VIEWS` + DI-fake pattern and the `ledger.test.ts` sentinel-secret sweep (L179-183) for the key-leak assertion.

### File Created
`.planning/phases/05-ai-solver-agent/05-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. The planner can reference these analog excerpts directly in the PLAN.md action sections.
