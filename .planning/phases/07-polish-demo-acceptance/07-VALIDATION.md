---
phase: 7
slug: polish-demo-acceptance
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-27
---

# Phase 7 — Validation Strategy

> Per-phase validation contract. Source: `07-RESEARCH.md` → `## Validation Architecture`. This is a
> polish + orchestration + acceptance phase over a FROZEN system (Daml/solver/web logic + data planes
> unchanged). Three validation surfaces: (A) UI-07 — the always-on green `web build` + the 11 §4-value
> `lib` tests (the px/binding fixes must not touch the pure helpers) + a `gsd-ui-review` re-audit; (B)
> DEMO-01 — Makefile parse + the root npm-script mirror resolve + a README content check; (C)
> DEMO-02/03/04 — `daml test` 6/6 + the LIVE API/ledger acceptance assertions + the captured screenshots.
>
> **No Wave-0 scaffold is needed:** the web vitest runner + `web/src/lib/*.test.ts` (11 tests) already
> exist from Phase 6; `daml test` + `scripts/verify-privacy.mjs` already exist; the solver suite already
> exists. Every task's `<automated>` resolves to an existing command (`wave_0_complete: true`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | `tsc --noEmit` / `vite build` (always-on UI gate) + vitest@2.1.9 (`web/src/lib`, 11 tests, existing) + `daml test` (6 Script tests, existing) + live curl/fetch assertions + `scripts/verify-privacy.mjs` (existing) |
| **Config files** | `web/tsconfig.json`, `web/vitest.config.ts`, `daml/daml.yaml` (all exist) |
| **Quick run command** | `cd web && npm run build && npx vitest run src/lib` |
| **Full acceptance command** | `cd daml && daml test` + the live E2E assertion run (07-03 Task 2, orchestrator-run) |
| **Estimated runtime** | web build ~10–20s; lib tests ~2s; daml test ~30–60s; live E2E ~1–2 min (incl. JVM boot) |

---

## Sampling Rate

- **After every UI task commit (07-01):** `cd web && npm run build` (tsc typecheck + bundle) + `npx vitest
  run src/lib` if any cited file is touched (it always is in this phase).
- **After the docs task (07-02):** the Makefile `.PHONY` parse + the root npm-script resolve check + the
  README content grep.
- **Acceptance (07-03, orchestrator-run):** `daml test` 6/6, then the live API/ledger assertions, then the
  screenshot capture.
- **Max feedback latency:** ~20s for the UI gate; ~1–2 min for the full live acceptance run.

---

## Per-Task Verification Map

> UI rendering/animation fidelity is validated by the always-on build + the §4-value `lib` tests +
> `gsd-ui-review` (visual comp diff) + the 07-03 live screenshots. The acceptance live-E2E + screenshot
> items are **orchestrator-run / manual-but-executed-this-phase** (NOT deferred — the user explicitly
> wants the live acceptance run this phase).

| Task ID | Plan | Wave | Requirement | Validated Behavior | Test Type | Automated Command | Exists | Status |
|---------|------|------|-------------|--------------------|-----------|-------------------|--------|--------|
| 07-01-01 | 01 | 1 | UI-07 | PriceReveal (CLEARS AT 4px · unit words 13px/.6 · CTA 30px/15px 28px) + CrossingChart p*/q= fill-opacity .7 — build + §4 helpers untouched | build + unit | `cd web && npm run build && npx vitest run src/lib` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | UI-07 | TheatreView headline `14px 0 18px` + inline-baseline sealed-count row (count + Inter 12px/.2em/.7 caption) + CTA row `flex gap 14px` | build + unit | `cd web && npm run build && npx vitest run src/lib` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | UI-07 | AgentRationale rank-1 row bound to live `preview` (clearingPrice/matchedVolume, §4 fallback, no crash) + five-view comp sweep | build + unit | `cd web && npm run build && npx vitest run src/lib` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 1 | DEMO-01 | Makefile `.PHONY` granular+composite targets = real run wiring; root npm scripts (ledger/tokens/solver/web/test) resolve; no operator-token/key in browser | parse + resolve | `node -e "..." && grep -c '^\.PHONY' Makefile` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 1 | DEMO-01 | README documents every command, ports 7575/4000/5173, §4/$100.00 reference, manual flow; stale "stubbed"/"Makefile arrives" gone | content grep | `grep -qi 'make demo' README.md && grep -q '100.00' README.md && ! grep -qi 'stubbed' README.md` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 2 | DEMO-02 | All six Daml Script tests pass (clears_at_100 / settled_balances / atomicity / privacy_orders / privacy_confirmations / clear_rejects_bad_allocation) | daml test | `cd daml && daml test` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 2 | DEMO-03 | Live E2E: solve-preview 100.00 + matched 10 + rationale; settle Settled; per-desk Order+TradeConfirmation privacy; legs A↔B 8@100 + A↔C 2@100; balances §4 finals; double-settle 409 | live assert (orchestrator-run) | `node scripts/verify-privacy.mjs` + curl assertions on :4000 | ✅ | ⬜ pending |
| 07-03-03 | 03 | 2 | DEMO-04 | `docs/01-privacy-3up.png` + `docs/02-atomic-settlement.png` from the polished live UI; `docs/DEMO.md` 3-min script | screenshot + file (orchestrator-run/manual) | `Claude_Preview` MCP capture + `test -f docs/DEMO.md && grep -q '100.00' docs/DEMO.md` | ✅ | ⬜ pending |

---

## Wave 0 Requirements

None. All test infrastructure already exists:
- `web/vitest.config.ts` + `web/src/lib/*.test.ts` (curve/balance/solverParse, 11 §4-value tests) — built P6.
- `daml test` (the six Script tests) — built P1–P3.
- `scripts/verify-privacy.mjs` (live per-party `/v1/query` wire check) — built P3.
- `solver/` vitest suite (33 green) — built P4–P5.

`wave_0_complete: true`.

---

## Manual-Only / Orchestrator-Run Verifications

> These are EXECUTED THIS PHASE (the user explicitly wants the live acceptance run now) — they are
> orchestrator-run, NOT deferred.

| Behavior | Requirement | Why Orchestrator-Run | Instructions |
|----------|-------------|----------------------|--------------|
| Live E2E acceptance flow (boot `daml start`/solver/web → solve-preview 100.00 → settle Settled → per-desk privacy → aggregate legs → 409) | DEMO-03 | Long-running background processes (:7575/:4000/:5173) can't be held inside a subagent | 07-03 Task 2 — booted + driven by the parent agent; assertions captured in the SUMMARY |
| Two pitch screenshots from the polished live UI | DEMO-04 | Browser-preview tooling + a live render are required; the WS-heavy Privacy view risks a net-idle capture timeout | 07-03 Task 3 — `Claude_Preview` MCP first; Settlement (fetch plane, no WS) captures cleanly; if Privacy is WS-blocked, document precisely with evidence + best-effort frame (never fake) |
| `make demo` live smoke | DEMO-01 | `make` is absent on the Windows dev box | `make -n demo` parses where `make` exists; the verified path on Windows is the root npm-script mirror + the documented manual 4-terminal flow |
| Visual comp fidelity (UI-07 → target 24/24) | UI-07 | Pixel/animation fidelity can't be unit-asserted | `gsd-ui-review` re-audit against `Umbra design/Umbra.dc.html` + the 07-03 captured screenshots; the AgentRationale binding flag must be cleared |

---

## Validation Sign-Off

- [x] Every task has an `<automated>` command that resolves to an existing tool (no Wave-0 scaffold needed).
- [x] Sampling continuity: no 3 consecutive code tasks without a build/typecheck (each 07-01 task gates on
      `web build` + `lib` tests).
- [x] DEMO-02 gate (`daml test` 6/6) + DEMO-03 live assertions + DEMO-04 screenshots all mapped.
- [x] Live-E2E + screenshots marked orchestrator-run / executed-this-phase (NOT deferred).
- [x] No watch-mode flags (`vitest run` / `npm run build` / `daml test`).
- [x] `nyquist_compliant: true` set (per-task map filled from the plan tasks).

**Approval:** approved 2026-06-27
