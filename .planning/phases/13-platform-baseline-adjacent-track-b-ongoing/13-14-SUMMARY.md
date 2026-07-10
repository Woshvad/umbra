---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 14
subsystem: ui
tags: [react, typescript, vite, issuance, coupon, adj-03, theatre-plane, uniform-price]

# Dependency graph
requires:
  - phase: 13-12
    provides: credential-free web client fns openIssuance/clearIssuance/payCoupon/redeemIssuance + issuance wire types (IssuanceOpenBody, IssuanceClearResponse, CouponResponse, RedeemResponse)
provides:
  - S4 IssuancePanel on the Theatre view (03) — optional primary-issuance uniform-price clear (reuses CrossingChart + PriceReveal) + a compact coupon/redemption LifecycleRow
  - Reuse of the shipped CrossingChart (assembling/locked) + PriceReveal (lime uniform-price reveal) for a PRIMARY-ISSUANCE clear (the one allowed lime use on Phase 13 UI)
  - Pure, exported IssuancePanel helpers (issuanceCurve, ISSUANCE_FIXTURE) + copy constants, unit-tested
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Theatre-plane issuance panel: RUN CLEAR → clearIssuance, PAY COUPON → payCoupon, REDEEM → redeemIssuance, all on the credential-free SOLVER_BASE_URL/call<T>() seam (no operator token / per-party ledger React ctx / model key)"
    - "S4 reuses CrossingChart (assembling→locked) + PriceReveal on a self-contained dark inverted stage so the paper-on-ink crossing/reveal visuals render correctly inside the additive block"
    - "Lime delegated entirely to the reused PriceReveal (+ CrossingChart matched region) — the panel introduces NO raw lime hex of its own, keeping the one-allowed-lime discipline provable by source grep"

key-files:
  created:
    - web/src/components/IssuancePanel.tsx
    - web/src/components/IssuancePanel.test.tsx
  modified:
    - web/src/views/TheatreView.tsx

key-decisions:
  - "S4 was BUILT (not deferred): plan scope allowed the complete panel — pre-clear (assembling)/cleared (reveal + minted holdings)/lifecycle (coupon+redeem) states all ship, no partial UI"
  - "S4 has no primary CTA (UI-SPEC line 107): the clear + lifecycle are driven by compact SECONDARY ghost controls (1px-border, transparent fill), never the ink-fill SEAL/SETTLE primary grammar"
  - "issuanceCurve synthesizes a deterministic 3-point crossing (demand↓ / supply↑ meeting at the uniform price) because the issuance wire returns no candidate-price curve — so the reused CrossingChart draws a real staircase"
  - "Client sends only the issuance bids; the returned clearingPrice/winners are rendered as-is (the deterministic §8 clear is server-side truth, never fabricated client-side)"

patterns-established:
  - "Reused CrossingChart + PriceReveal on a self-contained dark stage inside a paper additive panel (the inverted-stage-in-panel idiom)"
  - "Source-level lime-discipline proof: the panel's grep-clean test asserts NO #D6FB3C literal, so any lime it shows must come from the reused reveal component"

requirements-completed: [ADJ-03]

# Metrics
duration: ~14min
completed: 2026-07-10
---

# Phase 13 Plan 14: ADJ-03 Web Surface Summary

**S4 IssuancePanel on the Theatre view (03) — the OPTIONAL surface, BUILT completely: a primary-issuance uniform-price clear that REUSES the shipped CrossingChart (assembling→locked) + PriceReveal (the lime uniform-price reveal — the one place lime is allowed on Phase 13 UI) plus a minted-holdings summary, followed by a compact coupon/redemption LifecycleRow (COUPON PAID / REDEEMED, LIFECYCLE tag). Theatre-plane only, credential-free, offline-graceful; the existing countdown/reveal/theatre beat is byte-unchanged.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-07-10T22:11:00Z
- **Completed:** 2026-07-10T22:25:00Z
- **Tasks:** 1
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Built `web/src/components/IssuancePanel.tsx` — the S4 states from the UI-SPEC: pre-clear (assembling — `CrossingChart mode="assembling"` + a `RUN ISSUANCE CLEAR` secondary control with a `CLEARING…` pulse); cleared (`CrossingChart mode="locked"` + `PriceReveal` for the uniform issuance price + a minted-holdings summary listing each winning desk's `filledQty` at the one uniform price); lifecycle (a compact `LifecycleRow` with `COUPON PAID` pro-rata + `REDEEMED` states via `payCoupon`/`redeemIssuance`, ink rows + mono values + the `LIFECYCLE` tag). Persistent honest tag `PRIMARY ISSUANCE · UNIFORM-PRICE`; a `SolverError`/`OFFLINE` reject flips the block to the shipped `OFFLINE_CAPTION`.
- Mounted `IssuancePanel` on `TheatreView.tsx` as a single additive block below the QrJoin host — no nav tab, the shipped countdown/reveal/theatre beat above is untouched.
- Added `web/src/components/IssuancePanel.test.tsx` (17 tests): the canonical issuance fixture shape (client sends bids, no client-side clearingPrice), the synthesized `issuanceCurve` crossing (demand↓ / supply↑ meeting at the uniform price, non-negative, clamped), the verbatim S4 copy contract, a fetch-mock credential scan of the RUN CLEAR / PAY COUPON / REDEEM seam (T-13-40), and a Vite `?raw` source grep-scan (no `@daml/react` / operator token / Anthropic key / `:4000`, reuses CrossingChart + PriceReveal, no raw lime hex).

## Task Commits

Committed atomically (author/committer = woshvad, no Claude attribution):

1. **Task 1: IssuancePanel.tsx (S4) mounted on TheatreView + test** - `114c718` (feat)

## Files Created/Modified
- `web/src/components/IssuancePanel.tsx` - S4 issuance/coupon panel (theatre-plane): assembling→cleared→lifecycle reusing CrossingChart + PriceReveal; exported pure helpers (`issuanceCurve`, `ISSUANCE_FIXTURE`) + copy constants
- `web/src/components/IssuancePanel.test.tsx` - 17 DOM-free units (fixture, crossing curve, copy contract, credential scan, grep-clean incl. no-raw-lime)
- `web/src/views/TheatreView.tsx` - mount IssuancePanel below QrJoin (additive; existing stage/reveal beat byte-unchanged)

## Decisions Made
- **BUILT, not deferred:** S4 is explicitly droppable per the UI-SPEC, but plan scope allowed the complete panel — all three states (assembling / cleared / lifecycle) ship with no partial UI.
- **No primary CTA (UI-SPEC line 107):** the clear + coupon + redeem actions are compact SECONDARY ghost controls (1px-border, transparent fill), deliberately distinct from the ink-fill SEAL/SETTLE primary grammar.
- **Self-contained dark stage:** the reused CrossingChart draws its axes/curves in `#F4F1EA` (paper) for the inverted Theatre stage, so the panel renders the crossing/reveal on its OWN `#0A0A0A` inner stage (mirroring the main Theatre stage) — otherwise the paper strokes would be invisible on the paper panel.
- **Synthesized crossing curve:** the issuance wire returns no candidate-price curve, so `issuanceCurve(pStar, matched)` builds a deterministic 3-point staircase (demand↓ / supply↑ meeting at the uniform price) to feed the reused CrossingChart; the crossing marker is derived by the shipped `crossingPoint` from the returned price/qty.
- **Lime delegated to the reveal:** the panel carries no `#D6FB3C` literal — all lime is the reused PriceReveal hero slab (+ the CrossingChart matched region it already draws), keeping the one-allowed-lime discipline provable by source grep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded two comments that tripped the panel's own grep-clean self-test**
- **Found during:** Task 1 verification (first vitest run)
- **Issue:** Doc comments in `IssuancePanel.tsx` mentioned the literals `@daml/react` (describing the theatre-plane discipline) and `#D6FB3C` (describing the lime discipline), which the source grep-clean test correctly flagged.
- **Fix:** Reworded to "no per-party ledger React context" and "the ONE place lime is allowed" (no hex), so the source/bundle carries neither literal.
- **Files modified:** web/src/components/IssuancePanel.tsx
- **Verification:** 17/17 IssuancePanel tests green; the grep-clean cases pass for all forbidden literals and the no-raw-lime assertion.
- **Committed in:** 114c718 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (a self-test-driven comment reword). No scope creep — the single planned artifact (`IssuancePanel.tsx` + test) and the TheatreView mount ship as specified.
**Impact on plan:** Mechanical test-gate fix discovered during verification; the panel was built in full (S4 delivered, not deferred).

## Known Stubs
None that block the S4 goal. The panel drives real credential-free issuance endpoints (`clearIssuance`/`payCoupon`/`redeemIssuance`); `ISSUANCE_FIXTURE` is a canonical primary-issuance demo tranche (bids only — the solver derives the uniform price), and `issuanceCurve` synthesizes the crossing staircase for the reused chart because the issuance wire intentionally returns no candidate-price curve. Live numbers require the solver's issuance endpoints on `:4100`; a down solver degrades to the shipped `OFFLINE_CAPTION`.

## Issues Encountered
None beyond the one auto-fixed gate item above. Full web suite (136 tests, 15 files) + `tsc --noEmit` + `npm run build` all green; the production bundle is grep-clean of `sk-ant` / `ANTHROPIC_API_KEY` / `@daml/react`.

## Threat Model Compliance
- **T-13-40 (Information Disclosure — IssuancePanel bundle):** the panel rides `clearIssuance`/`payCoupon`/`redeemIssuance` over the single `SOLVER_BASE_URL`/`call<T>()` — no operator token, no per-party ledger React context, no model key. Proven two ways: a fetch-mock scan asserts RUN CLEAR / PAY COUPON / REDEEM hit `SOLVER_BASE_URL + path` with no authorization/bearer/token/key header and no `:4000`; a source grep-scan asserts the component has no `@daml/react` / `ANTHROPIC` / `sk-ant` / `Authorization` / `Bearer` / `:4000` literal.
- **T-13-41 (Tampering — lime misuse / design fidelity):** lime is restricted to the reused `PriceReveal` uniform-price reveal (a real primary-issuance clear); the panel introduces no raw `#D6FB3C` of its own (asserted in-test), every other element is ink/paper on the dark stage per the UI-SPEC color discipline.

## User Setup Required
None — the panel is additive and credential-free. Live behavior requires the solver running on `:4100` with its issuance endpoints (`POST /issuance`, `/issuance/:id/coupon`, `/issuance/:id/redeem`); a down solver degrades to the shipped `OFFLINE_CAPTION`.

## Next Phase Readiness
- S4 issuance is live on the Theatre view; the existing countdown/reveal/theatre + QrJoin behavior is unchanged (additive block mount).
- The credential-free issuance seam and the CrossingChart/PriceReveal reuse pattern are proven; live UAT (run a real issuance clear against a booted stack, then pay a coupon + redeem) is the honest end-to-end confirmation step.
- All four Phase-13 UI surfaces (S1 status page, S2 leaderboard, S3 RFQ, S4 issuance) are now delivered.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*

## Self-Check: PASSED
- All 3 files verified on disk (IssuancePanel.tsx, IssuancePanel.test.tsx, TheatreView.tsx) + this SUMMARY.md.
- Task commit 114c718 verified in git log (author woshvad, no Claude trailer).
- web suite 136/136 green, tsc clean, build clean; IssuancePanel source + seam grep-clean (no :4000, no @daml/react, no operator/Anthropic literal, no raw lime hex).
