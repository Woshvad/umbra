---
phase: 11-settlement-institutional-grade
plan: 07
subsystem: solver-settlement-wiring
tags: [DFIN-02, DFIN-03, settlement, holding, batch, netting, parity, n-buyer, token-agnostic]
requires:
  - Umbra.Auction:Round.Clear v2 (Holding cids + cashInstrument/bondInstrument — 11-05)
  - Umbra.Settlement (buildGrossInstructions/netLegs/conservationOk/settleBatch — 11-04)
  - solver/src/auction.ts (§8 pure clearing mirror — unchanged)
provides:
  - "solver/src/settlement.ts: pure grossLegs/netLegs/conserves mirror of Umbra.Settlement (Daml⇄TS parity for the viz + goldens)"
  - "solver/src/settlement.test.ts: 2×2 multibuyer golden (parity with test_multibuyer_golden) + §4 single-buyer reduction"
  - "solver/src/ledger.ts settle(): Holding-based, N-buyer, token-agnostic Round.Clear (buyerCashCids + cashInstrument/bondInstrument)"
  - "tamperClear() migrated to the same Holding gather + new Clear args (recompute backstop intact)"
affects:
  - solver/src/ledger.ts
  - solver/src/ledger.test.ts
tech-stack:
  added: []
  patterns:
    - "pure TS Batch/Instruction settlement mirror (grossLegs → netLegs → conserves), byte-mirroring Umbra.Settlement for parity + receipts"
    - "N-buyer × M-seller Holding gather: each buyer funds its own cash leg; a per-cid used-set prevents double-assignment"
    - "token-agnostic InstrumentId {issuer, id} records on the v2 wire (no hardcoded USDCx/BONDX in the Clear args)"
decisions:
  - "settle()/tamperClear() share a pure read-only gatherHoldingCids helper (plan said 'copied' — a read-only gather never settles, so settle() stays the canonical un-perturbed settling path; tamperClear perturbs only the SUBMITTED Clear values). Reduces divergence risk between the two gathers"
  - "ledger.test.ts seedSection4World migrated Asset → Holding (Rule 3): the new gather reads Holding, so the tamperClear tests must seed Holdings or they go red"
  - "auction.test.ts left byte-unchanged: §8 math is untouched (plan: 'only if a §4 helper shape changed')"
  - "Added a per-cid used-set in the N-buyer gather (Rule 2 correctness): one Holding is never assigned to two legs"
  - "conserves() uses a 1e-9 epsilon on the summed-net screen (JS IEEE-754 vs Daml exact Decimal); golden values are integer/integer×price so drift is 0"
key-files:
  created:
    - solver/src/settlement.ts
    - solver/src/settlement.test.ts
  modified:
    - solver/src/ledger.ts
    - solver/src/ledger.test.ts
metrics:
  duration: ~12 min
  tasks: 2
  files: 4
  completed: 2026-07-10
---

# Phase 11 Plan 07: Solver Settlement Wiring (Holding-based N-buyer Round.Clear + Daml⇄TS parity) Summary

The solver now settles on the **new token-agnostic Batch/Instruction `Round.Clear`**: `settle()`
gathers **`Holding`** contract ids (the operator-custody successor to the retired `Asset`),
generalizes past the single-funded-buyer assumption to **N buyers × M sellers** (each buyer funds
its own cash leg), and passes the new args (`buyerCashCids`/`sellerBondCids` Holding cids +
`cashInstrument`/`bondInstrument` `InstrumentId` records — DFIN-03, no hardcoded `"USDCx"`/`"BONDX"`
on the wire). A PURE `settlement.ts` (`grossLegs`/`netLegs`/`conserves`) byte-mirrors
`Umbra.Settlement`, with a **2×2 multibuyer golden holding Daml⇄TS parity** against the Daml
`test_multibuyer_golden` / `test_netting_conserves` numbers. Verify-don't-trust + `tamperClear`'s
recompute-backstop demo are intact, and the **§4 solver fixture still clears $100.00 / A=10·B=8·C=2**.

**§4 CANARY RESULT: PASS** — `auction.test.ts` §4 fixture and 99-vs-100 trap green; `tamperClear`
still surfaces the verbatim on-ledger reject on Holdings; full solver suite **141/141 green**, `tsc`
clean.

## What Was Built

### Task 1 — `settlement.ts` pure mirror + 2×2 golden (commit `63001c6`)
- **`solver/src/settlement.ts`** — the off-ledger twin of `Umbra.Settlement`:
  - `InstrumentRef {issuer, id}` + `Instruction {sender, receiver, instrument, amount}` mirror the
    Daml `InstrumentId` / `Instruction` records.
  - `unitsFor`, `grossLegs(price, allocations, cashInstrument, bondInstrument)`,
    `netLegs(custodian, legs)`, `netAmount`, `batchParties`, and `conserves(legs, instruments)` are
    function-for-function byte-mirrors of `buildGrossInstructions` / `netLegs` / `conservationOk`
    (including the parties-OUTER / instruments-INNER net-leg emission order — load-bearing for parity).
  - Pure / DOM-free / no fetch / deterministic — the source the topology viz + receipts read (gross
    derivable, netted default; one net leg per `(party, instrument)`).
- **`solver/src/settlement.test.ts`** — the parity contract:
  - The **2×2 multibuyer golden** (A buys 6, D buys 4; B sells 7, C sells 3 @ p*=100) asserts the
    EXACT Daml `test_multibuyer_golden` economics: gross + netted both conserve, netting yields
    **exactly 8 net legs (one per (party, instrument))**, the custodian nets to zero, and per-desk
    net amounts (A bond +6 / cash −600, D bond +4 / cash −400, B cash +700, C cash +300).
  - A **§4 single-buyer reduction** proves the generalized builder collapses to the two canonical
    legs **A↔B 8@100 / A↔C 2@100** (bond seller→A + cash A→seller), and a malformed self-leg batch
    is rejected by `conserves()`.

### Task 2 — `settle()` → Holding cids + N-buyer + token-agnostic (commit `cf7f0ac`)
- **`settle()` rewritten**: reads the §8 allocation, builds `cashInstrument`/`bondInstrument`
  `InstrumentId {issuer=operator, id}` records, gathers live `Holding` cids via a new pure
  `gatherHoldingCids`, and exercises the new `Round.Clear` with `buyerCashCids`/`sellerBondCids`
  (v2 `{_1,_2}` tuples) + the two instrument records + the unchanged `referencePrice`. The
  single-buyer `buyAlloc`/`buyerUsdcCid` selection is GONE; each buyer funds its own cash leg
  (`filledQty × p*`). Verify-don't-trust is unchanged (no skip path).
- **`gatherHoldingCids` helper (pure, read-only)**: N-buyer × M-seller Holding location by
  `(owner, instrument.id)` + sufficient `amount` (v2 string → `Number()`), with a per-cid `used`
  set so one Holding is never double-assigned. Keeps the clean secret-free
  `insufficient or missing <instrument> holding for <party>` error.
- **`tamperClear()` migrated** to the same Holding gather + new Clear args (`buyerCashCids`,
  `cashInstrument`, `bondInstrument`); it still perturbs ONLY the SUBMITTED numeric values
  (`badPrice`, over-filled Buy leg) and catches the verbatim on-ledger reject — never settles.
- **`ledger.test.ts` `seedSection4World`** migrated `Asset` → `Holding` (instrument record + string
  amount + `lock: null`) so the tamperClear wrong-price / overfill / secret-sweep tests stay green.

## Verification

| Check | Result |
|-------|--------|
| `cd solver && npx vitest run settlement` | green — 7/7 (2×2 golden + §4 reduction + conserves screen) |
| `cd solver && npx vitest run` | green — **141/141** |
| `cd solver && npx tsc --noEmit` | clean, exit 0 |
| §4 canary (`auction.test.ts` fixture + 99-vs-100 trap) | ok — **$100.00**, A=10/B=8/C=2 |
| `tamperClear` wrong-price / overfill | ok — verbatim on-ledger reject on Holdings, `{rejected:true}` |
| secret sweep (operator token never leaks) | ok — extended tamperClear + refreshStats sweeps green |
| `queryByEntity('Asset')` / `buyerUsdcCid` on settle path | 0 (Asset gather retired) |
| `cashInstrument` refs in `ledger.ts` | 4 |
| 2×2 golden matches Daml `test_multibuyer_golden` numbers | yes (8 net legs, A=6/D=4/B=7/C=3 economics) |

## Deviations from Plan

### 1. [Rule 3 — blocking] `ledger.test.ts` seed migrated Asset → Holding
The plan `files_modified` listed `auction.test.ts`, but the test that actually exercises
`tamperClear` (and thus the gather migration) is `ledger.test.ts`. Its `seedSection4World` seeded
`Asset` contracts; after `settle()`/`tamperClear()` moved to `queryByEntity('Holding')`, those
seeds are invisible and the tamperClear tests would go red. Migrated the three §4 seeds to
`Holding` (instrument `{issuer, id}` record, string `amount`, `lock: null`) — required to keep
`npx vitest run` fully green (the plan's acceptance criterion).

### 2. [Design refinement] Shared `gatherHoldingCids` helper (plan said "copied, not refactored")
The plan directed copying the gather inline into `tamperClear`. I factored the gather into a PURE,
read-only `gatherHoldingCids` helper both functions call. Rationale: the helper only LOCATES cids —
it never settles. `tamperClear` perturbs only the values it SUBMITS to `Clear` in its own exercise
call, so `settle()` remains the canonical, un-perturbed settling path and the T-08-04-TAMPER safety
invariant (settle never attempts a bad Clear) holds. This reduces divergence risk between the two
gathers during the Asset→Holding migration.

### 3. [Rule 2 — correctness] Per-cid `used` set in the N-buyer gather
Generalizing past the single buyer, one Holding could otherwise be matched for two legs. Added a
`used : Set<string>` so each located Holding is claimed once — a correctness requirement for the
N-buyer × M-seller path (inert on §4 where each desk has one holding per instrument).

### 4. `auction.test.ts` left byte-unchanged
The §8 clearing math (`auction.ts`) is untouched, so no §4 helper shape changed — per the plan
("Update `auction.test.ts` only if a §4 helper shape changed"). The §4 canary is proven by the
existing, unmodified suite.

## Threat Surface

All plan `<threat_model>` mitigations are implemented:
- **T-11-07-DECODE** — `Number()` amount coercion + record-shaped `InstrumentId` + `{_1,_2}` tuples;
  §4 fixture + secret sweep gate the wire (141/141 green).
- **T-11-07-PARITY** — `settlement.test.ts` 2×2 golden mirrors the Daml `test_multibuyer_golden`
  numbers (8 net legs, per-desk economics).
- **T-11-07-BACKSTOP** — `tamperClear` keeps the perturbed-submit-and-catch path; the recompute
  backstop in `Round.Clear` is unchanged.
- **T-11-07-CANARY** — `auction.ts` §8 byte-unchanged; §4 vitest stays $100.00.

No new threat surface beyond the plan's register.

## Honest Limitations / Boundaries (recorded)

- **Not run against a live LocalNet (offline).** The live `settle()` path is exercised here by
  `ledger.test.ts` with a mocked v2 `fetch` ACS (tamperClear wrong-price/overfill/secret-sweep) and
  the pure parity goldens; a **live §4 settle on Holdings ($100.00, A=10·B=8·C=2) + a live 2×2
  multibuyer settle = live-UAT** (enumerated below). The live path degrades gracefully when LocalNet
  is down (no credential → clean secret-free error).
- **Holding-selection assumes one sufficient `(owner, instrument)` Holding per party** (true for §4
  + the 2×2 golden); auto-merge of split holdings is stretch §19. A miss throws the clean
  `insufficient or missing <instrument> holding for <party>`.
- **`settlement.ts` settles nothing** — it is the off-ledger parity/viz twin; the on-ledger
  `settleBatch` (11-04/05) is the authoritative settler.

## Live-UAT Checklist (deferred to phase verification)

1. Boot LocalNet + deploy (`node scripts/localnet/deploy.mjs`); open → seal §4 orders → close.
2. `settle()` the §4 round → §4 clears **$100.00**, A=10/B=8/C=2, Holdings settle atomically
   (buyer A holds BONDX, sellers B/C hold USDCx).
3. A 2×2 multibuyer round (A buys 6, D buys 4; B sells 7, C sells 3) settles at $100.00 with the
   golden per-desk economics.
4. `tamperClear` wrong-price / overfill → verbatim on-ledger reject, round unchanged.

## Self-Check: PASSED
- Created files exist: `solver/src/settlement.ts`, `solver/src/settlement.test.ts` — both FOUND.
- Modified files exist: `solver/src/ledger.ts`, `solver/src/ledger.test.ts` — both FOUND.
- Commits exist: `63001c6` (Task 1), `cf7f0ac` (Task 2) — both FOUND in `git log`
  (author/committer = woshvad, no Claude attribution).
- `npx vitest run` 141/141 green; `tsc --noEmit` clean; §4 canary $100.00; `settlement` 7/7.
