---
phase: 6
slug: auction-theatre-settlement-animation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract. Source: `06-RESEARCH.md` → `## Validation Architecture`. Frontend phase: the always-on gate is a green TypeScript build (`tsc`/`vite build`); pure data-mapping helpers get fast vitest unit tests asserting the §4 values (incl. `deskBalancesFromAllocations` against a canonical §4 allocations fixture); visual/animation fidelity to the binding comp is verified by `gsd-ui-review` + the Phase-7 acceptance pass.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `tsc --noEmit` / `vite build` (always-on) + vitest@2.1.9 (Wave-0 add for `web/src/lib` pure helpers) |
| **Config file** | `web/tsconfig.json` (exists); `web/vitest.config.ts` (Wave-0 add, mirrors solver/) |
| **Quick run command** | `cd web && npx vitest run src/lib` (pure helpers) |
| **Full suite command** | `cd web && npm run build` (tsc typecheck + bundle — the authoritative gate) |
| **Estimated runtime** | build ~10–20s; helper tests ~2s |

---

## Sampling Rate

- **After every task commit:** `cd web && npx tsc --noEmit` (fast typecheck)
- **After every plan wave:** `cd web && npm run build` (must stay green) + `npx vitest run src/lib` if helpers touched
- **Before `/gsd-verify-phase`:** `npm run build` green; pure-helper tests green
- **Max feedback latency:** ~20 seconds (build)

---

## Per-Task Verification Map

> UI rendering/animation fidelity is validated by `gsd-ui-review` (visual comp diff) + Phase-7 live acceptance; the AUTOMATED surface here is the build + the pure §4-value data-mapping helpers.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | UI-04/05/06 | — | curve→SVG-path mapping → p*=100, matched=10; balance `lerp`; `deskBalancesFromAllocations(§4 allocations, before)` → A:10/4000·B:12/1800·C:13/1200; solver payload parse + offline guard | unit | `cd web && npx vitest run src/lib` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 0 | UI-02/04/05/06 | T-06-token | tailwind umbraLeg + umbra-draw/pulse/caret aliases present; Nav 5-tab + App routing typecheck; NO operator token / operator @daml context in web/src | build + grep | `cd web && npm run build` | ✅ | ⬜ pending |
| 06-02-01/02 | 02 | 2 | UI-02 | — | Desk view (OrderTicket/HoldingsPanel/FillCard) typechecks + bundles; §4 load-demo values exact | build | `cd web && npm run build` | ✅ | ⬜ pending |
| 06-03-01/02 | 03 | 2 | UI-04/05 | — | Theatre (CountdownRing/PriceReveal/CrossingChart) bundles; reveal 100.00 + matched=10 rendered from solve-preview | build | `cd web && npm run build` | ✅ | ⬜ pending |
| 06-04-01/02 | 04 | 3 | UI-06 | — | Agent + Settlement bundle; §4 finals + DvP legs A↔B 8@100 / A↔C 2@100; simultaneous draw-on | build | `cd web && npm run build` | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `web/vitest.config.ts` + `vitest@2.1.9` devDep in `web/` (mirror solver/) — `web/` currently has NO test runner
- [ ] Extract pure data-mapping helpers into `web/src/lib/` (curve→SVG path, balance `lerp`, `deskBalancesFromAllocations`, solver payload parse/offline guard) so they are unit-testable without the DOM
- [ ] `web/src/lib/*.test.ts` — the §4-value assertions above (incl. the allocations→balances fixture)
- [ ] `web/tailwind.config.ts` — add the `umbraLeg` keyframe + the `umbra-draw`/`umbra-pulse`/`umbra-caret`/`umbra-leg` animation aliases + large fontSize literals (existing keyframes/tokens unchanged)

*Visual/animation fidelity is intentionally NOT unit-tested — it is covered by `gsd-ui-review` (comp diff) and Phase-7 live acceptance.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Theatre reveal slam + countdown ring + SIMULTANEOUS settlement leg draw-on match the comp | UI-04, UI-06 | Animation/visual fidelity can't be asserted in a unit test | `daml start` + `cd solver && npm run dev` + `cd web && npm run dev`; drive Close&Solve → reveal 100.00 → Settle atomically; compare against `Umbra design/screenshots/` |
| Desk view order ticket → Venue.SubmitOrder, live holdings, post-settle TradeConfirmation | UI-02 | Requires live ledger + per-party tokens | Switch parties; submit the demo order; confirm one-per-round disable + holdings update |
| Full live money-shot flow (3 desks blind → reveal 100.00 → atomic settle → per-desk fills) | UI-04/06 | Live E2E | Deferred to Phase-7 acceptance (DEMO-03) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` (build or helper test) or a Wave 0 dependency, or are explicitly visual→ui-review
- [x] Sampling continuity: no 3 consecutive code tasks without a build/typecheck
- [x] Wave 0 covers the vitest add + extracted pure helpers + tailwind animation aliases
- [x] No watch-mode flags (use `vitest run` / `npm run build`)
- [x] `nyquist_compliant: true` set (per-task map filled from the plan tasks)

**Approval:** approved 2026-06-26
