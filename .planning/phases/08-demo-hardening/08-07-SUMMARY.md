---
phase: 08-demo-hardening
plan: 07
subsystem: web
tags: [WOW-04, WOW-05, sse-stream, rationale, round-brief, proof-pack, solver-client, ink-ghost-cta]
requires:
  - web/src/solver.ts (SOLVER_BASE_URL, call<T>, getRound, RoundResponse, SolverError)
  - solver/src/api.ts (GET /round/:id/rationale-stream SSE; terminal-body `brief`; GET /round/:id/proof-pack.pdf)
  - web/src/components/AgentRationale.tsx (shipped ink panel + flame caret + prefersReducedMotion typewriter)
  - web/src/views/SettlementView.tsx (settled gating, CTA row, preview allocations)
  - web/src/operatorState.ts (OperatorViewState — roundId, offline)
provides:
  - "web/src/solver.ts — rationaleStreamUrl(id) + proofPackUrl(id) URL builders + getBrief(id) (brief? on RoundResponse)"
  - "web/src/components/AgentRationale.tsx — live SSE rationale source with graceful single-shot fallback"
  - "web/src/components/RoundBrief.tsx — WOW-04 shareable NL summary (COPY BRIEF + DOWNLOAD BRIEF ↓)"
  - "web/src/components/ProofPackButton.tsx — WOW-05 one-click proof-pack PDF download"
  - "SettlementView mounts RoundBrief + ProofPackButton (post-settle only)"
affects:
  - web/src/solver.ts (helpers + brief? field on RoundResponse)
  - web/src/components/AgentRationale.tsx (SSE source + fallback; optional roundId prop)
  - web/src/views/AgentView.tsx (passes roundId to enable the live stream)
  - web/src/views/SettlementView.tsx (post-settle block mounts + client fallback brief)
  - web/src/index.css (scoped .umbra-ink-ghost hover-fill rule, existing tokens only)
tech-stack:
  added: []
  patterns: [call<T>-client, EventSource-SSE, blob-object-url-download, reduced-motion-guard, ink-ghost-cta, graceful-fallback]
key-files:
  created:
    - web/src/lib/solverUrls.test.ts
    - web/src/components/RoundBrief.tsx
    - web/src/components/ProofPackButton.tsx
  modified:
    - web/src/solver.ts
    - web/src/components/AgentRationale.tsx
    - web/src/views/AgentView.tsx
    - web/src/views/SettlementView.tsx
    - web/src/index.css
decisions:
  - "rationaleStreamUrl/proofPackUrl build PLAIN URLs off SOLVER_BASE_URL (no :4000 literal, no auth header/credential) — EventSource + <a download> consume them; getBrief reuses getRound and returns the terminal-body brief (RoundResponse gains brief?)"
  - "AgentRationale gains an optional roundId prop: when present AND EventSource exists, open the SSE stream and append data deltas into the SAME ink panel (flame caret rides the insertion point), close on the `done` event; on error-before-any-token OR no roundId → fall back to the shipped single-shot 26ms/char typewriter — identical appearance. Existing callers without roundId are byte-behavior-unchanged"
  - "SSE onerror closes the EventSource (kills auto-reconnect); the server fallback frame (one data: brief + res.end) is received as a delta so the panel still fills; reduced-motion is naturally honored (SSE appends per chunk with no per-char interval)"
  - "RoundBrief prefers the server brief (getBrief) but composes a client-side fallback from the settled preview (mirrors solver/src/brief.ts composeBrief, no number drift) so the block never stalls offline; COPY via navigator.clipboard, DOWNLOAD via Blob → .txt object URL"
  - "ProofPackButton fetches proofPackUrl then saves the blob (pdf or html print-fallback by content-type) via an <a download>; states ready→preparing(disabled)→done, error shows the VERBATIM WOW-05 copy"
  - "Both RoundBrief + ProofPackButton gated on phase==='settled' (hidden pre-settle), mounted below the Settlement CTA/SETTLED confirmation; CTAs are ink/paper only (new .umbra-ink-ghost hover rule = ink-fill/paper-text, existing #0A0A0A/#F4F1EA tokens) — never red/lime, no new keyframe"
metrics:
  duration: ~8 min
  completed: 2026-07-09
---

# Phase 08 Plan 07: WOW-04 Live Rationale Stream + Round Brief & WOW-05 Proof-Pack Summary

Live SSE-streamed solver rationale (graceful single-shot fallback) plus a post-settle shareable Round Brief and one-click on-brand proof-pack PDF — all composed onto the shipped views with the existing ink/paper grammar and no new tokens.

## What Was Built

- **Task 1 — web client helpers (`web/src/solver.ts`).** Added `rationaleStreamUrl(id)` → `${SOLVER_BASE_URL}/round/:id/rationale-stream` (EventSource consumes it, no auth header), `proofPackUrl(id)` → `${SOLVER_BASE_URL}/round/:id/proof-pack.pdf`, and `getBrief(id)` (reuses `getRound`, returns the terminal-body `brief`). Added `brief?: string` to `RoundResponse`. New pure `web/src/lib/solverUrls.test.ts` (9 tests) asserts both builders root at `SOLVER_BASE_URL`, hit the exact routes, carry no `:4000` literal, and embed no credential.
- **Task 2 — live SSE rationale (`web/src/components/AgentRationale.tsx`).** Added an optional `roundId` prop; when present and `EventSource` exists, the panel opens the rationale SSE stream and appends each `data:` delta into the shipped ink panel (flame caret riding the live insertion point), closing on the `done` event. Any error before a token — or no `roundId` — gracefully falls back to the shipped single-shot 26ms/char typewriter (identical appearance). Source + interval torn down on unmount. `AgentView` now passes `roundId` to enable it.
- **Task 3 — post-settle Round Brief + Proof-Pack (`RoundBrief.tsx`, `ProofPackButton.tsx`, `SettlementView.tsx`).** `RoundBrief` renders the "Round Brief · shareable" 1px-ink block (server brief via `getBrief`, client fallback composed from the settled preview) with `COPY BRIEF` (clipboard) and `DOWNLOAD BRIEF ↓` (Blob `.txt`). `ProofPackButton` is an ink-ghost `DOWNLOAD PROOF-PACK ↓` that fetches `proofPackUrl` and saves the blob (pdf/html) with ready/preparing/done/error states and the verbatim WOW-05 error copy. Both mount below the CTA, gated on `phase === 'settled'`. Added the scoped `.umbra-ink-ghost` hover-fill rule to `index.css` (existing ink/paper tokens only).

## Verification

- `cd web && npx vitest run src/lib/solverUrls.test.ts` — 9/9 green.
- `cd web && npx vitest run` — 5 files / 30 tests green (no regressions).
- `cd web && npm run build` — tsc `--noEmit` + vite build pass (104 modules).
- `grep -rn ':4000' web/src` (excluding the test's own negative-assertions) — clean; no operator/Anthropic credential path in the new components.

## Deviations from Plan

None — plan executed exactly as written. Design choices left to executor discretion (RoundBrief server-brief-with-client-fallback; ProofPackButton blob-save honoring the HTML print fallback; the shared `.umbra-ink-ghost` hover class) stay within the plan's stated grammar and the 08-UI-SPEC contract.

## Known Stubs

None. RoundBrief and ProofPackButton are wired to live solver endpoints (with a graceful client-side brief fallback that reflects the real settled §4 numbers — no hardcoded UI placeholder).

## Deferred / Human Verification (phase gate)

Per `human_verify_mode: end-of-phase`, the live behavior is deferred to end-of-phase manual verification against a running solver (:4100): (1) trigger a solve → rationale types out live from the SSE with the flame caret; kill the stream → single-shot fallback still renders; (2) settle → Round Brief shows the shareable summary with working COPY/DOWNLOAD; (3) `DOWNLOAD PROOF-PACK ↓` downloads the on-brand PDF (four bundles); both blocks hidden pre-settle. No Canton LocalNet / live SSE connection was opened during execution (per hard constraints).

## Commits

- `34aa1b7` feat(08-07): add rationaleStreamUrl/proofPackUrl/getBrief web client helpers
- `966b6b7` feat(08-07): stream AgentRationale live via SSE with single-shot fallback
- `d2e9a74` feat(08-07): add post-settle RoundBrief + ProofPackButton to SettlementView

## Self-Check: PASSED

- Created files present: web/src/lib/solverUrls.test.ts · web/src/components/RoundBrief.tsx · web/src/components/ProofPackButton.tsx
- Commits present: 34aa1b7 · 966b6b7 · d2e9a74
