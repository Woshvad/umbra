# Phase 2: Clear & Settle On-Ledger - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous, recommended answers accepted) — decisions are fully locked by spec §8/§10/§4/§16; the "recommended" answers ARE the spec, reproduced verbatim.

<domain>
## Phase Boundary

Make the ledger the source of truth and the atomicity boundary. Implement the real `Round.Clear` choice (replacing the Phase-1 placeholder) so it (1) **re-verifies** the proposed `(clearingPrice, allocations)` against the sealed `Order`s using the §8 algorithm, and (2) **settles the whole batch delivery-versus-payment in one all-or-nothing transaction** — reassigning BONDX & USDCx at p\* and issuing a per-desk `TradeConfirmation`. The canonical §4 fixture must clear at **exactly $100.00** with fills A=10 / B=8 / C=2.

**In scope:** the §8 deterministic clearing algorithm implemented in Daml (compute p\* + allocation, used for on-ledger re-verification + the tests), the full `Round.Clear` body (verify → atomic DvP settlement → TradeConfirmations → status=Settled), and the four Daml Script tests (§16 tests 1–4).

**Explicitly NOT in scope (later phases):** the TypeScript solver-side §8 implementation (Phase 4 — CLEAR-02/03/SOLV); the AI agent (Phase 5); per-party JWT privacy tests test_privacy_orders/confirmations (Phase 3 — though the privacy is already structural from the Phase-1 field shapes); any frontend.
</domain>

<decisions>
## Implementation Decisions

### §8 clearing algorithm in Daml (the deterministic core — MUST be exact, copy spec §8 verbatim)
- **Candidate prices:** the sorted set of all DISTINCT limit prices appearing in buys ∪ sells. (§4: {99, 100, 101}.)
- **Per candidate price p:** `demand(p)` = Σ qty of buys with `limit ≥ p`; `supply(p)` = Σ qty of sells with `limit ≤ p`; `matched(p)` = `min(demand(p), supply(p))`.
- **Choose p\*:** the price maximizing `matched(p)`. **Two-level tie-break, IN ORDER:** (a) among the max-matched candidates ONLY, minimize `|demand(p) − supply(p)|`; (b) if still tied, choose the **lower** price. Round p\* to 2 decimals. **CRITICAL TRAP:** tie-break (a) must be applied ONLY among the candidates that achieve max matched volume — applying it across all prices clears the §4 fixture at 99 instead of 100. (§4 proof: matched is 10 at both 100 and 101; |demand−supply| = 3 at both; tie → lower = **100**.)
- **Allocation at p\*:** eligible buys = buys with `limit ≥ p*`; eligible sells = sells with `limit ≤ p*`; `traded = matched(p*)`. The **short side fills fully**; the **long side is rationed by price priority** (most aggressive first: lowest-limit sells / highest-limit buys), then **pro-rata** for ties, with integer rounding that never exceeds `traded` — **leftover unit(s) go to the largest order** (document this rule; it must be identical in Daml and, later, TS). (§4: short side = buys = A fills 10; long side = sells B(99)+C(100) rationed by price priority → B fills 8, C fills 2, C residual 3.)
- **Output:** `clearingPrice = p*` and `[Allocation]` (each desk's filledQty + side). Implement as pure Daml functions (recommend a dedicated module, e.g. `Umbra/Clearing.daml`, importable by `Auction.daml`/`Tests.daml` and, later, mirrored in TS).

### `Round.Clear` body (replace the Phase-1 placeholder) — spec §10 atomic DvP
The choice signature stays frozen (`clearingPrice : Decimal`, `allocations : [Allocation]`, controller operator → `ClearResult`). In ONE transaction, the Operator:
1. **Re-verify** the proposed `(clearingPrice, allocations)` against the sealed `Order`s: recompute §8 and assert the proposal matches (or, equivalently, assert the proposal satisfies max-matched-volume, per-order limit compliance, and conservation). Reject (fail the choice) anything inconsistent — this is the on-ledger backstop (CLEAR-05, SETL-04).
2. **Reassign `Asset`s (DvP):** move BONDX from sellers→buyer and USDCx from buyer→sellers at p\*, using `Split`/`Merge`/`Reassign` under sole Operator authority (operator-custody model — no counterparty signatures needed). Split exact amounts where holdings exceed the traded quantity.
3. Archive/mark the round's `Order`s (Filled / PartiallyFilled / Unfilled).
4. Create a `TradeConfirmation` per participating desk (filledQty, clearingPrice, cashMoved; observer = that desk only).
5. Set `Round.status = Settled`.
Because it is one Daml transaction it is **atomic by construction** — any failing leg (e.g., a seller lacking the asset) rolls back the whole thing (SETL-03).

### §4 settlement arithmetic (assert exactly)
- p\* = 100.00; fills A buys 10, B sells 8, C sells 2 (C residual 3 unfilled).
- Cash: A pays 10×100 = 1000 USDCx; B receives 8×100 = 800; C receives 2×100 = 200 (conserved).
- Post-settlement balances: **A: 10 BONDX / 4000 USDCx · B: 12 BONDX / 1800 USDCx · C: 13 BONDX / 1200 USDCx.**

### Tests (`Tests.daml`, spec §16 tests 1–4) — all must pass under `daml test`
- `test_clears_at_100`: run §4 fixture → assert `clearingPrice == 100.0`, fills A=10/B=8/C=2, C residual 3.
- `test_settled_balances`: after `Round.Clear`, assert balances A:10/4000, B:12/1800, C:13/1200; cash + assets conserved.
- `test_atomicity`: a round where a seller lacks the asset → `Clear` fails and NO balances change (all-or-nothing).
- `test_clear_rejects_bad_allocation`: an allocation violating max-volume / limits / conservation is rejected by `Round.Clear`.

### Claude's Discretion
- Module organization for the §8 functions (new `Clearing.daml` vs functions in `Auction.daml`); exact helper signatures; the leftover-rounding implementation detail (as long as deterministic + matches the documented rule); how the test constructs the sealed-order list (reuse `runCanonicalRound` from Phase 1 or build inline); ordering of the DvP legs within the transaction.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 — all compiling, `daml test` green)
- `daml/Umbra/Asset.daml` — `Asset` (operator-custody) with `Split`/`Merge`/`Reassign` (operator authority) — the settlement primitives `Round.Clear` will use.
- `daml/Umbra/Auction.daml` — `Order` (sig operator,desk), `Round` (with the `Clear` placeholder to replace + `CloseRound`), `RoundStats`, `TradeConfirmation` (obs desk), data `Side`/`OrderStatus`/`RoundStatus`/`Allocation`/`ClearResult`.
- `daml/Umbra/Roles.daml` — `Venue.SubmitOrder`.
- `daml/Umbra/Setup.daml` — `initialize` (seeds §4), `runCanonicalRound` (submits the 3 §4 orders), `exportParties`.
- `daml/Umbra/Tests.daml` — `test_setup_seeds`, `test_asset_split_merge` (extend this file with the 4 new tests).

### Established Patterns
- Daml SDK 2.10.4; `daml build` / `daml test` are the gates (exit code authoritative). `daml` on PATH via `~/bin/daml` shim. No `make`.
- `Decimal = Numeric 10` — all money/price literals need a decimal point.
- Operator-custody: Operator is the sole signatory of every `Asset`, so it can Split/Merge/Reassign all holdings inside `Round.Clear` without counterparty authorization — this is what makes single-transaction atomic DvP simple.

### Integration Points
- `Round.Clear`'s frozen signature is the cross-layer contract the Phase-4 solver will exercise. Keep `Allocation`/`ClearResult` shapes stable.
</code_context>

<specifics>
## Specific Ideas
- The §4 fixture clearing at **exactly $100.00** is the single continuous correctness reference for the whole build — `test_clears_at_100` is the guardrail; if it ever clears at 99, the tie-break is wrong (applied outside the max-matched set).
- Keep the §8 Daml functions pure and standalone so Phase 4 can mirror them 1:1 in TypeScript and assert identical results (CLEAR-05).
</specifics>

<deferred>
## Deferred Ideas
- TypeScript §8 implementation + the TS-vs-Daml equality assertion → Phase 4 (CLEAR-02/03, SOLV-05).
- Per-party JWT privacy tests (test_privacy_orders/confirmations) + the 3-up view → Phase 3.
- The AI solver proposing the clearing → Phase 5 (Round.Clear just needs to accept a verified allocation; who computes it — test harness now, TS solver in P4, AI in P5).
</deferred>
