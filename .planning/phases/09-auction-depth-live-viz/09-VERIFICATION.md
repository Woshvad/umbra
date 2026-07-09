---
phase: 09-auction-depth-live-viz
verified: 2026-07-09T19:00:00Z
status: human_needed
score: 5/5 success criteria code-verified (automated gates green); 4 live-stack checks deferred to end-of-phase UAT
re_verification:
  previous_status: none
  previous_score: n/a
human_verification:
  - test: "Boot the live Canton stack; from each desk plane submit one order of each type (LIMIT, NONCOMP, MAQ, COND) into a running OPEN round and confirm the sealed order is created on the desk's own token"
    expected: "All four order types submit successfully via Venue.SubmitOrder on the desk's own DamlLedger; the one-per-round lock engages; the round clears with the richer book"
    why_human: "Requires a live JSON Ledger API v2 + open round; the CODE + ensure guards + 23/23 daml tests + 30 web vitest are green, but a live per-type end-to-end submit was not booted (config human_verify_mode = end-of-phase)"
    criterion: "SC#1 (AUCT-01)"
  - test: "With a live OPEN round, seal orders one at a time and watch the Theatre INDICATIVE panel + CrossingChart"
    expected: "The aggregate indicative price / net imbalance / est. matched update as orders arrive; only scalars are shown (never an individual order or candidate-price curve); the small-N guard shows a coarse band until >=2 orders per crossing side; the CrossingChart shows ASSEMBLING (no red p*) and LOCKS the red p* at close"
    why_human: "Requires a live open window producing the streaming aggregate feed; scalars-only privacy + small-N guard + assembling->locked are unit-proven (api.test.ts 33, curve.test.ts) but the live 'updates as orders arrive' behavior needs the running stack"
    criterion: "SC#3 (AUCT-03, VIZ-01)"
  - test: "Settle a live round and open the per-desk TCA receipt in SettlementView + EXPORT RECEIPT + proof-pack"
    expected: "Each desk sees its own receipt with two DISTINCT surplus rows (PROVEN vs-LIMIT on-ledger >=0, and a labeled BENCHMARK vs-REFERENCE that may be negative); EXPORT RECEIPT downloads a secret-free text receipt; the proof-pack embeds the receipts"
    why_human: "Requires a live settled round to render real TradeConfirmation TCA fields; the on-ledger surplusVsLimit>=0 assert (test_surplus_nonneg) + solver receipts[] + proofpack embed + TcaReceipts render are all code-verified, but the live rendered receipt needs the running stack"
    criterion: "SC#4 (AUCT-04)"
  - test: "Confirm the §4 fixture still clears at exactly $100.00 (A=10/B=8/C=2) end-to-end on the live settle path with the new order-model + TCA fields in the wire"
    expected: "Live round settles A=10/B=8/C=2 @ $100.00; three TradeConfirmations carry the TCA fields; balances match §4 (A:10/4000, B:12/1800, C:13/1200)"
    why_human: "The §4 canary is green in daml test (test_clears_at_100, test_settled_balances) + solver/web unit tests, but a live end-to-end settle with the regenerated bindings was not booted this phase"
    criterion: "SC#1..4 continuous canary"
---

# Phase 9: Auction Depth & Live Viz — Verification Report

**Phase Goal:** Make the auction real and legible — richer institutional order types under an explicit, sovereign-grade rulebook, a privacy-safe live price-discovery view, and provable per-desk value.
**Verified:** 2026-07-09T19:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | A desk can submit noncompetitive, MAQ/all-or-none, and conditional auto-firming orders in addition to sealed limits (AUCT-01) | ✓ VERIFIED (code); live submit → human | `Clearing.daml` + `auction.ts` implement all 4 types (isNoncomp, isAon/minQtyOf, qualifies, powerset enumeration, two-pass computeClearing). Daml 23/23 incl. test_noncomp_sell_top_priority, test_aon_all_or_none_fills/drops, test_maq_included/excluded, test_conditional_firms/drops. `OrderTicket.tsx` LIMIT·NONCOMP·MAQ·COND selector with per-type params + type-aware SubmitOrder on desk's own ledger. web build + 37 vitest green. Live per-type submit deferred (SC#1 human item). |
| 2 | Clearing rulebook (max matched → min imbalance → pro-rata at marginal price) documented + enforced identically in Clearing.daml and the solver (AUCT-02) | ✓ VERIFIED | `RULEBOOK.md` complete: objective-in-order, topPrices trap guard, bp formula, §4 worked example, all 4 order-type sections each citing the exact symbol in BOTH `Clearing.daml` and `auction.ts`. Byte-identical two-plane logic confirmed by reading both files; enforced by daml test 23/23 + solver auction.test.ts 13/13 incl. the 99-vs-100 trap witness. |
| 3 | Open-window desks see AGGREGATE indicative price + net imbalance (never an individual order); live crossing viz assembles + locks p* at close (AUCT-03, VIZ-01) | ✓ VERIFIED (code); live feed → human | `api.ts` buildIndicative emits SCALARS ONLY (indicativePrice, netImbalance, estMatched), small-N guarded (<2 orders/side → coarse band + `coarse:true`); no candidate-price curve during open. api.test.ts 33 incl. privacy-guard tests. `CrossingChart.tsx` assembling↔locked mode (red p* rendered only when locked). Live "updates as orders arrive" deferred (SC#3 human item). |
| 4 | After clear, each desk gets an exportable best-ex/TCA receipt (fill vs limit vs reference, surplus in bp) with on-ledger surplus≥0 proof (AUCT-04) | ✓ VERIFIED (code); live receipt → human | `Auction.daml` TradeConfirmation TCA fields (referencePrice, surplusVsLimit, improvementVsLimitBp, improvementVsReferenceBp); Round.Clear computes surplus + `assertMsg "…surplusVsLimit >= 0"`. test_surplus_nonneg green. `proofpack.ts` embeds receipts[]; `TcaReceipts.tsx` renders two DISTINCT surplus rows + EXPORT RECEIPT. Live settled receipt deferred (SC#4 human item). |
| 5 | Cost-of-leakage simulator shows the same orders losing $X on a simulated public book vs $0 leaked on Umbra (WOW-06) | ✓ VERIFIED | `web/src/lib/leakage.ts` pure deterministic model (SLIPPAGE_BP_PER_UNIT, FRONT_RUN_BP → publicBookLost, umbraLeaked:0, saved). leakage.test.ts 7 cases green ($lost>0 vs $0, deterministic, empty-safe). `SettlementView.tsx` sim panel with dashed border + `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag + disclaimer; $X LOST red, $0 LEAKED + $X SAVED ink. No ledger/solver dependency. |

**Score:** 5/5 success criteria code-complete and automated-verified. 4 live-stack checks deferred to end-of-phase UAT (per config human_verify_mode = end-of-phase). No automated must-have failed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `daml/Umbra/Clearing.daml` | OrderType + coreClear + two-pass computeClearing + powerset + qualifies + topPrices guard | ✓ VERIFIED | 284 lines; all order-type predicates + bounded (price×subset) enumeration present; math bodies match RULEBOOK; §4 reduction documented inline |
| `daml/Umbra/Auction.daml` | Order fields orderType/minQty/firmIf + relaxed ensure + TradeConfirmation TCA fields + Round.Clear surplus≥0 assert | ✓ VERIFIED | ensure relaxed (lines 108-110); Round.Clear threads orderType/minQty/firmIf into OrderView recompute; surplusVsLimit>=0 assertMsg (line 337) |
| `solver/src/auction.ts` | byte-identical TS mirror of coreClear + two-pass + all 4 types | ✓ VERIFIED | 240 lines; function-for-function mirror; auction.test.ts 13/13 incl. 99-vs-100 trap |
| `solver/src/api.ts` | indicative scalars-only block + small-N guard + receipts[] | ✓ VERIFIED | buildIndicative + guard (lines 204-244); receipts surfaced from TradeConfirmations (lines 349-359) |
| `solver/src/proofpack.ts` | per-desk TCA receipt embed | ✓ VERIFIED | ProofPackReceipt + bundle02 TCA rows w/ two-surplus split + backward-compatible fallback |
| `RULEBOOK.md` | sovereign rulebook citing both planes | ✓ VERIFIED | 369 lines; cites Clearing.daml AND auction.ts throughout; topPrices guard, all 4 types, bp formula, §4 example |
| `web/src/components/OrderTicket.tsx` | order-type selector + per-type params + type-aware SubmitOrder | ✓ VERIFIED | LIMIT·NONCOMP·MAQ·COND selector; minQty/firmIf inputs; SubmitOrder on desk's own ledger with orderType/minQty/firmIf |
| `web/src/components/CrossingChart.tsx` | assembling|locked mode | ✓ VERIFIED | CrossingMode prop; red p* only in locked; assembling caption + faint matched region |
| `web/src/views/SettlementView.tsx` + `TcaReceipts.tsx` | two-distinct-surplus receipt + EXPORT + leakage sim | ✓ VERIFIED | TcaReceipts (proven vs-limit + benchmark vs-reference + EXPORT RECEIPT); LeakageSim panel (SIMULATION tag) |
| `web/src/lib/leakage.ts` | pure deterministic cost-of-leakage model | ✓ VERIFIED | DOM-free, deterministic; leakage.test.ts 7 cases |
| `web/daml.js` | regenerated + committed bindings | ✓ VERIFIED | Order carries orderType/minQty/firmIf; TradeConfirmation carries surplusVsLimit/referencePrice/improvementVsLimitBp/improvementVsReferenceBp (grep of generated module.js). git status clean (only ui-reviews untracked) → committed |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| OrderTicket.tsx | Venue.SubmitOrder | type-aware exercise (orderType/minQty/firmIf) on desk's own DamlLedger | ✓ WIRED |
| Clearing.daml::computeClearing | coreClear | two-pass wrapper (PASS1 provP → PASS2 qualifies firming) | ✓ WIRED |
| auction.ts::computeClearing | coreClear | identical two-pass (parity) | ✓ WIRED |
| Auction.daml Round.Clear | TradeConfirmation TCA fields | per-desk surplus computed + surplus≥0 assert at create site | ✓ WIRED |
| TheatreView.tsx | solver GET /round/:id indicative | web/src/solver.ts fetch (scalars only) | ✓ WIRED (unit-proven; live poll = human) |
| SettlementView/TcaReceipts | solver settled receipts | readTradeConfirmations → api.ts → receipt render + proofpack embed | ✓ WIRED (unit-proven; live render = human) |
| SettlementView LeakageSim | web/src/lib/leakage.ts | pure client-side call over settled preview numbers | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| CrossingChart | curve / clearingPrice | curve.ts §4 marker + solver preview | ✓ (curve.test.ts marker 296,160 intact) | ✓ FLOWING (static curve is real; live assemble = human) |
| TcaReceipts | surplusVsLimit / referencePrice | on-ledger TradeConfirmation → api.ts receipts[] | ✓ (test_surplus_nonneg + api.test.ts) | ✓ FLOWING (live settled = human) |
| LeakageSim | publicBookLost / saved | leakage.ts over settled allocations | ✓ (leakage.test.ts 7 cases) | ✓ FLOWING |
| Theatre INDICATIVE | indicativePrice / netImbalance | api.ts buildIndicative over sealed views | ✓ (api.test.ts 33) | ✓ FLOWING (live stream = human) |

### Behavioral Spot-Checks / Automated Gates (re-run by verifier — not trusted from SUMMARY)

| Gate | Command | Result | Status |
|------|---------|--------|--------|
| Daml suite (§4 canary + all order types + settlement/privacy) | `daml test` | 23/23 scripts ok, exit 0 (incl. test_clears_at_100, test_noncomp_sell_top_priority, test_conditional_firms/drops, test_aon_all_or_none_fills/drops, test_maq_included/excluded, test_surplus_nonneg, test_atomicity, test_privacy_orders/confirmations) | ✓ PASS |
| Solver full suite | `npm test` (solver) | 94/94 (8 files) incl. auction.test.ts 13, api.test.ts 33, proofpack.test.ts 11 | ✓ PASS |
| Solver clearing parity | `npx vitest run auction.test.ts` | 13/13 incl. 99-vs-100 max-matched trap witness | ✓ PASS |
| Solver typecheck | `npx tsc --noEmit` | clean, no errors | ✓ PASS |
| Web full suite | `npm test` (web) | 37/37 (6 files) incl. leakage.test.ts 7, curve.test.ts 3 | ✓ PASS |
| Web build | `npm run build` | built in 2.46s, 93 modules, dist emitted | ✓ PASS |
| Bindings regenerated | grep web/daml.js generated module | Order + TradeConfirmation carry new fields | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| AUCT-01 | 09-01, 09-02, 09-03, 09-06 | Richer order types (noncomp, MAQ/AON, conditional) + sealed limits | ✓ SATISFIED (code); live submit = human | 4 types in both planes; 8 order-type daml tests; OrderTicket selector; web build green |
| AUCT-02 | 09-01, 09-02, 09-03 | Rulebook documented + enforced identically in Clearing.daml + solver | ✓ SATISFIED | RULEBOOK.md cites both planes for every rule; golden parity + §4 canary + 99-vs-100 trap green |
| AUCT-03 | 09-04 | Privacy-safe aggregate indicative price + net imbalance during open window | ✓ SATISFIED (code); live feed = human | api.ts scalars-only + small-N guard; api.test.ts privacy tests |
| AUCT-04 | 09-05 | Exportable best-ex/TCA receipt + on-ledger surplus≥0 proof | ✓ SATISFIED (code); live receipt = human | TradeConfirmation TCA fields + surplusVsLimit>=0 assert (test_surplus_nonneg); TcaReceipts + proofpack embed |
| VIZ-01 | 09-04 | Live crossing viz assembles curve + locks p* at close | ✓ SATISFIED (code); live assemble = human | CrossingChart assembling↔locked; curve.ts §4 marker intact (curve.test.ts) |
| WOW-06 | 09-07 | Cost-of-leakage simulator ($X lost public book vs $0 leaked) | ✓ SATISFIED | leakage.ts pure model + leakage.test.ts 7 cases + SettlementView SIMULATION panel |

All 6 phase requirement IDs are declared in PLAN frontmatter and satisfied in code. No orphaned requirements: REQUIREMENTS.md maps exactly AUCT-01..04, VIZ-01, WOW-06 to Phase 9, and every ID is claimed by at least one plan. REQUIREMENTS.md already marks all six [x] with the same "live X = end-of-phase human-check" caveats recorded here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | Debt-marker scan (TODO/FIXME/XXX/TBD/HACK) across all 10 phase source files | ℹ️ Info | NO unreferenced debt markers found. Documented "deferred" items in RULEBOOK.md (pro-rata leftover, large-book AON scaling) are design deferrals with rationale, not code debt. |

### Human Verification Required (deferred live-stack checks — end-of-phase UAT)

Per config `human_verify_mode = end-of-phase`, the stack was intentionally not booted during execution; automated gates (daml test + solver/web unit tests + tsc + build) are the executed gates. The following four checks can ONLY be proven against a live running Canton stack + solver + web. The CODE for each is written, unit-tested, typechecked, and committed — these are live-behavior confirmations, NOT missing implementation:

1. **Live per-type submit (SC#1, AUCT-01)** — submit LIMIT/NONCOMP/MAQ/COND into a live open round on each desk's own token.
2. **Live aggregate indicative feed + assembling chart (SC#3, AUCT-03/VIZ-01)** — indicative scalars update as orders seal; CrossingChart assembles then locks p* at close.
3. **Live TCA receipt on a settled round (SC#4, AUCT-04)** — two-distinct-surplus receipt renders + EXPORT + proof-pack embed on a real settlement.
4. **Live §4 end-to-end canary** — a live settle still clears $100.00 / A=10 / B=8 / C=2 with the regenerated bindings + TCA fields on the wire.

### Gaps Summary

No automated gaps. Every phase success criterion is code-complete, the code is substantive and wired end-to-end (not stubs), and all automated gates were re-run by the verifier and are green: Daml 23/23 (incl. the §4 $100.00 canary and all eight new order-type fixtures + test_surplus_nonneg), solver 94/94 + tsc clean (incl. the 99-vs-100 trap witness and Daml⇄TS golden parity), web 37/37 + build (incl. leakage 7 cases), and the regenerated `web/daml.js` bindings carry the new Order + TradeConfirmation fields and are committed. RULEBOOK.md documents the objective ordering + topPrices trap guard and cites both `Clearing.daml` and `auction.ts` for every rule.

The only outstanding items are the four live-stack behavior confirmations above, which policy defers to end-of-phase live UAT. Per the status decision tree, the presence of human verification items sets status to **human_needed** (not gaps_found — no automated must-have failed and no implementation is missing).

---

_Verified: 2026-07-09T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
