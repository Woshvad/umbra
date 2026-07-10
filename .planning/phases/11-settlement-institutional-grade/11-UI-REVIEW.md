# Phase 11 — UI Review

**Audited:** 2026-07-10
**Baseline:** `11-UI-SPEC.md` (approved) + binding comp `Umbra design/Umbra.dc.html` (CLAUDE.md rule #2). Superseded lines 149/152/233/236 honored: sub-label `Batch/Instruction`, provenance `CN TOKEN STANDARD (CIP-0056)`.
**Screenshots:** not captured (no dev server on :3000/:5173/:8080 — static code audit against source + comp).
**Disposition:** ADVISORY / non-blocking.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All HARD honesty labels present verbatim; empty-state / guest-fill body copy diverges from the Copywriting Contract and the guest "window closed" variant is unimplemented. |
| 2. Visuals | 4/4 | Redaction motif, inverted operator node, and atomic-stamp finality grammar reproduced faithfully; clear focal hierarchy per surface. |
| 3. Color | 4/4 | Palette faithful; lime correctly absent from topology/QR/badges; red reserved for finality + honesty markers. Hardcoded hex (vs tokens) noted. |
| 4. Typography | 4/4 | Only existing `fontSize` tokens; weights limited to 400/600/700 (700 = display/wordmark only). No new size introduced. |
| 5. Spacing | 3/4 | Chrome padding matches shipped frame; topology headline margin `20px` vs spec `30px`; 7-tab Nav at `0 48px` risks horizontal crowding. |
| 6. Experience Design | 2/4 | State coverage strong (loading/empty/offline/settled/reject), but the `/join` mobile contract is violated: side-toggle + type segments fall below the 44px touch minimum, and mono-9 red honesty labels likely fail WCAG AA contrast. |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **`/join` touch targets below the 44px mobile contract (WARNING).** `OrderTicket` side toggle uses `padding:'10px 0'` (~36px, `OrderTicket.tsx:546`) and the order-type segments use `padding:'8px 0'` (~33px, `OrderTicket.tsx:643`); the `load demo order` / `PARSE →` / reveal-demo affordances are mono-9 text hit-areas. The spec (UI-SPEC:76, 227) assumed a `13px` side-toggle padding that the shipped component does not have. Impact: fat-finger mis-taps on the guest phone surface this phase explicitly ships. Fix: on the `/join` plane bump side/type button vertical padding to ≥`13px` (→≥44px) or wrap the reused controls in a mobile min-height, without shrinking the already-compliant `SEAL GUEST ORDER` (15px→~46px).

2. **Guest / topology empty-state copy diverges from the Copywriting Contract (WARNING).** `FillCard.tsx:27-31` renders the desk copy ("Seal your **order**, then run the auction…") not the guest contract line (UI-SPEC:147 "Seal your **bid**, then watch 03 Theatre run…"), and the guest "window closed" variant (UI-SPEC:148) is absent. `TopologyView.tsx:202-206` rewrites the empty body ("commit, reveal, clear, settle…") instead of the contracted UI-SPEC:137 text. Impact: contract drift on the exact strings sign-off is measured against. Fix: render the two guest-specific empty strings verbatim in the `/join` `FillCard` path and restore the topology empty body.

3. **Reduced-motion escape on the atomic stamp (WARNING).** `AtomicStamp.tsx:11` always applies `animate-umbra-stamp` (rotate/scale slam) with no `prefers-reduced-motion` gate, yet it is reused as the finality beat on BOTH `05 Settlement` and the new `07 Topology` diagram (`TopologyView.tsx:131`). The motion contract (UI-SPEC:267-272) requires all keyframes honor reduced-motion. Impact: motion-sensitive users get an ungated slam. Fix: gate the stamp class behind `prefersReducedMotion()` (render static red box when reduced), matching the pattern already used in `SettlementView`/`TopologyView`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

PASS — every HARD honesty label is present verbatim in the red-square mono-9 grammar:
- Topology `DEMO-REAL · SINGLE-OPERATOR LOCALNET` + limitation sub (`TopologyView.tsx:32-33,59`; `TopologyNode.tsx:25`).
- Guest `DEV SCOPED TOKEN — NO SECRET IN THE QR · REAL GUEST AUTH IS OIDC (PHASE 12)` (`JoinView.tsx:131`).
- QR host `DEV TOKEN — PRODUCTION GUEST AUTH IS OIDC (PHASE 12)` (`QrJoin.tsx:73`).
- Settlement provenance `CN TOKEN STANDARD (CIP-0056)` default, `DAML-FINANCE-PATTERN (IN-REPO)` fallback, literal "Daml Finance" never rendered (`SettlementView.tsx:227,271-281`) — honors superseded lines 152/233/236.
- DvP sub-label `Delivery vs Payment · Batch/Instruction · {N} instructions` + `ALLOCATED → APPROVED → SETTLED` finality (`DvpLegs.tsx:61,70`).
- COMP-01 verbatim reject surface heading + raw ledger text on the ink evidence surface (`JoinView.tsx:36-67`).

DEVIATIONS (score cap):
- `FillCard.tsx:27-31` guest empty copy is the desk variant, not UI-SPEC:147; "window closed" (UI-SPEC:148) unimplemented.
- `TopologyView.tsx:202-206` empty body rewritten vs UI-SPEC:137.
- CTA relabel `SEAL GUEST ORDER` correct (`JoinView.tsx:84`); primary settle button reads `Settle Atomically` (`SettlementView.tsx:338`) — acceptable (shipped grammar).

### Pillar 2: Visuals (4/4)

PASS — visual hierarchy and the phase's signature motifs are faithfully built:
- Cross-node privacy = the `bg-redact` stripe + `NOT VISIBLE`, contents never rendered for a rival (`TopologyNode.tsx:114-127`) — structural, not a render-guard.
- Inverted operator/synchronizer node (ink fill, paper text, count-only `SEES A COUNT · NEVER CONTENTS`) reuses the Theatre inverted-surface grammar (`TopologyNode.tsx:139-174`).
- Atomic finality spans the diagram via the reused `AtomicStamp` (`TopologyView.tsx:131`) — same red -4deg slam as `05 Settlement`.
- Decorative red squares are `aria-hidden`; QR carries a `title` (`QrJoin.tsx:57`). Clear per-surface focal points (54px topology headline, 40px `/join` headline).

Minor: Nav comment (`Nav.tsx:1-4`) is stale ("5 tabs") though 7 render — cosmetic/source hygiene, not user-facing.

### Pillar 3: Color (4/4)

PASS — 60/30/10 discipline holds:
- Paper `#F4F1EA` dominant, ink `#0A0A0A` borders/text/inverted operator node, red `#E2231A` for atomic edges (`TopologyView.tsx:80`), honesty-marker squares, and reject surface.
- Lime `#D6FB3C` correctly ABSENT from all topology node fills/edges, QR modules, and every honesty badge (grep of the audited files shows no lime token on these surfaces) — satisfies UI-SPEC:108,120.
- QR hard contrast rule met: ink modules on paper quiet-zone only (`QrJoin.tsx:51-59`, `fgColor=INK`/`bgColor=PAPER`).
- Guest active tint `rgba(214,251,60,.10)` matches PrivacyView (`DeskColumn.tsx:235`).

Note (not a deduction): every new surface hardcodes hex literals inline rather than the `tailwind.config.ts` named tokens. This is the established comp-bound pattern, but it means the token layer is bypassed — a future token change won't propagate. Consistency risk only.

### Pillar 4: Typography (4/4)

PASS — additive-discipline respected:
- Sizes drawn only from existing `fontSize{}` tokens (9/10/11/13/14/15/18/22/30/40/44/54). No new literal added (`tailwind.config.ts:25-49` unchanged for this phase).
- `text-15` on DvP leg party (`DvpLegs.tsx:89,101`) is the sanctioned "DvP leg party" token (tailwind.config:38).
- Weights confined to 400 (body/labels), 600 (mono data/tags), 700 (Space Grotesk display + `UMBRA` wordmark only, e.g. `JoinView.tsx:107,138`). No weight-500 introduced.
- Fonts: display / mono / body roles applied per contract (topology headline `font-display text-54 font-bold`, node codes `font-mono text-13 font-bold`).

### Pillar 5: Spacing (3/4)

PASS on the shipped frame — `07 Topology` reuses `padding:'30px 48px 64px'` main chrome and `24px 22px 26px` node-card padding (`TopologyView.tsx:166`; `TopologyNode.tsx:89`), and `/join` uses the mobile `16px` page padding + `max-width:480px` (`JoinView.tsx:103`).

DEVIATIONS (score cap):
- Topology headline margin `26px 0 20px` (`TopologyView.tsx:178`) vs the contracted `26px 0 30px` (UI-SPEC:168). Compensated by the following badge's own `0 0 30px`, so visually near-neutral, but off the literal.
- `Nav.tsx:31,47-48` now hosts 7 tabs at `padding:'0 48px'` with `marginRight:36px` per tab. At the shipped desktop width this may crowd or overflow the row; the comp's nav was 5 tabs. Recommend verifying at 1440px (was not renderable this audit) and reducing per-tab `marginRight` if it wraps.

### Pillar 6: Experience Design (2/4)

State coverage is genuinely strong: loading (`READING NODE TOPOLOGY…` pulse), empty, offline (`OFFLINE_CAPTION`), resident, and settled states on Topology (`TopologyView.tsx:186-220`); settling/settled + offline + empty on Settlement; COMP-01 verbatim reject that does NOT advance the lifecycle (`JoinView.tsx:88-89`, `OrderTicket.tsx:434-439`). Netting toggle carries `aria-pressed` (`SettlementView.tsx:294`). Atomic settle is confirm-less by design (contract-sanctioned).

GAPS (score cap — the phase's own mobile/a11y contract):
- **Touch targets < 44px on `/join`:** side toggle `padding:'10px 0'` ≈36px (`OrderTicket.tsx:546`), order-type segments `padding:'8px 0'` ≈33px (`OrderTicket.tsx:643`), plus mono-9 text affordances (`load demo order`, `PARSE →`, reveal-demo). UI-SPEC:76,227 asserted these already satisfied 44px — the shipped component does not. Real regression against the WOW-07 mobile contract.
- **Contrast:** honesty labels are `font-mono text-9` in red `#E2231A` on paper `#F4F1EA` (`JoinView.tsx:124-131`; `QrJoin.tsx:68-73`; `TopologyView.tsx:56-59`). At 9px, red-on-paper is below the WCAG AA 4.5:1 small-text threshold — the most important honesty text is the least legible. (Established grammar, but worth a size/weight or tone review for the mobile surface specifically.)
- **Reduced-motion:** `AtomicStamp.tsx:11` slam is ungated (see Top Fix #3).

---

## Registry Safety

Not applicable as a shadcn gate — `shadcn_initialized: false`, no `components.json`. The one npm UI dependency is `qrcode.react` (`QrJoin.tsx:13`), declared ISC / no-network / no install-telemetry per UI-SPEC:297 and the in-file legitimacy note (`QrJoin.tsx:8-9`). QR payload is asserted URL+roundId only, no token/secret (`QrJoin.tsx:33`, `buildJoinPayload`) — matches the "no secret in the QR" contract. Registry audit: 0 shadcn blocks; 1 npm dep, plan-gate-cleared, no flags.

---

## Files Audited

- `web/src/App.tsx`, `web/src/main.tsx` (the `/join` route branch)
- `web/src/views/TopologyView.tsx`, `web/src/views/JoinView.tsx`, `web/src/views/SettlementView.tsx`
- `web/src/components/TopologyNode.tsx`, `QrJoin.tsx`, `DvpLegs.tsx`, `Nav.tsx`, `OrderTicket.tsx`, `DeskColumn.tsx`, `AtomicStamp.tsx`, `FillCard.tsx`
- `web/tailwind.config.ts`, `web/src/index.css`
- Reference: `web/src/views/TimeMachineView.tsx` (RECONSTRUCTED badge grammar for consistency)
- Baseline: `11-UI-SPEC.md`, `Umbra design/Umbra.dc.html`
