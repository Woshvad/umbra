---
phase: 11-settlement-institutional-grade
plan: 08
subsystem: frontend-enablement
tags: [DFIN-01, WOW-07, VIZ-03, daml-codegen, bindings, guest-desk, nav, solver-client]

# Dependency graph
requires:
  - phase: 11-05
    provides: "generalized Round.Clear + Holding/Instrument/Compliance/Settlement templates + changed SubmitOrder/CommitOrder signatures"
  - phase: 11-06
    provides: "guest 4th-desk (bankD) privacy golden + multi-buyer 2×2 seed shape"
  - phase: 11-03
    provides: "GET /round/:id/topology endpoint + topology.ts TopologyResult + guest bankD token (guest-onboard.mjs → tokens.json)"
provides:
  - "web/daml.js regenerated + committed with Holding/Instrument/Compliance(DeskEligibility)/Settlement modules + changed Round.Clear/SubmitOrder/CommitOrder"
  - "ctxD (guest bankD isolated per-party context) + DeskKey widened to include bankD + ctxFor.bankD"
  - "GUEST DeskMeta exported separately from DESKS (desktop 3-desk switcher untouched)"
  - "Nav view 07 TOPOLOGY + Screen union gains 'topology'"
  - "solver.ts getTopology(id) + TopologyMeta (topology.ts mirror) + additive SettlementMeta/SettlementProvenance/SettlementLeg seam for the Wave-6 SettlementView"
affects: [11-09, 11-11, phase-11-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regenerate + commit web/daml.js in lockstep with every Daml template change (fresh-clone invariant; stale bindings mis-decode silently)"
    - "Guest desk = first-class isolated per-party context, SEPARATE from the desktop switcher's DESKS array (mobile /join-only)"
    - "Shared solver-client seam: define the Wave-6 view types in solver.ts once so no later view edits solver.ts (conflict-free)"

key-files:
  created: []
  modified:
    - "web/daml.js — regenerated @daml.js/umbra-0.1.0 (new Holding/Instrument/Compliance/Settlement + splice-api-token-* interface deps)"
    - "web/src/components/DeskColumn.tsx — SubmitOrder passes the desk's keyless eligCid (Rule 3)"
    - "web/src/components/OrderTicket.tsx — bond Asset→Holding, CommitOrder passes cashInstrument+eligCid, DEMO bankD seed (Rule 3)"
    - "web/vite.config.ts — Holding/Compliance deep subpaths added to optimizeDeps.include (dev pre-bundle, Rule 3)"
    - "web/src/ledgerContexts.ts — ctxD + DeskKey incl. bankD + ctxFor.bankD"
    - "web/src/desks.ts — GUEST DeskMeta (separate from DESKS)"
    - "web/src/components/Nav.tsx — 07 TOPOLOGY tab + 'topology' Screen"
    - "web/src/solver.ts — getTopology + TopologyMeta + SettlementMeta seam"
    - "web/src/views/TimeMachineView.tsx — deskKeyOfParty allow-list cast for the widened DeskKey (Rule 3)"
    - "web/src/tokens.json — bankD {party,token,base} entry (LOCAL only; the file is gitignored as a per-machine secret — NOT committed)"

key-decisions:
  - "The Round.Clear/SubmitOrder/CommitOrder signature changes from 11-05 broke the frontend build against the fresh bindings; the coupled call-site fixes (eligCid, Holding bond, cashInstrument) are committed WITH the regen so no commit leaves a red build"
  - "tokens.json is gitignored (secret file, like bankA/B/C) — the bankD placeholder is a LOCAL dev change; the real scoped token is minted per-machine by guest-onboard.mjs and never committed (D6 / #3678 discipline: no git add -f of an ignored secret file)"
  - "SettlementMeta fields are OPTIONAL on settle/preview/terminal-GET so decode never breaks against a solver that has not yet emitted them (the emitting solver plane change is a later wave; the type seam ships now so 11-11 never edits solver.ts)"
  - "App.tsx uses additive `screen === 'x' &&` rendering (not an exhaustive switch), so widening Screen with 'topology' is safe with no App edit; the TopologyView render branch lands in the Wave-6 view plan"

patterns-established:
  - "Every DeskKey widening must sweep Record<DeskKey> literals + narrowed allow-lists (OrderTicket DEMO, TimeMachine deskKeyOfParty) — surfaced by tsc, fixed at the two ripple sites without changing 3-desk switcher/replay behaviour"

requirements-completed: []

# Metrics
duration: ~16min
tasks: 3
files: 9
completed: 2026-07-10
---

# Phase 11 Plan 08: Frontend-Enablement Gate (bindings regen · guest plumbing · Nav 07 · solver client) Summary

The frontend-enablement gate for Phase 11: **regenerate + COMMIT `web/daml.js`** after all
Phase-11 template changes (Holding / Instrument / Compliance / Settlement + the changed
`Round.Clear` / `SubmitOrder` / `CommitOrder`), add the guest desk (**bankD**) to the
per-party plumbing WITHOUT disturbing the 3-desk desktop switcher, add **Nav view 07
(TOPOLOGY)**, and extend `web/src/solver.ts` with the typed `getTopology` client + the
`SettlementMeta` seam the Wave-6 views consume. `web build` + `web vitest` (63/63) both green.

## What Was Built

### Task 1 — Regenerate + commit web/daml.js (commit `8a0a0b7`)
- `cd daml && daml build` → `daml codegen js .daml/dist/umbra-0.1.0.dar -o ../web/daml.js`
  regenerated `@daml.js/umbra-0.1.0` with the new **`Holding` / `Instrument` /
  `Compliance` (DeskEligibility) / `Settlement`** modules (+ the CN-Token-Standard
  `splice-api-token-holding-v1` / `-metadata-v1` interface-dependency bindings that
  `Holding`'s `HoldingV1` conformance pulls in), plus the changed `Round.Clear` /
  `OrderCommitment` / `SubmitOrder` / `CommitOrder` shapes. Committed in lockstep.
- **Coupled Rule-3 build fixes** (the regenerated signatures broke the build):
  `DeskColumn.SubmitOrder` now passes the desk's keyless `eligCid` (queried from the
  desk's own observed `DeskEligibility`); `OrderTicket` migrated the bond from `Asset`
  to a cash `Holding` and `CommitOrder` now passes `cashInstrument` (read from the bond
  Holding so it always matches the on-ledger `bond.instrument == cashInstrument` check)
  + `eligCid`; `vite.config.ts` registers the `Holding` / `Compliance` deep subpaths in
  `optimizeDeps.include` (else their named exports come back `undefined` in dev → blank root).

### Task 2 — Guest desk (bankD) plumbing (commit `c320e96`)
- `ledgerContexts.ts`: `ctxD = make('bankD')`, `DeskKey` widened to `… | 'bankD'`,
  `ctxFor.bankD` added — the guest gets its OWN isolated per-party context, structurally
  identical to A/B/C (per-party privacy applies to the guest too).
- `desks.ts`: a `GUEST` `DeskMeta` (`code 'GUEST'`, `role 'Guest'`) exported **separately
  from `DESKS`** so the desktop `PartySwitcher`/`Header` keep iterating exactly the three
  primary desks — guest is `/join`-mobile-only per UI-SPEC, zero switcher ripple.
- **DeskKey-widening ripples** (Rule 3, surfaced by tsc): `OrderTicket`'s `DEMO` seed
  gained a `bankD` entry (the multi-buyer golden's Desk D, Buy 4@100); `TimeMachineView`'s
  `deskKeyOfParty` allow-list cast to `DeskKey[]` — both kept behaviourally 3-desk.
- `tokens.json` gained a `bankD { party, token:"", base:"/cn/app-user" }` entry **locally**
  (the file is gitignored as a per-machine secret; the real scoped token is minted by
  `guest-onboard.mjs`, never committed).

### Task 3 — Nav 07 + solver.ts topology client + settlement-meta (commit `1dc0cfc`)
- `Nav.tsx`: `{ num:'07', label:'TOPOLOGY', screen:'topology', enabled:true }` added to
  `TABS`; `Screen` union gains `'topology'`. App consumes the widened union via additive
  `screen === 'x' &&` rendering (no App edit; the TopologyView render branch is Wave-6).
- `solver.ts`: `getTopology(id)` → `GET /round/:id/topology` returning `TopologyMeta`
  (`roundId` + `nodes` / `perParty` / `demoReal` / `caption`, byte-mirroring `topology.ts`
  `TopologyResult`) via the shared `call<T>()`/`SOLVER_BASE_URL` — **no `:4100` literal,
  no auth header, no operator token**. Plus the `SettlementMeta` seam the 11-11
  SettlementView consumes: `SettlementProvenance` (the D13 `CN TOKEN STANDARD (CIP-0056)` /
  `DAML-FINANCE-PATTERN (IN-REPO)` tag — never "DAML FINANCE" the library), `InstrumentRef`,
  `SettlementLeg` (settlement.ts mirror), and an **optional** `SettlementMeta` block
  (`provenance`, `instructionCount`, `netted`, `cashSymbol`, gross/netted legs) added
  additively to the settle / preview / terminal-GET response types.

## Verification

| Check | Result |
|-------|--------|
| `daml build` | green (`Created .daml\dist\umbra-0.1.0.dar`) |
| `daml codegen js` → new modules | Compliance / Holding / Instrument / Settlement present in `web/daml.js/umbra-0.1.0/lib/Umbra/` |
| `cd web && npm run build` (tsc + vite) | green after each task |
| `cd web && npx vitest run` | **63/63 green** (9 files) |
| `grep topology web/src/components/Nav.tsx web/src/solver.ts` | 2 + 7 |
| `grep ctxD ledgerContexts.ts` / `bankD tokens.json` | 2 / 2 |
| T-11-08-CRED (no `:4100`/auth/operator-token in the new client surface) | CLEAN (only comments + the single canonical SOLVER_BASE_URL default) |
| T-11-08-GUEST (guest token not hardcoded in source) | CLEAN (token only in gitignored tokens.json; the `bankD` in source is a demo-order value + context/meta, not a token) |
| T-11-08-STALE (bindings regen + committed) | mitigated |

## Deviations from Plan

All deviations are Rule-3 blocking fixes forced by the 11-05 signature changes surfacing
through the fresh bindings + the `DeskKey` widening — none change plan intent.

### 1. [Rule 3 — Blocking] DeskColumn.SubmitOrder + OrderTicket.CommitOrder call-site fixes
- **Found during:** Task 1 (`npm run build` red against the regenerated bindings).
- **Issue:** `SubmitOrder` now requires `eligCid`; `CommitOrder`'s `bondCid` is now
  `ContractId Holding` (was `Asset`) and requires new `cashInstrument` + `eligCid` args.
- **Fix:** query the desk's own observed `DeskEligibility` for `eligCid`; migrate the bond
  display + commit from `Asset` to `Holding`; pass `cashInstrument` from the bond Holding.
- **Files:** `web/src/components/DeskColumn.tsx`, `web/src/components/OrderTicket.tsx`.
- **Commit:** `8a0a0b7`.

### 2. [Rule 3 — Blocking] vite.config.ts optimizeDeps includes for the new modules
- **Found during:** Task 1. The desk plane now imports `Holding/module` + `Compliance/module`.
- **Fix:** added both deep subpaths to `optimizeDeps.include` (per the file's own note —
  missing entries make named exports `undefined` in dev → blank `#root`).
- **Commit:** `8a0a0b7`.

### 3. [Rule 3 — Blocking] DeskKey-widening ripples (OrderTicket DEMO + TimeMachine)
- **Found during:** Task 2 (tsc flagged a `Record<DeskKey>` literal + a narrowed allow-list).
- **Fix:** added a `bankD` `DEMO` seed; cast `deskKeyOfParty`'s primary-desk list to
  `DeskKey[]`. Both keep the 3-desk switcher/replay behaviour unchanged.
- **Files:** `web/src/components/OrderTicket.tsx`, `web/src/views/TimeMachineView.tsx`.
- **Commit:** `c320e96`.

### 4. [Environmental] tokens.json is gitignored — bankD entry is LOCAL only
- **Found during:** Task 2 commit (`git add web/src/tokens.json` refused — ignored file).
- **Issue:** `tokens.json` holds real per-party dev JWTs and is intentionally gitignored
  (secret file). The plan lists it as an artifact, but committing it would leak secrets
  and is forbidden (D6 / no `git add -f` of an ignored secret file).
- **Resolution:** the `bankD` placeholder entry is added **locally** so types/build resolve;
  the real scoped token is minted into the file per-machine by `guest-onboard.mjs` and never
  committed — exactly as bankA/B/C are provisioned. Not a scope change; the plumbing that
  reads the entry (ctxD / httpBaseUrlFor('bankD')) IS committed.

## Threat Surface

All plan `<threat_model>` mitigations are implemented:
- **T-11-08-STALE** — `web/daml.js` regenerated + committed in lockstep; the web-build gate
  confirms the new template exports resolve.
- **T-11-08-CRED** — `getTopology` reuses `SOLVER_BASE_URL` + `call<T>()`; no `:4100` literal,
  no auth header, no operator token/ANTHROPIC key in the new client surface (grep-clean).
- **T-11-08-GUEST** — the guest scoped token lives ONLY in the gitignored `tokens.json`
  (never inlined in a component); the `bankD` references in source are the context/meta/
  demo-order plumbing, not a token.

No new threat surface beyond the plan's register.

## Honest Limitations / Boundaries (recorded)

- **Live desk-plane submit/commit against a booted stack = live-UAT.** The `DeskColumn`
  SubmitOrder + `OrderTicket` CommitOrder are best-effort (wrapped, `R1`-hardcoded, guarded
  on a missing eligCid/venue) — the live open→commit→reveal→clear against a running Canton
  LocalNet is an end-of-phase human-verify item (Phases 1–3 precedent), not proven here.
- **DeskColumn balance display still queries `Asset`.** The 11-05 seed migrated desk
  holdings Asset→Holding, so the `DeskColumn` bond/cash BALANCE readout (Asset-scoped) may
  read empty on the live ledger. It compiles + renders (no build break) and is out of this
  enablement plan's file scope; the desk balance-display Holding rewire is a follow-on
  concern, tracked here for the verifier.
- **TopologyView (07) renders nothing yet.** The Nav tab is navigable and `getTopology` is
  wired, but the `TopologyView` component + the App `screen === 'topology'` branch land in
  the Wave-6 view plan (11-09). Clicking 07 today shows a blank main area — harmless, views
  01–06 unaffected.
- **SettlementMeta is a type-only seam.** The solver plane does not yet EMIT the settlement
  meta on settle/preview; the optional fields ship now (decode-safe) so 11-11 consumes them
  without editing solver.ts. The emitting solver change is a separate wave step.

## Next Phase Readiness

- Bindings decode every Phase-11 template; `getTopology` + `SettlementMeta` seam + `ctxD` +
  Nav 07 are ready for the Wave-6 views (11-09 TopologyView / JoinView / QrJoin, 11-11
  SettlementView delta) — those views import from solver.ts/ledgerContexts.ts/desks.ts and
  never edit solver.ts.
- No blockers introduced. web build + 63 vitest green.

---
*Phase: 11-settlement-institutional-grade*
*Completed: 2026-07-10*

## Self-Check: PASSED

- Files exist: `web/daml.js/umbra-0.1.0/lib/Umbra/Holding/module.js` (+ Compliance/Instrument/Settlement), `web/src/ledgerContexts.ts`, `web/src/solver.ts`, `web/src/components/Nav.tsx`, `11-08-SUMMARY.md` — all FOUND.
- Commits exist: `8a0a0b7` (Task 1), `c320e96` (Task 2), `1dc0cfc` (Task 3) — all FOUND in git log.
- `cd web && npm run build` green; `cd web && npx vitest run` 63/63 green.
- Commits authored by `woshvad <woshvad@gmail.com>` with NO Claude/AI attribution (co-author sweep clean).
