---
phase: 4
slug: solver-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `04-RESEARCH.md` → `## Validation Architecture`. The deterministic §8 clearing is the high-value surface — every scenario maps to a fast, automated vitest case.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (TypeScript) |
| **Config file** | `solver/vitest.config.ts` (Wave 0 installs — `solver/` does not exist yet) |
| **Quick run command** | `cd solver && npx vitest run src/auction.test.ts` |
| **Full suite command** | `cd solver && npx vitest run` |
| **Estimated runtime** | ~3 seconds (pure functions, no I/O) |

---

## Sampling Rate

- **After every task commit:** Run the quick command (`npx vitest run src/auction.test.ts`)
- **After every plan wave:** Run the full suite (`npx vitest run`)
- **Before `/gsd-verify-phase`:** Full suite green + `tsc --noEmit` clean
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Detailed task IDs filled by the planner. Every clearing-algorithm task MUST carry a vitest acceptance command; the ledger/API tasks carry an import-smoke or live-wire check.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner) | 01 | 1 | CLEAR-02/03, SOLV-05 | — | §4 fixture clears at 100.00 (A10/B8/C2) | unit | `cd solver && npx vitest run src/auction.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | — | SOLV-04 | T-04-secrets | Operator token / ANTHROPIC_API_KEY never in any HTTP response | unit/integration | (assert no token in `GET /round/:id` body) | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `solver/package.json` + `solver/tsconfig.json` + `solver/vitest.config.ts` — scaffold the service (mirrors `web/` TS/ESM conventions)
- [ ] `vitest`, `express@4.19.x`, `cors`, `zod@3.23.x`, `dotenv@16.x`, `@daml/ledger@2.10.4`, `@daml.js/umbra-0.1.0` installed in `solver/`
- [ ] `solver/src/auction.test.ts` — the ≥5 clearing scenario stubs (CLEAR-02/03, SOLV-05)

*`solver/` is greenfield this phase — all test infrastructure is a Wave 0 dependency.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live round lifecycle (POST /round → submit orders → close → solve-preview → settle) against a running ledger | SOLV-01/02/03 | Requires `daml start` (:7575) live; exercises real `Round.Clear` DvP | `daml start`; `cd solver && npm run dev`; drive the 5 endpoints with curl; assert `GET /round/:id` shows clearingPrice 100.00 after settle and §4 balances on-ledger |

*The deterministic clearing (the correctness core) is fully automated via vitest; only the live wire-up is manual, consistent with Phases 1–3.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`solver/` scaffold + vitest)
- [ ] No watch-mode flags (use `vitest run`, never bare `vitest`)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills the per-task map)

**Approval:** pending
