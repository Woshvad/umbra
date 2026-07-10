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
import type { OrderView, Allocation, ClearingResult, Side } from './auction.js'
import type { AgentResult, SolverConfig, CompetingResult } from './agent.js'
import type { ProofBundle } from './proof.js'
// OPS-01 observability (telemetry.ts): request-path spans + named metric instruments. Both
// degrade to no-ops when initTelemetry() has not run (tests), so importing them is inert.
import { withSpan, instruments } from './telemetry.js'
// OPS-02 public status (status.ts): the pure aggregate builder + the token-free brand page.
import { buildStatus, renderStatusHtml, type Health, type RoundPhase, type StatusInput } from './status.js'
// OPS-03 reliability: the idempotency middleware (dedupe mutating POSTs) + the FSM guard
// (reject illegal lifecycle transitions with 409). transition() throws an ApiError-shaped
// error the secret-safe middleware serializes identically to a native ApiError.
import { createIdempotency, type Idempotency } from './idempotency.js'
// PAY-01 x402 metered-access gate (x402.ts, Plan 01 / boot-wired in Plan 03). createApp
// defaults an absent gate to a DISABLED no-op so existing endpoints/tests + the §4 money-shot
// demo are byte-unchanged; main() injects the enabled, facilitator-backed gate when metering is on.
import { createX402Gate, type PaymentGate } from './x402.js'
import { transition, sealedAlias } from './fsm.js'
import type { RoundStatus } from './clock.js'
// OPS-04 webhooks.ts — the signed/retried lifecycle emitter + subscription registry. createApp
// fires round.cleared/round.settled/fill.posted off the settle seam (FIRE-AND-FORGET — never
// blocking/branching the legal path) and exposes register/unregister endpoints. The
// per-subscription secret stays module-private inside webhooks.ts and is NEVER echoed.
import { createWebhooks, type Webhooks, type WebhookEvent } from './webhooks.js'
// OPS-04 sandbox.ts — the deterministic §4 fixture ($100.00, fills A=10/B=8/C=2), a stable
// API contract for integrators, ISOLATED from real rounds. POST /sandbox/round reuses
// assertSandboxClears, which re-runs the §8 clear and THROWS on any drift from $100.00.
import { assertSandboxClears } from './sandbox.js'
// OPS-05 fix.ts — the pure FIX 4.4-subset order-entry acceptor. POST /fix wraps
// handleFixMessage: a raw NewOrderSingle (35=D) → a raw ExecutionReport (35=8) string; a
// malformed/unmapped frame degrades to a 35=8 reject (NEVER a 500 throw). Credential-free.
import { handleFixMessage, newFixSession } from './fix.js'
// CRYP-02/03 + VIZ-02 crypto types (TYPE-ONLY imports — erased at compile, so pulling
// them in NEVER triggers tlock-js / snarkjs / circomlibjs module evaluation here; the real
// implementations are dependency-injected via AppDeps, exactly like the ledger client).
import type { SealResult, DrandRoundInfo } from './tlock.js'
import type { ClearingProof, Groth16Proof, PublicSignals, VKey } from './zk/prove.js'
import type { ProofAnchor } from './zk/verify.js'
import type { StageOffsets } from './timemachine.js'
// VIZ-03 party→participant hosting map (TYPE-ONLY — erased at compile; the real probe
// is dependency-injected via AppDeps, exactly like the ledger/crypto clients).
import type { TopologyResult } from './topology.js'

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
  // AUCT-04 best-ex / TCA fields (present once the on-ledger TradeConfirmation carries them).
  // Optional so existing stubs/tests that omit them still type-check. `surplusVsLimit` is the
  // PROVEN, on-ledger ≥0 number; `improvementVsReferenceBp` is the SIGNED, may-be-negative benchmark.
  ownLimit?: number | null
  referencePrice?: number
  surplusVsLimit?: number
  improvementVsLimitBp?: number
  improvementVsReferenceBp?: number
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
  // TRUST-03: read the immutable decision proof bundle written at settle (proof.ts). Read-only;
  // returns the parsed bundle or null when no bundle exists for the round. The bundle is
  // SECRET-FREE (systemPromptHash instead of the prompt; never the key/token) — GET /round/:id/proof
  // serves it verbatim. May be sync (proof.ts) or async (a test stub) — the handler awaits it.
  readProofBundle: (roundId: string) => ProofBundle | null | Promise<ProofBundle | null>
  // WOW-05: compose + render the on-brand proof-pack for a settled round, then spawn headless
  // Chrome/Edge to a PDF (proofpack.ts). Resolves { pdf:true, path } when a PDF was rendered, or
  // { pdf:false, html } when the browser could not be spawned (the caller serves the on-brand HTML
  // for window.print()). Composed from readProofBundle + the settled numbers + composeBrief; it
  // interpolates only numbers/hashes/brief — NEVER the key/token/prompt (T-08-05-PACK).
  buildProofPack: (roundId: string) => Promise<{ pdf: true; path: string } | { pdf: false; html: string }>
  // pure §8 helpers from auction.ts
  computeClearing: (orders: OrderView[]) => ClearingResult
  matchedAt: (orders: OrderView[], p: number) => number
  demandAt: (orders: OrderView[], p: number) => number
  supplyAt: (orders: OrderView[], p: number) => number
  candidatePrices: (orders: OrderView[]) => number[]
  // AUCT-03: choose p* — the max-matched / min-imbalance / lower-price winner (auction.ts
  // choosePStar). Reused UNCHANGED for the OPEN-window aggregate indicative feed; never
  // emits a candidate-price curve, only the single scalar (small-N guarded downstream).
  choosePStar: (orders: OrderView[]) => number

  // ── CRYP-02 timelock (tlock.ts) ────────────────────────────────────────────────
  // Seal a payload to a FUTURE drand round — undecryptable (by ANYONE, including the
  // solver holding the ciphertext) until that beacon publishes. Returns ciphertext +
  // public round metadata + a `mode` ('drand' | 'offline'); the drand path holds NO
  // long-term secret and the weaker offline-fallback held key stays module-private in
  // tlock.ts. Only ciphertext + PUBLIC round metadata cross out — never a key.
  timelockEncrypt: (payload: string, windowMs: number) => Promise<SealResult>
  // Recover the plaintext. REJECTS (throws) with a message containing "too early" when the
  // target beacon has not published yet — the handler maps that to a fixed 425 (no err text
  // is echoed). The offline held key opens offline ciphertexts inside tlock.ts, never here.
  timelockDecrypt: (ciphertext: string) => Promise<{ plaintext: string }>
  // Public drand round metadata (target round + ms-to-beacon + chain hash) for a window —
  // drives the UI countdown. No secret; pure public-beacon math.
  drandRoundInfo: (windowMs: number) => Promise<DrandRoundInfo>

  // ── CRYP-03 zero-knowledge (zk/prove.ts + zk/verify.ts) ──────────────────────────
  // Generate a REAL Groth16 proof that the round's published (p*, matched, commitments)
  // is a fair, conserving clearing of the COMMITTED batch. The PRIVATE witness (every
  // order's side/qty/limit/salt/fill) NEVER crosses out — only { proof, publicSignals,
  // sizeBytes, ms }. The commitments are irreversible Poseidon hashes (reveal no order).
  generateProof: (roundId: string) => Promise<ClearingProof>
  // OFF-LEDGER Groth16 verification. Returns ONLY a boolean verdict — a forged public
  // signal → false. This is DISTINCT from anchorProof: Canton has no zk precompile, so
  // verification is off-ledger; anchoring records only hashes on-ledger.
  verifyProof: (vkey: VKey, publicSignals: PublicSignals, proof: Groth16Proof) => Promise<boolean>
  // ON-LEDGER anchor. Computes sha256(proof ‖ publicSignals) + sha256(vkey) and records
  // ONLY those hashes on-ledger (no proof bytes / witness). Returns the anchored hashes.
  // Kept DISTINCT from verifyProof: a hash anchored on-ledger is NOT a claim the proof
  // verified — the off-ledger verdict and the on-ledger hash-anchor are separate acts.
  anchorProof: (
    roundId: string,
    proof: Groth16Proof,
    publicSignals: PublicSignals,
    vkey: VKey,
  ) => Promise<ProofAnchor>
  // The "break the proof" demo seam (mirrors tamperClear's NEVER-throw contract): generate
  // a valid proof, perturb a PUBLIC input, re-verify → expect false. Returns the verbatim
  // (secret-free) rejection. NEVER throws, NEVER anchors — purely off the honest paths.
  tamperProof: (roundId: string) => Promise<{ rejected: boolean; verified: false; error: string }>

  // ── VIZ-02 stage→offset map (timemachine.ts) ─────────────────────────────────────
  // The recorded ledger offset at each lifecycle stage of a round (open → sealed →
  // cleared → settled). The browser replays these offsets per-party to reconstruct
  // "what desk X could see at stage N". Numeric bookmarks only — never a token.
  getStageOffsets: (roundId: string) => Promise<StageOffsets> | StageOffsets

  // ── VIZ-03 party→participant hosting map (topology.ts) ───────────────────────────
  // The honest party→participant residency for the "07 Topology" view. CREDENTIAL-FREE:
  // the admin/probe token lives inside topology.ts's injected probe closure and NEVER
  // crosses out — only party ids + participant ids + the demo-real caption. `demoReal`
  // fires the SAME PARTICIPANT (LOCALNET) honesty caption when every desk maps to one
  // participant (Pitfall 7 / T-11-03-OVERCLAIM). Live-ledger-optional: a down LocalNet
  // yields an empty/degraded map, never an error.
  hostingMap: () => Promise<TopologyResult>

  // ── WOW-07 guest 4th-desk bootstrap (index.ts wiring) ────────────────────────────
  // The credential-free /join bootstrap for the guest desk: its party id + the /join
  // URL + the roundId. It carries NO scoped token — the guest token is minted server-
  // /script-side into web/src/tokens.json (guest-onboard.mjs, the D6 boundary) and
  // delivered to the /join page there; it must NEVER appear in this response or a QR
  // payload (V2/V4 security / T-11-03-QR).
  onboardGuest: () => Promise<GuestBootstrap>

  // ── OPS-02 public status source (token-free /status + /status.html) ──────────────
  // OPTIONAL: the aggregate-only health source for the public status surface. Returns ONLY
  // venue-level aggregates — health, the CURRENT round STATUS (never an order/desk/secret),
  // and a build/version string. api.ts maps the round status → display phase via the FSM
  // sealedAlias and adds uptime + the last clear (tracked in-closure at settle). When absent
  // (existing tests), /status reports an idle, operational venue. NEVER carries private data.
  statusSource?: () =>
    | Promise<{ health: Health; roundStatus: RoundStatus | null; build: string }>
    | { health: Health; roundStatus: RoundStatus | null; build: string }

  // ── OPS-03 idempotency unit (opt-in dedupe of mutating POSTs) ─────────────────────
  // OPTIONAL: an injected idempotency store + middleware. When absent, createApp builds a
  // fresh in-memory unit. The middleware is a no-op unless a POST carries an Idempotency-Key
  // header, so existing endpoints/tests are byte-unaffected.
  idempotency?: Idempotency

  // ── PAY-01 x402 metered-access gate (x402.ts) ─────────────────────────────────────
  // OPTIONAL x402 gate. When absent, createApp builds a DISABLED no-op gate so existing
  // endpoints/tests + the §4 demo are byte-unchanged. Attached PER-ROUTE on EXACTLY the two
  // metered AI-compute endpoints (GET /round/:id/solve-preview + POST /competing) — NEVER
  // app-wide, so every never-metered path (/health, /status, GET /round/:id, /settle,
  // /sandbox/round, /fix, /rfq*, /issuance*) can never 402. main() injects the enabled,
  // facilitator-backed gate (index.ts); the disabled default keeps the money-shot untouched.
  x402?: PaymentGate

  // ── OPS-04 lifecycle webhook emitter + subscription registry (webhooks.ts) ────────
  // OPTIONAL: the signed/retried outbound webhook layer. When absent, createApp builds a
  // fresh in-memory instance so existing endpoints/tests are byte-unaffected (an emit with no
  // subscriptions is a no-op fan-out). createApp uses it to (a) serve POST /webhooks (register)
  // + DELETE /webhooks/:id (unregister) and (b) FIRE round.cleared/round.settled/fill.posted off
  // the settle seam — always FIRE-AND-FORGET so a webhook can never block or branch the legal
  // settlement. round.opened (index.ts open seam) + round.sealed (clock.ts close seam) fire off
  // the SAME instance, wired in main(). The per-subscription secret is never echoed/logged.
  webhooks?: Webhooks

  // ── ADJ-01 competing solvers (agent.proposeCompeting) ─────────────────────────────
  // Race N solver configs over the round's sealed batch; the deterministic §8 recompute is
  // the REFEREE and the ONLY thing that settles. Returns { winner, leaderboard, entries,
  // deterministic }. This is an ADVISORY / NARRATIVE leaderboard — no settlement path
  // consults the winner (AI strictly off the settlement path). Keyless-degrades (all entries
  // verified:false, winner null); NEVER throws the Anthropic key.
  proposeCompeting: (views: OrderView[], configs: SolverConfig[]) => Promise<CompetingResult>

  // ── ADJ-02 RFQ orchestration (ledger.ts postRfq / listQuotes / acceptQuote) ───────
  // post an RfqRequest, list the requester-visible firm signed quotes, and accept the best —
  // settling a 1×1 batch through the on-ledger AcceptQuote → settleBatch DvP. Secret-free
  // (party/contract ids + scalars only; the operator token stays module-private in ledger.ts).
  postRfq: (
    requester: string,
    side: Side,
    quantity: number,
    dealers?: string[],
  ) => Promise<{ rfqId: string; requester: string; side: Side; quantity: number }>
  listQuotes: (rfqCid: string) => Promise<{ contractId: string; dealer: string; price: number; quantity: number }[]>
  acceptQuote: (
    rfqCid: string,
    quoteCid: string,
  ) => Promise<{
    rfqId: string
    quoteCid: string
    requester: string
    dealer: string
    side: Side
    quantity: number
    price: number
    cashAmount: number
    settled: true
  }>

  // ── ADJ-03 issuance orchestration (ledger.ts openIssuance / clearIssuance / coupon / redeem) ──
  // Clear a primary tranche at ONE uniform price (mint Holdings), pay a pro-rata coupon, and
  // redeem principal at maturity. clearIssuance reuses the SAME §8 the on-ledger ClearIssuance
  // re-verifies (over-mint guarded on-ledger). Secret-free scalar summaries.
  openIssuance: (
    issuer: string,
    bondInstrument: string,
    cashInstrument: string,
    trancheSize: number,
    reservePrice?: number,
    bids?: { desk: string; quantity: number; limit: number }[],
  ) => Promise<{ issuanceId: string; issuer: string; bondInstrument: string; trancheSize: number }>
  clearIssuance: (
    issuanceCid: string,
  ) => Promise<{
    issuanceId: string
    clearingPrice: number
    totalIssued: number
    winners: { desk: string; filledQty: number }[]
  }>
  payCoupon: (
    issuanceCid: string,
    period: number,
    couponPerUnit: number,
  ) => Promise<{ issuanceId: string; period: number; couponPerUnit: number; holders: number; totalPaid: number }>
  redeem: (
    issuanceCid: string,
    principalPerUnit: number,
  ) => Promise<{ issuanceId: string; principalPerUnit: number; holders: number; totalRepaid: number }>
}

// WOW-07: the guest /join bootstrap returned by GET /guest/bootstrap. Party id + join
// URL + roundId ONLY — the scoped token is delivered via tokens.json server-side, never
// here and never in a QR (T-11-03-QR).
export interface GuestBootstrap {
  party: string
  joinUrl: string
  roundId: string
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

// Duck-type an ApiError-shaped error. api.ts and fsm.ts each define a structurally-identical
// ApiError (fsm.ts keeps its own to avoid an api↔fsm import cycle); both carry a numeric
// `status`, a string `code`, a string `message`, and `name === 'ApiError'`. The error
// middleware uses this so the FSM guard's 409 serializes into the secret-safe envelope.
const isApiErrorShaped = (
  err: unknown,
): err is { status: number; code: string; message: string } =>
  err instanceof ApiError ||
  (typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'ApiError' &&
    typeof (err as { status?: unknown }).status === 'number' &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string')

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

// ── zod schema for POST /round/:id/timelock-encrypt (CRYP-02) ────────────────────
// Cap the payload (ASVS V5 input-size limit) and the window. A malformed/oversized
// body → a sanitized 400; the raw env/headers are never echoed.
const timelockEncryptBody = z
  .object({
    payload: z.string().min(1).max(8192),
    // Optional window in ms; capped at 24h so a hostile value can't push the target
    // round absurdly far. Defaults downstream when omitted.
    windowMs: z.number().int().positive().max(86_400_000).optional(),
  })
  .strict()

// ── zod schema for POST /timelock-decrypt (CRYP-02) ──────────────────────────────
// The AGE-armored (or offline-prefixed) ciphertext — a few KB at most; cap it.
const timelockDecryptBody = z
  .object({
    ciphertext: z.string().min(1).max(100_000),
  })
  .strict()

// ── zod schema for the ZK proof envelope (CRYP-03: verify-proof + anchor-proof) ──
// A Groth16 proof + its public signals + the verification key. proof/vkey are opaque
// JSON objects (validated as records); publicSignals are decimal-string field elements.
// Size caps (ASVS V5) bound the blast radius of a hostile body.
const proofEnvelopeBody = z
  .object({
    vkey: z.record(z.string(), z.unknown()),
    publicSignals: z.array(z.string().max(256)).min(1).max(256),
    proof: z.record(z.string(), z.unknown()),
  })
  .strict()

// ── zod schema for POST /webhooks (OPS-04 subscription register) ─────────────────
// A subscriber registers a delivery URL + a per-subscription HMAC secret + an event filter.
// The secret is accepted here and stored MODULE-PRIVATE inside webhooks.ts — it is NEVER
// echoed back (the register response carries only { id, url, events }). Size caps bound a
// hostile body (ASVS V5); `.strict()` rejects any unexpected field.
const webhookRegisterBody = z
  .object({
    url: z.string().url().max(2048),
    secret: z.string().min(1).max(512),
    events: z
      .array(
        z.enum(['round.opened', 'round.sealed', 'round.cleared', 'round.settled', 'fill.posted']),
      )
      .min(1)
      .max(5),
  })
  .strict()

// ── zod schemas for the ADJ-01/02/03 endpoints (competing / RFQ / issuance) ──────────
// Every new body is `.strict()` (unexpected fields rejected) with size caps (ASVS V5). A
// malformed body → a sanitized 400 INVALID_BODY; the raw env/headers are never echoed.

// ADJ-01 competing solvers: the roundId whose sealed batch is raced + the solver entrants.
const solverConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    model: z.string().min(1).max(64),
    temperature: z.number().min(0).max(2),
    systemPrompt: z.string().max(4096).optional(),
  })
  .strict()
const competingBody = z
  .object({
    roundId: z.string().min(1),
    configs: z.array(solverConfigSchema).min(1).max(8),
  })
  .strict()

// ADJ-02 RFQ: post a request; accept a quote by its ContractId.
const rfqPostBody = z
  .object({
    requester: z.string().min(1),
    side: z.enum(['Buy', 'Sell']),
    quantity: z.number().int().positive(),
    dealers: z.array(z.string().min(1)).max(16).optional(),
  })
  .strict()
const rfqAcceptBody = z
  .object({
    quoteCid: z.string().min(1),
  })
  .strict()

// ADJ-03 issuance: open + clear a tranche; pay a coupon; redeem principal.
const issuanceBidSchema = z
  .object({
    desk: z.string().min(1),
    quantity: z.number().int().positive(),
    limit: z.number().positive(),
  })
  .strict()
const issuanceOpenBody = z
  .object({
    issuer: z.string().min(1),
    bondInstrument: z.string().min(1).max(64),
    cashInstrument: z.string().min(1).max(64),
    trancheSize: z.number().int().positive(),
    reservePrice: z.number().nonnegative().optional(),
    bids: z.array(issuanceBidSchema).max(64).optional(),
  })
  .strict()
const couponBody = z
  .object({
    period: z.number().int().nonnegative(),
    couponPerUnit: z.number().positive(),
  })
  .strict()
const redeemBody = z
  .object({
    principalPerUnit: z.number().positive(),
  })
  .strict()

// Default timelock window (ms) when a request omits windowMs — one short demo batch.
const DEFAULT_TIMELOCK_WINDOW_MS = 30_000

// Statuses that mean the round has already been cleared/settled (double-settle guard).
const TERMINAL_STATUSES = new Set(['Cleared', 'Settled'])

// WOW-05 proof-pack failure copy (08-UI-SPEC error row) — secret-free, user-facing.
const PROOFPACK_ERROR_COPY = "Proof-pack couldn't be generated. Check the solver on the configured port and try again."

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

// ── AUCT-03 aggregate indicative block (OPEN window, SCALARS ONLY) ────────────────
// The load-bearing privacy surface (threat T-09-04-01/03): during the open window the
// solver holds the WHOLE sealed batch, but ONLY aggregate scalars may cross the wire —
// NEVER an individual order and NEVER a candidate-price curve (each candidate price is
// one desk's limit; see Pitfall 1). This computes:
//   • indicativePrice = choosePStar(views)  — published EXACT only past the small-N guard
//   • netImbalance    = Σ buy qty − Σ sell qty  — published ONLY past the small-N guard
//   • estMatched      = matchedAt(views, p*)     — published ONLY past the small-N guard
// Small-N guard (CR-01): with <2 orders on EITHER side the "aggregate" scalars degenerate
// into individual orders — at N=1 netImbalance IS that lone order's ±quantity, and with one
// order per side {netImbalance, estMatched} invert to both quantities and both sides. So
// below the threshold NOTHING order-derivable is published: only a coarse wide-bucket price
// `band` + `coarse:true` (the UI labels the guard). The exact price AND the imbalance/matched
// scalars require ≥2 orders on BOTH sides, where the sums are genuinely non-invertible.
// buildCurve is deliberately NOT called here — the curve stays terminal-status-only.
const INDICATIVE_BAND_BUCKET = 5

// The scalars-only shape returned during the open window (mirrored by web IndicativeMeta).
// netImbalance/estMatched are OPTIONAL: withheld under the small-N guard (see CR-01 above).
type IndicativeBlock = {
  indicativePrice?: number
  coarse?: boolean
  band?: number
  netImbalance?: number
  estMatched?: number
}

const buildIndicative = (deps: AppDeps, views: OrderView[]): IndicativeBlock => {
  const buys = views.filter((v) => v.side === 'Buy')
  const sells = views.filter((v) => v.side === 'Sell')
  const pStar = deps.choosePStar(views)
  // Small-N guard: <2 orders on EITHER side makes every scalar order-derivable (CR-01),
  // so we publish only a coarse price band — no imbalance, no matched, no exact price.
  const guarded = buys.length < 2 || sells.length < 2
  if (guarded) {
    return {
      coarse: true,
      band: Math.round(pStar / INDICATIVE_BAND_BUCKET) * INDICATIVE_BAND_BUCKET,
    }
  }
  // ≥2 orders on both sides: the sums are genuinely aggregate (non-invertible to an order).
  const netImbalance =
    buys.reduce((s, v) => s + v.quantity, 0) - sells.reduce((s, v) => s + v.quantity, 0)
  const estMatched = deps.matchedAt(views, pStar)
  return { indicativePrice: pStar, netImbalance, estMatched }
}

// OPS-02: the build/version string surfaced by the public /status page (aggregate, non-secret).
const STATUS_BUILD = process.env.UMBRA_BUILD ?? 'phase-13'

export const createApp = (deps: AppDeps): Express => {
  const app = express()
  app.use(express.json())
  // CORS scoped to the Vite dev origin ONLY — never '*' (T-04-09 / V4). Registered BEFORE the
  // idempotency guard so a replayed response still carries the CORS headers.
  app.use(cors({ origin: ALLOWED_ORIGIN }))
  // OPS-03: the idempotency middleware registers AFTER express.json() so req.body is parsed
  // when we hash it. OPT-IN — a no-op unless a POST carries an Idempotency-Key header, so the
  // existing endpoints/tests are byte-unaffected. Deduped replays return the ORIGINAL response;
  // a same-key-different-body → 422 IDEMPOTENCY_KEY_REUSED.
  const idempotency = deps.idempotency ?? createIdempotency()
  app.use(idempotency.middleware)

  // PAY-01: the x402 gate. Defaulted ONCE to a DISABLED no-op when not injected, so with
  // metering off (the default) it is byte-identical to no gate at all (primary invariant).
  // Attached PER-ROUTE below on EXACTLY the two metered AI endpoints — NEVER via app.use, so
  // no free/lifecycle/settlement path can ever be metered (T-14-11).
  const x402 = deps.x402 ?? createX402Gate({ enabled: false })

  // OPS-04: the lifecycle webhook emitter + subscription registry. Absent in existing tests →
  // a fresh in-memory instance (emit is a no-op fan-out with zero subscriptions), so the §11
  // endpoints stay byte-compatible. round.opened/round.sealed fire off the index.ts/clock.ts
  // seams into this SAME instance; round.cleared/round.settled/fill.posted fire off /settle below.
  const webhooks = deps.webhooks ?? createWebhooks()
  // FIRE-AND-FORGET emit: the legal settlement path must NEVER block on, branch on, or fail
  // because of a webhook (hard invariant). We schedule the emit off the request path and
  // swallow any rejection — the emitter already retries internally and logs secret-free.
  const emitSafe = (event: WebhookEvent, data: Record<string, unknown>): void => {
    void Promise.resolve()
      .then(() => webhooks.emit(event, data))
      .catch(() => undefined)
  }
  // OPS-05: one monotonic FIX session for the HTTP-wrapped /fix acceptor (the outbound
  // MsgSeqNum increments per reply). Credential-free — holds only sender/target comp ids + a seq.
  const fixSession = newFixSession()

  // OPS-01/02: boot timestamp for uptime + the last clear (price/time), tracked in-closure and
  // set at settle. Both feed ONLY the aggregate /status surface — never any per-order data.
  const bootAt = Date.now()
  let lastClear: { price: number; at: string } | undefined

  const uptimeSeconds = (): number => Math.floor((Date.now() - bootAt) / 1000)

  // Assemble the aggregate-only StatusInput: health + display phase (Closed→'Sealed' via the
  // FSM sealedAlias) + uptime + build + the optional last clear. Deliberately lists only
  // allow-listed aggregate fields — no order/desk/secret can ride along (Pitfall 7 / T-13-19).
  const buildStatusInput = async (): Promise<StatusInput> => {
    const src = deps.statusSource
      ? await deps.statusSource()
      : { health: 'operational' as Health, roundStatus: null as RoundStatus | null, build: STATUS_BUILD }
    const phase: RoundPhase = src.roundStatus === null ? null : (sealedAlias(src.roundStatus) as Exclude<RoundPhase, null>)
    const input: StatusInput = {
      health: src.health,
      phase,
      uptimeSeconds: uptimeSeconds(),
      build: src.build,
    }
    if (lastClear) {
      input.lastClearPrice = lastClear.price
      input.lastClearAt = lastClear.at
    }
    return input
  }

  // ══ OPS-01/02 token-free public surfaces (S1) — NO auth context, aggregate-only ══════
  // These three routes take NO token and expose ZERO private order/secret data (T-13-19).

  // GET /health — liveness/readiness for alerting/orchestration. Aggregate-only.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: uptimeSeconds() })
  })

  // GET /status — the public venue-health JSON. buildStatus() lists only allow-listed
  // aggregate keys (health, phase, last clear price/time, uptime, build) — NEVER an order,
  // desk, limit, token, or operator identifier. Reachable without any token.
  app.get(
    '/status',
    wrap(async (_req, res) => {
      res.json(buildStatus(await buildStatusInput()))
    }),
  )

  // GET /status.html — the self-contained brand-styled status page (no React/Tailwind/auth).
  // renderStatusHtml inlines only the aggregate values + a client-side poll of /status.
  app.get(
    '/status.html',
    wrap(async (_req, res) => {
      res.type('html').send(renderStatusHtml(buildStatus(await buildStatusInput())))
    }),
  )

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
      // OPS-01 metric: a round entered the Open window (no-op until initTelemetry runs).
      instruments.roundsOpened.add(1)
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
      // AUCT-03: during the OPEN window (with ≥1 sealed order) attach the aggregate
      // indicative block — SCALARS ONLY, small-N guarded, NO candidate-price curve
      // (Pitfall 1). Mutually exclusive with the terminal-status branch below (Open is
      // not a terminal status), so no curve/candidate data ever coexists with it.
      if (round.status === 'Open') {
        const sealed = await deps.readSealedOrders(id)
        if (sealed.length > 0) {
          body.indicative = buildIndicative(deps, sealed.map((s) => s.view))
        }
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
          // AUCT-04: surface the per-desk best-ex / TCA receipts (two DISTINCT surplus
          // numbers — proven vs-LIMIT and the labeled benchmark vs-REFERENCE). Numbers
          // and desk ids only; the confirmation observer is the desk (privacy structural).
          body.receipts = confs.map((c) => ({
            desk: c.desk,
            side: c.side,
            filledQty: c.filledQty,
            clearingPrice: c.clearingPrice,
            ownLimit: c.ownLimit ?? null,
            referencePrice: c.referencePrice ?? clearingPrice,
            surplusVsLimit: c.surplusVsLimit ?? 0,
            improvementVsLimitBp: c.improvementVsLimitBp ?? 0,
            improvementVsReferenceBp: c.improvementVsReferenceBp ?? 0,
          }))
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
      // OPS-03 FSM guard: the only legal edge into Closed is Open→Closed. A re-close of an
      // already-Closed round stays idempotent (the clock's forceClose is a no-op), but
      // closing a Cleared/Settled round is an illegal edge → 409 ILLEGAL_TRANSITION.
      const round = await deps.queryRound(id)
      if (round && round.status !== 'Closed') {
        transition(round.status as RoundStatus, 'Closed')
      }
      await deps.closeRound(id)
      res.json({ roundId: id, status: 'Closed' })
    }),
  )

  // GET /round/:id/solve-preview — the deterministic §8 proposal. COMPUTE, NO SETTLE.
  // PAY-01: x402.middleware is the PER-ROUTE metered gate (disabled no-op by default). It runs
  // BEFORE wrap() — with metering on, no X-PAYMENT ⇒ 402; a valid payment ⇒ settle → handler.
  app.get(
    '/round/:id/solve-preview',
    x402.middleware,
    wrap(async (req, res) => {
      const { id } = req.params
      const sealed = await deps.readSealedOrders(id)
      const views: OrderView[] = sealed.map((s) => s.view)
      // OPS-01: span-wrap the §8 clear-compute (round.id-correlated) + record its latency.
      const clearStart = Date.now()
      const { clearingPrice, allocations } = await withSpan('clear.compute', id, () =>
        deps.computeClearing(views),
      )
      instruments.clearLatencyMs.record(Date.now() - clearStart)
      // matchedVolume is NOT on ClearingResult — derive it here from the exported helper.
      const matchedVolume = deps.matchedAt(views, clearingPrice)
      const curve = buildCurve(deps, views)
      // Phase 5: the agent PROPOSES; the deterministic numbers above are authoritative
      // and UNCHANGED (P4 backward-compat). We take only the rationale + the additive
      // {verified, source} block. proposeClearing never throws (it handles keyless /
      // SDK-error internally → deterministic fallback) — no try/catch needed.
      const agent = await deps.proposeClearing(views)
      // OPS-01 metric: an agent proposal was reconciled against §8, labelled by its source.
      instruments.agentVerifiedTotal.add(1, { source: agent.source })
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

    // Client-disconnect teardown (WR-03): when the browser EventSource closes (AgentRationale
    // unmount, view switch, React StrictMode double-mount, or navigation) stop writing to the
    // now half-closed socket. `aborted` gates every write below so no delta lands on a dead
    // connection and the handler stops driving output for a client that has gone away.
    let aborted = false
    req.on('close', () => {
      aborted = true
    })

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
        if (closed || aborted) return
        closed = true
        res.write('event: done\ndata: {}\n\n')
        res.end()
      }
      const finishFallback = (): void => {
        if (closed || aborted) return
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
          if (aborted || closed) return
          res.write(`data: ${JSON.stringify(delta)}\n\n`)
        },
        onDone: finishDone,
        onError: finishFallback,
      })
    })().catch(() => {
      // Guard the IIFE (WR-03): a throw from streamRationale or the fallback's
      // computeClearing (contractually shouldn't happen) must not become an unhandled
      // promise rejection — end the response instead of crashing the process.
      if (!res.writableEnded) res.end()
    })
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
      // Double-settle guard (T-04-06): reject a round already cleared/settled — kept EXACTLY
      // as strict (ALREADY_SETTLED 409) so any consumer of that code stays byte-compatible.
      if (TERMINAL_STATUSES.has(round.status)) {
        throw new ApiError(409, 'ALREADY_SETTLED', `round ${id} is already ${round.status}`)
      }
      // OPS-03 FSM guard: fold the lifecycle pre-check in. The settle route performs the
      // Closed→Cleared Round.Clear step, so a legal precondition is status === 'Closed'. A
      // settle-before-close (Open) is an illegal edge → 409 ILLEGAL_TRANSITION (before any
      // ledger work). Cleared/Settled were already rejected above; this catches the Open case.
      transition(round.status as RoundStatus, 'Cleared')
      // OPS-01: span-wrap the settle path (round.id-correlated) + record its latency.
      const settleStart = Date.now()
      const result = await withSpan('round.settle', id, () => deps.settle(id))
      instruments.settleLatencyMs.record(Date.now() - settleStart)
      // OPS-02: record the last clear for the aggregate /status surface (public uniform price).
      lastClear = { price: result.clearingPrice, at: new Date().toISOString() }
      // matchedVolume is always set by the live settle path (Round.Clear's totalMatched);
      // if a deps impl omits it, reconstruct from the verified Buy-side allocations.
      // NEVER read the sealed book here — Round.Clear RETIRED those orders, so a recompute
      // on the now-empty book would yield 0 (the same trap the GET post-settle branch avoids).
      const matchedVolume =
        result.matchedVolume ??
        result.allocations.filter((a) => a.side === 'Buy').reduce((sum, a) => sum + a.filledQty, 0)
      // OPS-04 lifecycle emits off the settle seam — FIRE-AND-FORGET, aggregate/round data
      // only (NEVER a sealed order's limit / order content). round.cleared + round.settled
      // carry the public uniform price + matched volume; fill.posted fires ONCE PER
      // TradeConfirmation (Open Question 1). The confirmation read + fan-out run entirely off
      // the request path so a webhook can never block or fail the byte-unchanged /settle reply.
      emitSafe('round.cleared', { roundId: id, clearingPrice: result.clearingPrice, matchedVolume })
      emitSafe('round.settled', {
        roundId: id,
        clearingPrice: result.clearingPrice,
        matchedVolume,
        txConfirmations: result.txConfirmations ?? 1,
      })
      void Promise.resolve()
        .then(async () => {
          const confs = await deps.readTradeConfirmations(id)
          for (const c of confs) {
            // The per-desk fill receipt — desk id + side + filled qty + the PUBLIC clearing
            // price. This is the SETTLED fill, never the sealed order's private limit.
            emitSafe('fill.posted', {
              roundId: id,
              desk: c.desk,
              side: c.side,
              filledQty: c.filledQty,
              clearingPrice: c.clearingPrice,
            })
          }
        })
        .catch(() => undefined)
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

  // GET /round/:id/proof — TRUST-03 read-only decision proof bundle. Serves the immutable
  // JSON written at settle (systemPromptHash + batchHash + rawAiProposal + deterministicRecompute
  // + clearingHash). 404 when no bundle exists yet. The bundle is secret-free by construction
  // (proof.ts stores hashes, never the key/prompt) — this is a pure read + passthrough.
  app.get(
    '/round/:id/proof',
    wrap(async (req, res) => {
      const { id } = req.params
      const bundle = await deps.readProofBundle(id)
      if (!bundle) {
        throw new ApiError(404, 'PROOF_NOT_FOUND', `no decision proof bundle for round ${id}`)
      }
      res.json(bundle)
    }),
  )

  // GET /round/:id/proof-pack.pdf — WOW-05 one-click on-brand proof-pack. deps.buildProofPack
  // renders the on-brand HTML (clearing proof + best-ex receipts + finality record + AI decision
  // bundle) and spawns headless Chrome/Edge to a PDF. If a PDF was rendered, stream it as a
  // download (Content-Disposition: attachment); if the browser could not be spawned, serve the
  // on-brand HTML (200, text/html) so the browser can window.print() (RESEARCH Open Q2 fallback).
  // Any failure → a secret-free PROOFPACK_FAILED 500 with the UI-SPEC error copy.
  app.get(
    '/round/:id/proof-pack.pdf',
    wrap(async (req, res) => {
      const { id } = req.params
      const result = await deps.buildProofPack(id).catch(() => {
        throw new ApiError(500, 'PROOFPACK_FAILED', PROOFPACK_ERROR_COPY)
      })
      if (result.pdf) {
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Umbra-Proof-Pack-${id}.pdf"`)
        await new Promise<void>((resolve, reject) => {
          res.sendFile(result.path, (err) => (err ? reject(err) : resolve()))
        })
        return
      }
      // Graceful fallback: the on-brand HTML for window.print().
      res.status(200).type('html').send(result.html)
    }),
  )

  // ══ CRYP-02 / CRYP-03 / VIZ-02 crypto endpoints (ADDITIVE — off the §11/settle path) ══
  // The browser talks ONLY to the solver for operator-plane crypto (tlock seals, proof
  // generation/verification, the stage→offset map). Every body below is zod-validated and
  // every response rides the SAME secret-safe envelope — no tlock held key, operator token,
  // ANTHROPIC_API_KEY, salt, or proof witness ever crosses out.

  // POST /round/:id/timelock-encrypt — CRYP-02 seal a payload to a FUTURE drand round.
  // Undecryptable (by anyone, incl. the solver) until that beacon publishes. Returns the
  // ciphertext + public round metadata; enriches with best-effort beacon timing for the UI
  // countdown (drand mode only — never fatal). `mode:'offline'` carries the weaker-than-drand
  // warning tlock.ts attaches (the UI MUST surface it).
  app.post(
    '/round/:id/timelock-encrypt',
    wrap(async (req, res) => {
      const { id } = req.params
      const parsed = timelockEncryptBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const windowMs = parsed.data.windowMs ?? DEFAULT_TIMELOCK_WINDOW_MS
      const seal = await deps.timelockEncrypt(parsed.data.payload, windowMs)
      // Best-effort public beacon metadata (drand path only); a drand outage must not fail
      // the seal (tlock already fell back to the labeled offline mode in that case).
      let beacon: { chainHash?: string; timeToBeaconMs?: number } = {}
      if (seal.mode === 'drand') {
        try {
          const info = await deps.drandRoundInfo(windowMs)
          beacon = { chainHash: info.chainHash, timeToBeaconMs: info.timeToBeaconMs }
        } catch {
          beacon = {}
        }
      }
      res.json({ roundId: id, ...seal, ...beacon })
    }),
  )

  // POST /timelock-decrypt — CRYP-02 recover a sealed payload. A drand ciphertext whose
  // target beacon has NOT published yet rejects with a message containing "too early"; we
  // map that to a fixed 425 (no underlying error text is ever echoed — it could carry
  // internals). Any other failure collapses to a generic secret-free 422.
  app.post(
    '/timelock-decrypt',
    wrap(async (req, res) => {
      const parsed = timelockDecryptBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      let result: { plaintext: string }
      try {
        result = await deps.timelockDecrypt(parsed.data.ciphertext)
      } catch (err) {
        // Classify ONLY on the presence of the cryptographic early-decrypt marker; the raw
        // message is NEVER interpolated into the response (T-10-17).
        const msg = err instanceof Error ? err.message.toLowerCase() : ''
        if (msg.includes('too early')) {
          throw new ApiError(
            425,
            'TOO_EARLY',
            'ciphertext not yet decryptable — the drand beacon for its target round has not published',
          )
        }
        throw new ApiError(422, 'DECRYPT_FAILED', 'could not decrypt the ciphertext')
      }
      res.json({ plaintext: result.plaintext })
    }),
  )

  // POST /round/:id/prove — CRYP-03 generate a REAL Groth16 proof of the round's clearing.
  // The PRIVATE witness stays inside zk/prove.ts — only { proof, publicSignals, sizeBytes,
  // ms } cross out. The trusted setup behind it is PoC-grade (label it wherever surfaced).
  app.post(
    '/round/:id/prove',
    wrap(async (req, res) => {
      const { id } = req.params
      const { proof, publicSignals, sizeBytes, ms } = await deps.generateProof(id)
      res.json({ roundId: id, proof, publicSignals, sizeBytes, ms })
    }),
  )

  // POST /round/:id/verify-proof — CRYP-03 OFF-LEDGER Groth16 verification. Returns ONLY a
  // boolean verdict. DISTINCT from anchor-proof: this is the off-ledger check (Canton has no
  // zk precompile), NOT an on-ledger record. A forged public signal → { verified:false }.
  app.post(
    '/round/:id/verify-proof',
    wrap(async (req, res) => {
      const { id } = req.params
      const parsed = proofEnvelopeBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const { vkey, publicSignals, proof } = parsed.data
      const verified = await deps.verifyProof(vkey, publicSignals, proof)
      // Off-ledger verdict shape: { verified } — NO on-ledger hashes here (that is anchor's job).
      res.json({ roundId: id, verified })
    }),
  )

  // POST /round/:id/anchor-proof — CRYP-03 ON-LEDGER anchor. Records ONLY sha256(proof ‖
  // publicSignals) + sha256(vkey) on-ledger — no proof bytes, no witness. Returns the anchored
  // hashes. DISTINCT from verify-proof: anchoring a hash is NOT a verification claim (the two
  // acts are deliberately separate — an anchored hash records "a proof against this circuit
  // existed", the off-ledger verify is what actually checks it).
  app.post(
    '/round/:id/anchor-proof',
    wrap(async (req, res) => {
      const { id } = req.params
      const parsed = proofEnvelopeBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const { vkey, publicSignals, proof } = parsed.data
      const anchor = await deps.anchorProof(id, proof, publicSignals, vkey)
      // On-ledger anchor shape: the recorded hashes — NO boolean verdict (that is verify's job).
      res.json({ roundId: id, proofHash: anchor.proofHash, vkeyHash: anchor.vkeyHash })
    }),
  )

  // POST /round/:id/tamper-proof — CRYP-03 "break the proof" demo. Perturbs a PUBLIC input and
  // re-verifies → the Groth16 check rejects it. Mirrors /tamper-clear: the dep NEVER throws and
  // NEVER anchors; the verbatim (secret-free) rejection is the payload.
  app.post(
    '/round/:id/tamper-proof',
    wrap(async (req, res) => {
      const { id } = req.params
      const result = await deps.tamperProof(id)
      res.json({ rejected: result.rejected, verified: result.verified, error: result.error })
    }),
  )

  // GET /round/:id/stage-offsets — VIZ-02 the recorded stage→ledger-offset map for a round.
  // Numeric bookmarks only (open/sealed/cleared/settled); the browser replays them per-party.
  // An unknown round / un-recorded stage is simply absent (never a secret, never a token).
  app.get(
    '/round/:id/stage-offsets',
    wrap(async (req, res) => {
      const { id } = req.params
      const offsets = await deps.getStageOffsets(id)
      res.json({ roundId: id, offsets })
    }),
  )

  // GET /round/:id/topology — VIZ-03 party→participant hosting map. CREDENTIAL-FREE
  // read-only passthrough (mirrors /proof): the admin/probe token lives inside the
  // injected probe (topology.ts) and NEVER crosses out — only party ids + participant
  // ids + the demo-real caption. The `demoReal` flag drives the HARD honesty caption.
  // Live-ledger-optional: deps.hostingMap degrades gracefully when LocalNet is down.
  app.get(
    '/round/:id/topology',
    wrap(async (req, res) => {
      const { id } = req.params
      const topology = await deps.hostingMap()
      res.json({ roundId: id, ...topology })
    }),
  )

  // GET /guest/bootstrap — WOW-07 guest 4th-desk /join bootstrap. Returns the guest
  // party id + the /join URL + roundId; NEVER the scoped token (it is delivered to the
  // /join page via tokens.json, minted server-/script-side by guest-onboard.mjs — the
  // token must not appear in any GET body or QR payload, T-11-03-QR). Credential-free,
  // side-effect-free (party allocation is the guest-onboard.mjs job, not this GET).
  app.get(
    '/guest/bootstrap',
    wrap(async (_req, res) => {
      const bootstrap = await deps.onboardGuest()
      res.json(bootstrap)
    }),
  )

  // ══ OPS-04 sandbox round — the deterministic §4 fixture, isolated from real rounds ═══
  // POST /sandbox/round ALWAYS seeds + clears + "settles" the canonical §4 batch (three desks
  // A/B/C) at EXACTLY $100.00 with fills A=10/B=8/C=2. It is a STABLE, never-varying API
  // contract for third-party integration tests: assertSandboxClears re-runs the deterministic
  // §8 clear and THROWS a fixed drift message unless the price is 100.00 and the allocation set
  // matches — so the sandbox can never silently diverge from the golden fixture. ISOLATED: the
  // response id is namespaced (SANDBOX-…) and NO real round's state is read or mutated. The
  // fixture is pure numbers only — no operator token / ANTHROPIC_API_KEY is ever touched.
  app.post(
    '/sandbox/round',
    wrap(async (_req, res) => {
      // Deterministic §8 clear over the fixed §4 fixture; throws on ANY drift from $100.00.
      const result = assertSandboxClears()
      const matched = result.allocations
        .filter((a) => a.side === 'Buy')
        .reduce((sum, a) => sum + a.filledQty, 0)
      res.status(201).json({
        // Namespaced sandbox id — never collides with a real round's `R-…` id namespace.
        roundId: `SANDBOX-${Date.now()}`,
        clearingPrice: result.clearingPrice, // ALWAYS 100.00
        allocations: result.allocations, // A=10 / B=8 / C=2
        matched, // 10
        sandbox: true,
      })
    }),
  )

  // ══ OPS-05 FIX 4.4-subset order-entry acceptor (HTTP-wrapped raw FIX) ═════════════
  // POST /fix accepts a raw FIX 4.4 NewOrderSingle (35=D) — either as a text/plain body OR a
  // JSON `{ fix }` field — and returns a raw ExecutionReport (35=8) string. A valid, mappable
  // 35=D → OrdStatus 0 (New); a malformed frame / unmapped order / unknown MsgType → OrdStatus
  // 8 (Rejected). handleFixMessage NEVER throws, so a bad frame yields a framed 35=8 reject —
  // NEVER a 500. HONEST LABEL: "FIX 4.4 subset — order entry only; live OMS interop is a UAT
  // gate." CREDENTIAL-FREE: no operator token / ANTHROPIC_API_KEY is ever interpolated into a
  // built FIX message. express.text parses the raw body; body-parser's _body guard means an
  // already-parsed JSON `{ fix }` body is honored too.
  app.post(
    '/fix',
    express.text({ type: '*/*', limit: '64kb' }),
    wrap(async (req, res) => {
      // Resolve the raw FIX string from either a text/plain body or a JSON `{ fix }` field.
      let raw = ''
      if (typeof req.body === 'string') {
        raw = req.body
      } else if (req.body && typeof req.body === 'object' && typeof (req.body as { fix?: unknown }).fix === 'string') {
        raw = (req.body as { fix: string }).fix
      }
      // handleFixMessage degrades an empty/malformed frame to a clean 35=8 reject (never throws),
      // so we always return a framed ExecutionReport with a 200 (the reject is IN the frame, not
      // an HTTP error). The raw FIX string is the response — text/plain, credential-free.
      const report = handleFixMessage(raw, fixSession)
      res.status(200).type('text/plain').send(report)
    }),
  )

  // ══ OPS-04 webhook subscription management (operator-plane) ═══════════════════════
  // POST /webhooks registers a { url, secret, events } subscription; DELETE /webhooks/:id
  // unregisters it. These sit behind the SAME operator boundary as the §11 mutating
  // endpoints. The per-subscription HMAC secret is stored MODULE-PRIVATE inside webhooks.ts
  // and is NEVER echoed — the register response carries only { id, url, events } (T-13-26).

  // POST /webhooks — register a lifecycle subscription (zod-validated, secret NEVER echoed).
  app.post(
    '/webhooks',
    wrap(async (req, res) => {
      const parsed = webhookRegisterBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      // register() stores the secret privately and returns a secret-free handle { id, url, events }.
      const sub = webhooks.register(parsed.data)
      res.status(201).json(sub)
    }),
  )

  // DELETE /webhooks/:id — unregister a subscription. 404 when the id is unknown.
  app.delete(
    '/webhooks/:id',
    wrap(async (req, res) => {
      const { id } = req.params
      const removed = webhooks.unregister(id)
      if (!removed) {
        throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND', `webhook subscription ${id} not found`)
      }
      res.json({ id, unregistered: true })
    }),
  )

  // ══ ADJ-01/02/03 competing / RFQ / issuance endpoints (ADDITIVE — off the §11/settle path) ══
  // Every body is zod-`.strict()`-validated and every response rides the SAME secret-safe
  // envelope — no operator token / ANTHROPIC_API_KEY ever crosses out (secret-swept in tests).
  // The five §11 endpoints + /settle stay byte-compatible; the §4 golden stays $100.00.

  // POST /competing — ADJ-01 competing-solvers leaderboard. Races the round's sealed batch
  // across N solver configs; returns { winner, leaderboard, deterministic }. The leaderboard is
  // a NARRATIVE / ADVISORY panel — NO settlement path consults the winner. The deterministic §8
  // block is the ONLY thing that settles (AI strictly off the settlement path). Keyless-degrades.
  // PAY-01: x402.middleware is the PER-ROUTE metered gate (disabled no-op by default) — the
  // SECOND and LAST metered endpoint. roundId is in the BODY (not the path), so the gate builds
  // `resource` from req.originalUrl (never req.params) — no path coupling.
  app.post(
    '/competing',
    x402.middleware,
    wrap(async (req, res) => {
      const parsed = competingBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const sealed = await deps.readSealedOrders(parsed.data.roundId)
      const views: OrderView[] = sealed.map((s) => s.view)
      const result = await deps.proposeCompeting(views, parsed.data.configs)
      // ADVISORY leaderboard: `deterministic` carries the authoritative §8 numbers that actually
      // settle; `winner`/`leaderboard` are narrative-only and never fed back into settlement.
      res.json({
        roundId: parsed.data.roundId,
        winner: result.winner,
        leaderboard: result.leaderboard,
        deterministic: result.deterministic,
      })
    }),
  )

  // POST /rfq — ADJ-02 post an RfqRequest to an invited dealer set (zod-validated).
  app.post(
    '/rfq',
    wrap(async (req, res) => {
      const parsed = rfqPostBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const { requester, side, quantity, dealers } = parsed.data
      const posted = await deps.postRfq(requester, side, quantity, dealers)
      res.status(201).json(posted)
    }),
  )

  // GET /rfq/:id/quotes — ADJ-02 list the requester-visible firm signed quotes.
  app.get(
    '/rfq/:id/quotes',
    wrap(async (req, res) => {
      const quotes = await deps.listQuotes(req.params.id)
      res.json({ rfqId: req.params.id, quotes })
    }),
  )

  // POST /rfq/:id/accept — ADJ-02 accept the (best) quote → settle the 1×1 batch via the
  // on-ledger AcceptQuote → settleBatch DvP. Returns the secret-free settle summary.
  app.post(
    '/rfq/:id/accept',
    wrap(async (req, res) => {
      const parsed = rfqAcceptBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const summary = await deps.acceptQuote(req.params.id, parsed.data.quoteCid)
      res.json(summary)
    }),
  )

  // POST /issuance — ADJ-03 open + clear a primary tranche at ONE uniform price (mint Holdings).
  app.post(
    '/issuance',
    wrap(async (req, res) => {
      const parsed = issuanceOpenBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const { issuer, bondInstrument, cashInstrument, trancheSize, reservePrice, bids } = parsed.data
      const opened = await deps.openIssuance(issuer, bondInstrument, cashInstrument, trancheSize, reservePrice, bids)
      const cleared = await deps.clearIssuance(opened.issuanceId)
      res.status(201).json({
        issuanceId: cleared.issuanceId,
        clearingPrice: cleared.clearingPrice, // the SINGLE uniform issuance price
        totalIssued: cleared.totalIssued,
        winners: cleared.winners,
      })
    }),
  )

  // POST /issuance/:id/coupon — ADJ-03 pay the deterministic pro-rata coupon to current holders.
  app.post(
    '/issuance/:id/coupon',
    wrap(async (req, res) => {
      const parsed = couponBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const paid = await deps.payCoupon(req.params.id, parsed.data.period, parsed.data.couponPerUnit)
      res.json(paid)
    }),
  )

  // POST /issuance/:id/redeem — ADJ-03 repay principal pro-rata + retire the bond Holdings.
  app.post(
    '/issuance/:id/redeem',
    wrap(async (req, res) => {
      const parsed = redeemBody.safeParse(req.body ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const path = issue?.path.join('.') || '(body)'
        throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${path} — ${issue?.message ?? 'invalid'}`)
      }
      const redeemed = await deps.redeem(req.params.id, parsed.data.principalPerUnit)
      res.json(redeemed)
    }),
  )

  // ── Secret-safe error middleware (SOLV-04 / V7) ────────────────────────────────
  // Produces `{ error: { code, message } }`. Known ApiErrors pass their authored
  // (secret-free) message; anything else collapses to a generic 500 message so a raw
  // exception (which COULD embed a path/token) never reaches the client. The Operator
  // token, ANTHROPIC_API_KEY, process.env, and request headers are NEVER serialized.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Recognize BOTH api.ts's ApiError AND the structurally-identical fsm.ts ApiError (which
    // carries { status, code, message, name:'ApiError' } — see fsm.ts) by duck-typing, so the
    // FSM guard's secret-free 409 serializes into the SAME secret-safe envelope.
    if (isApiErrorShaped(err)) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } })
      return
    }
    // Generic fallback — do NOT leak the underlying error text (could carry secrets).
    res.status(500).json({ error: { code: 'INTERNAL', message: 'internal solver error' } })
  })

  return app
}
