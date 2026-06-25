// Party switcher (UI-SPEC lines 218-222) — a segmented control / button group,
// NOT underline tabs. Outer 1px ink border; each button border-right 1px ink,
// padding 9px 16px, IBM Plex Mono 11px/600 .1em. Active = inverted (bg ink / text
// paper); inactive = transparent / ink. Renders the THREE desks only — the operator
// is not a switchable persona in this view (UI-SPEC line 222).
import type { DeskKey } from '../ledgerContexts'
import { DESKS } from '../desks'

type Props = {
  active: DeskKey
  onPick: (key: DeskKey) => void
}

export default function PartySwitcher({ active, onPick }: Props) {
  return (
    <div className="flex items-stretch border">
      {DESKS.map((d) => {
        const isActive = d.key === active
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onPick(d.key)}
            className={[
              'cursor-pointer border-0 border-r font-mono text-11 font-semibold tracking-wider',
              'px-4 py-2',
              isActive ? 'bg-ink text-paper' : 'bg-transparent text-ink',
            ].join(' ')}
            style={{ padding: '9px 16px' }}
            aria-pressed={isActive}
          >
            {d.code}
          </button>
        )
      })}
    </div>
  )
}
