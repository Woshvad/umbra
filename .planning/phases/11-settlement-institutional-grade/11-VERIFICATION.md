---
phase: 11-settlement-institutional-grade
verified: 2026-07-10T08:55:54Z
status: human_needed
score: 4/4 success criteria code-verified (live behavior pending UAT)
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
human_verification:
  - test: "Boot the 3-participant Canton LocalNet + solver, seed §4, run Round.Clear, and settle across nodes."
    expected: "The batch settles atomically (all-or-nothing) with each desk's Holding legs moving in one transaction; the round shows Settled; §4 clears $100.00 (A=10/B=8/C=2)."
    why_human: "Requires a booted LocalNet + solver on this Windows box; cross-node live atomic settle cannot be exercised offline. Offline seams proven by daml test (test_atomicity, test_clears_at_100) + web build."
  - test: "Open 03 Theatre on desktop, scan the guest QR with a real phone, land on /join, submit a sealed guest (bankD) bid, then view the guest's fill."
    expected: "The phone loads the mobile JoinView via the QR (URL + roundId only, no token in the QR), the guest submits a bid gated by COMP-01, and the guest sees ONLY its own order/fill."
    why_human: "QR-scanned-on-a-real-phone + live guest submit is a physical/real-time flow. Structural per-party privacy is proven offline by test_privacy_guest_fill; the QR payload hygiene by qrPayload.test.ts."
  - test: "Run scripts/localnet/guest-onboard.mjs against the booted LocalNet, then attempt a submit from an INELIGIBLE party."
    expected: "bankD is onboarded (eligible) and can submit; an ineligible/unlisted party's SubmitOrder/CommitOrder and Holding receipt are rejected on-ledger with the verbatim COMP-01 reject surfaced on JoinView."
    why_human: "Live onboarding + on-ledger COMP-01 firing needs a running ledger. The on-ledger rejection logic is proven offline by test_ineligible_submit_rejected + test_ineligible_holding_rejected."
  - test: "Open 07 Topology and the SettlementView after a live settled round with the guest as a 4th (buyer) desk."
    expected: "TopologyView shows each desk's order resident on a participant node with the honest DEMO-REAL · SINGLE-OPERATOR LOCALNET badge and the AtomicStamp cross-node settle; SettlementView renders the DvP legs / own-fill correctly for the multi-buyer + guest case."
    why_human: "Live topology metadata + settled-round render need a booted ledger. Topology probe (topology.test.ts) and the corrected multi-buyer legsFromPreview (mirrors buildGrossInstructions) are proven offline; visual fidelity is a human check."
---

# Phase 11: Settlement & Institutional Grade — Verification Report

**Phase Goal:** Replace the MVP settlement primitives with a production-grade, multi-party, compliance-gated settlement stack, and prove it across nodes.
**Verified:** 2026-07-10T08:55:54Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Executive Summary

All four ROADMAP success criteria are met in shipped, tested code. I ran the full
Daml test suite, the solver Vitest suite, and the web production build myself — all
green. The §4 canary still clears **$100.00 / A=10 · B=8 · C=2** and settles
atomically after the entire settlement stack was rewritten off operator-custody
`Asset` onto CN-Token-Standard `Holding`s + a Batch/Instruction flow.

I verified against the **RESEARCH RECONCILIATION** (11-CONTEXT / 11-RESEARCH): the
Daml Finance *library* is unbuildable on this LF-2.1 / SDK-3.4.11 line, so DFIN-01 is
judged against the reconciled target — in-repo templates conforming to the **real CN
Token Standard (CIP-0056) `Splice.Api.Token.HoldingV1.Holding` interface**, honestly
provenance-tagged, never claimed as "Daml Finance the library." That reconciled
target meets the success-criterion intent (Holding/Instrument + Batch/Instruction
allocate→settle finality, operator-custody `Asset` retired, §4 still $100.00).

The only unmet items are **genuinely-live**: 3-node cross-node atomic settle,
QR-on-a-real-phone guest join, live guest onboarding + COMP-01 firing against a booted
LocalNet, and live settled-round render. These require a running Canton LocalNet +
solver and cannot be autonomously verified on this box — every seam is proven offline
by tests/build. Consistent with the "Built · live UAT pending" pattern of Phases 8–10,
these are routed to **human verification (UAT)**, NOT gaps. No code gaps found.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Settlement runs through Holding/Instrument + a Batch/Instruction (allocate/approve) flow with explicit finality; operator-custody `Asset` retired; §4 still clears $100.00 and settles atomically (DFIN-01) | ✓ VERIFIED | `Holding.daml` implements real `Splice.Api.Token.HoldingV1.Holding` interface (CIP-0056); `Settlement.daml` `buildGrossInstructions`→`settleBatch` executes every leg in ONE Daml transaction (atomicity = transactionality); `Round.Clear` (Auction.daml:381-402) settles via `settleBatch` with `Holding` cids — `Asset` is off the live path (comments Auction.daml:24,40,44). Tests: `test_clears_at_100`, `test_commit_reveal_clears_at_100`, `test_atomicity`, `test_holding_split_merge` all ok. |
| 2 | `Round.Clear` clears a multi-buyer/multi-seller batch (single-buyer invariant removed), optionally netted, conserving cash+assets; cash leg token-agnostic (DFIN-02/03) | ✓ VERIFIED | Single-funded-buyer `abort` guard REMOVED (grep: absent; Auction.daml:374 "single-funded-buyer abort guard is GONE"). `buildGrossInstructions` pairs N buyers × M sellers; `netLegs` = multilateral CCP netting (default-on). `cashInstrument`/`bondInstrument` are `InstrumentId` choice params (no hardcoded "USDCx"). Tests: `test_multibuyer_golden` (A=6/D=4/B=7/C=3 @100), `test_netting_conserves`, `test_cash_instrument_agnostic` (EURt swap) all ok. Solver `settlement.ts` mirrors `Settlement.daml` (grossLegs/netLegs/netAmount/conserves) — parity, `settlement.test.ts` 7 tests ok. |
| 3 | Only eligibility-checked desks can create an `Order` or hold the bond/cash asset; ineligible party rejected on-ledger (COMP-01) | ✓ VERIFIED | `DeskEligibility` (Compliance.daml) signed by operator+compliance, desk is observer only → no self-issue. `assertDeskEligible` gate wired at ALL enforcement points: `Venue.SubmitOrder` (Roles.daml:42), `CommitOrder` (:71), `IssueHolding` (:95). Rejection is on-ledger (`assertMsg`), not render logic. Tests: `test_ineligible_submit_rejected` (incl. substituted-rival-credential), `test_ineligible_holding_rejected`, `test_eligibility_issue` all ok. Honestly labeled STUB attestation (real KYC vendor = Track B). |
| 4 | Guest joins as 4th desk via QR/mobile and sees only own fill; three-node topology view shows orders on separate participants + atomic cross-node settle (WOW-07, VIZ-03) | ✓ VERIFIED (code) / ⧗ live behavior → UAT | Mobile `/join` route (main.tsx pathname branch, router-free) → `JoinView`; `QrJoin` hosted in `TheatreView`; `buildJoinPayload` emits URL+roundId only (no token — qrPayload.test.ts). `guest-onboard.mjs` = bankD + scoped token (gitignored). `TopologyView` (view 07, Nav enabled) + `TopologyNode` demo-real badge + solver `topology.ts` `hostingMap` → `GET /round/:id/topology`. Structural guest-fill privacy: `test_privacy_guest_fill` ok; `topology.test.ts` 4 tests ok. Live QR-on-phone + live cross-node settle → UAT. |

**Score:** 4/4 criteria code-verified. Criterion 4's live QR/cross-node behavior is UAT.

### Test / Build Results (run by verifier)

| Gate | Command | Result |
|------|---------|--------|
| Daml suite (§4 canary + Phase-11 goldens/negatives) | `daml test` (SDK 3.4.11) | ✓ ALL PASS — 27 tests incl. `test_clears_at_100`, `test_commit_reveal_clears_at_100`, `test_multibuyer_golden`, `test_cash_instrument_agnostic`, `test_ineligible_submit_rejected`, `test_ineligible_holding_rejected`, `test_netting_conserves`, `test_atomicity`, `test_privacy_guest_fill`, `test_holding_split_merge`, `test_eligibility_issue` |
| Solver unit/parity | `npx vitest run` | ✓ 141 passed (13 files) — incl. `settlement.test.ts` (7), `topology.test.ts` (4), `auction.test.ts` (13) |
| Web production build | `npm run build` (`tsc --noEmit && vite build`) | ✓ built, 115 modules, no type errors |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `daml/Umbra/Instrument.daml` | Token-agnostic `InstrumentId` (DFIN-03) | ✓ VERIFIED | `InstrumentId {issuer, id}` + named `Instrument` template; projection helper. |
| `daml/Umbra/Holding.daml` | CN-Token-Standard custody + bond lock; retire Asset | ✓ VERIFIED | Implements real `HoldingV1.Holding` interface; `lock : Optional Text` for bond; operator-custody Split/Merge/Reassign with lock guards. |
| `daml/Umbra/Settlement.daml` | Batch/Instruction build/net/conserve/settle | ✓ VERIFIED | `buildGrossInstructions` (N×M), `netLegs` (CCP netting), `conservationOk`, `settleBatch` (atomic threaded moves). |
| `daml/Umbra/Compliance.daml` | `DeskEligibility` + `assertDeskEligible` | ✓ VERIFIED | Keyless credential (documented LF-2.1 deviation), no-self-issue, honest stub label. |
| `daml/Umbra/Auction.daml` `Round.Clear` | Batch rewrite, drop single-buyer, conservation asserts, cashInstrument | ✓ VERIFIED | §8 recompute-and-assert backstop intact, then `settleBatch` with Holding cids; single-buyer guard gone. |
| `daml/Umbra/Roles.daml` | Eligibility gate on SubmitOrder/CommitOrder/IssueHolding | ✓ VERIFIED | `assertDeskEligible` at all three points. |
| `solver/src/settlement.ts` | netLegs/grossLegs TS mirror (parity) | ✓ VERIFIED | Mirrors Daml builders; 7 passing tests. |
| `solver/src/topology.ts` | isLocal hosting probe + hostingMap | ✓ VERIFIED | `hostingMap` + demo-real logic; wired to `/topology`; 4 tests. |
| `web/src/views/TopologyView.tsx` | View 07 topology + demo-real badge | ✓ VERIFIED (WIRED) | 223 lines; Nav item 07 enabled; rendered in App.tsx. |
| `web/src/views/JoinView.tsx` | Guest mobile join + COMP-01 reject | ✓ VERIFIED (WIRED) | 157 lines; routed via main.tsx `/join` branch. |
| `web/src/views/SettlementView.tsx` | Batch finality + token-agnostic cash + guest row | ✓ VERIFIED (WIRED) | 476 lines; `legsFromPreview` now mirrors `buildGrossInstructions` (MD-01 fixed). |
| `web/src/components/QrJoin.tsx` | QR host (no secret) | ✓ VERIFIED (WIRED) | Hosted in TheatreView; payload is URL+roundId only. |
| `scripts/localnet/guest-onboard.mjs` | bankD + scoped token | ✓ VERIFIED | Token written to gitignored tokens.json; never printed. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `Round.Clear` | `Settlement.settleBatch` | import + call Auction.daml:33,402 | WIRED |
| `Venue.SubmitOrder/CommitOrder/IssueHolding` | `assertDeskEligible` | Roles.daml:42,71,95 | WIRED |
| solver `settle()` | `Round.Clear` (Holding cids, cashInstrument) | ledger.ts:324-368 | WIRED |
| solver `/round/:id/topology` | `topology.hostingMap` | api.ts:881-885 | WIRED |
| `App.tsx` screen 07 | `TopologyView` | App.tsx:111 + Nav.tsx:21 | WIRED |
| `main.tsx` `/join` | `JoinView` | main.tsx:11-17 | WIRED |
| `TheatreView` | `QrJoin` / `buildJoinPayload` | TheatreView.tsx:23 | WIRED |
| solver `settlement.ts` | Daml `Settlement.daml` | parity mirror (grossLegs/netLegs) | WIRED (parity tested) |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `daml/Umbra/Settlement.daml:126-134` | `conservationOk` is a well-formedness screen, not a numeric-value-conservation gate (structurally always 0 for balanced transfers) | ℹ️ Info | Honestly documented in-code (LW-01); numeric conservation is proven on-ledger by `test_netting_conserves` and pinned by §8 recompute + `settleBatch` over-draw abort. Not exploitable. |
| DFIN-01 "Account" wording | No distinct `Account` template — desks hold operator-custody `Holding`s directly; allocate/approve collapse under sole-operator authority | ℹ️ Info | Honest operator-custody MVP topology (matches Asset topology it replaces). Batch/Instruction settle-finality intent met; a multi-party Account/allocate/approve model is the production path. |

No BLOCKER or WARNING anti-patterns. No unreferenced TBD/FIXME/XXX debt markers in phase files. Review MEDIUM (MD-01, SettlementView multi-buyer leg attribution) and LOW LW-02 (jurisdiction message) are FIXED in the shipped code.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| DFIN-01 | Holding/Instrument + Batch/Instruction finality, retire Asset | ✓ SATISFIED (reconciled → CN Token Standard) | Criterion 1 |
| DFIN-02 | Multi-buyer/seller crossing + optional netting | ✓ SATISFIED | Criterion 2 |
| DFIN-03 | Token-agnostic cash leg | ✓ SATISFIED | Criterion 2 |
| COMP-01 | On-ledger eligibility gating | ✓ SATISFIED (on-ledger; KYC vendor = Track B stub, labeled) | Criterion 3 |
| WOW-07 | Guest 4th desk via QR, own-fill only | ✓ SATISFIED (code) / live → UAT | Criterion 4 |
| VIZ-03 | Three-node topology + atomic cross-node settle | ✓ SATISFIED (code, demo-real) / live → UAT | Criterion 4 |

### Human Verification Required (Live UAT — consistent with Phases 8–10)

1. **Live 3-node cross-node atomic settle** — boot LocalNet + solver, run §4 Round.Clear, confirm atomic settle + $100.00.
2. **QR scanned on a real phone → guest join** — scan the 03 Theatre QR, submit a guest bid, see only own fill.
3. **Live guest onboarding + COMP-01 firing** — run guest-onboard.mjs, confirm ineligible-party rejection surfaces verbatim on JoinView.
4. **Live topology + settled-round render** — view 07 demo-real badge + AtomicStamp; SettlementView multi-buyer/guest legs.

(Full test/expected/why-human detail in frontmatter `human_verification`.)

### Gaps Summary

**No code gaps.** All four success criteria are implemented in shipped code and proven
by the Daml, solver, and web build gates the verifier ran. DFIN-01 is credited against
the honest RESEARCH RECONCILIATION target (real CN Token Standard CIP-0056 interface
conformance, not the unbuildable Daml Finance library). The unmet items are exclusively
genuinely-live behaviors requiring a booted Canton LocalNet + solver + a physical phone,
which cannot be autonomously verified on this box; their seams are all proven offline.
Per the project's established "Built · live UAT pending" discipline (Phases 8–10) and
the verifier decision tree (human items present → `human_needed`), status is
**human_needed**, not gaps_found.

---

_Verified: 2026-07-10T08:55:54Z_
_Verifier: Claude (gsd-verifier)_
