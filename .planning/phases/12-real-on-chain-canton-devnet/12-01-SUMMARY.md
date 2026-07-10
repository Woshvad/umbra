---
phase: 12-real-on-chain-canton-devnet
plan: 01
subsystem: ledger
tags: [daml, four-eyes, compliance, IDEN-03, settlement, authority-separation, canton]

# Dependency graph
requires:
  - phase: 11-settlement-institutional-grade
    provides: "Round.Clear Batch/Instruction DvP settlement (CN Token Standard), Compliance.daml DeskEligibility (signatory operator+compliance) authority pattern, §4 canary at $100.00"
provides:
  - "On-ledger four-eyes clearing-approval gate: ClearingApproval (signatory operator, compliance) required by Round.Clear before it settles"
  - "Umbra.Approval module: ClearingApprovalRequest + ClearingApproval templates, ApproveClearing/RejectClearing choices, assertClearingApproved gate helper"
  - "Round.Clear additive approvalCid field + fetch/assert (§8 math + Batch DvP byte-unchanged)"
  - "approveClearing / withCanonicalApproval Daml Script helpers + 4 four-eyes tests (1 positive + 3 negative)"
  - "Regenerated web/daml.js bindings carrying the four-eyes templates + approvalCid"
affects: [12-02-oidc, 12-05-four-eyes-ui, solver-approval-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-party propose/approve: operator proposes ClearingApprovalRequest, distinct compliance exercises ApproveClearing → operator+compliance-signed ClearingApproval (operator cannot forge alone)"
    - "Four-eyes gate as an additive authority precondition inserted AFTER the §8 recompute-and-assert, BEFORE Batch DvP — verify-don't-trust plus a distinct authority"
    - "Keyless credential threaded by ContractId (D7 Option-B) — no contract keys on LF 2.1"

key-files:
  created:
    - "daml/Umbra/Approval.daml"
  modified:
    - "daml/Umbra/Auction.daml"
    - "daml/Umbra/Tests.daml"
    - "web/daml.js (regenerated)"

key-decisions:
  - "Four-eyes helper placed in Tests.daml (approveClearing/withCanonicalApproval) rather than Setup.daml — plan explicitly allowed either; all Clear call sites live in Tests.daml, so Setup.daml was left unmodified"
  - "test_settle_without_approval_rejected proves 'no valid approval' by ARCHIVING a real approval (submitMulti [operator, compliance]) so the fetch inside Round.Clear finds a dangling cid — the §8 recompute passes, making the four-eyes gate the sole reason for rejection"
  - "test_settle_wrong_approval_rejected covers BOTH wrong-price (99.0) and wrong-round (R-OTHER) — assertClearingApproved aborts on either"

patterns-established:
  - "Four-eyes SEPARATION is structural: operator ≠ compliance (dedicated dev party in headless tests); operator alone cannot bring a ClearingApproval into being"

requirements-completed: [IDEN-03]

# Metrics
duration: ~20min
completed: 2026-07-10
---

# Phase 12 Plan 01: Four-Eyes Compliance Approval (IDEN-03) Summary

**Real, on-ledger four-eyes gate — a distinct compliance party must approve the clearing price before `Round.Clear` commits, threaded through the §4 canary which still clears $100.00 / A=10·B=8·C=2, with a settle lacking / carrying a wrong / operator-self-made approval rejected on-ledger.**

## Performance

- **Duration:** ~20 min (interrupted early by a transient classifier outage on Bash; retried and recovered per instructions)
- **Completed:** 2026-07-10
- **Tasks:** 4
- **Files modified:** 4 (1 created, 2 Daml modified, web/daml.js regenerated)

## Accomplishments

- **New `Umbra.Approval` module** — `ClearingApprovalRequest` (signatory operator, observer compliance) with `ApproveClearing`/`RejectClearing`; `ClearingApproval` (signatory operator, compliance — unforgeable by operator alone); `assertClearingApproved` gate helper. Mirrors `Compliance.daml`'s `DeskEligibility` shape exactly; keyless (LF 2.1 / D7 Option-B).
- **`Round.Clear` gated four-eyes** — ONE additive `approvalCid : ContractId ClearingApproval` field; a `fetch` + `assertClearingApproved operator roundId priceDec appr` inserted immediately after the §8 recompute pins `priceDec`, before `buildGrossInstructions`. The §8 recompute-and-assert block, `buildGrossInstructions`, `conservationOk`, `settleBatch`, and the clearing MATH are byte-unchanged.
- **§4 canary intact WITH four-eyes** — `test_four_eyes_clears_at_100` seeds §4, a DISTINCT compliance party approves at 100.0, and `Round.Clear` still clears exactly $100.00 with fills A=10 / B=8 / C=2 and the exact §4 post-balances. All pre-existing tests still green (all 10 Clear call sites thread a valid approval).
- **Three negatives green** — `test_settle_without_approval_rejected` (archived/dangling approval), `test_settle_wrong_approval_rejected` (wrong price 99.0 + wrong round R-OTHER), `test_operator_cannot_self_approve` (operator alone cannot `create ClearingApproval` nor exercise the compliance-controlled `ApproveClearing`).
- **`web/daml.js` regenerated + committed** — new `lib/Umbra/Approval` bindings + the `Round.Clear` `approvalCid` field; package-hash propagation across the tree; `cd web && npm run build` (tsc + vite) green.

## Task Commits

1. **Task 1: Approval.daml (ClearingApprovalRequest + ClearingApproval + assertClearingApproved)** — `e4fb0b4` (feat)
2. **Tasks 2+3: Round.Clear approvalCid + fetch/assert (Auction.daml) + thread every Tests.daml Clear call site + §4 canary + 3 negatives** — `2e62746` (feat) — committed together because the new required `approvalCid` field would break `daml build` (which compiles Tests.daml) unless the call sites are updated in the same commit
3. **Task 4: regenerate + commit web/daml.js** — `92166c5` (chore)

## Files Created/Modified

- `daml/Umbra/Approval.daml` (created) — the four-eyes credential templates + gate helper, with honest module docs on the SEPARATION and the dedicated-dev-compliance-party note.
- `daml/Umbra/Auction.daml` (modified) — import `Umbra.Approval`; additive `approvalCid` field on `Clear`; fetch + `assertClearingApproved` after `let priceDec`, before the Batch build.
- `daml/Umbra/Tests.daml` (modified) — `approveClearing`/`withCanonicalApproval` helpers; `approvalCid` threaded into all 10 Clear call sites; 4 new four-eyes tests.
- `web/daml.js` (regenerated) — 16 files: new `Umbra/Approval` module + hash propagation.

## Decisions Made

- **Helper location:** `approveClearing` + `withCanonicalApproval` live in `Tests.daml` (all Clear call sites are there). Plan allowed Tests.daml or Setup.daml; Setup.daml was therefore left unmodified. This is a benign deviation from the plan's `files_modified` list (see below).
- **"No approval" proof by archival:** LF 2.1 gives `ClearingApproval` no consuming business choice, and a `ContractId` cannot be fabricated, so the "absent approval" negative creates a real approval and archives it via `submitMulti [operator, compliance] []` so the in-choice `fetch` hits a dangling cid. The §8 recompute passes first, isolating the four-eyes gate as the sole failure cause — an honest, discriminating test.
- **Wrong-approval covers both axes:** wrong price (99.0) and wrong round (R-OTHER), each exercising a distinct `assertClearingApproved` branch.

## Deviations from Plan

### Benign scope adjustment (not a Rule 1-4 auto-fix)

**1. Four-eyes helper placed in Tests.daml, Setup.daml left unmodified**
- **Found during:** Task 3
- **Issue:** The plan's `files_modified` frontmatter lists `daml/Umbra/Setup.daml`, but the task body explicitly says the helper may live "in Tests.daml or Setup.daml" and Setup changes were "if seeded there."
- **Fix:** Kept the `approveClearing`/`withCanonicalApproval` helpers in Tests.daml (where every Clear call site lives), so Setup.daml needed no change. No functionality lost; the four-eyes separation, §4 canary, and all negatives are fully covered.
- **Files modified:** daml/Umbra/Tests.daml (instead of Setup.daml)
- **Verification:** `daml build` + `daml test` green (exit 0).

---

**Total deviations:** 1 (benign scope adjustment; plan explicitly permitted the chosen location).
**Impact on plan:** None on correctness or coverage. All acceptance criteria met.

## Issues Encountered

- **Transient classifier outage on Bash** at the start of execution (claude-opus-4-8 temporarily unavailable, gating the safety classifier for Bash). Per instructions, retried rather than abandoning; file creation (read-only + Write) proceeded meanwhile, and the build/test loop ran cleanly once the classifier recovered. No work lost.
- **`submitMulti` deprecation warning** — the archival step in `test_settle_without_approval_rejected` uses `submitMulti [operator, compliance] []`, which the SDK marks "legacy." It is a WARNING only; `daml build`/`daml test` are green. Left as-is (functional, and the newer split-authority `submit` API surface is heavier for a two-signatory archive).

## §4 Canary Result

**PASS.** `daml test` exit 0. The §4 fixture clears **$100.00** with fills **A=10 / B=8 / C=2** WITH the four-eyes approval threaded:
- `test_four_eyes_clears_at_100`: ok (clearingPrice 100.0, matched 10, exact §4 post-balances, fills A=10/B=8/C=2)
- `test_settled_balances`, `test_clears_at_100`, `test_commit_reveal_clears_at_100`: ok (all still green)

## Four-Eyes Test Results

- **Positive** — `test_four_eyes_clears_at_100`: ok
- **Negative 1** — `test_settle_without_approval_rejected` (archived/dangling approval): ok
- **Negative 2** — `test_settle_wrong_approval_rejected` (wrong price 99.0 + wrong round R-OTHER): ok
- **Negative 3** — `test_operator_cannot_self_approve` (operator alone: create-approval + self-ApproveClearing both rejected): ok

## Honest Limitations

- **Live human four-eyes is UAT.** This plan proves the ON-LEDGER gate + authority SEPARATION offline via `daml test`, using a dedicated dev `compliance` party so headless runs proceed without a human. A real Compliance operator approving in the UI is Wave-5 (12-05) + live UAT.
- **Solver-side approval wiring is not in this plan.** The `ledger.ts` request/collect step (operator creates a `ClearingApprovalRequest`, the Compliance plane approves, the solver gathers the cid and passes it as `approvalCid`) is downstream (solver + 12-05 UI). The Daml gate + the frozen DAR are ready for it.

## Next Phase Readiness

- The four-eyes gate is live on the settlement path and byte-portable (additive template only). The rebuilt DAR's package hash changed — any LocalNet/DevNet participant must re-vet the new DAR before routing `Round.Clear` (Pitfall 6; live vet on DevNet = CHAIN-02 UAT).
- `web/daml.js` carries the `ClearingApproval`/`ClearingApprovalRequest` bindings + `approvalCid` for the 12-05 Compliance approve control.
- Ready for 12-02 (OIDC dual-mode) and the solver approval-request/collect wiring.

## Self-Check: PASSED

- FOUND: `daml/Umbra/Approval.daml`
- FOUND: `web/daml.js/umbra-0.1.0/lib/Umbra/Approval/module.js` (regenerated binding)
- FOUND: `.planning/phases/12-real-on-chain-canton-devnet/12-01-SUMMARY.md`
- FOUND commits: `e4fb0b4` (Task 1), `2e62746` (Tasks 2+3), `92166c5` (Task 4)
- Gate assertions verified: `signatory operator, compliance` (two-party), `approvalCid : ContractId ClearingApproval` (additive field, block-aligned at line 339 + present in the TS binding), `assertClearingApproved operator roundId priceDec appr` (gate call), `clearingPrice does not match recomputed` (§8 recompute intact), keyless (no `key`/`maintainer`).
- `daml build` + `daml test` exit 0; `cd web && npm run build` green.
- No Claude/AI git attribution (author/committer = woshvad); STATE.md/ROADMAP.md deliberately not modified per plan instructions.

---
*Phase: 12-real-on-chain-canton-devnet*
*Completed: 2026-07-10*
