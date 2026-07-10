# Phase 12: Real On-Chain (Canton DevNet) - Research

**Researched:** 2026-07-10
**Domain:** Canton DevNet onboarding (Splice) · Canton participant OIDC/JWKS auth · Keycloak realm/flows · additive Daml four-eyes gate · validator ops hardening
**Confidence:** HIGH (external gate mechanics, Canton auth config, Keycloak-for-Canton, traffic top-up all confirmed against official Splice / Digital Asset docs; the Daml four-eyes pattern is grounded in this repo's own established DeskEligibility/Round.Clear code)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Four-Eyes Compliance Approval (IDEN-03) — REAL, additive, offline-tested**
- Add an on-ledger **Compliance-approval gate** on the settlement path: a `ClearingApproval` contract (signatory operator + **compliance**; carries the round id + the approved clearing price) that `Round.Clear` REQUIRES before it commits — Round.Clear fetches/asserts a compliance-signed approval matching the clearing price it is about to settle; a settle without Compliance sign-off aborts on-ledger. ADDITIVE: the §8 recompute-and-assert backstop, the Phase-11 Batch/Instruction settlement, and the clearing MATH are unchanged; a new authority precondition is inserted.
- **Flow (composes with verify-don't-trust):** solver computes + deterministically re-verifies → requests Compliance approval (a Compliance party exercises `ApproveClearing` at the recomputed price) → `Round.Clear` re-verifies §8 AND requires the matching `ClearingApproval` → settles atomically. Wrong/absent approval price ⇒ on-ledger abort.
- **§4 discipline:** the canonical test threads the approval step and STILL clears **$100.00 / A=10·B=8·C=2**. Dev may run Compliance = a dedicated dev party (or operator-held) so `daml test`/local runs without a human; the four-eyes SEPARATION (distinct Compliance authority) is the tested control. Add a NEGATIVE test: settle without/with-wrong approval rejected on-ledger.
- Solver wiring: an approval request/collect step + endpoint; a minimal Compliance approve/reject control. Live human four-eyes is UAT; the gate + tests are built.

**OIDC / Keycloak / TLS (IDEN-01/02) — real config + code, dual-mode with the dev path**
- **Issuer:** a **Keycloak** realm (`umbra`) exported as realm JSON — clients: `umbra-solver` (confidential, **client-credentials**), `umbra-web` (public, **auth-code + PKCE**); realm roles **Trader / Compliance / Admin**; per-desk users (bankA/B/C + guest) → Trader, a Compliance user, an Admin user; **scoped + revocable** client/API keys; **MFA** (OTP) on settlement-affecting roles. Shipped as `deploy/keycloak/umbra-realm.json` + a `docker-compose` for Keycloak + a **TLS** reverse proxy (Caddy or nginx, dev self-signed cert; real cert = UAT).
- **Canton side:** a participant auth config that trusts the Keycloak issuer (JWKS URL + audience) instead of `unsafe-jwt-hmac-256` — provided as a config artifact for the DevNet participant. **Dual-mode, honestly labeled:** the LocalNet `unsafe` HMAC path STAYS for the fast dev loop; OIDC is the DevNet/prod path.
- **Solver:** acquire a token via **client-credentials** from Keycloak (RS256), verify via **JWKS**, present it to the JSON Ledger API v2; the Anthropic key + client secret stay server-side (`.env`, gitignored) — never in the browser. Unit-test token acquisition + JWKS verify offline (mocked issuer); live exchange = UAT.
- **Web:** an **auth-code/PKCE** login for desks (redirect to Keycloak → code → token), replacing the pre-minted dev token on the OIDC path; the guest `/join` upgrades from the Phase-11 dev token to auth-code. Dev path unchanged.

**DevNet Connection + DAR Port (CHAIN-01/02) — artifacts + runbook, live = external gate**
- **Self-hosted Splice DevNet participant:** a Docker-Compose config for a Canton participant/validator joining DevNet via the Global Synchronizer (Splice), parameterized for the DevNet endpoints + the SV-sponsor onboarding inputs. The genuine connection requires **SV sponsorship** → **external gate**; the compose + config are built and validated as far as offline allows.
- **DAR port + vet + party alloc:** scripts (mirroring `deploy.mjs`/`xnode-up.mjs`) that upload + **vet** the frozen Umbra DAR on a DevNet participant and allocate desk parties, parameterized for DevNet. DAR is already LF-standard/portable (unchanged except the additive four-eyes template, which stays byte-portable). Live upload+vet + §4-on-real-Canton = **CHAIN-02 UAT**.
- **SV-sponsor outreach checklist + ops RUNBOOK.**

**Ops Hardening (CHAIN-03) — config + scripts + runbook, unattended-run = UAT**
- **Isolated per-network PostgreSQL** (compose service + dedicated volume per network), **monitoring** (health endpoints + a basic metrics/log config), **backups** (a `pg_dump` schedule script), **Canton-Coin traffic auto-top-up** (a script/config hitting the validator/Splice top-up API on a schedule). Shipped as compose + scripts + runbook; unattended operation on a live node = UAT.

### Claude's Discretion
- Exact Keycloak realm layout + mappers, TLS proxy choice (Caddy vs nginx) + dev cert method, the `ClearingApproval` contract shape (standalone approval contract vs a two-step propose/approve choice), the compose/monitoring/backup/top-up script specifics, and the precise split of OIDC behavior that is unit-testable offline vs UAT — PROVIDED: the frozen DAR stays byte-portable (four-eyes additive only), **§4 still clears $100.00** (with the four-eyes step), the **unsafe-HMAC dev path still works**, secrets never reach the browser, and every external/live/deferred boundary is **honestly labeled**.
- If a real (non-stub) artifact can't be validated offline on this box within the phase, ship the strongest honestly-labeled config + runbook + document the limitation — never fake a live connection.

### Deferred Ideas (OUT OF SCOPE)
- SV sponsorship + live real-DevNet connection (CHAIN-01), §4 on real Canton (CHAIN-02), unattended ops on the live node (CHAIN-03) → **external gate + live UAT**.
- Live OIDC token exchange + Canton-accepts-OIDC + live MFA (IDEN-01/02) → live UAT (needs booted Keycloak + Canton).
- KMS/HSM-backed key custody, SOC 2 → **Track B**.
- Genuine 3-institution cross-node privacy (3 real validators) → recorded honest limitation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAIN-01 | Canton participant/validator connects to the real Global Synchronizer on DevNet, sponsored by a Super Validator *(external gate)* | Splice `./start.sh -s <SPONSOR_SV_URL> -o <ONBOARDING_SECRET> -p <party_hint> -m <MIGRATION_ID>` compose + `.env` is buildable offline; the SV sponsorship (egress-IP allowlist adoption 2–7 days + sponsor URL + onboarding secret) is the genuinely-external, non-code gate. See Q4. |
| CHAIN-02 | Frozen Umbra DAR uploaded + vetted on the DevNet participant; desk parties allocated; §4 runs end-to-end still clearing $100.00 | DAR is LF-2.1 portable (D8); `deploy.mjs`-mirrored upload+vet+party-alloc scripts, parameterized for a DevNet participant endpoint, buildable offline; live vet + §4-on-real-Canton = UAT. See Q4. |
| CHAIN-03 | Ops hardening — isolated per-network Postgres, backups, monitoring, Canton-Coin traffic auto-top-up — unattended | Compose Postgres-per-network + `pg_dump` script + `/readyz`+`/livez` + Prometheus scrape + `TARGET_TRAFFIC_THROUGHPUT`/`MIN_TRAFFIC_TOPUP_INTERVAL` (DevNet auto-taps coin). All config/script/runbook offline; unattended-on-live-node = UAT. See Q5. |
| IDEN-01 | Unsafe HMAC JWT replaced by real OIDC (Keycloak) over TLS — solver client-credentials, desks auth-code | Canton `ledger-api.auth-services = [{ type = jwt-jwks, url, target-audience }]`; audience STAYS `https://canton.network.global`; dual-mode with the dev HMAC path; `jose` JWKS verify + client-credentials form-POST unit-testable offline against a mocked issuer. See Q2/Q3. |
| IDEN-02 | Per-desk RBAC (Trader/Compliance/Admin), MFA on settlement-affecting actions, scoped revocable API keys | Keycloak realm roles + User-Client-Role mapper into the token; confidential client secret + service-account tokens = scoped/revocable keys; Keycloak OTP required-action bound to Compliance/Admin. See Q3. |
| IDEN-03 | Four-eyes: a Compliance role approves the solver's clearing price before `Round.Clear` commits | Additive `ClearingApproval` (signatory operator + compliance), threaded into `Round.Clear` by ContractId (no keys — 11-02/D7), fetched + asserted against the recomputed p*; propose/approve two-step supplies compliance authority; `daml test` §4 + negative offline. See Q1. |
</phase_requirements>

## Summary

Phase 12 has exactly one genuinely-external, non-code deliverable — a Super-Validator-sponsored DevNet connection — and a large surface of **real, offline-buildable, offline-testable artifacts** around it. This research gives a concrete verdict on each hard question.

The single most useful finding: **the OIDC migration does not change the token audience.** The unsafe LocalNet dev token already uses `aud: https://canton.network.global`; the official Keycloak-for-Canton guide configures the exact same audience. So the switch from `unsafe-jwt-hmac-256` to real OIDC changes only the **signing algorithm** (HS256 with shared secret `unsafe` → RS256 verified via JWKS) and the **key source** — not the claim shape, not the audience, not the participant's user-rights model. That makes clean dual-mode trivial: the same code path presents a bearer token; only where the token comes from and how the participant verifies it differ.

The four-eyes gate (IDEN-03) is a REAL additive Daml control that this repo is already shaped for: `Compliance` is an established party and `DeskEligibility` (signatory `operator, compliance`) is the exact precedent. A `ClearingApproval` template (same signatory pair), created via a compliance-authorized approve step and threaded into `Round.Clear` by explicit ContractId (contract keys are unsupported on LF 2.1 — confirmed Phase 11), makes a settle without a matching compliance-signed approval abort on-ledger — fully `daml test`-verifiable offline with §4 still clearing $100.00.

**Primary recommendation:** Build every artifact — the additive `ClearingApproval` four-eyes gate (offline `daml test`), the Keycloak realm + compose + Caddy TLS proxy + `jose`-based solver JWKS verify/client-credentials + `oidc-client-ts` web PKCE (offline unit tests against a mocked issuer), the Splice DevNet validator compose + parameterized DAR-vet/party-alloc scripts + Postgres/monitoring/backup/top-up configs — and ship an honest SV-sponsor outreach checklist + ops runbook. Defer only the live SV connection, live §4-on-real-Canton, live token exchange, and unattended-live-ops to a clearly-labeled external gate + UAT. Never fake a live connection (the Phase-8/10/11 honesty bar).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Four-eyes clearing approval (IDEN-03) | Daml ledger (`ClearingApproval` + `Round.Clear` precondition) | Solver (request/collect) + web (Compliance approve control) | The authority separation must be enforced ON-LEDGER (a distinct compliance signatory), not in solver logic — mirrors the DeskEligibility gate. |
| Token issuance / OIDC flows (IDEN-01/02) | Keycloak (issuer) | Solver (client-credentials, server-side), web (auth-code+PKCE) | Identity provider owns issuance/MFA/RBAC; the solver holds the confidential secret server-side, the browser holds only a public PKCE client. |
| Token verification (IDEN-01) | Canton participant (`ledger-api.auth-services jwt-jwks`) | Solver (`jose` JWKS verify, defense-in-depth) | The participant is the authoritative gatekeeper of the ledger API; the solver's own verify is belt-and-suspenders + offline-testable. |
| TLS termination | Reverse proxy (Caddy/nginx) | — | Standard edge concern; dev self-signed, real cert = UAT. |
| DevNet connection (CHAIN-01) | Splice validator node (compose) + external Super Validator | Ops scripts | Joining the Global Synchronizer requires SV-adopted IP allowlist + sponsor URL + onboarding secret — an external business/consensus gate, not code. |
| DAR vet + party alloc (CHAIN-02) | Canton participant (JSON Ledger API v2) | Deploy scripts (parameterized) | Same v2 API surface as LocalNet `deploy.mjs`; only the endpoint + auth change. |
| Ops: Postgres / monitoring / backups / traffic top-up (CHAIN-03) | Docker Compose + Splice validator app | Scheduled scripts (pg_dump, top-up) | Standard node-operations concerns; the traffic top-up is a Splice validator-app config, DevNet auto-taps coin. |

## Standard Stack

### Core (new this phase)
| Library / Component | Version | Purpose | Why Standard |
|---------------------|---------|---------|--------------|
| **Keycloak** | `26.x` (quay.io/keycloak/keycloak) | OIDC issuer — realm, clients, RBAC roles, MFA/OTP, JWKS endpoint | The issuer the official Canton "Keycloak Configuration Guide for Canton Validator" uses; RS256/JWKS + client-credentials + auth-code/PKCE out of the box `[CITED: docs.global.canton.network.sync.global/community/keycloak-docker-canton-validator-config.html]` |
| **Caddy** | `2.x` (caddy:2) | TLS reverse proxy in front of Keycloak (+ optionally the participant/solver) | Simplest dev TLS — automatic internal/self-signed cert with a one-line `tls internal`; nginx is the heavier alternative `[ASSUMED]` |
| **jose** | `6.2.3` | Solver-side RS256 JWKS verification (`createRemoteJWKSet` + `jwtVerify`) of the OIDC token; defense-in-depth + offline-testable | The canonical modern JOSE library for Node (ESM-native, zero-dep); fits the solver's ESM setup `[VERIFIED: npm registry — panva/jose, no postinstall]` `[ASSUMED: slopcheck not run this session — see audit]` |
| **oidc-client-ts** | `3.5.0` | Web auth-code + PKCE login (`UserManager`) for desks, issuer-agnostic | Standard browser OIDC client (authts); automatic PKCE, silent renew `[VERIFIED: npm registry — authts/oidc-client-ts, no postinstall]` `[ASSUMED: slopcheck not run this session — see audit]` |

### Supporting
| Library / Component | Version | Purpose | When to Use |
|---------------------|---------|---------|-------------|
| **Splice validator compose** | `main` (hyperledger-labs/splice) | Self-hosted DevNet validator node (participant + wallet + CNS UIs) via `./start.sh` | CHAIN-01/02 artifact — parameterized for DevNet, run at the external gate `[CITED: docs.dev.sync.global/validator_operator/validator_compose.html]` |
| **PostgreSQL** | `15.x` (per-network isolated) | Participant/validator persistent store, one instance+volume per network | CHAIN-03; the LocalNet override already isolates Postgres to `:55432` (protects the box's separate augur project) — mirror that per-network isolation `[VERIFIED: codebase — up.mjs / live-e2e-ops memory]` |
| **client-credentials via plain fetch** | — | Solver token acquisition: `POST {issuer}/realms/umbra/protocol/openid-connect/token` `grant_type=client_credentials` | Simplest, fully mockable in vitest; avoids a heavier dep. `openid-client@6.8.4` (panva) is the library alternative if richer discovery is wanted `[VERIFIED: npm registry — panva/openid-client]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Caddy (dev TLS) | nginx + openssl self-signed | nginx needs manual cert generation + config; Caddy's `tls internal` is one line. Both fine; Caddy is less setup for a dev cert. |
| `jose` (solver JWKS verify) | `jsonwebtoken` + `jwks-rsa` | The `jsonwebtoken`/`jwks-rsa` pair is CJS and older-style; `jose` is ESM-native (matches the solver) and single-package. |
| plain-fetch client-credentials | `openid-client@6` | The library adds discovery + DPoP niceties but a client-credentials form POST is trivial and easier to unit-test with a mocked token endpoint. |
| Self-hosted Splice compose | Hosted NaaS provider (per ROADMAP) | A NaaS provider abstracts the SV-sponsorship + ops but is a paid external service; self-hosted compose keeps everything in-repo + honest. Both are CHAIN-01 UAT paths. |
| `oidc-client-ts` (web) | `keycloak-js` | `keycloak-js` is Keycloak-specific; `oidc-client-ts` is issuer-agnostic (cleaner if the IdP ever changes) and standards-based. |

**Installation (offline-buildable artifacts):**
```bash
# solver/ — JWKS verify (RS256) for the OIDC dual-mode path
npm --prefix solver install jose@6.2.3 --legacy-peer-deps   # --legacy-peer-deps per the repo's zod@3.23.8/@daml precedent
# web/ — auth-code + PKCE desk login
npm --prefix web install oidc-client-ts@3.5.0 --legacy-peer-deps
# Keycloak + TLS proxy + Postgres run as Docker services (deploy/keycloak/docker-compose.yaml) — no npm install
```

**Version verification (run 2026-07-10):**
- `jose` → `6.2.3` (modified 2026-04-27), repo `github.com/panva/jose`, no `postinstall` script.
- `oidc-client-ts` → `3.5.0` (modified 2026-03-13), repo `github.com/authts/oidc-client-ts`, no `postinstall` script.
- `openid-client` → `6.8.4` (alternative), repo `github.com/panva/openid-client`.

## Package Legitimacy Audit

> slopcheck was **not available** in this research session (`slopcheck NOT available`; pip install not attempted per offline box). Per the Package Legitimacy Gate graceful-degradation rule, the two new packages are tagged `[ASSUMED]` and the **planner MUST gate each install behind a `checkpoint:human-verify` task**. Both were nonetheless cross-checked on the correct registry (npm) and inspected for postinstall scripts.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `jose` | npm | ~8 yrs (panva, mature) | very high (industry-standard JOSE lib) | github.com/panva/jose | not run | Approved pending `checkpoint:human-verify`; no postinstall |
| `oidc-client-ts` | npm | mature (authts, successor to oidc-client-js) | high | github.com/authts/oidc-client-ts | not run | Approved pending `checkpoint:human-verify`; no postinstall |
| `openid-client` (alt) | npm | ~9 yrs (panva) | very high | github.com/panva/openid-client | not run | Alternative only; gate if adopted |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck unavailable).
**Packages flagged as suspicious [SUS]:** none observed (both have real, well-known source repos and no postinstall). Planner still inserts a `checkpoint:human-verify` before each install because slopcheck could not confirm.

**Keycloak / Caddy / Postgres / Splice** are Docker images, not npm packages — vet by image digest/official-registry at compose time (Keycloak `quay.io/keycloak/keycloak`, Caddy `caddy`, Postgres `postgres`, Splice images per the official compose). No npm supply-chain step for these.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────── DUAL-MODE AUTH ───────────────────────────┐
                    │                                                                       │
 DEV (LocalNet, unchanged):   mint-jwt.mjs ──HS256 "unsafe", aud=canton.network.global──┐  │
                                                                                         │  │
 DEVNET/PROD (this phase):                                                               │  │
   ┌──────────┐  auth-code+PKCE   ┌──────────┐                                           ▼  ▼
   │ web/     │◀─────────────────▶│ Keycloak │  RS256 token (aud=https://canton.network.global)
   │ desks    │                   │ realm    │      │                    ┌──────────────────────────┐
   │(oidc-    │                   │ umbra    │      │  Bearer token      │ Canton participant        │
   │ client-  │                   │ (Caddy   │      ├───────────────────▶│ JSON Ledger API v2        │
   │ ts,PKCE) │                   │  TLS)    │      │                    │ auth-services:            │
   └──────────┘                   └────┬─────┘      │                    │  DEV  = unsafe-jwt-hmac256│
        │ desk token                   │           │                    │  PROD = jwt-jwks(JWKS URL,│
        ▼                              │ JWKS URL   │                    │         target-audience)  │
   ┌──────────┐  client-credentials    │ /certs     │                    └───────────┬──────────────┘
   │ solver/  │◀───────────────────────┘            │                                │ /v2/commands
   │ (server) │  RS256 token ─── jose JWKS verify ──┘                                │ submit-and-wait
   │ secret in .env (never browser)                                                  ▼
   └────┬─────┘                                                            ┌──────────────────────┐
        │ operator plane                                                   │ Umbra DAR (frozen,   │
        │  ┌── request Compliance approval ──▶ ClearingApproval            │ LF-2.1 portable)     │
        │  │   (op proposes, Compliance approves → op+compliance signed)   │  Round.Clear:        │
        └──┤                                                               │   1. §8 recompute    │
           │  POST /settle ──▶ Round.Clear(…, approvalCid) ────────────────▶  2. FETCH+ASSERT     │
           │                                                               │      ClearingApproval│
           │                                                               │   3. Batch DvP settle│
           └────────────────────────────────────────────────────────────▶└──────────────────────┘

 CHAIN (external gate): Splice validator compose ──./start.sh -s SPONSOR_SV_URL -o ONBOARDING_SECRET
   -p party_hint -m MIGRATION_ID ─▶ Global Synchronizer (DevNet)  [requires SV: IP allowlist 2–7d + secret]
   Ops: Postgres-per-network · pg_dump backup · /readyz+/livez+Prometheus · traffic auto-top-up
```

### Recommended Project Structure
```
daml/Umbra/
├── Approval.daml         # NEW — ClearingApproval + ClearingApprovalRequest (four-eyes, IDEN-03)
├── Auction.daml          # Round.Clear gains ONE additive field: approvalCid, + fetch/assert (additive)
deploy/
├── keycloak/
│   ├── umbra-realm.json           # realm export: clients, roles, scopes, mappers, MFA
│   ├── docker-compose.yaml        # Keycloak + Postgres + Caddy TLS proxy
│   └── Caddyfile                  # dev TLS (tls internal), reverse proxy to Keycloak
├── devnet/
│   ├── validator-compose/         # Splice validator compose + .env.example (SPONSOR_SV_URL etc.)
│   ├── devnet-deploy.mjs          # DAR upload+vet + party-alloc, parameterized JSON_API_URL/auth
│   ├── postgres/                  # per-network isolated Postgres compose + volume
│   ├── backup/pg-dump.sh          # scheduled pg_dump
│   ├── monitoring/prometheus.yml  # scrape config + /readyz,/livez health
│   └── traffic-topup.env          # TARGET_TRAFFIC_THROUGHPUT / MIN_TRAFFIC_TOPUP_INTERVAL
├── RUNBOOK.md                     # ops runbook (boot, vet, allocate, run §4, backup, top-up)
└── SV-SPONSOR-CHECKLIST.md        # external outreach steps (egress IP, sponsor URL, onboarding secret)
solver/src/
├── auth.ts               # NEW — dual-mode token: acquireToken() (client-credentials) + verifyJwks()
└── ledger.ts             # OIDC token slots into the module-private credential resolution (dual-mode)
web/src/
└── auth/                 # NEW — oidc-client-ts UserManager (auth-code+PKCE), dev-token fallback
```

### Pattern 1: Additive Four-Eyes `ClearingApproval` (IDEN-03) — the exact repo-native shape
**What:** A standalone approval contract signed by `operator, compliance`, created via a compliance-authorized approve step, and threaded into `Round.Clear` by explicit ContractId (NO contract keys — LF 2.1 unsupported, confirmed 11-02).
**When to use:** the settlement path — Round.Clear fetches + asserts it before the Batch DvP.
**Why this exact pattern:** it is byte-for-byte the `DeskEligibility` mechanism already shipped in `Compliance.daml` (`signatory operator, compliance` + fetched-by-ContractId + `assertDeskEligible`). Operator is a signatory of the approval, so the `fetch` inside `Round.Clear` (controller operator) is authorized exactly as the `DeskEligibility` fetch inside `Venue.SubmitOrder` is.

```daml
-- daml/Umbra/Approval.daml  (NEW, standalone module — mirrors Compliance.daml)
module Umbra.Approval where

-- Operator PROPOSES a clearing to Compliance (carries the recomputed p*). Signed by
-- operator only; Compliance is observer so it can see + act. This is the "request".
template ClearingApprovalRequest
  with
    operator      : Party
    compliance    : Party
    roundId       : Text
    clearingPrice : Decimal   -- the deterministically-recomputed §8 price
  where
    signatory operator
    observer compliance

    -- Compliance APPROVES → the two-party-signed ClearingApproval is born. Compliance
    -- authority co-flows here (controller compliance), so the operator+compliance
    -- signatory set on ClearingApproval is satisfied. Operator ALONE cannot create it.
    choice ApproveClearing : ContractId ClearingApproval
      controller compliance
      do
        create ClearingApproval with operator; compliance; roundId; clearingPrice

    -- Compliance may REJECT (consuming; no approval created → settle aborts for lack of one).
    choice RejectClearing : ()
      controller compliance
      do pure ()

-- The four-eyes credential Round.Clear REQUIRES. Signed by BOTH operator and compliance
-- (unforgeable by operator alone). Carries the round + the approved price.
template ClearingApproval
  with
    operator      : Party
    compliance    : Party
    roundId       : Text
    clearingPrice : Decimal
  where
    signatory operator, compliance

-- The GATE PRIMITIVE Round.Clear calls (keyless — fetched by ContractId, D7 Option-B).
-- Mirrors assertDeskEligible: asserts the approval is for THIS round AND matches the p*
-- Round.Clear is about to settle. A missing / wrong-price / wrong-round approval aborts.
assertClearingApproved : Party -> Text -> Decimal -> ClearingApproval -> Update ()
assertClearingApproved operator roundId priceDec appr = do
  assertMsg "approval is not for this operator/round"
    (appr.operator == operator && appr.roundId == roundId)
  assertMsg "compliance-approved price does not match the clearing price"
    (roundBankers 2 appr.clearingPrice == priceDec)
```

Then in `Round.Clear` (ONE additive field + ONE fetch/assert, inserted right after the §8 recompute-and-assert block that pins `priceDec` — the §8 math and the Batch DvP stay byte-unchanged):

```daml
-- ADD to the Clear choice's `with` block (purely additive, D7 Option-B — like orderCids):
        approvalCid    : ContractId ClearingApproval   -- IDEN-03 four-eyes credential

-- INSERT after `let priceDec = roundBankers 2 clearingPrice` and the §8 asserts,
-- BEFORE buildGrossInstructions (the settlement is gated on it):
        appr <- fetch approvalCid
        assertClearingApproved operator roundId priceDec appr
```

Solver wiring (`ledger.ts` `settle` + a new request/collect step): after computing §8 locally, the solver (operator) creates a `ClearingApprovalRequest` at the recomputed price; the Compliance plane exercises `ApproveClearing`; the solver gathers the resulting `ClearingApproval` cid and passes it as `approvalCid` into `Round.Clear` — exactly as it already gathers `orderCids`/`buyerCashCids`. For the fast local loop, Compliance may be a dedicated dev party (or operator-held) so `daml test`/headless runs without a human; the four-eyes SEPARATION (distinct compliance signatory) is the real, tested control.

**Anti-pattern avoided:** a contract key on the approval (`key (operator, roundId)`) — LF 2.1 has NO contract keys (11-02 environmental deviation; D7). Thread by ContractId.

### Pattern 2: Canton participant OIDC (jwt-jwks) — dual-mode, same audience
**What:** Swap the participant's `auth-services` from `unsafe-jwt-hmac-256` to `jwt-jwks` pointing at Keycloak's JWKS URL, keeping `target-audience` = `https://canton.network.global`.
```hocon
# DevNet participant config artifact (dual-mode: dev keeps unsafe-jwt-hmac-256)
canton.participants.participant.ledger-api {
  auth-services = [{
    type            = jwt-jwks
    url             = "https://keycloak.umbra.dev/realms/umbra/protocol/openid-connect/certs"
    target-audience = "https://canton.network.global"   # SAME aud as the dev token
  }]
}
```
`[CITED: docs.digitalasset.com/operate/3.5/howtos/secure/apis/jwt.html]` — the participant expects RS256 tokens verified against the JWKS URL; either `target-audience` OR `target-scope` (default scope `daml_ledger_api`), not both. In the Splice validator compose these surface as `AUTH_JWKS_URL`, `LEDGER_API_AUTH_AUDIENCE`, `LEDGER_API_AUTH_SCOPE`, `LEDGER_API_ADMIN_USER` (must match the token `sub`). `[CITED: docs.dev.sync.global/validator_operator/validator_compose.html]`

**Key insight (load-bearing for dual-mode):** the dev token already uses `aud = https://canton.network.global` (`mint-jwt.mjs`, D9). The OIDC token uses the **same** audience (official Keycloak-for-Canton guide's Audience mapper targets exactly `https://canton.network.global`). So only the **signing algorithm + key source** change (HS256/`unsafe` → RS256/JWKS); the claim shape and the participant user-rights model (rights from `POST /v2/users/{id}/rights`, not token claims — D9) are unchanged. The solver's `resolveOperator()` credential resolution grows a mode switch: dev reads `scripts/.operator-token` (HS256); OIDC calls `acquireToken()` (client-credentials).

### Pattern 3: Keycloak realm for Canton (IDEN-01/02)
Modeled on the official "Keycloak Configuration Guide for Canton Validator". Concrete mapping for Umbra:

| Keycloak object | Config | Umbra role |
|-----------------|--------|------------|
| Realm | `umbra` | project realm |
| Client scope `daml_ledger_api` | Audience mapper → `https://canton.network.global` (access token + introspection); User-Client-Role mapper | the ledger-API audience/roles scope on every token |
| Confidential client `umbra-solver` | service accounts ENABLED (client-credentials), client secret, default scope `daml_ledger_api` | solver's machine-to-machine token (= the guide's `validator-app-backend`) |
| Public client `umbra-web` | Standard flow (auth-code + PKCE), redirect URIs to the web origin, scopes `openid` + `daml_ledger_api` | desk browser login (= the guide's `wallet-web-ui`) |
| Realm roles | `Trader`, `Compliance`, `Admin` | RBAC (IDEN-02) — mapped into the token via the User-Client-Role mapper |
| Users | `bankA/bankB/bankC` + `guest` → `Trader`; a `compliance` user → `Compliance`; an `admin` → `Admin` | per-desk identities |
| MFA | OTP required-action / a browser-flow OTP conditional bound to `Compliance` + `Admin` | MFA on settlement-affecting roles (IDEN-02) |
| Scoped, revocable keys | the confidential client secret + service-account tokens; revoke by rotating the secret / disabling the client | IDEN-02 scoped+revocable API keys |
`[CITED: docs.global.canton.network.sync.global/community/keycloak-docker-canton-validator-config.html]`

**Solver token acquisition (offline-testable):**
```ts
// solver/src/auth.ts — client-credentials + JWKS verify (dual-mode; OIDC path)
import { createRemoteJWKSet, jwtVerify } from 'jose'
const JWKS = createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URL!))
export const acquireToken = async () => {
  const res = await fetch(`${process.env.OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OIDC_CLIENT_ID!,          // umbra-solver
      client_secret: process.env.OIDC_CLIENT_SECRET!,  // server-side ONLY, .env, gitignored
      scope: 'daml_ledger_api',
    }),
  })
  const { access_token } = await res.json()
  return access_token as string
}
export const verifyToken = (token: string) =>
  jwtVerify(token, JWKS, { audience: 'https://canton.network.global' })  // RS256, JWKS
```
Unit tests (offline): generate an RSA keypair with `jose.generateKeyPair('RS256')`, serve a local JWKS + a mock `/token` endpoint, assert (a) `acquireToken()` returns the minted token, (b) `verifyToken()` accepts a correct-audience token and rejects a wrong-audience / wrong-key / expired one. No real Keycloak needed. Live token exchange against a booted Keycloak + a Canton configured for the issuer = UAT.

### Anti-Patterns to Avoid
- **Contract key on `ClearingApproval`** — LF 2.1 has no contract keys (11-02); thread by ContractId.
- **Operator self-approval** — do NOT let `Round.Clear` create the approval or let operator alone sign it; the whole point is the distinct `compliance` signatory. Compliance must exercise `ApproveClearing`.
- **Client secret in the browser bundle** — the web client is PUBLIC (PKCE, no secret). Only the solver holds `umbra-solver`'s confidential secret, server-side in `.env` (D6). Grep the built bundle for the secret in CI (the repo already does this for the operator token / Anthropic key).
- **Configuring both `target-audience` and `target-scope`** — the participant rejects both at once; pick audience (Umbra keeps the existing `https://canton.network.global`).
- **Claiming a live DevNet connection / wallet interoperability** — the SV gate is external; a self-hosted single node is "demo-real" (recorded limitation). Never label an offline artifact as a live connection.
- **Assuming the DAR needs changes for DevNet** — it does not; it is LF-2.1 portable (D8). The only delta is the additive four-eyes template, which introduces no new LF feature.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RS256 JWKS verification | a custom RSA/JWT verifier | `jose` (`createRemoteJWKSet`+`jwtVerify`) | Key rotation, `kid` selection, alg confusion, audience/exp checks are subtle security-critical edge cases. |
| Auth-code + PKCE browser flow | a hand-rolled redirect/code-exchange | `oidc-client-ts` `UserManager` | PKCE code_verifier, state/nonce, silent renew, storage — easy to get wrong (and insecure). |
| DevNet onboarding orchestration | a bespoke join sequence | Splice `./start.sh` compose | Onboarding secret exchange, sequencer connection, party bootstrap are Splice-app concerns. |
| Traffic purchasing | a coin-management loop | Splice validator app auto-top-up (`TARGET_TRAFFIC_THROUGHPUT`/`MIN_TRAFFIC_TOPUP_INTERVAL`; DevNet auto-taps) | The validator app already buys traffic pay-as-you-go; on DevNet it auto-taps coin. |
| OIDC issuer / RBAC / MFA | a custom auth server | Keycloak | Realm/clients/roles/OTP/JWKS are exactly what Keycloak provides and what Canton's guide targets. |
| Contract-key lookup for the approval | a keyed template | ContractId threading (D7 Option-B) | LF 2.1 has no keys; threading is the proven repo pattern. |

**Key insight:** every "new" capability in this phase already has a canonical, standards-based owner (Keycloak, Splice, `jose`, Canton `jwt-jwks`). The only genuinely-new *code* is (1) the ~40-line additive `Approval.daml` + one fetch/assert in `Round.Clear`, (2) the `solver/src/auth.ts` dual-mode token seam, (3) the web PKCE wiring, and (4) config/compose/scripts. Everything else is configuration + an honest runbook.

## Runtime State Inventory

> This phase adds infrastructure/config + one additive Daml template. It renames nothing, but it DOES introduce new runtime state (secrets, a new DAR, a new signatory party) — inventoried here so the planner treats them as first-class.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The frozen Umbra DAR gains the additive `ClearingApproval`/`ClearingApprovalRequest` templates → the DAR **package hash changes**. Any participant (LocalNet AND a DevNet node) must **re-vet the new DAR** before it can route Round.Clear. Existing LocalNet R1 state (persisted Postgres :55432) uses the OLD package; a rebuilt DAR requires re-deploy/re-seed (or an upgrade). | code edit (Daml) + re-run `deploy.mjs`/`up.mjs --reseed` on LocalNet; live vet on DevNet = UAT |
| Live service config | (Offline) none live yet. At the gate: the Splice validator config lives partly in the validator app's own store (onboarding state, party bootstrap) NOT in git; the Keycloak realm state lives in Keycloak's Postgres, seeded from the committed `umbra-realm.json` export. | realm import from git at Keycloak boot; validator onboarding = UAT |
| OS-registered state | Scheduled backup (`pg_dump`) + traffic-top-up scripts imply a scheduler (cron on Linux / Task Scheduler on the ops box). None registered yet — the scripts are shipped; registration on the live node = UAT. | ship scripts; register on live node = UAT |
| Secrets/env vars | NEW server-side secrets, all gitignored (`.env`, D6): `OIDC_CLIENT_SECRET` (umbra-solver), `OIDC_ISSUER`/`OIDC_JWKS_URL`/`OIDC_CLIENT_ID`, Splice `ONBOARDING_SECRET`/`SPONSOR_SV_URL`/`MIGRATION_ID`, Keycloak admin creds, Postgres passwords. The existing `ANTHROPIC_API_KEY` + party tokens are unchanged. `.env.example` gains placeholder entries; NONE reach the browser (the web PKCE client is secret-less). | add to `.env.example` (placeholders only); confirm CI bundle-grep excludes them |
| Build artifacts | Rebuilt `umbra-0.1.0.dar` (new package hash); regenerated `web/daml.js/umbra-0.1.0` bindings (the additive templates surface in codegen — commit them per the fresh-clone invariant). | `daml build` + `daml codegen js` + commit bindings |

**The canonical question — after every file is updated, what runtime systems still carry old state?** Only the **vetted DAR package** (LocalNet must re-vet the new package hash after `daml build`; a live DevNet node must vet at the gate). Verified: no string-rename state; the four-eyes change is purely additive templates + one Round.Clear field. `web/daml.js` must be regenerated + committed (as in 09-01/09-05).

## Common Pitfalls

### Pitfall 1: Four-eyes approval created without a distinct compliance authority
**What goes wrong:** the "gate" is bypassable because the operator can produce the approval alone (e.g., `Round.Clear` creates it, or `ClearingApproval` is `signatory operator` only).
**Why it happens:** convenience — wanting `daml test` to run without a second party.
**How to avoid:** `ClearingApproval` MUST be `signatory operator, compliance`, and it must be born from `compliance` exercising `ApproveClearing`. For headless tests, use a *dedicated* compliance dev party (or operator-held compliance) — but the signatory SEPARATION stays real. Add a negative test where the operator tries to settle with no approval / a self-made approval → on-ledger reject.
**Warning signs:** a `ClearingApproval` with a single signatory; a Round.Clear that `create`s the approval itself.

### Pitfall 2: Configuring `target-audience` AND `target-scope` together
**What goes wrong:** the participant rejects the auth config; the ledger API won't accept any token.
**How to avoid:** configure exactly one. Umbra keeps `target-audience = https://canton.network.global` (matches the existing dev token audience) and relies on the default `daml_ledger_api` scope. `[CITED: docs.digitalasset.com/operate/3.5/howtos/secure/apis/jwt.html]`

### Pitfall 3: `LEDGER_API_ADMIN_USER` / token `sub` mismatch
**What goes wrong:** the OIDC token verifies but the participant maps it to no user, so `actAs`/`readAs` rights are absent → 403 on every ledger call (exactly the LocalNet "bare admin can't read another party → 403" behavior in the live-ops memory).
**Why it happens:** Canton derives party rights from the **user** identified by the token `sub`, not from token claims (D9). The OIDC client's service-account username (or a configured claim) must equal a Canton user that has been granted the operator's rights.
**How to avoid:** the client-credentials `sub` (service-account user) must match `LEDGER_API_ADMIN_USER`, and that user must hold `CanActAs`/`CanReadAs` the operator party (the `grantRights` step in `deploy.mjs`). Document this in the runbook; it's the #1 live-UAT failure mode.

### Pitfall 4: Egress-IP allowlist assumed instant
**What goes wrong:** the team requests SV sponsorship the day of the demo; the IP allowlist adoption takes **2–7 days**, so the node cannot connect.
**How to avoid:** start the SV-sponsor outreach on day 1 (ROADMAP: "start the SV-sponsor gate immediately"). The checklist must front-load: (1) obtain a static egress IP, (2) send it to the sponsoring SV, (3) wait for allowlist adoption (2–7d), (4) get `SPONSOR_SV_URL`, (5) generate/obtain the onboarding secret (DevNet self-serve, 1h validity — generate it JUST before `./start.sh`). `[CITED: docs.dev.sync.global/validator_operator/validator_onboarding.html]`

### Pitfall 5: DevNet onboarding secret expiry
**What goes wrong:** a self-generated DevNet onboarding secret is valid only **1 hour** (SV-issued: 48h) and is one-time-use; a stale secret fails `./start.sh`.
**How to avoid:** generate the secret immediately before deployment; if it expires, generate a fresh one. Runbook step ordering matters. `[CITED: docs.dev.sync.global/validator_operator/validator_onboarding.html]`

### Pitfall 6: Rebuilt DAR not re-vetted → PACKAGE_SELECTION_FAILED
**What goes wrong:** adding the four-eyes templates changes the DAR package hash; a participant (LocalNet or DevNet) that hasn't vetted the new package refuses to route `Round.Clear` (the same `PACKAGE_SELECTION_FAILED` class the cross-node work hit — D11).
**How to avoid:** after `daml build`, re-upload/vet the DAR on every participant hosting a stakeholder (`deploy.mjs` already uploads to all three on LocalNet). On DevNet, vet on the DevNet participant (CHAIN-02 UAT).

### Pitfall 7: `party_hint` format on DevNet
**What goes wrong:** the Splice validator rejects a party hint that isn't `<organization>-<function>-<enumerator>` (e.g. it wants `umbra-operator-1`, not `operator`).
**Why it happens:** DevNet enforces the namespaced hint format; the LocalNet override already uses `PARTY_HINT=umbra-operator-1`.
**How to avoid:** parameterize the DevNet party-alloc script with the namespaced hint format (the LocalNet boot already sets `umbra-operator-1`). `[CITED: docs.dev.sync.global/validator_operator/validator_compose.html]`

## Code Examples

### Client-credentials + JWKS verify (solver, offline-testable)
See Pattern 3 `solver/src/auth.ts` above — `[CITED: github.com/panva/jose docs — createRemoteJWKSet/jwtVerify]`.

### Web auth-code + PKCE (desk login)
```ts
// web/src/auth/oidc.ts — oidc-client-ts UserManager (PKCE automatic; NO client secret)
import { UserManager } from 'oidc-client-ts'
export const um = new UserManager({
  authority: import.meta.env.VITE_OIDC_AUTHORITY,   // https://keycloak.umbra.dev/realms/umbra
  client_id: 'umbra-web',                            // PUBLIC client — no secret
  redirect_uri: `${location.origin}/callback`,
  response_type: 'code',                             // auth-code + PKCE
  scope: 'openid daml_ledger_api',
})
// signinRedirect() → callback → user.access_token → forwarded to the participant as the desk's Bearer.
// DUAL-MODE: if VITE_OIDC_AUTHORITY is unset, fall back to the dev token in tokens.json (unchanged).
```
`[CITED: docs.global.canton.network.sync.global/community/keycloak-docker-canton-validator-config.html — wallet-web-ui: Standard flow, openid+daml_ledger_api]`

### Splice DevNet validator bring-up (external gate)
```bash
# deploy/devnet/validator-compose/  — parameterized; run AT THE GATE (never faked offline)
./start.sh -s "$SPONSOR_SV_URL" -o "$ONBOARDING_SECRET" -p "umbra-operator-1" -m "$MIGRATION_ID" -w -a
# .env: AUTH_URL, AUTH_JWKS_URL=${AUTH_URL}/.well-known/jwks.json,
#       LEDGER_API_AUTH_AUDIENCE=https://canton.network.global, LEDGER_API_ADMIN_USER=<svc sub>,
#       VALIDATOR_AUTH_CLIENT_ID, VALIDATOR_AUTH_CLIENT_SECRET,
#       TARGET_TRAFFIC_THROUGHPUT=20000, MIN_TRAFFIC_TOPUP_INTERVAL="1m"
```
`[CITED: docs.dev.sync.global/validator_operator/validator_compose.html]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `unsafe-jwt-hmac-256` (HS256 shared secret `unsafe`) | `jwt-jwks` (RS256, JWKS URL, target-audience) | this phase (DevNet/prod path) | Dev keeps HMAC (dual-mode); prod verifies via Keycloak JWKS — same audience. |
| Pre-minted per-party dev tokens in `tokens.json` | auth-code + PKCE (web), client-credentials (solver) | this phase | Real OIDC issuance/MFA/RBAC; dev fallback preserved. |
| LocalNet (cn-quickstart, all-in-one) | Splice self-hosted DevNet validator joining the Global Synchronizer | this phase (external gate) | Real network connection needs SV sponsorship (external). |

**Deprecated/outdated:**
- Daml **2.x** HTTP JSON API v1 / `@daml/react` auth model — superseded by JSON Ledger API v2 (D8); irrelevant here.
- Contract keys — unavailable on LF 2.1 (11-02); do not reintroduce for the approval.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `jose@6.2.3` and `oidc-client-ts@3.5.0` are the right libraries (slopcheck not run this session) | Standard Stack / Audit | Low — both are well-known official-org packages with source repos + no postinstall; planner gates each install behind `checkpoint:human-verify`. |
| A2 | Caddy `tls internal` is the simplest dev TLS proxy for Keycloak | Standard Stack | Low — nginx+openssl is a documented fallback; purely a dev-cert convenience choice. |
| A3 | Keycloak `26.x` image is current/compatible with the Canton guide's flows | Standard Stack | Low — the guide's realm/scope/client model is version-stable; verify the tag at compose time. |
| A4 | A DevNet self-generated onboarding secret is obtainable via the validator API without a human SV (but the IP allowlist still needs SV adoption) | Q4 | Medium — the allowlist adoption (2–7d) and sponsor URL remain hard external gates regardless; the secret self-serve only shortens ONE sub-step. |
| A5 | The additive four-eyes templates introduce no new LF feature and keep the DAR LF-2.1 portable | Q1 / Runtime State | Low — `signatory`, `fetch`, `assertMsg`, `create` are all already used across the frozen templates; no keys/interfaces added. |
| A6 | The solver's `ledger.ts` credential resolution can grow a dual-mode switch without touching `api.ts`/`index.ts` | Q2 | Low — `resolveOperator()` is already the single module-private credential seam; the OIDC branch slots there, mirroring D10. |

## Open Questions

1. **Does the DevNet participant's user-rights bootstrap differ from LocalNet's `POST /v2/users/{id}/rights`?**
   - What we know: LocalNet grants rights via user management (D9); the Splice validator exposes `LEDGER_API_ADMIN_USER` mapped to the token `sub`.
   - What's unclear: whether the DevNet validator auto-provisions the admin user's party rights or requires the same explicit grant step.
   - Recommendation: parameterize `devnet-deploy.mjs` to run the same `grantRights` sequence; verify at the gate (CHAIN-02 UAT). Treat the admin-user/sub match as the primary live-failure watch item (Pitfall 3).

2. **Which exact Keycloak client-scope name does the DevNet participant expect — `daml_ledger_api` (default) or a custom scope?**
   - What we know: the default scope is `daml_ledger_api`; Umbra chooses audience-based auth so scope is secondary.
   - What's unclear: whether a specific deployment mandates a custom `target-scope`.
   - Recommendation: use audience (`https://canton.network.global`) + default scope; keep `LEDGER_API_AUTH_SCOPE` overridable in `.env`.

3. **Caddy vs nginx for the TLS proxy in front of the participant (not just Keycloak)?**
   - What we know: the JSON Ledger API v2 is plain HTTP on LocalNet; DevNet exposure wants TLS.
   - Recommendation: Caddy `tls internal` for the dev artifact; a real cert (Let's Encrypt / org CA) is UAT. Planner's discretion per CONTEXT.

## Environment Availability

| Dependency | Required By | Available (this box) | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `daml` (Bash PATH) | build the additive DAR + `daml test` (IDEN-03) | ✓ (Git-Bash only, `~/bin/daml`) | 3.4.11 | run via Bash tool (live-ops memory) |
| Docker + cn-quickstart LocalNet | re-vet rebuilt DAR; dual-mode dev path smoke | ✓ | Canton 3.4.8 (:3975/:2975/:4975) | persisted Postgres :55432 |
| Node 20 + npm | `jose`/`oidc-client-ts` install; solver/web unit tests | ✓ | Node 20 | — |
| Keycloak (Docker) | live OIDC token exchange (IDEN-01/02) | ✗ (not booted) | — | offline: mocked issuer (jose keypair + local JWKS) for unit tests; live = UAT |
| Splice DevNet validator + SV sponsorship | live connection (CHAIN-01/02) | ✗ (external gate) | — | NONE — build compose+scripts+runbook+checklist; live = external gate |
| Live DevNet Global Synchronizer | §4 on real Canton (CHAIN-02) | ✗ | — | NONE — UAT after CHAIN-01 |

**Missing dependencies with no fallback (external gate — planner must label, never fake):**
- Super-Validator sponsorship + egress-IP allowlist adoption (2–7 days) + `SPONSOR_SV_URL` + onboarding secret → CHAIN-01 external gate.
- A live DevNet participant → CHAIN-02 (§4 on real Canton) and CHAIN-03 (unattended live ops) UAT.

**Missing dependencies with fallback (offline-buildable/testable now):**
- Keycloak/Canton OIDC end-to-end → unit-test the JWKS verify + client-credentials acquisition against a mocked issuer; ship realm+compose+config; live exchange = UAT.
- Four-eyes gate → fully offline `daml test` (§4 + negative), no external dependency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `daml test` (Daml Script, `daml/daml.yaml` sdk 3.4.11) · `vitest@2.1.9` (solver + web) |
| Config file | `daml/daml.yaml`; `solver/` + `web/` vitest (no separate config, `npm test` = `vitest run`) |
| Quick run command | `cd solver && npx vitest run` (~seconds) · `cd daml && daml test` (via Bash, JVM-heavy) |
| Full suite command | `cd daml && daml test` + `npx --prefix solver vitest run` + `npm --prefix web test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command (offline) | File Exists? |
|--------|----------|-----------|------------------------------|-------------|
| IDEN-03 | §4 clears $100.00 WITH the four-eyes approval threaded (A=10/B=8/C=2) | daml unit | `daml test` → `test_four_eyes_clears_at_100` | ❌ Wave 0 (extend `daml/Umbra/Tests`) |
| IDEN-03 | settle with NO approval → on-ledger reject | daml negative | `daml test` → `test_settle_without_approval_rejected` (submitMustFail) | ❌ Wave 0 |
| IDEN-03 | settle with WRONG-price / wrong-round approval → reject | daml negative | `daml test` → `test_settle_wrong_approval_rejected` | ❌ Wave 0 |
| IDEN-03 | operator alone cannot forge `ClearingApproval` | daml negative | `daml test` → `test_operator_cannot_self_approve` (submitMustFail) | ❌ Wave 0 |
| IDEN-01 | JWKS verify accepts correct-audience RS256, rejects wrong-aud/wrong-key/expired | solver unit | `npx vitest run auth.test.ts` (mocked issuer via `jose.generateKeyPair`) | ❌ Wave 0 |
| IDEN-01 | client-credentials `acquireToken()` posts correct grant + returns token | solver unit | `npx vitest run auth.test.ts` (mock `/token` endpoint) | ❌ Wave 0 |
| IDEN-01 | dual-mode: dev HMAC path still resolves the operator credential unchanged | solver unit | `npx vitest run ledger*.test.ts` (existing + a mode-switch case) | ⚠ extend |
| IDEN-01/02 | web PKCE UserManager builds a correct authorize URL; secret-less bundle | web unit | `npm --prefix web test` (oidc config + a bundle-grep for the client secret ABSENT) | ❌ Wave 0 |
| IDEN-02 | realm export contains Trader/Compliance/Admin roles + OTP on Compliance/Admin | config unit | a `deploy/keycloak/realm.test.ts` asserting the JSON shape (roles, clients, mappers) | ❌ Wave 0 |
| CHAIN-01 | Splice validator compose + `.env.example` present with required vars | artifact check | grep/schema check that `SPONSOR_SV_URL`/`ONBOARDING_SECRET`/`MIGRATION_ID`/`party_hint` are parameterized | ❌ Wave 0 |
| CHAIN-02 | `devnet-deploy.mjs` uploads+vets DAR + allocates parties (parameterized endpoint) | script unit | vitest with a mocked v2 API (mirror how `api.test.ts` stubs the ledger) | ❌ Wave 0 |
| CHAIN-02 | §4 on real Canton clears $100.00 | LIVE UAT | — (needs live DevNet participant) | 🔒 UAT (external gate) |
| CHAIN-03 | Postgres-per-network compose + `pg_dump` script + monitoring + top-up config present | artifact check | compose/script lint + a schema check on `traffic-topup.env` | ❌ Wave 0 |
| CHAIN-03 | unattended run on a live node | LIVE UAT | — | 🔒 UAT |

### Sampling Rate
- **Per task commit:** `cd solver && npx vitest run` (+ `web test` for web tasks); `daml test` for Daml tasks (via Bash).
- **Per wave merge:** full `daml test` + `solver` + `web` vitest green; §4 canary ($100.00 / A=10/B=8/C=2) must hold WITH the four-eyes approval.
- **Phase gate:** full suite green offline; the live/external items (CHAIN-01/02/03 live, IDEN-01/02 live exchange/MFA) recorded as UAT in the phase verification (the Phase-8/10/11 "Built · live UAT pending" pattern).

### Wave 0 Gaps
- [ ] `daml/Umbra/Approval.daml` + Round.Clear additive field — new templates + gate.
- [ ] `daml/Umbra/Tests*` — `test_four_eyes_clears_at_100`, `test_settle_without_approval_rejected`, `test_settle_wrong_approval_rejected`, `test_operator_cannot_self_approve`.
- [ ] `solver/src/auth.ts` + `solver/src/auth.test.ts` — mocked-issuer JWKS verify + client-credentials.
- [ ] `web/src/auth/oidc.ts` + web test (PKCE config + secret-absent bundle grep).
- [ ] `deploy/keycloak/umbra-realm.json` + a realm-shape assertion test.
- [ ] `deploy/devnet/*` compose + `devnet-deploy.mjs` + a mocked-v2 script test.
- [ ] `web/daml.js/umbra-0.1.0` regenerated + committed after the additive templates.
- [ ] Framework install: `jose` (solver), `oidc-client-ts` (web) — each behind a `checkpoint:human-verify` (slopcheck unavailable).

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`. This phase is squarely an identity/auth/secrets phase — security IS the domain.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Keycloak OIDC (RS256/JWKS); MFA/OTP on Compliance+Admin; no HMAC shared secret in prod |
| V3 Session Management | yes | `oidc-client-ts` (PKCE, state/nonce, silent renew); short-lived tokens; offline_access opt-in |
| V4 Access Control | yes | Canton user-rights (actAs/readAs) + Keycloak realm roles (Trader/Compliance/Admin); four-eyes ON-LEDGER (IDEN-03) |
| V5 Input Validation | yes | existing zod on solver endpoints; JWKS token validation (aud/exp/alg) |
| V6 Cryptography | yes | RS256 via `jose` (never hand-roll); TLS at the proxy; DAR/beacon crypto unchanged |
| V7 Error handling / logging | yes | existing secret-safe envelope (`{error:{code,message}}`); never log tokens/secrets |
| V14 Config / secrets | yes | `.env` gitignored (D6); client secret server-side only; web bundle secret-less; bundle-grep in CI |

### Known Threat Patterns for {Canton OIDC + four-eyes}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client secret leaked in the browser bundle | Information Disclosure | web is a PUBLIC PKCE client (no secret); solver secret in `.env`; CI grep asserts absence |
| `alg:none` / algorithm confusion on the token | Spoofing/Tampering | `jose.jwtVerify` pinned to RS256 via JWKS; participant `jwt-jwks` (RS256 only) |
| Wrong-audience token accepted | Elevation of Privilege | `target-audience = https://canton.network.global` on the participant + `jwtVerify({audience})` in the solver |
| Operator self-approves the clearing (four-eyes bypass) | Elevation of Privilege | `ClearingApproval` `signatory operator, compliance`; born only from `compliance` exercising `ApproveClearing`; negative test |
| Stale/one-time onboarding secret reused | Spoofing | secret generated just-in-time (1h/48h validity, one-time); runbook step ordering |
| Token `sub` maps to no rights → silent 403 | Denial of Service | `LEDGER_API_ADMIN_USER` == token `sub` + explicit `grantRights` (Pitfall 3) |
| Unvetted DAR routes nothing | Denial of Service | re-vet the rebuilt DAR on every stakeholder participant (Pitfall 6) |

## Sources

### Primary (HIGH confidence)
- Splice — Validator Onboarding (SV sponsorship, egress IP allowlist 2–7d, onboarding secret 1h self-serve / 48h SV, one-time): https://docs.dev.sync.global/validator_operator/validator_onboarding.html
- Splice — Docker Compose Validator Deployment (`./start.sh -s -o -p -m -w -a`; `SPONSOR_SV_URL`/`ONBOARDING_SECRET`/`party_hint` format/`MIGRATION_ID`; `AUTH_URL`/`AUTH_JWKS_URL`/`LEDGER_API_AUTH_AUDIENCE`/`LEDGER_API_AUTH_SCOPE`/`LEDGER_API_ADMIN_USER`/`VALIDATOR_AUTH_CLIENT_ID`/`_SECRET`; `TARGET_TRAFFIC_THROUGHPUT`/`MIN_TRAFFIC_TOPUP_INTERVAL`; DevNet auto-taps coin): https://docs.dev.sync.global/validator_operator/validator_compose.html
- Digital Asset — Configure API Auth with JWT (participant `ledger-api.auth-services` `type=jwt-jwks`, `url`, `target-audience` XOR `target-scope`, default scope `daml_ledger_api`, RS256): https://docs.digitalasset.com/operate/3.5/howtos/secure/apis/jwt.html
- Canton community — Keycloak Configuration Guide for Canton Validator (realm, `daml_ledger_api` scope + Audience mapper → `https://canton.network.global`, confidential `validator-app-backend` service-account client, public `wallet-web-ui`/`cns-ui` auth-code+PKCE, JWKS `.../realms/<realm>/protocol/openid-connect/certs`): https://docs.global.canton.network.sync.global/community/keycloak-docker-canton-validator-config.html
- Codebase (repo, HIGH — read this session): `daml/Umbra/Auction.daml` (Round.Clear §8 recompute + additive Option-B fields), `daml/Umbra/Compliance.daml` (DeskEligibility `signatory operator, compliance` + fetch-by-cid gate — the four-eyes precedent), `daml/Umbra/Roles.daml`, `solver/src/ledger.ts` (`resolveOperator()` credential seam), `scripts/localnet/mint-jwt.mjs`/`deploy.mjs`/`xnode-up.mjs`/`up.mjs`, `DECISIONS.md` D7/D8/D9/D10/D11/D13.

### Secondary (MEDIUM confidence)
- npm registry — `jose@6.2.3` (panva), `oidc-client-ts@3.5.0` (authts), `openid-client@6.8.4` (panva); versions + repos + no-postinstall confirmed via `npm view` 2026-07-10.
- Canton Network — "How to get started with a validator": https://www.canton.network/blog/how-to-get-started-with-a-validator

### Tertiary (LOW confidence — flagged)
- Caddy `tls internal` as the dev TLS choice (design preference, not a Canton requirement) — A2.
- Keycloak `26.x` tag currency — verify at compose time — A3.

## Metadata

**Confidence breakdown:**
- Four-eyes Daml gate (IDEN-03): HIGH — grounded in this repo's shipped `DeskEligibility` (identical signatory pair + fetch-by-cid) and Round.Clear structure; no external unknowns.
- Canton OIDC / jwt-jwks (IDEN-01): HIGH — Digital Asset + official Keycloak-for-Canton guide; audience string confirmed identical to the existing dev token.
- Keycloak realm/flows (IDEN-01/02): HIGH for the pattern (official guide); MEDIUM for the exact Umbra role/MFA layout (a designed mapping).
- Splice DevNet onboarding + external gate (CHAIN-01/02): HIGH — official Splice onboarding + compose docs; the external nature (allowlist 2–7d, sponsor URL, secret) is explicit.
- Ops/traffic top-up (CHAIN-03): HIGH — official validator compose (top-up env vars, DevNet auto-tap); Postgres-per-network mirrors the repo's existing isolation.
- New npm packages: MEDIUM — versions/repos verified, but slopcheck unavailable → each install gated behind `checkpoint:human-verify`.

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 (30 days — Splice DevNet onboarding + Canton auth config are stable; re-verify the Splice image tags and Keycloak version at compose time)

## RESEARCH COMPLETE
