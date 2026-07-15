# Deferred items — 260715-peek-informee-proof

Out-of-scope discoveries found while running the gates. NOT fixed by this task
(scope boundary: only auto-fix issues directly caused by this task's changes).

## PRE-EXISTING: 3 failing tests in `web/src/views/TimeMachine.test.tsx`

- **Observed:** `npx vitest run` in `web/` → `Test Files 1 failed | 14 passed (15)`,
  `Tests 3 failed | 148 passed (151)`.
- **Example failure:** `VIZ-02 Time Machine — per-party redaction verdicts > 2. the own
  column renders the real order as a T1 LEDGER EVENT @ {offset}` →
  `AssertionError: expected 'blinded' to be 'visible'` (TimeMachine.test.tsx:92).
- **Not caused by this task.** `TimeMachine.test.tsx` and `TimeMachineView.tsx` are both
  unmodified at HEAD (`git status` shows only `peek.ts`, `peek.test.ts`,
  `PeekConsole.tsx` dirty), and neither imports the peek module — `TimeMachineView.tsx`
  only *mentions* `peek.buildPeekRequest` in a comment (L25) describing that it mirrors
  the wire shape. There is no module-graph edge from the Time Machine to anything this
  task touched.
- **Owner:** the VIZ-02 Time Machine work (phase 10 validation), not WOW-01.
