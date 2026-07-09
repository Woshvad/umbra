// solver/src/api.ts — the Express 4.19 HTTP surface for the solver service (:4000).
//
// Exposes EXACTLY the spec §11 endpoints so the browser (:5173) can drive the demo
// without ledger-admin authority:
//   POST   /round                 → open a round
//   GET    /round/:id             → live status + refreshStats-backed sealedOrderCount
//   POST   /round/:id/close       → force-close the window
//   GET    /round/:id/solve-preview → the deterministic §8 proposal (compute, NO settle)
//   POST   /round/:id/settle      → run Round.Clear (409 on double-settle)
//
// SECURITY (SOLV-04 / threat T-04-04 / T-04-09):
//   • CORS is scoped to the Vite dev origin ONLY (`http://localhost:5173`), never `*`.
//   • POST /round bodies are zod-validated; malformed input → sanitized 400.
//   • The structured error envelope `{ error: { code, message } }` NEVER echoes the
//     Operator token, ANTHROPIC_API_KEY, process.env, or request auth headers.
//
// VERIFY-DON'T-TRUST: solve-preview/settle submit ONLY the deterministic computeClearing
// output; the on-ledger Round.Clear re-verifies §8 (the deep backstop).
//
// The ledger functions are DEPENDENCY-INJECTED via `createApp(deps)` so the test suite
// can stub them with no live sandbox. The pure §8 helpers (auction.ts) are injected too.

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { z } from 'zod'
import type { OrderView, Allocation, ClearingResult } from './auction.js'
import type { AgentResult } from './agent.js'

// The Vite dev origin — the ONLY allowed CORS origin (never '*').
export const ALLOWED_ORIGIN = 'http://localhost:5173'

// ── Injected dependency surface ─────────────────────────────────────────────────
// Mirrors the ledger.ts exports + the pure auction.ts helpers. Everything the route
// handlers touch arrives here so the test can pass deterministic fakes (no ledger).
export interface SealedOrder {
  contractId: string
  view: OrderView
}

export interface RoundView {
  roundId: string
  status: string // 'Open' | 'Closed' | 'Cleared' | 'Settled'
  desks?: string[]
  openedAt?: string
  windowSeconds?: number
}

export interface SettleResult {
  clearingPrice: number
  allocations: Allocation[]
  matchedVolume?: number
  txConfirmations?: number
}

// A per-desk fill receipt (TradeConfirmation). After settle the sealed Orders are RETIRED
// by Round.Clear, so the settled result at terminal status is reconstructed from these
// (ledger truth, survives a solver restart — never a §8 recompute on the empty book).
export interface SettledConfirmation {
  desk: string
  side: Allocation['side']
  filledQty: number
  clearingPrice: number
}

export interface AppDeps {
  // ledger.ts client functions
  openRound: (roundId: string, desks: string[], windowSeconds: number) => Promise<RoundView>
  queryRound: (roundId: string) => Promise<RoundView | null>
  readSealedOrders: (roundId: string) => Promise<SealedOrder[]>
  refreshStats: (roundId: string) => Promise<number>
  closeRound: (roundId: string) => Promise<string>
  settle: (roundId: string) => Promise<SettleResult>
  // WOW-02: the DEDICATED tamper seam (ledger.tamperClear). Gathers the SAME cids as
  // settle() but submits a deliberately WRONG clearingPrice / over-filled allocation to
  // the on-ledger Round.Clear; the recompute-and-assert backstop rejects it atomically.
  // Resolves { rejected, error } with the VERBATIM (secret-free) ledger rejection body —
  // it NEVER throws and NEVER settles. Entirely off the byte-unchanged /settle path.
  tamperClear: (roundId: string, mode: 'wrong-price' | 'overfill') => Promise<{ rejected: true; error: string }>
  // Read the per-desk TradeConfirmations for a round — used to reconstruct the settled
  // result at terminal status once the sealed orders have been retired by Round.Clear.
  readTradeConfirmations: (roundId: string) => Promise<SettledConfirmation[]>
  // The AI Solver Agent (agent.ts) — proposes a clearing, VERIFIES it against the
  // deterministic core, and returns the deterministic NUMBERS + the model's rationale
  // (only on an exact match) + an additive {verified, source} provenance block. It
  // NEVER throws (keyless / SDK-error paths degrade to the deterministic fallback) and
  // is OFF the settlement path — the AI's numbers are never settled (verify-don't-trust).
  proposeClearing: (views: OrderView[]) => Promise<AgentResult>
  // WOW-03: server-side natural-language order parse — plain English → a validated
  // {side, qty, limit} (or null when keyless / unparseable). The Anthropic key stays
  // module-private in agent.ts; this ONLY returns validated fields for the desk to
  // CONFIRM via the existing SEAL ORDER (never auto-submitted). Never throws the key.
  parseOrder: (text: string) => Promise<{ side: 'Buy' | 'Sell'; qty: number; limit: number } | null>
  // WOW-04: stream the model's clearing rationale as text deltas (agent.ts messages.stream).
  // Forwards each delta via onDelta, completion via onDone, and on ANY error (keyless /
  // stream error) calls onError EXACTLY ONCE. onError carries NO key/prompt/err.message —
  // the SSE route turns it into a fixed deterministic single-shot fallback frame. Never throws.
  streamRationale: (
    views: OrderView[],
    handlers: { onDelta: (delta: string) => void; onDone: () => void; onError: () => void },
  ) => Promise<void>
  // WOW-04: compose the shareable post-round NL brief. PURE over numbers + the verified
  // rationale — secret-free and cannot drift the clearing (the §4 fixture stays $100.00).
  composeBrief: (clearingPrice: number, matchedVolume: number, allocations: Allocation[], rationale: string) => string
  // pure §8 helpers from auction.ts
  computeClearing: (orders: OrderView[]) => ClearingResult
  matchedAt: (orders: OrderView[], p: number) => number
  demandAt: (orders: OrderView[], p: number) => number
  supplyAt: (orders: OrderView[], p: number) => number
  candidatePrices: (orders: OrderView[]) => number[]
}

// ── A typed application error that maps cleanly onto the secret-safe envelope ────
// Carries an HTTP status + a stable code + a human message. The message is authored
// at the throw site and is GUARANTEED secret-free (no token/key/header interpolation).
class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ── zod schema for POST /round ───────────────────────────────────────────────────
// Both fields optional (a canonical demo round needs no body); validate types/shape
// so a malformed body is rejected with a sanitized 400 — never the raw header/env.
const openRoundBody = z
  .object({
    roundId: z.string().min(1).optional(),
    desks: z.array(z.string()).optional(),
    windowSeconds: z.number().int().positive().optional(),
  })
  .strict()

// ── zod schema for POST /parse-order ─────────────────────────────────────────────
// Cap the NL input length (≤280) — ASVS V5 input validation + a prompt-injection
// blast-radius limiter. A missing/oversized/empty body → a sanitized 400.
const parseOrderBody = z
  .object({
    text: z.string().min(1).max(280),
  })
  .strict()

// ── zod schema for POST /round/:id/tamper-clear (WOW-02) ─────────────────────────
// A demo-only body selecting the tamper mode; anything else → a sanitized 400.
const tamperClearBody = z
  .object({
    mode: z.enum(['wrong-price', 'overfill']),
  })
  .strict()

// Statuses that mean the round has already been cleared/settled (double-settle guard).
const TERMINAL_STATUSES = new Set(['Cleared', 'Settled'])

// Wrap an async handler so a rejected promise forwards to the error middleware.
// express 4 does NOT auto-catch async rejections — this is the required bridge.
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

// Build the views + a curve of {price, demand, supply} points for a set of sealed
// orders — shared by solve-preview (and forward-compatible for GET after clear).
const buildCurve = (
  deps: AppDeps,
  views: OrderView[],
): { price: number; demand: number; supply: number }[] =>
  deps.candidatePrices(views).map((price) => ({
    price,
    demand: deps.demandAt(views, price),
    supply: deps.supplyAt(views, price),
  }))

export const createApp = (deps: AppDeps): Express => {
  const app = express()
  app.use(express.json())
  // CORS scoped to the Vite dev origin ONLY — never '*' (T-04-09 / V4).
  app.use(cors({ origin: ALLOWED_ORIGIN }))

  // POST /round — open a round (zod-validated body).
  app.post(
    '/round',
    wrap(async (req, res) => {
      const parsed = openRoundBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        // Sanitized message: field + reason only (zod's issue text), never env/headers.
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const { roundId, desks, windowSeconds } = parsed.data
      const id = roundId ?? `R-${Date.now()}`
      const deskList = desks ?? []
      const windowSecs = windowSeconds ?? 60
      const round = await deps.openRound(id, deskList, windowSecs)
      res.status(201).json({
        roundId: round.roundId,
        status: 'Open',
        openedAt: round.openedAt ?? new Date().toISOString(),
        windowSeconds: round.windowSeconds ?? windowSecs,
      })
    }),
  )

  // GET /round/:id — refreshStats FIRST (the BLOCKER fix: the returned count is the
  // solver-maintained, recomputed value, not a stale Phase-3 seed), then read status.
  app.get(
    '/round/:id',
    wrap(async (req, res) => {
      const { id } = req.params
      // Recompute + write the live sealed-order count BEFORE returning it.
      const sealedOrderCount = await deps.refreshStats(id)
      const round = await deps.queryRound(id)
      if (!round) {
        throw new ApiError(404, 'ROUND_NOT_FOUND', `round ${id} not found`)
      }
      const body: Record<string, unknown> = {
        roundId: round.roundId,
        status: round.status,
        sealedOrderCount,
      }
      // After clear/settle, surface the result. Two sources, because Round.Clear RETIRES
      // the sealed Orders on settle:
      if (TERMINAL_STATUSES.has(round.status)) {
        const sealed = await deps.readSealedOrders(id)
        if (sealed.length > 0) {
          // Pre-retire (Closed/Cleared, orders still live): recompute §8 + curve + the
          // (P5) agent rationale from the live sealed orders. Deterministic numbers; the
          // agent never throws and is OFF the settlement path.
          const views = sealed.map((s) => s.view)
          const { clearingPrice, allocations } = deps.computeClearing(views)
          body.clearingPrice = clearingPrice
          body.matchedVolume = deps.matchedAt(views, clearingPrice)
          body.allocations = allocations
          body.curve = buildCurve(deps, views)
          const agent = await deps.proposeClearing(views)
          body.rationale = agent.rationale
          body.agent = { verified: agent.verified, source: agent.source }
          // WOW-04: the shareable brief — additive, pure over the deterministic numbers +
          // the verified rationale (no clearing-number drift).
          body.brief = deps.composeBrief(
            clearingPrice,
            deps.matchedAt(views, clearingPrice),
            allocations,
            agent.rationale,
          )
        } else {
          // Post-settle: the sealed orders are retired, so a §8 recompute would read 0.
          // Reconstruct the settled result from the persisted per-desk TradeConfirmations
          // (ledger truth, restart-proof). The supply/demand curve needs the original
          // limit orders (gone) — omit it.
          const confs = await deps.readTradeConfirmations(id)
          const allocations: Allocation[] = confs.map((c) => ({
            desk: c.desk,
            side: c.side,
            filledQty: c.filledQty,
          }))
          const clearingPrice = confs[0]?.clearingPrice ?? 0
          const matchedVolume = confs
            .filter((c) => c.side === 'Buy')
            .reduce((sum, c) => sum + c.filledQty, 0)
          body.clearingPrice = clearingPrice
          body.matchedVolume = matchedVolume
          body.allocations = allocations
          body.curve = []
          // The settled numbers ARE the deterministic on-ledger result (Round.Clear
          // re-verified §8 before settling) — surface a factual settled rationale + the
          // deterministic provenance (no fresh AI call post-settle).
          body.rationale = confs.length
            ? `Settled at ${clearingPrice.toFixed(2)} — ${matchedVolume} units matched across ${allocations.length} desk fills in one atomic transaction.`
            : null
          body.agent = { verified: true, source: 'deterministic-fallback' }
          // WOW-04: shareable brief reconstructed from the persisted settled facts.
          body.brief = deps.composeBrief(
            clearingPrice,
            matchedVolume,
            allocations,
            typeof body.rationale === 'string' ? body.rationale : '',
          )
        }
      }
      res.json(body)
    }),
  )

  // POST /round/:id/close — force-close the window.
  app.post(
    '/round/:id/close',
    wrap(async (req, res) => {
      const { id } = req.params
      await deps.closeRound(id)
      res.json({ roundId: id, status: 'Closed' })
    }),
  )

  // GET /round/:id/solve-preview — the deterministic §8 proposal. COMPUTE, NO SETTLE.
  app.get(
    '/round/:id/solve-preview',
    wrap(async (req, res) => {
      const { id } = req.params
      const sealed = await deps.readSealedOrders(id)
      const views: OrderView[] = sealed.map((s) => s.view)
      const { clearingPrice, allocations } = deps.computeClearing(views)
      // matchedVolume is NOT on ClearingResult — derive it here from the exported helper.
      const matchedVolume = deps.matchedAt(views, clearingPrice)
      const curve = buildCurve(deps, views)
      // Phase 5: the agent PROPOSES; the deterministic numbers above are authoritative
      // and UNCHANGED (P4 backward-compat). We take only the rationale + the additive
      // {verified, source} block. proposeClearing never throws (it handles keyless /
      // SDK-error internally → deterministic fallback) — no try/catch needed.
      const agent = await deps.proposeClearing(views)
      res.json({
        roundId: id,
        clearingPrice,
        matchedVolume,
        allocations,
        curve,
        rationale: agent.rationale, // populated (was null in P4) — the Claude rationale.
        agent: { verified: agent.verified, source: agent.source },
      })
    }),
  )

  // GET /round/:id/rationale-stream — WOW-04 live rationale as Server-Sent Events.
  // NOT wrap()'d: this is a streaming text/event-stream response, not a JSON handler.
  // Each Claude text delta → one `data:` frame; completion → an `event: done` sentinel.
  // On ANY error (keyless / stream error) the agent's onError fires and we write a SINGLE
  // deterministic fallback frame (the browser typewriter still gets text) then end — the
  // key/prompt/err.message NEVER reach the wire (Pitfall 6 / T-08-04-SSEKEY).
  app.get('/round/:id/rationale-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    void (async () => {
      // The round's sealed views drive both the model batch and the deterministic fallback.
      let views: OrderView[] = []
      try {
        views = (await deps.readSealedOrders(req.params.id)).map((s) => s.view)
      } catch {
        views = []
      }

      let closed = false
      const finishDone = (): void => {
        if (closed) return
        closed = true
        res.write('event: done\ndata: {}\n\n')
        res.end()
      }
      const finishFallback = (): void => {
        if (closed) return
        // A deterministic, secret-free single-shot rationale frame (§8 numbers only).
        const { clearingPrice, allocations } = deps.computeClearing(views)
        const matchedVolume = deps.matchedAt(views, clearingPrice)
        const fallback = deps.composeBrief(
          clearingPrice,
          matchedVolume,
          allocations,
          'Live rationale unavailable — cleared by the deterministic §8 algorithm.',
        )
        res.write(`data: ${JSON.stringify(fallback)}\n\n`)
        closed = true
        res.end()
      }

      await deps.streamRationale(views, {
        onDelta: (delta) => {
          if (!closed) res.write(`data: ${JSON.stringify(delta)}\n\n`)
        },
        onDone: finishDone,
        onError: finishFallback,
      })
    })()
  })

  // POST /round/:id/settle — run Round.Clear. 409 if already Cleared/Settled.
  app.post(
    '/round/:id/settle',
    wrap(async (req, res) => {
      const { id } = req.params
      const round = await deps.queryRound(id)
      if (!round) {
        throw new ApiError(404, 'ROUND_NOT_FOUND', `round ${id} not found`)
      }
      // Double-settle guard (T-04-06): reject a round already cleared/settled.
      if (TERMINAL_STATUSES.has(round.status)) {
        throw new ApiError(409, 'ALREADY_SETTLED', `round ${id} is already ${round.status}`)
      }
      const result = await deps.settle(id)
      // matchedVolume is always set by the live settle path (Round.Clear's totalMatched);
      // if a deps impl omits it, reconstruct from the verified Buy-side allocations.
      // NEVER read the sealed book here — Round.Clear RETIRED those orders, so a recompute
      // on the now-empty book would yield 0 (the same trap the GET post-settle branch avoids).
      const matchedVolume =
        result.matchedVolume ??
        result.allocations.filter((a) => a.side === 'Buy').reduce((sum, a) => sum + a.filledQty, 0)
      res.json({
        roundId: id,
        status: 'Settled',
        clearingPrice: result.clearingPrice,
        matchedVolume,
        allocations: result.allocations,
        txConfirmations: result.txConfirmations ?? 1,
      })
    }),
  )

  // POST /parse-order — WOW-03 natural-language order entry. The desk posts plain
  // English; the solver (holding the server-only Anthropic key) returns a zod-validated
  // {side, qty, limit} that PREFILLS the ticket. Never auto-submits; 422 when unparseable.
  app.post(
    '/parse-order',
    wrap(async (req, res) => {
      const parsed = parseOrderBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      // deps.parseOrder holds the key module-side; keyless/malformed → null → 422.
      const order = await deps.parseOrder(parsed.data.text)
      if (!order) {
        throw new ApiError(422, 'PARSE_FAILED', "couldn't parse that order — try e.g. \"buy 10 under 101\"")
      }
      res.json(order) // { side, qty, limit } — zod-validated, for the desk to confirm.
    }),
  )

  // POST /round/:id/tamper-clear — WOW-02 "break the AI" demo seam. Submits a
  // deliberately WRONG clearing (wrong-price or over-fill) to the on-ledger Round.Clear;
  // its recompute-and-assert backstop rejects the atomic transaction, changing NOTHING
  // on-ledger. The VERBATIM ledger rejection is the payload (do NOT summarize it — it is
  // already a secret-free ledger body slice). The real /settle path is byte-unchanged.
  app.post(
    '/round/:id/tamper-clear',
    wrap(async (req, res) => {
      const { id } = req.params
      const parsed = tamperClearBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const result = await deps.tamperClear(id, parsed.data.mode)
      res.json({ rejected: result.rejected, error: result.error })
    }),
  )

  // ── Secret-safe error middleware (SOLV-04 / V7) ────────────────────────────────
  // Produces `{ error: { code, message } }`. Known ApiErrors pass their authored
  // (secret-free) message; anything else collapses to a generic 500 message so a raw
  // exception (which COULD embed a path/token) never reaches the client. The Operator
  // token, ANTHROPIC_API_KEY, process.env, and request headers are NEVER serialized.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } })
      return
    }
    // Generic fallback — do NOT leak the underlying error text (could carry secrets).
    res.status(500).json({ error: { code: 'INTERNAL', message: 'internal solver error' } })
  })

  return app
}
