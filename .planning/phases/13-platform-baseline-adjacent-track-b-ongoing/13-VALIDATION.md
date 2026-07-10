---
phase: 13
slug: platform-baseline-adjacent-track-b-ongoing
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
approved: 2026-07-10
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 13-RESEARCH.md "## Validation Architecture". Phase 13 is ~80% backend (solver/TS + Daml); every new module ships a co-located vitest with a secret-sweep, and the §4 golden + `daml test` remain the continuous regression gate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (solver/ + web/) · Daml Script `daml test` (daml/) |
| **Config file** | `solver/vitest.config.*` / `web/vitest.config.*` (existing) · `daml/daml.yaml` |
| **Quick run command** | `cd solver && npx vitest run` (per-module: `npx vitest run src/<module>.test.ts`) |
| **Full suite command** | `cd solver && npx vitest run && cd ../web && npx vitest run` + `daml test` (Bash: `/c/Users/woshv/bin/daml test`, cwd `daml/`) |
| **Estimated runtime** | solver ~15–40s · web ~10–20s · `daml test` ~60–120s (JVM) |

---

## Sampling Rate

- **After every task commit:** Run the quick per-module command (`npx vitest run src/<module>.test.ts`).
- **After every plan wave:** Run the full solver+web vitest suites; run `daml test` after any Daml-touching wave.
- **Before verify:** Full suite green — solver vitest, web vitest, `daml test` (0 fail/error), and the §4 golden ($100.00 / A=10·B=8·C=2) intact.
- **Max feedback latency:** < 45s for solver/web module tests; `daml test` reserved for Daml waves.

---

## Per-Task Verification Map

> Populated per-plan by the planner (each task carries `<acceptance_criteria>` + an `<automated>` verify command). The per-requirement validation architecture below is the source; task IDs are assigned when PLAN.md files are written.

| Requirement | Observable validation (automated) | Test type | Live/UAT gate |
|-------------|-----------------------------------|-----------|---------------|
| OPS-01 Observability | vitest: NodeSDK inits with console-exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` unset; manual spans emit round.id; secret-redacting logger drops sentinel keys (secret-sweep) | unit | live OTLP collector/Grafana + alert delivery → UAT |
| OPS-02 Vault + status | vitest: `SecretsProvider` `env` backend returns current values byte-unchanged; `vault` backend parses KV v2 shape (stubbed fetch); `/status` JSON + `/status.html` contain zero private-order fields (order+secret sweep) | unit | live HashiCorp Vault cluster + zero-downtime rotation → UAT |
| OPS-03 Idempotency + FSM | vitest: replay same key+body → identical stored response (no re-exec); same-key-diff-body → 422; pure `transition()` rejects illegal moves (409); §4 unaffected | unit | — (fully offline-verifiable) |
| OPS-04 Webhooks + sandbox | vitest: HMAC signature verifies via `timingSafeEqual`; retry backoff fires N attempts on stubbed failing sink; `POST /sandbox/round` asserts $100.00/A=10·B=8·C=2 | unit | live external webhook sink → UAT |
| OPS-05 FIX gateway | vitest: parse NewOrderSingle(35=D) known-good vector → correct fields; BodyLength(9)+CheckSum(10) match; build ExecutionReport(35=8); malformed → reject (no throw) | unit | live counterparty OMS handshake → UAT |
| ADJ-01 Competing solvers | vitest (mocked SDK): N configs proposed; only equal-to-deterministic eligible/verified; ranking by (matched↓,surplus↓); deterministic clear still settles; §4 = $100.00 | unit | — (offline via mocked SDK) |
| ADJ-02 RFQ | `daml test`: RfqRequest→firm signed Quote→accept-best settles 1×1 via `settleBatch`/`Round.Clear`, conserving cash+asset; keyless (fetch-by-cid) | daml script | live LocalNet run → UAT |
| ADJ-03 Issuance + coupon | `daml test`: uniform-price issuance mints Holdings at one price via `computeClearing`; `Coupon` pays pro-rata; `Redeem` retires holdings + conserves; §4 secondary bond untouched | daml script | live LocalNet run → UAT |

---

## Wave 0 Requirements

- [ ] OTel dependency install (`@opentelemetry/{api,sdk-node,sdk-metrics,exporter-trace-otlp-http,exporter-metrics-otlp-http}`, `--legacy-peer-deps`) — **gated by one `checkpoint:human-verify` dependency-legitimacy check** (packages are the official CNCF OpenTelemetry org; verify installed `.d.ts` import paths on the 0.2xx line).
- [ ] New solver test scaffolds: `otel`/`logger`, `secrets`, `status`, `idempotency`, `fsm`, `webhooks`, `sandbox`, `fix`, competing-solver additions to `agent.test.ts`.
- [ ] New Daml test scaffolds in `daml/Umbra/Tests.daml` for `Rfq.daml` + `Issuance.daml`.
- [ ] Regenerate + commit `web/daml.js` after any new Daml template (fresh-clone invariant).

*Existing vitest + `daml test` infrastructure covers all phase requirements; Wave 0 adds the OTel dep + new-module scaffolds only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Traces/metrics arrive at a real collector; dashboards + alert delivery fire | OPS-01 | Needs a running OTLP collector + Prometheus/Alertmanager (external infra) | Boot collector, set `OTEL_EXPORTER_OTLP_ENDPOINT`, run a round, confirm spans/metrics + a tripped alert |
| Secrets read from a live Vault + rotated with no downtime | OPS-02 | Needs a running HashiCorp Vault | Boot dev Vault (compose), `SECRETS_PROVIDER=vault`, run a round, rotate a KV version, confirm re-read |
| A real counterparty OMS submits a sealed bid over FIX | OPS-05 | Needs an external FIX-speaking OMS | Point an OMS/FIX test client at the acceptor, send NewOrderSingle, confirm sealed order + ExecutionReport |
| RFQ + issuance/coupon settle end-to-end on live LocalNet | ADJ-02, ADJ-03 | Needs a booted 3-node Canton LocalNet | Boot LocalNet, upload DAR, run the RFQ + issuance/coupon scripts, confirm on-ledger settle |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (all `vitest run`, not `vitest`)
- [x] Feedback latency < 45s (module tests)
- [x] `nyquist_compliant: true` set in frontmatter (after planner assigns task IDs)

**Approval:** approved 2026-07-10 (plan-checker: VERIFICATION PASSED, Dimension 8 PASS)
