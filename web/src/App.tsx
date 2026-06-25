// Root: paper bg + Inter; mounts the global shell (Header/Nav) + the active view
// (only the Privacy view is live this phase). Holds `activeDesk` (the selected
// switcher desk) + `screen`. The shared Round/RoundStats that drive the status
// indicator are read ONCE through a single desk context (ctxA) — observer = desks,
// so no operator token is needed in the browser (D6).
import { useState } from 'react'
import { ctxA, type DeskKey } from './ledgerContexts'
import { tokens, httpBaseUrl, wsBaseUrl } from './desks'
import { Round, RoundStats } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import Header from './components/Header'
import Nav, { type Screen } from './components/Nav'
import { phaseFromStatus, type Phase } from './components/StatusIndicator'
import PrivacyView from './views/PrivacyView'

// Reads the shared Round + RoundStats via ctxA and lifts the derived phase + sealed
// count up to App, which feeds the Header's StatusIndicator. Rendered inside a
// ctxA.DamlLedger provider (a desk token — never the operator's).
function RoundStateProbe({
  onState,
}: {
  onState: (s: { phase: Phase; sealedCount: number }) => void
}) {
  const rounds = ctxA.useStreamQueries(Round)
  const stats = ctxA.useStreamQueries(RoundStats)
  const status = rounds.contracts[0]?.payload.status
  const rawCount = stats.contracts[0]?.payload.sealedOrderCount
  const sealedCount = rawCount != null ? Number(rawCount) : 0
  const phase = phaseFromStatus(status)

  // Push derived state up on change (cheap; values are primitive).
  const key = `${phase}:${sealedCount}`
  if (RoundStateProbe.lastKey !== key) {
    RoundStateProbe.lastKey = key
    queueMicrotask(() => onState({ phase, sealedCount }))
  }
  return null
}
RoundStateProbe.lastKey = ''

export default function App() {
  const [activeDesk, setActiveDesk] = useState<DeskKey>('bankA')
  const [screen, setScreen] = useState<Screen>('privacy')
  const [roundState, setRoundState] = useState<{ phase: Phase; sealedCount: number }>({
    phase: 'open',
    sealedCount: 0,
  })

  const onReset = () => {
    // Phase-3 RESET is a refetch affordance; the lifecycle reset is Phase 4
    // (UI-SPEC line 237). A reload re-streams the seeded state.
    window.location.reload()
  }

  const a = tokens.bankA

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Hidden probe: one desk context streaming Round/RoundStats for the status bar. */}
      <ctxA.DamlLedger token={a.token} party={a.party} httpBaseUrl={httpBaseUrl} wsBaseUrl={wsBaseUrl}>
        <RoundStateProbe onState={setRoundState} />
      </ctxA.DamlLedger>

      <Header
        activeDesk={activeDesk}
        onPickDesk={setActiveDesk}
        phase={roundState.phase}
        sealedCount={roundState.sealedCount}
        onReset={onReset}
      />
      <Nav screen={screen} onScreen={setScreen} />

      {screen === 'privacy' && (
        <PrivacyView activeDesk={activeDesk} sealedCount={roundState.sealedCount} />
      )}
    </div>
  )
}
