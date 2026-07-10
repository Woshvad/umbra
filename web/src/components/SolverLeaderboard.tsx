// SolverLeaderboard (S2 — ADJ-01 competing-solvers leaderboard, 13-UI-SPEC lines 153-168) —
// an ADDITIVE panel on the 04 Solver Agent view, BELOW the shipped proposal/rationale grid. It
// races the round's sealed batch across N solver configs (via the credential-free getCompeting
// seam), ranks the VERIFIED proposals by (matched ↓, surplus ↓), tags each VERIFIED (ink) /
// UNVERIFIED (red), and marks the deterministic §8 clear as the AUTHORITATIVE settle.
//
// It is a NARRATIVE leaderboard, NEVER a settlement input — the persistent honest tag
// `LEADERBOARD · NARRATIVE — NOT A SETTLEMENT INPUT` and the distinct `DETERMINISTIC §8 CLEAR —
// AUTHORITATIVE` marker keep that unmistakable. The rank-1 "winner" is marked with INK weight / a
// rule — NEVER lime (lime is reserved to the true uniform-price reveal, UI-SPEC color discipline).
//
// Operator-plane DISPLAY only: it reads a lifted CompetingResponse from web/src/solver.ts (:4100).
// NO operator token, NO @daml/react context, NO Anthropic key here (same discipline as AgentProposal).
import { useEffect, useState } from 'react'
import { getCompeting, SolverError, OFFLINE_CAPTION, type CompetingResponse, type SolverConfig } from '../solver'
import { rankForDisplay } from '../lib/leaderboard'

// The honest solver entrants raced for the narrative leaderboard. Model ids are the real published
// families (CLAUDE.md model table); the tags rendered are derived from these (HAIKU · t0.0, …).
const DEFAULT_CONFIGS: SolverConfig[] = [
  { id: 'haiku-t0', model: 'claude-haiku-4-5', temperature: 0 },
  { id: 'sonnet-t04', model: 'claude-sonnet-4-6', temperature: 0.4 },
  { id: 'opus-t0', model: 'claude-opus-4-8', temperature: 0 },
]

// The persistent honest tag — the panel MUST make its narrative (non-settlement) nature unmistakable.
const HONEST_TAG = 'LEADERBOARD · NARRATIVE — NOT A SETTLEMENT INPUT'

type Props = {
  roundId: string
  // The round has a deterministic clear to rank against (AgentView passes `!!preview`). Until then
  // the panel shows the empty state ("Run a round close to rank solver proposals…").
  ready: boolean
  offline?: boolean
}

type Phase = 'idle' | 'computing' | 'ranked' | 'offline'

// Reduced-motion guard (shipped idiom — BreakTheAiPanel L27-33 / AgentRationale).
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// The mono 9px .12em tag styling reused across the comp (AgentProposal badge / honest-label tags).
const inkTag: React.CSSProperties = { letterSpacing: '.12em', padding: '3px 7px' }

export default function SolverLeaderboard({ roundId, ready, offline }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [data, setData] = useState<CompetingResponse | null>(null)
  const reduced = prefersReducedMotion()

  // Auto-race when a round has cleared (read-only panel — no CTA, per UI-SPEC). A network reject
  // (solver down) → the shipped OFFLINE caption; a non-offline reject (round not closed / no batch)
  // → the empty state (nothing to rank yet).
  useEffect(() => {
    if (offline) {
      setPhase('offline')
      return
    }
    if (!ready || !roundId) {
      setData(null)
      setPhase('idle')
      return
    }
    let cancelled = false
    setPhase('computing')
    getCompeting(roundId, DEFAULT_CONFIGS)
      .then((resp) => {
        if (cancelled) return
        setData(resp)
        setPhase('ranked')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof SolverError && e.code === 'OFFLINE') {
          setPhase('offline')
        } else {
          setData(null)
          setPhase('idle')
        }
      })
    return () => {
      cancelled = true
    }
  }, [roundId, ready, offline])

  return (
    <section style={{ marginTop: '64px' }}>
      {/* Header — the section label + the persistent honest (narrative) tag. */}
      <div className="flex items-center" style={{ gap: '11px' }}>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Competing Solvers
        </span>
        <span style={{ flex: 1 }} />
        <span className="font-mono text-9 border uppercase" style={inkTag}>
          {HONEST_TAG}
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      {phase === 'offline' ? (
        <p
          className="font-mono text-13 uppercase"
          style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, maxWidth: '560px', marginTop: '22px' }}
        >
          {OFFLINE_CAPTION}
        </p>
      ) : phase === 'computing' ? (
        <div className="flex items-center" style={{ gap: '11px', marginTop: '22px' }}>
          <span
            className={reduced ? '' : 'animate-umbra-pulse'}
            style={{ display: 'inline-block', width: '11px', height: '11px', background: '#FF6A1A' }}
          />
          <span
            className={`font-mono text-11 uppercase ${reduced ? '' : 'animate-umbra-pulse'}`}
            style={{ letterSpacing: '.16em', opacity: 0.7 }}
          >
            Computing…
          </span>
        </div>
      ) : phase === 'ranked' && data ? (
        <Ranked data={data} />
      ) : (
        <Empty />
      )}
    </section>
  )
}

// Empty state — no deterministic clear yet to rank against (UI-SPEC copy, line 108-109).
function Empty() {
  return (
    <div style={{ marginTop: '22px', maxWidth: '560px' }}>
      <p className="font-display text-22 font-bold" style={{ letterSpacing: '-.02em' }}>
        NO COMPETING PROPOSALS YET
      </p>
      <p className="font-body text-14 opacity-65" style={{ lineHeight: 1.6, marginTop: '12px' }}>
        Run a round close to rank solver proposals against the deterministic clear.
      </p>
    </div>
  )
}

// Ranked state — the AUTHORITATIVE deterministic block + the narrative ranked list.
function Ranked({ data }: { data: CompetingResponse }) {
  const rows = rankForDisplay(data.leaderboard)
  return (
    <div style={{ marginTop: '22px' }}>
      {/* Authoritative deterministic §8 block — visually separated by a heavier ink rule; restates
          the clearing price / matched that will ACTUALLY settle. Ink only, never lime. */}
      <div style={{ borderTop: '2px solid #0A0A0A', paddingTop: '18px' }}>
        <span className="font-mono text-9 border uppercase" style={inkTag}>
          Deterministic §8 Clear — Authoritative
        </span>
        <div className="flex items-baseline" style={{ gap: '34px', marginTop: '14px' }}>
          <AuthoritativeMetric label="Clearing Price" value={data.deterministic.clearingPrice.toFixed(2)} />
          <AuthoritativeMetric label="Matched Volume" value={`${data.deterministic.matchedVolume} units`} />
          <AuthoritativeMetric label="Surplus" value={data.deterministic.surplus.toFixed(2)} />
        </div>
      </div>

      {/* The narrative ranked list (verified set). Empty when no solver matched the deterministic
          clear this round (keyless-degrade) — the authoritative block above still stands. */}
      {rows.length === 0 ? (
        <p
          className="font-body text-13 opacity-60"
          style={{ lineHeight: 1.6, marginTop: '30px', maxWidth: '560px' }}
        >
          No solver proposal matched the deterministic clear this round — only the authoritative §8
          result above settles.
        </p>
      ) : (
        <div className="border-t" style={{ marginTop: '30px' }}>
          {rows.map((r, i) => {
            // The rank-1 verified proposal is the NARRATIVE winner — marked with an INK left rule +
            // ink weight, NEVER lime (lime is reserved to the true uniform-price reveal).
            const winner = i === 0
            return (
              <div
                key={`${r.rank}-${r.configTag}`}
                className="flex items-center"
                style={{
                  gap: '18px',
                  padding: '14px 0 14px 14px',
                  borderBottom: '1px solid rgba(10,10,10,.16)',
                  borderLeft: winner ? '2px solid #0A0A0A' : '2px solid transparent',
                }}
              >
                {/* Rank numeral — mono 11px/600 opacity .6, zero-padded. */}
                <span
                  className="font-mono text-11 font-semibold tabular-nums"
                  style={{ opacity: winner ? 1 : 0.6, minWidth: '20px' }}
                >
                  {r.rank}
                </span>
                {/* Honest solver config tag — mono 9px .12em ink border. */}
                <span className="font-mono text-9 border uppercase" style={inkTag}>
                  {r.configTag}
                </span>
                {winner && (
                  <span className="font-mono text-9 border uppercase" style={{ ...inkTag, fontWeight: 700 }}>
                    Winner · Narrative
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {/* Matched volume + surplus — mono 15px/600 tabular-nums. */}
                <RowMetric label="Matched" value={`${r.matchedVolume}`} winner={winner} />
                <RowMetric label="Surplus" value={r.surplus.toFixed(2)} winner={winner} />
                {/* VERIFIED (ink) / UNVERIFIED (red) badge — reuse the AgentProposal badge styling. */}
                <span
                  className="font-mono text-9 border uppercase"
                  style={{
                    ...inkTag,
                    color: r.verified ? '#0A0A0A' : '#E2231A',
                    borderColor: r.verified ? '#0A0A0A' : '#E2231A',
                  }}
                >
                  {r.badge}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// One authoritative-block metric (label over a 22px mono value — the AgentProposal proposal-value idiom).
function AuthoritativeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-body text-10 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
        {label}
      </div>
      <div className="font-mono text-22 font-bold tabular-nums" style={{ marginTop: '6px' }}>
        {value}
      </div>
    </div>
  )
}

// One leaderboard-row metric (small uppercase label + mono 15px/600 tabular value).
function RowMetric({ label, value, winner }: { label: string; value: string; winner: boolean }) {
  return (
    <div className="flex items-baseline" style={{ gap: '8px' }}>
      <span className="font-body text-9 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
        {label}
      </span>
      <span
        className="font-mono text-15 font-semibold tabular-nums"
        style={{ opacity: winner ? 1 : 0.85 }}
      >
        {value}
      </span>
    </div>
  )
}
