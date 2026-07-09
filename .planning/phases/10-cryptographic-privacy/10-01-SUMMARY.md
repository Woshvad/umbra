---
phase: 10-cryptographic-privacy
plan: 01
subsystem: ledger
tags: [daml, canton, commit-reveal, sha256, DA.Crypto.Text, zk-anchor, bond, operator-custody]

# Dependency graph
requires:
  - phase: 09-richer-order-model
    provides: "Phase-9 Order model (orderType/minQty/firmIf) + computeClearing §8 kernel"
  - phase: 02-clearing-settlement
    provides: "Round.Clear operator-custody DvP + Asset Split/Merge/Reassign primitives"
provides:
  - "OrderCommitment template (signatory operator+desk) with on-ledger sha256 commit–reveal binding"
  - "commitOf + serializeOrder — the SINGLE canonical order serializer shared by commit and reveal"
  - "Venue.CommitOrder (lock the desk's own USDCx bond in operator custody) + OrderCommitment.RevealOrder + OrderCommitment.ForfeitBond"
  - "ProofAnchor template (hashes only) + Venue.AnchorProof create path (CRYP-03 on-ledger anchor)"
  - "-Wno-crypto-text-is-alpha build flag (alpha DA.Crypto.Text, honestly labeled)"
  - "seedCommitRevealRound §4 seed + test_commit_reveal_clears_at_100 canary ($100.00 / A=10/B=8/C=2)"
affects: [10-02, 10-03, 10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10]

# Tech tracking
tech-stack:
  added: ["DA.Crypto.Text.sha256/toHex (bundled alpha stdlib module, SDK 3.4.11)"]
  patterns:
    - "On-ledger verify-don't-trust for reveals: the ledger recomputes sha256 and rejects a mismatched reveal"
    - "Operator-custody LOCK for bonds (bond stays desk-owned, immovable by the desk, seized by ForfeitBond)"
    - "Single canonical injective serializer shared by commit and reveal (pinned Decimal scale, explicit Optional tokens)"

key-files:
  created: []
  modified:
    - "daml/daml.yaml — -Wno-crypto-text-is-alpha build-option"
    - "daml/Umbra/Auction.daml — commitOf/serializeOrder, OrderCommitment (+RevealOrder/ForfeitBond), ProofAnchor"
    - "daml/Umbra/Roles.daml — Venue.CommitOrder + Venue.AnchorProof choices"
    - "daml/Umbra/Setup.daml — CommitRevealSeed + seedCommitRevealRound"
    - "daml/Umbra/Tests.daml — 5 CRYP-01/CRYP-03 Daml Script tests"
    - "DECISIONS.md — D12 (on-ledger binding + operator-custody lock)"

key-decisions:
  - "CRYP-01 binding enforced ON-LEDGER via DA.Crypto.Text.sha256 (alpha, flagged not -Werror'd)"
  - "Bond custody uses the operator-custody LOCK model, not escrow-by-reassign (an operator-owned Asset is invisible to the desk, so a controller-desk RevealOrder cannot fetch it)"
  - "ProofAnchor template lives in Auction.daml; the named AnchorProof choice lives on Venue (Round stays byte-unchanged)"

patterns-established:
  - "commit → reveal → clear routes the §4 batch through a hash binding without touching Round.Clear or §8 math"
  - "bond carved from each desk's own §4 cash (< 1000) so the buyer's cash leg never selects a released bond slice"

requirements-completed: [CRYP-01, CRYP-03]

# Metrics
duration: 24min
completed: 2026-07-09
---

# Phase 10 Plan 01: On-ledger Commit–Reveal + Proof-Hash Anchor Summary

**On-ledger commit–reveal binding (DA.Crypto.Text.sha256) with an operator-custody bond lock/forfeit and a hash-only ZK proof anchor — the §4 batch flows commit→reveal→clear and still clears exactly $100.00 / A=10/B=8/C=2, with Round.Clear and the §8 math byte-unchanged.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-07-09T20:15:48Z
- **Completed:** 2026-07-09T20:39:28Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- **On-ledger reveal binding:** `OrderCommitment.RevealOrder` recomputes `sha256(toHex(canonicalOrder ‖ salt))` inside the choice and `assertMsg`s equality — the ledger itself rejects a reveal of a different order or a wrong salt (`test_reveal_mismatch_rejected`).
- **Single canonical serializer:** one `serializeOrder` (fixed field order, pinned 2-dp Decimal scale, explicit `Some`/`None` tokens, injective `|<tag>=` delimiter) is shared by commit and reveal, so a legitimate reveal always reproduces the committed bytes (Pitfall 1 + 2).
- **Bond lock/return/forfeit:** `Venue.CommitOrder` locks the desk's own USDCx bond in operator custody; a valid reveal releases it (`test_bond_returned`); `OrderCommitment.ForfeitBond` seizes it to the operator pot on non-reveal (`test_bond_forfeit`).
- **CRYP-03 anchor:** `ProofAnchor` records only `proofHash` + `vkeyHash` (no proof bytes) via `Venue.AnchorProof` (`test_proof_anchor`).
- **§4 canary intact:** `seedCommitRevealRound` + `test_commit_reveal_clears_at_100` prove the canonical batch clears $100.00 / A=10/B=8/C=2 with the exact §4 settled balances, through commit→reveal→clear.
- **Additive-only:** `Round.Clear` and `Umbra.Clearing` are byte-unchanged; all prior §4 tests remain green (`daml test` exits 0, 29 scripts ok).

## Task Commits

Each task was committed atomically:

1. **Task 1: OrderCommitment + CommitOrder/RevealOrder + on-ledger sha256 binding** — `0316fb4` (feat)
2. **Task 2: ForfeitBond slash + ProofAnchor template + AnchorProof choice** — `b5c14eb` (feat)
3. **Task 3: §4 commit→reveal→clear seed + $100.00 canary** — `d11000f` (feat)

_(Plan metadata commit follows this summary.)_

## Files Created/Modified
- `daml/daml.yaml` — added `build-options: [-Wno-crypto-text-is-alpha]` (bare damlc flag; the `--ghc-option=` form is rejected as "unrecognised warning flag").
- `daml/Umbra/Auction.daml` — `import DA.Crypto.Text (sha256, toHex)`, `serializeOrder`, `commitOf`, `OrderCommitment` template with `RevealOrder` + `ForfeitBond` choices, `ProofAnchor` template.
- `daml/Umbra/Roles.daml` — `Venue.CommitOrder` (nonconsuming, controller desk — locks the bond, creates the commitment) and `Venue.AnchorProof` (nonconsuming, controller operator — creates a ProofAnchor).
- `daml/Umbra/Setup.daml` — `CommitRevealSeed` record + `seedCommitRevealRound` (mint §4, carve bonds, open, commit, reveal, close, gather Option-B cids).
- `daml/Umbra/Tests.daml` — `test_reveal_mismatch_rejected`, `test_bond_returned`, `test_bond_forfeit`, `test_proof_anchor`, `test_commit_reveal_clears_at_100` (+ `findUsdcCid`/`findVenueCid` helpers).
- `DECISIONS.md` — D12 records the on-ledger binding, alpha labeling, canonical serialization, and the operator-custody lock model.

## Decisions Made
- **On-ledger binding (not operator-asserted):** the strongest CONTEXT.md option — the ledger recomputes the digest and is the accept/reject authority. Rides the alpha `DA.Crypto.Text` API, pinned to SDK 3.4.11 and honestly labeled (threat T-10-05, disposition *accept*).
- **AnchorProof on Venue:** a named choice needs an operator-signed template; Round must stay byte-unchanged, so the choice lives on Venue while the `ProofAnchor` template lives in Auction.daml (the plan sanctioned "a top-level AnchorProof create").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bond custody: operator-custody LOCK instead of escrow-by-reassign**
- **Found during:** Task 1 (RevealOrder / CommitOrder)
- **Issue:** The plan specified `CommitOrder` "Reassigns the desk's bond Asset to the operator" and `RevealOrder` "Reassigns the escrowed bond back to desk". An operator-OWNED Asset is invisible to the desk (Asset's `observer` is `owner` only), so the desk's `controller desk` `RevealOrder` could not `fetch`/exercise it — Daml aborted with "Attempt to fetch or exercise a contract not visible to the reading parties" (`#7:2`).
- **Fix:** Implemented the equivalent operator-custody LOCK: the bond stays the desk's own USDCx Asset (the operator is already its sole signatory/custodian and every Asset choice is `controller operator`, so the desk cannot move or archive it while the commitment is live). A valid reveal releases the lock by consuming the `OrderCommitment`; `ForfeitBond` (controller operator) reassigns the bond desk→operator on non-reveal. Same economic guarantee; `Asset` settlement primitive byte-unchanged.
- **Files modified:** daml/Umbra/Auction.daml, daml/Umbra/Roles.daml, daml/Umbra/Tests.daml
- **Verification:** `test_bond_returned` (desk keeps its bond, cannot move it during the window), `test_bond_forfeit` (operator seizes it) both pass; `test_commit_reveal_clears_at_100` settles the exact §4 balances.
- **Committed in:** `0316fb4` (Task 1) / `b5c14eb` (Task 2)

**2. [Rule 3 - Blocking] Build flag form: bare `-Wno-crypto-text-is-alpha`, not `--ghc-option=...`**
- **Found during:** Task 1 (daml.yaml)
- **Issue:** The plan/research prescribed `--ghc-option=-Wno-crypto-text-is-alpha`; damlc rejected it as "unrecognised warning flag" and still emitted the alpha warning.
- **Fix:** Used the bare damlc build-option `-Wno-crypto-text-is-alpha` (which damlc's own hint recommends). The alpha warning is now suppressed and `daml build`/`daml test` are clean.
- **Files modified:** daml/daml.yaml
- **Verification:** `daml test` exits 0 with zero `crypto-text-is-alpha`/`unrecognised` lines.
- **Committed in:** `0316fb4` (Task 1)

**3. [Rule 3 - Blocking] Modified Roles.daml (not in the plan's files_modified list)**
- **Found during:** Task 1 & Task 2
- **Issue:** The plan's `files_modified` listed only daml.yaml/Auction.daml/Setup.daml/Tests.daml, but `Venue.CommitOrder`/`Venue.AnchorProof` must live on the operator-signed `Venue` (in Roles.daml) to obtain the operator authority the bond lock and commitment/anchor creates require. The plan's task actions explicitly call for these Venue choices.
- **Fix:** Added the two nonconsuming choices to `Venue` in daml/Umbra/Roles.daml (mirroring the existing `SubmitOrder` operator-co-signs pattern).
- **Files modified:** daml/Umbra/Roles.daml
- **Verification:** compiles and is exercised by the passing tests.
- **Committed in:** `0316fb4` (Task 1) / `b5c14eb` (Task 2)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking)
**Impact on plan:** All three were required to make the plan's stated behavior compile/run within Daml's disclosure and toolchain rules. No scope creep; the economic guarantees, the §4 invariant, and the byte-unchanged Round.Clear are all preserved.

## Issues Encountered
- Initial escrow-by-reassign attempt failed the disclosure check at `RevealOrder` (`test_bond_returned`); resolved via the operator-custody lock model (Deviation 1).
- A redundant-import warning appeared after adding `OrderType(..)` to the Tests `Umbra.Auction` import; removed it (OrderType's constructors already arrive via the open `Umbra.Clearing` import).

## User Setup Required
None - no external service configuration required. (The live LocalNet commit→reveal→clear at $100.00 is an end-of-phase human-verify; the automated gate is the in-memory `daml test`.)

## Deferred / Human-Verification
- **Live LocalNet run** (Daml 3.4 + Canton :3975/:2975/:4975) of commit→reveal→clear at $100.00 is deferred to end-of-phase human verification per the project's in-memory-test convention. The Dockerized LocalNet was intentionally NOT booted for this plan.
- **JS bindings regeneration** for the new `OrderCommitment`/`ProofAnchor` templates + `web/daml.js` commit is owned by plan 10-05 (a later wave), not this plan.

## Next Phase Readiness
- The FOUNDATIONAL template layer is in place: later Phase-10 plans (regenerated bindings 10-05, solver commit/reveal flow, desk commit/reveal UI, tlock, zk prove/verify, time-machine) build on `OrderCommitment`/`RevealOrder`/`ForfeitBond`/`ProofAnchor`/`commitOf`/`serializeOrder`.
- **Watch item:** `DA.Crypto.Text` is alpha (pinned to SDK 3.4.11); an SDK bump could change the API (threat T-10-05, disposition *accept*).

## Self-Check: PASSED
- Files verified present: daml/daml.yaml, daml/Umbra/Auction.daml, daml/Umbra/Roles.daml, daml/Umbra/Setup.daml, daml/Umbra/Tests.daml, DECISIONS.md.
- Commits verified in git: `0316fb4`, `b5c14eb`, `d11000f`.
- `daml test` exits 0 — 29 scripts ok, including the 5 new CRYP-01/CRYP-03 tests and all prior §4 tests; `test_commit_reveal_clears_at_100` clears $100.00 / A=10/B=8/C=2.

---
*Phase: 10-cryptographic-privacy*
*Completed: 2026-07-09*
