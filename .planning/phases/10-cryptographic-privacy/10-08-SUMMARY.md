---
phase: 10-cryptographic-privacy
plan: 08
subsystem: web / desk-plane UI
tags: [CRYP-01, CRYP-02, commit-reveal, timelock, drand, bond-forfeit, provenance-grammar, react]

# Dependency graph
requires:
  - phase: 10-cryptographic-privacy (10-05)
    provides: regenerated web/daml.js bindings (Venue.CommitOrder, OrderCommitment.RevealOrder/ForfeitBond)
  - phase: 10-cryptographic-privacy (10-07)
    provides: web/src/solver.ts typed timelockEncrypt / SealMode crypto client
provides:
  - "web/src/components/OrderTicket.tsx: CRYP-01/02 commit → committed → timelocked → revealed / forfeited lifecycle on the desk's own JSON Ledger API v2 plane"
  - "client-side commitOf/serializeOrder mirror of daml/Umbra/Auction.daml (SubtleCrypto SHA-256, roundBankers-2 canonical Decimal)"
  - "three-tier T1/T2/T3 provenance grammar in-place: ProvTag / EvidenceSurface / Verdict / LockGlyph primitives"
affects: [10-09 ProofOfClearingPanel, 10-10 TimeMachineView (shared provenance grammar precedent)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "client-side commitment hashing mirrors the on-ledger commitOf(serializeOrder ‖ salt) exactly (roundBankers-2 half-even) so a live reveal re-check matches"
    - "salt + cleartext order kept in refs (never React state / DOM) — only the commitment hash is ever rendered (sealed-bid privacy)"
    - "provenance grammar: T1 solid ink (ON-LEDGER) / T2 solid ink + DRAND tag / T3 dashed + red OFFLINE-FALLBACK tag — guarantee AND limitation co-present"
    - "commit/reveal exercised on ctx.useLedger() (desk plane); timelock via solver.ts (operator plane, credential-free) — no operator token in the browser"

key-files:
  created: []
  modified:
    - web/src/components/OrderTicket.tsx

key-decisions:
  - "Client-side commitment mirror inlined in OrderTicket (plan restricts this wave to a single file; no new lib module) — damlShowDecimal reproduces `show (roundBankers 2 x)` (half-even, trailing-zeros trimmed to ≥1 dp)"
  - "commitOf collapses Daml's sha256(toHex(payload‖salt)) to SubtleCrypto SHA-256 over the UTF-8 bytes of payload‖salt (toHex→sha256(hex) is a no-op re-interpretation), lowercase hex — matches the ledger byte-for-byte"
  - "Reveal passes limit = damlShowDecimal(x) (canonical 2-dp), not the shipped onSeal toFixed(1), so the revealed value hashes identically to the commitment for non-integer prices"
  - "The bond is the desk's own first USDCx Asset holding (locked in operator custody by Venue.CommitOrder); BOND POSTED shows its quantity"
  - "onReveal distinguishes a genuine on-ledger rejection (HTTP status in the error) → red mismatch + verbatim, from a network/offline failure → honest offline note — NEVER a fabricated pass or a mislabelled mismatch (T-10-25)"
  - "FORFEITED is a desk-side display of the operator-plane ForfeitBond outcome (the browser holds no operator token to seize a bond) — triggered by the 'let the window close' demo affordance"
  - "Lifecycle UI advances even when the live ledger/solver is unreachable (build-gate) so all states are demonstrable; the real on-ledger commit→reveal→clear is end-of-phase human-verify"

requirements-completed: [CRYP-01, CRYP-02]

# Metrics
duration: ~35min
completed: 2026-07-09
tasks: 2
files: 1
---

# Phase 10 Plan 08: Order Ticket Commit-Reveal-Timelock Lifecycle Summary

**Wrapped the shipped Order Ticket seal flow in the CRYP-01/CRYP-02 commit → committed → timelocked → revealed / forfeited lifecycle on the desk's own JSON Ledger API v2 plane, with three-tier T1/T2/T3 honest-labeling, a byte-faithful client-side commitment mirror, and the §4 $100.00 invariant left intact.**

## What Was Built

`web/src/components/OrderTicket.tsx` — the shipped draft ticket (NL assist, Phase-9 order-type selector, side/qty/limit inputs, `load demo order`) is unchanged and now feeds a lifecycle state machine (`phase: draft → committed → timelocked → revealed / forfeited`):

- **DRAFT → COMMIT & POST BOND** — the single confirm is now the ink-fill `COMMIT & POST BOND` CTA (mono 13/700 `.14em`, `15px 28px`) with the verbatim bond+forfeit confirmation copy shown at commit time. On commit the component computes the sealed commitment client-side and exercises `Venue.CommitOrder` on the desk's OWN `ctx.useLedger()`, locking the desk's first USDCx `Asset` as the bond.
- **COMMITTED (T1 — solid ink + neutral `ON-LEDGER` tag)** — `COMMITMENT` hash rendered literally/middle-truncated on the ink evidence surface (`#0A0A0A`/`#F4F1EA`, mono 13 pre-wrap tabular, `22px 24px`, full value in title/aria-label); `BOND POSTED → {n} USDCx` (mono 18); the would-be order values under the `bg-redact` stripe with `CONTENTS SEALED — VISIBLE ONLY TO YOU AT REVEAL`; the self-check note. A passing commit is ink, never lime.
- **TIMELOCKED (T2 drand / T3 offline)** — calls `solver.timelockEncrypt('R1', payload)`. `mode:'drand'` → solid ink + ink tag `TIMELOCK · DRAND QUICKNET`, lock glyph (CSS square + 1px shackle stroke), `CIPHERTEXT` on the ink surface, `DRAND ROUND` (mono 22) + `TIME TO BEACON` countdown (mono 18, pulsing status square) + the undecryptable-until-close guarantee. `mode:'offline'` OR a SolverError → dashed border + red `OFFLINE FALLBACK · WEAKER THAN DRAND` tag + `LOCAL KEY RELEASED AT CLOSE — NO THRESHOLD GUARANTEE` + the verbatim offline prose (and the drand-error copy when no ciphertext returns).
- **REVEAL ORDER → + verdict** — ink-fill CTA + reveal-deadline countdown; exercises `OrderCommitment.RevealOrder` (desk plane). A match → phase `revealed`; the `umbra-wipe` beat lifts the seal, exposing the side-tinted order values (mono 44 buy/sell), an ink `COMMITMENT VERIFIED ON-LEDGER` verdict, and `BOND RETURNED · {n} USDCx`. A `reveal a different order (demo)` affordance drives the adversarial path → on an on-ledger rejection: red `COMMITMENT MISMATCH — REVEAL REJECTED` + the verbatim ledger rejection on the ink surface.
- **FORFEITED (loss — red verdict)** — the `let the window close (forfeit)` affordance → red `BOND FORFEITED — NO REVEAL BY CLOSE`, the struck/red bond amount, `BOND SLASHED TO OPERATOR POT`, and the deterrent prose.

Reused primitives added in-place (no new tokens): `ProvTag` (mono-9 `.12em` bordered ink/red tag), `EvidenceSurface` (the shipped Phase-8 ink pane), `Verdict` (comp-line-131 6px ink/red square + mono-9), `LockGlyph` (CSS/SVG). Client-side `serializeOrder` + `commitOf` (SubtleCrypto SHA-256) + `damlShowDecimal` (round-half-even 2-dp) faithfully mirror `daml/Umbra/Auction.daml`.

## Task Commits

| Task | Description | Commit |
| ---- | ----------- | ------ |
| 1 | Commit lifecycle — DRAFT → COMMIT & POST BOND → COMMITTED (T1) | 6997593 |
| 2 | TIMELOCKED (T2 drand / T3 offline) + REVEAL verdict + FORFEITED | 95d2a15 |

## Verification

- `cd web && npm run build` (tsc + vite) — succeeds.
- `cd web && npx tsc --noEmit` — clean.
- `cd web && npx vitest run` — 48 passed (7 files); no test touches OrderTicket, none broken.
- Grep-clean: no `@daml/react`, no `ANTHROPIC`, no operator-token literal in code (only doc-comment references to operator custody + the `OPERATOR POT` display copy). Commit/reveal ride `ctx.useLedger()` (desk plane); timelock rides the credential-free `solver.ts` client.
- No new tailwind token / font / size / palette / spacing / keyframe — only shipped classes (`bg-redact`, `bg-redact-wipe`, `animate-umbra-{wipe,pulse,rise}`, `text-{9,10,13,14,18,22,44}`, `bg-ink`, `text-paper`) and existing color tokens.

## Deviations from Plan

None — plan executed as written. Two additive design decisions within the plan's grammar: (1) the commitment/serialization mirror is inlined in OrderTicket (the plan restricts this wave to the single file, so no new `lib/` module was created); (2) `LEDGER REJECTION` caption + an honest `REVEAL RUNS ON THE LIVE LEDGER` offline note were added so a network failure is never mislabelled as a commitment mismatch (T-10-25 honesty).

## Deferred / Human-Verify (live stack — per plan's explicit deferral)

The automated gate is build/tsc/vitest only; anything needing the live running stack (Canton LocalNet :3975 + solver :4100) is deferred to end-of-phase human-verify:

- **Live on-ledger commit → timelock → reveal → clear** at $100.00 (§4 A=10/B=8/C=2) — the wiring is correct-by-construction (client commitment mirrors the on-ledger `commitOf(serializeOrder ‖ salt)`), but a real ledger is required to observe the happy REVEALED path and the T2 real-drand ciphertext.
- **Verbatim ledger rejection text** — the v2 shim (`web/src/ledger/v2react.tsx`, out of this plan's single-file scope) currently surfaces `"…HTTP 400"` rather than the full `commitment mismatch` assertion body. The mismatch path renders whatever the shim returns verbatim (never summarized); surfacing the full assertion text is a shim enhancement for a later plan.
- **Real bond amount / custody** on a seeded ledger — BOND POSTED derives from the desk's live USDCx `Asset`; verify against the seeded holdings on the running stack.

## Self-Check: PASSED

- `web/src/components/OrderTicket.tsx` — FOUND (modified).
- Commit `6997593` — FOUND. Commit `95d2a15` — FOUND.
- Author/committer `woshvad <woshvad@gmail.com>`, no Claude/Anthropic attribution — VERIFIED.
