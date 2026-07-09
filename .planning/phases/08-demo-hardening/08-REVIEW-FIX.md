---
phase: 08-demo-hardening
fixed_at: 2026-07-09T14:45:00Z
review: 08-REVIEW.md
status: partial
findings_in_scope: 11
fixed: 6
skipped: 5
iteration: 1
gates:
  solver_test: pass (83/83)
  solver_typecheck: pass (tsc --noEmit, exit 0)
  web_build: pass (tsc --noEmit && vite build, exit 0)
  web_test: pass (30/30)
attribution: clean (woshvad <woshvad@gmail.com>, no Claude/Anthropic trailers)
---

# Phase 8: Code Review Fix Report

Applied fixes for the 6 real defects from `08-REVIEW.md` (0 critical / 6 warning /
5 info). The 3 MUST-FIX demo bugs (WR-01, WR-02, WR-05) plus 3 clearly-correct
low-risk findings (WR-03, IN-02, IN-04) were fixed and committed atomically. The
remaining 5 findings were consciously skipped with reasons below. All automated
gates stay green; the §4 fixture still clears $100.00, the real `/settle` path is
byte-unchanged, and the secret-sweep property holds.

## Fixed (6)

### WR-01 — proof-pack `file://` URL malformed on Windows
`solver/src/proofpack.ts` · commit `5340acc`
Replaced string-concatenated `` `file://${htmlPath}` `` (which yields
`file://C:\...`, parsed by Chrome with `C:` as host + invalid backslashes → page
never loads → silent HTML-fallback on every PDF) with `pathToFileURL(htmlPath).href`
(correct `file:///C:/...`). The graceful `window.print()` HTML fallback is retained
as a fallback only. Test-safe: the proofpack spawn tests ignore the URL arg.

### WR-02 — `BreakTheAiPanel` fabricated SETTLED on a failed settle
`web/src/components/BreakTheAiPanel.tsx` · commit `b158360`
`runCorrectClear`'s catch swallowed any non-OFFLINE error and still set
`clearingPrice=100`/`phase='corrected'`, rendering the lime `100.00` slab and
`VERIFIED · SETTLED @ 100.00` for a settle that never happened. Now the corrected
reveal renders only on an actual success; a real failure surfaces the solver's
secret-free message in a distinct `CLEAR FAILED` ink-evidence surface (design
tokens only). OFFLINE keeps its graceful caption.

### WR-05 — `tamperClear` reported `rejected:true` on an ACCEPTED tamper
`solver/src/ledger.ts` · commit `de911ea`
The can't-happen branch (ledger accepted a tampered clear → round settled wrong)
returned `{ rejected: true, error: 'UNEXPECTED…' }`, masking the exact backstop
regression WOW-02 exists to detect. Restructured so the `catch` (a genuine ledger
rejection) is the ONLY path returning `rejected:true`; a resolved exercise now
throws a loud `SAFETY REGRESSION` error. `settle()` stays byte-unchanged; the
tamper still only ATTEMPTS a Clear. Test-safe: the tamper tests exercise only the
rejection path (mock always rejects a perturbed clear).

### WR-03 — SSE rationale route had no client-disconnect teardown
`solver/src/api.ts` · commit `a1476fe`
`/round/:id/rationale-stream` never registered `req.on('close')`, so a closed
EventSource left the handler writing deltas to a half-closed socket; the `void`
IIFE also had no `.catch` (an unexpected throw → unhandled rejection). Added an
`aborted` flag set on `req 'close'`, gated every write (`onDelta` + the
done/fallback finishers) on it, and added a `.catch` that ends the response.
Deferred (noted): threading an `AbortSignal` into `deps.streamRationale`/`agent.ts`
to tear down the upstream Anthropic stream — that is the reviewer's "ideal" and
expands scope across the AppDeps interface + agent.

### IN-02 — proof-pack temp HTML never cleaned up
`solver/src/proofpack.ts` · commit `8e44635`
`generateProofPackPdf` orphaned one `proof-<ts>.html` per request (newly relevant
now that WR-01 makes the PDF path succeed). Added an injectable best-effort deleter
(default: swallowing `unlinkSync`) invoked in a `finally` on every exit; the
returned PDF path / HTML string is unchanged.

### IN-04 — proof-pack finality legs rendered unformatted price
`solver/src/proofpack.ts` · commit `ff390ae`
Legs printed `8@100` while the rest of the screenshot-ready pack uses
`clearingPrice.toFixed(2)`; now `8@100.00`. Only the price half of IN-04 was taken;
desk-label normalization was intentionally left to keep the canonical pack output
stable. Test-safe (assertions use `toContain('8@100')`, a substring of `8@100.00`).

## Skipped (5)

### WR-04 — `OrderTicket` hardcodes `roundId: 'R1'` — SKIPPED (scope + money-shot risk)
A real latent decoupling bug, but NOT reachable in the canonical demo: `App.tsx`
defaults `roundId` to `R1` and every desk-submit path (`OrderTicket` AND
`DeskColumn`) already hardcodes `R1`, so the book is internally consistent. A proper
fix threads the active `roundId` from `App → DeskView → DeskBody → OrderTicket` and
`App → PrivacyView → DeskColumn` — 5 files across BOTH money-shot submit paths.
That is behavior-neutral at best (default stays `R1`) and money-shot-breaking at
worst, with zero benefit to the R1-only Phase-8 demo, which hard-constraint #3
protects. Deferred as a follow-up task.

### WR-06 — desk bearer tokens in the browser — SKIPPED (intended demo architecture)
The reviewer explicitly says "Keep for the local demo; before any hosted/production
build…". This is the intended dev/party-switcher architecture (correctly NOT an
operator or Anthropic credential), and the real fix (per-desk backend session /
httpOnly cookie / short-lived server-minted token) is a substantial architecture
change out of scope for demo-hardening. Flagged for a future hosted build.

### IN-01 — contradictory post-settle provenance flag — SKIPPED (stylistic-only)
Reviewer labels it "Presentational only." `api.test.ts:338` deliberately locks
`{ verified: true, source: 'deterministic-fallback' }`, and the web consumer
(`AgentProposal.tsx`) reads `preview.agent` from solve-preview, not the settled
body — so nothing renders this flag. A clean fix needs either a new
`source: 'settled'` union member (client type change) or churning a passing test,
for a cosmetic label with no functional/demo impact.

### IN-03 — `isEntrypoint` matches on basename only — SKIPPED (stylistic hardening)
Reviewer: "Low risk given the fixed layout." Switching to a full resolved-path /
`realpath` comparison risks Windows path/symlink edge cases on the service boot path
for a scenario that can't arise in the fixed demo layout. Risk outweighs benefit.

### IN-05 — duplicate `composeFallbackBrief` client/server — SKIPPED (scope)
Reviewer: "Acceptable as a deliberate offline fallback." Extracting a shared pure
module spans web + solver (and their build graphs); the duplication is an
intentional offline resilience seam. Deferred.

## Gates (post-fix)

| Gate | Command | Result |
|------|---------|--------|
| Solver tests | `cd solver && npm test` | 83/83 pass |
| Solver typecheck | `cd solver && npx tsc --noEmit` | exit 0 |
| Web build | `cd web && npm run build` (`tsc --noEmit && vite build`) | exit 0 |
| Web tests | `cd web && npm test` | 30/30 pass |

## Invariants verified
- §4 fixture still clears **$100.00** (api/auction/proofpack + web curve/balance tests green).
- Real `/settle` path **byte-unchanged** — the only `ledger.ts` hunk is inside the separate `tamperClear`.
- WOW-02 tamper still only ATTEMPTS a rejected clear (no settlement mutation).
- Secret-sweep property holds (no key/token in any response/log/proof bundle; sentinel-sweep tests green).
- Commits attributed to `woshvad <woshvad@gmail.com>`, no Claude/Anthropic trailers.

_Fixed: 2026-07-09 · Iteration 1 · gsd-code-review --fix_
