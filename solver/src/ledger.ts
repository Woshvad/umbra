// solver/src/ledger.ts — the Operator-authority @daml/ledger@2.10.4 client.
//
// This is the ONLY component (besides the Daml Script tests) able to drive the
// round lifecycle on-ledger: open a Round + RoundStats, read every desk's sealed
// Order (the Operator is a stakeholder of every Order, so it sees them all),
// maintain `sealedOrderCount` (archive+recreate via `updateStats`, recompute-and-
// write via `refreshStats`), force-close, and run the Option-B `Round.Clear`
// settle sequence.
//
// SECURITY (SOLV-04 / threat T-04-04): the Operator JWT is held STRICTLY module-
// private. It is read from `scripts/.operator-token` (gitignored) — or minted as a
// fallback from `daml/parties.json` + the empty dev secret — and is NEVER returned
// by any exported function, never spread into a response object, and never logged.
// Only party-level / contract-level data crosses out of this module.
//
// VERIFY-DON'T-TRUST (T-04-05): `settle` submits ONLY the deterministic §8
// `computeClearing` output; `Round.Clear` re-verifies §8 on-ledger and rejects any
// mismatch. There is NO skip-verification fast path.

import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
// @daml/ledger is CJS and exposes the Ledger class as BOTH `default` and a named
// `Ledger` export. Under tsx/esbuild ESM↔CJS interop a DEFAULT import binds to the
// namespace object (not the class) → `new Ledger()` throws "Ledger is not a
// constructor". Use the NAMED import (the recorded 04-01 decision) — it resolves to
// the class. (This module-scope `new Ledger()` is only exercised on a real boot, so
// the DI-stubbed unit tests never caught it; the live E2E did.)
import { Ledger } from '@daml/ledger'
import type { CreateEvent } from '@daml/ledger'
import { ContractId } from '@daml/types'
import { Round, RoundStats, Order, RoundStatus, ClearResult, TradeConfirmation } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'
import { computeClearing, matchedAt, OrderView } from './auction.js'

const BOND_SYMBOL = 'BONDX'
const CASH_SYMBOL = 'USDCx'

// ── Operator credential resolution (Pitfall 7: no __dirname under ESM) ──────────
// Prefer scripts/.operator-token (minted by scripts/mint-tokens.mjs, gitignored).
// If absent, fall back to minting the Operator JWT from daml/parties.json + the
// empty dev secret with zero-dep node:crypto — the EXACT claim shape mint-tokens.mjs
// uses (HS256 over '' under `daml start --allow-insecure-tokens`, D5).
const LEDGER_ID = process.env.DAML_LEDGER_ID ?? 'sandbox'
const APP_ID = 'umbra'
const DEV_SECRET = ''

const b64url = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')

const mintToken = (party: string): string => {
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const payload = b64url({
    'https://daml.com/ledger-api': {
      ledgerId: LEDGER_ID,
      applicationId: APP_ID,
      actAs: [party],
      readAs: [party],
    },
  })
  const sig = createHmac('sha256', DEV_SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

const resolveOperatorCredential = (): { token: string; party: string } => {
  // 1. The minted token file (CLI/service-only; gitignored).
  try {
    const raw = readFileSync(new URL('../../scripts/.operator-token', import.meta.url), 'utf8')
    const { token, party } = JSON.parse(raw) as { token: string; party: string }
    if (token && party) return { token, party }
  } catch {
    // fall through to the mint path
  }
  // 2. Fallback-mint from parties.json (read fresh; never hard-code per-boot IDs, D4).
  for (const rel of ['../../daml/parties.json', '../../parties.json']) {
    try {
      const raw = readFileSync(new URL(rel, import.meta.url), 'utf8')
      const parties = JSON.parse(raw) as Record<string, string>
      if (parties.operator) return { token: mintToken(parties.operator), party: parties.operator }
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    'No Operator credential: scripts/.operator-token absent and daml/parties.json not found. ' +
      'Run `daml start` then `node scripts/mint-tokens.mjs`.',
  )
}

// Module-private credential. `_operatorToken` NEVER leaves this module.
const { token: _operatorToken, party: _operatorParty } = resolveOperatorCredential()

// Exported: the Operator PARTY string only (safe to surface; it is a public id).
// The token is intentionally NOT exported and NOT part of any return value.
export const operatorParty: string = _operatorParty

// ── JSON API base URL normalization ─────────────────────────────────────────────
// @daml/ledger's Ledger REQUIRES httpBaseUrl to END WITH '/' and throws
// "httpBaseUrl must end with '/'." otherwise — a slash-less JSON_API_URL (e.g. from a
// copied .env / .env.example) would crash the boot. Append the slash if missing so
// EITHER form works. (The solver has no Vite proxy, so the same-origin '/' the browser
// uses is invalid here — an absolute http://…/ URL is required; Pitfall 2.)
export const withTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`)

const ledger = new Ledger({
  token: _operatorToken,
  httpBaseUrl: withTrailingSlash(process.env.JSON_API_URL ?? 'http://localhost:7575/'),
})

// ── Round lifecycle: open ───────────────────────────────────────────────────────
// Neither Round nor RoundStats has an operator "open"/"update" choice (Auction.daml
// 123-134 / 100-109; Operator is sole signatory) — create them directly. Int/Decimal
// cross the wire as STRINGS (Pitfall 5): windowSeconds and sealedOrderCount are Int.
export const openRound = async (
  roundId: string,
  desks: string[],
  windowSeconds: number,
): Promise<{ roundId: string; status: RoundStatus }> => {
  const round = await ledger.create(Round, {
    operator: operatorParty,
    roundId,
    symbol: BOND_SYMBOL,
    desks,
    openedAt: new Date().toISOString(),
    windowSeconds: String(windowSeconds),
    status: 'Open',
  })
  await ledger.create(RoundStats, {
    operator: operatorParty,
    roundId,
    desks,
    sealedOrderCount: '0',
  })
  return { roundId, status: round.payload.status }
}

// ── Query the CURRENT Round contract (never cache; CloseRound/Clear recreate it) ─
// Callers MUST call this fresh before every exercise (Pitfall 4).
export const queryRound = async (roundId: string): Promise<CreateEvent<Round> | null> => {
  const rounds = await ledger.query(Round)
  return rounds.find((c) => c.payload.roundId === roundId) ?? null
}

// ── Query ALL live Rounds (for boot rehydrate; the ledger status is authoritative) ─
// Returns a flat, secret-free view of every Round contract the Operator can see so
// index.ts can seed the in-memory clock on boot (Plan 04-04). windowSeconds crosses
// the wire as a STRING (Int, Pitfall 5) → coerced to number here.
export const queryAllRounds = async (): Promise<
  { roundId: string; status: RoundStatus; windowSeconds: number; openedAt: string }[]
> => {
  const rounds = await ledger.query(Round)
  return rounds.map((c) => ({
    roundId: c.payload.roundId,
    status: c.payload.status,
    windowSeconds: Number(c.payload.windowSeconds),
    openedAt: c.payload.openedAt,
  }))
}

// ── Read ALL sealed orders for a round (Operator is a stakeholder of every Order) ─
// Returns the live ContractId alongside an OrderView (quantity/limit coerced to
// number for the pure §8 math). Filters to this round's Sealed orders only.
export const readSealedOrders = async (
  roundId: string,
): Promise<{ contractId: string; view: OrderView }[]> => {
  const orders = await ledger.query(Order)
  return orders
    .filter((c) => c.payload.roundId === roundId && c.payload.status === 'Sealed')
    .map((c) => ({
      contractId: c.contractId,
      view: {
        desk: c.payload.desk,
        side: c.payload.side as Side,
        quantity: Number(c.payload.quantity),
        limit: Number(c.payload.limit),
      },
    }))
}

// ── Read ALL TradeConfirmations for a round (Operator is a stakeholder of each) ───
// After settle, Round.Clear RETIRES the sealed Orders, so the settled result is
// reconstructed from these per-desk fill receipts (ledger truth, survives a restart).
// Int/Decimal cross the wire as STRINGS (Pitfall 5) → coerce to number.
export const readTradeConfirmations = async (
  roundId: string,
): Promise<{ desk: string; side: Side; filledQty: number; clearingPrice: number }[]> => {
  const confs = await ledger.query(TradeConfirmation)
  return confs
    .filter((c) => c.payload.roundId === roundId)
    .map((c) => ({
      desk: c.payload.desk,
      side: c.payload.side as Side,
      filledQty: Number(c.payload.filledQty),
      clearingPrice: Number(c.payload.clearingPrice),
    }))
}

// ── Find the CURRENT RoundStats contract for a round ────────────────────────────
const queryStats = async (roundId: string): Promise<CreateEvent<RoundStats> | null> => {
  const stats = await ledger.query(RoundStats)
  return stats.find((c) => c.payload.roundId === roundId) ?? null
}

// ── Maintain sealedOrderCount via archive+recreate (no update choice exists) ────
// `count` is passed as a STRING on the wire (Int, Pitfall 5).
export const updateStats = async (roundId: string, count: number): Promise<number> => {
  const current = await queryStats(roundId)
  if (!current) throw new Error(`no RoundStats for round ${roundId} (open the round first)`)
  await ledger.archive(RoundStats, current.contractId)
  await ledger.create(RoundStats, {
    operator: current.payload.operator,
    roundId: current.payload.roundId,
    desks: current.payload.desks,
    sealedOrderCount: String(count),
  })
  return count
}

// ── refreshStats: recompute-and-write — the live call site for updateStats ──────
// (The BLOCKER fix: an exported-but-never-invoked `updateStats` does NOT satisfy
// SOLV-01's "maintains sealedOrderCount".) Recompute the count from the live sealed
// orders; if it differs from the current RoundStats, write it back via updateStats.
// This is what the API (GET /round/:id, Plan 04-03) and the clock/poll (Plan 04-04)
// invoke so a freshly-opened round's count ADVANCES off 0 as sealed orders appear.
export const refreshStats = async (roundId: string): Promise<number> => {
  const count = (await readSealedOrders(roundId)).length
  const current = await queryStats(roundId)
  const recorded = current ? Number(current.payload.sealedOrderCount) : -1
  if (recorded !== count) {
    await updateStats(roundId, count)
  }
  return count
}

// ── Force-close a round (operator-only CloseRound) ──────────────────────────────
// Re-query the CURRENT Round cid first (Pitfall 4: CloseRound returns a NEW cid;
// never reuse a cached one). Returns the new round status (Closed).
export const closeRound = async (roundId: string): Promise<RoundStatus> => {
  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)
  await ledger.exercise(Round.CloseRound, round.contractId, {})
  const closed = await queryRound(roundId)
  return closed?.payload.status ?? 'Closed'
}

// ── The Option-B Round.Clear settle sequence (Pattern 2 / Auction.daml 151-158) ─
// `Round.Clear` cannot query the ACS (D7), so the solver gathers every ContractId
// the choice needs and passes them as additive args. The deterministic §8
// `computeClearing` output is submitted and re-verified on-ledger (verify-don't-
// trust, T-04-05) — there is NO skip-verification path.
//
// ASSET-SELECTION SCOPE (RESEARCH Assumption A2, documented P4 limitation, T-04-12):
// `settle` assumes a single (owner, symbol) holding with sufficient quantity — true
// for the §4 fixture (BankA 5000 USDCx, BankB 20 BONDX, BankC 15 BONDX). It does NOT
// merge split holdings (Asset.Merge before settle is stretch). When no single holding
// satisfies the sufficiency predicate — which can happen for a FRESH POST /round
// round with unconstrained holdings — it throws a clean, secret-free
// `insufficient or missing <symbol> holding for <party>` error rather than passing an
// undefined cid into Clear.
export const settle = async (
  roundId: string,
): Promise<{ result: ClearResult; status: RoundStatus }> => {
  // 1. Read the round's sealed orders → orderCids + the OrderView[] for the math.
  const sealed = await readSealedOrders(roundId)
  const orderCids = sealed.map((o) => o.contractId as ContractId<Order>)
  const views: OrderView[] = sealed.map((o) => o.view)

  // 2. Compute §8 locally — the SAME result the on-ledger Clear re-verifies.
  const { clearingPrice, allocations } = computeClearing(views)
  const matchedVolume = matchedAt(views, clearingPrice)

  // 3. The buyer is the single desk on the Buy side of the verified allocation.
  const buyAlloc = allocations.find((a) => a.side === 'Buy')
  if (!buyAlloc) throw new Error(`round ${roundId} has no Buy-side allocation (no cross)`)
  const buyer = buyAlloc.desk

  // 4. The buyer's USDCx holding sufficient for the cash leg (matchedVolume × price).
  const assets = await ledger.query(Asset)
  const cashNeeded = matchedVolume * clearingPrice
  const buyerUsdc = assets.find(
    (c) =>
      c.payload.owner === buyer &&
      c.payload.symbol === CASH_SYMBOL &&
      Number(c.payload.quantity) >= cashNeeded,
  )
  if (!buyerUsdc) {
    throw new Error(
      `insufficient or missing ${CASH_SYMBOL} holding for ${buyer} (need ${cashNeeded})`,
    )
  }
  const buyerUsdcCid = buyerUsdc.contractId

  // 5. Each seller's BONDX holding sufficient for its filledQty.
  //    sellerBondCids crosses the wire as DA.Types.Tuple2 → { _1: party, _2: cid }.
  const sellerBondCids: { _1: string; _2: ContractId<Asset> }[] = []
  for (const a of allocations) {
    if (a.side !== 'Sell' || a.filledQty <= 0) continue
    const bond = assets.find(
      (c) =>
        c.payload.owner === a.desk &&
        c.payload.symbol === BOND_SYMBOL &&
        Number(c.payload.quantity) >= a.filledQty,
    )
    if (!bond) {
      throw new Error(
        `insufficient or missing ${BOND_SYMBOL} holding for ${a.desk} (need ${a.filledQty})`,
      )
    }
    sellerBondCids.push({ _1: a.desk, _2: bond.contractId as ContractId<Asset> })
  }

  // 6. Re-query the CURRENT Round cid (CloseRound recreated it; Pitfall 4), then
  //    exercise Clear with all Int/Decimal as STRINGS (Pitfall 5). The on-ledger
  //    guard (status == Closed || Cleared) rejects a non-settleable round.
  const round = await queryRound(roundId)
  if (!round) throw new Error(`round ${roundId} not found`)
  const [result] = await ledger.exercise(Round.Clear, round.contractId, {
    clearingPrice: String(clearingPrice),
    allocations: allocations.map((a) => ({
      desk: a.desk,
      side: a.side as Side,
      filledQty: String(a.filledQty),
    })),
    orderCids,
    buyerUsdcCid,
    sellerBondCids,
  })

  // 7. The Round was recreated as Settled — return the verified result + new status.
  const settled = await queryRound(roundId)
  return { result: result as ClearResult, status: settled?.payload.status ?? 'Settled' }
}
