---
phase: 08-demo-hardening
plan: 02
subsystem: web-frontend
tags: [WOW-01, privacy, json-ledger-api-v2, adversarial, peek]
requires:
  - "web/src/desks.ts httpBaseUrlFor + tokens (per-party plane)"
  - "web/src/ledger/v2react.tsx fetchAcs wire shape (v2 active-contracts)"
  - "web/src/components/AgentRationale.tsx ink evidence surface + reduced-motion pattern"
provides:
  - "web/src/lib/peek.ts — pure v2 rival-party request builder + empty/403 verdict classifier + bearer elider"
  - "web/src/components/PeekConsole.tsx — WOW-01 two-pane raw-wire evidence + red-square verdict"
  - "PrivacyView mount of <PeekConsole/> (adversarial peek beside the blindness proof)"
affects:
  - "web/src/views/PrivacyView.tsx (additive mount only; money-shot layout undisturbed)"
tech-stack:
  added: []
  patterns:
    - "Pure, DOM-free request/classify helper (unit-tested without a live ledger) — same seam as lib/balance, lib/curve, lib/solverParse"
    - "Per-party JSON Ledger API v2 raw peek: desk's OWN token + rival-party filter via httpBaseUrlFor(activeDesk)"
    - "Ink evidence surface reused verbatim; red-square verdict grammar (comp line 131); no new tokens/keyframes"
key-files:
  created:
    - "web/src/lib/peek.ts"
    - "web/src/lib/peek.test.ts"
    - "web/src/components/PeekConsole.tsx"
  modified:
    - "web/src/views/PrivacyView.tsx"
decisions:
  - "Peek wire body byte-mirrors fetchAcs ({ filter.filtersByParty[rival]={}, verbose:true, activeAtOffset }); template is client-filtered for display, never sent on the wire — matches the shipped ACS contract."
  - "Node/CORS fetch failure is rendered as a distinct 'could not reach node' note WITHOUT a red-square verdict, so an unreachable participant can never masquerade as the empty-privacy result (Pitfall 4 / T-08-02-NODE)."
  - "buildPeekRequest returns an elided authHeaderDisplay (Bearer <8chars>…); the full bearer is never in the body and never rendered (T-08-02-BEARER)."
metrics:
  duration: "~9 min"
  tasks: 2
  files: 4
  completed: "2026-07-09"
---

# Phase 8 Plan 02: WOW-01 Try-to-Peek Adversarial Privacy Console Summary

An adversarial "Try to Peek" console mounted on the Privacy money-shot view: authenticated as the currently-selected desk's OWN token, it fires a raw JSON Ledger API v2 `POST /v2/state/active-contracts` filtered to a RIVAL desk party for `Umbra.Auction:Order` (second target: `TradeConfirmation`) and renders the verbatim request + response (empty `[]` / raw 403) with a red-square verdict — privacy proven at the wire, not by a badge.

## What Was Built

### Task 1 — Pure peek helper (`web/src/lib/peek.ts`) + tests (TDD)
- `buildPeekRequest(base, thisDeskToken, rivalParty, template, activeAtOffset)` → `{ url, method:'POST', body, authHeaderDisplay, template }`. The body byte-mirrors `fetchAcs` (`filter.filtersByParty[rivalParty] = {}`, `verbose:true`, caller offset). The full token is **never** in the body — only an elided `authHeaderDisplay`.
- `classifyPeekResult(status, rows)` → UI-SPEC verdicts: empty `[]` → `0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE`; `403` → `403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL`; a non-empty rival array → a loud `LEAK … PRIVACY REGRESSION` guard so a real regression is unmissable.
- `elideBearer(token)` → `Bearer ${token.slice(0,8)}…` (never the full token).
- `filterRowsByTemplate` + `PEEK_TEMPLATES` (Order / TradeConfirmation) for client-side display filtering.
- Verdict copy strings exported as `VERDICT_EMPTY` / `VERDICT_FORBIDDEN`, byte-identical to 08-UI-SPEC Copywriting.
- `peek.test.ts`: 10 assertions — request URL/body shape, rival-party filter, token-never-in-body, elision, template-not-on-wire, empty→verdict, 403→verdict, leak guard, and template filter. Full RED→GREEN cycle (test committed failing, then implementation).

### Task 2 — `PeekConsole.tsx` + PrivacyView mount
- Panel taking `activeDesk: DeskKey`. Two target toggles (rival `Order` / `TradeConfirmation`, active = ink underline) + a rival-desk chooser (the two non-active desks from `DESKS`, mono 11px chips).
- On ATTEMPT PEEK: resolves `base = httpBaseUrlFor(activeDesk)` + `token = tokens[activeDesk].token` (this desk's OWN bearer), reads GET `${base}v2/state/ledger-end`, then POSTs `${base}v2/state/active-contracts` with the rival-party filter (built via `buildPeekRequest`).
- Two-pane wire evidence on the ink surface (`#0A0A0A`/`#F4F1EA`, IBM Plex Mono 13px, `pre-wrap`, padding `22px 24px` — same as AgentRationale): REQUEST (verbatim method+URL, elided `Authorization: Bearer …`, JSON body) and RESPONSE (verbatim raw `[]` / 403 body).
- Red-square verdict row (6px `#E2231A` square + mono 9px `.16em` red) from `classifyPeekResult`, shown only for a genuine privacy result. Self-check note ("Your own order is still fully visible to you — privacy blinds rivals, not yourself.").
- States: idle (panes show the hint copy) · running (`ATTEMPTING…`, disabled CTA, `umbra-pulse` square, honoring `prefersReducedMotion`) · returned (panes + verdict). No operator token, no `@daml` operator context, no `ANTHROPIC_API_KEY` path.
- Mounted `<PeekConsole activeDesk={activeDesk} />` below the shipped closing paragraph inside the existing `paddingLeft:42px` column; the 3-up grid, money-shot reveal, SealedRail, and VenueSpine are undisturbed.

## Verification

- `cd web && npx vitest run src/lib/peek.test.ts` → 10/10 green.
- `cd web && npm test` → 21/21 green (peek + balance + curve + solverParse).
- `cd web && npm run build` → `tsc --noEmit` clean + `vite build` clean (101 modules).
- No `:4000` literal in any of the four 08-02 files (grep-clean).
- No operator-token literal or `@daml` operator context in `PeekConsole.tsx` (the only "operator" hits are comments stating none is used).

**Deferred (phase gate, 08-VALIDATION Manual-Only):** live E2E against a running Canton LocalNet — with the stack up + seeded, select bankA and ATTEMPT PEEK at bankB's Order → observe empty `[]`/403 + the verdict line; repeat for TradeConfirmation. Not runnable headless here (hard constraint 7: do not boot the Dockerized LocalNet); automated gates are the vitest + build gates above.

## Deviations from Plan

**None** — plan executed as written. Minor discretionary detail (within plan latitude): the pure builder signature includes `activeAtOffset` (as the plan's behavior text required "the caller-supplied activeAtOffset") and returns two display-only extras (`authHeaderDisplay`, `template`) so the token/template stay off the wire body while still being renderable; a node/CORS failure is rendered as a distinct non-verdict note (Pitfall 4 hardening).

## Threat Model Compliance

- **T-08-02-PEEK** (mitigate): the participant returns `[]`/403 for the desk token — the console renders it verbatim as the mitigation proof.
- **T-08-02-OPTOK** (mitigate): only `tokens[activeDesk]` via `httpBaseUrlFor`; no operator token/context imported (grep-clean).
- **T-08-02-BEARER** (mitigate): `elideBearer` truncates; the full bearer is never in the body and never rendered.
- **T-08-02-NODE** (mitigate): reuses `httpBaseUrlFor(activeDesk)` so the query hits the desk's OWN node; a network/CORS error is surfaced distinctly and never masquerades as the empty-privacy result.

## Known Stubs

None. `PeekConsole` performs the real per-party v2 fetch against the live-configured node; there is no mocked data path. (Live behavior is gated on a running LocalNet, deferred to end-of-phase human verification.)

## Commits

- `4b26ba4` — test(08-02): add failing peek unit test for WOW-01 request/verdict helper
- `8061900` — feat(08-02): pure peek request-builder + verdict classifier for WOW-01
- `6a652d7` — feat(08-02): PeekConsole raw wire evidence + verdict, mounted on PrivacyView

## Self-Check: PASSED

All four source files and the SUMMARY exist on disk; all three commits (`4b26ba4`, `8061900`, `6a652d7`) are present in git history.
