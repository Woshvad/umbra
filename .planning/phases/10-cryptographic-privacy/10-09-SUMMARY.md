---
phase: 10-cryptographic-privacy
plan: 09
subsystem: ui
tags: [react, groth16, zk-proof, honest-labeling, settlement, cryp-03]

# Dependency graph
requires:
  - phase: 10-07
    provides: "solver.ts operator-plane client fns generateProof / verifyProof / anchorProof / tamperProof + ProofArtifact/ProofEnvelope/AnchorResult/TamperProofResponse types + proofPackUrl"
provides:
  - "ProofOfClearingPanel (CRYP-03): post-clear Groth16 proof panel on the Settlement view — real off-ledger verify + on-ledger hash anchor on distinct tiers, PoC/cryptographer-review-gated, tamper-rejection demo, proof-pack export"
  - "web/src/lib/truncate.ts pure middle-truncation helper (0xab12…9f3c) reusable across all crypto-artifact surfaces"
  - "web/src/zk/clearingVKey.json — the public Groth16 verification key bundled for client-side verify/anchor envelopes"
affects: [10-cryptographic-privacy VIZ-02, honest-labeling grammar, any future crypto-artifact UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-tier provenance rendering in one panel: T2 solid-ink proof artifact / T3 dashed-ink off-ledger verify / T1 solid-ink on-ledger anchor — the solid-vs-dashed split IS the honest statement"
    - "Public verification key bundled into the web bundle (safe: not a secret) to form verify/anchor envelopes client-side without modifying solver.ts"
    - "Pure display helper (truncate.ts) unit-tested in isolation; full value preserved in title/aria-label"

key-files:
  created:
    - web/src/components/ProofOfClearingPanel.tsx
    - web/src/lib/truncate.ts
    - web/src/lib/truncate.test.ts
    - web/src/zk/clearingVKey.json
  modified:
    - web/src/views/SettlementView.tsx

key-decisions:
  - "Bundled the PUBLIC Groth16 vkey (copied from solver/src/zk/vkey.json to web/src/zk/clearingVKey.json) so the verify/anchor ProofEnvelope can be formed client-side. The generateProof response returns no vkey and solver.ts was frozen (must-not-modify) with no getVKey endpoint — a verification key is public by construction and crosses none of the HARD secret boundaries (Anthropic key / operator token / private witness). Deviation Rule 3 (missing referenced artifact needed to complete the task)."
  - "Sourced the displayed p*=100.00 / matched=10 from the settled preview (§4 invariant), and rendered the raw public-signal field elements literally as the order COMMITMENTS (publicSignals past [pStar, matched]); losing orders are absent — the 'reveals no losing order' property, stated in the mono-9 NO LOSING ORDER IN THE WITNESS note."
  - "Added an explicit ANCHOR ON-LEDGER ink-ghost control (anchor is not a named CTA in the spec) to keep off-ledger verify (T3) and on-ledger anchor (T1) as visually + interactionally distinct acts — the honest split."

patterns-established:
  - "middleTruncate(value, head, tail): non-lossy 0x… display, verbatim when truncation buys nothing, negatives clamped"
  - "ProvenanceTag / InkSquareRow / RedSquareRow inline helpers reusing the shipped comp-line-131 verdict + mono-9 bordered-tag grammar"

requirements-completed: [CRYP-03]

# Metrics
duration: ~20min
completed: 2026-07-09
---

# Phase 10 Plan 09: Proof of Correct Clearing (CRYP-03) Summary

**A post-clear Groth16 proof panel on the Settlement view that generates a real proof, verifies it OFF-ledger on a dashed T3 surface, anchors only its hash ON-ledger on a distinct solid T1 surface, and rejects a tampered clearing verbatim — honestly labeled PoC / cryptographer-review-gated, with no lime and no new design token.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-09
- **Tasks:** 2 of 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- **`ProofOfClearingPanel.tsx` (new)** — self-gated to `phase === 'cleared' | 'settled'`, mounted below the shipped DvP-legs / atomic-stamp / RoundBrief / ProofPackButton / TcaReceipts / LeakageSimPanel in `SettlementView`. Contains:
  - Header: block label "Proof of Correct Clearing" + persistent RED `POC · CRYPTOGRAPHER REVIEW PENDING` tag + 1px ink rule + the verbatim reduced-statement prose.
  - `GENERATE PROOF →` (ink-fill, `umbra-pulse` while generating) → `solver.generateProof`.
  - **T2 proof artifact** (SOLID ink + ink `ZK PROOF · GROTH16` tag): PUBLIC INPUTS pane (`p* = 100.00`, `matched = 10`, COMMITMENTS rendered literally on the ink evidence surface) + `NO LOSING ORDER IN THE WITNESS` note; PROOF bytes middle-truncated + `SIZE {n}B · {ms}ms`.
  - **T3 off-ledger verify** (DASHED ink + RED `OFF-LEDGER VERIFY · POC` tag): `VERIFY PROOF` (ink-ghost) → `solver.verifyProof` → ink square `PROOF VERIFIED OFF-LEDGER` (red square on a false verdict) + the verbatim "Canton has no zk-verifier precompile…" prose.
  - **T1 on-ledger anchor** (DISTINCT SOLID ink + ink `ON-LEDGER` tag): `ANCHOR ON-LEDGER` (ink-ghost) → `solver.anchorProof` → proof/vkey hash on the ink surface.
  - **Tamper-rejection demo**: `RUN TAMPERED CLEARING` (`.break-ai-force` red ghost, no confirm) → `solver.tamperProof` → red square `TAMPERED CLEARING → PROOF REJECTED` + the verbatim off-ledger rejection.
  - **`EXPORT PROOF ↓`** (`.umbra-ink-ghost`) reusing the WOW-05 proof-pack export (`proofPackUrl` fetch→blob→download); never red/lime.
- **`truncate.ts` + `truncate.test.ts` (new)** — pure `middleTruncate`; 7 tests green.
- **`clearingVKey.json` (new)** — the public Groth16 vkey bundled for the verify/anchor envelopes.
- **`SettlementView.tsx`** — imports + mounts the panel; the shipped simultaneous-settle rAF beat and money-shot reveal are byte-unchanged.

## Verification

- `cd web && npm run build` (tsc --noEmit + vite build) — **succeeds**.
- `cd web && npx vitest run` — **55 tests green** (incl. `truncate.test.ts` 7/7).
- Grep-clean: no `#D6FB3C`/lime usage, no operator token, no `@daml/react`/`DamlLedger` context in the panel (matches are documentation comments only).
- `git diff` of `SettlementView.tsx` — **no change** to the settle rAF block (`requestAnimationFrame` / `settleProgress` / `settleAtomically`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bundled the public Groth16 vkey to form the verify/anchor envelope**
- **Found during:** Task 1
- **Issue:** `solver.verifyProof` / `solver.anchorProof` require a `ProofEnvelope = { vkey, publicSignals, proof }`, but `solver.generateProof` returns no `vkey` and the frozen `solver.ts` exposes no `getVKey` endpoint. Without a client-side vkey the panel could not form a valid envelope.
- **Fix:** Copied the solver's PoC verification key (`solver/src/zk/vkey.json`) to `web/src/zk/clearingVKey.json` and imported it (`resolveJsonModule` already enabled). A Groth16 verification key is PUBLIC by construction — it is none of the HARD secret-boundary items (Anthropic key / operator token / private witness), so shipping it to the browser crosses no boundary.
- **Files added:** `web/src/zk/clearingVKey.json`
- **Commit:** 337913f

**2. [Rule 1 - Bug] JSX comment closed early on `p*/matched`**
- **Found during:** Task 1 (first build)
- **Issue:** A `{/* … p*/matched … */}` JSX comment contained the `*/` sequence, terminating the comment early and breaking the build (TS1005/TS1381).
- **Fix:** Reworded the comment to "p-star + matched".
- **Files modified:** `web/src/components/ProofOfClearingPanel.tsx`
- **Commit:** 337913f

## Known Stubs

None. The panel wires every control to a real `solver.ts` operator-plane endpoint; there are no hardcoded/placeholder data paths. (The live generate→verify→anchor→tamper round-trip against a running settled round is deferred — see Deferred / Human-Verify.)

## Deferred / Human-Verify (live stack)

Per the plan's automated gate, the following is deferred to end-of-phase human-verify and was NOT run here (do NOT boot Canton LocalNet / :3975 in this plan):

- **Live proof lifecycle** against a running solver (:4100) on a settled §4 round: `GENERATE PROOF` produces a real Groth16 artifact; `VERIFY PROOF` → `PROOF VERIFIED OFF-LEDGER`; `ANCHOR ON-LEDGER` records the proof/vkey hash; `RUN TAMPERED CLEARING` shows the verbatim off-ledger rejection; `EXPORT PROOF ↓` downloads the proof-pack. Confirm the PUBLIC INPUTS read `p* = 100.00` / `matched = 10` and that no losing order appears anywhere.

## Self-Check: PASSED

- FOUND: web/src/components/ProofOfClearingPanel.tsx
- FOUND: web/src/lib/truncate.ts
- FOUND: web/src/lib/truncate.test.ts
- FOUND: web/src/zk/clearingVKey.json
- FOUND (modified): web/src/views/SettlementView.tsx
- FOUND: commit 337913f (Task 1)
- FOUND: commit c62e68c (Task 2)
