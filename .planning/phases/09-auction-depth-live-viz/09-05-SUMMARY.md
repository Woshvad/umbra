---
phase: 09-auction-depth-live-viz
plan: 05
subsystem: best-ex-tca
tags: [daml, typescript, tradeconfirmation, best-ex, surplus-proof, proof-pack, receipt, settlement-view, codegen]

# Dependency graph
requires:
  - phase: 09-auction-depth-live-viz
    plan: 01
    provides: "Additive OrderView orderType/limit that Round.Clear builds the per-desk views from + the regenerate-and-commit web/daml.js invariant"
  - phase: 09-auction-depth-live-viz
    plan: 04
    provides: "solver GET /round/:id body assembly + settled-branch confs mapping the receipts[] extends"
  - phase: 02-clearing-settlement
    provides: "Round.Clear recompute-and-assert backstop + the per-desk create TradeConfirmation site + single-funded-buyer DvP"
  - phase: 08-trust-wow
    provides: "proofpack.ts on-brand HTML render (bundle 02 best-ex receipts) + SettlementView post-settle gating + .umbra-ink-ghost export grammar"
provides:
  - "TradeConfirmation TCA fields (ownLimit:Optional, referencePrice, surplusVsLimit, improvementVsLimitBp, improvementVsReferenceBp signed) — the per-desk best-ex receipt shape"
  - "Round.Clear on-ledger surplusVsLimit≥0 proof (T-09-05-01) — the PROVEN best-ex number, asserted at the per-desk create site; referencePrice as a labeled config-stub choice arg"
  - "regenerated + committed web/daml.js carrying the TradeConfirmation TCA fields + the Clear referencePrice arg (fresh-clone-builds invariant)"
  - "solver readTradeConfirmations TCA decode + api.ts settled receipts[] + proofpack bundle-02 two-distinct-surplus embed + REFERENCE_PRICE_STUB threading through settle/tamperClear"
  - "web Receipt type + SettlementView TcaReceipts block (proven ink vs-LIMIT · benchmark vs-REFERENCE red-only-when-negative · REFERENCE stub tag · EXPORT RECEIPT ink-ghost)"
affects: [09-07, "WOW-06 leakage sim (reads the settled receipt numbers)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two DISTINCT surplus numbers, never conflated: surplusVsLimit is the on-ledger, structurally-≥0 PROVEN number (asserted inside Round.Clear); improvementVsReferenceBp is a SIGNED, labeled-stub benchmark that may be negative — surfaced as two separate rows end-to-end"
    - "referencePrice as a pass-in config stub (Option-B pattern): a choice body cannot read config, so the solver supplies REFERENCE_PRICE_STUB as an additive Clear choice arg; settle otherwise byte-unchanged"
    - "TCA math as pure top-level Daml helpers (tcaSurplusVsLimit/tcaImprovementVsLimitBp/tcaImprovementVsReferenceBp) computed at the per-desk create site from the fetched OrderView limits"

key-files:
  created:
    - "web/src/components/TcaReceipts.tsx — the post-settle per-desk TCA receipt block (two-distinct-surplus + EXPORT RECEIPT ink-ghost)"
  modified:
    - "daml/Umbra/Auction.daml — TradeConfirmation TCA fields; TCA helper fns; Clear referencePrice arg + per-desk surplus computation + surplusVsLimit≥0 assert"
    - "daml/Umbra/Tests.daml — extended test_settled_balances (TCA asserts) + new test_surplus_nonneg; referencePrice on all 5 Clear call sites"
    - "web/daml.js — regenerated bindings (TradeConfirmation TCA fields + Clear referencePrice arg)"
    - "solver/src/ledger.ts — readTradeConfirmations TCA decode; REFERENCE_PRICE_STUB; referencePrice arg on settle + tamperClear Clear exercises"
    - "solver/src/api.ts — SettledConfirmation TCA fields + settled-body receipts[]"
    - "solver/src/proofpack.ts — ProofPackReceipt + bundle-02 two-distinct-surplus render"
    - "solver/src/proofpack.test.ts — AUCT-04 TCA receipt render test (proven vs-LIMIT / benchmark vs-REFERENCE / stub tag / secret-free)"
    - "solver/src/index.ts — buildProofPack passes the TCA receipts into renderProofPackHtml"
    - "web/src/solver.ts — Receipt type + receipts? on RoundResponse"
    - "web/src/views/SettlementView.tsx — mount TcaReceipts post-settle below RoundBrief"

key-decisions:
  - "surplusVsLimit is asserted `>= 0` at the per-desk create site (not once over the batch): a receipt that violates best-ex aborts the atomic settle — the ledger, not a UI claim, is the proof (T-09-05-01)"
  - "improvementVsReferenceBp is SIGNED and side-aware (buy improves when p* below reference, sell when above); on §4 referencePrice==p*==100 → 0, so the benchmark never renders red on the canonical fixture"
  - "Only ownLimit is Optional (None for a noncompetitive order → surplus 0); referencePrice/surplus/bp are non-Optional Decimals per the plan — LocalNet is a fresh-DAR redeploy so SCU upgrade is not a concern"
  - "EXPORT RECEIPT downloads a client-side plain-text receipt (numbers only, secret-free) reusing the .umbra-ink-ghost grammar — the same fields are also embedded in the WOW-05 proof-pack (no new endpoint)"

patterns-established:
  - "Any TradeConfirmation shape change regenerates + commits web/daml.js in the same change (Pitfall 4 / commit 6e4bade) and is gated by `cd web && npm run build`"
  - "Secret-sweep tests extended to every new render surface (proofpack bundle 02 TCA render asserts absence of the API-key + operator-token sentinels)"

requirements-completed: [AUCT-04]

# Metrics
duration: ~18min
completed: 2026-07-09
---

# Phase 9 Plan 05: On-Ledger Best-Ex / TCA Receipt Summary

**Delivered provable per-desk value (AUCT-04): `TradeConfirmation` now carries the best-ex/TCA fields and `Round.Clear` computes each desk's surplus and asserts `surplusVsLimit >= 0` ON-LEDGER at the per-desk create site — the structurally-non-negative, ledger-provable best-execution number — kept strictly DISTINCT from a labeled, SIGNED `vs-REFERENCE` stub benchmark that may be negative; the receipt flows ledger→solver→web into a two-distinct-surplus SettlementView block + EXPORT RECEIPT and embeds in the WOW-05 proof-pack, with the §4 fixture still settling A=10/B=8/C=2 @ $100.00 under the new assertion.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-09
- **Tasks:** 2
- **Files modified:** 10 (2 Daml + regenerated web/daml.js + 5 solver + 3 web incl. 1 new component)

## Accomplishments

- **On-ledger AUCT-04 proof (Task 1, Daml).** `TradeConfirmation` gains `ownLimit : Optional Decimal`, `referencePrice : Decimal`, `surplusVsLimit : Decimal`, `improvementVsLimitBp : Decimal`, `improvementVsReferenceBp : Decimal` (signed). `Round.Clear` gains a `referencePrice` choice arg (labeled config stub — a choice body can't read config, so it's passed in per the Option-B pattern) and, at the per-desk `create TradeConfirmation` site, looks up each desk+side's own `OrderView`, computes `surplusVsLimit` (Buy → `(limit−p*)·fill`, Sell → `(p*−limit)·fill`; Noncompetitive → `ownLimit None`, surplus 0), the pinned bp (`roundBankers 0 ((|limit−p*|/p*)·10000)`) and the SIGNED `improvementVsReferenceBp`, then asserts `surplusVsLimit >= 0` — the on-ledger best-ex proof (T-09-05-01). A receipt that violated it would abort the atomic settle.
- **§4 canary green under the new assertion.** Extended `test_settled_balances` (asserts every receipt's `surplusVsLimit ≥ 0`, `referencePrice == 100.0`, and the EXACT §4 proven surpluses A=10/B=8/C=0) and added `test_surplus_nonneg` (real §4 settle → every confirmation ≥ 0, A strictly +10). All 5 `Clear` call sites in Tests.daml pass `referencePrice`. **`daml test` 23/23 green** (settlement/atomicity/privacy + the four order-type fixtures + `test_clears_at_100` all still pass; §4 settles A=10/B=8/C=2 @ $100.00 with three TCA-carrying confirmations). `web/daml.js` regenerated + committed; the generated `TradeConfirmation` carries all five TCA fields and `Clear` carries `referencePrice`.
- **TCA surface ledger→solver→web + proof-pack (Task 2).** `ledger.ts` `readTradeConfirmations` decodes the TCA fields (Optional `ownLimit` null→null, numeric strings → `Number()`); `settle` + `tamperClear` pass the module const `REFERENCE_PRICE_STUB = 100.0` as the `Clear` `referencePrice` arg (settle otherwise byte-unchanged). `api.ts` settled body gains a per-desk `receipts[]`; `proofpack.ts` bundle 02 renders the two-distinct-surplus split (PROVEN vs-LIMIT + BENCHMARK vs-REFERENCE + the STUB tag) with `index.ts` threading the receipts in. **Solver 94/94 vitest green** (incl. the new `proofpack.test.ts` TCA case + secret sweep), `tsc --noEmit` clean.
- **SettlementView two-distinct-surplus receipt.** New `TcaReceipts.tsx` (post-settle, operator plane) renders per desk: a facts grid (CLEARING PRICE · YOUR LIMIT · REFERENCE + `REFERENCE — PRE-AUCTION MID (STUB)` tag), a **proven** ink row (solid ink square + `ON-LEDGER · SURPLUS ≥ 0` + `+{surplus} · +{bp} bp`, never red) and a **benchmark** row (`VS REFERENCE · BENCHMARK (MAY BE NEGATIVE)`, positive→ink / negative→`#E2231A`), plus `EXPORT RECEIPT ↓` reusing `.umbra-ink-ghost`. `web/src/solver.ts` gains the `Receipt` type + `receipts?` on `RoundResponse`. **web build + 30 vitest green.**

## Task Commits

1. **Task 1: On-ledger TCA fields + surplus≥0 proof in Round.Clear (Daml) + tests + regenerate bindings** — `c4498ef` (feat)
2. **Task 2: Surface TCA receipt through solver + proof-pack + SettlementView** — `7eaa1b7` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `daml/Umbra/Auction.daml` — TradeConfirmation TCA fields; `tcaSurplusVsLimit`/`tcaImprovementVsLimitBp`/`tcaImprovementVsReferenceBp` helpers; `Clear` `referencePrice` arg + per-desk surplus computation + `assertMsg "execution at least as good as limit (surplusVsLimit >= 0)"`
- `daml/Umbra/Tests.daml` — extended `test_settled_balances`; new `test_surplus_nonneg`; `referencePrice = 100.0` on all 5 `Clear` call sites
- `web/daml.js/**` — regenerated bindings (TradeConfirmation TCA fields + Clear referencePrice)
- `solver/src/ledger.ts` — `readTradeConfirmations` TCA decode; `REFERENCE_PRICE_STUB`; `referencePrice` arg on `settle` + `tamperClear`
- `solver/src/api.ts` — `SettledConfirmation` TCA fields + settled `receipts[]`
- `solver/src/proofpack.ts` — `ProofPackReceipt` + bundle-02 two-distinct-surplus render + `.tca`/`.tcaMeta` styles
- `solver/src/proofpack.test.ts` — AUCT-04 TCA receipt render test
- `solver/src/index.ts` — `buildProofPack` passes the TCA receipts
- `web/src/solver.ts` — `Receipt` type + `receipts?` on `RoundResponse`
- `web/src/views/SettlementView.tsx` — mount `TcaReceipts` post-settle
- `web/src/components/TcaReceipts.tsx` — NEW: the per-desk TCA receipt block

## Deviations from Plan

### Auto-fixed / additive (necessary within scope)

**1. [Rule 3 - Blocking] `solver/src/index.ts` needed the receipts wiring (beyond the plan's named `<files>`)**
- **Found during:** Task 2 — `buildProofPack` (which calls `renderProofPackHtml`) lives in `index.ts`, not `proofpack.ts`. To embed the TCA fields in the proof-pack the receipts must be passed at that call site.
- **Fix:** `buildProofPack` maps the (now TCA-carrying) `confs` into the `receipts` param. No behavior change to the byte-unchanged settle path.
- **Committed in:** `7eaa1b7` (Task 2).

**2. [Additive] Extracted the SettlementView receipt into a `TcaReceipts.tsx` component**
- The plan said add the block "in `SettlementView.tsx`". Following the shipped `RoundBrief`/`ProofPackButton` convention (a self-fetching post-settle component), the block was extracted into `TcaReceipts.tsx` and mounted in SettlementView. Same host view, same gating (`settled`), same tokens — cleaner and consistent with the established pattern.
- **Committed in:** `7eaa1b7` (Task 2).

**Total deviations:** 2 (1 blocking-wiring, 1 additive component extraction). No scope creep; the settle path stays byte-unchanged except the additive `referencePrice` arg + TCA fields (Pitfall/T-09-05-05 respected — settlement primitives untouched, Phase 11).

## §4 Canary State (continuous correctness reference)

- `daml test`: **23/23 scripts ok** under the new `surplusVsLimit >= 0` assert — `test_clears_at_100`, `test_settled_balances` (A:10/4000 · B:12/1800 · C:13/1200 unchanged, + surplus A=10/B=8/C=0), `test_surplus_nonneg`, `test_atomicity`, `test_clear_rejects_bad_allocation`, the privacy suites, and the four order-type fixtures all green. §4 settles A=10/B=8/C=2 @ $100.00 with three TCA-carrying confirmations.
- Solver `vitest`: **94/94 green** (incl. the new proofpack TCA render + secret sweep); `tsc --noEmit` clean.
- Web: build (tsc + vite) succeeds against the regenerated bindings; **30/30 vitest green**.
- `git diff` confirms `settle()` (ledger.ts + api.ts) is byte-unchanged except the additive `referencePrice` arg + the new `receipts[]` surface — settlement primitives (single-funded-buyer + operator custody) untouched.

## Deferred to end-of-phase human verification

Per `config.workflow.human_verify_mode: end-of-phase` and the §3 constraint (a live settled round needs the running Canton stack, OUT OF SCOPE here):

- **Live TCA receipt on a settled live round:** boot the stack, settle the §4 fixture, open 05 Settlement, and confirm each desk's receipt renders the proven vs-LIMIT surplus ≥ 0 (ink), the labeled vs-REFERENCE benchmark distinctly (red only when negative), the REFERENCE stub tag, and that `EXPORT RECEIPT ↓` downloads a secret-free receipt. Confirm the proof-pack PDF's bundle 02 carries the same two-distinct-surplus fields.

These are proven at the unit/build level here (daml test + solver vitest + web build); only the live-stack settled-round render is deferred. No live result is fabricated.

## Known Stubs

- **`referencePrice` = `REFERENCE_PRICE_STUB` (100.00)** is an INTENTIONAL, clearly-labeled benchmark stub (`REFERENCE — PRE-AUCTION MID (STUB)` in the UI; documented in RESEARCH/CONTEXT as a config stub). A real market-data reference feed is deferred to Track B (Phase 13). This is not an accidental stub — it drives ONLY the labeled, signed `vs-REFERENCE` benchmark and is never conflated with the proven, on-ledger `surplusVsLimit ≥ 0` number.

## Threat Flags

None. No new network endpoint, auth path, or trust-boundary schema change beyond the additive TCA fields on the already-per-desk-private `TradeConfirmation` (observer = desk, unchanged) and the additive settled `receipts[]` (numbers/desk-ids only; secret-sweep green). T-09-05-05 (settlement invariant) respected — the settle path is byte-unchanged except the additive arg + fields.

## Self-Check: PASSED

- Files verified on disk: `daml/Umbra/Auction.daml`, `daml/Umbra/Tests.daml`, `web/daml.js/umbra-0.1.0/lib/Umbra/Auction/module.d.ts` (TCA fields present), `solver/src/ledger.ts`, `solver/src/api.ts`, `solver/src/proofpack.ts`, `web/src/components/TcaReceipts.tsx`, `web/src/views/SettlementView.tsx`, `.planning/phases/09-auction-depth-live-viz/09-05-SUMMARY.md`.
- Commits verified in git: `c4498ef` (Task 1), `7eaa1b7` (Task 2).
- Gates: daml test 23/23; solver 94/94 + tsc clean; web build + 30 vitest; proofpack secret sweep green.

---
*Phase: 09-auction-depth-live-viz*
*Completed: 2026-07-09*
