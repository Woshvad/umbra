---
phase: 06-auction-theatre-settlement-animation
plan: 02
subsystem: ui
tags: [react, typescript, tailwind, daml-react, json-api, per-party-privacy]

# Dependency graph
requires:
  - phase: 06-01
    provides: DeskView stub, Nav 'desk' route, App activeDesk threading, tailwind animate-umbra-wipe/-rise classes
  - phase: 03
    provides: createLedgerContext per-party contexts (ctxA/B/C), tokens, httpBaseUrl/wsBaseUrl, DeskColumn submit+holdings pattern, OrderRow
provides:
  - 02 Desk view (DeskView) mounting the active desk's own ctx.DamlLedger
  - OrderTicket — Buy/Sell toggle + qty/limit inputs + SEAL ORDER → Venue.SubmitOrder (Int/Numeric as strings) + one-per-round lock + RE-OPEN + §4 load-demo + seal-wipe overlay
  - HoldingsPanel — live BONDX/USDCx summed from the desk's own Assets + after-settle sub-line
  - FillCard — post-settlement YOUR FILL trio (filledQty / 100.00 / cashMoved) from the desk's own TradeConfirmation + empty state
affects: [06-03, 06-04, settlement, theatre]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-party plane view: mount ctxFor[activeDesk].DamlLedger once, read Order/Asset/TradeConfirmation via that ctx's hooks (structural privacy, no operator token)"
    - "Daml number boundary: Venue.SubmitOrder args serialized as STRINGS (String(qty), Number(limit).toFixed(1)); reads wrapped in Number(...)"

key-files:
  created:
    - web/src/components/OrderTicket.tsx
    - web/src/components/HoldingsPanel.tsx
    - web/src/components/FillCard.tsx
  modified:
    - web/src/views/DeskView.tsx

key-decisions:
  - "After-settle holdings sub-line sources the desk's already-settled live Asset sums (the TradeConfirmation coexists with settled balances) rather than synthesizing now+delta — avoids double-counting"
  - "FillCard reads the desk's own Order for the partial '{n} of {total} BONDX' note (TradeConfirmation carries no original size)"

patterns-established:
  - "View frame copied from PrivacyView <main>: section marker + 1px ink rule + 54px display headline, then per-party provider wrapping the body"
  - "One-per-round lock = (!!order || submitted) && !reopened; RE-OPEN is an in-session demo affordance only"

requirements-completed: [UI-02]

# Metrics
duration: ~18min
completed: 2026-06-26
---

# Phase 6 Plan 02: Desk View Summary

**The 02 Desk view — a per-party order ticket (Venue.SubmitOrder via the desk's own ledger, Int/Numeric as strings, one-per-round lock + §4 load-demo + seal-wipe), live BONDX/USDCx holdings, and a post-settlement YOUR FILL card sourced from the desk's own TradeConfirmation — all on the structural-privacy plane (:7575).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-26
- **Completed:** 2026-06-26
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 overwritten)

## Accomplishments
- OrderTicket: BUY/SELL toggle (#2B3AF2 / #FF3D9A active fills), 44px borderless mono qty + limit inputs, SEAL ORDER → `Venue.SubmitOrder` exercised on the active desk's own `useLedger` with `quantity: String(qty)` + `limit: Number(limit).toFixed(1)` (Pitfall 1), one-per-round lock with a SEALED state + RE-OPEN, "load demo order" prefilling the §4 per-desk values (BLUEROCK Buy 10@101 · MERIDIAN Sell 8@99 · HALWARD Sell 5@100), and an `animate-umbra-wipe` seal overlay gated on `prefers-reduced-motion`.
- DeskView: overwrites the Plan-01 stub; PrivacyView `<main>` frame + "ORDERS IN THE DARK" 54px headline; mounts `ctxFor[activeDesk].DamlLedger` with the desk's own token/party and reads its own Order; 2-col grid (ticket | holdings + fill).
- HoldingsPanel: sums the desk's own BONDX/USDCx from its own Assets (Number-wrapped), with the "→ {after} after settle" sub-line (BONDX in the fill-sign color).
- FillCard: post-settlement YOUR FILL — Filled (sign-colored buy/sell, partial "{n} of {total} BONDX" note), Clearing Price "100.00", signed Cash Moved — from the desk's own TradeConfirmation, with an `animate-umbra-rise` reveal and a graceful empty-state paragraph (verbatim comp copy).

## Task Commits

1. **Task 1: OrderTicket + DeskView frame + per-party mount + load-demo + one-per-round lock** - `412e0b5` (feat)
2. **Task 2: HoldingsPanel + FillCard (live holdings + post-settlement YOUR FILL)** - `67b7197` (feat)

_Note: TDD-flagged tasks here are presentational UI gated by `npm run build` (the plan's `<verify>`); there is no React component-test harness in this repo (lib-helper vitest belongs to later 06 plans), so each task's gate was a green production build rather than a RED/GREEN test pair._

## Files Created/Modified
- `web/src/components/OrderTicket.tsx` - Side toggle + qty/limit inputs + SEAL ORDER → Venue.SubmitOrder (strings) + one-per-round lock + RE-OPEN + §4 load-demo + seal-wipe
- `web/src/components/HoldingsPanel.tsx` - live BONDX/USDCx from the desk's own Assets + after-settle sub-line
- `web/src/components/FillCard.tsx` - post-settlement YOUR FILL trio from the desk's own TradeConfirmation + empty state
- `web/src/views/DeskView.tsx` - 02 view frame + active desk's ctx.DamlLedger mount + shared own-fill read wiring the right cell

## Decisions Made
- The "→ after settle" holdings sub-line uses the desk's already-settled live Asset sums (a TradeConfirmation only exists post-settlement, when Assets already reflect the new balances) instead of `now + filledQty`, which would double-count.
- FillCard reads the desk's own Order to compute the partial-fill total, since TradeConfirmation has no original-order-size field.

## Deviations from Plan
None - plan executed exactly as written. The HoldingsPanel/FillCard stubs created in Task 1 (to keep that task's build green ahead of Task 2) were filled in Task 2 as specified; this is the planned task ordering, not a deviation.

## Issues Encountered
None.

## Self-Check: PASSED

- FOUND: web/src/components/OrderTicket.tsx
- FOUND: web/src/components/HoldingsPanel.tsx
- FOUND: web/src/components/FillCard.tsx
- FOUND: web/src/views/DeskView.tsx
- FOUND commit: 412e0b5
- FOUND commit: 67b7197
- `cd web && npm run build` green
- grep CLEAN: no operator token / operator context in any of the four files
- `Venue.SubmitOrder` + `String(qtyInt)`/`toFixed(1)` present; `Side` imported from Umbra/Clearing/module
- `useStreamQueries(Asset)` + `useStreamQueries(TradeConfirmation)` present; `toFixed(2)` → "100.00"; sign colors #2B3AF2 / #FF3D9A; FillCard empty state present

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Desk-side half of the money shot is live on the per-party plane. Plans 03 (Theatre) and 04 (Settlement/Agent) own the operator-plane views and are file-disjoint from this work.
- Live verification requires `daml start` (:7575) + seeded desks; the build-time gate is green.

---
*Phase: 06-auction-theatre-settlement-animation*
*Completed: 2026-06-26*
