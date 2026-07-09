---
phase: 09-auction-depth-live-viz
reviewed: 2026-07-09T18:03:46Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - daml/Umbra/Clearing.daml
  - daml/Umbra/Auction.daml
  - daml/Umbra/Roles.daml
  - daml/Umbra/Setup.daml
  - solver/src/auction.ts
  - solver/src/api.ts
  - solver/src/ledger.ts
  - solver/src/proofpack.ts
  - web/src/components/OrderTicket.tsx
  - web/src/components/CrossingChart.tsx
  - web/src/views/SettlementView.tsx
  - web/src/views/TheatreView.tsx
  - web/src/solver.ts
  - web/src/lib/leakage.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
blocker_status: resolved
blocker_resolution: "CR-01 (privacy blocker) fixed in commit f7ed967 — netImbalance/estMatched now withheld under the small-N guard + N=1 leak-closure test. WR-01/WR-02/WR-03 accepted as documented advisory (latent, outside the §4 fixture + 1-dp demo book; a clearing-core edit carries §4-canary regression risk, deferred)."
---

# Phase 9: Code Review Report

**Reviewed:** 2026-07-09T18:03:46Z
**Depth:** deep (cross-plane Daml⇄TS trace)
**Files Reviewed:** 14 source files (generated bindings + planning docs excluded)
**Status:** issues_found — **advisory / non-blocking gate**
**Orchestrator disposition:** CR-01 (blocker) **RESOLVED** in commit `f7ed967`. Warnings WR-01/WR-02/WR-03 accepted as documented advisory (latent, outside the §4 fixture + 1-dp demo book; fixing them edits the clearing core and carries §4-canary regression risk — deferred, not blocking the demo).

## Summary

Phase 9 changed the clearing core (`Clearing.daml` + its `auction.ts` byte-mirror),
added a settlement-path best-ex assertion in `Round.Clear`, and shipped an open-window
aggregate indicative feed plus the WOW-06 leakage sim. Automated gates are all green
(daml 23/23, solver 94/94, web 37/37, tsc clean), so this review targets what the golden
fixtures do **not** cover: latent Daml⇄TS divergences, edge cases outside §4, and
structural privacy/liveness risks.

The clearing math is well-structured and the two planes mirror each other closely on the
happy path (§4 → $100.00 / A=10 / B=8 / C=2 verified in both). The `topPrices` trap guard
and the `surplusVsLimit >= 0` assertion are both **correct** and cannot regress on valid
input (see notes below). However I found **one privacy defect that undercuts the core value
prop** (the "aggregate-only" indicative feed is not actually aggregate at small N) and
three latent divergence/robustness issues that the current fixtures mask.

Notes on the focus areas that came back **clean**:

- **`topPrices` trap guard (focus 2):** Correct in both planes. `coreClear` ranks by
  `matched` as the primary key (`negate m` / `b.m - a.m`), so a non-max-matched price can
  never win on imbalance — the §4-clears-at-99 failure mode cannot recur. `choosePStar`'s
  standalone guard is equally correct.
- **`surplusVsLimit >= 0` assertion (focus 3):** Cannot be tripped by a valid allocation.
  It runs *after* the `computeClearing`-equality recompute, and every fill in `fillsAtPrice`
  is eligibility-filtered (buy ⇒ `limit >= p`, sell ⇒ `limit <= p`), so the surplus is
  structurally ≥ 0. The §4 marginal fill (C at surplus exactly 0.0) passes `>= 0.0` on exact
  Daml `Decimal`. A malformed proposal is rejected by the earlier equality check, not this
  assert — no bypass.
- **Secret handling (focus 4, key leakage):** `ANTHROPIC_API_KEY` / operator token stay
  module-private in `ledger.ts`/`agent.ts`; the error envelope and proof-pack interpolate
  only numbers/hashes. No path spills a secret to a response or the web bundle.
- **WOW-06 `leakage.ts` (focus 6):** Pure, deterministic (no `Date`/random/DOM), empty-safe,
  and rendered inside a panel that is unmistakably marked `SIMULATION · ILLUSTRATIVE — NOT
  LEDGER DATA` (dashed border + disclaimer). Clean.

## Critical Issues

### CR-01: "Aggregate-only" indicative feed leaks a rival's exact order at small N  — ✅ RESOLVED (commit f7ed967)

> **Resolution:** `buildIndicative` now withholds `netImbalance` and `estMatched` (made optional) inside the guarded branch — below ≥2 orders on both sides only a coarse price `band` crosses the wire. The web `IndicativeMeta` mirror + `IndicativePanel` render the two scalar rows only when present (guarded state shows a `WITHHELD — PRIVACY GUARD` caption). Added an N=1 leak-closure test and corrected the small-N test that had codified the leak. solver 95/95, web 37/37, tsc clean.

**File:** `solver/src/api.ts:227-245` (`buildIndicative`), surfaced via `GET /round/:id`
(`api.ts:299-304`) and rendered in `web/src/views/TheatreView.tsx:273-377`.

**Issue:** The open-window privacy guard withholds only the **price** — `netImbalance` and
`estMatched` are emitted **unconditionally in both branches**:

```ts
const guarded = buys.length < 2 || sells.length < 2
if (guarded) {
  return { coarse: true, band: ..., netImbalance, estMatched }   // <-- still leaked
}
return { indicativePrice: pStar, netImbalance, estMatched }
```

Those two scalars are not "aggregate" when the book is small:

- **N = 1 (the sole sealed order):** `netImbalance = ±quantity` — it directly reveals the
  one order's **side** (sign) and **exact quantity**. Any desk polling `GET /round/:id`
  during the window learns a rival's order the moment it is the only one sealed.
- **N = 2, one per side (both `< 2` ⇒ guarded):** `netImbalance = Qb − Qs` and
  `estMatched = min(Qb, Qs)`. From `{min, difference}` a third party recovers **both** `Qb`
  and `Qs` exactly, plus each side. The "aggregate" fully reconstructs two individual orders.

This contradicts the project's core guarantee ("no one — not rival desks — can see anyone
else's orders") and is exactly the small-N bypass focus area 4 asked to rule out. The guard
coarsens `indicativePrice` but leaves the quantity channel wide open. The feed is served by
the shared solver to the Vite origin without per-party scoping, so it is a genuine
desk-vs-desk leak surface, not just an operator view.

**Fix:** Gate the quantity scalars behind the same (or a stronger) small-N threshold as the
price, and bucket rather than emit exact counts until the book is large enough that no
individual order can be backed out. e.g.:

```ts
const enoughDepth = buys.length >= 2 && sells.length >= 2
if (!enoughDepth) {
  // Suppress or coarse-bucket the quantity channel too — never emit exact netImbalance/estMatched.
  return { coarse: true, band: Math.round(pStar / INDICATIVE_BAND_BUCKET) * INDICATIVE_BAND_BUCKET }
}
return { indicativePrice: pStar, netImbalance, estMatched }
```

(and make `netImbalance`/`estMatched` optional in `IndicativeBlock` / web `IndicativeMeta`,
with the panel omitting the rows when absent).

## Warnings

### WR-01: Daml/TS `computeClearing` rounding asymmetry — divergent price and firming boundary

**File:** `solver/src/auction.ts:210` vs `daml/Umbra/Clearing.daml:248-250` and
`Auction.daml:239`.

**Issue:** TS `coreClear` rounds the winning price — `Math.round(best.p * 100) / 100`
(half-**up**) — while Daml `coreClear`/`computeClearing` return the **raw** candidate price
with **no rounding at all** (rounding first appears only in `Round.Clear` via `roundBankers 2`,
which is half-**even**). So the two `computeClearing` functions are *not* byte-identical, and
the `auction.ts:14` comment "`Math.round(p*100)/100` (mirrors Daml roundBankers 2)" is
inaccurate on both counts (Daml `computeClearing` doesn't round, and `roundBankers ≠ Math.round`).

For any candidate price (= an order `limit`) with ≥3 decimals carrying a `5` in the 3rd place
(e.g. `100.125`), the planes disagree in two places the fixtures never exercise:

1. **Settlement reconciliation:** solver submits `Math.round(100.125*100)/100 = 100.13`;
   `Round.Clear` recomputes raw `100.125` and compares `roundBankers 2 100.13 == roundBankers 2 100.125`
   → `100.13 == 100.12` → **false → a valid clear is rejected**.
2. **Conditional firming:** `qualifies` compares against `provP = coreClear(firm).clearingPrice`
   (`auction.ts:235`). Rounded (TS) vs raw (Daml) `provP` can put a `firmIf` band on opposite
   sides of the boundary → a different firmed set → a different final clearing between planes.

Currently masked because the UI submits `limitNum.toFixed(1)` (see IN-01), but nothing
*structural* guarantees ≤2-dp limits on-ledger (`Order`'s `ensure` permits any `Decimal > 0`;
`readSealedOrders` does `Number(...)`), so a script/alternate submit path re-opens it.

**Fix:** Make the two planes symmetric. Either (a) do **not** round inside `auction.ts::coreClear`
(return raw `best.p`, matching Daml, and let `Round.Clear`'s `roundBankers 2` be the sole
rounding site), or (b) round with a banker's-rounding helper in TS *and* apply the identical
rounding inside Daml `coreClear` — and use the same rounded value to feed `qualifies`. Also
correct the misleading comment at `auction.ts:14`.

### WR-02: Unbounded AON/MAQ powerset — `2^k` runs inside the on-ledger settlement

**File:** `daml/Umbra/Clearing.daml:228-250` (`coreClear` / `powerset`), mirrored
`solver/src/auction.ts:175-197`; invoked on-ledger at `Auction.daml:237`.

**Issue:** `coreClear` enumerates the full `2^k` powerset of the AON-order set with **no
enforced cap**. The RULEBOOK (lines 272-276) documents the exponential caveat but no code
guard exists. Critically this enumeration runs **inside `Round.Clear`'s recompute**, so a
desk that seals many AON orders (each individually valid under the `Order` `ensure`:
`minQty ∈ [1, quantity]`) can blow up both the solver's `solve-preview` and the atomic
settlement transaction itself — a liveness/DoS vector that bricks the round, not merely a
perf smell. Desks submit on their own authority via `Venue.SubmitOrder`, so the input is
attacker-controlled.

**Fix:** Enforce a hard cap on AON orders per round before enumeration in both planes (and
ideally reject the (k+1)-th AON order at `Venue.SubmitOrder` / `Order` `ensure`), e.g. abort
`coreClear` if `length aon > MAX_AON` (a small constant like 8–10 for the demo book). Fail
loud and early rather than hang the settlement tx.

### WR-03: `fillOfOrder` structural-equality (Daml) vs reference-equality (TS) divergence

**File:** `daml/Umbra/Clearing.daml:195-196` vs `solver/src/auction.ts:159-160`.

**Issue:** Daml `fillOfOrder` matches with structural equality (`o' == o` over the whole
`OrderView` record); TS matches with object identity (`o2 === o`). For two **structurally
identical** orders (same desk/side/quantity/limit/orderType/minQty/firmIf) Daml sums *both*
their fills for a single lookup while TS returns only the one object's fill. This feeds the
AON feasibility test (`coreClear`: `... fillOfOrder fills o >= minQtyOf o`), so identical AON
orders can pass the feasibility gate in Daml but fail in TS (or vice-versa) → divergent
inclusion → divergent clearing, which then trips the `Round.Clear` equality assert. The
`auction.ts:157-158` comment acknowledges the design ("orders in the demo book have distinct
desks") but the MVP has no structural guarantee against duplicate/identical orders.

**Fix:** Make the two agree independent of the demo's distinct-desk assumption — e.g. tag each
`OrderView` with a unique id at construction and match on that id in both planes, or de-dupe
identical orders before clearing. At minimum, assert distinct desks on-ledger so the divergence
cannot arise.

## Info

### IN-01: OrderTicket silently rounds the desk's limit to 1 decimal place

**File:** `web/src/components/OrderTicket.tsx:166` (and `firmIf` at line 175).

**Issue:** `const effLimit = ... limitNum.toFixed(1)` — a desk entering `100.55` seals
`'100.6'` with no on-screen indication the price was changed. `firmIf` is likewise
`toFixed(1)`. This is the de-facto mitigation that keeps WR-01 from firing through the UI, but
it is a silent data mutation of a price-sensitive field. Note the inconsistency with
`loadDemo`/`onParse`, which display `toFixed(2)`.

**Fix:** Either accept and submit 2-dp limits (`toFixed(2)`, matching the display) with the
math made rounding-symmetric per WR-01, or surface the 1-dp normalization to the desk before
sealing.

### IN-02: Coarse indicative band can round the price upward past the true clear

**File:** `solver/src/api.ts:239`.

**Issue:** `band = Math.round(pStar / 5) * 5` rounds to the nearest multiple of 5, so a
`pStar` of `100` and `102` both map to `100`, and `103` maps to `105` — a band *above* any
crossing price. Combined with CR-01 this is minor, but the "coarse band" still narrows the
price to a ±2.5 window (and, with the quantity leak fixed per CR-01, the band becomes the only
price signal — worth confirming ±2.5 is coarse enough for the privacy claim).

**Fix:** Consider floor-bucketing (`Math.floor(pStar / BUCKET) * BUCKET`) and/or a wider
bucket, and document the intended residual-disclosure bound.

---

_Reviewed: 2026-07-09T18:03:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep — advisory, non-blocking_
