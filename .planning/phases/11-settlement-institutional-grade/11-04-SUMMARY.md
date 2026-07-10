---
phase: 11-settlement-institutional-grade
plan: 04
subsystem: daml-settlement
tags: [DFIN-02, DFIN-03, settlement, batch, instruction, netting, conservation, atomic-dvp]
requires:
  - Umbra.Holding (Holding + Split/Reassign + moveExactHolding — 11-01)
  - Umbra.Instrument (InstrumentId {issuer,id} — 11-01)
  - Umbra.Clearing (Allocation/Side — leaf math types)
  - Auction.daml moveExact + single-buyer Round.Clear settle legs (generalized pattern source)
provides:
  - Umbra.Settlement (Instruction data + buildGrossInstructions + netLegs + conservationOk + settleBatch)
  - moveThread (remainder-threading Holding move helper)
  - test_netting_conserves (2x2 conservation + atomic rollback golden)
affects:
  - daml/Umbra/Tests.daml (new SettleHarness test template + test_netting_conserves)
tech-stack:
  added: []
  patterns:
    - "pure Batch/Instruction settlement layer (build gross -> net -> conserve -> settle atomically)"
    - "multilateral netting through a settlement custodian (CCP) -> one net leg per (party, instrument)"
    - "remainder-threading source-holding fold to settle N-buyer x M-seller legs in one Update"
key-files:
  created:
    - daml/Umbra/Settlement.daml
  modified:
    - daml/Umbra/Tests.daml
decisions:
  - "netLegs takes an explicit settlement custodian (CCP) — the only way to guarantee exactly one net leg per (party, instrument); the plan's [Instruction]->[Instruction] sketch is refined to Party->[Instruction]->[Instruction]"
  - "settleBatch settles GROSS legs on-ledger (each desk self-funds its own obligation, the natural bilateral DvP); netLegs is proven as a pure conserving transform. Netted-hub on-ledger settlement (pre-funded CCP) is settleBatch-compatible and left for the wired path"
  - "moveThread surfaces the source remainder (moveExactHolding discards it) so one holding can be debited across several receivers in one transaction"
  - "SettleHarness is a test-only nonconsuming choice — a Script cannot submit a raw Update; production caller is Round.Clear (11-05)"
metrics:
  duration: ~20 min
  tasks: 2
  files: 2
  completed: 2026-07-10
---

# Phase 11 Plan 04: Batch/Instruction Settlement Layer Summary

A pure, token-agnostic **Batch/Instruction settlement layer** (`Umbra.Settlement`) that transforms a
verified allocation at the uniform clearing price p* into `[Instruction]` DvP legs, nets them per
`(party, instrument)` through a settlement custodian (default-on, gross still derivable), proves
per-instrument conservation, and `settleBatch`es every `Holding` transfer in **one atomic Daml
transaction**. Standalone new module + its own 2×2 Daml golden — it does **not** yet edit
`Round.Clear` (that is 11-05). The §8 clearing math is byte-unchanged and the §4 canary still clears
**$100.00 / A=10·B=8·C=2**.

## What Was Built

### Task 1 — `Settlement.daml` (commit `fb0bb6e`)
- **`data Instruction`** — `sender / receiver / instrument : InstrumentId / amount : Decimal`
  (`deriving Eq, Show`). Token-agnostic (DFIN-03): a leg references an `InstrumentId {issuer,id}`,
  never a hardcoded `"USDCx"`/`"BONDX"` string.
- **`buildGrossInstructions : Decimal -> [Allocation] -> InstrumentId -> InstrumentId -> [Instruction]`**
  — derives the gross DvP legs from the verified allocation at p*, generalizing the current
  single-buyer fold to N buyers × M sellers. Pairing rule (documented): because the price is
  UNIFORM the cash owed per matched unit is identical, so it pairs the desk-sorted buy-unit slots
  against the desk-sorted sell-unit slots position-by-position (`zip`), aggregating each distinct
  `(buyer, seller)` into one bond leg (seller→buyer) + one cash leg (buyer→seller). The invariant
  that matters is per-instrument conservation, not the specific pairing.
- **`netLegs : Party -> [Instruction] -> [Instruction]`** — multilateral netting through a
  settlement custodian (CCP), default ON. Collapses gross to EXACTLY one net `Instruction` per
  `(party, instrument)` with non-zero net: a positive net = receive-from-custodian, a negative net =
  deliver-to-custodian. The gross list is left intact (topology viz / gross receipts).
- **`conservationOk : [Instruction] -> [InstrumentId] -> Bool`** — the fail-loud predicate 11-05
  will `assertMsg` on: non-negative amounts + no self-legs + per-instrument net-over-all-parties == 0.
- **`settleBatch : Party -> [Instruction] -> [(Party, InstrumentId, ContractId Holding)] -> Update ()`**
  — executes every leg as a `Holding` transfer in the ONE calling transaction (all-or-nothing).
  A per-`(sender, instrument)` source map is threaded via **`moveThread`** (surfaces the split
  remainder that `moveExactHolding` discards) so one holding is debited across several receivers.
  Includes a DvP-integrity check that every source holding is custodied by the custodian and matches
  its `(owner, instrument)`.
- Imports only `Holding` / `Instrument` / `Clearing` — **never `Auction`** — so 11-05 can import
  `Settlement` into `Round.Clear` without a module cycle.
- **§4 pure-reduction check (Pitfall 6):** with A as the sole buyer, `buildGrossInstructions`
  reproduces A↔B 8@100 / A↔C 2@100 at $100.00 (the generalized one-buyer batch reduces exactly).

### Task 2 — `test_netting_conserves` + `SettleHarness` (commit `8319585`)
- **`SettleHarness`** — a test-only nonconsuming operator choice that drives `settleBatch` from a
  Script (a Script cannot `submit` a raw `Update`; production caller is `Round.Clear`).
- **`test_netting_conserves`** — a 2-buyer × 2-seller batch at ONE uniform price p*=100 (A buys 6,
  D buys 4; B sells 7, C sells 3):
  - (a) `buildGrossInstructions` and `netLegs` both pass `conservationOk`;
  - (b) `netLegs` yields exactly 8 legs — one per `(desk, instrument)`;
  - (c) `settleBatch` (gross legs, operator authority) conserves each instrument's global total
    (bond 10.0, cash 1000.0 unchanged) and preserves every desk's economics (A holds 6 bond, D holds
    4 bond, B holds 700 cash, C holds 300 cash; all buyer cash / seller bond fully consumed — no leak);
  - (d) a fresh under-funded-seller batch (B short the BONDX) makes a leg's `Split` throw →
    `submitMustFail` → the entire `Holding` ACS is byte-identical (all-or-nothing).

## Verification

| Check | Result |
|-------|--------|
| `cd daml && daml build` | green (`Created .daml/dist/umbra-0.1.0.dar`) |
| `cd daml && daml test` | green, all scripts `ok` |
| `test_netting_conserves` | ok (11 active contracts, 11 transactions) |
| §4 canary `test_clears_at_100` | ok |
| §4 `test_settled_balances` / `test_atomicity` | ok / ok |
| §4 `test_commit_reveal_clears_at_100` | ok |
| `grep -c settleBatch Umbra/Settlement.daml` | 6 |
| Settlement imports `Auction`? | no (cycle-free for 11-05) |
| §8 clearing math (`Clearing.daml`) touched? | no |
| Contract key on any new type? | none (D7 anti-pattern avoided) |

## Deviations from Plan

### Design refinements (no intent change)

**1. [Rule 3 — blocking] `netLegs` takes an explicit custodian party.**
The plan sketched `netLegs : [Instruction] -> [Instruction]`, but "one net Instruction per
(party, instrument)" is only achievable through a designated settlement counterparty (a CCP) — the
net receiver's leg needs a sender, and the net deliverer's leg needs a receiver. Refined to
`netLegs : Party -> [Instruction] -> [Instruction]` where the `Party` is the custodian (in 11-05, the
operator). This matches `settleBatch`'s own custodian-first signature. Directive-prose action; the
acceptance criterion ("exactly one Instruction per (party, instrument)") is met and proven.

**2. [Rule 3 — blocking] `moveThread` helper added.**
`moveExactHolding` (11-01) discards the split remainder, so it cannot debit one holding across
several receivers (e.g. a buyer paying multiple sellers) in one transaction. Added top-level
`moveThread` returning `Optional (ContractId Holding)` (the remaining source cid) so `settleBatch`
threads a per-`(sender, instrument)` source map — the generalization of the current `Round.Clear`
buyer-USDCx-remainder fold.

**3. `settleBatch` settles GROSS legs on-ledger; `netLegs` proven as a pure transform.**
The test drives `settleBatch` with the gross legs (each desk self-funds its own obligation — the
natural bilateral DvP, no custodian pre-funding needed), while `netLegs` conservation + one-leg-
per-`(party, instrument)` is proven purely. This satisfies every must-have (atomic settle,
per-instrument conservation, gross derivable, netting one-per-party-instrument) with the lowest-risk
on-ledger path. `settleBatch` is fully custodian-netting-compatible — netted-hub on-ledger
settlement only needs a pre-funded custodian in `sources`, which the wired path (11-05) can supply.

## Honest Limitations / Boundaries

- **Not yet wired.** `Round.Clear` still runs on `Asset` single-buyer legs — swapping them to
  `Settlement.settleBatch` + conservation asserts + the `cashInstrument` param is 11-05.
- **`conservationOk` per-instrument balance is structurally implied** by the balanced-transfer
  `Instruction` shape (each leg is a sender→receiver move). Its live discriminating power here is the
  well-formedness screen (non-negative amount, no self-leg) plus catching any future one-sided leg;
  the SUBSTANTIVE numeric conservation is proven on-ledger by the before/after `Holding` totals in
  `test_netting_conserves`.
- **Netted-hub on-ledger settlement (CCP) is left to the wired path.** `netLegs` is proven conserving
  purely; settling the netted legs on-ledger requires a liquid (pre-funded) custodian, which
  `settleBatch` supports but this standalone plan does not seed.
- **`SettleHarness` is a test-only template** in `Tests.daml` (adds to the DAR but is never a
  production entry point).

## Notes for Downstream Plans

- **11-05 (`Round.Clear` rewrite):** delete the single-funded-buyer guard, call
  `buildGrossInstructions priceDec allocations bondInstrument cashInstrument` →
  (optionally) `netLegs operator` → `assertMsg (conservationOk legs instruments)` →
  `settleBatch operator legs sources`. Add the `cashInstrument : InstrumentId` choice arg (DFIN-03).
  Keep the §8 recompute-and-assert backstop and the `Retire`/`TradeConfirmation` block unchanged.
  §4 stays single-buyer-shaped and must reduce to A↔B 8@100 / A↔C 2@100 (guarded by
  `test_clears_at_100`).
- Any template change that wires these into settlement requires regenerating + committing
  `web/daml.js/` (fresh-clone invariant) — deferred until 11-05 wiring.

## Self-Check: PASSED
- Created file exists: `daml/Umbra/Settlement.daml` — FOUND.
- Commits exist: `fb0bb6e` (Task 1), `8319585` (Task 2) — both FOUND in `git log`.
- `daml build` green; `daml test` green including `test_netting_conserves` and the §4 canary.
