---
phase: 11-settlement-institutional-grade
plan: 05
subsystem: daml-settlement-core
tags: [DFIN-01, DFIN-02, DFIN-03, COMP-01, round-clear, batch-settle, conservation, eligibility-gate, holding-bond]
requires:
  - Umbra.Holding (Holding + Split/Reassign + lock — 11-01)
  - Umbra.Instrument (InstrumentId {issuer,id} — 11-01)
  - Umbra.Compliance (DeskEligibility + assertDeskEligible — keyless gate, 11-02)
  - Umbra.Settlement (buildGrossInstructions/netLegs/conservationOk/settleBatch — 11-04)
provides:
  - "Round.Clear: generalized N-buyer × M-seller Batch settle (settleBatch) + per-instrument conservation asserts + cashInstrument/bondInstrument params; Asset retired from the live path"
  - "OrderCommitment/ForfeitBond bond migrated Asset -> cash Holding (operator-custody lock)"
  - "Venue.SubmitOrder/CommitOrder COMP-01 eligibility gate + new gated Venue.IssueHolding"
  - "Setup: mintHolding seed + A/B/C DeskEligibility seed + Holding-migrated commit-reveal"
  - "Tests: all §4/settlement/commit-reveal/bond tests migrated to Holdings + the new Clear signature"
affects:
  - daml/Umbra/Auction.daml
  - daml/Umbra/Roles.daml
  - daml/Umbra/Setup.daml
  - daml/Umbra/Tests.daml
tech-stack:
  added: []
  patterns:
    - "Round.Clear delegates DvP legs to Umbra.Settlement.settleBatch (gross legs, atomic one-transaction)"
    - "per-instrument conservationOk assert (gross + netted) replaces the single-funded-buyer shortcut"
    - "keyless on-ledger eligibility gate: choice takes a DeskEligibility ContractId, fetch + assertDeskEligible (D7 Option-B)"
    - "operator-custody bond lock on a Holding (lock field None; immovability via controller-operator, RESEARCH A5)"
decisions:
  - "settleBatch settles GROSS legs on-ledger (each desk self-funds its own obligation); netLegs is asserted conserving as a pure transform but NOT settled on-ledger (netted settlement needs a pre-funded custodian, absent in the §4 operator-custody topology) — the 11-04-established path"
  - "Eligibility gate is keyless fetch-by-cid + assertDeskEligible, NOT fetchByKey — contract keys are unsupported on Canton LF 2.1 (11-02 environmental deviation carried forward)"
  - "Bond Holding lock field left None; the immovability guarantee is controller-operator custody (A5), because lock=Some would block ForfeitBond's Reassign and Holding.daml is out of this plan's edit scope"
  - "The coupled Round.Clear-signature change (Auction/Roles/Setup/Tests) is committed as ONE commit so daml build stays green (no ordering compiles independently)"
key-files:
  created: []
  modified:
    - daml/Umbra/Auction.daml
    - daml/Umbra/Roles.daml
    - daml/Umbra/Setup.daml
    - daml/Umbra/Tests.daml
metrics:
  duration: ~30 min
  tasks: 3
  files: 4
  completed: 2026-07-10
---

# Phase 11 Plan 05: Settlement-Core Migration (Round.Clear Batch settle + COMP-01 gate + token-agnostic cash) Summary

The heaviest Phase-11 plan: `Round.Clear` now settles a token-agnostic, conserving,
multi-party **Batch of Instructions** (via `Umbra.Settlement.settleBatch`) built from the
verified allocation — retiring operator-custody `Asset` from the live settlement path — with
the §8 recompute-and-assert keystone intact. The single-funded-buyer `abort` is gone; per-instrument
`conservationOk` asserts fail loudly on imbalance. `Round.Clear`/`CommitOrder` take a
`cashInstrument`/`bondInstrument` `InstrumentId` (no hardcoded `"USDCx"`). Participation is gated
on-ledger by `DeskEligibility` at `SubmitOrder`, `CommitOrder`, and the new `Venue.IssueHolding`.
The Phase-10 bond migrates from `Asset` to a cash `Holding`. **The §4 fixture still clears
`$100.00` / A=10 · B=8 · C=2 and settles atomically** — `daml build` + `daml test` fully green.

**§4 CANARY RESULT: PASS** — `$100.00`, fills A=10 / B=8 / C=2, settled balances
A 10/4000 · B 12/1800 · C 13/1200, through both `test_clears_at_100` (pure §8) and
`test_commit_reveal_clears_at_100` (commit → reveal → clear on Holdings).

## What Was Built (commit `91b3573`)

### Task 1 — `Round.Clear` Batch settle + Holding bond (Auction.daml)
- **New `Clear` choice signature** — frozen fields (`clearingPrice`, `allocations`, `orderCids`,
  `referencePrice`, controller `operator`, → `ClearResult`) UNCHANGED; the Asset settlement inputs
  replaced by `buyerCashCids : [(Party, ContractId Holding)]`, `sellerBondCids : [(Party, ContractId Holding)]`,
  plus `cashInstrument : InstrumentId` + `bondInstrument : InstrumentId` (DFIN-03).
- **Steps 0–1 verbatim** (lifecycle guard + fetch orders → `OrderView` → `computeClearing` → assert
  price/allocation/Σbuy==Σsell) — the verify-don't-trust keystone is byte-intact.
- **Settlement half rewritten (DFIN-01/02)**: the `fundedBuyers`/`abort "exactly one funded buyer"`
  block is DELETED. From the verified allocation: `buildGrossInstructions priceDec allocations
  bondInstrument cashInstrument` → `assertMsg (conservationOk legs [...] && conservationOk (netLegs
  operator legs) [...])` → `settleBatch operator legs sources`, where `sources` maps each buyer's
  cash Holding and each seller's bond Holding. `settleBatch` verifies DvP integrity and threads each
  source across its receivers in the ONE Clear transaction (atomic). Steps 3–5 (`Retire`, per-desk
  `TradeConfirmation` with the `surplusVsLimit >= 0` on-ledger assert, `Round` → `Settled`,
  `ClearResult`) are byte-unchanged.
- **Bond migration (Pitfall 2)**: `OrderCommitment.bondCid : ContractId Asset → ContractId Holding`;
  `ForfeitBond : ContractId Holding` reassigns the locked cash Holding to the operator;
  `RevealOrder`'s `serializeOrder` + sha256 `assertMsg` body is BYTE-UNCHANGED. Dead `moveExact`/`fillFor`
  (Asset helpers) removed; `import Umbra.Asset` dropped, `Instrument`/`Holding`/`Settlement` imported.

### Task 2 — Eligibility gate + gated issuance + Holding bond (Roles.daml)
- **`SubmitOrder` and `CommitOrder`** now take an `eligCid : ContractId DeskEligibility` and, after
  the `desk elem desks` check, `fetch eligCid` + `assertDeskEligible operator desk elig` (COMP-01).
  The keyed fetch is authorized because `Venue` is `signatory operator` (operator authority co-flows,
  Pitfall 3). `CommitOrder.bondCid : ContractId Holding` + a `cashInstrument : InstrumentId` param;
  the bond-integrity check is `bond.owner == desk && bond.instrument == cashInstrument`.
- **New `nonconsuming choice Venue.IssueHolding` (`controller operator`)** — the SECOND COMP-01
  enforcement point: `fetch eligCid` + `assertDeskEligible operator owner elig` before creating the
  receiver's `Holding` (`lock = None`). An ineligible receiver's holding-receipt is rejected on-ledger.
  `AnchorProof` unchanged.

### Task 3 — Holding-migrated seed + tests; §4 clears $100.00 (Setup.daml, Tests.daml)
- **Setup.daml**: `mintAsset → mintHolding`; `bondInstrumentOf`/`cashInstrumentOf : Party ->
  InstrumentId` (`BONDX`/`USDCx`, operator-issued); `initialize` seeds A/B/C `DeskEligibility`
  (`accredited=True, sanctionsClear=True`) BEFORE any order + mints the EXACT §4 Holdings; `findEligCid`
  keyless lookup threaded into every submit/commit site; `CommitRevealSeed`/`seedCommitRevealRound`
  migrated to Holdings (`buyerCashCids`, cash carve via `Holding.Split`, `CommitOrder` with
  `cashInstrument`+`eligCid`).
- **Tests.daml**: `test_setup_seeds` asserts the 5 §4 Holdings; `test_asset_split_merge` →
  `test_holding_split_merge`; `SeedResult`/`seedAndClose`/`findHoldingCid` migrated to Holdings +
  eligibility-gated submits; `test_settled_balances`/`test_surplus_nonneg`/`test_atomicity`/
  `test_clear_rejects_bad_allocation`/`test_privacy_confirmations`/`test_commit_reveal_clears_at_100`
  use the new `Clear` signature and query `@Holding`; the commit-reveal/bond tests (`test_reveal_mismatch_rejected`,
  `test_bond_returned`, `test_bond_forfeit`) use the Holding bond + gated `CommitOrder`.

## Verification

| Check | Result |
|-------|--------|
| `cd daml && daml build` | green (`Created .daml\dist\umbra-0.1.0.dar`) |
| `cd daml && daml test` | green, **exit 0** |
| §4 canary `test_clears_at_100` | ok — **$100.00**, A=10/B=8/C=2 |
| §4 canary `test_commit_reveal_clears_at_100` | ok — $100.00, finals A 10/4000 · B 12/1800 · C 13/1200 |
| `test_settled_balances` | ok — §4 finals + conservation (35 BONDX / 7000 USDCx) + surpluses A=10/B=8/C=0 |
| `test_atomicity` | ok — underfunded seller leg rolls back the whole Holding ACS |
| `test_clear_rejects_bad_allocation` | ok — bad alloc (A=12) + wrong price (99.0) both rejected |
| `test_eligibility_issue` / `test_netting_conserves` | ok / ok |
| `test_bond_returned` / `test_bond_forfeit` / `test_holding_split_merge` | ok / ok / ok |
| `grep -c "exactly one funded buyer" Umbra/Auction.daml` | 0 (single-buyer guard removed) |
| `grep -c "cashInstrument" Umbra/Auction.daml` | 6 |
| `settleBatch` in `Round.Clear` | present (4 refs) |
| `OrderCommitment.bondCid : ContractId Holding` | yes |

## Deviations from Plan

### 1. [Rule 3 — coupled commit] All four files committed together
The `Round.Clear` signature change couples Auction ⇄ Roles ⇄ Setup ⇄ Tests — no ordering of the four
files compiles independently, so per-task commits would leave a red `daml build` between them.
Committed as ONE commit (`91b3573`) to honor the "keep `daml build` green between commits" invariant.
The three plan tasks are all present in that commit; described separately above.

### 2. [Environmental — carried from 11-02] Keyless eligibility gate, not `fetchByKey`
The plan action / RESEARCH Pattern 3 specified `fetchByKey @DeskEligibility (operator, desk)`. Contract
keys are UNSUPPORTED on Daml 3.4.11 / Canton LF 2.1 (11-02's proven environmental deviation). The gate
is therefore the keyless **`fetch eligCid` + `assertDeskEligible operator desk elig`** (D7 Option-B — the
choice takes the credential ContractId), which preserves every security property (a desk cannot
self-issue; a mismatched-desk credential is rejected by `assertDeskEligible`). The plan's verify grep
`fetchByKey @DeskEligibility` is 0 because the feature does not exist on this line; met in spirit via
`assertDeskEligible` (6 refs in Roles).

### 3. [Design — carried from 11-04] `settleBatch` settles GROSS legs; `netLegs` proven pure
The plan action text read "`settleBatch operator (netLegs …)`". Settling the netted legs on-ledger
requires a **pre-funded settlement custodian** (the operator would have to source its net-delivery legs
before receiving), which the §4 operator-custody topology does not provide, and `settleBatch`'s fold
only draws from the fixed `sources` map (it does not re-source newly-received holdings). So — exactly as
11-04 established and its `test_netting_conserves` proves — `Round.Clear` settles the **gross** legs
(each desk self-funds its own obligation, the natural bilateral DvP), while `conservationOk` is asserted
on BOTH the gross legs AND `netLegs operator legs` (netting proven conserving as a pure transform for the
topology/receipts). Every must-have is met: atomic Batch settle, per-instrument conservation (fail-loud),
gross derivable, netting one-leg-per-(party,instrument). `netLegs` remains the derivable projection.

### 4. [A5 — bond lock] Operator-custody lock (Holding `lock` field left `None`)
The bond `Holding` is immovable-by-the-desk because every Holding choice is `controller operator`
(exactly the old Asset guarantee, proven by `test_bond_returned`'s `submitMustFail` desk-Reassign).
The `lock : Optional Text` field is left `None`: setting `lock = Some _` would also block the operator's
own `ForfeitBond` `Reassign` (the generic mutating choices refuse a locked holding by design — 11-01),
and adding an unlock choice would edit `Holding.daml`, which is outside this plan's edit scope
(files_modified = Auction/Roles/Setup/Tests). RESEARCH A5 explicitly sanctions this fallback.

### 5. Test rename
`test_asset_split_merge` → `test_holding_split_merge` (LEDG-03 conservation now proven on `Holding`,
which carries the same Split/Merge plus the lock guard). `Asset.daml` stays byte-untouched in the DAR
for history (`sandbox-mvp`).

## Threat Surface

All plan `<threat_model>` mitigations are implemented on-ledger:
- **T-11-05-COMP** — `assertDeskEligible` at `SubmitOrder`, `CommitOrder`, `Venue.IssueHolding`.
- **T-11-05-CONSV** — per-instrument `conservationOk` assert (gross + netted) replaces the single-buyer shortcut.
- **T-11-05-BADALLOC** — steps 0–1 recompute-§8-and-assert backstop unchanged, runs BEFORE the batch build.
- **T-11-05-BOND** — bond is an operator-custody cash Holding; `ForfeitBond` reassigns it to the operator.
- **T-11-05-CANARY** — `test_clears_at_100` / `test_commit_reveal_clears_at_100` are green.

No new threat surface beyond the plan's register.

## Honest Limitations / Boundaries (recorded)

- **Not yet wired to solver/web.** The `Round.Clear` signature change is Daml-only this plan
  (files_modified = 4 daml files). `solver/src/ledger.ts` `settle()` still builds the OLD Clear args
  and `web/daml.js/` bindings are stale — the live-wiring + `daml codegen js` regen (fresh-clone
  invariant) is a downstream Phase-11 step, not this plan's scope.
- **Negative eligibility-rejection tests are 11-06.** This plan wires the gate and proves the §4/positive
  path green; the on-ledger `submitMustFail` rejection tests (ineligible submit/commit/holding-receipt)
  land in 11-06 (per 11-02's plan).
- **Netted-hub on-ledger settlement (pre-funded CCP)** remains the derivable-but-unsettled path
  (Deviation 3); `netLegs` is proven conserving purely.
- **CN Token Standard conformance ≠ wallet interop** (11-01 boundary, unchanged).

## Notes for Downstream Plans

- **11-06 (negative tests):** add `submitMustFail` tests for an ineligible desk at `SubmitOrder`,
  `CommitOrder`, and `Venue.IssueHolding` (revoke or seed `accredited=False`, thread that cid).
- **Solver/web wiring:** update `ledger.ts` `settle()` to gather `buyerCashCids`/`sellerBondCids`
  (Holding cids) + pass `cashInstrument`/`bondInstrument` + per-desk `eligCid`; regenerate + commit
  `web/daml.js/`.

## Self-Check: PASSED
- Modified files exist: `daml/Umbra/{Auction,Roles,Setup,Tests}.daml` — all FOUND.
- Commit exists: `91b3573` — FOUND in `git log` (author/committer = woshvad, no Claude attribution).
- `daml build` green; `daml test` exit 0; §4 canary (`test_clears_at_100`,
  `test_commit_reveal_clears_at_100`, `test_settled_balances`, `test_atomicity`) all `ok`.
