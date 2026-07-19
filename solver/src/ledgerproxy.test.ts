// solver/src/ledgerproxy.test.ts — the executable contract for the DEPLOY ledger proxy.
//
// This proxy exists so the browser can hold NO ledger credential. That makes three of its
// properties load-bearing, and all three are pinned here against a STUBBED validator (no
// DevNet, no real bearer, no network):
//
//   1. It injects the bearer SERVER-SIDE   — the client sends no Authorization; the upstream
//                                            request carries `Bearer <token>`.
//   2. It forwards privacy fields VERBATIM — filtersByParty / eventFormat.filtersByParty /
//                                            actAs / activeAtOffset cross untouched. Canton's
//                                            stakeholder projection is what separates the
//                                            desks, so rewriting these IS a privacy regression.
//   3. It passes the verdict through RAW   — a 404 CONTRACT_EVENTS_NOT_FOUND arrives at the
//                                            browser as a 404 with that body. That response is
//                                            the WOW-01 privacy proof; absorbing it into a 200
//                                            (or a friendlier envelope) would silently destroy
//                                            the money shot's central claim.
//
// Plus the closed-allow-list property: an unlisted path must NOT be forwarded with our
// privileged credential attached.

import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createLedgerProxy, createCachedTokenSource, LEDGER_PROXY_ROUTES } from './ledgerproxy.js'

const TARGET = 'https://validator.example.test'
// The sentinel bearer: it must appear on the UPSTREAM request and never in a client response.
const SENTINEL_TOKEN = 'SENTINEL-LEDGER-BEARER-do-not-leak-4b81c2'

const OWN_PARTY = 'umbra-bankA-1783880847::1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ec'
const RIVAL_CID = '00a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

// The VERBATIM live DevNet informee-refusal body (docs/DEVNET.md / peek.ts) — the proof.
const NOT_INFORMEE_BODY = {
  code: 'CONTRACT_EVENTS_NOT_FOUND',
  cause: 'Contract events not found, or not visible.',
}

type Call = { url: string; init: RequestInit }

// A stubbed validator: records every upstream call and replies with the scripted response.
const stubValidator = (
  reply: { status: number; body: unknown } = { status: 200, body: { offset: 42 } },
): { calls: Call[]; fetchImpl: typeof fetch } => {
  const calls: Call[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

// Mount the proxy exactly as createApp does (json body parsing + the /cn/devnet prefix)
// and drive it over a real ephemeral HTTP server, like api.test.ts does.
const withProxy = async (
  fetchImpl: typeof fetch,
  getToken: () => Promise<string> | string,
  run: (base: string) => Promise<void>,
): Promise<void> => {
  const app = express()
  app.use(express.json())
  const proxy = createLedgerProxy({ target: TARGET, getToken, fetchImpl })
  app.use('/cn/devnet', proxy)
  app.use(proxy)
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string> | undefined)?.[name]

describe('ledgerproxy — server-side bearer injection (the whole point)', () => {
  it('attaches the bearer upstream even though the client sent no Authorization', async () => {
    const { calls, fetchImpl } = stubValidator()
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      const res = await fetch(`${base}/cn/devnet/v2/state/ledger-end`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ offset: 42 })
    })
    expect(calls).toHaveLength(1)
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Bearer ${SENTINEL_TOKEN}`)
    expect(calls[0].url).toBe(`${TARGET}/v2/state/ledger-end`)
  })

  it('REPLACES any client-supplied Authorization (the client is not a credential source)', async () => {
    const { calls, fetchImpl } = stubValidator()
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      await fetch(`${base}/cn/devnet/v2/state/ledger-end`, {
        headers: { Authorization: 'Bearer FORGED-CLIENT-TOKEN' },
      })
    })
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Bearer ${SENTINEL_TOKEN}`)
    expect(JSON.stringify(calls[0].init)).not.toContain('FORGED-CLIENT-TOKEN')
  })

  it('never echoes the bearer back to the client, on success or on failure', async () => {
    const { fetchImpl } = stubValidator({ status: 500, body: { code: 'INTERNAL' } })
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      const ok = await fetch(`${base}/cn/devnet/v2/state/ledger-end`)
      expect(await ok.text()).not.toContain(SENTINEL_TOKEN)
      expect(JSON.stringify([...ok.headers])).not.toContain(SENTINEL_TOKEN)
    })
    // A credential-acquisition failure must be a plain 502 — never the error text, never the token.
    const failing = stubValidator()
    await withProxy(
      failing.fetchImpl,
      () => {
        throw new Error(`OIDC blew up with ${SENTINEL_TOKEN}`)
      },
      async (base) => {
        const res = await fetch(`${base}/cn/devnet/v2/state/ledger-end`)
        expect(res.status).toBe(502)
        const text = await res.text()
        expect(text).not.toContain(SENTINEL_TOKEN)
        expect(text).toContain('LEDGER_AUTH_UNAVAILABLE')
      },
    )
    expect(failing.calls).toHaveLength(0) // never forwarded without a resolved credential
  })
})

describe('ledgerproxy — VERBATIM forwarding of the privacy-bearing fields', () => {
  it('forwards filtersByParty + activeAtOffset untouched on the ACS read', async () => {
    const { calls, fetchImpl } = stubValidator({ status: 200, body: [] })
    const body = {
      filter: { filtersByParty: { [OWN_PARTY]: {} } },
      verbose: true,
      activeAtOffset: 42,
    }
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      await fetch(`${base}/cn/devnet/v2/state/active-contracts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    })
    expect(JSON.parse(String(calls[0].init.body))).toEqual(body)
  })

  it('forwards the informee peek eventFormat.filtersByParty untouched (never widened)', async () => {
    const { calls, fetchImpl } = stubValidator({ status: 404, body: NOT_INFORMEE_BODY })
    const body = {
      contractId: RIVAL_CID,
      eventFormat: { filtersByParty: { [OWN_PARTY]: { cumulative: [] } }, verbose: true },
    }
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      await fetch(`${base}/cn/devnet/v2/events/events-by-contract-id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    })
    const forwarded = JSON.parse(String(calls[0].init.body))
    expect(forwarded).toEqual(body)
    // The requesting party is EXACTLY the one the client asked as — no extra party smuggled in.
    expect(Object.keys(forwarded.eventFormat.filtersByParty)).toEqual([OWN_PARTY])
  })

  it('forwards actAs + requestingParties untouched on a command submission', async () => {
    const { calls, fetchImpl } = stubValidator({ status: 200, body: {} })
    const body = {
      commandId: 'umbra-web-1',
      actAs: [OWN_PARTY],
      requestingParties: [OWN_PARTY],
      commands: [{ ExerciseCommand: { templateId: '#umbra:Umbra.Auction:Order', contractId: RIVAL_CID, choice: 'Seal', choiceArgument: {} } }],
    }
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      await fetch(`${base}/cn/devnet/v2/commands/submit-and-wait`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    })
    expect(JSON.parse(String(calls[0].init.body))).toEqual(body)
  })
})

describe('ledgerproxy — the validator verdict passes through UNCHANGED (the WOW-01 proof)', () => {
  it('a 404 CONTRACT_EVENTS_NOT_FOUND stays a 404 with its body intact', async () => {
    const { fetchImpl } = stubValidator({ status: 404, body: NOT_INFORMEE_BODY })
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      const res = await fetch(`${base}/cn/devnet/v2/events/events-by-contract-id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractId: RIVAL_CID, eventFormat: { filtersByParty: { [OWN_PARTY]: { cumulative: [] } }, verbose: true } }),
      })
      // If either assertion ever fails, the peek console stops rendering VERDICT_NOT_INFORMEE.
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(NOT_INFORMEE_BODY)
    })
  })

  it('an OWNER 200 disclosure also passes through intact (the control arm)', async () => {
    const disclosed = { created: { createdEvent: { templateId: 'abc:Umbra.Auction:Order', contractId: RIVAL_CID } } }
    const { fetchImpl } = stubValidator({ status: 200, body: disclosed })
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      const res = await fetch(`${base}/cn/devnet/v2/events/events-by-contract-id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractId: RIVAL_CID, eventFormat: { filtersByParty: { [OWN_PARTY]: { cumulative: [] } }, verbose: true } }),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(disclosed)
    })
  })

  it('403 / 400 statuses are never rewritten either', async () => {
    for (const status of [400, 403]) {
      const { fetchImpl } = stubValidator({ status, body: { code: 'SOMETHING' } })
      await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
        const res = await fetch(`${base}/cn/devnet/v2/state/active-contracts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filter: { filtersByParty: {} }, verbose: true, activeAtOffset: 0 }),
        })
        expect(res.status).toBe(status)
      })
    }
  })

  it('an unreachable validator is a 502 — an infra fault, never a privacy verdict', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      const res = await fetch(`${base}/cn/devnet/v2/state/ledger-end`)
      expect(res.status).toBe(502)
      // NOT a 404 — an unreachable node must never masquerade as the informee refusal.
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('LEDGER_UNREACHABLE')
    })
  })
})

describe('ledgerproxy — closed allow-list (not an open proxy)', () => {
  it('serves the four v2 paths the web client needs, at both mounts', async () => {
    expect(LEDGER_PROXY_ROUTES.map((r) => r.path)).toEqual([
      '/v2/state/active-contracts',
      '/v2/state/ledger-end',
      '/v2/events/events-by-contract-id',
      '/v2/commands/submit-and-wait',
    ])
    const { calls, fetchImpl } = stubValidator()
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      // The bare-root mount (a base-less client) resolves to the same upstream path.
      const res = await fetch(`${base}/v2/state/ledger-end`)
      expect(res.status).toBe(200)
    })
    expect(calls[0].url).toBe(`${TARGET}/v2/state/ledger-end`)
  })

  it('refuses to forward an unlisted path with the privileged credential attached', async () => {
    const { calls, fetchImpl } = stubValidator()
    await withProxy(fetchImpl, () => SENTINEL_TOKEN, async (base) => {
      for (const path of ['/v2/admin/parties', '/v2/state/active-contracts/../admin', '/v2/updates/flats']) {
        const res = await fetch(`${base}/cn/devnet${path}`, { method: 'POST' })
        expect(res.status).toBe(404)
      }
    })
    expect(calls).toHaveLength(0) // nothing reached the validator
  })
})

describe('ledgerproxy — createCachedTokenSource', () => {
  it('acquires once and reuses the cached bearer until near expiry', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const jwt = `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig`
    const acquire = vi.fn(async () => jwt)
    const source = createCachedTokenSource(acquire)
    expect(await source()).toBe(jwt)
    expect(await source()).toBe(jwt)
    expect(await source()).toBe(jwt)
    expect(acquire).toHaveBeenCalledTimes(1)
  })

  it('re-acquires once the cached bearer is inside the refresh skew', async () => {
    const expired = `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url')}.sig`
    const acquire = vi.fn(async () => expired)
    const source = createCachedTokenSource(acquire)
    await source()
    await source()
    expect(acquire).toHaveBeenCalledTimes(2)
  })
})
