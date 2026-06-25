---
phase: 03-privacy-proof-vertical-slice
verified: 2026-06-25T18:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 3: Privacy Proof (Vertical Slice) Verification Report

**Phase Goal:** Prove order/fill/holding privacy is structurally real at the API boundary + ship the 3-up Privacy money shot.
**Verified:** 2026-06-25T18:00:00Z
**Status:** passed — **the vertical slice (privacy → seeded round → live 3-up money shot) works end-to-end.**

## Goal Achievement

### Observable Truths

| # | Truth (success criteria) | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | Desk submits one sealed order via Venue.SubmitOrder; query as BankA returns BankA's order + ZERO of B/C; TradeConfirmation only its desk (CLEAR-01, PRIV-01, PRIV-03) | ✓ VERIFIED | `daml test` → `test_privacy_orders: ok` (symmetric), `test_privacy_confirmations: ok`. **LIVE WIRE:** `/v1/query` as bankA/bankB/bankC each returned exactly 1 order (its own), 0 rivals (`verify-privacy.mjs` PASS). |
| 2 | Pre-clear desks see only RoundStats.sealedOrderCount; Asset visible only owner+operator (PRIV-02, PRIV-04) | ✓ VERIFIED | `test_privacy_orders` asserts `query @RoundStats` count-only + `query @Asset` owner-scoped (operator sees all 5). Live center column reads count=3 via a desk token (no operator token). |
| 3 | Frontend authenticates per-party — privacy at the wire, not render logic (PRIV-05) | ✓ VERIFIED | 3 independent `createLedgerContext('bankA'/'bankB'/'bankC')`; each `DeskColumn` mounts its own `DamlLedger`+token; rival columns issue NO queries (honest redaction). `grep operator-token web/src` = none. Live wire isolation confirmed (truth #1). |
| 4 | Privacy view: 3 desk panels each with own credentials + center RoundStats count + redaction motif + party switcher + status indicator (UI-01, UI-03) | ✓ VERIFIED | **LIVE RENDER** (`daml start` + `npm run dev` + DOM/style inspection): BlueRock(active) shows its own §4 order (BUY 10 BONDX ≤101.0, hold 5000 USDCx) "VISIBLE ONLY TO YOU"; Meridian/Halward "REDACTED — NOT VISIBLE TO YOU"; center "VENUE SEES ONLY A COUNT — 03 SEALED ORDERS"; party switcher (BLUEROCK/MERIDIAN/HALWARD) + status "OPEN · 03 SEALED". Paper `#F4F1EA` + ink applied; redaction stripe EXACT (`repeating-linear-gradient(90deg,#0A0A0A 0 5px,#262626 …)`, 10×). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `daml/Umbra/Tests.daml` (privacy tests) | ✓ | `test_privacy_orders` + `test_privacy_confirmations`; `daml test` exit 0 (16 scripts) |
| `daml/Umbra/Setup.daml` `seedOpenRound` | ✓ | seeds Open Round + RoundStats{3} + 3 §4 orders; returns Parties → doubles as init-script + parties.json export |
| `scripts/mint-tokens.mjs` | ✓ | zero-dep `crypto` HS256 per-party JWTs from parties.json → web/src/tokens.json; operator token → gitignored scripts/.operator-token (NOT in browser) |
| `web/` app (Vite+React18+Tailwind3.4) | ✓ | `npm run build` exit 0; `@daml.js/umbra-0.1.0` codegen; renders live |
| `web/src/ledgerContexts.ts` | ✓ | 3 per-party `createLedgerContext` (the structural-privacy core) |
| `web/src/views/PrivacyView.tsx` + components | ✓ | 3-up grid, DeskColumn, VenueSpine count, redaction bars, shell (Header/Nav/PartySwitcher/StatusIndicator) per UI-SPEC |
| `scripts/verify-privacy.mjs` | ✓ | live per-party wire check; PASS |

**Artifacts:** 7/7 verified

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `daml start` init-script | full money-shot seed + parties.json | `seedOpenRound` | ✓ WIRED (one allocation pass; exported IDs match seeded orders) |
| each DeskColumn | JSON API :7575 | own `createLedgerContext` + desk token + Vite proxy | ✓ WIRED (live isolation proven) |
| center column | shared RoundStats count | desk token (observer=desks) | ✓ WIRED (no operator token in browser) |
| frontend Order query | ledger | package-id templateId from `@daml.js` bindings | ✓ WIRED (templates registered live) |

**Wiring:** 4/4 verified

## Requirements Coverage

| Requirement | Status |
|-------------|--------|
| CLEAR-01: one sealed order/round via Venue.SubmitOrder | ✓ SATISFIED |
| PRIV-01: query as BankA → own order, zero of B/C | ✓ SATISFIED (test + live wire) |
| PRIV-02: pre-clear count-only | ✓ SATISFIED |
| PRIV-03: TradeConfirmation only its desk | ✓ SATISFIED |
| PRIV-04: Asset only owner+operator | ✓ SATISFIED |
| PRIV-05: per-party wire auth (structural) | ✓ SATISFIED (3 contexts; live isolation) |
| UI-01: party switcher + round-status indicator | ✓ SATISFIED (live render) |
| UI-03: 3-up Privacy view + redaction motif | ✓ SATISFIED (live render) |

**Coverage:** 8/8 requirements satisfied

## Anti-Patterns Found

**None.** No render-time privacy filter (rival columns query nothing). No operator token / Anthropic key in the browser bundle.

**Anti-patterns:** 0 blockers, 0 warnings

## Gaps Closed During Verification (orchestrator gap closure, commit `5a534ed`)

The plans built a correct app that BUILT green but did not yet render against a live ledger. Live verification surfaced and fixed:
1. **Live seed:** `seedOpenRound` now returns `Parties` and is the `daml start` init-script → one allocation pass seeds the full money-shot state AND exports matching `parties.json`. (Previously `initialize` seeded no round; `seedOpenRound` re-allocated.)
2. **Vite dev CJS interop:** `optimizeDeps` now pre-bundles the deep `@daml.js/umbra-0.1.0/lib/Umbra/*/module` subpaths (transitive `require()`s were leaving named exports `undefined` → blank render).
3. **`@daml/ledger` URL:** `httpBaseUrl` is now the absolute same-origin URL (the constructor rejects a bare `'/'`).
4. **verify-privacy.mjs:** derives the package-id Order templateId from the bindings (the 2.10 JSON API doesn't resolve package-name template IDs).

## Human Verification Required

None blocking. Two NON-BLOCKING polish items deferred to Phase 7 (UI-07 = "design comp 100%"):
- **Web fonts** (Space Grotesk / IBM Plex Mono / Inter) are wired (Google Fonts `<link>` + tailwind families) but rendered as system fallback in the headless preview browser; a normal browser loads them. Typography 100%-fidelity is explicitly Phase 7.
- **PNG screenshot:** the live render is DOM+style-verified; the preview screenshot tool times out because the persistent ledger WebSocket keeps the page "busy" (a harness artifact, not an app defect). `npm run dev` → open :5173 shows the money shot.

## Verification Metadata

**Verification approach:** Goal-backward + firsthand `daml test`, live `daml start` + per-party `/v1/query` wire check, live `npm run dev` DOM/style inspection, `npm run build`
**Automated checks:** daml test exit 0 (16 scripts incl. 2 privacy); npm run build exit 0; verify-privacy.mjs PASS (per-party isolation); DOM render + redaction-stripe computed-style confirmed
**Human checks required:** 0 blocking (2 Phase-7 polish notes)
**Total verification time:** ~25 min (incl. gap closure)

---
*Verified: 2026-06-25T18:00:00Z*
*Verifier: Claude (orchestrator — firsthand ledger + live frontend evidence)*
