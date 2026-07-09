# Phase 8: Demo Hardening - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommendations auto-accepted per user delegation "intelligently pick good options")

<domain>
## Phase Boundary

Turn Umbra's three shipped superpowers — ledger-enforced privacy, the AI solver, atomic DvP — into interactive, visceral demo moments a judge *feels*, and harden the AI-trust story. **Near-zero new infrastructure**: expose capabilities that already exist on the CURRENT v2 stack (Daml 3.4.11 + Canton 3.4 LocalNet / cn-quickstart + JSON Ledger API v2 on :3975/:2975/:4975, solver on :4100, React frontend on :5173, cross-node desks bankA@app-user · bankB@sv · bankC@app-provider).

**IN SCOPE:**
- **WOW-01** try-to-peek adversarial privacy console (raw JSON Ledger API v2 query as one desk for a rival's `Order` returns empty/403 live)
- **WOW-02** break-the-AI (a demo control forces a wrong clearing price; on-ledger `Round.Clear` re-verification rejects it on screen; the correct deterministic clear still settles)
- **WOW-03** natural-language order entry (plain English → Claude structured output → validated sealed order for confirmation)
- **WOW-04** solver streams its clearing rationale live + emits a shareable post-round natural-language brief
- **WOW-05** one-click on-brand proof-pack PDF (clearing proof + per-desk best-ex receipts + finality record + AI decision bundle)
- **TRUST-01** §8 clearing fixtures run as a CI golden-eval suite (regression gate for the clearing math + the AI verify gate)
- **TRUST-02** strict structured outputs + graceful degradation to the pure deterministic §8 solver on API unavailability/timeout (canonical case still clears $100.00)
- **TRUST-03** every round records an immutable "decision proof bundle" (prompt, model ID, raw AI proposal, deterministic recompute, on-ledger clearing hash)

**OUT OF SCOPE (later phases):** richer order types + aggregate indicative preview (P9); commit–reveal, tlock, ZK (P10); Daml Finance, KYC gating (P11); real on-chain / OIDC (P12); OTel, Vault, FIX, webhooks (P13). The canonical §4 fixture ($100.00, fills A=10 / B=8 / C=2) remains the continuous correctness reference.

</domain>

<decisions>
## Implementation Decisions

### Try-to-Peek Adversarial Privacy Console (WOW-01)
- Lives as a control ON the Privacy money-shot view (`web/src/views/PrivacyView.tsx`), beside the three blindness panels — the peek attempt and the blindness proof sit together.
- Attempt runs as the CURRENTLY-SELECTED desk's own JSON-API token (from `web/src/tokens.json` / per-party `ledger/` context): a raw JSON Ledger API v2 `POST /v2/state/active-contracts` filtered to a RIVAL desk party for the `Umbra.Auction:Order` template.
- Displays the actual HTTP request (URL, party filter, `Authorization: Bearer <this desk>`) and the raw response side by side — an empty `[]`/403 — with a verdict line ("0 rival orders returned — privacy enforced at the wire").
- Offers a second target (a rival's `TradeConfirmation`) to prove privacy is structural (signatory/observer disclosure), not Order-specific. All requests go through the same per-party proxy the app already uses; no operator token in the browser.

### Break-the-AI Demo (WOW-02)
- Injection is a solver demo path: a flag on the settle/clear call (e.g. `POST /round/:id/settle` with a `tamper` mode, or a dedicated `POST /round/:id/tamper-clear`) that submits a deliberately-WRONG allocation to the on-ledger `Round.Clear`, whose recompute-§8-and-assert backstop rejects the transaction. The real deterministic settle path is byte-unchanged.
- One operator-view control ("Break the AI") runs the sequence: attempt tampered clear → surface the verbatim on-ledger rejection error → run the correct clear → it settles at $100.00. Rendered in the Theatre/Agent operator plane.
- Safety: the tamper path only ever ATTEMPTS the exercise; because `Round.Clear` is atomic, a rejection changes nothing on-ledger. The control is clearly demo-labeled and never on the normal settle path.
- Tamper modes: a wrong clearing price (primary — shows the max-volume/limit re-verification fire) plus one conservation-violating over-fill variant (a different on-ledger rejection reason), to prove the ledger — not the AI — is the backstop.

### AI Interaction — NL Order Entry, Live Analyst, Brief (WOW-03, WOW-04)
- NL parsing runs SERVER-SIDE in the solver (the Anthropic key is server-only, never in the browser): a new `POST /parse-order` endpoint takes plain English ("buy up to 10 under 101") and returns a validated structured order `{side, qty, limit}` via Claude structured output, zod-validated before it reaches the UI.
- Confirmation is mandatory: Claude proposes the structured fields, the desk reviews/edits them, then submits through the EXISTING one-order-per-round `Venue.SubmitOrder`. Never auto-submit — preserves the desk's authority and the one-per-round lock.
- Rationale "streams" via real Anthropic SDK streaming proxied as Server-Sent Events from the solver; the UI types it out live (reuses the existing `AgentRationale` typewriter as the render target). Graceful fallback: if streaming is unavailable, fall back to the current single-shot rationale.
- Post-round brief: a shareable natural-language summary (clearing price, matched volume, aggregate per-desk outcomes, rationale) generated at settle, copyable/downloadable and embedded into the WOW-05 proof-pack.

### AI Trust Harness + Proof-Pack (TRUST-01, TRUST-02, TRUST-03, WOW-05)
- Golden-eval CI: a vitest "golden" suite asserting the §8 fixtures (canonical §4 → $100.00 with A=10/B=8/C=2, plus the ≥5 existing scenarios) AND the verify-don't-trust equality gate, wired into a NEW GitHub Actions workflow (`.github/workflows/`) that runs on every push/PR touching `solver/` or `daml/`.
- Graceful degradation: a test that disables the Anthropic path (no key / forced SDK error / timeout) and asserts the round still clears deterministically at $100.00 (agent.ts already falls back — formalize the ladder and lock it with a test + doc note).
- Decision proof bundle: per round, persist an immutable JSON artifact `{roundId, timestamp, modelId, systemPromptHash, batchHash, rawAiProposal, deterministicRecompute, verified, clearingHash}` under `solver/proofs/` and expose it via `GET /round/:id/proof`. The clearing hash is derived from the settled clearing result (deterministic recompute); on-ledger anchoring of the hash is noted as a Phase 10 upgrade.
- Proof-pack PDF: reuse the existing Chrome-headless HTML→PDF pipeline (the one that renders `docs/umbra-deck.html` → `Umbra-Pitch-Deck.pdf`). Render an on-brand HTML proof-pack (Umbra tokens: `#F4F1EA` paper / `#0A0A0A` ink / `#D6FB3C` lime; Space Grotesk / IBM Plex Mono / Inter) containing the clearing proof + per-desk best-ex receipts + finality record + AI decision bundle, triggered by one click post-settle.

### Claude's Discretion
- Exact endpoint names/paths, SSE vs chunked transfer specifics, proof-bundle field ordering, and the precise HTML layout of the proof-pack are at the planner's discretion, provided the success criteria and brand tokens hold.
- Whether the tamper demo uses a query flag vs a dedicated endpoint — planner picks the cleaner seam given api.ts structure.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **solver/src/agent.ts** — `createAgent({client?, computeClearing, matchedAt}) → proposeClearing(views)`; already does structured output (`output_config.format`), the verify-don't-trust equality gate, and a deterministic §4 fallback on EVERY failure path (this IS the TRUST-02 degradation core — formalize + test). Module-private `ANTHROPIC_API_KEY`.
- **solver/src/api.ts** — `createApp(deps)` DI factory, 5 endpoints on :4100, cors(:5173), zod validation, secret-safe error envelope. `solve-preview` + `GET /round/:id` already emit `rationale` + `agent:{verified,source}`. New endpoints (`/parse-order`, `/round/:id/proof`, tamper path, SSE rationale) slot in here.
- **solver/src/auction.ts** — pure §8 port (1:1 with Clearing.daml); the golden-eval fixtures (TRUST-01) assert against this + the Daml side.
- **solver/src/ledger.ts** — Operator wire layer over JSON Ledger API v2; `Round.Clear` exercise lives here (WOW-02 tamper attempts a bad allocation through this).
- **web/src/views/PrivacyView.tsx** — the 3-up money shot (WOW-01 console attaches here). **web/src/tokens.json** + **web/src/ledger/** — per-party tokens/contexts the peek reuses.
- **web/src/views/AgentView.tsx / TheatreView.tsx** — operator plane; WOW-02 control + WOW-04 live rationale render here. **web/src/solver.ts** — the :4100 fetch client to extend.
- **docs/umbra-deck.html** + the Chrome `--headless --print-to-pdf` pipeline — the WOW-05 proof-pack reuses this exact approach.

### Established Patterns
- Verify-don't-trust: AI numbers are NEVER used unverified; deterministic §8 + on-ledger `Round.Clear` recompute are the source of truth (WOW-02 is literally this made visible).
- DI factories + injected deps for testability (createApp/createAgent); mocked-SDK + stubbed-ledger vitest; `tsc` clean gate.
- Secret hygiene: `ANTHROPIC_API_KEY` and operator token are module-private, never logged/returned/committed; secret-sweep tests assert absence in responses.
- Per-party plane separation in the frontend: browser holds only desk tokens; operator/AI credentials stay server-side.

### Integration Points
- Solver new endpoints register in `api.ts` `createApp` + boot in `index.ts`; the web calls them via `solver.ts`.
- WOW-01 uses the existing per-party JSON-API proxy/contexts (no new auth).
- TRUST-01 CI is a new `.github/workflows/*.yml` (none exist yet) running `npm run solver:test` (+ a golden subset) and `daml test`.
- Proof bundle writes to a new `solver/proofs/` dir; proof-pack HTML→PDF reuses the deck's Chrome invocation.

</code_context>

<specifics>
## Specific Ideas

- The break-the-AI moment must show the ACTUAL on-ledger rejection text, then the correct clear settling at exactly $100.00 — the contrast is the point (ledger is the backstop, not the AI).
- The try-to-peek console must show the real HTTP request/response, not a mocked badge — the credibility is in the raw wire evidence.
- Proof-pack must be pixel-on-brand (binding `Umbra design/` tokens), matching the deck's look.
- Everything here rides on the existing $100.00 §4 fixture and the current cross-node live stack; no new ledger templates in this phase (order-model changes are Phase 9).

</specifics>

<deferred>
## Deferred Ideas

- On-ledger anchoring of the decision-proof clearing hash (a `RoundProof` contract) → Phase 10 (cryptographic privacy).
- ZK proof replacing the "trust the recompute" bundle → Phase 10 (CRYP-03).
- Aggregate indicative-price preview during the open window → Phase 9 (AUCT-03) — the WOW-04 live analyst here is rationale-only, not a live price feed.
- FIX / webhooks / OTel around these endpoints → Phase 13.

</deferred>
