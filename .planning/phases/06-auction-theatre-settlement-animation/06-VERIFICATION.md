---
phase: 06-auction-theatre-settlement-animation
verified: 2026-06-26T03:10:00Z
status: human_needed
score: 22/22 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
human_verification:
  - test: "Run `make demo` (daml start + solver :4000 + web :5173). In 03 Theatre, click Start 60s Window, wait/Close & Solve; confirm the lime 100.00 slab SLAMS in (umbra-slam) and the crossing chart draws on."
    expected: "Countdown ring empties and goes red at <=10s; SOLVER-AGENT-00 COMPUTING beat holds for the real round-trip; 100.00 reveals on the lime slab matching the comp screenshots."
    why_human: "Live animation fidelity (the reveal slam timing + ring transition) cannot be exercised headlessly; requires a running ledger + solver."
  - test: "In 05 Settlement, click Settle Atomically and watch all DvP leg tracks + all balance numerals."
    expected: "ALL legs (A<->B 8@100, A<->C 2@100) draw on SIMULTANEOUSLY and every balance row lerps to the §4 finals (A:10/4000 · B:12/1800 · C:13/1200) in lockstep; the '1 TRANSACTION · ATOMIC' stamp slams in. No leg is sequenced."
    why_human: "Simultaneity feel and pixel fidelity vs the comp are visual; the single-rAF code path is verified statically but the rendered motion needs a human eye."
  - test: "Full live money-shot E2E: three desks submit blind in 02 Desk -> 01 Privacy proves no cross-visibility -> 03 Theatre reveals 100.00 -> 05 Settlement atomic settle -> each desk sees only its own FillCard."
    expected: "End-to-end vertical slice runs with a live ledger + solver; matches Phases 1-5 precedent."
    why_human: "Requires a running daml start + solver + web; this is explicitly Phase-7 / UI-07 / DEMO-03 territory (deferred per scope note)."
  - test: "With the solver :4000 STOPPED, load the app and open 03 Theatre / 04 Agent / 05 Settlement."
    expected: "Each operator view shows 'SOLVER OFFLINE — START THE SERVICE ON :4000' and 01 Privacy still renders normally (no crash)."
    why_human: "Graceful-offline behavior at runtime needs the app actually running with the solver down."
---

# Phase 6: Auction Theatre & Settlement Animation — Verification Report

**Phase Goal:** Build the remaining live frontend views + the motion that makes the mechanism legible — the Desk view, the Auction theatre (countdown/reveal), the hand-rolled SVG supply/demand crossing chart, and the atomic-settlement animation — matching the binding Umbra design/ comp.
**Verified:** 2026-06-26
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Authoritative Gates (run firsthand)

| Gate | Command | Result | Status |
| ---- | ------- | ------ | ------ |
| Build | `cd web && npm run build` (tsc --noEmit && vite build) | 106 modules transformed, built in 2.13s, exit 0 | ✓ GREEN |
| §4-value tests | `cd web && npx vitest run src/lib` | 3 files / 11 tests passed (balance 4, curve 3, solverParse 4), exit 0 | ✓ GREEN |

Both authoritative gates pass. The 11 lib tests assert the §4 values: clearingPrice===100, matchedVolume===10, crossing at (296,160), and the full allocations→balances derivation yielding A:10/4000 · B:12/1800 · C:13/1200.

### Observable Truths

| #   | Truth (source plan) | Status | Evidence |
| --- | ------------------- | ------ | -------- |
| 1 | solver.ts exposes createRound/getRound/closeRound/solvePreview/settle vs VITE_SOLVER_URL (default :4000) | ✓ VERIFIED | `web/src/solver.ts` lines 15-16, 112-129 — all 5 exported, base URL `import.meta.env.VITE_SOLVER_URL ?? 'http://localhost:4000'` |
| 2 | Network failure to :4000 → SolverError code 'OFFLINE'; never leaks operator token | ✓ VERIFIED | `solver.ts` lines 91-102: fetch catch throws `SolverError(0,'OFFLINE',…)`; message is a fixed caption, no URL/header interpolation |
| 3 | Pure lib helpers pass §4-value tests (price 100, matched 10, crossing (296,160), §4 final balances) | ✓ VERIFIED | 11/11 vitest pass; `curve.test.ts` asserts (296,160); `balance.test.ts` asserts finals |
| 4 | balance.test asserts deskBalancesFromAllocations(§4)→A:10/4000·B:12/1800·C:13/1200 (full derivation) | ✓ VERIFIED | `balance.test.ts` lines 40-46 — `toEqual({bondx:10,usdcx:4000})` etc. |
| 5 | Nav Screen union = privacy\|desk\|theatre\|agent\|settlement, all 5 enabled | ✓ VERIFIED | `Nav.tsx` lines 5-13 — union + TABS, every `enabled: true` |
| 6 | App routes all 5 views, lifts roundId/phase/preview/offline, threads activeDesk; build green | ✓ VERIFIED | `App.tsx` lines 50-107 — operatorState lifted, all 5 screens routed; build exit 0 |
| 7 | tailwind adds umbraLeg keyframe + fontSize literals + umbra-draw/-pulse/-caret(+-leg) aliases | ✓ VERIFIED | `tailwind.config.ts` lines 86, 97-100 — umbraLeg keyframe + 4 aliases present |
| 8 | No operator token and no operator @daml/react context anywhere in web/src | ✓ VERIFIED | grep: all "operator" matches are comments affirming absence or the OperatorViewState DTO; no anthropic key; every DamlLedger mount is a desk token |
| 9 | DeskView ticket submits Venue.SubmitOrder via desk's own useLedger, locks after submit | ✓ VERIFIED | `OrderTicket.tsx` lines 83-89 — `ledger.exercise(Venue.SubmitOrder,…)`; `ticketLocked` lines 58 |
| 10 | load-demo pre-fills §4: A Buy 10@101 · B Sell 8@99 · C Sell 5@100 | ✓ VERIFIED | `OrderTicket.tsx` lines 30-34 DEMO map matches exactly |
| 11 | Desk sealed order + holdings render from desk's own per-party queries (never others') | ✓ VERIFIED | `DeskView.tsx` mounts `ctx.DamlLedger` (desk token); HoldingsPanel `useStreamQueries(Asset)` |
| 12 | After settlement desk's own TradeConfirmation renders in YOUR FILL card | ✓ VERIFIED | `FillCard.tsx` `useStreamQueries(TradeConfirmation)`, filledQty/clearingPrice |
| 13 | Int/Numeric args passed to SubmitOrder as STRINGS | ✓ VERIFIED | `OrderTicket.tsx` lines 87-88 — `quantity: String(qtyInt)`, `limit: limitNum.toFixed(1)` |
| 14 | Theatre 60s ring (CIRC 753.98, red≤10s, auto-fire at 0) + live sealedOrderCount | ✓ VERIFIED | `CountdownRing.tsx` CIRC=753.98, red at `seconds<=10`; `TheatreView.tsx` lines 69-79 auto-fires closeAndSolve at 0; getRound count line 85 |
| 15 | Close & Solve = POST close then GET solve-preview (NOT GET round for result) | ✓ VERIFIED | `TheatreView.tsx` lines 44-50 — `closeRound` then `solvePreview` |
| 16 | Lime 100.00 reveal via animate-umbra-slam; robust to keyless solver | ✓ VERIFIED | `PriceReveal.tsx` lines 28-41 — lime slab, `animate-umbra-slam`, `clearingPrice.toFixed(2)` |
| 17 | SOLVER OFFLINE caption graceful; Privacy still renders | ✓ VERIFIED | `TheatreView.tsx` OfflineCaption + lines 52-53; App routes Privacy independently |
| 18 | CrossingChart hand-rolled SVG (no chart lib) from solve-preview curve; marks p*=100, q=10, (296,160) | ✓ VERIFIED | `CrossingChart.tsx` — raw `<svg viewBox="0 0 480 360">`, derives supply/demand from `curve` via lib/curve, `crossingPoint`→(296,160), MATCHED legend |
| 19 | Settlement SINGLE rAF settleProgress drives ALL legs + balances SIMULTANEOUSLY | ✓ VERIFIED | `SettlementView.tsx` lines 96-101 — one recursive `requestAnimationFrame(step)`; no per-leg timers in DvpLegs/BalanceTable/AtomicStamp (grep clean) |
| 20 | Legs A↔B 8@100 / A↔C 2@100; before/after to §4 finals via deskBalancesFromAllocations | ✓ VERIFIED | `SettlementView.tsx` `legsFromPreview` + `balanceRowsFromPreview` using `deskBalancesFromAllocations`; BEFORE balances match test |
| 21 | One-transaction stamp via animate-umbra-stamp | ✓ VERIFIED | `AtomicStamp.tsx` `animate-umbra-stamp`, "1 TRANSACTION · ATOMIC" |
| 22 | Agent: verified/source badge + typewriter rationale (animate-umbra-caret), reduced-motion instant, rank-1 only | ✓ VERIFIED | `AgentProposal.tsx` `badgeLabel(agent.source)`; `AgentRationale.tsx` typewriter + `animate-umbra-caret`, prefers-reduced-motion → full text, single rank-1 row |

**Score:** 22/22 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `web/src/solver.ts` | :4000 client + SolverError | ✓ VERIFIED | 5 endpoints + OFFLINE guard, no token |
| `web/src/lib/curve.ts` + test | curve→SVG mapping | ✓ VERIFIED | crossingPoint→(296,160); 3 tests pass |
| `web/src/lib/balance.ts` + test | lerp + allocations→balances | ✓ VERIFIED | §4 finals; 4 tests pass |
| `web/src/lib/solverParse.ts` + test | badge map + payload parse | ✓ VERIFIED | badgeLabel + parseSolvePreview; 4 tests pass |
| `web/src/components/Nav.tsx` | 5 enabled tabs | ✓ VERIFIED | union + all enabled |
| `web/src/App.tsx` | routing + lifted state | ✓ VERIFIED | all 5 routed, operatorState lifted |
| `web/src/views/DeskView.tsx` | 02 Desk, per-party ctx | ✓ VERIFIED | mounts desk ctx.DamlLedger |
| `web/src/components/OrderTicket.tsx` | ticket + lock + demo | ✓ VERIFIED | SubmitOrder strings, lock, §4 demo |
| `web/src/components/HoldingsPanel.tsx` | live BONDX/USDCx | ✓ VERIFIED | useStreamQueries(Asset) summed |
| `web/src/components/FillCard.tsx` | YOUR FILL | ✓ VERIFIED | useStreamQueries(TradeConfirmation) |
| `web/src/views/TheatreView.tsx` | 03 Theatre | ✓ VERIFIED | ring + close→solve-preview + reveal |
| `web/src/components/CountdownRing.tsx` | 280×280 ring | ✓ VERIFIED | CIRC 753.98, red≤10s |
| `web/src/components/CrossingChart.tsx` | hand-rolled SVG | ✓ VERIFIED | no chart lib, (296,160) |
| `web/src/components/PriceReveal.tsx` | lime 100.00 slab | ✓ VERIFIED | umbra-slam |
| `web/src/views/AgentView.tsx` | 04 Agent | ✓ VERIFIED | proposal + rationale |
| `web/src/components/AgentProposal.tsx` | proposal + badge | ✓ VERIFIED | badgeLabel, signed fills |
| `web/src/components/AgentRationale.tsx` | typewriter + caret | ✓ VERIFIED | umbra-caret, rank-1 only |
| `web/src/views/SettlementView.tsx` | 05 Settlement | ✓ VERIFIED | single rAF, settle via solver.ts |
| `web/src/components/DvpLegs.tsx` | simultaneous legs | ✓ VERIFIED | shared settleProgress, no per-leg timer |
| `web/src/components/AtomicStamp.tsx` | atomic stamp | ✓ VERIFIED | umbra-stamp |
| `web/src/components/BalanceTable.tsx` | before→after lerp | ✓ VERIFIED | lerp(before,after,settleProgress) |
| `web/tailwind.config.ts` | aliases + keyframe | ✓ VERIFIED | umbra-draw/-pulse/-caret/-leg + umbraLeg |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| solver.ts | http://localhost:4000 | fetch to VITE_SOLVER_URL | ✓ WIRED |
| OrderTicket | Venue.SubmitOrder | ctx.useLedger().exercise (Int/Numeric strings) | ✓ WIRED |
| HoldingsPanel | Asset | ctx.useStreamQueries(Asset) summed by symbol | ✓ WIRED |
| FillCard | TradeConfirmation | ctx.useStreamQueries(TradeConfirmation) | ✓ WIRED |
| TheatreView | solver.ts | closeRound then solvePreview | ✓ WIRED |
| CrossingChart | solve-preview curve | lib/curve mapping + animate-umbra-draw | ✓ WIRED |
| PriceReveal | preview.clearingPrice | lime slab toFixed(2) | ✓ WIRED |
| AgentProposal | agent.source | badgeLabel(source) | ✓ WIRED |
| SettlementView | solver.ts | settle(roundId) | ✓ WIRED |
| BalanceTable | lib/balance lerp | settleProgress lerp before→after | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| DeskView/Holdings/FillCard | order/assets/confirms | desk's own `useStreamQueries` on :7575 | Yes (live ledger streams; verified Phase 3 precedent) | ✓ FLOWING |
| TheatreView/CrossingChart/PriceReveal | preview | `solvePreview(roundId)` :4000 → solver deterministic core | Yes (solver/src/api.ts solve-preview, Phase 4/5 verified) | ✓ FLOWING |
| Agent views | preview.rationale/agent | same lifted preview | Yes (Claude or deterministic fallback, always populated) | ✓ FLOWING |
| Settlement legs/balances | preview.allocations | `deskBalancesFromAllocations` from solver allocations | Yes (derived, asserted by balance.test) | ✓ FLOWING |

Note: BEFORE balances in SettlementView are a hardcoded §4 constant (lines 29-33) chosen to match the canonical fixture — this is an intentional demo seed mirroring `balance.test.ts`, not a stub of live data. The AFTER balances flow from real solver allocations.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| UI-02 | 06-01, 06-02 | Desk view: ticket (one/round + load-demo §4), sealed order + status, live holdings, post-settlement TradeConfirmation | ✓ SATISFIED | DeskView + OrderTicket + HoldingsPanel + FillCard, all per-party |
| UI-04 | 06-01, 06-03 | Theatre: 60s ring + live count + Close & Solve → solve-preview reveal hero | ✓ SATISFIED | TheatreView + CountdownRing + PriceReveal |
| UI-05 | 06-03 | Hand-rolled SVG supply/demand crossing chart marking p* | ✓ SATISFIED | CrossingChart (no chart lib, (296,160)) |
| UI-06 | 06-01, 06-04 | Settle atomically — all legs snap simultaneously + before/after balances + DvP legs + one-tx badge | ✓ SATISFIED | SettlementView single-rAF + DvpLegs + BalanceTable + AtomicStamp |

All 4 declared requirement IDs (UI-02, UI-04, UI-05, UI-06) are mapped to Phase 6 in REQUIREMENTS.md traceability (lines 132, 134-136) and are accounted for. No orphaned Phase-6 requirements. (UI-01/UI-03 are Phase 3; UI-07 is Phase 7.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX debt markers in any Phase-6 file | — | — |
| web/src/components/DvpLegs.tsx | 19 | `${settleProgress*100}%` div-track approach instead of the umbra-leg SVG keyframe | ℹ️ Info | Intentional (comp's HTML-div approach, RESEARCH A3); simultaneity requirement fully met via shared settleProgress |
| web/tailwind.config.ts | 100 | `umbra-leg` alias defined but not consumed in web/src | ℹ️ Info | Plan-01 required adding the alias (done); the consumer chose the div-track path. Harmless dead alias, not a goal gap |

No blockers. `return null` occurrences (AtomicStamp line 8, App RoundStateProbe line 46) are legitimate conditional render guards, not stub implementations.

### Scope Discipline

- Phase-6 feat/docs commits touched ONLY `web/` and `.planning/` — confirmed via `git show --name-only` across all 9 feat/docs commits. No `daml/`, no `solver/` changes.
- All Phase-6 commits authored `woshvad <woshvad@gmail.com>`; no `Co-Authored-By`, no "Generated with", no Anthropic attribution (grep matches for "Claude" were Phase-5 commit-body descriptions, all authored woshvad).
- Secret boundary intact: no operator token literal, no operator @daml/react context, no ANTHROPIC key anywhere in web/src; all operator actions route through `web/src/solver.ts` → :4000.
- Motion is prefers-reduced-motion gated in OrderTicket, AgentRationale, and SettlementView.

### Human Verification Required

The live visual/animation fidelity (reveal slam + simultaneous settle matching the comp screenshots pixel-for-pixel) and the full live money-shot E2E require a running `daml start` + solver + web, and are a DEFERRED human-verification checkpoint consistent with the Phases 1-5 precedent (explicitly Phase-7 / UI-07 / DEMO-03 territory). See the four items in the `human_verification` frontmatter:

1. Theatre reveal slam + countdown ring + COMPUTING beat (live).
2. Settlement simultaneous draw-on + balance lerp + atomic stamp (live).
3. Full live money-shot E2E vertical slice.
4. Graceful solver-offline behavior at runtime.

### Gaps Summary

No gaps. All 22 must-have truths are VERIFIED against the codebase, all 4 requirement IDs satisfied, both authoritative gates green (build + 11 §4-value tests), the secret boundary is intact, scope is clean (web-only, correctly attributed), and no blocker anti-patterns exist. The phase goal — the Desk view, Auction theatre (countdown/reveal), hand-rolled SVG crossing chart, and atomic-settlement animation — is structurally achieved in code. Status is `human_needed` solely because the live visual/animation fidelity and live E2E money-shot were not (and per scope cannot be) exercised headlessly; these are the deferred end-of-build human checkpoints.

---

_Verified: 2026-06-26_
_Verifier: Claude (gsd-verifier)_
