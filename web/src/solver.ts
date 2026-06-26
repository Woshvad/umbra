// web/src/solver.ts — the OPERATOR-plane client (:4000). A thin typed `fetch`
// wrapper that type-mirrors the frozen solver/src/api.ts response shapes (Phases
// 4/5). Theatre / Agent / Settlement drive the round through THIS module; the
// browser NEVER holds the Operator token — the solver service is the sole
// Operator-authority proxy (CONTEXT D6 / threat T-06-01). No @daml/react context,
// no operator token literal lives here.
//
// Direct cross-origin: the solver sets `cors({ origin: 'http://localhost:5173' })`
// (api.ts line 30/129) — no Vite proxy needed.
//
// Numbers come back as JSON NUMBERS (not strings): the solver derives them from its
// deterministic core, not from Daml decimals (RESEARCH Pitfall 2).

// Single drift const + comment (mirrors web/src/config.ts). Override with VITE_SOLVER_URL.
export const SOLVER_BASE_URL: string =
  import.meta.env.VITE_SOLVER_URL ?? 'http://localhost:4000'

// ── Response types (mirror solver/src/api.ts + auction.ts exactly) ──────────────
// curve point — from buildCurve (api.ts lines 115-123).
export type CurvePoint = { price: number; demand: number; supply: number }
// Allocation — VERIFIED from solver/src/auction.ts lines 30-34.
export type Allocation = { desk: string; side: 'Buy' | 'Sell'; filledQty: number }
// agent provenance block — VERIFIED from solver/src/agent.ts.
export type AgentMeta = { verified: boolean; source: 'claude' | 'deterministic-fallback' }

export type RoundStatus = 'Open' | 'Closed' | 'Cleared' | 'Settled'

// GET /round/:id — status + sealedOrderCount always; the result fields are attached
// ONLY when status ∈ {Cleared, Settled} (TERMINAL_STATUSES — api.ts lines 174-188).
export type RoundResponse = {
  roundId: string
  status: RoundStatus
  sealedOrderCount: number
  clearingPrice?: number
  matchedVolume?: number
  allocations?: Allocation[]
  curve?: CurvePoint[]
  rationale?: string
  agent?: AgentMeta
}

// GET /round/:id/solve-preview — the full deterministic §8 proposal (always present).
export type SolvePreviewResponse = {
  roundId: string
  clearingPrice: number // 100.00 on the §4 fixture
  matchedVolume: number // 10
  allocations: Allocation[]
  curve: CurvePoint[]
  rationale: string // Claude or deterministic fallback (always populated, P5)
  agent: AgentMeta
}

// POST /round/:id/settle — the atomic DvP result.
export type SettleResponse = {
  roundId: string
  status: 'Settled'
  clearingPrice: number
  matchedVolume: number
  allocations: Allocation[]
  txConfirmations: number // 1 — the single atomic DvP transaction
}

// POST /round — open a round.
export type CreateRoundResponse = {
  roundId: string
  status: 'Open'
  openedAt: string
  windowSeconds: number
}

// POST /round/:id/close — force-close the window.
export type CloseRoundResponse = { roundId: string; status: 'Closed' }

// The solver's secret-safe error envelope (api.ts lines 266-273).
export type ApiErrorBody = { error: { code: string; message: string } }

// ── SolverError — carries the structured {status, code} for the offline guard ────
// Surfaces ONLY the solver's structured {code,message} or a fixed OFFLINE caption;
// never logs raw headers or the attempted URL beyond the benign base host (T-06-02).
export class SolverError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SolverError'
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SOLVER_BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    // Network failure = solver offline (the CONTEXT "solver offline" state). Do NOT
    // interpolate the attempted URL/headers into the message (T-06-02 / T-06-03).
    throw new SolverError(0, 'OFFLINE', 'SOLVER OFFLINE — START THE SERVICE ON :4000')
  }
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = (body as ApiErrorBody).error
    throw new SolverError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'solver error')
  }
  return body as T
}

// ── The five endpoint functions ─────────────────────────────────────────────────
export const createRound = (b?: {
  roundId?: string
  desks?: string[]
  windowSeconds?: number
}): Promise<CreateRoundResponse> =>
  call<CreateRoundResponse>('/round', { method: 'POST', body: JSON.stringify(b ?? {}) })

export const getRound = (id: string): Promise<RoundResponse> =>
  call<RoundResponse>(`/round/${id}`)

export const closeRound = (id: string): Promise<CloseRoundResponse> =>
  call<CloseRoundResponse>(`/round/${id}/close`, { method: 'POST' })

export const solvePreview = (id: string): Promise<SolvePreviewResponse> =>
  call<SolvePreviewResponse>(`/round/${id}/solve-preview`)

export const settle = (id: string): Promise<SettleResponse> =>
  call<SettleResponse>(`/round/${id}/settle`, { method: 'POST' })
