---
phase: 1
slug: skeleton-version-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | **Daml Script** (built into SDK 2.10.4; no install) |
| **Config file** | `daml/daml.yaml` (declares the `daml-script` dependency + `init-script`) |
| **Quick run command** | `cd daml && daml build` (proves the six templates + placeholder choices compile — the core P1 gate) |
| **Full suite command** | `cd daml && daml test` (runs every `Script ()` test in `Umbra/Tests.daml`) |
| **Estimated runtime** | ~30–60 seconds (`daml build` ~15s warm; `daml test` ~20–40s incl. first JVM boot) |

> Phase 1 has **no behavioral clearing/settlement/privacy logic to assert** — those are Phases 2–3 (spec §16 tests 1–6). P1 validation is narrow: the project builds, `daml start` boots to JSON API ready on :7575, and `Setup:initialize` seeds the §4 world without error.

---

## Sampling Rate

- **After every task commit:** Run `cd daml && daml build` (fast; proves compile — the dominant P1 signal).
- **After every plan wave:** Run `cd daml && daml test` (runs the Daml Script smoke/integration tests).
- **Before `/gsd-verify-work`:** `daml build` green + `daml start` boots to JSON API ready (`curl http://localhost:7575/readyz`) + `Setup:initialize` runs + `daml test` green.
- **Max feedback latency:** ~60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-XX | TBD | 1 | LEDG-04 | — | SDK pinned, dev-token caveat recorded | static | inspect `daml/daml.yaml` `sdk-version: 2.10.4` + `DECISIONS.md`; `daml version` | ❌ W0 | ⬜ pending |
| 01-XX | TBD | 1 | LEDG-01 | T-1 cross-desk leak | frozen signatory/observer shapes | smoke | `cd daml && daml build` then `daml start` + `curl :7575/readyz` | ❌ W0 | ⬜ pending |
| 01-XX | TBD | 2 | LEDG-03 | T-1 tampering | `ensure` range checks; operator-only Split/Merge/Reassign | unit | `cd daml && daml test` → `test_asset_split_merge` | ❌ W0 | ⬜ pending |
| 01-XX | TBD | 2 | LEDG-02 | — | §4 holdings minted exactly | integration | `cd daml && daml test` → `test_setup_seeds` (asserts 4 parties + 5 Assets + §4 quantities) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · Task IDs finalized by the planner.*

---

## Wave 0 Requirements

- [ ] `daml/daml.yaml` — pins `sdk-version: 2.10.4`, declares `daml-script` + `daml-stdlib`/`daml-prim`, sets `init-script: Umbra.Setup:initialize`
- [ ] `daml/Umbra/Tests.daml` — `test_setup_seeds` (LEDG-02), `test_asset_split_merge` (LEDG-03)
- [ ] `daml/Umbra/Setup.daml` — `initialize` (+ party export) — the thing under test
- [ ] No framework install needed — Daml Script ships with the SDK; `daml test` is the runner

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `daml start` boots sandbox + JSON API on :7575 with hot-reload | LEDG-01 | Long-running process; not a `daml test` assertion | `cd daml && daml start`; wait for "JSON API ready"; `curl http://localhost:7575/readyz` → 200; observe `r`+Enter hot-reload |
| Version gate recorded before other work | LEDG-04 | Process/ordering check, not a code assertion | Confirm `DECISIONS.md` records SDK 2.10.4 + the 2.x HTTP JSON API line + the React-18 `--legacy-peer-deps` note, committed before template work |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify (`daml build`/`daml test`) or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (daml.yaml, Tests.daml, Setup.daml)
- [ ] No watch-mode flags (`daml test` runs once and exits)
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
