// solver/src/secrets.ts — the OPS-02 SecretsProvider seam: a two-backend abstraction
// (`env` | `vault`) that gets managed secrets OUT of a bare `.env` and into a
// vault-capable, rotatable store — WITHOUT changing current behavior by default.
//
// KEY INSIGHT (mirrors ledger.ts HMAC-vs-OIDC + auth.ts): the switch from `.env` to
// HashiCorp Vault changes only WHERE a secret comes from, never the secret's identity or
// how the rest of the solver consumes it. `SECRETS_PROVIDER` selects the backend exactly
// as `OIDC_ISSUER`'s presence selects the credential path in ledger.ts:
//   • unset / `env`  → read process.env[name] (DEV DEFAULT — byte-for-byte current behavior)
//   • `vault`        → read KV v2 over raw fetch (no node-vault SDK — the locked path)
//
// SECURITY (SOLV-04 discipline, mirrors auth.ts `oidcClientSecret` + ledger.ts
// `_operatorToken`): VAULT_TOKEN and every resolved secret are held module-private, read
// LAZILY inside functions (so a test can set process.env first and so importing this module
// never forces the vault vars to exist on the dev path), and are NEVER returned by anything
// other than the requested value, NEVER spread into a response, NEVER logged, and NEVER
// interpolated into an error message. A non-2xx Vault response throws a SECRET-FREE error
// carrying the STATUS ONLY — the response body is deliberately not echoed (could carry
// internals). Managed secret names: ANTHROPIC_API_KEY, the operator token, party tokens.

// ── The provider contract ─────────────────────────────────────────────────────────
// A single async accessor. Callers `await provider.get('ANTHROPIC_API_KEY')` and receive
// ONLY the value string; the mechanism (env read vs Vault fetch) is opaque to them.
export interface SecretsProvider {
  get(name: string): Promise<string>
}

// ── env vars (module-private; read LAZILY inside the vault backend) ────────────────
// Not frozen at import so tests set process.env before invoking, and so the dev (`env`)
// path never requires VAULT_ADDR/VAULT_TOKEN to exist.
const requireEnv = (name: string): string => {
  const v = process.env[name]
  // Secret-free throw (mirror auth.ts requireEnv): name the missing var, never its value.
  if (!v) throw new Error(`${name} is unset`)
  return v
}

const vaultAddr = (): string => requireEnv('VAULT_ADDR')
// The Vault access token — resolved only inside the fetch header, NEVER returned/logged.
const vaultToken = (): string => requireEnv('VAULT_TOKEN')

// ── env backend ───────────────────────────────────────────────────────────────────
// Byte-for-byte current behavior: returns process.env[name], throwing the SAME secret-free
// `${name} is unset` as auth.ts requireEnv when the var is absent. This is the default when
// SECRETS_PROVIDER is unset, so nothing breaks when Vault is not deployed.
const envProvider: SecretsProvider = {
  get: async (name: string): Promise<string> => requireEnv(name),
}

// ── vault backend (KV v2 over raw fetch — no node-vault SDK) ────────────────────────
// Mirrors auth.ts acquireToken's raw-fetch discipline. KV v2 nests the payload under
// `data.data`, so a read of `secret/umbra/<name>` is a GET to
// `${VAULT_ADDR}/v1/secret/data/umbra/<name>` and the value is `json.data.data[name]`.
// The token rides the `X-Vault-Token` header (server-side ONLY; never logged). A non-2xx
// throws `Vault HTTP ${status}` (status ONLY — the response body is NOT interpolated).
const vaultProvider: SecretsProvider = {
  get: async (name: string): Promise<string> => {
    // LO-02: encode the secret name before interpolating it into the KV path. Today `name`
    // is an internal constant (ANTHROPIC_API_KEY, operator/party tokens), but an unencoded
    // `../` or slash would traverse the KV mount if a caller ever passed a dynamic name.
    const res = await fetch(`${vaultAddr()}/v1/secret/data/umbra/${encodeURIComponent(name)}`, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken() }, // server-side ONLY; never returned/logged
    })
    if (!res.ok) {
      // Secret-free: the token is in the request header we just sent, NOT in this error;
      // we deliberately do not echo the response body (could carry internals).
      throw new Error(`Vault HTTP ${res.status}`)
    }
    // KV v2 shape: { data: { data: { <name>: <value> }, metadata: {...} } }
    const json = (await res.json()) as { data?: { data?: Record<string, string> } }
    const value = json.data?.data?.[name]
    if (value === undefined) {
      // No value echoed — name only.
      throw new Error(`Vault secret umbra/${name} missing`)
    }
    return value
  },
}

// ── factory: select the backend by SECRETS_PROVIDER ─────────────────────────────────
// `env` (or unset) → the dev default (preserves current .env behavior); `vault` → KV v2.
// An unrecognized value fails loud (secret-free) rather than silently degrading.
export function createSecretsProvider(): SecretsProvider {
  const backend = process.env.SECRETS_PROVIDER ?? 'env'
  switch (backend) {
    case 'env':
      return envProvider
    case 'vault':
      return vaultProvider
    default:
      throw new Error(`Unknown SECRETS_PROVIDER: ${backend} (expected 'env' or 'vault')`)
  }
}
