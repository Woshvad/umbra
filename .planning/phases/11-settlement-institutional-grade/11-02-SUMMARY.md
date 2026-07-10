---
phase: 11-settlement-institutional-grade
plan: 02
subsystem: daml-compliance-eligibility
tags: [COMP-01, compliance, eligibility, erc-3643, gate, keyless]
requires:
  - Auction.daml RoundStats (operator-signed / observer-desk shape analog)
  - Setup.daml allocateAll + Parties record (test idiom)
provides:
  - Umbra.Compliance (DeskEligibility template + Revoke + isEligible + assertDeskEligible gate helper)
  - test_eligibility_issue (positive credential lifecycle)
affects:
  - daml/Umbra/Tests.daml (import + one new test; no existing test edited)
tech-stack:
  added: []
  patterns:
    - "operator/Compliance-signed per-desk credential; desk is observer-only (cannot self-issue)"
    - "keyless gate primitive (fetch-by-cid + assertDeskEligible), D7 Option-B — contract keys unsupported on Canton LF 2.1"
key-files:
  created:
    - daml/Umbra/Compliance.daml
  modified:
    - daml/Umbra/Tests.daml
decisions:
  - "Contract keys are UNSUPPORTED on Daml 3.4.11 / Canton LF 2.1 — DeskEligibility is keyless; the gate is fetch-by-ContractId + assertDeskEligible (not fetchByKey)"
  - "isEligible = accredited && sanctionsClear; jurisdiction is recorded/observable but NOT a hard MVP gate"
  - "operator MAY == compliance for the MVP stub (single trust domain); desk is observer-only, structurally cannot forge eligibility"
metrics:
  duration: ~5 min
  tasks: 2
  files: 2
  completed: 2026-07-10
---

# Phase 11 Plan 02: On-Ledger Eligibility Credential (COMP-01) Summary

A keyless, operator/Compliance-signed `DeskEligibility` credential (ERC-3643 analog)
carrying `accredited` / `jurisdiction` / `sanctionsClear` flags with an `isEligible`
predicate and an `assertDeskEligible` gate primitive — the on-ledger participation
gate that 11-05 will wire into `SubmitOrder` / `CommitOrder` / holding issuance.
`Umbra.Compliance` compiles as a standalone module (no Holding/Auction import,
Wave-1 parallel-safe with 11-01), and the §4 canary still clears **$100.00 /
A=10·B=8·C=2** with `daml build` + `daml test` fully green.

## What Was Built

### Task 1 — `Compliance.daml` (commit `62d54e9`)
- **`Umbra.Compliance`** — new standalone module (no `Holding`/`Auction` import).
- **`template DeskEligibility`**: `operator`, `compliance`, `desk` (Party); `accredited`,
  `sanctionsClear` (Bool); `jurisdiction` (Text). `signatory operator, compliance`;
  `observer desk`. A desk is NOT a signatory — it cannot self-issue or self-amend its
  own eligibility (threat **T-11-02-FORGE**, mitigated structurally).
- **`Revoke`** — consuming choice, `controller operator, compliance` (either signatory
  can withdraw the credential).
- **`isEligible : DeskEligibility -> Bool`** = `accredited && sanctionsClear`.
  `jurisdiction` is recorded/observable but NOT a hard gate in the MVP stub (a real
  KYC vendor / Track B would fold whitelist rules in here — documented inline).
- **`assertDeskEligible : Party -> Party -> DeskEligibility -> Update ()`** — the gate
  primitive for 11-05: asserts the credential actually describes THIS `(operator, desk)`
  pair (a credential for another desk cannot be substituted) AND that `isEligible`
  holds; an ineligible/mismatched desk is rejected on-ledger.
- **Honest STUB label** in a module comment: `STUB ATTESTATION — REAL KYC VENDOR IS
  TRACK B` (11-UI-SPEC honesty contract) — the honest value is that participation is
  gated on-ledger by an authority-signed credential, NOT a claim of real KYC.

### Task 2 — `test_eligibility_issue` (commit `36e7750`)
- `import Umbra.Compliance (DeskEligibility(..), isEligible)` added to `Tests.daml`.
- **`test_eligibility_issue`**: operator (as its own Compliance) issues an eligible
  credential for bankA (`accredited=True`, `sanctionsClear=True`, `jurisdiction="US"`),
  retrieves it by `(operator, desk)` via a keyless `query`+filter, asserts `isEligible`
  and the jurisdiction, and round-trips it via `queryContractId`; then issues an
  ineligible credential (`accredited=False`) for bankC and asserts `isEligible == False`.
- No existing test edited. `daml test` exit 0.

## Verification

| Check | Result |
|-------|--------|
| `cd daml && daml build` | ✅ green (`Created .daml\dist\umbra-0.1.0.dar`) |
| `cd daml && daml test` | ✅ exit 0 |
| `test_eligibility_issue` | ✅ ok (2 active contracts, 2 transactions) |
| §4 canary `test_clears_at_100` | ✅ ok — **$100.00** |
| §4 canary `test_commit_reveal_clears_at_100` | ✅ ok |
| §4 canary `test_settled_balances` | ✅ ok (A=10 / B=8 / C=2) |
| §4 canary `test_atomicity` | ✅ ok |
| `isEligible == accredited && sanctionsClear` | ✅ (proven both True and False on-ledger) |
| `DeskEligibility` signatory operator+compliance, observer desk | ✅ |

## Deviations from Plan

### **[Rule 3 — blocking] Contract keys are UNSUPPORTED on this stack → keyless credential + fetch-by-cid gate**

- **Found during:** Task 1 (first `daml build`).
- **Issue:** the plan (and 11-RESEARCH Pattern 3) specified a **keyed** template —
  `key (operator, desk) : (Party, Party)`, `maintainer key._1`, and a
  `fetchByKey @DeskEligibility (operator, desk)` gate. The compiler rejected it:
  `Failure to process Daml program, this feature is not currently supported. Contract
  keys.` — **Daml SDK 3.4.11 / Canton 3.4 / Daml-LF 2.1 does not support contract
  keys** (Canton removed unique contract keys on the LF-2.1 line). Verified: NO template
  across the prior ten phases uses a contract key (D7 already forbade a key on
  `Asset`/`Holding`; the deeper reason is the whole line has no key support). Asking
  would not change the answer — keys are impossible here, and the orchestrator's hard
  constraint is that `daml build` stays green.
- **Fix:** made `DeskEligibility` **keyless** — same fields, same
  `signatory operator, compliance` / `observer desk`, same `Revoke`, same `isEligible`.
  The gate primitive changed from `fetchByKey` to **fetch-by-ContractId +
  `assertDeskEligible`** — the exact **D7 Option-B "pass the ContractId explicitly"**
  discipline already used for every `Asset`/`Holding` leg in `Round.Clear`. This
  preserves EVERY security property (a desk still cannot self-issue; the credential's
  `(operator, desk)` identity is asserted so another desk's credential can't be
  substituted) and the `isEligible` predicate verbatim — only the LOOKUP mechanism
  changes. The positive test retrieves by a keyless `query`+filter instead of
  `queryContractKey`.
- **Files modified:** `daml/Umbra/Compliance.daml` (documented inline as
  "ENVIRONMENTAL DEVIATION"), `daml/Umbra/Tests.daml`.
- **Commits:** `62d54e9`, `36e7750`.
- **Frontmatter `must_haves` impact:** the truths "keyed (operator, desk)" and
  "fetched by key", and the `key_links` grep pattern `maintainer key._1`, are
  **literally unmet** because the feature does not exist on this stack. They are met
  in SPIRIT: one stable per-desk credential, retrievable by `(operator, desk)`, whose
  eligibility is asserted by the gate primitive. This mirrors the phase's own
  research-reconciliation precedent (11-CONTEXT: the "real Daml Finance library" target
  was likewise unbuildable on LF 2.1 and honestly re-scoped to the CN Token Standard).

## Notes for 11-05 (gate wiring)

- The gate is **fetch-by-ContractId + `assertDeskEligible operator desk cred`**, NOT
  `fetchByKey`. `SubmitOrder` / `CommitOrder` must accept the desk's `DeskEligibility`
  ContractId as a choice argument (D7 Option-B), `fetch` it, then call
  `assertDeskEligible` — operator authority co-flows because `Venue` is
  `signatory operator`, so the `fetch` is authorized.
- The seed (11-05 / Setup.daml) must create A/B/C (and the guest) `DeskEligibility`
  credentials so §4 still clears, and thread each credential's cid to the submit/commit
  call site. Because there is no key, the onboarding/seed and the solver's submission
  layer must track the credential cid per desk (same bookkeeping already done for
  Holding cids).
- The on-ledger REJECTION negative tests (`test_ineligible_submit_rejected`,
  `test_ineligible_holding_rejected`) are 11-06 — they need the gate wired in 11-05.

## Honest Limitations / Boundaries (recorded)

- **STUB attestation.** `accredited` / `sanctionsClear` are operator/Compliance-issued
  stubs, not real KYC/AML checks. The honest, real value is on-ledger, authority-signed
  participation gating; the vendor integration is Track B. Label:
  `STUB ATTESTATION — REAL KYC VENDOR IS TRACK B`.
- **No contract key.** Uniqueness of "one credential per desk" is an issuance-discipline
  convention (operator/Compliance only issues one), NOT a ledger-enforced key
  constraint — because Canton LF 2.1 has no contract keys. A duplicate credential is
  possible if the operator mis-issues; 11-05's gate should fetch a specific cid.
- **Not-yet-wired.** This module is additive; no `SubmitOrder`/`CommitOrder`/holding
  choice references it yet (that is 11-05). `daml build` + every existing `daml test`
  stay green.

## Self-Check: PASSED
- Created file exists: `daml/Umbra/Compliance.daml` — FOUND.
- Modified file exists: `daml/Umbra/Tests.daml` (contains `test_eligibility_issue`) — FOUND.
- Commits exist: `62d54e9` (Task 1), `36e7750` (Task 2) — both FOUND in git log.
- §4 canary green: `test_clears_at_100` / `test_commit_reveal_clears_at_100` /
  `test_settled_balances` / `test_atomicity` all `ok`; `daml test` exit 0.
