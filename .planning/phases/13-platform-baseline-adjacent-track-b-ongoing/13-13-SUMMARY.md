---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 13
subsystem: ui
tags: [react, typescript, vite, rfq, adj-02, desk-plane, dvp, atomic-settle]

# Dependency graph
requires:
  - phase: 13-12
    provides: credential-free web client fns postRfq/getRfqQuotes/acceptRfqQuote + RFQ wire types (FirmQuote, RfqAcceptResponse)
provides:
  - S3 RfqPanel on the Desk view (02) — compose RFQ (BONDX/side/qty) → REQUEST QUOTE → firm signed quotes → ACCEPT BEST QUOTE → 1×1 atomic DvP settle
  - Reuse of the shipped DvpLegs + AtomicStamp settlement visuals for the RFQ settled state (no new settlement grammar)
  - Pure, exported RfqPanel helpers (bestQuoteIndex, legsFromAccept, classifyRfqError) + copy constants, unit-tested
affects: [13-14, S4-issuance-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Desk-plane RFQ panel: compose→post→poll getRfqQuotes→accept, all on the credential-free SOLVER_BASE_URL/call<T>() seam (no operator token / @daml React ctx / model key)"
    - "Settled state REUSES DvpLegs + AtomicStamp driven by a single rAF settleProgress 0→1 clock (simultaneity = atomicity), mirroring SettlementView's shipped settle beat"
    - "DOM-free vitest proof of a component's PURE exported core + a Vite `?raw` source grep-scan (no @types/node in this web project)"

key-files:
  created:
    - web/src/components/RfqPanel.tsx
    - web/src/components/RfqPanel.test.tsx
  modified:
    - web/src/views/DeskView.tsx

key-decisions:
  - "Exported the pure helpers FROM RfqPanel.tsx (tested in the co-located .tsx test) rather than a separate lib file — matching the TopologyNode.tsx/Topology.test.tsx precedent and keeping to the plan's exact 3 files"
  - "bestQuoteIndex is side-directional: BUY wants the lowest offered price, SELL the highest bid (stable on ties)"
  - "legsFromAccept derives one 1×1 DvP leg (buyer/seller flip by side) in the exact DvpLeg shape DvpLegs already renders — no new settlement grammar"
  - "Bounded quote polling (MAX_POLLS=8 @ 1s) falls back to the honest NO QUOTES YET empty state; all clocks cancelled on unmount"

patterns-established:
  - "Verbatim (non-offline) reject rendered on the ink evidence surface (#0A0A0A/#F4F1EA), matching the BreakTheAiPanel convention; OFFLINE SolverError → shipped OFFLINE_CAPTION"
  - "Source-level credential grep-clean proven in-test via Vite `?raw` import (typed by vite/client)"

requirements-completed: [ADJ-02]

# Metrics
duration: ~12min
completed: 2026-07-10
---

# Phase 13 Plan 13: ADJ-02 Web Surface Summary

**S3 RfqPanel on the Desk view (02): compose an RFQ (fixed BONDX · Buy/Sell toggle · mono qty) → REQUEST QUOTE → firm FIRM · SIGNED quotes with the BEST emphasized (1px-ink + BEST marker) → ACCEPT BEST QUOTE (single confirm, no dialog) → it settles as a 1×1 delivery-versus-payment REUSING the shipped DvpLegs + AtomicStamp atomic visuals. Desk-plane only, credential-free, offline/reject states honest.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-10T20:58:00Z
- **Completed:** 2026-07-10T21:07:00Z
- **Tasks:** 1
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Built `web/src/components/RfqPanel.tsx` — the S3 flow states from the UI-SPEC: idle/compose (instrument fixed `BONDX`, the Buy `#2B3AF2` / Sell `#FF3D9A` toggle, a mono qty input, `REQUEST QUOTE` ink-fill primary → `postRfq`); awaiting (`AWAITING QUOTES…` reduced-motion pulse; polls `getRfqQuotes`); quotes-in (dealer + price mono 15px/600 tabular-nums, `FIRM · SIGNED` tag, the best quote highlighted 1px-ink + `BEST` marker, `ACCEPT BEST QUOTE` single confirm → `acceptRfqQuote`); settling/settled (reuse `DvpLegs` + `AtomicStamp`, `SETTLED · ATOMIC`); empty (`NO QUOTES YET`); offline (`OFFLINE_CAPTION`); verbatim reject on the ink evidence surface.
- Mounted `RfqPanel` on `DeskView.tsx` below the OrderTicket/Holdings grid, passing the desk's OWN party (requester) + firm code — no token threaded.
- Added `web/src/components/RfqPanel.test.tsx` (19 tests): side-directional best-quote selection, the 1×1 DvP leg derivation for both sides, offline-vs-verbatim-reject classification, the verbatim copy contract, a fetch-mock credential scan of the REQUEST QUOTE / ACCEPT BEST QUOTE seam (T-13-38), and a Vite `?raw` source grep-scan (no `@daml/react` / operator token / Anthropic key / `:4000`).

## Task Commits

Committed atomically (author/committer = woshvad, no Claude attribution):

1. **Task 1: RfqPanel.tsx (S3) mounted on DeskView + test** - `3152546` (feat)

## Files Created/Modified
- `web/src/components/RfqPanel.tsx` - S3 RFQ side-mode panel (desk-plane): compose→quotes→accept→atomic-settle, reusing DvpLegs + AtomicStamp; exported pure helpers + copy constants
- `web/src/components/RfqPanel.test.tsx` - 19 DOM-free units (best-quote, DvP legs, error classifier, copy, credential scan, grep-clean)
- `web/src/views/DeskView.tsx` - mount RfqPanel below OrderTicket (fragment wrap; requester=own party, firm=code)

## Decisions Made
- **Pure core exported from the component (no new lib file):** Following the shipped `TopologyNode.tsx` / `Topology.test.tsx` precedent, the testable core (`bestQuoteIndex`, `legsFromAccept`, `classifyRfqError`, copy constants) is exported directly from `RfqPanel.tsx` and unit-tested in the co-located `.tsx` test. This keeps the change to the plan's exact three files while retaining full DOM-free coverage.
- **Side-directional best quote:** `bestQuoteIndex` picks the LOWEST offered price for a BUY requester and the HIGHEST bid for a SELL requester (stable on ties), reflecting who benefits.
- **Reuse over re-invent:** the settled state derives a single `DvpLeg` (`legsFromAccept`, buyer/seller flipped by side) and feeds the shipped `DvpLegs` + `AtomicStamp` off one rAF `settleProgress` clock — no new settlement grammar, honest 1×1-DvP label.
- **Vite `?raw` grep-scan:** this web project has no `@types/node`, so the source-level credential scan imports the component source as a raw string (`./RfqPanel.tsx?raw`, typed by `vite/client`) rather than `node:fs` — build-safe under `tsc --noEmit`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Source grep-scan switched from node:fs to Vite `?raw`**
- **Found during:** Task 1 verification (`npm run build`)
- **Issue:** The test's initial `readFileSync(node:fs)` + `node:url` grep-scan failed `tsc --noEmit` (TS2307: no `node:fs` types — this web project has no `@types/node`), blocking the build gate.
- **Fix:** Imported the component source as a raw string via Vite's `./RfqPanel.tsx?raw` (declared by the already-referenced `vite/client` types) — same grep assertions, build-clean.
- **Files modified:** web/src/components/RfqPanel.test.tsx
- **Verification:** `tsc --noEmit` clean; `npm run build` green; 19/19 RfqPanel tests pass.
- **Committed in:** 3152546 (Task 1 commit)

**2. [Rule 1 - Bug] Reworded a comment that tripped the panel's own grep-clean self-test**
- **Found during:** Task 1 verification (first vitest run)
- **Issue:** A doc comment in `RfqPanel.tsx` mentioned the literal `@daml/react` (describing the discipline), which the source grep-clean test correctly flagged.
- **Fix:** Reworded the comment to "no per-party ledger React context" so the bundle/source carries no `@daml/react` literal at all.
- **Files modified:** web/src/components/RfqPanel.tsx
- **Verification:** 19/19 RfqPanel tests green; the grep-clean case passes for all six forbidden literals.
- **Committed in:** 3152546 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking build-gate fix, 1 self-test-driven comment reword). No scope creep — the single planned artifact (`RfqPanel.tsx` + test) and the DeskView mount ship as specified.
**Impact on plan:** Both were mechanical build/test-gate fixes discovered during verification.

## Issues Encountered
None beyond the two auto-fixed gate items above. Full web suite (119 tests, 14 files) + `tsc --noEmit` + `npm run build` all green.

## Threat Model Compliance
- **T-13-38 (Information Disclosure — RfqPanel bundle):** the panel rides `postRfq`/`getRfqQuotes`/`acceptRfqQuote` over the single `SOLVER_BASE_URL`/`call<T>()` — no operator token, no per-party ledger React context, no model key. Proven two ways: a fetch-mock scan asserts REQUEST QUOTE / ACCEPT BEST QUOTE hit `SOLVER_BASE_URL + path` with no authorization/bearer/token/key header and no `:4000`; a source grep-scan asserts the component has no `@daml/react` / `ANTHROPIC` / `sk-ant` / `Authorization` / `Bearer` / `:4000` literal.
- **T-13-39 (Tampering — misrepresent settlement):** the settled state reuses the REAL `DvpLegs` + `AtomicStamp` visuals driven by the same rAF `settleProgress` clock as SettlementView, with an honest "1×1 delivery-versus-payment on the SAME atomic Canton machinery as the batch … not a separate settlement engine" label. No fabricated settle grammar.

## User Setup Required
None — the panel is additive and credential-free. Live behavior requires the solver running on `:4100` and its RFQ endpoints (existing operation); a down solver degrades to the shipped `OFFLINE_CAPTION`.

## Next Phase Readiness
- S3 RFQ is live on the Desk view; the existing OrderTicket/Holdings/Fill behavior is unchanged (additive fragment mount).
- The credential-free RFQ seam and the DvpLegs/AtomicStamp reuse pattern are proven; live UAT (post a real RFQ against a booted stack and accept a firm quote) is the honest end-to-end confirmation step.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*

## Self-Check: PASSED
- All 3 files verified on disk (RfqPanel.tsx, RfqPanel.test.tsx, DeskView.tsx) + this SUMMARY.md.
- Task commit 3152546 verified in git log (author woshvad, no Claude trailer).
- web suite 119/119 green, tsc clean, build clean; RfqPanel source + seam grep-clean (no :4000, no @daml/react, no operator/Anthropic literal).
