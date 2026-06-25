---
phase: 5
slug: ai-solver-agent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-26
---

# Phase 5 — Validation Strategy

> Per-phase validation contract. Source: `05-RESEARCH.md` → `## Validation Architecture`. The verify-don't-trust equality gate is the high-value surface; the SDK is mocked so every path is fast and deterministic in CI.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (already installed in `solver/`) |
| **Config file** | `solver/vitest.config.ts` (exists) |
| **Quick run command** | `cd solver && npx vitest run src/agent.test.ts` |
| **Full suite command** | `cd solver && npx vitest run` |
| **Estimated runtime** | ~4 seconds (SDK mocked — no network) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/agent.test.ts`
- **After every plan wave:** `npx vitest run` (full suite — must stay green incl. the 21 P4 tests)
- **Before `/gsd-verify-phase`:** full suite green + `tsc --noEmit` clean
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Detailed task IDs filled by the planner. The Claude call is mocked in every test — no live `ANTHROPIC_API_KEY` needed.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner) | — | — | AGENT-01/02 | — | agreement: Claude proposes correct §4 → verified:true, deterministic settles | unit (mocked SDK) | `npx vitest run src/agent.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | — | AGENT-02 | — | disagreement: wrong proposal → equality gate rejects → §4 still 100.00, source:"deterministic-fallback" | unit (mocked SDK) | `npx vitest run src/agent.test.ts` | ❌ W0 | ⬜ pending |
| (planner) | — | — | AGENT-02/03 | T-05-secrets | unavailable: no key / SDK throws → deterministic + neutral rationale, no crash, ANTHROPIC_API_KEY never in response/log | unit (mocked SDK) | `npx vitest run src/agent.test.ts` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `npm install @anthropic-ai/sdk@0.106.0` in `solver/` (the ONE new dependency; spec-mandated, pinned)
- [ ] `solver/src/agent.test.ts` — the three mocked-SDK paths + sentinel-key assertion (AGENT-01/02/03)

*All other infra (vitest, zod, dotenv) already present from Phase 4.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Claude rationale appears in `solve-preview` with a real `ANTHROPIC_API_KEY` | AGENT-01/03 | Requires a real API key + network; CI uses the mock | Set `ANTHROPIC_API_KEY`; `daml start`; `cd solver && npm run dev`; `GET /round/:id/solve-preview` → assert `rationale` is a 2–3 sentence string and `agent.verified` reflects the gate |

*The correctness guarantee (verify-don't-trust) is fully automated via the mocked equality-gate tests; only the live prose generation is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the SDK install + agent.test.ts stubs
- [ ] No watch-mode flags (use `vitest run`)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set after the planner fills the per-task map

**Approval:** pending
