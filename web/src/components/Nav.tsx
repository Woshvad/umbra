// Nav (UI-SPEC lines 239-245). 5 tabs (PRIVACY/DESK/THEATRE/AGENT/SETTLEMENT), each
// num (mono 11px/600 opacity .6) + label (Inter 13px/600 .04em), border-top 3px
// (active = red #E2231A, inactive transparent), active fg ink / inactive
// rgba(10,10,10,.5). Phase-6: all five views are live and navigable.
export type Screen = 'privacy' | 'desk' | 'theatre' | 'agent' | 'settlement' | 'timemachine'

const TABS = [
  { num: '01', label: 'PRIVACY', screen: 'privacy' as const, enabled: true },
  { num: '02', label: 'DESK', screen: 'desk' as const, enabled: true },
  { num: '03', label: 'THEATRE', screen: 'theatre' as const, enabled: true },
  { num: '04', label: 'AGENT', screen: 'agent' as const, enabled: true },
  { num: '05', label: 'SETTLEMENT', screen: 'settlement' as const, enabled: true },
  { num: '06', label: 'TIME MACHINE', screen: 'timemachine' as const, enabled: true },
]

type Props = {
  screen: Screen
  onScreen: (s: Screen) => void
}

export default function Nav({ screen, onScreen }: Props) {
  return (
    <nav className="flex border-b" style={{ gap: 0, padding: '0 48px' }}>
      {TABS.map((t) => {
        const isActive = t.enabled && t.screen === screen
        const rule = isActive ? '#E2231A' : 'transparent'
        const fg = isActive ? '#0A0A0A' : 'rgba(10,10,10,.5)'
        return (
          <button
            key={t.num}
            type="button"
            disabled={!t.enabled}
            onClick={() => t.enabled && t.screen && onScreen(t.screen)}
            className="flex items-baseline border-0 bg-transparent"
            style={{
              gap: '9px',
              padding: '14px 28px 12px 0',
              marginRight: '36px',
              marginTop: '-1px',
              borderTop: `3px solid ${rule}`,
              color: fg,
              cursor: t.enabled ? 'pointer' : 'default',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="font-mono text-11 font-semibold opacity-60">{t.num}</span>
            <span className="font-body text-13 font-semibold" style={{ letterSpacing: '.04em' }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
