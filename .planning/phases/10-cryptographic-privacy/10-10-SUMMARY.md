---
phase: 10-cryptographic-privacy
plan: 10
subsystem: web-frontend
tags: [VIZ-02, time-machine, per-party-privacy, redaction, honest-labeling, view-06]
requires:
  - "web/src/solver.ts getStageOffsets + Stage/StageOffsets types (10-07)"
  - "web/src/ledger/v2react.tsx per-party DamlLedger + fetchAcs wire shape (v2 migration)"
  - "web/src/ledgerContexts.ts ctxA/ctxB/ctxC per-party planes"
  - "web/src/desks.ts tokens + httpBaseUrlFor (desk-only tokens)"
provides:
  - "New view 06 · Time Machine — VIZ-02 per-party authentic ACS-at-offset replay"
  - "Pure cell-verdict core (bankCell/operatorCell/ordersFromAcs/visibleDesksFromAcs) reusable + unit-tested"
affects:
  - "web/src/App.tsx routing, web/src/components/Nav.tsx (6-tab nav)"
tech-stack:
  added: []
  patterns:
    - "Offset-scoped per-party read (activeAtOffset) mirroring v2react.fetchAcs, authenticated as each desk's OWN token"
    - "Honest provenance grammar: T1 visible (LEDGER EVENT @ offset) / bg-redact NOT VISIBLE / dashed-red RECONSTRUCTED"
    - "Secret-boundary-honest OPERATOR column: reconstructed (no operator token in browser), blinded at the venue-blind stage"
    - "DOM-free logic test of a .tsx view core (node-env vitest, no jsdom/RTL)"
key-files:
  created:
    - "web/src/views/TimeMachineView.tsx"
    - "web/src/views/TimeMachine.test.tsx"
  modified:
    - "web/src/components/Nav.tsx"
    - "web/src/App.tsx"
    - "web/vitest.config.ts"
decisions:
  - "OPERATOR column is honestly RECONSTRUCTED (never authentic) because the browser holds NO operator token — the secret boundary makes the venue view un-readable here, which is itself the privacy proof; at COMMITTED/TIMELOCKED it is redacted like every desk (venue-blind, CRYP-02)."
  - "Each bank column shows a 3-subject matrix (BANK-A/B/C order) of what THAT viewer can see — so BankB's column visibly renders BankA + BankC as NOT VISIBLE, one visible own cell; this makes 'sees ∅ of rivals' a screenshot, not a claim."
  - "The shipped v2react provider only reads at ledger-END; the time machine needs activeAtOffset, so — within this plan's file scope (v2react.tsx/peek.ts untouched) — each column issues its own offset-scoped active-contracts read that byte-mirrors fetchAcs/buildPeekRequest, using ONLY that desk's own token."
metrics:
  duration: ~18 min
  completed: 2026-07-10
---

# Phase 10 Plan 10: VIZ-02 Privacy Time Machine (view 06) Summary

**One-liner:** A new `06 · Time Machine` view that replays each party's exact per-stage view from authentic per-party JSON Ledger API v2 reads (ACS-at-offset with each desk's own token), reusing the shipped redaction motif, with the venue-blind beat at TIMELOCKED and honest RECONSTRUCTED labeling where no captured event exists.

## What Was Built

### Task 1 — TimeMachineView (commit 3971883)
`web/src/views/TimeMachineView.tsx` — the sixth view. Standard page frame (section marker `06` + `Time Machine · Per-Party Replay`, 1px ink rule, Space Grotesk `text-54` headline `REWIND THE BLINDNESS.`). A keyboard-operable timeline scrubber (five stage nodes `OPEN · COMMITTED/TIMELOCKED · SEALED/REVEALED · CLEARED · SETTLED` on a 1px ink rail; ←/→ move, Home/End to ends; active = ink-filled 8px square). Below it a 4-column per-party grid (BANK-A/B/C + OPERATOR, internal 1px ink borders, last borderless).

Each bank column mounts its OWN `ctx.DamlLedger` (ctxA/ctxB/ctxC, that desk's token/node) and reads its ACS at the scrubbed stage's offset (from `solver.getStageOffsets`) via an offset-scoped `active-contracts` read that byte-mirrors `v2react.fetchAcs`. It renders a 3-subject matrix (what the viewer can see of each of the three orders):
- **VISIBLE (T1)** → real order data (side/qty/limit, mono tabular) + neutral caption `LEDGER EVENT @ {offset}`.
- **BLINDED** → `bg-redact` stripe + `NOT VISIBLE` (aria-hidden stripe; state in adjacent text).
- **RECONSTRUCTED (T3)** → dashed red cell + `RECONSTRUCTED` tag (stages/planes with no captured event).

Venue-blind beat: at `COMMITTED/TIMELOCKED` every column (incl. OPERATOR) is redacted — contents are ciphertext. The OPERATOR column is presentational only (no operator token in the browser) and is honestly RECONSTRUCTED elsewhere. Offline (`SolverError` `OFFLINE`) → shipped `OFFLINE_CAPTION`; no captured round → empty-state copy.

The cell-verdict core is exported as pure, DOM-free functions: `bankCell`, `operatorCell`, `ordersFromAcs`, `visibleDesksFromAcs`, `isVenueBlindStage`, `STAGE_NODES`, `ledgerEventCaption`.

### Task 2 — Nav tab + App route + test (commit 666af00)
- `Nav.tsx`: `Screen` union gains `'timemachine'`; the `06 · TIME MACHINE` tab appended (shipped 5 tabs byte-unchanged).
- `App.tsx`: `screen === 'timemachine'` routes to `<TimeMachineView {...operatorState} />` (threading the lifted round state).
- `TimeMachine.test.tsx`: DOM-free logic test against a mocked v2 ACS response proving (1) BankB sees ∅ of BankA → NOT VISIBLE, (2) own column renders T1 `LEDGER EVENT @ {offset}`, (3) OPERATOR redacted at COMMITTED/TIMELOCKED, (4) a derived stage/plane → RECONSTRUCTED. 8 tests.

## Verification

- `cd web && npm run build` (tsc --noEmit + vite build): **PASS** (97 modules, view in bundle).
- `npx vitest run src/views/TimeMachine.test.tsx`: **8 passed**.
- Full web `npx vitest run`: **63 passed / 9 files** (incl. TimeMachine.test.tsx).
- Secret boundary: per-party columns use ONLY `tokens[deskKey].token` (desk tokens); the sole operator-plane call is the credential-free `getStageOffsets`. No operator token / `ANTHROPIC_API_KEY` in the view.
- Design tokens: only existing tailwind tokens/fonts/keyframes reused (`text-54/22/14/13/11/10/9`, `font-display/mono/body`, `bg-ink`, `bg-redact`, `animate-umbra-fade/pulse`). No new token/font/size/keyframe.
- §4 invariant untouched (no clearing/template/solver change).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest `include` glob to collect the `.tsx` test**
- **Found during:** Task 2
- **Issue:** The plan's required artifact is `web/src/views/TimeMachine.test.tsx`, but `web/vitest.config.ts` had `include: ['src/**/*.test.ts']`, which does not match `.test.tsx`. The test would never be collected, so `npx vitest run` (the automated gate) could not exercise it.
- **Fix:** Changed the glob to `['src/**/*.test.{ts,tsx}']`. The environment stays `node` — the test asserts pure exported functions and never renders (no jsdom/RTL added). This is the minimal change that lets the plan's named `.tsx` test run.
- **Why safe (no sibling conflict):** 10-10 is the final plan of Phase 10; siblings 10-08/10-09 are complete, so there is no parallel writer of `vitest.config.ts`.
- **Files modified:** web/vitest.config.ts
- **Commit:** 666af00

**2. [Rule 2 - Design honesty] OPERATOR column is RECONSTRUCTED, not authentic**
- **Found during:** Task 1
- **Issue:** The plan's grid lists an OPERATOR column with authentic per-party reads, but the HARD secret boundary forbids the operator token in the browser (the browser holds only the three desk tokens). An authentic operator-plane read is therefore impossible here.
- **Fix:** The OPERATOR column is presentational: honestly labeled `RECONSTRUCTED` (T3) at every stage except `COMMITTED/TIMELOCKED`, where it is redacted like every desk (the venue-blind beat). This is stronger, not weaker — the venue view is un-readable in the browser *by construction*, which is itself the privacy statement. Documented in-file + in the test.
- **Files modified:** web/src/views/TimeMachineView.tsx (design decision, not a code defect)

## Deferred / Human-Verification Checkpoint

**Live per-party replay against the running stack (deferred — not a task failure).** Per the plan's automated gate, this build does NOT boot Canton LocalNet or hit `:3975`; the tests use mocked/fixture per-party ACS data. To verify the money shot live at end-of-phase:
1. Boot the stack (LocalNet + solver on `:4100`) and run a full round (open → commit/timelock → reveal → clear → settle) so the solver records the stage→offset map.
2. Open the web app, navigate to `06 · Time Machine`.
3. Scrub the timeline: confirm each bank column shows only its OWN order (rivals `NOT VISIBLE`), the `LEDGER EVENT @ {offset}` caption carries the real recorded offset, and at `COMMITTED/TIMELOCKED` every column (incl. OPERATOR) is redacted.
4. Confirm §4 still clears at $100.00 (A=10/B=8/C=2) end-to-end.

## Known Stubs

None. The empty/offline states are honest UI states (documented copy), not data stubs. The OPERATOR column's RECONSTRUCTED state is intentional and honestly labeled (see Deviation 2), not a placeholder to be wired later.

## Threat Flags

None — no new network endpoint, auth path, or trust-boundary surface was introduced. Per-party reads reuse the existing v2 active-contracts wire with desk-only tokens; the only operator-plane call is the pre-existing credential-free `getStageOffsets`.

## Self-Check: PASSED

- Files verified on disk: TimeMachineView.tsx, TimeMachine.test.tsx, Nav.tsx, App.tsx, vitest.config.ts, 10-10-SUMMARY.md.
- Commits verified in git history: 3971883 (Task 1), 666af00 (Task 2).
