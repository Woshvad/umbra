---
phase: 08-demo-hardening
verified: 2026-07-09T13:21:21Z
status: human_needed
score: 8/8 requirement code-layers verified (live-behavior confirmation deferred to end-of-phase)
overrides_applied: 0
human_verification:
  - test: "WOW-01 live: as BankA (BankA's own token), run the PeekConsole against a rival (BankB) Order via raw POST /v2/state/active-contracts on the running LocalNet (:2975/:4975)"
    expected: "The raw response pane shows an empty [] (or 403) live; the second target (rival TradeConfirmation) is also empty — privacy proven at the wire"
    why_human: "Requires the Dockerized Canton LocalNet booted; not runnable in the automated gate (human_verify_mode: end-of-phase)"
  - test: "WOW-02 live: on the Agent view Break-the-AI panel, FORCE A WRONG CLEAR then RUN CORRECT CLEAR against live Canton"
    expected: "The wrong clear surfaces the VERBATIM on-ledger Round.Clear assertMsg rejection with no balance change; the correct clear then settles at $100.00"
    why_human: "Requires a live Round + on-ledger Round.Clear recompute-and-assert against running Canton"
  - test: "WOW-03/WOW-04 live: type plain English in the Order Ticket → PARSE, then watch AgentRationale during a real solve"
    expected: "Claude returns a validated {side,qty,limit} that prefills the ticket (SEAL ORDER still the single confirm); the rationale streams token-by-token via SSE from real Anthropic; a post-round brief renders"
    why_human: "Requires a live ANTHROPIC_API_KEY + SSE stream + a real sealed submit; the automated suite exercises the mocked/deterministic paths only"
  - test: "WOW-05 live: after a real settlement, click DOWNLOAD PROOF-PACK ↓"
    expected: "A proof-pack PDF downloads and opens on-brand (paper #F4F1EA / ink #0A0A0A / lime #D6FB3C; Space Grotesk / IBM Plex Mono / Inter) with clearing proof + per-desk best-ex receipts + finality record + AI decision bundle"
    why_human: "Requires headless Chrome/Edge --print-to-pdf against a settled round's persisted proof bundle; PDF visual fidelity is not machine-verifiable here"
---

# Phase 08: Demo Hardening Verification Report

**Phase Goal:** Turn Umbra's three superpowers (ledger-enforced privacy, the AI solver, atomic DvP) into interactive, visceral moments a judge feels — with near-zero new infrastructure, by exposing capabilities that already exist and hardening the AI-trust story.
**Verified:** 2026-07-09T13:21:21Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Verification Model

This project runs `human_verify_mode: end-of-phase`. The Dockerized Canton LocalNet (:3975/:2975/:4975) and live Anthropic streaming were intentionally NOT booted during execution (v1 precedent: 04-04 deferred live E2E). Each success criterion is split into a CODE/AUTOMATED layer (verified now) and a LIVE-BEHAVIOR layer (deferred to end-of-phase live confirmation, recorded as `human_needed` — not gaps).

### Automated Gates (all green)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Solver unit suite | `cd solver && npm test` | 83 passed (8 files) |
| Solver typecheck | `cd solver && npm run typecheck` | clean (tsc --noEmit) |
| Web unit suite | `cd web && npm test` | 30 passed (5 files) |
| Web build | `cd web && npm run build` | tsc clean + vite build OK (104 modules) |

## Goal Achievement

### Observable Truths (per Success Criterion)

| # | Truth (CODE layer) | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | WOW-01 — raw v2 active-contracts peek at a rival Order/TradeConfirmation using the active desk's OWN token, request+response rendered verbatim | ✓ VERIFIED (code) | `web/src/components/PeekConsole.tsx` (POST `v2/state/active-contracts`, `httpBaseUrlFor(activeDesk)`, elided Bearer, Order + TradeConfirmation targets); mounted in `PrivacyView.tsx:85`; pure builder `web/src/lib/peek.ts` unit-tested (10 tests). Live empty[]/403 = human_needed #1 |
| 2 | WOW-02 — tamperClear ATTEMPTS a wrong Round.Clear (verbatim reject, nothing changes), correct deterministic clear still settles $100.00; `/settle` byte-unchanged | ✓ VERIFIED (code) | `solver/src/ledger.ts:381 tamperClear` catches submitAndWait throw → `{rejected:true,error}`, never settles; `settle` (l.298) untouched; `settleResult` wrapper (`index.ts:204`) adds proof write as additive side effect only. `BreakTheAiPanel.tsx` (AgentView:68) wires FORCE WRONG → RUN CORRECT. Live ledger reject = human_needed #2 |
| 3 | WOW-03/WOW-04 — NL parse → validated {side,qty,limit} (never auto-submit); SSE rationale stream + post-round brief | ✓ VERIFIED (code) | `agent.ts parseOrder` + `POST /parse-order` (api.ts:431, zod, 422 on malformed); `OrderTicket.tsx:85` prefills, SEAL ORDER stays sole confirm; `GET /round/:id/rationale-stream` SSE (api.ts:348) with single fallback frame; `AgentRationale.tsx` EventSource + typewriter fallback; `brief.ts composeBrief` + `RoundBrief.tsx` (SettlementView:228). Live Anthropic/SSE = human_needed #3 |
| 4a | TRUST-01 — §8 fixtures run as CI golden-eval, green on $100.00 / A=10·B=8·C=2 | ✓ VERIFIED | `.github/workflows/ci.yml` golden job runs `npm test` on every push/PR touching solver/**, daml/**; `auction.test.ts:34` asserts `clearingPrice===100`, fills A=10/B=8/C=2, plus the 99-vs-100 tie-break trap guard |
| 4b | TRUST-02 — degradation ladder: keyless/malformed/zod-invalid/disagreement/SDK-error/TIMEOUT all clear $100.00; Promise.race deadline | ✓ VERIFIED | `agent.ts` `DEFAULT_AGENT_TIMEOUT_MS=8000`, `withDeadline` Promise.race (l.248), proposeClearing NEVER throws → deterministic §4; `agent.test.ts` asserts `clearingPrice===100` + `source==='deterministic-fallback'` on each rung (disagreement, malformed, keyless, timeout) |
| 4c | TRUST-03 — immutable decision proof bundle written secret-free (systemPromptHash, never key/prompt) at settle | ✓ VERIFIED | `proof.ts writeProofBundle` stores `systemPromptHash=sha256(SYSTEM_PROMPT)`, `batchHash`, rawAiProposal (numbers only) — no key/token/raw prompt; `proof.test.ts:116` SECRET SWEEP passes; wired at `index.ts:219` inside `settleResult` (additive); `solver/proofs/` gitignored (.gitignore:37) |
| 5 | WOW-05 — one-click on-brand proof-pack PDF post-settle (4 bundles) | ✓ VERIFIED (code) | `proofpack.ts renderProofPackHtml` copies brand tokens verbatim (#F4F1EA/#0A0A0A/#D6FB3C, Space Grotesk/IBM Plex Mono/Inter, print-color-adjust) + spawn headless print-to-pdf; `GET /round/:id/proof-pack.pdf` (api.ts:491); `ProofPackButton.tsx` (SettlementView:229) → `proofPackUrl(id)`. Live PDF render = human_needed #4 |

**Score:** 8/8 requirement code-layers verified. Live-behavior confirmation for 4 flows deferred to end-of-phase (human_needed).

### Required Artifacts

| Artifact | Provides | Status | Details |
| -------- | ----------- | ------ | ------- |
| `.github/workflows/ci.yml` | TRUST-01 golden gate | ✓ VERIFIED | golden (always) + daml (main push) jobs; path-scoped to solver/daml |
| `solver/src/agent.ts` | parseOrder + timeout-guarded proposeClearing + streamRationale | ✓ VERIFIED | exports parseOrder; Promise.race deadline; secret-free fallbacks |
| `solver/src/api.ts` | /parse-order, /tamper-clear, /rationale-stream, /proof, /proof-pack.pdf | ✓ VERIFIED | all routes present + wired via AppDeps |
| `solver/src/ledger.ts` | tamperClear (rejected Clear); settle byte-unchanged | ✓ VERIFIED | tamperClear l.381 never settles/throws; settle l.298 untouched |
| `solver/src/brief.ts` | composeBrief post-round NL summary | ✓ VERIFIED | numbers passed in (cannot drift clearing) |
| `solver/src/proof.ts` | writeProofBundle/readProofBundle, sha256 | ✓ VERIFIED | secret-free; node:crypto only |
| `solver/src/proofpack.ts` | renderProofPackHtml + headless print-to-pdf | ✓ VERIFIED | brand tokens verbatim |
| `web/src/lib/peek.ts` | pure v2 request builder + classifier | ✓ VERIFIED | 10 unit tests |
| `web/src/components/PeekConsole.tsx` | WOW-01 adversarial peek | ✓ VERIFIED (code) | mounted PrivacyView:85 |
| `web/src/components/BreakTheAiPanel.tsx` | WOW-02 tamper UI | ✓ VERIFIED (code) | mounted AgentView:68 |
| `web/src/components/OrderTicket.tsx` | WOW-03 NL prefill | ✓ VERIFIED (code) | parseOrder prefill, no auto-submit |
| `web/src/components/AgentRationale.tsx` | WOW-04 SSE rationale + fallback | ✓ VERIFIED (code) | EventSource + typewriter |
| `web/src/components/RoundBrief.tsx` | WOW-04 shareable brief | ✓ VERIFIED (code) | settled-only; copy/download |
| `web/src/components/ProofPackButton.tsx` | WOW-05 one-click PDF | ✓ VERIFIED (code) | proofPackUrl download |
| `web/src/solver.ts` | :4100 client (tamperClear/parseOrder/rationaleStreamUrl/proofPackUrl/getBrief) | ✓ VERIFIED | single SOLVER_BASE_URL; no :4000 literal |

### Key Link Verification

| From | To | Via | Status |
| ---- | --- | --- | ------ |
| PeekConsole.tsx | desks.ts httpBaseUrlFor + tokens[activeDesk] | per-desk base + own bearer, rival filter | ✓ WIRED |
| PrivacyView.tsx | PeekConsole | mounted (l.85) | ✓ WIRED |
| api.ts POST /parse-order | agent.parseOrder | AppDeps.parseOrder (index.ts buildDeps) | ✓ WIRED |
| api.ts POST /tamper-clear | ledger.tamperClear → Round.Clear assertMsg | AppDeps.tamperClear; verbatim throw surfaced | ✓ WIRED |
| api.ts GET /rationale-stream | agent.streamRationale | text/event-stream; onError → single fallback frame | ✓ WIRED |
| index.ts settleResult | proof.writeProofBundle(solver/proofs/<id>.json) | additive after ledger.settle (l.204-242) | ✓ WIRED |
| proofpack.ts | docs/umbra-deck.html brand tokens | copied :root + fonts + print-color-adjust | ✓ WIRED |
| OrderTicket.tsx NL block | solver.ts parseOrder | POST /parse-order → prefill | ✓ WIRED |
| BreakTheAiPanel.tsx | solver.ts tamperClear + settle | tamper then correct clear | ✓ WIRED |
| AgentRationale.tsx | /rationale-stream (SSE) | EventSource(rationaleStreamUrl); typewriter fallback | ✓ WIRED |
| ProofPackButton.tsx | /proof-pack.pdf | proofPackUrl(id) | ✓ WIRED |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ---------- | ------ | -------- |
| WOW-01 | 08-02 | ✓ SATISFIED (code); live = human #1 | PeekConsole + peek.ts (10 tests) |
| WOW-02 | 08-04, 08-06 | ✓ SATISFIED (code); live = human #2 | tamperClear + BreakTheAiPanel; /settle byte-unchanged |
| WOW-03 | 08-03, 08-06 | ✓ SATISFIED (code); live = human #3 | parseOrder + /parse-order + OrderTicket prefill |
| WOW-04 | 08-04, 08-07 | ✓ SATISFIED (code); live = human #3 | SSE rationale-stream + composeBrief + RoundBrief |
| WOW-05 | 08-05, 08-07 | ✓ SATISFIED (code); live = human #4 | proofpack.ts + /proof-pack.pdf + ProofPackButton |
| TRUST-01 | 08-01 | ✓ SATISFIED | ci.yml golden gate; auction.test.ts $100.00 assertion |
| TRUST-02 | 08-03 | ✓ SATISFIED | Promise.race deadline + full ladder tests → $100.00 |
| TRUST-03 | 08-05 | ✓ SATISFIED | writeProofBundle secret-free + SECRET SWEEP test; proofs gitignored |

All 8 requirement IDs from PLAN frontmatter accounted for. No orphaned requirements (WOW-06/07, AUCT/CRYP/DFIN/etc. are milestone-v2.0 items not scoped to phase 08).

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| (none) | TBD/FIXME/XXX debt markers in phase-modified source | — | Clean scan across all 15 modified source files |

The only `:4000` literals in `web/src` are negative assertions in `solverUrls.test.ts` proving the stale port is absent — not drift.

### Advisory Code Review

`08-REVIEW.md` reports 0 critical, 6 warning, 5 info. Per verification policy these do not change requirement coverage; they are follow-ups, not phase gaps.

### Human Verification Required

See frontmatter `human_verification` — 4 live-behavior confirmations deferred to end-of-phase against the running Canton LocalNet + live Anthropic:
1. WOW-01 live empty[]/403 rival peek
2. WOW-02 live on-ledger Round.Clear rejection + correct settle at $100.00
3. WOW-03/04 live NL parse + SSE rationale stream from real Anthropic
4. WOW-05 live proof-pack PDF opening on-brand

### Gaps Summary

No code-layer gaps. Every requirement (WOW-01..05, TRUST-01..03) has substantive, wired, unit-tested implementation. All four automated gates are green (solver 83 / typecheck clean / web 30 / build passes). Trust-boundary invariants hold in code: the proof bundle is written secret-free (systemPromptHash, never key/prompt), `/settle` is byte-unchanged with the proof write as an additive wrapper side effect, and `tamperClear` only ATTEMPTS a rejected Round.Clear. The remaining work is live-stack confirmation, expected under `human_verify_mode: end-of-phase` — recorded as human_needed, not gaps.

---

_Verified: 2026-07-09T13:21:21Z_
_Verifier: Claude (gsd-verifier)_
