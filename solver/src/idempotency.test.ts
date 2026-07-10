// solver/src/idempotency.test.ts — the OPS-03 idempotency middleware proof, OFFLINE.
//
// Drives the real middleware on a throwaway express app (listen(0)) via global fetch,
// so express.json() ordering (req.body parsed BEFORE the mw hashes it) is exercised
// exactly as in production. Proven here:
//   • Same Idempotency-Key + same body twice → handler runs EXACTLY once; the second
//     response equals the first (replayed from the store).
//   • Same key + a DIFFERENT body → 422 with code IDEMPOTENCY_KEY_REUSED.
//   • No Idempotency-Key header → passthrough (handler runs every time, nothing stored).
//   • A non-POST request → passthrough.
//   • Body-hash is stable under JSON key reordering (canonicalization): a reordered
//     body under the same key REPLAYS (is NOT a false 422).
//   • A TTL-expired entry is treated as new (handler runs again).
//   • Secret-sweep: an Authorization sentinel never lands in the store.

import { describe, it, expect, afterEach } from 'vitest'
import express, { type Express } from 'express'
import type { Server } from 'node:http'
import { createIdempotency, canonicalJson } from './idempotency.js'

let server: Server | undefined

// Boot a throwaway express app on an ephemeral port; returns its base URL.
const start = (build: (app: Express) => void): Promise<string> =>
  new Promise((resolve) => {
    const app = express()
    app.use(express.json())
    build(app)
    server = app.listen(0, () => {
      const addr = server!.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(`http://127.0.0.1:${port}`)
    })
  })

afterEach(
  () =>
    new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve())
        server = undefined
      } else resolve()
    }),
)

describe('idempotency middleware', () => {
  it('replays the ORIGINAL response on same key + same body (handler runs once)', async () => {
    let calls = 0
    const { middleware } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.post('/round', (_req, res) => {
        calls += 1
        res.status(201).json({ roundId: 'R1', calls })
      })
    })

    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-abc' }
    const body = JSON.stringify({ desks: ['A', 'B'], windowSeconds: 60 })

    const r1 = await fetch(`${base}/round`, { method: 'POST', headers, body })
    const j1 = await r1.json()
    const r2 = await fetch(`${base}/round`, { method: 'POST', headers, body })
    const j2 = await r2.json()

    expect(calls).toBe(1) // handler invoked exactly once
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(j2).toEqual(j1) // second response is the replayed first
  })

  it('returns 422 IDEMPOTENCY_KEY_REUSED on same key + different body', async () => {
    const { middleware } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.post('/round', (_req, res) => res.status(201).json({ ok: true }))
    })
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-reuse' }

    const r1 = await fetch(`${base}/round`, { method: 'POST', headers, body: JSON.stringify({ a: 1 }) })
    expect(r1.status).toBe(201)

    const r2 = await fetch(`${base}/round`, { method: 'POST', headers, body: JSON.stringify({ a: 2 }) })
    const j2 = await r2.json()
    expect(r2.status).toBe(422)
    expect(j2).toEqual({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: expect.any(String) } })
  })

  it('passes through when no Idempotency-Key header is present (handler runs each time)', async () => {
    let calls = 0
    const { middleware, store } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.post('/round', (_req, res) => {
        calls += 1
        res.status(201).json({ calls })
      })
    })
    const headers = { 'Content-Type': 'application/json' }
    await fetch(`${base}/round`, { method: 'POST', headers, body: JSON.stringify({ a: 1 }) })
    await fetch(`${base}/round`, { method: 'POST', headers, body: JSON.stringify({ a: 1 }) })
    expect(calls).toBe(2)
    expect(store.size).toBe(0)
  })

  it('passes through non-POST requests even with an Idempotency-Key', async () => {
    let calls = 0
    const { middleware, store } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.get('/round', (_req, res) => {
        calls += 1
        res.json({ calls })
      })
    })
    const headers = { 'Idempotency-Key': 'k-get' }
    await fetch(`${base}/round`, { method: 'GET', headers })
    await fetch(`${base}/round`, { method: 'GET', headers })
    expect(calls).toBe(2)
    expect(store.size).toBe(0)
  })

  it('is stable under JSON key reordering (reordered body replays, not a 422)', async () => {
    // Unit-level: canonicalization yields identical strings regardless of key order.
    expect(canonicalJson({ a: 1, b: { y: 2, x: 3 } })).toBe(canonicalJson({ b: { x: 3, y: 2 }, a: 1 }))

    let calls = 0
    const { middleware } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.post('/round', (_req, res) => {
        calls += 1
        res.status(201).json({ calls })
      })
    })
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-order' }

    const r1 = await fetch(`${base}/round`, { method: 'POST', headers, body: JSON.stringify({ desks: ['A'], windowSeconds: 60 }) })
    const r2 = await fetch(`${base}/round`, { method: 'POST', headers, body: JSON.stringify({ windowSeconds: 60, desks: ['A'] }) })
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201) // reordered body is treated as the SAME → replay, not 422
    expect(calls).toBe(1)
  })

  it('treats a TTL-expired entry as new (handler runs again)', async () => {
    let calls = 0
    let clock = 1_000
    const { middleware } = createIdempotency({ ttlMs: 500, now: () => clock })
    const base = await start((app) => {
      app.use(middleware)
      app.post('/round', (_req, res) => {
        calls += 1
        res.status(201).json({ calls })
      })
    })
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-ttl' }
    const body = JSON.stringify({ a: 1 })

    await fetch(`${base}/round`, { method: 'POST', headers, body })
    clock += 1_000 // advance past the 500ms TTL
    await fetch(`${base}/round`, { method: 'POST', headers, body })
    expect(calls).toBe(2)
  })

  it('HI-02: the same key on TWO endpoints does NOT cross-replay (namespaced by method+path)', async () => {
    let roundCalls = 0
    let settleCalls = 0
    const { middleware } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      // Both accept an empty body → identical `{}` canonical hash; only the ROUTE differs.
      app.post('/round', (_req, res) => {
        roundCalls += 1
        res.status(201).json({ route: 'round', status: 'Open' })
      })
      app.post('/settle', (_req, res) => {
        settleCalls += 1
        res.status(200).json({ route: 'settle', settled: true })
      })
    })
    // One reused key across two DIFFERENT endpoints, empty body on each.
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-shared' }
    const body = JSON.stringify({})

    const rRound = await fetch(`${base}/round`, { method: 'POST', headers, body })
    const jRound = await rRound.json()
    const rSettle = await fetch(`${base}/settle`, { method: 'POST', headers, body })
    const jSettle = await rSettle.json()

    // Each endpoint ran its OWN handler and returned its OWN response — no cross-replay.
    expect(roundCalls).toBe(1)
    expect(settleCalls).toBe(1)
    expect(jRound).toEqual({ route: 'round', status: 'Open' })
    expect(jSettle).toEqual({ route: 'settle', settled: true })
  })

  it('HI-01: does NOT cache a 5xx — a retry under the same key re-executes the handler', async () => {
    let calls = 0
    const { middleware, store } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.post('/settle', (_req, res) => {
        calls += 1
        // First attempt fails transiently (500); the retry succeeds (200).
        if (calls === 1) return res.status(500).json({ error: { code: 'INTERNAL' } })
        res.status(200).json({ settled: true, calls })
      })
    })
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-5xx' }
    const body = JSON.stringify({})

    const r1 = await fetch(`${base}/settle`, { method: 'POST', headers, body })
    expect(r1.status).toBe(500)
    expect(store.size).toBe(0) // the transient 5xx did NOT consume the key

    const r2 = await fetch(`${base}/settle`, { method: 'POST', headers, body })
    const j2 = await r2.json()
    expect(r2.status).toBe(200) // retry re-executed rather than replaying the cached 500
    expect(j2).toEqual({ settled: true, calls: 2 })
    expect(calls).toBe(2)
    expect(store.size).toBe(1) // only the SUCCESS response is now memoized
  })

  it('secret-sweep: an Authorization sentinel never lands in the store', async () => {
    const SENTINEL = 'SENTINEL-BEARER-do-not-store-9f3c2a'
    const { middleware, store } = createIdempotency()
    const base = await start((app) => {
      app.use(middleware)
      app.post('/round', (_req, res) => res.status(201).json({ ok: true }))
    })
    await fetch(`${base}/round`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-sec', Authorization: `Bearer ${SENTINEL}` },
      body: JSON.stringify({ a: 1 }),
    })
    const dump = JSON.stringify([...store.entries()])
    expect(dump).not.toContain(SENTINEL)
  })
})
