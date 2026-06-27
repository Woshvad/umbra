# Phase 7 — UI Review (UI-07 fidelity re-audit)

**Audited:** 2026-06-27
**Baseline:** `Umbra design/Umbra.dc.html` (the binding comp, ground truth) + `07-UI-SPEC.md` (UI-07 delta contract) + prior `06-UI-REVIEW.md` (22/24)
**Screenshots:** not captured — dev server up on :5173 but raster capture is environment-blocked this session; headless code-level audit against the comp source (per brief, advisory/non-blocking)
**Method:** read each implementation file against its cited comp lines; governing rule applied — where a P6 spec literal deviated from the comp, the comp wins.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All CTAs/headlines/empty/offline copy verbatim; §4 values exact; AgentRationale numerals now live, never silently disagree. |
| 2. Visual hierarchy | 4/4 | Both wow beats intact (untouched by sweep); reveal + theatre vertical rhythm now lands on the comp's tighter spec. |
| 3. Color | 4/4 | Reserved-for lists honored; chart `p*`/`q=` annotations now `fill-opacity .7` matching comp 313-314. |
| 4. Typography | 4/4 | Sub-stat unit words 13px/.6 (comp 334/338) and sealed caption Inter 12px/.2em/.7 (comp 278) now exact; all three P6 type drifts closed. |
| 5. Spacing | 4/4 | `CLEARS AT` 4px (comp 326), headline `14px 0 18px` (comp 275), sealed inline baseline row + 30px, CTA 30px/15px 28px (comp 341) all closed. |
| 6. Registry / component safety | 4/4 | No shadcn / no third-party registries (N/A by spec); the lone hardcoded-data defect (AgentRationale) is now bound to live `preview`. |

**Overall: 24/24** (up from 22/24)

---

## Prior 22/24 findings — closure status

All three P6 WARNING findings are **CLOSED**:

1. **AgentRationale hardcoded `100.00` / `10 u` — CLOSED.** `AgentView.tsx:51` now threads `preview` into `<AgentRationale preview={preview} />`; `AgentRationale.tsx:125-126` binds `(preview?.clearingPrice ?? 100).toFixed(2)` and `preview?.matchedVolume ?? 10`. The rank-1 row can no longer disagree with the proposal column on a non-§4 round, and the `?? 100 / ?? 10` fallback keeps the deterministic §4 values and never crashes pre-solve. The differentiator-view credibility hole is sealed.
2. **Reveal/theatre bottom margins — CLOSED.** `PriceReveal.tsx:21` `CLEARS AT` `marginBottom:'4px'` (comp 326). `TheatreView.tsx:174` headline `margin:'14px 0 18px'` (comp 275). The money-shot vertical rhythm is back on the comp.
3. **Sub-stat unit-word size + sealed caption styling — CLOSED.** `PriceReveal.tsx:67,78` unit words `fontSize:'13px'; opacity:0.6` (comp 334/338). `TheatreView.tsx:181-190` restructured to the comp's inline baseline row (`display:flex; alignItems:'baseline'; gap:'14px'; marginBottom:'30px'`) with caption Inter `12px / .2em / opacity .7` (comp 276-278).

Both prior "spec-vs-comp" flags (reveal CTA padding; sub-stat word size) are resolved toward the comp per UI-07's governing rule — `PriceReveal.tsx:84,92` now `marginTop:'30px'`, `padding:'15px 28px'` (comp 341).

---

## Verified comp-correct (Phase 7 fix list)

- **PriceReveal.tsx** — `CLEARS AT` mb 4px ✓ · sub-stat words 13px/.6 ✓ · CTA mt 30px + pad 15px 28px ✓ (comp 326/334/338/341). Hero slab/red sliver/umbra-slam untouched.
- **TheatreView.tsx** — headline `14px 0 18px` ✓ · sealed inline baseline row gap 14px / mb 30px ✓ · caption Inter 12px/.2em/.7 ✓ · CTA row `flex; gap:14px` ✓ (comp 275-280).
- **CrossingChart.tsx** — `q={matchedVolume}` and `p*` annotations both `fillOpacity={0.7}` ✓ (comp 313-314); the price label (15px, red) and axis caps (.5) correctly left at their own opacities.
- **AgentRationale.tsx + AgentView.tsx** — rank-1 row bound to live `preview` ✓ (P6 Top-3 #1).
- **AgentView.tsx / SettlementView.tsx** h1 — both `margin:'26px 0 34px'`, exactly matching comp 365 / 430. No regression. (Note: Privacy h1 is comp `26px 0 36px` — distinct and out of UI-07 scope; unchanged.)
- **DeskColumn.tsx** role caption `text-10 / .14em / opacity-55 / marginTop 3px` — unchanged by the sweep; pre-existing P3 styling, no regression introduced.

§4 invariant holds everywhere: clearing `100.00` (live `clearingPrice.toFixed(2)`), matched `10`, fills A=10·B=8·C=2 (`legsFromPreview` from allocations), finals A:10/4000 · B:12/1800 · C:13/1200 (`BEFORE` + `deskBalancesFromAllocations`), legs 8@100 + 2@100. No hardcoded numerals remain in the cleared/agent/settlement paths.

---

## New drift introduced by the sweep

None. Every Phase-7 edit moves a value toward its cited comp line; no token, font, animation, copy, or layout structure changed outside the fix list. Both wow beats (lime `umbra-slam` reveal, single-rAF simultaneous settle) and reduced-motion gating are behaviorally untouched (`SettlementView.tsx:102-117`, `AgentRationale.tsx:41-44`).

---

## Remaining (pre-existing, non-blocking — not a Phase-7 regression)

- **AgentRationale competing-agents row** (`AgentRationale.tsx:104-127`) uses `gap:12px; padding:13px 12px; background:rgba(255,106,26,.08)` with no per-row `border-bottom`, whereas comp 405 is `gap:14px; padding:14px 0; border-bottom:1px solid rgba(10,10,10,.16)`. This is the deliberate P6 rank-1-only flame-tint row (the comp's `sc-for` renders a 3-row table with bordered rows; only the real AGENT-00 row is rendered, intentionally tinted). Carried since P6, scored 4/4 then; INFO-level, not in the UI-07 fix list. Flag only if the §19 multi-agent table is later built — at that point match comp 405 row metrics exactly.

---

## Files Audited
- `web/src/components/PriceReveal.tsx`, `CrossingChart.tsx`, `AgentRationale.tsx`, `DeskColumn.tsx`
- `web/src/views/TheatreView.tsx`, `AgentView.tsx`, `SettlementView.tsx`
- Baseline: `Umbra design/Umbra.dc.html` (comp lines 152-178, 260-349, 357-439), `07-UI-SPEC.md`, `06-UI-REVIEW.md`
