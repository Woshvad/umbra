# Umbra Secrets Runbook (OPS-02)

How Umbra sources its managed secrets, how to switch from a bare `.env` to HashiCorp Vault,
and how to rotate a secret. The abstraction lives in `solver/src/secrets.ts`
(`createSecretsProvider()` → `SecretsProvider.get(name)`); this runbook is the operator side.

## Managed secrets

Three secrets are managed through the provider. The browser NEVER receives any of them —
they are server-side only, module-private in the solver (SOLV-04 discipline).

| Secret | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API key — read ONLY by `solver/` (never in the frontend bundle) |
| operator token | The Canton operator credential the solver uses on the ledger API |
| party tokens | Per-desk JWTs used by the party switcher / desk sessions |

## The `env` vs `vault` switch — `SECRETS_PROVIDER`

The backend is selected by the `SECRETS_PROVIDER` env var (mirrors how `OIDC_ISSUER`
presence selects the credential path in `ledger.ts`):

| `SECRETS_PROVIDER` | Backend | Behavior |
| --- | --- | --- |
| unset (default) or `env` | `env` | Reads `process.env[name]` — **byte-for-byte the current `.env` behavior**. Nothing changes; Vault is not required. |
| `vault` | `vault` | Reads HashiCorp Vault **KV v2** over the raw JSON API: `GET ${VAULT_ADDR}/v1/secret/data/umbra/<name>`, header `X-Vault-Token`, value at `data.data.<name>`. No `node-vault` SDK. |

`env` is the offline default so the dev loop and all existing tests keep working with no Vault
deployed. A non-2xx Vault response throws a secret-free `Vault HTTP <status>` (status only —
the response body is never echoed).

## Booting the dev Vault

Dev-mode Vault is a standalone compose file — **not** merged into the LocalNet or Keycloak
stacks. It runs unsealed, in-memory, on `:8200` with a FIXED **UNSAFE-DEV** root token.

```bash
docker compose -f ops/vault/docker-compose.vault.yml up -d

export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=UNSAFE-DEV-umbra-root-token   # UNSAFE-DEV — dev loop only
export SECRETS_PROVIDER=vault
```

> **T-13-05 (accept):** the dev root token is UNSAFE-DEV — it exists only for the offline/UAT
> dev loop and mirrors the LocalNet `unsafe` HMAC-secret precedent. It is not a production
> credential. See the AppRole prod path below.

## Seeding the managed secrets (KV v2)

Write each managed secret to the `secret/umbra/*` KV v2 path. Any of these works; the write
path must be `v1/secret/data/umbra/<key>` (KV v2 nests under `data`):

```bash
# ANTHROPIC_API_KEY
NEW_VALUE='sk-ant-...' node scripts/rotate-secret.mjs ANTHROPIC_API_KEY
# operator token
NEW_VALUE="$(cat scripts/.operator-token)" node scripts/rotate-secret.mjs OPERATOR_TOKEN
# a party token
NEW_VALUE='<desk-jwt>' node scripts/rotate-secret.mjs PARTY_TOKEN_DESK_A
```

(Equivalently `vault kv put secret/umbra/ANTHROPIC_API_KEY value=...` from the Vault CLI —
the raw-fetch path above avoids needing the CLI installed.)

## Rotating a secret — `scripts/rotate-secret.mjs`

Rotation writes a **new KV v2 version** of a named secret. KV v2 retains prior versions, so
this is non-destructive; the new value becomes current and `data.data.<key>` returns it.

```bash
NEW_VALUE='<the-new-secret>' node scripts/rotate-secret.mjs ANTHROPIC_API_KEY
# prints, e.g.:  rotated umbra/ANTHROPIC_API_KEY -> KV v2 version 3
```

The script prints ONLY the key name and the new version number — never the value. The value
is read from `NEW_VALUE` (env) and placed only in the request body; it is never logged, never
echoed, never interpolated into an error.

**Solver pickup:** the solver re-reads the current version on next boot (or via an
authenticated admin refresh). Restart the solver after a rotation in the dev loop:

```bash
# restart the solver process so createSecretsProvider() re-reads the rotated value
```

> **Live zero-downtime rotation is a UAT gate.** Proving that a running solver picks up a
> rotated secret with no dropped requests requires the dev Vault booted and the solver wired
> to the `vault` backend under load — that is a UAT item, not an offline claim. Offline we
> prove the abstraction: `env` default preserved, `vault` raw-fetch KV v2 read, secret-free
> throws (`solver/src/secrets.test.ts`), and the rotate write path
> (`scripts/rotate-secret.mjs`).

## Production path — AppRole (not dev root token)

Production does **not** use the UNSAFE-DEV root token. Use Vault **AppRole**: the solver
authenticates with a `role_id` + a short-lived `secret_id`, exchanges them for a scoped,
short-TTL token, and reads only `secret/umbra/*`. This mirrors the OIDC client-credentials
pattern already used for the ledger identity (`auth.ts`). Wire `VAULT_TOKEN` to the
AppRole-issued token (or extend `secrets.ts` with an AppRole login step). Bringing up a real
Vault (unseal, policies, AppRole, audit device) is a UAT/ops task.
