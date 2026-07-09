# Phase 9: Auction Depth & Live Viz - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommendations auto-accepted per user delegation "intelligently pick good options")

<domain>
## Phase Boundary

Make the auction *real and legible*: richer institutional order types under an explicit, sovereign-grade rulebook; a privacy-safe live price-discovery view; and provable per-desk value. Built on the CURRENT v2 stack (Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 :3975; solver :4100; web :5173). **This phase changes the frozen `Order` data model and the clearing algorithm — the correctness-critical core — so the §4 fixture ($100.00, fills A=10 / B=8 / C=2) is the continuous guard on every change.**

**IN SCOPE:**
- **AUCT-01** richer order types: noncompetitive ("fill at clear"), minimum-acceptable-quantity / all-or-none, and conditional auto-firming — in addition to plain sealed limits
- **AUCT-02** the deterministic clearing rulebook (maximize matched volume → minimize imbalance → pro-rata at the marginal price) documented and enforced IDENTICALLY in `Clearing.daml` and the solver's `auction.ts`
- **AUCT-03** privacy-safe AGGREGATE indicative clearing price + net imbalance during the open window (never an individual order), updated as sealed orders arrive
- **AUCT-04** exportable per-desk best-execution / TCA receipt (fill vs limit vs reference, surplus in bp) with an on-ledger surplus≥0 proof
- **VIZ-01** a live supply/demand crossing visualization that assembles the aggregate curve as orders arrive and locks p\* at close
- **WOW-06** a cost-of-leakage simulator (same orders through a simulated public book → $ lost vs Umbra's sealed clear → $0 leaked)

**OUT OF SCOPE (later phases):** commit–reveal / tlock / ZK / time-machine (P10); Daml Finance, multi-buyer netting, KYC gating (P11); real on-chain / OIDC (P12); OTel / Vault / FIX / webhooks / RFQ / competing solvers (P13). Real market-data reference feed → Track B (a labeled stub is used here).

</domain>

<decisions>
## Implementation Decisions

### Order-Type Model (AUCT-01) — extends the frozen `Order` template ADDITIVELY
- Extend `Order` (Auction.daml) and `OrderView` (Clearing.daml) with an OPTIONAL `orderType` discriminator + its params, DEFAULTING to `Limit`. The §4 canonical orders are plain Limits → their serialization and the whole clearing reduce to the existing §8 → still $100.00 / A=10 / B=8 / C=2. Existing field names (`desk, side, quantity, limit`) are preserved; new fields are additive/`Optional` so v1 tests and the frozen data contract still hold.
- Four order types:
  - **Limit** — existing (side, integer qty, decimal limit).
  - **Noncompetitive** — side, qty, NO limit; always willing at the clearing price ("fill at clear").
  - **AllOrNone / MAQ** — side, qty, limit, `minQty`; participates only if its integer fill ≥ `minQty`. All-or-none is the special case `minQty == qty`.
  - **Conditional (auto-firming)** — side, qty, limit, `firmIf` predicate (a price band, e.g. buy firms only if clearing ≤ threshold; sell firms only if clearing ≥ threshold). Firms or drops deterministically at close.

### Clearing Rulebook (AUCT-02) — the deterministic core, mirrored in TS + re-verified on-ledger
- Objective, applied IN ORDER: (1) maximize matched volume; (2) among max-matched candidate prices, minimize |demand − supply|; (3) lower price. Then ration the long side by price priority (noncompetitive first) then pro-rata at the marginal price (deterministic leftover-to-largest). This generalizes the existing `choosePStar` + `rationByPriority` — the max-matched-subset tie-break TRAP guard (filter to top-matched prices BEFORE the imbalance/price rank) must be preserved.
- **Noncompetitive** contributes to demand/supply at ANY price and is allocated with top priority (before competitive orders), capped at its qty — like US Treasury noncompetitive tenders.
- **AllOrNone / MAQ**: at each candidate price, an AON/MAQ order is included only if its resulting integer fill ≥ `minQty`, else excluded. Determinism comes from BOUNDED candidate-price enumeration (the order book is tiny): for each candidate p, compute the feasible matched volume under the AON/MAQ inclusion constraint, then apply the (volume, imbalance, price) tie-break. Document the exact evaluation order.
- **Conditional auto-firming**: a single, deterministic TWO-PASS rule (NOT a fixpoint iteration) — (a) compute a PROVISIONAL clear over the firm (non-conditional) orders; (b) evaluate each conditional's `firmIf` against the provisional p\*; (c) firm the qualifying conditionals + drop the rest; (d) recompute the FINAL clear; (e) `Round.Clear` re-verifies the final allocation on-ledger. Document that the provisional p\* is the reference for firming.
- **Enforcement + parity**: the rulebook is written to a new `RULEBOOK.md` (or `daml/RULEBOOK.md` / solver doc) and enforced BYTE-IDENTICALLY in `Clearing.daml` and `solver/src/auction.ts` (CLEAR-05 parity), asserted by the golden-eval suite (extended from Phase 8's TRUST-01). The §4 canary runs after every change.
- **CRITICAL PATH / RISK**: `Order` template ⇄ `Round.Clear` on-ledger re-verification ⇄ `Clearing.daml` ⇄ `auction.ts` ⇄ all Daml + TS clearing/settlement tests must move in LOCKSTEP. If a new order type cannot be made deterministic + Daml-mirrorable + §4-safe within this phase, scope it to a documented, tested subset rather than break the invariant. The single-funded-buyer + operator-custody settlement MVP invariants are NOT relaxed here (that is Phase 11) — Phase 9 changes the ORDER MODEL and CLEARING MATH, not the settlement primitives.

### Aggregate Indicative Preview + Live Crossing (AUCT-03, VIZ-01)
- During the open window the solver (Operator — it can read the whole sealed batch) publishes AGGREGATE scalars ONLY: an indicative clearing price, the net imbalance (Σ buy qty − Σ sell qty), and an estimated matched volume. It NEVER publishes or derives an individual order to any desk.
- Exposed via an aggregate-only endpoint (extend the solver API) and/or an extended `RoundStats` (which already carries the privacy-safe count) — the browser shows the indicative price + imbalance; individual orders never leave the solver process.
- **Small-N privacy guard**: publish the indicative price only once there are ≥2 orders on the relevant side (or show a coarse bucket) so the aggregate cannot be used to back out a single order. Document this caveat explicitly (it is a real privacy edge with 1 order).
- **VIZ-01**: extend the existing hand-rolled `CrossingChart` SVG (from Phase 6) to assemble the aggregate step demand/supply curve as orders arrive during the window, then LOCK p\* at close (the reveal). Rides on the aggregate feed + the existing solve-preview.

### Best-Ex / TCA Receipt + Surplus Proof + Leakage Sim (AUCT-04, WOW-06)
- **TCA receipt** per desk: `{fillQty, clearingPrice, ownLimit, referencePrice, improvementVsLimitBp, improvementVsReferenceBp, surplus}`. Exportable — extends `TradeConfirmation` fields and is embedded in the Phase-8 proof-pack.
- **Reference price**: a configurable benchmark input (stub — e.g. a pre-auction mid ≈ $100 in config), CLEARLY LABELED as a reference; a real market-data feed is deferred to Track B. For §4 the reference ≈ $100 so surplus-vs-reference is small but the mechanics are proven.
- **On-ledger surplus≥0 proof**: `Round.Clear` already enforces limit-compliance (at a uniform p\*, buyers pay ≤ their limit and sellers receive ≥ their limit). Surface an EXPLICIT checked field/assertion on `TradeConfirmation` ("execution at least as good as limit" / `surplusVsLimitBp ≥ 0`). Surplus-vs-LIMIT is structurally ≥ 0; surplus-vs-REFERENCE may be negative and is labeled distinctly.
- **WOW-06 cost-of-leakage simulator**: a CLIENT-SIDE simulation running the SAME order set through a naive public order book (sequential marketable execution → slippage / front-running price impact → $ lost) beside Umbra's sealed uniform clear ($0 leaked), showing the $ saved. Purely illustrative and clearly labeled a simulation (no real venue).

### Claude's Discretion
- Exact Daml encoding of the `orderType` variant (sum type vs optional-fields record), endpoint names, `RoundStats`-vs-new-endpoint choice for the aggregate feed, and the precise TCA/receipt field layout are at the planner's discretion, provided the success criteria + §4 invariant + Daml⇄TS parity hold.
- The precise AON/MAQ candidate-enumeration algorithm, as long as it is deterministic, bounded, Daml-mirrorable, and documented in RULEBOOK.md.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **daml/Umbra/Clearing.daml** — the pure §8 core: `OrderView{desk,side,quantity,limit}`, `demandAt/supplyAt/matchedAt`, `candidatePrices`, `choosePStar` (with the max-matched-subset tie-break trap guard), `rationByPriority`, `computeClearing`. THE thing AUCT-01/02 extend. Kept pure (no Update/Script) so it stays testable + TS-mirrorable.
- **daml/Umbra/Auction.daml** — `Order` template (signatory operator+desk, NO observer = private), `Round.Clear` (recompute-§8-and-assert backstop + atomic DvP + per-desk TradeConfirmation), `RoundStats` (count-only, observer=desks), `TradeConfirmation` (observer=desk). AUCT-01 extends `Order`; AUCT-03 extends `RoundStats`; AUCT-04 extends `TradeConfirmation` + `Round.Clear`.
- **solver/src/auction.ts** — the 1:1 TS mirror of Clearing.daml (must stay byte-identical in results). Extended in lockstep.
- **solver/src/api.ts / agent.ts / ledger.ts** — solver surface; AUCT-03 aggregate feed + AUCT-04 receipt data flow through here. Phase 8 added the golden-eval suite (extend it for the new order types + rulebook).
- **web/src/views/TheatreView.tsx + CrossingChart** (Phase 6, hand-rolled SVG) — VIZ-01 extends this. **web/src/views/DeskView.tsx / OrderTicket** — AUCT-01 order-type entry UI. **web/src/views/SettlementView.tsx** — AUCT-04 TCA receipt + WOW-06 leakage sim surface. **web/src/lib/curve.ts** — curve math for the chart.

### Established Patterns
- **Verify-don't-trust + on-ledger re-verification**: the AI/solver proposal is always recomputed by `Round.Clear`. Any new clearing logic MUST be mirrored on-ledger or it cannot settle.
- **Daml⇄TS parity (CLEAR-05)**: `Clearing.daml` and `auction.ts` produce identical results; golden tests assert it. Non-negotiable for new order types.
- **Privacy is structural** (signatory/observer): the aggregate feed must be computed server-side and expose only scalars — never route an individual order to a desk.
- **§4 as continuous canary**: `test_clears_at_100` + the TS §4 test run after every change.
- Pure-function math leaf module + additive template fields (the Phase 1/2 discipline) — follow it so serialization + existing tests survive.

### Integration Points
- New order types: `Order` template + `Setup.daml`/seed (keep §4 seed as plain Limits) + `Clearing.daml` + `auction.ts` + `Round.Clear` re-verify + Daml tests + TS tests + the golden suite — all in lockstep.
- Aggregate feed: solver computes from the sealed batch → new endpoint / extended `RoundStats` → web indicative panel + `CrossingChart`.
- TCA receipt: `Round.Clear` writes surplus fields → `TradeConfirmation` → web receipt + proof-pack.
- Leakage sim: pure client-side lib (like the existing curve/balance libs) + a Settlement/Theatre panel.

</code_context>

<specifics>
## Specific Ideas
- The §4 fixture MUST remain $100.00 / A=10 / B=8 / C=2 through the entire order-model + clearing change — it is the single continuous correctness reference and the money-shot number.
- The rulebook must be a written, sovereign-grade document (RULEBOOK.md) AND the code — "documented and enforced identically" is the requirement; the two must not drift.
- The aggregate indicative feed is a genuine privacy surface: aggregate-only, small-N guarded. Do not leak an individual order to win a nicer live chart.
- Surplus-vs-LIMIT (structurally ≥0, on-ledger provable) and surplus-vs-REFERENCE (a labeled benchmark, may be negative) are DIFFERENT numbers — keep them distinct in the receipt.
- New Daml order-model work needs `daml build` + `daml test` (daml is Git-Bash-PATH-only on this box: `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml test"`).

</specifics>

<deferred>
## Deferred Ideas
- Real market-data reference-price feed for TCA → Track B (Phase 13); a labeled config stub is used here.
- Combinatorially-optimal all-or-none for large books → bounded candidate enumeration is sufficient for the demo's small order count; note the scaling caveat in RULEBOOK.md.
- Multi-buyer / multi-seller netting + Daml Finance settlement → Phase 11 (Phase 9 keeps the operator-custody + single-funded-buyer settlement MVP; it changes the ORDER MODEL + CLEARING, not the settlement primitives).
- Cryptographic sealing of the aggregate feed (so even the operator can't see individuals) → Phase 10 (tlock/commit–reveal). Phase 9's aggregate trusts the Operator, consistent with the current model.
- Order cancel/replace → Phase 13 / OPS-03 (Phase 9 keeps one order per desk per round).

</deferred>
