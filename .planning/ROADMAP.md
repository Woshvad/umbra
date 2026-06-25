# Roadmap: Umbra

## Overview

Umbra is a private, sealed-bid uniform-price batch-auction venue for a tokenized bond, settled atomically (DvP) on Canton with a Claude AI agent as the auction solver. The build is dependency-forced and maps 1:1 onto spec §17: first freeze the Daml data model and the installed-SDK version (P1), then make the ledger clear and settle a batch atomically and reject bad allocations (P2), then prove privacy is real at the HTTP layer and ship the 3-up money shot — the vertical slice that wins (P3). With the slice shipped by end of P3, later phases add layers off the critical path: the off-ledger solver service (P4), the AI solver agent (P5), the auction theatre / settlement animation / supply-demand chart (P6), and finally design-comp polish, `make demo`, and live E2E acceptance (P7). The canonical §4 fixture (clears at exactly $100.00, fills A=10 / B=8 / C=2) is the single correctness reference and a continuous smoke test from P2 onward.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Skeleton & Version Gate** - Daml templates + Setup seed the §4 world, `daml start` runs, and the SDK version + data contract are frozen
- [ ] **Phase 2: Clear & Settle On-Ledger** - `Round.Clear` re-verifies §8 and settles the batch as one atomic DvP transaction; §4 fixture clears at $100.00
- [ ] **Phase 3: Privacy Proof (Vertical Slice)** - Per-party JWT auth proven at the wire + the 3-up Privacy money shot; ship this even if everything after is rough
- [ ] **Phase 4: Solver Service** - Node/TS Operator service: 60s window lifecycle, deterministic §8, Express API, ≥5 unit-test scenarios
- [ ] **Phase 5: AI Solver Agent** - Claude proposes + narrates the clearing; verify-don't-trust gate; additive, off the settlement path
- [ ] **Phase 6: Auction Theatre & Settlement Animation** - Countdown + reveal, hand-rolled supply/demand crossing SVG, atomic-settle animation, Desk view
- [ ] **Phase 7: Polish, Demo & Acceptance** - 100% design-comp fidelity, `make demo` + README, screenshots, live E2E acceptance flow

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

- [ ] 01-03-PLAN.md — Setup.daml (allocate + §4 mint + runCanonicalRound + exportParties) + Tests.daml + parties.json export + daml start smoke [LEDG-02, LEDG-01]

### Phase 2: Clear & Settle On-Ledger

**Goal**: The ledger is the source of truth and atomicity boundary — `Round.Clear` independently re-verifies the §8 allocation and settles the whole batch delivery-versus-payment in a single all-or-nothing transaction.
**Depends on**: Phase 1
**Requirements**: CLEAR-04, CLEAR-05, SETL-01, SETL-02, SETL-03, SETL-04
**Success Criteria** (what must be TRUE):

  1. The canonical §4 fixture clears at exactly $100.00 with fills A=10 / B=8 / C=2 in a Daml Script test (`test_clears_at_100`).
  2. `Round.Clear` reassigns BONDX & USDCx at p\* and issues a per-desk `TradeConfirmation` inside one transaction, leaving the §4 settled balances (A: 10/4,000 · B: 12/1,800 · C: 13/1,200) with cash and assets conserved (`test_settled_balances`).
  3. If any settlement leg fails (e.g., a seller lacks the asset), `Round.Clear` fails and no balances change — all-or-nothing (`test_atomicity`).
  4. `Round.Clear` rejects any allocation violating max-volume, limit compliance, or conservation (`test_clear_rejects_bad_allocation`); the on-ledger §8 re-verification matches the algorithm spec.

**Plans**: TBD

### Phase 3: Privacy Proof (Vertical Slice)

**Goal**: Prove order/fill/holding privacy is structurally real at the API boundary and ship the 3-up Privacy money shot — the end-to-end privacy→clear→settle slice that wins even if everything after is rough.
**Depends on**: Phase 1 (data model + party tokens); Phase 2 (clear/settle for the live slice)
**Requirements**: CLEAR-01, PRIV-01, PRIV-02, PRIV-03, PRIV-04, PRIV-05, UI-01, UI-03
**Success Criteria** (what must be TRUE):

  1. A registered desk submits exactly one sealed order per round via `Venue.SubmitOrder` (operator+desk signed); a JSON-API query as BankA returns BankA's order and zero of BankB/BankC's orders (`test_privacy_orders`), and a `TradeConfirmation` is observed only by its desk (`test_privacy_confirmations`).
  2. Pre-clear, desks see only `RoundStats.sealedOrderCount` (a count) and never order contents; `Asset` holdings are visible only to owner + operator.
  3. The frontend authenticates as each party using that party's own JSON-API token, so it structurally cannot fetch other desks' private data (privacy enforced at the wire, not in render logic).
  4. The Privacy view renders three desk panels side by side, each driven by that desk's independent credentials, plus a center column showing the shared `RoundStats` count, with a redaction motif on the "other" columns and a working party switcher + round-status indicator.

**Plans**: TBD
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

**Plans**: TBD

### Phase 5: AI Solver Agent

**Goal**: Add the autonomous-agent thesis — Claude proposes and narrates the clearing — without ever risking correctness, via a verify-don't-trust equality gate against the deterministic core.
**Depends on**: Phase 4 (drops into the agent seam; never on the critical settlement path)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04
**Success Criteria** (what must be TRUE):

  1. On round close the agent ingests the sealed batch and proposes a clearing (price + allocation) by calling Claude with a structured prompt that returns strict JSON at temperature 0.
  2. The service recomputes the deterministic result and only submits an allocation that passes verification by equality; the AI's numbers are never used unverified (if the AI disagrees, the deterministic clear still settles).
  3. Claude returns a 2–3 sentence natural-language rationale for the clearing, rendered in the Solver Agent panel.
  4. The prompt contract (system rules verbatim, batch JSON, required JSON response shape) is documented in `solver/PROMPT.md`.

**Plans**: TBD

### Phase 6: Auction Theatre & Settlement Animation

**Goal**: Build the remaining live views and the motion that makes the mechanism legible — the auction theatre with countdown/reveal, the hand-rolled supply/demand crossing chart, the atomic-settlement animation, and the per-desk Desk view.
**Depends on**: Phase 3 (privacy/UI scaffold), Phase 4 (solve-preview/settle API), Phase 5 (agent data)
**Requirements**: UI-02, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):

  1. The Desk view (A/B/C) shows the order ticket (one order per round, with a "load demo order" affordance pre-filling the §4 values), the desk's sealed order + status, its live BONDX/USDCx holdings, and — after settlement — its `TradeConfirmation`.
  2. The Auction theatre (Operator) shows a 60s countdown ring + live `sealedOrderCount` and a "Close & Solve" action that triggers `solve-preview` and reveals the uniform clearing price ($100.00 on the fixture) as a hero moment.
  3. A hand-rolled SVG chart renders the step demand (down) and supply (up) curves and marks p\* where matched volume is maximized.
  4. A "Settle atomically" action plays the atomic-settlement animation (all legs snap simultaneously), shows before/after balances, and renders the DvP legs (A↔B 8@100, A↔C 2@100) with a single "one transaction" badge.

**Plans**: TBD
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

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Skeleton & Version Gate | 2/3 | In Progress|  |
| 2. Clear & Settle On-Ledger | 0/TBD | Not started | - |
| 3. Privacy Proof (Vertical Slice) | 0/TBD | Not started | - |
| 4. Solver Service | 0/TBD | Not started | - |
| 5. AI Solver Agent | 0/TBD | Not started | - |
| 6. Auction Theatre & Settlement Animation | 0/TBD | Not started | - |
| 7. Polish, Demo & Acceptance | 0/TBD | Not started | - |
