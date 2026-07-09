// web/src/solver.ts — the OPERATOR-plane client (:4100). A thin typed `fetch`
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
// This URL default is the SINGLE source of truth for the solver port; every on-screen
// caption DERIVES the port from it (never a second literal — UI-SPEC Reconciliation Note 2).
export const SOLVER_BASE_URL: string =
  import.meta.env.VITE_SOLVER_URL ?? 'http://localhost:4100'

// The solver port, parsed ONCE from SOLVER_BASE_URL (VITE_SOLVER_URL overrides). Falls
// back to '4100' if the URL is malformed — never a hard-coded duplicate elsewhere.
export const solverPort: string = (() => {
  try {
    return new URL(SOLVER_BASE_URL).port || '4100'
  } catch {
    return '4100'
  }
})()

// The single offline caption shown across ALL solver-plane surfaces (Theatre / Agent /
// Settlement). Reads the derived port so it can never drift from the real bind
// (UI-SPEC Copywriting "Offline caption" row — {live port}).
export const OFFLINE_CAPTION = `SOLVER OFFLINE — START THE SERVICE ON :${solverPort}`

// ── Response types (mirror solver/src/api.ts + auction.ts exactly) ──────────────
// curve point — from buildCurve (api.ts lines 115-123).
export type CurvePoint = { price: number; demand: number; supply: number }
// Allocation — VERIFIED from solver/src/auction.ts lines 30-34.
export type Allocation = { desk: string; side: 'Buy' | 'Sell'; filledQty: number }
// agent provenance block — VERIFIED from solver/src/agent.ts.
export type AgentMeta = { verified: boolean; source: 'claude' | 'deterministic-fallback' }

// AUCT-03 aggregate indicative block — SCALARS ONLY, present on the OPEN-window GET body
// (mirrors solver/src/api.ts buildIndicative). NEVER an individual order or a candidate-
// price curve. `indicativePrice` is published only past the small-N guard (≥2 orders on
// both sides); otherwise `coarse:true` + a wide-bucket `band` (the UI labels the guard).
// `netImbalance` (Σbuy − Σsell) and `estMatched` are aggregate counts, always present.
export type IndicativeMeta = {
  indicativePrice?: number
  coarse?: boolean
  band?: number
  netImbalance: number
  estMatched: number
}

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
  // AUCT-03: the aggregate indicative block — present ONLY on the OPEN-window GET body
  // (scalars only, small-N guarded; never a curve or an individual order).
  indicative?: IndicativeMeta
  // WOW-04: the shareable natural-language brief — present ONLY on the terminal
  // (Cleared/Settled) GET body, composed server-side from the settled numbers +
  // verified rationale (solver/src/brief.ts composeBrief; secret-free, no drift).
  brief?: string
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

// POST /parse-order — WOW-03. The solver (holding the server-only Anthropic key)
// returns a zod-validated {side, qty, limit} for the desk to CONFIRM (never
// auto-submitted). A 422 PARSE_FAILED surfaces as a SolverError the UI maps to the
// parse-error state. Mirrors solver/src/api.ts POST /parse-order (200 body shape).
export type ParseOrderResponse = { side: 'Buy' | 'Sell'; qty: number; limit: number }

// POST /round/:id/tamper-clear — WOW-02. Attempts a deliberately WRONG on-ledger
// Round.Clear (wrong-price / overfill); the recompute-and-assert backstop rejects it
// atomically, changing NOTHING on-ledger. `error` is the VERBATIM (secret-free) ledger
// rejection body — render it, never summarize it. Mirrors solver/src/api.ts.
export type TamperMode = 'wrong-price' | 'overfill'
export type TamperClearResponse = { rejected: boolean; error: string }

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
    throw new SolverError(0, 'OFFLINE', OFFLINE_CAPTION)
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

// ── WOW-03 / WOW-02 client methods (:4100, no operator/Anthropic credential) ──────
// Natural-language order parse — plain English → validated {side, qty, limit}. A 422
// PARSE_FAILED throws SolverError (code 'PARSE_FAILED'); the caller maps it to the
// parse-error state. Prefills the ticket only — the desk still confirms via SEAL ORDER.
export const parseOrder = (text: string): Promise<ParseOrderResponse> =>
  call<ParseOrderResponse>('/parse-order', { method: 'POST', body: JSON.stringify({ text }) })

// Break-the-AI tamper trigger — attempts a wrong on-ledger clear and resolves the
// verbatim ledger rejection. It never settles; the real settle path is byte-unchanged.
export const tamperClear = (id: string, mode: TamperMode): Promise<TamperClearResponse> =>
  call<TamperClearResponse>(`/round/${id}/tamper-clear`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })

// ── WOW-04 / WOW-05 URL builders (no credential, no port literal) ─────────────────
// These build PLAIN URLs off SOLVER_BASE_URL — consumed by the browser's EventSource
// (SSE) and an <a download> anchor respectively. Both are on the operator plane but
// carry NO auth header (the solver serves them open on the operator plane — RESEARCH
// Pitfall 5); no operator/Anthropic credential ever reaches the browser.

// GET /round/:id/rationale-stream — the live rationale token stream. EventSource
// consumes this URL directly (it cannot set headers, and none are needed).
export const rationaleStreamUrl = (id: string): string =>
  `${SOLVER_BASE_URL}/round/${id}/rationale-stream`

// GET /round/:id/proof-pack.pdf — the on-brand proof-pack PDF (Content-Disposition:
// attachment). An <a href={proofPackUrl(id)} download> triggers the one-click save.
export const proofPackUrl = (id: string): string =>
  `${SOLVER_BASE_URL}/round/${id}/proof-pack.pdf`

// WOW-04 shareable brief — the settled round's natural-language summary. Reuses
// getRound (the terminal GET body carries `brief`); returns null pre-settle / if absent.
export const getBrief = async (id: string): Promise<string | null> => {
  const round = await getRound(id)
  return round.brief ?? null
}
