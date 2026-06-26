---
phase: 06-auction-theatre-settlement-animation
plan: 04
subsystem: ui
tags: [react, vite, tailwind, settlement, dvp, animation, rAF, typewriter, agent, operator-plane]

# Dependency graph
requires:
  - phase: 06-auction-theatre-settlement-animation
    plan: 01
    provides: "web/src/solver.ts (settle/SolverError + Allocation type), lib/balance (lerp + deskBalancesFromAllocations), lib/solverParse (badgeLabel), operatorState (OperatorViewState), tailwind animate-umbra-caret / animate-umbra-stamp aliases + 22/18/15 fontSize literals"
  - phase: 06-auction-theatre-settlement-animation
    plan: 03
    provides: "operator-plane / lifted-state conventions (App round/phase/preview slice); TheatreView pattern (CrossingChart, offline caption)"
  - phase: 04-solver-service
    provides: "Allocation = {desk, side:'Buy'|'Sell', filledQty} (solver/src/auction.ts lines 30-34) — CONFIRMED before wiring"
  - phase: 05-ai-solver-agent
    provides: "agent:{verified,source} + rationale on the solve-preview payload"
provides:
  - "web/src/views/AgentView.tsx — 04 Agent: proposal + verified/source badge + typewriter rationale (overwrites the Plan-01 stub)"
  - "web/src/components/AgentProposal.tsx — SOLVER-AGENT-00 proposal list (100.00 / 10 units / §4 signed fills) + badgeLabel(agent.source) tag"
  - "web/src/components/AgentRationale.tsx — ink-panel typewriter (~26ms/char) + animate-umbra-caret + rank-1-only competing-agents row"
  - "web/src/views/SettlementView.tsx — 05 Settlement: single-rAF simultaneous atomic settle + DvP legs + balances; drives POST /settle (overwrites the Plan-01 stub)"
  - "web/src/components/DvpLegs.tsx — paired asset(ink)+cash(red) arrows, shared-settleProgress simultaneous draw-on"
  - "web/src/components/AtomicStamp.tsx — '1 TRANSACTION · ATOMIC' animate-umbra-stamp badge"
  - "web/src/components/BalanceTable.tsx — before→after lerp to the §4 finals"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single rAF settleProgress 0→1 (~800ms) clock drives ALL DvP legs + ALL balance lerps simultaneously (atomic = simultaneous, never sequenced); reduced-motion → dur=0 instant; cancelAnimationFrame on unmount"
    - "Pure-prop motion children (DvpLegs/BalanceTable/AtomicStamp own NO timers) — one parent clock owns all motion, guaranteeing simultaneity"
    - "Typewriter via setInterval slicing text[0..i], reduced-motion → full text instantly, interval cleared on unmount"
    - "Aggregate balances/legs derived from solver allocations (:4000) via deskBalancesFromAllocations; Allocation shape verified against solver/src/auction.ts; no operator token / @daml/react context in any touched file"

key-files:
  created:
    - web/src/components/AgentProposal.tsx
    - web/src/components/AgentRationale.tsx
    - web/src/components/DvpLegs.tsx
    - web/src/components/AtomicStamp.tsx
    - web/src/components/BalanceTable.tsx
  modified:
    - web/src/views/AgentView.tsx
    - web/src/views/SettlementView.tsx

key-decisions:
  - "Allocation shape CONFIRMED against solver/src/auction.ts lines 30-34 ({desk, side:'Buy'|'Sell', filledQty}) before wiring; web/src/solver.ts line 22 mirror + deskBalancesFromAllocations read the same fields — no decode drift (RESEARCH Open Q1 / A4)"
  - "DvP legs derived from allocations: each Sell desk delivers filledQty BONDX to the single Buy desk, paid filledQty·clearingPrice USDCx → §4 yields 2 legs (MERIDIAN→BLUEROCK 8/800, HALWARD→BLUEROCK 2/200)"
  - "§4 BEFORE balances (A:0/5000 · B:20/1000 · C:15/1000) mirror balance.test.ts so deskBalancesFromAllocations lands exactly on the binding finals A:10/4000 · B:12/1800 · C:13/1200"
  - "Leg draw-on uses the comp's HTML-div width-scale approach (width:${settleProgress*100}%) — no SVG stroke, no umbraLeg keyframe needed (RESEARCH A3); single settleProgress shared by every leg preserves simultaneity"

requirements-completed: [UI-06]

# Metrics
duration: 4min
completed: 2026-06-26
---

# Phase 6 Plan 04: Solver Agent + Settlement Summary

**The 04 Agent view (SOLVER-AGENT-00 proposal + verify-don't-trust source badge + typewriter rationale on the ink panel) and the 05 Settlement view's second wow beat — a single rAF settleProgress clock that draws ALL DvP legs and lerps ALL balances SIMULTANEOUSLY to the §4 finals (A:10/4000 · B:12/1800 · C:13/1200), capped by the "1 TRANSACTION · ATOMIC" stamp — driving POST /settle on the operator plane (:4000) with the Allocation shape confirmed against auction.ts.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-26T01:45:53Z
- **Completed:** 2026-06-26T01:50:41Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 overwritten stubs)

## Accomplishments

- **04 Agent view** (`AgentView` + `AgentProposal` + `AgentRationale`): renders the SOLVER-AGENT-00 proposal — Clearing Price `preview.clearingPrice.toFixed(2)` ("100.00"), Matched Volume "10 units", and per-desk signed fill rows from `preview.allocations` (BLUEROCK +10 #2B3AF2 · MERIDIAN −8 #FF3D9A · HALWARD −2). The NEW verify-don't-trust badge maps `agent.source` via `lib/solverParse.badgeLabel` ("VERIFIED · CLAUDE" | "VERIFIED · DETERMINISTIC"), ink text only. The rationale renders typewriter-revealed (~26ms/char) on the ink panel with the flame `animate-umbra-caret`; reduced-motion → full text instantly; the interval is cleared on unmount. Robust to a keyless solver (rationale always present). Only the rank-1 real competing-agents row renders (grid markup kept for stretch §19; no fabricated AGENT-01/02).
- **05 Settlement view** (`SettlementView` + `DvpLegs` + `BalanceTable` + `AtomicStamp`): the second wow beat. `settleAtomically()` POSTs `/round/:id/settle` via `solver.ts`, then a SINGLE `requestAnimationFrame` `settleProgress` loop (0→1 over ~800ms) drives every leg's draw-on AND every balance numeral's `lerp(before, after, settleProgress)` — they snap together, never sequenced. Reduced-motion → `dur=0` instant; the rAF + done-timer are cancelled on unmount. The DvP legs are paired asset(ink, →) + cash(red, ←) arrows with CSS-triangle arrowheads (§4: MERIDIAN→BLUEROCK 8 BONDX/800 USDCx, HALWARD→BLUEROCK 2 BONDX/200 USDCx). The "1 TRANSACTION · ATOMIC" `animate-umbra-stamp` stamps in on completion. The aggregate before→after balances land on the §4 finals via `deskBalancesFromAllocations`.
- **Allocation shape verified** against `solver/src/auction.ts` lines 30-34 (`{ desk: string; side: 'Buy' | 'Sell'; filledQty: number }`) BEFORE wiring; `web/src/solver.ts` line 22 mirror and `deskBalancesFromAllocations` read the same fields — guarding the §4-finals derivation (RESEARCH Open Question 1 / Assumption A4).
- **Two-plane safety preserved:** no operator token / no `@daml/react` operator context in any of the 7 files — the aggregate comes from `solver.ts` → :4000 (threat T-06-01); the offline path shows the graceful caption while Privacy keeps rendering (T-06-07).

## Task Commits

1. **Task 1: AgentView — proposal + verified/source badge + typewriter rationale** — `477cfbb` (feat)
2. **Task 2: SettlementView — simultaneous atomic settle + DvP legs + balances + stamp** — `15b01c4` (feat)

_Note: Task 2's behavior contract (the allocations→balances §4-finals derivation + lerp endpoints, the GREEN gate for the settle math) is `web/src/lib/balance.test.ts`, authored test-first in Plan 01 and re-run green here — the new UI wires onto that proven derivation._

## Files Created/Modified

- `web/src/views/AgentView.tsx` — 04 Agent: 2-col proposal | rationale grid, empty + offline states (overwrites the Plan-01 stub)
- `web/src/components/AgentProposal.tsx` — proposal list + `badgeLabel(agent.source)` tag + §4 signed fills
- `web/src/components/AgentRationale.tsx` — ink-panel typewriter + `animate-umbra-caret` + rank-1-only competing-agents row
- `web/src/views/SettlementView.tsx` — 05 Settlement: single-rAF simultaneous settle, drives POST /settle, offline-safe (overwrites the Plan-01 stub)
- `web/src/components/DvpLegs.tsx` — paired asset(ink)+cash(red) arrows, shared-settleProgress draw-on
- `web/src/components/AtomicStamp.tsx` — "1 TRANSACTION · ATOMIC" `animate-umbra-stamp` badge
- `web/src/components/BalanceTable.tsx` — before→after `lerp` to the §4 finals

## Decisions Made

- **Allocation shape confirmed first** (the Task-2 guard step): `solver/src/auction.ts` lines 30-34 = `{ desk, side: 'Buy'|'Sell', filledQty }`; `web/src/solver.ts` line 22 mirror matches; `deskBalancesFromAllocations` reads `desk`/`side`/`filledQty`. The §4-finals derivation decodes the right fields.
- **Leg derivation from allocations:** every `Sell` allocation → one leg (seller delivers `filledQty` BONDX to the single `Buy` desk, paid `filledQty·clearingPrice` USDCx). §4 → exactly 2 legs. The cash leg is opposite the asset leg (DvP).
- **§4 BEFORE balances** (A:0/5000 · B:20/1000 · C:15/1000) match `balance.test.ts` so the after-balances land on the binding finals — a single source of truth for the §4 canary.
- **Width-scale draw-on** (HTML div, `width:${settleProgress*100}%`) per RESEARCH A3 — faithful to the comp's div-track legs; no `umbraLeg` SVG keyframe needed. The single shared `settleProgress` is what guarantees simultaneity.
- **This plan does NOT edit `tailwind.config.ts`** — it only consumes the Plan-01 `animate-umbra-caret` / `animate-umbra-stamp` aliases via className.

## Deviations from Plan

None — plan executed exactly as written. (The Allocation-shape verification step ran and confirmed the expected `{desk, side, filledQty}` with no mismatch, so no fix was required.)

## Known Stubs

None. Both views are now full compositions wired to the lifted `SolvePreviewResponse` (the Plan-01 view stubs are fully overwritten). The competing-agents table renders only the real rank-1 row by design (stretch §19 rows are intentionally deferred, grid markup retained) — this is a documented scope boundary, not a data stub.

## Self-Check: PASSED

- web/src/views/AgentView.tsx — FOUND
- web/src/components/AgentProposal.tsx — FOUND
- web/src/components/AgentRationale.tsx — FOUND
- web/src/views/SettlementView.tsx — FOUND
- web/src/components/DvpLegs.tsx — FOUND
- web/src/components/AtomicStamp.tsx — FOUND
- web/src/components/BalanceTable.tsx — FOUND
- Commit 477cfbb (Task 1) — FOUND
- Commit 15b01c4 (Task 2) — FOUND
- `cd web && npm run build` — green; `npx vitest run src/lib/balance.test.ts` — 4/4 green
- grep: `animate-umbra-caret` (AgentRationale) + `animate-umbra-stamp` (AtomicStamp) present; single rAF `step` loop in SettlementView (no per-leg timers); `cancelAnimationFrame` on unmount; no operator token / @daml/react context in the 7 touched files
- Author/committer = woshvad <woshvad@gmail.com>; no Claude attribution / Co-Authored-By

---
*Phase: 06-auction-theatre-settlement-animation*
*Completed: 2026-06-26*
