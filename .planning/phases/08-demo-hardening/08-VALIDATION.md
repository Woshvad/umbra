---
phase: 8
slug: demo-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `08-RESEARCH.md` § Validation Architecture. All commands ground in the CURRENT v2 stack (solver on :4100, vitest 2.1.9, `daml test`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `2.1.9` (solver + web) · Daml Script (`daml test`) |
| **Config file** | `solver/vitest.config.ts` · `web/` (vitest via package.json) · `daml/daml.yaml` |
| **Quick run command** | `cd solver && npm test` |
| **Full suite command** | `cd solver && npm test && cd ../web && npm test && cd ../daml && daml build && daml test` |
| **Estimated runtime** | ~10 s golden vitest subset · ~2–4 min with `daml test` (SDK build) |

---

## Sampling Rate

- **After every task commit:** Run `cd solver && npx vitest run <touched file>` (< 5 s golden subset)
- **After every plan wave:** Run `cd solver && npm test && cd ../web && npm test` (full unit suites)
- **Before `/gsd-verify-work`:** Full suite + `daml test` green; live E2E of WOW-01 (empty peek), WOW-02 (verbatim reject → $100.00), WOW-05 (PDF opens on-brand)
- **Max feedback latency:** ~5 s (golden vitest subset)

---

## Per-Task Verification Map

> Tasks are assigned final `NN-PP-TT` IDs by the planner. Rows below map each phase requirement/behavior to its automated proof and file-exists status (from RESEARCH.md § Phase Requirements → Test Map). `❌ W0` = Wave 0 must create/extend the test before the behavior can sample green.

| Behavior | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|----------|-------------|------------|-----------|-------------------|-------------|--------|
| §4 clears at 100.00, fills A=10/B=8/C=2 | TRUST-01 | — | unit (golden) | `cd solver && npx vitest run auction.test.ts` | ✅ | ⬜ pending |
| ≥5 §8 scenarios (ties, no-cross, imbalance) | TRUST-01 | — | unit (golden) | `cd solver && npx vitest run auction.test.ts` | ✅ | ⬜ pending |
| verify-don't-trust equality gate (agree/disagree) | TRUST-01 | — | unit (golden) | `cd solver && npx vitest run agent.test.ts` | ✅ | ⬜ pending |
| on-ledger `Round.Clear` rejects bad allocation | TRUST-01 | — | daml | `cd daml && daml test` | ✅ | ⬜ pending |
| golden vitest subset + `daml test` run in CI on push/PR | TRUST-01 | — | ci | `.github/workflows/ci.yml` green | ❌ W0 | ⬜ pending |
| keyless → $100.00 deterministic | TRUST-02 | — | unit | `cd solver && npx vitest run agent.test.ts` | ✅ path; ❌ W0 test | ⬜ pending |
| SDK error / malformed / disagreement → $100.00 | TRUST-02 | — | unit | `cd solver && npx vitest run agent.test.ts` | ✅ partial | ⬜ pending |
| **timeout** → $100.00 (deadline via Promise.race) | TRUST-02 | — | unit | `cd solver && npx vitest run agent.test.ts` | ❌ W0 (no timeout yet) | ⬜ pending |
| proof bundle has all fields; NO key/token present | TRUST-03 | T-secret | unit (secret sweep) | `cd solver && npx vitest run proof.test.ts` | ❌ W0 | ⬜ pending |
| tamper `wrong-price` → verbatim `clearingPrice does not match…` | WOW-02 | — | integration (stubbed ledger) | `cd solver && npx vitest run ledger.test.ts` | ❌ W0 | ⬜ pending |
| tamper `overfill` → `fills not conserved` / `allocations do not match` | WOW-02 | — | integration | `cd solver && npx vitest run ledger.test.ts` | ❌ W0 | ⬜ pending |
| correct clear still settles $100.00 after tamper | WOW-02 | — | integration | `cd solver && npx vitest run` | ✅ settle path unchanged | ⬜ pending |
| English → `{side,qty,limit}`; malformed → 422 | WOW-03 | T-injection | unit (mocked SDK) | `cd solver && npx vitest run api.test.ts` | ❌ W0 | ⬜ pending |
| `/parse-order` never echoes the key | WOW-03 | T-secret | unit (secret sweep) | `cd solver && npx vitest run api.test.ts` | ✅ pattern; extend | ⬜ pending |
| SSE emits deltas; error → single-shot fallback frame | WOW-04 | T-secret | unit (mocked stream) | `cd solver && npx vitest run api.test.ts` | ❌ W0 | ⬜ pending |
| post-round brief generated at settle (copy/download) | WOW-04 | — | unit | `cd solver && npx vitest run api.test.ts` | ❌ W0 | ⬜ pending |
| peek returns `[]`/403 for rival Order under desk token | WOW-01 | T-access | manual E2E + unit | live peek + `web` render test | ❌ W0 | ⬜ pending |
| on-brand HTML carries the 4 bundles + brand tokens | WOW-05 | — | unit (string assert, no Chrome) | `cd solver && npx vitest run proofpack.test.ts` | ❌ W0 | ⬜ pending |
| no `:4000` literal remains in `web/src` | WOW-05 / port-drift | — | lint (grep) | `! grep -rn ':4000' web/src` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `solver/src/proof.test.ts` — TRUST-03 bundle fields + secret-absence (key/token/prompt never present)
- [ ] `solver/src/proofpack.test.ts` — WOW-05 HTML render (brand tokens + 4 bundles), Chrome-spawn mocked
- [ ] Extend `solver/src/agent.test.ts` — TRUST-02 timeout case + formalized degradation-ladder table test
- [ ] Extend `solver/src/ledger.test.ts` — WOW-02 tamper `wrong-price` + `overfill` verbatim-error assertions (stubbed `submitAndWait` returning the assertMsg body)
- [ ] Extend `solver/src/api.test.ts` — `/parse-order` (mock), rationale SSE (mock), `/round/:id/proof`, secret-sweep on ALL new endpoints
- [ ] Grep/lint check that no `:4000` literal remains in `web/src`
- [ ] `.github/workflows/ci.yml` — golden vitest (always) + `daml test` (SDK-install job)
- [ ] Add `solver/proofs/` to `.gitignore`; add `web/.env.example`

*Existing infrastructure (vitest 2.1.9 + `daml test`, 6 solver test files, 33+ green tests) covers the golden regression core; Wave 0 fills the new-endpoint / new-artifact gaps above.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Raw JSON Ledger API v2 peek returns `[]`/403 live | WOW-01 | Requires live Canton LocalNet + real per-party token; the credibility IS the raw wire response, not a mock | Boot LocalNet + seed; select bankA in UI; run the peek console against bankB's `Order` template; observe empty/403 + verdict line |
| Break-the-AI: verbatim on-ledger rejection then $100.00 settle | WOW-02 | Requires live ledger to produce the actual `Round.Clear` assertion text | Live round open; operator "Break the AI" control → observe verbatim reject text → correct clear settles at $100.00 |
| Proof-pack PDF opens on-brand | WOW-05 | Chrome headless render of final PDF is visual; unit test asserts HTML strings only | Post-settle one-click download; open PDF; confirm Umbra tokens (#F4F1EA/#0A0A0A/#D6FB3C), 4 bundles present |
| Rationale streams live in the UI typewriter | WOW-04 | SSE→typewriter render is a live visual behavior | Trigger solve; observe `AgentRationale` types out deltas live; kill stream → single-shot fallback |

*Automated coverage backs each of the above at the unit level (mocked SDK/ledger/Chrome); the manual step confirms the live-stack integration the demo depends on.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING (❌ W0) references
- [ ] No watch-mode flags (all commands use `vitest run`, not `vitest`)
- [ ] Feedback latency < 5 s (golden subset)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner maps task IDs)

**Approval:** pending
