// CrossingChart (UI-05) — a HAND-ROLLED supply/demand crossing SVG (no chart lib —
// spec §6/§12.4). Renders the binding `viewBox 0 0 480 360` frame (UI-SPEC "SVG
// Crossing Chart — Exact Geometry", lines 236-245) and derives the step supply (up)
// + step demand (down) polylines from the live solve-preview `curve` points via the
// web/src/lib/curve.ts mapping (sx/sy), so the live paths land on the binding
// coordinate frame and reproduce the §4 crossing at the binding marker (296,160).
//
// The §4 fixture (p*=100, q=10) MUST land on (296,160) — the Plan-01 curve.test.ts
// asserts this mapping (crossingPoint). The supply curve draws on via the Plan-01
// animate-umbra-draw alias (strokeDasharray 640). Shared with Plan 04 (AgentView).
import type { CurvePoint } from '../solver'
import { sx, sy, curveQMax, crossingPoint } from '../lib/curve'

// VIZ-01 — the assembling↔locked distinction. `assembling` (window open): the step
// curves build as orders seal and NO red p* rule/dropline/marker/label renders (red is
// reserved for the LOCKED clear); the lime matched region is faint. `locked` (at close):
// the shipped solved-state chart is byte-unchanged — red p* + circle r5 at (296,160) for
// §4 + the 15px price label — plus a red-square `p* LOCKED @ {price}` verdict. Default
// `locked` keeps every existing call site (the shipped solved state) byte-identical.
export type CrossingMode = 'assembling' | 'locked'

type Props = {
  curve: CurvePoint[]
  clearingPrice: number
  matchedVolume: number
  mode?: CrossingMode
}

// Build an ascending step "supply" polyline: for each candidate price (low→high) the
// supply quantity steps UP. Emits horizontal-then-vertical segments between points so
// the path is a staircase that climbs with price.
function supplyPoints(curve: CurvePoint[], qMax: number): string {
  const sorted = [...curve].sort((a, b) => a.price - b.price)
  const pts: Array<[number, number]> = []
  for (const c of sorted) {
    const x = sx(c.supply, qMax)
    const y = sy(c.price)
    if (pts.length > 0) pts.push([x, pts[pts.length - 1][1]]) // horizontal to new qty
    pts.push([x, y]) // vertical to new price
  }
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

// Build a descending step "demand" polyline: as price rises, demand quantity steps
// DOWN (or holds). High price = low y; the staircase falls left→right with price.
function demandPoints(curve: CurvePoint[], qMax: number): string {
  const sorted = [...curve].sort((a, b) => a.price - b.price)
  const pts: Array<[number, number]> = []
  for (const c of sorted) {
    const x = sx(c.demand, qMax)
    const y = sy(c.price)
    if (pts.length > 0) pts.push([x, pts[pts.length - 1][1]])
    pts.push([x, y])
  }
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export default function CrossingChart({ curve, clearingPrice, matchedVolume, mode = 'locked' }: Props) {
  const assembling = mode === 'assembling'
  const qMax = curveQMax(curve)
  const supply = supplyPoints(curve, qMax)
  const demand = demandPoints(curve, qMax)
  // The binding crossing marker for the §4 fixture (curve.ts → (296,160)). Computed
  // always (pure) but the red crossing group only RENDERS in the locked state.
  const cross = crossingPoint(curve, clearingPrice, matchedVolume)
  const priceLabel = clearingPrice.toFixed(2)
  // Assembling: no red locked clear yet — the curve is still building as orders seal.
  const caption = assembling ? 'ASSEMBLING — CURVE BUILDS AS ORDERS SEAL' : 'SUPPLY × DEMAND'
  // Lime matched region: faint while assembling, solidifies at lock (existing tokens).
  const matchedOpacity = assembling ? 0.08 : 0.16

  return (
    <div>
      <div
        className="font-mono text-11 uppercase"
        style={{ letterSpacing: '.16em', opacity: 0.6, marginBottom: '10px' }}
      >
        {caption}
      </div>

      <svg
        viewBox="0 0 480 360"
        style={{ width: '100%', maxWidth: '480px' }}
        role="img"
        aria-label={
          assembling
            ? 'Supply and demand curves assembling as orders seal'
            : `Supply crosses demand at clearing price ${priceLabel}, matched ${matchedVolume}`
        }
      >
        {/* Axes */}
        <line x1={48} y1={20} x2={48} y2={320} stroke="#F4F1EA" strokeOpacity={0.5} strokeWidth={1} />
        <line x1={48} y1={320} x2={460} y2={320} stroke="#F4F1EA" strokeOpacity={0.5} strokeWidth={1} />

        {/* Matched-region rectangle — faint while assembling, solid at lock. When locked it
            is DERIVED from the crossing point (like the marker/curves) so it always tracks the
            live clear; §4 (cross 296,160) reproduces the shipped x48 y160 w248 h160 exactly.
            Assembling has no crossing yet → keep the shipped faint frame rect. */}
        {assembling ? (
          <rect x={48} y={160} width={248} height={160} fill="#D6FB3C" fillOpacity={matchedOpacity} />
        ) : (
          <rect
            x={48}
            y={cross.y}
            width={cross.x - 48}
            height={320 - cross.y}
            fill="#D6FB3C"
            fillOpacity={matchedOpacity}
          />
        )}

        {/* Supply — ascending step, draws on via the Plan-01 animate-umbra-draw alias */}
        <polyline
          className="animate-umbra-draw"
          points={supply}
          fill="none"
          stroke="#F4F1EA"
          strokeWidth={2.5}
          strokeDasharray={640}
        />

        {/* Demand — descending step, dashed */}
        <polyline
          points={demand}
          fill="none"
          stroke="#F4F1EA"
          strokeOpacity={0.55}
          strokeWidth={2.5}
          strokeDasharray="6 6"
        />

        {/* p* rule + dropline + marker + price and quantity annotations (red) — LOCKED
            state ONLY. Red is reserved for the locked clear; hidden while assembling. */}
        {!assembling && (
          <>
            <line x1={48} y1={cross.y} x2={cross.x} y2={cross.y} stroke="#E2231A" strokeWidth={1.5} />
            <line
              x1={cross.x}
              y1={cross.y}
              x2={cross.x}
              y2={320}
              stroke="#E2231A"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <circle cx={cross.x} cy={cross.y} r={5} fill="#E2231A" />

            {/* Annotations */}
            <text x={cross.x + 10} y={cross.y - 8} fill="#E2231A" fontFamily='"IBM Plex Mono"' fontSize={15} fontWeight={600}>
              {priceLabel}
            </text>
            <text x={270} y={338} fill="#F4F1EA" fillOpacity={0.7} fontFamily='"IBM Plex Mono"' fontSize={11}>
              q={matchedVolume}
            </text>
            <text x={14} y={cross.y + 4} fill="#F4F1EA" fillOpacity={0.7} fontFamily='"IBM Plex Mono"' fontSize={11}>
              p*
            </text>
          </>
        )}
        {/* Axis caps */}
        <text x={56} y={338} fill="#F4F1EA" fillOpacity={0.5} fontFamily='"IBM Plex Mono"' fontSize={11}>
          QTY →
        </text>
        <text x={54} y={32} fill="#F4F1EA" fillOpacity={0.5} fontFamily='"IBM Plex Mono"' fontSize={11}>
          ↑ PRICE
        </text>
      </svg>

      {/* Legend + locked verdict */}
      <div className="flex items-center" style={{ gap: '8px', marginTop: '10px' }}>
        <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#D6FB3C' }} />
        <span className="font-mono text-11 uppercase" style={{ letterSpacing: '.08em', opacity: 0.8 }}>
          {assembling ? 'MATCHED REGION — ASSEMBLING' : `MATCHED ${matchedVolume} @ ${priceLabel}`}
        </span>
      </div>

      {/* Locked verdict (red-square grammar) — only once the clear is locked in */}
      {!assembling && (
        <div className="flex items-center" style={{ gap: '8px', marginTop: '10px' }}>
          <span style={{ display: 'inline-block', width: '7px', height: '7px', background: '#E2231A' }} />
          <span
            className="font-mono uppercase"
            style={{ fontSize: '9px', letterSpacing: '.16em', color: '#E2231A', fontWeight: 600 }}
          >
            p* LOCKED @ {priceLabel}
          </span>
        </div>
      )}
    </div>
  )
}
