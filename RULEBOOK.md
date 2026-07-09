# Umbra Clearing Rulebook

**Status:** skeleton (Phase 9 / 09-01, AUCT-02 doc anchor). The per-order-type
sections marked _PLACEHOLDER_ are filled by plans **09-02** (Noncompetitive,
AllOrNone / MAQ) and **09-03** (Conditional auto-firming). This document is the
sovereign, human-readable statement of the deterministic uniform-price
batch-clearing rules. It is authoritative for **intent**; the code is
authoritative for **behavior**, and the two are pinned together by the
golden-eval suite (see [Enforcement](#enforcement)).

Umbra is a sealed-bid, uniform-price batch auction: every matched order settles
at a single clearing price `p*`, computed deterministically at close and
re-verified on-ledger before any delivery-versus-payment leg fires.

## Two-plane parity contract (non-negotiable)

The clearing math exists in exactly two places, which MUST produce
byte-identical `(price, allocations)` from identical inputs:

- **On-ledger / off-solver source of truth:** `daml/Umbra/Clearing.daml`
  (pure functions; no ledger I/O).
- **Solver mirror:** `solver/src/auction.ts` (a 1:1 TypeScript port).

`daml/Umbra/Auction.daml`'s `Round.Clear` choice recomputes the clearing via
`Clearing.daml::computeClearing` and asserts the submitted proposal equals the
recompute (price to 2 dp via `roundBankers 2`, allocations as an order-insensitive
multiset). Therefore **any rule present in one plane but absent or divergent in
the other cannot settle** — a mismatch is rejected on-ledger and simultaneously
breaks the golden fixtures. Every rule below cites its exact symbol in BOTH
`Clearing.daml` and `auction.ts` so the doc and the two code planes cannot drift.

## The clearing objective (applied strictly IN ORDER)

Given the candidate prices (the distinct order limits), select the clearing
price `p*` by applying these criteria in sequence:

1. **Maximize matched volume.** `matched(p) = min(demand(p), supply(p))`; keep
   only the prices that achieve the maximum matched volume.
2. **Among the max-matched prices, minimize the absolute imbalance**
   `|demand(p) − supply(p)|`.
3. **Break any remaining tie by the lower price.**

Then ration the long side of the book by **price priority** (most-aggressive
first), filling greedily in integer units up to each order's quantity and up to
the traded volume.

- Objective + candidate selection: `Clearing.daml::choosePStar` (lines 87–101),
  `demandAt`/`supplyAt`/`matchedAt`/`candidatePrices` (lines 59–74) ⇄
  `auction.ts::choosePStar` (lines 64–79), `demandAt`/`supplyAt`/`matchedAt`/
  `candidatePrices` (lines 46–59).

### The `topPrices` trap guard (LOAD-BEARING — do not remove)

Criterion (2), "minimize |demand − supply|", MUST be evaluated **only over the
subset of prices that already achieve the maximum matched volume** (`topPrices`).

Filtering to the max-matched subset FIRST, then ranking by
`(imbalance, price)`, is not an optimization — it is a correctness requirement.
If the imbalance/price rank is applied across **all** candidate prices instead
of the max-matched subset, the canonical §4 fixture clears at **99** (which has
a smaller global imbalance) instead of the correct **100**. This is the single
most-tested invariant in the build.

- Trap guard: `Clearing.daml::choosePStar` — `maxMatched = foldl max 0 …`,
  `topPrices = [ p | (p, m) <- matches, m == maxMatched ]`, then
  `sortOn (\p -> (abs (demandAt … − supplyAt …), p)) topPrices` (lines 87–101).
- Mirror: `auction.ts::choosePStar` — `maxMatched` via `.reduce(Math.max, 0)`,
  `topPrices = matches.filter(([, mm]) => mm === maxMatched)`, then the
  `(|demand − supply|, price)` sort (lines 64–79).
- Empty-list safety: max is seeded with `foldl max 0` (Daml) / `.reduce(…, 0)`
  (TS), NOT `maximumBy`, so a no-cross round yields matched 0 rather than
  crashing.

### Rationing (greedy price-priority)

After `p*` is chosen, eligible buys are sorted **descending** by limit
(most-aggressive buyer first) and eligible sells **ascending** by limit
(most-aggressive seller first); the traded volume is then distributed greedily,
each order filled to `min(order quantity, remaining)`.

Equal-limit ties are filled in the (already price-sorted, stable) input order —
this greedy integer pass is exact for the §4 fixture (which has no equal-limit
tie on the long side). Strict pro-rata with deterministic
"leftover-unit-to-largest" is a documented deferral: it is only introduced (in
both planes together, with a matching golden fixture) if a future fixture needs
it.

- Rationing: `Clearing.daml::rationByPriority` and the eligible buy/sell sort in
  `coreClear` ⇄ `auction.ts::rationByPriority` and the sort in `coreClear`.

### `coreClear` + the two-pass `computeClearing` wrapper (09-02)

The §8 kernel is factored into a single-pass `coreClear : [OrderView] → (price,
allocations)` — candidate-price selection + eligibility + priority rationing —
and a public `computeClearing` that is a deterministic **two-pass wrapper** over
it (the seam conditional auto-firming rides on, 09-03):

1. **PASS 1 — provisional.** Partition the book into `firm` (non-conditional) and
   `conditional`; clear the firm orders with `coreClear` to get a provisional
   `p*` (`provP`).
2. **PASS 2 — final.** Firm each conditional whose `firmIf` qualifies versus the
   **provisional** `p*`, drop the rest, and re-clear `firm ++ firmed` with
   `coreClear`. The provisional `p*` is the firming reference even if the final
   `p*` moves (single pass, NOT a fixpoint).

As of 09-02 the firming test (`qualifies`) is a **total pass-through** — no
order type firms or drops yet — so `firmed == conditional`, `final == the whole
book`, and `computeClearing` reduces to exactly one `coreClear`. The canonical §4
book (all `Limit`, no conditional) therefore clears **byte-identically** to the
pre-refactor single-pass form ($100.00 / A=10 / B=8 / C=2). The real `firmIf`
rule lands in 09-03; `Round.Clear` auto-covers it because it re-verifies through
this same two-pass `computeClearing`.

- Kernel + wrapper: `Clearing.daml::coreClear` / `computeClearing` ⇄
  `auction.ts::coreClear` / `computeClearing`. The partition (`firm` /
  `conditional`), the PASS-1 `provP = coreClear firm`, and the pass-through
  `qualifies` are mirrored function-for-function in both planes.

## Worked example — the canonical §4 fixture (the continuous canary)

Book: **A Buy 10 @ 101**, **B Sell 8 @ 99**, **C Sell 5 @ 100**.

| price `p` | demand(p) | supply(p) | matched(p) | \|dem − sup\| |
|-----------|-----------|-----------|------------|---------------|
| 99        | 10        | 8         | 8          | 2             |
| 100       | 10        | 8 + 5 = 13| 10         | 3             |
| 101       | 10        | 13        | 10         | 3             |

- Max matched volume = **10**, achieved at `{100, 101}` → `topPrices = {100, 101}`.
- Among those, both have imbalance 3; the lower price wins → **`p* = 100.00`**.
- Note 99 has the smallest imbalance (2) but is **not** a max-matched price
  (matched 8 < 10), so the `topPrices` filter correctly excludes it.
- Rationing at 100: buyer A fills **10**; sellers by priority B (@99) fills **8**,
  C (@100) fills the remaining **2** (C residual = 5 − 2 = 3).

**Result: `p* = 100.00`, fills A = 10 / B = 8 / C = 2.** This is the
non-negotiable correctness reference for the whole build (spec §4).

- Encoded as `daml/Umbra/Tests.daml::test_clears_at_100` ⇄
  `solver/src/auction.test.ts` scenario 1, with the isolated 99-vs-100 trap
  witness as `auction.test.ts` scenario 5.

## Best-execution surplus (AUCT-04) — basis-point formula

For a filled order, the improvement of the clearing price versus the order's own
limit, in basis points, is pinned as:

> `improvementVsLimitBp = round( ( |limit − p*| / p* ) * 10000 )`

This MUST be computed and rounded identically in both planes (`roundBankers` in
Daml ⇄ `Math.round` in TS) so the on-ledger receipt and the solver agree.
Surplus-vs-limit is structurally ≥ 0 (a buy is only eligible when `limit ≥ p*`,
a sell when `limit ≤ p*`); surplus-vs-a-reference-benchmark is a distinct number
that may be negative. The on-ledger `surplusVsLimit ≥ 0` proof and the receipt
fields are implemented in a later Phase-9 plan (AUCT-04); this section pins the
formula now so both planes converge on it.

## Order types

Umbra supports four order types, discriminated by the additive `orderType` field
on `Order` / `OrderView` (`data OrderType = Limit | Noncompetitive | AllOrNone |
Conditional`). As of 09-01 the discriminator and its parameters (`minQty`,
`firmIf`) exist across both planes but are **inert** — every order is a plain
`Limit` and the clearing reduces exactly to the objective above.

- Type + fields: `Clearing.daml::OrderType` / `OrderView` (re-exported by
  `Umbra.Auction`) ⇄ `auction.ts::OrderType` / `OrderView`.

### Limit (shipped)

A sealed limit order: a side, a quantity, and a price bound (buy = maximum,
sell = minimum). Eligible when `limit ≥ p*` (buy) / `limit ≤ p*` (sell); cleared
by the objective and rationing above. `minQty = None`, `firmIf = None`.

### Noncompetitive — _PLACEHOLDER (09-02)_

Willing to transact at **any** clearing price (no price bound), allocated at top
priority before competitive orders, capped at its quantity — analogous to a US
Treasury noncompetitive tender. Contributes to demand/supply at every price and
adds no candidate price of its own. To be filled by **09-02**, implemented in
lockstep and cited here as `Clearing.daml::demandAt`/`supplyAt`/`rationByPriority`
⇄ `auction.ts::demandAt`/`supplyAt`/`rationByPriority` (the noncompetitive
priority sort key maps Daml's `Bool` to TS `0/1`, a parity note to be pinned
when the rule lands).

### AllOrNone / MAQ — _PLACEHOLDER (09-02)_

An order with a minimum acceptable quantity `minQty` (all-or-none is the special
case `minQty == quantity`): it participates only if its resulting integer fill is
`≥ minQty`, otherwise it is excluded entirely. Determinism comes from a
**bounded candidate-price × subset enumeration** over the (small) set of
AON/MAQ orders. To be filled by **09-02**, cited here as the `coreClear` +
top-level powerset/inclusion helper in `Clearing.daml::computeClearing` ⇄ the
matching helper in `auction.ts::computeClearing`.

> **Scaling caveat (deferred).** The AON/MAQ subset enumeration is a bounded
> powerset (`2^k`) over the AON order set, which is **exponential in the number
> of AON orders**. This is acceptable for the tiny demo book but is NOT suitable
> for a large production book; a combinatorially-optimal large-book solver is
> deferred (Track B). This caveat is load-bearing and must remain documented
> when 09-02 fills the section.

### Conditional (auto-firming) — _PLACEHOLDER (09-03)_

An order that firms or drops deterministically at close based on a `firmIf`
price threshold, evaluated by a single **two-pass** rule (NOT a fixpoint):
(1) provisionally clear over the firm orders; (2) firm each conditional whose
`firmIf` qualifies versus the **provisional** `p*` (buy firms if clearing ≤
threshold, sell firms if clearing ≥ threshold), drop the rest, and recompute the
final clear. The provisional `p*` is the firming reference even if the final
`p*` differs (accepted; no re-iteration). To be filled by **09-03**, cited here
as the two-pass wrapper + `qualifies` inside `Clearing.daml::computeClearing` ⇄
`auction.ts::computeClearing`. `Round.Clear` auto-covers it by recomputing the
same two-pass `computeClearing`.

## Determinism and parity notes

- Every Daml `Decimal` literal carries a decimal point; unit quantities stay
  `Int` end-to-end (no Int/Decimal mixing).
- Price equality is compared at 2 dp: `roundBankers 2` (Daml) ⇄
  `Math.round(p * 100) / 100` (TS).
- Allocation equality is an order-insensitive multiset compare on the key
  `(desk, side, filledQty)` — reuse `sortOn allocKey` (Daml) / the sorted-key
  compare (TS); never hand-roll.
- Where a Daml sort key includes a `Bool`, map it to `0/1` in the TS key tuple
  and compare lexicographically (Daml `False < True`).

## Enforcement

This document does **not** contain fenced implementation code beyond symbol
names and signatures — by design. The rules are enforced by the **golden-eval
suite**, whose fixtures ARE the executable form of this rulebook:

- Daml: `daml/Umbra/Tests.daml` (run via `daml test`).
- Solver: `solver/src/auction.test.ts` (run via `npx vitest run auction.test.ts`).

Both must be green — with the §4 fixture clearing at exactly $100.00 (A=10 /
B=8 / C=2) and the 99-vs-100 trap witness holding — after every change to either
`Clearing.daml` or `auction.ts`. A rule stated here but not asserted by a
fixture in both planes is not yet law.
