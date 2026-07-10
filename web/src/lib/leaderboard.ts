// web/src/lib/leaderboard.ts — PURE, DOM-free display helpers for the S2 competing-solvers
// leaderboard (UI-SPEC S2, 13-UI-SPEC lines 153-168). Turns the raw `CompetingResponse.leaderboard`
// (agent.ts RankedProposal[]) into the ranked, badged rows the SolverLeaderboard component renders.
//
// The referee (deterministic §8) is the ONLY thing that settles — these helpers format a NARRATIVE
// leaderboard, never a settlement input. No I/O, no React, no DOM, no credential.

import type { RankedProposal } from '../solver'

// The badge label mapped from a proposal's verified flag: an exact match vs the deterministic §8
// recompute → VERIFIED (rendered ink); any divergence → UNVERIFIED (rendered red #E2231A).
export type LeaderboardBadge = 'VERIFIED' | 'UNVERIFIED'

// One display row for the S2 leaderboard. `rank` is the zero-padded numeral (mono 11px/600 opacity .6);
// `configTag` is the honest model·temp tag (mono 9px .12em ink border); matched/surplus are the
// tabular-nums numerals; `badge` drives the ink/red badge color.
export type LeaderboardRow = {
  rank: string
  configTag: string
  matchedVolume: number
  surplus: number
  verified: boolean
  badge: LeaderboardBadge
}

// Short, honest model family label from a full model id (e.g. 'claude-haiku-4-5' → 'HAIKU'). An
// unrecognized id degrades to the uppercased id (never invents a family). Keeps the tag honest.
const modelShort = (model: string): string => {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 'HAIKU'
  if (m.includes('sonnet')) return 'SONNET'
  if (m.includes('opus')) return 'OPUS'
  return model.toUpperCase()
}

// The honest solver config tag — `HAIKU · t0.0`, `SONNET · t0.4` (UI-SPEC S2 row contract, line 161).
export const formatConfigTag = (config: { model: string; temperature: number }): string =>
  `${modelShort(config.model)} · t${config.temperature.toFixed(1)}`

// Map a proposal's verified flag → the S2 badge label (verified → VERIFIED, else UNVERIFIED).
export const badgeFor = (verified: boolean): LeaderboardBadge => (verified ? 'VERIFIED' : 'UNVERIFIED')

// Rank the proposals for display: sort by (matchedVolume desc, then surplus desc) — the same order
// the solver's rankProposals uses — and project each to a formatted, zero-padded, badged row. Pure
// (copies the input before sorting; never mutates). The wire `leaderboard` is verified-only, but this
// helper handles a mixed set too (an UNVERIFIED entry still maps to the red badge).
export const rankForDisplay = (leaderboard: RankedProposal[]): LeaderboardRow[] =>
  [...leaderboard]
    .sort((a, b) => b.matchedVolume - a.matchedVolume || b.surplus - a.surplus)
    .map((p, i) => ({
      rank: String(i + 1).padStart(2, '0'),
      configTag: formatConfigTag(p.config),
      matchedVolume: p.matchedVolume,
      surplus: p.surplus,
      verified: p.verified,
      badge: badgeFor(p.verified),
    }))
