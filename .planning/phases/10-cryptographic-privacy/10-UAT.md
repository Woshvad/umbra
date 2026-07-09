---
status: testing
phase: 10-cryptographic-privacy
source: [10-VERIFICATION.md]
started: 2026-07-10T00:00:00Z
updated: 2026-07-10T00:00:00Z
---

## Current Test

number: 1
name: Live privacy money shot — §4 commit → post-bond → timelock → reveal → clear on the running stack
expected: |
  Boot Canton LocalNet (:3975/:2975/:4975) + solver (:4100) and run the §4 fixture end-to-end
  through commit → post-bond → timelock → reveal → clear against the LIVE ledger. The batch
  clears at exactly $100.00 with fills A=10 / B=8 / C=2; a reveal that mismatches its on-ledger
  sha256 commitment is rejected by RevealOrder; a non-revealing desk forfeits its bond via
  ForfeitBond (CRYP-01).
awaiting: user response

## Tests

### 1. Live privacy money shot — §4 commit → post-bond → timelock → reveal → clear (CRYP-01)
expected: Boot Canton LocalNet (:3975/:2975/:4975) + solver (:4100); run the §4 fixture end-to-end. Batch clears at exactly $100.00 with fills A=10 / B=8 / C=2; a reveal that mismatches its on-ledger sha256 commitment is rejected by RevealOrder; a non-revealing desk forfeits its bond via ForfeitBond. (Automated proxy: `daml test` — test_commit_reveal_clears_at_100 / test_reveal_mismatch_rejected / test_bond_forfeit — passes in-memory.)
result: [pending]

### 2. Live drand tlock round-trip against a real open quicknet round (CRYP-02)
expected: Seal a payload to a future drand quicknet round, attempt early decrypt, then decrypt after the real beacon publishes. Early decrypt throws "too early" against the LIVE drand network (not the deterministic local chain); post-beacon decrypt recovers the exact payload; the offline path is labeled OFFLINE FALLBACK · WEAKER THAN DRAND when quicknet is unreachable. (Automated proxy: `tlock.test.ts` proves seal / early-block / recover deterministically against a local BLS12-381 chain — passes.)
result: [pending]

### 3. Live Time Machine per-party replay against the running stack (VIZ-02)
expected: Open view 06 · Time Machine with per-party desk tokens; scrub the stage timeline (open→committed→timelocked→revealed→cleared→settled). Each party column reads its OWN ACS at the stage offset over the wire — BankB genuinely returns ∅ of BankA's order; at COMMITTED/TIMELOCKED the operator column is ALSO redacted (bg-redact / NOT VISIBLE); derived stages are labeled DASHED + red RECONSTRUCTED. (Automated proxy: `TimeMachine.test.tsx` proves per-party redaction against a mocked v2 ACS — passes.)
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
