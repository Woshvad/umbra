---
phase: 11-settlement-institutional-grade
plan: 11
subsystem: settlement-view-deltas
tags: [DFIN-01, DFIN-02, DFIN-03, WOW-07, settlement, provenance, netting, token-agnostic, guest, honesty]
requires:
  - phase: 11-07
    provides: "solver settlement shape (grossLegs/netLegs/conserves) + token-agnostic InstrumentRef"
  - phase: 11-08
    provides: "web/src/solver.ts SettlementMeta seam (provenance/instructionCount/netted/cashSymbol/legs) + ctxD guest plumbing + GUEST DeskMeta"
provides:
  - "web/src/components/DvpLegs.tsx: Batch/Instruction sub-label + ALLOCATED → APPROVED → SETTLED finality grammar + token-agnostic {cash} {symbol} arrow + netted/gross mode tag"
  - "web/src/views/SettlementView.tsx: data-driven honest provenance tag + NETTED ⇄ GROSS LEGS toggle (default NETTED) + guest aggregate row; §4 canary + simultaneous-settle beat preserved"
affects: [phase-11-verification]
tech-stack:
  added: []
  patterns:
    - "Settlement-meta consumed decode-safe: preview.settlement?.{provenance,netted,cashSymbol} with honest D13 fallbacks (CN TOKEN STANDARD (CIP-0056) / USDCx) so the view renders before the solver emits meta"
    - "Netting is a pure display switch (toNettedLegs aggregates gross seller→buyer legs) that conserves balance-table totals — §4 single-buyer reduces to identical legs (canary safe)"
    - "Honest-labeling discipline extended to CODE COMMENTS: the standalone library name appears in NEITHER file (grep-gated), not just the rendered strings"
key-files:
  created: []
  modified:
    - web/src/components/DvpLegs.tsx
    - web/src/views/SettlementView.tsx
decisions:
  - "instructionCount is DERIVED from the active legs (legs × 2 = bond delivery + cash payment) rather than read from meta.instructionCount, so the {N} sub-label always reflects what is actually rendered under the toggle (honest relative to the DvP arrows on screen)"
  - "Netting keyed by seller→buyer counterparty pair (net per pair); on §4 single-buyer each seller already has one leg so NETTED === GROSS visually — the toggle re-labels + re-keys but conserves, and the $100.00 / A=10·B=8·C=2 canary is untouched"
  - "provenance defaults to the D13 SHIPPED tag CN TOKEN STANDARD (CIP-0056) (11-01 recorded HoldingV1 conformance shipped, not the in-repo fallback); the literal string is present in source so it renders + passes the grep gate even before the solver emits meta"
  - "GUEST row appended only when a bankD allocation is present (codeOf resolves bankD → GUEST); §4 stays the canonical three desks with no guest perturbation"
metrics:
  duration: ~10 min
  tasks: 2
  files: 2
  completed: 2026-07-10
---

# Phase 11 Plan 11: Settlement View Deltas (Batch/finality/netting/provenance/token-agnostic/guest) Summary

The final Phase-11 plan applies the production-grade settlement deltas to **view 05**
(`SettlementView` / `DvpLegs`): the **Batch/Instruction** sub-label + the
`ALLOCATED → APPROVED → SETTLED` finality micro-grammar, a **HARD data-driven provenance
tag** (`CN TOKEN STANDARD (CIP-0056)` / `DAML-FINANCE-PATTERN (IN-REPO)` — the standalone
library name is rendered NOWHERE and appears in neither source file), a **`NETTED ⇄ GROSS
LEGS` toggle** (default NETTED) that conserves the balance-table totals, a **token-agnostic
cash symbol** read from data, and the **guest (Desk D) aggregate row** when present — all
while the shipped **single-rAF simultaneous-settle beat** and the **§4 canary** stay intact
(**$100.00 / A=10·B=8·C=2**, legs 8/2 @ 100).

## What Was Built

### Task 1 — DvpLegs Batch/instruction sub-label + finality grammar + token-agnostic cash (commit `2560c56`)
- Sub-label relabeled `Delivery vs Payment · Batch/Instruction · {N} instructions` (the
  `{N}` is `instructionCount`, defaulting to `legs.length × 2` = one bond + one cash
  Instruction per leg when the caller does not supply an authoritative count).
- Added the `ALLOCATED → APPROVED → SETTLED` settlement-finality micro-grammar (mono-9,
  opacity .6) with a trailing `· NETTED` / `· GROSS LEGS` mode tag off the `netted` prop.
- Replaced the hardcoded `← {cash} USDCx` cash-arrow literal with the token-agnostic
  `← {cash} {cashSymbol}` (DFIN-03), `cashSymbol` defaulting to `USDCx`.
- New optional props `instructionCount` / `cashSymbol` / `netted`; the legs still render off
  the SINGLE shared `settleProgress` clock (both modes stay simultaneous — never sequenced).
- The standalone library name is absent from the file (comments reworded to satisfy the
  hard grep gate).

### Task 2 — SettlementView provenance tag + netting toggle + guest row (commit `ed0c05e`)
- **Provenance tag (HARD honesty, D13):** a mono-9 ink-border tag rendering
  `{provenance}` — `preview.settlement?.provenance ?? 'CN TOKEN STANDARD (CIP-0056)'` (the
  11-01 shipped path). `DAML-FINANCE-PATTERN (IN-REPO)` renders when the solver reports the
  faithful in-repo fallback. The standalone library name is never rendered.
- **`NETTED ⇄ GROSS LEGS` toggle (default NETTED):** a mono-9 ink-border button switching
  `activeLegs` between `toNettedLegs(grossLegs)` (one net leg per counterparty pair) and the
  gross seller→buyer legs. Both sum to identical qty + cash, so the **balance table totals
  stay conserved** across the toggle (the `BalanceTable` before→after is unchanged).
- **Instruction count + cash symbol threaded through** to `DvpLegs` (`instructionCount =
  activeLegs.length × 2`, `cashSymbol` from meta).
- **Guest (Desk D) aggregate row (WOW-07):** `codeOf` resolves the guest party
  (`bankD::… → GUEST`); when a `GUEST` allocation is present it is appended to the balance
  rows (with a `GUEST_BEFORE` holding) and surfaces as a leg. §4 has no guest → the table
  stays the canonical three desks.
- **Preserved:** the single-rAF `settleAtomically` beat (0→1 over ~800ms driving all legs +
  balances together), the `§4 BEFORE` balances, `AtomicStamp`, the CTA, and the entire
  post-settle stack (RoundBrief / TcaReceipts / ProofPackButton / LeakageSimPanel /
  ProofOfClearingPanel) — all untouched.

## Verification

| Check | Result |
|-------|--------|
| `grep -c "ALLOCATED → APPROVED → SETTLED" DvpLegs.tsx` | 2 (comment + render) |
| `! grep -rq "Daml Finance" DvpLegs.tsx SettlementView.tsx` | ABSENT — passes (standalone library name in neither file) |
| `grep -Eq "\{ *(cash)?[Ss]ymbol *\}" DvpLegs.tsx` | matches (`{cashSymbol}` token-agnostic arrow) |
| `grep -c "…CIP-0056… \| …IN-REPO…" SettlementView.tsx` | 3 |
| `grep -c "NETTED" SettlementView.tsx` | 6 |
| `cd web && npm run build` | green (tsc + vite, `built in 8.13s`) |
| `cd web && npx vitest run` | green — **77/77** (11 files) |
| §4 canary render | legs MERIDIAN→BLUEROCK 8 / HALWARD→BLUEROCK 2, `← 800/200 USDCx`, clear $100.00; balances A=10/4000·B=12/1800·C=13/1200 |
| Views 01–06 | unaffected (only view-05 files touched) |

## Deviations from Plan

**None** — plan executed as written. One in-flight correction (not a plan deviation): the
first draft of the DvpLegs header comment contained the standalone library name, which the
hard honesty grep gate (`! grep -rq "Daml Finance"`) caught pre-commit; the comment was
reworded before the Task 1 commit so the gate passes. No functional change.

## Honest Limitations / Boundaries (recorded)

- **Solver does not yet EMIT `preview.settlement`.** Per 11-08, `SettlementMeta` is a
  type-only seam on the solver-client; the emitting solver-plane change is not in this
  frontend plan's scope. The view is decode-safe: it renders the honest D13 fallback
  (`CN TOKEN STANDARD (CIP-0056)` + `USDCx`) until the solver populates the block. When the
  solver emits `provenance: 'DAML-FINANCE-PATTERN (IN-REPO)'` (the faithful fallback layer),
  the tag switches automatically — no view change needed.
- **Netting is visually identical to gross on §4** (single-buyer → one leg per seller). The
  toggle is proven to re-key + re-label + conserve here; a **live multi-buyer / guest round**
  where NETTED collapses multilateral legs into fewer net instructions is a **live-UAT** item
  (needs a booted stack + a 2-buyer or guest-joined round).
- **Guest aggregate row is data-gated** (`GUEST` allocation present). Exercising it requires
  a live guest join via `/join` (WOW-07) against a running stack — **live-UAT**. §4 (no
  guest) is fully covered here.
- **Not run against a live LocalNet.** The settled-round render (Batch legs, provenance tag,
  netting toggle, guest row) against a booted stack is a phase-verification / live-UAT item
  (Phases 1–3 precedent); all offline gates (web build + 77 vitest + the honesty greps + the
  §4 canary) are green.

## Live-UAT Checklist (deferred to phase verification)

1. Boot LocalNet + deploy; run the §4 round → view 05 renders the Batch/Instruction
   sub-label + `ALLOCATED → APPROVED → SETTLED`, the `CN TOKEN STANDARD (CIP-0056)` tag,
   NETTED default, `← 800/200 USDCx`, settling simultaneously to $100.00 / A=10·B=8·C=2.
2. Toggle NETTED ⇄ GROSS LEGS → legs re-render, balance table totals unchanged (conserved).
3. Run a 2-buyer or guest-joined round → the guest `GUEST` row appears in the aggregate
   balances/legs; NETTED visibly collapses multilateral legs vs GROSS.
4. Confirm the standalone library name renders NOWHERE on view 05.

## Self-Check: PASSED

- Modified files exist: `web/src/components/DvpLegs.tsx`, `web/src/views/SettlementView.tsx` — both FOUND.
- Commits exist: `2560c56` (Task 1), `ed0c05e` (Task 2) — both FOUND in `git log`
  (author/committer = woshvad, no Claude/AI attribution).
- `cd web && npm run build` green; `cd web && npx vitest run` 77/77 green.
- Honesty greps green; §4 canary $100.00 / A=10·B=8·C=2; the standalone library name in neither file.
