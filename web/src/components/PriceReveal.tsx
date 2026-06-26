// PriceReveal — THE money-shot wow beat (UI-SPEC "03 — State B", lines 186-190 +
// RESEARCH Code Examples lines 516-528). The uniform clearing price slams onto the
// lime #D6FB3C hero slab (120px IBM Plex Mono) via the Plan-01 animate-umbra-slam
// alias, with the red skewed edge sliver. Below: two sub-stats (matched volume +
// "1 for all") and the VIEW SETTLEMENT CTA.
//
// Robust to a keyless solver: clearingPrice is always 100.00 on the §4 fixture
// (the deterministic core is the source of truth — CONTEXT).

type Props = {
  clearingPrice: number
  matchedVolume: number
  onViewSettlement?: () => void
}

export default function PriceReveal({ clearingPrice, matchedVolume, onViewSettlement }: Props) {
  return (
    <div>
      <div
        className="font-display text-30b font-bold uppercase"
        style={{ letterSpacing: '.04em', marginBottom: '14px' }}
      >
        CLEARS AT
      </div>

      {/* Hero slab — lime, ink numeral, red skew sliver, umbra-slam */}
      <div
        className="animate-umbra-slam"
        style={{
          display: 'inline-block',
          background: '#D6FB3C',
          color: '#0A0A0A',
          padding: '10px 26px 14px',
          position: 'relative',
        }}
      >
        <span
          className="font-mono text-120 font-bold tabular-nums"
          style={{ letterSpacing: '-.03em', display: 'block' }}
        >
          {clearingPrice.toFixed(2)}
        </span>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: '-1px',
            top: '-1px',
            bottom: '-1px',
            width: '5px',
            background: '#E2231A',
            transform: 'skewX(-12deg)',
          }}
        />
      </div>

      {/* Sub-stats */}
      <div className="flex" style={{ gap: '40px', marginTop: '26px' }}>
        <div>
          <div
            className="font-body text-10 uppercase"
            style={{ letterSpacing: '.16em', opacity: 0.6, marginBottom: '6px' }}
          >
            Matched Volume
          </div>
          <div className="font-mono text-34 font-semibold tabular-nums">
            {matchedVolume} <span style={{ opacity: 0.5, fontSize: '18px' }}>units</span>
          </div>
        </div>
        <div>
          <div
            className="font-body text-10 uppercase"
            style={{ letterSpacing: '.16em', opacity: 0.6, marginBottom: '6px' }}
          >
            Uniform Price
          </div>
          <div className="font-mono text-34 font-semibold tabular-nums">
            1 <span style={{ opacity: 0.5, fontSize: '18px' }}>for all</span>
          </div>
        </div>
      </div>

      {/* CTA → 05 Settlement */}
      <div style={{ marginTop: '34px' }}>
        <button
          type="button"
          onClick={onViewSettlement}
          className="font-mono text-13 font-bold uppercase"
          style={{
            background: '#F4F1EA',
            color: '#0A0A0A',
            padding: '16px 30px',
            letterSpacing: '.14em',
            border: 'none',
            cursor: onViewSettlement ? 'pointer' : 'default',
          }}
        >
          View Settlement →
        </button>
      </div>
    </div>
  )
}
