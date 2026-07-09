---
phase: 10
slug: cryptographic-privacy
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `10-RESEARCH.md` § Validation Architecture (all four requirements' tooling was executed end-to-end on this box). Task IDs (`10-NN-NN`) are assigned by the planner; rows below are keyed by requirement + behavior until then.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (solver/web)** | `vitest@2.1.9` |
| **Framework (ledger)** | Daml Script via `daml test` — Git-Bash PATH-only |
| **Config file** | `solver/` vitest (existing) · `daml/daml.yaml` (test modules) · `web/` vitest (existing) |
| **Quick run command (solver)** | `cd solver && npx vitest run <file>` |
| **Quick run command (ledger)** | `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd /c/Users/woshv/Desktop/Umbra/daml && daml test"` |
| **Full suite command** | solver `npx vitest run` + web `npx vitest run` + `daml test` (all modules) |
| **Estimated runtime** | ~60–120 seconds (daml test dominates; snarkjs verify is sub-second on the §4 fixture) |

---

## Sampling Rate

- **After every task commit:** Run the sub-requirement's quick command (`daml test` for CRYP-01 tasks; `npx vitest run <file>` for CRYP-02/03/VIZ-02 tasks).
- **After every plan wave:** Run the full suite — solver `vitest run` + web `vitest run` + full `daml test`. The §4 canary (`test_clears_at_100` → **$100.00 / A=10 / B=8 / C=2**) must stay green.
- **Before `/gsd-verify-work`:** Full suite green **plus** a live LocalNet run of commit→reveal→clear at $100.00, a live tlock round-trip, and a live proof verify + tamper-reject.
- **Max feedback latency:** ~120 seconds (full suite). Quick per-task feedback < 30s.

---

## Per-Task Verification Map

Task IDs are assigned by the planner; `plan`/`wave` filled at plan time. Every requirement below maps to at least one automated command.

| Req | Behavior | Wave | Test Type | Automated Command | File Exists | Status |
|-----|----------|------|-----------|-------------------|-------------|--------|
| CRYP-01 | commit→reveal→clear still clears **$100.00 / A=10 / B=8 / C=2** | 0/1 | Daml Script | `daml test` (`test_commit_reveal_clears_at_100`) | ❌ W0 | ⬜ pending |
| CRYP-01 | reveal with wrong salt/order is REJECTED on-ledger (`sha256` re-check) | 1 | Daml Script | `daml test` (`test_reveal_mismatch_rejected`) | ❌ W0 | ⬜ pending |
| CRYP-01 | non-reveal by close forfeits the bond to operator pot | 1 | Daml Script | `daml test` (`test_bond_forfeit`) | ❌ W0 | ⬜ pending |
| CRYP-01 | valid timely reveal returns the bond | 1 | Daml Script | `daml test` (`test_bond_returned`) | ❌ W0 | ⬜ pending |
| CRYP-02 | encrypt → early-decrypt-BLOCKED → post-beacon-decrypt round-trip | 1 | vitest (solver) | `npx vitest run tlock.test.ts` | ❌ W0 | ⬜ pending |
| CRYP-02 | offline fallback decrypts at close and is flagged **weaker** | 1 | vitest (solver) | `npx vitest run tlock.test.ts` | ❌ W0 | ⬜ pending |
| CRYP-03 | verifier ACCEPTS the real §4 Groth16 proof | 1 | vitest (solver) | `npx vitest run zk/verify.test.ts` | ❌ W0 | ⬜ pending |
| CRYP-03 | verifier REJECTS a tampered clearing (forged public input) + witness-gen fails on inconsistent fills | 1 | vitest (solver) | `npx vitest run zk/verify.test.ts` | ❌ W0 | ⬜ pending |
| CRYP-03 | on-ledger proof-HASH anchor recorded (off-ledger verify / on-ledger anchor split) | 1 | Daml Script + vitest | `daml test` (`test_proof_anchor`) | ❌ W0 | ⬜ pending |
| VIZ-02 | per-party ACS-at-offset redaction matches Canton disclosure (BankB sees ∅ of BankA; operator redacted at timelocked stage) | 1 | vitest (web, mocked v2) + live | `npx vitest run TimeMachine.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `daml/Umbra/` (or `daml/test/`) commit–reveal test module — CRYP-01 (clears-at-$100, mismatch-rejected, bond forfeit/return)
- [ ] `solver/src/tlock.test.ts` — CRYP-02 round-trip + fallback (near-future round or mocked beacon for determinism)
- [ ] `solver/src/zk/verify.test.ts` + committed zk fixtures (wasm/zkey/vkey/proof for §4) — CRYP-03 accept + tamper-reject
- [ ] `web/src/**/TimeMachine.test.tsx` — VIZ-02 per-party redaction vs mocked v2 ACS
- [ ] Regenerate + commit `web/daml.js` after `OrderCommitment` / proof-anchor templates land
- [ ] Framework installs: `tlock-js`, `snarkjs`, `circomlibjs` (solver deps), `circomlib` (dev), prebuilt `circom.exe` (build tool) — one `checkpoint:human-verify` before install per protocol (slopcheck unavailable on this box)

*Note: solver + web vitest infrastructure already exists; Wave 0 adds crypto test files + fixtures, not the framework.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live commit→reveal→clear at $100.00 on a booted LocalNet | CRYP-01 | Requires LocalNet (:3975) running; automated `daml test` uses in-memory ledger | Boot LocalNet, run the seed, drive commit→reveal→clear, confirm $100.00 / A=10 / B=8 / C=2 |
| Live tlock round-trip against real drand quicknet | CRYP-02 | Depends on external drand network liveness (automated test may mock the beacon) | Encrypt to a near-future round, confirm early-decrypt blocked, wait for beacon, decrypt |
| Time-Machine per-party visual redaction across the scrubber | VIZ-02 | Visual/interaction correctness of the redaction motif per the UI-SPEC | Drive a full round, scrub stages, confirm each party's column redacts per Canton disclosure (operator blind at timelocked stage) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (crypto test files + fixtures)
- [x] No watch-mode flags (`vitest run`, not `vitest`)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 — plan-checker verified every implementation task carries an `<automated>` verify, no 3-consecutive-task sampling gap, no watch-mode flags, and Wave-0 scaffolds are folded into 10-01/10-02. `wave_0_complete` flips true when Wave 0 actually executes.
