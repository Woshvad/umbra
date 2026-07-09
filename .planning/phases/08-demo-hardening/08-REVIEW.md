---
phase: 08-demo-hardening
reviewed: 2026-07-09T13:12:48Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - .github/workflows/ci.yml
  - solver/src/agent.ts
  - solver/src/api.ts
  - solver/src/brief.ts
  - solver/src/index.ts
  - solver/src/ledger.ts
  - solver/src/proof.ts
  - solver/src/proofpack.ts
  - web/src/components/AgentRationale.tsx
  - web/src/components/BreakTheAiPanel.tsx
  - web/src/components/OrderTicket.tsx
  - web/src/components/PeekConsole.tsx
  - web/src/components/ProofPackButton.tsx
  - web/src/components/RoundBrief.tsx
  - web/src/lib/peek.ts
  - web/src/solver.ts
  - web/src/views/AgentView.tsx
  - web/src/views/PrivacyView.tsx
  - web/src/views/SettlementView.tsx
  - web/src/views/TheatreView.tsx
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-09T13:12:48Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 8 (demo-hardening) adds five WOW surfaces (peek console, break-the-AI, live
rationale SSE, shareable brief, proof-pack PDF) plus the TRUST-03 decision-proof bundle.
I reviewed all 20 listed source files against the domain-weighted concerns: secret
hygiene, trust boundary, WOW-02 settle-safety, clearing correctness, and standard
bug/quality checks.

**The high-stakes invariants hold.** The `ANTHROPIC_API_KEY` and operator token stay
module-private and never enter a response body, log line, or the proof bundle (`proof.ts`
stores `sha256(SYSTEM_PROMPT)`, never the raw prompt/key). The verify-don't-trust gate is
intact: `agent.proposeClearing` always returns the deterministic `computeClearing` numbers
and only colors `rationale` on an exact 2dp+allocation match; settlement runs through
`ledger.settle` → `computeClearing` → on-ledger `Round.Clear` re-verification with no skip
path. `tamperClear` is a separate copy of the gather logic that only ATTEMPTS a `Round.Clear`
and catches the rejection — the real `/settle` path in `ledger.ts` is byte-unchanged. Path
traversal on `roundId` is defended (`safeName` in proof.ts, `replace(...)` in index.ts). The
web bundle never reaches Anthropic and never holds an operator token.

No Critical issues found. The defects below are correctness/robustness and demo-integrity
problems: a Windows `file://` URL that likely disables the marquee PDF render, a demo panel
that fabricates a "SETTLED" state on a failed settle, an SSE route with no client-disconnect
teardown, and a hardcoded round id that decouples desk submits from the active round.

## Warnings

### WR-01: Proof-pack PDF spawn builds a malformed `file://` URL on Windows

**File:** `solver/src/proofpack.ts:234`
**Issue:** `runBrowser` passes the source page to Chrome/Edge as `` `file://${htmlPath}` ``.
`htmlPath` comes from `join(tmpDir, ...)` where `tmpDir = fileURLToPath(...)`, so on the
documented Windows box it is a native path like `C:\Users\...\solver\.tmp\proof-123.html`.
Concatenating yields `file://C:\Users\...` — Chrome parses `C:` as the URL host and the
backslashes are not valid path separators, so the page fails to load and the browser exits
non-zero. Both browsers then "fail", and `generateProofPackPdf` silently degrades to the
HTML fallback. The result: the WOW-05 one-click PDF (a Phase-8 deliverable) never actually
renders a PDF on the target platform — every download is the print-fallback HTML.
**Fix:** Build the URL with the platform-correct helper instead of string concatenation:
```ts
import { pathToFileURL } from 'node:url'
// ...
execFileFn(
  browser,
  ['--headless=new', '--disable-gpu', '--no-pdf-header-footer',
   `--print-to-pdf=${outPath}`, pathToFileURL(htmlPath).href],
  (err) => (err ? reject(err) : resolve()),
)
```

### WR-02: `BreakTheAiPanel` reports a successful settle on a failed settle

**File:** `web/src/components/BreakTheAiPanel.tsx:111-120`
**Issue:** In `runCorrectClear`, any non-OFFLINE error from `settle(roundId)` is swallowed
and the panel sets `clearingPrice = 100` and `phase = 'corrected'`, which renders the lime
`100.00` slab and `VERIFIED · SETTLED @ 100.00`. If the real settle fails for any reason
other than a benign double-settle (e.g. `insufficient or missing USDCx holding`, a ledger
error, a 500), the "Break the AI" demo asserts the batch settled at $100.00 when it did not.
The whole point of this panel is credibility ("the ledger is the backstop"); fabricating a
settled state on failure undermines exactly that claim.
**Fix:** Only show the corrected reveal on an actual success; surface a distinct error/offline
state otherwise:
```ts
} catch (e) {
  if (e instanceof SolverError && e.code === 'OFFLINE') {
    setOfflineHit(true); setPhase(rejection ? 'rejected' : 'idle'); return
  }
  // Real failure — do NOT claim a settle. Show a secret-free error line.
  setSettleError(e instanceof Error ? e.message : 'clear failed')
  setPhase(rejection ? 'rejected' : 'idle')
}
```

### WR-03: SSE rationale route has no client-disconnect teardown; model stream leaks

**File:** `solver/src/api.ts:348-394`
**Issue:** The `/round/:id/rationale-stream` handler opens `deps.streamRationale` and writes
deltas to `res`, but never registers `req.on('close', ...)`. When the browser
`EventSource` closes (AgentRationale unmount, view switch, React strict-mode double-mount,
or navigation) the server keeps the underlying Anthropic stream open and keeps calling
`onDelta → res.write` on a half-closed socket. Nothing aborts the model stream, so each
aborted client leaves a live upstream stream — an accumulating resource leak across a demo
session. Additionally the `void (async () => { ... })()` IIFE has no `.catch`: if
`deps.streamRationale` or the `finishFallback` path's `deps.computeClearing(views)` ever
throws (contractually they shouldn't, but there is no guard), it becomes an unhandled
promise rejection.
**Fix:** Wire an abort/close path and guard the IIFE:
```ts
let aborted = false
req.on('close', () => { aborted = true })
// in onDelta: if (aborted || closed) return
void (async () => { /* ... */ })().catch(() => { if (!res.writableEnded) res.end() })
```
Ideally also thread an `AbortSignal` into `streamRationale` so the SDK stream is torn down.

### WR-04: `OrderTicket` hardcodes `roundId: 'R1'`, decoupling submits from the active round

**File:** `web/src/components/OrderTicket.tsx:117`
**Issue:** `onSeal` submits `Venue.SubmitOrder` with `roundId: 'R1'` as a literal, while the
operator plane opens/drives rounds by an id passed through app state (`POST /round` defaults
to `R-${Date.now()}` when no id is given). If any round other than `R1` is active, sealed
desk orders are attached to `R1` and will never appear in the active round's book — the
solver's `readSealedOrders(activeId)` returns them empty and the money-shot clears an empty
book. The demo only works because every path happens to also hardcode/seed `R1`; the coupling
is invisible until someone opens a differently-named round.
**Fix:** Thread the active `roundId` into `OrderTicket` as a prop (the parent already knows
it) and submit that value instead of the literal `'R1'`.

### WR-05: `tamperClear` returns `rejected: true` even if the ledger ACCEPTS the tampered clear

**File:** `solver/src/ledger.ts:447-448`
**Issue:** If the on-ledger recompute-and-assert ever failed to reject a tampered `Clear`
(the "should never happen" branch), the exercise succeeds — meaning the round just settled
at a WRONG price / over-filled allocation — yet `tamperClear` still returns
`{ rejected: true, error: 'UNEXPECTED: ledger accepted a tampered clear' }`. Reporting
`rejected: true` after a real (catastrophic) mutation masks the exact failure this demo
exists to detect. The safety of WOW-02 rests entirely on the Daml assert; the one place that
could catch an assert regression instead lies about it.
**Fix:** Signal the anomaly honestly so the UI cannot render "REJECTED":
```ts
// Accepted → this is a REAL failure of the backstop, not a rejection.
throw new Error('SAFETY REGRESSION: on-ledger Clear accepted a tampered proposal')
```
(or return an explicit `{ rejected: false, accepted: true }` and have the caller treat it
as a loud error).

### WR-06: Desk bearer tokens are shipped to the browser and drive raw ledger calls

**File:** `web/src/components/PeekConsole.tsx:107-109`, `web/src/components/OrderTicket.tsx:113-118`
**Issue:** `tokens[activeDesk].token` and `tokens[deskKey].party` are read client-side and a
raw `Authorization: Bearer <deskToken>` is attached to direct `fetch`/`useLedger` calls
against the JSON Ledger API v2. This is the intended dev/party-switcher architecture (and it
is correctly NOT an operator or Anthropic credential, so the trust boundary for WOW is
respected), but this milestone is explicitly "Production Hardening": real per-desk `actAs`
JWTs embedded in the client bundle are a genuine credential-exposure risk if this pattern
survives into a hosted build. Flagging so it is a conscious decision, not a silent carry-over.
**Fix:** Keep for the local demo; before any hosted/production build, move desk authority
behind a per-desk backend session (httpOnly cookie / short-lived server-minted token) so
long-lived `actAs` bearers never reach browser JS.

## Info

### IN-01: Contradictory provenance on the post-settle GET body

**File:** `solver/src/api.ts:290`
**Issue:** The post-settle branch emits `body.agent = { verified: true, source:
'deterministic-fallback' }`. `verified: true` paired with `source: 'deterministic-fallback'`
is self-contradictory against the `AgentResult` semantics (verified is the AI-agreement flag;
the fallback path is `verified: false`). Presentational only, but it can confuse a consumer
reading provenance.
**Fix:** Use `{ verified: false, source: 'deterministic-fallback' }`, or introduce a distinct
`source: 'settled'` label for the reconstructed-from-ledger case.

### IN-02: Proof-pack temp HTML file is never cleaned up

**File:** `solver/src/proofpack.ts:250-261`
**Issue:** `generateProofPackPdf` writes `proof-${Date.now()}.html` to the temp dir and, on
PDF success, returns the PDF path without removing the intermediate HTML. Each proof-pack
request leaves an orphan HTML file in `solver/.tmp`.
**Fix:** `unlink` the temp HTML in a `finally` after the browser loop (best-effort, swallow
errors).

### IN-03: `isEntrypoint` matches on basename only

**File:** `solver/src/index.ts:310-315`
**Issue:** `isEntrypoint` returns true when `import.meta.url` ends with the invoked script's
basename (`index.js`). Any process launched as a differently-pathed but same-basename script
that imports this module would boot the service unexpectedly. Low risk given the fixed layout.
**Fix:** Compare the full resolved path (`fileURLToPath(import.meta.url) === realpath(argv[1])`).

### IN-04: Proof-pack finality legs render unformatted price and mixed desk labels

**File:** `solver/src/proofpack.ts:108, 60`
**Issue:** Leg rows print `` `${l.qty}@${l.price}` `` (e.g. `8@100`, not `8@100.00`), and
`shortDesk` returns `'A'` for a party id like `bankA::1220` but the full `'BLUEROCK'` for an
already-coded display name — so the pack may mix short and long desk labels depending on input.
Cosmetic only.
**Fix:** Format the leg price with `clearingPrice.toFixed(2)` and normalize desk labels through
a single code resolver.

### IN-05: Duplicate `composeFallbackBrief` logic mirrored on client and server

**File:** `web/src/views/SettlementView.tsx:74-89` (mirrors `solver/src/brief.ts:19-43`)
**Issue:** The client fallback brief re-implements `composeBrief` almost verbatim. The two can
drift (e.g. wording, the `units`/`perDesk` phrasing) with no shared test. Acceptable as a
deliberate offline fallback, but it is duplicated business copy.
**Fix:** Extract the phrasing into a shared pure module imported by both, or snapshot-test the
two against each other to lock parity.

---

_Reviewed: 2026-07-09T13:12:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
