---
phase: 11-settlement-institutional-grade
plan: 01
subsystem: daml-settlement-custody
tags: [DFIN-01, DFIN-03, custody, cn-token-standard, cip-0056, holding, instrument]
requires:
  - Asset.daml (custody template shape mirrored — left byte-untouched)
  - Auction.daml moveExact + OrderCommitment bond-lock model (pattern source)
  - splice-api-token-{metadata,holding}-v1-1.0.0.dar (CN Token Standard interface DARs, on box)
provides:
  - Umbra.Instrument (InstrumentId {issuer,id} + Instrument template + instrumentIdOf)
  - Umbra.Holding (per-desk custody Holding w/ Optional Text lock; Split/Merge/Reassign; moveExactHolding)
  - HoldingV1.Holding interface conformance (provenance CN TOKEN STANDARD (CIP-0056))
  - DECISIONS.md D13 (settlement-standard provenance + honesty rule)
affects:
  - daml/daml.yaml (data-dependencies added)
  - .gitignore (vendor DAR negation)
tech-stack:
  added:
    - "CN Token Standard (CIP-0056) splice-api-token-metadata-v1 + holding-v1 DARs as data-dependencies"
  patterns:
    - "in-repo template implements a real external view interface (HoldingV1.Holding)"
    - "operator-custody lock re-expressed as Optional Text + standard HoldingV1.Lock projection"
key-files:
  created:
    - daml/Umbra/Instrument.daml
    - daml/Umbra/Holding.daml
    - daml/vendor/splice-api-token-metadata-v1-1.0.0.dar
    - daml/vendor/splice-api-token-holding-v1-1.0.0.dar
  modified:
    - daml/daml.yaml
    - DECISIONS.md
    - .gitignore
decisions:
  - "D13: CN TOKEN STANDARD (CIP-0056) path SHIPPED (not the in-repo fallback) — HoldingV1 is a pure view interface, conformance needed no registry context"
  - "Holding carries NO contract key (D7 anti-pattern) — splits would DuplicateKey"
  - "Bond lock migrates to lock : Optional Text; every mutating choice rejects a locked holding"
metrics:
  duration: ~11 min
  tasks: 2
  files: 7
  completed: 2026-07-10
---

# Phase 11 Plan 01: Production Custody Primitives (Instrument + Holding) Summary

Token-agnostic `InstrumentId`/`Instrument` + a locked-capable per-desk `Holding` that
**implements the real CN Token Standard (CIP-0056) `HoldingV1.Holding` interface** — retiring
operator-custody `Asset` from the (future) settlement path with genuine, honestly-labeled
standard conformance rather than a fake. `Asset.daml` is byte-untouched, `daml build` is green,
and every existing `daml test` passes (§4 still clears $100.00 / A=10·B=8·C=2).

## What Was Built

### Task 1 — `Instrument.daml` + `Holding.daml` (plain in-repo custody, commit `d5aa346`)
- **`Umbra.Instrument`**: `data InstrumentId = InstrumentId with issuer : Party; id : Text`
  (`deriving Eq, Show, Ord`) — the token-agnostic instrument reference that replaces the
  hardcoded `"USDCx"`/`"BONDX"` strings (DFIN-03). `Instrument` template (signatory
  issuer + operator; fields `issuer`, `operator`, `id`, `description`) + helper
  `instrumentIdOf : Instrument -> InstrumentId`.
- **`Umbra.Holding`**: mirrors `Asset.daml` (operator = sole signatory/custodian, owner =
  observer, `ensure amount >= 0.0`) with two changes — `symbol : Text` → `instrument :
  InstrumentId` (DFIN-03), and NEW `lock : Optional Text` (the Phase-10 bond lock migrates here
  in 11-05; `Some reason` = locked, `None` = free). Operator-authority-alone conserving choices
  `Split` (strict `0 < splitQty < amount`), `Merge` (same instrument + owner), `Reassign`
  (`with newOwner`) + top-level `moveExactHolding` mirroring `Auction.moveExact`. **Every
  mutating choice asserts `lock == None`** ("holding is locked"), preserving the bond-lock
  guarantee across the Asset→Holding migration. **NO contract key** (D7 anti-pattern).

### Task 2 — CN Token Standard conformance spike + D13 (commit `97e6188`)
- The `splice-api-token-*` DARs **were locatable** on this box
  (`cn-quickstart/quickstart/daml/dars/`), so the real interface-conformance path was attempted
  first (per plan) — and it **succeeded**. `metadata-v1` + `holding-v1` DARs vendored into
  `daml/vendor/` and wired as `data-dependencies` in `daml.yaml`.
- **`Holding` implements `Splice.Api.Token.HoldingV1.Holding`** — a **pure view interface**
  (`viewtype HoldingView`, no choices), so conformance is a total projection: `owner`,
  `instrumentId = HoldingV1.InstrumentId {admin = issuer, id}`, `amount`, `lock` mapped to the
  standard `HoldingV1.Lock` (held by operator, reason → `context`), `meta = emptyMetadata`. No
  registry/factory context needed (11-RESEARCH A1 confirmed empirically).
- **`.gitignore` negation** (`!daml/vendor/*.dar`) added so the vendored data-dependency DARs are
  committed — a fresh clone can `daml build`.
- **DECISIONS.md D13** records the shipped provenance tag `CN TOKEN STANDARD (CIP-0056)`, the
  HARD "never Daml Finance the library" rule (LF-1.17 vs LF-2.1), and the honest boundaries
  (wallet-interop needs a registry app = Track B/Phase 12; full `AllocationV1` DvP conformance is
  out of budget = A2; in-repo `Batch`/`Instruction` finality lands in a later Phase-11 plan).

## Verification

| Check | Result |
|-------|--------|
| `cd daml && daml build` | ✅ green (`Created .daml/dist/umbra-0.1.0.dar`) |
| `cd daml && daml test` | ✅ green, exit 0 |
| §4 canary `test_clears_at_100` | ✅ ok |
| §4 canary `test_commit_reveal_clears_at_100` | ✅ ok |
| `test_settled_balances` / `test_atomicity` | ✅ ok / ok |
| `daml/Umbra/Asset.daml` byte-untouched | ✅ empty diff vs pre-plan `4fde68b` |
| `daml-finance-*.dar` in `daml.yaml` | ✅ none (count 0) |
| Holding has a contract key | ✅ none (D7 anti-pattern avoided) |
| Interface implementations defined (daml test coverage) | 1 internal interface (HoldingV1.Holding) |

## Deviations from Plan

**None that change intent.** Two plan-anticipated forks resolved in favor of the stronger path:

1. **CN Token Standard path SHIPPED, not the in-repo fallback.** The plan framed the CN
   interface conformance as a best-effort spike with the plain in-repo layer as the reliable
   fallback. The DARs were on the box and `HoldingV1.Holding` turned out to be a choice-free view
   interface, so conformance built cleanly with all tests green — no revert needed. Provenance is
   the stronger `CN TOKEN STANDARD (CIP-0056)`, not `DAML-FINANCE-PATTERN (IN-REPO)`.
2. **[Rule 3 — blocking] `.gitignore` negation for vendored DARs.** The repo's `*.dar` ignore
   (line 8) would have silently dropped the two data-dependency DARs from git, breaking
   fresh-clone `daml build`. Added `!daml/vendor/` + `!daml/vendor/*.dar` (mirrors the Phase-10
   circom.exe / zk-fixture force-keep precedent). Committed within Task 2.

## Honest Limitations / Boundaries (recorded)

- **Interface conformance ≠ wallet interoperability.** An Umbra-issued instrument is not
  registry-recognized by external Amulet/wallet tooling; that needs a registry participant
  (Track B / Phase 12). The tag claims standard *conformance*, not wallet interop.
- **`HoldingV1`/`MetadataV1` only this plan.** Full `AllocationV1`/`AllocationInstructionV1` DvP
  conformance is out of phase budget (A2); the atomic allocate→approve→settle finality flow is an
  in-repo `Batch`/`Instruction` in a later Phase-11 plan.
- **Not-yet-wired.** These modules are additive; live settlement still runs on `Asset` until a
  later Phase-11 plan swaps the `Round.Clear` legs. The lock guard is present but the bond-lock
  migration onto `Holding` is 11-05.

## Notes for Downstream Plans

- `moveExactHolding` and the `Split`/`Reassign` lock guards are the settlement-leg primitives the
  later `Round.Clear` rewrite (DFIN-02) and `Settlement.daml` `Batch`/`Instruction` will call.
- 11-05 (bond-lock migration): set `lock = Some <reason>` when a `Holding` is posted as a bond;
  a dedicated forfeit/unlock choice will be needed since the generic mutating choices refuse
  locked holdings by design.
- Any template change here (new `Holding`/`Instrument`) requires regenerating + committing
  `web/daml.js/` when these become wired (fresh-clone invariant) — deferred until wiring.

## Self-Check: PASSED
- Created files exist: `daml/Umbra/Instrument.daml`, `daml/Umbra/Holding.daml`,
  `daml/vendor/splice-api-token-{metadata,holding}-v1-1.0.0.dar` — all FOUND.
- Commits exist: `d5aa346` (Task 1), `97e6188` (Task 2) — both FOUND in git log.
