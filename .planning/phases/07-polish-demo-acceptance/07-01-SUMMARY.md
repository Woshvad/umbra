---
phase: 07
plan: 01
subsystem: web-frontend
tags: [ui, comp-fidelity, polish, UI-07]
requires:
  - "06-UI-SPEC.md (base design contract, approved 6/6)"
  - "Umbra design/Umbra.dc.html (binding comp, ground truth)"
provides:
  - "Comp-accurate PriceReveal / TheatreView / CrossingChart (UI-07 px/opacity fixes)"
  - "AgentRationale rank-1 competing-agents row bound to live preview (no silent §4 disagreement)"
  - "Five-view comp sweep complete; residual h1/role-margin drift fixed to comp"
affects:
  - "07-03 acceptance screenshots (the money-shot still frames now match the comp)"
tech-stack:
  added: []
  patterns:
    - "Inline style={{}} + tailwind-token convention preserved per-file"
    - "Optional/nullable preview prop with §4 deterministic fallback (100.00 / 10)"
key-files:
  created: []
  modified:
    - web/src/components/PriceReveal.tsx
    - web/src/components/CrossingChart.tsx
    - web/src/views/TheatreView.tsx
    - web/src/components/AgentRationale.tsx
    - web/src/views/AgentView.tsx
    - web/src/components/DeskColumn.tsx
    - web/src/views/SettlementView.tsx
decisions:
  - "Where a P6 spec literal deviates from the comp, the comp wins (governing rule) — applied to the reveal CTA padding/margin and sub-stat unit-word size."
  - "AgentRationale restyling kept minimal: only the numeral binding was added (per Task-3 'no copy/spacing change' constraint); the competing-agents row geometry/label opacity deltas vs comp were left to avoid restyling an approved P6 (22/24) block / gold-plating."
metrics:
  duration: "~6 min"
  completed: 2026-06-27
---

# Phase 7 Plan 01: UI-07 Comp Fidelity Summary

Closed the precise px/opacity/binding drifts the Phase-6 UI audit (22/24) found between the
implementation and the binding comp, and bound the AgentRationale rank-1 row to the live solve
preview — taking the frontend to UI-07 comp fidelity with a green build and green §4 lib tests.

## Per-file changes

### Task 1 — `PriceReveal.tsx` + `CrossingChart.tsx` (commit `e40db17`)
- **PriceReveal.tsx**
  - `CLEARS AT` label `marginBottom` `14px` → **`4px`** (comp 326).
  - Both sub-stat unit words ("units" / "for all") `fontSize 18px; opacity .5` → **`fontSize 13px; opacity .6`** (comp 334/338).
  - `VIEW SETTLEMENT` CTA wrapper `marginTop 34px` → **`30px`**; button `padding 16px 30px` → **`15px 28px`** (comp 341).
- **CrossingChart.tsx**
  - `p*` annotation `<text>` → added **`fillOpacity={0.7}`** (comp 314).
  - Confirmed `q={matchedVolume}` `<text>` already carries `fillOpacity={0.7}` (comp 313) — unchanged. Axis-cap texts (QTY → / ↑ PRICE) left at `fillOpacity 0.5`.

### Task 2 — `TheatreView.tsx` RunningStage (commit `7325653`)
- "ONE PRICE. / NO LEAKS." `<h2>` `margin 14px 0 0` → **`14px 0 18px`** (comp 275).
- Sealed-count block: replaced the stacked `marginTop:34px` wrapper with the comp's **inline baseline flex row** `display:flex; align-items:baseline; gap:14px; margin-bottom:30px` (comp 276); 44px count + caption now sit on one baseline.
- Caption: `font-body text-10; .16em; opacity .6; marginTop:6px` → **Inter `fontSize:12px; letterSpacing:.2em; opacity:.7`**, marginTop removed (comp 278).
- CTA row wrapper `marginTop:34px` → **`display:flex; gap:14px`** (comp 280). The 30px gap above now comes from the sealed block's `margin-bottom:30px`.
- `sealedOrderCount` data read, clock, CTA handlers/copy all unchanged.

### Task 3 — AgentRationale binding + five-view sweep (commit `cd1b486`)
- **AgentRationale.tsx** — added optional `preview?: SolvePreviewResponse | null` prop; rank-1 competing-agents row numerals (previously hardcoded `100.00` / `10 u`) now read **`(preview?.clearingPrice ?? 100).toFixed(2)`** and **`{preview?.matchedVolume ?? 10} u`**. §4 fallback preserves current behavior and never crashes when `preview` is null. Typewriter block, flame caret, reduced-motion gating, and all copy unchanged.
- **AgentView.tsx** — threaded the already-lifted preview into `<AgentRationale rationale={preview.rationale} preview={preview} />` (branch only runs when `preview` is truthy).

## Five-view comp sweep result

| View | Component(s) swept | Drift found | Fix |
|------|--------------------|-------------|-----|
| 01 Privacy | PrivacyView, VenueSpine, DeskColumn, OrderRow, RedactionBar | DeskColumn role caption missing `margin-top:3px` (comp 97) | Added `marginTop:'3px'` to the role caption in both ActiveBody + RedactedBody |
| 02 Desk | DeskView (h1 `26px 0 36px` matches comp 152) | none | — |
| 03 Theatre | TheatreView (headline/sealed-count — fixed in Task 2), CountdownRing | none beyond Task 2 | — |
| 04 Agent | AgentView, AgentRationale, AgentProposal | AgentView h1 `26px 0 36px` vs comp 365 `26px 0 34px` | h1 bottom margin → `34px` |
| 05 Settlement | SettlementView, DvpLegs, BalanceTable, AtomicStamp | SettlementView h1 `26px 0 36px` vs comp 430 `26px 0 34px` | h1 bottom margin → `34px` |
| CountdownRing | "Seconds to close" label | none — Inter `10px; .22em; opacity .6; marginTop 6px` matches comp 270 exactly | — |

Notes on deliberate non-changes (no gold-plating):
- The AgentRationale competing-agents row geometry (grid `gap:12px` vs comp `14px`, dot `8px` vs `9px`, price/vol opacity+weight) and the `Rationale` / `Competing Agents` label opacity (`.5/.14em` vs comp `.55/.16em`) differ from the comp, but Task 3 scopes this file to the numeral binding with an explicit "no copy/spacing change" constraint, and these belong to an approved P6 (22/24) block. Left unchanged to honor the plan constraint and avoid restyling an approved component.
- DeskView h1 keeps `26px 0 36px` because comp 152 specifies `36px` for the Desk h1 (only Agent/Settlement h1s are `34px` in the comp).

## §4 invariants (held exact)
`100.00` / matched `10` / fills A=10·B=8·C=2 / balances A:10/4000 · B:12/1800 · C:13/1200. None of these px/binding fixes touch the pure helpers.

## Deviations from Plan
None requiring user decision. The DeskColumn `margin-top:3px` and the two h1 bottom-margin fixes are the "real drift found in the sweep" the plan directs fixing to comp values (Rule: comp wins). No logic, data-plane, animation, or copy changes.

## Verification
- `cd web && npm run build` — green (tsc + vite) after every task.
- `cd web && npx vitest run src/lib` — 11/11 §4-value tests green after every task.
- All three commits authored AND committed by `woshvad <woshvad@gmail.com>`; zero Claude/Anthropic attribution (verified via `git log` trailer grep — none found).

## Commits
- `e40db17` — fix(07-01): PriceReveal + CrossingChart comp-px fidelity
- `7325653` — fix(07-01): TheatreView headline margin + inline-baseline sealed-count row
- `cd1b486` — fix(07-01): bind AgentRationale rank-1 row to live preview + five-view comp sweep

## Self-Check: PASSED
- All 7 modified files present on disk.
- All 3 commits (`e40db17`, `7325653`, `cd1b486`) present in git history and ancestors of HEAD.
- All commits attribution-clean (`woshvad <woshvad@gmail.com>`, no Claude/Anthropic trailer).
