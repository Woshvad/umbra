# Phase 6: Auction Theatre & Settlement Animation - Research

**Researched:** 2026-06-26
**Domain:** React 18 frontend integration — two data planes (solver HTTP :4000 + per-party JSON API :7575), hand-authored SVG, CSS/rAF motion, against a binding design comp
**Confidence:** HIGH

## Summary

Phase 6 is almost entirely an **integration + transcription** phase, not a discovery phase. Every design value is pinned by the APPROVED `06-UI-SPEC.md`; every API shape is frozen in `solver/src/api.ts` (Phases 4/5); every animation technique already exists in the binding comp's `Umbra design/Umbra.dc.html` render-class (`startClock`, `closeSolve`, `solve`, `startType`, `settle` with its single rAF `settleProgress` clock, and the `lerp` balance interpolation). The job is to faithfully port the comp's local-simulation render-class into React components, replacing the simulated `solve()`/`settle()` with the live :4000 endpoints while preserving every pixel and every motion beat.

There are **no new libraries** and **no package installs** — `web/` already has React 18.3.1, `@daml/react@2.10.4`, `@daml/ledger@2.10.4`, and the generated `@daml.js/umbra-0.1.0` bindings. The only structural additions are the new view files, a new `web/src/solver.ts` fetch client, and the `umbraLeg` keyframe + a few large `fontSize` literals in `tailwind.config.ts`.

**Primary recommendation:** Build `web/src/solver.ts` as a thin typed `fetch` client (direct cross-origin to `http://localhost:4000` — solver CORS already allows `http://localhost:5173`, no Vite proxy needed). Lift the round lifecycle state (roundId, phase, preview result) into `App.tsx` so Theatre→Agent→Settlement share it. Port the comp's render-class methods verbatim into React hooks: `setInterval` for the 1s countdown + `stroke-dashoffset = 753.98*(1 - s/60)`, CSS `animation: umbraSlam` for the reveal, and a **single `requestAnimationFrame` `settleProgress` 0→1 over 800ms** driving ALL legs + balance lerp simultaneously. Gate every animation on `prefers-reduced-motion` exactly as the comp's `reduced()` does. Map the live solver `agent.source` (`'claude' | 'deterministic-fallback'`) to the new `VERIFIED · CLAUDE` / `VERIFIED · DETERMINISTIC` badge.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Open/close round, solve-preview, settle | Solver HTTP API :4000 (Operator-authority proxy) | — | Operator token must NEVER enter the browser (CONTEXT D6 / SOLV-04). The solver service holds Operator authority; the browser drives it via REST. [CITED: 06-CONTEXT.md] |
| `sealedOrderCount`, `clearingPrice`, `matchedVolume`, `curve`, `rationale`, `agent` | Solver HTTP API :4000 (`GET /round/:id`, `GET /round/:id/solve-preview`) | — | Aggregate / operator-visibility data. Desks cannot see the curve or other desks' orders; the solver computes it with operator visibility. [VERIFIED: solver/src/api.ts] |
| Desk's own Order / Asset / TradeConfirmation reads | JSON API :7575 (per-party `createLedgerContext`) | — | Structural privacy (PRIV-05): each desk's own HS256 token streams only its own contracts. [VERIFIED: web/src/ledgerContexts.ts, web/src/components/DeskColumn.tsx] |
| `Venue.SubmitOrder` (seal an order) | JSON API :7575 (per-party `useLedger`) | — | Requires `controller desk` authority carried by that desk's own token. [VERIFIED: web/src/components/DeskColumn.tsx lines 62-81] |
| Round status → StatusIndicator phase | JSON API :7575 (`ctxA` `RoundStateProbe`, already built) | Solver :4000 round status (Theatre-local phase) | The global status bar reads `Round`/`RoundStats` via ctxA (a desk token, observer=desks). Theatre's own phase machine is driven locally by the :4000 lifecycle. [VERIFIED: web/src/App.tsx lines 18-38] |
| Countdown clock, reveal slam, settlement leg draw-on, balance lerp | Browser / Client (React state + CSS/rAF) | — | Pure presentation; the comp's render-class is the reference. [VERIFIED: Umbra design/Umbra.dc.html lines 510-789] |

---

## Standard Stack

### Core (ALL already installed — no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | 18.3.1 | Views, hooks, local animation state | Spec-mandated; already in `web/package.json` [VERIFIED: web/package.json] |
| @daml/react | 2.10.4 | `createLedgerContext`, `useStreamQueries`, `useLedger` for desk plane | Already wired in `ledgerContexts.ts` [VERIFIED: web/package.json] |
| @daml/ledger | 2.10.4 | Transitive (ledger client under the hooks) | Already installed [VERIFIED: web/package.json] |
| @daml.js/umbra-0.1.0 | generated | `Order`, `Asset`, `Venue`, `Side`, `TradeConfirmation`, `RoundStats`, `Round` bindings | Already linked (`file:./daml.js/umbra-0.1.0`) [VERIFIED: web/package.json, module.d.ts] |
| native `fetch` | browser builtin | The :4000 solver client (`web/src/solver.ts`) | No axios needed; the 5 endpoints are trivial JSON GET/POST [ASSUMED — fetch is universally available in the target browser] |

### Supporting (test-only, Wave 0 — see Validation Architecture)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^2.1.x (match solver's 2.1.9) | Unit tests for `solver.ts` types + SVG path math | `web/` has NO test runner yet — add in Wave 0 ONLY if logic tests are planned [VERIFIED: web/package.json has no vitest] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct cross-origin `fetch('http://localhost:4000/...')` | Vite proxy `/solver → :4000` | **Not needed** — the solver already sets `cors({ origin: 'http://localhost:5173' })` [VERIFIED: solver/src/api.ts line 30, 129]. A proxy would add config + a `JSON_API`-style base-URL gotcha for no benefit. Direct fetch with a `SOLVER_BASE_URL` const is simpler and matches CONTEXT's "env/config knob for the solver base URL (default http://localhost:4000)". |
| CSS `@keyframes umbraLeg` for leg draw-on | Single rAF `settleProgress` 0→1 scaling all legs | The comp ITSELF uses the **single rAF** approach (`settle()` drives one `settleProgress` clock; the `umbraLeg` keyframe is defined in CSS but the comp's leg arrows are HTML `div` tracks, NOT animated SVG polylines). Prefer the comp's rAF approach to guarantee **simultaneity** + the balance `lerp` staying in lockstep. CSS keyframes can't lerp the balance numerals. [VERIFIED: Umbra design/Umbra.dc.html lines 644-655, 736-741] |
| `setInterval` 1s countdown | rAF-driven sub-second countdown | The comp uses `setInterval(…, 1000)` decrementing `seconds` 60→0, with the SVG ring `stroke-dashoffset` transitioned over `1s linear`. Match it — sub-second precision is not visible and would break the comp's `transition` feel. [VERIFIED: Umbra design/Umbra.dc.html lines 565-576, 266] |

**Installation:** None required for runtime. (Wave-0 test runner only, if logic tests are scoped: `cd web && npm i -D vitest@2.1.9 jsdom @testing-library/react @testing-library/jest-dom`.)

**Version verification:** All runtime deps are already pinned and installed in `web/package.json`; no registry lookup needed. The solver's `vitest@2.1.9` is the version to match for `web/` test parity. [VERIFIED: web/package.json, solver/package.json]

## Package Legitimacy Audit

> This phase installs **no new runtime packages**. The only optional install is the test runner, all from already-trusted, already-in-monorepo sources.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| vitest | npm | mature | very high | github.com/vitest-dev/vitest | not run (already used by solver/ @2.1.9) | Approved (Wave-0 test-only, optional) |
| @testing-library/react | npm | mature | very high | github.com/testing-library/react-testing-library | not run | Approved (Wave-0 test-only, optional) |
| jsdom | npm | mature | very high | github.com/jsdom/jsdom | not run | Approved (Wave-0 test-only, optional) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No new runtime dependencies — the legitimacy surface is zero. The test-runner packages above are already present elsewhere in the monorepo (`solver/` uses `vitest@2.1.9`) and are industry-standard. They are tagged `[ASSUMED]` only because slopcheck was not run this session; the planner may gate the optional `npm i -D` behind a checkpoint if desired, but the risk is negligible given they mirror the solver's existing devDeps.*

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Architecture — two data planes (THE key privacy/auth decision):**
- Operator / Theatre actions go through the solver HTTP API on :4000 (`web/src/solver.ts`): `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle`. The browser **never holds the Operator token** — the solver service is the Operator-authority proxy (D6 / SOLV-04).
- Desk views read per-party via the JSON API on :7575 reusing the Phase-3 `createLedgerContext('bankA'|'bankB'|'bankC')` + desk tokens (orders, holdings, RoundStats, TradeConfirmation). Order submission (`Venue.SubmitOrder`) is a per-party exercise via that desk's `useLedger`.
- A small env/config knob for the solver base URL (default `http://localhost:4000`); a graceful "solver offline" state so the Privacy money shot (Phase 3) still renders if :4000 is down.

**Desk view (UI-02):** Order ticket — Side toggle (Buy/Sell), Quantity (int), Limit (decimal), Submit → that desk's `Venue.SubmitOrder`. One order per round — disable after submit. "Load demo order" affordance pre-fills §4 values per desk (A: Buy 10 @101 · B: Sell 8 @99 · C: Sell 5 @100). Your order: own sealed order + status. Your holdings: live BONDX & USDCx from own `Asset`s. After settlement: own `TradeConfirmation` (filledQty, clearingPrice, cashMoved) + updated holdings.

**Auction Theatre (UI-04) + Solver Agent panel:** Countdown ring for 60s window + live `sealedOrderCount`. "Close & Solve" → `POST /round/:id/close` then `GET /round/:id/solve-preview`: Solver Agent panel "computing", then reveal uniform clearing price ($100.00) as a hero moment. Render Phase-5 `rationale` + `agent:{verified, source}` badge. Robust to a keyless solver (rationale via deterministic fallback; price always 100.00).

**Supply/demand crossing chart (UI-05):** Hand-rolled SVG (no chart lib). Step demand (down) + step supply (up) from solve-preview `curve` points; mark p* where matched maximized; annotate matched = 10. Comp's axis/draw-on styling.

**Settlement (UI-06):** "Settle atomically" → `POST /round/:id/settle`; atomic-settlement animation (all legs snap **simultaneously**). DvP legs (A↔B: 8@100 · A↔C: 2@100), each a paired asset+cash arrow, single "one transaction" badge, before/after balances per desk (A: 10/4000 · B: 12/1800 · C: 13/1200). Desk's own view sees only its own fill; Operator/Theatre view shows aggregate.

**Design fidelity & reuse:** The `Umbra design/` comp is binding — match it 100%. Reuse Phase-3 `tailwind.config.ts` tokens, three fonts, redaction motif, shell components. Wire new views into existing `Nav` + `App` routing; keep `PartySwitcher` + `StatusIndicator` working.

### Claude's Discretion
- Component decomposition, the countdown-ring + reveal + draw-on animation technique (CSS keyframes vs requestAnimationFrame), local UI state management, and the exact SVG geometry — at the executor's discretion, guided by the UI-SPEC, the comp, and the existing Phase-3 component patterns.

### Deferred Ideas (OUT OF SCOPE)
- 100%-fidelity design-comp polish pass, `make demo`/Makefile, README, pitch screenshots, live E2E acceptance → **Phase 7** (UI-07, DEMO-01..04).
- Competing AI solvers race UI (AGENT-01/02 rows), residual routing ("→ Cantex"), multi-round → stretch §19. (Phase 6 renders ONLY the rank-1 real `SOLVER-AGENT-00` row; keep table markup for the stretch rows but do NOT fabricate AGENT-01/02.)
- No ledger/solver/Daml changes — those layers are FROZEN from Phases 1–5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-02 | Desk view: order ticket (side/qty/limit) → `Venue.SubmitOrder`, one-per-round lock, load-demo affordance, holdings, YOUR FILL from own `TradeConfirmation` | Desk-plane patterns transcribed from `DeskColumn.tsx` (Pattern 2); exact `TradeConfirmation`/`Asset`/`Order` payload shapes verified (Code Examples §); `Side` enum import path confirmed |
| UI-04 | Theatre: countdown ring + live `sealedOrderCount`, Close & Solve → solve-preview reveal hero + Solver Agent rationale + `agent` badge | Solver client + the 5 endpoint shapes verified from `api.ts`; countdown/reveal/typewriter techniques transcribed from the comp render-class (Pattern 4, 5); `agent.source` enum verified for the badge |
| UI-05 | Hand-rolled SVG supply/demand crossing chart marking p* | Exact comp geometry in UI-SPEC "SVG Crossing Chart" §; `curve` point shape `{price,demand,supply}[]` verified from `buildCurve` in `api.ts`; mapping technique in Pattern 6 |
| UI-06 | Settle atomically animation (simultaneous legs) + before/after balances + DvP legs + one-transaction badge | Settle endpoint shape verified; the single-rAF `settleProgress` + `lerp` technique transcribed verbatim from the comp's `settle()` (Pattern 7); leg + stamp markup verified from comp lines 434-479 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Never add Claude as a git contributor.** No `Co-Authored-By`, no "Generated with Claude" — author/committer stays `woshvad`. (Applies to any commit this phase produces.)
- **The design comp is binding — follow it 100%.** `Umbra design/` is pixel-exact source of truth. Match tokens (`#F4F1EA`/`#0A0A0A`/`#D6FB3C`/`#E2231A`), the three fonts (Space Grotesk / IBM Plex Mono / Inter), the five numbered views.
- **`spec.md` is authoritative.** §4 fixture clears at exactly **$100.00** (fills A=10/B=8/C=2), the continuous correctness reference.
- **`ANTHROPIC_API_KEY` never in the frontend.** The browser only talks to :4000 (solver REST) + :7575 (per-party JSON API). (Already structurally enforced — the key lives in `solver/` only.)
- **Tech stack fixed:** React 18 + TS + Vite + Tailwind 3.4. Do NOT jump to React 19 / Tailwind 4.
- **Tailwind 3.4 spacing exception:** use the comp's irregular literal spacing scale verbatim (already in `tailwind.config.ts`); do NOT normalize to an 8-point grid.

---

## Architecture Patterns

### System Architecture Diagram

```
                          BROWSER (Vite :5173)
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │                         │                          │
   DESK PLANE                OPERATOR PLANE             SHELL STATUS
   (per-party)               (no op token)             (ctxA probe)
        │                         │                          │
        ▼                         ▼                          ▼
  ctxA/B/C.DamlLedger      web/src/solver.ts          ctxA.useStreamQueries
  (desk JWT)               native fetch                (Round, RoundStats)
        │                  SOLVER_BASE_URL                   │
        │                  =http://localhost:4000            │
        ▼                         ▼                          ▼
  useStreamQueries(Order,   POST /round                StatusIndicator
   Asset, TradeConfirm)     GET  /round/:id  ──────────► phase + sealedCount
  useLedger().exercise(     POST /round/:id/close
   Venue.SubmitOrder)       GET  /round/:id/solve-preview
        │                   POST /round/:id/settle
        │                         │
   ┌────┴─────┐ (Vite proxy)      │ (direct cross-origin,
   │ /v1 →    │                   │  CORS allows :5173)
   ▼          ▼                   ▼
 JSON API :7575            SOLVER SERVICE :4000
 (Canton sandbox)          (Operator-authority proxy)
        │                         │
        └──────────┬──────────────┘
                   ▼
            Daml Round.Clear (atomic DvP)
        — FROZEN, no changes this phase —
```

Data flow for the money shot: desk submits via `Venue.SubmitOrder` (:7575) → Theatre `POST /close` then `GET /solve-preview` (:4000) returns `clearingPrice=100.00 + curve + rationale + agent` → reveal slam → `POST /settle` (:4000) runs `Round.Clear` → desk's own `TradeConfirmation` streams back via :7575 → YOUR FILL card.

### Recommended Project Structure
```
web/src/
├── solver.ts                 # NEW — :4000 fetch client + response types + offline guard
├── App.tsx                   # EXTEND — route 4 views, lift round/phase/preview state
├── components/
│   └── Nav.tsx               # EXTEND — Screen union to 5, enable all tabs
├── views/
│   ├── DeskView.tsx          # NEW (02) — per-party plane
│   ├── TheatreView.tsx       # NEW (03) — operator plane, dark surface
│   ├── AgentView.tsx         # NEW (04) — operator plane
│   └── SettlementView.tsx    # NEW (05) — operator plane + per-desk fill
└── components/ (NEW, decomposed at discretion)
    ├── OrderTicket.tsx · HoldingsPanel.tsx · FillCard.tsx       # 02
    ├── CountdownRing.tsx · CrossingChart.tsx · PriceReveal.tsx  # 03 (+reuse in 04)
    ├── AgentProposal.tsx · AgentRationale.tsx                   # 04
    └── DvpLegs.tsx · AtomicStamp.tsx · BalanceTable.tsx         # 05
```

### Pattern 1: The solver fetch client (`web/src/solver.ts`)
**What:** A thin typed module that mirrors `solver/src/api.ts` response shapes and exposes `createRound`, `getRound`, `closeRound`, `solvePreview`, `settle`, plus an offline guard.
**When to use:** All operator-plane actions (Theatre/Agent/Settlement).
**Example:**
```typescript
// web/src/solver.ts — mirrors solver/src/api.ts EXACTLY (frozen shapes).
// Direct cross-origin: solver sets cors({ origin: 'http://localhost:5173' }) — no proxy.
export const SOLVER_BASE_URL =
  import.meta.env.VITE_SOLVER_URL ?? 'http://localhost:4000'

// Response types — copy from api.ts; numbers come back as JSON numbers (not strings),
// because the solver derives them from the deterministic core, not from Daml decimals.
export type CurvePoint = { price: number; demand: number; supply: number }
export type Allocation = { desk: string; filledQty: number; /* …§8 shape */ }
export type AgentMeta = { verified: boolean; source: 'claude' | 'deterministic-fallback' }

export type RoundStatus = 'Open' | 'Closed' | 'Cleared' | 'Settled'
export type RoundResponse = {
  roundId: string
  status: RoundStatus
  sealedOrderCount: number
  // present only after clear/settle (GET /round/:id, TERMINAL_STATUSES):
  clearingPrice?: number
  matchedVolume?: number
  allocations?: Allocation[]
  curve?: CurvePoint[]
  rationale?: string
  agent?: AgentMeta
}
export type SolvePreviewResponse = {
  roundId: string
  clearingPrice: number       // 100.00 on the §4 fixture
  matchedVolume: number       // 10
  allocations: Allocation[]
  curve: CurvePoint[]
  rationale: string           // populated in P5 (Claude or deterministic fallback)
  agent: AgentMeta
}
export type SettleResponse = {
  roundId: string
  status: 'Settled'
  clearingPrice: number
  matchedVolume: number
  allocations: Allocation[]
  txConfirmations: number     // 1 — the atomic DvP
}
export type ApiErrorBody = { error: { code: string; message: string } }

// Custom error carrying the structured envelope (never leaks secrets — solver guarantees).
export class SolverError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message); this.name = 'SolverError'
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SOLVER_BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (e) {
    // Network failure = solver offline (the CONTEXT "solver offline" state).
    throw new SolverError(0, 'OFFLINE', 'SOLVER OFFLINE — START THE SERVICE ON :4000')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (body as ApiErrorBody).error
    throw new SolverError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'solver error')
  }
  return body as T
}

export const createRound = (b?: { roundId?: string; desks?: string[]; windowSeconds?: number }) =>
  call<RoundResponse>('/round', { method: 'POST', body: JSON.stringify(b ?? {}) })
export const getRound = (id: string) => call<RoundResponse>(`/round/${id}`)
export const closeRound = (id: string) =>
  call<{ roundId: string; status: 'Closed' }>(`/round/${id}/close`, { method: 'POST' })
export const solvePreview = (id: string) => call<SolvePreviewResponse>(`/round/${id}/solve-preview`)
export const settle = (id: string) => call<SettleResponse>(`/round/${id}/settle`, { method: 'POST' })
```
> **Source provenance:** every field above is read directly from `solver/src/api.ts` (lines 147-258). `solve-preview` returns `{roundId, clearingPrice, matchedVolume, allocations, curve, rationale, agent}`; `GET /round/:id` adds `clearingPrice/matchedVolume/allocations/curve/rationale/agent` ONLY when status ∈ {Cleared, Settled}; settle returns `txConfirmations` (defaults 1). [VERIFIED: solver/src/api.ts]

### Pattern 2: Desk plane reads + submit (mirror `DeskColumn.tsx`)
**What:** Mount the active desk's `ctx.DamlLedger`, stream its own `Order`/`Asset`/`TradeConfirmation`, and exercise `Venue.SubmitOrder` via `useLedger`.
**When to use:** DeskView only (02).
**Example:**
```typescript
// Inside a <ctx.DamlLedger token={tokens[deskKey].token} party={tokens[deskKey].party}
//   httpBaseUrl={httpBaseUrl} wsBaseUrl={wsBaseUrl}> provider (pattern from DeskColumn).
import { Order, TradeConfirmation } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import { Venue } from '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'  // ← Side lives in Clearing

function DeskBody({ ctx, deskKey }: { ctx: Ctx; deskKey: DeskKey }) {
  const orders  = ctx.useStreamQueries(Order)
  const assets  = ctx.useStreamQueries(Asset)
  const confirms = ctx.useStreamQueries(TradeConfirmation) // own fill only (PRIV)
  const ledger  = ctx.useLedger()

  const order = orders.contracts[0]?.payload
  const ticketLocked = !!order                       // one order per round
  const bond = assets.contracts.filter(c => c.payload.symbol === 'BONDX')
                 .reduce((a, c) => a + Number(c.payload.quantity), 0)
  const cash = assets.contracts.filter(c => c.payload.symbol === 'USDCx')
                 .reduce((a, c) => a + Number(c.payload.quantity), 0)

  // YOUR FILL — from this desk's own TradeConfirmation (Int/Numeric come as strings).
  const tc = confirms.contracts[0]?.payload
  const filledQty = tc ? Number(tc.filledQty) : null      // 10 / -8 / -2
  const clearingPrice = tc ? Number(tc.clearingPrice) : null  // 100.00
  const cashMoved = tc ? Number(tc.cashMoved) : null      // -1000 / +800 / +200

  async function submit(side: Side, qty: number, limit: number) {
    if (ticketLocked) return
    const venues = await ledger.query(Venue)
    const venueCid = venues[0]?.contractId
    if (!venueCid) return
    // Int + Decimal as STRINGS (RESEARCH Pitfall 8 from Phase 3 — non-negotiable).
    await ledger.exercise(Venue.SubmitOrder, venueCid, {
      desk: tokens[deskKey].party,
      roundId: 'R1',
      side,                              // Side.Buy | Side.Sell
      quantity: String(qty),             // '10'
      limit: limit.toFixed(1),           // '101.0'  (Daml Numeric)
    })
  }
}
```
> **Verified payload shapes** [VERIFIED: web/.../Umbra/Auction/module.d.ts, Umbra/Asset/module.d.ts]:
> - `TradeConfirmation = { operator, desk, roundId, symbol, side: Side, filledQty: Int, clearingPrice: Numeric, cashMoved: Numeric }` — exactly the trio the FillCard needs.
> - `RoundStats = { operator, roundId, desks: Party[], sealedOrderCount: Int }` (desk-visible count; but Theatre's count comes from `GET /round/:id` per UI-SPEC line 180).
> - `Round = { operator, roundId, symbol, desks, openedAt: Time, windowSeconds: Int, status: RoundStatus }`.
> - `Side` is exported from `Umbra/Clearing/module` (NOT Auction) — `import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'`. [VERIFIED: DeskColumn.tsx line 23]

### Pattern 3: Operator plane needs NO @daml/react context
**What:** Theatre / Agent / Settlement drive the round purely via `web/src/solver.ts` → :4000. They do NOT mount any DamlLedger provider and never touch an operator token.
**When to use:** TheatreView, AgentView, SettlementView aggregate data.
**Confirmation:** The operator token is NOT in the browser bundle (`web/src/desks.ts` holds only the 3 desk tokens; `web/src/tokens.json` has no operator entry). The solver service is the sole Operator-authority holder. [VERIFIED: web/src/desks.ts comment lines 3-4 "operator's privileged token never enters this bundle (D6)"; CONTEXT D6]
**Exception:** SettlementView's *per-desk* "your own fill" row and DeskView's FillCard DO use the desk plane (TradeConfirmation via ctx); only the *aggregate* (legs, all balances) comes from :4000 `allocations`.

### Pattern 4: Countdown ring (`setInterval` + SVG `stroke-dashoffset`)
**What:** A 1s `setInterval` decrements `seconds` 60→0; the SVG progress circle offsets by `753.98 * (1 - seconds/60)`; ring + numeral go red at `seconds <= 10`; at 0 auto-fire Close & Solve.
**When to use:** TheatreView running state.
**Example:**
```typescript
// Transcribed from comp startClock (lines 565-576) + ring markup (line 266).
const CIRC = 753.98                       // 2π·120, the r=120 progress circle circumference
const [seconds, setSeconds] = useState(60)
const clockRef = useRef<ReturnType<typeof setInterval>>()

function startWindow() {                   // START 60s WINDOW button
  setPhase('running'); setSeconds(60)
  clearInterval(clockRef.current)
  clockRef.current = setInterval(() => {
    setSeconds(s => {
      if (s - 1 <= 0) { clearInterval(clockRef.current); setTimeout(closeAndSolve, 200); return 0 }
      return s - 1
    })
  }, 1000)
}
const ringDash  = CIRC * (1 - seconds / 60)
const ringColor = seconds <= 10 ? '#E2231A' : '#F4F1EA'
// <circle r=120 stroke={ringColor} strokeWidth={2} strokeDasharray={CIRC}
//   strokeDashoffset={ringDash}
//   style={{ transition: 'stroke-dashoffset 1s linear, stroke .3s ease' }} />
// Reduced-motion: the count still runs (it's data, not decoration); the CSS transition
// is a no-op visually but harmless — match comp (comp does not gate the clock on reduced()).
```
> [VERIFIED: Umbra design/Umbra.dc.html lines 266, 565-576, 771-773]. `753.98` and `r=120` are binding (UI-SPEC line 179).

### Pattern 5: Close & Solve → reveal (CSS `umbraSlam`) + typewriter
**What:** `closeAndSolve` = `POST /close` then `GET /solve-preview`; show the flame COMPUTING beat for the real round-trip latency, then set phase `cleared` and render the lime `100.00` slab with `animation: umbraSlam`; type the rationale at ~26ms/char.
**When to use:** TheatreView (inline reveal) + AgentView (rationale panel).
**Example:**
```typescript
// Transcribed from comp closeSolve (578-587) + startType (632-642).
async function closeAndSolve() {
  setPhase('solving')                         // flame COMPUTING… (umbraPulse)
  try {
    await closeRound(roundId)                 // POST /round/:id/close
    const preview = await solvePreview(roundId) // GET /round/:id/solve-preview
    setPreview(preview); setPhase('cleared')  // reveal slab: animation: umbraSlam .42s …
    startType(preview.rationale)              // typewriter on the ink panel
  } catch (e) {
    if (e instanceof SolverError && e.code === 'OFFLINE') setOffline(true)
    else setError(e)
  }
}
// startType: if prefers-reduced-motion → setTyped(text) instantly; else
// setInterval 26ms slicing text[0..i]; flame caret = animation: umbraCaret .9s steps(1) infinite.
```
> The comp uses a fixed 1500ms fake solve delay; the LIVE build replaces it with the real `solvePreview` latency (UI-SPEC line 185, 192). The reveal is robust to a keyless solver: `rationale` is always present (deterministic fallback) and `clearingPrice` is always `100.00`. [VERIFIED: solver/src/api.ts solve-preview always returns deterministic numbers + agent.rationale; AgentResult fallback at agent.ts:163-169]

### Pattern 6: Hand-rolled SVG crossing chart from `curve` points
**What:** Map the solver's `curve: {price, demand, supply}[]` onto the comp's fixed `viewBox 0 0 480 360` frame, drawing a descending step demand path + ascending step supply path that cross at p*=100, q=10.
**When to use:** TheatreView solved state + AgentView (shared `CrossingChart`).
**How:** The UI-SPEC "SVG Crossing Chart" § gives the EXACT binding polyline points for the §4 fixture (supply `48,260 196,260 196,160 358,160 358,90`; demand `48,110 296,110 296,320`; p* rule at y=160; marker `circle cx296 cy160 r5`). For the live build, derive the screen coords from the curve:
```typescript
// Axis frame (binding): x ∈ [48,460], y ∈ [20,320]. Price ↑, Qty →.
// The §4 curve has a small candidate-price set; map each {price, demand, supply}:
//   sx(q) = 48 + (q / qMax) * (460 - 48)       // quantity → x
//   sy(p) = 320 - ((p - pMin) / (pMax - pMin)) * (320 - 20)  // price → y
// Build STEP paths (horizontal then vertical between candidate points) so the demand
// curve steps DOWN and supply steps UP, matching the comp's polyline geometry.
// p* = preview.clearingPrice (100.00); q* = preview.matchedVolume (10) — draw the red
// p* rule + dropline + circle marker + "100.00" / "q=10" annotations at those mapped coords.
```
> **Validate the mapping against the binding points:** for the canonical §4 fixture the derived paths MUST reproduce (within rounding) the UI-SPEC's literal polyline coords, and the crossing MUST land at the binding marker `(296,160)`. This is the §4-value visual assertion (see Validation Architecture). `curve` point shape `{price, demand, supply}` is verified from `buildCurve` [VERIFIED: solver/src/api.ts lines 115-123]. Supply curve draws on via `animation: umbraDraw 1s ease forwards` (`stroke-dasharray 640`). [VERIFIED: UI-SPEC lines 236-245; tailwind umbraDraw keyframe present]

### Pattern 7: Simultaneous settlement — ONE rAF `settleProgress` clock + `lerp` balances
**What:** On SETTLE ATOMICALLY, fire `POST /settle`, then drive a SINGLE `requestAnimationFrame` loop advancing `settleProgress` 0→1 over ~800ms. ALL leg tracks draw on and ALL balance numerals lerp `before→after` from this one clock — guaranteeing simultaneity. Then the `umbraStamp` "1 TRANSACTION · ATOMIC" badge.
**When to use:** SettlementView (THE second wow beat).
**Example:**
```typescript
// Transcribed VERBATIM from comp settle() (644-655) + lerp (736-741).
const [settleProgress, setSettleProgress] = useState(0)
const [stampIn, setStampIn] = useState(false)
const rafRef = useRef<number>()

async function settleAtomically() {
  if (phase === 'settling' || phase === 'settled') return
  await settle(roundId)                      // POST /round/:id/settle (atomic DvP)
  setPhase('settling')
  const dur = prefersReducedMotion() ? 0 : 800
  const start = performance.now()
  const step = (now: number) => {
    const t = dur ? Math.min(1, (now - start) / dur) : 1
    setSettleProgress(t)
    if (t < 1) rafRef.current = requestAnimationFrame(step)
  }
  rafRef.current = requestAnimationFrame(step)
  setTimeout(() => { setPhase('settled'); setStampIn(true); setSettleProgress(1) }, dur + 60)
}
// Balance numerals: lerp = (x, y) => x + (y - x) * settleProgress, applied to EVERY desk
// row's bondx/usdcx (before from current holdings, after from preview.allocations).
// Leg track draw-on: scale the track width OR a stroke-dashoffset by settleProgress —
// ALL legs share the same `settleProgress`, so they snap together (never sequenced).
// The comp's leg arrows are HTML <div> tracks (lines 441-459), NOT SVG polylines; the
// umbraLeg keyframe exists in CSS but the simplest faithful port is width:`${settleProgress*100}%`
// on each track (single source clock = simultaneity preserved).
```
> **Non-negotiable:** the comp uses ONE rAF clock for every leg + balance — do NOT sequence legs or give each its own animation. Reduced-motion → `dur=0` → instant. [VERIFIED: Umbra design/Umbra.dc.html lines 644-655, 736-741; UI-SPEC lines 225, 262, 266]
> **`umbraLeg` keyframe must be ADDED to `tailwind.config.ts`** (`from { strokeDashoffset: 'var(--len)' } to { strokeDashoffset: '0' }`) per UI-SPEC line 262 IF an SVG-stroke leg is chosen; if the width-scale div approach is used, no keyframe is needed. Either satisfies the "simultaneous" contract.

### Pattern 8: Lifted round/phase state in App, solver-offline guard
**What:** `App.tsx` owns `roundId`, `phase`, and `preview` so Theatre→Agent→Settlement share one round. A top-level `offline` flag (set when any solver call throws `SolverError.code === 'OFFLINE'`) gates the operator views to the caption "SOLVER OFFLINE — START THE SERVICE ON :4000" while Privacy (desk plane) keeps rendering.
**When to use:** App-level wiring.
**Note:** Keep the existing `RoundStateProbe` (ctxA) feeding `StatusIndicator` for the desk-visible status; the Theatre's own phase machine (`open|running|solving|cleared|settling|settled`) is local and drives the in-view animations. The two need not be unified — `StatusIndicator`'s `phaseFromStatus` already maps the Daml `RoundStatus`. [VERIFIED: web/src/App.tsx; StatusIndicator phase map covers all 6 per UI-SPEC line 143]

### Anti-Patterns to Avoid
- **Putting an operator token in the browser** to read aggregate data. The aggregate comes from :4000. (Structurally enforced; do not re-introduce.)
- **Sequencing the settlement legs.** Each leg with its own timer/keyframe breaks the "atomic = simultaneous" message. Use ONE `settleProgress` clock.
- **Passing Int/Numeric as JS numbers to `Venue.SubmitOrder`.** Daml codegen expects STRINGS (`'10'`, `'101.0'`) — Phase-3 Pitfall 8. Numbers will fail decode.
- **Adding a Vite proxy for :4000.** Unnecessary (CORS already allows :5173) and adds a base-URL gotcha. Direct `fetch` with `SOLVER_BASE_URL`.
- **Re-deriving the §4 numbers in the UI.** Display the solver's returned values (`clearingPrice`, `matchedVolume`, `allocations`) — but ASSERT they equal 100.00 / 10 / the canonical fills in tests. Never hard-code a fabricated value that drifts from the solver.
- **Importing `Side` from the Auction module.** It is exported from `Umbra/Clearing/module`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-party privacy on desk reads | A render-time filter hiding other desks' rows | The existing `createLedgerContext` per-desk providers (`ctxA/B/C`) | Structural guarantee — the rival query genuinely returns zero contracts (PRIV-05). A filter is a security regression. [VERIFIED: ledgerContexts.ts] |
| Operator-authority round control | A browser-side operator JWT | `web/src/solver.ts` → :4000 | Keeps the operator token out of the bundle (D6). |
| The clearing math / curve / rationale | Re-computing §8 in the browser | The solver's `solve-preview` / `settle` responses | The deterministic core + Claude rationale already exist server-side; the UI displays, never computes. |
| Charting | A chart library (recharts/d3) | Hand-rolled SVG with the UI-SPEC's binding geometry | Spec §6/§12.4 mandates hand-rolled SVG; a lib can't hit the comp's exact coords. |
| HTTP client | axios / a fetch wrapper lib | Native `fetch` + a 30-line `call<T>` helper | 5 trivial JSON endpoints; a dependency is overkill and a slop surface. |

**Key insight:** Phase 6 adds ZERO new logic to the privacy/clearing/settlement core — it is a presentation skin over frozen Phase-1–5 layers. The biggest risk is *re-implementing* something that already exists server-side or in the Phase-3 shell. Reuse aggressively.

---

## Common Pitfalls

### Pitfall 1: Numbers-as-strings on `Venue.SubmitOrder`
**What goes wrong:** Passing `quantity: 10` / `limit: 101.0` (JS numbers) to the codegen choice → decode error / silent failure.
**Why it happens:** Daml `Int`/`Numeric` map to TS `string` in the generated bindings.
**How to avoid:** Always `String(qty)` and `limit.toFixed(1)` (or `.toFixed(2)`). Phase-3 already proved this (DeskColumn line 69 comment "Int/Decimal as STRINGS").
**Warning signs:** Order never appears in the desk's stream; no error surfaced.

### Pitfall 2: Solver numbers come back as JSON numbers, ledger numbers as strings
**What goes wrong:** Mixing the two planes — assuming `TradeConfirmation.filledQty` is a number (it's a string from Daml) or that `solve-preview.clearingPrice` is a string (it's a JSON number from the solver's deterministic core).
**Why it happens:** Two serialization boundaries. The solver computes in plain JS (numbers); Daml decimals serialize as strings.
**How to avoid:** In `solver.ts` types, the :4000 fields are `number`. In desk-plane reads, wrap with `Number(...)`. Keep the two clearly separated.
**Warning signs:** `NaN` in the FillCard, or `.toFixed is not a function`.

### Pitfall 3: Cross-origin fetch failing silently looks like "no data"
**What goes wrong:** If the solver is down, a bare `fetch` rejects; an unhandled rejection leaves the view blank instead of showing the offline caption.
**Why it happens:** Network errors throw, not return a non-ok response.
**How to avoid:** Wrap `fetch` in try/catch → `SolverError(0, 'OFFLINE', …)` and gate operator views on it (Pattern 1 + 8). Privacy (desk plane) must still render.
**Warning signs:** Blank Theatre with no caption; console `TypeError: Failed to fetch`.

### Pitfall 4: `GET /round/:id` omits result fields until terminal status
**What goes wrong:** Reading `clearingPrice`/`curve`/`agent` from `GET /round/:id` before the round is Cleared/Settled → `undefined`.
**Why it happens:** Those fields are only attached when `status ∈ {Cleared, Settled}` (TERMINAL_STATUSES). [VERIFIED: api.ts lines 174-188]
**How to avoid:** Use `solve-preview` for the reveal (it ALWAYS returns the full result post-close). Treat `GET /round/:id` primarily for `status` + `sealedOrderCount`.
**Warning signs:** Reveal shows "—" despite a cleared round.

### Pitfall 5: `agent.source` vs the badge label
**What goes wrong:** Inventing a `'deterministic'` source string for the badge.
**Why it happens:** UI-SPEC label is `VERIFIED · DETERMINISTIC` but the actual enum value is `'deterministic-fallback'`.
**How to avoid:** `source === 'claude' ? 'VERIFIED · CLAUDE' : 'VERIFIED · DETERMINISTIC'`. [VERIFIED: agent.ts line 129 `source: 'claude' | 'deterministic-fallback'`]
**Warning signs:** Badge shows nothing / wrong label for keyless runs.

### Pitfall 6: Cleaning up timers / rAF on unmount
**What goes wrong:** Leaving `setInterval` (clock, typewriter) or `requestAnimationFrame` (settle) running after the view unmounts → state-update-on-unmounted warnings, leaked clocks.
**Why it happens:** The comp's class has `componentWillUnmount` clearing them; React function components need `useEffect` cleanup.
**How to avoid:** `useEffect(() => () => { clearInterval(clockRef.current); cancelAnimationFrame(rafRef.current) }, [])`. [VERIFIED: comp componentWillUnmount line 532, reset line 659]
**Warning signs:** Console warnings; countdown continuing after navigating away.

### Pitfall 7: `prefers-reduced-motion` not gated → motion-sick / failing a11y check
**What goes wrong:** Slam/typewriter/settle run regardless of the user's OS setting.
**Why it happens:** Forgetting the comp's `reduced()` guard.
**How to avoid:** A `prefersReducedMotion()` helper (`matchMedia('(prefers-reduced-motion: reduce)').matches`); typewriter → instant text, settle → `dur=0`, seal-wipe → instant. The countdown count itself still runs (it's data). [VERIFIED: comp reduced() line 537 + its use in seal/closeSolve/startType/settle]
**Warning signs:** Animations play with reduce enabled.

---

## Code Examples

### Reading the active desk's own fill (TradeConfirmation)
```typescript
// Source: web/.../Umbra/Auction/module.d.ts (TradeConfirmation shape) + DeskColumn.tsx pattern
const confirms = ctx.useStreamQueries(TradeConfirmation)
const tc = confirms.contracts[0]?.payload   // own confirmation only (privacy)
// §4: A → filledQty '10', clearingPrice '100.00', cashMoved '-1000'
//     B → '-8' / '100.00' / '+800';  C → '-2' (of 5) / '100.00' / '+200'
const sign = tc && Number(tc.filledQty) >= 0 ? '+' : ''
const fillColor = Number(tc?.filledQty) > 0 ? '#2B3AF2' : '#FF3D9A'  // buy / sell
```

### Reveal slab markup (the money-shot numeral)
```tsx
// Source: UI-SPEC lines 186-189 (binding); animation from tailwind umbra-slam.
<div className="animate-umbra-slam" style={{
  display:'inline-block', background:'#D6FB3C', color:'#0A0A0A', padding:'10px 26px 14px', position:'relative'
}}>
  <span style={{ fontFamily:'"IBM Plex Mono"', fontSize:'120px', lineHeight:.9,
    letterSpacing:'-.03em', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>
    {preview.clearingPrice.toFixed(2)}{/* 100.00 */}
  </span>
  <span style={{ position:'absolute', right:-1, top:-1, bottom:-1, width:5,
    background:'#E2231A', transform:'skewX(-12deg)' }} />
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Comp's local `solve()` simulation | Live `GET /solve-preview` (:4000) returning the deterministic §8 + Claude rationale | Phase 5 | Reveal latency = real round-trip, not a fixed 1500ms |
| Comp's local `settle()` mutating in-memory balances | `POST /settle` runs on-ledger `Round.Clear` (atomic DvP) | Phase 4 | The `settleProgress` rAF now animates over REAL settled balances (from `allocations` + per-desk `TradeConfirmation`) |
| Phase-3 Nav with only PRIVACY enabled | 5-tab Nav, all enabled | This phase | `Screen` union widened to `'privacy'|'desk'|'theatre'|'agent'|'settlement'` |

**Deprecated/outdated:**
- The comp's fabricated `SOLVER-AGENT-01/02` rows: stretch §19 only — Phase 6 renders ONLY the real rank-1 `SOLVER-AGENT-00` row (keep table markup, don't fabricate).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fetch` is available in the target browser (no polyfill) | Standard Stack | Negligible — Vite dev + modern browsers; any evergreen browser has it. |
| A2 | A `VITE_SOLVER_URL` env knob (default `http://localhost:4000`) satisfies CONTEXT's "env/config knob for the solver base URL" | Pattern 1 | Low — CONTEXT explicitly asks for this; the exact env-var name is at executor discretion. |
| A3 | The width-scale `div` leg draw-on (vs SVG `umbraLeg` stroke) is an acceptable faithful port | Pattern 7 | Low — the comp's own legs are HTML divs; both satisfy the "simultaneous" contract. UI-checker/visual diff is the gate. |
| A4 | `Allocation` element shape (per-desk filled qty) is sufficient to derive per-desk before→after balances for the BalanceTable | Pattern 7 | Medium — the precise `Allocation` field names are defined in `solver/src/auction.ts` (not re-read this session); the planner/executor should grep `auction.ts` for the `Allocation` type before wiring the BalanceTable. The per-desk `TradeConfirmation` (cashMoved/filledQty) is a verified fallback source for each desk's own row. |

**Risk-reducing note for A4:** The desk-plane `TradeConfirmation` already carries `filledQty` + `cashMoved` per desk (verified), so each desk's OWN row in its own view is fully sourced without `Allocation`. Only the Operator/aggregate BalanceTable needs the `allocations` array decomposed — executor should confirm the `Allocation` shape from `solver/src/auction.ts` in Wave 1.

---

## Open Questions

1. **Exact `Allocation` field names from the solver response.**
   - What we know: `solve-preview`/`settle`/`GET` all return `allocations: Allocation[]`; `Allocation` is defined in `solver/src/auction.ts`.
   - What's unclear: the precise per-element fields (desk party, filledQty, side, cash) were not re-read this session.
   - Recommendation: Wave-1 task greps `solver/src/auction.ts` for `Allocation`/`OrderView` and mirrors them into `solver.ts` types before wiring the aggregate BalanceTable + DvP legs. Per-desk own rows can use `TradeConfirmation` regardless.

2. **Whether the round must be created from the UI (`POST /round`) or already exists from Phase-3 seeding.**
   - What we know: Phase 3 seeds a screenshot-ready round (`R1`); the solver has `POST /round`.
   - What's unclear: whether Theatre's START 60s WINDOW should open a NEW round or drive the existing seeded `R1`.
   - Recommendation: The comp's flow starts a window on an already-sealed book, so the simplest faithful path is: Theatre operates on the existing seeded round id; `POST /round` is available but the demo can run on `R1`. Confirm the round-id source in Wave-1 (likely a `VITE_ROUND_ID` default of `R1`, matching the seeded id).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Solver service :4000 | Theatre/Agent/Settlement (operator plane) | runtime (must be started) | — | "SOLVER OFFLINE" caption; Privacy still renders |
| JSON API :7575 (via Vite proxy) | Desk plane reads + SubmitOrder | runtime (Phase-3 already wired) | Daml 2.10.4 | none — desk view requires it (Privacy already depends on it) |
| Node 20 / npm | build + optional test runner | ✓ (Phases 1–5 built on it) | 20.x | — |
| `@daml.js/umbra-0.1.0` bindings | all desk-plane reads | ✓ installed | generated (2.10.4) | — |

**Missing dependencies with no fallback:** none (everything is already installed or is a runtime service the demo starts).
**Missing dependencies with fallback:** Solver :4000 — graceful offline caption is the designed fallback (CONTEXT).

---

## Validation Architecture

> `nyquist_validation` is enabled (config.json `workflow.nyquist_validation: true`). Frontend validation here is **build-green + the §4-value assertions + targeted logic tests for `solver.ts` and the SVG path math + manual/visual checks against the comp** (per the objective).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None in `web/` yet** — `web/package.json` has no test runner. Add `vitest@2.1.9` (match solver) in Wave 0 ONLY if logic tests are scoped. [VERIFIED: web/package.json] |
| Config file | none — would reuse `web/vite.config.ts` via vitest's Vite integration (add a `test` block) |
| Quick run command | `cd web && npx vitest run <file>` (after Wave-0 install) |
| Full suite command | `cd web && npm run build` (tsc --noEmit + vite build) is the PRIMARY gate; `cd web && npx vitest run` if tests added |
| Type/build gate | `cd web && npm run build` → `tsc --noEmit && vite build` (already the script) [VERIFIED: web/package.json] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-04 | `solver.ts` parses a §4 `solve-preview` payload → `clearingPrice===100`, `matchedVolume===10`, `agent.source` mapped to badge | unit | `npx vitest run src/solver.test.ts` | ❌ Wave 0 |
| UI-04 | `solver.ts` maps a network failure → `SolverError.code==='OFFLINE'` (offline guard) | unit | `npx vitest run src/solver.test.ts` | ❌ Wave 0 |
| UI-05 | SVG mapping fn maps the §4 `curve` → crossing at the binding marker `(296,160)`, p*=100, q=10 | unit | `npx vitest run src/crossingChart.test.ts` | ❌ Wave 0 |
| UI-06 | `lerp(before, after, t)` + leg-width math: at `t=0` shows before-balances, `t=1` shows §4 finals (A 10/4000 · B 12/1800 · C 13/1200) | unit | `npx vitest run src/settle.test.ts` | ❌ Wave 0 |
| UI-02 | Int/Numeric serialized as STRINGS in the `SubmitOrder` arg builder | unit (pure builder fn) | `npx vitest run src/orderTicket.test.ts` | ❌ Wave 0 |
| UI-02/04/05/06 | All views compile + typecheck against frozen API/binding types | build | `cd web && npm run build` | ✅ (script exists) |
| UI-02/04/06 | Visual fidelity to comp (reveal slab, simultaneous legs, stamp) | manual / visual | screenshot vs `Umbra design/screenshots/{02-reveal,theatre,theatre2}.png` | manual |

> **Design choice — keep logic testable by extracting pure functions.** Put the curve→SVG mapping, the `lerp`, the `agent.source`→badge map, and the `SubmitOrder` arg builder in small pure modules so they're unit-testable without rendering React (avoids needing `jsdom`/RTL for the core assertions). Component rendering is validated by `tsc`/build + manual visual diff.

### Sampling Rate
- **Per task commit:** `cd web && npm run build` (typecheck + build green) — the cheap, always-on gate.
- **Per wave merge:** `cd web && npm run build` + (if tests added) `npx vitest run` of the touched logic module.
- **Phase gate:** Build green + all §4-value unit assertions pass + manual visual pass against the three comp screenshots before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] (optional) `web/vitest` install: `cd web && npm i -D vitest@2.1.9 jsdom @testing-library/react @testing-library/jest-dom` — ONLY if logic unit tests are planned. Pure-function tests need just `vitest` (no jsdom/RTL).
- [ ] `web/src/solver.test.ts` — covers UI-04 (payload parse + offline guard)
- [ ] `web/src/crossingChart.test.ts` — covers UI-05 (curve→coords mapping, §4 crossing)
- [ ] `web/src/settle.test.ts` — covers UI-06 (lerp + leg math → §4 finals)
- [ ] A `test` block in `vite.config.ts` (vitest reuses the Vite config) if tests are added
- [ ] If NO unit tests are scoped: Wave-0 gap is "none — `npm run build` (tsc) + manual visual diff is the validation strategy" (acceptable for a hackathon UI phase, but the §4-value pure-function tests are cheap insurance and strongly recommended given the money-shot stakes).

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`. This phase is browser-side presentation over already-secured planes; the security surface is small but real.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Per-party HS256 desk JWTs (Phase-3, unchanged); operator token NEVER in browser (the core control — preserved by routing operator actions through :4000) |
| V3 Session Management | no | dev JWTs are static per-party; no session lifecycle in scope |
| V4 Access Control | yes | The two-plane split IS the access control: desk plane sees only own contracts (structural, `createLedgerContext`); operator authority lives only in :4000. Do not weaken either. |
| V5 Input Validation | yes (light) | Order ticket inputs: `parseInt`/`parseFloat` + integer/decimal coercion (comp `setField` does this). The solver re-validates POST bodies with zod; the on-ledger `Round.Clear` re-verifies §8. Browser validation is UX, not the trust boundary. |
| V6 Cryptography | no | No crypto in the frontend; JWTs are minted by `scripts/mint-tokens.mjs` (out of scope) |
| V7 Error Handling | yes | The solver's error envelope `{error:{code,message}}` is guaranteed secret-free (no token/key/env). The `solver.ts` client must surface `message`/`code` only — never log raw headers. The OFFLINE state must not leak the attempted URL beyond the benign base. |

### Known Threat Patterns for the frontend two-plane stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Operator token leaking into the browser bundle | Information Disclosure / Elevation | Never import/store an operator token in `web/`; all operator actions via :4000 (the service holds authority). [structurally enforced] |
| A desk reading another desk's order/fill | Information Disclosure | Per-party `createLedgerContext` — the rival query returns zero contracts (no render-time filter to bypass). Do NOT add a shared/operator context to "simplify" reads. |
| CORS misconfig allowing any origin to drive :4000 | Tampering / Elevation | Solver already scopes `cors({ origin: 'http://localhost:5173' })` — do NOT change to `'*'` or add a permissive proxy. [VERIFIED: api.ts line 30,129] |
| Trusting the displayed clearing price unverified | Tampering | UI displays solver numbers but the on-ledger `Round.Clear` is the source of truth (verify-don't-trust); §4-value test assertions catch UI drift. |
| Secret leakage via error text | Information Disclosure | Surface only the solver's structured `{code,message}`; never echo request headers or the base URL beyond the benign host. |

---

## Sources

### Primary (HIGH confidence)
- `solver/src/api.ts` — the frozen 5-endpoint response shapes (`/round`, `/round/:id`, `/close`, `/solve-preview`, `/settle`), CORS scope, error envelope. [VERIFIED]
- `solver/src/agent.ts` — `AgentResult.source: 'claude' | 'deterministic-fallback'`, `verified: boolean`, fallback path. [VERIFIED]
- `web/node_modules/@daml.js/umbra-0.1.0/lib/Umbra/Auction/module.d.ts` — `TradeConfirmation`, `RoundStats`, `Round`, `ClearResult` payload shapes. [VERIFIED]
- `web/src/components/DeskColumn.tsx`, `ledgerContexts.ts`, `desks.ts`, `App.tsx`, `Nav.tsx`, `config.ts`, `vite.config.ts`, `tailwind.config.ts` — the Phase-3 patterns to reuse/extend. [VERIFIED]
- `Umbra design/Umbra.dc.html` (render-class lines 510-789, DvP legs 434-479, ring 266, keyframes 19-27) — the binding animation reference (`startClock`, `closeSolve`, `solve`, `startType`, `settle` single-rAF + `lerp`, `reduced()`). [VERIFIED]
- `.planning/phases/06-auction-theatre-settlement-animation/06-UI-SPEC.md` — APPROVED design contract (tokens, geometry, copy, keyframes, reuse inventory). [CITED]
- `.planning/phases/06-auction-theatre-settlement-animation/06-CONTEXT.md` — locked two-plane decisions, scope. [CITED]
- `spec.md` §11/§12 — endpoint + frontend functional requirements; §4 fixture. [CITED]
- `CLAUDE.md` — binding-comp + no-Claude-attribution + stack constraints. [CITED]

### Secondary (MEDIUM confidence)
- `web/package.json`, `solver/package.json` — installed versions; `web/` has no test runner, `solver/` has `vitest@2.1.9`. [VERIFIED]

### Tertiary (LOW confidence)
- none — every claim is grounded in a read file.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new runtime deps; all versions read from `package.json`.
- Architecture (two planes, API shapes, binding paths): HIGH — read directly from frozen `api.ts`, `agent.ts`, the `.d.ts` bindings, and the Phase-3 components.
- Animation techniques: HIGH — transcribed verbatim from the comp render-class.
- The `Allocation` field shape for the aggregate BalanceTable: MEDIUM — type lives in `auction.ts` (not re-read this session); Open Question 1 + Assumption A4 flag it for a Wave-1 grep. Per-desk own rows are fully sourced (HIGH).

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stable — all inputs are frozen in-repo artifacts; only changes if Phases 1–5 are modified)

## RESEARCH COMPLETE

**Phase:** 06 - auction-theatre-settlement-animation
**Confidence:** HIGH

### Key Findings
- **Zero new runtime packages.** React 18.3.1, `@daml/react@2.10.4`, and the `@daml.js/umbra-0.1.0` bindings are all installed; the only additions are new view files, `web/src/solver.ts` (native `fetch`), and the `umbraLeg` keyframe + a few `fontSize` literals in `tailwind.config.ts`.
- **The solver client needs NO Vite proxy** — `solver/src/api.ts` already sets `cors({ origin: 'http://localhost:5173' })`. Direct cross-origin `fetch` against a `VITE_SOLVER_URL` (default `http://localhost:4000`) is correct and simplest.
- **Every API shape is frozen and verified** from `api.ts`: `solve-preview` → `{clearingPrice, matchedVolume, allocations, curve, rationale, agent:{verified,source}}`; `GET /round/:id` attaches result fields ONLY at terminal status (use `solve-preview` for the reveal). `agent.source` is `'claude' | 'deterministic-fallback'` (maps to the `VERIFIED · CLAUDE/DETERMINISTIC` badge).
- **All animation techniques are transcribed verbatim** from the comp render-class: `setInterval` 1s countdown + `stroke-dashoffset = 753.98*(1-s/60)`; CSS `umbraSlam` reveal; **a SINGLE `requestAnimationFrame` `settleProgress` 0→1 over 800ms driving ALL legs + `lerp` balances simultaneously** (the non-negotiable atomic-settlement beat); `reduced()` gating on every motion.
- **Desk-plane payload shapes verified:** `TradeConfirmation = {…, filledQty:Int, clearingPrice:Numeric, cashMoved:Numeric}` (the FillCard trio); `Side` imports from `Umbra/Clearing/module`; Int/Numeric MUST be passed to `SubmitOrder` as STRINGS.

### File Created
`.planning/phases/06-auction-theatre-settlement-animation/06-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new deps; versions read from package.json |
| Architecture | HIGH | API/binding shapes read from frozen api.ts/agent.ts/.d.ts + Phase-3 components |
| Pitfalls | HIGH | Grounded in the actual serialization boundaries + comp lifecycle |

### Open Questions
1. Exact `Allocation` field names (in `solver/src/auction.ts`, not re-read) — needed only for the AGGREGATE BalanceTable; per-desk own rows are fully sourced via `TradeConfirmation`. Wave-1 grep recommended.
2. Whether Theatre opens a NEW round (`POST /round`) or drives the seeded `R1` — recommend operating on the seeded round id (`VITE_ROUND_ID` default `R1`).

### Ready for Planning
Research complete. The planner can create PLAN.md files: a Wave-0 (optional vitest + pure-function test stubs) and Waves for `solver.ts`, DeskView (02), TheatreView+CountdownRing+CrossingChart+PriceReveal (03), AgentView (04), SettlementView+DvpLegs+BalanceTable (05), plus Nav/App extension. The two wow beats (reveal slam, simultaneous settle) and the §4-value assertions are the correctness anchors.
