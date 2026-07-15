// Round-status indicator (UI-SPEC lines 224-236). STATUS label (Inter 9px .14em
// uppercase opacity .5) over the phase value (IBM Plex Mono 13px/600 .04em) colored
// by the phase map. Phase-3 reachable phases: Open (shows `OPEN · NN SEALED`, NN =
// sealedOrderCount zero-padded) + a seeded Cleared/Settled read-only. The phase is
// driven by the seeded Round.status + RoundStats count (UI-01).
import type { RoundStatus } from '@daml.js/umbra-sealed-auction-0.1.0/lib/Umbra/Auction/module'

export type Phase = 'open' | 'running' | 'solving' | 'cleared' | 'settling' | 'settled'

// Map the on-ledger Round.status enum to the comp's phase keys. The live lifecycle
// (running/solving/settling) is Phase 4 — Phase 3 only reaches Open / seeded
// Cleared / seeded Settled.
export function phaseFromStatus(status: RoundStatus | undefined): Phase {
  switch (status) {
    case 'Cleared':
      return 'cleared'
    case 'Settled':
      return 'settled'
    case 'Closed':
      return 'running'
    case 'Open':
    default:
      return 'open'
  }
}

const PHASE_MAP: Record<Phase, { label: (n: number) => string; color: string }> = {
  open: { label: (n) => `OPEN · ${String(n).padStart(2, '0')} SEALED`, color: '#0A0A0A' },
  running: { label: () => 'CLEARING WINDOW', color: '#E2231A' },
  solving: { label: () => 'SOLVING…', color: '#FF6A1A' },
  cleared: { label: () => 'CLEARED @ 100.00', color: '#E2231A' },
  settling: { label: () => 'SETTLING…', color: '#FF6A1A' },
  settled: { label: () => 'SETTLED · ATOMIC', color: '#E2231A' },
}

type Props = {
  phase: Phase
  sealedCount: number
}

export default function StatusIndicator({ phase, sealedCount }: Props) {
  const entry = PHASE_MAP[phase]
  return (
    <div className="flex flex-col items-end">
      <span className="font-body text-9 uppercase opacity-50" style={{ letterSpacing: '.14em' }}>
        Status
      </span>
      <span
        className="font-mono text-13 font-semibold"
        style={{ letterSpacing: '.04em', color: entry.color }}
      >
        {entry.label(sealedCount)}
      </span>
    </div>
  )
}
