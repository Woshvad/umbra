---
phase: 8
slug: demo-hardening
status: approved
reviewed_at: 2026-07-09
shadcn_initialized: false
preset: none
design_system: "Umbra design/ comp (binding) + web/tailwind.config.ts tokens (frozen from P3/P6, UI-07 = 24/24)"
baseline: "06-UI-SPEC.md (approved binding contract) + 07-UI-SPEC.md (100% comp fidelity) + Umbra design/Umbra.dc.html (ground truth)"
created: 2026-07-09
---

# Phase 8 — UI Design Contract (Demo Hardening — WOW-01..05)

> **This is an ADDITIVE contract.** The full design system is already locked in `06-UI-SPEC.md`
> (approved 6/6), refined to **100% comp fidelity in `07-UI-SPEC.md` (UI-07 = 24/24)**, and grounded in
> the binding comp `Umbra design/Umbra.dc.html`. Phase 8 introduces **no** new tokens, fonts, type
> sizes, palette entries, or keyframes. Every Phase-8 surface is a **new control/panel composed onto an
> existing shipped view** and must be visually **indistinguishable** from the surrounding system —
> reusing the exact `tailwind.config.ts` tokens, the section-marker rhythm, the ink-panel/redaction
> motifs, and the established mono/display/body grammar.
>
> **Governing rule (inherited from UI-07):** where any literal here appears to differ from the binding
> comp, the comp wins. The five numbered views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent ·
> 05 Settlement) are **not redesigned** — Phase 8 adds surfaces *within* them without disturbing the
> shipped layout, the money-shot reveal, or the simultaneous-settle beat.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — binding hand-authored comp; no shadcn (`components.json` absent by design; CLAUDE.md rule 2 makes the comp the pixel source of truth, so a component registry is intentionally not used) |
| Preset | not applicable |
| Component library | none (raw React 18 + Tailwind 3.4 + inline `style` for exact comp values) |
| Icon library | none — every mark is a CSS/SVG primitive (squares, dots, arrows, redaction stripes, carets) |
| Font | Space Grotesk (display) · IBM Plex Mono (data/wire/verbatim, `tabular-nums`) · Inter (body/labels) — already wired in `web/index.html` |

**shadcn gate:** executed → **not applicable**. The project has an established, binding, hand-authored
design system; initializing shadcn would violate the 100%-comp-fidelity mandate. No registry, no
third-party blocks. Registry-safety vetting gate: not applicable.

---

## Reconciliation Notes (CONTEXT ↔ comp ↔ shipped code)

These resolve every Phase-8 gap by faithfully extending the existing system; executors must not deviate.

1. **Two data planes are preserved.** WOW-01 (raw peek) runs on the **per-party JSON Ledger API v2**
   plane using the *currently-selected desk's own token* from `web/src/tokens.json` / `web/src/ledger*`
   contexts — never an operator token in the browser. WOW-02/03/04 (parse, tamper, stream, brief) run
   on the **solver operator plane** via `web/src/solver.ts` (`VITE_SOLVER_URL`). The Anthropic key stays
   server-side; WOW-03's NL input calls the solver `/parse-order`, never Anthropic directly.
2. **Port drift note (v2 stack).** The current stack runs JSON Ledger API v2 on **:3975/:2975/:4975**
   and the solver on **:4100** (CONTEXT / MEMORY), whereas the shipped offline caption literal reads
   `:4000`. Any port shown in UI copy (offline captions, WOW-01 request URL) MUST reflect the live
   configured port, not the frozen `:4000` literal. Do not hard-code a second port — read the app's
   existing config.
3. **The credibility is the raw wire, not a badge.** WOW-01's request/response and WOW-02's on-ledger
   rejection are rendered **verbatim** in IBM Plex Mono on the ink "evidence" surface
   (`#0A0A0A` bg / `#F4F1EA` text, `white-space:pre-wrap`, `tabular-nums`) — the same ink-panel treatment
   as `AgentRationale`. No styled success/failure badge substitutes for the actual JSON / error string.
4. **Redaction/verdict grammar is reused verbatim.** Verdict + rejection lines reuse the comp's existing
   privacy motif (comp line 131): a **6×6px red `#E2231A` square + IBM Plex Mono 9px `.16em` uppercase
   `#E2231A`** row (e.g. `REDACTED — NOT VISIBLE TO YOU`). Phase-8 verdicts follow this exact form.
5. **WOW-04 changes data flow, not pixels.** The live-streamed rationale reuses the shipped
   `AgentRationale` ink panel + flame caret unchanged; only the *source* becomes an SSE token stream that
   appends live. If SSE is unavailable it falls back to the shipped single-shot 26ms/char typewriter.
6. **Adversarial ≠ new palette.** WOW-01/WOW-02 are adversarial demos but introduce **no new color**.
   They reuse `#E2231A` red (signal), the ink evidence surface, and the lime `#D6FB3C` only for the
   *correct* clear reveal. A clearly-labeled `DEMO · ADVERSARIAL` tag uses the comp's existing 9px
   bordered-tag styling (comp line 99 / the `SELECTED` tag grammar).

---

## Spacing Scale

Phase 8 uses the **binding-comp irregular literal scale** already exposed in `web/tailwind.config.ts`
(`spacing`) and used across all five views. Do **not** normalize to an 8-point grid (would break comp
fidelity — CLAUDE.md rule 2). This is the standing binding-comp exception, unchanged from P6/P7.

| Token | Value | Usage in Phase-8 surfaces |
|-------|-------|---------------------------|
| (raw) | 4px | verdict/tag micro-gaps, red-square → text gap (6px per comp line 131) |
| (raw) | 8px | field-label → input gap, SETTLED-dot → text |
| (raw) | 12px | evidence-panel label → panel, tag padding, competing-row padding |
| 14 | 14px | section-marker gap, NL-input → parse-CTA gap, result-row gap |
| 16 | 16px | evidence-panel inner padding-y, proposal-row padding-y |
| 22/24 | 22/24px | ink evidence-panel inner padding (`22px 24px`, matches AgentRationale) |
| 26/28/30 | 26–30px | sub-block margins inside the Order Ticket / Agent panels |
| 34 | 34px | CTA-row margin-top (matches shipped Settlement CTA) |
| 48 | 48px | page horizontal padding (every `<main>`, unchanged) |

**Page frame is unchanged:** every host view keeps its shipped `<main>` padding, section marker,
1px ink rule, and headline. Phase-8 panels insert **below** the existing content of their host view
(WOW-01 below the Privacy 3-up + closing paragraph; WOW-05/brief below the Settlement CTA), or **inline
within** an existing block (WOW-03 at the top of the Order Ticket; WOW-04 as a data-source swap inside
the shipped rationale panel). Exceptions: none beyond the irregular literal set above.

---

## Typography

**No new type sizes.** Every Phase-8 element maps to a size already declared in `tailwind.config.ts
fontSize`. Mono numerals/data always carry `font-variant-numeric: tabular-nums`. Two weights dominate,
per comp grammar: **400 (Inter labels/body)** and **600/700 (mono data + display)**.

| Role | Family | Size / LH | Weight | Where (Phase 8) |
|------|--------|-----------|--------|-----------------|
| Section / sub-block label | Inter | 10px / 1.2, `.14–.16em`, uppercase, opacity .5–.55 | 400 | "Adversarial · Try to Peek", "Natural Language", "Break the AI", "Round Brief · shareable" |
| Body / verdict prose | Inter | 13–14px / 1.6, opacity .65–.7 | 400 | NL placeholder help, brief prose, "The ledger — not the AI — is the backstop." |
| NL order input | Inter | 14px / 1.6 | 400 | WOW-03 plain-English input (borderless, 1px ink underline) |
| Verbatim wire / error text | IBM Plex Mono | 13px / 1.6, `white-space:pre-wrap`, tabular | 400 | WOW-01 raw request+response JSON; WOW-02 on-ledger rejection text |
| Evidence panel label caption | IBM Plex Mono | 11–12px / 1.4, `.12–.16em`, uppercase, opacity .6 | 600 | "REQUEST", "RESPONSE", "TAMPERED CLEAR", "CORRECT CLEAR" panel captions |
| Verdict / status line | IBM Plex Mono | 9px / 1, `.16em`, uppercase | 600 | red-square rows: "0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE", "REJECTED BY LEDGER", "VERIFIED · SETTLED @ 100.00" |
| Demo / verified tag | IBM Plex Mono | 9px / 1, `.12em`, uppercase, 1px border, 3px 7px pad | 600 | `DEMO · ADVERSARIAL` (red border/text), `VERIFIED · CLAUDE` (ink, shipped) |
| CTA / control label | IBM Plex Mono | 13–14px, `.14–.18em`, uppercase | 700 | ATTEMPT PEEK · PARSE → · FORCE A WRONG CLEAR · RUN CORRECT CLEAR · DOWNLOAD PROOF-PACK ↓ · COPY BRIEF |
| Small reveal (WOW-02 correct clear) | IBM Plex Mono | 34px / 1, tabular | 600 | inline "100.00" on lime when the correct clear settles (sub-reveal scale, not the 120px hero) |
| Rationale (live-streamed) | IBM Plex Mono | 15px / 1.7 | 400 | WOW-04 — unchanged panel; SSE tokens append live + flame caret |

---

## Color

The 60/30/10 split and its Theatre inversion are unchanged. Phase 8 adds **no new token**; it only
extends the *reserved-for* lists of the existing accent (lime) and signal (red), plus the ink evidence
surface.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F4F1EA` paper | page background, all light surfaces, Theatre/evidence text |
| Secondary (30%) | `#0A0A0A` ink | all 1px borders, text, dark CTA fills, **the ink "evidence" surface** (WOW-01 wire panes, WOW-02 rejection panel) |
| Accent (10%) | `#D6FB3C` lime | RESERVED — see list |
| Destructive / signal | `#E2231A` red | RESERVED — see list |
| Order side (semantic) | `#2B3AF2` buy · `#FF3D9A` sell | WOW-03 parsed side indicator + signed fill qty only (shipped rule) |
| Agent flame (semantic) | `#FF6A1A` flame | SOLVER-AGENT-00 identity only — WOW-04 live typewriter caret (unchanged); no new use |
| Redaction | `#0A0A0A`/`#262626` stripe (`bg-redact`) | unchanged; no new use in Phase 8 |

**Accent (lime `#D6FB3C`) — Phase-8 additions to the reserved list:**
- WOW-02 **correct-clear sub-reveal**: the inline `100.00` slab (lime bg, ink text) shown when the
  correct deterministic clear settles after the tampered attempt is rejected — the "after" of the
  before/after contrast. Uses the shipped reveal slab treatment at the 34px sub-reveal scale.
- WOW-05 **proof-pack PDF** clearing-price hero (rendered in the on-brand HTML→PDF, not the web view).

**Destructive / signal red (`#E2231A`) — Phase-8 additions to the reserved list:**
- WOW-01 **verdict row** — the "0 rival orders returned — privacy enforced at the wire" red-square line
  (reuses the comp `REDACTED` grammar); the 403/empty is proven, not decorated.
- WOW-02 **`REJECTED BY LEDGER`** red-square row above the verbatim rejection text; the `DEMO · ADVERSARIAL`
  tag border/text; the **FORCE A WRONG CLEAR** control (red 1px-border ghost button — red border + red
  label on transparent, hover red fill / paper text) to signal an adversarial action **without** competing
  with the reserved red-fill CLOSE & SOLVE CTA.

**Never** use lime or red for generic affordances. All Phase-8 non-adversarial CTAs
(ATTEMPT PEEK, PARSE →, RUN CORRECT CLEAR, DOWNLOAD PROOF-PACK, COPY BRIEF) are **ink/paper** (dark fill
or ink-bordered ghost), matching the shipped SEAL ORDER / VIEW SETTLEMENT grammar.

---

## Per-Surface Layout & Composition Contract

Each surface is additive; the shipped host view is otherwise untouched.

### WOW-01 — Try-to-Peek Adversarial Privacy Console → **01 Privacy** (`PrivacyView.tsx`)

New component `PeekConsole` (or equivalent), mounted **below** the shipped closing paragraph inside the
existing `paddingLeft:42px` content column — the blindness proof and the peek attempt sit together.
Composes as: section sub-label → target/rival selector → ATTEMPT PEEK CTA → two-pane wire evidence →
verdict row.

- **Sub-label:** "Adversarial · Try to Peek" (Inter 10px `.16em` uppercase opacity .55) + a 1px ink rule,
  matching the section-marker rhythm.
- **Target selector:** two ghost-mono toggles — rival **`Order`** and rival **`TradeConfirmation`**
  (mono 9px `.16em`, active = ink underline) — proving privacy is structural, not Order-specific
  (CONTEXT). Plus which rival desk to peek at (the two non-active desks; mono 11px chips).
- **Runs as the selected desk's own token, asking AS THE SELECTED DESK'S OWN PARTY:** a raw
  `POST /v2/events/events-by-contract-id` to the per-party JSON Ledger API v2 endpoint the app already
  uses, demanding a **rival's contract id** with `eventFormat.filtersByParty = { <OWN party>: { cumulative: [] } }`
  (`eventFormat` is mandatory — omitting it → 400 `MISSING_FIELD`). The ledger answers **404
  `CONTRACT_EVENTS_NOT_FOUND`** — "Contract events not found, or not visible." — because the asking party
  is not an informee. **⚠ MECHANISM DEVIATION — see the note below; this supersedes the original
  `POST /v2/state/active-contracts` filtered-to-the-RIVAL-party mechanism.**
  - **Out-of-band cid discovery (must be surfaced honestly):** the rival's cid is obtained by a separate
    `POST /v2/state/active-contracts` read issued with the **RIVAL's OWN token** for the rival's own party
    (a legitimate self-read; the demo bundle already carries all three desk tokens for the party switcher).
    This is a deliberate **gift to the attacker** and must be labeled as such in the REQUEST pane — never
    fabricate a cid. It strengthens the proof: we hand the attacker more than it could ever obtain and the
    ledger still refuses.
- **CTA:** `ATTEMPT PEEK` (ink bg / paper, mono 13px/700 `.16em`, padding 14px 26px). Non-destructive.
- **Two-pane wire evidence** (stacked or side-by-side; ink evidence surface `#0A0A0A`/`#F4F1EA`, IBM Plex
  Mono 13px/1.6 `pre-wrap` tabular, inner padding `22px 24px`, matching AgentRationale):
  - **REQUEST** pane caption (mono 11px `.16em` opacity .6) → the discovery preamble (what was handed to
    the attacker + the resulting cid), then verbatim `POST {liveJsonApiUrl}/v2/events/events-by-contract-id`,
    the `eventFormat` body (rival cid + the asking desk's OWN party), and
    `Authorization: Bearer {thisDesk}…` with the token **truncated/elided** (never render a full token).
  - **RESPONSE** pane caption → the verbatim raw response: the raw 404 `CONTRACT_EVENTS_NOT_FOUND` JSON
    body (or an empty `[]` / raw 403 body). No styled badge — the raw refusal *is* the evidence.
- **Verdict row:** red-square grammar (6px `#E2231A` square + mono 9px `.16em` `#E2231A`), e.g.
  `404 — LEDGER REFUSED THE READ · NOT AN INFORMEE`. **Only a conclusive privacy result earns the verdict
  row:** an unreachable node/CORS failure (T-08-02-NODE), an inconclusive wire error (400/500, or a 404 that
  is *not* the informee refusal), and "the rival has no live target contract yet" all render a plain note
  with **no** verdict — absence of a target is not a privacy proof, and an error must never masquerade as
  "privacy enforced".

> **⚠ MECHANISM DEVIATION (recorded 2026-07-15) — the visual contract above is UNCHANGED and remains
> binding; only the wire mechanism and the verdict SET changed.**
>
> **Originally specified:** a raw `POST /v2/state/active-contracts` filtered to the **RIVAL** party using
> the active desk's token — i.e. asking the ledger *as the rival* — expecting an empty `[]` or a 403.
>
> **Why it was replaced:** that mechanism tests **credential scoping** (can bankA's *token* reach bankB?),
> which is an **ops** property, not the Canton privacy guarantee. It is empirically broken on a
> shared-token network. On **LocalNet** each desk token is scoped to its own party → 403 → looks right. On
> **DevNet** all three desks share ONE m2m bearer (`validator-devnet-m2m`, user id 6) holding `readAs` on
> **every** party → the read **SUCCEEDS**, returning the rival's contracts → the console classifies a
> non-empty rival array as `LEAK — RIVAL CONTRACTS RETURNED · PRIVACY REGRESSION` and the money-shot panel
> renders a **FALSE red privacy-regression banner**.
>
> **What replaced it:** the **informee refusal**. Canton disclosure is **stakeholder/informee-based, not
> token-based** — a party is shown a contract only if it is a signatory/observer. Asking *as a
> non-stakeholder party* is refused **even when the token has full read rights on all parties**. This
> tests **ledger-enforced projection**, the actual guarantee, and it holds on both nets.
>
> Verified live against the FiveNorth DevNet sandbox, **same shared bearer for both calls**:
>
> | requestingParty | Result |
> |---|---|
> | bankA (rival, NOT a stakeholder) | **HTTP 404 `CONTRACT_EVENTS_NOT_FOUND`** — "Contract events not found, or not visible." |
> | bankB (the owner, control) | **HTTP 200** with the full `createdEvent` |
>
> **The nets converge.** Asking AS the peeking desk's OWN party means the token always permits the
> requesting party, so there is no 403 divergence: **LocalNet and DevNet return the same 404**. One proof,
> one verdict, both nets.
>
> **Honest limitation (must stay documented, do not overstate):** this proves the ledger will not disclose
> to a **non-stakeholder PARTY**. It does **NOT** prove one desk's **CREDENTIAL** cannot impersonate
> another — on DevNet a holder of the shared bearer could simply ask as bankB. Per-desk m2m clients remain
> the only fix for credential isolation. See `docs/DEVNET.md`.
>
> `VERDICT_FORBIDDEN` (403) is **retained byte-identical** and still classified as privacy-enforced, so a
> genuinely scoped-token deployment keeps its stronger verdict. LEAK detection is **unchanged and
> undiminished** — a 200 disclosure of the rival's `createdEvent` is still a loud regression banner.
- **States:** idle (panes empty w/ hint) · running (`ATTEMPTING…` mono, disabled CTA) · returned
  (panes + verdict) · self-check note ("your own order is still fully visible to you" — Inter 13px opacity .7).

### WOW-02 — Break the AI → **04 Solver Agent** (`AgentView.tsx`) operator plane (:4100)

Canonical home = the Agent view (the AI-trust / verify-don't-trust surface); a trigger MAY be mirrored on
Theatre at executor discretion, but the before/after contrast panel is specified once here. Mounted as a
self-contained, clearly-demo-labeled panel **below** the shipped proposal/rationale grid.

- **Panel header:** sub-label "Break the AI" (Inter 10px `.16em` uppercase opacity .55) + a
  `DEMO · ADVERSARIAL` tag (mono 9px `.12em`, 1px red border, red text, 3px 7px) pushed right — signals
  this is off the normal settle path and harmless (the atomic `Round.Clear` rejection changes nothing).
- **Tamper-mode toggle:** segmented control — **Wrong price** (primary) · **Over-fill (conservation)** —
  mono 9px `.16em`, active = ink underline. Proves the *ledger* is the backstop across two rejection reasons.
- **Control:** `FORCE A WRONG CLEAR` (red 1px-border ghost button, red label, transparent bg, hover red
  fill / paper text; mono 13px/700 `.14em`) → attempts the tampered `Round.Clear` via the solver.
- **Before/after contrast — two stacked result rows (the whole point):**
  1. **TAMPERED CLEAR → REJECTED.** Caption "TAMPERED CLEAR" (mono 11px `.16em` opacity .6) → red-square
     row `REJECTED BY LEDGER` → the **verbatim on-ledger rejection error** on the ink evidence surface
     (IBM Plex Mono 13px/1.6 `pre-wrap`). The raw error string is the credibility — never summarized.
  2. **CORRECT CLEAR → SETTLED.** Caption "CORRECT CLEAR" → runs the real deterministic clear (byte-unchanged
     settle path); shows the inline lime `100.00` sub-reveal (34px mono on lime slab, ink text) + a red-square
     row `VERIFIED · SETTLED @ 100.00`.
- **Verdict line:** "The ledger — not the AI — is the backstop." (Inter 13px/1.6 opacity .7).
- **States:** idle · attempting (`ATTEMPTING TAMPERED CLEAR…`) · rejected (row 1 populated) · corrected
  (row 2 populated). Reduced-motion: no slam on the sub-reveal, instant.

### WOW-03 — Natural-Language Order Entry → **02 Desk** (`DeskView.tsx` / `OrderTicket.tsx`)

A new NL sub-block inserted at the **top of the Order Ticket**, above the existing side toggle. It is an
*assist that pre-fills the existing structured ticket*; the shipped `SEAL ORDER` remains the single,
mandatory confirmation (never auto-submit — preserves desk authority + the one-order-per-round lock).

- **Sub-label:** "Natural Language · Describe your order" (Inter 10px `.14em` uppercase opacity .5).
- **Input:** single-line plain-English field, Inter 14px/1.6, borderless with a **1px** ink bottom rule
  (thinner than the structured 44px inputs' 2px, marking it as the assist tier), placeholder
  `e.g. buy up to 10 under 101`.
- **CTA:** `PARSE →` (ghost mono, ink text, 9–13px `.16em`) → calls solver `POST /parse-order` (:4100) via
  `solver.ts`. Server parses via Claude structured output, zod-validated, returns `{side, qty, limit}`.
- **On success:** the returned fields **pre-fill** the existing side toggle + 44px qty + 44px limit inputs;
  a mono 9px `.16em` opacity .6 note appears — `PROPOSED BY CLAUDE — REVIEW & SEAL`. The desk edits freely,
  then hits the existing SEAL ORDER.
- **States:** idle · parsing (`PARSING…` mono, disabled) · parsed (fields filled + note) · error (couldn't
  parse — see Copywriting). The Anthropic key never reaches the browser (reaffirmed).

### WOW-04 — Live-Streamed Rationale + Shareable Brief → **04 Agent** (stream) + **05 Settlement** (brief)

- **Live stream (data-source swap, no new pixels):** the shipped `AgentRationale` ink panel + flame caret
  are reused unchanged. The rationale source becomes an **SSE token stream** from the solver (Anthropic SDK
  streaming proxied as Server-Sent Events); tokens **append live** into the panel as they arrive, the flame
  caret riding the live insertion point. Reduced-motion → append per chunk without the per-char interval.
  **Graceful fallback:** if the stream is unavailable, fall back to the shipped single-shot string typed at
  26ms/char — identical appearance.
- **Shareable Round Brief → 05 Settlement (post-settle):** a new bordered block (1px ink) below the
  Settlement CTA / SETTLED confirmation. Sub-label "Round Brief · shareable"; body = the natural-language
  summary (clearing price, matched volume, aggregate per-desk outcomes, rationale) as Inter 14px/1.6 prose;
  two ghost-mono actions `COPY BRIEF` and `DOWNLOAD BRIEF ↓`. The same brief text is embedded into the
  WOW-05 proof-pack. Appears only when `phase === 'settled'`.

### WOW-05 — Download Proof-Pack → **05 Settlement** (`SettlementView.tsx`)

A one-click post-settle export affordance placed adjacent to the SETTLED confirmation (only when
`phase === 'settled'`; hidden pre-settle).

- **CTA:** `DOWNLOAD PROOF-PACK ↓` — **ink-bordered ghost** button (1px ink, transparent bg, ink label,
  hover ink fill / paper text; mono 13px/700 `.14em`, padding 15px 28px) — a secondary export, deliberately
  distinct from the primary ink-fill SETTLE ATOMICALLY and never red/lime.
- **Output — the on-brand PDF** (reuses the deck's Chrome `--headless --print-to-pdf` HTML→PDF pipeline).
  Layout is executor discretion **provided the binding brand tokens hold** (paper `#F4F1EA` · ink `#0A0A0A`
  · lime `#D6FB3C`; Space Grotesk / IBM Plex Mono / Inter) and it carries all four bundles: (1) **clearing
  proof** (lime `100.00` hero, matched `10`, §4 fills A=10/B=8/C=2), (2) **per-desk best-ex receipts**,
  (3) **finality record** (one atomic transaction, DvP legs A↔B 8@100 · A↔C 2@100), (4) **AI decision
  bundle** (model id, verified flag, rationale/brief). It must read like the deck (`docs/umbra-deck.html`).
- **States:** ready (post-settle) · preparing (`PREPARING PROOF-PACK…` mono, disabled) · done (download
  fires) · error (see Copywriting).

---

## Copywriting Contract

All new copy in the Umbra register (terse, mono uppercase for machine/verdict lines; Inter sentence case
for prose). Verbatim numbers stay on the §4 invariant.

| Element | Copy |
|---------|------|
| WOW-01 sub-label | Adversarial · Try to Peek |
| WOW-01 primary CTA | ATTEMPT PEEK |
| WOW-01 request caption / response caption | REQUEST · RESPONSE |
| WOW-01 verdict (404 — the shipped proof, both nets) | 404 — LEDGER REFUSED THE READ · NOT AN INFORMEE |
| WOW-01 verdict (empty) | 0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE |
| WOW-01 verdict (403 — retained, scoped-token deployments) | 403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL |
| WOW-01 verdict (leak — regression guard, must stay LOUD) | LEAK — RIVAL CONTRACTS RETURNED · PRIVACY REGRESSION |
| WOW-01 no-verdict cases (plain note, red-square row withheld) | node unreachable · inconclusive wire error (400/500, non-informee 404) · rival has no live target contract yet |
| WOW-01 self-check note | Your own order is still fully visible to you — privacy blinds rivals, not yourself. |
| WOW-01 empty/idle state | Pick a rival and a target, then attempt the peek. The raw JSON Ledger API v2 request and its response appear here — unedited. |
| WOW-02 sub-label / tag | Break the AI · `DEMO · ADVERSARIAL` |
| WOW-02 control | FORCE A WRONG CLEAR |
| WOW-02 tamper modes | Wrong price · Over-fill (conservation) |
| WOW-02 rejection row | REJECTED BY LEDGER |
| WOW-02 correct-clear row | VERIFIED · SETTLED @ 100.00 |
| WOW-02 verdict | The ledger — not the AI — is the backstop. |
| WOW-02 idle state | Force the solver to propose a wrong clear. `Round.Clear` re-verifies §8 on-ledger and rejects it — then the correct deterministic clear still settles at 100.00. |
| WOW-03 sub-label | Natural Language · Describe your order |
| WOW-03 input placeholder | e.g. buy up to 10 under 101 |
| WOW-03 CTA | PARSE → |
| WOW-03 parsed note | PROPOSED BY CLAUDE — REVIEW & SEAL |
| WOW-03 error state | Couldn't read that order. Try a plain instruction like "sell 8 at 99", or enter the fields directly. |
| WOW-04 brief label | Round Brief · shareable |
| WOW-04 brief actions | COPY BRIEF · DOWNLOAD BRIEF ↓ |
| WOW-04 stream fallback | (silent — falls back to the shipped single-shot rationale, no user-facing copy) |
| WOW-05 CTA | DOWNLOAD PROOF-PACK ↓ |
| WOW-05 preparing | PREPARING PROOF-PACK… |
| WOW-05 error state | Proof-pack couldn't be generated. Check the solver on the configured port and try again. |
| Offline caption (all solver-plane surfaces) | SOLVER OFFLINE — START THE SERVICE ON {live port} (must reflect :4100 on the v2 stack, not the frozen :4000 literal) |

**Destructive / adversarial actions:** WOW-02 `FORCE A WRONG CLEAR` is adversarial but **harmless** —
the atomic `Round.Clear` rejection changes nothing on-ledger — so it needs **no confirm dialog**; the
`DEMO · ADVERSARIAL` tag + the verbatim rejection text are the safety signal. WOW-03 parse and WOW-05
download are non-destructive. Phase 8 adds **no new irreversible on-ledger write** — the only committing
action remains the shipped `SETTLE ATOMICALLY` (confirmation conveyed by the atomic stamp, per 06-UI-SPEC).

---

## Motion Contract

No new keyframes. Reuse: `umbra-slam` (WOW-02 correct-clear sub-reveal), `umbra-pulse` (parsing/attempting/
preparing status squares), the shipped `AgentRationale` typewriter/`umbra-caret` (WOW-04 live stream).
Every motion honors `prefers-reduced-motion: reduce` → collapse to instant, consistent with the shipped
views (the WOW-01 wire panes and WOW-02 rejection text are static content and are unaffected by motion prefs).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| (none) | — | not applicable — no shadcn, no third-party registries; all UI is hand-authored React/SVG against the binding comp |

---

## Component Inventory — Reuse vs New

| Component | Status | Notes |
|-----------|--------|-------|
| `PrivacyView`, `DeskView`/`OrderTicket`, `TheatreView`, `AgentView`/`AgentRationale`, `SettlementView` | **Extend, do not redesign** | Phase-8 surfaces compose in; shipped layout/reveal/settle beats untouched |
| `PeekConsole` (WOW-01) | **NEW** | 01 — raw JSON Ledger API v2 peek + two-pane wire evidence + verdict; per-party token only |
| `BreakTheAiPanel` (WOW-02) | **NEW** | 04 — tamper control + before/after (verbatim rejection → correct clear); operator plane :4100 |
| NL sub-block in `OrderTicket` (WOW-03) | **NEW (in-place)** | 02 — plain-English input + `PARSE →` pre-fills the existing ticket; SEAL ORDER stays the confirm |
| `AgentRationale` SSE source (WOW-04) | **EXTEND** | 04 — swap single-shot string for live SSE token append; same panel/caret; graceful fallback |
| `RoundBrief` (WOW-04) | **NEW** | 05 — shareable NL summary block + copy/download; embedded into the proof-pack |
| `ProofPackButton` + on-brand HTML→PDF (WOW-05) | **NEW** | 05 — post-settle export; reuses the deck's Chrome print pipeline; binding brand tokens |
| Ink "evidence" surface | **Reuse pattern** | `#0A0A0A`/`#F4F1EA`, IBM Plex Mono 13px `pre-wrap` tabular, padding `22px 24px` — same as AgentRationale |
| Red-square verdict row | **Reuse pattern** | comp line 131 grammar (6px `#E2231A` square + mono 9px `.16em` red) |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
