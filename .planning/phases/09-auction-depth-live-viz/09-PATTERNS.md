# Phase 9: Auction Depth & Live Viz - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 20 (14 modified · 6 new)
**Analogs found:** 20 / 20 (every new/modified file has an in-repo analog — this is a strictly additive extension of shipped code)

> ## TWO NON-NEGOTIABLE DISCIPLINES (read before any edit)
>
> **1. CLEAR-05 Daml⇄TS parity.** `daml/Umbra/Clearing.daml` and `solver/src/auction.ts` MUST produce
> byte-identical `(price, allocations)` from identical `OrderView[]`. `Round.Clear` recomputes via
> `computeClearing` and asserts `proposal == recompute` — **any rule present in `auction.ts` but absent
> from (or divergent in) `Clearing.daml` cannot settle** (silent settlement failure) AND breaks the
> golden parity fixtures. **Land the Daml and TS halves of every clearing change in the SAME commit.**
>
> **2. Additive Optional-at-end fields (Daml 3.x SCU).** New template/record/`OrderView` fields must be
> `Optional` and appended, so upgrades read `None`. **Daml has NO field-level defaults** — every
> construction site (`OrderView with …`, `Order with …`, `SubmitOrder`, seeds, tests, the `@daml.js`
> exercise) must be edited to pass the new field explicitly, even for the `Limit` default. "Additive"
> means the serialization/upgrade contract + §4 semantics survive, NOT that literals are untouched.
> Grep every `OrderView with` / `Order with` / `create Order` / `SubmitOrder` site when adding a field
> (Pitfall 5). After ANY `Auction/Roles/Clearing` edit: `daml codegen js` → `web/daml.js` and **commit it**.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `daml/Umbra/Clearing.daml` | model (pure math leaf) | transform (batch clear) | itself (extend `computeClearing`/`choosePStar`/`rationByPriority`) | exact (in-place) |
| `daml/Umbra/Auction.daml` | model (template) | event-driven (choice) | itself (`Order`, `Round.Clear`, `TradeConfirmation`) | exact (in-place) |
| `daml/Umbra/Roles.daml` | route (choice) | request-response | `Venue.SubmitOrder` (self) | exact (in-place) |
| `daml/Umbra/Setup.daml` | config (seed) | batch | `initialize`/`seedOpenRound`/`runCanonicalRound` (self) | exact (in-place) |
| `daml/Umbra/Tests.daml` | test | transform | `test_clears_at_100` (self) | exact (in-place) |
| `solver/src/auction.ts` | service (pure mirror) | transform | itself (1:1 mirror of Clearing.daml) | exact (in-place) |
| `solver/src/ledger.ts` | service (ledger client) | CRUD/request-response | `readSealedOrders`/`readTradeConfirmations` (self) | exact (in-place) |
| `solver/src/api.ts` | controller (HTTP) | request-response | `GET /round/:id` + `buildCurve` (self) | exact (in-place) |
| `solver/src/auction.test.ts` | test | transform | 5 §8 golden scenarios (self) | exact (extend) |
| `web/src/components/OrderTicket.tsx` | component | request-response | itself (side toggle + qty/limit inputs + `SubmitOrder`) | exact (in-place) |
| `web/src/components/CrossingChart.tsx` | component | streaming (live curve) | itself (prop-driven SVG) | exact (in-place) |
| `web/src/lib/curve.ts` | utility (pure) | transform | itself (`sx`/`sy`/`crossingPoint`) | exact (reuse) |
| `web/src/views/TheatreView.tsx` | component (view) | streaming | shipped running-stage right column (self) | exact (in-place) |
| `web/src/views/SettlementView.tsx` | component (view) | request-response | shipped post-settle block + `ProofPackButton` (self) | exact (in-place) |
| `web/daml.js/` (generated) | config (bindings) | — | `daml codegen js` output (commit 6e4bade) | exact (regen) |
| **NEW** `RULEBOOK.md` | doc | — | (no analog — new sovereign doc; cites both planes' symbols) | none |
| **NEW** `web/src/lib/leakage.ts` | utility (pure client sim) | transform | `web/src/lib/balance.ts` + `curve.ts` (pure-fn style) | role-match |
| **NEW** `web/src/lib/leakage.test.ts` | test | transform | `web/src/lib/balance.test.ts` / `curve.test.ts` | role-match |
| **NEW** Daml `test_noncomp_*`/`test_maq_*`/`test_conditional_*`/`test_surplus_nonneg` | test | transform | `test_clears_at_100` (self) | exact (clone) |
| **NEW** solver `api.test.ts` indicative cases | test | request-response | existing `api.test.ts` (self) | exact (extend) |

## Pattern Assignments

### `daml/Umbra/Clearing.daml` (pure math leaf — the §8 core)

**Analog:** itself. All new clearing math lives HERE inside `computeClearing`; `Round.Clear` re-verifies it.

**Data model to extend** (lines 45-50, add Optional-appended fields):
```daml
data OrderView = OrderView with
    desk     : Party
    side     : Side
    quantity : Int
    limit    : Decimal          -- keep Decimal; use effective-limit for Noncompetitive (smaller blast radius)
  deriving (Eq, Show)
-- ADD (appended): orderType : OrderType ; minQty : Optional Int ; firmIf : Optional Decimal
-- ADD: data OrderType = Limit | Noncompetitive | AllOrNone | Conditional deriving (Eq, Show)
```

**demandAt / supplyAt** — the noncompetitive "any price" lift (lines 59-66):
```daml
demandAt orders p = sum [ o.quantity | o <- orders, isBuy o, o.limit >= p ]
supplyAt orders p = sum [ o.quantity | o <- orders, isSell o, o.limit <= p ]
-- Noncompetitive: OR (orderType==Noncompetitive) into the predicate (willing at ANY price).
```

**choosePStar — the LOAD-BEARING trap guard** (lines 87-101) — MUST be preserved when generalizing:
```daml
maxMatched = foldl max 0 [ m | (_, m) <- matches ]   -- NOT maximumBy (empty-safe)
topPrices  = [ p | (p, m) <- matches, m == maxMatched ]   -- filter to max-matched FIRST
ranked     = sortOn (\p -> (abs (demandAt orders p - supplyAt orders p), p)) topPrices
-- Applying imbalance across ALL prices → §4 clears at 99 not 100. Anti-pattern; regression-tested.
```

**rationByPriority — top-level recursion (Daml-LF forbids local recursion)** (lines 115-119). New noncompetitive-first sort key: `(orderType /= Noncompetitive, negate limit)` — Bool `False < True` sorts noncomp first; **in TS map the Bool to `0/1`** (Pitfall 6).

**computeClearing — becomes a TWO-PASS wrapper over an extracted `coreClear`** (lines 126-139):
```daml
-- PASS 1: provisional clear over firm (non-conditional) orders → provP
-- PASS 2: firm the conditionals whose firmIf qualifies vs provP, then coreClear (firm ++ firmed)
-- coreClear = today's candidate-price select + noncomp priority + AON/MAQ enumeration + rationing.
-- §4 reduction: no conditionals → firmed=[] → one coreClear = today's behavior → $100.00.
```
AON/MAQ: bounded powerset (`2^k`, k tiny) over the AON set as a **top-level recursive helper**; per `(p, subset)` include only if each member's integer fill ≥ `minQty`, then same `(volume, imbalance, price)` tie-break.

---

### `solver/src/auction.ts` (byte-identical TS mirror)

**Analog:** itself — mirror EVERY Clearing.daml change function-for-function in the same commit.

**Mirror map (Daml symbol → TS symbol), all already 1:1:**
| Clearing.daml | auction.ts | Note |
|---|---|---|
| `data OrderView` L45-50 | `interface OrderView` L22-27 | append `orderType`/`minQty`/`firmIf` here too |
| `data OrderType` (new) | `type OrderType = ...` (new) | string-literal union |
| `demandAt`/`supplyAt` L59-66 | `demandAt`/`supplyAt` L46-51 | OR noncomp predicate |
| `choosePStar` + `topPrices` L87-101 | `choosePStar` + `topPrices` L64-79 | trap guard already mirrored |
| `rationByPriority` L115-119 | `rationByPriority` L87-99 | sort-key Bool → `0/1` in TS (Pitfall 6) |
| `computeClearing` L126-139 | `computeClearing` L105-122 | two-pass wrapper both sides |
| `roundBankers 2` L184 | `Math.round(pStar*100)/100` L121 | 2-dp parity contract |

---

### `daml/Umbra/Auction.daml` (templates + on-ledger re-verify)

**Analog:** itself.

**`Order` template — append Optional fields + extend `ensure`** (lines 59-70):
```daml
template Order with
    operator : Party; desk : Party; roundId : Text
    side : Side; quantity : Int; limit : Decimal; status : OrderStatus
    -- ADD appended: orderType : OrderType ; minQty : Optional Int ; firmIf : Optional Decimal
  where
    signatory operator, desk
    ensure quantity > 0 && limit > 0.0
    -- ADD guards: MAQ → optional True (\m -> m >= 1 && m <= quantity) minQty ; Conditional → optional True (> 0.0) firmIf
```

**`Round.Clear` OrderView build — the coupling point** (lines 175-188). Pass the new fields into the view; the recompute + assert shape is UNCHANGED (it auto-covers every new rule because it calls `computeClearing`):
```daml
let views = [ OrderView with desk = o.desk; side = o.side; quantity = o.quantity; limit = o.limit
                -- ADD: orderType = o.orderType; minQty = o.minQty; firmIf = o.firmIf
            | o <- orders ]
let (pStarExpected, allocsExpected) = computeClearing views
assertMsg "clearingPrice does not match recomputed §8 p*" (roundBankers 2 clearingPrice == roundBankers 2 pStarExpected)
let allocKey a = (show a.desk, show a.side, a.filledQty)   -- REUSE this multiset comparator; do not hand-roll
assertMsg "allocations do not match recomputed §8" (sortOn allocKey allocations == sortOn allocKey allocsExpected)
```

**`TradeConfirmation` — append TCA fields** (lines 85-98) and compute at the per-desk `create` site (lines 262-271):
```daml
-- APPEND: ownLimit : Optional Decimal ; referencePrice : Decimal
--         surplusVsLimit : Decimal ; improvementVsLimitBp : Decimal ; improvementVsReferenceBp : Decimal (signed)
-- surplusVsLimit: Buy → (limit - p*) * filledQty ; Sell → (p* - limit) * filledQty  (structurally ≥ 0)
-- ADD the on-ledger proof: assertMsg "execution at least as good as limit (surplusVsLimit >= 0)" (surplusVsLimit >= 0.0)
-- referencePrice: pass into Clear as a choice arg (a choice body can't read config) — mirror the Option-B
--   "pass cids in" pattern at lines 154-161. Clearly a STUB (≈ 100).
```
**Single-funded-buyer invariant stays** (lines 206-209, `abort` on != 1 buyer). Keep new-order-type SETTLE demos single-buyer (Pitfall 3) — put noncomp/conditional on the sell side.

---

### `daml/Umbra/Roles.daml` — `Venue.SubmitOrder` (lines 18-30)

Append the new args and thread them into `create Order`:
```daml
nonconsuming choice SubmitOrder : ContractId Order
  with desk : Party; roundId : Text; side : Side; quantity : Int; limit : Decimal
    -- ADD: orderType : OrderType ; minQty : Optional Int ; firmIf : Optional Decimal
  controller desk
  do
    assertMsg "desk not registered" (desk `elem` desks)
    create Order with operator; desk; roundId; side; quantity; limit; status = Sealed
      -- ADD: orderType; minQty; firmIf
```

---

### `daml/Umbra/Setup.daml` + `Tests.daml` — construction sites (Pitfall 5)

Every §4 literal must gain the new fields at the `Limit` default; **§4 assertions stay $100.00 / A=10 / B=8 / C=2**.
- `Setup.daml` `SubmitOrder` calls: lines 85-91 (`runCanonicalRound`), 129-135 (`seedOpenRound`).
- `Tests.daml` `test_clears_at_100` OrderView literals (lines 101-103) — the canary; add `orderType = Limit; minQty = None; firmIf = None`.
- `Tests.daml` `SubmitOrder` calls: 179-185, 349-355.
- **Clone `test_clears_at_100` (lines 91-110) as the template** for new `test_noncomp_*`/`test_maq_*`/`test_conditional_*`/`test_surplus_nonneg` fixtures — same shape, new expected numbers.

---

### `solver/src/ledger.ts` — read mapping + wire encoding

- **`readSealedOrders`** (lines 224-237): add `orderType`/`minQty`/`firmIf` to the `view` mapping; Optionals decode from the v2 wire (null → `None`). Numbers come back as STRINGS → `Number()` (existing pattern, lines 234-235).
- **`readTradeConfirmations`** (lines 240-250): map the new TCA fields (`ownLimit`, `referencePrice`, `surplusVsLimit`, bp fields).
- **`settle`** (lines 298-364) and **`tamperClear`** (lines 381-460): the Clear exercise arg shape gains `referencePrice` (choice arg); otherwise structurally unchanged. `settle` stays byte-unchanged except the added arg.

---

### `solver/src/api.ts` — aggregate feed (AUCT-03) + receipt surface (AUCT-04)

**Analog:** the `GET /round/:id` body assembly (lines 225-299) and `buildCurve` (lines 182-190).

**AUCT-03 — add an `indicative` block ONLY when `status === 'Open'` and `sealedOrderCount >= 1`** (mirror the terminal-status attach at line 242, but for the OPEN state). Scalars only, reusing deps already wired (lines 116-121):
```ts
// indicativePrice = choosePStar(views) ; netImbalance = Σbuyqty − Σsellqty ; estMatched = matchedAt(views, indicativePrice)
// SMALL-N GUARD: publish exact indicativePrice only if ≥2 orders on the crossing side, else { coarse:true, band }.
// DO NOT return `curve`/candidatePrices during OPEN (each candidate price = an individual limit — Pitfall 1).
```
`buildCurve` (line 253) stays served ONLY at terminal status — keep it that way.

**AUCT-04:** surface the new `TradeConfirmation` fields on the settled body (extend the confs mapping at lines 270-283).

---

### `web/src/components/OrderTicket.tsx` (AUCT-01 entry UI)

**Analog:** itself — the side toggle (`sideBtn`, lines 139-159), qty/limit inputs (lines 244-292), and the `SubmitOrder` exercise (lines 113-119).

- **Order-type segmented selector** reuses the `sideBtn` grammar (active = ink, mono `9` `.16em`) — segments `LIMIT·NONCOMP·MAQ·COND`.
- Per-type param fields (min-qty, firm-if) render at the **1px assist tier** (vs the `44px` primary inputs) — mirror the WOW-03 NL sub-block convention (lines 173-233).
- **`loadDemo` (lines 69-74) stays plain Limit**; the `SubmitOrder` exercise (lines 113-119) appends `orderType`/`minQty`/`firmIf` (Optionals as `null`/values). **Regenerate `web/daml.js` first** or the new fields silently drop (Pitfall 4). Import path pattern: `@daml.js/umbra-0.1.0/lib/Umbra/{Auction,Roles,Clearing}/module` (lines 16-18).

---

### `web/src/components/CrossingChart.tsx` + `web/src/lib/curve.ts` (VIZ-01)

**Analog:** the shipped prop-driven SVG (`function CrossingChart({ curve, clearingPrice, matchedVolume })`, line 49; `crossingPoint` at line 54).

- Add an `assembling | locked` mode **prop**. Assembling: coarse-bin/guarded step curves, faint lime region, **NO red p\* rule/marker** (red reserved for locked). Locked: the shipped solved state is **byte-unchanged** — red rule + `circle r5` at `crossingPoint(...)` = `(296,160)` for §4.
- **`web/src/lib/curve.ts` is REUSED UNCHANGED** — `sx`/`sy`/`crossingPoint` and the binding `CROSSING_MARKER {x:296,y:160}` (line 32) + `curve.test.ts` assertion must still hold. Do NOT introduce a chart lib (violates the binding comp).

---

### `web/src/views/SettlementView.tsx` (AUCT-04 receipt + WOW-06 sim)

**Analog:** the shipped post-settle gating (`const settled = phase === 'settled'`, line 150) and `ProofPackButton` (line 229).

- TCA receipt block renders only when `settled`; `EXPORT RECEIPT ↓` reuses the `.umbra-ink-ghost` grammar (like `ProofPackButton`). Two DISTINCT surplus rows: vs-LIMIT (ink, proven, never red) vs vs-REFERENCE (lighter, may be `#E2231A` red).
- WOW-06 sim panel: dashed border + `SIMULATION` tag, below the receipts.

---

### `web/src/lib/leakage.ts` (NEW, WOW-06) — pure client-side sim

**Analog:** `web/src/lib/balance.ts` (lines 1-30) and `web/src/lib/curve.ts` — the established "PURE, DOM-free, no I/O, unit-testable, pure-fn style of solver/src/auction.ts" leaf-lib convention.
```ts
// Input: settled per-desk receipt numbers (qty, ownLimit, clearingPrice) — NO ledger/solver dependency.
// Model: walk aggressive side sequentially through a naive public book (slippage + front-run markup) →
//   $lost = Σ (executionPrice − uniformClear) * qty. Umbra sealed clear → $0 leaked. Deterministic.
// import type { Allocation } from '../solver'  (mirror balance.ts line 14)
```
Test analog: `web/src/lib/balance.test.ts` / `curve.test.ts` → new `leakage.test.ts` (`cd web && npx vitest run leakage.test.ts`).

## Shared Patterns

### On-ledger re-verification (verify-don't-trust) — THE keystone
**Source:** `daml/Umbra/Auction.daml` `Round.Clear` lines 175-192.
**Apply to:** every AUCT-01/02 rule. The recompute-and-assert (`computeClearing views == proposal`) already
subsumes max-volume + per-order limit-compliance + conservation. **Do NOT add a bespoke "check the new
order types" pass — extend the pure `computeClearing`, and the existing assert covers it for free.**

### Multiset allocation equality — reuse, don't hand-roll
**Source:** `Auction.daml` lines 186-188 (`sortOn allocKey`) ⇄ `auction.ts` allocation compare / agent.ts Map keying.
**Apply to:** any new allocation comparison in tests or asserts.

### 2-dp price equality (parity contract)
**Source:** `Auction.daml` `roundBankers 2` (line 184) ⇄ `auction.ts` `Math.round(p*100)/100` (line 121).
**Apply to:** all new price comparisons in both planes and every golden fixture.

### Golden §4 canary — the continuous guard
**Source:** `daml/Umbra/Tests.daml::test_clears_at_100` (lines 91-110) ⇄ `solver/src/auction.test.ts` scenario 1
(and scenario 5 = the 99-vs-100 trap regression). **Apply to:** run after EVERY change; each new order type
gets a matching fixture in BOTH planes with identical expected numbers.

### Pure DOM-free leaf-lib style
**Source:** `web/src/lib/balance.ts` / `curve.ts` / `solver/src/auction.ts`.
**Apply to:** the new `web/src/lib/leakage.ts` (no React/DOM/I-O; Vitest-tested).

### Secret-free HTTP envelope + scoped CORS
**Source:** `solver/src/api.ts` `createApp(deps)` — `cors({ origin: ALLOWED_ORIGIN })` (line 196), `ApiError`, `wrap`.
**Apply to:** the AUCT-03 indicative block (same `wrap`/`ApiError`; no new middleware).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `RULEBOOK.md` (new) | doc | — | No prior rulebook doc exists. New sovereign-grade doc; must cite the EXACT function/symbol in BOTH `Clearing.daml` and `auction.ts` per rule so the doc and code cannot drift. The golden-eval suite is its enforcement. Use `DECISIONS.md`/`spec.md` §8 tone as the register model. |

## Metadata

**Analog search scope:** `daml/Umbra/` (all 6 modules), `solver/src/` (auction, ledger, api + tests),
`web/src/` (components, lib, views).
**Files scanned:** 20 read in full or targeted; `computeClearing`/`Round.Clear`/`auction.ts` read complete.
**Pattern extraction date:** 2026-07-09
```
