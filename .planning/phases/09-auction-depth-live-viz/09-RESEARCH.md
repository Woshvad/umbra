# Phase 9: Auction Depth & Live Viz — Research

**Researched:** 2026-07-09
**Domain:** Extending a correctness-critical uniform-price batch-clearing core (Daml 3.4 + TS mirror) additively — new institutional order types, a privacy-safe aggregate feed, live crossing viz, and best-ex receipts — WITHOUT breaking the on-ledger settlement invariant or the §4 golden fixture ($100.00 / A=10 / B=8 / C=2).
**Confidence:** HIGH (the entire correctness core, tests, solver surface, and both frontend data planes were read directly from the repo this session; the one external claim — Daml 3.x additive-field upgrade rules — is cited from official docs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Order-Type Model (AUCT-01) — extends the frozen `Order` template ADDITIVELY**
- Extend `Order` (Auction.daml) and `OrderView` (Clearing.daml) with an OPTIONAL `orderType` discriminator + its params, DEFAULTING to `Limit`. The §4 canonical orders are plain Limits → their serialization and the whole clearing reduce to the existing §8 → still $100.00 / A=10 / B=8 / C=2. Existing field names (`desk, side, quantity, limit`) are preserved; new fields are additive/`Optional` so v1 tests and the frozen data contract still hold.
- Four order types: **Limit** (existing); **Noncompetitive** (side, qty, NO limit — always willing at the clearing price); **AllOrNone / MAQ** (side, qty, limit, `minQty`; participates only if its integer fill ≥ `minQty`; all-or-none = special case `minQty == qty`); **Conditional / auto-firming** (side, qty, limit, `firmIf` price band — buy firms if clearing ≤ threshold, sell firms if clearing ≥ threshold; firms or drops deterministically at close).

**Clearing Rulebook (AUCT-02) — deterministic core, mirrored in TS + re-verified on-ledger**
- Objective IN ORDER: (1) maximize matched volume; (2) among max-matched candidate prices, minimize |demand − supply|; (3) lower price. Then ration the long side by price priority (noncompetitive first) then pro-rata at the marginal price (deterministic leftover-to-largest). Generalizes `choosePStar` + `rationByPriority`; the max-matched-subset tie-break TRAP guard (filter to top-matched prices BEFORE the imbalance/price rank) MUST be preserved.
- **Noncompetitive** contributes to demand/supply at ANY price, allocated top priority (before competitive orders), capped at qty — like US Treasury noncompetitive tenders.
- **AllOrNone / MAQ**: at each candidate price, included only if resulting integer fill ≥ `minQty`, else excluded. Determinism from BOUNDED candidate-price enumeration; document the exact evaluation order.
- **Conditional auto-firming**: a single deterministic TWO-PASS rule (NOT a fixpoint) — (a) provisional clear over firm orders; (b) evaluate each conditional's `firmIf` vs provisional p\*; (c) firm qualifiers + drop rest; (d) recompute final clear; (e) `Round.Clear` re-verifies final. The provisional p\* is the reference for firming.
- **Enforcement + parity**: written to a new `RULEBOOK.md` and enforced BYTE-IDENTICALLY in `Clearing.daml` and `solver/src/auction.ts` (CLEAR-05 parity), asserted by the golden-eval suite (extended from Phase 8 TRUST-01). §4 canary runs after every change.
- **CRITICAL PATH**: `Order` template ⇄ `Round.Clear` re-verification ⇄ `Clearing.daml` ⇄ `auction.ts` ⇄ all Daml + TS clearing/settlement tests move in LOCKSTEP. If a new order type cannot be made deterministic + Daml-mirrorable + §4-safe within this phase, scope it to a documented, tested subset rather than break the invariant. Single-funded-buyer + operator-custody settlement MVP invariants are NOT relaxed here (that is Phase 11).

**Aggregate Indicative Preview + Live Crossing (AUCT-03, VIZ-01)**
- During the open window the solver (Operator) publishes AGGREGATE scalars ONLY: indicative clearing price, net imbalance (Σ buy − Σ sell), estimated matched volume. NEVER an individual order.
- Exposed via an aggregate-only endpoint and/or an extended `RoundStats`. Individual orders never leave the solver process.
- **Small-N privacy guard**: publish the indicative price only once there are ≥2 orders on the relevant side (or a coarse bucket). Document the caveat explicitly.
- **VIZ-01**: extend the hand-rolled `CrossingChart` SVG to assemble the aggregate step demand/supply curve as orders arrive, then LOCK p\* at close.

**Best-Ex / TCA Receipt + Surplus Proof + Leakage Sim (AUCT-04, WOW-06)**
- **TCA receipt** per desk: `{fillQty, clearingPrice, ownLimit, referencePrice, improvementVsLimitBp, improvementVsReferenceBp, surplus}`. Exportable — extends `TradeConfirmation` fields, embedded in the Phase-8 proof-pack.
- **Reference price**: a configurable benchmark stub (pre-auction mid ≈ $100), CLEARLY LABELED; real feed deferred to Track B.
- **On-ledger surplus≥0 proof**: `Round.Clear` already enforces limit-compliance; surface an EXPLICIT checked field/assertion (`surplusVsLimitBp ≥ 0`). Surplus-vs-LIMIT is structurally ≥0; surplus-vs-REFERENCE may be negative and is labeled distinctly.
- **WOW-06 cost-of-leakage simulator**: CLIENT-SIDE, runs the SAME order set through a naive public book (sequential marketable execution → slippage/front-run → $ lost) beside Umbra's sealed clear ($0 leaked). Purely illustrative, clearly labeled.

### Claude's Discretion
- Exact Daml encoding of the `orderType` variant (sum type vs optional-fields record), endpoint names, `RoundStats`-vs-new-endpoint choice for the aggregate feed, precise TCA/receipt field layout — provided success criteria + §4 invariant + Daml⇄TS parity hold.
- The precise AON/MAQ candidate-enumeration algorithm, as long as it is deterministic, bounded, Daml-mirrorable, documented in RULEBOOK.md.

### Deferred Ideas (OUT OF SCOPE)
- Real market-data reference-price feed → Track B (Phase 13); labeled config stub here.
- Combinatorially-optimal all-or-none for large books → bounded candidate enumeration suffices; note the scaling caveat in RULEBOOK.md.
- Multi-buyer / multi-seller netting + Daml Finance settlement → Phase 11 (Phase 9 keeps operator-custody + single-funded-buyer settlement MVP; it changes ORDER MODEL + CLEARING, not settlement primitives).
- Cryptographic sealing of the aggregate feed → Phase 10. Phase 9's aggregate trusts the Operator.
- Order cancel/replace → Phase 13 / OPS-03 (Phase 9 keeps one order per desk per round).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUCT-01 | Richer order types: noncompetitive, MAQ/all-or-none, conditional auto-firming, in addition to sealed limits | §"Order-Type Encoding (Daml 3.4)" + §"Deterministic Algorithms" — additive Optional fields + `computeClearing` two-pass/core-clear extension; §"Lockstep Change Map" enumerates every coupled site |
| AUCT-02 | Deterministic rulebook (max matched → min imbalance → pro-rata at marginal price) documented + enforced identically in Clearing.daml and solver | §"Deterministic Algorithms" (preserves `topPrices` trap guard) + §"RULEBOOK.md" + golden parity test |
| AUCT-03 | Privacy-safe AGGREGATE indicative price + net imbalance during open window, never an individual order | §"Aggregate Feed (AUCT-03)" — solver-side scalars, small-N guard, no candidate-price leak |
| AUCT-04 | Exportable per-desk best-ex/TCA receipt (fill vs limit vs reference, surplus in bp) with on-ledger surplus≥0 proof | §"TCA Receipt + Surplus Proof (AUCT-04)" — extend `TradeConfirmation` + `Round.Clear` assert, embed in proof-pack |
| VIZ-01 | Live crossing viz assembles the aggregate curve as orders arrive, locks p\* at close | §"VIZ-01 CrossingChart Extension" — assembling↔locked, coarse bins during open |
| WOW-06 | Cost-of-leakage simulator: same orders through simulated public book ($ lost) vs Umbra ($0 leaked) | §"WOW-06 Leakage Sim" — pure client-side lib over settled receipt numbers, zero deps |
</phase_requirements>

## Summary

Phase 9 extends the single most correctness-sensitive part of Umbra: the pure clearing algorithm (`daml/Umbra/Clearing.daml`) and its byte-identical TypeScript mirror (`solver/src/auction.ts`), which the on-ledger `Round.Clear` choice re-verifies with a recompute-and-assert backstop before it will settle. Because `Round.Clear` calls `computeClearing views` and asserts the submitted proposal equals the recompute, **any clearing rule not present inside `computeClearing` (Daml) cannot settle**, and any divergence between the Daml and TS forms simultaneously breaks settlement AND the golden parity tests. All new order-type logic therefore MUST live inside `computeClearing` as a pure function of the (extended) `OrderView` list, so the same input produces the same output in the solver, in the Daml recompute, and in every test. [VERIFIED: read of Auction.daml lines 154-192, Clearing.daml, auction.ts]

The safe extension shape is dictated by two independent constraints that happen to agree: (1) the §4 canary must reduce to today's behavior, and (2) Daml 3.x Smart Contract Upgrades require new record/template fields to be **`Optional` and appended at the end** so old contracts upgrade with `None` [CITED: docs.daml.com/upgrade/smart-contract-upgrades.html]. So the discriminator is an appended `Optional OrderType` (defaulting semantically to `Limit`) plus appended `Optional` params (`minQty : Optional Int`, `firmIf : Optional Decimal`, and the existing `limit` relaxed conceptually to "absent for noncompetitive"). Note a Daml/TS mechanical reality: **Daml records have no field-level defaults** — every construction site (seeds, tests, `Venue.SubmitOrder`, the frontend `@daml.js` exercise, `readSealedOrders`) must be edited to pass the new fields even when the value is the default. "Additive" here means the *serialization/upgrade contract and the §4 semantics* survive, not that construction literals are untouched.

**Primary recommendation:** Land the phase in five ordered waves — (A) additive data model everywhere with the §4 canary staying green as a pure reduction, (B) per-order-type math added to `computeClearing` in *lockstep Daml+TS within a single commit* with golden fixtures, (C) the AUCT-03 aggregate feed + VIZ-01 chart (off the settle path), (D) the AUCT-04 TCA receipt + surplus≥0 assert + proof-pack embed, (E) the WOW-06 pure client-side sim. Keep the atomic-settle demo for new order types on a **single-funded-buyer** scenario (the settlement MVP invariant is not relaxed). Regenerate and commit `@daml.js/umbra-0.1.0` bindings whenever `Auction.daml`/`Roles.daml`/`Clearing.daml` change.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| New order-type data model (`orderType`, `minQty`, `firmIf`) | Daml template (`Order`) | TS `OrderView` mirror | The order is an on-ledger contract; its fields are the frozen data contract both planes read |
| Clearing math (noncomp priority, AON/MAQ inclusion, conditional two-pass) | Pure Daml (`Clearing.daml`) | Pure TS (`auction.ts`) | Single source of clearing math; re-verified on-ledger; must be identical in both |
| On-ledger re-verification + surplus≥0 proof | Daml `Round.Clear` | — | The security keystone; the only tier that can *prove* limit-compliance on-ledger |
| Aggregate indicative feed (scalars, small-N guard) | Solver service (Operator plane, `api.ts`/`ledger.ts`) | web `solver.ts` | Only the Operator sees the whole sealed batch; privacy is structural — scalars computed server-side, only scalars cross the wire |
| Order entry UI (order-type selector + params) | Frontend desk plane (`OrderTicket`, `@daml/react` per-party token) | `@daml.js` bindings | Runs inside the desk's own `DamlLedger`; never the operator token |
| Live crossing viz (assembling↔locked) | Frontend (`CrossingChart`, `lib/curve.ts`) | solver aggregate feed | Pure SVG render fed by aggregate scalars/coarse bins during open; full curve only at lock |
| TCA receipt render + export | Frontend (`SettlementView`) | solver (`readTradeConfirmations`), `proofpack.ts` | Reads on-ledger `TradeConfirmation` truth via the operator plane; embedded in the existing proof-pack |
| Cost-of-leakage simulation | Frontend pure lib (client-side, like `curve.ts`/`balance.ts`) | — | Illustrative only, no ledger/solver dependency; must be visibly NOT ledger data |

## Standard Stack

This phase adds **no new runtime dependencies.** Everything is built on the already-pinned, in-repo stack. This is the correct posture for a correctness-critical core change — new packages are attack surface and drift risk.

### Core (already present — versions verified from repo)
| Component | Version | Purpose | Source |
|-----------|---------|---------|--------|
| Daml SDK | `3.4.11` | Templates + `Round.Clear` + pure `Clearing.daml` + `daml test` | [VERIFIED: daml/daml.yaml `sdk-version: 3.4.11`] |
| Node.js | `20.x` | Solver runtime | [VERIFIED: CLAUDE.md, repo] |
| TypeScript | `5.4–5.6` | Solver + web | [VERIFIED: repo] |
| Vitest | `2.x` | Solver + web pure-lib golden tests | [VERIFIED: solver/src/*.test.ts, web/src/lib/*.test.ts present] |
| `@daml.js/umbra-0.1.0` | generated | Frontend Order/Venue/Side bindings — **must be regenerated** after template edits | [VERIFIED: web/src/components/OrderTicket.tsx imports; web/daml.js present + committed] |
| React 18 + Vite 5 + Tailwind 3.4 | pinned | UI surfaces (additive per 09-UI-SPEC) | [VERIFIED: CLAUDE.md, 09-UI-SPEC] |

**No install step.** `computeClearing` extension, the aggregate feed, receipts, and the leakage sim are all pure code over existing libs. The proof-pack (`proofpack.ts`) already renders HTML→PDF via headless Chrome/Edge with zero npm deps [VERIFIED: STATE.md 08-05].

### Build / test commands (Windows box specifics)
```bash
# Daml build + test — `daml` is Git-Bash-PATH-only on this box:
bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml build"
bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml test"

# Regenerate the frontend bindings AFTER any Auction/Roles/Clearing edit, then commit them:
bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml codegen js -o ../web/daml.js .dar/umbra-0.1.0.dar"   # confirm exact dar path/flags against the repo's existing codegen script

# Solver golden + parity tests:
cd solver && npx vitest run

# Web pure-lib tests (curve, new leakage sim):
cd web && npx vitest run
```
[VERIFIED: MEMORY.md live-e2e-ops PATH pattern; CONTEXT.md §specifics daml test invocation]

## Package Legitimacy Audit

**No external packages are installed in this phase.** All work is additive edits to existing in-repo modules (`Clearing.daml`, `Auction.daml`, `auction.ts`, `api.ts`, `ledger.ts`, web components/libs) plus a new `RULEBOOK.md` doc and a new pure web sim lib. slopcheck / registry verification are **not applicable** — the disposition table is empty by design.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | No installs this phase |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Runtime State Inventory

Phase 9 is a code + on-ledger-template evolution phase on a **fresh-DAR LocalNet** (each boot redeploys; no long-lived production ledger). Explicitly checked:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None persisting across the change that must be *migrated*. LocalNet is redeployed from the DAR each boot; there is no on-ledger data to back-fill. `solver/proofs/<id>.json` bundles are ephemeral, gitignored, per-round (Phase 8). | None — verified by daml/daml.yaml header (fresh DAR) + proof.ts header (gitignored ephemeral) |
| Live service config | Solver port `:4100`, JSON Ledger API v2 `:3975`, web `:5173`; operator token at `scripts/.operator-token` (gitignored, written by deploy). None encode any Phase-9 new field. | None — new fields flow through code/DAR, not service config. Verified by ledger.ts L37-58 |
| OS-registered state | None. No Task Scheduler / pm2 / systemd registrations embed order-type or clearing symbols. | None — verified by repo grep (no scheduler/pm2 config referencing clearing) |
| Secrets/env vars | `ANTHROPIC_API_KEY` (server-only), operator token, `VITE_SOLVER_URL`. None reference an order type. `ANTHROPIC_API_KEY` stays server-side. | None — no secret-key rename |
| Build artifacts | **`@daml.js/umbra-0.1.0` generated bindings in `web/daml.js/` are a build artifact that will NOT auto-update** when `Auction.daml`/`Roles.daml`/`Clearing.daml` change. Stale bindings = web compiles against the OLD `Order`/`SubmitOrder` shape and silently omits new fields. Also `.daml/` build cache + the compiled `.dar`. | **Regenerate `daml codegen js` → `web/daml.js` and COMMIT it** (recent commit 6e4bade committed generated bindings for fresh-clone builds — keep that invariant). Rebuild the DAR before redeploy. |

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────────┐
   DESK PLANE           │  Frontend (web :5173, React 18 + @daml/react)   │
   (per-party JWT)      │                                                 │
                        │  OrderTicket ──exercise(Venue.SubmitOrder,       │
   desk types order ───▶│    {side, qty, limit, orderType?, minQty?,       │
   (LIMIT/NONCOMP/      │     firmIf?})──┐  [own desk token, NEVER operator]│
    MAQ/COND)           └────────────────┼────────────────────────────────┘
                                         │ JSON Ledger API v2 (:3975)
                                         ▼
                        ┌─────────────────────────────────────────────────┐
                        │  Canton LocalNet — Order contract (private:       │
                        │  signatory operator+desk, NO observer)            │
                        └────────────────┬────────────────────────────────┘
                                         │ operator reads whole sealed batch
   OPERATOR PLANE                        ▼
   (operator JWT,        ┌────────────────────────────────────────────────┐
    server-only)         │  Solver service (:4100)                         │
                         │  ledger.ts.readSealedOrders → OrderView[]        │
   web Theatre ───GET───▶│                                                 │
   /round/:id  (open)    │  AGGREGATE FEED (AUCT-03): computeClearing +     │
                         │   demand/supply → SCALARS ONLY {indicativePrice, │
                         │   netImbalance, estMatched} + small-N guard ─────┼──▶ scalars → CrossingChart
                         │   (raw candidate prices NEVER cross during open) │      (assembling, no red p*)
                         │                                                 │
   web /settle ──POST───▶│  settle(): computeClearing(views) ──proposal──┐ │
                         └───────────────────────────────────────────────┼─┘
                                                                         │ Round.Clear(clearingPrice, allocations, cids)
                                                                         ▼
                        ┌─────────────────────────────────────────────────┐
                        │  Round.Clear (Auction.daml) — THE BACKSTOP        │
                        │  1. build OrderView[] from fetched Orders         │
                        │     (NOW carries orderType/minQty/firmIf)         │
                        │  2. (p*, allocs) = computeClearing views   ◀── SAME PURE FN as solver + tests
                        │  3. assert proposal == recompute (price+allocs)   │
                        │  4. assert surplusVsLimit ≥ 0  (AUCT-04 proof)    │
                        │  5. atomic DvP (single funded buyer, op-custody)  │
                        │  6. TradeConfirmation per desk (NOW carries       │
                        │     ownLimit, referencePrice, surplus, bp) ───────┼──▶ receipts → SettlementView + proof-pack
                        └─────────────────────────────────────────────────┘

   CLIENT-SIDE ONLY (WOW-06): SettlementView pure lib runs settled receipt
   numbers through a naive public-book model → "$X lost" vs "$0 leaked".
   NO ledger, NO solver dependency.  Dashed border = NOT ledger data.
```

### Component Responsibilities
| File | Phase-9 responsibility |
|------|------------------------|
| `daml/Umbra/Clearing.daml` | Add `OrderType`; extend `OrderView`; extend `demandAt`/`supplyAt`/`rationByPriority`; add `coreClear` + two-pass wrapper inside `computeClearing`; add AON/MAQ enumeration helpers (top-level recursion) |
| `daml/Umbra/Auction.daml` | Add `Order` fields (Optional, appended); update the `OrderView` construction inside `Clear`; extend `TradeConfirmation` + surplus≥0 assert; keep re-verify shape unchanged |
| `daml/Umbra/Roles.daml` | Extend `Venue.SubmitOrder` args to carry the new order-type fields → into `create Order` |
| `daml/Umbra/Setup.daml` + `Tests.daml` | Add `orderType=Limit`/`None` to every §4 construction; add new-type test scaffolds; §4 canary literals unchanged in assertion |
| `solver/src/auction.ts` | Byte-identical mirror of the Clearing.daml changes |
| `solver/src/ledger.ts` | Map new Order fields in `readSealedOrders`; wire-encode Optionals; new `TradeConfirmation` fields in `readTradeConfirmations`; `settle`/`tamperClear` structurally unchanged |
| `solver/src/api.ts` | New aggregate-feed block/endpoint (scalars + small-N guard); surface receipt fields on the settled body |
| `web/src/components/OrderTicket.tsx` | Order-type selector + param fields; `SubmitOrder` exercise carries new fields; `load demo` stays plain Limit |
| `web/src/components/CrossingChart.tsx` + `web/src/lib/curve.ts` | Assembling↔locked states; coarse bins during open |
| `web/src/views/TheatreView.tsx` | Aggregate indicative panel |
| `web/src/views/SettlementView.tsx` + new `web/src/lib/leakage.ts` | TCA receipt render + export; WOW-06 sim panel |
| `web/daml.js/` | Regenerated + committed bindings |
| `RULEBOOK.md` (new) | Sovereign-grade written rulebook, cites exact function names in both planes |

### Pattern 1: All new clearing logic lives inside `computeClearing` (pure)
**What:** `Round.Clear` re-verifies by `let (p*, allocs) = computeClearing views; assert proposal == that`. So any rule the solver applies MUST be reproduced by `computeClearing` from the same `OrderView[]`, or the on-ledger recompute won't match and the round can't settle.
**When to use:** Every AUCT-01/02 rule.
**Example (structure to preserve):**
```daml
-- Source: daml/Umbra/Auction.daml lines 175-188 (VERIFIED, current)
orders <- mapA fetch orderCids
let views = [ OrderView with desk = o.desk; side = o.side
                ; quantity = o.quantity; limit = o.limit  -- ADD: orderType, minQty, firmIf here
            | o <- orders ]
let (pStarExpected, allocsExpected) = computeClearing views
assertMsg "clearingPrice does not match recomputed §8 p*"
  (roundBankers 2 clearingPrice == roundBankers 2 pStarExpected)
let allocKey a = (show a.desk, show a.side, a.filledQty)
assertMsg "allocations do not match recomputed §8"
  (sortOn allocKey allocations == sortOn allocKey allocsExpected)
```

### Pattern 2: Daml⇄TS parity via golden fixtures
**What:** `daml/Umbra/Tests.daml::test_clears_at_100` and `solver/src/auction.test.ts` scenario 1 are the same §4 fixture asserting $100.00 + A=10/B=8/C=2. Each new order type gets a new fixture in BOTH, with the same expected numbers. [VERIFIED: read both files]
**When to use:** Every new order-type rule and the trap-guard preservation.

### Pattern 3: Additive Optional-at-end fields (Daml 3.x SCU)
**What:** New template/record fields must be `Optional` and appended so old contracts upgrade with `None`. [CITED: docs.daml.com/upgrade/smart-contract-upgrades.html]
**When to use:** `Order`, `OrderView`, `TradeConfirmation`, `Venue.SubmitOrder`.
**Note:** Daml has no field-level defaults — every construction site still lists the field explicitly (`orderType = Some Limit` or `= None`).

### Anti-Patterns to Avoid
- **Applying a new rule only in `auction.ts`, not `Clearing.daml`.** The round will pass the solver but be rejected on-ledger (recompute mismatch) — silent settlement failure.
- **Applying imbalance across ALL prices.** Drops the `topPrices` filter → §4 clears at 99. The trap guard (`choosePStar` lines 93-98 Daml / 68-70 TS) is load-bearing. [VERIFIED: Clearing.daml, auction.ts, and the explicit regression test auction.test.ts scenario 5]
- **Exposing the raw candidate-price curve during the OPEN window.** `candidatePrices` = the set of distinct limits = individual order prices. Broadcasting it while orders are sealed leaks them (AUCT-03 privacy breach). See Pitfall 1.
- **Settling a multi-funded-buyer allocation.** `Round.Clear` aborts "requires exactly one funded buyer" [VERIFIED: Auction.daml lines 206-209]. New order types must keep the settle-path demo single-buyer.
- **Editing `Auction.daml` without regenerating `web/daml.js`.** The web silently compiles against the stale `Order`/`SubmitOrder` shape.
- **`maximumBy` on a possibly-empty list.** Use `foldl max 0` (Daml) / `.reduce(Math.max, 0)` (TS) for empty-safe max on a no-cross round. [VERIFIED: Clearing.daml line 93 comment]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| On-ledger allocation verification | A new "check the new order types" pass in Round.Clear | The existing recompute-and-assert (`computeClearing views` == proposal) | It already subsumes max-volume + per-order limit-compliance + conservation; extend the pure fn, not the assert |
| Multiset allocation equality | A bespoke comparator | Existing `sortOn allocKey` (Daml) / `Map(desk|side→qty)` (TS) | Already order-insensitive and mirrored [VERIFIED: Auction.daml 186-188, agent.ts 185-189] |
| 2-dp price equality | `===` on Decimals/floats | `roundBankers 2` (Daml) / `Math.round(p*100)/100` + `priceEqual` (TS) | Float drift; already the parity contract [VERIFIED: auction.ts 121, agent.ts 179-180] |
| Proof-pack / receipt export | A new PDF/export pipeline | `proofpack.ts` (headless Chrome/Edge → PDF, window.print fallback, zero deps) — extend the "best-ex receipts" bundle | Already shipped Phase 8, on-brand, secret-free [VERIFIED: STATE.md 08-05] |
| Shareable brief | A new summarizer | `brief.ts::composeBrief` | Pure, secret-free, no number drift [VERIFIED: api.ts 104] |
| Chart geometry | A new coordinate frame or a chart lib | `web/src/lib/curve.ts` (`sx`/`sy`/`crossingPoint`, binding §4 marker 296,160) | The §4 marker is pinned + tested; a chart lib violates the binding comp [VERIFIED: curve.ts, CrossingChart.tsx] |
| CORS / secret-safety on the new endpoint | New middleware | The existing `createApp(deps)` scoped-CORS + `ApiError` secret-free envelope | Already ASVS-hardened [VERIFIED: api.ts 30-31, 526-538] |

**Key insight:** The correctness core already has a complete, tested verification and parity harness. The phase's risk is entirely in *keeping the two clearing implementations identical while extending them*, not in building new infrastructure. Every new rule is "add to the pure fn + add a golden fixture in both planes."

## Deterministic Algorithms (the byte-identical core)

All three new rules must be encoded so Daml and TS produce identical `(Decimal, [Allocation])` from identical `OrderView[]`. Recommended encodings (planner has discretion on exact form per CONTEXT, provided determinism + parity + §4-reduction hold):

### Order-Type Encoding (Daml 3.4)
```
data OrderType = Limit | Noncompetitive | AllOrNone | Conditional  deriving (Eq, Show)
-- OrderView (appended, Optional where a type may omit a value):
OrderView with
  desk, side, quantity            -- unchanged
  limit    : Optional Decimal     -- None only for Noncompetitive (relax from Decimal)
  orderType: OrderType            -- was implicitly Limit
  minQty   : Optional Int         -- AllOrNone/MAQ only
  firmIf   : Optional Decimal     -- Conditional only (threshold; side interprets ≤/≥)
```
- **§4 reduction:** all three §4 orders are `orderType=Limit, limit=Some x, minQty=None, firmIf=None` → `demandAt`/`supplyAt`/`choosePStar`/`rationByPriority` behave exactly as today → $100.00.
- **`limit : Optional Decimal` is a behavioral change** to a frozen field. Alternative that avoids touching `limit`: keep `limit : Decimal` and treat Noncompetitive as "limit is ignored; effective limit = +∞ for buys / 0 for sells." This keeps the existing `limit`-typed literals compiling with fewer edits. **Recommend the effective-limit approach** — smaller blast radius on the frozen field, and the noncompetitive semantics ("willing at any price") are exactly `+∞`/`0`. `[ASSUMED]` — planner's discretion per CONTEXT; verify the chosen form keeps §4 literals valid.
- **`ensure` clause (Order):** currently `quantity > 0 && limit > 0.0` [VERIFIED: Auction.daml line 70]. If `limit` becomes Optional, the ensure must guard `optional True (> 0.0) limit` (or keep `limit > 0.0` under the effective-limit approach). MAQ needs `minQty >= 1 && minQty <= quantity`; Conditional needs `firmIf > 0.0`. Encode these as `ensure` guards so a malformed order can't even be created.

### Noncompetitive — top-priority, any-price
- `demandAt orders p = Σ qty of buys where (orderType==Noncompetitive) OR (limit >= p)`; symmetric for `supplyAt` with `(orderType==Noncompetitive) OR (limit <= p)`.
- Noncompetitive adds NO candidate price (it has no limit) — `candidatePrices` unchanged; it uniformly lifts both curves.
- **Rationing priority:** noncompetitive fills before competitive. Extend the sort key. Today buys sort `sortOn (\o -> negate limit)` (highest limit first) [VERIFIED: Clearing.daml 132]. New key: `(orderType /= Noncompetitive, negate effLimit)` — `False < True` in Daml's derived `Ord Bool`, so noncompetitive (False) sorts first. **Parity pitfall:** in TS, booleans don't sort; map to `[isNoncomp?0:1, -limit]` and compare lexicographically. Document this in RULEBOOK as an explicit parity note.
- **Settlement caveat:** a noncompetitive *buy* alongside the §4 buy creates two funded buyers → `Round.Clear` aborts. Keep noncompetitive on the SELL side (or as the sole buyer) for any settle-path demo.

### AllOrNone / MAQ — bounded candidate-price + subset enumeration
- Constraint is circular (inclusion affects fill affects inclusion), so use **bounded enumeration over the (small) set of AON/MAQ orders**:
  - For each candidate price `p`, enumerate subsets `S` of the AON/MAQ orders (powerset, `2^k`, `k` tiny). For each `(p, S)`: clear treating orders in `S` as fully participating and orders NOT in `S` as excluded; the resulting fill for each `s ∈ S` must be `≥ minQty s` (else `(p,S)` is infeasible). Among feasible `(p,S)`, apply the SAME tie-break: max matched → min |demand−supply| → lower price → (deterministic subset tiebreak, e.g. prefer the lexicographically-smallest excluded-set / most-included).
- **Daml constraint:** Daml-LF forbids recursive *local* bindings — powerset must be a **top-level** recursive function (like `rationByPriority` is today). [VERIFIED: Clearing.daml lines 113-119 comment]
- **All-or-none = `minQty == quantity`** (the special case) — no separate code path.
- **§4 reduction:** no AON orders → the AON order set is empty → the only subset is `∅` → reduces to today's single-pass clear.
- **Scaling caveat** (already deferred): powerset is exponential in the AON count; fine for the demo's tiny book. Note in RULEBOOK.

### Conditional auto-firming — single deterministic TWO-PASS
```
computeClearing views =
  let firm        = [ v | v <- views, orderType v /= Conditional ]
      conditional = [ v | v <- views, orderType v == Conditional ]
      (provP, _)  = coreClear firm                         -- PASS 1: provisional over firm only
      firmed      = [ v | v <- conditional, qualifies v provP ]  -- firmIf test vs provisional p*
      final       = firm ++ firmed
  in coreClear final                                       -- PASS 2: final clear (+ noncomp/AON handling)
  where qualifies v p = case side v of
          Buy  -> maybe False (p <=) (firmIf v)            -- buy firms if clearing ≤ threshold
          Sell -> maybe False (p >=) (firmIf v)            -- sell firms if clearing ≥ threshold
```
- **NOT a fixpoint** — exactly two passes; the provisional p\* (over firm orders) is the firming reference even if the final p\* differs. Document this explicitly (a conditional could, in a pathological book, have firmed against a provisional p\* that the final clear moves past — accepted, no re-iteration).
- `coreClear` is the extracted pure function that does candidate-price selection + noncomp priority + AON/MAQ enumeration + rationing. Both passes call it. `Round.Clear` calls `computeClearing` (the two-pass wrapper) so on-ledger and solver agree.
- **§4 reduction:** no conditional orders → `firmed = []`, `final = firm = all` → one `coreClear` = today's `computeClearing`.

### Decimal / Int / determinism pitfalls (parity-critical)
- Every Daml `Decimal` literal carries a decimal point; unit quantities stay `Int` end-to-end (no Int/Decimal mixing). [VERIFIED: Clearing.daml header]
- `bp` (basis points) for AUCT-04: compute as an integer/Decimal deterministically and round identically in both planes (`roundBankers` ⇄ `Math.round`). Pin the exact formula in RULEBOOK (e.g. `improvementVsLimitBp = round( (|limit − p*| / p*) * 10000 )`).
- Sort stability: Daml `sortOn` and JS `.sort` must key on the same tuple; where a boolean is part of the Daml key, map it to `0/1` in TS.
- Pro-rata "leftover-to-largest": the current `rationByPriority` is greedy (equal-limit ties keep input order), which is exact for §4 (no equal-limit tie) [VERIFIED: Clearing.daml 108-119]. If a new fixture introduces an equal-limit tie on the long side where strict pro-rata matters, implement leftover-to-largest **in both planes together** and add a golden fixture; otherwise keep the documented greedy rule and note the deferral.

## Aggregate Feed (AUCT-03) — scalars only, small-N guarded

- **Where:** the solver (Operator) already reads the whole sealed batch via `ledger.ts::readSealedOrders` [VERIFIED]. Compute scalars server-side; only scalars cross to the browser (Theatre is on the operator plane :4100 via `web/src/solver.ts`).
- **Recommended surface:** a new block on `GET /round/:id` when `status === 'Open'` and `sealedOrderCount ≥ 1`, OR a dedicated `GET /round/:id/indicative`. The existing GET only attaches result fields at TERMINAL status [VERIFIED: api.ts 242]; add an `indicative` block for the open state. **Keep `RoundStats` count-only** (avoid the archive+recreate churn of putting price on-ledger, and keep the privacy computation in one server-side place). Extending `RoundStats` is allowed by CONTEXT but not recommended.
- **Scalars:** `indicativePrice = choosePStar(views)`, `netImbalance = Σbuyqty − Σsellqty`, `estMatched = matchedAt(views, indicativePrice)`. All derived from the pure fns already exported to `api.ts` deps [VERIFIED: api.ts 116-121].
- **Small-N guard:** publish the exact `indicativePrice` only when there are `≥2` orders on the relevant (crossing) side; otherwise return a coarse band (e.g. rounded to a wide bucket) + a `coarse: true` flag and the UI's `COARSE — PRIVACY GUARD (< 2 ORDERS ON A SIDE)` state [VERIFIED: 09-UI-SPEC lines 246-250]. Net imbalance / est matched remain aggregate counts.
- **Do NOT return the `curve` (candidate-price demand/supply array) during the open window** — it reveals distinct limits. The existing `buildCurve` is only served at/after terminal status [VERIFIED: api.ts 253, 324]; keep it that way. See Pitfall 1.

## VIZ-01 CrossingChart Extension

- Extend `CrossingChart` with an `assembling` vs `locked` mode (a prop). [VERIFIED: CrossingChart.tsx is a pure prop-driven SVG]
- **Assembling (window open):** drive the step curves from **coarse price bins / the guarded scalars**, NOT raw `candidatePrices`. Render the lime matched region faintly; **no red p\* rule/dropline/marker/label** (red is reserved for the locked clear) [VERIFIED: 09-UI-SPEC lines 255-261]. Caption `ASSEMBLING — CURVE BUILDS AS ORDERS SEAL`.
- **Locked (close):** the shipped solved state is byte-unchanged — red p\* rule + dropline + `circle r5` at `crossingPoint(...)` = (296,160) for §4 + the 15px price label; lime region solidifies; caption `SUPPLY × DEMAND` + verdict `p* LOCKED @ 100.00` [VERIFIED: CrossingChart.tsx 94-113, 09-UI-SPEC 262-266].
- Reuse `lib/curve.ts` (`sx`/`sy`/`crossingPoint`) unchanged; the binding §4 marker + `curve.test.ts` assertion must still hold [VERIFIED: curve.ts 29-63].

## TCA Receipt + Surplus Proof (AUCT-04)

- **Extend `TradeConfirmation`** (Optional, appended per SCU) with: `ownLimit : Optional Decimal`, `referencePrice : Decimal`, `surplusVsLimit : Decimal`, `improvementVsLimitBp : Decimal`, `improvementVsReferenceBp : Decimal` (signed). Existing fields (`filledQty, clearingPrice, cashMoved`, observer=desk) unchanged [VERIFIED: Auction.daml 85-98].
- **Compute in `Round.Clear`** at the per-desk `create TradeConfirmation` step [VERIFIED: Auction.daml 262-271]:
  - `surplusVsLimit`: Buy → `(limit − p*) * filledQty`; Sell → `(p* − limit) * filledQty`. Structurally ≥0 because eligibility requires Buy `limit ≥ p*` / Sell `limit ≤ p*` [VERIFIED: Clearing.daml 132-133]. Noncompetitive → `None`/0 (no limit).
  - **Add an explicit `assertMsg "execution at least as good as limit (surplusVsLimit ≥ 0)" (surplusVsLimit >= 0.0)`** — the on-ledger surplus≥0 proof (AUCT-04). This is the "provable" number.
  - `referencePrice`: a config stub (`≈ 100`), clearly labeled `REFERENCE — PRE-AUCTION MID (STUB)`. `improvementVsReferenceBp` may be negative — a DIFFERENT number, rendered distinctly [VERIFIED: 09-UI-SPEC 67-72].
- **Reference-price config source:** a labeled constant/config value. Pass it into `Round.Clear` as a choice arg (a choice body cannot read config), mirroring the Option-B "pass cids in" pattern [VERIFIED: Auction.daml 154-161]. `[ASSUMED]` exact plumbing — planner's discretion; keep it clearly a stub.
- **Flow out:** `ledger.ts::readTradeConfirmations` maps the new fields [VERIFIED: ledger.ts 240-250] → `api.ts` settled body → web `solver.ts` → `SettlementView` receipt + `proofpack.ts` best-ex bundle (already exists) [VERIFIED: STATE.md 08-05].
- **Two surpluses are two numbers:** vs-LIMIT (ink, proven, never negative) vs vs-REFERENCE (lighter, may be red) — keep visually separable per 09-UI-SPEC.

## WOW-06 Leakage Sim

- **Pure client-side lib** `web/src/lib/leakage.ts` (like `curve.ts`/`balance.ts`), unit-tested with Vitest, **zero ledger/solver dependency** [VERIFIED: 09-UI-SPEC 297-318].
- Input: the settled per-desk receipt numbers (qty, ownLimit, clearingPrice) already on the settled body — no need for the retired sealed orders.
- Model (illustrative, deterministic): walk the aggressive side sequentially through a naive public book, applying a slippage/price-impact per unit + a front-run markup; `$lost = Σ (executionPrice − uniformClear) * qty`. Umbra sealed clear → `$0 leaked`. Punchline `$X SAVED`.
- **Must be unmistakably NOT ledger data:** dashed border, `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag, footnote disclaimer [VERIFIED: 09-UI-SPEC 302-316].

## RULEBOOK.md (AUCT-02)

New sovereign-grade doc (recommend `RULEBOOK.md` at repo root or `daml/RULEBOOK.md`). Must state the objective (max matched → min imbalance → lower price), the `topPrices` trap guard, noncompetitive top-priority-any-price, AON/MAQ bounded enumeration + inclusion test, conditional two-pass + provisional-p\*-as-reference, greedy/pro-rata rationing, and the bp formula — **each citing the exact function/symbol in BOTH `Clearing.daml` and `auction.ts`** so the doc and code cannot silently drift. The golden-eval suite is the enforcement mechanism (the doc's fixtures ARE the tests). Note the AON scaling caveat.

## Lockstep Change Map (the #1 risk — coupled edit sites + safe sequencing)

Symbols and files that MUST move together, and the wave order that keeps the §4 canary green after every step.

### Coupled symbols per concern
| Concern | `Clearing.daml` | `Auction.daml` | `auction.ts` | `Round.Clear` asserts | Seeds/Setup | Daml tests | TS tests | Frontend / bindings |
|---------|-----------------|----------------|--------------|----------------------|-------------|-----------|----------|---------------------|
| Data model | `OrderType`, `OrderView` +fields, `isBuy/isSell` | `Order` +fields, `Venue.SubmitOrder` (Roles.daml), OrderView build in `Clear` | `OrderType`, `OrderView` iface | view build unchanged shape | `Setup.initialize`/`seedOpenRound` add fields; `Tests.daml` literals | all `OrderView with`/`Order` literals | `auction.test.ts` OrderView literals | `OrderTicket`/`DeskColumn` exercise args; **regen `web/daml.js`** |
| Noncompetitive | `demandAt`,`supplyAt`,`rationByPriority` key,`candidatePrices`(unchanged) | (via computeClearing) | same mirrors | (auto via recompute) | new noncomp seed (sell-side, single-buyer safe) | `test_noncomp_*` | `noncomp` scenario | selector `NONCOMP`, hide limit input |
| AON/MAQ | `coreClear`, powerset helper (top-level), inclusion test | ensure `minQty` guard | same mirrors | (auto) | new MAQ seed | `test_maq_*`, `test_aon_*` | `maq`/`aon` scenarios | `MAQ` selector + min-qty param |
| Conditional | two-pass wrapper in `computeClearing`, `coreClear`, `qualifies` | ensure `firmIf>0` guard | same mirrors | (auto — recompute runs two-pass) | new conditional seed | `test_conditional_*` | `conditional` scenario | `COND` selector + firm-if param |
| Aggregate feed | (reuse pure fns) | — | (reuse) | — | — | — | `api.test.ts` indicative | Theatre indicative panel; `solver.ts` type |
| TCA receipt | — | `TradeConfirmation` +fields, surplus≥0 assert, ref-price choice arg | — | +surplus≥0 assert | — | `test_surplus_nonneg` | `api.test.ts` receipt shape | `SettlementView` receipt, `proofpack.ts` |
| Leakage sim | — | — | — | — | — | — | `leakage.test.ts` | `SettlementView` sim panel |

### Safe wave sequencing (canary green after each)
1. **Wave A — additive data model, zero behavior change.** Add `OrderType` + Optional fields to `OrderView`/`Order`/`Venue.SubmitOrder`/`TradeConfirmation`; update EVERY construction site to the Limit default; update `readSealedOrders` mapping + wire encoding; regenerate + commit `web/daml.js`; update `OrderTicket` to send the default. Skeleton `RULEBOOK.md`. **Gate:** `daml test` §4 canary + `auction.test.ts` scenario 1 green (pure reduction), web builds. *This wave touches many files but must change no observable behavior.*
2. **Wave B — clearing math per type, Daml+TS in one commit each, golden-first.** B1 Noncompetitive, B2 AON/MAQ, B3 Conditional two-pass. For each: write the Daml + TS golden fixture with expected numbers → implement in `Clearing.daml` → mirror in `auction.ts` → `daml test` + `vitest` green → confirm §4 canary + the 99-vs-100 trap test still green. `Round.Clear` auto-covers each (it recomputes via `computeClearing`).
3. **Wave C — AUCT-03 aggregate feed + VIZ-01 chart.** Off the settle path; `api.ts` indicative block + small-N guard + `api.test.ts`; `CrossingChart` assembling↔locked. **Gate:** no `curve`/candidate-price leak during open; §4 unaffected.
4. **Wave D — AUCT-04 receipt + surplus≥0 proof.** `TradeConfirmation` fields + `Round.Clear` computation + `assertMsg surplus≥0` + `test_surplus_nonneg`; `readTradeConfirmations` + `api.ts` surface; `SettlementView` + `proofpack.ts` embed. **Gate:** §4 settle still produces A=10/B=8/C=2 @100.00 with three confirmations (existing `test_settled_balances` must stay green, updated for new fields).
5. **Wave E — WOW-06 sim.** Pure `web/src/lib/leakage.ts` + `leakage.test.ts` + `SettlementView` panel. No core impact.

**Non-negotiable within every wave:** Daml and TS clearing changes land in the SAME commit. A Daml/TS divergence simultaneously breaks settlement (recompute mismatch) and the golden parity tests — never ship one half.

## Common Pitfalls

### Pitfall 1: Leaking individual limits via the live curve/feed during the open window
**What goes wrong:** Broadcasting `candidatePrices`/`buildCurve` or an ungated indicative price while orders are sealed reveals individual order limits (each candidate price = someone's limit; with 1 order/side the indicative price IS that order's limit).
**Why:** The aggregate "curve" is not scalar — it enumerates distinct limits. The privacy guarantee is structural (no observer on `Order`); an over-eager live feed re-introduces the leak in the aggregate.
**How to avoid:** During OPEN, publish ONLY the small-N-guarded scalars (indicative price ≥2/side else coarse band, net imbalance, est matched) and drive the assembling chart from coarse bins — never raw candidate prices. Serve the full `curve` only at terminal status (as the current code already does).
**Warning signs:** a `curve`/`candidatePrices` array in any open-window response; an exact indicative price with 1 order on a side.
**Residual known limitation (honest):** with exactly 1 buy + 1 sell, net imbalance + est matched can let a desk holding one side back out the other's qty. CONTEXT accepts trusting the Operator and guards the price; cryptographic sealing is Phase 10. Document in RULEBOOK.

### Pitfall 2: A new rule in TS but not Daml (or divergent) — silent settlement failure
**What goes wrong:** The solver clears fine; `Round.Clear` recomputes via `computeClearing` and the proposal ≠ recompute → the atomic Clear is rejected → the round can't settle.
**How to avoid:** Land Daml+TS in one commit; the golden parity fixture (same expected numbers in both) is the tripwire. `daml test` AND `vitest` must both be green before merge.

### Pitfall 3: Multi-funded-buyer allocation on the settle path
**What goes wrong:** A noncompetitive/conditional BUY plus the §4 buy → two funded buyers → `Round.Clear` aborts "requires exactly one funded buyer."
**How to avoid:** Keep new-order-type *settlement* demos single-buyer (put the new type on the sell side or as the sole buyer). Clearing math/preview/viz/receipts can show richer books; only the atomic-settle demo is constrained (Phase 11 relaxes this). [VERIFIED: Auction.daml 206-209]

### Pitfall 4: Stale `@daml.js` bindings after a template edit
**What goes wrong:** Web compiles against the old `Order`/`SubmitOrder` shape; new fields silently dropped from submitted orders; runtime decode skew.
**How to avoid:** `daml codegen js` → `web/daml.js` and commit it in the same change as the template edit (keep the fresh-clone-builds invariant from commit 6e4bade).

### Pitfall 5: Daml-LF has no local recursion / no field defaults
**What goes wrong:** Powerset/enumeration helpers written as local `go` bindings won't type-check; forgetting a new field at any construction site is a compile error.
**How to avoid:** Top-level recursive helpers (like `rationByPriority`); grep every `OrderView with`/`Order with`/`create ... Order`/`SubmitOrder` site when adding a field.

### Pitfall 6: Boolean sort-key parity between Daml and TS
**What goes wrong:** Using `orderType /= Noncompetitive` as a Daml sort key (Bool: False<True) has no direct TS equivalent; a naive TS port sorts wrong → allocation divergence → recompute mismatch.
**How to avoid:** Map the boolean to `0/1` in the TS key tuple and compare lexicographically; add a golden fixture that would fail if the ordering flips.

### Pitfall 7: `firmIf`/`minQty` making `Round.Clear`'s two-pass diverge from the solver
**What goes wrong:** If the solver firms conditionals against a *final* p\* but `computeClearing` firms against the *provisional* p\* (or vice versa), the recompute won't match.
**How to avoid:** The two-pass lives entirely inside `computeClearing` (provisional-then-final); the solver never firms separately — it calls `computeClearing`. `Round.Clear` calls the same. One implementation, three callers.

## State of the Art

| Old (pre-Phase-9) | New (Phase 9) | Impact |
|-------------------|---------------|--------|
| `OrderView{desk,side,quantity,limit}`, single-pass `computeClearing` | +`orderType`/`minQty`/`firmIf`; `computeClearing` = two-pass wrapper over `coreClear` | All construction sites + both planes edited; §4 reduces |
| `TradeConfirmation{...,cashMoved}` | +`ownLimit`/`referencePrice`/`surplusVsLimit`/bp; surplus≥0 assert | On-ledger best-ex proof |
| Open window shows only `sealedOrderCount` | +aggregate indicative scalars (small-N guarded) | New privacy-safe live feed |
| `CrossingChart` renders solved state only | assembling↔locked states | Live price discovery |

**Deprecated/outdated:** nothing removed. Phase 9 is strictly additive; the §4 fixture and all Phase 1-8 tests remain the continuous guard.

## Validation Architecture

nyquist_validation is enabled (config.workflow.nyquist_validation = true). [VERIFIED: .planning/config.json]

### Test Framework
| Property | Value |
|----------|-------|
| Daml framework | `daml test` (Daml Script), SDK 3.4.11; config `daml/daml.yaml` |
| Daml run cmd | `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml test"` |
| Solver framework | Vitest 2.x; files `solver/src/*.test.ts` |
| Solver run cmd | `cd solver && npx vitest run` (quick: `npx vitest run auction.test.ts`) |
| Web framework | Vitest 2.x; `web/src/lib/*.test.ts` |
| Web run cmd | `cd web && npx vitest run` |
| Golden-eval (TRUST-01) | `solver/src/auction.test.ts` (5 §8 scenarios) + `daml/Umbra/Tests.daml::test_clears_at_100` — the regression gate on every clearing change [VERIFIED] |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| AUCT-01 noncomp | noncomp clears + top-priority + §4-safe | unit (Daml+TS) | `daml test` + `npx vitest run auction.test.ts` | ❌ Wave B1 |
| AUCT-01 MAQ/AON | inclusion ≥minQty, all-or-none drop | unit (Daml+TS) | same | ❌ Wave B2 |
| AUCT-01 conditional | two-pass firm/drop vs provisional p\* | unit (Daml+TS) | same | ❌ Wave B3 |
| AUCT-02 rulebook + trap guard | §4 = 100 not 99; parity Daml⇄TS | unit | `test_clears_at_100` + auction.test.ts scenarios 1 & 5 | ✅ (extend) |
| AUCT-03 aggregate | scalars only, small-N guard, no curve leak | unit (solver) | `npx vitest run api.test.ts` | ❌ Wave C |
| AUCT-04 receipt + surplus≥0 | surplus≥0 asserted on-ledger; bp fields | Daml Script + solver | `test_settled_balances`(extend) + `test_surplus_nonneg` + api.test.ts | ⚠️ partial |
| AUCT-04 export | receipt embedded in proof-pack | solver | `npx vitest run proofpack.test.ts` | ✅ (extend) |
| VIZ-01 | assembling↔locked; §4 marker 296,160 | unit (web) | `cd web && npx vitest run curve.test.ts` | ✅ (extend) |
| WOW-06 | $lost>0 sim vs $0 leaked, deterministic | unit (web) | `cd web && npx vitest run leakage.test.ts` | ❌ Wave E |
| Settlement invariant | §4 A=10/B=8/C=2 @100 + conservation + single-buyer | Daml Script | `test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation` | ✅ (keep green) |
| Privacy invariant | per-party Order/TradeConfirmation isolation | Daml Script | `test_privacy_orders`, `test_privacy_confirmations` | ✅ (keep green) |

### Sampling Rate
- **Per task commit:** `daml test` (fast, no ledger for the pure canary) + `npx vitest run auction.test.ts` — the §4 + trap canary.
- **Per wave merge:** full `daml test` + `cd solver && npx vitest run` + `cd web && npx vitest run`.
- **Phase gate:** all suites green + §4 clears $100.00 end-to-end (pure, solver, on-ledger settle) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `RULEBOOK.md` — new doc (AUCT-02), cites function names in both planes.
- [ ] `web/src/lib/leakage.ts` + `web/src/lib/leakage.test.ts` — WOW-06 pure sim (new).
- [ ] New Daml Script tests: `test_noncomp_*`, `test_maq_*`, `test_aon_*`, `test_conditional_*`, `test_surplus_nonneg` in `Tests.daml`.
- [ ] New TS golden scenarios in `auction.test.ts` (mirror each new Daml test) + `api.test.ts` indicative-feed cases.
- [ ] Extend `test_settled_balances` + `proofpack.test.ts` for the new `TradeConfirmation` fields.
- [ ] Regenerate + commit `web/daml.js` (build step, not a test).

## Security Domain

security_enforcement enabled, ASVS L1, block_on high. [VERIFIED: config.json]

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Per-party JWT (desk plane) vs operator JWT (server-only); unchanged. New order entry stays on the desk's own token — never the operator token in the browser [VERIFIED: OrderTicket header, UI-SPEC Note 1] |
| V3 Session Management | no | No new sessions |
| V4 Access Control | yes | Aggregate feed is Operator-only-computed; only scalars cross. `Round.Clear` stays `controller operator`. Privacy structural (no observer on `Order`) [VERIFIED] |
| V5 Input Validation | yes | zod `.strict()` on new endpoint bodies (mirror the existing `openRoundBody`/`parseOrderBody` pattern); Daml `ensure` guards on `minQty`/`firmIf`/`limit`; belt-and-suspenders on any AI-surfaced numbers [VERIFIED: api.ts 141-164, agent.ts 36-46] |
| V6 Cryptography | no | No new crypto (proof-pack hashing is existing node:crypto; on-ledger sealing is Phase 10) |
| V7 Error Handling / Secrets | yes | Reuse the secret-free `ApiError` envelope; new endpoint must NOT echo the operator token/`ANTHROPIC_API_KEY`/env; extend the existing secret-sweep test [VERIFIED: api.ts 526-538, STATE.md secret sweeps] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Individual-order leak via aggregate feed | Information disclosure | Scalars-only + small-N guard; no candidate-price curve during open (Pitfall 1) |
| Operator token / API key in browser or response | Information disclosure | Desk plane uses per-party token; solver never returns the operator token; secret-free error envelope; ANTHROPIC_API_KEY server-only |
| Malformed order-type params bypass validation | Tampering | Daml `ensure` guards (minQty range, firmIf>0) + zod on the wire + on-ledger recompute rejects any impossible allocation |
| Tampered/wrong clearing for a new order type | Tampering | `Round.Clear` recompute-and-assert (already covers new types via the pure fn); `tamperClear` demo still proves rejection |
| DoS via exponential AON enumeration | DoS | Bounded to the tiny demo book; note scaling caveat; consider a hard cap on AON-order count in `ensure`/solver guard |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `daml` assistant | Daml build/test/codegen | ✓ (Git-Bash PATH only) | 3.4.11 | none — required; invoke via `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && ..."` |
| Node.js | solver + web + vitest | ✓ | 20.x | none |
| Canton LocalNet | end-to-end settle verification | ✓ (multi-GB Docker; :3975/:2975/:4975) | Canton 3.4 | pure `daml test` covers the clearing canary without LocalNet; full settle needs it |
| Solver service | AUCT-03 feed, AUCT-04 receipts, WOW-06 host view | ✓ | :4100 (NEVER :4000 — augur owns it) | offline caption already handles a down solver |
| Chrome/Edge (headless) | proof-pack PDF (AUCT-04 export) | ✓ (Phase 8) | system | HTML `window.print()` fallback already implemented |

**Missing dependencies with no fallback:** none. **With fallback:** LocalNet-free clearing validation via `daml test`; PDF→HTML print fallback.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Effective-limit encoding (keep `limit : Decimal`, treat noncomp as +∞/0) is preferable to `limit : Optional Decimal` for blast radius | Order-Type Encoding | Wrong choice = more construction-site churn OR an awkward Optional; both are recoverable, §4 unaffected either way |
| A2 | Powerset enumeration over AON/MAQ orders is acceptable for the demo book size | AON/MAQ | For a large book it's exponential; deferred by CONTEXT — only a demo-scale risk |
| A3 | Reference price is plumbed as a `Round.Clear` choice arg (config stub) | TCA Receipt | If mis-plumbed, only the labeled-stub benchmark is affected, not the proven surplus or §4 |
| A4 | A new `GET /round/:id/indicative` block (vs extending on-ledger `RoundStats`) is the cleaner aggregate surface | Aggregate Feed | Either works; on-ledger `RoundStats` adds archive+recreate churn — recoverable |
| A5 | bp formula `round((|limit−p*|/p*)*10000)` (pin exact form in RULEBOOK) | Deterministic Algorithms | A different but documented formula is fine provided Daml⇄TS identical |
| A6 | Conditional two-pass with provisional p\* as the firming reference is the intended semantics (matches CONTEXT verbatim) | Conditional | CONTEXT states this explicitly, so low risk; a pathological book could firm against a provisional p\* the final clear moves past — accepted, no iteration |

**Note:** A1–A6 are areas CONTEXT explicitly delegates to planner discretion ("exact Daml encoding … at the planner's discretion, provided success criteria + §4 invariant + Daml⇄TS parity hold"). None threaten the §4 canary.

## Open Questions

1. **Does an equal-limit long-side tie appear in any required new-type fixture (needing strict pro-rata leftover-to-largest)?**
   - Known: §4 has no equal-limit tie; the greedy `rationByPriority` is exact today.
   - Unclear: whether a mandated MAQ/conditional demo introduces one.
   - Recommendation: if a fixture needs it, implement leftover-to-largest in BOTH planes together with a golden test; otherwise keep the documented greedy rule and note the deferral in RULEBOOK.

2. **Should the AI `SYSTEM_PROMPT` learn the new rules?**
   - Known: the AI is additive/off the settlement path; a new-type round where the model disagrees just falls back to the deterministic clear (still correct, loses the `verified:claude` badge).
   - Recommendation: extend `SYSTEM_PROMPT` + `PROMPT.md` in verbatim sync ONLY if the demo wants the "verified" badge on new-type rounds; not required for correctness. Keep them synced if touched (existing Pitfall).

## Sources

### Primary (HIGH confidence — read directly this session)
- `daml/Umbra/Clearing.daml`, `Auction.daml`, `Roles.daml`, `Setup.daml`, `Tests.daml` — the clearing core, settlement, seeds, and canary
- `solver/src/auction.ts`, `api.ts`, `ledger.ts`, `agent.ts` — the TS mirror + solver surface
- `solver/src/auction.test.ts` — the 5 golden scenarios (incl. the 99-vs-100 trap test)
- `web/src/components/CrossingChart.tsx`, `OrderTicket.tsx`, `DeskColumn.tsx`, `web/src/lib/curve.ts`, `web/src/solver.ts` — both frontend planes
- `.planning/phases/09-.../09-CONTEXT.md`, `09-UI-SPEC.md`; `.planning/REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`; `daml/daml.yaml`; `CLAUDE.md`, `MEMORY.md`

### Secondary (MEDIUM-HIGH — official docs)
- Daml Smart Contract Upgrades — new record/template fields must be `Optional` and appended at the end; old contracts upgrade with `None` — https://docs.daml.com/upgrade/smart-contract-upgrades.html [CITED]

### Tertiary (LOW)
- none — no unverified web claims were relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack / no-new-deps: HIGH — verified from repo (daml.yaml, package usage, existing proof-pack/brief infra).
- Lockstep change map: HIGH — every coupled symbol read directly from source; the recompute-and-assert coupling is explicit in Auction.daml.
- Deterministic algorithms: MEDIUM-HIGH — the §4 reduction and trap-guard preservation are HIGH (read + tested); the exact AON/conditional encodings are recommended designs the planner may refine (CONTEXT delegates discretion), so MEDIUM on form, HIGH on constraints.
- Daml 3.x additive-field rule: HIGH — cited from official docs and consistent with the repo's fresh-DAR posture.
- Privacy pitfalls (feed/curve leak): HIGH — derived directly from what `candidatePrices`/`buildCurve` expose.

**Research date:** 2026-07-09
**Valid until:** ~2026-08-08 (30 days; stable in-repo core, no fast-moving external deps).
