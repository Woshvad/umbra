// ProofOfClearingPanel (CRYP-03 — Proof of Correct Clearing, 10-UI-SPEC lines 268-309) —
// mounted on the 05 Settlement view BELOW the shipped DvP-legs / atomic-stamp / CTA /
// RoundBrief / ProofPackButton / TcaReceipts / LeakageSimPanel, gated to
// `phase === 'cleared' | 'settled'`. It is the honest "the AI's clearing is verifiable,
// not just trusted" surface — and the phase's most overclaim-prone one, so the
// Provenance & Honest-Labeling Grammar is load-bearing here:
//
//   • T2 — the REAL Groth16 proof artifact renders on a SOLID 1px ink border + ink tag
//     `ZK PROOF · GROTH16`, raw bytes on the shipped ink "evidence" surface.
//   • T3 — the OFF-LEDGER verify verdict renders on a DASHED 1px ink border + RED tag
//     `OFF-LEDGER VERIFY · POC` (Canton has no zk-verifier precompile).
//   • T1 — the ON-LEDGER hash ANCHOR renders on a DISTINCT SOLID 1px ink surface + ink
//     tag `ON-LEDGER`. The solid-T1-anchor vs dashed-T3-verify SPLIT *is* the honest
//     "off-ledger verify + on-ledger hash anchor" statement (10-UI-SPEC Grammar rule 3).
//
// A persistent RED `POC · CRYPTOGRAPHER REVIEW PENDING` tag marks the whole panel
// cryptographer-review-gated. Every `0x…` value is middle-truncated with the FULL value
// in title/aria-label (lib/truncate.ts). No lime anywhere (lime stays the clearing-reveal
// signal). Operator plane only: it calls web/src/solver.ts (:4100, the sole Operator-
// authority proxy) — NO operator token / @daml/react context / ANTHROPIC_API_KEY, and the
// PRIVATE witness (every order's side/qty/limit/salt/fill) NEVER crosses out (T-10-11/27).
//
// The verification key (vkey) is a PUBLIC Groth16 artifact — safe in the browser (it is
// none of: the Anthropic key, the operator token, or the private witness). It is bundled
// (web/src/zk/clearingVKey.json, copied from the solver's PoC vkey) so the verify/anchor
// envelopes can be formed client-side.
import { useState } from 'react'
import {
  generateProof,
  verifyProof,
  anchorProof,
  SolverError,
  OFFLINE_CAPTION,
  type ProofArtifact,
  type ProofEnvelope,
  type AnchorResult,
  type VKey,
} from '../solver'
import type { OperatorViewState } from '../operatorState'
import { middleTruncate } from '../lib/truncate'
import clearingVKey from '../zk/clearingVKey.json'

type Props = Pick<OperatorViewState, 'roundId' | 'phase' | 'preview' | 'offline'>

// The PUBLIC verification key (opaque JSON to the client) — used to form the verify /
// anchor envelopes. Verification keys are public by construction; this crosses no secret.
const VERIFY_KEY = clearingVKey as unknown as VKey

// Verbatim CRYP-03 proof-error copy (10-UI-SPEC "Error state (proof)") — secret-free.
const PROOF_ERROR_COPY =
  'Proof couldn’t be generated. Check the solver on the configured port and try again.'

// The CRYP-03 reduced-but-meaningful statement (10-UI-SPEC Copywriting, verbatim-honest).
const STATEMENT =
  'Proves — over the sealed batch, revealing no losing order — that every fill is within ' +
  'its order quantity, buy fills clear ≥ p* and sell fills ≤ p*, and buy volume = sell ' +
  'volume = matched volume.'

// The off-ledger limitation prose (10-UI-SPEC Copywriting, verbatim).
const OFF_LEDGER_PROSE =
  'Verified by an off-ledger verifier — Canton has no zk-verifier precompile, so on-ledger ' +
  'we anchor only the proof hash. On-ledger native verification is the production path.'

// The ink "evidence" surface — same tokens as AgentRationale / PeekConsole / BreakTheAiPanel
// (#0A0A0A bg / #F4F1EA text, pre-wrap, tabular; raw crypto renders literally, never a badge).
const INK_SURFACE: React.CSSProperties = {
  background: '#0A0A0A',
  color: '#F4F1EA',
  padding: '22px 24px',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Pass verdict — the shipped ink 6px square + mono 9 .16em (Phase 9 ON-LEDGER grammar).
function InkSquareRow({ label }: { label: string }) {
  return (
    <div className="flex items-center" style={{ gap: '6px' }}>
      <span style={{ display: 'inline-block', width: '6px', height: '6px', background: '#0A0A0A' }} />
      <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em' }}>
        {label}
      </span>
    </div>
  )
}

// Loss / limitation / rejection verdict — the shipped red 6px square + mono 9 .16em
// (comp line 131 / Phase 8 REJECTED grammar).
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

// Provenance / limitation tag — mono 9 .12em, 1px bordered (comp SELECTED grammar). `tone`
// = 'ink' (neutral on-ledger/real-crypto) or 'red' (limitation / PoC).
function ProvenanceTag({ label, tone }: { label: string; tone: 'ink' | 'red' }) {
  const color = tone === 'red' ? '#E2231A' : '#0A0A0A'
  return (
    <span
      className="font-mono text-9 uppercase"
      style={{
        marginLeft: 'auto',
        letterSpacing: '.12em',
        padding: '3px 7px',
        border: `1px solid ${color}`,
        color,
      }}
    >
      {label}
    </span>
  )
}

// A paper caption above an ink evidence surface (mono 11 .16em uppercase opacity .6).
function EvidenceCaption({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="font-mono text-11 uppercase"
      style={{ letterSpacing: '.16em', opacity: 0.6, ...style }}
    >
      {children}
    </div>
  )
}

export default function ProofOfClearingPanel({ roundId, phase, preview, offline }: Props) {
  const [proof, setProof] = useState<ProofArtifact | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [verified, setVerified] = useState<boolean | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [anchor, setAnchor] = useState<AnchorResult | null>(null)
  const [anchoring, setAnchoring] = useState(false)
  const [offlineHit, setOfflineHit] = useState(false)

  // Gate: the panel is a POST-CLEAR surface — hidden until the batch has cleared/settled.
  if (phase !== 'cleared' && phase !== 'settled') return null

  const reduced = prefersReducedMotion()
  const showOffline = offline || offlineHit

  // The §4-invariant public inputs (sourced from the settled preview; $100.00 / matched 10).
  const pStar = (preview?.clearingPrice ?? 100).toFixed(2)
  const matched = preview?.matchedVolume ?? 10

  // The verify/anchor envelope — the PUBLIC {vkey, publicSignals, proof}. No witness.
  const envelopeOf = (p: ProofArtifact): ProofEnvelope => ({
    vkey: VERIFY_KEY,
    publicSignals: p.publicSignals,
    proof: p.proof,
  })

  // The order commitments are the public signals PAST [pStar, matched]; the losing orders
  // are ABSENT — that absence is the "reveals no losing order" property.
  const commitments = (p: ProofArtifact): string[] =>
    p.publicSignals.length > 2 ? p.publicSignals.slice(2) : p.publicSignals

  async function onGenerate(): Promise<void> {
    if (generating) return
    setGenerating(true)
    setGenError('')
    setOfflineHit(false)
    try {
      const artifact = await generateProof(roundId)
      setProof(artifact)
      // A fresh proof invalidates any prior verdict / anchor.
      setVerified(null)
      setAnchor(null)
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') setOfflineHit(true)
      else setGenError(e instanceof Error ? e.message : PROOF_ERROR_COPY)
    } finally {
      setGenerating(false)
    }
  }

  async function onVerify(): Promise<void> {
    if (!proof || verifying) return
    setVerifying(true)
    setOfflineHit(false)
    try {
      const verdict = await verifyProof(roundId, envelopeOf(proof))
      setVerified(verdict.verified)
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') setOfflineHit(true)
    } finally {
      setVerifying(false)
    }
  }

  async function onAnchor(): Promise<void> {
    if (!proof || anchoring) return
    setAnchoring(true)
    setOfflineHit(false)
    try {
      const result = await anchorProof(roundId, envelopeOf(proof))
      setAnchor(result)
    } catch (e) {
      if (e instanceof SolverError && e.code === 'OFFLINE') setOfflineHit(true)
    } finally {
      setAnchoring(false)
    }
  }

  return (
    <section style={{ marginTop: '34px', maxWidth: '760px' }}>
      {/* Header — block label + persistent RED PoC / cryptographer-review-gated tag + rule */}
      <div className="flex items-center" style={{ gap: '14px' }}>
        <span
          className="font-body text-10 uppercase"
          style={{ letterSpacing: '.16em', opacity: 0.55 }}
        >
          Proof of Correct Clearing
        </span>
        <ProvenanceTag label="POC · CRYPTOGRAPHER REVIEW PENDING" tone="red" />
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
          {/* The reduced-but-meaningful statement (verbatim-honest) */}
          <p
            className="font-body text-13"
            style={{ opacity: 0.7, lineHeight: 1.6, maxWidth: '640px', margin: '18px 0 0' }}
          >
            {STATEMENT}
          </p>

          {/* GENERATE PROOF → — ink-fill CTA (mono 13/700); umbra-pulse while generating */}
          <div style={{ margin: '20px 0 0' }}>
            <button
              type="button"
              onClick={() => void onGenerate()}
              disabled={generating}
              className="font-mono text-13 font-bold uppercase disabled:opacity-40"
              style={{
                background: '#0A0A0A',
                color: '#F4F1EA',
                padding: '15px 28px',
                letterSpacing: '.16em',
                border: 'none',
                cursor: generating ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {generating && (
                <span
                  className={reduced ? '' : 'animate-umbra-pulse'}
                  style={{ display: 'inline-block', width: '8px', height: '8px', background: '#F4F1EA' }}
                />
              )}
              {generating ? 'GENERATING…' : 'GENERATE PROOF →'}
            </button>
          </div>

          {genError && (
            <p
              className="font-body text-13"
              style={{ margin: '12px 0 0', opacity: 0.7, lineHeight: 1.6, maxWidth: '560px' }}
            >
              {genError}
            </p>
          )}

          {proof && (
            <>
              {/* ── T2 — Proof artifact (SOLID ink + ink tag ZK PROOF · GROTH16) ───────── */}
              <div style={{ marginTop: '18px', border: '1px solid #0A0A0A', padding: '22px 24px' }}>
                <div className="flex items-center" style={{ gap: '10px' }}>
                  <EvidenceCaption>Proof Artifact</EvidenceCaption>
                  <ProvenanceTag label="ZK PROOF · GROTH16" tone="ink" />
                </div>

                {/* PUBLIC INPUTS — p-star + matched + the order commitments; NO losing order */}
                <EvidenceCaption style={{ margin: '16px 0 8px' }}>Public Inputs</EvidenceCaption>
                <div className="font-mono text-13 tabular-nums" style={INK_SURFACE}>
                  <div>{`p*      = ${pStar}`}</div>
                  <div>{`matched = ${matched}`}</div>
                  <div style={{ opacity: 0.5, margin: '10px 0 4px' }}>COMMITMENTS</div>
                  {commitments(proof).map((c, i) => (
                    <div key={i} title={c} aria-label={`commitment ${i + 1}: ${c}`}>
                      {middleTruncate(c, 12, 8)}
                    </div>
                  ))}
                </div>
                <div
                  className="font-mono text-9 uppercase"
                  style={{ letterSpacing: '.16em', opacity: 0.55, margin: '8px 0 0' }}
                >
                  NO LOSING ORDER IN THE WITNESS
                </div>

                {/* PROOF — the raw proof bytes, middle-truncated, + size/timing metadata */}
                <EvidenceCaption style={{ margin: '16px 0 8px' }}>Proof</EvidenceCaption>
                {(() => {
                  const bytes = JSON.stringify(proof.proof)
                  return (
                    <div
                      className="font-mono text-13 tabular-nums"
                      style={INK_SURFACE}
                      title={bytes}
                      aria-label={`proof bytes: ${bytes}`}
                    >
                      {middleTruncate(bytes, 28, 14)}
                    </div>
                  )
                })()}
                <div
                  className="font-mono text-12 uppercase"
                  style={{ letterSpacing: '.12em', opacity: 0.6, margin: '8px 0 0' }}
                >
                  {`SIZE ${proof.sizeBytes}B · ${proof.ms}ms`}
                </div>
              </div>

              {/* ── T3 — OFF-LEDGER verify (DASHED ink + RED tag OFF-LEDGER VERIFY · POC) ─ */}
              <div style={{ marginTop: '18px', border: '1px dashed #0A0A0A', padding: '22px 24px' }}>
                <div className="flex items-center" style={{ gap: '10px' }}>
                  <EvidenceCaption>Off-Ledger Verify</EvidenceCaption>
                  <ProvenanceTag label="OFF-LEDGER VERIFY · POC" tone="red" />
                </div>

                <div style={{ margin: '16px 0 0' }}>
                  <button
                    type="button"
                    onClick={() => void onVerify()}
                    disabled={verifying}
                    className="umbra-ink-ghost font-mono text-13 uppercase disabled:opacity-40"
                    style={{
                      padding: '13px 24px',
                      letterSpacing: '.14em',
                      cursor: verifying ? 'default' : 'pointer',
                    }}
                  >
                    {verifying ? 'VERIFYING…' : 'VERIFY PROOF'}
                  </button>
                </div>

                {verified === true && (
                  <div style={{ margin: '16px 0 0' }}>
                    <InkSquareRow label="PROOF VERIFIED OFF-LEDGER" />
                  </div>
                )}
                {verified === false && (
                  <div style={{ margin: '16px 0 0' }}>
                    <RedSquareRow label="OFF-LEDGER VERIFY FAILED" />
                  </div>
                )}

                <p
                  className="font-body text-13"
                  style={{ opacity: 0.7, lineHeight: 1.6, maxWidth: '560px', margin: '14px 0 0' }}
                >
                  {OFF_LEDGER_PROSE}
                </p>
              </div>

              {/* ── T1 — ON-LEDGER hash anchor (DISTINCT SOLID ink + ink tag ON-LEDGER) ── */}
              <div style={{ marginTop: '18px', border: '1px solid #0A0A0A', padding: '22px 24px' }}>
                <div className="flex items-center" style={{ gap: '10px' }}>
                  <EvidenceCaption>Anchored On-Ledger</EvidenceCaption>
                  <ProvenanceTag label="ON-LEDGER" tone="ink" />
                </div>

                {!anchor && (
                  <div style={{ margin: '16px 0 0' }}>
                    <button
                      type="button"
                      onClick={() => void onAnchor()}
                      disabled={anchoring}
                      className="umbra-ink-ghost font-mono text-13 uppercase disabled:opacity-40"
                      style={{
                        padding: '13px 24px',
                        letterSpacing: '.14em',
                        cursor: anchoring ? 'default' : 'pointer',
                      }}
                    >
                      {anchoring ? 'ANCHORING…' : 'ANCHOR ON-LEDGER'}
                    </button>
                  </div>
                )}

                {anchor && (
                  <div className="font-mono text-13 tabular-nums" style={{ ...INK_SURFACE, marginTop: '16px' }}>
                    <div title={anchor.proofHash} aria-label={`proof hash: ${anchor.proofHash}`}>
                      {`PROOF HASH  ${middleTruncate(anchor.proofHash, 12, 8)}`}
                    </div>
                    <div title={anchor.vkeyHash} aria-label={`vkey hash: ${anchor.vkeyHash}`}>
                      {`VKEY HASH   ${middleTruncate(anchor.vkeyHash, 12, 8)}`}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
