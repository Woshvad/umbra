---
phase: 12-real-on-chain-canton-devnet
plan: 05
subsystem: web-ui
tags: [four-eyes, compliance, IDEN-03, approve-reject, operator-plane, honest-labeling, light-ui]

# Dependency graph
requires:
  - phase: 12-real-on-chain-canton-devnet
    plan: 01
    provides: "On-ledger four-eyes ClearingApproval gate (Round.Clear fetch + assertClearingApproved) this control makes visible"
  - phase: 12-real-on-chain-canton-devnet
    plan: 02
    provides: "Solver four-eyes request/collect wiring inside settle() (gatherApprovalCid) — the real on-ledger enforcement this UI gate fronts"
provides:
  - "web/src/components/ComplianceApproval.tsx — comp-bound Compliance approve/reject control (COMPLIANCE · FOUR-EYES tag, IBM Plex Mono price, lime APPROVE / red REJECT, DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT micro-label)"
  - "web/src/solver.ts — approveClearing/rejectClearing (decode-safe, offline-guarded compliance-decision surface)"
  - "web/src/operatorState.ts — ClearingApprovalDecision verdict lifted so 03 Theatre gates the 05 Settlement settle CTA"
  - "web/src/views/SettlementView.tsx — FourEyesGate: settle CTA blocked until approved; on-ledger reject surfaced verbatim"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-view four-eyes gate via the shared operatorState verdict (RESEARCH Pattern 8 lift): the 03 Theatre control sets the approval, the 05 Settlement settle CTA reads it"
    - "Compliance-decision surface as a decode-safe/offline-guarded solver probe (getRound reachability) — the real on-ledger enforcement stays inside settle() (gatherApprovalCid), the UI verdict only gates the CTA"
    - "Honest degraded-mode labeling reused verbatim from 12-01/12-02: DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT"

key-files:
  created:
    - "web/src/components/ComplianceApproval.tsx"
  modified:
    - "web/src/solver.ts"
    - "web/src/operatorState.ts"
    - "web/src/App.tsx"
    - "web/src/views/TheatreView.tsx"
    - "web/src/views/SettlementView.tsx"

key-decisions:
  - "No standalone solver approve/reject HTTP endpoint exists — 12-02 wired four-eyes atomically INSIDE settle() (gatherApprovalCid). Rather than risk settle-path surgery / the §4 canary / 150 solver tests to expose a separate endpoint, approveClearing/rejectClearing are a decode-safe, offline-guarded compliance-DECISION surface (a getRound reachability probe) that records the verdict; the real on-ledger enforcement remains inside settle()."
  - "APPROVE gates the settle CTA cross-view — since settle lives on SettlementView (05) and the control mounts on TheatreView (03), the verdict is lifted through operatorState/App (Rule 2 critical functionality to satisfy the acceptance criterion). Extra files: operatorState.ts, App.tsx, SettlementView.tsx."
  - "Comp-token-pure: only paper #F4F1EA / ink #0A0A0A / lime #D6FB3C / red #E2231A + IBM Plex Mono (font-mono); no invented visual language (grep-verified no stray hex)."

patterns-established:
  - "Four-eyes UI = visible separation demo, honestly labeled; the on-ledger gate (12-01) + solver seam (12-02) are the real backstop, live human four-eyes is UAT"

requirements-completed: [IDEN-03]

# Metrics
duration: ~14min
completed: 2026-07-10
---

# Phase 12 Plan 05: Minimal Four-Eyes Compliance Approve/Reject Control (IDEN-03 UI Surface) Summary

**A LIGHT, comp-bound Compliance approve/reject control on the operator plane that makes the four-eyes separation visible: after the Close&Solve reveal, the recomputed clearing price surfaces with APPROVE (lime) / REJECT (red); APPROVE unblocks the 05 Settlement settle CTA, REJECT withholds it and surfaces the on-ledger four-eyes reject verbatim — the real enforcement stays the 12-01 on-ledger gate + 12-02 solver seam, with a dedicated dev compliance party and live human four-eyes at UAT.**

## Accomplishments

- **`web/src/components/ComplianceApproval.tsx` (new)** — a props-driven, presentation-only control for the dark inverted stage. Renders the recomputed clearing price in IBM Plex Mono (`font-mono`), a `COMPLIANCE · FOUR-EYES` tag, the honest `DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT` micro-label, and a three-state machine: PENDING (APPROVE lime `#D6FB3C`/ink + REJECT red `#E2231A`/paper, reusing the shipped button grammar) → APPROVED (lime confirmation row) | REJECTED (red row + the on-ledger four-eyes consequence). Comp tokens only — no new hex, no invented visual language.
- **`web/src/solver.ts` — `approveClearing` / `rejectClearing`** — decode-safe, offline-guarded compliance-decision methods (a `getRound` reachability probe so a down `:4100` throws the shipped `SolverError('OFFLINE')` exactly like the five endpoints), returning a typed `ComplianceDecision`. Honest module comment: no standalone four-eyes endpoint exists; the real request/collect/thread is inside `settle()` (12-02).
- **Cross-view gate** — `operatorState.ts` gains a `ClearingApprovalDecision` verdict (`idle`/`approved`/`rejected`) + setter, lifted in `App.tsx`, so the 03 Theatre control gates the 05 Settlement settle CTA.
- **`TheatreView.tsx`** — mounts `ComplianceApproval` below the SolvedStage reveal (gated to `preview` present, before settle); APPROVE/REJECT drive `approveClearing`/`rejectClearing` (offline-guarded, `approving` busy guard) and set the shared verdict. The shipped countdown/chart/reveal beat is untouched.
- **`SettlementView.tsx`** — the settle CTA is blocked until `approval === 'approved'`; a new `FourEyesGate` shows `PENDING COMPLIANCE FOUR-EYES SIGN-OFF` (idle) or `REJECTED BY COMPLIANCE — SETTLEMENT WITHHELD` (rejected) and surfaces the on-ledger four-eyes reject verbatim on the ink evidence surface (render, never summarize).

## Build / Test Result

- `cd web && npm run build` → **green** (tsc + vite; 118 modules).
- `cd web && npx vitest run` → **85/85 green** (12 files).
- Comp-token-pure: `grep` for hex outside `{#F4F1EA, #0A0A0A, #D6FB3C, #E2231A}` in `ComplianceApproval.tsx` → none.
- §4 flow unaffected: the money-shot reveal reads `preview.clearingPrice` (100.00 from the deterministic solver) unchanged; the control + gate are strictly additive. Views 01–07 numbers/visuals untouched (the gate adds an approval step to 05, as the plan intends: "§4 renders $100.00 with the approval step").

## Comp-Fidelity + Honesty-Label Confirmation

- Binds 100% to the binding `Umbra design/` tokens (paper/ink/lime/red + IBM Plex Mono via `font-mono`); reuses the shipped button grammar (RunningStage) + red-square verbatim-reject grammar (BreakTheAiPanel / AgentRationale). No new visual language.
- Honest labels present in BOTH surfaces: `COMPLIANCE · FOUR-EYES` tag + `DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT` micro-label (ComplianceApproval + the SettlementView FourEyesGate).

## Deviations from Plan

### Rule 3 — Blocking issue: the plan's "solver four-eyes endpoint (from 12-02)" does not exist

- **Found during:** Task 1.
- **Issue:** The plan (inline-authored during a classifier outage, plan-checker pending) assumes 12-02 exposed a standalone four-eyes HTTP endpoint. 12-02 in fact wired four-eyes ATOMICALLY inside `settle()` (`gatherApprovalCid`: request → compliance-approve → collect → thread), with no separate approve/reject route (verified: no such path in `solver/src/api.ts`).
- **Fix:** Implemented `approveClearing`/`rejectClearing` as a decode-safe, offline-guarded compliance-DECISION surface (a `getRound` reachability probe) that records the verdict the UI gates on. Did NOT perform settle-path surgery to expose a separate endpoint (that would risk the §4 canary + the 150-test solver suite for no demo benefit — the on-ledger gate is already the real enforcement). Documented honestly in-code + here.
- **Files:** `web/src/solver.ts`.

### Rule 2 — Critical functionality: cross-view gate to satisfy "APPROVE gates the settle CTA"

- **Found during:** Task 2.
- **Issue:** The plan scopes 3 files (ComplianceApproval.tsx, TheatreView.tsx, solver.ts) but requires "APPROVE gates the settle CTA" — and the settle CTA lives on SettlementView (05), a different view from the control's mount point (03 Theatre).
- **Fix:** Lifted a `ClearingApprovalDecision` verdict through the shared `operatorState` (RESEARCH Pattern 8), touching `operatorState.ts` + `App.tsx` + `SettlementView.tsx` in addition to the planned 3. This is the honest, real gate rather than a decorative button. Low-risk (no web test references these views).
- **Files:** `web/src/operatorState.ts`, `web/src/App.tsx`, `web/src/views/SettlementView.tsx`.

No other deviations. STATE.md / ROADMAP.md deliberately NOT modified per plan instructions (a pre-existing uncommitted STATE.md edit in the working tree was left untouched and unstaged).

## Honest Limitations (live UAT)

- **Live human four-eyes is UAT.** This ships a DEV COMPLIANCE PARTY stand-in; a real Compliance operator (a distinct, MFA'd identity) approving against a booted stack is UAT. The control makes the separation VISIBLE; the real enforcement is the 12-01 on-ledger `ClearingApproval` gate (`daml test`-proven, operator cannot self-approve) + the 12-02 solver request/collect seam.
- **The UI verdict gates the CTA, not the ledger.** In dev, `settle()` still requests+collects the compliance-signed approval server-side (operator-held compliance in the honest degraded mode); the UI approve/reject is the human-decision surface that fronts it. The distinct-authority separation is not enforced by the browser — it is proven on-ledger (12-01) and is live UAT.
- **No standalone approve/reject endpoint.** By design the four-eyes credential is threaded atomically at settle time (12-02); the client methods are a reachability-guarded decision recorder, not a dedicated RPC.

## Self-Check: PASSED

- FOUND: `web/src/components/ComplianceApproval.tsx`
- FOUND: `web/src/solver.ts` `approveClearing`/`rejectClearing`
- FOUND: `web/src/views/TheatreView.tsx` mounts `ComplianceApproval`; `web/src/views/SettlementView.tsx` `FourEyesGate` gate
- FOUND commits: `186e9a0` (Task 1), `da4671a` (Task 2)
- `cd web && npm run build` green; `cd web && npx vitest run` 85/85 green
- Comp-token-pure (no stray hex); honesty labels present in both surfaces
- No Claude/AI git attribution (author/committer = woshvad); STATE.md/ROADMAP.md not modified per plan instructions

---
*Phase: 12-real-on-chain-canton-devnet*
*Completed: 2026-07-10*
