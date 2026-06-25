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
import Ledger, { CreateEvent } from '@daml/ledger'
import { Round, RoundStats, Order, RoundStatus } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'
import { OrderView } from './auction.js'

const BOND_SYMBOL = 'BONDX'

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

// ── One Ledger, absolute base URL (Pitfall 2: bare '/' / scheme-less throws) ────
// The solver has no Vite proxy, so the same-origin '/' the browser uses is invalid
// here. Use an absolute http://…/ URL with a trailing slash.
const ledger = new Ledger({
  token: _operatorToken,
  httpBaseUrl: process.env.JSON_API_URL ?? 'http://localhost:7575/',
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
