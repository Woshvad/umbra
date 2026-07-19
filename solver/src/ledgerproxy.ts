// solver/src/ledgerproxy.ts — the DEPLOY-ENABLEMENT ledger proxy (browser → solver → validator).
//
// WHY THIS EXISTS (the public-link problem):
// In the dev loop the browser talked to the Canton validator through the Vite dev proxy,
// carrying a bearer that was BUNDLED INTO THE CLIENT JS (web/src/tokens.json). That is fine
// for a laptop demo and fatal for a public link: (a) there is no Vite dev server in a static
// Vercel build, and (b) the DevNet bearer would ship inside the JS anyone can `view-source`.
//
// So the solver becomes the single backend the browser talks to. The browser sends NO
// Authorization header for ledger calls; THIS module injects the bearer SERVER-SIDE and
// forwards the request to the validator.
//
// ── WHAT ENFORCES PRIVACY HERE (read before touching the forwarding code) ─────────────
// The bearer is NOT the privacy mechanism, and never was. Canton discloses a contract to a
// party only if that party is a signatory/observer (stakeholder projection). The request's
// `filtersByParty` / `eventFormat.filtersByParty` / `actAs` name the party the ledger answers
// AS — so privacy rides on those fields, and they are FORWARDED VERBATIM. Do NOT rewrite,
// widen, collapse, or "helpfully normalize" them: doing so is a privacy regression, not a
// refactor. On DevNet all three desks legitimately share ONE m2m bearer (the organizer issues
// a single client), which is exactly why the token cannot be the thing that separates them.
//
// The corollary honesty (documented, not hidden — docs/DEPLOY.md + docs/DEVNET.md): with one
// shared bearer, a party-level projection is proven, a CREDENTIAL-level isolation is not. The
// WOW-01 peek proof is deliberately built on informee refusal (404 CONTRACT_EVENTS_NOT_FOUND)
// precisely because it holds under a shared bearer. Which brings us to:
//
// ── FAITHFUL PASS-THROUGH IS LOAD-BEARING ────────────────────────────────────────────
// The validator's status code AND body are returned UNCHANGED. In particular a 404 with body
// `{ code: "CONTRACT_EVENTS_NOT_FOUND", … }` MUST arrive at the browser as a 404 with that
// body — that response IS the privacy proof the money-shot renders. Absorbing it into a 200,
// a 500, or a friendlier envelope would silently destroy the demo's central claim.
//
// ── NOT AN OPEN PROXY ────────────────────────────────────────────────────────────────
// The injected bearer is privileged, so the route surface is a CLOSED ALLOW-LIST of the four
// JSON Ledger API v2 paths the browser actually needs. Anything else 404s here and never
// reaches the validator with our credential attached.
//
// The upstream `fetch` and the token source are INJECTED so the whole thing is unit-testable
// against a stubbed validator, with no live DevNet and no real credential.

import express, { type Router, type Request, type Response } from 'express'

// ── The closed allow-list (the four v2 paths the web client issues) ──────────────────
//   POST /v2/state/active-contracts       — the per-desk ACS poll (v2react fetchAcs)
//   GET  /v2/state/ledger-end             — the offset the ACS read is taken at
//   POST /v2/events/events-by-contract-id — the WOW-01 informee peek (the 404 proof)
//   POST /v2/commands/submit-and-wait     — SEAL ORDER / desk-plane exercises
export const LEDGER_PROXY_ROUTES = [
  { method: 'POST', path: '/v2/state/active-contracts' },
  { method: 'GET', path: '/v2/state/ledger-end' },
  { method: 'POST', path: '/v2/events/events-by-contract-id' },
  { method: 'POST', path: '/v2/commands/submit-and-wait' },
] as const

// The FiveNorth "Seaport" DevNet validator — the default forwarding target (mirrors the
// `/cn/devnet` Vite dev proxy target in web/vite.config.ts so dev and deploy agree).
export const DEFAULT_LEDGER_TARGET = 'https://ledger-api.validator.devnet.sandbox.fivenorth.io'

export interface LedgerProxyOptions {
  // The validator base URL (trailing slashes stripped; every route appends an absolute /v2/… path).
  target?: string
  // The SERVER-SIDE bearer source. Returning '' means "forward with no Authorization header"
  // (a permissive/unauthenticated participant) — never a thrown boot failure.
  getToken: () => Promise<string> | string
  // Injected for tests; defaults to the platform fetch.
  fetchImpl?: typeof fetch
}

// ── Cached token source ───────────────────────────────────────────────────────────────
// Wraps an `acquire` (e.g. auth.ts client-credentials) and caches the bearer until shortly
// before its JWT `exp`. Mirrors ledger.ts's OIDC cache rather than reaching into it, so this
// module never needs the ledger client's module-private credential exported.
// SECURITY: the token is returned only to the forwarder, which puts it in an OUTBOUND header.
// It is never logged, never echoed into a response body, never surfaced in an error message.
const REFRESH_SKEW_MS = 30_000

const jwtExpMs = (token: string): number => {
  try {
    const seg = token.split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')) as { exp?: number }
    return payload.exp ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

export const createCachedTokenSource = (
  acquire: () => Promise<string>,
): (() => Promise<string>) => {
  let cached: string | null = null
  let expiresAtMs = 0
  return async (): Promise<string> => {
    const now = Date.now()
    if (cached && now < expiresAtMs - REFRESH_SKEW_MS) return cached
    const token = await acquire()
    cached = token
    const exp = jwtExpMs(token)
    expiresAtMs = exp || now + 60_000
    return token
  }
}

// ── The proxy router ─────────────────────────────────────────────────────────────────
export const createLedgerProxy = (opts: LedgerProxyOptions): Router => {
  const target = (opts.target ?? DEFAULT_LEDGER_TARGET).replace(/\/+$/, '')
  const doFetch: typeof fetch = opts.fetchImpl ?? ((...args) => fetch(...args))
  const router = express.Router()

  const forward = async (req: Request, res: Response): Promise<void> => {
    // req.url is the path RELATIVE to the mount point (incl. any query string), so a router
    // mounted at /cn/devnet turns /cn/devnet/v2/state/ledger-end into /v2/state/ledger-end.
    const url = `${target}${req.url}`

    // Resolve the bearer. A failure here is an infrastructure fault, NOT a ledger verdict —
    // it must never masquerade as a privacy result, so it gets its own 502 code. The error
    // text is deliberately NOT interpolated (it could carry OIDC internals).
    let token = ''
    try {
      token = (await opts.getToken()) || ''
    } catch {
      res.status(502).json({
        error: { code: 'LEDGER_AUTH_UNAVAILABLE', message: 'ledger proxy could not acquire a ledger credential' },
      })
      return
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const headers: Record<string, string> = { Accept: 'application/json' }
    // The SERVER-SIDE injection. Any Authorization the browser sent is ignored/replaced —
    // the client is not trusted to supply (and does not hold) a ledger credential.
    if (token) headers.Authorization = `Bearer ${token}`
    if (hasBody) headers['Content-Type'] = 'application/json'

    let upstream: Response_
    try {
      upstream = await doFetch(url, {
        method: req.method,
        headers,
        // VERBATIM field forwarding: the parsed JSON body is re-serialized as-is. Every
        // privacy-bearing field (filtersByParty, requestingParties, eventFormat, actAs,
        // activeAtOffset) crosses untouched — see the header comment.
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      })
    } catch {
      res.status(502).json({
        error: { code: 'LEDGER_UNREACHABLE', message: 'ledger proxy could not reach the participant' },
      })
      return
    }

    // Pass the validator's verdict through UNCHANGED — status AND body. The 404
    // CONTRACT_EVENTS_NOT_FOUND informee refusal must survive this hop intact.
    const body = await upstream.text()
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.status(upstream.status).send(body)
  }

  for (const route of LEDGER_PROXY_ROUTES) {
    if (route.method === 'GET') router.get(route.path, (req, res) => void forward(req, res))
    else router.post(route.path, (req, res) => void forward(req, res))
  }

  return router
}

// Local alias so the injected fetch's return type does not collide with express's `Response`.
type Response_ = Awaited<ReturnType<typeof fetch>>
