---
phase: 7
slug: polish-demo-acceptance
status: approved
shadcn_initialized: false
design_system: "Umbra design/ comp (binding) + web/tailwind.config.ts tokens (frozen from P3/P6)"
baseline: "06-UI-SPEC.md (approved binding contract) + Umbra design/Umbra.dc.html (ground truth)"
created: 2026-06-27
---

# Phase 7 — UI-SPEC (UI-07 fidelity delta)

> **This is a DELTA contract.** The full design system is already locked in `06-UI-SPEC.md`
> (approved 6/6) and the binding comp `Umbra design/Umbra.dc.html`. Phase 7 changes **no**
> tokens, fonts, layout structure, animation, or copy — it closes the precise px/opacity/binding
> drifts the P6 audit (`06-UI-REVIEW.md`, scored 22/24) found between the implementation and the
> comp, taking the frontend to **100% comp fidelity (UI-07)**.

## Governing rule (resolves the audit's two "spec-vs-comp" flags)

UI-07's success criterion is *"follows the binding `Umbra design/` comp **100%**"*, and CLAUDE.md
mandates 100% comp fidelity. **Where a P6 spec literal deviates from the comp, the comp wins.** This
resolves the two flags the audit left as "code matches spec but spec deviates from comp" (the reveal
CTA padding and the sub-stat unit-word size) toward the comp px values below.

## The fix list (exact comp values — `file` ← comp line)

### `web/src/components/PriceReveal.tsx` (the money-shot reveal — comp 325-341)
| Spot | Now | → Comp value | Comp line |
|------|-----|--------------|-----------|
| `CLEARS AT` margin-bottom | `14px` | **`4px`** | 326 |
| sub-stat unit words ("units" / "for all") | `fontSize 18px; opacity .5` | **`fontSize 13px; opacity .6`** | 334, 338 |
| `VIEW SETTLEMENT` CTA | `marginTop 34px; padding 16px 30px` | **`marginTop 30px; padding 15px 28px`** | 341 |

### `web/src/views/TheatreView.tsx` — RunningStage headline + sealed-count (comp 273-288)
| Spot | Now | → Comp value | Comp line |
|------|-----|--------------|-----------|
| "ONE PRICE. / NO LEAKS." headline margin | `14px 0 0` | **`14px 0 18px`** | 275 |
| sealed-count block layout | count + caption **stacked** inside `marginTop:34px` wrapper | **inline baseline row**: `display:flex; align-items:baseline; gap:14px; margin-bottom:30px` (no marginTop wrapper) | 276 |
| "Sealed orders in the book" caption | `font-body text-10; .16em; opacity .6` | **Inter `12px`; `.2em`; opacity `.7`** | 278 |
| CTA row | `marginTop:34px` wrapper | **`display:flex; gap:14px`** (the 30px gap comes from the sealed block's `margin-bottom:30px`) | 280 |

### `web/src/components/CrossingChart.tsx` — annotations (comp 313-314)
| Spot | Now | → Comp value | Comp line |
|------|-----|--------------|-----------|
| `p*` annotation | `fill="#F4F1EA"` (full opacity) | **`fill-opacity=".7"`** | 314 |
| `q=10` annotation | confirm | **`fill-opacity=".7"`** | 313 |

### `web/src/components/AgentRationale.tsx` — competing-agents rank-1 row (the one non-cosmetic fix)
- Lines 124-125 hardcode `100.00` / `10 u`. **Thread the lifted `preview` into `AgentRationale`**
  (from `AgentView`) and bind the two numerals to `preview.clearingPrice.toFixed(2)` /
  `preview.matchedVolume` so the "selected agent" row can never silently disagree with the proposal
  column on a non-§4 round. (Audit Top-3 #1; a credibility hole in the differentiator view.)
- Guard: `preview` may be null before solve — render the row only when `preview` is present (the
  panel already only shows post-solve), or fall back to the deterministic §4 values; never crash.

## Five-view comp sweep (UI-07 covers all five numbered views)

The P6 audit covered the three operator views (Theatre/Agent/Settlement) deeply. UI-07 covers **all
five**. During execution, re-verify each view's still frame against the comp and fix any further drift
found (same standard: exact token/px/letter-spacing/opacity):

- **01 Privacy** (`PrivacyView.tsx` + DeskColumn/SealedRail/RedactionBar — built P3) — re-check the
  redaction motif, the 3-up column rhythm, the center venue-count panel vs comp.
- **02 Desk** (`DeskView.tsx` + OrderTicket/HoldingsPanel/FillCard) — re-check the order ticket,
  holdings, and post-settle fill card vs comp.
- **03 Theatre / 04 Agent / 05 Settlement** — apply the fixes above; spot-check the rest stays on-comp.
- **CountdownRing** "Seconds to close" label — confirm Inter `10px; .22em; opacity .6; margin-top 6px`
  (comp 270).

**Invariant:** §4 values stay exact and on-comp everywhere — `100.00` / matched `10` / fills
A=10·B=8·C=2 / balances A:10/4000 · B:12/1800 · C:13/1200 / legs A↔B 8@100 · A↔C 2@100.

## Out of scope (unchanged)
- No token/font/animation/copy changes; no new components; no logic/data-plane changes. The two wow
  beats (lime `umbra-slam` reveal, single-rAF simultaneous settle) and reduced-motion gating are
  already correct — do not touch their behavior, only the static px/typography/binding.

## Validation
- `cd web && npm run build` stays green (tsc + vite) after every change.
- `cd web && npx vitest run src/lib` stays green (the 11 §4-value tests — none of these px fixes touch
  the pure helpers, so they must remain untouched/green).
- `gsd-ui-review` re-audit against the comp → target **24/24** (all six pillars), with the AgentRationale
  binding flag cleared.

**Approval:** approved 2026-06-27 (delta contract; base contract 06-UI-SPEC.md already approved 6/6)
