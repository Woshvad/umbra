---
phase: 09-auction-depth-live-viz
plan: 07
subsystem: web-leakage-sim
tags: [web, typescript, wow-06, leakage, simulation, settlement-view, pure-lib, vitest]

# Dependency graph
requires:
  - phase: 09-auction-depth-live-viz
    plan: 05
    provides: "the settled per-desk receipt numbers (qty, side, clearingPrice) + SettlementView post-settle TCA receipt block the sim sits below"
  - phase: 06-ui-money-shot
    plan: 04
    provides: "SettlementView post-settle gating (phase==='settled') + preview.allocations aggregate + prefersReducedMotion"
provides:
  - "web/src/lib/leakage.ts — pure, DOM-free, deterministic cost-of-leakage model (estimateLeakage) over the settled receipt numbers: naive public-book sweep (slippage + front-run bp of the uniform clear) → publicBookLost; umbraLeaked:0; saved===publicBookLost"
  - "web/src/lib/leakage.test.ts — vitest coverage ($lost>0 vs $0, exact §4 $5.10, deterministic, buy-side sweep, 0-safe empty/single)"
  - "SettlementView LeakageSimPanel — post-settle, dashed-border SIMULATION panel (never confusable with the on-ledger receipts above): $X LOST red / $0 LEAKED ink / $X SAVED ink punchline + disclaimer"
affects: ["WOW-06 closed — the cost-of-leakage money shot"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WOW-06 sim is a PURE leaf lib (mirrors balance.ts/curve.ts): no fetch/@daml/document/Date/random — deterministic and unit-tested, zero ledger/solver dependency"
    - "Illustrative slippage/front-run coefficients as named module constants in basis points (SLIPPAGE_BP_PER_UNIT / FRONT_RUN_BP) so the model scales with the clearing price and is documented as didactic-only"
    - "the panel reads only the settled preview.allocations props (no new network call) — the dashed border + SIMULATION tag + disclaimer are the primary NOT-LEDGER signals"

key-files:
  created:
    - "web/src/lib/leakage.ts — the pure WOW-06 cost-of-leakage model"
    - "web/src/lib/leakage.test.ts — vitest coverage of the sim math"
  modified:
    - "web/src/views/SettlementView.tsx — LeakageSimPanel post-settle below the AUCT-04 receipts + import estimateLeakage/LeakageLeg"

key-decisions:
  - "The sim SWEEPS THE BUY side (matched volume = Σbuy = Σsell), walking each unit sequentially at a premium over the uniform clear of clearingPrice·(SLIPPAGE_BP_PER_UNIT·i + FRONT_RUN_BP)/1e4 — the plan's $lost = Σ(executionPrice − uniformClear) formula. §4 → $5.10 saved (n=10, p=100)"
  - "ownLimit is accepted in the LeakageLeg shape (receipt-fidelity) but is DELIBERATELY NOT load-bearing in the $lost formula — capping execution at the buyer's own limit would zero the whole sim on the §4 fixture (buy limit == clear), so the illustrative coefficients drive slippage independent of any private limit"
  - "The panel reads preview.allocations directly (already on the page) rather than re-fetching the AUCT-04 receipts[] — keeps the sim path pure/DOM-free with zero solver/ledger call (T-09-07-02/03)"
  - "Punchline + $0 LEAKED render INK, never lime (lime stays exclusively the clearing-reveal signal per UI-SPEC Color); $X LOST renders #E2231A red (the leakage)"

requirements-completed: [WOW-06]

# Metrics
duration: ~7min
completed: 2026-07-09
---

# Phase 9 Plan 07: Cost-of-Leakage Simulator (WOW-06) Summary

**Shipped the WOW-06 cost-of-leakage money shot: a pure, deterministic, DOM-free `web/src/lib/leakage.ts` runs the SAME settled order set through a naive simulated public order book (sequential marketable sweep → slippage + front-run price impact → `$X LOST`) beside Umbra's sealed uniform clear (`$0 LEAKED`), and a post-settle `SettlementView` panel shows `$X SAVED` — unmistakably labeled a client-side SIMULATION (dashed 1px ink border + `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag + disclaimer footnote) so its numbers can never be confused with the on-ledger AUCT-04 receipts above it; §4 saves $5.10 with `$X LOST` red / `$0 LEAKED` + `$X SAVED` ink (never lime), unit-tested and web-green.**

## Performance

- **Duration:** ~7 min
- **Completed:** 2026-07-09
- **Tasks:** 2
- **Files modified:** 3 (2 new pure-lib files + 1 view)

## Accomplishments

- **Pure cost-of-leakage model (Task 1, `leakage.ts`).** `estimateLeakage(legs)` is a PURE, DOM-free, no-I/O leaf lib (mirrors `balance.ts`/`curve.ts`): it reads the settled receipt numbers (`side`, `filledQty`, `clearingPrice`; `ownLimit` accepted for shape-fidelity but not load-bearing), derives the uniform clear + the buy-side sweep quantity (matched volume, sell-side fallback), and walks each unit sequentially — unit `i` pays a premium over the clear of `clearingPrice·(SLIPPAGE_BP_PER_UNIT·i + FRONT_RUN_BP)/1e4` (book-depth slippage + a flat front-run markup, both in bp, as documented illustrative module constants) — returning `{ publicBookLost, umbraLeaked: 0, saved: publicBookLost }`. Empty-safe (reduce with a 0 seed), deterministic (no `Date`/`random`/DOM), grep-clean of `fetch`/`@daml`/`document`.
- **Unit coverage (Task 1, `leakage.test.ts`).** 7 vitest cases: `$lost>0` while `umbraLeaked===0` and `saved===publicBookLost` on a §4-shaped fixture; the EXACT §4 loss (`$5.10` at n=10/p=100); determinism (identical input → identical output); buy-side sweep independent of the sell-leg split; 0-safe on an empty book; sane single-unit result (front-run markup only, `$0.15`); positive named coefficients.
- **Post-settle SIMULATION panel (Task 2, `SettlementView.tsx`).** New `LeakageSimPanel` (rendered only when `settled`, BELOW the AUCT-04 TCA receipts): a 1px **DASHED** ink container (the real receipts use SOLID ink — the primary NOT-LEDGER signal), a header sub-label `Cost of Leakage · Simulation` + a right-pushed `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag (mono 9, 1px ink border), two columns (`SIMULATED PUBLIC BOOK` → `$X LOST` in `#E2231A` red + `SLIPPAGE + FRONT-RUN`; `UMBRA SEALED CLEAR` → `$0 LEAKED` ink + `SEALED UNIFORM PRICE`), the `$X SAVED VS A PUBLIC BOOK` punchline (mono 40 tabular, INK — never lime, `umbra-rise` on mount, reduced-motion → instant), and the verbatim disclaimer footnote. It reads only `preview.allocations` — no solver/ledger call in the sim path.

## Task Commits

1. **Task 1: Pure cost-of-leakage lib + vitest** — `2b0a8dc` (feat)
2. **Task 2: Post-settle cost-of-leakage sim panel** — `5a657ce` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `web/src/lib/leakage.ts` — NEW: `estimateLeakage` + `SLIPPAGE_BP_PER_UNIT`/`FRONT_RUN_BP` constants + `LeakageLeg`/`LeakageResult` types
- `web/src/lib/leakage.test.ts` — NEW: 7 vitest cases proving the sim math
- `web/src/views/SettlementView.tsx` — `LeakageSimPanel` (post-settle, below AUCT-04) + `estimateLeakage`/`LeakageLeg` import

## Deviations from Plan

None — plan executed exactly as written. The one judgment call (documented as a key-decision, not a deviation) is that `ownLimit` is present in the `LeakageLeg` shape for receipt-fidelity but the `$lost` formula does not depend on it; hard-capping execution at the buyer's own limit would zero the sim on the §4 fixture (the buyer's limit equals the clear), so the illustrative coefficients drive slippage independent of any private limit — consistent with the plan's explicit `$lost = Σ(executionPrice − uniformClear)` model.

## §4 Canary State (continuous correctness reference)

- **No clearing/template/solver change** — the sim is a pure web leaf lib over already-settled numbers; the §4 daml canary and the solver are untouched (the plan's scope boundary held).
- Web: `cd web && npm run build` succeeds (tsc + vite; the pre-existing `@daml.js` external-dep warnings are benign/unchanged); `cd web && npx vitest run` **37/37 green** (30 prior + the 7 new `leakage.test.ts`).
- On the §4 settled fixture the panel reports **$5.10 saved** vs a simulated public book (`$0 LEAKED` on Umbra).

## Known Stubs

- **The leakage figures are an INTENTIONAL, clearly-labeled client-side SIMULATION** — not a stub in the incomplete-wiring sense. `SLIPPAGE_BP_PER_UNIT`/`FRONT_RUN_BP` are illustrative coefficients (documented as such in `leakage.ts`), and the panel is marked with a dashed border + `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag + disclaimer so the numbers are never presented as settled/ledger facts. This is the required design property (WOW-06 is a labeled simulation), not accidental placeholder data.

## Deferred to end-of-phase human verification

Per `config.workflow.human_verify_mode: end-of-phase` and the §3 constraint (a live settled round needs the running Canton stack, OUT OF SCOPE here):

- **Live sim on a settled §4 round:** boot the stack, settle the §4 fixture, open 05 Settlement, and confirm the leakage panel renders BELOW the on-ledger receipts with the dashed border + SIMULATION tag + disclaimer, `$5.10 LOST` red vs `$0 LEAKED` ink, and the `$5.10 SAVED VS A PUBLIC BOOK` ink punchline — visually unmistakable as a simulation (09-VALIDATION Manual-Only). Proven here at the unit/build level (7 vitest + web build + 37-test suite); only the live-stack render is deferred.

## Threat Flags

None. No new network endpoint, auth path, or trust-boundary schema change — the sim is fully client-side, reads only the already-settled preview numbers on the page, and introduces no `fetch`/`@daml`/ledger/solver call (T-09-07-02/03 mitigated; the dashed border + SIMULATION tag + disclaimer mitigate T-09-07-01 — a viewer mistaking the simulated `$X lost` for a real on-ledger number).

## Self-Check: PASSED

- Files verified on disk: `web/src/lib/leakage.ts`, `web/src/lib/leakage.test.ts`, `web/src/views/SettlementView.tsx`, `.planning/phases/09-auction-depth-live-viz/09-07-SUMMARY.md`.
- Commits verified in git: `2b0a8dc` (Task 1), `5a657ce` (Task 2) — author `woshvad <woshvad@gmail.com>`, no Claude/Anthropic trailer.
- Gates: web build (tsc + vite) succeeds; `npx vitest run` 37/37 green (incl. the 7 new leakage cases); `leakage.ts` grep-clean of fetch/@daml/document/Date/random; all verbatim UI-SPEC copy strings present in SettlementView.

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
