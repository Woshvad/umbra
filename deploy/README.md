# Umbra — DevNet/prod deployment artifacts (IDEN-01/02)

This directory holds the **identity + Canton-auth artifacts** for the real OIDC path
(the DevNet/prod side of Umbra's dual-mode auth). The LocalNet `daml start` / cn-quickstart
dev loop with `unsafe-jwt-hmac-256` is **UNCHANGED** and needs none of this.

```
deploy/
├── keycloak/
│   ├── umbra-realm.json            # realm export: clients, RBAC roles, audience+role mappers, MFA
│   ├── docker-compose.yaml         # Keycloak + isolated Postgres + Caddy dev-TLS proxy
│   ├── Caddyfile                   # dev TLS (tls internal) + reverse_proxy -> Keycloak
│   ├── .env.example                # placeholder env for the stack (copy to .env at UAT)
│   └── realm.test.mjs              # OFFLINE realm-shape assertion (no Docker needed)
├── canton/
│   └── participant-oidc-auth.conf  # Canton participant jwt-jwks auth-config (dual-mode)
└── README.md                       # this file
```

## What is real vs. what is UAT

| Artifact | Built + validated offline | Live boot / exchange |
|----------|---------------------------|----------------------|
| Keycloak realm shape | ✅ `node deploy/keycloak/realm.test.mjs` | — |
| docker-compose schema | ✅ `docker compose config -q` | booting the stack = UAT |
| Canton `jwt-jwks` config shape | ✅ grep asserts (jwt-jwks, audience, no target-scope) | participant accepts OIDC = UAT |
| Live token exchange (solver client-credentials) | ✅ offline mocked issuer (`solver/src/auth.test.ts`, 12-02) | real Keycloak `/token` = UAT |
| Live MFA (OTP) on Compliance/Admin | realm shape asserted | real OTP challenge = UAT |

**Nothing here contains a live secret.** Every password/secret is a placeholder
(`CHANGE_ME_AT_UAT` / `REPLACE_WITH_REAL_CLIENT_SECRET_AT_UAT`). Real values are injected
at UAT via the gitignored `.env` files and the Keycloak admin console.

## 1. Assert the realm shape (offline, no Docker)

```bash
node deploy/keycloak/realm.test.mjs
```

Verifies: `umbra-solver` (confidential client-credentials), `umbra-web` (public auth-code +
PKCE S256), realm roles `Trader`/`Compliance`/`Admin`, the audience mapper value
`https://canton.network.global`, and OTP conditionally bound to `Compliance` + `Admin`.

## 2. Boot Keycloak behind dev-TLS (UAT)

```bash
cd deploy/keycloak
cp .env.example .env                 # then fill real KC_DB_PASSWORD + KC_BOOTSTRAP_ADMIN_PASSWORD
# resolve the dev hostname locally:  add "127.0.0.1  keycloak.umbra.dev" to your hosts file
docker compose up -d                 # keycloak imports umbra-realm.json on first boot
```

Ports are deliberately OFF the LocalNet stack (`:3975/:2975/:4975` Canton, `:55432`
LocalNet Postgres): Caddy dev-TLS `:8443`, Keycloak direct (debug) `:8081`, Keycloak
Postgres `:55433`.

The realm's OIDC surface (through Caddy):

- **issuer**: `https://keycloak.umbra.dev:8443/realms/umbra`
- **JWKS**:   `https://keycloak.umbra.dev:8443/realms/umbra/protocol/openid-connect/certs`
- **token**:  `https://keycloak.umbra.dev:8443/realms/umbra/protocol/openid-connect/token`

## 3. Point the solver + web at the realm

Solver `.env` (server-side, gitignored — the confidential secret lives ONLY here, never
in the browser):

```
OIDC_ISSUER=https://keycloak.umbra.dev:8443/realms/umbra
OIDC_JWKS_URL=https://keycloak.umbra.dev:8443/realms/umbra/protocol/openid-connect/certs
OIDC_CLIENT_ID=umbra-solver
OIDC_CLIENT_SECRET=<the umbra-solver secret from the Keycloak admin console>
OIDC_OPERATOR_PARTY=<operator party id>
```

Setting `OIDC_ISSUER` flips the solver's operator credential from the unsafe-HMAC dev token
to real client-credentials RS256 (see `solver/src/auth.ts` + the 12-02 dual-mode seam).
Leaving it unset keeps the byte-unchanged dev loop.

Web `.env` (public — NO secret; `umbra-web` is a public PKCE client):

```
VITE_OIDC_AUTHORITY=https://keycloak.umbra.dev:8443/realms/umbra
```

## 4. Trust the realm on the Canton participant (`jwt-jwks`)

Apply `deploy/canton/participant-oidc-auth.conf` to the DevNet participant. It sets
`ledger-api.auth-services = [{ type = jwt-jwks, url = <JWKS>, target-audience =
https://canton.network.global }]`. On a Splice validator these surface as
`AUTH_JWKS_URL` + `LEDGER_API_AUTH_AUDIENCE`.

### ⚠ The #1 live-UAT gotcha — `sub` must equal `LEDGER_API_ADMIN_USER`

Canton derives party rights (`actAs`/`readAs`) from the **user identified by the token
`sub`**, NOT from token claims. So:

1. The `umbra-solver` service-account `sub` MUST equal the participant's
   `LEDGER_API_ADMIN_USER`.
2. That user MUST have been granted the operator party's `CanActAs` / `CanReadAs`
   (the `grantRights` step in the deploy script).

If this is not wired, the OIDC token verifies fine but **every ledger call returns 403**.
Verify this first at the gate (RESEARCH Pitfall 3).

### Audience XOR scope

Configure **exactly one** of `target-audience` / `target-scope`. Umbra uses
`target-audience = https://canton.network.global` (matches the dev token) and the default
`daml_ledger_api` scope. Setting both makes the participant reject the auth config
(RESEARCH Pitfall 2).

## Dual-mode summary

| | DEV (LocalNet) | DEVNET/PROD (this dir) |
|---|---|---|
| Auth service | `unsafe-jwt-hmac-256` | `jwt-jwks` (Keycloak realm) |
| Signing | HS256, shared secret `unsafe` | RS256, verified via JWKS |
| Audience | `https://canton.network.global` | `https://canton.network.global` (identical) |
| Solver token | `scripts/.operator-token` (HS256) | client-credentials (`umbra-solver`) |
| Web token | pre-minted dev token | auth-code + PKCE (`umbra-web`) |

Only the signing algorithm + key source change between modes — the claim shape, the
audience, and the participant's user-rights model are identical.
