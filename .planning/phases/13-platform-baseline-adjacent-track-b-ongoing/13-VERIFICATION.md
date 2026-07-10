---
phase: 13-platform-baseline-adjacent-track-b-ongoing
verified: 2026-07-10T22:30:00Z
status: human_needed
score: 4/4 must-haves offline-verified (live confirmation → UAT)
overrides_applied: 0
re_verification:
  # No prior VERIFICATION.md — initial verification
human_verification:
  - test: "Boot an OTLP collector + Prometheus/Alertmanager, set OTEL_EXPORTER_OTLP_ENDPOINT, run a round, confirm spans/metrics arrive and a tripped alert delivers"
    expected: "Solver→JSON Ledger API v2 spans appear in the collector; metrics scrape; an umbra-rules.yml alert fires and delivers"
    why_human: "Requires external running infra (OTLP collector + Prometheus/Alertmanager) not present on this box (OPS-01)"
  - test: "Boot dev Vault (ops/vault/docker-compose.vault.yml), set SECRETS_PROVIDER=vault, run a round, rotate a KV v2 version with scripts/rotate-secret.mjs, confirm the new value is re-read with no downtime"
    expected: "Secrets read from live Vault; rotation picked up on next read without restart"
    why_human: "Requires a running HashiCorp Vault cluster; only the env backend + stubbed-fetch KV v2 parse are offline-verifiable (OPS-02)"
  - test: "Point an external FIX-speaking OMS/test client at the acceptor, send a NewOrderSingle (35=D), confirm a sealed order is created and a well-formed ExecutionReport (35=8) returns"
    expected: "Real counterparty FIX handshake produces a sealed order + valid ExecutionReport over the wire"
    why_human: "Requires an external FIX-speaking OMS; only known-good-vector parse/build is offline-verifiable (OPS-05)"
  - test: "Boot the 3-node Canton LocalNet, upload the DAR, run the RFQ + issuance/coupon/redeem scripts end-to-end, confirm on-ledger atomic settle"
    expected: "RfqRequest→firm Quote→accept settles 1×1 via settleBatch; issuance mints Holdings at one uniform price; coupon pays pro-rata; redeem retires + conserves — all on live LocalNet"
    why_human: "Requires a booted 3-node Canton LocalNet (multi-GB, not on this box); daml test proves the same logic offline (ADJ-02, ADJ-03)"
---

# Phase 13: Platform Baseline & Adjacent Verification Report

**Phase Goal:** The operational baseline any serious venue is assumed to have, plus the adjacent capabilities that widen Umbra's story — built opportunistically alongside the waves, with external dependencies scheduled.
**Verified:** 2026-07-10T22:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

This phase follows the project's established "Built · offline-verified · live UAT pending" pattern (Phases 8–12). Every requirement ships an offline-verifiable substance layer (unit tests / `daml test` / graceful keyless-or-env fallback) plus a live gate that legitimately requires external infrastructure not available on this box. The offline substance is scored as delivered; the live-only confirmations are routed to human verification (not gaps), consistent with 13-VALIDATION.md "Manual-Only Verifications".

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ------- | ---------- | -------------- |
| 1 | OTel tracing spans solver→JSON Ledger API v2→Canton; structured logs, metrics, alerting; public status page reports venue/round health (OPS-01) | ✓ VERIFIED (offline) · live→UAT | `solver/src/telemetry.ts` (245 L, NodeSDK + spans), `logger.ts` (60 L, secret-redacting), `alerts/umbra-rules.yml` present; telemetry-first boot + SIGTERM flush wired in `index.ts` (L237-261); `/health` + `/status` served. Live collector/Grafana/alert delivery → UAT |
| 2 | Secrets in a vault with rotation (not `.env`); order submission idempotent under a round-lifecycle FSM (OPS-02, OPS-03) | ✓ VERIFIED (offline) · live Vault→UAT | `secrets.ts` (env\|vault SecretsProvider, KV v2 fetch), `ops/vault/docker-compose.vault.yml`, `scripts/rotate-secret.mjs`; `idempotency.ts` (replay-by-key + canonical-body sha256, 422 on reuse) + `fsm.ts` (pure transition, 409 illegal) — 14/14 offline tests pass. Live Vault rotation → UAT |
| 3 | Signed, retried webhooks for lifecycle events; a $100.00 sandbox round; a FIX order-entry gateway accepts sealed bids (OPS-04, OPS-05) | ✓ VERIFIED (offline) · live sink/OMS→UAT | `webhooks.ts` (HMAC `createHmac`+`timingSafeEqual`, ~5-attempt backoff, self-clearing timer), `sandbox.ts` asserts EXACTLY $100.00 / A=10·B=8·C=2, `fix.ts` (FIX 4.4 subset parse/build/session, never-throws); endpoints `/webhooks`, `/sandbox/round`, `/fix` wired in `api.ts`. Live webhook sink + counterparty OMS → UAT |
| 4 | Competing AI solvers refereed by deterministic recompute; RFQ side-mode + primary-issuance/coupon lifecycle available (ADJ-01, ADJ-02, ADJ-03) | ✓ VERIFIED (offline) · live LocalNet→UAT | `agent.ts proposeCompeting` (L622) refereed by frozen §8 core, advisory-only leaderboard never on settle path; `Rfq.daml` (113 L) + `Issuance.daml` (201 L); `daml test` green incl. 4× `test_rfq_*`, `test_issuance_uniform_price`/`_coupon_prorata`/`_redeem`; `/competing`, `/rfq*`, `/issuance*` wired; panels on Agent/Desk/Theatre views. Live LocalNet settle → UAT |

**Score:** 4/4 truths offline-verified (live confirmation routed to human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `solver/src/telemetry.ts` | OTel NodeSDK + spans (OPS-01) | ✓ VERIFIED | 245 lines; console-exporter fallback when OTLP endpoint unset |
| `solver/src/logger.ts` | Secret-redacting logs (OPS-01) | ✓ VERIFIED | 60 lines; drops sentinel keys |
| `alerts/umbra-rules.yml` | Alert rules (OPS-01) | ✓ VERIFIED | Present at repo root |
| `solver/src/secrets.ts` | SecretsProvider env\|vault (OPS-02) | ✓ VERIFIED | 91 lines; lazy vault vars, env byte-unchanged default |
| `solver/src/status.ts` | Token-free /status + /status.html (OPS-02) | ✓ VERIFIED | 288 lines; `renderStatusHtml` self-contained doc, zero private-order fields |
| `ops/vault/docker-compose.vault.yml` + `scripts/rotate-secret.mjs` | Dev Vault + rotation (OPS-02) | ✓ VERIFIED | Both present |
| `solver/src/idempotency.ts` | Idempotency middleware (OPS-03) | ✓ VERIFIED | 125 lines; canonical-body hash, 422 on reuse |
| `solver/src/fsm.ts` | Round-lifecycle FSM (OPS-03) | ✓ VERIFIED | 57 lines; Open→Closed→Cleared→Settled, 409 illegal |
| `solver/src/webhooks.ts` | Signed retried webhooks (OPS-04) | ✓ VERIFIED | 219 lines; HMAC + backoff + delivery log |
| `solver/src/sandbox.ts` | $100.00 sandbox round (OPS-04) | ✓ VERIFIED | 72 lines; asserts p*=100.00, {A:10,B:8,C:2} |
| `solver/src/fix.ts` | FIX 4.4 subset gateway (OPS-05) | ✓ VERIFIED | 230 lines; parse/build/map/acceptor, BodyLength+CheckSum |
| `daml/Umbra/Rfq.daml` | RFQ DvP (ADJ-02) | ✓ VERIFIED | 113 lines; keyless RfqRequest+Quote+AcceptQuote→settleBatch |
| `daml/Umbra/Issuance.daml` | Uniform-price issuance + coupon/redeem (ADJ-03) | ✓ VERIFIED | 201 lines; reuses computeClearing, Coupon, Redeem |
| `solver/src/agent.ts::proposeCompeting` | Competing solvers refereed by §8 (ADJ-01) | ✓ VERIFIED | Exported L622; advisory leaderboard off settlement path |
| `web/src/components/SolverLeaderboard.tsx` | S2 leaderboard (ADJ-01) | ✓ VERIFIED | Wired into `AgentView.tsx` |
| `web/src/components/RfqPanel.tsx` | S3 RFQ panel (ADJ-02) | ✓ VERIFIED | Wired into `DeskView.tsx` |
| `web/src/components/IssuancePanel.tsx` | S4 issuance panel (ADJ-03) | ✓ VERIFIED | Wired into `TheatreView.tsx` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `index.ts` boot | `telemetry.ts` | telemetry-first init + SIGTERM shutdown flush | ✓ WIRED | L237-261 |
| `api.ts` `/competing` | `agent.proposeCompeting` | `deps.proposeCompeting(views, configs)` | ✓ WIRED | L1361; advisory result, deterministic settles |
| `api.ts` `/rfq*` | `ledger.ts` postRfq/listQuotes/acceptQuote | `deps.*` handlers | ✓ WIRED | L1374-1412; accept→settleBatch DvP |
| `api.ts` `/issuance*` | `ledger.ts` openIssuance/clearIssuance/payCoupon/redeem | `deps.*` handlers | ✓ WIRED | L1416-1463; clear recomputes §8 computeClearing |
| `api.ts` `/sandbox/round` | `sandbox.ts` | fixture asserts $100.00 | ✓ WIRED | L1260 |
| `api.ts` `/fix` | `fix.ts` handleFixMessage | acceptor 35=D→35=8 | ✓ WIRED | L1288 |
| `web/solver.ts` seam | `api.ts` competing/rfq/issuance | credential-free `call<>` | ✓ WIRED | L457-515 |
| `SolverLeaderboard/RfqPanel/IssuancePanel` | Agent/Desk/Theatre views | component import + render | ✓ WIRED | all three imported in their views |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| OPS-04 sandbox clears $100.00 | `npx vitest run src/sandbox.test.ts` | 4 passed | ✓ PASS |
| OPS-03 FSM rejects illegal transitions | `npx vitest run src/fsm.test.ts` | 7 passed | ✓ PASS |
| OPS-03 idempotency replay/422 | `npx vitest run src/idempotency.test.ts` | 7 passed | ✓ PASS |
| OPS-05 FIX parse/build/checksum | `npx vitest run src/fix.test.ts` | 19 passed | ✓ PASS |
| §4 fixture clears $100.00 (orchestrator) | `daml test` incl. `test_clears_at_100` | exit 0 | ✓ PASS |
| ADJ-02/03 RFQ+issuance daml logic (orchestrator) | `daml test` incl. `test_rfq_*`/`test_issuance_*` | exit 0 | ✓ PASS |
| Full solver/web suites (orchestrator) | solver vitest 284/284, web vitest 136/136 | green | ✓ PASS |

Targeted re-run this session: 37/37 passed across sandbox+fsm+idempotency+fix.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| OPS-01 | 13-01, 13-07 | Observability/OTel/logs/metrics/alerts | ✓ SATISFIED (offline) | telemetry/logger/alerts + boot wiring; live collector→UAT |
| OPS-02 | 13-02, 13-07 | Secrets→Vault + token-free status page | ✓ SATISFIED (offline) | secrets/status/vault-compose/rotate; live Vault→UAT |
| OPS-03 | 13-03, 13-07 | Idempotency keys + round-lifecycle FSM | ✓ SATISFIED | fully offline-verified (14 tests) |
| OPS-04 | 13-04, 13-09 | Signed retried webhooks + $100 sandbox | ✓ SATISFIED (offline) | webhooks/sandbox; live sink→UAT |
| OPS-05 | 13-05, 13-09 | FIX 4.4 subset gateway | ✓ SATISFIED (offline) | fix.ts + /fix; live OMS handshake→UAT |
| ADJ-01 | 13-10, 13-11, 13-12 | Competing AI solvers refereed by §8 | ✓ SATISFIED | proposeCompeting + leaderboard; offline via mocked SDK |
| ADJ-02 | 13-06, 13-11, 13-13 | RFQ side-mode via same DvP | ✓ SATISFIED (offline) | Rfq.daml + tests + /rfq* + RfqPanel; live LocalNet→UAT |
| ADJ-03 | 13-08, 13-11, 13-14 | Primary issuance + coupon/redeem lifecycle | ✓ SATISFIED (offline) | Issuance.daml + tests + /issuance* + IssuancePanel; live LocalNet→UAT |

All 8 declared requirements covered; no orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No unreferenced TBD/FIXME/XXX debt markers in any phase-13 file | ℹ️ Info | Clean; completion is auditable |

### Human Verification Required

Four live-only confirmations — each has a verified offline substance layer and a graceful fallback; only the external-infra confirmation is deferred. These are UAT, not gaps.

1. **OPS-01 live telemetry + alerting** — Boot an OTLP collector + Prometheus/Alertmanager, set `OTEL_EXPORTER_OTLP_ENDPOINT`, run a round; confirm spans/metrics arrive and an `umbra-rules.yml` alert delivers.
2. **OPS-02 live Vault rotation** — Boot dev Vault, `SECRETS_PROVIDER=vault`, run a round, rotate a KV v2 version; confirm the new value is re-read without downtime.
3. **OPS-05 real FIX handshake** — Point an external FIX-speaking OMS at the acceptor, send a NewOrderSingle (35=D); confirm a sealed order + valid ExecutionReport (35=8).
4. **ADJ-02/03 live LocalNet settle** — Boot the 3-node Canton LocalNet, upload the DAR, run the RFQ + issuance/coupon/redeem scripts; confirm on-ledger atomic settle.

### Gaps Summary

No gaps. All 8 requirements (OPS-01..05, ADJ-01..03) are substantively implemented, wired end-to-end (module → API endpoint → web client seam → view), and offline-verified via unit tests and `daml test`. The canonical §4 fixture still clears exactly $100.00 (sandbox assertion + `test_clears_at_100`, confirmed green). ADJ-01's competing solvers are correctly refereed by the frozen deterministic §8 core and kept strictly off the settlement path. The only outstanding items are four live confirmations requiring external infrastructure (OTLP collector, HashiCorp Vault, a counterparty FIX OMS, a booted Canton LocalNet) that cannot run on this box — routed to UAT per the project's established Built · offline-verified · live-UAT-pending pattern.

---

_Verified: 2026-07-10T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
