// solver/src/secrets.test.ts — the OPS-02 SecretsProvider proof, fully OFFLINE.
//
// Proven here:
//   • env backend (default / SECRETS_PROVIDER unset) returns a set process.env value and
//     throws a SECRET-FREE `${name} is unset` on absence — byte-for-byte current behavior.
//   • vault backend reads KV v2 nesting (data.data.<name>) over a STUBBED fetch and returns
//     only the nested value.
//   • vault backend throws `Vault HTTP 403` on a non-2xx WITHOUT echoing the response body.
//   • secret-sweep: the VAULT_TOKEN sentinel never appears in ANY thrown message.
//   • an unknown SECRETS_PROVIDER fails loud.
// Live Vault (booted dev compose, real KV v2 read + rotation) is a UAT gate (RUNBOOK).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A sentinel Vault token — MUST NEVER appear in a thrown error or a log line.
const SENTINEL_VAULT_TOKEN = 'SENTINEL-VAULT-TOKEN-do-not-leak-7f21ab'
const VAULT_ADDR = 'http://vault.test:8200'

import { createSecretsProvider } from './secrets.js'

beforeEach(() => {
  // Reset to a clean slate before each test; individual tests set what they need.
  delete process.env.SECRETS_PROVIDER
  delete process.env.VAULT_ADDR
  delete process.env.VAULT_TOKEN
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('env backend (default — preserves current .env behavior)', () => {
  it('returns a set process.env value when SECRETS_PROVIDER is unset', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fixture-value'
    const provider = createSecretsProvider()
    await expect(provider.get('ANTHROPIC_API_KEY')).resolves.toBe('sk-ant-fixture-value')
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns a set value when SECRETS_PROVIDER is explicitly env', async () => {
    process.env.SECRETS_PROVIDER = 'env'
    process.env.SOME_TOKEN = 'party-token-value'
    const provider = createSecretsProvider()
    await expect(provider.get('SOME_TOKEN')).resolves.toBe('party-token-value')
    delete process.env.SOME_TOKEN
  })

  it('throws a SECRET-FREE `${name} is unset` on an absent var', async () => {
    delete process.env.MISSING_SECRET
    const provider = createSecretsProvider()
    await expect(provider.get('MISSING_SECRET')).rejects.toThrow('MISSING_SECRET is unset')
  })
})

describe('vault backend (KV v2 over raw fetch — no node-vault)', () => {
  beforeEach(() => {
    process.env.SECRETS_PROVIDER = 'vault'
    process.env.VAULT_ADDR = VAULT_ADDR
    process.env.VAULT_TOKEN = SENTINEL_VAULT_TOKEN
  })

  it('reads the KV v2 nested value (data.data.<name>) from the umbra path', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${VAULT_ADDR}/v1/secret/data/umbra/ANTHROPIC_API_KEY`)
      // Token rides the X-Vault-Token header (server-side only).
      expect((init?.headers as Record<string, string>)['X-Vault-Token']).toBe(SENTINEL_VAULT_TOKEN)
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { data: { ANTHROPIC_API_KEY: 'sk-ant-from-vault' }, metadata: {} } }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = createSecretsProvider()
    await expect(provider.get('ANTHROPIC_API_KEY')).resolves.toBe('sk-ant-from-vault')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('LO-02: encodes the secret name in the KV path (a `../` cannot traverse the mount)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      // The traversal chars are percent-encoded, so the request stays under umbra/.
      expect(url).toBe(`${VAULT_ADDR}/v1/secret/data/umbra/${encodeURIComponent('../root')}`)
      expect(url).not.toContain('umbra/../root')
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { data: { '../root': 'v' }, metadata: {} } }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = createSecretsProvider()
    await expect(provider.get('../root')).resolves.toBe('v')
  })

  it('throws `Vault HTTP 403` on a non-2xx WITHOUT echoing the response body', async () => {
    const LEAKY_BODY = 'permission denied for token SENTINEL-VAULT-TOKEN-do-not-leak-7f21ab'
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ errors: [LEAKY_BODY] }),
      text: async () => LEAKY_BODY,
    } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createSecretsProvider()
    let thrown: unknown
    try {
      await provider.get('ANTHROPIC_API_KEY')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    const msg = (thrown as Error).message
    expect(msg).toContain('Vault HTTP 403')
    // The response body (and the token inside it) is NEVER interpolated.
    expect(msg).not.toContain('permission denied')
  })

  it('throws a name-only error (no value) when the secret is missing from KV v2', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { data: {}, metadata: {} } }),
    } as Response))
    vi.stubGlobal('fetch', fetchMock)

    const provider = createSecretsProvider()
    await expect(provider.get('ANTHROPIC_API_KEY')).rejects.toThrow('umbra/ANTHROPIC_API_KEY missing')
  })

  it('secret-sweep: the VAULT_TOKEN sentinel never appears in ANY thrown message', async () => {
    // Force several failure axes and assert the token is absent from every thrown message.
    const cases: Array<() => Response> = [
      () => ({ ok: false, status: 403, json: async () => ({}) } as Response),
      () => ({ ok: false, status: 500, json: async () => ({}) } as Response),
      () => ({ ok: true, status: 200, json: async () => ({ data: { data: {} } }) } as Response),
    ]
    for (const make of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => make()))
      const provider = createSecretsProvider()
      try {
        await provider.get('ANTHROPIC_API_KEY')
        throw new Error('expected a throw')
      } catch (e) {
        expect((e as Error).message).not.toContain(SENTINEL_VAULT_TOKEN)
      }
    }
  })
})

describe('factory', () => {
  it('throws on an unrecognized SECRETS_PROVIDER', () => {
    process.env.SECRETS_PROVIDER = 'consul'
    expect(() => createSecretsProvider()).toThrow(/Unknown SECRETS_PROVIDER/)
  })
})
