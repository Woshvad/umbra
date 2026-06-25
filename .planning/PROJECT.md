# Umbra

## What This Is

Umbra is a private, **sealed-bid uniform-price batch-auction venue** for tokenized securities, settled **atomically (DvP)** on **Canton**, with a **Claude AI agent acting as the auction solver**. Institutions (trading desks) submit sealed limit orders for a tokenized bond during a short window; no one — not rival desks, not the public — can see anyone else's orders. When the window closes, the AI solver computes the single uniform clearing price that maximizes matched volume, and the whole batch settles delivery-versus-payment in one transaction. Built for the Encode Club / HackCanton hackathon (Track 1 — Private DeFi & Capital Markets).

## Core Value

**The privacy money shot must work and be screenshot-ready:** three desks submit orders blind to each other → an AI solver clears them at one uniform price ($100.00 on the canonical fixture) → the entire batch settles atomically in a single Canton transaction, with each desk seeing only its own fill. If everything else is rough, this end-to-end vertical slice (privacy → clearing → atomic settlement) is what wins, so it is the top build priority.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — greenfield; ship to validate)

### Active

<!-- Current scope. Building toward these. All hypotheses until shipped. -->

- [ ] Each desk submits **one sealed order per round** (side, integer qty, decimal limit) via `Venue.SubmitOrder`; no other desk can see it (Daml signatory/observer disclosure)
- [ ] Pre-clear, desks see **only a count** of sealed orders (`RoundStats.sealedOrderCount`), never contents
- [ ] **AI solver agent** ingests the sealed batch on close, proposes a clearing (price + allocation) via Claude, and the service **verifies-don't-trusts** against the deterministic algorithm (§8)
- [ ] On-ledger **`Round.Clear`** re-verifies the allocation (max-volume, limit compliance, conservation) and rejects bad proposals — the ledger is the backstop
- [ ] **Atomic DvP settlement** reassigns BONDX & USDCx and issues per-desk `TradeConfirmation`s in **one transaction** (all-or-nothing)
- [ ] Per-desk **private fills**: a `TradeConfirmation` and `Asset` holdings are visible only to that desk + Operator
- [ ] The **canonical §4 fixture clears at exactly $100.00** with fills A=10 / B=8 / C=2 and the §4 settled balances (asserted in Daml + TS tests)
- [ ] Frontend delivers all **5 views matching the design comp 100%**: 01 Privacy (3-up money shot), 02 Desk, 03 Theatre (countdown + reveal), 04 Solver Agent (rationale), 05 Settlement (atomic DvP animation)
- [ ] **Party switcher** uses each party's own JSON-API token so the UI literally cannot fetch other desks' private data — privacy is real, not faked
- [ ] Off-ledger **solver service** (Node/TS, runs as Operator): round lifecycle, 60s window, HTTP API for the frontend, Claude integration; Anthropic key server-side only
- [ ] A stranger can run **`make demo`** end-to-end; README + 3-minute demo script; screenshots of the 3-up blindness and atomic settlement captured

### Out of Scope

<!-- Explicit boundaries with reasoning (spec §1 non-goals, §18, §19). -->

- Multi-asset cross-auctions — one bond (BONDX) vs one cash token (USDCx) only; keeps the mechanism demoable
- Real fiat / KYC onboarding flows — not core to the privacy + atomicity thesis
- Production key management / mainnet deployment — hackathon MVP runs on dev sandbox
- Order cancel / replace — a desk submits **once per round** in the MVP
- Continuous trading / live order book — Umbra is a *batch* auction by design (the differentiator vs a continuous private book)
- Daml Finance `Holding`/`Batch`/`Instruction` settlement — **stretch (§19)**; MVP uses operator-custody `Asset` to sidestep multi-party authority
- Canton LocalNet (`cn-quickstart`) cross-node deploy — **stretch (§19)**; build on `daml start` first, treat LocalNet as deploy-time
- Competing AI solvers (N agents racing) — **stretch (§19)**
- Residual routing to a mock venue ("→ Cantex"), multiple rounds — **stretch (§19)**

## Context

- **Authoritative spec:** `spec.md` (repo root) holds every product, technical, and scenario decision. It is the detailed source of truth — this PROJECT.md is the high-level living summary. Build exactly to spec; do not seek clarification (per spec §0).
- **Binding design source:** `Umbra design/` is a complete, high-fidelity design comp (`Umbra.dc.html` + `support.js` + `screenshots/`) of all 5 views. It must be followed 100% in frontend phases. Swiss + Postmodern: paper bg `#F4F1EA`, ink `#0A0A0A`, lime accent `#D6FB3C`, red CTA, charcoal panels with a redaction-stripe motif; fonts Space Grotesk (display) + IBM Plex Mono (data/tabular-nums) + Inter (body); named keyframes for the reveal and draw-on settlement legs.
- **Why Canton:** on transparent chains, order privacy must be bolted on (off-chain books, ZK) and MEV must be fought. On Canton there is no public mempool and contracts are private to their stakeholders by construction, so sealed-bid auctions are native and Daml settlement is atomic by default.
- **Privacy enforcement:** Daml signatory/observer disclosure on the dev sandbox; Canton sub-transaction privacy across participant nodes on LocalNet (stretch). The demo proves it live by switching parties and querying the JSON API per-party.
- **The differentiator:** an autonomous AI solver agent (Claude) that proposes and *narrates* the clearing — "autonomous agent in institutional DeFi" — without risking correctness (deterministic core + on-ledger re-verification).

## Constraints

- **Tech stack**: Daml + Canton (ledger) · React 18 + TypeScript + Vite + Tailwind (frontend) · Node 20 + TypeScript (solver service) · `@anthropic-ai/sdk` — fixed by spec §6
- **Secrets**: `ANTHROPIC_API_KEY` via env only, read solely by `solver/`; **never** in the frontend, never committed. `.env` gitignored; ship `.env.example`
- **Version drift (spec's #1 risk)**: detect the installed Daml SDK and adapt import paths from official docs — Daml 2.x exposes the HTTP JSON API used by `@daml/react`; Daml 3.x / Canton 3.x uses the JSON Ledger API v2 + `cn-quickstart`. Keep templates standard so they compile on either line. Record the version in `DECISIONS.md`
- **Determinism / correctness**: the AI's numbers are never used unverified; the deterministic clearing algorithm (§8) + on-ledger `Round.Clear` re-verification are the source of truth. The canonical fixture must clear at **$100.00**
- **Design fidelity**: the `Umbra design/` comp is binding — frontend must match it exactly
- **Git attribution**: Claude must **never** be added as a contributor to any commit or push during this build (no `Co-Authored-By`, no "Generated with" — strict user requirement). Author/committer stays `woshvad`
- **Timeline**: hackathon pace — ship a working vertical slice (privacy → clear → atomic settle) **by the end of Phase 3** even if everything after is rough; defer all stretch goals to after the polish phase
- **Ports** (defaults): JSON API `7575`, Vite dev `5173`, solver service `4000`

## Key Decisions

<!-- Decisions locked by spec §0; constrain all future work. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Trade one bond `BONDX` vs cash `USDCx` (prices in USDCx/BONDX) | Single market keeps the mechanism demoable and the money shot legible | — Pending |
| 5 parties: `Operator` (venue/solver/custodian) + `BankA/B/C` desks | Minimal cast to prove privacy across rival desks | — Pending |
| Sealed-bid **uniform-price call auction** (not a continuous book) | One provably-fair clearing price; the differentiator vs a continuous private book | — Pending |
| **Operator-custody `Asset`** model for the MVP | Sidesteps multi-party authority puzzles; Daml Finance is the production upgrade (stretch) | — Pending |
| **Verify-don't-trust** AI solver (deterministic core + on-ledger re-verify) | AI gets the "autonomous agent" thesis without ever risking a wrong/unfair clear | — Pending |
| Build on **`daml start`** first; Canton LocalNet is deploy-time stretch | `cn-quickstart` is heavy (8GB Docker); get the app working fast, claim Canton later | — Pending |
| 60-second round window (`ROUND_SECONDS`, force-close affordance for demo) | Short enough to demo live; force-close avoids waiting 60s on stage | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-25 after initialization*
