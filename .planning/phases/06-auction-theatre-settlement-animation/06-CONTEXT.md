# Phase 6: Auction Theatre & Settlement Animation - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per user directive "run phases 4–6 without my input, go with recommended")

<domain>
## Phase Boundary

Build the remaining live frontend views and the motion that makes the mechanism legible, **matching the binding `Umbra design/` comp 100%**: the **Desk view** (02), the **Auction Theatre** (03 — countdown → Close & Solve reveal → Solver Agent panel → hand-rolled SVG supply/demand chart → Settle atomically), and the **Settlement** view (05 — DvP legs + before/after balances + one-transaction badge). Reuses the Phase-3 shell (Header / Nav / PartySwitcher / StatusIndicator), the per-party `createLedgerContext`s, and the comp design tokens; consumes the Phase-4/5 solver HTTP API.

**In scope (P6):** UI-02 (Desk view), UI-04 (Theatre: countdown ring + live sealedOrderCount + Close&Solve → solve-preview reveal hero + Solver Agent rationale panel), UI-05 (hand-rolled SVG supply/demand crossing chart marking p*), UI-06 (Settle atomically animation + before/after balances + DvP legs + one-transaction badge), plus a `web/src/solver.ts` client for the :4000 API and wiring the new views into the existing Nav/routing.
**Out of scope (deferred):** 100%-fidelity design-comp polish pass, `make demo`, README, screenshots, live E2E acceptance → **Phase 7** (UI-07, DEMO-*). No ledger/solver/Daml changes (those layers are frozen from Phases 1–5). Stretch §19 (competing solvers race UI, residual routing).
</domain>

<decisions>
## Implementation Decisions

### Architecture — two data planes (THE key privacy/auth decision)
- **Operator / Theatre actions go through the solver HTTP API on :4000** (`web/src/solver.ts`): `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle`. The browser **never holds the Operator token** — the solver service is the Operator-authority proxy (D6 / SOLV-04). This is how the Theatre "Close & Solve" / "Settle atomically" buttons drive the round and how the clearing price + rationale + curve + matched volume are fetched.
- **Desk views read per-party via the JSON API on :7575** reusing the Phase-3 `createLedgerContext('bankA'|'bankB'|'bankC')` + desk tokens (orders, holdings, RoundStats, TradeConfirmation). Order submission (`Venue.SubmitOrder`) is a per-party exercise via that desk's `useLedger`.
- A small env/config knob for the solver base URL (default `http://localhost:4000`); a graceful "solver offline" state so the Privacy money shot (Phase 3) still renders if :4000 is down.

### Desk view (UI-02)
- Order ticket: Side toggle (Buy/Sell), Quantity (int), Limit (decimal), Submit → that desk's `Venue.SubmitOrder` (operator+desk signed). One order per round — disable after submit. A **"load demo order"** affordance pre-fills the §4 values per desk (A: Buy 10 @101 · B: Sell 8 @99 · C: Sell 5 @100).
- Your order: the desk's own sealed order + status (Sealed/Filled/PartiallyFilled/Unfilled). Shows nothing about other desks.
- Your holdings: live BONDX & USDCx from the desk's own `Asset`s (per-party query).
- After settlement: the desk's `TradeConfirmation` (filledQty, clearingPrice, cashMoved) + updated holdings.

### Auction Theatre (UI-04) + Solver Agent panel (§12.5)
- Operator screen: a **countdown ring** for the 60s window (driven by the round `openedAt + windowSeconds` / solver state) + live `sealedOrderCount`.
- **"Close & Solve"** → `POST /round/:id/close` then `GET /round/:id/solve-preview`: show the **Solver Agent panel** "computing", then reveal the **uniform clearing price ($100.00)** as a hero moment (the comp's reveal keyframes). The Solver Agent panel renders the Phase-5 `rationale` (2–3 sentences) + the `agent:{verified, source}` badge (Claude vs deterministic-fallback).
- The reveal is robust to a keyless solver (rationale still present via deterministic fallback; price always 100.00).

### Supply/demand crossing chart (UI-05)
- **Hand-rolled SVG** (no chart lib, per spec §6/§12.4): step **demand** curve (down) + step **supply** curve (up) from the solve-preview `curve` points; mark **p*** where matched volume is maximized; annotate **matched = 10**. Uses the comp's axis/draw-on styling.

### Settlement (UI-06) + settlement ledger (§12.6)
- **"Settle atomically"** → `POST /round/:id/settle`; play the **atomic-settlement animation** (all legs snap **simultaneously** — the comp's draw-on keyframes) conveying one-transaction DvP.
- Render the cleared trades as **DvP legs** (A↔B: 8 @100 · A↔C: 2 @100), each a paired asset+cash arrow, with a single **"one transaction" badge**, plus **before/after balances** per desk (A: 10/4000 · B: 12/1800 · C: 13/1200). In a desk's own view each desk sees only its own fill; the Operator/Theatre view shows the aggregate.

### Design fidelity & reuse
- **The `Umbra design/` comp is binding — match it 100%** (the gsd-ui-phase UI-SPEC details tokens/typography/layout/keyframes from `Umbra.dc.html` + `support.js` + `screenshots/`). Reuse the Phase-3 `tailwind.config.ts` tokens (paper #F4F1EA, ink #0A0A0A, lime #D6FB3C, red CTA, accents), the three fonts, the redaction motif, and the shell components. The comp's reveal/settlement screenshots (`01-reveal`, `theatre`, `theatre2`, …) are the visual reference for the theatre + reveal + settlement.
- Wire the new views into the existing `Nav` (the 5 numbered views) + `App` routing; keep the `PartySwitcher` (BankA/B/C/Operator) and `StatusIndicator` working across views.

### Claude's Discretion
- Component decomposition, the countdown-ring + reveal + draw-on animation technique (CSS keyframes vs requestAnimationFrame), local UI state management, and the exact SVG geometry — at the executor's discretion, guided by the UI-SPEC, the comp, and the existing Phase-3 component patterns.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 3)
- `web/src/components/` — Header, Nav (the 5-view nav), PartySwitcher (BankA/B/C/Operator), StatusIndicator (Open·Closed·Cleared·Settled), DeskColumn, VenueSpine, SealedRail, OrderRow, RedactionBar.
- `web/src/ledgerContexts.ts` — `createLedgerContext('bankA'|'bankB'|'bankC')` + `ctxFor`; the structural per-party privacy core for desk reads/exercises.
- `web/src/desks.ts` — DESKS metadata, desk tokens, `httpBaseUrl`/`wsBaseUrl` (absolute same-origin, the @daml/ledger gotcha).
- `web/src/views/PrivacyView.tsx` + `web/src/App.tsx` — the view-routing + 3-up money shot to extend.
- `web/tailwind.config.ts` + `web/index.html` — comp tokens + the 3 Google Fonts; the redaction gradient utility + keyframes.
- `@daml.js/umbra-0.1.0` bindings (Venue.SubmitOrder, Order, Asset, RoundStats, TradeConfirmation, Round) for desk-side reads/exercises.

### Established Patterns
- Vite proxy `/v1`→:7575; `optimizeDeps` deep `@daml.js/.../module` subpaths; absolute `httpBaseUrl`.
- Per-party JWT auth (privacy at the wire); operator token NEVER in the browser → the Operator plane is the solver :4000 API.
- Tailwind 3.4 + comp tokens; Space Grotesk / IBM Plex Mono / Inter.

### Integration Points
- `web/src/solver.ts` (NEW) ↔ solver :4000 (`POST /round`, `GET /round/:id`, `/close`, `/solve-preview`, `/settle`) — Theatre/Operator plane + clearing reveal + rationale + curve.
- Desk views ↔ JSON API :7575 per-party (orders/holdings/confirmations + `Venue.SubmitOrder`).
- Solver `GET /round/:id` returns `sealedOrderCount`, and after clear: `clearingPrice` (100.00), `matchedVolume` (10), supply/demand `curve` points, `rationale`, `agent:{verified,source}` — the theatre + chart + agent-panel data.
</code_context>

<specifics>
## Specific Ideas

- The money shot extends to the full flow: 3 desks blind (P3) → Operator "Close & Solve" reveals **100.00** with the Claude rationale → "Settle atomically" snaps all legs in one transaction → each desk sees only its own fill, Operator sees the aggregate (A↔B 8@100, A↔C 2@100).
- The reveal of **$100.00** and the simultaneous-leg settlement are the two "wow" beats — they must match the comp's reveal/settlement screenshots exactly.
- Keep the §4 numbers exact everywhere: fills A=10/B=8/C=2, balances A:10/4000 · B:12/1800 · C:13/1200, matched=10, p*=100.00.
</specifics>

<deferred>
## Deferred Ideas

- 100% design-comp fidelity polish + typography exactness, `make demo`/Makefile, README, pitch screenshots, live E2E acceptance → **Phase 7** (UI-07, DEMO-01..04).
- Competing AI solvers race UI, residual routing ("→ Cantex"), multi-round → stretch §19.
</deferred>
