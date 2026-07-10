// IssuancePanel (S4 — ADJ-03 issuance / coupon panel, 13-UI-SPEC lines 192-202) — the
// OPTIONAL, compact additive block on the 03 Auction Theatre view. It demonstrates that
// the same auction engine is issuance-capable end-to-end in the UI: a PRIMARY-ISSUANCE
// uniform-price clear (REUSING the shipped CrossingChart + PriceReveal visuals) plus a
// compact coupon / redemption LifecycleRow.
//
// Color discipline (13-UI-SPEC lines 90-96): the uniform ISSUANCE price reveal is the ONE
// place lime is allowed on Phase 13 UI — because it IS a real uniform-price clear.
// This panel introduces NO raw lime literal of its own; all lime is delegated to the reused
// PriceReveal hero slab (and the CrossingChart matched region it already draws). Everything
// else here is ink / paper on the dark inverted stage. Proven grep-clean in the test.
//
// Theatre-plane DISCIPLINE (threat T-13-40): the issuance calls ride the SAME credential-free
// web seam (openIssuance / clearIssuance / payCoupon / redeemIssuance over the single
// SOLVER_BASE_URL call<T>()). There is NO operator token, NO per-party ledger React context,
// and NO model key here. A network reject surfaces the shipped OFFLINE_CAPTION (graceful).
//
// S4 has NO primary CTA (13-UI-SPEC line 107) — the clear + lifecycle are driven by small
// SECONDARY controls (compact ghost buttons, never the ink-fill primary SEAL/SETTLE grammar).
import { useEffect, useRef, useState } from 'react'
import {
  clearIssuance,
  payCoupon,
  redeemIssuance,
  SolverError,
  OFFLINE_CAPTION,
  type CurvePoint,
  type IssuanceOpenBody,
  type IssuanceClearResponse,
  type CouponResponse,
  type RedeemResponse,
} from '../solver'
import CrossingChart from './CrossingChart'
import PriceReveal from './PriceReveal'

// ── Copy contract (13-UI-SPEC S4 + Copywriting Contract, verbatim) ─────────────────────
// The persistent honest tag — the panel MUST make its primary-issuance uniform-price nature clear.
export const HONEST_TAG = 'PRIMARY ISSUANCE · UNIFORM-PRICE'
export const LIFECYCLE_TAG = 'LIFECYCLE'
export const COUPON_PAID = 'COUPON PAID'
export const REDEEMED = 'REDEEMED'
export const RUN_CLEAR = 'RUN ISSUANCE CLEAR'
export const PAY_COUPON = 'PAY COUPON'
export const REDEEM = 'REDEEM'

// ── Canonical primary-issuance fixture (deterministic, clears at the uniform §-style $100.00) ──
// A single BONDX tranche the issuer floats against three desk bids; the solver runs the SAME
// deterministic §8 clear server-side and returns ONE uniform issuance price (never trusted from
// the client — the client only sends bids and renders the returned clearingPrice/winners).
export const ISSUANCE_FIXTURE: IssuanceOpenBody = {
  issuer: 'ISSUER',
  bondInstrument: 'BONDX',
  cashInstrument: 'USDCx',
  trancheSize: 20,
  reservePrice: 99.0,
  bids: [
    { desk: 'BLUEROCK', quantity: 10, limit: 100.5 },
    { desk: 'MERIDIAN', quantity: 8, limit: 100.0 },
    { desk: 'HELVETIA', quantity: 6, limit: 99.5 },
  ],
}

// The canonical lifecycle magnitudes (deterministic, pro-rata) the LifecycleRow drives.
export const COUPON_PERIOD = 1
export const COUPON_PER_UNIT = 2.5
export const PRINCIPAL_PER_UNIT = 100.0

// ── Pure helper (DOM-free, credential-free — unit-tested in IssuancePanel.test.tsx) ─────
// Synthesize a minimal 3-point crossing curve for the reused CrossingChart from the cleared
// tranche's (uniform price, matched qty). The issuance wire returns no candidate-price curve
// (privacy + it is already cleared), so the chart's staircase is rebuilt around the crossing:
// demand steps DOWN with price, supply steps UP, and both meet the uniform price at `matched`.
export function issuanceCurve(pStar: number, matched: number): CurvePoint[] {
  const step = 1.2
  const spread = Math.max(2, Math.round(matched * 0.4))
  return [
    { price: pStar - step, demand: matched + spread, supply: Math.max(0, matched - spread) },
    { price: pStar, demand: matched, supply: matched },
    { price: pStar + step, demand: Math.max(0, matched - spread), supply: matched + spread },
  ]
}

// ── Component ───────────────────────────────────────────────────────────────────────────
type Phase = 'assembling' | 'clearing' | 'cleared' | 'offline'

// Compact SECONDARY ghost-control styling — deliberately NOT the ink-fill primary CTA grammar.
// `tone` swaps between the dark inverted stage (paper stroke/text) and the paper lifecycle row
// (ink stroke/text). No new token; 1px border + transparent fill.
function ghostStyle(tone: 'paper' | 'ink'): React.CSSProperties {
  const c = tone === 'paper' ? '#F4F1EA' : '#0A0A0A'
  return {
    background: 'transparent',
    color: c,
    border: `1px solid ${c}`,
    padding: '8px 16px',
    letterSpacing: '.14em',
    cursor: 'pointer',
  }
}

// The mono 9px .12em ink-border tag styling reused across the comp (honest-label tags).
const tagStyle: React.CSSProperties = { letterSpacing: '.12em', padding: '3px 7px' }

export default function IssuancePanel() {
  const [phase, setPhase] = useState<Phase>('assembling')
  const [result, setResult] = useState<IssuanceClearResponse | null>(null)
  const [coupon, setCoupon] = useState<CouponResponse | null>(null)
  const [redeem, setRedeem] = useState<RedeemResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Classify a solver failure: a network reject (SolverError code OFFLINE) flips the whole
  // panel to the shipped OFFLINE caption; any other reject leaves the current state intact
  // (the deterministic engine is the source of truth — never a fabricated clear).
  function onOffline(e: unknown): boolean {
    if (e instanceof SolverError && e.code === 'OFFLINE') {
      if (mounted.current) setPhase('offline')
      return true
    }
    return false
  }

  // RUN ISSUANCE CLEAR — open + clear the tranche at ONE uniform price (the wire POST /issuance
  // opens then runs the deterministic §8 clear server-side in the SAME request). Secondary control.
  async function onClear() {
    if (busy) return
    setBusy(true)
    setPhase('clearing')
    try {
      const res = await clearIssuance(ISSUANCE_FIXTURE)
      if (!mounted.current) return
      setResult(res)
      setPhase('cleared')
    } catch (e) {
      if (!onOffline(e) && mounted.current) setPhase('assembling')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  // PAY COUPON — deterministic pro-rata coupon to the current holders for a period.
  async function onCoupon() {
    if (busy || !result) return
    setBusy(true)
    try {
      const res = await payCoupon(result.issuanceId, COUPON_PERIOD, COUPON_PER_UNIT)
      if (mounted.current) setCoupon(res)
    } catch (e) {
      onOffline(e)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  // REDEEM — repay principal pro-rata + retire the bond holdings at maturity.
  async function onRedeem() {
    if (busy || !result) return
    setBusy(true)
    try {
      const res = await redeemIssuance(result.issuanceId, PRINCIPAL_PER_UNIT)
      if (mounted.current) setRedeem(res)
    } catch (e) {
      onOffline(e)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const curve = result ? issuanceCurve(result.clearingPrice, result.totalIssued) : []

  return (
    <section style={{ marginTop: '64px' }}>
      {/* Header — the section label + the persistent honest (primary-issuance) tag. */}
      <div className="flex items-center" style={{ gap: '11px' }}>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Primary Issuance
        </span>
        <span style={{ flex: 1 }} />
        <span className="font-mono text-9 border uppercase" style={tagStyle}>
          {HONEST_TAG}
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      {/* Dark inverted stage — the reused crossing/reveal visuals render paper-on-ink, so the
          issuance clear lives on the SAME dark surface as the main Theatre reveal. */}
      <div
        style={{
          background: '#0A0A0A',
          color: '#F4F1EA',
          padding: '30px 34px 34px',
          marginTop: '24px',
          overflow: 'hidden',
        }}
      >
        {phase === 'offline' ? (
          <p
            className="font-mono text-13 uppercase"
            style={{ letterSpacing: '.12em', opacity: 0.65, lineHeight: 1.6, maxWidth: '560px' }}
          >
            {OFFLINE_CAPTION}
          </p>
        ) : phase === 'cleared' && result ? (
          // ── Cleared — the crossing lock + the lime uniform-price reveal + minted holdings ─────
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,420px) 1fr',
              gap: '48px',
              alignItems: 'center',
            }}
          >
            <CrossingChart
              curve={curve}
              clearingPrice={result.clearingPrice}
              matchedVolume={result.totalIssued}
              mode="locked"
            />
            <div>
              {/* The ONE allowed lime use — the uniform issuance price reveal (reused slab). */}
              <PriceReveal clearingPrice={result.clearingPrice} matchedVolume={result.totalIssued} />
              <MintedHoldings result={result} />
            </div>
          </div>
        ) : (
          // ── Pre-clear (assembling) — the building crossing + the secondary clear control ──────
          <div className="flex flex-col" style={{ gap: '24px', maxWidth: '460px' }}>
            <CrossingChart curve={[]} clearingPrice={0} matchedVolume={0} mode="assembling" />
            <div className="flex items-center" style={{ gap: '14px' }}>
              <button
                type="button"
                onClick={() => void onClear()}
                disabled={busy}
                className="font-mono text-11 font-bold uppercase disabled:opacity-40"
                style={ghostStyle('paper')}
              >
                {RUN_CLEAR}
              </button>
              {phase === 'clearing' && (
                <span
                  className="font-mono text-11 uppercase animate-umbra-pulse"
                  style={{ letterSpacing: '.16em', opacity: 0.7 }}
                >
                  CLEARING…
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Coupon / redemption LifecycleRow — ink rows + mono values on paper, LIFECYCLE tag.
          Only meaningful once the tranche has cleared (holdings exist to service). */}
      {phase === 'cleared' && result && (
        <LifecycleRow
          coupon={coupon}
          redeem={redeem}
          busy={busy}
          onCoupon={() => void onCoupon()}
          onRedeem={() => void onRedeem()}
        />
      )}
    </section>
  )
}

// ── Minted-holdings summary (on the dark stage, below the reveal) ───────────────────────
// The winners the tranche minted Holdings for — desk + filled qty, each at the ONE uniform
// price. Paper-on-ink rows (the inverted-stage grammar); no lime here.
function MintedHoldings({ result }: { result: IssuanceClearResponse }) {
  return (
    <div style={{ marginTop: '30px', borderTop: '1px solid rgba(244,241,234,0.16)', paddingTop: '18px' }}>
      <div
        className="font-mono uppercase"
        style={{ fontSize: '9px', letterSpacing: '.16em', opacity: 0.55 }}
      >
        Minted Holdings · {result.totalIssued} @ {result.clearingPrice.toFixed(2)}
      </div>
      <div style={{ marginTop: '12px' }}>
        {result.winners.map((w) => (
          <div
            key={w.desk}
            className="flex items-center"
            style={{ gap: '14px', padding: '10px 0', borderBottom: '1px solid rgba(244,241,234,0.16)' }}
          >
            <span className="font-mono text-13 font-semibold">{w.desk}</span>
            <span style={{ flex: 1 }} />
            <span className="font-mono text-15 font-semibold tabular-nums">{w.filledQty}</span>
            <span className="font-body text-9 uppercase" style={{ letterSpacing: '.14em', opacity: 0.5 }}>
              BONDX
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Coupon / redemption LifecycleRow (paper, ink rows + mono values, LIFECYCLE tag) ─────
function LifecycleRow({
  coupon,
  redeem,
  busy,
  onCoupon,
  onRedeem,
}: {
  coupon: CouponResponse | null
  redeem: RedeemResponse | null
  busy: boolean
  onCoupon: () => void
  onRedeem: () => void
}) {
  return (
    <div style={{ marginTop: '30px' }}>
      <div className="flex items-center" style={{ gap: '11px' }}>
        <span className="font-body text-11 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
          Bond Lifecycle
        </span>
        <span style={{ flex: 1 }} />
        <span className="font-mono text-9 border uppercase" style={tagStyle}>
          {LIFECYCLE_TAG}
        </span>
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0', opacity: 0.16 }} />

      {/* COUPON row — pro-rata coupon paid to holders for the period. */}
      <div
        className="flex items-center"
        style={{ gap: '14px', padding: '14px 0', borderBottom: '1px solid rgba(10,10,10,.16)' }}
      >
        <span
          className="font-mono text-9 border uppercase"
          style={{ ...tagStyle, opacity: coupon ? 1 : 0.4 }}
        >
          {COUPON_PAID}
        </span>
        {coupon ? (
          <span className="font-mono text-13" style={{ opacity: 0.7 }}>
            PERIOD {coupon.period} · PRO-RATA
          </span>
        ) : (
          <span className="font-body text-13 opacity-45">Not yet serviced this period.</span>
        )}
        <span style={{ flex: 1 }} />
        {coupon ? (
          <>
            <span className="font-mono text-15 font-semibold tabular-nums">
              {coupon.couponPerUnit.toFixed(2)}
            </span>
            <span className="font-body text-9 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
              USDCx/unit · {coupon.holders} holders
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={onCoupon}
            disabled={busy}
            className="font-mono text-9 font-bold uppercase disabled:opacity-40"
            style={ghostStyle('ink')}
          >
            {PAY_COUPON}
          </button>
        )}
      </div>

      {/* REDEEM row — principal repaid pro-rata + the bond holdings retired at maturity. */}
      <div
        className="flex items-center"
        style={{ gap: '14px', padding: '14px 0', borderBottom: '1px solid rgba(10,10,10,.16)' }}
      >
        <span
          className="font-mono text-9 border uppercase"
          style={{ ...tagStyle, opacity: redeem ? 1 : 0.4 }}
        >
          {REDEEMED}
        </span>
        {redeem ? (
          <span className="font-mono text-13" style={{ opacity: 0.7 }}>
            RETIRED · PRINCIPAL REPAID
          </span>
        ) : (
          <span className="font-body text-13 opacity-45">Outstanding — not yet at maturity.</span>
        )}
        <span style={{ flex: 1 }} />
        {redeem ? (
          <>
            <span className="font-mono text-15 font-semibold tabular-nums">
              {redeem.principalPerUnit.toFixed(2)}
            </span>
            <span className="font-body text-9 uppercase opacity-40" style={{ letterSpacing: '.14em' }}>
              USDCx/unit · {redeem.holders} holders
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={onRedeem}
            disabled={busy}
            className="font-mono text-9 font-bold uppercase disabled:opacity-40"
            style={ghostStyle('ink')}
          >
            {REDEEM}
          </button>
        )}
      </div>
    </div>
  )
}
