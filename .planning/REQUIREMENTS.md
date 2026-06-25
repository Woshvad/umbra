# Requirements: Umbra

**Defined:** 2026-06-25
**Core Value:** The privacy money shot — three desks submit sealed orders blind to each other, an AI solver clears them at one uniform price ($100.00 on the canonical fixture), and the whole batch settles atomically in a single Canton transaction.

> Derived from the locked spec (`spec.md`, esp. §3–§16) and `.planning/research/`. Every product decision is fixed; these requirements make the spec checkable. The canonical §4 fixture is the single correctness reference.

## v1 Requirements

Requirements for the hackathon MVP. Each maps to a roadmap phase.

### Ledger & Setup (LEDG)

- [ ] **LEDG-01**: Daml project compiles with templates `Asset`, `Venue`, `Order`, `Round`, `RoundStats`, `TradeConfirmation` (per §7), and `daml start` runs the sandbox + HTTP JSON API on :7575
- [ ] **LEDG-02**: `Setup.daml` allocates parties Operator/BankA/BankB/BankC and mints the §4 holdings (A→5,000 USDCx; B→20 BONDX + 1,000 USDCx; C→15 BONDX + 1,000 USDCx); party IDs/tokens are written to a generated `parties.json`/`.env` for the solver + frontend
- [ ] **LEDG-03**: `Asset` is operator-custodied (signatory operator, observer owner) and supports Split/Merge/Reassign used only by the Operator inside settlement
- [ ] **LEDG-04**: The installed Daml SDK version is detected, `daml.yaml` pins it, and the version + API line (2.x HTTP JSON API) is recorded in `DECISIONS.md` before any other build work (version-drift gate)

### Order Submission & Clearing (CLEAR)

- [ ] **CLEAR-01**: A registered desk can submit exactly one sealed order per round (side Buy/Sell, integer qty > 0, decimal limit > 0) via `Venue.SubmitOrder`; the created `Order` is signed by operator + desk; the ticket disables after submit
- [ ] **CLEAR-02**: The deterministic clearing algorithm (§8) computes the uniform price p\* that maximizes matched volume, with the two-level tie-break — minimize |demand − supply| **only among max-matched candidates**, then choose the lower price — rounded to 2 decimals
- [ ] **CLEAR-03**: Allocation fills the short side fully and rations the long side by price priority then pro-rata, with integer rounding that never exceeds matched volume (deterministic leftover-to-largest rule, identical in TS and Daml)
- [ ] **CLEAR-04**: The canonical §4 fixture clears at exactly **$100.00** with fills A=10 / B=8 / C=2 (C residual 3) — asserted in `test_clears_at_100`
- [ ] **CLEAR-05**: The clearing algorithm is implemented in TypeScript (solver) and re-verified inside the Daml `Round.Clear` choice; both produce identical results

### Settlement (SETL)

- [ ] **SETL-01**: `Round.Clear` settles the batch atomically in one transaction — reassigns BONDX & USDCx at p\* (split/merge as needed) and issues a `TradeConfirmation` per participating desk; sets `Round.status = Settled`
- [ ] **SETL-02**: Post-settlement balances exactly match §4 (A: 10/4,000 · B: 12/1,800 · C: 13/1,200); cash and assets are conserved — asserted in `test_settled_balances`
- [ ] **SETL-03**: If any leg fails (e.g., a seller lacks the asset), `Round.Clear` fails and **no** balances change (all-or-nothing) — asserted in `test_atomicity`
- [ ] **SETL-04**: `Round.Clear` rejects any allocation violating max-volume, limit compliance, or conservation — asserted in `test_clear_rejects_bad_allocation`

### Privacy (PRIV)

- [ ] **PRIV-01**: An `Order` is visible only to operator + desk; a JSON-API query as BankA returns BankA's order and **zero** of BankB/BankC's orders (and symmetrically) — asserted in `test_privacy_orders`
- [ ] **PRIV-02**: Pre-clear, desks see only `RoundStats.sealedOrderCount` (a count), never order contents; the Operator updates the count as orders arrive
- [ ] **PRIV-03**: A `TradeConfirmation` is observed only by its desk; BankA cannot see BankB's fill — asserted in `test_privacy_confirmations`
- [ ] **PRIV-04**: `Asset` holdings are visible only to owner + operator
- [ ] **PRIV-05**: The frontend authenticates as each party using that party's own JSON-API token, so it structurally cannot fetch other desks' private data (privacy enforced at the API boundary, not in render logic)

### Solver Service (SOLV)

- [ ] **SOLV-01**: The solver service (Node/TS, runs as Operator) opens a `Round`, maintains `RoundStats.sealedOrderCount`, enforces the 60s window (`ROUND_SECONDS`), and closes the round (`CloseRound`)
- [ ] **SOLV-02**: On close, the service reads the sealed orders, computes/verifies the clearing, and exercises `Round.Clear`
- [ ] **SOLV-03**: The service exposes an HTTP API on :4000 — `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle` — so the frontend can drive the demo without ledger-admin rights
- [ ] **SOLV-04**: The Anthropic key and Operator credentials are never exposed to the browser; the browser talks only to the solver service and to the JSON API as individual desk parties
- [ ] **SOLV-05**: TypeScript unit tests cover the clearing algorithm on ≥5 scenarios (exact same-limit ties, all-or-nothing imbalance, no-cross, and the §4 case)

### AI Solver Agent (AGENT)

- [ ] **AGENT-01**: On round close, the Solver Agent ingests the sealed batch and **proposes** a clearing (price + allocation) by calling Claude with a structured prompt that returns strict JSON, temperature 0
- [ ] **AGENT-02**: The service recomputes the deterministic result and only submits an allocation that passes verification; the AI's numbers are never used unverified (verify-don't-trust)
- [ ] **AGENT-03**: Claude returns a 2–3 sentence natural-language rationale for the clearing, rendered in the Solver Agent panel
- [ ] **AGENT-04**: The prompt contract (system rules verbatim, batch JSON, required JSON response shape) is documented in `solver/PROMPT.md`

### Frontend Views (UI)

- [ ] **UI-01**: A party switcher in the top bar impersonates BankA/BankB/BankC/Operator, each using that party's token; a round status indicator (Open · Closed · Cleared · Settled) + live countdown is shown
- [ ] **UI-02**: Desk view (A/B/C) shows the order ticket (one order per round, with a "load demo order" affordance pre-filling the §4 values), your sealed order + status, your live BONDX/USDCx holdings, and — after settlement — your `TradeConfirmation`
- [ ] **UI-03**: Privacy view (the money shot) renders three desk panels side by side, **each with that desk's own credentials**, plus a center column showing the shared `RoundStats` count, with a redaction motif on the "other" columns
- [ ] **UI-04**: Auction theatre (Operator) shows a 60s countdown ring + live `sealedOrderCount`, and a "Close & Solve" action that triggers `solve-preview` and reveals the uniform clearing price as a hero moment
- [ ] **UI-05**: A hand-rolled SVG supply/demand crossing chart shows the step demand (down) and supply (up) curves and marks p\* where matched volume is maximized
- [ ] **UI-06**: A "Settle atomically" action plays the atomic-settlement animation (all legs snap simultaneously) and shows before/after balances; the settlement ledger renders the DvP legs (A↔B 8@100, A↔C 2@100) with a single "one transaction" badge
- [ ] **UI-07**: The frontend follows the binding design comp (`Umbra design/`) **100%** — color tokens, typography (Space Grotesk / IBM Plex Mono / Inter), layout, the redaction + draw-on motifs, and all five numbered views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent · 05 Settlement)

### Demo & Acceptance (DEMO)

- [ ] **DEMO-01**: `make demo` orchestrates ledger + setup + solver + web and opens the 3-up view; a `Makefile` + `README.md` document every command so a stranger can run it
- [ ] **DEMO-02**: All Daml Script tests pass (`test_clears_at_100`, `test_settled_balances`, `test_atomicity`, `test_privacy_orders`, `test_privacy_confirmations`, `test_clear_rejects_bad_allocation`)
- [ ] **DEMO-03**: The E2E acceptance flow runs live — three desks submit blind → 3-up proves no cross-visibility → solver reveals 100.00 with rationale → one-click atomic settle → each desk sees only its own fill, Operator sees the aggregate
- [ ] **DEMO-04**: Screenshots of (a) the 3-up blindness and (b) the atomic settlement are captured into `docs/`, and a 3-minute demo script is written

## v2 Requirements

Deferred to post-hackathon. Spec §19 stretch — do **not** start before the polish phase.

### Stretch (STR)

- **STR-01**: Replace operator-custody `Asset` with Daml Finance `Holding`/`Instrument`/`Account` and settle via `Batch`/`Instruction` (allocate/approve) for production-grade DvP
- **STR-02**: Deploy the DAR to `cn-quickstart` Canton LocalNet; run desks on separate participant nodes to demonstrate true cross-node sub-transaction privacy
- **STR-03**: Competing AI solvers — N agents ranked by matched volume / price improvement, shown racing in the UI
- **STR-04**: Residual routing — route unfilled residual (e.g., C's 3 units) to a mock on-network liquidity venue ("→ Cantex")
- **STR-05**: Multiple rounds and order cancel/replace

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
| LEDG-01 | Phase 1 | Pending |
| LEDG-02 | Phase 1 | Pending |
| LEDG-03 | Phase 1 | Pending |
| LEDG-04 | Phase 1 | Pending |
| CLEAR-01 | Phase 3 | Pending |
| CLEAR-02 | Phase 4 | Pending |
| CLEAR-03 | Phase 4 | Pending |
| CLEAR-04 | Phase 2 | Pending |
| CLEAR-05 | Phase 2 | Pending |
| SETL-01 | Phase 2 | Pending |
| SETL-02 | Phase 2 | Pending |
| SETL-03 | Phase 2 | Pending |
| SETL-04 | Phase 2 | Pending |
| PRIV-01 | Phase 3 | Pending |
| PRIV-02 | Phase 3 | Pending |
| PRIV-03 | Phase 3 | Pending |
| PRIV-04 | Phase 3 | Pending |
| PRIV-05 | Phase 3 | Pending |
| SOLV-01 | Phase 4 | Pending |
| SOLV-02 | Phase 4 | Pending |
| SOLV-03 | Phase 4 | Pending |
| SOLV-04 | Phase 4 | Pending |
| SOLV-05 | Phase 4 | Pending |
| AGENT-01 | Phase 5 | Pending |
| AGENT-02 | Phase 5 | Pending |
| AGENT-03 | Phase 5 | Pending |
| AGENT-04 | Phase 5 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 6 | Pending |
| UI-05 | Phase 6 | Pending |
| UI-06 | Phase 6 | Pending |
| UI-07 | Phase 7 | Pending |
| DEMO-01 | Phase 7 | Pending |
| DEMO-02 | Phase 7 | Pending |
| DEMO-03 | Phase 7 | Pending |
| DEMO-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after roadmap creation (traceability filled, 38/38 mapped)*
