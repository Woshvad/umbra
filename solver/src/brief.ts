// solver/src/brief.ts — WOW-04 post-round shareable brief (pure, server-side).
//
// composeBrief renders a 2–4 sentence natural-language summary of a SETTLED round:
// the uniform clearing price, the matched volume, the per-desk aggregate fills, and
// the (already-verified) rationale. It is a PURE transform over numbers the round has
// already produced — it NEVER recomputes or alters the clearing (the §4 fixture stays
// $100.00) and is SECRET-FREE (no key/token/prompt; it only receives numbers + the
// rationale text). Mirrors the settled-rationale string builder in api.ts and the
// neutralRationale wording in agent.ts.

import type { Allocation } from './auction.js'

// A stable, human phrasing of one desk's aggregate fill (e.g. "BankA bought 10").
const verb = (side: Allocation['side']): string => (side === 'Buy' ? 'bought' : 'sold')

// Compose the brief. `rationale` is the round's verified narration (from the agent, or
// a deterministic neutral string on the fallback path) — passed in, never generated
// here, so composeBrief cannot drift the clearing numbers.
export const composeBrief = (
  clearingPrice: number,
  matchedVolume: number,
  allocations: Allocation[],
  rationale: string,
): string => {
  const price = clearingPrice.toFixed(2)
  const units = `${matchedVolume} unit${matchedVolume === 1 ? '' : 's'}`

  // Only non-zero fills are material to the shareable outcome.
  const filled = allocations.filter((a) => a.filledQty > 0)
  const perDesk = filled.map((a) => `${a.desk} ${verb(a.side)} ${a.filledQty}`).join(', ')

  const headline =
    `This round cleared at a single uniform price of $${price}, ` +
    `matching ${units} of the bond and settling delivery-versus-payment atomically in one transaction.`
  const fills = perDesk
    ? `Per-desk outcomes: ${perDesk}.`
    : `No orders crossed this round, so no desk was filled.`

  // Append the verified rationale only when present; keep the brief tight (2–4 sentences).
  const tail = rationale.trim() ? ` ${rationale.trim()}` : ''

  return `${headline} ${fills}${tail}`
}
