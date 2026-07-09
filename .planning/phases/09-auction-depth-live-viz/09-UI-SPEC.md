---
phase: 9
slug: auction-depth-live-viz
status: approved
reviewed_at: 2026-07-09
shadcn_initialized: false
preset: none
design_system: "Umbra design/ comp (binding) + web/tailwind.config.ts tokens (frozen from P3/P6, UI-07 = 24/24)"
baseline: "06-UI-SPEC.md (approved binding contract) + 07-UI-SPEC.md (100% comp fidelity) + 08-UI-SPEC.md (additive baseline) + Umbra design/Umbra.dc.html (ground truth)"
created: 2026-07-09
---

# Phase 9 — UI Design Contract (Auction Depth & Live Viz — AUCT-01/03/04 · VIZ-01 · WOW-06)

> **This is an ADDITIVE contract.** The full design system is already locked in `06-UI-SPEC.md`
> (approved 6/6), refined to **100% comp fidelity in `07-UI-SPEC.md` (UI-07 = 24/24)**, extended
> additively in `08-UI-SPEC.md`, and grounded in the binding comp `Umbra design/Umbra.dc.html`.
> Phase 9 introduces **no** new tokens, fonts, type sizes, palette entries, spacing values, or
> keyframes. Every Phase-9 surface is a **new control/panel composed onto an existing shipped view**
> and must be visually **indistinguishable** from the surrounding system — reusing the exact
> `tailwind.config.ts` tokens, the section-marker rhythm, the ink-panel / redaction / draw-on motifs,
> and the established mono/display/body grammar.
>
> **Governing rule (inherited from UI-07):** where any literal here appears to differ from the binding
> comp, the comp wins. The five numbered views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent ·
> 05 Settlement) are **not redesigned** — Phase 9 adds surfaces *within* them without disturbing the
> shipped layout, **the three-desk → one-uniform-price → atomic-settle money shot** (still the visual
> climax), the money-shot reveal, or the simultaneous-settle beat.
>
> **§4 invariant (continuous canary):** every numeric surface here must read the $100.00 / A=10 / B=8 /
> C=2 fixture unchanged. The §4 orders are plain **Limit** orders; new order types and new panels are
> additive and must not perturb the canonical clear.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — binding hand-authored comp; no shadcn (`components.json` absent by design — verified; CLAUDE.md rule 2 makes the comp the pixel source of truth, so a component registry is intentionally not used) |
| Preset | not applicable |
| Component library | none (raw React 18 + Tailwind 3.4 + inline `style` for exact comp values) |
| Icon library | none — every mark is a CSS/SVG primitive (squares, dots, arrows, redaction stripes, carets, step polylines) |
| Font | Space Grotesk (display) · IBM Plex Mono (data/wire/numeric, `tabular-nums`) · Inter (body/labels) — already wired in `web/index.html` |

**shadcn gate:** executed → **not applicable**. The project has an established, binding, hand-authored
design system; initializing shadcn would violate the 100%-comp-fidelity mandate (CLAUDE.md rule 2). No
registry, no third-party blocks. Registry-safety vetting gate: not applicable.

---

## Reconciliation Notes (CONTEXT ↔ comp ↔ shipped code)

These resolve every Phase-9 gap by faithfully extending the existing system; executors must not deviate.

1. **Two data planes are preserved.** AUCT-01 order entry runs on the **per-party JSON Ledger API v2**
   plane inside the active desk's own `ctx.DamlLedger` (`DeskView`/`OrderTicket`) — never an operator
   token in the browser. AUCT-03/VIZ-01 aggregate feed, AUCT-04 receipts, and WOW-06 all run on the
   **solver operator plane** via `web/src/solver.ts` (`VITE_SOLVER_URL`). **The aggregate feed exposes
   scalars only** — an individual `Order` never leaves the solver process and never reaches a desk.
2. **Aggregate-only is a genuine privacy surface, not a nicer chart.** AUCT-03's indicative panel and
   VIZ-01's live curve are computed server-side from the whole sealed batch (the solver holds Operator
   authority) and publish **only** aggregate scalars (indicative price, net imbalance, est. matched
   volume). The **small-N guard is a visible, labeled UI state** — the indicative price holds as a coarse
   band until there are ≥2 orders on the relevant side (CONTEXT). Never route an individual order to a
   desk to win a smoother animation.
3. **Two surpluses are two different numbers — keep them visually separable.** AUCT-04's
   **surplus-vs-LIMIT** is the on-ledger, structurally-≥0 **proven** number (marked with the ink "proven"
   emphasis + an `ON-LEDGER · SURPLUS ≥ 0` caption). **Surplus-vs-REFERENCE** is a labeled benchmark that
   **may be negative** — rendered in a distinct, lighter treatment; a negative value uses `#E2231A` red
   (signal = below-benchmark). The reference price is a **stub**, always labeled `REFERENCE — PRE-AUCTION
   MID (STUB)` (a real market-data feed is Track B).
4. **Simulation must be unmistakably NOT ledger data.** WOW-06's cost-of-leakage panel is a client-side
   illustrative model; it is marked with a **dashed** 1px ink border (real surfaces are **solid** 1px
   ink), a `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag, and a footnote disclaimer. Its numbers must
   never be mistaken for the real on-ledger receipt numbers that sit above it.
5. **The chart extends, it does not fork.** VIZ-01 extends the shipped hand-rolled `CrossingChart`
   (fixed `viewBox 0 0 480 360`, `lib/curve.ts` mapping, §4 crossing at the binding marker `(296,160)`).
   During the open window it renders an **assembling** state (step curves draw on via `umbra-draw` as
   orders seal; **no red locked p\*** yet — red is reserved for the LOCKED clear). At close the red p\*
   rule + dropline + marker LOCK in (the reveal beat), unchanged from the shipped solved state.
6. **Order-type params are the assist tier.** AUCT-01's extra param fields (min-qty, firm-if band) reuse
   the ticket's input grammar but at the **1px** underline / secondary numeric scale (mirroring the
   shipped WOW-03 NL input's 1px-vs-2px assist convention) so the primary qty/limit `44px` inputs remain
   the visual anchors. The **`load demo order`** affordance stays a plain **Limit** (CONTEXT / §4).
7. **No new palette.** Phase 9 only extends the *reserved-for* lists of the existing accent (lime), signal
   (red), and semantic order-side (buy/sell) tokens. All non-adversarial CTAs stay **ink/paper**.

---

## Spacing Scale

Phase 9 uses the **binding-comp irregular literal scale** already exposed in `web/tailwind.config.ts`
(`spacing`) and used across all five views. Do **not** normalize to an 8-point grid (would break comp
fidelity — CLAUDE.md rule 2). This is the standing binding-comp exception, unchanged from P6/P7/P8.

| Token (config) | Value | Usage in Phase-9 surfaces |
|----------------|-------|---------------------------|
| (raw) | 4px | segmented-selector micro-gaps, proven-square → text gap |
| (raw) | 8px | field-label → input gap, scalar row internal gaps, verdict-square → text |
| (raw) | 10px | selector → descriptor gap, receipt inner label→value gap |
| (raw) | 12px | receipt-block inner padding, tag padding, sim-column gap |
| (raw) | 16px | receipt-block padding-y, sim-panel inner padding-y |
| `14` | 14px | section-marker gap, param-field group gap, receipt row gap |
| `18` | 18px | order-type selector block margin, indicative-panel top margin |
| `22`/`24` | 22/24px | receipt-block / sim-panel inner padding (`~22px 24px`, matches evidence-panel rhythm) |
| `26`/`30` | 26–30px | sub-block margins inside the Order Ticket (matches shipped qty/limit spacing) |
| `34` | 34px | post-settle block margin-top (matches shipped Settlement CTA / RoundBrief rhythm) |
| `48` | 48px | page horizontal padding (every `<main>`, unchanged) |

**Page frame is unchanged:** every host view keeps its shipped `<main>` padding, section marker, 1px ink
rule, and headline. Phase-9 panels insert **within** the Order Ticket (AUCT-01), **inside** the Theatre
running-stage right column + the chart (AUCT-03/VIZ-01), and **below** the Settlement settle area /
RoundBrief (AUCT-04 receipts, then WOW-06 sim). Exceptions: none beyond the irregular literal set above.

---

## Typography

**No new type sizes.** Every Phase-9 element maps to a size already declared in `tailwind.config.ts
fontSize`. All mono numerals/data carry `font-variant-numeric: tabular-nums`. Two weights dominate, per
comp grammar: **400 (Inter labels/body)** and **600 (mono data + display)** — with **700 confined
strictly to the shipped export/parse CTA grammar** (`EXPORT RECEIPT ↓`, `PARSE →`). No Phase-9 element
introduces a new weight; 700 is inherited from the shipped CTA row, not added here.

| Role | Family | Size / LH (token) | Weight | Where (Phase 9) |
|------|--------|-------------------|--------|-----------------|
| Section / sub-block label | Inter | `10` (10px/1.2, `.14–.16em`, uppercase, opacity .5–.55) | 400 | "Order Type", "Indicative · Aggregate Only", "Best-Ex / TCA", "Cost of Leakage · Simulation" |
| Field label | Inter | `10` (10px/1.2, `.14em`, uppercase, opacity .4–.5) | 400 | "Min Acceptable Qty", "Firm If Clears ≤", unit captions ("BONDX", "USDCx / unit") |
| Type descriptor / body prose | Inter | `13` (13px/1.6, opacity .6–.7) | 400 | active-order-type one-liner, sim footnote disclaimer, receipt helper prose |
| Segmented selector / mode labels | IBM Plex Mono | `9` (9px/1, `.16em`, uppercase) | 600 | order-type toggle (LIMIT · NONCOMP · MAQ · COND), guard-state captions |
| Verdict / proof / status line | IBM Plex Mono | `9` (9px/1, `.16em`, uppercase) | 600 | `ON-LEDGER · SURPLUS ≥ 0`, `AGGREGATE — NO ORDER LEAVES SOLVER`, `p* LOCKED @ 100.00` |
| Simulation / stub tag | IBM Plex Mono | `9` (9px/1, `.12em`, uppercase, 1px border, 3px 7px pad) | 600 | `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA`, `REFERENCE — STUB` |
| Panel caption | IBM Plex Mono | `11`/`12` (11–12px/1.2–1.4, `.16em`, uppercase, opacity .6) | 600 | "INDICATIVE", "NET IMBALANCE", "EST. MATCHED", receipt column captions, sim column captions |
| Small numeric / bp / secondary param value | IBM Plex Mono | `14` (14px/1) or `18` (18px/1) tabular | 600 | improvement bp (`+X bp`), est. matched volume, min-qty / firm-if param values |
| Mid numeric (receipt / imbalance) | IBM Plex Mono | `22` (22px/1) tabular | 600 | receipt surplus values, net-imbalance value |
| Large numeric (indicative price / $ saved) | IBM Plex Mono | `40` (40px/1) tabular | 600 | AUCT-03 indicative clearing price, WOW-06 `$X SAVED` punchline |
| CTA / export label | IBM Plex Mono | `13` (13px, `.14–.16em`, uppercase) | 700 | `EXPORT RECEIPT ↓`, `PARSE →` (shipped, unchanged) |
| Chart in-SVG price label (locked) | IBM Plex Mono | 15px (SVG literal, matches shipped) | 600 | VIZ-01 locked p\* price label (unchanged from shipped CrossingChart) |

---

## Color

The 60/30/10 split and its Theatre inversion (paper text on the `#0A0A0A` stage) are unchanged. Phase 9
adds **no new token**; it only extends the *reserved-for* lists of the existing accent (lime), signal
(red), and semantic order-side (buy/sell).

| Role | Value (token) | Usage |
|------|---------------|-------|
| Dominant (60%) | `#F4F1EA` `paper` | page background, all light surfaces, Theatre-stage text + strokes |
| Secondary (30%) | `#0A0A0A` `ink` | all 1px borders, text, dark CTA fills, the **proven** surplus emphasis, sim-panel dashed border |
| Accent (10%) | `#D6FB3C` `lime` | RESERVED — see list |
| Destructive / signal | `#E2231A` `red` | RESERVED — see list |
| Order side (semantic) | `#2B3AF2` `buy` · `#FF3D9A` `sell` | RESERVED — see list |
| Agent flame | `#FF6A1A` `flame` | SOLVER-AGENT-00 identity only (unchanged; no new Phase-9 use) |
| Redaction | `#0A0A0A`/`#262626` stripe (`bg-redact`) | unchanged; no new Phase-9 use |

**Accent (lime `#D6FB3C`) — reserved-for (NO new use added in Phase 9):**
- VIZ-01 chart **matched-region rectangle** + the **locked-clear reveal** — already lime in the shipped
  `CrossingChart` / `PriceReveal`; the assembling state renders this same matched region faintly and it
  solidifies at lock. No lime is introduced on any new panel. (The AUCT-04 surplus proof and the WOW-06
  `$ saved` punchline are deliberately **ink**, not lime — lime stays exclusively the clearing-reveal
  signal.)

**Signal red (`#E2231A`) — Phase-9 additions to the reserved list (semantic = loss / locked-clear rule):**
- VIZ-01 **locked p\*** rule + dropline + marker + price label (unchanged from shipped chart; appears only
  at close, never during assembly).
- AUCT-04 **surplus-vs-REFERENCE when negative** — a below-benchmark execution renders the value + `− bp`
  in red (the vs-LIMIT number can never be negative, so red never appears on the proven line).
- WOW-06 **simulated public-book `$ lost`** — the leakage figure (slippage / front-run) is the "bad"
  number and renders in red; Umbra's `$0 LEAKED` stays ink.

**Semantic order-side (`#2B3AF2` buy · `#FF3D9A` sell) — Phase-9 additions:**
- AUCT-01 order-type param context inherits the shipped side rule (limit input tinted by side; the
  descriptor's directional wording follows side). Unchanged mechanism.
- AUCT-03 **net-imbalance direction**: a buy-heavy imbalance (`+N`) renders in `buy` blue, sell-heavy
  (`−N`) in `sell` pink, balanced (`0`) in paper — reusing the existing buy/sell semantics.
- AUCT-04 receipt **fill side / signed fill qty** follows the shipped `FillCard` rule (buy blue / sell pink).

**Never** use lime or red for generic affordances. All Phase-9 CTAs/exports (`EXPORT RECEIPT ↓`,
order-type selection) are **ink/paper** (ink-bordered ghost `.umbra-ink-ghost`, or ink-underline active
state), matching the shipped SEAL ORDER / DOWNLOAD PROOF-PACK grammar.

---

## Per-Surface Layout & Composition Contract

Each surface is additive; the shipped host view is otherwise untouched.

### AUCT-01 — Order-Type Selector + Params → **02 Desk** (`DeskView.tsx` / `OrderTicket.tsx`)

A new **Order Type** selector inserted at the top of the structured ticket — **below** the shipped WOW-03
NL sub-block and **above** the side toggle — plus per-type param fields that show/hide beneath the shipped
Limit input. The shipped `SEAL ORDER` remains the single, mandatory confirmation; the per-round lock and
seal-wipe are byte-unchanged. **`load demo order` always loads a plain Limit** (§4).

- **Selector label:** "Order Type" (Inter `10` uppercase `.16em` opacity .55) + the shipped 1px-below
  rhythm.
- **Segmented control** (reuses the shipped tamper-mode / side-toggle grammar): four ghost-mono segments
  `LIMIT` · `NONCOMP` · `MAQ` · `COND` (IBM Plex Mono `9` `.16em` uppercase; active = **ink underline**,
  inactive = opacity .45; disabled when `ticketLocked`). Full names live in the descriptor, below.
- **Active-type descriptor** (Inter `13`/1.6 opacity .65, one line, `umbra-rise` on change):
  - Limit → "Sealed limit — fill at or better than your price."
  - Noncompetitive → "Fill at clear — take the uniform price, no limit."
  - MAQ / All-or-None → "Fills only if you get at least your minimum quantity."
  - Conditional → "Firms only inside your price band — else drops at clear."
- **Field show/hide per type** (all field labels Inter `10` uppercase `.14em` opacity .5; unit captions
  opacity .4):
  - **Limit** — side + qty (`44` mono) + limit (`44` mono, side-tinted). Unchanged shipped ticket.
  - **Noncompetitive** — side + qty; **the Limit input is replaced** by a static caption row `FILL AT
    CLEAR — NO LIMIT PRICE` (mono `9` `.16em` opacity .6) so the removed field reads as intentional.
  - **MAQ / All-or-None** — side + qty + limit + a **Min Acceptable Qty** param: mono `22` tabular input,
    **1px** ink underline (assist tier), unit "BONDX". Label "Min Acceptable Qty". (All-or-none = the
    special case min = qty; a `= FULL FILL ONLY` mono `9` hint appears when min == qty.)
  - **Conditional** — side + qty + limit + a **Firm-If band** param: mono `22` tabular input, **1px** ink
    underline, unit "USDCx / unit". Label is side-directional: **buy** → "Firm If Clears ≤", **sell** →
    "Firm If Clears ≥".
- **Validation copy** (Inter `13` opacity .7, shown inline under the offending field; non-blocking hint
  style, matching the shipped WOW-03 error tier):
  - MAQ: min > qty → "Minimum can't exceed your order size."
  - MAQ: min ≤ 0 → "Enter a minimum of at least 1."
  - Conditional: band ≤ 0 → "Enter a firm-if price above 0."
- **States:** the selector + params are disabled under `ticketLocked` exactly like the shipped inputs;
  `PARSE →` (WOW-03) still prefills side/qty/limit and always yields a **Limit** (NL assist does not switch
  the order type). No new motion beyond `umbra-rise` on the descriptor/param mount.

### AUCT-03 + VIZ-01 — Aggregate Indicative Panel + Live Crossing → **03 Theatre** (`TheatreView.tsx` / `CrossingChart.tsx`) — operator plane (:4100)

**(a) Indicative panel** — a compact sub-panel inside the shipped **running-stage right column**, inserted
**below** the `sealedOrderCount` row and **above** the CTAs (`Start 60s Window` / `Close & Solve`). It must
stay secondary so `ONE PRICE. / NO LEAKS.` and the reveal remain the climax.

- **Container:** 1px **paper-at-.28-opacity** border on the dark stage (matches the shipped axis-stroke
  `strokeOpacity .5` inverted-border grammar — paper token, reduced opacity; not a new color), inner
  padding `~16px` / `22`, `marginTop: 18`.
- **Sub-label:** "Indicative · Aggregate Only" (Inter `10` uppercase `.16em` opacity .55, paper) + a mono
  `9` `.16em` opacity .5 note `AGGREGATE — NO ORDER LEAVES THE SOLVER`.
- **Three scalar rows** (each: mono `11` `.16em` uppercase opacity .6 caption above the value):
  1. **INDICATIVE** → the indicative clearing price, mono `40` tabular weight 600, paper. **Small-N
     guarded** (see below).
  2. **NET IMBALANCE** → `Σbuy − Σsell` as a signed value, mono `22` tabular, with a directional caption
     `BUY-HEAVY` / `SELL-HEAVY` / `BALANCED`; value color follows sign — `+N` in `buy` blue, `−N` in
     `sell` pink, `0` in paper. Unit "BONDX".
  3. **EST. MATCHED** → estimated matched volume, mono `18` tabular, paper. Unit "BONDX".
- **Small-N privacy guard (visible, labeled state):** the **INDICATIVE price** is published only once there
  are **≥2 orders on the relevant (crossing) side**. Until then it renders as a **coarse band** (e.g.
  `≈ 100 BAND`, mono `22` opacity .8) with the caption `COARSE — PRIVACY GUARD (< 2 ORDERS ON A SIDE)`
  (mono `9` `.16em` opacity .55). This guard state is never silent — the label always tells the viewer why
  the exact price is withheld. (Net imbalance / est. matched remain aggregate counts.)
- **States:** hidden until the window is open with ≥1 sealed order; `offline` → the panel is omitted and
  the shipped `OFFLINE_CAPTION` still governs the stage. Live values refresh from the solver aggregate feed
  (extend `solver.ts` — scalars only).

**(b) Live crossing (VIZ-01)** — extend `CrossingChart` with an **assembling → locked** distinction:

- **Assembling (window open):** the step supply (ascending, `umbra-draw`, paper) + step demand (descending,
  dashed paper) curves **build as orders seal** (redraw as the aggregate curve grows). The lime matched
  region renders **faintly** (existing `fillOpacity ~.08–.16`). **No red p\* rule / dropline / marker /
  price label** — red is reserved for the LOCKED clear. Caption reads `ASSEMBLING — CURVE BUILDS AS ORDERS
  SEAL` (mono `11` `.16em` opacity .6) in place of the shipped `SUPPLY × DEMAND`.
- **Locked (at close):** the shipped solved-state chart is byte-unchanged — red p\* rule + dropline +
  `circle r5` marker at `crossingPoint(...)` `(296,160)` for §4 + the `15px` mono price label lock in; lime
  matched region solidifies; caption returns to `SUPPLY × DEMAND` and a mono `9` `.16em` red-square verdict
  `p* LOCKED @ {price}` appears. The lock reuses the shipped reveal beat (`umbra-draw` finalize); no new
  keyframe.

### AUCT-04 — Best-Ex / TCA Receipt → **05 Settlement** (`SettlementView.tsx`) — operator plane (:4100)

A **post-settle** receipts block (only when `phase === 'settled'`), inserted in the left column **below**
the DvP-legs / atomic-stamp / CTA area and the `RoundBrief`, above/beside the WOW-06 sim. One receipt per
participating desk (operator sees all three aggregate; the same receipt renders per-desk on `DeskView`
`FillCard` at executor discretion, showing only that desk's own row).

- **Block label:** "Best-Ex / TCA · per desk" (Inter `10` uppercase `.16em` opacity .55) + the 1px ink rule.
- **Per-desk receipt card** (1px **solid** ink border, inner padding `~16px` / `22`, `marginBottom 14`):
  - **Header row:** desk code (mono `13` `.16em` weight 600) + side chip + signed fill qty (mono `14`
    tabular, `buy` blue / `sell` pink per the shipped FillCard rule).
  - **Facts grid** (three captioned cells, mono `11` `.16em` opacity .6 caption → mono `14`/`18` tabular
    value): `CLEARING PRICE` = 100.00 · `YOUR LIMIT` = own limit · `REFERENCE` = the stub mid, with a mono
    `9` `.12em` bordered tag `REFERENCE — PRE-AUCTION MID (STUB)` beside it.
  - **Surplus — two DISTINCT rows (the point):**
    1. **Proven (vs LIMIT):** a solid **ink** square (`6–8px`) + caption `ON-LEDGER · SURPLUS ≥ 0` (mono
       `9` `.16em` ink) → value `+{surplus}` and `+{improvementVsLimitBp} bp`, mono `22` tabular weight
       600, ink. This is the structurally-non-negative, on-ledger proof — emphasized, never red.
    2. **Benchmark (vs REFERENCE):** a lighter row — 1px ink hairline rule above, caption `VS REFERENCE ·
       BENCHMARK (MAY BE NEGATIVE)` (mono `9` `.16em` opacity .55) → value + `{±improvementVsReferenceBp}
       bp`, mono `18` tabular; **positive → ink**, **negative → `#E2231A` red**. Deliberately lighter than
       the proven row so the two are never conflated.
- **Export affordance:** `EXPORT RECEIPT ↓` — **ink-bordered ghost** button (`.umbra-ink-ghost`; 1px ink,
  transparent, ink label, hover ink-fill / paper-text; mono `13`/700 `.14em`, padding `~15px 28px`),
  matching the shipped `DOWNLOAD PROOF-PACK ↓` grammar. Exports the receipt(s) (the same fields are already
  embedded in the WOW-05 proof-pack). Never red/lime.
- **States:** hidden pre-settle; `settled` → receipts render; `offline` → the shipped offline caption
  governs. Reduced-motion: instant.

### WOW-06 — Cost-of-Leakage Simulator → **05 Settlement** (`SettlementView.tsx`) — client-side

A **post-settle**, client-side illustrative panel below the AUCT-04 receipts. It runs the **same order
set** through a naive simulated public order book (sequential marketable execution → slippage / front-run
→ `$ lost`) beside Umbra's sealed uniform clear (`$0 leaked`), showing `$ saved`. It must be
**unmistakably a simulation**, never confused with the real on-ledger receipts above it.

- **Container:** 1px **DASHED** ink border (the real receipts above use **solid** 1px ink — the dashed
  border is the primary "not-ledger" signal), inner padding `22` / `24`.
- **Header:** sub-label "Cost of Leakage · Simulation" (Inter `10` uppercase `.16em` opacity .55) + a
  right-pushed tag `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` (mono `9` `.12em`, **1px ink** border,
  ink text, 3px 7px pad — ink, not red, since this is neutral-illustrative not adversarial).
- **Two columns** (each: mono `11` `.16em` opacity .6 caption → value):
  - **SIMULATED PUBLIC BOOK** → `${X} LOST` (mono `22` tabular, **`#E2231A` red** = the leakage) + sub-line
    `SLIPPAGE + FRONT-RUN` (mono `9` `.16em` opacity .55).
  - **UMBRA SEALED CLEAR** → `$0 LEAKED` (mono `22` tabular, **ink**) + sub-line `SEALED UNIFORM PRICE`.
- **Punchline:** `${X} SAVED VS A PUBLIC BOOK` — mono `40` tabular weight 600, **ink** (deliberately not
  lime; lime stays the clearing-reveal signal), `umbra-rise` on mount (reduced-motion → instant).
- **Disclaimer footnote** (Inter `13`/1.6 opacity .6): "Illustrative model — the same orders run through a
  naive public order book. No real venue; nothing here is on-ledger."
- **States:** hidden pre-settle; `settled` → renders from the settled preview (pure client-side lib, like
  `curve`/`balance`); no solver/ledger dependency for the sim math.

---

## Copywriting Contract

All new copy in the Umbra register (terse mono uppercase for machine/verdict/caption lines; Inter sentence
case for prose). Verbatim numbers stay on the §4 invariant ($100.00 / A=10 / B=8 / C=2).

| Element | Copy |
|---------|------|
| AUCT-01 selector label | Order Type |
| AUCT-01 segment labels | LIMIT · NONCOMP · MAQ · COND |
| AUCT-01 descriptor — Limit | Sealed limit — fill at or better than your price. |
| AUCT-01 descriptor — Noncompetitive | Fill at clear — take the uniform price, no limit. |
| AUCT-01 descriptor — MAQ | Fills only if you get at least your minimum quantity. |
| AUCT-01 descriptor — Conditional | Firms only inside your price band — else drops at clear. |
| AUCT-01 noncomp limit-replacement | FILL AT CLEAR — NO LIMIT PRICE |
| AUCT-01 MAQ param label | Min Acceptable Qty |
| AUCT-01 all-or-none hint (min == qty) | = FULL FILL ONLY |
| AUCT-01 conditional param label (buy / sell) | Firm If Clears ≤ · Firm If Clears ≥ |
| AUCT-01 validation — min > qty | Minimum can't exceed your order size. |
| AUCT-01 validation — min ≤ 0 | Enter a minimum of at least 1. |
| AUCT-01 validation — band ≤ 0 | Enter a firm-if price above 0. |
| AUCT-03 panel sub-label | Indicative · Aggregate Only |
| AUCT-03 aggregate note | AGGREGATE — NO ORDER LEAVES THE SOLVER |
| AUCT-03 scalar captions | INDICATIVE · NET IMBALANCE · EST. MATCHED |
| AUCT-03 imbalance direction | BUY-HEAVY · SELL-HEAVY · BALANCED |
| AUCT-03 small-N guard state | COARSE — PRIVACY GUARD (< 2 ORDERS ON A SIDE) |
| VIZ-01 assembling caption | ASSEMBLING — CURVE BUILDS AS ORDERS SEAL |
| VIZ-01 locked caption / verdict | SUPPLY × DEMAND · p* LOCKED @ 100.00 |
| AUCT-04 block label | Best-Ex / TCA · per desk |
| AUCT-04 fact captions | CLEARING PRICE · YOUR LIMIT · REFERENCE |
| AUCT-04 reference stub tag | REFERENCE — PRE-AUCTION MID (STUB) |
| AUCT-04 proven surplus caption | ON-LEDGER · SURPLUS ≥ 0 |
| AUCT-04 benchmark surplus caption | VS REFERENCE · BENCHMARK (MAY BE NEGATIVE) |
| AUCT-04 export CTA | EXPORT RECEIPT ↓ |
| WOW-06 panel sub-label | Cost of Leakage · Simulation |
| WOW-06 simulation tag | SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA |
| WOW-06 public-book column | SIMULATED PUBLIC BOOK · $X LOST · SLIPPAGE + FRONT-RUN |
| WOW-06 Umbra column | UMBRA SEALED CLEAR · $0 LEAKED · SEALED UNIFORM PRICE |
| WOW-06 punchline | $X SAVED VS A PUBLIC BOOK |
| WOW-06 disclaimer | Illustrative model — the same orders run through a naive public order book. No real venue; nothing here is on-ledger. |
| Offline caption (all solver-plane surfaces) | (shipped `OFFLINE_CAPTION` — reflects the live configured port :4100, unchanged) |

**Destructive / irreversible actions:** Phase 9 adds **no new irreversible on-ledger write**. AUCT-01 order
entry still commits only via the shipped single `SEAL ORDER` confirm (one order per round, unchanged);
`EXPORT RECEIPT ↓` and the WOW-06 sim are non-destructive, no confirm dialog. The only committing action
in this flow remains the shipped `SETTLE ATOMICALLY` (confirmation conveyed by the atomic stamp, per
06-UI-SPEC).

---

## Motion Contract

No new keyframes. Reuse only the shipped aliases: `umbra-rise` (AUCT-01 param/descriptor mount, WOW-06
`$ saved` punchline), `umbra-draw` (VIZ-01 assembling step curves + lock finalize), `umbra-pulse` (any
in-flight status square), and the shipped chart reveal beat for the p\* lock. Every motion honors
`prefers-reduced-motion: reduce` → collapse to instant, consistent with the shipped views (the receipt
numbers, indicative scalars, and sim figures are static content and are unaffected by motion prefs). The
three-desk → one-price → atomic-settle beats are untouched; new motion is subordinate and never competes
with the reveal or the simultaneous settle.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| (none) | — | not applicable — no shadcn, no third-party registries; all UI is hand-authored React/SVG against the binding comp |

---

## Component Inventory — Reuse vs New

| Component | Status | Notes |
|-----------|--------|-------|
| `DeskView`/`OrderTicket`, `TheatreView`, `CrossingChart`, `SettlementView` | **Extend, do not redesign** | Phase-9 surfaces compose in; shipped layout / reveal / simultaneous-settle beats untouched |
| Order-type selector + param fields (AUCT-01) | **NEW (in-place in `OrderTicket`)** | segmented `LIMIT·NONCOMP·MAQ·COND` + show/hide params; `load demo` stays plain Limit; `SEAL ORDER` still the single confirm |
| Indicative aggregate panel (AUCT-03) | **NEW** | Theatre running-stage right column; scalars-only, small-N labeled guard; solver aggregate feed (scalars never an order) |
| `CrossingChart` assembling↔locked (VIZ-01) | **EXTEND** | live curve assembles during window (no red p\*), red p\* LOCKS at close (shipped solved state unchanged) |
| Per-desk TCA receipt (AUCT-04) | **NEW** | 05 — post-settle; two-distinct-surplus (proven vs-limit ink · benchmark vs-reference may be red); `EXPORT RECEIPT ↓` ink-ghost |
| Cost-of-leakage sim (WOW-06) | **NEW** | 05 — client-side; dashed-border + `SIMULATION` tag (never confused with real receipts); public-book `$ lost` red, `$0 leaked` ink |
| Ink-ghost export button (`.umbra-ink-ghost`) | **Reuse pattern** | shipped WOW-05 control class; AUCT-04 `EXPORT RECEIPT ↓` reuses it verbatim |
| Segmented-toggle grammar (side toggle / tamper mode) | **Reuse pattern** | mono `9` `.16em`, active = ink underline — AUCT-01 order-type selector reuses it |
| Red-square verdict row | **Reuse pattern** | comp line 131 grammar — VIZ-01 `p* LOCKED @ 100.00` |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (FLAG resolved — 700 explicitly confined to shipped CTA grammar)
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-07-09
