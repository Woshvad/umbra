---
phase: 01-skeleton-version-gate
plan: 03
subsystem: infra
tags: [daml, daml-script, canton, party-allocation, fixture, testing]

# Dependency graph
requires:
  - phase: 01-01
    provides: daml.yaml pinned to SDK 2.10.4 (init-script Umbra.Setup:initialize, source: ., parties.json gitignored)
  - phase: 01-02
    provides: six frozen §7 templates (Umbra.Asset.Asset, Umbra.Roles.Venue + SubmitOrder, Umbra.Auction.Order/Round/RoundStats/TradeConfirmation, Side)
provides:
  - "Setup.daml — allocateAll/mintAsset/initialize/exportParties/runCanonicalRound + Parties record (LEDG-02)"
  - "§4 canonical world seeded: 4 parties, one Venue, 5 Asset holdings, 3 sealed orders"
  - "Tests.daml — test_setup_seeds (LEDG-02) + test_asset_split_merge (LEDG-03); daml test exits 0"
  - "parties.json export wired (Option B script-options + documented Option A); 4-key file produced, gitignored"
affects: [phase-02-clearing, phase-03-vertical-slice, solver, web]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Daml Script seed: allocatePartyWithHint readable prefixes + Parties return-record as parties.json export shape"
    - "ide-ledger + --output-file for non-blocking parties.json capture (no separate sandbox boot)"
    - "Phase-1 seed defers clearing: runCanonicalRound submits orders only, never calls Round.Clear"

key-files:
  created:
    - daml/Umbra/Setup.daml
    - daml/Umbra/Tests.daml
  modified:
    - daml/daml.yaml
    - README.md

key-decisions:
  - "parties.json export: enabled Option B (script-options --output-file in daml.yaml) as the default daml-start path; documented Option A (explicit daml script run) + ide-ledger quick capture as the guaranteed fallback in README."
  - "Generated the automated four-key parties.json gate via `daml script --ide-ledger --output-file` (no long-running sandbox needed); against a live Canton sandbox the same shape carries hint::<fingerprint> IDs."
  - "runCanonicalRound queries the operator's single Venue contract after initialize rather than threading the cid, keeping initialize's signature as the daml.yaml init-script (Script Parties)."

patterns-established:
  - "Seed integrity guard: test_setup_seeds asserts the exact §4 holdings (5 Assets, owner/symbol/quantity) so a wrong mint literal fails the test (threat T-01-07)."
  - "Conservation test: Split→Merge round-trips total quantity; submitMustFail covers the out-of-range Split guard (LEDG-03)."

requirements-completed: [LEDG-02, LEDG-01]

# Metrics
duration: 6min
completed: 2026-06-25
---

# Phase 01 Plan 03: Setup Seed + Wave-0 Tests + parties.json Export Summary

**Setup.daml seeds the canonical §4 world (4 parties, one Venue, 5 Asset holdings, 3 sealed orders) and exports party IDs to parties.json; Tests.daml proves the seed + operator Split/Merge conservation, with `daml build` and `daml test` both green.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-25T14:45:12Z
- **Completed:** 2026-06-25T14:50:00Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `Setup.daml`: `allocateAll` (4 `allocatePartyWithHint`), `mintAsset`, `initialize` (Venue + exact §4 mint of 5 Assets), `exportParties`, `runCanonicalRound` (3 §4 orders via `Venue.SubmitOrder`, no Clear) — `daml build` exits 0, init-script resolves (full LEDG-01 compile).
- `Tests.daml`: `test_setup_seeds` (asserts 4 distinct parties + exactly 5 §4 holdings) and `test_asset_split_merge` (Split 10.0→4.0+6.0, Merge→10.0 conservation, out-of-range Split rejected) — `daml test` exits 0, both scripts report `ok`.
- parties.json export wired: Option B `script-options: [--output-file, parties.json]` in `daml.yaml`, Option A + ide-ledger capture documented in README; produced a 4-key `parties.json` (`operator`/`bankA`/`bankB`/`bankC`) that passes the automated content gate and stays gitignored.

## Task Commits

Each task was committed atomically (author `woshvad <woshvad@gmail.com>`, no attribution trailers):

1. **Task 1: Setup.daml — parties + §4 mint + Venue + runCanonicalRound + exportParties** — `74584b6` (feat)
2. **Task 2: Tests.daml — test_setup_seeds + test_asset_split_merge** — `4377e3b` (test)
3. **Task 3: parties.json export wiring + README docs** — `11728ef` (chore)

**Plan metadata:** committed after this summary (docs: complete plan).

## Files Created/Modified
- `daml/Umbra/Setup.daml` (created) — party allocation, §4 mint, Venue, canonical round submit, parties export shape.
- `daml/Umbra/Tests.daml` (created) — Wave-0 Daml Script tests (LEDG-02 seed + LEDG-03 Split/Merge).
- `daml/daml.yaml` (modified) — uncommented/finalized `script-options` for the parties.json export.
- `README.md` (modified) — documented Option A/B export commands + the `daml test` script list.

## Decisions Made
- Enabled both export paths: Option B in `daml.yaml` for the automatic `daml start` boot write, Option A (+ `--ide-ledger`) in README as the guaranteed explicit fallback (RESEARCH Open Question 1 — Option-B write directory not runtime-verified on this machine).
- Used `--ide-ledger --output-file` to generate the gate-checkable `parties.json` without booting a long-running sandbox; the live-sandbox export yields the same 4-key shape with `hint::<fingerprint>` IDs.
- `runCanonicalRound` re-queries the operator's Venue after `initialize` (which returns `Parties`, not the cid) so `initialize` keeps the `Script Parties` signature the init-script requires.

## Deviations from Plan

None - plan executed exactly as written. All grep/exit-code gates passed on the templates as authored from RESEARCH Pattern 4; no auto-fixes were required.

## Issues Encountered
- The Task-1 verify grep `exerciseCmd.*Clear| Clear ` matched twice — both matches are in the deferral *comments* in `runCanonicalRound` ("…then Round.Clear and assert…" / "do NOT call it here"), not an actual `Clear` exercise. Confirmed via targeted grep that no `exerciseCmd ... Clear` exists. The acceptance criterion (runCanonicalRound does not call Clear) holds.

## Known Stubs

- `Round.Clear` remains the loud Phase-1 placeholder (`assertMsg ... False`) frozen in plan 01-02; `runCanonicalRound` deliberately stops at order submission. The clearing assertion (clearingPrice == 100.0, fills A=10/B=8/C=2) is the documented Phase-2 deliverable — intentional, not an oversight.

## User Setup Required

None - no external service configuration required. (`ANTHROPIC_API_KEY` is a Phase-5 solver concern; no packages installed this phase.)

## Next Phase Readiness
- Phase 2 (clearing) can build directly on `initialize`/`runCanonicalRound` as the §4 seed and replace the `Round.Clear` placeholder with the real verify+DvP body, then add `test_clears_at_100` / `test_settled_balances` / `test_atomicity`.
- **Human-check (LEDG-01 runtime half, deferred to orchestrator):** `cd daml && daml start` → wait for JSON API ready → `curl http://localhost:7575/readyz` returns ready/200 → stop. This long-running :7575 boot is verified separately; the automated gates here are `daml build` (exit 0), `daml test` (exit 0, both scripts green), and the parties.json four-key content check.

## Self-Check: PASSED

All created/modified files present on disk (Setup.daml, Tests.daml, daml.yaml, README.md, 01-03-SUMMARY.md); all task commits present in git history (74584b6, 4377e3b, 11728ef).

---
*Phase: 01-skeleton-version-gate*
*Completed: 2026-06-25*
