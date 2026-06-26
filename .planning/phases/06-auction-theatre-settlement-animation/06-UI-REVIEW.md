# Phase 6 — UI Review

**Audited:** 2026-06-26
**Baseline:** 06-UI-SPEC.md (approved binding contract) + `Umbra design/Umbra.dc.html` (the comp, ground truth) + `screenshots/02-reveal.png`
**Screenshots:** not captured (no dev server on :5173/:3000 — headless code-level audit per brief; advisory / non-blocking)
**Method:** read implementation against the contract + comp source; cross-checked exact px/letter-spacing/opacity literals and §4 fixture values.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All CTAs + headlines + empty/offline states verbatim from the comp; §4 values exact. |
| 2. Visual hierarchy | 4/4 | Money shot (lime slam) + simultaneous settle (single-rAF) + stamp all built to spec; reduced-motion gated throughout. |
| 3. Color | 4/4 | lime/red/flame/buy/sell used strictly per the reserved-for lists; no hardcoded off-token colors; Theatre inversion correct. |
| 4. Typography | 3/4 | Families + the 120/84/54/56/44/40/30 scale all correct; three sub-spots drift from comp px (sub-stat inline 18 vs 13, "Sealed orders" 10/.16 vs 12/.2). |
| 5. Spacing | 3/4 | Page frames + grids match; two reveal/theatre margins drift from the comp literals (`4px`→`14px`, missing `18px` bottom). |
| 6. Registry / component safety | 4/4 | No shadcn, no third-party registries (N/A by spec); but one component hardcodes live data (AgentRationale). |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **AgentRationale competing-agents row hardcodes `100.00` / `10 u`** (`AgentRationale.tsx:124-125`) — WARNING. The rank-1 row prints static strings instead of `preview.clearingPrice.toFixed(2)` / `preview.matchedVolume`. On any non-§4 round (or a price ≠ 100) the "selected agent" row will silently disagree with the proposal column two panels left of it — a credibility hole in the differentiator view. Fix: thread `preview` into `AgentRationale` and bind both numerals to it.
2. **Reveal "CLEARS AT" + Theatre headline bottom margins drift from the comp** (`PriceReveal.tsx:22`, `TheatreView.tsx:174`) — WARNING. Comp line 326 sets `CLEARS AT` `margin-bottom:4px`; code uses `14px`. Comp line 275 sets the "ONE PRICE. / NO LEAKS." headline `margin:14px 0 18px`; code uses `margin:14px 0 0` (no bottom gap before the sealed-count block). Both push the money-shot vertical rhythm off the binding comp. Fix: `4px` and restore the `18px` bottom.
3. **Reveal sub-stat unit-word size + "Sealed orders" caption styling** (`PriceReveal.tsx:67,78`, `TheatreView.tsx:182-190`) — WARNING. The "units"/"for all" inline spans are `fontSize:18px`; comp line 334/338 = `13px`. The "Sealed orders in the book" caption is `text-10 / .16em / opacity .6` and stacked under the count; comp line 277-278 = Inter `12px / .2em / opacity .7` laid out inline (`display:flex; align-items:baseline; gap:14px`) with the 44px count. Fix to the comp values.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
PASS. Verbatim against the comp + Copywriting Contract:
- Desk: `ORDERS IN THE DARK`, `SEAL ORDER`, `SEALED` + `RE-OPEN`, `load demo order`, `YOUR FILL` / `Visible only to you`, empty state (`FillCard.tsx:28-30`) — all exact.
- Theatre: `ONE PRICE. / NO LEAKS.`, `WINDOW READY` / `WINDOW OPEN — ORDERS LOCKED & HIDDEN`, `START 60s WINDOW`, `CLOSE & SOLVE`, `SOLVER-AGENT-00 COMPUTING…` — exact.
- Reveal: `CLEARS AT`, `100.00` (live `clearingPrice.toFixed(2)`), `10 units` matched, `1 for all`, `VIEW SETTLEMENT →` — exact; chart legend `MATCHED 10 @ 100.00` — exact.
- Agent: `THE AGENT CLEARS THE BOOK`, `SOLVER-AGENT-00`, `SELECTED`, the NEW `VERIFIED · …` badge in ink (`AgentProposal.tsx:56-62`), empty state (`AgentView.tsx:54-57`) — exact.
- Settlement: `ONE TRANSACTION. ALL OR NOTHING.`, `SETTLE ATOMICALLY` (one-click, no dialog — correct), `SETTLED — both legs, one tx`, `1 TRANSACTION · ATOMIC` stamp, empty state — exact.
- Offline caption `SOLVER OFFLINE — START THE SERVICE ON :4000` present in all three operator views.
- §4 values exact: clearing 100.00, matched 10, legs 8@100 + 2@100 (`SettlementView.legsFromPreview`), finals A:10/4000 · B:12/1800 · C:13/1200 (BEFORE deltas verified, `SettlementView.tsx:29-33`).

### Pillar 2: Visual hierarchy (4/4)
PASS. Both wow beats built as specified:
- **Money shot:** lime `#D6FB3C` slab, ink 120px numeral, red `skewX(-12deg)` sliver, `animate-umbra-slam` (`PriceReveal.tsx:27-55`) — matches `02-reveal.png` exactly.
- **Simultaneous settle:** SINGLE `requestAnimationFrame` clock drives `settleProgress` 0→1; ALL leg tracks (`DvpLegs`) AND ALL balance lerps (`BalanceTable`) read the one value, so they snap together — never sequenced (`SettlementView.tsx:96-101`). rAF + done-timer cancelled on unmount.
- **Stamp** slams via `animate-umbra-stamp`, `rotate(-4deg)`, translucent paper box (`AtomicStamp.tsx`).
- `prefers-reduced-motion` honored in OrderTicket (wipe), SettlementView (`dur=0`), AgentRationale (instant text). The countdown still counts under reduced-motion (data, not decoration) — correct per spec.
- Focal points clear: lime hero dominates Theatre-cleared; countdown ring dominates Theatre-running; the FillCard ink header anchors Desk.

### Pillar 3: Color (4/4)
PASS. Reserved-for lists honored:
- **lime** only on: reveal slab, chart matched-region rect (`fillOpacity .16`) + legend swatch. No stray lime.
- **red `#E2231A`** only on: CLOSE & SOLVE fill, reveal red sliver, chart p\* rule/dropline/dot/annotation, DvP cash arrow, SETTLED dot, atomic stamp. No generic red.
- **flame `#FF6A1A`** confined to Theatre/Agent (COMPUTING square, agent dot, caret, rank-1 tint).
- **buy `#2B3AF2` / sell `#FF3D9A`** only on side toggle + signed fill numerals.
- No hardcoded off-token hex anywhere — all values are the comp tokens (`#0A0A0A`, `#F4F1EA`, `rgba(10,10,10,.x)` faders). Theatre dark-inversion (`#0A0A0A` bg / `#F4F1EA` text) applied to the `<main>` stage only.
- The new VERIFIED badge correctly uses ink text (did not invent a color) per spec.

### Pillar 4: Typography (3/4)
Families correct everywhere (Space Grotesk display / IBM Plex Mono tabular data / Inter labels); `tabular-nums` present on every numeral cited in the spec. Large scale correct: 120 hero, 84 ring, 56 Theatre headline, 54 view headlines, 44 inputs/sealed-count, 40 holdings, 34 sub-stat, 30 fill stat, 22 proposal, 18 balance, 15 rationale/leg party, 13 leg qty/cash.

Drift findings (all WARNING):
- `PriceReveal.tsx:67,78` — sub-stat unit words "units" / "for all" use `fontSize:18px`; comp line 334/338 = `13px`. (Spec line 93 lists the 34px numeral but the inline word size follows the comp's 13px.)
- `TheatreView.tsx:186-190` — "Sealed orders in the book" caption is `text-10` (10px) `.16em` opacity `.6`; comp line 278 = Inter `12px` `.2em` opacity `.7`.
- `CrossingChart.tsx:114` — p\* annotation `fill="#F4F1EA"` at full opacity; comp line 314 = `fill-opacity=".7"`. Minor.

### Pillar 5: Spacing (3/4)
Page frames exact: Desk/Agent `30px 48px 64px`, Theatre `30px 48px 48px` + stage `48px 56px 56px`, Settlement `30px 48px 72px`. Grids match the spec (`minmax(0,420px) 1fr`, `minmax(0,520px) 1fr` gap 56, `minmax(0,1fr) 360px`). Holdings/DvP/balance paddings match.

Drift findings (WARNING):
- `PriceReveal.tsx:22` — "CLEARS AT" `marginBottom:14px`; comp line 326 = `4px`.
- `TheatreView.tsx:174` — headline `margin:14px 0 0`; comp line 275 = `14px 0 18px` (lost 18px bottom). Sealed-count block also uses `marginTop:34px` (`TheatreView.tsx:181`) whereas the comp drives the gap via the headline's `18px` bottom + the count block's own `margin-bottom:30px` inline layout — the live stacked version reads slightly looser than the comp's inline `align-items:baseline; gap:14px` row.
- `PriceReveal` CTA padding `16px 30px` (`:91`) vs comp line 341 `15px 28px` — follows the spec's stated `16px 30px` (spec deviates from comp here; flag is on the spec, code is compliant).

### Pillar 6: Registry / component safety (4/4)
N/A by contract — no shadcn (`shadcn_initialized: false`), no third-party registries; all UI hand-authored React/SVG. No `components.json`. Registry audit skipped (correct).

One component-integrity flag carried into the Top-3: `AgentRationale.tsx:124-125` hardcodes `100.00` / `10 u` rather than binding the lifted `preview` — a static-data defect, not a registry one, but it undermines the "live, verified" framing of the agent view.

---

## Files Audited
- `web/src/views/DeskView.tsx`, `TheatreView.tsx`, `AgentView.tsx`, `SettlementView.tsx`
- `web/src/components/OrderTicket.tsx`, `HoldingsPanel.tsx`, `FillCard.tsx`, `CountdownRing.tsx`, `CrossingChart.tsx`, `PriceReveal.tsx`, `AgentProposal.tsx`, `AgentRationale.tsx`, `DvpLegs.tsx`, `BalanceTable.tsx`, `AtomicStamp.tsx`
- `web/tailwind.config.ts`
- Baseline: `.planning/phases/06-auction-theatre-settlement-animation/06-UI-SPEC.md`, `Umbra design/Umbra.dc.html`, `Umbra design/screenshots/02-reveal.png`
