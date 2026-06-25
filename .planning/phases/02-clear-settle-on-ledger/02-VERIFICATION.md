---
phase: 02-clear-settle-on-ledger
verified: 2026-06-25T16:16:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 2: Clear & Settle On-Ledger Verification Report

**Phase Goal:** `Round.Clear` independently re-verifies the §8 allocation and settles the whole batch DvP in a single all-or-nothing transaction; the §4 fixture clears at exactly $100.00.
**Verified:** 2026-06-25T16:16:00Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth (success criteria) | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | §4 fixture clears at exactly $100.00, fills A=10/B=8/C=2 (CLEAR-04) | ✓ VERIFIED | `daml test` → `test_clears_at_100: ok`. §8 `choosePStar` filters to max-matched subset before `(imbalance, price)` sort; `pStar /= 99.0` canary guard; asserts fills A=10/B=8/C=2 + C residual 3. |
| 2 | `Round.Clear` reassigns assets at p\* + per-desk TradeConfirmation in one tx; §4 settled balances, conserved (SETL-01/02) | ✓ VERIFIED | `test_settled_balances: ok` (14 active contracts, 12 txns) — asserts A:10/4000, B:12/1800, C:13/1200, conservation 35 BONDX / 7000 USDCx, 3 TradeConfirmations. |
| 3 | Any failed leg → `Clear` fails, no balance change (all-or-nothing) (SETL-03) | ✓ VERIFIED | `test_atomicity: ok` — underfunded seller B (5 BONDX, owes 8) → `submitMustFail` + identical before/after Asset snapshot. |
| 4 | `Round.Clear` rejects allocations violating max-volume/limits/conservation; on-ledger §8 re-verification (SETL-04/CLEAR-05) | ✓ VERIFIED | `test_clear_rejects_bad_allocation: ok` — both an over-stated allocation (A buys 12) and a wrong price (99.0) rejected by the recompute-§8-and-assert backstop on a funded round. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `daml/Umbra/Clearing.daml` | pure §8 algorithm | ✓ EXISTS + SUBSTANTIVE | `computeClearing`/`choosePStar`/`rationByPriority` (top-level recursion); tie-break filters to max-matched subset; pure (no Update/Script) for Phase-4 TS mirroring |
| `daml/Umbra/Auction.daml` | real `Round.Clear` body | ✓ EXISTS + SUBSTANTIVE | recompute-assert + atomic DvP (Split/Reassign) + per-desk TradeConfirmation + `Order.Retire` + status=Settled; Option-B additive cids; no ACS query |
| `daml/Umbra/Tests.daml` | 4 settlement tests | ✓ EXISTS + SUBSTANTIVE | all 4 §16 tests + seed helpers; `daml test` exit 0 |
| `DECISIONS.md` | D7 (Option B) | ✓ EXISTS | additive Clear fields rationale recorded |

**Artifacts:** 4/4 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `Round.Clear` | `Clearing.computeClearing` | recompute-and-assert | ✓ WIRED | price (roundBankers 2) + allocation multiset + Σbuy==Σsell equality before settlement |
| `Round.Clear` | `Asset` reassignment | Split/Reassign (operator authority) | ✓ WIRED | BONDX sellers→buyer, USDCx buyer→sellers at p\*; whole-contract Reassign at Split boundary |
| `Round.Clear` | `Order` retirement | operator-only `Order.Retire` | ✓ WIRED | replaces `archive` (which needed desk authority too) — the happy-path settlement fix |
| `Round.Clear` | `TradeConfirmation` | create per desk (observer=desk) | ✓ WIRED | 3 confirmations in test_settled_balances |

**Wiring:** 4/4 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| CLEAR-04: §4 clears at $100.00 (fills A=10/B=8/C=2) | ✓ SATISFIED | - |
| CLEAR-05: §8 re-verified inside Round.Clear | ✓ SATISFIED | - |
| SETL-01: atomic DvP + TradeConfirmation + status=Settled | ✓ SATISFIED | - |
| SETL-02: §4 settled balances, conserved | ✓ SATISFIED | - |
| SETL-03: failed leg → all-or-nothing rollback | ✓ SATISFIED | - |
| SETL-04: rejects bad allocation | ✓ SATISFIED | - |

**Coverage:** 6/6 requirements satisfied

## Anti-Patterns Found

**None.** No stubs, TODOs, or placeholders remain in the settlement path (the Phase-1 `Round.Clear` placeholder is fully replaced). The `CloseRound` choice remains a minimal lifecycle helper (in-scope; real lifecycle automation is the Phase-4 solver service).

**Anti-patterns:** 0 blockers, 0 warnings

## Human Verification Required

None — all 4 success criteria are asserted programmatically and pass under `daml test` (exit 0), re-run firsthand by the orchestrator.

## Gaps Summary

**No gaps found.** Phase goal achieved — the ledger is now the source of truth and atomicity boundary: `Round.Clear` recomputes §8 and rejects any unverified allocation, then settles the batch DvP atomically; the §4 fixture clears at exactly $100.00 with the correct fills and settled balances. Notable in-flight bug caught + fixed: the order-retirement authority bug (`archive` needed desk authority) — resolved with an operator-only `Order.Retire` choice, exposed by the happy-path `test_settled_balances`.

## Verification Metadata

**Verification approach:** Goal-backward (the 4 success criteria) + firsthand `daml build`/`daml test` re-run
**Must-haves source:** ROADMAP Phase 2 success criteria + PLAN frontmatter
**Automated checks:** daml build exit 0; daml test exit 0 with all 4 §16 settlement tests + 2 Phase-1 tests green (12 scripts/helpers total ok)
**Human checks required:** 0
**Total verification time:** ~2 min

---
*Verified: 2026-06-25T16:16:00Z*
*Verifier: Claude (orchestrator — firsthand build/test evidence)*
