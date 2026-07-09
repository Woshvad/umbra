# Requirements: Umbra

**Defined:** 2026-06-25
**Core Value:** The privacy money shot — three desks submit sealed orders blind to each other, an AI solver clears them at one uniform price ($100.00 on the canonical fixture), and the whole batch settles atomically in a single Canton transaction.

> Derived from the locked spec (`spec.md`, esp. §3–§16) and `.planning/research/`. Every product decision is fixed; these requirements make the spec checkable. The canonical §4 fixture is the single correctness reference.

## v1 Requirements

Requirements for the hackathon MVP. Each maps to a roadmap phase.

### Ledger & Setup (LEDG)

- [x] **LEDG-01**: Daml project compiles with templates `Asset`, `Venue`, `Order`, `Round`, `RoundStats`, `TradeConfirmation` (per §7), and `daml start` runs the sandbox + HTTP JSON API on :7575
- [x] **LEDG-02**: `Setup.daml` allocates parties Operator/BankA/BankB/BankC and mints the §4 holdings (A→5,000 USDCx; B→20 BONDX + 1,000 USDCx; C→15 BONDX + 1,000 USDCx); party IDs/tokens are written to a generated `parties.json`/`.env` for the solver + frontend
- [x] **LEDG-03**: `Asset` is operator-custodied (signatory operator, observer owner) and supports Split/Merge/Reassign used only by the Operator inside settlement
- [x] **LEDG-04**: The installed Daml SDK version is detected, `daml.yaml` pins it, and the version + API line (2.x HTTP JSON API) is recorded in `DECISIONS.md` before any other build work (version-drift gate)

### Order Submission & Clearing (CLEAR)

- [x] **CLEAR-01**: A registered desk can submit exactly one sealed order per round (side Buy/Sell, integer qty > 0, decimal limit > 0) via `Venue.SubmitOrder`; the created `Order` is signed by operator + desk; the ticket disables after submit
- [x] **CLEAR-02**: The deterministic clearing algorithm (§8) computes the uniform price p\* that maximizes matched volume, with the two-level tie-break — minimize |demand − supply| **only among max-matched candidates**, then choose the lower price — rounded to 2 decimals
- [x] **CLEAR-03**: Allocation fills the short side fully and rations the long side by price priority then pro-rata, with integer rounding that never exceeds matched volume (deterministic leftover-to-largest rule, identical in TS and Daml)
- [x] **CLEAR-04**: The canonical §4 fixture clears at exactly **$100.00** with fills A=10 / B=8 / C=2 (C residual 3) — asserted in `test_clears_at_100`
- [x] **CLEAR-05**: The clearing algorithm is implemented in TypeScript (solver) and re-verified inside the Daml `Round.Clear` choice; both produce identical results

### Settlement (SETL)

- [x] **SETL-01**: `Round.Clear` settles the batch atomically in one transaction — reassigns BONDX & USDCx at p\* (split/merge as needed) and issues a `TradeConfirmation` per participating desk; sets `Round.status = Settled`
- [x] **SETL-02**: Post-settlement balances exactly match §4 (A: 10/4,000 · B: 12/1,800 · C: 13/1,200); cash and assets are conserved — asserted in `test_settled_balances`
- [x] **SETL-03**: If any leg fails (e.g., a seller lacks the asset), `Round.Clear` fails and **no** balances change (all-or-nothing) — asserted in `test_atomicity`
- [x] **SETL-04**: `Round.Clear` rejects any allocation violating max-volume, limit compliance, or conservation — asserted in `test_clear_rejects_bad_allocation`

### Privacy (PRIV)

- [x] **PRIV-01**: An `Order` is visible only to operator + desk; a JSON-API query as BankA returns BankA's order and **zero** of BankB/BankC's orders (and symmetrically) — asserted in `test_privacy_orders`
- [x] **PRIV-02**: Pre-clear, desks see only `RoundStats.sealedOrderCount` (a count), never order contents; the Operator updates the count as orders arrive
- [x] **PRIV-03**: A `TradeConfirmation` is observed only by its desk; BankA cannot see BankB's fill — asserted in `test_privacy_confirmations`
- [x] **PRIV-04**: `Asset` holdings are visible only to owner + operator
- [x] **PRIV-05**: The frontend authenticates as each party using that party's own JSON-API token, so it structurally cannot fetch other desks' private data (privacy enforced at the API boundary, not in render logic)

### Solver Service (SOLV)

- [x] **SOLV-01**: The solver service (Node/TS, runs as Operator) opens a `Round`, maintains `RoundStats.sealedOrderCount`, enforces the 60s window (`ROUND_SECONDS`), and closes the round (`CloseRound`)
- [x] **SOLV-02**: On close, the service reads the sealed orders, computes/verifies the clearing, and exercises `Round.Clear`
- [x] **SOLV-03**: The service exposes an HTTP API on :4000 — `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle` — so the frontend can drive the demo without ledger-admin rights
- [x] **SOLV-04**: The Anthropic key and Operator credentials are never exposed to the browser; the browser talks only to the solver service and to the JSON API as individual desk parties
- [x] **SOLV-05**: TypeScript unit tests cover the clearing algorithm on ≥5 scenarios (exact same-limit ties, all-or-nothing imbalance, no-cross, and the §4 case)

### AI Solver Agent (AGENT)

- [x] **AGENT-01**: On round close, the Solver Agent ingests the sealed batch and **proposes** a clearing (price + allocation) by calling Claude with a structured prompt that returns strict JSON, temperature 0
- [x] **AGENT-02**: The service recomputes the deterministic result and only submits an allocation that passes verification; the AI's numbers are never used unverified (verify-don't-trust)
- [x] **AGENT-03**: Claude returns a 2–3 sentence natural-language rationale for the clearing, rendered in the Solver Agent panel
- [x] **AGENT-04**: The prompt contract (system rules verbatim, batch JSON, required JSON response shape) is documented in `solver/PROMPT.md`

### Frontend Views (UI)

- [x] **UI-01**: A party switcher in the top bar impersonates BankA/BankB/BankC/Operator, each using that party's token; a round status indicator (Open · Closed · Cleared · Settled) + live countdown is shown
- [x] **UI-02**: Desk view (A/B/C) shows the order ticket (one order per round, with a "load demo order" affordance pre-filling the §4 values), your sealed order + status, your live BONDX/USDCx holdings, and — after settlement — your `TradeConfirmation`
- [x] **UI-03**: Privacy view (the money shot) renders three desk panels side by side, **each with that desk's own credentials**, plus a center column showing the shared `RoundStats` count, with a redaction motif on the "other" columns
- [x] **UI-04**: Auction theatre (Operator) shows a 60s countdown ring + live `sealedOrderCount`, and a "Close & Solve" action that triggers `solve-preview` and reveals the uniform clearing price as a hero moment
- [x] **UI-05**: A hand-rolled SVG supply/demand crossing chart shows the step demand (down) and supply (up) curves and marks p\* where matched volume is maximized
- [x] **UI-06**: A "Settle atomically" action plays the atomic-settlement animation (all legs snap simultaneously) and shows before/after balances; the settlement ledger renders the DvP legs (A↔B 8@100, A↔C 2@100) with a single "one transaction" badge
- [x] **UI-07**: The frontend follows the binding design comp (`Umbra design/`) **100%** — color tokens, typography (Space Grotesk / IBM Plex Mono / Inter), layout, the redaction + draw-on motifs, and all five numbered views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent · 05 Settlement)

### Demo & Acceptance (DEMO)

- [x] **DEMO-01**: `make demo` orchestrates ledger + setup + solver + web and opens the 3-up view; a `Makefile` + `README.md` document every command so a stranger can run it
- [x] **DEMO-02**: All Daml Script tests pass (`test_clears_at_100`, `test_settled_balances`, `test_atomicity`, `test_privacy_orders`, `test_privacy_confirmations`, `test_clear_rejects_bad_allocation`)
- [x] **DEMO-03**: The E2E acceptance flow runs live — three desks submit blind → 3-up proves no cross-visibility → solver reveals 100.00 with rationale → one-click atomic settle → each desk sees only its own fill, Operator sees the aggregate
- [x] **DEMO-04**: Screenshots of (a) the 3-up blindness and (b) the atomic settlement are captured into `docs/`, and a 3-minute demo script is written

## v2 Requirements

Deferred to post-hackathon. Spec §19 stretch — do **not** start before the polish phase.

### Stretch (STR)

- **STR-01**: Replace operator-custody `Asset` with Daml Finance `Holding`/`Instrument`/`Account` and settle via `Batch`/`Instruction` (allocate/approve) for production-grade DvP
- **STR-02**: Deploy the DAR to `cn-quickstart` Canton LocalNet; run desks on separate participant nodes to demonstrate true cross-node sub-transaction privacy
- **STR-03**: Competing AI solvers — N agents ranked by matched volume / price improvement, shown racing in the UI
- **STR-04**: Residual routing — route unfilled residual (e.g., C's 3 units) to a mock on-network liquidity venue ("→ Cantex")
- **STR-05**: Multiple rounds and order cancel/replace

## Milestone v2.0 Requirements — Production Hardening & Real On-Chain

Scoped for milestone v2.0. Grounded in the **current** stack (Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2), not the v1 2.x plan. The v1 "Stretch (STR)" items above are **absorbed** here: STR-01 → DFIN-01/02; STR-02 (cross-node LocalNet) → already shipped in the v1→3.4 migration, extended by CHAIN-*; STR-03 → ADJ-01; STR-04 → ADJ-02; STR-05 → AUCT-01 + OPS-03.

### Judge-Facing "Wow" (WOW)

- [x] **WOW-01**: A judge holding one desk's token can attempt to fetch a rival desk's `Order` via the raw JSON Ledger API v2 in the UI and see it return empty/403 live — privacy proven at the wire, not in render logic
- [x] **WOW-02**: A demo control can force the solver to propose a wrong clearing price; on-ledger `Round.Clear` re-verification rejects the transaction on screen while the correct deterministic clear still settles
- [x] **WOW-03**: A desk can enter a plain-English order ("buy up to 10 under 101") and Claude parses it into a validated structured sealed order for confirmation
- [x] **WOW-04**: The solver streams its clearing rationale as it computes and produces a shareable post-round natural-language brief
- [x] **WOW-05**: After settlement, one click downloads an on-brand proof-pack PDF (clearing proof + per-desk best-ex receipts + finality record + AI decision bundle)
- [ ] **WOW-06**: A cost-of-leakage simulator runs the same orders through a simulated public order book (front-run/slippage → $ lost) beside Umbra's sealed clear ($0 leaked)
- [ ] **WOW-07**: A judge/guest can become a 4th desk via a QR → mobile page, submit a sealed bid, and see only their own fill

### AI Solver Trust Hardening (TRUST)

- [x] **TRUST-01**: The §8 clearing fixtures run as a CI golden-eval suite that must pass on every solver change (regression gate for the clearing math + the AI verify gate)
- [x] **TRUST-02**: The Claude call uses strict structured outputs and gracefully degrades to the pure deterministic §8 solver on API unavailability/timeout/over-budget, so a round never stalls (canonical case still clears $100.00)
- [x] **TRUST-03**: Every round records an immutable "decision proof bundle" (prompt, model ID, raw AI proposal, deterministic recompute, on-ledger clearing hash) as a first-class auditable artifact

### Auction Depth (AUCT)

- [ ] **AUCT-01**: Desks can submit richer order types — noncompetitive ("fill at clear"), minimum-acceptable-quantity / all-or-none, and conditional auto-firming — in addition to plain sealed limits
- [ ] **AUCT-02**: The deterministic clearing rulebook (maximize matched volume → minimize imbalance → pro-rata at the marginal price) is documented and enforced identically in `Clearing.daml` and the solver
- [x] **AUCT-03**: During the open window, desks see a privacy-safe AGGREGATE indicative clearing price + net imbalance (never an individual order), updated as sealed orders arrive *(09-04; scalars-only feed + small-N guard unit-proven — live "updates as orders arrive" = end-of-phase human-check)*
- [ ] **AUCT-04**: After clear, each desk receives an exportable best-execution/TCA receipt (fill vs limit vs reference price, surplus in bp) with an on-ledger surplus≥0 proof

### Cryptographic Privacy (CRYP)

- [ ] **CRYP-01**: Sealed orders use on-ledger commit–reveal — a desk posts `hash(order‖salt)` during the window and reveals at close; `Round.Clear` re-checks each revealed order against its commitment; non-reveal forfeits a bond
- [ ] **CRYP-02**: Orders are timelock-encrypted (drand/tlock) so they are undecryptable — even by the operator/solver — until the window closes; composes with Canton per-party visibility
- [ ] **CRYP-03**: A ZK proof-of-correct-clearing PoC runs §8 in a zkVM over the committed orders and produces a proof any party verifies off-ledger (anchored on-ledger), revealing no losing order

### Settlement — Daml Finance (DFIN)

- [ ] **DFIN-01**: Settlement uses Daml Finance Holding/Instrument/Account and a Batch/Instruction (allocate/approve) flow with explicit settlement-finality semantics, replacing operator-custody `Asset`
- [ ] **DFIN-02**: `Round.Clear` generalizes beyond the single-funded-buyer invariant to multi-buyer/multi-seller crossing, with optional multilateral netting of the batch
- [ ] **DFIN-03**: The cash leg is token-agnostic (tokenized deposit / stablecoin / wholesale CBDC) via a pluggable settlement asset

### Compliance (COMP)

- [ ] **COMP-01**: Participation is gated on-ledger — only whitelisted, eligibility-checked (accreditation/jurisdiction/sanctions) desk parties may create an `Order` or hold the bond/cash asset (ERC-3643 analog; real KYC vendor integration deferred to Track B)

### Visualization (VIZ)

- [x] **VIZ-01**: A live supply/demand crossing visualization assembles the aggregate curve as orders arrive and locks the clearing price at close *(09-04; CrossingChart assembling↔locked, curve.ts §4 marker intact — live assemble = end-of-phase human-check)*
- [ ] **VIZ-02**: A privacy "time-machine" replay reconstructs each party's exact view across the round timeline (open→sealed→cleared→settled) from ledger events
- [ ] **VIZ-03**: A live three-node topology view shows each desk's order resident on its own Canton participant and the settlement transaction spanning all three atomically

### On-Chain / Canton DevNet (CHAIN)

- [ ] **CHAIN-01**: A Canton participant/validator node connects to the real Global Synchronizer on DevNet (self-hosted Splice Docker Compose or a hosted NaaS provider), sponsored by a Super Validator *(external gate)*
- [ ] **CHAIN-02**: The frozen Umbra DAR is uploaded + vetted on the DevNet participant, desk parties are allocated, and the canonical §4 fixture runs end-to-end on real Canton (still clears $100.00)
- [ ] **CHAIN-03**: Ops hardening — isolated per-network PostgreSQL, backups, monitoring, Canton Coin traffic auto-top-up — so the node runs unattended

### Identity & Access (IDEN)

- [ ] **IDEN-01**: The dev-grade unsafe HMAC JWT is replaced by a real OIDC issuer (Keycloak) over TLS; the solver uses client-credentials tokens and desks use auth-code tokens
- [ ] **IDEN-02**: Per-desk RBAC roles (Trader / Compliance / Admin), MFA on settlement-affecting actions, and scoped, revocable API keys
- [ ] **IDEN-03**: A four-eyes gate where a Compliance role approves the solver's clearing price before `Round.Clear` commits

### Platform Baseline (OPS)

- [ ] **OPS-01**: Observability — OpenTelemetry tracing across solver → JSON Ledger API v2 → Canton, structured logs, metrics, and alerting
- [ ] **OPS-02**: Secrets (ANTHROPIC_API_KEY, party tokens) move from `.env` into a vault with rotation; a public status page reports venue/round health
- [ ] **OPS-03**: Idempotency keys on order submission (a retry never double-submits) under a round-lifecycle state machine enforcing legal transitions
- [ ] **OPS-04**: Signed, retried webhooks for round-lifecycle events (round.opened/sealed/cleared/settled, fill.posted) and a sandbox round fixed at the $100.00 fixture
- [ ] **OPS-05**: A FIX order-entry gateway so institutional desks submit sealed bids from their existing OMS

### Adjacent (ADJ)

- [ ] **ADJ-01**: Competing AI solvers — N solver instances/configs ranked by matched volume / surplus, refereed by the deterministic recompute (spec §19 STR-03)
- [ ] **ADJ-02**: An RFQ side-mode for illiquid single bonds — request a signed firm quote, settled via the same atomic Canton DvP path
- [ ] **ADJ-03**: On-chain primary bond issuance (uniform-price EasyAuction model) and a post-settlement coupon/redemption lifecycle module

> **External dependencies** (scheduled in Track B, not code deliverables): a cryptographer's review (gates CRYP-* for real value), a KYC/AML vendor (backs COMP-01), and a SOC 2 engagement. **Known limitation:** true 3-desk privacy needs 3 real institutions each running their own validator; a single-operator DevNet node is "demo-real."

## Out of Scope

Explicitly excluded (spec §1 non-goals). Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-asset cross-auctions | One bond (BONDX) vs one cash token (USDCx) keeps the mechanism demoable |
| Real fiat / KYC onboarding | Not core to the privacy + atomicity thesis |
| Production key management / mainnet deployment | Hackathon MVP runs on the dev sandbox |
| Continuous trading / live order book | Umbra is a *batch* auction by design — the differentiator vs a continuous private book |
| Order cancel / replace (in MVP) | A desk submits once per round; cancel/replace is v2 stretch (STR-05) |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LEDG-01 | Phase 1 | Complete (01-03; :7575 runtime smoke = human-check) |
| LEDG-02 | Phase 1 | Complete (01-03) |
| LEDG-03 | Phase 1 | Complete (01-03) |
| LEDG-04 | Phase 1 | Complete (01-01) |
| CLEAR-01 | Phase 3 | Complete |
| CLEAR-02 | Phase 4 | Complete (04-01) |
| CLEAR-03 | Phase 4 | Complete (04-01) |
| CLEAR-04 | Phase 2 | Complete |
| CLEAR-05 | Phase 2 | Complete |
| SETL-01 | Phase 2 | Complete |
| SETL-02 | Phase 2 | Complete |
| SETL-03 | Phase 2 | Complete |
| SETL-04 | Phase 2 | Complete |
| PRIV-01 | Phase 3 | Complete |
| PRIV-02 | Phase 3 | Complete |
| PRIV-03 | Phase 3 | Complete |
| PRIV-04 | Phase 3 | Complete |
| PRIV-05 | Phase 3 | Complete |
| SOLV-01 | Phase 4 | Complete |
| SOLV-02 | Phase 4 | Complete |
| SOLV-03 | Phase 4 | Complete |
| SOLV-04 | Phase 4 | Complete (04-02) |
| SOLV-05 | Phase 4 | Complete (04-01) |
| AGENT-01 | Phase 5 | Complete |
| AGENT-02 | Phase 5 | Complete |
| AGENT-03 | Phase 5 | Complete |
| AGENT-04 | Phase 5 | Complete |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 6 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 6 | Complete |
| UI-05 | Phase 6 | Complete |
| UI-06 | Phase 6 | Complete |
| UI-07 | Phase 7 | Complete |
| DEMO-01 | Phase 7 | Complete |
| DEMO-02 | Phase 7 | Complete |
| DEMO-03 | Phase 7 | Complete |
| DEMO-04 | Phase 7 | Complete |

**Coverage:**

- v1 requirements: 38 total
- Mapped to phases: 38 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-27 — all 38 v1 requirements Complete (Phase 7 closed; milestone v1.0 done).*
