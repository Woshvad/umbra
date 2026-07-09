# Phase 8 — UI Review

**Audited:** 2026-07-09
**Baseline:** 08-UI-SPEC.md (additive contract) + Umbra design/Umbra.dc.html (binding comp) + web/tailwind.config.ts / web/src/index.css (frozen tokens)
**Screenshots:** not captured (static code audit only — per scope directive)
**Scope:** ONLY the five new Phase-8 surfaces (WOW-01..05) and how they compose into their shipped host views. The shipped v1 views were not re-audited wholesale.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every Copywriting-Contract string is present verbatim; offline caption is port-correct (:4100, dynamic). |
| 2. Visuals | 4/4 | Ink-evidence surface, red-square verdict, and DEMO tag reproduce the comp grammar exactly across all surfaces. |
| 3. Color | 4/4 | Zero invented hex in the five surfaces; lime/red reserved-list discipline held; CTA color grammar correct. |
| 4. Typography | 4/4 | All sizes map to `tailwind.config.ts fontSize`; mono data carries `tabular-nums`; two-weight grammar honored. |
| 5. Spacing | 3/4 | Two section-separation margins (`40px`, `56px`) fall outside the sanctioned irregular literal set. |
| 6. Experience Design | 4/4 | Full idle/running/error/offline/reduced-motion coverage; node-unreachable and settle-failure paths refuse to fake success. |

**Overall: 23/24**

Advisory / non-blocking retroactive review. Nothing here blocks shipping.

---

## Top 3 Priority Fixes

1. **Section-top margins `40px` (PeekConsole:153) and `56px` (BreakTheAiPanel:135) are off-scale** — the sanctioned spacing literals around that range are `34`, `42`, `48`, `64`; `40`/`56` are not in `tailwind.config.ts spacing` nor called out in the 08-UI-SPEC spacing table (which lists `34` for CTA-row and `26–30` for sub-block margins). Visual impact is negligible (vertical gap only, below existing content), but for strict scale-fidelity change to `42px`/`48px` and `48px`/`64px` respectively.
2. **WOW-01 verdict strings are delegated to `lib/peek` (`outcome.verdict`, PeekConsole:286) and not inline-verifiable** — the exact contract copy ("0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE" / "403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL") lives in `classifyPeekResult`. Confirm those literals match the Copywriting Contract byte-for-byte in `web/src/lib/peek.ts` (outside audited scope, so flagged, not scored down).
3. **`minHeight` differs between the two evidence surfaces** — PeekConsole INK_SURFACE uses `minHeight:96px` (PeekConsole:73) while BreakTheAiPanel uses `minHeight:84px` (BreakTheAiPanel:41). Both are reasonable, but for a truly indistinguishable ink-panel treatment consider a single shared constant. Cosmetic only.

---

## Detailed Findings

### (a) Design-comp drift — NONE FOUND

Every comp-grammar checkpoint reproduces the binding comp exactly:

- **Ink evidence surface** (comp/AgentRationale treatment): both `PeekConsole.INK_SURFACE` (L69-77) and `BreakTheAiPanel.INK_SURFACE` (L36-44) use `background:#0A0A0A`, `color:#F4F1EA`, `padding:22px 24px`, `lineHeight:1.6`, `whiteSpace:pre-wrap`, `tabular-nums`, mono 13px — matching AgentRationale's ink panel treatment as the contract requires.
- **Red-square verdict grammar** (comp line 131 = 6px `#E2231A` square + 6px gap + IBM Plex Mono 9px `.16em` uppercase `#E2231A`): reproduced exactly in `PeekConsole` L280-288 and in the shared `RedSquareRow` helper `BreakTheAiPanel` L47-59. Square is `6px×6px #E2231A`, gap `6px`, label `font-mono text-9 uppercase` `.16em` `color:#E2231A`. Verbatim match.
- **Tag grammar** (comp line 99 = mono 9px `.12em`, 1px border, 3px 7px pad): `DEMO · ADVERSARIAL` tag `BreakTheAiPanel` L144-155 uses `font-mono text-9 uppercase`, `letterSpacing:.12em`, `padding:3px 7px`, `border:1px solid #E2231A`, `color:#E2231A`. Matches the comp's `SELECTED`-tag grammar (red variant).
- **Lime sub-reveal**: the `100.00` slab (`BreakTheAiPanel` L276-288) is `font-mono text-34 tabular-nums`, `fontWeight:600`, `background:#D6FB3C`, `color:#0A0A0A`, `animate-umbra-slam` — the 34px sub-reveal scale on lime with ink text, exactly as the Typography/Color tables specify. Lime appears only on the correct-clear reveal.
- **Composition**: all five surfaces insert cleanly into their shipped frames without disturbing them — PeekConsole below the Privacy closing paragraph (PrivacyView:85), BreakTheAiPanel below the Agent grid (AgentView:68), the NL block at the top of the Order Ticket above the side toggle (OrderTicket:171-233), RoundBrief + ProofPackButton gated behind `settled` (SettlementView:226-231).

### (b) Invented tokens — NONE FOUND in the five audited surfaces

Cross-checked every hex literal in the five surfaces against the sanctioned palette (paper `#F4F1EA`, ink `#0A0A0A`, lime `#D6FB3C`, red `#E2231A`, buy `#2B3AF2`, sell `#FF3D9A`, flame `#FF6A1A`, redact `#262626`):

- **PeekConsole**: `#0A0A0A`, `#F4F1EA`, `#E2231A` only. ✓
- **BreakTheAiPanel**: `#0A0A0A`, `#F4F1EA`, `#E2231A`, `#D6FB3C` only. ✓ Plus `.break-ai-force` in `index.css` L23-32 (red ghost → hover red fill) using only `#E2231A`/`#F4F1EA`/transparent — sanctioned.
- **WOW-03 NL sub-block** (OrderTicket L171-233): no color literals — uses `#0A0A0A` underline via inline style; the `#2B3AF2/#FF3D9A/#fff` literals elsewhere in OrderTicket belong to the shipped side toggle / limit input, outside the WOW-03 scope.
- **AgentRationale (WOW-04 stream)**: unchanged ink panel `#0A0A0A/#F4F1EA` + flame caret `#FF6A1A` (semantic agent identity, sanctioned). `rgba(255,106,26,.08)` competing-row tint is shipped pre-Phase-8, out of scope.
- **RoundBrief / ProofPackButton**: `#0A0A0A`/`#F4F1EA` only, via `.umbra-ink-ghost` (index.css L37-46). No lime/red — matches WOW-04/05 Color rule. ✓

**Keyframes/animations**: only `animate-umbra-pulse`, `animate-umbra-slam`, `animate-umbra-caret`, `animate-umbra-wipe` are referenced — all defined in `tailwind.config.ts` (L88-101). No invented keyframe names. Motion Contract honored (no new keyframes).

### Pillar 1: Copywriting (4/4)
All Copywriting-Contract strings present verbatim: WOW-01 sub-label + idle hint + self-check note (PeekConsole L79-80, L159, L296); WOW-02 "Break the AI", `DEMO · ADVERSARIAL`, `FORCE A WRONG CLEAR`, tamper modes, `REJECTED BY LEDGER`, `VERIFIED · SETTLED @ 100.00`, verdict, idle hint (BreakTheAiPanel L61-67, L142-319); WOW-03 sub-label/placeholder/`PARSE →`/`PROPOSED BY CLAUDE — REVIEW & SEAL`/error copy (OrderTicket L178-231); WOW-04 "Round Brief · shareable"/`COPY BRIEF`/`DOWNLOAD BRIEF ↓` (RoundBrief L69, L88-96); WOW-05 CTA/`PREPARING PROOF-PACK…`/error (ProofPackButton L14-15, L64). **Offline caption is port-correct**: `OFFLINE_CAPTION` is built dynamically from `solverPort` defaulting to `4100` (solver.ts L20-33) — the `:4000` frozen literal is NOT present. Minor: WOW-01 verdict copy is delegated to `lib/peek` (see Top Fix #2).

### Pillar 2: Visuals (4/4)
Clear evidence-driven hierarchy on every surface: sub-label + 1px rule → controls → ink evidence panes → red-square verdict. Two-pane REQUEST/RESPONSE grid (PeekConsole L246-276) and the stacked before/after rows (BreakTheAiPanel L242-292) render the raw wire, not badges — exactly the "credibility is the raw wire" mandate (Reconciliation Note 3). Status squares pair with mono labels; no icon-only ambiguity. See (a) for grammar fidelity.

### Pillar 3: Color (4/4)
60/30/10 preserved; no new token. Lime reserved strictly to the WOW-02 correct-clear reveal. Red reserved to verdict rows, the DEMO tag, and the adversarial `FORCE A WRONG CLEAR` ghost — never a generic affordance. All non-adversarial CTAs are ink/paper (ATTEMPT PEEK ink-fill, RUN CORRECT CLEAR ink-fill, PARSE → ghost mono ink, COPY/DOWNLOAD/PROOF-PACK `.umbra-ink-ghost`). See (b) — zero invented hex.

### Pillar 4: Typography (4/4)
Every size maps to `tailwind.config.ts fontSize`: `text-9` (verdict/tag/parsed-note), `text-10` (sub-labels), `text-11` (rival chips), `text-12` (pane captions), `text-13` (mono wire/CTA/body), `text-14` (NL input/SEAL), `text-15` (rationale), `text-34` (lime sub-reveal), `text-44` (shipped qty/limit). Mono data uniformly carries `tabular-nums`. Two-weight grammar: Inter 400 labels/prose, mono 600/700 data/CTA. Letter-spacing matches per-role spec (`.16em` verdicts/CTAs, `.12em` tag, `.14em` field labels).

### Pillar 5: Spacing (3/4)
Predominantly faithful to the sanctioned irregular literal set and the AgentRationale-matched `22px 24px` evidence padding. **Deviations:** `margin:'40px 0 0'` (PeekConsole:153) and `margin:'56px 0 0'` (BreakTheAiPanel:135) are section-top separators that are not in `tailwind.config.ts spacing` (which has `34/42/48/64`) and not enumerated in the 08-UI-SPEC spacing table. Impact is vertical whitespace only, below existing content — no comp block is disturbed — but it is a strict-scale miss. Also cosmetic: evidence-panel `minHeight` differs (96px vs 84px). Recommend snapping the two margins to `42px`/`48px` (or `48`/`64`).

### Pillar 6: Experience Design (4/4)
State coverage is thorough and honest:
- **PeekConsole**: idle (hint in both panes) · running (`ATTEMPTING…`, disabled, pulse square) · returned (panes + verdict). Critically, a network/CORS/node-unreachable failure is rendered as a **distinct** node-unreachable note and the red-square verdict is **withheld** (L137-147, L279) so an unreachable node cannot masquerade as "privacy enforced" (T-08-02-NODE). Excellent adversarial-honesty.
- **BreakTheAiPanel**: idle · attempting · rejected · clearing · corrected, plus a **real settle-failure path** (L120-128, L297-312) that refuses to fabricate a `$100.00` SETTLED slab — surfacing the secret-free error instead. Offline caption gates the whole panel. Reduced-motion collapses the slam/pulse to instant.
- **WOW-03**: idle/parsing/parsed/error, Enter-to-parse, never auto-submits (SEAL ORDER stays the single confirm), lock respected.
- **WOW-04 stream**: live SSE append with graceful single-shot fallback if EventSource is absent or errors before any token (AgentRationale L76-118); reduced-motion friendly; source torn down on unmount. RoundBrief falls back to a client-composed brief if the solver is unreachable so the block never stalls.
- **WOW-05**: ready/preparing/done/error, PDF-or-HTML extension handling, no browser-held credential.

---

## Files Audited
- web/src/components/PeekConsole.tsx (WOW-01)
- web/src/components/BreakTheAiPanel.tsx (WOW-02)
- web/src/components/OrderTicket.tsx — NL sub-block only (WOW-03)
- web/src/components/AgentRationale.tsx — SSE additions (WOW-04)
- web/src/components/RoundBrief.tsx (WOW-04)
- web/src/components/ProofPackButton.tsx (WOW-05)
- web/src/views/PrivacyView.tsx / AgentView.tsx / SettlementView.tsx (host composition only)
- web/src/solver.ts (offline-caption port verification)
- Reference: web/tailwind.config.ts, web/src/index.css, Umbra design/Umbra.dc.html (comp lines 99, 131)
