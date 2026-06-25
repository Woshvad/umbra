// OrderRow (UI-SPEC lines 286-294) — one Side/Quantity/Limit row. Label left (Inter
// 10px .14em uppercase opacity .5); right side is EITHER the active desk's real value
// (mono 14px, optional color + unit suffix + tabular-nums) OR a RedactionBar of the
// rival's redacted width. The component never receives a rival's real value — the
// caller (DeskColumn) only has data for the active desk's own query.
import RedactionBar from './RedactionBar'

type Props = {
  label: string
  // Active value (string) — when present, renders the real value.
  value?: string
  valueColor?: string
  unit?: string
  weight?: 600 | 700
  tabular?: boolean
  // Redacted rival — when `value` is undefined, render a bar of this width.
  redactedWidth?: number
}

export default function OrderRow({
  label,
  value,
  valueColor,
  unit,
  weight = 600,
  tabular,
  redactedWidth = 62,
}: Props) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="font-body text-10 uppercase opacity-50"
        style={{ letterSpacing: '.14em' }}
      >
        {label}
      </span>
      {value !== undefined ? (
        <span
          className={`font-mono text-14 ${tabular ? 'tabular-nums' : ''}`}
          style={{
            fontWeight: weight,
            letterSpacing: '.06em',
            color: valueColor,
          }}
        >
          {value}
          {unit ? <span className="font-mono text-10 opacity-50">{unit}</span> : null}
        </span>
      ) : (
        <RedactionBar width={redactedWidth} />
      )}
    </div>
  )
}
