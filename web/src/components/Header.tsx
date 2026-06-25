// Header (UI-SPEC lines 210-237). flex, align-items flex-end, justify-content
// space-between, padding 22px 48px 14px, 1px solid ink bottom border. Three flex
// children: the wordmark block, the PartySwitcher, and the StatusIndicator + RESET.
import type { DeskKey } from '../ledgerContexts'
import PartySwitcher from './PartySwitcher'
import StatusIndicator, { type Phase } from './StatusIndicator'

type Props = {
  activeDesk: DeskKey
  onPickDesk: (key: DeskKey) => void
  phase: Phase
  sealedCount: number
  onReset: () => void
}

export default function Header({ activeDesk, onPickDesk, phase, sealedCount, onReset }: Props) {
  return (
    <header
      className="flex items-end justify-between border-b"
      style={{ padding: '22px 48px 14px' }}
    >
      {/* Wordmark block (UI-SPEC line 214) */}
      <div className="flex items-baseline" style={{ gap: '18px' }}>
        <span
          className="font-display text-30 font-bold"
          style={{ letterSpacing: '-.02em', lineHeight: 1 }}
        >
          UMBRA
        </span>
        <span
          className="font-mono text-10 uppercase opacity-55"
          style={{ letterSpacing: '.16em', paddingBottom: '2px' }}
        >
          Sealed-Bid Batch Auction
        </span>
      </div>

      {/* Party switcher (3 desks) */}
      <PartySwitcher active={activeDesk} onPick={onPickDesk} />

      {/* Status + RESET (UI-SPEC lines 224-237) */}
      <div className="flex items-center" style={{ gap: '16px' }}>
        <StatusIndicator phase={phase} sealedCount={sealedCount} />
        <button
          type="button"
          onClick={onReset}
          className="border bg-transparent font-mono text-10 transition-colors hover:bg-ink hover:text-paper"
          style={{ padding: '8px 11px', letterSpacing: '.1em' }}
        >
          RESET
        </button>
      </div>
    </header>
  )
}
