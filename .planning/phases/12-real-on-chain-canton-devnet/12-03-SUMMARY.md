---
phase: 12-real-on-chain-canton-devnet
plan: 03
subsystem: deploy-identity
tags: [keycloak, oidc, caddy, tls, jwt-jwks, canton, rbac, mfa, otp, pkce, dual-mode, IDEN-01, IDEN-02]

# Dependency graph
requires:
  - phase: 12-real-on-chain-canton-devnet
    plan: 02
    provides: "OIDC dual-mode solver/web seam + the env keys this realm must serve (OIDC_ISSUER/JWKS/CLIENT_ID=umbra-solver/CLIENT_SECRET, VITE_OIDC_AUTHORITY)"
  - phase: 11-settlement-institutional-grade
    provides: "mint-jwt.mjs dev token audience https://canton.network.global (the audience the realm must mint) + LocalNet Postgres :55432 isolation precedent"
provides:
  - "deploy/keycloak/umbra-realm.json: Keycloak realm export — confidential umbra-solver (client-credentials) + public umbra-web (auth-code+PKCE S256), daml_ledger_api scope with a Canton-audience mapper (https://canton.network.global) + role mappers, realm roles Trader/Compliance/Admin, users bankA/B/C/guest->Trader + compliance + admin, conditional OTP bound to Compliance+Admin"
  - "deploy/keycloak/docker-compose.yaml: Keycloak 26.1 (start --import-realm) + isolated Postgres (host :55433) + Caddy dev-TLS; ports off the LocalNet stack"
  - "deploy/keycloak/Caddyfile: tls internal + reverse_proxy -> keycloak:8080, exposes issuer/JWKS/token on :8443"
  - "deploy/keycloak/realm.test.mjs: 8-check OFFLINE realm-shape assertion (no Docker)"
  - "deploy/canton/participant-oidc-auth.conf: dual-mode jwt-jwks auth-config (target-audience, audience XOR scope), honest DEV-keeps-unsafe-HMAC header + sub<->admin-user note"
  - "deploy/keycloak/.env.example + deploy/README.md: placeholder env + boot/wiring/UAT-boundary docs"
affects: [12-04-devnet-splice, 12-05-four-eyes-ui]

# Tech tracking
tech-stack:
  added:
    - "Keycloak 26.1 (quay.io/keycloak/keycloak) — OIDC issuer (Docker image, run at UAT)"
    - "Caddy 2 — dev-TLS reverse proxy (tls internal, Docker image)"
    - "Postgres 15 — isolated Keycloak store (host :55433, per-network volume)"
  patterns:
    - "Audience-identical OIDC migration: the realm mints aud=https://canton.network.global (same as the dev HS256 token) — only signing alg + key source change (HS256/unsafe -> RS256/JWKS)"
    - "Conditional MFA: OTP enforced ONLY for settlement-affecting roles via conditional-user-role subflows bound to Compliance + Admin; Traders skip OTP"
    - "Config-as-artifact validated OFFLINE: realm shape (node), compose schema (docker compose config -q), HOCON grep (jwt-jwks/audience/no scope) — no live boot required"
    - "Port isolation: Keycloak stack (:8443/:8081/:55433) deliberately off the LocalNet stack (:3975/:2975/:4975/:55432)"

key-files:
  created:
    - "deploy/keycloak/umbra-realm.json"
    - "deploy/keycloak/docker-compose.yaml"
    - "deploy/keycloak/Caddyfile"
    - "deploy/keycloak/.env.example"
    - "deploy/keycloak/realm.test.mjs"
    - "deploy/canton/participant-oidc-auth.conf"
    - "deploy/README.md"
  modified: []

key-decisions:
  - "Realm mints aud=https://canton.network.global (oidc-audience-mapper included.custom.audience) so the OIDC token is byte-audience-identical to the dev token + the solver's jose verify (12-02) — the switch is signing-alg + key-source only"
  - "umbra-solver = confidential client-credentials (serviceAccountsEnabled true, publicClient false, placeholder secret, default scope daml_ledger_api); umbra-web = public PKCE (publicClient true, standardFlowEnabled true, pkce.code.challenge.method=S256, NO secret key present)"
  - "MFA modeled as conditional-user-role OTP subflows (condUserRole=Compliance / =Admin) + CONFIGURE_TOTP required action — OTP fires only for settlement-affecting roles, not for Traders"
  - "Canton config uses target-audience ONLY (audience XOR scope, Pitfall 2); the scope-based key is intentionally omitted and the file greps clean of the scope token"
  - "Ports chosen off the LocalNet stack: Caddy :8443, Keycloak direct :8081, Keycloak Postgres :55433 (LocalNet holds :55432) — mirrors the repo's per-network Postgres isolation precedent"
  - "Keycloak 26.1 uses KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD (renamed from KEYCLOAK_ADMIN in 26.x); TLS terminates at Caddy so Keycloak runs KC_HTTP_ENABLED=true + KC_PROXY_HEADERS=xforwarded behind the proxy"

patterns-established:
  - "Offline realm-shape test: read the committed Keycloak export + node:assert the clients/flow-flags/roles/audience-mapper-value/OTP-binding — proves the export mints correct tokens before any Docker boot"

requirements-completed: [IDEN-01, IDEN-02]

# Metrics
duration: ~12min
completed: 2026-07-10
---

# Phase 12 Plan 03: Keycloak Realm + TLS Proxy + Canton jwt-jwks Auth-Config (IDEN-01/02) Summary

**The DevNet/prod identity artifacts the OIDC dual-mode path (12-02) needs: a Keycloak `umbra` realm export (confidential solver client-credentials + public web auth-code/PKCE, RBAC roles, a Canton-audience mapper, MFA on settlement-affecting roles), a docker-compose (Keycloak + isolated Postgres + Caddy dev-TLS), and the Canton participant `jwt-jwks` auth-config — all dual-mode (LocalNet `unsafe-jwt-hmac-256` stays), NO live secret committed, and their SHAPE asserted entirely OFFLINE (realm-shape test + docker compose config + HOCON greps). Live boot + token exchange + MFA are UAT.**

## Accomplishments

- **`deploy/keycloak/umbra-realm.json`** — Keycloak realm export:
  - `umbra-solver`: confidential client-credentials (`serviceAccountsEnabled: true`, `publicClient: false`, `standardFlowEnabled: false`, placeholder secret, default scope `daml_ledger_api`) — the server-side machine-to-machine token (the guide's `validator-app-backend`).
  - `umbra-web`: public auth-code + PKCE (`publicClient: true`, `standardFlowEnabled: true`, `pkce.code.challenge.method: S256`, redirect/web origins to `http://localhost:5173`, scopes `openid`+`daml_ledger_api`, **no `secret` key**).
  - `daml_ledger_api` client scope: an **`oidc-audience-mapper` → `https://canton.network.global`** + a User-Client-Role mapper + a realm-role mapper (so `Trader`/`Compliance`/`Admin` flow into the token).
  - realm roles `Trader`/`Compliance`/`Admin`; users `bankA/bankB/bankC/guest → Trader`, `compliance → Compliance`, `admin → Admin`.
  - MFA: `CONFIGURE_TOTP` required action + a browser flow with **conditional-user-role OTP subflows** binding OTP to `Compliance` and `Admin` (Traders skip OTP); `compliance`/`admin` users carry the `CONFIGURE_TOTP` required action.
- **`deploy/keycloak/docker-compose.yaml`** — Keycloak `26.1` (`start --import-realm`, mounts `umbra-realm.json`) + isolated Postgres (`postgres:15`, dedicated `kc-postgres-data` volume, host `:55433` off LocalNet `:55432`) + Caddy `2`. Validated against the Docker Compose schema (`docker compose config -q`).
- **`deploy/keycloak/Caddyfile`** — `tls internal` (one-line self-signed dev cert) + `reverse_proxy keycloak:8080` with `X-Forwarded-*` headers; exposes issuer/JWKS/token on `https://keycloak.umbra.dev:8443`.
- **`deploy/keycloak/realm.test.mjs`** — 8 OFFLINE shape checks (both clients + flow flags, RBAC roles, the audience-mapper value, OTP conditionally bound to Compliance+Admin, placeholder-only secret). Exits 0, no Docker.
- **`deploy/canton/participant-oidc-auth.conf`** — dual-mode HOCON: `auth-services = [{ type = jwt-jwks, url = <JWKS>, target-audience = https://canton.network.global }]`, audience XOR scope (Pitfall 2), honest header (DEV keeps `unsafe-jwt-hmac-256`), and the `sub` ↔ `LEDGER_API_ADMIN_USER` requirement (Pitfall 3).
- **`deploy/keycloak/.env.example` + `deploy/README.md`** — placeholder env (isolated ports, bootstrap admin) + boot/wiring instructions + an honest offline-vs-UAT boundary table and the #1 live-gotcha (`sub`/admin-user).

## Offline shape-test results

| Check | Command | Result |
|-------|---------|--------|
| Realm parses + clients/roles present | `node -e require(...umbra-realm.json)` | ✅ clients umbra-solver,umbra-web · roles Trader,Compliance,Admin |
| Realm shape (8 checks) | `node deploy/keycloak/realm.test.mjs` | ✅ 8/8 passed, exit 0 |
| Compose YAML + schema | `docker compose config -q` (dummy env) | ✅ DOCKER-COMPOSE-CONFIG-VALID |
| Caddy TLS + proxy | `grep "tls internal" + "reverse_proxy"` | ✅ both present |
| Canton auth shape | `grep jwt-jwks && grep canton.network.global && ! grep target-scope` | ✅ jwt-jwks + audience present, scope key absent |
| No live secret | `grep -rn secret/password deploy/` | ✅ placeholders + labels only (dev `unsafe` documented) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] HOCON explanatory comments tripped the plan's `! grep -q "target-scope"` gate**
- **Found during:** Task 3 verification.
- **Issue:** The plan's mechanical acceptance check greps the WHOLE conf file for the literal `target-scope` and requires it absent (audience XOR scope). My educational Pitfall-2 comments referenced `target-scope` by name (two occurrences), so the grep matched and the gate failed — even though no `target-scope` key is actually configured.
- **Fix:** Reworded the comments to "the scope option / scope-based key" so the literal token `target-scope` no longer appears in the file; the audience-only config is unchanged and the intent is still documented.
- **Files modified:** `deploy/canton/participant-oidc-auth.conf`
- **Commit:** `f6f3eaa` (fix folded into the Task 3 commit before push)

### Benign design choices (plan-permitted discretion)

- **Added `deploy/keycloak/.env.example`** (not enumerated in the must-haves) — Task 2's action calls for "env-driven admin creds + DB password (placeholders in a committed `.env.example`)", so the file is plan-directed; it holds placeholders only.
- **Three protocol mappers on `daml_ledger_api`** (audience + client-role + realm-role) — the plan names the audience mapper + "a User-Client-Role mapper"; I added a realm-role mapper too because the RBAC roles are REALM roles, so a realm-role mapper is what actually flows `Trader`/`Compliance`/`Admin` into the token. Additive; the audience mapper value is exactly `https://canton.network.global`.
- **Keycloak 26.1 `start --import-realm` behind Caddy** — used `KC_HTTP_ENABLED=true` + `KC_PROXY_HEADERS=xforwarded` (TLS terminates at Caddy) and the 26.x `KC_BOOTSTRAP_ADMIN_*` env names; honors the plan's literal `start --import-realm`.

## Authentication Gates

None encountered. No package installs this plan (Keycloak/Caddy/Postgres are Docker images vetted at compose time by official registry/tag — the plan's honest limitation notes verifying the `26.x` tag currency at compose time). Live OIDC token exchange + live MFA remain UAT.

## Known Stubs

None that block the plan's goal. All secrets are intentional placeholders (`CHANGE_ME_AT_UAT`, `REPLACE_WITH_REAL_CLIENT_SECRET_AT_UAT`) in a committed template; real values live in gitignored `.env` / the Keycloak admin console at UAT.

## Honest Limitations (live UAT)

- **The stack runs under Docker → booting Keycloak+Caddy+Postgres, importing the realm, live token exchange, and live MFA (OTP) are UAT** (not run on this box). Shapes are asserted offline (realm-shape test + `docker compose config` + HOCON greps).
- **Keycloak `26.1` tag currency** should be re-verified at compose time (RESEARCH A3) — the realm/scope/client model is version-stable, but confirm the tag before the live boot.
- **The Canton side (`participant-oidc-auth.conf`) is a config artifact** — a running DevNet participant actually accepting the OIDC issuer, and the `sub` ↔ `LEDGER_API_ADMIN_USER` rights wiring (RESEARCH Pitfall 3, the #1 live-failure mode), are CHAIN-02/UAT.
- **Dev-TLS is `tls internal` (self-signed)** — a real cert (Let's Encrypt / org CA) is UAT.

## Self-Check: PASSED

- FOUND: `deploy/keycloak/umbra-realm.json`, `deploy/keycloak/docker-compose.yaml`, `deploy/keycloak/Caddyfile`, `deploy/keycloak/.env.example`, `deploy/keycloak/realm.test.mjs`, `deploy/canton/participant-oidc-auth.conf`, `deploy/README.md`
- FOUND commits: `79b1693` (realm), `60ceab8` (compose+Caddy+env), `f6f3eaa` (HOCON+test+README)
- `node deploy/keycloak/realm.test.mjs` → 8/8, exit 0
- `docker compose config -q` (dummy env) → valid
- Canton HOCON: jwt-jwks + `https://canton.network.global` present, `target-scope` absent
- No real secret committed (placeholders + the documented dev `unsafe` only)
- No Claude/AI git attribution (author/committer = woshvad); STATE.md/ROADMAP.md deliberately NOT modified per plan instructions

---
*Phase: 12-real-on-chain-canton-devnet*
*Completed: 2026-07-10*
