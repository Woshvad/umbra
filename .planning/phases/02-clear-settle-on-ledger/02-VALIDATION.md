---
phase: 2
slug: clear-settle-on-ledger
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | **Daml Script** (built into SDK 2.10.4) |
| **Config file** | `daml/daml.yaml` |
| **Quick run command** | `cd daml && daml build` (proves the §8 module + new `Round.Clear` body compile) |
| **Full suite command** | `cd daml && daml test` (runs all `Umbra/Tests.daml` scripts incl. the 4 new ones) |
| **Estimated runtime** | ~30–60 seconds |

> Phase 2 is the correctness-critical phase. The §4 fixture clearing at **exactly $100.00** (`test_clears_at_100`) is the continuous guardrail — a regression to 99 means the tie-break escaped the max-matched subset.

---

## Sampling Rate

- **After every task commit:** `cd daml && daml build` (exit 0 authoritative).
- **After every plan wave:** `cd daml && daml test` (exit 0; all 4 new scripts green).
- **Before `/gsd-verify-work`:** `daml test` green with `test_clears_at_100`, `test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation` all passing.
- **Max feedback latency:** ~60s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-XX | TBD | 1 | CLEAR-04/05 | — | §8 tie-break stays in max-matched subset | unit | `daml test` → `test_clears_at_100` (p*=100.0, A=10/B=8/C=2) | ❌ W0 | ⬜ pending |
| 02-XX | TBD | 2 | SETL-01/02 | — | conservation: cash+assets balance | integration | `daml test` → `test_settled_balances` (A:10/4000,B:12/1800,C:13/1200) | ❌ W0 | ⬜ pending |
| 02-XX | TBD | 2 | SETL-03 | T-atomicity | failed leg → full rollback | unit | `daml test` → `test_atomicity` (submitMustFail; no balance change) | ❌ W0 | ⬜ pending |
| 02-XX | TBD | 2 | SETL-04/CLEAR-05 | T-bad-alloc | reject max-volume/limit/conservation violations | unit | `daml test` → `test_clear_rejects_bad_allocation` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red. Task IDs finalized by the planner.*

---

## Wave 0 Requirements

- [ ] `daml/Umbra/Clearing.daml` (or §8 functions in Auction.daml) — pure `computeClearing` (candidate prices, demand/supply/matched, two-level tie-break, allocation)
- [ ] `daml/Umbra/Auction.daml` — real `Round.Clear` body (verify + atomic DvP + TradeConfirmations + status=Settled), replacing the placeholder
- [ ] `daml/Umbra/Tests.daml` — `test_clears_at_100`, `test_settled_balances`, `test_atomicity`, `test_clear_rejects_bad_allocation`
- [ ] No framework install — Daml Script ships with the SDK

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All four Phase-2 behaviors are asserted programmatically via `daml test` | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have an automated `daml build`/`daml test` verify
- [ ] `test_clears_at_100` asserts p*=100.0 AND fills A=10/B=8/C=2 (both — not just price)
- [ ] `test_atomicity` uses `submitMustFail` and asserts NO balance change
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
