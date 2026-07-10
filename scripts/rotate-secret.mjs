#!/usr/bin/env node
// Umbra — rotate a managed secret in HashiCorp Vault KV v2 (OPS-02).
//
// Writes a NEW KV v2 VERSION of a named secret to
//   ${VAULT_ADDR}/v1/secret/data/umbra/<key>
// over the raw JSON API (no node-vault SDK — the locked path, mirroring
// solver/src/secrets.ts). KV v2 keeps prior versions, so this is a non-destructive
// rotation: the new value becomes the current version and the read path
// (data.data.<key>) immediately returns it.
//
// SECURITY (SOLV-04 / T-13-03 discipline): the secret VALUE is NEVER printed, NEVER logged,
// and NEVER interpolated into an error message. The value is read from an env var (or stdin)
// and placed ONLY in the request body. On success this prints ONLY the key name and the new
// KV v2 version number. A non-2xx throws a SECRET-FREE `Vault HTTP <status>` (status only —
// the response body is not echoed).
//
// Usage:
//   VAULT_ADDR=http://127.0.0.1:8200 \
//   VAULT_TOKEN=UNSAFE-DEV-umbra-root-token \
//   NEW_VALUE='<the-new-secret>' \
//   node scripts/rotate-secret.mjs ANTHROPIC_API_KEY
//
// NOTE: live, zero-downtime, vault-backed rotation is a UAT gate (needs the dev Vault booted
// via ops/vault/docker-compose.vault.yml). See docs/SECRETS-RUNBOOK.md.

const requireEnv = (name) => {
  const v = process.env[name]
  // Secret-free: name the missing var, never its value.
  if (!v) throw new Error(`${name} is unset`)
  return v
}

export const rotateSecret = async (key, value, { addr, token } = {}) => {
  const vaultAddr = addr ?? requireEnv('VAULT_ADDR')
  const vaultToken = token ?? requireEnv('VAULT_TOKEN')
  if (!key) throw new Error('usage: node scripts/rotate-secret.mjs <KEY> (with NEW_VALUE env)')
  if (value === undefined || value === '') throw new Error('NEW_VALUE is unset (nothing to rotate)')

  // KV v2 write: POST { data: { <key>: <value> } } to /v1/secret/data/umbra/<key>.
  const res = await fetch(`${vaultAddr}/v1/secret/data/umbra/${key}`, {
    method: 'POST',
    headers: {
      'X-Vault-Token': vaultToken, // server-side ONLY; never printed/logged
      'Content-Type': 'application/json',
    },
    // The secret VALUE rides the body ONLY — never a header we log, never echoed back.
    body: JSON.stringify({ data: { [key]: value } }),
  })
  if (!res.ok) {
    // Secret-free: status only; the response body is deliberately NOT interpolated.
    throw new Error(`Vault HTTP ${res.status}`)
  }
  const json = await res.json()
  // KV v2 write response: { data: { version: <n>, ... } }. Print ONLY key + version.
  const version = json?.data?.version
  return { key, version }
}

// CLI entrypoint — only runs when invoked directly, not on import (keeps it unit-testable).
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('rotate-secret.mjs')
if (invokedDirectly) {
  const key = process.argv[2]
  const value = process.env.NEW_VALUE
  rotateSecret(key, value)
    .then(({ key, version }) => {
      // ONLY the key name + new version number — never the value.
      console.log(`rotated umbra/${key} -> KV v2 version ${version}`)
    })
    .catch((err) => {
      // The thrown message is already secret-free (status only / var name only).
      console.error(`rotate failed: ${err.message}`)
      process.exit(1)
    })
}
