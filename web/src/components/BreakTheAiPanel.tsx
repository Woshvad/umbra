// BreakTheAiPanel (WOW-02 — "Break the AI", 08-UI-SPEC lines 191-213) — mounted onto
// the 04 Solver Agent view BELOW the shipped proposal/rationale grid. A clearly
// DEMO-labeled, self-contained before/after contrast: FORCE A WRONG CLEAR attempts a
// tampered on-ledger Round.Clear (via the solver :4100 tamperClear seam) and renders the
// VERBATIM ledger rejection on the ink evidence surface (same treatment as AgentRationale
// L68-92); then RUN CORRECT CLEAR runs the real deterministic clear (the shipped settle
// path) and reveals the lime 100.00 sub-slab — the ledger, not the AI, is the backstop.
//
// Operator plane only: it calls web/src/solver.ts (the sole Operator-authority proxy);
// NO operator token / @daml/react context lives here (threat T-08-06-OPTOK). The tamper
// is harmless — Round.Clear is atomic, a rejected assert rolls back and NOTHING changes
// on-ledger — so it needs no confirm dialog (UI-SPEC). The raw `error` string is the
// credibility: render it verbatim, never summarize (08-RESEARCH Pattern 3).
import { useState } from 'react'
import {
  settle,
  tamperClear,
  SolverError,
  OFFLINE_CAPTION,
  type TamperMode,
} from '../solver'

type Props = { roundId: string; offline?: boolean }
type Phase = 'idle' | 'attempting' | 'rejected' | 'clearing' | 'corrected'

// True when the user has asked for reduced motion (shipped guard — AgentRationale L19-25).
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// The ink "evidence" surface — same tokens as AgentRationale L68-92 / PeekConsole.
const INK_SURFACE: React.CSSProperties = {
  background: '#0A0A0A',
  color: '#F4F1EA',
  padding: '22px 24px',
  minHeight: '84px',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

// The comp-line-131 red-square verdict row (6px #E2231A square + mono 9px .16em red).
function RedSquareRow({ label }: { label: string }) {
  return (
    <div className="flex items-center" style={{ gap: '6px' }}>
      <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#E2231A' }} />
      <span
        className="font-mono text-9 uppercase"
        style={{ letterSpacing: '.16em', color: '#E2231A' }}
      >
        {label}
      </span>
    </div>
  )
}

const TAMPER_MODES: ReadonlyArray<[TamperMode, string]> = [
  ['wrong-price', 'Wrong price'],
  ['overfill', 'Over-fill (conservation)'],
]

const IDLE_HINT =
  'Force the solver to propose a wrong clear. Round.Clear re-verifies §8 on-ledger and rejects it — then the correct deterministic clear still settles at 100.00.'

export default function BreakTheAiPanel({ roundId, offline }: Props) {
  const [mode, setMode] = useState<TamperMode>('wrong-price')
  const [phase, setPhase] = useState<Phase>('idle')
  const [rejection, setRejection] = useState<string>('') // the VERBATIM ledger reject
  const [clearingPrice, setClearingPrice] = useState<number | null>(null)
  const [offlineHit, setOfflineHit] = useState(false)
  const [settleError, setSettleError] = useState<string>('') // a REAL (non-offline) settle failure

  const attempting = phase === 'attempting'
  const clearing = phase === 'clearing'
  const reduced = prefersReducedMotion()

  // FORCE A WRONG CLEAR — attempt the tampered on-ledger clear, surface the verbatim reject.
  async function forceWrongClear(): Promise<void> {
    if (attempting || clearing) return
    setPhase('attempting')
    setOfflineHit(false)
    setRejection('')
    setSettleError('')
    try {
      const result = await tamperClear(roundId, mode)
      setRejection(result.error)
      setPhase('rejected')
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') {
        setOfflineHit(true)
        setPhase('idle')
        return
      }
      // A structured solver error still carries a secret-free message — show it verbatim.
      setRejection(e instanceof Error ? e.message : 'rejected')
      setPhase('rejected')
    }
  }

  // RUN CORRECT CLEAR — the real deterministic clear (shipped settle path, byte-unchanged).
  async function runCorrectClear(): Promise<void> {
    if (attempting || clearing) return
    setPhase('clearing')
    setOfflineHit(false)
    setSettleError('')
    try {
      const result = await settle(roundId)
      setClearingPrice(result.clearingPrice)
      setPhase('corrected')
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') {
        setOfflineHit(true)
        setPhase(rejection ? 'rejected' : 'idle')
        return
      }
      // A REAL settle failure (insufficient holding, ledger error, 500, …) — do NOT
      // fabricate a SETTLED reveal. The panel's whole claim is "the ledger is the
      // backstop", so asserting a $100.00 settle that never happened destroys exactly
      // that credibility (WR-02). Surface the solver's secret-free message (the API
      // envelope guarantees no key/token) and return to the prior state — the lime
      // 100.00 slab renders ONLY on an actual success.
      setSettleError(e instanceof Error ? e.message : 'clear failed')
      setPhase(rejection ? 'rejected' : 'idle')
    }
  }

  const showOffline = offline || offlineHit
  const price = (clearingPrice ?? 100).toFixed(2)

  return (
    <section style={{ margin: '48px 0 0', maxWidth: '760px' }}>
      {/* Panel header — sub-label + DEMO · ADVERSARIAL tag pushed right */}
      <div className="flex items-center" style={{ gap: '14px' }}>
        <span
          className="font-body text-10 uppercase opacity-55"
          style={{ letterSpacing: '.16em' }}
        >
          Break the AI
        </span>
        <span
          className="font-mono text-9 uppercase"
          style={{
            marginLeft: 'auto',
            letterSpacing: '.12em',
            padding: '3px 7px',
            border: '1px solid #E2231A',
            color: '#E2231A',
          }}
        >
          DEMO · ADVERSARIAL
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '10px 0 0' }} />

      {showOffline ? (
        <p
          className="font-mono text-13 uppercase"
          style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, margin: '18px 0 0' }}
        >
          {OFFLINE_CAPTION}
        </p>
      ) : (
        <>
          {/* Tamper-mode segmented toggle — active = ink underline */}
          <div className="flex items-center" style={{ gap: '18px', margin: '18px 0 0' }}>
            {TAMPER_MODES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className="font-mono text-9 uppercase"
                style={{
                  letterSpacing: '.16em',
                  paddingBottom: '3px',
                  borderBottom: mode === value ? '1px solid #0A0A0A' : '1px solid transparent',
                  // Inactive label raised .5 → .62 for a touch more contrast.
                  opacity: mode === value ? 1 : 0.62,
                  background: 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Controls — FORCE A WRONG CLEAR (red ghost) + RUN CORRECT CLEAR (ink/paper) */}
          <div className="flex items-center" style={{ gap: '14px', margin: '20px 0 0', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void forceWrongClear()}
              disabled={attempting || clearing}
              className="font-mono text-13 font-bold uppercase break-ai-force"
              style={{
                letterSpacing: '.14em',
                padding: '14px 26px',
                opacity: attempting || clearing ? 0.6 : 1,
                cursor: attempting || clearing ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {attempting && (
                <span
                  className={reduced ? '' : 'animate-umbra-pulse'}
                  style={{ display: 'inline-block', width: '8px', height: '8px', background: '#E2231A' }}
                />
              )}
              {attempting ? 'ATTEMPTING TAMPERED CLEAR…' : 'FORCE A WRONG CLEAR'}
            </button>

            <button
              type="button"
              onClick={() => void runCorrectClear()}
              disabled={attempting || clearing}
              className="font-mono text-13 font-bold uppercase"
              style={{
                letterSpacing: '.14em',
                padding: '14px 26px',
                background: '#0A0A0A',
                color: '#F4F1EA',
                opacity: attempting || clearing ? 0.6 : 1,
                cursor: attempting || clearing ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {clearing && (
                <span
                  className={reduced ? '' : 'animate-umbra-pulse'}
                  style={{ display: 'inline-block', width: '8px', height: '8px', background: '#F4F1EA' }}
                />
              )}
              {clearing ? 'RUNNING CORRECT CLEAR…' : 'RUN CORRECT CLEAR'}
            </button>
          </div>

          {/* Row 1 — TAMPERED CLEAR → REJECTED BY LEDGER + verbatim rejection */}
          <div style={{ margin: '26px 0 0' }}>
            <div
              className="font-mono text-12 uppercase opacity-60"
              style={{ letterSpacing: '.16em', marginBottom: '8px' }}
            >
              Tampered Clear
            </div>
            {phase === 'rejected' || phase === 'corrected' ? (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <RedSquareRow label="REJECTED BY LEDGER" />
                </div>
                <div className="font-mono text-13 tabular-nums" style={INK_SURFACE}>
                  {rejection || '// (no rejection captured)'}
                </div>
              </>
            ) : (
              <div className="font-mono text-13 tabular-nums" style={{ ...INK_SURFACE, opacity: 0.85 }}>
                {IDLE_HINT}
              </div>
            )}
          </div>

          {/* Row 2 — CORRECT CLEAR → lime 100.00 sub-reveal + VERIFIED · SETTLED */}
          {phase === 'corrected' && (
            <div style={{ margin: '26px 0 0' }}>
              <div
                className="font-mono text-12 uppercase opacity-60"
                style={{ letterSpacing: '.16em', marginBottom: '8px' }}
              >
                Correct Clear
              </div>
              <div className="flex items-center" style={{ gap: '14px', marginBottom: '10px' }}>
                <span
                  className={`font-mono text-34 tabular-nums ${reduced ? '' : 'animate-umbra-slam'}`}
                  style={{
                    display: 'inline-block',
                    fontWeight: 600,
                    background: '#D6FB3C',
                    color: '#0A0A0A',
                    padding: '4px 12px',
                    lineHeight: 1,
                  }}
                >
                  {price}
                </span>
              </div>
              <RedSquareRow label={`VERIFIED · SETTLED @ ${price}`} />
            </div>
          )}

          {/* Correct-clear FAILURE — a real (non-offline) settle error. Renders the honest
              failure instead of a fabricated SETTLED slab (WR-02). Same ink-evidence
              treatment as the rejection; the message is the solver's secret-free envelope. */}
          {settleError && phase !== 'corrected' && (
            <div style={{ margin: '26px 0 0' }}>
              <div
                className="font-mono text-12 uppercase opacity-60"
                style={{ letterSpacing: '.16em', marginBottom: '8px' }}
              >
                Correct Clear
              </div>
              <div style={{ marginBottom: '8px' }}>
                <RedSquareRow label="CLEAR FAILED" />
              </div>
              <div className="font-mono text-13 tabular-nums" style={INK_SURFACE}>
                {settleError}
              </div>
            </div>
          )}

          {/* Verdict line */}
          <p
            className="font-body text-13 opacity-70"
            style={{ lineHeight: 1.6, maxWidth: '560px', margin: '22px 0 0' }}
          >
            The ledger — not the AI — is the backstop.
          </p>
        </>
      )}
    </section>
  )
}
