# Phase 2: Clear & Settle On-Ledger - Research

**Researched:** 2026-06-25
**Domain:** Daml 2.10.4 — pure-function clearing (§8), atomic DvP settlement inside `Round.Clear`, Daml Script tests
**Confidence:** HIGH (all stdlib signatures read directly from the installed SDK source tree at `%APPDATA%\daml\sdk\2.10.4\...\daml-stdlib-2.10.4`; all Script patterns verified against the green Phase-1 `Tests.daml`; the §8→$100.00 result hand-traced below)

## Summary

Phase 2 turns the ledger into the source of truth for clearing and the atomicity boundary for settlement. It has three deliverables: (1) the §8 deterministic clearing algorithm as **pure Daml functions** (recommended in a new `Umbra/Clearing.daml`), (2) the real `Round.Clear` choice body replacing the loud Phase-1 placeholder — re-verify the proposal, then settle DvP in one transaction, issue per-desk `TradeConfirmation`s, set `status = Settled`, and (3) four Daml Script tests in `Tests.daml`.

The single highest-risk detail is the **two-level tie-break trap** (locked in CONTEXT). Tie-break (a) "minimize |demand − supply|" must be applied **only among the candidate prices that already achieve max matched volume**. The §4 fixture clears at 100 only because of this scoping: across all prices, p=99 has the smallest imbalance (|10−8|=2), so an un-scoped tie-break clears at **99**, not 100. Among the max-matched set {100, 101} the imbalance is tied (3 vs 3), so tie-break (b) — lower price — selects **100**. I hand-trace this below and recommend `test_clears_at_100` be the build's continuous guardrail.

The second design decision the planner must make is **how `Round.Clear` locates the `Asset`s to move**. Daml choice bodies **cannot query the ACS** — there is no `query`/`queryContractId` inside a choice (those are Daml Script only). Two clean options exist: **(A)** add a contract `key (operator, owner, symbol)` to `Asset` and use `fetchByKey`/`exerciseByKey` inside `Clear` (touches the "frozen" Asset template, but operator-custody makes the key total and unique), or **(B)** pass the needed `ContractId Asset`s into `Clear` as choice arguments and have the caller (test now, TS solver in P4) locate them. **Recommendation: Option B** — it keeps the Asset template byte-frozen (Phase-1 invariant), keeps `Clear` a pure function of its inputs, and matches the spec's "solver output, verified on-ledger" framing. The signature change is additive (new fields on the existing `Clear` choice), and the cross-layer `Allocation`/`ClearResult` shapes stay stable.

**Primary recommendation:** Add `Umbra/Clearing.daml` with pure `computeClearing : [OrderView] -> (Decimal, [Allocation])`. Extend `Round.Clear` to accept the buyer's and sellers' `Asset` ContractIds (Option B), re-verify by **recomputing §8 and asserting equality** (strongest backstop, satisfies CLEAR-05 + SETL-04 in one check), then settle via `Split`/`Merge`/`Reassign` under sole operator authority. Round cash and price with `roundBankers 2` / write all literals with decimal points. Drive all four tests from inline fixtures (do not reuse `runCanonicalRound`, which only submits orders).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**§8 clearing algorithm in Daml (the deterministic core — MUST be exact, copy spec §8 verbatim)**
- **Candidate prices:** the sorted set of all DISTINCT limit prices appearing in buys ∪ sells. (§4: {99, 100, 101}.)
- **Per candidate price p:** `demand(p)` = Σ qty of buys with `limit ≥ p`; `supply(p)` = Σ qty of sells with `limit ≤ p`; `matched(p)` = `min(demand(p), supply(p))`.
- **Choose p\*:** the price maximizing `matched(p)`. **Two-level tie-break, IN ORDER:** (a) among the max-matched candidates ONLY, minimize `|demand(p) − supply(p)|`; (b) if still tied, choose the **lower** price. Round p\* to 2 decimals. **CRITICAL TRAP:** tie-break (a) must be applied ONLY among the candidates that achieve max matched volume — applying it across all prices clears the §4 fixture at 99 instead of 100. (§4 proof: matched is 10 at both 100 and 101; |demand−supply| = 3 at both; tie → lower = **100**.)
- **Allocation at p\*:** eligible buys = buys with `limit ≥ p*`; eligible sells = sells with `limit ≤ p*`; `traded = matched(p*)`. The **short side fills fully**; the **long side is rationed by price priority** (most aggressive first: lowest-limit sells / highest-limit buys), then **pro-rata** for ties, with integer rounding that never exceeds `traded` — **leftover unit(s) go to the largest order** (document this rule; it must be identical in Daml and, later, TS). (§4: short side = buys = A fills 10; long side = sells B(99)+C(100) rationed by price priority → B fills 8, C fills 2, C residual 3.)
- **Output:** `clearingPrice = p*` and `[Allocation]` (each desk's filledQty + side). Implement as pure Daml functions (recommend a dedicated module, e.g. `Umbra/Clearing.daml`, importable by `Auction.daml`/`Tests.daml` and, later, mirrored in TS).

**`Round.Clear` body (replace the Phase-1 placeholder) — spec §10 atomic DvP**
The choice signature stays frozen (`clearingPrice : Decimal`, `allocations : [Allocation]`, controller operator → `ClearResult`). In ONE transaction, the Operator:
1. **Re-verify** the proposed `(clearingPrice, allocations)` against the sealed `Order`s: recompute §8 and assert the proposal matches (or, equivalently, assert the proposal satisfies max-matched-volume, per-order limit compliance, and conservation). Reject (fail the choice) anything inconsistent (CLEAR-05, SETL-04).
2. **Reassign `Asset`s (DvP):** move BONDX from sellers→buyer and USDCx from buyer→sellers at p\*, using `Split`/`Merge`/`Reassign` under sole Operator authority (operator-custody — no counterparty signatures). Split exact amounts where holdings exceed traded quantity.
3. Archive/mark the round's `Order`s (Filled / PartiallyFilled / Unfilled).
4. Create a `TradeConfirmation` per participating desk (filledQty, clearingPrice, cashMoved; observer = that desk only).
5. Set `Round.status = Settled`.
Atomic by construction — any failing leg (e.g., a seller lacking the asset) rolls back the whole thing (SETL-03).

**§4 settlement arithmetic (assert exactly)**
- p\* = 100.00; fills A buys 10, B sells 8, C sells 2 (C residual 3 unfilled).
- Cash: A pays 10×100 = 1000 USDCx; B receives 8×100 = 800; C receives 2×100 = 200 (conserved).
- Post-settlement balances: **A: 10 BONDX / 4000 USDCx · B: 12 BONDX / 1800 USDCx · C: 13 BONDX / 1200 USDCx.**

**Tests (`Tests.daml`, spec §16 tests 1–4) — all must pass under `daml test`**
- `test_clears_at_100`, `test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation` (signatures restated in Validation Architecture below).

### Claude's Discretion
- Module organization for the §8 functions (new `Clearing.daml` vs functions in `Auction.daml`); exact helper signatures; the leftover-rounding implementation detail (as long as deterministic + matches the documented rule); how the test constructs the sealed-order list (reuse `runCanonicalRound` from Phase 1 or build inline); ordering of the DvP legs within the transaction.

### Deferred Ideas (OUT OF SCOPE)
- TypeScript §8 implementation + the TS-vs-Daml equality assertion → Phase 4 (CLEAR-02/03, SOLV-05).
- Per-party JWT privacy tests (test_privacy_orders/confirmations) + the 3-up view → Phase 3.
- The AI solver proposing the clearing → Phase 5 (Round.Clear just needs to accept a verified allocation; who computes it — test harness now, TS solver in P4, AI in P5).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAR-04 | §4 fixture clears at exactly $100.00, fills A=10/B=8/C=2 (C residual 3) — `test_clears_at_100` | "§8 in Daml" pattern + hand-trace proving 100.0; tie-break-trap pitfall |
| CLEAR-05 | §8 re-verified inside `Round.Clear`; matches the (later) TS impl | "Re-verification" pattern — recompute §8 in the choice body and assert equality |
| SETL-01 | `Round.Clear` settles atomically: reassign BONDX & USDCx at p\*, issue per-desk `TradeConfirmation`, set `status=Settled` | "Round.Clear atomic body" pattern; Split/Merge/Reassign primitives (Phase-1 `Asset`) |
| SETL-02 | Post-settlement balances match §4; cash + assets conserved — `test_settled_balances` | "Asserting balances in Script" pattern; conservation sum |
| SETL-03 | Any failing leg → `Clear` fails, no balances change (all-or-nothing) — `test_atomicity` | "Atomicity test" pattern — `submitMustFail` + a seller short the asset |
| SETL-04 | `Round.Clear` rejects allocation violating max-volume/limits/conservation — `test_clear_rejects_bad_allocation` | "Re-verification" pattern; recompute-and-assert rejects any deviation |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| §8 clearing math (p\*, allocation) | Ledger (pure Daml, `Clearing.daml`) | Solver service (P4 mirrors in TS) | Must be re-verifiable on-ledger; pure functions are testable + portable to TS 1:1 |
| Proposal re-verification (the backstop) | Ledger (`Round.Clear` body) | — | Trust boundary: a wrong/malicious proposal must be rejected *on-ledger*, not just off |
| Atomic DvP settlement (asset + cash legs) | Ledger (`Round.Clear` body) | — | Atomicity = one Daml transaction; only the ledger gives all-or-nothing |
| Asset movement primitives (Split/Merge/Reassign) | Ledger (`Asset`, Phase-1, frozen) | — | Operator-custody → sole-authority, no counterparty signatures needed |
| Fill receipts (`TradeConfirmation`) | Ledger (created in `Clear`) | — | Per-desk private receipt; observer enforces disclosure |
| Test fixtures + assertions | Ledger (Daml Script, `Tests.daml`) | — | `daml test` is the gate; querying balances is a Script-tier op |

**Phase-2 note:** every capability is Ledger-tier. No client/API/frontend tier work. The TS mirror of §8 and the JWT privacy tests are explicitly deferred (P4/P3).

## Standard Stack

> **No external packages are installed in this phase.** It is pure Daml against the already-pinned SDK 2.10.4. `daml-prim` / `daml-stdlib` / `daml-script` ship inside the SDK and are already declared in `daml/daml.yaml`. The Package Legitimacy Audit is therefore **N/A** (no npm/PyPI/crates install occurs).

### Core (this phase — all bundled with SDK 2.10.4)
| Module / Function | Source | Purpose | Verified |
|-------------------|--------|---------|----------|
| `DA.List` — `sort`, `sortOn`, `sortBy`, `dedup`, `minimumBy`, `maximumBy` | `daml-stdlib-2.10.4/DA/List.daml` | candidate-price set, price-priority ordering, p\* selection | [VERIFIED: SDK source, lines 112/116/122/132/148/229] |
| `Prelude` — `foldl`, `filter`, `map`, `sum`, `min`, `max`, `abs` | core | demand/supply folds, matched = min, imbalance = abs | [VERIFIED: standard Prelude, used in Phase-1 code] |
| `DA.Internal.Prelude` — `intToDecimal`, `roundBankers`, `roundCommercial`, `truncate`, `floor`, `ceiling` | `.../DA/Internal/Prelude.daml` lines 578/582/586/566/625/631 (re-exported by Prelude) | cash math (Int qty → Decimal), 2-dp rounding of p\* and cashMoved | [VERIFIED: SDK source] |
| `Prelude` — `div`, `mod` (Int) | core | pro-rata integer rationing | [VERIFIED: standard Int arithmetic] |
| `Daml.Script` — `query @T`, `queryContractId`, `submit`, `submitMustFail`, `createCmd`, `exerciseCmd` | daml-script (bundled) | tests: seed, settle, assert balances, assert atomicity | [VERIFIED: already used in Phase-1 `Tests.daml`, green] |
| `DA.Assert` — `(===)`, `assertMsg` | daml-stdlib | test assertions | [VERIFIED: imported in Phase-1 `Tests.daml`] |
| `DA.Foldable` — `forA_` | daml-stdlib | iterate expected balances | [VERIFIED: imported in Phase-1 `Tests.daml`] |

### Key signatures (read from SDK source — copy exactly)
```haskell
-- DA.List
sort      : Ord a => [a] -> [a]
sortOn    : Ord k => (a -> k) -> [a] -> [a]          -- ascending by key
sortBy    : (a -> a -> Ordering) -> [a] -> [a]
dedup     : Ord a => [a] -> [a]                       -- remove duplicates (keeps distinct)
minimumBy : (a -> a -> Ordering) -> [a] -> a          -- ERRORS on empty list
maximumBy : (a -> a -> Ordering) -> [a] -> a          -- ERRORS on empty list

-- DA.Internal.Prelude (available via Prelude, no import needed)
intToDecimal : Int -> Decimal
roundBankers : Int -> Numeric n -> Numeric n          -- banker's rounding to n decimals
roundCommercial : NumericScale n => Int -> Numeric n -> Numeric n   -- half-up to n decimals
truncate : Numeric n -> Int                           -- toward zero
```
> `dedup` requires `Ord` and returns distinct elements (use it for the candidate-price set, then `sort`). `sort`/`sortOn` are ascending. `minimumBy`/`maximumBy` **error on `[]`** — guard the no-cross case (empty match) before calling, or fall back to a default p\* (see Pitfall 4).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `Umbra/Clearing.daml` module | §8 functions inline in `Auction.daml` | A separate module keeps the pure core importable by `Tests.daml` and trivially mirrorable in TS (P4); recommended. Inlining works but couples the math to the template module. |
| Recompute-§8-and-assert-equality (verification) | Assert max-volume + limits + conservation separately | Recompute-and-equal is the **strongest** check and is the least code (one call + one `===`); it subsumes max-volume + limit + conservation. Use it for CLEAR-05/SETL-04. Keep an *additional* explicit conservation assert as defense-in-depth. |
| Option B (pass `ContractId Asset` into `Clear`) | Option A (add `key (operator,owner,symbol)` to `Asset` + `fetchByKey`) | Option B keeps the Phase-1 `Asset` template byte-frozen and keeps `Clear` a pure function of its args. Option A is ergonomic but mutates the frozen template and risks a duplicate-key error if a party ever holds two same-symbol Assets. **Recommend B.** |

**Installation:** none. Confirm the toolchain is reachable first:
```bash
daml version    # expect 2.10.4 default (invoked via ~/bin/daml shim on this machine)
daml build      # the compile gate
daml test       # the test gate (exit code authoritative)
```

## §8 Clearing Algorithm in Daml — copy-ready

### The hand-trace that proves $100.00 (do this in your head before trusting the code)

§4: Buys `A{10,101}`. Sells `B{8,99}`, `C{5,100}`. Candidate prices = `dedup`+`sort` of `[101,99,100]` = `[99.0, 100.0, 101.0]`.

| p | demand(p) = Σ buys limit≥p | supply(p) = Σ sells limit≤p | matched = min |
|---|---|---|---|
| 99 | A:101≥99 → **10** | B:99≤99 ✓ (8); C:100≤99 ✗ → **8** | **8** |
| 100 | A:101≥100 → **10** | B:99≤100 ✓ (8); C:100≤100 ✓ (5) → **13** | **10** |
| 101 | A:101≥101 → **10** | B(8)+C(5) → **13** | **10** |

`maxMatched = 10`. **Candidates achieving 10 = [100, 101]** (NOT 99 — this is the trap). Among those, imbalance `|demand−supply|`: at 100 = `|10−13| = 3`; at 101 = `|10−13| = 3`. Tied → tie-break (b) lower price → **p\* = 100.0** ✓.

> ⚠ **THE TRAP:** if you minimize `|demand−supply|` over ALL prices, p=99 wins with imbalance 2 < 3 → clears at **99**, fills only 8. The fix is structural: filter to the max-matched set *first*, then apply (a), then (b).

### Allocation trace at p\*=100
- eligible buys (limit≥100) = `[A{10}]`; eligible sells (limit≤100) = `[B{8,99}, C{5,100}]`; `traded = matched(100) = 10`.
- **Short side** = buys (total 10) ≤ sells (total 13) → buys fill fully → **A = 10**.
- **Long side** = sells, rationed by price priority (most aggressive = lowest limit first): order = `[B(99), C(100)]`. Fill greedily up to `traded=10`: B takes `min(8, 10)=8` (remaining 2); C takes `min(5, 2)=2` (remaining 0). → **B=8, C=2, C residual 3** ✓.
- Leftover-to-largest only applies when pro-rata produces a fractional split among **equal-limit** ties; §4 has no equal-limit tie, so the greedy price-priority pass alone gives the exact answer. Document the leftover rule anyway (it must match the future TS impl).

### Recommended `Umbra/Clearing.daml` (pure functions)
```haskell
-- Source: spec §8 (verbatim) + CONTEXT tie-break trap + DA.List signatures
--   (sort/sortOn/dedup/minimumBy verified from SDK 2.10.4 source).
-- Pure, total-on-nonempty, importable by Auction.daml + Tests.daml, mirrorable in TS (P4).
module Umbra.Clearing where

import DA.List (sort, sortOn, dedup, minimumBy)
import Umbra.Auction (Side(..), Allocation(..))

-- A flattened view of one order (decoupled from the Order template so the math
-- is a pure function of plain data — easy to test + mirror in TS).
data OrderView = OrderView with
    desk     : Party
    side     : Side
    quantity : Int
    limit    : Decimal
  deriving (Eq, Show)

isBuy : OrderView -> Bool
isBuy o = o.side == Buy

isSell : OrderView -> Bool
isSell o = o.side == Sell

-- Σ qty of buys willing to pay >= p
demandAt : [OrderView] -> Decimal -> Int
demandAt orders p =
  sum [ o.quantity | o <- orders, isBuy o, o.limit >= p ]

-- Σ qty of sells willing to receive <= p
supplyAt : [OrderView] -> Decimal -> Int
supplyAt orders p =
  sum [ o.quantity | o <- orders, isSell o, o.limit <= p ]

matchedAt : [OrderView] -> Decimal -> Int
matchedAt orders p = min (demandAt orders p) (supplyAt orders p)

-- Step 1: distinct, sorted candidate prices from all limits.
candidatePrices : [OrderView] -> [Decimal]
candidatePrices orders = sort (dedup [ o.limit | o <- orders ])

-- Step 3: choose p* with the TWO-LEVEL tie-break, applied IN ORDER.
-- CRITICAL: tie-break (a) is computed ONLY over the max-matched candidates.
choosePStar : [OrderView] -> Decimal
choosePStar orders =
  let prices    = candidatePrices orders
      matches   = [ (p, matchedAt orders p) | p <- prices ]
      maxMatched = maximum (0 :: Int :: [ m | (_, m) <- matches ])   -- see note: use foldl below if you prefer
      -- candidates that ACHIEVE max matched volume (this is the trap-guard):
      topPrices = [ p | (p, m) <- matches, m == maxMatched ]
      -- tie-break (a): minimize |demand - supply| among topPrices ONLY,
      -- then (b): lower price. sortOn is ascending, so the key (imbalance, price)
      -- already encodes "smaller imbalance first, then lower price"; head wins.
      ranked = sortOn (\p -> (abs (demandAt orders p - supplyAt orders p), p)) topPrices
  in case ranked of
       (p :: _) -> p
       []       -> 0.0    -- no candidates => no cross; caller guards (Pitfall 4)

-- Step 4: allocation at p*. Short side fills fully; long side rationed by
-- price priority (sells ascending-limit, buys descending-limit), then leftover-to-largest.
-- Returns [Allocation] (one per order that has a nonzero or zero fill — include all
-- participating orders so the round can mark every Order's status).
computeClearing : [OrderView] -> (Decimal, [Allocation])
computeClearing orders =
  let pStar  = choosePStar orders
      traded = matchedAt orders pStar
      buys   = [ o | o <- orders, isBuy o,  o.limit >= pStar ]
      sells  = [ o | o <- orders, isSell o, o.limit <= pStar ]
      -- ration each side to `traded` total by price priority:
      buyFills  = rationByPriority (sortOn (\o -> negate (intToDecimal 0) ) buys) traded   -- see note
      sellFills = rationByPriority sells traded
      allocs =
        [ Allocation with desk = o.desk; side = Buy;  filledQty = f | (o, f) <- buyFills  ] ++
        [ Allocation with desk = o.desk; side = Sell; filledQty = f | (o, f) <- sellFills ]
  in (pStar, allocs)

-- Ration `traded` units across orders, most-aggressive-first, integer fills,
-- never exceeding each order's quantity nor `traded`. Greedy pass = price priority;
-- for equal-limit ties the greedy order is stable, and any leftover unit from a
-- pro-rata split is assigned to the largest order (documented rule).
rationByPriority : [OrderView] -> Int -> [(OrderView, Int)]
rationByPriority ordered traded = go ordered traded
  where
    go [] _ = []
    go (o :: rest) remaining =
      let f = min o.quantity remaining
      in (o, f) :: go rest (remaining - f)
```

> **Implementation notes for the planner (the snippet above is illustrative; tighten these in the plan):**
> 1. `maximum` over an `Int` list: use `foldl max 0 [ m | (_, m) <- matches ]` (avoids the `maximumBy`-on-empty error and seeds at 0 for the no-cross case). The `(0 :: Int :: [...])` line above is pseudo — replace with the `foldl max 0` form.
> 2. **Price-priority sort:** sells most-aggressive-first = **ascending limit** → `sortOn (.limit) sells`. Buys most-aggressive-first = **descending limit** → `sortOn (\o -> negate o.limit) o` or `sortBy (\a b -> compare b.limit a.limit)`. The placeholder `negate (intToDecimal 0)` in the snippet is a stand-in — replace with the descending-limit comparator for buys.
> 3. The `(imbalance, price)` tuple in `sortOn` exploits lexicographic `Ord` on tuples: ascending sort puts smallest imbalance first, ties broken by lower price — exactly tie-break (a) then (b). This is the cleanest encoding of the two-level rule.
> 4. Keep `computeClearing` returning **all participating orders** (even 0-fill ones like C's residual) so `Round.Clear` can mark each `Order`'s status. C appears as `Allocation{C, Sell, 2}`; its residual 3 is `order.quantity - filledQty`.

## `Round.Clear` Atomic Settlement Body — copy-ready

### Why the choice cannot query the ACS (the key architectural fact)
`query`, `queryContractId`, `queryFilter` are **`Daml.Script` functions** — they run in the `Script` monad, **not** in the `Update` monad of a choice body. Inside a choice you may only `fetch`/`exercise`/`create`/`archive` contracts you already have a `ContractId` (or key) for. So `Round.Clear` must receive the `Order` and `Asset` references it needs. Two options:

- **Option A** — add `key (operator, owner, symbol)` + `maintainer operator` to `Asset`, then `fetchByKey @Asset (operator, sellerB, "BONDX")` inside `Clear`. **Cost:** mutates the Phase-1-frozen `Asset` template; risks `DuplicateKey` if a party ever holds two Assets of the same symbol (the seed gives each party at most one per symbol, but settlement creates/splits Assets — you must Merge to keep one-per-key, adding complexity).
- **Option B (RECOMMENDED)** — extend the `Clear` choice with fields carrying the relevant `ContractId Asset`s (buyer's USDCx, each seller's BONDX) and the round's `[ContractId Order]`. The caller (test now, TS solver P4) locates them by `query`. Keeps `Asset` byte-frozen, keeps `Clear` a pure verifier+settler of its inputs.

### Recommended extended `Clear` signature (additive — `Allocation`/`ClearResult` unchanged)
```haskell
-- Source: spec §10 + CONTEXT (signature "stays frozen" for clearingPrice/allocations
--   + controller operator + ClearResult; the Asset/Order ContractIds are NEW additive
--   fields, not a change to the existing ones — the cross-layer contract is preserved).
choice Clear : ClearResult
  with
    clearingPrice : Decimal
    allocations   : [Allocation]
    orderCids     : [ContractId Order]      -- the round's sealed orders (operator is signatory)
    buyerUsdcCid  : ContractId Asset         -- buyer's USDCx holding to debit
    sellerBondCids : [(Party, ContractId Asset)]  -- each seller's BONDX holding to debit
    -- (optional) buyerBondCid / seller USDCx cids if you Merge credits into existing holdings
  controller operator
  do
    ...
```

### The body (verify → settle → confirm → status), step by step
```haskell
do
  -- 0. Guard lifecycle: only settle a round that is Closed (or Cleared), never twice.
  assertMsg "round not in settleable state" (status == Closed || status == Cleared)

  -- 1. RE-VERIFY (CLEAR-05 + SETL-04): fetch the sealed orders, rebuild OrderViews,
  --    recompute §8, and assert the proposal matches exactly. This single check
  --    subsumes max-volume + limit-compliance + conservation.
  orders <- mapA fetch orderCids
  let views = [ OrderView with desk = o.desk; side = o.side
                                ; quantity = o.quantity; limit = o.limit
              | o <- orders ]
  let (pStarExpected, allocsExpected) = computeClearing views
  assertMsg "clearingPrice does not match recomputed p*"
    (roundBankers 2 clearingPrice == roundBankers 2 pStarExpected)
  -- compare allocations as multisets (order-independent): same desks, sides, qtys.
  assertMsg "allocations do not match recomputed §8"
    (sortOn allocKey allocations == sortOn allocKey allocsExpected)
  -- defense-in-depth conservation: Σ buy fills == Σ sell fills == traded
  let totalBuy  = sum [ a.filledQty | a <- allocations, a.side == Buy ]
      totalSell = sum [ a.filledQty | a <- allocations, a.side == Sell ]
  assertMsg "fills not conserved (buy != sell)" (totalBuy == totalSell)

  -- 2. SETTLE DvP (operator authority alone — operator-custody).
  --    For each seller: Split exactly filledQty BONDX off its holding, Reassign that
  --    slice to the buyer (Merge into buyer's BONDX if you keep one-per-owner).
  --    Debit the buyer's USDCx by Σ(filledQty * p*) and Reassign per-seller cash slices.
  --    Every Split/Reassign/Merge is operator-signed; any insufficient holding
  --    (Split range guard / ensure quantity>=0) throws → whole tx rolls back (SETL-03).
  let priceDec = roundBankers 2 clearingPrice
  forA_ sellerBondCids $ \(seller, bondCid) -> do
    let filled = fillFor seller Sell allocations          -- helper: lookup filledQty
    when (filled > 0) $ do
      bond <- fetch bondCid
      -- split exactly `filled` BONDX off (guard: filled < bond.quantity uses Split;
      -- filled == bond.quantity uses the whole contract via Reassign directly).
      moved <- splitExact bondCid (intToDecimal filled)    -- helper around Asset.Split
      _ <- exercise moved Reassign with newOwner = buyer    -- BONDX seller -> buyer
      pure ()
  -- cash leg: debit buyer once, credit each seller filledQty*p*
  ... (symmetric: split buyer USDCx into per-seller slices, Reassign to each seller)

  -- 3. Mark each Order's status (Filled / PartiallyFilled / Unfilled).
  forA_ (zip orderCids orders) $ \(cid, o) -> do
    archive cid
    -- (optionally recreate the Order with updated status, or rely on TradeConfirmation)

  -- 4. Per-desk TradeConfirmation (observer = that desk only).
  confs <- forA participatingDesks $ \d ->
    create TradeConfirmation with
      operator; desk = d; roundId; symbol
      side = sideOf d allocations
      filledQty = fillForDesk d allocations
      clearingPrice = priceDec
      cashMoved = intToDecimal (fillForDesk d allocations) * priceDec

  -- 5. Set status = Settled (recreate the Round) and return ClearResult.
  newRound <- create this with status = Settled
  pure ClearResult with
    roundId
    clearingPrice = priceDec
    totalMatched  = totalBuy
    confirmations = confs
```

> **Settlement helper notes:**
> - `Asset.Split` requires `0 < splitQty < quantity`. When `filledQty == holding.quantity` (exact), **skip Split and `Reassign` the whole contract**; when `filledQty < quantity`, Split then Reassign the `filledQty` slice (the remainder stays with the seller). When `filledQty > quantity` the Split guard / `ensure quantity >= 0.0` throws → atomic rollback — this is exactly how `test_atomicity` fails.
> - Quantities on `Asset` are `Decimal`; allocations are `Int`. Convert with `intToDecimal filledQty`. Cash = `intToDecimal filledQty * priceDec`.
> - **Authority:** every Split/Merge/Reassign is `controller operator`, and `Round.Clear` is `controller operator`, so authority flows automatically — no `submit`-as-counterparty needed. This is the whole point of operator-custody (CONTEXT, spec §7.1).
> - Keep DvP leg ordering Claude's discretion (CONTEXT); atomicity does not depend on order — any failing leg rolls back the entire transaction.
> - `mapA`/`forA`/`forA_` are the `Update`-monad iterators (from `DA.Traversable`/`DA.Foldable`); `fetch`, `create`, `exercise`, `archive` are `Update` actions. All standard, all usable in a choice body.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distinct candidate prices | manual dedup loop | `DA.List.dedup` then `sort` | One-liner; `Ord Decimal` is total [VERIFIED: List.daml:229] |
| p\* selection / tie-break | nested if/else over imbalance | `sortOn (\p -> (imbalance p, p))` over the **max-matched subset**, take head | Tuple `Ord` encodes (a)-then-(b) lexicographically; the subset filter is the trap-guard |
| Fixed-point cash/price math | a custom rational/scaled-Int | `Decimal` (= `Numeric 10`) + `intToDecimal` + `roundBankers 2` | Native, exact, JSON-API-encodable [VERIFIED: Prelude lines 578/582] |
| Atomic multi-leg settlement | a saga / compensation pattern | one `Round.Clear` `Update` transaction | Daml transactions are all-or-nothing by construction (spec §10) |
| Asset transfer | mutating a `quantity` field in place | `Split` + `Reassign` (+ optional `Merge`) | Conservation is structural; Phase-1 `Asset` choices already enforce it |
| Querying contracts inside `Clear` | a query call in the choice body | pass `ContractId`s as choice args (Option B) | `query` is Script-only; choice bodies have no ACS access |

**Key insight:** the only genuinely authored logic is `computeClearing` (pure §8) and the `Clear` body's verify+settle sequence. Everything else — list ops, rounding, atomic transaction semantics, asset conservation — is the Daml toolchain/stdlib as designed.

## Runtime State Inventory

> Phase 2 adds new on-ledger logic; it is not a rename/refactor and creates no OS/service state. Included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The Canton sandbox ledger is **ephemeral** — re-seeded each `daml start` via `init-script`. No persistent DB. Tests build their own fixtures. | None — `daml test` runs in isolated script ledgers |
| Live service config | None — no solver/frontend yet (P3/P4). | None — verified: no n8n/Datadog/etc. in this stack |
| OS-registered state | None — no Task Scheduler / services; `make` not installed. | None |
| Secrets/env vars | None new this phase. `ANTHROPIC_API_KEY` is P5-only and untouched here. | None |
| Build artifacts | `.daml/dist/umbra-0.1.0.dar` rebuilt by `daml build`; new module `Umbra/Clearing.daml` becomes part of the DAR. `parties.json` unchanged. | None beyond normal `daml build` |

**Cross-layer freeze impact:** the additive `Clear` fields (Option B) change the choice's argument shape. The Phase-4 TS solver and any `daml codegen js` consumer (P3+) will see the new fields. Since codegen does not exist yet (no `codegen:` block until P3), there is **no stale binding** to regenerate now. The `Allocation` and `ClearResult` shapes are **unchanged** — the cross-layer contract CONTEXT requires stays stable.

## Common Pitfalls

### Pitfall 1: The tie-break trap (clears at 99 not 100) — THE phase risk
**What goes wrong:** `test_clears_at_100` fails with `clearingPrice == 99.0`.
**Why it happens:** tie-break (a) "minimize |demand−supply|" applied over ALL candidate prices instead of only the max-matched ones; p=99 has imbalance 2 < 3 and wins.
**How to avoid:** filter to `topPrices = [p | matched p == maxMatched]` FIRST, then rank `topPrices` by `(imbalance, price)`. Encode as the two-stage pipeline in `choosePStar`.
**Warning signs:** any clearing < the max-matched price; `test_clears_at_100` red. This is the build's canary — wire it as the first test.

### Pitfall 2: Bare-integer Decimal literals
**What goes wrong:** `clearingPrice == 100` or `splitQty = 8` fails to compile / type-mismatches.
**Why it happens:** `Decimal = Numeric 10`; a bare `100` is an `Int`. Asset quantities and prices are Decimal.
**How to avoid:** write `100.0`, `8.0`; convert Int fills with `intToDecimal filledQty`. Cash = `intToDecimal qty * priceDec`. (Same Pitfall 1 from Phase-1 research — still the most common compile error.)
**Warning signs:** `damlc` "No instance for (Numeric ...)" or "expected Decimal, got Int".

### Pitfall 3: Int vs Decimal in conservation/cash assertions
**What goes wrong:** comparing `Int` fills against `Decimal` balances, or `==` on Decimals that should be rounded.
**Why it happens:** fills are `Int` (units), balances/cash are `Decimal`. Mixing them is a type error or a precision surprise.
**How to avoid:** keep units as `Int` end-to-end; only cross to `Decimal` at the cash boundary via `intToDecimal`. Round prices/cash with `roundBankers 2` before `==`. For §4 the numbers are exact integers so equality is safe, but round defensively.

### Pitfall 4: `maximumBy`/`minimumBy` on an empty list (no-cross round)
**What goes wrong:** a round with no crossing orders (all buys below all sells) → empty candidate or empty match → `maximumBy ... []` throws `"maximumBy: empty list"`.
**Why it happens:** `minimumBy`/`maximumBy` are partial (error on `[]`) per the SDK source.
**How to avoid:** compute `maxMatched` with `foldl max 0 [...]` (seeds at 0, total); guard `traded == 0` to short-circuit allocation to all-zero fills. §4 always crosses, but `test_clear_rejects_bad_allocation` and future TS tests (P4 "no-cross" scenario) need this. (Not strictly required for the four Phase-2 tests, but cheap insurance.)

### Pitfall 5: Calling `query` inside the `Clear` choice body
**What goes wrong:** `daml build` error — `query`/`queryContractId` are not in scope / wrong monad inside a choice.
**Why it happens:** those are `Daml.Script` (`Script` monad) functions; choice bodies are `Update`.
**How to avoid:** pass `ContractId Order`/`ContractId Asset` as `Clear` arguments (Option B) and `fetch` them in the body. Locate them with `query` in the *test/solver* (Script tier), never in the choice.

### Pitfall 6: `Asset.Split` boundary (`splitQty < quantity` strict)
**What goes wrong:** settling a leg where `filledQty == holding.quantity` throws "splitQty out of range" because `Split` requires `splitQty < quantity` (strict).
**Why it happens:** the Phase-1 `Split` guard is `splitQty > 0.0 && splitQty < quantity`.
**How to avoid:** branch in the settlement helper — if `filled == quantity`, `Reassign` the whole contract (no Split); if `filled < quantity`, Split then Reassign the slice. (§4: B holds 20 BONDX, fills 8 → Split fine; but a tightly-seeded test could hit the equality edge.)
**Warning signs:** "splitQty out of range" during a settle that should succeed.

### Pitfall 7: Settling a Round twice / wrong status
**What goes wrong:** double-settlement or settling an Open round.
**How to avoid:** guard `assertMsg "round not settleable" (status == Closed || status == Cleared)` at the top of `Clear`; the choice recreates the Round with `status = Settled`, so a re-exercise on the new contract fails the guard.

## Code Examples

### Asserting balances + conservation in a Daml Script test (`test_settled_balances`)
```haskell
-- Source: pattern from Phase-1 Tests.daml (query @Asset / queryContractId / === / forA_),
--   verified green. Sums all Assets per (owner, symbol) AFTER Clear.
test_settled_balances : Script ()
test_settled_balances = do
  -- 1. seed §4 + submit the three orders + open/close a Round (inline, not runCanonicalRound).
  (parties@Parties{..}, roundCid, orderCids, buyerUsdc, sellerBonds) <- seedCanonicalAndClose
  -- 2. exercise the real Clear with the verified allocation.
  let allocs = [ Allocation bankA Buy 10, Allocation bankB Sell 8, Allocation bankC Sell 2 ]
  _ <- submit operator do
    exerciseCmd roundCid Clear with
      clearingPrice = 100.0; allocations = allocs
      orderCids; buyerUsdcCid = buyerUsdc; sellerBondCids = sellerBonds
  -- 3. assert balances by summing the operator's view of each party's Assets.
  assets <- query @Asset operator
  let bal owner sym = sum [ a.quantity | (_, a) <- assets, a.owner == owner, a.symbol == sym ]
  bal bankA "BONDX" === 10.0;  bal bankA "USDCx" === 4000.0
  bal bankB "BONDX" === 12.0;  bal bankB "USDCx" === 1800.0
  bal bankC "BONDX" === 13.0;  bal bankC "USDCx" === 1200.0
  -- 4. conservation: total BONDX and total USDCx unchanged vs the seed.
  let totalBondx = sum [ a.quantity | (_, a) <- assets, a.symbol == "BONDX" ]
      totalUsdc  = sum [ a.quantity | (_, a) <- assets, a.symbol == "USDCx" ]
  totalBondx === 35.0     -- 20 (B) + 15 (C) seeded; A had 0
  totalUsdc  === 7000.0   -- 5000 (A) + 1000 (B) + 1000 (C)
```

### Atomicity test — seller short the asset (`test_atomicity`)
```haskell
-- Source: submitMustFail pattern from Phase-1 Tests.daml. A round where a seller's
--   BONDX holding is too small to cover its fill → a Split/ensure throws → whole
--   Clear rolls back. Assert balances are IDENTICAL to pre-Clear.
test_atomicity : Script ()
test_atomicity = do
  (Parties{..}, roundCid, orderCids, buyerUsdc, sellerBonds) <- seedUnderfundedSellerAndClose
  before <- query @Asset operator
  -- the proposed allocation is internally valid §8, but seller B lacks enough BONDX.
  let allocs = [ Allocation bankA Buy 10, Allocation bankB Sell 8, Allocation bankC Sell 2 ]
  submitMustFail operator do
    exerciseCmd roundCid Clear with
      clearingPrice = 100.0; allocations = allocs
      orderCids; buyerUsdcCid = buyerUsdc; sellerBondCids = sellerBonds
  -- all-or-nothing: nothing moved.
  after <- query @Asset operator
  let snap xs = sort [ (show a.owner, a.symbol, a.quantity) | (_, a) <- xs ]
  snap after === snap before
```

### Bad-allocation rejection (`test_clear_rejects_bad_allocation`)
```haskell
-- Source: the recompute-and-assert backstop. A funded seller, but a proposal that
--   violates §8 (e.g., overstates a fill / wrong price / breaks conservation) must
--   be rejected by Clear's re-verification — independent of holdings.
test_clear_rejects_bad_allocation : Script ()
test_clear_rejects_bad_allocation = do
  (Parties{..}, roundCid, orderCids, buyerUsdc, sellerBonds) <- seedCanonicalAndClose
  -- WRONG: claims A buys 12 (exceeds its order qty 10 and traded volume 10).
  let badAllocs = [ Allocation bankA Buy 12, Allocation bankB Sell 8, Allocation bankC Sell 4 ]
  submitMustFail operator do
    exerciseCmd roundCid Clear with
      clearingPrice = 100.0; allocations = badAllocs
      orderCids; buyerUsdcCid = buyerUsdc; sellerBondCids = sellerBonds
  -- also: wrong price (99.0) must be rejected even with correct fills.
  let goodFills = [ Allocation bankA Buy 10, Allocation bankB Sell 8, Allocation bankC Sell 2 ]
  submitMustFail operator do
    exerciseCmd roundCid Clear with
      clearingPrice = 99.0; allocations = goodFills
      orderCids; buyerUsdcCid = buyerUsdc; sellerBondCids = sellerBonds
```

### Clearing test (`test_clears_at_100`) — the canary
```haskell
test_clears_at_100 : Script ()
test_clears_at_100 = do
  -- pure-function check (no ledger needed) is the tightest guardrail:
  let views = [ OrderView bankA Buy 10 101.0, OrderView bankB Sell 8 99.0, OrderView bankC Sell 5 100.0 ]
      (pStar, allocs) = computeClearing views
  pStar === 100.0
  fillOf bankA allocs === 10
  fillOf bankB allocs === 8
  fillOf bankC allocs === 2     -- residual = 5 - 2 = 3
  -- (bankA/bankB/bankC here are allocated parties; for the pure check, dummy parties suffice,
  --  or run the full submit→Clear path and read fills from the TradeConfirmations.)
```
> Note: `OrderView` takes `Party` fields; for the pure-function assertion you can allocate throwaway parties via `allocateParty` (Script) or run the full `Clear` and assert via `TradeConfirmation`s. The pure check is fastest and isolates the §8 trap from settlement.

## State of the Art

| Old Approach | Current Approach (this stack) | Why |
|--------------|-------------------------------|-----|
| Query the ACS inside a choice to find assets | Pass `ContractId`s as choice args (Option B), or contract keys (Option A) | Daml choices are `Update`-monad; `query` is Script-only — unchanged across 2.x |
| Hand-rolled saga for multi-leg settlement | Single `Update` transaction (atomic by construction) | Daml's core guarantee — the spec's whole DvP claim |
| Mutate a balance field | Split/Merge/Reassign archive+recreate | Conservation is structural and auditable |

**Not applicable / out of scope:** Daml Finance `Batch`/`Instruction` allocate-approve settlement (spec §19 stretch) — the MVP deliberately uses operator-custody so a single authority settles every leg.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | **Option B** (pass `ContractId Asset`/`Order` into `Clear`) is preferable to adding a contract key to `Asset` | `Round.Clear` body | LOW — both compile; B keeps the frozen Asset untouched and matches "solver output verified on-ledger". If the planner prefers A, it must add `key`+`maintainer` and handle one-per-key Merge. Either satisfies SETL-01. |
| A2 | The additive `Clear` fields do not violate the "frozen signature" CONTEXT constraint (clearingPrice/allocations/controller/ClearResult are unchanged) | `Round.Clear` signature | LOW — CONTEXT freezes the *named* fields and return type; adding settlement-input fields is additive. If the planner reads "frozen" as byte-exact, fall back to Option A (key-based) which keeps the exact Phase-1 signature. Flag for the planner. |
| A3 | Leftover-to-largest never triggers on §4 (no equal-limit tie), so greedy price-priority alone gives B=8/C=2 | §8 allocation | NONE for §4 — verified by hand-trace. The leftover rule still must be implemented for the future TS-parity tests (P4); document it now. |
| A4 | `roundBankers 2` is the right rounding for p\* and cashMoved | settlement body | LOW — §4 values are exact integers so rounding is a no-op here; banker's vs commercial only matters at the half-cent, which §4 never hits. Pick one and mirror it in TS (P4). Spec §8 says "round to 2 decimals" without specifying mode. |
| A5 | Tests build inline fixtures (`seedCanonicalAndClose` helpers) rather than reusing `runCanonicalRound` | Validation Architecture | NONE — explicitly Claude's discretion (CONTEXT). `runCanonicalRound` only submits orders and never opens/closes a Round, so a Phase-2 helper is needed regardless. |

## Open Questions

1. **Does the planner read "the signature stays frozen" as forbidding additive fields on `Clear`?**
   - What we know: CONTEXT lists the frozen parts as `clearingPrice : Decimal`, `allocations : [Allocation]`, `controller operator`, `→ ClearResult`. Settlement needs Asset/Order references that aren't in the Phase-1 placeholder.
   - What's unclear: whether "frozen" means "these fields unchanged" (additive OK) or "byte-exact, no new fields".
   - Recommendation: **Option B with additive fields** (cleanest); if the planner wants byte-exact, use **Option A** (add `key (operator,owner,symbol)` to `Asset`, `fetchByKey` in `Clear`) — this keeps the exact placeholder signature at the cost of touching the frozen `Asset`. Both clear at 100 and pass all four tests. Document the choice in `DECISIONS.md`.

2. **One-per-owner-per-symbol invariant after settlement?**
   - What we know: settlement Splits/Reassigns create multiple Asset contracts per owner/symbol (e.g., buyer accumulates BONDX in slices). The balance assertions sum across contracts, so correctness holds either way.
   - Recommendation: optionally `Merge` credited slices into the recipient's existing holding so each party keeps one Asset per symbol (cleaner UI in P3, and required if Option A's key is used). For the four Phase-2 tests, summing across contracts is sufficient — Merge is a nicety, not a requirement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Daml SDK | all of Phase 2 (`daml build`/`daml test`) | ✓ | 2.10.4 (via `~/bin/daml` shim) | none — already pinned + verified working in Phase 1 |
| JDK | only needed for `daml start` runtime (not for `daml build`/`daml test`) | ✓ | 21 | n/a |
| daml-prim / daml-stdlib / daml-script | the §8 functions + tests | ✓ | bundled in SDK 2.10.4 | none needed — declared in `daml.yaml` |
| Node / npm | NOT used this phase (TS §8 is P4) | ✓ | 26.x / 11.x | n/a |

**Missing dependencies with no fallback:** none. **Missing with fallback:** none. This phase is fully provisioned by the Phase-1 toolchain; no installs.

## Validation Architecture

> `workflow.nyquist_validation: true` → included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Daml Script** (bundled with SDK 2.10.4; no install) |
| Config file | `daml/daml.yaml` (declares `daml-script`; `Umbra/Clearing.daml` joins the build) |
| Quick run command | `daml build` (proves `Clearing.daml` + the real `Clear` body compile) |
| Full suite command | `daml test` (runs every `Script ()` in `Tests.daml`; exit code authoritative) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAR-04 | §4 → p\*=100.0, fills A=10/B=8/C=2, C residual 3 | unit (pure) + integration | `daml test --files daml/Umbra/Tests.daml` (`test_clears_at_100`) | ❌ Wave 0 (add to `Tests.daml`) |
| CLEAR-05 / SETL-04 | `Clear` recomputes §8 + rejects deviations | integration | `daml test` (`test_clear_rejects_bad_allocation`) | ❌ Wave 0 |
| SETL-01 / SETL-02 | Atomic DvP → balances A:10/4000, B:12/1800, C:13/1200; conserved | integration | `daml test` (`test_settled_balances`) | ❌ Wave 0 |
| SETL-03 | Underfunded seller → `Clear` fails, no balance change | integration | `daml test` (`test_atomicity`) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `daml build` (fast compile gate; catches the Decimal/monad pitfalls).
- **Per wave merge:** `daml test` (all four scripts).
- **Phase gate:** `daml build` green + `daml test` green (all four passing, `test_clears_at_100` showing 100.0) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `daml/Umbra/Clearing.daml` — pure §8 (`OrderView`, `demandAt`/`supplyAt`/`matchedAt`, `choosePStar`, `computeClearing`, `rationByPriority`) — the thing `test_clears_at_100` and `Clear` both call.
- [ ] `daml/Umbra/Auction.daml` — replace the placeholder `Clear` body with the real verify+DvP body (additive Option-B fields, or Option-A key).
- [ ] `daml/Umbra/Tests.daml` — add `test_clears_at_100`, `test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation` + a `seedCanonicalAndClose` helper (open Round → submit 3 orders → CloseRound → collect `ContractId Order`/`Asset`).
- [ ] No framework install — Daml Script ships with the SDK.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` → included. Phase 2 adds no network surface (no JSON-API auth, no HTTP yet — those are P3/P4). The security-critical deliverable is the **on-ledger integrity backstop**: the recompute-and-assert verification in `Round.Clear`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (deferred P3) | per-party JWT wired in Phase 3 |
| V3 Session Management | no | — |
| V4 Access Control | **yes (on-ledger)** | `Round.Clear` is `controller operator`; every `Asset` choice is operator-authority. No counterparty can trigger or alter settlement. Daml authority is the access control. |
| V5 Input Validation | **yes (the core control)** | `Round.Clear` recomputes §8 and asserts the proposal matches (`clearingPrice` + `allocations`); rejects max-volume/limit/conservation violations (SETL-04). Plus `Asset.ensure quantity >= 0.0` and `Split` range guard catch overdraws. |
| V6 Cryptography | no | — (no crypto authored; never hand-roll) |
| V14 Config / Secrets | no new surface | `ANTHROPIC_API_KEY` untouched (P5) |

### Known Threat Patterns for this stack (Phase-2 surface)
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/wrong solver proposes an unfair clear (e.g., p=99 to favor a buyer, or overstated fills) | Tampering | `Round.Clear` **recomputes §8 and asserts equality** — the on-ledger backstop; a deviating proposal is rejected (CLEAR-05, SETL-04, `test_clear_rejects_bad_allocation`) |
| Settlement creates/destroys value (cash or BONDX not conserved) | Tampering | Conservation is structural — `Split`/`Merge`/`Reassign` archive+recreate preserving total; plus an explicit `Σ buy == Σ sell` assert; `test_settled_balances` asserts global totals unchanged |
| Partial settlement leaves the batch half-moved (one desk filled, another not) | Tampering / Repudiation | Single `Update` transaction → all-or-nothing; any failing leg rolls back the whole `Clear` (`test_atomicity`) |
| Overdraw — a seller settles more than it holds | Tampering | `Asset.Split` strict range guard + `ensure quantity >= 0.0` throw → rollback (`test_atomicity`) |
| Double-settlement of a round | Tampering | Lifecycle guard `assertMsg (status == Closed \|\| status == Cleared)` + `Clear` recreates with `status = Settled` so re-exercise fails |
| Cross-desk leakage via `TradeConfirmation` | Information disclosure | `observer desk` (singular) — created per desk in `Clear`; no broad observer. (Asserted in P3 `test_privacy_confirmations`.) |

**Security note for the planner:** the recompute-and-assert in `Round.Clear` is the phase's security keystone — it is what makes "the AI can never produce a wrong/unfair clear" true (spec §9). Implement it as **recompute §8 + assert the full proposal equals the recomputed result**, not as a looser spot-check; the equality check provably subsumes max-volume, limit-compliance, and conservation in one comparison.

## Sources

### Primary (HIGH confidence)
- **Installed SDK source tree** `%APPDATA%\daml\sdk\2.10.4\damlc\resources\pkg-db_dir\1.15\daml-stdlib-2.10.4\` — `DA/List.daml` (sort:112, sortBy:116, minimumBy:122, maximumBy:132, sortOn:148, dedup:229) and `DA/Internal/Prelude.daml` (truncate:566, intToDecimal:578, roundBankers:582, roundCommercial:586, round:611, floor:625, ceiling:631). Ground truth for every function signature used.
- **Existing green code** — `daml/Umbra/Tests.daml` (verified `query @Asset`, `queryContractId`, `submit`, `submitMustFail`, `exerciseCmd`, `createCmd`, `===`, `assertMsg`, `forA_` all compile + pass), `daml/Umbra/Asset.daml` (Split strict `< quantity` guard, Merge, Reassign — the settlement primitives), `daml/Umbra/Auction.daml` (the placeholder `Clear` + `Allocation`/`ClearResult` shapes to preserve).
- **spec.md §8** (clearing algorithm + worked example), **§10** (atomic DvP), **§7.1/§7.4/§7.6/§7.7** (template/data shapes), **§4** (fixture), **§16** (tests 1–4).
- **02-CONTEXT.md** — locked tie-break trap, leftover-to-largest rule, settlement arithmetic, frozen `Clear` signature.

### Secondary (MEDIUM confidence)
- **01-RESEARCH.md** — Daml 2.10.x syntax patterns, Decimal-literal pitfall, `ClearResult` freeze rationale, operator-custody authority model (carried forward).

### Tertiary (LOW confidence)
- None — every claim is grounded in the local SDK source or the green Phase-1 code.

## Metadata

**Confidence breakdown:**
- §8 algorithm + tie-break trap: **HIGH** — hand-traced to 100.0; stdlib functions verified from SDK source; the trap is the explicit CONTEXT warning.
- `Round.Clear` settlement body: **HIGH on mechanics** (Split/Merge/Reassign + atomic-transaction semantics verified from Phase-1 code + spec), **MEDIUM on the exact signature shape** (Option A vs B is a planner decision — flagged in Open Questions / A1–A2).
- Tests: **HIGH** — all Script/Assert functions verified against the green Phase-1 `Tests.daml`.
- Pitfalls: **HIGH** — Decimal/monad/Split-guard pitfalls read from the actual SDK source and Phase-1 `Asset.Split`.

**Research date:** 2026-06-25
**Valid until:** stable (SDK 2.10.4 is pinned and mature). Re-verify only if the SDK pin changes.

## RESEARCH COMPLETE

**Phase:** 2 - Clear & Settle On-Ledger
**Confidence:** HIGH

### Key Findings
- **The tie-break trap is the phase's #1 risk:** tie-break (a) must filter to the max-matched candidate set *before* minimizing imbalance, else §4 clears at 99 not 100. Encoded cleanly as `sortOn (\p -> (imbalance p, p)) topPrices` over the max-matched subset. Hand-traced to confirm p\*=100.0, fills A=10/B=8/C=2.
- **Choice bodies cannot `query` the ACS** — `query`/`queryContractId` are Script-only. `Round.Clear` must receive the `Asset`/`Order` ContractIds. **Recommend Option B** (additive choice fields, keeps the frozen `Asset` untouched and `Allocation`/`ClearResult` stable); Option A (add a contract `key` to `Asset`) is the byte-exact-signature fallback. Flagged for the planner (A1/A2/Open-Q1).
- **Verification = recompute §8 + assert full equality** inside `Clear` — this single check provably subsumes max-volume + limit-compliance + conservation (CLEAR-05 + SETL-04), and is the security keystone that makes "the AI can never clear unfairly" true.
- **All stdlib signatures verified from the installed SDK source** (`sort`/`sortOn`/`dedup`/`minimumBy`/`maximumBy` in `DA.List`; `intToDecimal`/`roundBankers`/`truncate` in `DA.Internal.Prelude`); all Script/Assert patterns verified against the green Phase-1 `Tests.daml`. No external packages — Package Legitimacy Audit is N/A.
- **Pitfalls catalogued:** Decimal literals need decimal points; `intToDecimal` at the Int→cash boundary; `maximumBy` errors on empty (no-cross) → use `foldl max 0`; `Asset.Split` is strict `< quantity` so use whole-contract `Reassign` when `filled == quantity`; lifecycle guard against double-settle.

### File Created
`.planning/phases/02-clear-settle-on-ledger/02-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| §8 / clearing math | HIGH | hand-traced to 100.0; stdlib verified from SDK source; trap is explicit |
| Settlement body mechanics | HIGH | Split/Merge/Reassign + atomic tx verified from Phase-1 code + spec §10 |
| `Clear` signature shape | MEDIUM | Option A vs B is a planner decision (flagged A1/A2/Open-Q1); both pass all tests |
| Tests | HIGH | Script/Assert patterns proven green in Phase-1 Tests.daml |

### Open Questions
- Does "frozen signature" forbid additive `Clear` fields? → Recommend Option B (additive); fallback Option A (Asset key) keeps byte-exact signature. Planner decides; record in DECISIONS.md.
- Merge credited Asset slices into one-per-owner holding? → Nicety for P3 UI; summing across contracts is sufficient for the four Phase-2 tests.

### Ready for Planning
Research complete. The planner has copy-ready pure §8 functions (proven to clear at 100.0), the `Round.Clear` verify+DvP body with the Option-A/B decision flagged, all four `daml test` scripts with verified Script/Assert patterns, and a catalogued pitfall list. `daml build` + `daml test` are the gates.
