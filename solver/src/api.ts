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

export interface AppDeps {
  // ledger.ts client functions
  openRound: (roundId: string, desks: string[], windowSeconds: number) => Promise<RoundView>
  queryRound: (roundId: string) => Promise<RoundView | null>
  readSealedOrders: (roundId: string) => Promise<SealedOrder[]>
  refreshStats: (roundId: string) => Promise<number>
  closeRound: (roundId: string) => Promise<string>
  settle: (roundId: string) => Promise<SettleResult>
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
      // After clear/settle, surface the deterministic result + curve + (P5) rationale.
      if (TERMINAL_STATUSES.has(round.status)) {
        const sealed = await deps.readSealedOrders(id)
        const views = sealed.map((s) => s.view)
        const { clearingPrice, allocations } = deps.computeClearing(views)
        body.clearingPrice = clearingPrice
        body.matchedVolume = deps.matchedAt(views, clearingPrice)
        body.allocations = allocations
        body.curve = buildCurve(deps, views)
        body.rationale = null // Phase 5 fills this; P4 keeps the field present as null.
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
      res.json({
        roundId: id,
        clearingPrice,
        matchedVolume,
        allocations,
        curve,
        rationale: null, // additive seam for Phase 5 (Claude rationale).
      })
    }),
  )

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
      const matchedVolume =
        result.matchedVolume ?? deps.matchedAt(
          (await deps.readSealedOrders(id)).map((s) => s.view),
          result.clearingPrice,
        )
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
