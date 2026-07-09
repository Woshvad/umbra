// TcaReceipts (AUCT-04, 09-05) — UI-SPEC "AUCT-04 — Best-Ex / TCA Receipt" (05 Settlement).
// A POST-settle, per-desk best-ex receipt block on the operator plane (:4100) via solver.ts —
// no operator token, no @daml/react context. Reads the settled GET body's `receipts` (rebuilt
// from the on-ledger TradeConfirmations) and renders, per participating desk, TWO DISTINCT
// surplus rows:
//   1. PROVEN vs-LIMIT — the structurally-non-negative, on-ledger `surplusVsLimit ≥ 0` number
//      (ink solid square + `ON-LEDGER · SURPLUS ≥ 0`), NEVER red.
//   2. BENCHMARK vs-REFERENCE — a labeled stub benchmark (`improvementVsReferenceBp`, SIGNED,
//      MAY be negative): positive → ink, negative → #E2231A red. Lighter than the proven row.
// The two numbers are never conflated. `EXPORT RECEIPT ↓` reuses the shipped `.umbra-ink-ghost`
// grammar (ink/paper, never red/lime) and saves a plain-text receipt (the same fields are also
// embedded in the WOW-05 proof-pack). Hidden until receipts are present (post-settle only).
import { useEffect, useState } from 'react'
import { getRound, type Receipt } from '../solver'
import { codeForParty } from '../desks'

type Props = { roundId: string }

const BUY = '#2B3AF2'
const SELL = '#FF3D9A'
const RED = '#E2231A'

// Signed benchmark surplus vs the labeled reference stub (a DIFFERENT number from the proven
// vs-limit surplus): a buy improves when p* is below the reference, a sell when above.
function refSurplus(r: Receipt): number {
  return r.side === 'Buy'
    ? (r.referencePrice - r.clearingPrice) * r.filledQty
    : (r.clearingPrice - r.referencePrice) * r.filledQty
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)

// A plain-text export of one desk's receipt (secret-free — numbers only).
function receiptText(r: Receipt): string {
  const code = codeForParty(r.desk)
  const limit = r.ownLimit == null ? 'no limit (noncompetitive)' : r.ownLimit.toFixed(2)
  return [
    `UMBRA — BEST-EX / TCA RECEIPT`,
    `Desk: ${code}`,
    `Side: ${r.side}   Filled: ${r.filledQty}`,
    `Clearing price: ${r.clearingPrice.toFixed(2)}`,
    `Your limit: ${limit}`,
    `Reference (pre-auction mid, STUB): ${r.referencePrice.toFixed(2)}`,
    ``,
    `PROVEN vs-LIMIT (on-ledger, surplus >= 0): ${signed(r.surplusVsLimit)}  (${signed(r.improvementVsLimitBp)} bp)`,
    `BENCHMARK vs-REFERENCE (may be negative): ${signed(refSurplus(r))}  (${signed(r.improvementVsReferenceBp)} bp)`,
  ].join('\n')
}

export default function TcaReceipts({ roundId }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([])

  // Pull the settled GET body's receipts (post-settle only). Silent on offline/pre-terminal.
  useEffect(() => {
    let live = true
    getRound(roundId)
      .then((r) => {
        if (live && r.receipts?.length) setReceipts(r.receipts)
      })
      .catch(() => {
        /* offline / pre-settle → render nothing (the block is post-settle only) */
      })
    return () => {
      live = false
    }
  }, [roundId])

  if (!receipts.length) return null

  const exportReceipt = (r: Receipt) => {
    const blob = new Blob([receiptText(r)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Umbra-Receipt-${codeForParty(r.desk)}-${roundId}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ marginTop: '34px' }}>
      {/* Block label — Inter 10px .16em uppercase opacity .55 + the 1px ink rule. */}
      <div className="font-body text-10 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
        Best-Ex / TCA · per desk
      </div>
      <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0' }} />

      {receipts.map((r) => {
        const code = codeForParty(r.desk)
        const sideColor = r.side === 'Buy' ? BUY : SELL
        // Benchmark row color: positive/zero → ink, negative → red (the vs-limit row is never red).
        const benchNegative = r.improvementVsReferenceBp < 0
        return (
          <div
            key={`${r.desk}-${r.side}`}
            style={{ border: '1px solid #0A0A0A', padding: '16px 22px', marginTop: '14px' }}
          >
            {/* Header — desk code + side chip + signed fill qty (buy blue / sell pink). */}
            <div className="flex items-center" style={{ gap: '10px' }}>
              <span className="font-mono text-13 font-semibold uppercase" style={{ letterSpacing: '.16em' }}>
                {code}
              </span>
              <span
                className="font-mono text-9 uppercase"
                style={{
                  letterSpacing: '.16em',
                  padding: '2px 6px',
                  border: `1px solid ${sideColor}`,
                  color: sideColor,
                }}
              >
                {r.side}
              </span>
              <span className="font-mono text-14 tabular-nums" style={{ color: sideColor, marginLeft: 'auto' }}>
                {r.side === 'Buy' ? '+' : '−'}
                {r.filledQty}
              </span>
            </div>

            {/* Facts grid — CLEARING PRICE · YOUR LIMIT · REFERENCE (+ stub tag). */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '12px',
                marginTop: '14px',
              }}
            >
              <Fact caption="CLEARING PRICE" value={r.clearingPrice.toFixed(2)} />
              <Fact caption="YOUR LIMIT" value={r.ownLimit == null ? 'NO LIMIT' : r.ownLimit.toFixed(2)} />
              <div>
                <Fact caption="REFERENCE" value={r.referencePrice.toFixed(2)} />
                <span
                  className="font-mono text-9 uppercase"
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    letterSpacing: '.12em',
                    padding: '3px 7px',
                    border: '1px solid #0A0A0A',
                    opacity: 0.7,
                  }}
                >
                  REFERENCE — PRE-AUCTION MID (STUB)
                </span>
              </div>
            </div>

            {/* Row 1 — PROVEN vs-LIMIT (ink, never red). */}
            <div className="flex items-center" style={{ gap: '8px', marginTop: '16px' }}>
              <span style={{ width: '8px', height: '8px', background: '#0A0A0A', display: 'inline-block' }} />
              <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em' }}>
                ON-LEDGER · SURPLUS ≥ 0
              </span>
              <span className="font-mono text-22 font-semibold tabular-nums" style={{ marginLeft: 'auto' }}>
                {signed(r.surplusVsLimit)} · {signed(r.improvementVsLimitBp)} bp
              </span>
            </div>

            {/* Row 2 — BENCHMARK vs-REFERENCE (lighter; negative → red). */}
            <div className="bg-ink" style={{ height: '1px', margin: '12px 0 0', opacity: 0.5 }} />
            <div className="flex items-center" style={{ gap: '8px', marginTop: '10px' }}>
              <span className="font-mono text-9 uppercase" style={{ letterSpacing: '.16em', opacity: 0.55 }}>
                VS REFERENCE · BENCHMARK (MAY BE NEGATIVE)
              </span>
              <span
                className="font-mono text-18 tabular-nums"
                style={{ marginLeft: 'auto', color: benchNegative ? RED : '#0A0A0A' }}
              >
                {signed(refSurplus(r))} · {signed(r.improvementVsReferenceBp)} bp
              </span>
            </div>

            {/* Export — ink-bordered ghost (never red/lime), matching DOWNLOAD PROOF-PACK grammar. */}
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => exportReceipt(r)}
                className="umbra-ink-ghost font-mono text-13 font-bold uppercase"
                style={{ padding: '11px 22px', letterSpacing: '.14em', cursor: 'pointer' }}
              >
                EXPORT RECEIPT ↓
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// A single captioned fact cell (mono 11 .16em caption → mono 18 tabular value).
function Fact({ caption, value }: { caption: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-11 uppercase" style={{ letterSpacing: '.16em', opacity: 0.6 }}>
        {caption}
      </div>
      <div className="font-mono text-18 tabular-nums" style={{ marginTop: '4px' }}>
        {value}
      </div>
    </div>
  )
}
