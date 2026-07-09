---
phase: 08-demo-hardening
plan: 05
subsystem: solver
tags: [TRUST-03, WOW-05, proof-bundle, proof-pack, secret-hygiene, headless-chrome]
requires:
  - agent.ts (SYSTEM_PROMPT, buildBatchMessage, AgentResult, proposeClearing)
  - auction.ts (computeClearing, Allocation, OrderView)
  - brief.ts (composeBrief)
  - ledger.ts (readTradeConfirmations, settle — read-only)
provides:
  - "solver/src/proof.ts — writeProofBundle/readProofBundle (node:crypto sha256, secret-free bundle)"
  - "solver/src/proofpack.ts — renderProofPackHtml (on-brand deck tokens) + generateProofPackPdf (headless Chrome/Edge, injected spawn)"
  - "GET /round/:id/proof — read-only decision proof bundle (404 absent)"
  - "GET /round/:id/proof-pack.pdf — streams PDF (attachment) or on-brand HTML window.print() fallback"
  - "AppDeps.readProofBundle + AppDeps.buildProofPack"
affects:
  - solver/src/api.ts (2 new endpoints, additive)
  - solver/src/index.ts (settle-time proof write + buildProofPack wiring)
tech-stack:
  added: []
  patterns: [DI-factory, injected-spawn, secret-safe-envelope, module-private-credential, node-crypto-sha256]
key-files:
  created:
    - solver/src/proof.ts
    - solver/src/proof.test.ts
    - solver/src/proofpack.ts
    - solver/src/proofpack.test.ts
  modified:
    - solver/src/api.ts
    - solver/src/api.test.ts
    - solver/src/index.ts
decisions:
  - "rawAiProposal = agent's numbers + rationale + source (secret-free); systemPromptHash/batchHash stored instead of the prompt/batch text"
  - "roundId sanitized into the proof filename (path-traversal guard on GET /round/:id/proof)"
  - "settle-time proof write is an additive side effect in the index.ts boot adapter — api.ts /settle + ledger.ts settle() byte-unchanged (0 deletions in api.ts)"
  - "child_process spawn + HTML writer injected into generateProofPackPdf so tests never launch Chrome or write a real PDF"
  - "DvP finality legs derived by greedy buy/sell pairing (A↔B 8@100 · A↔C 2@100 for §4)"
  - "readProofBundle/buildProofPack made optional in BuildDepsArgs with defaults so index.test.ts boot-wiring stays green"
metrics:
  duration: ~12 min
  tasks: 3
  files: 7
  tests: 83 passing
  completed: 2026-07-09
---

# Phase 8 Plan 5: TRUST-03 Decision Proof Bundle + WOW-05 Proof-Pack PDF Summary

Two additive backend seams that make the AI's clearing decision auditable (TRUST-03) and shareable (WOW-05): every settle now persists an immutable, secret-free decision proof bundle served read-only at `GET /round/:id/proof`, and one endpoint renders an on-brand proof-pack (deck tokens, four bundles) to a headless-Chrome PDF at `GET /round/:id/proof-pack.pdf` with a `window.print()` HTML fallback. The deterministic §4 settle path is byte-unchanged and still clears $100.00.

## What Was Built

### Task 1 — TRUST-03 decision proof bundle (`c27ea27`)
- **`solver/src/proof.ts`** — `writeProofBundle()`/`readProofBundle()` using `node:crypto` `createHash('sha256')`. The bundle carries `{roundId, timestamp, modelId, systemPromptHash, batchHash, rawAiProposal, deterministicRecompute, verified, clearingHash}`.
  - **Secret hygiene (Pitfall 6 / T-08-05-BUNDLE):** stores `systemPromptHash = sha256(SYSTEM_PROMPT)` and `batchHash = sha256(buildBatchMessage(views))` — NEVER the raw prompt, the operator token, or the `ANTHROPIC_API_KEY`. `rawAiProposal` is numbers + rationale + source only.
  - `mkdirSync(recursive)` the (gitignored) `solver/proofs/` dir; roundId sanitized into the filename (`[^A-Za-z0-9_.-]` → `_`) as a path-traversal guard for the GET endpoint.
- **Settle-time write** in `index.ts settleResult` — after `ledger.settle` resolves, additively calls `agent.proposeClearing(views)` (off the settlement authority, purely for provenance) and `proof.writeProofBundle(...)`. A write failure is logged secret-free and swallowed. The `api.ts` `/settle` handler and `ledger.ts settle()` are byte-unchanged.
- **`GET /round/:id/proof`** — read-only passthrough of the bundle (404 `PROOF_NOT_FOUND` when absent).

### Task 2 — WOW-05 on-brand proof-pack render + PDF spawn (`40eaa8f`)
- **`solver/src/proofpack.ts`** — `renderProofPackHtml()` is pure and copies the deck `:root` tokens verbatim (`#F4F1EA`/`#0A0A0A`/`#D6FB3C`), the Google-Fonts link (Space Grotesk / IBM Plex Mono / Inter), and `-webkit-print-color-adjust:exact`. Carries all four bundles: (1) clearing proof — lime `100.00` hero + §4 fills `A=10 / B=8 / C=2`; (2) per-desk best-ex receipts; (3) finality record — DvP legs `A↔B 8@100 · A↔C 2@100` + one-atomic-transaction stamp; (4) AI decision bundle — modelId + verified flag + brief (+ proof hashes). Secret-free by construction.
- `generateProofPackPdf()` writes the HTML to a temp file and spawns SYSTEM Chrome then Edge `--print-to-pdf` (fixed-literal flags, zero new npm deps — T-08-05-SPAWN). On ENOENT for every browser → `{ pdf:false, html }` for `window.print()`. The `execFile` spawn and HTML writer are dependency-injected.

### Task 3 — WOW-05 endpoint + wiring (`17a308b`)
- **`AppDeps.buildProofPack`** composes `readProofBundle` + `readTradeConfirmations` + `composeBrief` → `renderProofPackHtml` → `generateProofPackPdf`, wired once in `index.ts buildDeps` (reads ledger truth; interpolates only numbers/hashes/brief).
- **`GET /round/:id/proof-pack.pdf`** streams the PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Umbra-Proof-Pack-<id>.pdf"`) or serves the on-brand HTML (200, text/html) on the Chrome-fail fallback. Any builder error → a secret-free `PROOFPACK_FAILED` 500 with the 08-UI-SPEC error copy.

## Tests
- **`proof.test.ts` (4):** all bundle fields for §4; `systemPromptHash === sha256(SYSTEM_PROMPT)`; §4 recompute (100.00, A=10/B=8/C=2) + stable clearingHash; secret sweep (no key/token/raw prompt); readProofBundle round-trip + null-when-absent.
- **`proofpack.test.ts` (10):** brand tokens + fonts + print-color-adjust; each of the four bundles; §4 numbers + DvP legs; no secret; empty-state; PDF `{pdf:true}` on mocked exit-0; `{pdf:false, html}` on ENOENT for both browsers; no real Chrome/PDF (injected deps).
- **`api.test.ts` (+8, now 30):** `GET /proof` returns bundle / 404 / secret sweep; `GET /proof-pack.pdf` streams PDF (attachment) / HTML fallback (carries `#D6FB3C`) / `PROOFPACK_FAILED` 500 secret-sweep / fallback-HTML secret-sweep.
- **Full suite: 83 passing; `tsc --noEmit` clean.**

## Deviations from Plan

### Auto-fixed / design choices (no user permission needed)

**1. [Rule 2 - Security] roundId sanitized in the proof filename**
- The plan resolved the proof path from `import.meta.url` but did not specify filename sanitization. `GET /round/:id/proof` and `/proof-pack.pdf` take `:id` from the URL, so an unsanitized id could attempt path traversal. Added `safeName(roundId) = roundId.replace(/[^A-Za-z0-9_.-]/g, '_')` in both `writeProofBundle` and `readProofBundle` (matched pair) — a Rule 2 correctness/security addition.

**2. [Rule 3 - Blocking] readProofBundle/buildProofPack optional in BuildDepsArgs**
- `index.test.ts` calls `buildDeps({...})` without the two new deps. Making them required would break the boot-wiring unit test's typecheck. Made both optional in `BuildDepsArgs` with in-factory defaults (`() => null` / `{pdf:false, html:''}`) so `index.test.ts` stays green unchanged while `AppDeps` keeps them required (the real `main()` always supplies them).

**3. [Design] rawAiProposal includes rationale + source (still secret-free)**
- The plan said "numbers-only proposal." Included the agent's `rationale` (presentational, already surfaced in API responses) and `source` label alongside the numbers so the AI decision bundle in the proof-pack is richer. No secret: the model output carries no key/prompt. Secret-sweep tests confirm.

Otherwise the plan executed as written.

## Threat Coverage
- **T-08-05-BUNDLE (mitigate):** systemPromptHash/batchHash instead of the prompt; rawAiProposal numbers/rationale/source only; `solver/proofs/` gitignored; proof.test.ts + api.test.ts secret sweeps.
- **T-08-05-PACK (mitigate):** renderProofPackHtml interpolates only numbers/hashes/brief; api.test.ts sweeps `/proof-pack.pdf` (PDF error + HTML fallback).
- **T-08-05-SETTLE (mitigate):** proof write is additive in the boot adapter; `api.ts` `/settle` (0 deletions) + `ledger.ts settle()` (untouched) byte-unchanged; §4 still $100.00.
- **T-08-05-SPAWN (accept):** reuses system Chrome/Edge with fixed-literal flags (no new npm dep); ENOENT → HTML fallback; spawn injected + mocked in tests.
- **T-08-05-CRYPTO (mitigate):** node:crypto sha256 only; on-ledger anchoring deferred to Phase 10.

## Known Stubs / Follow-ups
- The **WOW-05 user-facing one-click download UI** (`ProofPackButton` on `SettlementView`) lands in **08-07**; this plan delivers the backend endpoint + renderer it consumes. WOW-05 remains unchecked in REQUIREMENTS.md until 08-07.
- **Live PDF verification** (post-settle download opens an on-brand PDF; Chrome-absent HTML fallback prints) is a Manual-Only phase gate — deferred to phase verification per the Phases 1–3 precedent. No real Chrome is spawned in CI.

## Self-Check: PASSED
- Files exist: `solver/src/proof.ts`, `proof.test.ts`, `proofpack.ts`, `proofpack.test.ts` — all FOUND.
- Commits exist: `c27ea27` (TRUST-03), `40eaa8f` (proof-pack render), `17a308b` (proof-pack endpoint) — all in `git log`.
- Gates: `cd solver && npx vitest run` → 83 passing; `npx tsc --noEmit` → clean.
- `/settle` byte-unchanged: `git diff` shows api.ts is 57 insertions / 0 deletions; ledger.ts untouched by all three commits.
- Attribution clean: no Co-Authored-By / Anthropic trailer in any commit (verified via `git log --pretty=%B`).
