---
phase: 11-settlement-institutional-grade
plan: 10
subsystem: frontend-guest-join
tags: [WOW-07, COMP-01, guest-desk, qr, mobile, privacy, honesty-label]

# Dependency graph
requires:
  - phase: 11-03
    provides: "GET /guest/bootstrap (/join?round=<id> deep-link, token-free) + guest-onboard.mjs (bankD scoped token → tokens.json)"
  - phase: 11-08
    provides: "ctxD (guest bankD isolated per-party context) + ctxFor.bankD + GUEST DeskMeta + OrderTicket bond→Holding/eligCid migration"
provides:
  - "web/src/lib/qrPayload.ts — buildJoinPayload(origin, roundId): /join URL + roundId only, no-secret (T-11-10-QR)"
  - "web/src/components/QrJoin.tsx — ink-on-paper SVG QR (qrcode.react QRCodeSVG) + HARD OIDC honesty label"
  - "web/src/views/JoinView.tsx — mobile /join guest desk on ctxD (SEAL GUEST ORDER + FillCard own-fill + COMP-01 verbatim reject)"
  - "OrderTicket commitLabel + onCommitRejected seam (guest CTA relabel + COMP-01 surfacing; desk plane unchanged)"
  - "web/src/main.tsx /join standalone route (router-lib-free)"
affects: [phase-11-verification]

# Tech tracking
tech-stack:
  added:
    - "qrcode.react@4.2.0 (ISC; SVG QRCodeSVG output; no install/postinstall/telemetry scripts) — installed --legacy-peer-deps"
  patterns:
    - "QR payload is URL+roundId ONLY — the scoped guest token is delivered server-side (tokens.json / D6), never in the QR bitmap or web source"
    - "Guest mobile surface reuses the desk-plane components verbatim on its own per-party ctx — privacy is structural, not a render filter"
    - "COMP-01 seam: OrderTicket surfaces a real HTTP ledger rejection verbatim + aborts the lifecycle; a bare network failure stays the deferred-to-live path"

key-files:
  created:
    - web/src/lib/qrPayload.ts
    - web/src/lib/qrPayload.test.ts
    - web/src/components/QrJoin.tsx
    - web/src/views/JoinView.tsx
  modified:
    - web/src/components/OrderTicket.tsx
    - web/src/views/TheatreView.tsx
    - web/src/main.tsx
    - web/package.json
    - web/package-lock.json

decisions:
  - "QR generator = qrcode.react@4.2.0 (orchestrator pre-approved; registry reachable so the vetted lib was used, NOT the hand-rolled SVG fallback). Package-legitimacy re-verified at install: ISC license, no install/postinstall/preinstall lifecycle scripts, no telemetry"
  - "OrderTicket got a minimal additive seam (commitLabel default 'COMMIT & POST BOND' + optional onCommitRejected) rather than a fork — the desk plane behavior is byte-unchanged (both props undefined there)"
  - "/join routing is router-lib-free: main.tsx branches on pathname==='/join' (or a ?join marker) to render JoinView standalone; the desktop App bundle for views 01–06 is unchanged"
  - "COMP-01 fires ONLY on a genuine on-ledger HTTP rejection (matched by /HTTP\\s+\\d/), never a client-side eligibility guard — honoring 'never a render-time guard'"

requirements-completed: [WOW-07, COMP-01]

# Metrics
duration: ~12min
tasks: 3
files: 9
completed: 2026-07-10
---

# Phase 11 Plan 10: Guest 4th-Desk QR → Mobile /join (WOW-07 / COMP-01) Summary

The 4th-desk guest join: a **no-secret QR** block on `03 Theatre` (encodes only the
`/join?round=<id>` URL — never the token) and a **mobile-first `/join` route** that reuses
the shipped `OrderTicket` + private `FillCard` on the guest's OWN scoped `ctxD` token, so
the guest submits one sealed bid and sees only its own fill (structural per-party privacy).
Both surfaces carry the HARD `DEV TOKEN — … OIDC (PHASE 12)` honesty label; an ineligible
on-ledger submit renders the raw ledger reject VERBATIM (COMP-01). `cd web && npm run build`
green; `cd web && npx vitest run` **77/77 green** (incl. the 4 new `qrPayload` tests).

## What Was Built

### Task 1 — Package-legitimacy gate (pre-approved, no code)
The plan's blocking `checkpoint:human-verify` for the QR dependency was **pre-approved by
the orchestrator** (delegated authority): use `qrcode.react@4.2.0`, fall back to a hand-rolled
zero-dep SVG encoder only if the npm registry is offline. The registry was reachable, so the
vetted library was installed. Re-verified at install time: **version 4.2.0, ISC license, no
`install`/`postinstall`/`preinstall` lifecycle scripts** (only `build`/`prepack`/`test`, which
never run on a consumer install), **no network/telemetry**. Verdict: legitimate → installed.

### Task 2 — `qrPayload.ts` (+test) + `QrJoin.tsx` (commit `ee808c1`)
- **`web/src/lib/qrPayload.ts`** — pure, DOM-free `buildJoinPayload(origin, roundId)` →
  `${origin}/join?round=<encoded id>`; trims trailing slashes; the roundId is the only
  dynamic value. **Never** emits a token/secret (T-11-10-QR).
- **`qrPayload.test.ts` (4 tests)** — asserts the payload contains `/join` + the round id,
  trims a trailing slash, url-encodes the round id, and (the no-secret assertion) **NEVER**
  contains an `eyJ` (JWT), `bearer`, `token`, or `jwt` substring across several round ids.
- **`QrJoin.tsx`** — renders `QRCodeSVG` (an `<svg>`, not `<img>`) of the payload with **ink
  `#0A0A0A` modules on a paper `#F4F1EA` quiet-zone** (`level="M"`, `marginSize={2}`), no
  external fetch. Adds the `SCAN TO JOIN AS A 4TH DESK` heading, the sub-caption, and the HARD
  `DEV TOKEN — PRODUCTION GUEST AUTH IS OIDC (PHASE 12)` label in the red-square mono-9 grammar.
- `qrcode.react@4.2.0` added to `web/package.json` (installed `--legacy-peer-deps`, the same
  peer-dep convention as `@daml/react`).

### Task 3 — `JoinView.tsx` + Theatre QR host + `/join` route (commit `e45ee13`)
- **`JoinView.tsx`** — mobile-first single column (`max-width:480px`, 16px padding), minimal
  chrome (`UMBRA · GUEST` row + `DESK D · GUEST` tag + the HARD `DEV SCOPED TOKEN — NO SECRET
  IN THE QR · REAL GUEST AUTH IS OIDC (PHASE 12)` label), headline `JOIN THE DARK.` (`text-40`).
  The body mounts inside **`ctxD.DamlLedger` with the guest's own bankD token** (per-party plane,
  identical to A/B/C — every hook reads only the guest's own contracts), reusing `OrderTicket`
  (CTA relabeled **`SEAL GUEST ORDER`**; one-per-round lock + seal-wipe unchanged; `onParse`
  never auto-seals) and the private `FillCard` (`YOUR FILL` / `Visible only to you`).
- **COMP-01** — a new `onCommitRejected` seam on `OrderTicket` surfaces a genuine on-ledger
  HTTP rejection VERBATIM (aborting the lifecycle, not advancing to committed); `JoinView`
  renders it on a 1px-ink evidence surface with the heading `SUBMISSION REJECTED — NOT ELIGIBLE`
  + the raw `assertMsg` text + the stub sub-caption. **Never a render-time guard.**
- **`TheatreView.tsx`** — the `QrJoin` host block is placed BELOW the dark stage `<div>` (on the
  paper `<main>`), so it does not disturb the shipped countdown/reveal beat; it receives the
  Theatre `roundId`.
- **`main.tsx`** — branches on `pathname === '/join'` (or a `?join` marker) to render `JoinView`
  standalone (no desktop `Header`/`Nav`); the desktop `App` bundle for views 01–06 is unchanged.

## Verification

| Check | Result |
|-------|--------|
| `cd web && npx vitest run qrPayload` | ✅ 4/4 green |
| `cd web && npm run build` (tsc --noEmit && vite build) | ✅ green (after each task) |
| `cd web && npx vitest run` (full suite) | ✅ **77/77 green** (11 files) |
| `grep -c "SEAL GUEST ORDER" web/src/views/JoinView.tsx` | 2 (prop + comment) |
| `grep -c "SUBMISSION REJECTED — NOT ELIGIBLE" web/src/views/JoinView.tsx` | 1 |
| QrJoin contains `OIDC` | ✅ (honesty label) |
| qrcode.react@4.2.0 install scripts | ✅ none (ISC, no postinstall/telemetry) |
| Commit authorship | ✅ `woshvad <woshvad@gmail.com>`, NO Claude/AI attribution |

## Deviations from Plan

**None that change intent.** One minimal additive seam was required to reuse `OrderTicket`:

### 1. [Rule 3 — Blocking] OrderTicket CTA-relabel + COMP-01 rejection seam
- **Found during:** Task 3. The plan mandates reusing `OrderTicket` with the CTA relabeled
  `SEAL GUEST ORDER` and a VERBATIM COMP-01 reject — but the shipped `OrderTicket` hardcoded
  the CTA (`COMMIT & POST BOND`) and **swallowed** all commit errors in a bare `catch {}`.
- **Fix:** added two OPTIONAL props — `commitLabel` (default `'COMMIT & POST BOND'`) and
  `onCommitRejected(msg)`. The commit catch now distinguishes a real ledger rejection
  (`/HTTP\s+\d/`) from a bare network failure; only the former is surfaced (when the caller
  opted in) and aborts the lifecycle. The desk plane passes neither prop → **behavior is
  byte-unchanged** (proven by the full 77/77 suite staying green).
- **Files:** `web/src/components/OrderTicket.tsx`. **Commit:** `e45ee13`.

## Threat Surface

All plan `<threat_model>` mitigations are implemented:
- **T-11-10-QR** (guest token in QR) — `buildJoinPayload` is URL+roundId only; `qrPayload.test`
  proves no `eyJ`/`bearer`/`token`/`jwt` substring; `QrJoin` encodes only that payload.
- **T-11-10-PRIV** (guest sees rival contents) — `JoinView` mounts on `ctxD` (the guest's own
  token); every hook reads only the guest's own contracts. Structural, not a filter.
- **T-11-10-COMP** (ineligible guest submit) — the on-ledger reject renders VERBATIM; there is
  no client-side eligibility guard.
- **T-11-10-AUTH** (over-claiming prod auth) — the HARD `DEV TOKEN — … OIDC (PHASE 12)` label
  is on both the Theatre QR host and `/join` (non-removable on-screen).
- **T-11-10-SC** (supply chain) — `qrcode.react@4.2.0` cleared the package-legitimacy gate
  (ISC, no install/telemetry scripts); the hand-rolled SVG fallback was not needed.

No new threat surface beyond the plan's register (QrJoin does no fetch; JoinView uses the
existing per-party plane; no new endpoint/auth path introduced).

## Known Stubs

None that block the plan's goal. The `bankD` token in `web/src/tokens.json` is an empty
placeholder (`""`) in the committed file — this is the intended D6 dev-token boundary (the
real scoped token is minted per-machine by `guest-onboard.mjs`, never committed), and it is
explicitly labeled on-screen (`DEV SCOPED TOKEN — NO SECRET IN THE QR …`). Not a UI stub.

## Honest Limitations / Boundaries (recorded — live-UAT)

- **QR bitmap scan-validation is a live-UAT item.** The build + unit tests prove the payload is
  token-free and that `QrJoin` renders an ink-on-paper `<svg>`; scanning the code with a real
  phone against a booted stack (LocalNet + solver + `guest-onboard.mjs` run) to reach `/join`
  and submit is an end-of-phase human-verify.
- **Live guest submit / COMP-01 firing needs a booted stack.** `JoinView`'s commit is best-effort
  on the guest's own plane; the verbatim COMP-01 reject fires only when a live ledger returns an
  HTTP rejection for an ineligible party. Offline (build-gate) the commit is deferred and no
  rejection surfaces — the seam is proven by the suite, the live firing is UAT.
- **bankD token must be minted before /join is live.** The committed `tokens.json` carries a
  `bankD` placeholder with an empty token; `guest-onboard.mjs` mints the real scoped token
  per-machine (never committed). `/join` renders offline but streams no contracts until then.

## Self-Check: PASSED

- Created files exist: `web/src/lib/qrPayload.ts`, `web/src/lib/qrPayload.test.ts`,
  `web/src/components/QrJoin.tsx`, `web/src/views/JoinView.tsx` — all FOUND.
- Commits exist: `ee808c1` (Task 2), `e45ee13` (Task 3) — both FOUND in git log.
- Suites green: `cd web && npx vitest run` 77/77; `cd web && npm run build` green.
- Commits authored + committed by `woshvad <woshvad@gmail.com>` with NO Claude/AI attribution.
