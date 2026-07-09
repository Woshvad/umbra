# Phase 8: Demo Hardening - Research

**Researched:** 2026-07-09
**Domain:** Additive demo surfaces over an already-shipped stack (Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 · Node/TS solver :4100 · React/Vite web :5173). Near-zero new infrastructure — expose existing capabilities.
**Confidence:** HIGH (grounded in the real files under `solver/`, `web/`, `daml/`, `docs/`; every seam read directly, not inferred from CLAUDE.md)

## Summary

Phase 8 adds **no new Daml templates and no new ledger authority**. Every "wow" is a thin new endpoint on the existing `createApp(deps)` DI factory (`solver/src/api.ts`) plus a new panel composed into an already-shipped React view. The three superpowers already exist and are proven: structural per-party privacy at the JSON Ledger API v2 wire (`web/src/ledger/v2react.tsx` + per-desk tokens in `web/src/tokens.json`), the verify-don't-trust AI agent with a deterministic §8 fallback on every failure path (`solver/src/agent.ts`), and the atomic recompute-and-assert `Round.Clear` backstop (`daml/Umbra/Auction.daml` lines 154-243). Phase 8 makes each of these *visible and interactive*.

The single largest risk is **not** technical difficulty — it is **stale port literals**. The live solver runs on **:4100** (`solver/.env` `SOLVER_PORT=4100`; `web/.env` `VITE_SOLVER_URL=http://localhost:4100`), but three shipped UI files hard-code `:4000` in captions and one hard-codes it as the fetch fallback. These must be corrected to read the configured port, or the WOW-01 request URL and offline captions will lie on screen.

**Primary recommendation:** Build each WOW as (a) one new function in `ledger.ts`/`agent.ts`, (b) one new route in `createApp(deps)`, (c) one new typed function in `web/src/solver.ts`, (d) one new component composed into the host view per `08-UI-SPEC.md`. Reuse `messages.parse` (structured output, already in `agent.ts`) for WOW-03 and `messages.stream` (`.on('text', …)`) proxied as SSE for WOW-04 — both verified present in `@anthropic-ai/sdk@0.106.0`. Fix the `:4000`→`:4100` drift as a first task. Chrome AND Edge headless are both installed on this box, so WOW-05's HTML→PDF is viable — but note **no committed generator script exists** (the deck PDF was added pre-rendered), so a plan must *create* the print script from the known-good invocation documented below.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**WOW-01 Try-to-Peek Adversarial Privacy Console**
- Lives as a control ON the Privacy money-shot view (`web/src/views/PrivacyView.tsx`), beside the three blindness panels.
- Runs as the CURRENTLY-SELECTED desk's own JSON-API token (from `web/src/tokens.json` / per-party `ledger/` context): a raw JSON Ledger API v2 `POST /v2/state/active-contracts` filtered to a RIVAL desk party for the `Umbra.Auction:Order` template.
- Displays the actual HTTP request (URL, party filter, `Authorization: Bearer <this desk>`) and the raw response side by side — an empty `[]`/403 — with a verdict line.
- Offers a second target (a rival's `TradeConfirmation`) to prove privacy is structural (signatory/observer disclosure), not Order-specific. All requests go through the same per-party proxy the app already uses; no operator token in the browser.

**WOW-02 Break-the-AI**
- Injection is a solver demo path: a flag on the settle/clear call (query flag on `POST /round/:id/settle` with a `tamper` mode, or a dedicated `POST /round/:id/tamper-clear`) that submits a deliberately-WRONG allocation to the on-ledger `Round.Clear`, whose recompute-§8-and-assert backstop rejects the transaction. The real deterministic settle path is byte-unchanged.
- One operator-view control ("Break the AI") runs the sequence: attempt tampered clear → surface the verbatim on-ledger rejection error → run the correct clear → it settles at $100.00. Rendered in the Theatre/Agent operator plane.
- Safety: the tamper path only ever ATTEMPTS the exercise; because `Round.Clear` is atomic, a rejection changes nothing on-ledger. Clearly demo-labeled, never on the normal settle path.
- Tamper modes: wrong clearing price (primary) plus one conservation-violating over-fill variant (a different on-ledger rejection reason).

**WOW-03 / WOW-04 AI Interaction**
- NL parsing runs SERVER-SIDE in the solver (the Anthropic key is server-only, never in the browser): a new `POST /parse-order` endpoint takes plain English and returns a validated structured order `{side, qty, limit}` via Claude structured output, zod-validated before it reaches the UI.
- Confirmation is mandatory: Claude proposes; the desk reviews/edits; then submits through the EXISTING one-order-per-round `Venue.SubmitOrder`. Never auto-submit.
- Rationale "streams" via real Anthropic SDK streaming proxied as Server-Sent Events from the solver; the UI types it out live (reuses the existing `AgentRationale` typewriter as the render target). Graceful fallback: if streaming unavailable, fall back to the current single-shot rationale.
- Post-round brief: a shareable natural-language summary generated at settle, copyable/downloadable and embedded into the WOW-05 proof-pack.

**TRUST-01 / TRUST-02 / TRUST-03 + WOW-05**
- Golden-eval CI: a vitest "golden" suite asserting the §8 fixtures (canonical §4 → $100.00 with A=10/B=8/C=2, plus the ≥5 existing scenarios) AND the verify-don't-trust equality gate, wired into a NEW GitHub Actions workflow (`.github/workflows/`) running on every push/PR touching `solver/` or `daml/`.
- Graceful degradation: a test that disables the Anthropic path (no key / forced SDK error / timeout) and asserts the round still clears deterministically at $100.00. Formalize the ladder; lock it with a test + doc note.
- Decision proof bundle: per round, persist an immutable JSON artifact `{roundId, timestamp, modelId, systemPromptHash, batchHash, rawAiProposal, deterministicRecompute, verified, clearingHash}` under `solver/proofs/` and expose it via `GET /round/:id/proof`. Clearing hash derived from the settled clearing result; on-ledger anchoring noted as Phase 10.
- Proof-pack PDF: reuse the existing Chrome-headless HTML→PDF pipeline (the one that renders `docs/umbra-deck.html` → `Umbra-Pitch-Deck.pdf`). Render an on-brand HTML proof-pack (Umbra tokens `#F4F1EA`/`#0A0A0A`/`#D6FB3C`; Space Grotesk / IBM Plex Mono / Inter) with clearing proof + per-desk best-ex receipts + finality record + AI decision bundle, triggered by one click post-settle.

### Claude's Discretion
- Exact endpoint names/paths, SSE vs chunked transfer specifics, proof-bundle field ordering, and the precise HTML layout of the proof-pack — provided success criteria and brand tokens hold.
- Whether the tamper demo uses a query flag vs a dedicated endpoint — pick the cleaner seam given `api.ts` structure.

### Deferred Ideas (OUT OF SCOPE)
- On-ledger anchoring of the decision-proof clearing hash (a `RoundProof` contract) → Phase 10.
- ZK proof replacing the "trust the recompute" bundle → Phase 10 (CRYP-03).
- Aggregate indicative-price preview during the open window → Phase 9 (AUCT-03). The WOW-04 live analyst here is rationale-only, not a live price feed.
- FIX / webhooks / OTel around these endpoints → Phase 13.
- Richer order types → Phase 9. **No new Daml order-model templates in Phase 8.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WOW-01 | Judge attempts to fetch a rival's `Order` via raw JSON Ledger API v2 → empty/403 live | Reuse `fetchAcs`/`v2` pattern in `web/src/ledger/v2react.tsx` (lines 62-85); per-party tokens in `web/src/tokens.json`; template filter `#umbra:Umbra.Auction:Order`; second target `TradeConfirmation`. New `PeekConsole` in `PrivacyView.tsx`. |
| WOW-02 | Force wrong clearing price → on-ledger `Round.Clear` rejects on screen; correct clear still settles | `Round.Clear` asserts in `daml/Umbra/Auction.daml` (lines 166-192) fire on tampered price/allocation; verbatim error surfaces through `ledger.ts submitAndWait` throw (lines 111-114). New `tamperClear` in `ledger.ts` + endpoint + `BreakTheAiPanel` in `AgentView.tsx`. |
| WOW-03 | Plain-English order → Claude → validated `{side, qty, limit}` for confirmation | Reuse `messages.parse` + `jsonSchemaOutputFormat` + zod `safeParse` pattern from `agent.ts` (lines 181-192); new `POST /parse-order`; NL sub-block prefills `OrderTicket.tsx` (never auto-submits `Venue.SubmitOrder`). |
| WOW-04 | Solver streams rationale live + shareable post-round brief | `client.messages.stream(...).on('text', …)` (verified in SDK 0.106.0) proxied as SSE; new endpoint; UI reuses `AgentRationale` typewriter (`web/src/components/AgentRationale.tsx`). Brief = new NL summary at settle → `RoundBrief` in `SettlementView.tsx`. |
| WOW-05 | One click downloads on-brand proof-pack PDF | Chrome/Edge headless `--print-to-pdf` (both installed); on-brand HTML using deck tokens (`docs/umbra-deck.html` `:root` block). **New generator script required** (no committed pipeline exists). |
| TRUST-01 | §8 fixtures as CI golden-eval gate | Existing `solver/src/auction.test.ts` + `agent.test.ts` are the golden corpus; new `.github/workflows/*.yml` runs `npm test` in `solver/` + `daml test`. |
| TRUST-02 | Strict structured outputs + graceful degradation to deterministic §8 | `agent.ts` `proposeClearing` already returns the deterministic fallback on keyless/malformed/disagreement/SDK-error (lines 159-219). Gap: no explicit **timeout**. Formalize ladder + add timeout + test. |
| TRUST-03 | Immutable per-round decision proof bundle | New `solver/proofs/<roundId>.json` written at settle; `GET /round/:id/proof`. Fields from CONTEXT. Must be gitignored and must NOT contain the API key. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WOW-01 raw peek query | Browser (per-desk JSON-API v2 plane) | Canton participant (enforces privacy) | Credibility requires the browser to issue the real request with the desk's OWN token; the participant returns `[]`/403. No solver, no operator token. |
| WOW-02 tamper attempt + correct clear | Solver operator plane (:4100) | Daml `Round.Clear` (the backstop) | Only the operator can exercise `Clear`; the ledger's recompute-and-assert is the actual rejection authority. Browser only triggers + displays. |
| WOW-03 NL→structured parse | Solver (:4100, Anthropic key) | Browser (confirm + submit) | Anthropic key is server-only; browser posts English, gets `{side,qty,limit}`, then submits `Venue.SubmitOrder` on its OWN desk plane. |
| WOW-04 rationale stream | Solver (:4100, SSE proxy) | Browser (typewriter render) | Streaming source is Anthropic via the solver; browser consumes text/event-stream. |
| WOW-04 post-round brief | Solver (:4100) | Browser (copy/download) | Brief text generated server-side at settle; embedded in proof-pack. |
| WOW-05 proof-pack PDF | Solver or build script (headless Chrome) | Browser (download trigger) | HTML→PDF must run where Chrome is; browser fetches/downloads the result. |
| TRUST-01 CI gate | GitHub Actions runner | — | Off-box; runs vitest + `daml test`. |
| TRUST-02 degradation | Solver `agent.ts` | Daml backstop | Already the design; formalize + timeout. |
| TRUST-03 proof bundle | Solver (:4100, filesystem `solver/proofs/`) | — | Written server-side at settle; served read-only. |

## Standard Stack

**No new runtime dependencies are required.** Every capability is built from packages already installed and pinned. This is the single most important stack finding: Phase 8 is additive code, not new libraries.

### Core (already installed — verified in `solver/package.json` / `web/package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `0.106.0` | WOW-03 `messages.parse` (structured output) + WOW-04 `messages.stream` | Already the agent's client; both methods verified present (see Code Examples). `[VERIFIED: solver/node_modules/@anthropic-ai/sdk@0.106.0]` |
| `express` | `4.19.2` | New routes on `createApp(deps)` incl. the SSE endpoint | Already the HTTP surface (`api.ts`). SSE = `res.setHeader('Content-Type','text/event-stream')` + `res.write`. `[VERIFIED: solver/package.json]` |
| `zod` | `3.23.8` | Validate `/parse-order` output + tamper-mode body | Already the validation layer. **Pinned at v3** — see Pitfall 1. `[VERIFIED: solver/package.json]` |
| `cors` | `2.8.5` | Existing `cors({ origin: ALLOWED_ORIGIN })` covers new routes | SSE responses also need this origin. `[VERIFIED: api.ts:142]` |
| `react` / `vite` / `tailwindcss` | `18.3.1` / `5.4.21` / `3.4.19` | New panels/components | All brand tokens + keyframes already declared (see below). `[VERIFIED: web/package.json + tailwind.config.ts]` |

### Supporting (Node/browser built-ins — no install)
| Facility | Purpose | When to Use |
|----------|---------|-------------|
| `node:crypto` `createHash('sha256')` | TRUST-03 `systemPromptHash`, `batchHash`, `clearingHash` | Proof-bundle hashing. Already used elsewhere for HS256 JWT minting (STATE.md). `[VERIFIED: node builtin]` |
| `node:fs` `writeFileSync` / `readFileSync` | TRUST-03 write/read `solver/proofs/<roundId>.json` | Mirrors `ledger.ts` `readFileSync` for the operator token (line 47). `[VERIFIED: ledger.ts:24]` |
| `node:child_process` `spawn`/`execFile` | WOW-05 invoke headless Chrome/Edge `--print-to-pdf` | Server-side PDF generation. `[VERIFIED: node builtin]` |
| Browser `EventSource` **or** `fetch` + `ReadableStream` | WOW-04 consume the SSE rationale | `EventSource` is simplest for GET SSE; `fetch` streaming if a POST body is needed. `[CITED: MDN EventSource]` |
| Browser `Blob` + `URL.createObjectURL` | WOW-04 `DOWNLOAD BRIEF ↓`, WOW-05 download trigger | Standard client download. `[ASSUMED]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| System Chrome/Edge headless (WOW-05) | `puppeteer` / `playwright` npm dep | Adds a ~300MB browser download + a new dependency to slopcheck. The box already has Chrome AND Edge (verified). Reusing the deck's known-good system-Chrome approach is faithful to CONTEXT and adds zero deps. Puppeteer only if a plan wants deterministic CI PDF generation (not required for the demo). |
| Server-side Chrome PDF (WOW-05) | Browser `window.print()` on an on-brand print-CSS page | `window.print()` needs no Chrome-on-server but yields a user save-dialog (not a one-click auto-download) and depends on the user's print settings. CONTEXT says "one click downloads" and "reuse the deck's Chrome invocation" → prefer server-side headless. |
| `messages.stream` SSE (WOW-04) | Re-request `messages.parse` then type client-side (shipped behavior) | The shipped `AgentRationale` already does single-shot typewriter. SSE is the upgrade; keep single-shot as the graceful fallback (UI-SPEC reconciliation note 5). |
| Dedicated `POST /round/:id/tamper-clear` (WOW-02) | Query flag `?tamper=wrong-price` on `/settle` | A dedicated endpoint keeps the shipped `/settle` byte-unchanged (safer; the real settle path must stay untouched per CONTEXT). **Recommend the dedicated endpoint.** |

**Installation:** none. Confirm no drift with:
```bash
cd solver && npm ls @anthropic-ai/sdk zod express cors    # all already pinned
cd web && npm ls react vite tailwindcss                    # all already pinned
```

## Package Legitimacy Audit

> Phase 8 installs **no new external packages**. All dependencies are already present and pinned in `solver/package.json` / `web/package.json` (committed, reviewed in prior phases). slopcheck/registry audit is **not applicable** — there is nothing new to vet.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none — Phase 8 adds no dependencies) | — | N/A |

If a planner nonetheless proposes a new package (e.g. `puppeteer` for WOW-05), it MUST be gated behind a `checkpoint:human-verify` and run through the Package Legitimacy Gate before install. The research recommendation is to add **zero** new packages.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────── BROWSER (:5173) ───────────────────────────┐
                          │                                                                        │
  plain English  ───────► │  OrderTicket NL sub-block (WOW-03)                                      │
                          │      │ POST /parse-order (English)                                      │
                          │      ▼                                                                  │
  desk's OWN token ─────► │  PeekConsole (WOW-01) ──raw POST /v2/state/active-contracts──┐          │
                          │      (rival party filter, this desk's Bearer)                │          │
                          │  BreakTheAiPanel (WOW-02) ── POST /round/:id/tamper-clear     │          │
                          │  AgentRationale (WOW-04) ◄── SSE text/event-stream            │          │
                          │  RoundBrief / ProofPackButton (WOW-04/05) ── GET proof / pdf  │          │
                          └───────────────┬──────────────────────────────┬───────────────┼──────────┘
                                          │ solver plane (:4100)          │ per-desk plane │ (Vite proxy)
                                          ▼                               │                ▼
        ┌──────────────── SOLVER (:4100, api.ts createApp) ──────────────┐│   ┌─── Canton participant (:3975 / :2975 / :4975)
        │  /parse-order ─► agent-style messages.parse ─► zod ─► {s,q,l}  ││   │      JSON Ledger API v2
        │  /rationale-stream ─► messages.stream ─► .on('text') ─► SSE    ││   │      • active-contracts: returns ONLY the token's
        │  /tamper-clear ─► ledger.tamperClear(mode) ─► Round.Clear      │└───┼──►     stakeholder contracts (WOW-01 empty [] proof)
        │       (assertMsg rejects → verbatim error returned)            │    │      • Round.Clear: recompute §8 + assert
        │  /settle (UNCHANGED) ─► ledger.settle ─► Round.Clear (correct) │◄───┼──      (WOW-02 verbatim rejection / correct clear)
        │  /round/:id/proof ─► read solver/proofs/<id>.json (TRUST-03)   │    │
        │  writes solver/proofs/<id>.json at settle (TRUST-03)           │    └───────────────────────────────
        │  ANTHROPIC_API_KEY: module-private, server-only                │
        └───────────────────────────┬───────────────────────────────────┘
                                     │ child_process spawn (WOW-05)
                                     ▼
                    headless Chrome/Edge --print-to-pdf  (on-brand proof.html → proof-pack.pdf)
```

### Recommended Project Structure (additions only)
```
solver/src/
├── api.ts            # EXTEND: add /parse-order, /rationale-stream, /tamper-clear, /round/:id/proof
├── agent.ts          # EXTEND: add parseOrder() + streamRationale() + add a timeout to proposeClearing (TRUST-02)
├── ledger.ts         # EXTEND: add tamperClear(roundId, mode) submitting a wrong clearingPrice/allocation
├── proof.ts          # NEW: writeProofBundle() + readProofBundle() (TRUST-03), node:crypto hashing
├── proofpack.ts      # NEW: render on-brand HTML + spawn headless Chrome --print-to-pdf (WOW-05)
├── brief.ts          # NEW (or inline in api): compose the post-round NL brief (WOW-04)
└── *.test.ts         # EXTEND: golden subset + degradation ladder (TRUST-01/02)
solver/proofs/        # NEW dir (gitignore) — one JSON per round (TRUST-03)
web/src/
├── solver.ts         # EXTEND: parseOrder(), openRationaleStream(), tamperClear(), getProof(), proofPackUrl()
│                     #         + FIX the :4000 fallback + OFFLINE caption to read the configured port
├── views/PrivacyView.tsx     # EXTEND: mount <PeekConsole/> below the closing paragraph
├── views/AgentView.tsx       # EXTEND: mount <BreakTheAiPanel/> + FIX ":4000" caption
├── views/SettlementView.tsx  # EXTEND: <RoundBrief/> + <ProofPackButton/> post-settle + FIX ":4000" caption
├── components/OrderTicket.tsx # EXTEND: NL sub-block at the top (prefills, never auto-submits)
├── components/AgentRationale.tsx # EXTEND: accept an SSE token source; keep single-shot fallback
├── components/PeekConsole.tsx    # NEW
├── components/BreakTheAiPanel.tsx# NEW
├── components/RoundBrief.tsx     # NEW
└── components/ProofPackButton.tsx# NEW
.github/workflows/
└── ci.yml            # NEW: golden-eval + daml test (TRUST-01)
```

### Pattern 1: Additive endpoint on the DI factory
**What:** Every new route registers inside `createApp(deps)` and reads only injected `deps`. New ledger/agent capabilities are added to the `AppDeps` interface and wired through `buildDeps` in `index.ts`.
**When to use:** WOW-02 tamper, WOW-03 parse, WOW-04 stream, TRUST-03 proof.
**Example:**
```typescript
// solver/src/api.ts — inside createApp(deps), same style as the shipped routes
// Source: solver/src/api.ts:145-303 (existing routes)
app.post('/parse-order', wrap(async (req, res) => {
  const { text } = z.object({ text: z.string().min(1).max(280) }).strict().parse(req.body ?? {})
  const order = await deps.parseOrder(text)        // agent.ts, server-side, key never leaves
  if (!order) throw new ApiError(422, 'PARSE_FAILED', "couldn't parse that order")
  res.json(order)                                   // { side, qty, limit } — zod-validated
}))
```
`deps.parseOrder` is added to `AppDeps` and constructed once at boot in `index.ts` (mirrors how `proposeClearing` is wired, `index.ts:117-120`).

### Pattern 2: SSE proxy of Anthropic streaming (WOW-04)
**What:** The solver opens `client.messages.stream(...)`, forwards each `text` delta as an SSE `data:` frame, ends with a sentinel, and on any error falls back to a single-shot deterministic rationale frame.
**When to use:** WOW-04 live rationale.
**Example:**
```typescript
// Source: SDK method verified at solver/node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:74
//         (.on('text', (delta, snapshot) => …)) and lib/MessageStream.d.ts:9
app.get('/round/:id/rationale-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  deps.streamRationale(req.params.id, {
    onDelta: (t) => res.write(`data: ${JSON.stringify(t)}\n\n`),
    onDone:  ()  => { res.write('event: done\ndata: {}\n\n'); res.end() },
    onError: ()  => { /* fall back: emit the deterministic single-shot rationale as one frame */ },
  })
})
```
**Fallback path:** if there is no key / the stream errors, the browser's `AgentRationale` keeps the shipped single-shot 26ms/char typewriter (UI-SPEC note 5) — the demo never stalls.

### Pattern 3: Tamper-then-correct on-ledger rejection (WOW-02)
**What:** A new `ledger.tamperClear(roundId, mode)` gathers the SAME contract ids as the real `settle` but submits a **wrong** `clearingPrice` (mode `wrong-price`) or a **wrong** `allocations` (mode `overfill`) to `Round.Clear`. The on-ledger `assertMsg` fails; `submitAndWait` throws with the verbatim error body; the endpoint returns it (secret-free). The browser then calls the UNCHANGED `/settle` for the correct $100.00 clear.
**Verbatim on-ledger rejection strings** (from `daml/Umbra/Auction.daml`, surfaced through `ledger.ts:111-114`):
- `clearingPrice does not match recomputed §8 p*` (line 183) ← **wrong-price mode**
- `allocations do not match recomputed §8` (line 187) ← **overfill mode (allocation mismatch)**
- `fills not conserved (Σbuy /= Σsell)` (line 192) ← **overfill mode (conservation)**

**Example:**
```typescript
// solver/src/ledger.ts — NEW, mirrors settle() (lines 298-364) but perturbs the proposal
export const tamperClear = async (roundId: string, mode: 'wrong-price'|'overfill'):
  Promise<{ rejected: true; error: string }> => {
  const sealed = await readSealedOrders(roundId)
  const views = sealed.map(o => o.view)
  const { clearingPrice, allocations } = computeClearing(views)   // the CORRECT §8 result
  // gather orderCids / buyerUsdcCid / sellerBondCids exactly as settle() does …
  const badPrice = mode === 'wrong-price' ? clearingPrice - 1 : clearingPrice
  const badAllocs = mode === 'overfill'
    ? allocations.map(a => a.side === 'Buy' ? { ...a, filledQty: a.filledQty + 2 } : a)
    : allocations
  try {
    await exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear',
      { clearingPrice: badPrice, allocations: badAllocs, orderCids, buyerUsdcCid, sellerBondCids })
    return { rejected: true, error: 'UNEXPECTED: ledger accepted a tampered clear' } // should never happen
  } catch (e) {
    // submitAndWait throws `submit HTTP <status>: <body>` — the body carries the assertMsg verbatim.
    return { rejected: true, error: e instanceof Error ? e.message : 'rejected' }
  }
}
```
**Safety proof:** `Round.Clear` is atomic; a failed assert rolls back the whole transaction — nothing on-ledger changes (Auction.daml lines 196-198). The tamper endpoint is off the `/settle` path entirely.

### Pattern 4: Structured NL parse (WOW-03) reuses the agent's proven shape
**What:** `deps.parseOrder(text)` calls `client.messages.parse` with a JSON-Schema literal `{ side: enum[Buy,Sell], qty: integer, limit: number }`, then re-validates with a zod schema before returning. Identical shape to `agent.ts` `proposeClearing` (lines 181-192), including the `jsonSchemaOutputFormat` helper — NOT `zodOutputFormat` (Pitfall 1).
**When to use:** WOW-03.

### Anti-Patterns to Avoid
- **Putting the Anthropic key anywhere near the browser.** WOW-03/04 must call the SOLVER; the browser never talks to `api.anthropic.com`. (`agent.ts` holds the key module-private, `solver.ts` has no key literal — keep it that way.)
- **Touching `/settle` for WOW-02.** Add a dedicated `/tamper-clear`; leave the byte-unchanged correct settle path alone (CONTEXT hard constraint).
- **Recomputing §8 on the empty book after settle.** `Round.Clear` retires the sealed Orders; the GET terminal branch already reconstructs from `TradeConfirmation` (api.ts:203-228). The proof bundle must be written at settle time (from the live views), not reconstructed later.
- **Auto-submitting the parsed order.** WOW-03 prefills the ticket; the shipped `SEAL ORDER` stays the single confirmation (preserves the one-order-per-round lock in `OrderTicket.tsx:58`).
- **Hard-coding a second port literal.** Fix `:4000`→configured port by READING the config (`SOLVER_BASE_URL`), never by writing a new literal (UI-SPEC note 2).
- **Rendering a styled success/fail badge instead of the raw wire.** WOW-01 empty `[]`/403 and WOW-02 verbatim error ARE the evidence (UI-SPEC note 3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured JSON from Claude (WOW-03) | A regex/prompt-and-`JSON.parse` NL parser | `client.messages.parse` + `jsonSchemaOutputFormat` + zod `safeParse` — copy `agent.ts:181-192` | GA structured outputs guarantee schema-valid JSON; the shipped agent already proves the exact pattern under the pinned zod v3. |
| Token streaming (WOW-04) | Manual `fetch` + SSE parsing of the raw Anthropic stream | `client.messages.stream(...).on('text', …)` | The SDK's `MessageStream` handles event framing, snapshots, and `finalMessage()`. Verified present in 0.106.0. |
| On-ledger verification of the tampered clear (WOW-02) | A JS check that "the price is wrong" | The existing `Round.Clear` `assertMsg` backstop | The whole point is that the LEDGER rejects it — the recompute-and-assert already exists (Auction.daml 169-192). Don't reimplement it off-ledger. |
| Privacy enforcement (WOW-01) | A render-time filter hiding rival rows | The participant's per-token `active-contracts` response | Privacy is structural at the wire — the participant returns `[]`. A render filter would be a lie (and defeats the demo's credibility). |
| HTML→PDF (WOW-05) | A hand-rolled PDF byte writer / a PDF npm lib | System headless Chrome/Edge `--print-to-pdf` | Chrome renders the exact on-brand HTML (fonts, tokens, `@page`) pixel-faithfully; the deck already uses this approach. |
| Hashing for the proof bundle (TRUST-03) | A custom hash | `node:crypto` `createHash('sha256')` | Standard, dependency-free, deterministic. |

**Key insight:** Everything Phase 8 "builds" is a thin adapter over a capability that already exists and is already tested. The failure mode here is *re-implementing* a proven seam (the agent's structured-output call, the ledger's assert backstop, the per-party ACS query) rather than *calling* it.

## Runtime State Inventory

> This is not a rename/refactor phase, but it introduces new persisted state and has one shipped-config drift. Included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **NEW:** `solver/proofs/<roundId>.json` decision-proof bundles (TRUST-03). None exist yet. | Create dir at boot (`mkdirSync(recursive)`); add `solver/proofs/` to `.gitignore` (it is NOT currently ignored — verified against root `.gitignore`). Ensure the bundle NEVER contains `ANTHROPIC_API_KEY` (store `systemPromptHash`, not the raw prompt+key). |
| Live service config | Solver bind port lives in `solver/.env` (`SOLVER_PORT=4100`) and `web/.env` (`VITE_SOLVER_URL=http://localhost:4100`) — both gitignored, NOT in git. `web/.env.example` does not exist. | A plan should add `web/.env.example` documenting `VITE_SOLVER_URL=http://localhost:4100` so a fresh clone knows the live port. |
| OS-registered state | None. | None — verified: no Task Scheduler / pm2 / systemd registration touches these strings. |
| Secrets/env vars | `ANTHROPIC_API_KEY` present in `solver/.env` (a REAL key, locally). `solver/.env` IS gitignored (verified via `git check-ignore`). | **Do NOT reproduce, log, return, or commit the key.** New endpoints (`/parse-order`, `/rationale-stream`) must keep it module-private exactly like `agent.ts:136`. The secret-safe error envelope (`api.ts:310-317`) already prevents leakage — extend the secret-sweep test to the new endpoints. |
| Build artifacts | `docs/Umbra-Pitch-Deck.pdf` exists but there is **NO committed generator script** (the commit only added the pre-rendered PDF). | WOW-05 must CREATE the generator (documented invocation below); "reuse the pipeline" means reuse the *approach*, not an existing script. |

**The canonical question — what runtime state carries the stale `:4000`?** Three shipped UI files render `:4000` literally even though the solver is `:4100`:
- `web/src/solver.ts:16` — `SOLVER_BASE_URL` fallback `'http://localhost:4000'` (overridden at runtime by `VITE_SOLVER_URL`, but the fallback + line-101 OFFLINE caption say `:4000`).
- `web/src/solver.ts:101` — `'SOLVER OFFLINE — START THE SERVICE ON :4000'`.
- `web/src/views/AgentView.tsx:39` — `SOLVER OFFLINE — START THE SERVICE ON :4000`.
- `web/src/views/SettlementView.tsx:154` — same caption.
- `solver/src/index.ts:26` — `DEFAULT_SOLVER_PORT = 4000` (overridden by env, but the default is stale).

**Fix:** derive the displayed port from `SOLVER_BASE_URL` (parse the port) so captions match the live config, and correct the fallback/default to `4100` (or, better, make captions template the configured port). This is UI-SPEC note 2 made concrete.

## Common Pitfalls

### Pitfall 1: `zodOutputFormat` will not compile (zod is pinned to v3)
**What goes wrong:** A plan for WOW-03 imports `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`.
**Why it happens:** That helper hard-imports `zod/v4` and calls `z.toJSONSchema`, neither of which exists in the project's pinned `zod@3.23.8`.
**How to avoid:** Use `jsonSchemaOutputFormat` (from `@anthropic-ai/sdk/helpers/json-schema`) with a hand-authored JSON-Schema literal, and keep zod for the verify-side `safeParse` — exactly as `agent.ts` already does (lines 29, 51-72, 187-191, and the deviation note at lines 20-26). **This is a documented, load-bearing decision (STATE.md 05-01 DEVIATION); do not "upgrade" it.**
**Warning signs:** `Cannot find module 'zod/v4'` or `z.toJSONSchema is not a function` at solver build.

### Pitfall 2: `proposeClearing` has no timeout — TRUST-02's "timeout" degradation is not yet real
**What goes wrong:** A slow/hanging Anthropic call blocks `solve-preview` / the new endpoints indefinitely; the round appears to stall.
**Why it happens:** `agent.ts` catches SDK errors but never imposes a deadline (`messages.parse` at line 181 has no timeout/AbortSignal).
**How to avoid:** Wrap the model call in `Promise.race([call, timeout(ms)])` (or pass the SDK's request-timeout option) and treat a timeout as the deterministic fallback. TRUST-02 explicitly lists "timeout" — this is a genuine gap to close, plus a test that a slow client still yields $100.00.
**Warning signs:** A demo where "Close & Solve" spins forever with a valid but slow key.

### Pitfall 3: Daml Int/Decimal wire encoding (WOW-02 tamper args)
**What goes wrong:** The tamper `Clear` exercise sends `clearingPrice`/`filledQty` in the wrong JSON shape and the ledger rejects for the WRONG reason (a decode error, not the §8 assert), muddying the demo.
**Why it happens:** JSON Ledger API v2 accepts Daml Int/Decimal as JSON **numbers** on input but returns **strings** on output (`ledger.ts:18-22`); `Allocation.filledQty` is an Int, `clearingPrice` a Decimal.
**How to avoid:** Copy `settle`'s exact argument construction (`ledger.ts:349-355`) and only perturb the numeric VALUES, not their types. The perturbed price must still be a valid Decimal so the assert (not the decoder) is what fires.
**Warning signs:** WOW-02 shows a JSON/parse error instead of `clearingPrice does not match recomputed §8 p*`.

### Pitfall 4: WOW-01 must use the RIGHT per-desk base URL / proxy path
**What goes wrong:** The peek query goes to the wrong participant and returns an auth error unrelated to privacy, or the "empty" result is empty for the wrong reason.
**Why it happens:** Each desk routes to its OWN node via a proxy prefix from `tokens.json` `base` (`/cn/app-user`→:2975, `/cn/sv`→:4975, `''`→:3975) — see `web/src/desks.ts:31-45` and `web/vite.config.ts` proxy block. A cross-node desk querying the default participant would be querying the wrong node.
**How to avoid:** Reuse `httpBaseUrlFor(activeDesk)` (`desks.ts:45`) + the desk's own token, and query for a RIVAL PARTY id under that desk's own connection. The correct evidence is: authenticated as desk X, filter for desk Y's `Order` → participant returns `[]` (structural, not 403 in the single-node case; a 403 arises on cross-node reads the token isn't authorized for — both are valid "privacy enforced" outcomes, and the UI-SPEC provides copy for each).
**Warning signs:** A network/CORS error rendered where an empty `[]` should be.

### Pitfall 5: SSE + the shipped CORS/origin config
**What goes wrong:** The browser's `EventSource` to the solver is blocked or buffers.
**Why it happens:** SSE needs `Content-Type: text/event-stream`, no compression buffering, and the request origin must be the allowed one (`ALLOWED_ORIGIN = http://localhost:5173`, `api.ts:30`). `EventSource` cannot set custom headers.
**How to avoid:** The rationale stream needs no auth header (operator plane, no browser token) so `EventSource(`${SOLVER_BASE_URL}/round/${id}/rationale-stream`)` works. Ensure `cors` allows the origin (it does) and disable any response buffering. If a POST body is required, use `fetch` + `ReadableStream` reader instead of `EventSource`.
**Warning signs:** The rationale arrives all at once at the end instead of streaming.

### Pitfall 6: proof-bundle / proof-pack must not leak the key or full prompt
**What goes wrong:** TRUST-03 writes the raw system prompt or the key into `solver/proofs/<id>.json`, and it gets committed or downloaded.
**Why it happens:** The bundle is meant to be auditable and includes AI provenance.
**How to avoid:** Store `systemPromptHash` (sha256 of `SYSTEM_PROMPT`) not the prompt text; store `modelId`, `rawAiProposal` (numbers only — the model's proposal already carries no secret), `verified`, `deterministicRecompute`, `clearingHash`. Gitignore `solver/proofs/`. Extend the existing secret-sweep test (`api.test.ts`) to assert the key/token never appear in `/round/:id/proof` or the proof-pack.
**Warning signs:** `grep -r sk-ant solver/proofs` returns a hit.

### Pitfall 7: reduced-motion + the new panels
**What goes wrong:** WOW-02 correct-clear slam or WOW-04 live-append ignores `prefers-reduced-motion`.
**Why it happens:** New panels forget the guard the shipped components use.
**How to avoid:** Reuse the shipped `prefersReducedMotion()` helper (present in `AgentRationale.tsx:19`, `SettlementView.tsx:38`, `OrderTicket.tsx:36`) and the existing keyframes (`umbra-slam`, `umbra-pulse`, `umbra-caret` — all in `tailwind.config.ts`). No new keyframes (UI-SPEC Motion Contract).
**Warning signs:** Motion plays under reduced-motion preference.

## Code Examples

### WOW-01 — the raw peek query (browser, this desk's own token)
```typescript
// Reuse the exact v2 wire shape from web/src/ledger/v2react.tsx:75-85 (fetchAcs).
// Source: web/src/ledger/v2react.tsx  +  web/src/desks.ts:45 (httpBaseUrlFor)
const base = httpBaseUrlFor(activeDesk)                       // this desk's node
const token = tokens[activeDesk].token                       // this desk's OWN bearer
const rivalParty = tokens[rivalKey].party
const end = await v2GET(`${base}v2/state/ledger-end`, token)
const rows = await v2POST(`${base}v2/state/active-contracts`, token, {
  filter: { filtersByParty: { [rivalParty]: {} } },          // ask for the RIVAL's contracts
  verbose: true, activeAtOffset: end.offset,
})
// rows === []  → verdict "0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE"
// (client-filter to Umbra.Auction:Order or TradeConfirmation for display)
```

### WOW-03 — structured NL parse (solver, key server-side)
```typescript
// Source: mirrors solver/src/agent.ts:181-192 (messages.parse + jsonSchemaOutputFormat + zod)
const orderSchema = z.object({ side: z.enum(['Buy','Sell']), qty: z.number().int().positive(),
                               limit: z.number().positive() })
const orderJsonSchema = { type:'object', properties:{
  side:{ type:'string', enum:['Buy','Sell'] }, qty:{ type:'integer' }, limit:{ type:'number' } },
  required:['side','qty','limit'], additionalProperties:false } as const
export const parseOrder = async (text: string) => {
  if (!client) return null                                    // keyless → UI shows the error state
  const msg = await client.messages.parse({
    model: 'claude-haiku-4-5', max_tokens: 256, temperature: 0,
    system: 'Extract a single sealed limit order. "under/at most" ⇒ Buy limit; "at least/over" on a sell ⇒ Sell limit.',
    messages: [{ role: 'user', content: text }],
    output_config: { format: jsonSchemaOutputFormat(orderJsonSchema) },
  })
  const parsed = orderSchema.safeParse(msg.parsed_output)
  return parsed.success ? parsed.data : null
}
```

### WOW-04 — SSE rationale stream (solver)
```typescript
// Source: SDK 0.106.0 client.messages.stream (resources/messages/messages.d.ts:74) +
//         MessageStream '.on("text", (delta) => …)' (lib/MessageStream.d.ts:9)
const stream = client.messages.stream({
  model: 'claude-haiku-4-5', max_tokens: 512, temperature: 0,
  system: SYSTEM_PROMPT, messages: [{ role:'user', content: buildBatchMessage(views) }],
})
stream.on('text', (delta) => onDelta(delta))       // forward each token as an SSE data: frame
await stream.finalMessage()
onDone()
```

### WOW-05 — headless Chrome print-to-pdf (solver, both Chrome & Edge verified installed)
```bash
# Source: docs/umbra-deck.html uses @page/print-color-adjust; Chrome & Edge present on this box.
"C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="docs/Umbra-Proof-Pack.pdf" \
  "file:///C:/Users/woshv/Desktop/Umbra/solver/.tmp/proof.html"
# Edge fallback: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" (same flags)
```
Node call: `execFile(chromePath, ['--headless=new','--disable-gpu','--no-pdf-header-footer',`--print-to-pdf=${out}`, `file://${htmlPath}`])`. The on-brand HTML `:root` must copy `docs/umbra-deck.html` tokens (`--paper:#F4F1EA; --ink:#0A0A0A; --lime:#D6FB3C; --red:#E2231A`) and the Google-Fonts link (Space Grotesk / IBM Plex Mono / Inter) plus `-webkit-print-color-adjust:exact`.

### TRUST-03 — proof bundle (solver, no secret)
```typescript
// Source: node:crypto + node:fs; write at settle time from the live views (NOT post-retire)
import { createHash } from 'node:crypto'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const bundle = {
  roundId, timestamp: new Date().toISOString(), modelId: 'claude-haiku-4-5',
  systemPromptHash: sha(SYSTEM_PROMPT), batchHash: sha(buildBatchMessage(views)),
  rawAiProposal, deterministicRecompute: { clearingPrice, allocations },
  verified, clearingHash: sha(JSON.stringify({ clearingPrice, allocations })),
}
writeFileSync(`solver/proofs/${roundId}.json`, JSON.stringify(bundle, null, 2))   // key NEVER included
```

## State of the Art

| Old Approach (CLAUDE.md stack tables — STALE) | Current Approach (this codebase) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Daml 2.10.4 + `daml start` + HTTP JSON API v1 :7575 | Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 :3975/:2975/:4975 | v1→3.4 migration (post-Phase 7) | All ledger I/O is `POST /v2/commands/submit-and-wait` + `POST /v2/state/active-contracts` (`ledger.ts`, `v2react.tsx`). Template ids use `#umbra:Module:Entity` name form. |
| `@daml/react` hooks | Local v2 shim `web/src/ledger/v2react.tsx` (polling `active-contracts`) | migration | Same hook surface (`DamlLedger`/`useStreamQueries`/`useLedger`), so components unchanged. WOW-01 reuses `fetchAcs`. |
| Solver on :4000 | Solver on :4100 (`augur` owns :4000) | migration | **The stale `:4000` literals are the port-drift bug to fix.** |
| `output_format` top-level param | `output_config.format` GA structured outputs | SDK 0.106.0 | `agent.ts` already uses `output_config.format`; WOW-03/04 follow suit. |

**Deprecated/outdated — do NOT follow from CLAUDE.md:** the "Daml 2.x / `daml start` / :7575 / `@daml/react` / solver :4000" tables. They describe the v1 milestone. Ground in `solver/.env`, `web/.env`, `web/vite.config.ts`, `ledger.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Server-side headless Chrome (vs `window.print()`) is the intended WOW-05 mechanism | WOW-05 | Low — CONTEXT says "reuse the deck's Chrome invocation"; if a plan prefers client-side print, the on-brand HTML is reusable either way. |
| A2 | `EventSource` (no custom header) suffices for the rationale stream because the solver operator plane needs no browser token | Pitfall 5 | Low — if a POST body is needed, switch to `fetch`+ReadableStream (documented). |
| A3 | Single-node peek returns `[]` (empty) rather than 403; cross-node returns 403 | WOW-01 / Pitfall 4 | Medium — the exact status depends on whether desks are on separate nodes at demo time; UI-SPEC provides copy for BOTH outcomes, so either is a valid "privacy enforced" render. Verify against the live stack during execution. |
| A4 | `daml test` in GitHub Actions requires installing the Daml 3.4 SDK on the runner | TRUST-01 / Environment | Medium — the SDK install is heavy/slow on CI. A plan may split the workflow: always run the fast solver golden vitest; run `daml test` in a separate job that installs the SDK (or gate it behind a label). See Validation Architecture. |
| A5 | Proof bundles should be gitignored (ephemeral per-round artifacts) | TRUST-03 | Low — if a plan wants a committed sample proof, add ONE fixture under a non-ignored path, never live rounds. |
| A6 | Downloadable brief/proof-pack use `Blob`+`createObjectURL` | Supporting stack | Low — standard browser API. |

## Open Questions

1. **CI `daml test` cost (TRUST-01).**
   - What we know: no `.github/workflows/` exists; `daml` on this box is Bash-PATH-only; the SDK is Daml 3.4.
   - What's unclear: whether the team wants `daml test` on every PR (slow SDK install) or only the fast solver golden vitest on PRs with `daml test` nightly/on-label.
   - Recommendation: two jobs — `golden` (solver `npm ci && npm test`, always) and `daml` (install SDK via `get.daml.com`, run `daml build && daml test`, on push to main + label). The golden vitest is the true regression gate per TRUST-01; `daml test` protects the on-ledger recompute.

2. **WOW-05: where does the PDF get generated — solver process or a build script?**
   - What we know: Chrome & Edge are installed; no committed generator exists.
   - What's unclear: whether the one-click download should spawn Chrome from the solver (`child_process`) or hit a pre-built script.
   - Recommendation: a solver endpoint `GET /round/:id/proof-pack.pdf` that renders on-brand HTML from the proof bundle + brief, spawns headless Chrome to a temp file, and streams the PDF back with `Content-Disposition: attachment`. Fallback: if Chrome spawn fails, return the on-brand HTML with a print-CSS so the browser can `window.print()`.

3. **Tamper endpoint shape (WOW-02) — dedicated vs flag.**
   - What we know: CONTEXT leaves this to planner discretion.
   - Recommendation: dedicated `POST /round/:id/tamper-clear` with `{ mode: 'wrong-price'|'overfill' }` — keeps the shipped `/settle` byte-unchanged (hard constraint) and reads clearly as a demo-only path.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20 + solver deps | all solver endpoints | ✓ (shipped) | as `solver/package.json` | — |
| `@anthropic-ai/sdk` | WOW-03/04, TRUST-02 | ✓ | 0.106.0 | keyless → deterministic fallback (WOW-03 shows error state; WOW-04 single-shot) |
| `ANTHROPIC_API_KEY` | WOW-03/04 live | ✓ (in `solver/.env`, gitignored) | — | Absent → graceful degradation (round still clears $100.00; NL parse returns the error state) |
| Google Chrome (headless) | WOW-05 PDF | ✓ | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Edge headless (also present) |
| Microsoft Edge (headless) | WOW-05 PDF fallback | ✓ | `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` | `window.print()` on print-CSS HTML |
| Canton LocalNet (:3975/:2975/:4975) | WOW-01/02 live | ✓ (per MEMORY live-e2e-ops) | Daml 3.4.11 | — (demo requires the live stack up) |
| Daml SDK on CI runner | TRUST-01 `daml test` | ✗ (no CI yet) | — | Split job: golden vitest always; `daml test` installs SDK in its own job |
| GitHub Actions | TRUST-01 | ✗ (no `.github/` yet) | — | none — must be created |

**Missing dependencies with no fallback:** GitHub Actions workflow + `.github/` dir (must be created — TRUST-01 core deliverable).
**Missing dependencies with fallback:** Daml SDK on CI (split-job / label-gate); Chrome (Edge / `window.print()`); Anthropic key (deterministic degradation).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `2.1.9` (solver + web) · Daml Script (`daml test`) |
| Config file | `solver/vitest.config.ts`, `web/` (vitest via `package.json`), `daml/daml.yaml` |
| Quick run command | `cd solver && npm test` (currently 33+ tests green per STATE.md) |
| Full suite command | `cd solver && npm test && cd ../web && npm test && cd ../daml && daml build && daml test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRUST-01 | §4 clears at 100.00, A=10/B=8/C=2 | unit (golden) | `cd solver && npx vitest run auction.test.ts` | ✅ (`solver/src/auction.test.ts`) |
| TRUST-01 | ≥5 §8 scenarios (ties, no-cross, imbalance) | unit (golden) | `cd solver && npx vitest run auction.test.ts` | ✅ |
| TRUST-01 | verify-don't-trust equality gate (agree/disagree) | unit (golden) | `cd solver && npx vitest run agent.test.ts` | ✅ (`solver/src/agent.test.ts`) |
| TRUST-01 | on-ledger `Round.Clear` rejects bad allocation | daml | `cd daml && daml test` (`test_clear_rejects_bad_allocation`) | ✅ (`daml/Umbra/Tests.daml`) |
| TRUST-02 | keyless → $100.00 deterministic | unit | extend `agent.test.ts` (client absent) | ✅ path exists; ❌ formalized-ladder test = Wave 0 |
| TRUST-02 | SDK error / malformed / disagreement → $100.00 | unit | extend `agent.test.ts` | ✅ partial; ❌ **timeout** case = Wave 0 |
| WOW-02 | tamper `wrong-price` → verbatim `clearingPrice does not match…` | integration (stubbed ledger) | new `ledger.test.ts` / `api.test.ts` case | ❌ Wave 0 |
| WOW-02 | tamper `overfill` → `fills not conserved` / `allocations do not match` | integration | new test case | ❌ Wave 0 |
| WOW-03 | English → `{side,qty,limit}`; malformed → 422 | unit (mocked SDK) | new `api.test.ts` case (mock `parseOrder`) | ❌ Wave 0 |
| WOW-03 | `/parse-order` never echoes the key | unit (secret sweep) | extend the shipped secret-sweep in `api.test.ts` | ✅ pattern exists; extend |
| WOW-04 | SSE emits deltas; error → single-shot fallback frame | unit (mocked stream) | new `api.test.ts` SSE case | ❌ Wave 0 |
| TRUST-03 | proof bundle has all fields; NO key/token present | unit (secret sweep) | new `proof.test.ts` | ❌ Wave 0 |
| WOW-05 | on-brand HTML carries the 4 bundles + brand tokens | unit (string assert on rendered HTML) | new `proofpack.test.ts` (HTML render, no Chrome) | ❌ Wave 0 |
| Port drift | no `:4000` literal remains in web captions | unit / lint (grep) | `grep -rn ':4000' web/src && exit 1 if found` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd solver && npx vitest run <touched file>` (< 5s golden subset).
- **Per wave merge:** `cd solver && npm test && cd ../web && npm test` (full unit suites).
- **Phase gate:** full suite + `daml test` green before `/gsd-verify-work`; live E2E of WOW-01 (empty peek), WOW-02 (verbatim reject then $100.00), WOW-05 (PDF opens on-brand).

### Wave 0 Gaps
- [ ] `solver/src/proof.test.ts` — TRUST-03 bundle fields + secret-absence
- [ ] `solver/src/proofpack.test.ts` — WOW-05 HTML render (brand tokens + 4 bundles), Chrome-spawn mocked
- [ ] Extend `solver/src/agent.test.ts` — TRUST-02 timeout case + formalized degradation-ladder table test
- [ ] Extend `solver/src/ledger.test.ts` — WOW-02 tamper `wrong-price` + `overfill` verbatim-error assertions (stubbed `submitAndWait` returning the assertMsg body)
- [ ] Extend `solver/src/api.test.ts` — `/parse-order` (mock), `/rationale-stream` SSE (mock), `/round/:id/proof`, secret-sweep on ALL new endpoints
- [ ] A grep/lint check that no `:4000` literal remains in `web/src`
- [ ] `.github/workflows/ci.yml` — golden vitest (always) + `daml test` (SDK-install job)
- [ ] Add `solver/proofs/` to `.gitignore`; add `web/.env.example`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Per-party HS256 dev JWTs (WOW-01 uses the desk's own token; operator token stays server-side, `ledger.ts:58-62`). Real OIDC deferred to Phase 12 (IDEN-01). |
| V3 Session Management | no | No sessions; stateless bearer tokens. |
| V4 Access Control | yes | **This is the demo's thesis.** Canton per-token `active-contracts` enforces order/confirmation visibility at the wire (WOW-01). No new access surface added; endpoints are operator-plane on :4100 behind `cors(:5173)`. |
| V5 Input Validation | yes | zod on `/parse-order` body + output, tamper-mode body, `/round` body (`api.ts:107-113`). Cap NL input length (≤280). |
| V6 Cryptography | yes | `node:crypto` sha256 for proof-bundle hashes only; no hand-rolled crypto. On-ledger anchoring deferred to Phase 10. |
| V7 Error Handling & Logging | yes | Secret-safe error envelope (`api.ts:310-317`) + fixed secret-free agent catch (`agent.ts:214-217`). Extend to new endpoints; SSE errors must not leak the key/prompt. |
| V14 Config | yes | `ANTHROPIC_API_KEY` module-private, server-only (`agent.ts:136`); `solver/.env` + `web/.env` gitignored (verified). New `solver/proofs/` must be gitignored. |

### Known Threat Patterns for {Node solver + Canton v2 + Anthropic}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exfiltration via response/log/proof-bundle | Information Disclosure | Module-private key; secret-safe envelope; store `systemPromptHash` not the prompt; secret-sweep tests on every new endpoint + the proof file. |
| Prompt-injection in NL order text (WOW-03) making the model emit a hostile order | Tampering | Output is zod-validated `{side,qty,limit}` and only PREFILLS the ticket; the desk must confirm via `SEAL ORDER`; even a hostile order is a normal sealed order re-verified at clear. Never auto-submit. |
| Tampered clear accidentally settling (WOW-02) | Tampering / Elevation | `Round.Clear` is atomic recompute-and-assert; a mismatch rolls back (Auction.daml 166-198). Tamper path is a dedicated demo endpoint, never `/settle`. |
| SSE endpoint leaking key on stream error (WOW-04) | Information Disclosure | `onError` emits ONLY a fixed deterministic fallback frame; never `err.message`/the prompt. |
| Cross-origin abuse of the new operator-plane endpoints | Spoofing | Existing `cors({ origin: 'http://localhost:5173' })` (never `*`) covers all new routes. |
| Reading a rival's data via the peek console (WOW-01) | Information Disclosure (the thing being DISPROVEN) | The participant returns `[]`/403 for the token — the demo proves the mitigation is structural. Browser holds only desk tokens. |

## Sources

### Primary (HIGH confidence)
- `solver/src/agent.ts`, `api.ts`, `ledger.ts`, `auction.ts`, `index.ts` — read in full; the exact DI seams, the verify-don't-trust gate, the v2 wire encoding, the module-private key.
- `daml/Umbra/Auction.daml` lines 149-243 — the `Round.Clear` recompute-and-assert body + verbatim rejection strings (WOW-02).
- `web/src/ledger/v2react.tsx`, `desks.ts`, `tokens.json`, `config.ts`, `App.tsx`, `views/*.tsx`, `components/OrderTicket.tsx`, `components/AgentRationale.tsx` — the per-party plane, the host views, the shipped port literals.
- `solver/.env`, `web/.env`, `web/vite.config.ts`, root `.gitignore`, `Makefile`, `package.json` (root/web/solver) — live ports (:4100), proxy routing, gitignore status of secrets.
- `solver/node_modules/@anthropic-ai/sdk@0.106.0` — verified `messages.stream` (`resources/messages/messages.d.ts:74`), `MessageStream.on('text', …)` (`lib/MessageStream.d.ts:9`), `helpers/json-schema` + `helpers/zod` present.
- `docs/umbra-deck.html` `:root`/`@page` block — brand tokens + print CSS for WOW-05.
- Local probe: Chrome + Edge both installed; no committed PDF-generator script (git log).

### Secondary (MEDIUM confidence)
- `08-CONTEXT.md`, `08-UI-SPEC.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — locked decisions, additive UI contract, requirement text.
- CLAUDE.md project rules (git-attribution, secrets, design fidelity) — authoritative for constraints; its STACK TABLES are stale and were NOT used.

### Tertiary (LOW confidence)
- MDN `EventSource` / `Blob` behavior (A2, A6) — standard browser APIs, from training knowledge.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package already installed/pinned; SDK methods verified in `node_modules`.
- Architecture / seams: HIGH — read the actual `createApp(deps)`, `createAgent`, `ledger.ts`, `Round.Clear`, and every host view.
- Pitfalls: HIGH — zod-v3 helper trap, Int/Decimal wire encoding, and the `:4000` drift are all confirmed in-tree (STATE.md + live files).
- CI / WOW-05 generator: MEDIUM — `.github/` and the PDF script don't exist yet; recommendations are grounded but unbuilt (flagged as Wave 0 + Open Questions).

**Project Constraints (from CLAUDE.md):**
- **Never add Claude as a git contributor** — no `Co-Authored-By`, no "Generated with" trailers; author/committer stays `woshvad`.
- **`ANTHROPIC_API_KEY` server-only** — read solely by `solver/`, never in the frontend, never logged/returned/committed.
- **Design comp is binding** — Phase 8 surfaces are additive and must be visually indistinguishable from the shipped system (`08-UI-SPEC.md` governs; no new tokens/keyframes).
- **§4 fixture must still clear at exactly $100.00** (A=10/B=8/C=2) — the correct settle path stays byte-unchanged; WOW-02 only ATTEMPTS a rejected clear.
- **No new Daml order-model templates in Phase 8** (order-model changes are Phase 9).

**Research date:** 2026-07-09
**Valid until:** 2026-08-08 (stable in-tree stack; re-verify SDK method names only if `@anthropic-ai/sdk` is bumped)
