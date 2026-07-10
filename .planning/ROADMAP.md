# Roadmap: Umbra

## Overview

Umbra is a private, sealed-bid uniform-price batch-auction venue for a tokenized bond, settled atomically (DvP) on Canton with a Claude AI agent as the auction solver. The build is dependency-forced and maps 1:1 onto spec §17: first freeze the Daml data model and the installed-SDK version (P1), then make the ledger clear and settle a batch atomically and reject bad allocations (P2), then prove privacy is real at the HTTP layer and ship the 3-up money shot — the vertical slice that wins (P3). With the slice shipped by end of P3, later phases add layers off the critical path: the off-ledger solver service (P4), the AI solver agent (P5), the auction theatre / settlement animation / supply-demand chart (P6), and finally design-comp polish, `make demo`, and live E2E acceptance (P7). The canonical §4 fixture (clears at exactly $100.00, fills A=10 / B=8 / C=2) is the single correctness reference and a continuous smoke test from P2 onward.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Skeleton & Version Gate** - Daml templates + Setup seed the §4 world, `daml start` runs, and the SDK version + data contract are frozen
- [x] **Phase 2: Clear & Settle On-Ledger** - `Round.Clear` re-verifies §8 and settles the batch as one atomic DvP transaction; §4 fixture clears at $100.00
- [x] **Phase 3: Privacy Proof (Vertical Slice)** - Per-party JWT auth proven at the wire + the 3-up Privacy money shot; ship this even if everything after is rough (completed 2026-06-25)
- [x] **Phase 4: Solver Service** - Node/TS Operator service: 60s window lifecycle, deterministic §8, Express API, ≥5 unit-test scenarios (autonomous portion completed 2026-06-26; live-`daml start` E2E deferred to phase verification)
- [x] **Phase 5: AI Solver Agent** - Claude proposes + narrates the clearing; verify-don't-trust gate; additive, off the settlement path (completed 2026-06-26)
- [x] **Phase 6: Auction Theatre & Settlement Animation** - Countdown + reveal, hand-rolled supply/demand crossing SVG, atomic-settle animation, Desk view (completed 2026-06-26)
- [x] **Phase 7: Polish, Demo & Acceptance** - 100% design-comp fidelity (UI-07 24/24), `make demo` + README, pitch frames + 3-min script, live E2E acceptance (2 wiring bugs surfaced & fixed) (completed 2026-06-27)

## Phase Details

### Phase 1: Skeleton & Version Gate

**Goal**: Freeze the Daml data model and the SDK/API line so every other layer codes against a known, compiling contract that seeds the canonical §4 world.
**Depends on**: Nothing (first phase)
**Requirements**: LEDG-01, LEDG-02, LEDG-03, LEDG-04
**Success Criteria** (what must be TRUE):

  1. The installed Daml SDK version is detected, pinned in `daml.yaml`, and recorded in `DECISIONS.md` (with the chosen 2.x HTTP JSON API line + the React-18 `--legacy-peer-deps` note) before any other build work.
  2. `daml start` compiles the project (templates `Asset`, `Venue`, `Order`, `Round`, `RoundStats`, `TradeConfirmation` per §7) and runs the sandbox + HTTP JSON API on :7575.
  3. `Setup.daml` allocates Operator/BankA/BankB/BankC and mints the §4 holdings (A→5,000 USDCx; B→20 BONDX + 1,000 USDCx; C→15 BONDX + 1,000 USDCx), writing party IDs/tokens to a generated `parties.json`/`.env`.
  4. `Asset` is operator-custodied (signatory operator, observer owner) and exposes Split/Merge/Reassign usable only by the Operator; the template field names and the `Allocation` data type are frozen as the shared cross-layer contract.

**Plans**: 3 plans (3 waves)Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Version gate (detect/pin SDK 2.10.4) + repo scaffold (daml.yaml, DECISIONS.md, .gitignore, .env.example, README; track spec.md + Umbra design/) [LEDG-04, LEDG-01]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Freeze the six §7 templates + data types + ClearResult + Round.Clear placeholder; daml build green [LEDG-01, LEDG-03]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Setup.daml (allocate + §4 mint + runCanonicalRound + exportParties) + Tests.daml + parties.json export + daml start smoke [LEDG-02, LEDG-01]

### Phase 2: Clear & Settle On-Ledger

**Goal**: The ledger is the source of truth and atomicity boundary — `Round.Clear` independently re-verifies the §8 allocation and settles the whole batch delivery-versus-payment in a single all-or-nothing transaction.
**Depends on**: Phase 1
**Requirements**: CLEAR-04, CLEAR-05, SETL-01, SETL-02, SETL-03, SETL-04
**Success Criteria** (what must be TRUE):

  1. The canonical §4 fixture clears at exactly $100.00 with fills A=10 / B=8 / C=2 in a Daml Script test (`test_clears_at_100`).
  2. `Round.Clear` reassigns BONDX & USDCx at p\* and issues a per-desk `TradeConfirmation` inside one transaction, leaving the §4 settled balances (A: 10/4,000 · B: 12/1,800 · C: 13/1,200) with cash and assets conserved (`test_settled_balances`).
  3. If any settlement leg fails (e.g., a seller lacks the asset), `Round.Clear` fails and no balances change — all-or-nothing (`test_atomicity`).
  4. `Round.Clear` rejects any allocation violating max-volume, limit compliance, or conservation (`test_clear_rejects_bad_allocation`); the on-ledger §8 re-verification matches the algorithm spec.

**Plans**: 3 plans (3 waves)
Plans:

**Wave 1**

- [x] 02-01-PLAN.md — Umbra/Clearing.daml: pure §8 (tie-break-trap-safe) + test_clears_at_100 canary (p*=100.00, A=10/B=8/C=2) [CLEAR-04]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Real Round.Clear body: recompute-§8-and-assert backstop + atomic DvP settlement + per-desk TradeConfirmations + status=Settled; DECISIONS.md D7 (Option B) [CLEAR-05, SETL-01, SETL-04]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Settlement tests: test_settled_balances (§4 balances + conservation), test_atomicity (submitMustFail, no-balance-change), test_clear_rejects_bad_allocation [SETL-01, SETL-02, SETL-03, SETL-04, CLEAR-05]

### Phase 3: Privacy Proof (Vertical Slice)

**Goal**: Prove order/fill/holding privacy is structurally real at the API boundary and ship the 3-up Privacy money shot — the end-to-end privacy→clear→settle slice that wins even if everything after is rough.
**Depends on**: Phase 1 (data model + party tokens); Phase 2 (clear/settle for the live slice)
**Requirements**: CLEAR-01, PRIV-01, PRIV-02, PRIV-03, PRIV-04, PRIV-05, UI-01, UI-03
**Success Criteria** (what must be TRUE):

  1. A registered desk submits exactly one sealed order per round via `Venue.SubmitOrder` (operator+desk signed); a JSON-API query as BankA returns BankA's order and zero of BankB/BankC's orders (`test_privacy_orders`), and a `TradeConfirmation` is observed only by its desk (`test_privacy_confirmations`).
  2. Pre-clear, desks see only `RoundStats.sealedOrderCount` (a count) and never order contents; `Asset` holdings are visible only to owner + operator.
  3. The frontend authenticates as each party using that party's own JSON-API token, so it structurally cannot fetch other desks' private data (privacy enforced at the wire, not in render logic).
  4. The Privacy view renders three desk panels side by side, each driven by that desk's independent credentials, plus a center column showing the shared `RoundStats` count, with a redaction motif on the "other" columns and a working party switcher + round-status indicator.

**Plans**: 3 plans (2 waves)
Plans:

**Wave 1**

- [x] 03-01-PLAN.md — Privacy Daml tests (test_privacy_orders PRIV-01/02/04 + test_privacy_confirmations PRIV-03) + seedOpenRound (Open Round + RoundStats{count=3} + 3 §4 orders) [PRIV-01, PRIV-02, PRIV-03, PRIV-04, CLEAR-01]
- [x] 03-02-PLAN.md — @daml.js/umbra codegen + web/ scaffold (Vite 5.4 + React 18.3.1 + Tailwind 3.4, comp theme, :7575 proxy) + per-party HS256 token-mint script [PRIV-05, UI-01, UI-03]

**Wave 2** *(blocked on 03-02)*

- [x] 03-03-PLAN.md — Live ledgerId verify-first + three per-party createLedgerContext + global shell (wordmark/3-desk switcher/round-status/nav) + the 3-up Privacy money shot [PRIV-05, UI-01, UI-03, CLEAR-01]

**UI hint**: yes

### Phase 4: Solver Service

**Goal**: Stand up the off-ledger Node/TS service that holds Operator authority — it runs the auction clock, computes the deterministic §8 clearing in TypeScript, exercises `Round.Clear`, and fronts an HTTP API so the browser never holds Operator/Anthropic credentials.
**Depends on**: Phase 2 (the `Clear` choice must exist)
**Requirements**: CLEAR-02, CLEAR-03, SOLV-01, SOLV-02, SOLV-03, SOLV-04, SOLV-05
**Success Criteria** (what must be TRUE):

  1. The deterministic §8 algorithm in TypeScript computes p\* maximizing matched volume with the correct two-level tie-break (minimize |demand−supply| only among max-matched candidates, then lower price) and rations the long side by price priority then pro-rata (leftover-to-largest), producing output identical to the Daml side on the §4 fixture.
  2. The service opens a `Round`, maintains `RoundStats.sealedOrderCount`, enforces the 60s window (`ROUND_SECONDS`) with a force-close affordance, and on close reads the sealed orders, computes/verifies the clearing, and exercises `Round.Clear`.
  3. The service exposes the HTTP API on :4000 (`POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle`); the Anthropic key and Operator credentials are never exposed to the browser.
  4. TypeScript unit tests cover the clearing algorithm on ≥5 scenarios (exact same-limit ties, all-or-nothing imbalance, no-cross, and the §4 case) and all pass.

**Plans**: 4 plans (4 waves)
Plans:

**Wave 1**

- [x] 04-01-PLAN.md — Scaffold solver/ (pinned deps + ESM import smoke) + §8 auction.ts port with the 99-vs-100 tie-break guard + 5 vitest scenarios (§4 clears at 100.00) [CLEAR-02, CLEAR-03, SOLV-05]

**Wave 2** *(blocked on 04-01)*

- [x] 04-02-PLAN.md — ledger.ts: Operator @daml/ledger client (absolute :7575 URL, token server-side) + open Round/RoundStats, read sealed orders, CloseRound + Option-B Round.Clear settle [SOLV-01, SOLV-02, SOLV-04]

**Wave 3** *(blocked on 04-02)*

- [x] 04-03-PLAN.md — api.ts: Express, the five §11 endpoints on :4000 (cors :5173, zod, secret-safe error envelope), deterministic solve-preview (100.00 + curve + rationale:null), 409 double-settle [SOLV-03, SOLV-04, CLEAR-02]

**Wave 4** *(blocked on 04-02, 04-03)*

- [x] 04-04-PLAN.md — clock.ts (60s ROUND_SECONDS window + force-close, fake-timer tests) + index.ts boot (dotenv, rehydrate-from-ledger, listen) + live E2E human gate [SOLV-01, SOLV-02]

### Phase 5: AI Solver Agent

**Goal**: Add the autonomous-agent thesis — Claude proposes and narrates the clearing — without ever risking correctness, via a verify-don't-trust equality gate against the deterministic core.
**Depends on**: Phase 4 (drops into the agent seam; never on the critical settlement path)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04
**Success Criteria** (what must be TRUE):

  1. On round close the agent ingests the sealed batch and proposes a clearing (price + allocation) by calling Claude with a structured prompt that returns strict JSON at temperature 0.
  2. The service recomputes the deterministic result and only submits an allocation that passes verification by equality; the AI's numbers are never used unverified (if the AI disagrees, the deterministic clear still settles).
  3. Claude returns a 2–3 sentence natural-language rationale for the clearing, rendered in the Solver Agent panel.
  4. The prompt contract (system rules verbatim, batch JSON, required JSON response shape) is documented in `solver/PROMPT.md`.

**Plans**: 2 plans (2 waves)
Plans:

**Wave 1**

- [x] 05-01-PLAN.md — Install @anthropic-ai/sdk@0.106.0 + agent.ts (createAgent DI factory, claude-haiku-4-5 structured output, verify-don't-trust equality gate, module-private ANTHROPIC_API_KEY) + mocked-SDK tests (agreement / disagreement / unavailable / keyless + sentinel-key sweep) [AGENT-01, AGENT-02]

**Wave 2** *(blocked on 05-01)*

- [x] 05-02-PLAN.md — Wire proposeClearing into api.ts (solve-preview + GET terminal: rationale + agent:{verified,source}; settle untouched) + index.ts boot + extend api.test.ts (ANTHROPIC_API_KEY sentinel) + solver/PROMPT.md prompt contract [AGENT-03, AGENT-04]

### Phase 6: Auction Theatre & Settlement Animation

**Goal**: Build the remaining live views and the motion that makes the mechanism legible — the auction theatre with countdown/reveal, the hand-rolled supply/demand crossing chart, the atomic-settlement animation, and the per-desk Desk view.
**Depends on**: Phase 3 (privacy/UI scaffold), Phase 4 (solve-preview/settle API), Phase 5 (agent data)
**Requirements**: UI-02, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):

  1. The Desk view (A/B/C) shows the order ticket (one order per round, with a "load demo order" affordance pre-filling the §4 values), the desk's sealed order + status, its live BONDX/USDCx holdings, and — after settlement — its `TradeConfirmation`.
  2. The Auction theatre (Operator) shows a 60s countdown ring + live `sealedOrderCount` and a "Close & Solve" action that triggers `solve-preview` and reveals the uniform clearing price ($100.00 on the fixture) as a hero moment.
  3. A hand-rolled SVG chart renders the step demand (down) and supply (up) curves and marks p\* where matched volume is maximized.
  4. A "Settle atomically" action plays the atomic-settlement animation (all legs snap simultaneously), shows before/after balances, and renders the DvP legs (A↔B 8@100, A↔C 2@100) with a single "one transaction" badge.

**Plans**: 4 plans (3 waves)
Plans:

**Wave 1**

- [x] 06-01-PLAN.md — Scaffold: web/src/solver.ts (:4000 client + offline guard) + web/src/lib/{curve,balance,solverParse}.ts + §4-value vitest + tailwind umbraLeg/fontSize literals + Nav 5-tab union + App routing & lifted solver state + 4 compiling view stubs [UI-02, UI-04, UI-05, UI-06]

**Wave 2** *(blocked on 06-01)*

- [x] 06-02-PLAN.md — 02 Desk view: OrderTicket (Venue.SubmitOrder, one-per-round lock, §4 load-demo, seal-wipe) + HoldingsPanel (live BONDX/USDCx) + FillCard (post-settle TradeConfirmation) — per-party plane [UI-02]
- [x] 06-03-PLAN.md — 03 Theatre: CountdownRing (753.98 / red≤10 / auto-fire) + Close&Solve reveal (lime 100.00 umbraSlam hero) + CrossingChart (hand-rolled SVG p*=100/q=10) — operator plane [UI-04, UI-05]

**Wave 3** *(blocked on 06-01, 06-03)*

- [x] 06-04-PLAN.md — 04 Agent (proposal + verified/source badge + typewriter rationale) + 05 Settlement (DvP legs + single-rAF SIMULTANEOUS settle + before/after balances to §4 finals + one-transaction stamp) — operator plane [UI-06]

**UI hint**: yes

### Phase 7: Polish, Demo & Acceptance

**Goal**: Match the binding design comp 100%, make the whole thing runnable by a stranger via `make demo`, capture the two pitch screenshots, and prove the end-to-end acceptance flow runs live.
**Depends on**: Phase 6 (all five views complete)
**Requirements**: UI-07, DEMO-01, DEMO-02, DEMO-03, DEMO-04
**Success Criteria** (what must be TRUE):

  1. The frontend follows the binding `Umbra design/` comp 100% — color tokens, typography (Space Grotesk / IBM Plex Mono / Inter), layout, the redaction + draw-on motifs, and all five numbered views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent · 05 Settlement).
  2. `make demo` orchestrates ledger + setup + solver + web and opens the 3-up view; a `Makefile` + `README.md` document every command so a stranger can run it; all six Daml Script tests pass.
  3. The E2E acceptance flow runs live: three desks submit blind → 3-up proves no cross-visibility → solver reveals 100.00 with rationale → one-click atomic settle → each desk sees only its own fill, Operator sees the aggregate.
  4. Screenshots of (a) the 3-up blindness and (b) the atomic settlement are captured into `docs/`, and a 3-minute demo script is written.

**Plans**: 3 plans (2 waves)
Plans:

**Wave 1**

- [x] 07-01-PLAN.md — UI-07 comp fidelity: PriceReveal (CLEARS AT 4px / unit words 13px / CTA 30px·15px 28px) + CrossingChart (p*/q= fill-opacity .7) + TheatreView (headline 18px bottom + inline-baseline sealed-count) + AgentRationale (bind rank-1 row to live preview) + five-view comp sweep [UI-07]
- [x] 07-02-PLAN.md — DEMO-01: repo-root Makefile (granular + composite demo, .PHONY) + full README rewrite (two data planes, AI off critical path, run flow, ports, §4 reference) + root package.json npm-script mirror (Windows path) [DEMO-01]

**Wave 2** *(blocked on 07-01, 07-02)*

- [x] 07-03-PLAN.md — Acceptance (ORCHESTRATOR-RUN): daml test 6/6 (DEMO-02) + live E2E (solve-preview 100.00 / matched 10 / Settled / per-desk privacy / legs A↔B 8@100·A↔C 2@100 / 409; 2 wiring bugs surfaced & fixed) (DEMO-03) + two pitch frames + docs/DEMO.md 3-min script (DEMO-04) [DEMO-02, DEMO-03, DEMO-04]

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Skeleton & Version Gate | 3/3 | Complete   | 2026-06-25 |
| 2. Clear & Settle On-Ledger | 3/3 | Complete   | 2026-06-25 |
| 3. Privacy Proof (Vertical Slice) | 3/3 | Complete   | 2026-06-25 |
| 4. Solver Service | 4/4 | Complete   | 2026-06-26 |
| 5. AI Solver Agent | 2/2 | Complete   | 2026-06-26 |
| 6. Auction Theatre & Settlement Animation | 4/4 | Complete   | 2026-06-26 |
| 7. Polish, Demo & Acceptance | 3/3 | Complete   | 2026-06-27 |

---

# Milestone v2.0 — Production Hardening & Real On-Chain

## Overview

Milestone v1.0 shipped and proved the privacy money shot end-to-end. v2.0 hardens that vertical slice into a **production-grade, real-on-chain** private batch-auction venue — and turns each production capability into a judge-facing "wow" moment, because most wow features are the demo surface of a production capability (built in the same phase). Grounded in the **CURRENT** stack (Daml 3.4.11 + Canton 3.4 LocalNet / cn-quickstart + JSON Ledger API v2 on :3975, solver :4100), **not** the v1 Daml-2.x plan above. Structure = 4 sequential build waves (Phases 8–11) + 2 parallel tracks (Phase 12 on-chain, Phase 13 baseline/adjacent). The canonical §4 fixture ($100.00, A=10/B=8/C=2) remains the continuous correctness reference through every phase, including once on real Canton.

**Known frontier/heavy items** (weeks–quarter + external review, sequenced last within their wave): Daml Finance settlement (Phase 11), threshold-crypto + ZK (Phase 10), and the SV-sponsored DevNet node (Phase 12 — an external business gate, not code). **Known limitation:** true 3-desk privacy ultimately needs 3 real institutions each running their own validator; a single-operator DevNet node is "demo-real" (a weaker privacy claim), recorded honestly.

## Phases

- [ ] **Phase 8: Demo Hardening** — Expose what already exists as interactive wow: try-to-peek privacy console, break-the-AI, NL order entry, live analyst, AI trust-harness core + decision proof bundle, proof-pack v1 *(~zero new infra)*
- [ ] **Phase 9: Auction Depth & Live Viz** — Richer order types + explicit rulebook, aggregate indicative-price/imbalance preview, live crossing spectacle, per-desk best-ex/TCA + surplus proof, cost-of-leakage simulator
- [x] **Phase 10: Cryptographic Privacy** — On-ledger commit–reveal, tlock/drand sealed-until-close, privacy time-machine replay, ZK proof-of-correct-clearing PoC *(cryptographer review gates production use)* (completed 2026-07-09)
- [x] **Phase 11: Settlement & Institutional Grade** — CN Token Standard (CIP-0056) settlement Batch/Instruction (real HoldingV1 conformance; the Daml Finance library is unbuildable on this LF 2.1 / SDK 3.4.11 line — honest reconciliation) + multi-buyer netting + cash-agnostic leg, on-ledger KYC/eligibility gating, judge-as-4th-desk, three-node topology viz (built 2026-07-10; live UAT pending)
- [x] **Phase 12: Real On-Chain (Canton DevNet)** *(parallel Track A)* — Real on-ledger four-eyes (distinct-authority `ClearingApproval`, §4 still $100.00) + OIDC dual-mode (Keycloak client-credentials/PKCE + `jose` JWKS, dev-HMAC preserved) + Splice DevNet compose + DAR-vet/party scripts + Postgres/monitoring/backup/top-up + RUNBOOK + SV-sponsor checklist (built 2026-07-10; **the live SV-sponsored connection is a genuinely external, days–weeks business gate** + live token-exchange/§4-on-real-Canton/ops → UAT)
- [ ] **Phase 13: Platform Baseline & Adjacent** *(Track B — ongoing)* — Observability/Vault/idempotency/webhooks/status/FIX/sandbox; competing solvers, RFQ mode, primary issuance, coupon lifecycle

## Phase Details

### Phase 8: Demo Hardening

**Goal**: Turn Umbra's three superpowers (ledger-enforced privacy, the AI solver, atomic DvP) into interactive, visceral moments a judge *feels* — with near-zero new infrastructure, by exposing capabilities that already exist and hardening the AI-trust story.
**Depends on**: Milestone v1.0 (Phases 1–7 complete)
**Requirements**: WOW-01, WOW-02, WOW-03, WOW-04, WOW-05, TRUST-01, TRUST-02, TRUST-03
**Success Criteria** (what must be TRUE):

  1. A judge holding one desk's token attempts to fetch a rival desk's `Order` via the raw JSON Ledger API v2, in the UI, and gets an empty/403 result live — privacy proven at the wire, not in render logic (WOW-01).
  2. Forcing the solver to propose a wrong clearing price makes on-ledger `Round.Clear` reject the transaction on screen, while the correct deterministic clear still settles (WOW-02).
  3. A desk enters a plain-English order and Claude returns a correctly-structured sealed order; the solver streams its rationale live and emits a shareable post-round brief (WOW-03, WOW-04).
  4. The §8 fixtures run as a CI golden-eval suite (green on the $100.00 case); with the Anthropic API disabled a round still clears deterministically at $100.00; every round persists an immutable decision proof bundle (TRUST-01, TRUST-02, TRUST-03).
  5. After settlement, one click downloads a proof-pack PDF (clearing proof + per-desk receipts + AI decision bundle) (WOW-05).

**Plans**: 7 plans (5 waves)
Plans:

**Wave 1**

- [x] 08-01-PLAN.md — Foundation: :4000→:4100 port-drift fix + TRUST-01 CI (golden vitest + daml test) + gitignore solver/proofs/ + web/.env.example [TRUST-01]
- [x] 08-02-PLAN.md — WOW-01 try-to-peek adversarial privacy console on PrivacyView (raw v2 rival query → []/403 verdict) [WOW-01]

**Wave 2** *(blocked on 08-01)*

- [x] 08-03-PLAN.md — TRUST-02 degradation ladder + timeout (agent.ts) + WOW-03 parseOrder + POST /parse-order [TRUST-02, WOW-03]

**Wave 3** *(blocked on 08-03)*

- [x] 08-04-PLAN.md — WOW-04 streamRationale (SSE) + brief + WOW-02 tamperClear + POST /tamper-clear (verbatim on-ledger reject) [WOW-04, WOW-02]

**Wave 4** *(blocked on 08-04)*

- [x] 08-05-PLAN.md — TRUST-03 decision proof bundle (proof.ts, GET /round/:id/proof) + WOW-05 proof-pack PDF backend (proofpack.ts) [TRUST-03, WOW-05]
- [x] 08-06-PLAN.md — WOW-02 BreakTheAiPanel + WOW-03 NL sub-block + web solver.ts tamperClear/parseOrder [WOW-02, WOW-03]

**Wave 5** *(blocked on 08-05, 08-06)*

- [x] 08-07-PLAN.md — WOW-04 AgentRationale live SSE + RoundBrief + WOW-05 ProofPackButton on SettlementView [WOW-04, WOW-05]

### Phase 9: Auction Depth & Live Viz

**Goal**: Make the auction *real and legible* — richer institutional order types under an explicit, sovereign-grade rulebook, a privacy-safe live price-discovery view, and provable per-desk value.
**Depends on**: Phase 8 (trust harness), Phase 4/6 (solver + chart to extend)
**Requirements**: AUCT-01, AUCT-02, AUCT-03, AUCT-04, VIZ-01, WOW-06
**Success Criteria** (what must be TRUE):

  1. A desk can submit noncompetitive ("fill at clear"), MAQ/all-or-none, and conditional auto-firming orders in addition to sealed limits (AUCT-01).
  2. The clearing rulebook — maximize matched volume → minimize imbalance → pro-rata at the marginal price — is documented and enforced identically in `Clearing.daml` and the solver (AUCT-02).
  3. During the open window desks see an AGGREGATE indicative clearing price + net imbalance that never leaks an individual order, and the live crossing visualization assembles and locks p\* at close (AUCT-03, VIZ-01).
  4. After clear, each desk gets an exportable best-ex/TCA receipt (fill vs limit vs reference, surplus in bp) with an on-ledger surplus≥0 proof (AUCT-04).
  5. The cost-of-leakage simulator shows the same orders losing $X on a simulated public book vs $0 leaked on Umbra (WOW-06).

**Plans**: 7 plans (5 waves)
Plans:

**Wave 1**

- [x] 09-01-PLAN.md — Additive Daml+TS order model (orderType/minQty/firmIf, effective-limit) + regenerate web/daml.js + RULEBOOK.md skeleton; §4 stays green as a pure reduction [AUCT-01, AUCT-02]

**Wave 2** *(blocked on 09-01)*

- [x] 09-02-PLAN.md — Rulebook math I: coreClear + two-pass computeClearing refactor + Noncompetitive (Daml+TS lockstep) + golden fixtures; §4 stays $100.00, noncomp golden parity green [AUCT-01, AUCT-02]
- [x] 09-04-PLAN.md — AUCT-03 aggregate indicative feed (scalars-only, small-N guard, no curve leak) + VIZ-01 CrossingChart assembling↔locked + Theatre panel [AUCT-03, VIZ-01]

**Wave 3** *(blocked on 09-02)*

- [x] 09-03-PLAN.md — Rulebook math II: AON/MAQ bounded enumeration + Conditional two-pass (Daml+TS lockstep) + full golden parity gate; RULEBOOK complete [AUCT-01, AUCT-02]

**Wave 4** *(blocked on 09-03, 09-04)*

- [x] 09-05-PLAN.md — AUCT-04 TCA receipt + on-ledger surplusVsLimit≥0 proof (TradeConfirmation fields + Round.Clear) + solver/proof-pack surface + SettlementView two-distinct-surplus receipt [AUCT-04]
- [x] 09-06-PLAN.md — AUCT-01 order-type entry UI: OrderTicket LIMIT·NONCOMP·MAQ·COND selector + per-type params + type-aware SubmitOrder (desk plane) [AUCT-01]

**Wave 5** *(blocked on 09-05)*

- [x] 09-07-PLAN.md — WOW-06 cost-of-leakage simulator: pure client-side leakage.ts + SettlementView sim panel (dashed / SIMULATION / $X saved) [WOW-06]

**UI hint**: yes

### Phase 10: Cryptographic Privacy

**Goal**: Upgrade privacy from "rivals can't see you" to "the venue itself can't see you," and demote the AI from trusted to *verifiable* — via library-backed cryptography, sequenced ahead of a required expert review.
**Depends on**: Phase 8 (order/round flow), Phase 9 (order model)
**Requirements**: CRYP-01, CRYP-02, CRYP-03, VIZ-02
**Success Criteria** (what must be TRUE):

  1. Sealed orders are committed on-ledger as `hash(order‖salt)` during the window and revealed at close; `Round.Clear` rejects any revealed order that doesn't match its commitment; a non-revealing desk forfeits a bond (CRYP-01).
  2. Orders are timelock-encrypted (drand/tlock) and provably undecryptable — even by the operator/solver — until the window closes; composes with Canton per-party visibility (CRYP-02).
  3. A ZK proof-of-correct-clearing PoC runs §8 in a zkVM over the committed orders and produces a proof any party verifies off-ledger, anchored on-ledger, revealing no losing order (CRYP-03).
  4. A privacy time-machine reconstructs each party's exact view at each round stage (open→sealed→cleared→settled) from ledger events (VIZ-02).

  *Gate: a cryptographer's review is required before any of this crypto guards real value (tracked in Phase 13 / Track B).*

**Plans**: 10 plans (5 waves)
Plans:

**Wave 1**

- [x] 10-01-PLAN.md — CRYP-01 Daml: OrderCommitment + CommitOrder/RevealOrder (on-ledger sha256 binding) + ForfeitBond slash + ProofAnchor + §4 commit→reveal→clear seed + 5 Daml tests; Round.Clear byte-unchanged [CRYP-01, CRYP-03]
- [x] 10-02-PLAN.md — Crypto toolchain install (blocking legitimacy checkpoint + tlock-js/snarkjs/circomlibjs/circomlib + prebuilt circom.exe + Wave-0 test scaffolds) [CRYP-02, CRYP-03]

**Wave 2** *(blocked on Wave 1)*

- [x] 10-03-PLAN.md — CRYP-02 tlock.ts: quicknet timelock seal/open + drand round metadata + labeled offline fallback + tests [CRYP-02]
- [x] 10-04-PLAN.md — CRYP-03 zk: reduced clearing.circom + build + ESM prove/verify + anchor hashes + §4 fixtures + accept/tamper-reject tests [CRYP-03]
- [x] 10-05-PLAN.md — Solver ledger (bond forfeit + proof anchor + currentOffset) + timemachine stage→offset map + regenerate/commit web/daml.js [CRYP-01, VIZ-02]

**Wave 3** *(blocked on 10-03, 10-04, 10-05)*

- [x] 10-06-PLAN.md — Solver crypto API + index wiring: timelock / prove-verify-anchor-tamper / stage-offsets endpoints (zod + secret-safe) + api.test.ts secret sweep [CRYP-02, CRYP-03, VIZ-02]

**Wave 4** *(blocked on 10-06)*

- [x] 10-07-PLAN.md — web/src/solver.ts Phase-10 crypto client surface + pure no-credential URL test [CRYP-01, CRYP-02, CRYP-03, VIZ-02]

**Wave 5** *(blocked on 10-07; 10-08/10-10 also on 10-05)*

- [x] 10-08-PLAN.md — CRYP-01/02 OrderTicket commit→committed→timelocked→revealed/forfeited lifecycle (desk plane, T1/T2/T3 honest labeling) [CRYP-01, CRYP-02]
- [x] 10-09-PLAN.md — CRYP-03 ProofOfClearingPanel in SettlementView (T2 proof / T3 off-ledger verify / T1 anchor / tamper-reject / export) [CRYP-03]
- [x] 10-10-PLAN.md — VIZ-02 TimeMachineView (view 06) + Nav + App route + per-party redaction test [VIZ-02]

**UI hint**: yes

### Phase 11: Settlement & Institutional Grade

**Goal**: Replace the MVP settlement primitives with a production-grade, multi-party, compliance-gated settlement stack, and prove it across nodes.
**Depends on**: Phase 2 (Clear), Phase 9 (order/rulebook); relaxes the single-buyer + operator-custody MVP invariants
**Requirements**: DFIN-01, DFIN-02, DFIN-03, COMP-01, WOW-07, VIZ-03
**Success Criteria** (what must be TRUE):

  1. Settlement runs through Daml Finance Holding/Instrument/Account + a Batch/Instruction (allocate/approve) flow with explicit finality semantics; operator-custody `Asset` is retired; the §4 fixture still clears $100.00 and settles atomically (DFIN-01).
  2. `Round.Clear` clears a multi-buyer/multi-seller batch (single-funded-buyer invariant removed), optionally multilaterally netted, conserving cash and assets; the cash leg is token-agnostic (DFIN-02, DFIN-03).
  3. Only whitelisted, eligibility-checked (accreditation/jurisdiction/sanctions) desk parties can create an `Order` or hold the bond/cash asset; an ineligible party is rejected on-ledger (COMP-01).
  4. A guest joins as a 4th desk via QR/mobile and sees only their own fill; the three-node topology view shows orders resident on separate participants and the atomic cross-node settle (WOW-07, VIZ-03).

**Plans**: 11 plans (6 waves)
Plans:

**Wave 1**

- [ ] 11-01-PLAN.md — Instrument.daml + Holding.daml (token-agnostic CN-Token-Standard custody + bond lock; retire Asset) [DFIN-01, DFIN-03]
- [ ] 11-02-PLAN.md — Compliance.daml DeskEligibility keyed credential + isEligible + positive test [COMP-01]
- [ ] 11-03-PLAN.md — solver topology.ts (isLocal hosting probe) + /topology + guest-onboard.mjs (bankD + scoped token) [WOW-07, VIZ-03]

**Wave 2** *(blocked on 11-01)*

- [ ] 11-04-PLAN.md — Settlement.daml Batch/Instruction (buildInstructions/netLegs/conservationOk/settleBatch) + netting-conserves test [DFIN-02, DFIN-03]

**Wave 3** *(blocked on 11-01/11-02/11-04)*

- [ ] 11-05-PLAN.md — Round.Clear Batch rewrite (drop single-buyer guard, conservation asserts, cashInstrument) + eligibility gate + Holding bond + Setup/Tests migration; §4 clears $100.00 [DFIN-01, DFIN-02, DFIN-03, COMP-01]

**Wave 4** *(blocked on 11-05)*

- [ ] 11-06-PLAN.md — Daml goldens: multibuyer 2x2 + cash-agnostic + ineligible-rejected (both points) + guest-fill privacy [DFIN-02, DFIN-03, COMP-01, WOW-07]
- [ ] 11-07-PLAN.md — solver settle() → Holding cids + N-buyer + cashInstrument; settlement.ts netLegs mirror + 2x2 TS golden (parity) [DFIN-02, DFIN-03]

**Wave 5** *(blocked on 11-05/11-06/11-03)*

- [ ] 11-08-PLAN.md — Regenerate+commit web/daml.js + guest desk (bankD) plumbing + Nav view 07 + solver.ts topology/settlement-meta client [DFIN-01, WOW-07, VIZ-03]

**Wave 6** *(blocked on 11-08; views also on 11-03/11-07)*

- [ ] 11-09-PLAN.md — TopologyView (view 07) + TopologyNode + demo-real badge + AtomicStamp cross-node settle [VIZ-03]
- [ ] 11-10-PLAN.md — Guest /join mobile (OrderTicket/FillCard reuse) + QrJoin (qrcode.react gate / SVG) + Theatre QR host + verbatim COMP-01 reject [WOW-07, COMP-01]
- [ ] 11-11-PLAN.md — SettlementView/DvpLegs deltas: Batch finality grammar + honest provenance tag + netting toggle + token-agnostic cash + guest row [DFIN-01, DFIN-02, DFIN-03, WOW-07]

**UI hint**: yes

### Phase 12: Real On-Chain (Canton DevNet) — *parallel Track A*

**Goal**: Take Umbra off LocalNet onto the real Canton Network (DevNet), on real auth/ops — the frozen DAR ports unchanged; the work is the connection/auth/ops layer plus the external sponsor gate.
**Depends on**: Milestone v1.0 (portable DAR). Runs in PARALLEL with Phases 8–11. **Start the SV-sponsor / hosted-node outreach immediately — it is an external, days–weeks lead time, not code.**
**Requirements**: CHAIN-01, CHAIN-02, CHAIN-03, IDEN-01, IDEN-02, IDEN-03
**Success Criteria** (what must be TRUE):

  1. A Canton participant/validator node connects to the real Global Synchronizer on DevNet — self-hosted (Splice Docker Compose) or via a NaaS provider — sponsored by a Super Validator (CHAIN-01).
  2. The frozen Umbra DAR is uploaded + vetted on the DevNet participant, desk parties are allocated, and the §4 fixture runs end-to-end on real Canton, still clearing $100.00 (CHAIN-02).
  3. The unsafe HMAC JWT is replaced by real OIDC (Keycloak) over TLS — solver uses client-credentials, desks use auth-code; per-desk RBAC + MFA + scoped, revocable API keys are enforced (IDEN-01, IDEN-02).
  4. A Compliance role must approve the solver's clearing price before `Round.Clear` commits (four-eyes) (IDEN-03).
  5. The node runs unattended on isolated per-network Postgres with monitoring, backups, and Canton Coin auto-top-up (CHAIN-03).

### Phase 13: Platform Baseline & Adjacent — *Track B (ongoing)*

**Goal**: The operational baseline any serious venue is assumed to have, plus the adjacent capabilities that widen Umbra's story — built opportunistically alongside the waves, with external dependencies scheduled.
**Depends on**: Cross-cutting; incremental across the milestone
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, ADJ-01, ADJ-02, ADJ-03
**Success Criteria** (what must be TRUE):

  1. OpenTelemetry tracing spans solver → JSON Ledger API v2 → Canton; structured logs, metrics, and alerting are in place; a public status page reports venue/round health (OPS-01).
  2. Secrets (ANTHROPIC_API_KEY, party tokens) live in a vault with rotation (not `.env`); order submission is idempotent (a retry never double-submits) under a round-lifecycle state machine (OPS-02, OPS-03).
  3. Signed, retried webhooks fire for round-lifecycle events; a sandbox round fixed at the $100.00 fixture exists; a FIX order-entry gateway accepts sealed bids (OPS-04, OPS-05).
  4. Competing AI solvers race, refereed by the deterministic recompute; an RFQ side-mode and a primary-issuance / coupon-lifecycle capability are available (ADJ-01, ADJ-02, ADJ-03).

  *External dependencies scheduled here: a cryptographer's review (gates Phase 10 for real value), a KYC/AML vendor (backs COMP-01), and a SOC 2 engagement.*

**Plans**: 14 plans (6 waves)
Plans:

**Wave 1** *(pure standalone modules + RFQ Daml — parallel)*

- [x] 13-01-PLAN.md — OPS-01 observability modules: OTel install (dep-legitimacy checkpoint) + telemetry.ts + secret-redacting logger.ts + alerts/umbra-rules.yml [OPS-01]
- [x] 13-02-PLAN.md — OPS-02 secrets.ts (SecretsProvider env|vault) + status.ts (S1 token-free /status + /status.html) + dev Vault compose + rotate script + runbook [OPS-02]
- [x] 13-03-PLAN.md — OPS-03 idempotency.ts middleware + fsm.ts round-lifecycle guard (Sealed display alias) [OPS-03]
- [x] 13-04-PLAN.md — OPS-04 webhooks.ts (HMAC sign/retry/log) + sandbox.ts (§4 fixture asserts $100.00) [OPS-04]
- [ ] 13-05-PLAN.md — OPS-05 fix.ts hand-rolled FIX 4.4 subset (framing/parse/build/session, known-good vector) [OPS-05]
- [ ] 13-06-PLAN.md — ADJ-02 Rfq.daml keyless RfqRequest+firm Quote+AcceptQuote (settleBatch) + Tests.daml RFQ scenarios [ADJ-02]

**Wave 2** *(blocked on Wave 1)*

- [ ] 13-07-PLAN.md — OPS-01/02/03 API integration: telemetry-first boot + SIGTERM + spans/metrics + /health + /status + SecretsProvider wiring + idempotency mw + FSM guard [OPS-01, OPS-02, OPS-03]
- [ ] 13-08-PLAN.md — ADJ-03 Issuance.daml keyless uniform-price mint (reuse §8) + Coupon/Redeem + Tests.daml + regenerate/commit web/daml.js [ADJ-03]

**Wave 3** *(blocked on 13-07)*

- [ ] 13-09-PLAN.md — OPS-04/05 integration surfaces: lifecycle webhook emits + register endpoints + POST /sandbox/round + POST /fix [OPS-04, OPS-05]
- [ ] 13-10-PLAN.md — ADJ-01 agent.ts proposeCompeting (referee = deterministic §8; additive, off settlement path) [ADJ-01]

**Wave 4** *(blocked on 13-08, 13-09, 13-10)*

- [ ] 13-11-PLAN.md — ADJ orchestration + endpoints: ledger.ts RFQ+issuance wrappers + POST /competing + /rfq* + /issuance* [ADJ-01, ADJ-02, ADJ-03]

**Wave 5** *(blocked on 13-11)*

- [ ] 13-12-PLAN.md — web solver.ts client seam (competing/RFQ/issuance, credential-free) + S2 SolverLeaderboard on Agent view [ADJ-01]

**Wave 6** *(blocked on 13-12)*

- [ ] 13-13-PLAN.md — ADJ-02 S3 RfqPanel on Desk view (reuse DvpLegs + AtomicStamp) [ADJ-02]
- [ ] 13-14-PLAN.md — ADJ-03 S4 IssuancePanel on Theatre view (OPTIONAL — reuse CrossingChart + PriceReveal; droppable) [ADJ-03]

**UI hint**: yes

## v2.0 Progress

**Execution Order:**
Build waves run in numeric order 8 → 9 → 10 → 11. Track A (Phase 12) runs **in parallel** and its external SV-sponsor gate starts on day 1. Track B (Phase 13) is ongoing/incremental across the milestone.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Demo Hardening | 7/7 | Built · live UAT pending | 2026-07-09 |
| 9. Auction Depth & Live Viz | 7/7 | Built · live UAT pending | 2026-07-09 |
| 10. Cryptographic Privacy | 10/10 | Built · live UAT pending | 2026-07-10 |
| 11. Settlement & Institutional Grade | 11/11 | Built · live UAT pending | 2026-07-10 |
| 12. Real On-Chain (Canton DevNet) | 5/5 | Built · live UAT + external SV gate pending | 2026-07-10 |
| 13. Platform Baseline & Adjacent | 4/14 | In Progress|  |
