---
phase: 12-real-on-chain-canton-devnet
plan: 04
subsystem: deploy-devnet
tags: [splice, devnet, canton, validator, compose, dar-vet, party-alloc, grantRights, oidc, client-credentials, postgres, pg_dump, prometheus, traffic-topup, runbook, sv-sponsor, external-gate, CHAIN-01, CHAIN-02, CHAIN-03]

# Dependency graph
requires:
  - phase: 12-real-on-chain-canton-devnet
    plan: 01
    provides: "the frozen umbra-0.1.0.dar (additive four-eyes templates → new package hash requiring re-vet, Pitfall 6)"
  - phase: 12-real-on-chain-canton-devnet
    plan: 03
    provides: "the OIDC/auth env the DevNet node reuses — audience https://canton.network.global, JWKS URL, LEDGER_API_ADMIN_USER == token sub, umbra-solver confidential client"
provides:
  - "deploy/devnet/validator-compose/{docker-compose.yaml,.env.example,README.md}: a parameterized Splice DevNet validator (participant + validator-app + wallet/CNS UIs + isolated Postgres); every SV-sponsorship/auth/traffic var as a placeholder; docker compose config valid"
  - "deploy/devnet/devnet-deploy.mjs: DAR upload+VET + namespaced party-alloc (umbra-*-1) + grantRights (admin == token sub) over the JSON Ledger API v2 with OIDC client-credentials; exported deploy/acquireToken with injectable fetchFn; node --check clean"
  - "deploy/devnet/devnet-deploy.test.mjs: 9 OFFLINE mocked-v2 checks asserting the token/upload/vet/allocate/grant request shapes; exit 0"
  - "deploy/devnet/postgres/docker-compose.yaml: isolated per-network Postgres 15 (:55434, off LocalNet :55432 / Keycloak :55433)"
  - "deploy/devnet/backup/pg-dump.sh: env-driven timestamped gzip backups + retention pruning; bash -n clean"
  - "deploy/devnet/monitoring/prometheus.yml: participant+validator scrape jobs + /readyz+/livez health probes"
  - "deploy/devnet/traffic-topup.env.example: TARGET_TRAFFIC_THROUGHPUT + MIN_TRAFFIC_TOPUP_INTERVAL (DevNet auto-taps coin)"
  - "deploy/RUNBOOK.md + deploy/SV-SPONSOR-CHECKLIST.md: the honest end-to-end ops procedure + external SV-sponsor outreach gate"
affects: [12-05-four-eyes-ui]

# Tech tracking
tech-stack:
  added:
    - "Splice validator compose (hyperledger-labs/splice images) — DevNet participant/validator (Docker, run at UAT)"
    - "Prometheus scrape config — participant + validator-app /metrics + /readyz+/livez"
    - "Postgres 15 — isolated per-network participant store (host :55434)"
  patterns:
    - "Deploy-core-as-pure-function: devnet-deploy.mjs exports deploy({fetchFn,token,darBuffer,...}) + acquireToken({fetchFn,...}) so the v2 request shapes are asserted OFFLINE against a recording fetch (no live node), mirroring solver/src/api.test.ts stubbing + deploy/keycloak/realm.test.mjs style"
    - "External-gate honesty labeling: every artifact header + the RUNBOOK/CHECKLIST tag each step [BUILT] / [EXTERNAL GATE] / [LIVE UAT]; booting the compose without SV sponsorship is explicitly NOT a live connection"
    - "Port isolation continued: DevNet participant :6975, Postgres :55434, Prometheus :9095 — all off the LocalNet (:3975/:2975/:4975/:55432/:9090) and Keycloak (:8443/:8081/:55433) stacks"
    - "Namespaced party hints everywhere (umbra-operator-1 / umbra-bankA-1 / ...) — DevNet <org>-<function>-<enumerator> enforcement (Pitfall 7)"

key-files:
  created:
    - "deploy/devnet/validator-compose/docker-compose.yaml"
    - "deploy/devnet/validator-compose/.env.example"
    - "deploy/devnet/validator-compose/README.md"
    - "deploy/devnet/devnet-deploy.mjs"
    - "deploy/devnet/devnet-deploy.test.mjs"
    - "deploy/devnet/postgres/docker-compose.yaml"
    - "deploy/devnet/backup/pg-dump.sh"
    - "deploy/devnet/monitoring/prometheus.yml"
    - "deploy/devnet/traffic-topup.env.example"
    - "deploy/RUNBOOK.md"
    - "deploy/SV-SPONSOR-CHECKLIST.md"
  modified: []

key-decisions:
  - "devnet-deploy.mjs treats DAR upload (POST /v2/packages octet-stream) as the VET step + confirms via GET /v2/packages — mirrors scripts/localnet/deploy.mjs which also equates upload with vetting on the participant"
  - "The deploy core is a pure function over an injectable fetchFn + token so the 9-check mocked-v2 test proves the upload/vet/allocate/grantRights shapes with NO live participant, NO Docker, NO SV node — the strongest offline validation available for CHAIN-02"
  - "acquireToken (OIDC client-credentials form-POST) lives in the same module (injectable fetchFn) so the token acquisition shape is unit-tested too; the client secret is read from server-side env only in main(), never in the exported core"
  - "Ports chosen off BOTH prior stacks: DevNet participant JSON API :6975, Postgres :55434, Prometheus :9095 (initial :4975 draft collided with the LocalNet SV participant → corrected pre-commit)"
  - "Every external/live step is tagged [EXTERNAL GATE] / [LIVE UAT] in the RUNBOOK + CHECKLIST; no offline artifact is labeled a live connection (the Phase 8/10/11 honesty bar)"

patterns-established:
  - "Offline deploy-shape test: import the deploy core with a recording fetch + node:assert the v2 request shapes (token form, octet-stream upload, GET vet-confirm, namespaced party POSTs, all-party grantRights, per-desk own-party rights) — proves the script is well-formed before any live node exists"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-07-10
---

# Phase 12 Plan 04: Splice DevNet validator compose + DAR-port/vet/party-alloc scripts + ops hardening + runbook (CHAIN-01/02/03) Summary

**Every OFFLINE artifact for taking Umbra onto the real Canton DevNet: a parameterized Splice validator compose (`.env.example` exposing all SV-sponsorship/auth/traffic vars as placeholders), a `devnet-deploy.mjs` that uploads+vets the frozen DAR and allocates namespaced parties + `grantRights` over the JSON Ledger API v2 with OIDC client-credentials (proven by a 9-check mocked-v2 test), the ops layer (isolated per-network Postgres, `pg_dump` backup, Prometheus scrape + health probes, Canton-Coin traffic auto-top-up), and the honest `RUNBOOK.md` + `SV-SPONSOR-CHECKLIST.md`. The live SV-sponsored connection, live DAR-vet-on-DevNet, §4-on-real-Canton, and unattended live ops are a clearly-labeled EXTERNAL GATE + live UAT — never faked.**

## Accomplishments

- **`deploy/devnet/validator-compose/`** (CHAIN-01, Task 1):
  - `docker-compose.yaml` — participant (JSON Ledger API v2 on host `:6975`) + Splice validator-app + wallet-ui + cns-ui + inline isolated Postgres, fully parameterized from `.env`; validated with `docker compose config -q` (valid).
  - `.env.example` — every required var as a documented placeholder: `SPONSOR_SV_URL`, `ONBOARDING_SECRET`, `MIGRATION_ID`, `PARTY_HINT=umbra-operator-1`, `AUTH_URL`/`AUTH_JWKS_URL`, `LEDGER_API_AUTH_AUDIENCE=https://canton.network.global`, `LEDGER_API_AUTH_SCOPE`, `LEDGER_API_ADMIN_USER`, `VALIDATOR_AUTH_CLIENT_ID/SECRET`, `TARGET_TRAFFIC_THROUGHPUT`, `MIN_TRAFFIC_TOPUP_INTERVAL`. No real secret/sponsor-URL committed.
  - `README.md` — external-gate header, offline checks, the `./start.sh -s -o -p -m -w -a` bring-up, ports table.
- **`deploy/devnet/devnet-deploy.mjs`** (CHAIN-02, Task 2) — mirrors `scripts/localnet/deploy.mjs`, parameterized for a DevNet participant + OIDC client-credentials: preflight `/v2/state/ledger-end` → upload+VET DAR (`POST /v2/packages` octet-stream) → confirm vet (`GET /v2/packages`) → allocate namespaced parties → `grantRights` so `LEDGER_API_ADMIN_USER` (== token `sub`) holds the operator's `actAs`/`readAs` (Pitfall 3) → per-desk own-party read users. `deploy`/`acquireToken` exported with an injectable `fetchFn`; `node --check` clean.
- **`deploy/devnet/devnet-deploy.test.mjs`** — 9 OFFLINE mocked-v2 checks (client-credentials form-POST; octet-stream DAR upload/vet; GET vet-confirm; namespaced party alloc; admin all-party grant; per-desk own-party read; audience constant). Exit 0.
- **Ops layer** (CHAIN-03, Task 3): isolated Postgres compose (`:55434`), `pg-dump.sh` (env-driven, timestamped gzip, empty-dump guard, retention pruning; `bash -n` clean), `prometheus.yml` (participant+validator scrape + `/readyz`+`/livez` probes), `traffic-topup.env.example` (both top-up vars + DevNet auto-tap note).
- **`deploy/RUNBOOK.md` + `deploy/SV-SPONSOR-CHECKLIST.md`** (Task 4) — the ordered boot→vet→allocate+grantRights→run §4 ($100.00)→backup/monitor/top-up procedure, and the front-loaded external outreach checklist (egress IP → SV → allowlist 2–7d → sponsor URL → JIT onboarding secret). Both tag every step `[BUILT]` / `[EXTERNAL GATE]` / `[LIVE UAT]` and encode Pitfalls 3–7.

## Offline check results

| Task | Check | Command | Result |
|------|-------|---------|--------|
| 1 | env vars present | `grep SPONSOR_SV_URL/umbra-operator-1/canton.network.global` | ✅ all present |
| 1 | compose valid | `docker compose config -q` | ✅ COMPOSE-CONFIG-VALID |
| 2 | script parses | `node --check devnet-deploy.mjs` | ✅ NODE-CHECK-OK |
| 2 | vet/package + rights referenced | `grep -iE "vet\|package"` + `grep -i rights` | ✅ GREP-OK |
| 2 | mocked-v2 shapes | `node devnet-deploy.test.mjs` | ✅ 9/9 checks, exit 0 |
| 3 | backup script parses | `bash -n pg-dump.sh` | ✅ BASH-N-OK |
| 3 | Postgres compose valid | `docker compose config -q` | ✅ PG-COMPOSE-VALID |
| 3 | prometheus/postgres YAML read | `node readFileSync` | ✅ OK |
| 3 | top-up vars present | `grep TARGET_TRAFFIC_THROUGHPUT/MIN_TRAFFIC_TOPUP_INTERVAL` | ✅ both present |
| 4 | runbook covers grant/§4 | `grep grantRights\|admin.user\|sub` + `grep 100.00` | ✅ TASK4-VERIFY-OK |
| 4 | checklist covers allowlist/external | `grep allowlist` + `grep -E "2.?7 day\|external"` | ✅ present |
| all | no real secrets | regex sweep excluding placeholders/mocks | ✅ NO-REAL-SECRETS |
| all | no AI attribution | `git log --format="%an <%ae>"` | ✅ woshvad only |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Draft `JSON_LEDGER_API_PORT=4975` collided with the LocalNet SV participant**
- **Found during:** Task 1 authoring (port-isolation review).
- **Issue:** The first `.env.example` draft published the DevNet participant JSON API on `:4975`, which is the LocalNet SV participant port — a collision on this ops box (LocalNet holds `:3975/:2975/:4975`).
- **Fix:** Moved it to `:6975` (off all LocalNet + Keycloak ports); the README ports table and RUNBOOK reference the corrected port. Corrected before the Task 1 commit.
- **Files modified:** `deploy/devnet/validator-compose/.env.example`
- **Commit:** `06613fb` (fix folded into the Task 1 commit)

### Benign design choices (plan-permitted discretion)

- **Added `deploy/devnet/validator-compose/README.md`** (not enumerated in the must-haves) — Task 1's action calls for "the `./start.sh …` invocation in a README/comment"; the README is plan-directed and holds placeholders/instructions only.
- **`devnet-deploy.mjs` exports a pure `deploy`/`acquireToken` core with an injectable `fetchFn`** — the plan asks for a mocked-v2 test proving the request shapes; a pure injectable core is the cleanest way to assert them offline without a live node (mirrors `api.test.ts` DI stubbing).
- **A standalone `postgres/docker-compose.yaml` in addition to the inline participant Postgres in the validator compose** — the must-have calls for an isolated per-network Postgres; the validator compose carries an inline one for the self-contained `./start.sh` path, and the standalone file is for running the store independently (both point at the same named volume).

## Authentication Gates

None encountered. **No package installs this plan** — the only new runtime components are Docker images (Splice validator, Postgres, Prometheus) vetted at compose time by official registry/tag; `jose`/`oidc-client-ts` were installed in 12-02/12-03. So no package-legitimacy `checkpoint:human-verify` applies here.

## Known Stubs

None that block the plan's goal. All secrets/URLs are intentional placeholders (`REPLACE_WITH_..._AT_UAT`) in committed templates; real values live in gitignored `.env` files at UAT. The mocked-v2 test uses a fake ZIP-magic DAR buffer + `MOCK.RS256.TOKEN` — a deliberate offline stub of the live upload, documented as such.

## Threat Flags

None. This plan adds no new network endpoint / auth path / schema at a trust boundary beyond what the 12-02/12-03 OIDC threat model already covers. The `devnet-deploy.mjs` reuses the same JSON Ledger API v2 surface + OIDC client-credentials as the prior plans; the client secret is read from server-side env only (never in the exported core, never committed).

## Honest Limitations (external gate + live UAT)

- **CHAIN-01** — the SV-sponsored live connection to the real Global Synchronizer requires an **external** Super-Validator gate (static egress IP → allowlist adoption **2–7 days** → sponsor URL → one-time JIT onboarding secret). Cannot be produced on this box; the compose + checklist are built and the gate is honestly labeled. Booting the compose without sponsorship is **not** a live connection.
- **CHAIN-02** — live DAR upload+vet on a DevNet participant and the **§4 fixture running on real Canton (still clearing $100.00 / A=10·B=8·C=2)** is UAT. The script + its 9-check mocked-v2 shape test are the offline proof.
- **CHAIN-03** — unattended ops on a live node (scheduled `pg_dump`, live Prometheus target, live traffic auto-top-up) is UAT. The configs/scripts are built + offline-validated.
- A single self-hosted, sponsored validator is **"demo-real"** for the 3-desk privacy money shot; genuine 3-institution cross-node privacy (3 independent validators) is a recorded limitation.

## Self-Check: PASSED

- FOUND: `deploy/devnet/validator-compose/docker-compose.yaml`, `.env.example`, `README.md`, `deploy/devnet/devnet-deploy.mjs`, `devnet-deploy.test.mjs`, `deploy/devnet/postgres/docker-compose.yaml`, `deploy/devnet/backup/pg-dump.sh`, `deploy/devnet/monitoring/prometheus.yml`, `deploy/devnet/traffic-topup.env.example`, `deploy/RUNBOOK.md`, `deploy/SV-SPONSOR-CHECKLIST.md`
- FOUND commits: `06613fb` (validator compose), `b48fb4d` (devnet-deploy + mocked-v2 test), `2c5bade` (ops layer), `0662e1a` (RUNBOOK + checklist)
- `node deploy/devnet/devnet-deploy.test.mjs` → 9/9, exit 0 · `node --check` clean · `bash -n pg-dump.sh` clean · both composes `docker compose config -q` valid
- No real secret / sponsor URL / onboarding secret committed (placeholders + mocks only)
- No Claude/AI git attribution (author/committer = woshvad); STATE.md / ROADMAP.md deliberately NOT modified per plan instructions

---
*Phase: 12-real-on-chain-canton-devnet*
*Completed: 2026-07-10*
