# Phase 8: Demo Hardening - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 17 (5 solver modified · 3 solver new · 6 web modified · 2 web new · 1 CI new) + test files
**Analogs found:** 15 with strong in-repo analogs / 17 · 2 with no analog (CI workflow, proof-pack HTML→PDF script)

> Grounded in the CURRENT live stack: Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 (:3975/:2975/:4975), solver on **:4100**, Vite web on :5173. CLAUDE.md's 2.x/:7575/:4000 stack tables are STALE and were NOT used.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `solver/src/api.ts` (EXTEND) | route/controller | request-response + SSE | itself — existing `solve-preview` / `GET /round/:id` handlers | exact (same file) |
| `solver/src/agent.ts` (EXTEND) | service (AI adapter) | request-response / streaming | itself — `createAgent`/`proposeClearing` | exact (same file) |
| `solver/src/ledger.ts` (EXTEND) | service (ledger client) | event-driven (submit-and-wait) | itself — `settle()` + `exerciseChoice('...:Clear')` | exact (same file) |
| `solver/src/proof.ts` (NEW) | utility (persistence) | file-I/O + transform | `ledger.ts` `readFileSync` (L24/46) + `node:crypto` | role-match |
| `solver/src/proofpack.ts` (NEW) | utility (render + spawn) | transform + file-I/O | `docs/umbra-deck.html` `:root` tokens + Chrome headless invocation | partial (template only) |
| `solver/src/brief.ts` (NEW, or inline) | utility (NL compose) | transform | `api.ts:225-227` settled-rationale string + `agent.ts neutralRationale` | role-match |
| `.github/workflows/ci.yml` (NEW) | config (CI) | batch | none in-repo (scripts `solver:test` / `test`) | **no analog** |
| `web/src/solver.ts` (EXTEND) | client (fetch) | request-response / SSE | itself — `call<T>()` + endpoint fns | exact (same file) |
| `web/src/views/PrivacyView.tsx` (EXTEND) | component (view) | request-response | `web/src/ledger/v2react.tsx` `fetchAcs` (L75-85) + `desks.ts httpBaseUrlFor` | role+flow match |
| `web/src/views/AgentView.tsx` (EXTEND) | component (view) | request-response | existing solver-plane controls in view + `AgentRationale.tsx` | role-match |
| `web/src/views/SettlementView.tsx` (EXTEND) | component (view) | request-response / download | existing CTA + solver-plane calls in view | role-match |
| `web/src/components/OrderTicket.tsx` (EXTEND) | component (form) | request-response | itself (prefill target; one-per-round lock) | exact (same file) |
| `web/src/components/AgentRationale.tsx` (EXTEND) | component (typewriter) | streaming | itself — `useEffect` typewriter (L32-56) | exact (same file) |
| `web/src/components/PeekConsole.tsx` (NEW) | component | request-response | `AgentRationale.tsx` ink panel + `v2react.tsx fetchAcs` | role-match |
| `web/src/components/BreakTheAiPanel.tsx` (NEW) | component | request-response | `AgentRationale.tsx` ink panel + red-square grammar | role-match |
| `web/src/components/RoundBrief.tsx` (NEW) | component | download | `AgentRationale.tsx` ink panel | role-match |
| `web/src/components/ProofPackButton.tsx` (NEW) | component (button) | download | existing ink-bordered ghost CTA in `SettlementView.tsx` | role-match |
| `solver/src/{proof,proofpack}.test.ts` (NEW) + extend `agent/ledger/api.test.ts` | test | — | `solver/src/api.test.ts` (stubbed-deps + secret-sweep) | exact (same pattern) |

## Pattern Assignments

### `solver/src/api.ts` (route, request-response + SSE) — EXTEND

**Analog:** the shipped routes in the same file. Every new endpoint registers inside `createApp(deps)` and reads only injected `deps`. New capabilities are added to the `AppDeps` interface (lines 65-88) and wired in `index.ts buildDeps`.

**Route + zod + secret-safe throw pattern to copy** (`api.ts:145-167`, `wrap` at L120-124, `ApiError` at L93-102):
```typescript
app.post('/round', wrap(async (req, res) => {
  const parsed = openRoundBody.safeParse(req.body ?? {})   // zod .strict() schema (L107-113)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${issue?.path.join('.')} — ${issue?.message}`)
  }
  const { roundId, desks, windowSeconds } = parsed.data
  // ... call deps.*, res.status(201).json({...})
}))
```
New endpoints slot in identically: `POST /parse-order` (zod `{text}` body → `deps.parseOrder`), `POST /round/:id/tamper-clear` (zod `{mode}` body → `deps.tamperClear`), `GET /round/:id/proof` (→ `deps.readProofBundle`), post-round brief.

**Secret-safe error envelope to reuse verbatim** (`api.ts:310-317`) — `{ error: { code, message } }`, generic 500 for non-`ApiError`. Extend the secret-sweep test to every new endpoint (never echo the operator token / `ANTHROPIC_API_KEY`).

**SSE endpoint** (WOW-04) — NOT `res.json`; set `Content-Type: text/event-stream`, `res.write('data: ...\n\n')`, end with `event: done`. Do NOT wrap in `wrap()` (it's a streaming response, not a promise-returning JSON handler). `onError` emits ONLY a fixed deterministic fallback frame — never `err.message` / the prompt (RESEARCH Pitfall 5, Pattern 2).

**AppDeps additions** (extend interface L65-88): `parseOrder`, `streamRationale`, `tamperClear`, `writeProofBundle`, `readProofBundle`, `composeBrief`. Wire each once at boot in `index.ts buildDeps` (mirrors `proposeClearing`, `index.ts:59/91/117-120/198`).

---

### `solver/src/agent.ts` (service, structured-output + streaming) — EXTEND

**Analog:** `createAgent`/`proposeClearing` in the same file.

**WOW-03 `parseOrder`** mirrors `proposeClearing` (L181-192) EXACTLY: `client.messages.parse` + `jsonSchemaOutputFormat` (import already present, L29) + zod `safeParse` on `message.parsed_output`. **Pitfall 1 (load-bearing):** use `jsonSchemaOutputFormat` from `@anthropic-ai/sdk/helpers/json-schema` with a hand-authored JSON-Schema literal — NOT `zodOutputFormat` (hard-imports `zod/v4`, absent under pinned `zod@3.23.8`). See the deviation note at `agent.ts:20-26`.

```typescript
// hand-authored JSON schema literal (mirror proposalJsonSchema L51-72)
const orderJsonSchema = { type:'object', properties:{
  side:{type:'string',enum:['Buy','Sell']}, qty:{type:'integer'}, limit:{type:'number'} },
  required:['side','qty','limit'], additionalProperties:false } as const
const orderSchema = z.object({ side:z.enum(['Buy','Sell']), qty:z.number().int().positive(), limit:z.number().positive() })
// if (!client) return null   ← keyless short-circuit, same as L173
// const msg = await client.messages.parse({ model:'claude-haiku-4-5', temperature:0, ... output_config:{ format: jsonSchemaOutputFormat(orderJsonSchema) }})
// return orderSchema.safeParse(msg.parsed_output).success ? parsed.data : null
```

**Module-private key** (L136-137) — reuse as-is; `parseOrder`/`streamRationale` must keep the key module-private, never a param, never returned.

**WOW-04 `streamRationale`** — `client.messages.stream({...SYSTEM_PROMPT...}).on('text', onDelta)` then `await stream.finalMessage(); onDone()`. Wrap in the same `try/catch` shape as L210-219 (log ONLY `err.name`, call `onError` with the deterministic fallback).

**TRUST-02 timeout gap** (Pitfall 2) — `proposeClearing` currently has NO deadline. Wrap the `messages.parse` call (L181) in `Promise.race([call, timeout(ms)])`; treat timeout as `fallback()` (L163-170). The existing keyless/malformed/disagreement/SDK-error fallbacks (L173/192/199/210) already ARE the TRUST-02 ladder — formalize + add the timeout branch + a test.

---

### `solver/src/ledger.ts` (service, event-driven) — EXTEND

**Analog:** `settle()` (L298-364) and the private `exerciseChoice` helper (L124-131).

**WOW-02 `tamperClear(roundId, mode)`** copies `settle`'s exact contract-gathering (L302-343) then perturbs ONLY the numeric values before `exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear', {...})` (L349-355):
```typescript
const badPrice  = mode === 'wrong-price' ? clearingPrice - 1 : clearingPrice
const badAllocs = mode === 'overfill'
  ? allocations.map(a => a.side === 'Buy' ? { ...a, filledQty: a.filledQty + 2 } : a)
  : allocations
try {
  await exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear',
    { clearingPrice: badPrice, allocations: badAllocs, orderCids, buyerUsdcCid, sellerBondCids })
  return { rejected: true, error: 'UNEXPECTED: ledger accepted a tampered clear' }
} catch (e) { return { rejected: true, error: e instanceof Error ? e.message : 'rejected' } }
```
**Pitfall 3 (wire encoding):** Daml Int/Decimal accept JSON NUMBERS on input, return STRINGS on output (L18-22). Perturb VALUES not types — `badPrice` must stay a valid Decimal so the §8 assert fires, not the decoder.

**Verbatim on-ledger rejection strings** surfaced through `submitAndWait` throw (`ledger.ts:111-114`: `throw new Error(\`submit HTTP ${res.status}: ${body.slice(0,400)}\`)`), asserted in `daml/Umbra/Auction.daml`:
- `clearingPrice does not match recomputed §8 p*` (Auction.daml:183) ← **wrong-price mode**
- `allocations do not match recomputed §8` (Auction.daml:187) ← **overfill / allocation mismatch**
- `fills not conserved (Σbuy /= Σsell)` (Auction.daml:192) ← **overfill / conservation**

**Safety:** `Round.Clear` is atomic (Auction.daml:194-198); a failed `assertMsg` rolls back — nothing changes on-ledger. `tamperClear` is off the `/settle` path entirely (leave `settle()` byte-unchanged — CONTEXT hard constraint).

---

### `solver/src/proof.ts` (utility, file-I/O + transform) — NEW

**Analog:** `ledger.ts` `readFileSync(new URL('../../scripts/.operator-token', import.meta.url), 'utf8')` (L46) for filesystem reads; `node:crypto` for hashing.

**TRUST-03 bundle** — write at settle time from the LIVE views (NOT reconstructed post-retire; `Round.Clear` retires the sealed Orders — Anti-Pattern):
```typescript
import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const bundle = { roundId, timestamp: new Date().toISOString(), modelId:'claude-haiku-4-5',
  systemPromptHash: sha(SYSTEM_PROMPT), batchHash: sha(buildBatchMessage(views)),
  rawAiProposal, deterministicRecompute:{ clearingPrice, allocations }, verified,
  clearingHash: sha(JSON.stringify({ clearingPrice, allocations })) }
```
**Pitfall 6 (secret hygiene):** store `systemPromptHash` (sha256 of `SYSTEM_PROMPT`, exported from `agent.ts:77`), NEVER the raw prompt or key. `rawAiProposal` is numbers only. Create `solver/proofs/` with `mkdirSync(recursive)` at boot; add `solver/proofs/` to `.gitignore` (**NOT currently ignored — verified: `grep proofs .gitignore` = no entry**).

---

### `solver/src/proofpack.ts` (utility, render + spawn) — NEW

**Analog:** `docs/umbra-deck.html` — copy its `:root` brand tokens and Google-Fonts link verbatim. No committed generator script exists (the deck PDF was added pre-rendered) — this file CREATES it.

**Brand tokens to copy** (`docs/umbra-deck.html:8-16`):
```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
:root{ --paper:#F4F1EA; --ink:#0A0A0A; --lime:#D6FB3C; --red:#E2231A;
       --display:'Space Grotesk',system-ui,sans-serif; }
@page{ size:1280px 720px; margin:0; }
html,body{ margin:0; padding:0; background:var(--paper); }
```
Add `-webkit-print-color-adjust:exact` so the ink/lime surfaces print. HTML carries all four bundles: (1) clearing proof (lime `100.00` hero, §4 fills A=10/B=8/C=2), (2) per-desk best-ex receipts, (3) finality record (one atomic tx, DvP legs A↔B 8@100 · A↔C 2@100), (4) AI decision bundle (modelId, verified, brief).

**Headless Chrome spawn** — `node:child_process` `execFile` (mirror `ledger.ts` `submitAndWait` throw-on-failure discipline for errors):
```typescript
execFile('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new','--disable-gpu','--no-pdf-header-footer',`--print-to-pdf=${out}`,`file://${htmlPath}`])
// Edge fallback: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' (same flags)
```
Both Chrome and Edge are installed (verified). Fallback: return the on-brand HTML with print-CSS for `window.print()`.

---

### `solver/src/brief.ts` (utility, transform) — NEW or inline in api.ts

**Analog:** the settled-rationale string builder `api.ts:225-227` and `agent.ts neutralRationale` (L114-117). Compose the NL summary (clearingPrice, matchedVolume, aggregate per-desk outcomes, rationale) at settle. Server-side; embedded into the WOW-05 proof-pack.

---

### `web/src/solver.ts` (client) — EXTEND + PORT FIX

**Analog:** the `call<T>()` wrapper (L91-109) + the five endpoint fns (L112-129).

New typed methods copy the `call<T>` shape: `parseOrder(text)` → POST `/parse-order`, `tamperClear(id, mode)` → POST `/round/:id/tamper-clear`, `getProof(id)` → GET `/round/:id/proof`, `proofPackUrl(id)`, `openRationaleStream(id)` (use browser `EventSource(\`${SOLVER_BASE_URL}/round/${id}/rationale-stream\`)` — no auth header needed, operator plane; Pitfall 5).

**PORT DRIFT FIX (load-bearing — RESEARCH Runtime State Inventory):** the solver is on **:4100** (`web/.env` `VITE_SOLVER_URL=http://localhost:4100`) but this file hard-codes `:4000` at:
- L16 fallback `'http://localhost:4000'`
- L101 caption `'SOLVER OFFLINE — START THE SERVICE ON :4000'`

Fix by READING the configured port (derive from `SOLVER_BASE_URL`), never adding a second `:4100` literal (UI-SPEC note 2 / Anti-Pattern). Also fix `AgentView.tsx:39` and `SettlementView.tsx:154` captions, and `solver/src/index.ts:26` `DEFAULT_SOLVER_PORT = 4000`. Add a grep/lint check that no `:4000` literal remains in `web/src`.

---

### `web/src/views/PrivacyView.tsx` (component) — EXTEND (mount `<PeekConsole/>`)

**Analog:** `web/src/ledger/v2react.tsx` `fetchAcs` (L75-85) for the raw ACS query + `web/src/desks.ts` `httpBaseUrlFor(key)` (L45) for the per-desk base + `tokens` (desks.ts:10) for the desk's OWN bearer.

**WOW-01 raw peek** — runs as the CURRENTLY-SELECTED desk's token, filtered to a RIVAL party:
```typescript
const base = httpBaseUrlFor(activeDesk)          // desks.ts:45 — this desk's node
const token = tokens[activeDesk].token           // this desk's OWN bearer
const rivalParty = tokens[rivalKey].party
// end = GET `${base}v2/state/ledger-end`; then POST `${base}v2/state/active-contracts`
//   body: { filter:{ filtersByParty:{ [rivalParty]:{} } }, verbose:true, activeAtOffset: end.offset }
// rows === []  → verdict "0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE"
```
**Pitfall 4:** reuse `httpBaseUrlFor(activeDesk)` so the query hits the desk's OWN node (`/cn/app-user`→:2975, `/cn/sv`→:4975, `''`→:3975, desks.ts:31-45). Client-filter to `Umbra.Auction:Order` / `TradeConfirmation` for display. Render the raw request/response verbatim on the ink evidence surface — no styled badge (UI-SPEC note 3). Elide the token (never render a full bearer).

---

### `web/src/components/AgentRationale.tsx` (component, streaming) — EXTEND

**Analog:** itself — the `useEffect` typewriter (L32-56), `CHAR_MS=26` (L16), `prefersReducedMotion()` (L19-25, Pitfall 7), interval cleared on unmount (L55).

**WOW-04:** accept an SSE token source that appends live into the SAME ink panel (L68-92, `background:#0A0A0A / color:#F4F1EA / padding:22px 24px / whiteSpace:pre-wrap`) with the flame caret (L81-91, `#FF6A1A`, `animate-umbra-caret`). Keep the single-shot 26ms/char typewriter as the graceful fallback (identical appearance). Reduced-motion → append per chunk without the interval. No new keyframes (Motion Contract).

---

### `web/src/components/{PeekConsole,BreakTheAiPanel,RoundBrief}.tsx` + `ProofPackButton.tsx` (NEW)

**Analog:** `AgentRationale.tsx` ink-panel treatment (L68-92) is the reusable "evidence surface" pattern for PeekConsole wire panes and BreakTheAiPanel verbatim rejection. Red-square verdict row grammar (6×6px `#E2231A` square + IBM Plex Mono 9px `.16em` uppercase `#E2231A`) from comp line 131. Reuse `prefersReducedMotion()` (AgentRationale.tsx:19). ProofPackButton = ink-bordered ghost CTA (matches shipped `SettlementView` SEAL/VIEW grammar). No new tokens/keyframes (UI-SPEC).

---

### Test files — EXTEND + NEW

**Analog:** `solver/src/api.test.ts` — the canonical stubbed-deps + secret-sweep pattern.

Copy verbatim:
- `makeDeps(overrides)` (L72+) — REAL §8 helpers (`auction.ts`) + `vi.fn` ledger stubs.
- `SECTION4_VIEWS` fixture (L37-41) → clears 100.00, matchedVolume 10.
- Sentinel-secret sweep: `SENTINEL_TOKEN` (L50) + `SENTINEL_API_KEY` (L54) closed over by stubs; assert NO response body ever contains them. Extend this sweep to `/parse-order`, `/rationale-stream`, `/round/:id/proof`, and the proof file (Pitfall 6).
- Ephemeral server via `app.listen(0)` + Node `fetch`.

New/extended per the Test Map:
- `proof.test.ts` — bundle has all fields; NO key/token present.
- `proofpack.test.ts` — rendered HTML carries the 4 bundles + brand tokens (Chrome-spawn mocked).
- extend `agent.test.ts` — TRUST-02 timeout case + degradation-ladder table (keyless/malformed/disagreement/SDK-error/timeout all → $100.00).
- extend `ledger.test.ts` — WOW-02 tamper `wrong-price` + `overfill` verbatim-error assertions (stub `submitAndWait` returning the assertMsg body).

---

### `.github/workflows/ci.yml` (NEW) — NO in-repo analog

No `.github/` exists. Two jobs recommended (RESEARCH Open Q1):
- `golden` (always): `cd solver && npm ci && npm test` (root script `solver:test` → `cd solver && npm test` → `vitest run`) — the TRUST-01 regression gate.
- `daml` (push to main / label-gated): install Daml 3.4 SDK via `get.daml.com`, `daml build && daml test` (root script `test` → `cd daml && daml test`) — protects the on-ledger recompute.
Triggers on push/PR touching `solver/` or `daml/`.

## Shared Patterns

### DI factory + injected deps
**Source:** `api.ts createApp(deps)` (L138), `agent.ts createAgent(deps)` (L154), `index.ts buildDeps` (L70-98).
**Apply to:** every new solver capability (`parseOrder`, `streamRationale`, `tamperClear`, `writeProofBundle`, `readProofBundle`, `composeBrief`). Add to `AppDeps` (api.ts:65-88), construct once at boot in `index.ts`. The test injects stubs — no live sandbox.

### Secret-safe error envelope
**Source:** `api.ts:310-317` (`{ error: { code, message } }`, generic 500 for unknown) + `ApiError` (L93-102).
**Apply to:** all new endpoints. Author every `ApiError` message secret-free (no token/key/header interpolation). SSE `onError` emits only a fixed fallback frame.

### Module-private credential
**Source:** `agent.ts:136-137` (`ANTHROPIC_API_KEY`), `ledger.ts:44-62` (operator token, read from `scripts/.operator-token`, never exported).
**Apply to:** `parseOrder`/`streamRationale` keep the key server-only; proof bundle stores `systemPromptHash` not the prompt.

### v2 ACS wire query
**Source:** `ledger.ts queryByEntity` (L136-152, operator-side) · `web/src/ledger/v2react.tsx fetchAcs` (L75-85, per-desk). Both: GET `/v2/state/ledger-end` → POST `/v2/state/active-contracts` with `{ filter:{ filtersByParty:{ [party]:{} } }, verbose:true, activeAtOffset }`, then map `contractEntry.JsActiveContract.createdEvent`.
**Apply to:** WOW-01 PeekConsole (per-desk, rival-party filter).

### `messages.parse` structured output (Pitfall 1 locked)
**Source:** `agent.ts:181-192` — `client.messages.parse` + `jsonSchemaOutputFormat(literal)` + `zod.safeParse(parsed_output)`. NEVER `zodOutputFormat` (zod v3 pin).
**Apply to:** WOW-03 `parseOrder`.

### Reduced-motion guard + ink evidence surface
**Source:** `AgentRationale.tsx` `prefersReducedMotion()` (L19-25) + ink panel (L68-92) + comp-line-131 red-square verdict grammar.
**Apply to:** PeekConsole, BreakTheAiPanel, RoundBrief, live rationale. No new tokens/keyframes.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.github/workflows/ci.yml` | config (CI) | batch | No `.github/` dir exists; use npm scripts `solver:test` + `test`. |
| `solver/src/proofpack.ts` HTML→PDF spawn | utility | transform + spawn | No committed generator script (deck PDF was pre-rendered). Template = `docs/umbra-deck.html` `:root`; invocation is documented, not existing code. |

## Metadata

**Analog search scope:** `solver/src/` (api, agent, ledger, index, auction, api.test), `web/src/` (solver, desks, ledger/v2react, components/AgentRationale), `daml/Umbra/Auction.daml` (Clear choice), `docs/umbra-deck.html`, root + solver `package.json`, `.gitignore`.
**Files scanned:** ~14 read in full/targeted; 2 grep probes (deck tokens, npm scripts).
**Pattern extraction date:** 2026-07-09

## PATTERN MAPPING COMPLETE

**Phase:** 08 - demo-hardening
**Files classified:** 17
**Analogs found:** 15 / 17

### Coverage
- Files with exact (same-file) analog: 7
- Files with role/flow-match analog: 8
- Files with no analog: 2 (CI workflow, proof-pack HTML→PDF generator)

### Key Patterns Identified
- All solver capabilities register on the `createApp(deps)` DI factory + `AppDeps` interface, wired once in `index.ts buildDeps`; tests inject stubs (api.ts:138 / index.ts:70).
- Verify-don't-trust is the backstop for WOW-02: `tamperClear` perturbs only numeric values and the on-ledger `Round.Clear` `assertMsg` (Auction.daml:183/187/192) rejects it verbatim through `submitAndWait` (ledger.ts:111-114).
- Structured-output + streaming reuse the agent's proven `messages.parse`/`messages.stream` with `jsonSchemaOutputFormat` (NOT `zodOutputFormat` — zod v3 pin, agent.ts:20-26); the deterministic §8 fallback (agent.ts:163-219) is the TRUST-02 ladder (add a timeout).
- Secret hygiene is uniform: module-private key/token, secret-safe `{error:{code,message}}` envelope, sentinel-sweep tests; proof bundle stores `systemPromptHash` not the prompt.
- **Port drift is the top execution hazard:** stale `:4000` literals (solver.ts:16/101, AgentView:39, SettlementView:154, index.ts:26) must be fixed to READ the configured :4100, not add a new literal.

### File Created
`.planning/phases/08-demo-hardening/08-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can reference analog files + line ranges directly in PLAN.md action sections.
