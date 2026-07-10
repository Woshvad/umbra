// solver/src/ledger.ts — the Operator-authority client over the Canton JSON Ledger
// API v2 (cn-quickstart LocalNet, Daml 3.4). This is the v2 successor to the
// @daml/ledger@2.10.4 (HTTP JSON API v1) client: the SAME exported surface
// (openRound / queryRound / readSealedOrders / refreshStats / closeRound / settle /
// readTradeConfirmations / queryAllRounds / operatorParty), now driven by
// POST /v2/commands/submit-and-wait + POST /v2/state/active-contracts.
//
// SECURITY (SOLV-04 / threat T-04-04): the Operator JWT is module-private — read
// from scripts/.operator-token (gitignored; written by scripts/localnet/deploy.mjs),
// NEVER returned by an exported function, never spread into a response, never
// logged. Only party-/contract-level data crosses out of this module. The token's
// Canton user (ledger-api-user) is granted actAs+readAs the operator party.
//
// VERIFY-DON'T-TRUST (T-04-05): `settle` submits ONLY the deterministic §8
// `computeClearing` output; the on-ledger `Round.Clear` re-verifies §8 and rejects
// any mismatch. There is NO skip-verification path.
//
// Wire encoding (proven against the live ledger): Daml Int/Decimal accept JSON
// NUMBERS on input and come back as STRINGS on output → coerce reads with Number().
// Enums (Side / RoundStatus) are strings; Time is ISO-8601; ContractId is a string;
// a Daml (a, b) tuple is { _1, _2 }. Templates are addressed by the package-NAME
// reference form `#umbra:Module:Entity` (package-id form is deprecated in 3.4).

import { readFileSync } from 'node:fs'
import type { OrderType, OrderView, Side } from './auction.js'
import { computeClearing, matchedAt } from './auction.js'
// IDEN-01 dual-mode: the OIDC (DevNet/prod) client-credentials token acquisition. Only
// invoked when OIDC_ISSUER is set; the dev LocalNet path never touches it. The OIDC
// client secret lives ONLY inside auth.ts (never in this module, never logged).
// NOTE (LOW-03): only `acquireToken` is on the request path here. auth.ts also exports
// `verifyToken`, but it is deliberately NOT called in this client — the PARTICIPANT is the
// authoritative token verifier; `verifyToken` is offline-testable defense-in-depth
// (exercised by auth.test.ts), not an active verification step in the solver's request flow.
import { acquireToken } from './auth.js'
// OPS-01: wrap the settle Round.Clear exercise in a CLIENT-kind span. HONEST LABELLING —
// the `ledger.*` name marks it a JSON Ledger API v2 CLIENT call (withSpan defaults ledger.*
// to SpanKind.CLIENT), NOT instrumentation inside the Canton participant. No-op until
// initTelemetry() runs, so importing it is inert (the token/credential never touches a span).
import { withSpan } from './telemetry.js'

export type RoundStatus = 'Open' | 'Closed' | 'Cleared' | 'Settled'

const BOND_SYMBOL = 'BONDX'
const CASH_SYMBOL = 'USDCx'
const PKG = '#umbra' // package-name reference form for templateIds

// AUCT-04 — the LABELED benchmark reference price (a config STUB ≈ pre-auction mid).
// Passed into every Round.Clear as the `referencePrice` choice arg (a choice body
// cannot read config, so the solver supplies it). This drives ONLY the SIGNED,
// clearly-labeled `improvementVsReferenceBp` benchmark — NEVER the proven, on-ledger
// `surplusVsLimit >= 0` number. A real market-data feed is deferred to Track B.
const REFERENCE_PRICE_STUB = 100.0

// ── Participant base URL ─────────────────────────────────────────────────────────
// The app-provider participant's JSON Ledger API v2 (LocalNet default :3975). Trailing
// slashes are stripped because every call appends an absolute `/v2/...` path.
const PARTICIPANT = (
  process.env.JSON_API_URL ??
  process.env.LOCALNET_JSON_API ??
  'http://localhost:3975'
).replace(/\/+$/, '')

// ── Dual-mode Operator credential resolution (IDEN-01 — module-private) ────────────
// The credential seam grows a mode switch, selected by env:
//   • OIDC_ISSUER SET   ⇒ DevNet/prod OIDC path: the bearer is acquired via
//     client-credentials (auth.ts acquireToken, RS256) and cached until near expiry; the
//     operator PARTY comes from OIDC_OPERATOR_PARTY (or the deploy party map).
//   • OIDC_ISSUER UNSET ⇒ dev LocalNet path (BYTE-UNCHANGED): the bearer + party are the
//     HS256 dev token read from scripts/.operator-token (written by deploy.mjs).
// Only the KEY SOURCE + SIGNING ALG differ across modes (HS256/`unsafe` → RS256/JWKS);
// the audience (https://canton.network.global) and the participant user-rights model are
// identical (Canton derives party rights from the user, not token claims — D9). The OIDC
// client secret lives ONLY in auth.ts (never in this module, never returned, never logged).
const OIDC_MODE = Boolean(process.env.OIDC_ISSUER)

// The dev credential (HS256 token + party) — read synchronously ONLY on the dev path so
// OIDC deployments need not ship scripts/.operator-token.
const resolveDevOperator = (): { token: string; party: string } => {
  try {
    const raw = readFileSync(new URL('../../scripts/.operator-token', import.meta.url), 'utf8')
    const { token, party } = JSON.parse(raw) as { token: string; party: string }
    if (token && party) return { token, party }
  } catch {
    // fall through to the explicit error
  }
  throw new Error(
    'No Operator credential: scripts/.operator-token absent. ' +
      'Deploy to the LocalNet first: `node scripts/localnet/deploy.mjs`.',
  )
}

// The operator PARTY on the OIDC path (a public id). The token does NOT carry party
// authority (Canton derives rights from the token's user; D9), so the party is configured
// explicitly (OIDC_OPERATOR_PARTY) or read from the deploy party map's `operator`.
const resolveOidcOperatorParty = (): string => {
  const explicit = process.env.OIDC_OPERATOR_PARTY
  if (explicit) return explicit
  try {
    const raw = readFileSync(new URL('../../daml/parties.json', import.meta.url), 'utf8')
    const m = JSON.parse(raw) as Record<string, string>
    if (m.operator) return m.operator
  } catch {
    // fall through
  }
  throw new Error('OIDC mode: set OIDC_OPERATOR_PARTY (or provide daml/parties.json operator)')
}

// Resolve once. Dev reads the file (token + party); OIDC resolves the party only.
const _dev = OIDC_MODE ? null : resolveDevOperator()
// The dev HS256 bearer (module-private, '' on the OIDC path — the OIDC bearer is dynamic).
const _devOperatorToken: string = _dev?.token ?? ''
const _operatorParty: string = OIDC_MODE ? resolveOidcOperatorParty() : _dev!.party

// Exported: the Operator PARTY string only (a public id). The token is intentionally
// NOT exported and NOT part of any return value.
export const operatorParty: string = _operatorParty

// ── OIDC bearer cache (module-private; NEVER logged) ──────────────────────────────
// On the OIDC path the bearer is a short-lived RS256 token: acquire it lazily via
// client-credentials and cache it until shortly before expiry (parsed from the JWT `exp`,
// with a 60s default TTL when absent). The token string never leaves the request header.
let _oidcToken: string | null = null
let _oidcExpEpochMs = 0
const OIDC_REFRESH_SKEW_MS = 30_000

const jwtExpMs = (token: string): number => {
  try {
    const seg = token.split('.')[1] ?? ''
    const payload = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')) as { exp?: number }
    return payload.exp ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

const oidcBearer = async (): Promise<string> => {
  const now = Date.now()
  if (_oidcToken && now < _oidcExpEpochMs - OIDC_REFRESH_SKEW_MS) return _oidcToken
  const token = await acquireToken()
  _oidcToken = token
  const exp = jwtExpMs(token)
  _oidcExpEpochMs = exp || now + 60_000
  return token
}

// The current bearer for BOTH modes. Dev returns the static HS256 token (byte-unchanged
// behaviour); OIDC returns the cached/refreshed client-credentials token.
const bearerToken = async (): Promise<string> => (OIDC_MODE ? oidcBearer() : _devOperatorToken)

// ── IDEN-03 four-eyes Compliance credential (module-private) ──────────────────────
// The approve step needs a DISTINCT compliance authority. The on-ledger four-eyes gate
// (12-01) now ABORTS `Round.Clear` when compliance == operator, so an operator-held
// approval is no longer a silent bypass — it fails loudly at settle. To make that
// failure legible (and to refuse settling with a self-signed approval at all), the
// compliance identity is resolved from a DISTINCT source:
//   • scripts/.compliance-token (a dedicated dev/UAT compliance credential), OR
//   • COMPLIANCE_PARTY + COMPLIANCE_TOKEN env (the OIDC/DevNet path).
// A configured identity that COLLAPSES onto the operator is a hard misconfiguration
// (throws). When NO distinct identity is configured the resolver reports `distinct:
// false`; `gatherApprovalCid` then HARD-FAILS before minting any approval UNLESS the
// operator-held fallback is EXPLICITLY opted in (UMBRA_ALLOW_OPERATOR_COMPLIANCE=1),
// reserved for the local dev fast-loop against a permissive stub. This is auto-approval
// by a distinct compliance token, NOT a human gate — a live, MFA'd human Compliance
// approver remains the UAT step. The compliance token, like the operator token, is
// NEVER exported/returned/logged.
//
// Set to '1' ONLY for the local dev fast-loop: allow the operator to also hold the
// compliance authority (the on-ledger gate still rejects it unless a distinct party is
// used, so this never enables a real four-eyes bypass — it only unblocks stub runs).
const ALLOW_OPERATOR_COMPLIANCE = process.env.UMBRA_ALLOW_OPERATOR_COMPLIANCE === '1'

const resolveCompliance = (): { token: string; party: string; distinct: boolean } => {
  // 1. A dedicated compliance credential file → the REAL distinct authority.
  let fileRaw: string | null = null
  try {
    fileRaw = readFileSync(new URL('../../scripts/.compliance-token', import.meta.url), 'utf8')
  } catch {
    // no dedicated compliance credential on disk — try env, then fall back below.
  }
  if (fileRaw) {
    const { token, party } = JSON.parse(fileRaw) as { token: string; party: string }
    if (token && party) {
      if (party === _operatorParty) {
        throw new Error(
          'scripts/.compliance-token names the SAME party as the operator — four-eyes ' +
            'requires a DISTINCT compliance authority (the on-ledger gate aborts on ' +
            'operator self-approval).',
        )
      }
      return { token, party, distinct: true }
    }
  }
  // 2. OIDC/DevNet path: an explicit COMPLIANCE_PARTY + COMPLIANCE_TOKEN pair.
  const envParty = process.env.COMPLIANCE_PARTY
  const envToken = process.env.COMPLIANCE_TOKEN
  if (envParty && envToken) {
    if (envParty === _operatorParty) {
      throw new Error(
        'COMPLIANCE_PARTY equals the operator party — four-eyes requires a DISTINCT ' +
          'compliance authority (the on-ledger gate aborts on operator self-approval).',
      )
    }
    return { token: envToken, party: envParty, distinct: true }
  }
  // 3. No distinct compliance identity configured → operator-held (dev fast-loop only).
  //    Flagged `distinct: false`; gatherApprovalCid refuses to proceed unless the
  //    fallback is explicitly opted in (and the on-ledger gate would abort anyway).
  return { token: _devOperatorToken, party: _operatorParty, distinct: false }
}
const { token: _complianceToken, party: _complianceParty, distinct: _complianceDistinct } =
  resolveCompliance()

// Default desks for a body-less POST /round (the §4 banks), read fresh from the
// deploy's party map. openRound uses the caller's desks when provided.
const resolveDesks = (): string[] => {
  try {
    const raw = readFileSync(new URL('../../daml/parties.json', import.meta.url), 'utf8')
    const p = JSON.parse(raw) as Record<string, string>
    return [p.bankA, p.bankB, p.bankC].filter(Boolean)
  } catch {
    return []
  }
}
const DEFAULT_DESKS = resolveDesks()

// ── v2 wire helpers (global fetch — mockable in tests) ───────────────────────────
// Async because the OIDC bearer is acquired/refreshed on demand; on the dev path it
// resolves synchronously to the static HS256 token (behaviour byte-unchanged).
const authHeaders = async (): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await bearerToken()}`,
  'Content-Type': 'application/json',
})

let _cmdSeq = 0

interface CreatedEvent {
  contractId: string
  templateId: string
  createArgument: Record<string, any>
  packageName: string
  signatories: string[]
  observers: string[]
}

const entityOf = (templateId: string): string => templateId.split(':').pop() ?? ''

const ledgerEnd = async (): Promise<number> => {
  const res = await fetch(`${PARTICIPANT}/v2/state/ledger-end`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`ledger-end HTTP ${res.status}`)
  return (await (res.json() as Promise<{ offset: number }>)).offset
}

// Submit a command list as `actAs` and wait for completion. Throws a SECRET-FREE
// error on non-200 (the request body carries only parties/templates/args; the token
// lives in the Authorization header and is never echoed).
// `bearer` overrides the Authorization header for actions submitted as a DISTINCT party
// (IDEN-03: the compliance-authorized ApproveClearing). When omitted, the operator bearer
// (dual-mode: dev HMAC or OIDC) is used. The token lives only in the header, never echoed.
const submitAndWait = async (commands: unknown[], actAs: string[], bearer?: string): Promise<void> => {
  const headers = bearer
    ? { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }
    : await authHeaders()
  const res = await fetch(`${PARTICIPANT}/v2/commands/submit-and-wait`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ commandId: `umbra-solver-${Date.now()}-${_cmdSeq++}`, actAs, commands }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`submit HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
}

const createContract = (
  template: string,
  createArguments: Record<string, unknown>,
  actAs: string = operatorParty,
): Promise<void> =>
  submitAndWait([{ CreateCommand: { templateId: `${PKG}:${template}`, createArguments } }], [actAs])

const exerciseChoice = (
  template: string,
  contractId: string,
  choice: string,
  choiceArgument: Record<string, unknown>,
  actAs: string = operatorParty,
  bearer?: string,
): Promise<void> =>
  submitAndWait([{ ExerciseCommand: { templateId: `${PKG}:${template}`, contractId, choice, choiceArgument } }], [actAs], bearer)

// Read the Operator's active Umbra contracts of a given entity (e.g. 'Round').
// The Operator is a stakeholder of every Umbra contract it needs, so one party
// filter suffices; we client-filter to umbra + the requested entity.
const queryByEntity = async (entity: string): Promise<CreatedEvent[]> => {
  const activeAtOffset = await ledgerEnd()
  const res = await fetch(`${PARTICIPANT}/v2/state/active-contracts`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      filter: { filtersByParty: { [operatorParty]: {} } },
      verbose: true,
      activeAtOffset,
    }),
  })
  if (!res.ok) throw new Error(`active-contracts HTTP ${res.status}`)
  const arr = (await res.json()) as any[]
  return (Array.isArray(arr) ? arr : [])
    .map((e) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c: any): c is CreatedEvent => c && c.packageName === 'umbra' && entityOf(c.templateId) === entity)
}

// ── Round lifecycle: open ────────────────────────────────────────────────────────
// Create the Round (Open) + a RoundStats{0}. Int/Decimal go out as JSON numbers.
export const openRound = async (
  roundId: string,
  desks: string[],
  windowSeconds: number,
): Promise<{ roundId: string; status: RoundStatus }> => {
  const deskList = desks.length ? desks : DEFAULT_DESKS
  await createContract('Umbra.Auction:Round', {
    operator: operatorParty,
    roundId,
    symbol: BOND_SYMBOL,
    desks: deskList,
    openedAt: new Date().toISOString(),
    windowSeconds,
    status: 'Open',
  })
  await createContract('Umbra.Auction:RoundStats', {
    operator: operatorParty,
    roundId,
    desks: deskList,
    sealedOrderCount: 0,
  })
  return { roundId, status: 'Open' }
}

// A CreateEvent-like projection of the current Round contract (carries the cid for
// CloseRound/Clear; `.payload` mirrors the v1 shape the callers read).
export interface RoundContract {
  contractId: string
  payload: {
    roundId: string
    symbol: string
    desks: string[]
    openedAt: string
    windowSeconds: number
    status: RoundStatus
  }
}

// ── Query the CURRENT Round (never cache; CloseRound/Clear recreate it) ──────────
export const queryRound = async (roundId: string): Promise<RoundContract | null> => {
  const c = (await queryByEntity('Round')).find((r) => r.createArgument.roundId === roundId)
  if (!c) return null
  const a = c.createArgument
  return {
    contractId: c.contractId,
    payload: {
      roundId: a.roundId,
      symbol: a.symbol,
      desks: a.desks,
      openedAt: a.openedAt,
      windowSeconds: Number(a.windowSeconds),
      status: a.status as RoundStatus,
    },
  }
}

// ── Query ALL live Rounds (for boot rehydrate; ledger status is authoritative) ───
export const queryAllRounds = async (): Promise<
  { roundId: string; status: RoundStatus; windowSeconds: number; openedAt: string }[]
> =>
  (await queryByEntity('Round')).map((c) => ({
    roundId: c.createArgument.roundId,
    status: c.createArgument.status as RoundStatus,
    windowSeconds: Number(c.createArgument.windowSeconds),
    openedAt: c.createArgument.openedAt,
  }))

// ── Read ALL sealed orders for a round (Operator is a stakeholder of every Order) ─
export const readSealedOrders = async (
  roundId: string,
): Promise<{ contractId: string; view: OrderView }[]> =>
  (await queryByEntity('Order'))
    .filter((c) => c.createArgument.roundId === roundId && c.createArgument.status === 'Sealed')
    .map((c) => ({
      contractId: c.contractId,
      view: {
        desk: c.createArgument.desk,
        side: c.createArgument.side as Side,
        quantity: Number(c.createArgument.quantity),
        limit: Number(c.createArgument.limit),
        // AUCT-01 additive fields (inert until 09-02/09-03). orderType defaults to
        // 'Limit' when absent; minQty/firmIf decode from the Optional v2 wire
        // (null → undefined) and numeric fields arrive as strings → Number().
        orderType: (c.createArgument.orderType ?? 'Limit') as OrderType,
        minQty: c.createArgument.minQty != null ? Number(c.createArgument.minQty) : undefined,
        firmIf: c.createArgument.firmIf != null ? Number(c.createArgument.firmIf) : undefined,
      },
    }))

// ── Read ALL TradeConfirmations for a round (Operator is a stakeholder of each) ───
// AUCT-04: the appended TCA fields flow out here → api.ts settled body → the browser
// receipt + proof-pack. `ownLimit` is Optional (null → undefined for a noncompetitive
// order); numeric fields arrive as strings on the v2 wire → Number(). `surplusVsLimit`
// is the PROVEN, on-ledger ≥0 number; `improvementVsReferenceBp` is the SIGNED benchmark.
export const readTradeConfirmations = async (
  roundId: string,
): Promise<
  {
    desk: string
    side: Side
    filledQty: number
    clearingPrice: number
    ownLimit: number | null
    referencePrice: number
    surplusVsLimit: number
    improvementVsLimitBp: number
    improvementVsReferenceBp: number
  }[]
> =>
  (await queryByEntity('TradeConfirmation'))
    .filter((c) => c.createArgument.roundId === roundId)
    .map((c) => ({
      desk: c.createArgument.desk,
      side: c.createArgument.side as Side,
      filledQty: Number(c.createArgument.filledQty),
      clearingPrice: Number(c.createArgument.clearingPrice),
      ownLimit: c.createArgument.ownLimit != null ? Number(c.createArgument.ownLimit) : null,
      referencePrice: Number(c.createArgument.referencePrice),
      surplusVsLimit: Number(c.createArgument.surplusVsLimit),
      improvementVsLimitBp: Number(c.createArgument.improvementVsLimitBp),
      improvementVsReferenceBp: Number(c.createArgument.improvementVsReferenceBp),
    }))

// ── Find the CURRENT RoundStats contract for a round ─────────────────────────────
const queryStats = async (roundId: string): Promise<CreatedEvent | null> =>
  (await queryByEntity('RoundStats')).find((c) => c.createArgument.roundId === roundId) ?? null

// ── Maintain sealedOrderCount via archive+recreate (no update choice exists) ─────
export const updateStats = async (roundId: string, count: number): Promise<number> => {
  const current = await queryStats(roundId)
  if (!current) throw new Error(`no RoundStats for round ${roundId} (open the round first)`)
  await exerciseChoice('Umbra.Auction:RoundStats', current.contractId, 'Archive', {})
  await createContract('Umbra.Auction:RoundStats', {
    operator: operatorParty,
    roundId: current.createArgument.roundId,
    desks: current.createArgument.desks,
    sealedOrderCount: count,
  })
  return count
}

// ── refreshStats: recompute-and-write the live sealed-order count ────────────────
export const refreshStats = async (roundId: string): Promise<number> => {
  const count = (await readSealedOrders(roundId)).length
  const current = await queryStats(roundId)
  const recorded = current ? Number(current.createArgument.sealedOrderCount) : -1
  if (recorded !== count) {
    await updateStats(roundId, count)
  }
  return count
}

// ── Force-close a round (operator-only CloseRound) ───────────────────────────────
export const closeRound = async (roundId: string): Promise<RoundStatus> => {
  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)
  await exerciseChoice('Umbra.Auction:Round', round.contractId, 'CloseRound', {})
  const closed = await queryRound(roundId)
  return closed?.payload.status ?? 'Closed'
}

// ── IDEN-03 four-eyes: request → compliance-approve → collect the approval cid ─────
// The on-ledger `Round.Clear` REQUIRES a matching compliance-signed `ClearingApproval`
// (12-01). This mirrors how settle() gathers `orderCids`: the operator PROPOSES a
// `ClearingApprovalRequest` at the deterministically-recomputed §8 price; a DISTINCT
// Compliance party (a dedicated compliance token — NOT the operator) exercises
// `ApproveClearing` → the operator+compliance-signed `ClearingApproval` is born; the
// operator collects its ContractId to thread into `Round.Clear`.
//
// RUNTIME SEPARATION (12-02 HIGH-02): this is auto-approval by a DISTINCT compliance
// TOKEN, so the on-ledger DISTINCT-AUTHORITY four-eyes invariant (12-01) is satisfied at
// runtime — NOT a live human gate. A real, MFA'd human Compliance approver signing in the
// UI is the honest live-UAT step. If no distinct compliance identity is configured we
// REFUSE to mint an operator-held (self-signed) approval and fail loudly here, rather than
// submitting a Clear the on-ledger gate would abort. The dev fast-loop may opt in
// (UMBRA_ALLOW_OPERATOR_COMPLIANCE=1) against a permissive stub. The compliance token
// stays module-private.
const gatherApprovalCid = async (roundId: string, clearingPrice: number): Promise<string> => {
  // 0. HARD-FAIL on a non-distinct (operator-held) compliance identity unless the dev
  //    fast-loop explicitly opts in. Never settle with a self-signed approval.
  if (!_complianceDistinct && !ALLOW_OPERATOR_COMPLIANCE) {
    throw new Error(
      'Four-eyes settlement requires a DISTINCT compliance authority: configure ' +
        'scripts/.compliance-token or COMPLIANCE_PARTY + COMPLIANCE_TOKEN (a party ' +
        'distinct from the operator). The on-ledger gate aborts on operator ' +
        'self-approval; set UMBRA_ALLOW_OPERATOR_COMPLIANCE=1 ONLY for the local dev ' +
        'fast-loop against a permissive stub.',
    )
  }
  // 1. Operator PROPOSES the recomputed clearing to Compliance.
  await createContract('Umbra.Approval:ClearingApprovalRequest', {
    operator: operatorParty,
    compliance: _complianceParty,
    roundId,
    clearingPrice,
  })
  // 2. Compliance exercises ApproveClearing (distinct authority when configured) → the
  //    two-party-signed ClearingApproval. The compliance bearer overrides the operator
  //    header for THIS submission; falls back to the current operator bearer when no
  //    dedicated compliance token exists (operator-held dev compliance).
  const req = (await queryByEntity('ClearingApprovalRequest')).find(
    (c) =>
      c.createArgument.roundId === roundId &&
      // LOW-01: compare at 2dp (mirrors assertClearingApproved's roundBankers 2) rather
      // than exact float equality on a value that round-tripped through the JSON wire.
      Number(c.createArgument.clearingPrice).toFixed(2) === clearingPrice.toFixed(2),
  )
  if (!req) throw new Error(`no ClearingApprovalRequest to approve for round ${roundId}`)
  const approveBearer = _complianceToken || (await bearerToken())
  await exerciseChoice(
    'Umbra.Approval:ClearingApprovalRequest',
    req.contractId,
    'ApproveClearing',
    {},
    _complianceParty,
    approveBearer,
  )
  // 3. Operator collects the resulting ClearingApproval cid (matching round + price).
  const appr = (await queryByEntity('ClearingApproval')).find(
    (c) =>
      c.createArgument.roundId === roundId &&
      // LOW-01: 2dp compare (see above) — mirror the on-ledger 2dp gate.
      Number(c.createArgument.clearingPrice).toFixed(2) === clearingPrice.toFixed(2),
  )
  if (!appr) throw new Error(`no ClearingApproval collected for round ${roundId}`)
  return appr.contractId
}

// ── The token-agnostic, N-buyer Round.Clear settle sequence (DFIN-02/03) ──────────
// `Round.Clear` cannot query the ACS, so the solver gathers every ContractId the
// choice needs and passes them as additive Option-B args. The deterministic §8 output
// is submitted and re-verified on-ledger (verify-don't-trust) — NO skip path.
//
// DFIN-01/02/03 (11-05 wiring): the settlement legs now ride on `Holding` cids (the
// operator-custody successor to the retired `Asset`), the single-funded-buyer
// assumption is GONE (each buyer on the verified allocation funds its OWN cash leg,
// so N buyers × M sellers settle), and the instruments are token-agnostic
// `InstrumentId {issuer, id}` records (no hardcoded "USDCx"/"BONDX" on the wire —
// DFIN-03). The on-ledger `settleBatch` builds the gross DvP legs from the verified
// allocation and asserts per-instrument conservation.
//
// HOLDING-SELECTION SCOPE (documented MVP limitation): assumes one sufficient
// (owner, instrument) Holding per party (true for the §4 fixture + the 2×2 golden);
// a per-cid `used` set prevents double-assigning one Holding across legs. Throws a
// clean, secret-free `insufficient or missing <instrument> holding for <party>`
// otherwise (auto-merge of split holdings is stretch §19).
export const settle = async (
  roundId: string,
): Promise<{ result: { roundId: string; clearingPrice: number; totalMatched: number }; status: RoundStatus }> => {
  // 1. Sealed orders → orderCids + the OrderView[] for the math.
  const sealed = await readSealedOrders(roundId)
  const orderCids = sealed.map((o) => o.contractId)
  const views: OrderView[] = sealed.map((o) => o.view)

  // 2. Compute §8 locally — the SAME result the on-ledger Clear re-verifies.
  const { clearingPrice, allocations } = computeClearing(views)
  const matchedVolume = matchedAt(views, clearingPrice)

  // 3. Token-agnostic instruments (DFIN-03): the operator issues both §4 instruments,
  //    encoded as the InstrumentId {issuer, id} record shape (Pitfall 4).
  const cashInstrument = { issuer: operatorParty, id: CASH_SYMBOL }
  const bondInstrument = { issuer: operatorParty, id: BOND_SYMBOL }

  // 4. Gather live Holding cids (the retired Asset gather is gone). Each BUYER funds
  //    its OWN cash leg (filledQty × p*); each SELLER delivers its bond leg (filledQty).
  //    Tuples encode as { _1, _2 }; amounts arrive as strings → Number() (Pitfall 4).
  const holdings = await queryByEntity('Holding')
  const { buyerCashCids, sellerBondCids } = gatherHoldingCids(holdings, allocations, clearingPrice)
  if (buyerCashCids.length === 0) {
    throw new Error(`round ${roundId} has no Buy-side allocation (no cross)`)
  }

  // 5. IDEN-03 four-eyes: request + collect the compliance-signed ClearingApproval at the
  //    recomputed price (mirrors the orderCids gather). Round.Clear fetches + asserts it.
  const approvalCid = await gatherApprovalCid(roundId, clearingPrice)

  // 6. Re-query the CURRENT Round cid, then exercise the token-agnostic Clear. The
  //    on-ledger guard (status == Closed || Cleared) rejects a non-settleable round.
  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)
  // OPS-01: the ledger-API v2 exercise is a CLIENT span (ledger.* → SpanKind.CLIENT),
  // round.id-correlated — honestly labelled a client call, not an in-participant span.
  await withSpan('ledger.exercise.clear', roundId, () =>
    exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear', {
      clearingPrice,
      allocations: allocations.map((a) => ({ desk: a.desk, side: a.side, filledQty: a.filledQty })),
      orderCids,
      buyerCashCids,
      sellerBondCids,
      cashInstrument,
      bondInstrument,
      approvalCid, // IDEN-03 four-eyes credential (compliance-signed; Round.Clear fetches + asserts it)
      referencePrice: REFERENCE_PRICE_STUB, // AUCT-04 labeled benchmark stub (drives only the SIGNED vs-reference bp)
    }),
  )

  // 7. The Round was recreated as Settled. The verified result is reconstructed
  //    locally — the on-ledger Clear re-verified §8, so local == on-ledger.
  const settled = await queryRound(roundId)
  return {
    result: { roundId, clearingPrice, totalMatched: matchedVolume },
    status: settled?.payload.status ?? 'Settled',
  }
}

// ── Holding cid gather (Pitfall 4/5): N-buyer × M-seller, token-agnostic ──────────
// From the VERIFIED §8 allocation, locate one sufficient operator-custody `Holding`
// per participating desk: every BUYER's cash Holding (≥ filledQty × p*) and every
// SELLER's bond Holding (≥ filledQty). Match by (owner, instrument.id) + sufficient
// `amount` (v2 wire: amount is a zero-padded STRING → Number()). A `used` set stops
// one Holding being assigned to two legs. Tuples are the v2 { _1, _2 } shape. Throws
// a secret-free `insufficient or missing <instrument> holding for <party>` on a miss.
// This is the ONLY place both settle() and tamperClear() derive their cids from, but
// each calls it independently so settle() stays the canonical, un-perturbed path.
const gatherHoldingCids = (
  holdings: CreatedEvent[],
  allocations: { desk: string; side: Side; filledQty: number }[],
  clearingPrice: number,
): { buyerCashCids: { _1: string; _2: string }[]; sellerBondCids: { _1: string; _2: string }[] } => {
  const used = new Set<string>()
  const instrId = (c: CreatedEvent): string | undefined => c.createArgument.instrument?.id

  const buyerCashCids: { _1: string; _2: string }[] = []
  for (const a of allocations) {
    if (a.side !== 'Buy' || a.filledQty <= 0) continue
    const cashNeeded = a.filledQty * clearingPrice
    const cash = holdings.find(
      (c) =>
        !used.has(c.contractId) &&
        c.createArgument.owner === a.desk &&
        instrId(c) === CASH_SYMBOL &&
        Number(c.createArgument.amount) >= cashNeeded,
    )
    if (!cash) {
      throw new Error(`insufficient or missing ${CASH_SYMBOL} holding for ${a.desk} (need ${cashNeeded})`)
    }
    used.add(cash.contractId)
    buyerCashCids.push({ _1: a.desk, _2: cash.contractId })
  }

  const sellerBondCids: { _1: string; _2: string }[] = []
  for (const a of allocations) {
    if (a.side !== 'Sell' || a.filledQty <= 0) continue
    const bond = holdings.find(
      (c) =>
        !used.has(c.contractId) &&
        c.createArgument.owner === a.desk &&
        instrId(c) === BOND_SYMBOL &&
        Number(c.createArgument.amount) >= a.filledQty,
    )
    if (!bond) {
      throw new Error(`insufficient or missing ${BOND_SYMBOL} holding for ${a.desk} (need ${a.filledQty})`)
    }
    used.add(bond.contractId)
    sellerBondCids.push({ _1: a.desk, _2: bond.contractId })
  }

  return { buyerCashCids, sellerBondCids }
}

// ── WOW-02: tamperClear — the DEDICATED "break the AI" demo seam ──────────────────
// A demo-only path that gathers the EXACT SAME ContractIds as settle() but submits a
// deliberately WRONG proposal to the on-ledger `Round.Clear`. The choice's recompute-
// and-assert backstop (Auction.daml 183/187/192) rejects the whole atomic transaction;
// `submitAndWait` throws with the verbatim ledger body; tamperClear CATCHES it and
// resolves `{ rejected:true, error }` — it NEVER throws and NEVER settles (an atomic
// rejected Clear changes nothing on-ledger). The verbatim rejection is the credibility:
// it proves the LEDGER, not the AI, is the backstop.
//
// SAFETY (T-08-04-TAMPER, hard constraint): this is a SEPARATE function from settle()
// — settle() stays byte-unchanged. tamperClear only ever ATTEMPTS the exercise.
//
// PITFALL 3 (T-08-04-DECODE): perturb only numeric VALUES, never their wire TYPES.
// `badPrice = clearingPrice - 1` stays a valid Decimal and `filledQty + 2` a valid Int,
// so the §8 assert (not a decoder error) is what fires — the demo shows the real reason.
export const tamperClear = async (
  roundId: string,
  mode: 'wrong-price' | 'overfill',
): Promise<{ rejected: true; error: string }> => {
  // Gather the CORRECT §8 cids exactly as settle() does (Holdings, N-buyer,
  // token-agnostic instruments). The holdings are located from the CORRECT allocation;
  // ONLY the values SUBMITTED to Clear are perturbed below — settle() stays the
  // canonical settling path (this function never settles, it only ATTEMPTS a bad Clear).
  const sealed = await readSealedOrders(roundId)
  const orderCids = sealed.map((o) => o.contractId)
  const views: OrderView[] = sealed.map((o) => o.view)

  const { clearingPrice, allocations } = computeClearing(views)

  const cashInstrument = { issuer: operatorParty, id: CASH_SYMBOL }
  const bondInstrument = { issuer: operatorParty, id: BOND_SYMBOL }

  const holdings = await queryByEntity('Holding')
  const { buyerCashCids, sellerBondCids } = gatherHoldingCids(holdings, allocations, clearingPrice)
  if (buyerCashCids.length === 0) {
    throw new Error(`round ${roundId} has no Buy-side allocation (no cross)`)
  }

  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)

  // IDEN-03 / LOW-02: do NOT mint a real ClearingApproval for the tamper path. Round.Clear
  // runs the §8 recompute-and-assert BEFORE it fetches the four-eyes approval
  // (Auction.daml), so a tampered price/allocation is rejected before `approvalCid` is ever
  // dereferenced. Passing a placeholder keeps the demo's backstop (the §8 assert) exactly as
  // credible while avoiding a dangling ClearingApprovalRequest+ClearingApproval accumulating
  // on the round with every tamper run.
  const approvalCid = 'tamper-no-approval-needed-section8-rejects-first'

  // Perturb ONLY numeric values (Pitfall 3): a still-valid Decimal price one dollar off
  // (wrong-price) OR an over-filled Buy leg breaking the recomputed allocation +
  // conservation (overfill). Everything else is the exact settle() shape.
  const badPrice = mode === 'wrong-price' ? clearingPrice - 1 : clearingPrice
  const badAllocs =
    mode === 'overfill'
      ? allocations.map((a) => (a.side === 'Buy' ? { ...a, filledQty: a.filledQty + 2 } : a))
      : allocations

  try {
    await exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear', {
      clearingPrice: badPrice,
      allocations: badAllocs.map((a) => ({ desk: a.desk, side: a.side, filledQty: a.filledQty })),
      orderCids,
      buyerCashCids,
      sellerBondCids,
      cashInstrument,
      bondInstrument,
      approvalCid, // placeholder (LOW-02); the §8 backstop rejects the tampered values BEFORE this cid is fetched
      referencePrice: REFERENCE_PRICE_STUB, // additive arg; the tampered numeric values are still what the backstop rejects
    })
  } catch (e) {
    // The EXPECTED path: submitAndWait throws `submit HTTP <status>: <body>` — the body
    // carries the verbatim assertMsg and is already a secret-free ledger slice (the token
    // lives only in the Authorization header, never in the request body or the echoed
    // error). `rejected: true` is therefore truthful — the ledger genuinely rejected.
    return { rejected: true, error: e instanceof Error ? e.message : 'rejected' }
  }
  // Reached ONLY if the exercise RESOLVED — i.e. the on-ledger recompute-and-assert failed
  // to reject a tampered clear and the round just settled at a WRONG price / over-filled
  // allocation. Reporting `rejected: true` here (the old behavior) would mask the exact
  // backstop regression WOW-02 exists to detect. Throw loudly so `rejected` can NEVER be a
  // lie — the caller surfaces a real error instead of a fake "REJECTED" (WR-05).
  throw new Error('SAFETY REGRESSION: on-ledger Round.Clear ACCEPTED a tampered proposal')
}

// ── CRYP-01: commit-reveal operator-plane primitives (ADDITIVE) ───────────────────
// The browser drives commit/reveal on each desk's OWN plane; these are the OPERATOR-
// authority operations plus a public offset read. settle()/tamperClear() above are
// byte-UNCHANGED — the §4 clearing path is untouched. SECRETS: like every export in
// this module, none of these returns or logs the operator token (SOLV-04 discipline);
// only party-/contract-level ids and counts cross out.

// A privacy-safe projection of a still-live OrderCommitment (operator is a signatory
// of every one it needs). `commitment` is only the sha256 hash; the order contents do
// NOT exist on-ledger until a verified reveal, so nothing sensitive leaks here.
export interface OrderCommitmentView {
  contractId: string
  desk: string
  commitment: string
  bondCid: string
}

// ── Read the still-live OrderCommitments for a round ─────────────────────────────
// A commitment is "still live" simply by being an active OrderCommitment contract:
// a valid RevealOrder CONSUMES it (Auction.daml 196) and ForfeitBond CONSUMES it
// (Auction.daml 221), so anything the ACS still returns is un-revealed / un-forfeited.
export const readOrderCommitments = async (roundId: string): Promise<OrderCommitmentView[]> =>
  (await queryByEntity('OrderCommitment'))
    .filter((c) => c.createArgument.roundId === roundId)
    .map((c) => ({
      contractId: c.contractId,
      desk: c.createArgument.desk,
      commitment: c.createArgument.commitment,
      bondCid: c.createArgument.bondCid,
    }))

// ── Forfeit every non-revealer's bond for a round (operator authority) ───────────
// The deterrent against commit-then-vanish griefing (T-10-02): for each OrderCommitment
// still live for the round, exercise ForfeitBond (controller operator) to seize the
// locked bond into the operator pot. CONSUMING, so the desk can no longer reclaim.
// Resolves the COUNT forfeited (an id-free scalar). Snapshots the live set first so a
// consumed cid is never re-exercised.
export const forfeitNonRevealed = async (roundId: string): Promise<number> => {
  const live = await readOrderCommitments(roundId)
  for (const c of live) {
    await exerciseChoice('Umbra.Auction:OrderCommitment', c.contractId, 'ForfeitBond', {})
  }
  return live.length
}

// ── Anchor a proof/vkey hash on-ledger (operator-signed) ─────────────────────────
// CRYP-03: create a ProofAnchor recording ONLY the sha256(proof ‖ publicSignals) hash
// and the verification-key hash — no proof bytes / witness / order data ever land
// on-ledger (Auction.daml 226-240). Operator is the sole signatory, so no desk
// authority is needed. Returns nothing sensitive (void — success is the on-ledger create).
export const anchorProof = async (
  roundId: string,
  proofHash: string,
  vkeyHash: string,
): Promise<void> =>
  createContract('Umbra.Auction:ProofAnchor', {
    operator: operatorParty,
    roundId,
    proofHash,
    vkeyHash,
  })

// ── Public wrapper over the module-private ledgerEnd() ────────────────────────────
// VIZ-02 needs the current ledger offset to build its stage→offset map. `ledgerEnd`
// stays private (it uses the private auth header); this thin export returns only the
// numeric offset — no token, no headers.
export const currentOffset = (): Promise<number> => ledgerEnd()

// ════ PAY-01: x402 self-facilitator fee transfer — operator-custody, custodian-executed ════
// on the presented authorization; reuses Holding Split/Reassign (no new Daml). The `self`
// x402 facilitator backend (solver/src/facilitator.ts) settles a metered-access fee as a
// single operator-custody USDCx Holding move from the paying desk to the venue party. These
// two thin exports are the ONLY ledger surface it needs, REUSING the existing
// `queryByEntity('Holding')` scan + `exerciseChoice` Split/Reassign — introducing NO new Daml
// template/choice. This is the `OrderCommitment.ForfeitBond` "custodian Reassigns a desk
// Holding to the venue" pattern (Auction.daml:222), generalized from "seize" to "pay". The
// fee path is standalone: it NEVER calls settle()/tamperClear()/Round.Clear, so §8 stays the
// sole securities-DvP authority (T-14-10). Like every export here the operator token stays
// module-private — only party/contract ids + secret-free refs cross out (SOLV-04).

// A secret-free projection of an operator-custody Holding (the gatherHoldingCids predicate
// fields). `amount` is the v2 zero-padded Decimal STRING decoded via Number(); `locked`
// collapses the `lock : Optional Text` marker to a boolean (Some _ ⇒ true).
export interface HoldingRecord {
  contractId: string
  owner: string
  instrumentId: string
  amount: number
  locked: boolean
}

// ── listHoldings: the operator-visible active Holdings (the x402 verify fee-source scan) ──
// Reuses `queryByEntity('Holding')` (the same ACS scan settle() gathers cids from) and maps
// each CreatedEvent to the secret-free HoldingRecord shape. instrument.id → instrumentId,
// amount → Number(amount) (v2 string), lock != null → locked.
export const listHoldings = async (): Promise<HoldingRecord[]> =>
  (await queryByEntity('Holding')).map((c) => ({
    contractId: c.contractId,
    owner: c.createArgument.owner,
    instrumentId: c.createArgument.instrument?.id,
    amount: Number(c.createArgument.amount),
    locked: c.createArgument.lock != null,
  }))

// ── moveFee: move EXACTLY `qty` of the presented Holding to `newOwner` (the venue) ──
// Mirrors Holding.moveExactHolding (Holding.daml:109) in TS over the JSON Ledger API v2: a
// full-amount move is a single `Reassign`; a partial move `Split`s the slice first (strict
// on-ledger `<` guard) then `Reassign`s it — both under operator authority (actAs:
// [operatorParty], the module-private operator bearer). Because `exerciseChoice` resolves
// void, the Split slice is re-located by diffing the ACS (a new operator-owned USDCx Holding
// of exactly `qty`). After the reassign, re-query and confirm a `newOwner`-owned USDCx
// Holding ≥ qty now exists; return a secret-free settlement ref (the confirmed cid). Throws
// ONLY secret-free errors (never the token, never raw ledger text beyond the settle path).
export const moveFee = async (
  holdingCid: string,
  qty: number,
  newOwner: string,
): Promise<string> => {
  // Locate the presented Holding to choose full-Reassign vs Split+Reassign. Amounts marshal
  // as Decimal STRINGS on the v2 wire (Option-B). A missing/locked/insufficient cid throws a
  // clean, secret-free error (the cid is an already-public ledger id, never a secret).
  const before = await queryByEntity('Holding')
  const beforeCids = new Set(before.map((c) => c.contractId))
  const src = before.find((c) => c.contractId === holdingCid)
  if (!src) throw new Error('x402 fee: presented holding not found')
  if (src.createArgument.lock != null) throw new Error('x402 fee: presented holding is locked')
  const srcOwner = src.createArgument.owner as string
  const srcAmount = Number(src.createArgument.amount)
  if (!(srcAmount >= qty)) throw new Error('x402 fee: presented holding amount insufficient')

  if (srcAmount === qty) {
    // Full-amount move: a single operator-authority Reassign (the ForfeitBond precedent).
    await exerciseChoice('Umbra.Holding:Holding', holdingCid, 'Reassign', { newOwner })
  } else {
    // Partial move: Split off exactly `qty` (Decimal STRING, Option-B), then Reassign the
    // slice. The slice retains the ORIGINAL owner until the Reassign, so re-locate it as the
    // newly-created operator-owned USDCx Holding of exactly `qty` owned by the source owner.
    await exerciseChoice('Umbra.Holding:Holding', holdingCid, 'Split', { splitQty: String(qty) })
    const afterSplit = await queryByEntity('Holding')
    const slice = afterSplit.find(
      (c) =>
        !beforeCids.has(c.contractId) &&
        c.createArgument.owner === srcOwner &&
        c.createArgument.instrument?.id === CASH_SYMBOL &&
        Number(c.createArgument.amount) === qty,
    )
    if (!slice) throw new Error('x402 fee: split slice not found')
    await exerciseChoice('Umbra.Holding:Holding', slice.contractId, 'Reassign', { newOwner })
  }

  // Confirm receipt: a `newOwner`-owned, unlocked USDCx Holding ≥ qty now exists (the same
  // predicate shape verify uses). Return its cid as the secret-free settlement ref.
  const after = await listHoldings()
  const confirmed = after.find(
    (h) => h.owner === newOwner && h.instrumentId === CASH_SYMBOL && !h.locked && h.amount >= qty,
  )
  if (!confirmed) throw new Error('x402 fee: settlement confirmation failed')
  return `umbra-x402-${confirmed.contractId}`
}

// ════ ADJ-02: RFQ orchestration (post request → firm quote → list → accept→settle) ════
// Keyless exercise wrappers over the JSON Ledger API v2 for the ADJ-02 request-for-quote
// side-mode (Umbra.Rfq). They MIRROR the settle() discipline: address templates by
// package-NAME (`#umbra:Umbra.Rfq:…`), marshal Int/Decimal choice args as STRINGS, gather
// the source Holding ContractIds from a FRESH ACS query before the exercise, and pass cids
// explicitly (D7 Option-B). `acceptQuote` builds the 1×1 batch inputs the way settle()
// gathers its Holding cids, then exercises `AcceptQuote` which reuses the SAME on-ledger
// `settleBatch` DvP path. SECURITY: like every export here, none of these returns or logs
// the operator token — only party/contract ids + settlement scalars cross out (SOLV-04).
//
// AUTHORITY NOTE (dev orchestration): the solver submits with the required signatory/
// controller parties in `actAs` (e.g. [operator, requester]). Live, each desk would submit
// its own leg with its own scoped token; the solver-orchestrated multi-party actAs is the
// dev/LocalNet fast-loop path (the same "live per-party token is a UAT concern" posture as
// the four-eyes human gate). The token still lives only in the Authorization header.

// A privacy-safe projection of a firm Quote (the requester is the sole observer, so the
// operator sees only the quotes it co-signs — nothing sensitive to a rival dealer leaks).
export interface QuoteView {
  contractId: string
  dealer: string
  price: number
  quantity: number
}

// The secret-free settle summary AcceptQuote returns — scalars + party/contract ids only.
export interface RfqSettleSummary {
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

const bondInstrumentRef = (id: string = BOND_SYMBOL) => ({ issuer: operatorParty, id })
const cashInstrumentRef = (id: string = CASH_SYMBOL) => ({ issuer: operatorParty, id })

// ── postRfq: create an RfqRequest (the requester's public ask to an invited dealer set) ──
export const postRfq = async (
  requester: string,
  side: Side,
  quantity: number,
  dealers?: string[],
): Promise<{ rfqId: string; requester: string; side: Side; quantity: number }> => {
  const dealerList = (dealers && dealers.length ? dealers : DEFAULT_DESKS).filter((d) => d !== requester)
  const instrument = bondInstrumentRef()
  await submitAndWait(
    [
      {
        CreateCommand: {
          templateId: `${PKG}:Umbra.Rfq:RfqRequest`,
          createArguments: {
            operator: operatorParty,
            requester,
            dealers: dealerList,
            instrument,
            side,
            quantity: String(quantity), // Int marshaled as a string (Option-B)
          },
        },
      },
    ],
    [operatorParty, requester],
  )
  const rfq = (await queryByEntity('RfqRequest'))
    .filter(
      (c) =>
        c.createArgument.requester === requester &&
        c.createArgument.side === side &&
        Number(c.createArgument.quantity) === quantity,
    )
    .pop()
  if (!rfq) throw new Error(`RfqRequest not found after create for ${requester}`)
  return { rfqId: rfq.contractId, requester, side, quantity }
}

// ── createQuote: a dealer posts a FIRM (dealer-signed) Quote answering an RfqRequest ──
export const createQuote = async (
  dealer: string,
  requester: string,
  price: number,
  quantity: number,
): Promise<{ quoteCid: string; dealer: string; price: number; quantity: number }> => {
  const instrument = bondInstrumentRef()
  await submitAndWait(
    [
      {
        CreateCommand: {
          templateId: `${PKG}:Umbra.Rfq:Quote`,
          createArguments: {
            operator: operatorParty,
            dealer,
            requester,
            instrument,
            price: String(price), // Decimal marshaled as a string (Option-B)
            quantity: String(quantity), // Int marshaled as a string
          },
        },
      },
    ],
    [operatorParty, dealer],
  )
  const q = (await queryByEntity('Quote'))
    .filter(
      (c) =>
        c.createArgument.dealer === dealer &&
        c.createArgument.requester === requester &&
        Number(c.createArgument.price) === price &&
        Number(c.createArgument.quantity) === quantity,
    )
    .pop()
  if (!q) throw new Error(`Quote not found after create for ${dealer}`)
  return { quoteCid: q.contractId, dealer, price, quantity }
}

// ── listQuotes: the requester-visible firm quotes answering an RfqRequest ─────────────
export const listQuotes = async (rfqCid: string): Promise<QuoteView[]> => {
  const rfq = (await queryByEntity('RfqRequest')).find((c) => c.contractId === rfqCid)
  if (!rfq) throw new Error(`RfqRequest ${rfqCid} not found`)
  const requester = rfq.createArgument.requester
  const instrId = rfq.createArgument.instrument?.id
  // ME-02: `Quote` carries no back-reference to its `RfqRequest`, so a bare
  // requester+instrument filter would surface quotes from a DIFFERENT open RFQ of the same
  // requester for the same instrument (e.g. BUY 5 vs BUY 8). RfqPanel's bestQuoteIndex then
  // ranks across the mixed set and may highlight a quote whose quantity does not match the
  // RFQ being accepted (the on-ledger AcceptQuote asserts q.quantity == quantity, so the
  // accept fails cleanly — but the desk sees a wrong "BEST" and an avoidable rejection).
  // Scope quotes to THIS RFQ's terms by matching quantity as well.
  const rfqQuantity = Number(rfq.createArgument.quantity)
  return (await queryByEntity('Quote'))
    .filter(
      (c) =>
        c.createArgument.requester === requester &&
        c.createArgument.instrument?.id === instrId &&
        Number(c.createArgument.quantity) === rfqQuantity,
    )
    .map((c) => ({
      contractId: c.contractId,
      dealer: c.createArgument.dealer,
      price: Number(c.createArgument.price),
      quantity: Number(c.createArgument.quantity),
    }))
}

// ── acceptQuote: the requester accepts the (best) quote → 1×1 DvP settle via settleBatch ──
// Gathers the bond + cash source Holding cids from a FRESH ACS query (the way settle()
// gathers its Holding cids), then exercises `AcceptQuote` — which builds a 1×1 batch and
// calls the SAME on-ledger `settleBatch` DvP path. Direction follows the REQUESTER's side:
// Buy → dealer delivers bond, requester pays cash; Sell → requester delivers bond, dealer
// pays cash. Returns a secret-free settle summary (no token).
export const acceptQuote = async (rfqCid: string, quoteCid: string): Promise<RfqSettleSummary> => {
  const rfq = (await queryByEntity('RfqRequest')).find((c) => c.contractId === rfqCid)
  if (!rfq) throw new Error(`RfqRequest ${rfqCid} not found`)
  const quote = (await queryByEntity('Quote')).find((c) => c.contractId === quoteCid)
  if (!quote) throw new Error(`Quote ${quoteCid} not found`)

  const requester = rfq.createArgument.requester as string
  const side = rfq.createArgument.side as Side
  const quantity = Number(rfq.createArgument.quantity)
  const dealer = quote.createArgument.dealer as string
  const price = Number(quote.createArgument.price)
  const bondInstrument = bondInstrumentRef(rfq.createArgument.instrument?.id ?? BOND_SYMBOL)
  const cashInstrument = cashInstrumentRef()
  const cashAmount = quantity * price

  // Buy: dealer delivers bond, requester pays cash. Sell: requester delivers, dealer pays.
  const bondSender = side === 'Buy' ? dealer : requester
  const cashSender = side === 'Buy' ? requester : dealer

  // Re-query live Holdings before the exercise (Option-B) and locate one sufficient
  // (owner, instrument) source per leg — the same discipline as settle()'s gather.
  const holdings = await queryByEntity('Holding')
  const findHolding = (owner: string, instrId: string, need: number): CreatedEvent | undefined =>
    holdings.find(
      (c) =>
        c.createArgument.owner === owner &&
        c.createArgument.instrument?.id === instrId &&
        Number(c.createArgument.amount) >= need,
    )
  const bondSrc = findHolding(bondSender, bondInstrument.id, quantity)
  if (!bondSrc) {
    throw new Error(`insufficient or missing ${bondInstrument.id} holding for ${bondSender} (need ${quantity})`)
  }
  const cashSrc = findHolding(cashSender, cashInstrument.id, cashAmount)
  if (!cashSrc) {
    throw new Error(`insufficient or missing ${cashInstrument.id} holding for ${cashSender} (need ${cashAmount})`)
  }

  await submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: `${PKG}:Umbra.Rfq:RfqRequest`,
          contractId: rfqCid,
          choice: 'AcceptQuote',
          choiceArgument: {
            quoteCid, // branded ContractId → the string cid at the exercise site
            bondSourceCid: bondSrc.contractId,
            cashSourceCid: cashSrc.contractId,
            cashInstrument,
          },
        },
      },
    ],
    [operatorParty, requester],
  )
  return { rfqId: rfqCid, quoteCid, requester, dealer, side, quantity, price, cashAmount, settled: true }
}

// ════ ADJ-03: primary issuance orchestration (open → clear/mint, coupon, redeem) ════
// Keyless exercise wrappers over JSON Ledger API v2 for the ADJ-03 uniform-price primary
// issuance (Umbra.Issuance). `clearIssuance` recomputes the SAME §8 `computeClearing` the
// on-ledger `ClearIssuance` re-derives (verify-don't-trust: the choice re-clears + asserts
// the over-mint guard), gathers each winner's cash source Holding cid (Option-B, fresh ACS
// query, cash amount from the recomputed p*), and exercises the mint. `payCoupon` enumerates
// the current bond holders via an ACS `Holding` query (like `readSealedOrders`) and pays the
// deterministic pro-rata cash. Int/Decimal choice args marshal as STRINGS; the operator token
// stays module-private and never crosses out (SOLV-04). The issuance tranche uses a DISTINCT
// instrument id so the §4 "BONDX" bond is never perturbed (§4 still clears $100.00).

// A single sealed issuance bid (a desk's Buy of `quantity` units at `limit`).
export interface IssuanceBidInput {
  desk: string
  quantity: number
  limit: number
}

// ── openIssuance: create an IssuanceRound (issuer offers `trancheSize` at `reservePrice`) ──
export const openIssuance = async (
  issuer: string,
  bondInstrumentId: string,
  cashInstrumentId: string,
  trancheSize: number,
  reservePrice = 0,
  bids: IssuanceBidInput[] = [],
): Promise<{ issuanceId: string; issuer: string; bondInstrument: string; trancheSize: number }> => {
  const bondInstrument = bondInstrumentRef(bondInstrumentId)
  const cashInstrument = cashInstrumentRef(cashInstrumentId)
  await submitAndWait(
    [
      {
        CreateCommand: {
          templateId: `${PKG}:Umbra.Issuance:IssuanceRound`,
          createArguments: {
            operator: operatorParty,
            issuer,
            bondInstrument,
            cashInstrument,
            trancheSize: String(trancheSize), // Int as a string (Option-B)
            reservePrice: String(reservePrice), // Decimal as a string
            bids: bids.map((b) => ({ desk: b.desk, quantity: String(b.quantity), limit: String(b.limit) })),
            cleared: false,
            couponsPaid: [],
          },
        },
      },
    ],
    [operatorParty, issuer],
  )
  const round = (await queryByEntity('IssuanceRound'))
    .filter(
      (c) =>
        c.createArgument.issuer === issuer &&
        c.createArgument.bondInstrument?.id === bondInstrumentId &&
        c.createArgument.cleared === false,
    )
    .pop()
  if (!round) throw new Error(`IssuanceRound not found after open for ${issuer}`)
  return { issuanceId: round.contractId, issuer, bondInstrument: bondInstrumentId, trancheSize }
}

// ── clearIssuance: exercise ClearIssuance → the single uniform price + minted Holdings ──
// Recomputes §8 locally (the referee the on-ledger choice re-verifies) to determine the
// winners + the p* that prices each winner's cash leg, gathers each winner's cash source
// Holding cid (Option-B), then exercises the mint. Returns the single uniform price + the
// minted-holdings summary (secret-free).
export const clearIssuance = async (
  issuanceCid: string,
): Promise<{
  issuanceId: string
  clearingPrice: number
  totalIssued: number
  winners: { desk: string; filledQty: number }[]
}> => {
  const round = (await queryByEntity('IssuanceRound')).find((c) => c.contractId === issuanceCid)
  if (!round) throw new Error(`IssuanceRound ${issuanceCid} not found`)
  const a = round.createArgument
  const issuer = a.issuer as string
  const bondId = a.bondInstrument?.id as string
  const cashId = a.cashInstrument?.id as string
  const trancheSize = Number(a.trancheSize)
  const reservePrice = Number(a.reservePrice)
  const bids = ((a.bids ?? []) as Record<string, any>[]).map((b) => ({
    desk: b.desk as string,
    quantity: Number(b.quantity),
    limit: Number(b.limit),
  }))

  // The SAME §8 book the on-ledger ClearIssuance builds: issuer Sell of the whole tranche at
  // the reserve + each sealed bid as a plain-Limit Buy. computeClearing derives p* + fills.
  const book: OrderView[] = [
    { desk: issuer, side: 'Sell', quantity: trancheSize, limit: reservePrice },
    ...bids.map((b) => ({ desk: b.desk, side: 'Buy' as Side, quantity: b.quantity, limit: b.limit })),
  ]
  const { clearingPrice, allocations } = computeClearing(book)
  const winners = allocations
    .filter((al) => al.side === 'Buy' && al.filledQty > 0)
    .map((al) => ({ desk: al.desk, filledQty: al.filledQty }))
  const totalIssued = winners.reduce((s, w) => s + w.filledQty, 0)

  // Gather each winner's cash source Holding (owner=desk, cash instrument, ≥ filledQty × p*).
  const holdings = await queryByEntity('Holding')
  const used = new Set<string>()
  const winnerCashCids = winners.map((w) => {
    const need = w.filledQty * clearingPrice
    const cash = holdings.find(
      (c) =>
        !used.has(c.contractId) &&
        c.createArgument.owner === w.desk &&
        c.createArgument.instrument?.id === cashId &&
        Number(c.createArgument.amount) >= need,
    )
    if (!cash) throw new Error(`insufficient or missing ${cashId} holding for ${w.desk} (need ${need})`)
    used.add(cash.contractId)
    // Daml (Party, ContractId Holding) tuple → the v2 { _1, _2 } wire shape (Pitfall 4).
    return { _1: w.desk, _2: cash.contractId }
  })

  await submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: `${PKG}:Umbra.Issuance:IssuanceRound`,
          contractId: issuanceCid,
          choice: 'ClearIssuance',
          choiceArgument: { winnerCashCids },
        },
      },
    ],
    [operatorParty, issuer],
  )

  // ClearIssuance consumes + recreates the round `cleared = True`; re-query its lifecycle cid
  // for the subsequent Coupon/Redeem. Falls back to the original cid if the stub did not recreate.
  const cleared = (await queryByEntity('IssuanceRound'))
    .filter((c) => c.createArgument.issuer === issuer && c.createArgument.bondInstrument?.id === bondId && c.createArgument.cleared === true)
    .pop()
  return { issuanceId: cleared?.contractId ?? issuanceCid, clearingPrice, totalIssued, winners }
}

// ── payCoupon: pay the deterministic pro-rata coupon to the CURRENT bond holders ─────
// Enumerates the live bond `Holding`s for the tranche via an ACS query (the `readSealedOrders`
// pattern), computes the pro-rata cash (each holder receives `amount × couponPerUnit`), and
// exercises `Coupon` through the same atomic settleBatch DvP path. Int/Decimal args as strings.
export const payCoupon = async (
  issuanceCid: string,
  period: number,
  couponPerUnit: number,
): Promise<{ issuanceId: string; period: number; couponPerUnit: number; holders: number; totalPaid: number }> => {
  const round = (await queryByEntity('IssuanceRound')).find((c) => c.contractId === issuanceCid)
  if (!round) throw new Error(`IssuanceRound ${issuanceCid} not found`)
  const a = round.createArgument
  const issuer = a.issuer as string
  const bondId = a.bondInstrument?.id as string
  const cashId = a.cashInstrument?.id as string

  // Enumerate the CURRENT bond holders (ACS Holding query, like readSealedOrders).
  const holdings = await queryByEntity('Holding')
  const holderCids = holdings.filter(
    (c) => c.createArgument.instrument?.id === bondId && c.createArgument.operator === operatorParty,
  )
  const totalPaid = holderCids.reduce((s, c) => s + Number(c.createArgument.amount) * couponPerUnit, 0)
  // The issuer's cash source (≥ the total coupon due).
  const issuerCash = holdings.find(
    (c) =>
      c.createArgument.owner === issuer &&
      c.createArgument.instrument?.id === cashId &&
      Number(c.createArgument.amount) >= totalPaid,
  )
  if (!issuerCash) throw new Error(`insufficient or missing ${cashId} holding for issuer ${issuer} (need ${totalPaid})`)

  await submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: `${PKG}:Umbra.Issuance:IssuanceRound`,
          contractId: issuanceCid,
          choice: 'Coupon',
          choiceArgument: {
            period: String(period), // Int as a string
            couponPerUnit: String(couponPerUnit), // Decimal as a string
            holderBondCids: holderCids.map((c) => c.contractId),
            issuerCashCid: issuerCash.contractId,
          },
        },
      },
    ],
    [operatorParty, issuer],
  )
  return { issuanceId: issuanceCid, period, couponPerUnit, holders: holderCids.length, totalPaid }
}

// ── redeem: repay principal pro-rata at maturity and retire the bond Holdings ─────────
export const redeem = async (
  issuanceCid: string,
  principalPerUnit: number,
): Promise<{ issuanceId: string; principalPerUnit: number; holders: number; totalRepaid: number }> => {
  const round = (await queryByEntity('IssuanceRound')).find((c) => c.contractId === issuanceCid)
  if (!round) throw new Error(`IssuanceRound ${issuanceCid} not found`)
  const a = round.createArgument
  const issuer = a.issuer as string
  const bondId = a.bondInstrument?.id as string
  const cashId = a.cashInstrument?.id as string

  const holdings = await queryByEntity('Holding')
  const holderCids = holdings.filter(
    (c) => c.createArgument.instrument?.id === bondId && c.createArgument.operator === operatorParty,
  )
  const totalRepaid = holderCids.reduce((s, c) => s + Number(c.createArgument.amount) * principalPerUnit, 0)
  const issuerCash = holdings.find(
    (c) =>
      c.createArgument.owner === issuer &&
      c.createArgument.instrument?.id === cashId &&
      Number(c.createArgument.amount) >= totalRepaid,
  )
  if (!issuerCash) throw new Error(`insufficient or missing ${cashId} holding for issuer ${issuer} (need ${totalRepaid})`)

  await submitAndWait(
    [
      {
        ExerciseCommand: {
          templateId: `${PKG}:Umbra.Issuance:IssuanceRound`,
          contractId: issuanceCid,
          choice: 'Redeem',
          choiceArgument: {
            principalPerUnit: String(principalPerUnit), // Decimal as a string
            holderBondCids: holderCids.map((c) => c.contractId),
            issuerCashCid: issuerCash.contractId,
          },
        },
      },
    ],
    [operatorParty, issuer],
  )
  return { issuanceId: issuanceCid, principalPerUnit, holders: holderCids.length, totalRepaid }
}
