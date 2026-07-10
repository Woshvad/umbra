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
// `netImbalance` (Σbuy − Σsell) and `estMatched` are published ONLY past the same guard —
// below it they degenerate into individual orders (CR-01), so they are withheld (optional).
export type IndicativeMeta = {
  indicativePrice?: number
  coarse?: boolean
  band?: number
  netImbalance?: number
  estMatched?: number
}

// AUCT-04 per-desk best-ex / TCA receipt — present ONLY on the post-settle GET body
// (reconstructed from the on-ledger TradeConfirmations). Two DISTINCT surplus numbers:
// `surplusVsLimit` is the PROVEN, on-ledger ≥0 best-ex (never negative); the vs-REFERENCE
// benchmark (`improvementVsReferenceBp`, SIGNED) is a labeled stub that MAY be negative —
// the two must never be conflated. `ownLimit` is null for a noncompetitive order.
export type Receipt = {
  desk: string
  side: 'Buy' | 'Sell'
  filledQty: number
  clearingPrice: number
  ownLimit: number | null
  referencePrice: number
  surplusVsLimit: number
  improvementVsLimitBp: number
  improvementVsReferenceBp: number
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
  // AUCT-04: per-desk best-ex / TCA receipts — present ONLY on the POST-settle GET body
  // (reconstructed from the on-ledger TradeConfirmations; two-distinct-surplus).
  receipts?: Receipt[]
  // DFIN-01/02/03: the Batch/Instruction settlement-meta block — present ONLY on a
  // terminal (Cleared/Settled) body. Additive + OPTIONAL so decode never breaks against
  // a solver that has not yet emitted it (the SettlementView delta, 11-11, consumes it).
  settlement?: SettlementMeta
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
  // DFIN-01/02/03 additive settlement-meta (optional — see SettlementMeta below).
  settlement?: SettlementMeta
}

// POST /round/:id/settle — the atomic DvP result.
export type SettleResponse = {
  roundId: string
  status: 'Settled'
  clearingPrice: number
  matchedVolume: number
  allocations: Allocation[]
  txConfirmations: number // 1 — the single atomic DvP transaction
  // DFIN-01/02/03 additive settlement-meta (optional — see SettlementMeta below).
  settlement?: SettlementMeta
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

// ── IDEN-03 four-eyes Compliance decision (12-01 gate / 12-02 solver wiring) ──────
// The on-ledger four-eyes ClearingApproval (signatory operator+compliance) is REQUIRED by
// Round.Clear and is requested + collected server-side INSIDE settle() (12-02 gatherApprovalCid);
// the operator alone cannot forge it — the ledger now ENFORCES operator /= compliance at runtime
// and aborts on operator self-approval (12-01 `daml test` + assertClearingApproved). There is
// deliberately NO standalone approve/reject HTTP endpoint — the credential is threaded atomically
// at settle time, auto-approved by a DISTINCT compliance TOKEN the operator does not control.
// These two methods are therefore an operator-plane CONTROL-SURFACE, not the enforcement point: a
// decode-safe, offline-guarded reachability probe to the SAME solver (a down :4100 throws
// SolverError 'OFFLINE' exactly like the shipped five) that records a LOCAL four-eyes verdict the
// UI uses to gate the settle CTA. This local verdict is NOT the on-ledger gate (a direct settle
// bypasses it; the ledger's distinct-authority ClearingApproval is the real backstop). What ships
// today is auto-approval by a distinct compliance token — a LIVE human Compliance operator
// (distinct MFA'd identity) approving against a booted stack is the honest UAT step, not claimed
// as working here.
export type ComplianceDecision = { roundId: string; decision: 'approved' | 'rejected' }

// Probe the operator-plane solver so the control is genuinely offline-guarded (a network reject
// surfaces the shipped OFFLINE caption); getRound is decode-safe (reuses call<T>). The verdict is
// recorded regardless of the round's on-ledger status — the real enforcement lives in settle().
const complianceDecision = async (
  id: string,
  decision: 'approved' | 'rejected',
): Promise<ComplianceDecision> => {
  await getRound(id) // reachability + decode guard; throws SolverError('OFFLINE') when :4100 is down
  return { roundId: id, decision }
}

// APPROVE — the compliance sign-off that unblocks the settle CTA. Round.Clear's on-ledger
// fetch + assertClearingApproved (12-01) remains the real backstop inside settle().
export const approveClearing = (id: string): Promise<ComplianceDecision> =>
  complianceDecision(id, 'approved')

// REJECT — withhold sign-off; the settle CTA stays blocked and Round.Clear would abort on-ledger
// (no valid ClearingApproval) if settlement were attempted anyway.
export const rejectClearing = (id: string): Promise<ComplianceDecision> =>
  complianceDecision(id, 'rejected')

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

// ══ Phase-10 crypto operator-plane types (mirror solver/src/{tlock,zk/prove,zk/verify,timemachine}.ts) ══
// CRYP-02 / CRYP-03 / VIZ-02. The browser NEVER holds the tlock held-key, operator token, or
// ANTHROPIC_API_KEY: these types mirror the SECRET-SAFE response envelopes the solver already strips
// down to (booleans / hashes / offsets / ciphertext + PUBLIC beacon metadata) — never a witness, salt,
// beacon private share, or key. Every endpoint rides the single SOLVER_BASE_URL (no second port literal).
// Honest-labeling grammar (10-UI-SPEC): the seal mode 'offline' warning is a T3 (weaker-than-drand)
// disclosure; verify (off-ledger, T3) and anchor (on-ledger hash, T1) are DISTINCT shapes on purpose.

// CRYP-02 timelock seal mode — 'drand' (real threshold beacon, a T2 real-crypto-external-trust surface)
// vs 'offline' (labeled weaker AES-256-GCM fallback, a T3 surface). Mirrors tlock.ts SealMode.
export type SealMode = 'drand' | 'offline'

// POST /round/:id/timelock-encrypt response — ciphertext + PUBLIC round metadata ONLY (mirrors tlock.ts
// SealResult spread + the best-effort drand beacon fields api.ts folds in). `warning` is present ONLY on
// mode:'offline' (the weaker-than-drand disclosure — render it as the T3 red tag); `chainHash`/
// `timeToBeaconMs` are best-effort drand-mode metadata. No key/held-secret ever crosses out.
export type TimelockSealResponse = {
  roundId: string
  ciphertext: string
  targetRound: number
  mode: SealMode
  warning?: string // offline mode only — the mandatory weaker-than-drand disclosure (T3 tag)
  chainHash?: string // drand mode only — the PUBLIC beacon chain hash
  timeToBeaconMs?: number // drand mode only — ms until the target beacon publishes (UI countdown)
}

// POST /timelock-decrypt response — the recovered plaintext. A not-yet-due drand ciphertext maps to a
// SolverError(425,'TOO_EARLY'); the solver never echoes the raw beacon error text (T-10-17).
export type TimelockPlaintext = { plaintext: string }

// Public drand round metadata (mirrors tlock.ts DrandRoundInfo) — surfaced within the encrypt response's
// best-effort beacon fields. No secret at all (the beacon is public).
export type DrandRoundInfo = { targetRound: number; timeToBeaconMs: number; chainHash: string }

// CRYP-03 opaque Groth16 artifacts (mirror zk/prove.ts) — proof/vkey are opaque JSON to the client;
// publicSignals are decimal-string field elements ([pStar, matched, comm…]). The PRIVATE witness
// (every order's side/qty/limit/salt/fill) NEVER appears in any of these shapes (T-10-11).
export type Groth16Proof = Record<string, unknown>
export type PublicSignals = string[]
export type VKey = Record<string, unknown>

// POST /round/:id/prove response — the proof artifact (mirrors zk/prove.ts ClearingProof + roundId).
// Only { proof, publicSignals, sizeBytes, ms } cross out — the witness stays server-side. This is a
// T2 real-crypto artifact (ZK PROOF · GROTH16 ink tag).
export type ProofArtifact = {
  roundId: string
  proof: Groth16Proof
  publicSignals: PublicSignals
  sizeBytes: number
  ms: number
}

// The proof envelope POSTed to verify-proof / anchor-proof — vkey + publicSignals + proof (the artifact
// minus the sizes). Carries NO witness; vkey/proof are opaque JSON. Mirrors api.ts proofEnvelopeBody.
export type ProofEnvelope = { vkey: VKey; publicSignals: PublicSignals; proof: Groth16Proof }

// POST /round/:id/verify-proof response — the OFF-LEDGER (T3) Groth16 verdict. ONLY a boolean: a forged
// public signal → { verified:false }. DISTINCT from the anchor (Canton has no zk precompile), so this
// verdict renders on a DASHED T3 surface (OFF-LEDGER VERIFY · POC) — never conflated with the anchor.
export type VerifyVerdict = { roundId: string; verified: boolean }

// POST /round/:id/anchor-proof response — the ON-LEDGER (T1) hash anchor: sha256(proof‖publicSignals) +
// sha256(vkey). Hashes ONLY — no proof bytes, no witness. A hash anchored on-ledger is NOT a verify claim
// (the SOLID-T1-anchor vs DASHED-T3-verify split IS the "off-ledger verify + on-ledger hash anchor"
// statement — 10-UI-SPEC Reconciliation Note 3). Mirrors zk/verify.ts ProofAnchor + roundId.
export type AnchorResult = { roundId: string; proofHash: string; vkeyHash: string }

// POST /round/:id/tamper-proof response — the "break the proof" demo (mirrors tamperClear): the solver
// perturbs a PUBLIC input, re-verifies → false. Verbatim (secret-free) rejection; `verified` is ALWAYS
// false here (a T3 tamper-rejection surface — render `error` verbatim, never summarize it).
export type TamperProofResponse = { rejected: boolean; verified: false; error: string }

// VIZ-02 lifecycle stages (mirror timemachine.ts Stage) — the recorded ledger-offset bookmarks the Time
// Machine replays per-party. A derived/reconstructed replay is a T3 surface (RECONSTRUCTED), the raw
// authentic ledger-event cells are T1.
export type Stage = 'open' | 'committed' | 'sealed' | 'cleared' | 'settled'
// The recorded stage→ledger-offset map (mirrors timemachine.ts StageOffsets) — numeric bookmarks only;
// an un-recorded stage is simply absent (never a secret, never a token).
export type StageOffsets = Partial<Record<Stage, number>>

// GET /round/:id/stage-offsets response — the offsets map under a roundId envelope.
export type StageOffsetsResponse = { roundId: string; offsets: StageOffsets }

// ── CRYP-02 / CRYP-03 / VIZ-02 operator-plane client fns (:4100, NO credential) ───────────────────────
// Mirror the 10-06 solver endpoints via the shipped call<T>() — NO auth header (the solver serves the
// operator plane open, RESEARCH Pitfall 5); a network reject throws SolverError(0,'OFFLINE',OFFLINE_CAPTION)
// exactly like the shipped five. Every path is built off the SINGLE SOLVER_BASE_URL source — no :4000, no
// port literal — and NO operator token / ANTHROPIC_API_KEY / tlock held-key ever lives in these.

// CRYP-02 — seal a payload to a FUTURE drand round. Undecryptable (by ANYONE, incl. the solver holding
// the ciphertext) until that beacon publishes. `mode:'offline'` carries the weaker-than-drand `warning`
// (the UI MUST surface it as the T3 tag). `windowMs` is optional — omitted uses the solver default.
export const timelockEncrypt = (
  id: string,
  payload: string,
  windowMs?: number,
): Promise<TimelockSealResponse> =>
  call<TimelockSealResponse>(`/round/${id}/timelock-encrypt`, {
    method: 'POST',
    body: JSON.stringify(windowMs === undefined ? { payload } : { payload, windowMs }),
  })

// CRYP-02 — recover a sealed payload. A not-yet-due drand ciphertext throws SolverError code 'TOO_EARLY'
// (status 425); the caller maps it to the countdown / too-early state (no raw beacon error is echoed).
export const timelockDecrypt = (ciphertext: string): Promise<TimelockPlaintext> =>
  call<TimelockPlaintext>('/timelock-decrypt', {
    method: 'POST',
    body: JSON.stringify({ ciphertext }),
  })

// CRYP-03 — generate the round's REAL Groth16 proof of correct clearing. Only the artifact (proof +
// public signals + sizes) returns; the private witness stays inside the solver's zk/prove.ts (T-10-11).
export const generateProof = (id: string): Promise<ProofArtifact> =>
  call<ProofArtifact>(`/round/${id}/prove`, { method: 'POST' })

// CRYP-03 — OFF-LEDGER (T3) Groth16 verification → a boolean verdict ONLY. Post the proof envelope; a
// forged public signal → { verified:false }. DISTINCT from anchorProof (this never touches the ledger).
export const verifyProof = (id: string, envelope: ProofEnvelope): Promise<VerifyVerdict> =>
  call<VerifyVerdict>(`/round/${id}/verify-proof`, {
    method: 'POST',
    body: JSON.stringify(envelope),
  })

// CRYP-03 — ON-LEDGER (T1) hash anchor → { proofHash, vkeyHash }. Post the SAME proof envelope; only the
// hashes are recorded on-ledger (no proof bytes / witness). Anchoring a hash is NOT a verify claim — the
// deliberate solid-T1-anchor vs dashed-T3-verify split (10-UI-SPEC Note 3).
export const anchorProof = (id: string, envelope: ProofEnvelope): Promise<AnchorResult> =>
  call<AnchorResult>(`/round/${id}/anchor-proof`, {
    method: 'POST',
    body: JSON.stringify(envelope),
  })

// CRYP-03 — "break the proof" demo. The solver perturbs a PUBLIC input, re-verifies → false. Verbatim
// (secret-free) rejection; NEVER anchors. Mirrors tamperClear's never-throw contract (render `error` raw).
export const tamperProof = (id: string): Promise<TamperProofResponse> =>
  call<TamperProofResponse>(`/round/${id}/tamper-proof`, { method: 'POST' })

// VIZ-02 — the recorded stage→ledger-offset map for a round. Numeric bookmarks only (open/committed/
// sealed/cleared/settled); the Time Machine replays them per-party. An un-recorded stage is simply absent
// (never a secret, never a token). GET, so no body.
export const getStageOffsets = (id: string): Promise<StageOffsetsResponse> =>
  call<StageOffsetsResponse>(`/round/${id}/stage-offsets`)

// ══ VIZ-03 party→participant topology (mirror solver/src/topology.ts TopologyResult) ══
// The credential-free hosting map the "07 Topology" view renders. It rides the SAME
// SOLVER_BASE_URL/call<T>() as everything else — NO :4100 literal, NO auth header, NO
// operator/probe token in the bundle (the admin bearer lives ONLY inside topology.ts's
// injected probe, server-side). The response mirrors topology.ts EXACTLY plus roundId.

// One participant node: the participant id + the (focused) desk parties it locally hosts.
// Byte-mirror of topology.ts TopologyNode.
export type TopologyNode = { participant: string; parties: string[] }

// GET /round/:id/topology response — `{ roundId, ...TopologyResult }` (api.ts). `demoReal`
// TRUE ⇒ every hosted party maps to ONE participant (single-operator LocalNet) and the view
// MUST render the HARD non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET` / `SAME
// PARTICIPANT (LOCALNET)` honesty caption (`caption`). `perParty` maps party → hosting
// participant id(s) (a co-hosted guest can appear on >1). Live-ledger-optional: a down
// LocalNet degrades to an empty/partial map, never an error (SolverError 'OFFLINE' on reject).
export type TopologyMeta = {
  roundId: string
  nodes: TopologyNode[]
  perParty: Record<string, string[]>
  demoReal: boolean
  caption: string
}

// VIZ-03 — the honest party→participant hosting map for a round. Credential-free GET.
export const getTopology = (id: string): Promise<TopologyMeta> =>
  call<TopologyMeta>(`/round/${id}/topology`)

// ══ ADJ-01/02/03 competing / RFQ / issuance client seam (mirror solver/src/api.ts 13-11 + agent.ts) ══
// The credential-free web seam the S2 leaderboard (this plan) + the S3 RFQ / S4 issuance panels
// (later waves) consume. Every type is a BYTE-mirror of the authoritative solver wire shapes —
// agent.ts RankedProposal/CompetingResult + the api.ts /competing, /rfq*, /issuance* handlers
// (STATE 10-07 lesson: mirror the authoritative api.ts over an approximate sketch). Every fn rides
// the single SOLVER_BASE_URL/call<T>() — NO :4000, NO auth header, NO operator token / ANTHROPIC_API_KEY
// in the bundle; a network reject throws SolverError(0,'OFFLINE',OFFLINE_CAPTION) like the shipped five.

// Trade side — mirrors the Daml/solver Side ('Buy' | 'Sell') used across the adjacent endpoints.
export type Side = 'Buy' | 'Sell'

// ── ADJ-01 competing solvers ──────────────────────────────────────────────────────
// One solver entrant's honest config (model + temperature + optional prompt override).
// Mirrors agent.ts SolverConfig EXACTLY — the systemPrompt is NEVER echoed back in a response.
export type SolverConfig = { id: string; model: string; temperature: number; systemPrompt?: string }

// A single ranked competitor — BYTE-mirror of agent.ts RankedProposal. `config` is the honest
// tag ({ id, model, temperature }); for a verified entry the numbers are the DETERMINISTIC ones
// (referee-authoritative) and `rationale` is the model's. NOTE: the wire nests the tag under
// `config` (NOT a flat `configTag`) — the display helper (lib/leaderboard.ts) formats it.
export type RankedProposal = {
  config: { id: string; model: string; temperature: number }
  verified: boolean
  clearingPrice: number
  matchedVolume: number
  surplus: number
  rationale: string
}

// POST /competing response — `{ roundId, winner, leaderboard, deterministic }` (api.ts L1364-1369).
// `leaderboard` is the VERIFIED set only, ranked (matched desc, surplus desc); `winner` is
// leaderboard[0] or null. `deterministic` carries the AUTHORITATIVE §8 numbers that actually settle —
// the winner/leaderboard are NARRATIVE ONLY and no settlement path consults them (AI off the settle path).
export type CompetingResponse = {
  roundId: string
  winner: RankedProposal | null
  leaderboard: RankedProposal[]
  deterministic: {
    clearingPrice: number
    allocations: Allocation[]
    matchedVolume: number
    surplus: number
  }
}

// ADJ-01 — race the round's sealed batch across N solver configs. Advisory/narrative leaderboard;
// keyless-degrades (all entries verified:false, winner null) and NEVER throws the Anthropic key.
export const getCompeting = (roundId: string, configs: SolverConfig[]): Promise<CompetingResponse> =>
  call<CompetingResponse>('/competing', {
    method: 'POST',
    body: JSON.stringify({ roundId, configs }),
  })

// ── ADJ-02 RFQ ────────────────────────────────────────────────────────────────────
// POST /rfq (201) — mirror api.ts postRfq return.
export type RfqPostResponse = { rfqId: string; requester: string; side: Side; quantity: number }
// One requester-visible firm signed quote (GET /rfq/:id/quotes row — api.ts listQuotes).
export type FirmQuote = { contractId: string; dealer: string; price: number; quantity: number }
// GET /rfq/:id/quotes — `{ rfqId, quotes }` (api.ts L1394).
export type RfqQuotesResponse = { rfqId: string; quotes: FirmQuote[] }
// POST /rfq/:id/accept — the secret-free 1×1 DvP settle summary (api.ts acceptQuote return).
export type RfqAcceptResponse = {
  rfqId: string
  quoteCid: string
  requester: string
  dealer: string
  side: Side
  quantity: number
  price: number
  cashAmount: number
  settled: true
}

// ADJ-02 — post an RfqRequest to the (optional) invited dealer set.
export const postRfq = (b: {
  requester: string
  side: Side
  quantity: number
  dealers?: string[]
}): Promise<RfqPostResponse> =>
  call<RfqPostResponse>('/rfq', { method: 'POST', body: JSON.stringify(b) })

// ADJ-02 — list the requester-visible firm signed quotes for an RFQ.
export const getRfqQuotes = (rfqId: string): Promise<RfqQuotesResponse> =>
  call<RfqQuotesResponse>(`/rfq/${rfqId}/quotes`)

// ADJ-02 — accept the (best) quote by its ContractId → settles the 1×1 batch via the SAME atomic DvP.
export const acceptRfqQuote = (rfqId: string, quoteCid: string): Promise<RfqAcceptResponse> =>
  call<RfqAcceptResponse>(`/rfq/${rfqId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ quoteCid }),
  })

// ── ADJ-03 issuance ─────────────────────────────────────────────────────────────
// POST /issuance open body (api.ts issuanceOpenBody) — the tranche + optional reserve + bids.
export type IssuanceBid = { desk: string; quantity: number; limit: number }
export type IssuanceOpenBody = {
  issuer: string
  bondInstrument: string
  cashInstrument: string
  trancheSize: number
  reservePrice?: number
  bids?: IssuanceBid[]
}
// POST /issuance (201) response — the CLEARED tranche at ONE uniform issuance price (api.ts L1427-1432).
export type IssuanceClearResponse = {
  issuanceId: string
  clearingPrice: number
  totalIssued: number
  winners: { desk: string; filledQty: number }[]
}
// POST /issuance/:id/coupon response — the deterministic pro-rata coupon summary (api.ts payCoupon).
export type CouponResponse = {
  issuanceId: string
  period: number
  couponPerUnit: number
  holders: number
  totalPaid: number
}
// POST /issuance/:id/redeem response — the pro-rata principal repayment + retirement (api.ts redeem).
export type RedeemResponse = {
  issuanceId: string
  principalPerUnit: number
  holders: number
  totalRepaid: number
}

// ADJ-03 — open AND clear a primary tranche at ONE uniform price (mint Holdings). The wire
// POST /issuance is COMBINED: it opens then runs the deterministic §8 clear server-side inside
// the SAME request (api.ts L1414-1434), so the response is already the cleared tranche.
export const openIssuance = (b: IssuanceOpenBody): Promise<IssuanceClearResponse> =>
  call<IssuanceClearResponse>('/issuance', { method: 'POST', body: JSON.stringify(b) })

// ADJ-03 — the clear step. There is NO separate clear endpoint to mirror: POST /issuance already
// opens+clears atomically (above), so clearIssuance is the SAME combined call, named for the S4
// clear-reveal caller's readability (both exports are required by the client seam contract).
export const clearIssuance = openIssuance

// ADJ-03 — pay the deterministic pro-rata coupon to the current holders for a period.
export const payCoupon = (
  issuanceId: string,
  period: number,
  couponPerUnit: number,
): Promise<CouponResponse> =>
  call<CouponResponse>(`/issuance/${issuanceId}/coupon`, {
    method: 'POST',
    body: JSON.stringify({ period, couponPerUnit }),
  })

// ADJ-03 — repay principal pro-rata + retire the bond Holdings at maturity.
export const redeemIssuance = (
  issuanceId: string,
  principalPerUnit: number,
): Promise<RedeemResponse> =>
  call<RedeemResponse>(`/issuance/${issuanceId}/redeem`, {
    method: 'POST',
    body: JSON.stringify({ principalPerUnit }),
  })

// ══ DFIN-01/02/03 settlement-meta (mirror solver/src/settlement.ts + the D13 provenance) ══
// The additive Batch/Instruction settlement metadata the SettlementView delta (11-11)
// consumes off the settle/preview/terminal-GET body. These types are DEFINED here (the
// shared solver-client seam) so the Wave-6 views never edit solver.ts — they import these.
// Every field is data-driven; NONE is a credential.

// The HARD, data-driven settlement-provenance tag (DECISIONS.md D13 honesty rule). The
// literal "DAML FINANCE" (the library) is NEVER one of these — the library is unsatisfiable
// on the LF-2.1 / SDK-3.4.11 stack; the honest tags are CN-Standard interface conformance OR
// the in-repo faithful pattern layer. The view renders whichever the settlement layer reports.
export type SettlementProvenance = 'CN TOKEN STANDARD (CIP-0056)' | 'DAML-FINANCE-PATTERN (IN-REPO)'

// Token-agnostic instrument reference (DFIN-03) — byte-mirror of settlement.ts InstrumentRef
// / the Daml InstrumentId. `id` is the human symbol ("USDCx" / "BONDX"); a leg NEVER hardcodes
// a symbol string — it references this pair.
export type InstrumentRef = { issuer: string; id: string }

// A single DvP leg: `sender` delivers `amount` of `instrument` to `receiver`. Byte-mirror
// of settlement.ts Instruction (the Daml `Instruction` record). Pure data — the gross legs
// are always derivable; the netted legs are one leg per (party, instrument).
export type SettlementLeg = {
  sender: string
  receiver: string
  instrument: InstrumentRef
  amount: number
}

// The additive settlement-meta block on the settle / preview / terminal-GET body. OPTIONAL
// on every response (decode never breaks against a solver that has not emitted it yet).
// `netted` reflects the default-ON multilateral netting (one net leg per party·instrument);
// `grossLegs`/`nettedLegs` back the `NETTED ⇄ GROSS LEGS` toggle + the topology viz;
// `cashSymbol` is the token-agnostic cash instrument symbol (defaults "USDCx" for §4, never
// hardcoded in copy); `instructionCount` is the `{N}` in "Batch/Instruction · {N} instructions".
export type SettlementMeta = {
  provenance: SettlementProvenance
  instructionCount: number
  netted: boolean
  cashSymbol: string
  grossLegs?: SettlementLeg[]
  nettedLegs?: SettlementLeg[]
}
