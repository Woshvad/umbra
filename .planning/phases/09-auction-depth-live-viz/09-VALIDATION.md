---
phase: 9
slug: auction-depth-live-viz
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **This phase changes the correctness-critical core (order model + clearing math). The §4 golden canary ($100.00, fills A=10 / B=8 / C=2) and Daml⇄TS parity are the continuous guard — they MUST be green after every task commit.**

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (ledger)** | Daml Script tests (`daml test`) — pure `Clearing.daml` + `Round.Clear` re-verification |
| **Framework (solver)** | vitest — `solver/src/auction.ts` mirror + golden parity |
| **Config file** | `daml/daml.yaml` (Daml) · `solver/package.json` + vitest config (TS) |
| **Quick run command (ledger)** | `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml test"` |
| **Quick run command (solver)** | `cd solver && npm test` |
| **Full suite command** | ledger `daml test` + solver `npm test` (both must be green — includes §4 canary + golden Daml⇄TS parity) |
| **Estimated runtime** | ~60–180 seconds (Daml build+test dominates) |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (`daml test` for ledger edits, `npm test` for solver edits). The §4 canary (`test_clears_at_100` + TS §4 test) must stay green.
- **After every plan wave:** Run the FULL suite (both `daml test` and `npm test`) — assert §4 = $100.00 / A=10 / B=8 / C=2 AND Daml⇄TS golden parity.
- **Before `/gsd-verify-work`:** Full suite green + a live LocalNet §4 settle proof.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

> Populated by the planner/executor per PLAN task. Every clearing-core task MUST list the §4 canary + Daml⇄TS parity golden test as an acceptance command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | AUCT-01 | — | Additive `orderType` defaults to `Limit`; §4 seed unchanged | unit | `daml test` (§4 canary green) | ✅ | ⬜ pending |
| 9-02-01 | 02 | 2 | AUCT-02 | — | Rulebook enforced identically in Clearing.daml + auction.ts | unit | `daml test` + `npm test` (golden parity) | ✅ | ⬜ pending |
| 9-03-01 | 03 | 3 | AUCT-03 / VIZ-01 | T-9-privacy | Aggregate scalars only; small-N guard; no individual order leaks | unit | `npm test` (aggregate feed guard) | ❌ W0 | ⬜ pending |
| 9-04-01 | 04 | 4 | AUCT-04 | — | surplusVsLimitBp ≥ 0 on-ledger; reference labeled distinctly | unit | `daml test` (surplus proof) | ❌ W0 | ⬜ pending |
| 9-05-01 | 05 | 5 | WOW-06 | — | Client-side sim only; labeled; no real venue | unit | `npm test` (leakage sim math) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*The table above is a starting scaffold — the planner refines Task IDs / commands per actual PLAN task breakdown.*

---

## Wave 0 Requirements

- [ ] Golden fixtures for each new order type (noncompetitive, MAQ/AON, conditional) added to the Phase-8 golden-eval suite — assert Daml⇄TS parity.
- [ ] Privacy-guard test for the aggregate feed (≥2-order small-N guard; never emits an individual order).
- [ ] Existing §4 canary (`test_clears_at_100` + TS §4 test) confirmed present and wired as the continuous guard.

*Existing Daml + vitest infrastructure (from Phases 1/2/8) covers the core; new fixtures extend it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live aggregate indicative panel updates as sealed orders arrive without leaking individuals | AUCT-03 / VIZ-01 | Requires running LocalNet + solver + web + submitting sealed orders across desks | Boot stack; submit ≥2 orders per side; confirm only scalars (price/imbalance) render; confirm p* locks at close |
| Exportable TCA receipt renders + exports with correct surplus split | AUCT-04 | Visual/export artifact | Run §4 fixture to clear; open Settlement receipt; confirm surplusVsLimitBp ≥ 0 and reference-vs surplus labeled distinctly; export |
| Leakage sim shows $X lost on public book vs $0 on Umbra | WOW-06 | Illustrative UI panel | Open leakage sim on §4 orders; confirm labeled-as-simulation and $ saved figure |

---

## Validation Sign-Off

- [ ] All clearing-core tasks list the §4 canary + Daml⇄TS parity golden test as an acceptance command
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all new-order-type golden fixtures + privacy guard
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner refines the map)

**Approval:** pending
