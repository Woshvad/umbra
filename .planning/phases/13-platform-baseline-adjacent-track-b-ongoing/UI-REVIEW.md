# Phase 13 — UI Review

**Audited:** 2026-07-10
**Baseline:** `13-UI-SPEC.md` (4 surfaces: S1 status page, S2 leaderboard, S3 RFQ, S4 issuance) + binding `Umbra design/` comp
**Screenshots:** not captured (code-only audit — no dev server probed; this is a static/code fidelity pass on 4 surfaces)
**Verdict:** Advisory / non-blocking. Pillars pass. High fidelity to the design contract.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every spec-mandated string is verbatim; all four honest-labeling tags present |
| 2. Visuals | 4/4 | Reuses shipped visuals (DvpLegs/AtomicStamp/CrossingChart/PriceReveal); clear hierarchy |
| 3. Color | 3/4 | Lime discipline perfectly held; one questionable red on the S3 *success* stamp |
| 4. Typography | 4/4 | Zero new `fontSize` tokens; all sizes declared in `tailwind.config.ts`; minor S1 headline family note |
| 5. Spacing | 4/4 | Comp literal set reused (`64/34/26/22/18/14/11`); no new spacing tokens |
| 6. Registry Safety | 4/4 | shadcn not initialized; zero third-party registries — gate not applicable, nothing introduced |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **S3 settled stamp renders in brand red `#E2231A`** (`RfqPanel.tsx:265-268`) — a *successful* atomic DvP ("SETTLED · ATOMIC — one DvP transaction") is drawn in the color the spec reserves for DOWN/DEGRADED/UNVERIFIED/reject signals (spec Color table, line 90). Semantically, red on a completion reads as an error. Fix: render the settled caption/dot in ink `#0A0A0A` (or reuse `AtomicStamp`'s own treatment) and keep red exclusively for the reject surface already present at `RfqPanel.tsx:371-372`.
2. **S1 status-page `h1` uses Space Grotesk where the spec pins panel section headings to Inter** (`status.ts:167-175`) — `h1.heading` ("UMBRA VENUE STATUS") is Space Grotesk 13px/600, but Typography line 77 states section headings use "Inter 13px/600 `.04em` uppercase". Low impact (the S1 headline family is not hard-pinned in the S1 block itself), but for cross-surface parity switch `h1.heading` to `'Inter'` or document the deviation. `letter-spacing` is also `.08em` vs the spec's `.04em`.
3. **S3 persistent honest tag copy is invented, not spec-listed** (`RfqPanel.tsx:42`) — `RFQ · 1×1 DVP — SAME ATOMIC SETTLEMENT` is a reasonable, on-message addition, but the spec's S3 honest-label contract (line 116) only mandates the per-quote `FIRM · SIGNED` tag and the reuse of the atomic-DvP stamp. Confirm the added persistent tag is intended; it is consistent with convention, so this is a note, not a defect.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Verbatim compliance across all four surfaces.
- S1: heading `UMBRA VENUE STATUS`, pill `OPERATIONAL/DEGRADED/OFFLINE`, rows `PHASE/LAST CLEAR/UPTIME/BUILD`, idle `NO ACTIVE ROUND` + body, unreachable `STATUS UNAVAILABLE — cannot reach the venue. Retrying…` — all present (`status.ts:58-62, 118, 230-239`). Honest tag `PUBLIC HEALTH · NO PRIVATE ORDER DATA` persistent in header (`status.ts:228`).
- S2: `NO COMPETING PROPOSALS YET` + exact body (`SolverLeaderboard.tsx:139-143`), `DETERMINISTIC §8 CLEAR — AUTHORITATIVE` (`:157`), persistent `LEADERBOARD · NARRATIVE — NOT A SETTLEMENT INPUT` (`:27`). Reuses `OFFLINE_CAPTION` (`:110`) rather than inventing offline copy — spec-compliant.
- S3: CTAs `REQUEST QUOTE` → `ACCEPT BEST QUOTE`, `AWAITING QUOTES…`, `NO QUOTES YET` + body, `FIRM · SIGNED`, `BEST` — all exact (`RfqPanel.tsx:34-42`). Reject rendered verbatim on ink surface (`:387`).
- S4: `PRIMARY ISSUANCE · UNIFORM-PRICE`, `LIFECYCLE`, `COUPON PAID`, `REDEEMED` (`IssuancePanel.tsx:38-44`).

### Pillar 2: Visuals (4/4)
Strong reuse discipline — no new settlement/reveal grammar invented.
- S3 settle reuses `DvpLegs` + `AtomicStamp` (`RfqPanel.tsx:259-260`); best quote emphasized via 1px-ink left rule + `BEST` marker (`:409, :418-422`).
- S4 reuses `CrossingChart` (`mode="assembling"`/`"locked"`) + `PriceReveal` (`IssuancePanel.tsx:220-228`); secondary ghost controls deliberately avoid the ink-fill primary grammar (`ghostStyle`, `:89-99`) — correct, since spec S4 has no primary CTA (line 107).
- S2 authoritative block visually separated by heavier `2px solid #0A0A0A` top rule (`SolverLeaderboard.tsx:155`); winner marked with ink left rule + weight, never lime (`:190, :205`).
- Hierarchy via size/weight/rule is consistent with shipped panels. No icon-only unlabelled controls (all glyphs are CSS shapes/text).

### Pillar 3: Color (3/4)
Lime discipline is the headline check and it **passes cleanly**:
- Grep confirms **no raw `#D6FB3C`/lime literal** in `SolverLeaderboard.tsx` or `RfqPanel.tsx` (only comments) — S2/S3 are ink+red only, exactly per spec line 95.
- S4 introduces **no raw lime of its own**; the single allowed lime use is delegated to the reused `PriceReveal` slab (`IssuancePanel.tsx:228`) — matches spec lines 92-94.
- S1 uses lime `#D6FB3C` solely as the operational up-dot (`status.ts:66, 186, 246`), red `#E2231A` for degraded/offline — the one sanctioned health-accent use.
- Buy `#2B3AF2` / Sell `#FF3D9A` toggle reused in S3 (`RfqPanel.tsx:313`).

**WARNING (−1):** S3 renders the *successful* settled stamp text + dot in red `#E2231A` (`RfqPanel.tsx:265-267`). The spec reserves red for down/degraded/unverified/reject signals — a completion in red is a color-semantics mismatch. Not a blocker (red is a declared brand color), but it dilutes the "red = problem" signal.

### Pillar 4: Typography (4/4)
- Every `text-*` size used across the three React panels (9/10/11/13/14/15/22/44) is declared in `tailwind.config.ts` (`:27-47`). **Zero new `fontSize` tokens.**
- Weights limited to the established 400/600/700. Data numerals use `font-mono` + `tabular-nums` throughout (row metrics `:255`, authoritative `:240`, quote price `:424`).
- S1 inlines identical literals (Space Grotesk 30px `-.02em` wordmark `:152-158`; mono 22px/700 tabular values `:202-207`) — consistent with the app header, as required for the build-step-free page.
- Minor: S1 `h1.heading` family/tracking diverges from the spec's Inter 13px/600 `.04em` panel-heading rule (see Top Fix 2).

### Pillar 5: Spacing (4/4)
- Panels reuse the comp irregular literal set: `marginTop:64px` section break (all three panels `:92/:236/:179`), `34px`/`30px`/`26px`/`22px`/`18px`/`14px`/`11px` gaps and paddings — all drawn from the spec Spacing Scale table (lines 49-59).
- Row padding `14px 0` matches the leaderboard/quote-row contract (`SolverLeaderboard.tsx:188`, `RfqPanel.tsx:407`). Badge padding `3px 7px` matches the established tag rhythm (`inkTag`/`tagStyle`).
- Inline-style px literals (rather than Tailwind `spacing` classes) are the established pattern for these bespoke panels and are explicitly blessed by the comp-binding exception (spec lines 46-61) — not flagged.

### Pillar 6: Registry Safety (4/4)
- `components.json` absent; shadcn intentionally not initialized (binding comp is the design system) — spec lines 41, 206-213.
- Zero third-party registries declared or used. All four surfaces are hand-rolled. Registry vetting gate **not applicable**.
- Credential-free discipline verified: grep of the three components finds **no** operator token, `@daml/react` context, or Anthropic key — only comments asserting the discipline. S1 is token-free static HTML with a public `/status` poll (`status.ts:266-284`). Aggregate-only `StatusJson` allow-list construction (`buildStatus`, `:45-55`) structurally prevents order/desk/limit/token leakage.

Registry audit: 0 third-party blocks, no flags.

---

## Files Audited
- `solver/src/status.ts` (S1 — public status page + `/status` JSON builder)
- `web/src/components/SolverLeaderboard.tsx` (S2 — competing-solvers leaderboard)
- `web/src/components/RfqPanel.tsx` (S3 — RFQ side-mode panel)
- `web/src/components/IssuancePanel.tsx` (S4 — issuance / coupon panel)
- `web/tailwind.config.ts` (token declarations — cross-checked for no new fontSize/spacing)
- `.planning/phases/13-platform-baseline-adjacent-track-b-ongoing/13-UI-SPEC.md` (design contract)
