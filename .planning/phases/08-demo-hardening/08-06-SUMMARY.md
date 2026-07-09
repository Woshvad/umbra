---
phase: 08-demo-hardening
plan: 06
subsystem: web
tags: [WOW-02, WOW-03, break-the-ai, nl-order, prefill, solver-client, ink-evidence-surface]
requires:
  - web/src/solver.ts (SOLVER_BASE_URL, call<T>, SolverError, OFFLINE_CAPTION, settle)
  - solver/src/api.ts (POST /parse-order → {side,qty,limit}; POST /round/:id/tamper-clear → {rejected,error})
  - web/src/operatorState.ts (OperatorViewState — roundId, offline)
  - web/src/components/AgentRationale.tsx (ink evidence surface + prefersReducedMotion pattern)
  - "@daml.js/umbra-0.1.0 Side enum"
provides:
  - "web/src/solver.ts — parseOrder(text) + tamperClear(id, mode) typed :4100 client methods"
  - "web/src/components/BreakTheAiPanel.tsx — WOW-02 before/after verbatim-reject → correct-clear panel"
  - "OrderTicket NL sub-block — WOW-03 plain-English PARSE → prefill (never auto-submit)"
  - "AgentView mount of <BreakTheAiPanel/> below the shipped grid"
affects:
  - web/src/views/AgentView.tsx (panel mount + roundId destructure)
  - web/src/components/OrderTicket.tsx (NL sub-block above the side toggle)
  - web/src/index.css (scoped .break-ai-force hover-fill rule, existing tokens only)
tech-stack:
  added: []
  patterns: [call<T>-client, ink-evidence-surface, red-square-verdict, reduced-motion-guard, prefill-never-autosubmit]
key-files:
  created:
    - web/src/components/BreakTheAiPanel.tsx
  modified:
    - web/src/solver.ts
    - web/src/views/AgentView.tsx
    - web/src/components/OrderTicket.tsx
    - web/src/index.css
decisions:
  - "parseOrder/tamperClear reuse SOLVER_BASE_URL + call<T> — no port literal, no operator/Anthropic credential in the browser"
  - "BreakTheAiPanel renders the VERBATIM ledger `error` string on the ink evidence surface (never a styled badge/summary); lime #D6FB3C used ONLY for the correct-clear 100.00 sub-reveal"
  - "RUN CORRECT CLEAR calls the existing settle(roundId) (shipped path); no new on-ledger write; no confirm dialog (tamper is atomic/harmless per UI-SPEC)"
  - "Scoped .break-ai-force:hover CSS rule (index.css) gives the red-ghost button its red-fill/paper-text hover — inline styles can't express :hover; uses existing #E2231A/#F4F1EA tokens only"
  - "OrderTicket NL sub-block PREFILLS side/qty/limit and shows PROPOSED BY CLAUDE — REVIEW & SEAL; onParse NEVER calls onSeal — SEAL ORDER stays the single confirm; ticketLocked one-per-round lock byte-unchanged"
  - "SolverError OFFLINE degrades gracefully (panel shows OFFLINE_CAPTION; NL parse falls to the error state so the desk can enter fields directly)"
metrics:
  duration: ~6 min
  tasks: 3
  files: 4
  tests: 21 passing
  completed: 2026-07-09
---

# Phase 8 Plan 6: WOW-02 Break-the-AI Panel + WOW-03 NL Order Sub-Block Summary

The two desk-/operator-plane UI surfaces that make "the ledger is the backstop" and "Claude drafts, the desk confirms" tangible on the shipped views. WOW-02 adds a self-contained, DEMO-labeled `BreakTheAiPanel` to the Agent view (04): a tamper-mode toggle + red-ghost `FORCE A WRONG CLEAR` that shows the VERBATIM on-ledger rejection, then a `RUN CORRECT CLEAR` that settles at $100.00 — the before/after contrast on screen. WOW-03 inserts a natural-language sub-block at the top of the Order Ticket where plain English + `PARSE →` prefills the existing structured fields; `SEAL ORDER` stays the single mandatory confirm (never auto-submit). Both surfaces go through `web/src/solver.ts` (:4100) — no operator/Anthropic credential in the browser.

## What Was Built

### Task 1 — Web client methods `parseOrder` + `tamperClear` (`4b0e657`)
- **`web/src/solver.ts`** — two typed methods mirroring the existing `call<T>` shape:
  - `parseOrder(text): Promise<{side:'Buy'|'Sell'; qty:number; limit:number}>` → `POST /parse-order` with `{text}`. A 422 `PARSE_FAILED` surfaces as `SolverError` for the UI to map to the parse-error state.
  - `tamperClear(id, mode): Promise<{rejected:boolean; error:string}>` → `POST /round/${id}/tamper-clear` with `{mode}` (`'wrong-price' | 'overfill'`).
- Added matching response types (`ParseOrderResponse`, `TamperMode`, `TamperClearResponse`). Both reuse `SOLVER_BASE_URL` — no port literal, no credential.

### Task 2 — WOW-02 `BreakTheAiPanel` + mount on AgentView (`8ab3829`)
- **`web/src/components/BreakTheAiPanel.tsx`** (NEW) — takes `{roundId, offline?}`:
  - Header sub-label "Break the AI" + a right-pushed `DEMO · ADVERSARIAL` mono tag (1px red border/red text).
  - Segmented tamper-mode toggle: **Wrong price** · **Over-fill (conservation)** (active = ink underline).
  - Red-ghost `FORCE A WRONG CLEAR` control → `tamperClear(roundId, mode)`; the verbatim `error` string renders on the ink evidence surface (`#0A0A0A`/`#F4F1EA`, mono 13px, `pre-wrap`, `22px 24px`) under a red-square `REJECTED BY LEDGER` row.
  - `RUN CORRECT CLEAR` control (ink/paper) → the existing `settle(roundId)`; shows the inline lime `100.00` 34px `umbra-slam` sub-reveal + a red-square `VERIFIED · SETTLED @ 100.00` row.
  - Verdict line "The ledger — not the AI — is the backstop." States: idle · attempting · rejected · clearing · corrected. `SolverError` OFFLINE → graceful `OFFLINE_CAPTION`. No confirm dialog.
- **`web/src/index.css`** — scoped `.break-ai-force` / `.break-ai-force:not(:disabled):hover` rule (red fill / paper text on hover) using only existing `#E2231A`/`#F4F1EA` tokens (inline styles can't express `:hover`).
- **`web/src/views/AgentView.tsx`** — destructures `roundId` and mounts `<BreakTheAiPanel roundId={roundId} offline={offline} />` BELOW the shipped proposal/rationale grid; the shipped grid, headline, and AgentProposal/AgentRationale composition are untouched.

### Task 3 — WOW-03 natural-language sub-block in OrderTicket (`1868e1d`)
- **`web/src/components/OrderTicket.tsx`** — a new NL sub-block ABOVE the existing side toggle:
  - Sub-label "Natural Language · Describe your order"; a borderless single-line Inter 14px input with a 1px ink bottom rule, placeholder `e.g. buy up to 10 under 101`; a ghost-mono `PARSE →` CTA.
  - `onParse` calls `parseOrder(text)` and PREFILLS the existing `side`/`qty`/`limit` state (`{side}`→`Side` enum, `qty`→`String`, `limit`→`toFixed(2)`) so the shipped 44px inputs fill; shows the mono `PROPOSED BY CLAUDE — REVIEW & SEAL` note.
  - States: idle · parsing (`PARSING…`, disabled, `umbra-pulse`) · parsed · error (verbatim WOW-03 copy). `Enter` in the input triggers parse.
  - `onParse` NEVER calls `onSeal` — `SEAL ORDER` remains the single confirmation and the `ticketLocked` one-per-round lock is byte-unchanged. The Anthropic key never reaches the browser (parse hits the solver).

## Verification

- `cd web && npm run build` — PASS (tsc `--noEmit` + vite build, 3 tasks).
- `cd web && npm test` — 21/21 vitest green (no regressions; pure-lib suites unaffected).
- `grep -rn ':4000' web/src` — empty (all captions derive the port from `SOLVER_BASE_URL`).
- Credential sweep of `web/src` — no operator-token / Anthropic-key literal; the only `anthropic`/`operator token` matches are documentation comments asserting their absence.
- `onParse` / `ticketLocked` grep — `onSeal` is bound only to the SEAL ORDER button; `ticketLocked` logic unchanged.

### Deferred Human-Verification (phase gate)
Live click-through is deferred to end-of-phase human verification per the standing Phases 1–7 precedent (config `human_verify_mode: end-of-phase`; the Canton LocalNet / :3975 ledger was intentionally not booted here):
- WOW-02: on a live round, toggle **Wrong price** → `FORCE A WRONG CLEAR` → observe the verbatim `clearingPrice does not match recomputed §8 p*` reject; toggle **Over-fill** → the `allocations do not match recomputed §8` / conservation reject; then `RUN CORRECT CLEAR` → settles at 100.00.
- WOW-03: type "buy up to 10 under 101" + `PARSE →` prefills Buy/10/101 (and "sell 8 at 99" → Sell/8/99) with the PROPOSED BY CLAUDE note; `SEAL ORDER` still required to submit.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Scoped hover-fill CSS rule for the red-ghost button.**
- **Found during:** Task 2. UI-SPEC specifies `FORCE A WRONG CLEAR` as "red 1px-border ghost … hover red fill / paper text", but the codebase has no hover-fill button precedent and inline React `style` cannot express `:hover`.
- **Fix:** Added a scoped `.break-ai-force` + `.break-ai-force:not(:disabled):hover` rule to `web/src/index.css` using only existing tokens (`#E2231A` red, `#F4F1EA` paper); removed the conflicting inline `border/background/color` from that one button so the class governs it. No new palette entry, no new keyframe.
- **Files modified:** web/src/index.css, web/src/components/BreakTheAiPanel.tsx
- **Commit:** 8ab3829

Otherwise the plan executed as written.

## Known Stubs

None. Both surfaces are wired to live solver endpoints (`parseOrder` → `POST /parse-order`; `tamperClear` → `POST /round/:id/tamper-clear`; `RUN CORRECT CLEAR` → `settle`). The §4 fallback price (100.00) used in the correct-clear reveal on a non-OFFLINE solver error is a correctness invariant, not a stub.

## Threat Surface

No new trust-boundary surface beyond the plan's `<threat_model>`. Both panels call only `web/src/solver.ts` (the sole operator proxy); no operator token / `@daml/react` context imported (T-08-06-OPTOK). The NL parse only PREFILLS; SEAL ORDER stays the single confirm (T-08-06-INJ). The tamper control only attempts an atomic `Round.Clear` that rolls back on reject (T-08-06-TAMPER). No Anthropic key literal in `web/src` (T-08-06-KEY).

## Self-Check: PASSED
- FOUND: web/src/components/BreakTheAiPanel.tsx
- FOUND: web/src/solver.ts (parseOrder + tamperClear exports)
- FOUND commit 4b0e657 (Task 1), 8ab3829 (Task 2), 1868e1d (Task 3)
- web build + 21 vitest green; grep-clean of :4000 and credential literals
