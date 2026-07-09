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

// ── Operator credential resolution (module-private) ──────────────────────────────
const resolveOperator = (): { token: string; party: string } => {
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

const { token: _operatorToken, party: _operatorParty } = resolveOperator()

// Exported: the Operator PARTY string only (a public id). The token is intentionally
// NOT exported and NOT part of any return value.
export const operatorParty: string = _operatorParty

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
const authHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${_operatorToken}`,
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
  const res = await fetch(`${PARTICIPANT}/v2/state/ledger-end`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`ledger-end HTTP ${res.status}`)
  return (await (res.json() as Promise<{ offset: number }>)).offset
}

// Submit a command list as `actAs` and wait for completion. Throws a SECRET-FREE
// error on non-200 (the request body carries only parties/templates/args; the token
// lives in the Authorization header and is never echoed).
const submitAndWait = async (commands: unknown[], actAs: string[]): Promise<void> => {
  const res = await fetch(`${PARTICIPANT}/v2/commands/submit-and-wait`, {
    method: 'POST',
    headers: authHeaders(),
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
): Promise<void> =>
  submitAndWait([{ ExerciseCommand: { templateId: `${PKG}:${template}`, contractId, choice, choiceArgument } }], [actAs])

// Read the Operator's active Umbra contracts of a given entity (e.g. 'Round').
// The Operator is a stakeholder of every Umbra contract it needs, so one party
// filter suffices; we client-filter to umbra + the requested entity.
const queryByEntity = async (entity: string): Promise<CreatedEvent[]> => {
  const activeAtOffset = await ledgerEnd()
  const res = await fetch(`${PARTICIPANT}/v2/state/active-contracts`, {
    method: 'POST',
    headers: authHeaders(),
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

// ── The Option-B Round.Clear settle sequence ─────────────────────────────────────
// `Round.Clear` cannot query the ACS, so the solver gathers every ContractId the
// choice needs and passes them as additive args. The deterministic §8 output is
// submitted and re-verified on-ledger (verify-don't-trust) — NO skip path.
//
// ASSET-SELECTION SCOPE (documented MVP limitation): assumes a single (owner,symbol)
// holding with sufficient quantity (true for the §4 fixture). Throws a clean,
// secret-free `insufficient or missing <symbol> holding for <party>` otherwise.
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

  // 3. The buyer is the single desk on the Buy side of the verified allocation.
  const buyAlloc = allocations.find((a) => a.side === 'Buy')
  if (!buyAlloc) throw new Error(`round ${roundId} has no Buy-side allocation (no cross)`)
  const buyer = buyAlloc.desk

  // 4. Holdings: the buyer's USDCx (≥ matchedVolume×price) + each seller's BONDX.
  const assets = await queryByEntity('Asset')
  const cashNeeded = matchedVolume * clearingPrice
  const buyerUsdc = assets.find(
    (c) =>
      c.createArgument.owner === buyer &&
      c.createArgument.symbol === CASH_SYMBOL &&
      Number(c.createArgument.quantity) >= cashNeeded,
  )
  if (!buyerUsdc) {
    throw new Error(`insufficient or missing ${CASH_SYMBOL} holding for ${buyer} (need ${cashNeeded})`)
  }
  const buyerUsdcCid = buyerUsdc.contractId

  // 5. Each seller's BONDX holding sufficient for its filledQty (tuple → { _1, _2 }).
  const sellerBondCids: { _1: string; _2: string }[] = []
  for (const a of allocations) {
    if (a.side !== 'Sell' || a.filledQty <= 0) continue
    const bond = assets.find(
      (c) =>
        c.createArgument.owner === a.desk &&
        c.createArgument.symbol === BOND_SYMBOL &&
        Number(c.createArgument.quantity) >= a.filledQty,
    )
    if (!bond) {
      throw new Error(`insufficient or missing ${BOND_SYMBOL} holding for ${a.desk} (need ${a.filledQty})`)
    }
    sellerBondCids.push({ _1: a.desk, _2: bond.contractId })
  }

  // 6. Re-query the CURRENT Round cid, then exercise Clear. The on-ledger guard
  //    (status == Closed || Cleared) rejects a non-settleable round.
  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)
  await exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear', {
    clearingPrice,
    allocations: allocations.map((a) => ({ desk: a.desk, side: a.side, filledQty: a.filledQty })),
    orderCids,
    buyerUsdcCid,
    sellerBondCids,
    referencePrice: REFERENCE_PRICE_STUB, // AUCT-04 labeled benchmark stub (drives only the SIGNED vs-reference bp)
  })

  // 7. The Round was recreated as Settled. The verified result is reconstructed
  //    locally — the on-ledger Clear re-verified §8, so local == on-ledger.
  const settled = await queryRound(roundId)
  return {
    result: { roundId, clearingPrice, totalMatched: matchedVolume },
    status: settled?.payload.status ?? 'Settled',
  }
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
  // Gather EXACTLY as settle() does (steps 1-6) — copied, not refactored, so settle()
  // stays byte-unchanged. The holdings are located from the CORRECT §8 allocation; only
  // the values SUBMITTED to Clear are perturbed below.
  const sealed = await readSealedOrders(roundId)
  const orderCids = sealed.map((o) => o.contractId)
  const views: OrderView[] = sealed.map((o) => o.view)

  const { clearingPrice, allocations } = computeClearing(views)
  const matchedVolume = matchedAt(views, clearingPrice)

  const buyAlloc = allocations.find((a) => a.side === 'Buy')
  if (!buyAlloc) throw new Error(`round ${roundId} has no Buy-side allocation (no cross)`)
  const buyer = buyAlloc.desk

  const assets = await queryByEntity('Asset')
  const cashNeeded = matchedVolume * clearingPrice
  const buyerUsdc = assets.find(
    (c) =>
      c.createArgument.owner === buyer &&
      c.createArgument.symbol === CASH_SYMBOL &&
      Number(c.createArgument.quantity) >= cashNeeded,
  )
  if (!buyerUsdc) {
    throw new Error(`insufficient or missing ${CASH_SYMBOL} holding for ${buyer} (need ${cashNeeded})`)
  }
  const buyerUsdcCid = buyerUsdc.contractId

  const sellerBondCids: { _1: string; _2: string }[] = []
  for (const a of allocations) {
    if (a.side !== 'Sell' || a.filledQty <= 0) continue
    const bond = assets.find(
      (c) =>
        c.createArgument.owner === a.desk &&
        c.createArgument.symbol === BOND_SYMBOL &&
        Number(c.createArgument.quantity) >= a.filledQty,
    )
    if (!bond) {
      throw new Error(`insufficient or missing ${BOND_SYMBOL} holding for ${a.desk} (need ${a.filledQty})`)
    }
    sellerBondCids.push({ _1: a.desk, _2: bond.contractId })
  }

  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)

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
      buyerUsdcCid,
      sellerBondCids,
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
