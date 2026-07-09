# Phase 9 — UI Review (Auction Depth & Live Viz)

**Audited:** 2026-07-09
**Baseline:** 09-UI-SPEC.md (approved additive contract) + Umbra design/Umbra.dc.html (binding comp) + web/tailwind.config.ts / index.css (sanctioned tokens & keyframes)
**Screenshots:** not captured (static code audit only — no dev server booted by design)
**Scope:** the FOUR new Phase-9 surfaces only — AUCT-01 (OrderTicket), AUCT-03/VIZ-01 (TheatreView IndicativePanel + CrossingChart), AUCT-04 (TcaReceipts), WOW-06 (SettlementView LeakageSimPanel). Shipped v1/P8 chrome not re-audited.
**Stance:** advisory / non-blocking. Scored adversarially against the contract; not averaged upward.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All 30+ contract strings verbatim EXCEPT two invented small-N guard strings not in the Copywriting Contract |
| 2. Visuals | 4/4 | Two-surplus distinction and simulation-vs-ledger separation are unmistakable; hierarchy holds |
| 3. Color | 3/4 | BLOCKER-class token drift: net-imbalance uses off-token `#4A7DFF`/`#FF5C8A` instead of reserved `buy`/`sell` tokens |
| 4. Typography | 4/4 | Every numeric is IBM Plex Mono + `tabular-nums`; all sizes on the frozen `fontSize` scale; no new weight |
| 5. Spacing | 4/4 | All spacing on the irregular comp literal scale; zero arbitrary Tailwind values |
| 6. Experience Design | 4/4 | Locked / offline / small-N guard / post-settle gating / reduced-motion all handled; one spec-behavior divergence noted |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **Off-token net-imbalance colors** — `TheatreView.tsx:281` renders the buy-heavy value in `#4A7DFF` and sell-heavy in `#FF5C8A`. The Color contract (09-UI-SPEC lines 174–178, 244) explicitly reserves `buy #2B3AF2` / `sell #FF3D9A` for exactly this net-imbalance direction. These are invented lightened hexes with no token/comp backing → real design-comp drift on the one element the contract names. **Fix:** use `#2B3AF2` / `#FF3D9A` (the sanctioned tokens, as `TcaReceipts` and `OrderTicket` correctly do); if dark-stage contrast is the motivation, ratify a lightened token in `tailwind.config.ts` + `DECISIONS.md` first — do not inline an unsanctioned literal.

2. **Small-N guard copy + behavior diverges from the approved contract** — `TheatreView.tsx:386–397` introduces `Imbalance · Matched` and `WITHHELD — PRIVACY GUARD (< 2 ORDERS ON A SIDE)`, neither of which is in the Copywriting Contract (which lists only `COARSE — PRIVACY GUARD (< 2 ORDERS ON A SIDE)`). The spec (line 250) also states net-imbalance / est-matched **remain aggregate counts** under the guard, but the impl withholds them. The withhold is defensibly *more* private, but it is an un-ratified deviation. **Fix:** either restore the aggregate imbalance/matched counts under the guard per contract, or amend the contract + Copywriting table to bless the `WITHHELD` strings.

3. **Pre-existing `#fff` on the side-toggle active label** — `OrderTicket.tsx:209` sets active side text to `#fff` (not the `paper #F4F1EA` token). This is inherited shipped side-toggle grammar (not new Phase-9 code), so it is advisory-only, but it is the one non-token literal in the new file. **Fix (low priority):** align to `#F4F1EA` for token purity if the shipped toggle is ever touched.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- PASS — verbatim contract matches confirmed: AUCT-01 selector/segment/descriptor/param/validation copy (`OrderTicket.tsx:40–53, 300, 404, 439, 443–450, 463, 480`), AUCT-03 sub-label + aggregate note + scalar captions + `COARSE — PRIVACY GUARD…` (`TheatreView.tsx:299, 305, 315, 329`), VIZ-01 `ASSEMBLING — CURVE BUILDS AS ORDERS SEAL` / `SUPPLY × DEMAND` / `p* LOCKED @ {price}` (`CrossingChart.tsx:68, 162`), AUCT-04 block/fact/tag/surplus/export copy (`TcaReceipts.tsx:86, 131–146, 155, 166, 184`), WOW-06 sub-label/tag/columns/punchline/disclaimer (`SettlementView.tsx:283–341`) — all exact, including the `VS A PUBLIC BOOK` punchline and the full disclaimer.
- FLAG (WARNING) — `TheatreView.tsx:387` caption `Imbalance · Matched` and `:396` `WITHHELD — PRIVACY GUARD (< 2 ORDERS ON A SIDE)` are invented strings absent from the Copywriting Contract. Contract only sanctions the `COARSE —` variant.

### Pillar 2: Visuals (4/4)
- PASS — AUCT-04 renders the two surpluses as genuinely distinct rows: proven vs-LIMIT with a solid `8px` ink square + `ON-LEDGER · SURPLUS ≥ 0` at mono `22` (`TcaReceipts.tsx:152–159`), benchmark vs-REFERENCE below a hairline rule, lighter, mono `18`, red-on-negative (`:163–173`). Not conflatable — the contract's central requirement is met.
- PASS — WOW-06 is unmistakably not-ledger: 1px **dashed** ink border (`SettlementView.tsx:279`) vs the receipts' **solid** ink border (`TcaReceipts.tsx:98`), the `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag (`:291–295`), and the disclaimer footnote (`:339`). Correctness-of-meaning check passes.
- PASS — VIZ-01 assembling state suppresses the red p*/dropline/marker/label (`CrossingChart.tsx:111`) and holds the faint lime matched region; red locks only at close. Focal hierarchy (reveal remains climax) preserved — indicative panel is secondary on the stage.

### Pillar 3: Color (3/4)
- FLAG (WARNING, headline drift) — `TheatreView.tsx:281` `imbColor` = `#4A7DFF` (buy) / `#FF5C8A` (sell). Off-token; the contract names `buy #2B3AF2` / `sell #FF3D9A` for this exact element. Balanced state correctly uses `#F4F1EA` paper.
- PASS — every other literal across all four surfaces is a sanctioned token (grep of `#hex` shows only `#F4F1EA`, `#0A0A0A`, `#D6FB3C`, `#E2231A`, `#2B3AF2`, `#FF3D9A`, `#FF6A1A`). Panel border `rgba(244,241,234,0.28)` is the explicitly-sanctioned paper-at-.28 inverted-border grammar (spec line 236).
- PASS — color reservation honored: lime confined to the chart matched region / reveal (`CrossingChart.tsx:87, 148`); AUCT-04 proven surplus and WOW-06 `$ saved` punchline are deliberately **ink** not lime (`TcaReceipts.tsx:157`, `SettlementView.tsx:334`); red confined to locked p*, negative benchmark, and simulated `$ lost` (`TcaReceipts.tsx:170`, `SettlementView.tsx:306`). No lime/red on generic affordances; `EXPORT RECEIPT ↓` is `.umbra-ink-ghost`.

### Pillar 4: Typography (4/4)
- PASS — tabular-nums mono on every numeric: indicative price/band/imbalance/est-matched (`TheatreView.tsx:320, 334, 355, 377`), receipt facts + both surpluses + fill qty (`TcaReceipts.tsx:116, 157, 169, 201`), all WOW-06 figures incl. the `40` punchline (`SettlementView.tsx:305, 321, 334`), chart price label mono `15` SVG literal (`CrossingChart.tsx:126`). No numeral in Inter/Space Grotesk.
- PASS — all sizes map to the frozen `fontSize` scale (`9/10/11/13/14/18/22/40/44`); no new size introduced. Weights stay 400 (Inter) / 600 (mono+display); the only `700` is the inherited `EXPORT RECEIPT ↓` / SEAL / side-toggle CTA grammar (`TcaReceipts.tsx:181`, `OrderTicket.tsx:203`).

### Pillar 5: Spacing (4/4)
- PASS — grep for arbitrary Tailwind values (`[NNpx]`, `bg-[`, `text-[`, `p-[`, `m-[`) across all four surfaces: **zero matches**. All spacing is inline literals on the comp's irregular scale (`4/8/10/12/14/16/18/22/24/26/30/34`) — e.g. receipts `padding:16px 22px` + `marginTop:34px` (`TcaReceipts.tsx:83, 98`), sim panel `22px 24px` (`SettlementView.tsx:279`), param groups `26/30px` (`OrderTicket.tsx:346, 372`), indicative panel `marginTop:18` (`TheatreView.tsx:291`). Matches spec Spacing Scale table.

### Pillar 6: Experience Design (4/4)
- PASS — state coverage is thorough: one-order-per-round lock + SEALED/RE-OPEN + seal-wipe + reduced-motion gating (`OrderTicket.tsx:87, 179, 488`), per-type field show/hide + non-blocking validation hints (`:411–485`); offline caption governs all solver-plane surfaces (`TheatreView.tsx:134`, `SettlementView.tsx:173`); AUCT-04/WOW-06 strictly post-settle gated (`SettlementView.tsx:228`, `TcaReceipts.tsx:68`); small-N guard is a visible, labeled UI state, never silent (`TheatreView.tsx:317, 344`); WOW-06 `umbra-rise` honors `prefers-reduced-motion` (`SettlementView.tsx:276`).
- PASS — §4 invariant preserved: `load demo order` forces plain Limit (`OrderTicket.tsx:110–118`); receipts/sim read the settled `$100.00 / A=10 / B=8 / C=2` preview numbers; new panels are additive and do not perturb the clear.
- NOTE (advisory) — the small-N guard withholds imbalance/matched (see Pillar 1 flag); spec line 250 expects them to remain aggregate counts. Defensible privacy posture but an un-ratified contract divergence.

---

## Registry Safety
Not applicable — shadcn intentionally absent (`components.json` does not exist by design; hand-authored comp is the binding source, CLAUDE.md rule 2). No third-party registries. Gate skipped per instruction.

---

## Files Audited
- web/src/components/OrderTicket.tsx (AUCT-01)
- web/src/views/TheatreView.tsx — IndicativePanel (AUCT-03) + assembling host (VIZ-01)
- web/src/components/CrossingChart.tsx (VIZ-01)
- web/src/components/TcaReceipts.tsx (AUCT-04)
- web/src/views/SettlementView.tsx — LeakageSimPanel host (WOW-06 / AUCT-04 mount)
- web/src/lib/leakage.ts (WOW-06 sim math)
- Baselines: 09-UI-SPEC.md, 09-CONTEXT.md, Umbra design/Umbra.dc.html, web/tailwind.config.ts, web/src/index.css
