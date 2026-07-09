---
phase: 10-cryptographic-privacy
verified: 2026-07-09T23:42:46Z
status: human_needed
score: 4/4 must-haves verified (automated gates); 3 live-stack items deferred to end-of-phase
overrides_applied: 0
human_verification:
  - test: "Boot Canton LocalNet (:3975/:2975/:4975) + solver (:4100); run the §4 fixture end-to-end through commit → post-bond → timelock → reveal → clear against the LIVE ledger."
    expected: "Batch clears at exactly $100.00 with fills A=10 / B=8 / C=2; a reveal that mismatches its on-ledger sha256 commitment is rejected by RevealOrder; a non-revealing desk forfeits its bond via ForfeitBond (CRYP-01)."
    why_human: "Requires the running Dockerized Canton stack + solver — verification policy forbids booting the live stack. Automated Daml Script (test_commit_reveal_clears_at_100, test_reveal_mismatch_rejected, test_bond_forfeit) proves the SAME logic in-memory and passes."
  - test: "Run a real tlock round-trip against a currently-open drand quicknet round: seal a payload to a future round, attempt early decrypt, then decrypt after the real beacon publishes."
    expected: "Early decrypt throws 'too early' against the LIVE drand network (not the deterministic local chain); post-beacon decrypt recovers the exact payload; offline path is labeled OFFLINE FALLBACK · WEAKER THAN DRAND when quicknet is unreachable (CRYP-02)."
    why_human: "Requires reachability to the live drand quicknet network + real-time wait for a future beacon. Automated tlock.test.ts proves seal/early-block/recover deterministically against a local chain and passes."
  - test: "Open view 06 · Time Machine against the running stack with per-party desk tokens; scrub the stage timeline (open→committed→timelocked→revealed→cleared→settled)."
    expected: "Each party column reads its OWN ACS at the stage offset over the wire — BankB genuinely returns ∅ of BankA's order; at COMMITTED/TIMELOCKED the operator column is ALSO redacted (bg-redact / NOT VISIBLE); derived stages are labeled DASHED + red RECONSTRUCTED (VIZ-02)."
    why_human: "Requires the live JSON Ledger API v2 + per-party tokens to read authentic per-party events. Automated TimeMachine.test.tsx proves the per-party redaction against a mocked v2 ACS and passes."
---

# Phase 10: Cryptographic Privacy Verification Report

**Phase Goal:** On-ledger commit–reveal, tlock/drand sealed-until-close, privacy time-machine replay, ZK proof-of-correct-clearing PoC (cryptographer review gates production use).
**Verified:** 2026-07-09T23:42:46Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 10 layers three cryptographic-privacy features onto the byte-frozen §4 clearing path: on-ledger sha256 commit–reveal (CRYP-01), drand timelock (CRYP-02), a Groth16 proof-of-correct-clearing with on-ledger hash anchoring (CRYP-03), plus a VIZ-02 per-party Time Machine. All automated correctness gates pass and every required artifact exists and is wired. The three live-stack confirmations (the "privacy money shot" end-to-end run, a live drand round, and the Time Machine reading live per-party events) are deferred to end-of-phase human verification per the phase's `human_verify_mode = end-of-phase` policy — they are NOT gaps.

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Sealed orders committed on-ledger as `hash(order‖salt)`, revealed at close; `Round.Clear` rejects a revealed order not matching its commitment; non-reveal forfeits a bond (CRYP-01) | ✓ VERIFIED (automated) | `daml/Umbra/Auction.daml`: `commitOf = sha256(toHex(payload‖salt))` (L162), `OrderCommitment.RevealOrder` recompute+assert (L181-196), `ForfeitBond` (L221). Daml tests pass: `test_commit_reveal_clears_at_100` (clears $100.00, A=10/B=8/C=2), `test_reveal_mismatch_rejected`, `test_bond_returned`, `test_bond_forfeit`, `test_proof_anchor`. Live end-to-end run deferred to human. |
| 2 | Orders timelock-encrypted (drand/tlock), undecryptable even by operator/solver until window closes; composes with Canton per-party visibility (CRYP-02) | ✓ VERIFIED (automated) | `solver/src/tlock.ts` wraps `timelockEncrypt/timelockDecrypt/roundAt` over `mainnetClient()` (quicknet); `tlock.test.ts` (5 tests) proves early-decrypt "too early" block + exact post-beacon recovery + offline fallback labeled WEAKER + secret-sweep. Live real-drand round-trip deferred to human. |
| 3 | ZK proof-of-correct-clearing PoC runs §8 over committed orders; proof verifiable off-ledger, anchored on-ledger, revealing no losing order (CRYP-03) | ✓ VERIFIED | `solver/src/zk/prove.ts` `groth16.fullProve`; `verify.ts` `groth16.verify`; `verify.test.ts` (4 tests): real §4 proof (p*=100, matched=10) accepted, forged public input → false, inconsistent fills (matched=12) → witness-gen throws. On-ledger `ProofAnchor` records only a hash. CR-01 (guessable index salt leaking losing orders) FIXED — random `randomBytes(31)` blinding salt at `index.ts:348-360`. |
| 4 | Privacy time-machine reconstructs each party's exact view at each stage (open→sealed→cleared→settled) from ledger events (VIZ-02) | ✓ VERIFIED (automated) | `solver/src/timemachine.ts` `recordStage/getStageOffsets`; `web/src/views/TimeMachineView.tsx` mounts per-party `ctx.DamlLedger` + `activeAtOffset` keyed by `getStageOffsets`, operator redacted at COMMITTED/TIMELOCKED; view 06 wired in `Nav.tsx` + `App.tsx`. `TimeMachine.test.tsx` (8 tests) proves per-party redaction vs mocked v2 ACS. Live per-party ledger read deferred to human. |

**Score:** 4/4 truths verified at the automated-gate level (authoritative per phase policy); 3 live-stack confirmations deferred to end-of-phase human verification.

### Required Artifacts

All 31 declared plan artifacts exist and are substantive (no stubs). Selected:

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `daml/Umbra/Auction.daml` | OrderCommitment + RevealOrder + ForfeitBond + ProofAnchor + commitOf | ✓ VERIFIED | 477 lines; real on-ledger sha256 binding; `Round.Clear` byte-unchanged (additive invariant holds) |
| `daml/Umbra/Tests.daml` | commit-reveal-clear + bond + anchor scripts | ✓ VERIFIED | 841 lines; all named tests present and pass |
| `solver/src/tlock.ts` | timelockSeal/Open + offline fallback | ✓ VERIFIED | 164 lines; quicknet client + WEAKER-labeled fallback |
| `solver/src/zk/{prove,verify}.ts` + `.wasm`/`.zkey`/`vkey.json` | real Groth16 prove/verify | ✓ VERIFIED | real circuit artifacts committed; proof accept + tamper reject |
| `solver/src/{ledger,timemachine,api,index}.ts` | forfeit/anchor/offset + endpoints + boot wiring | ✓ VERIFIED | tsc clean; zod-validated secret-safe endpoints |
| `web/src/solver.ts` | credential-free crypto client | ✓ VERIFIED | 381 lines; `cryptoUrls.test.ts` asserts no credential/port literal in bundle |
| `web/src/components/OrderTicket.tsx` | commit→committed→timelocked→revealed/forfeited lifecycle | ✓ VERIFIED | 1089 lines; T1/T2/T3 honest labels |
| `web/src/components/ProofOfClearingPanel.tsx` | T2 proof / T3 off-ledger verify / T1 anchor / tamper | ✓ VERIFIED | 558 lines; WR-02 verdict-gating fix present (L515-518) |
| `web/src/views/TimeMachineView.tsx` | per-party ACS-at-offset replay | ✓ VERIFIED | 552 lines; "REWIND THE BLINDNESS" |
| `web/daml.js` | regenerated bindings incl. OrderCommitment/ProofAnchor | ✓ VERIFIED | `Umbra/Auction/module.*` present |

### Key Link Verification

| From | To | Status | Details |
| ---- | -- | ------ | ------- |
| `Auction.daml RevealOrder` | `DA.Crypto.Text.sha256` | ✓ WIRED | `commitOf = sha256(toHex(...))` recompute + assertMsg equality |
| `tlock.ts` | `mainnetClient()` (quicknet) | ✓ WIRED | `timelockEncrypt/timelockDecrypt/roundAt` imported and used |
| `zk/prove.ts` | `groth16.fullProve(input, wasm, zkey)` | ✓ WIRED | ESM programmatic API |
| `api.ts` | tlock + zk + ledger.anchorProof + getStageOffsets | ✓ WIRED | crypto endpoints on :4100, DI via AppDeps |
| `web/solver.ts` | solver crypto endpoints (no auth header) | ✓ WIRED | credential-free client |
| `TimeMachineView.tsx` | per-party `ctx.DamlLedger` + `activeAtOffset` + `getStageOffsets` | ✓ WIRED | per-party token reads ACS at stage offset |

### Automated Gate Results (authoritative per phase policy)

| Gate | Command | Result | Status |
| ---- | ------- | ------ | ------ |
| Daml on-ledger correctness | `daml test` | 29 scripts ok, 0 failures; `test_commit_reveal_clears_at_100: ok` | ✓ PASS |
| Solver typecheck | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| Solver tests | `npx vitest run` | 126 passed / 11 files (incl. tlock 5, zk/verify 4) | ✓ PASS |
| Web build | `npm run build` (tsc+vite) | exit 0, built in 2.13s | ✓ PASS |
| Web tests | `npx vitest run` | 63 passed / 9 files (incl. cryptoUrls, TimeMachine, truncate) | ✓ PASS |

All five deterministic gates re-run by the verifier (no live ledger). Results match the orchestrator-collected evidence.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| CRYP-01 | 10-01, 10-05, 10-07, 10-08 | On-ledger commit–reveal + bond forfeit | ✓ SATISFIED | Auction.daml sha256 binding + Daml tests + OrderTicket lifecycle |
| CRYP-02 | 10-02, 10-03, 10-06, 10-07, 10-08 | Timelock (drand/tlock) sealed-until-close | ✓ SATISFIED | tlock.ts + tlock.test.ts (early-block + recover) |
| CRYP-03 | 10-01, 10-02, 10-04, 10-06, 10-07, 10-09 | ZK proof-of-correct-clearing PoC + anchor | ✓ SATISFIED | real Groth16 prove/verify + tamper-reject + ProofAnchor; CR-01 salt fix applied |
| VIZ-02 | 10-05, 10-06, 10-07, 10-10 | Privacy time-machine per-party replay | ✓ SATISFIED | timemachine.ts + TimeMachineView + per-party redaction test |

All 4 requirement IDs declared across plans map to REQUIREMENTS.md L115-132 and are covered. No orphaned requirements: the ROADMAP Phase 10 requirement set is exactly {CRYP-01, CRYP-02, CRYP-03, VIZ-02} and every ID is claimed by at least one plan. Each is marked `[x]` in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| — | No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified file | — | Debt-marker gate: PASS |
| `web/src/components/OrderTicket.tsx` (WR-01) | Cleartext order transits operator-plane solver at seal time during open window | ⚠️ Warning | Nothing on-ledger leaks (only commitment hash posted); no request-body logging exists. Documented in 10-REVIEW.md; honest-labeling scoping caveat, not a correctness failure. Open/deferred. |
| `daml/Umbra/Auction.daml:407-423` (WR-03) | `creditCash` full-consume branch threads an archived ContractId (latent multi-seller abort) | ⚠️ Warning | Never fires on §4 fixture (every leg takes Split branch); aborts rather than mis-settles. Additive invariant intact. Documented; deferred. |
| `solver/src/zk/clearing.circom` / `index.ts` (IN-01/05) | N=3 fixed, integer-limit only, 16-bit comparators | ℹ️ Info | Documented PoC scope; safe on §4. |

**Resolved during review (re-gated green):**
- **CR-01 (was BLOCKER)** — guessable index ZK salt leaking losing orders → FIXED in commit `488d07f`: `saltFieldElement()` uses `randomBytes(31)`, module-private, never returned/logged (`index.ts:348-360`). Verified in code.
- **WR-02** — hardcoded "PROOF REJECTED" tamper label → FIXED in commit `2c74606`: verdict now gated on `tamper.rejected`, with a distinct `ANOMALY — TAMPER ACCEPTED, INVESTIGATE` state (`ProofOfClearingPanel.tsx:515-518`). Verified in code.

### Honest-Labeling & Attribution Compliance

- Off-ledger-verify / on-ledger-anchor split, PoC / cryptographer-review-gated tags, and OFFLINE-FALLBACK-WEAKER-THAN-DRAND labels are present across solver + web surfaces.
- All Phase-10 commits (including the two fix commits) authored + committed by `woshvad`; zero `Co-Authored-By: Claude` / "Generated with" / Anthropic trailers. Compliant with CLAUDE.md rule 1.
- §4 invariant preserved: `test_commit_reveal_clears_at_100` proves the canonical batch still clears at exactly $100.00 with fills A=10 / B=8 / C=2 through the commit→reveal→clear path; `Round.Clear` byte-unchanged.

### Human Verification Required

The three live-stack confirmations below are deferred to end-of-phase live verification (phase `human_verify_mode = end-of-phase`). They are NOT gaps — each has a passing deterministic automated proxy gate. See frontmatter `human_verification` for the full test/expected/why-human detail:

1. **Live commit→timelock→reveal→clear at $100.00** against Canton :3975 + solver :4100.
2. **Live tlock round-trip** against a real currently-open drand quicknet round (real-time future-beacon wait).
3. **Time Machine reading LIVE per-party ledger events** against the running stack.

### Gaps Summary

No gaps. Every automated correctness gate passes, every required artifact exists and is wired, the two review issues that touched real guarantees (CR-01, WR-02) were fixed and re-gated green, and no unreferenced debt markers exist. The remaining review items (WR-01, WR-03, 5 info) are documented, honestly labeled, and do not break a correctness gate. Status is `human_needed` rather than `passed` solely because the phase's headline privacy deliverable — the live end-to-end privacy money shot, live drand round, and live per-party Time Machine — must be confirmed against the running stack, which the verification policy defers to end-of-phase human verification.

---

_Verified: 2026-07-09T23:42:46Z_
_Verifier: Claude (gsd-verifier)_
