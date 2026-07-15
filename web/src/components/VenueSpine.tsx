// VenueSpine (UI-SPEC lines 266-273) — the shared center count, the structural
// privacy claim made visible: "Venue sees only a count." Reads the shared
// `RoundStats.sealedOrderCount` through a DESK context (ctxA) — RoundStats observer
// is the desks, so a desk token suffices and NO operator token enters the browser
// (D6 / threat T-03-06). Two flex rules (opacity .25) flank a center stack with the
// 108px tabular-nums numeral, zero-padded to 2 digits.
import { ctxA } from '../ledgerContexts'
import { tokens, httpBaseUrlFor, wsBaseUrl } from '../desks'
import { RoundStats } from '@daml.js/umbra-sealed-auction-0.1.0/lib/Umbra/Auction/module'

function SpineBody({ fallback }: { fallback: number }) {
  const stats = ctxA.useStreamQueries(RoundStats)
  const raw = stats.contracts[0]?.payload.sealedOrderCount
  const count = raw != null ? Number(raw) : fallback
  const padded = String(count).padStart(2, '0')

  return (
    <div
      className="flex items-center justify-center"
      style={{ gap: '30px', margin: '48px auto 8px', width: '100%' }}
    >
      <span className="flex-1 bg-ink opacity-25" style={{ height: '1px' }} />
      <div className="text-center">
        <div
          className="font-body text-10 uppercase opacity-55"
          style={{ letterSpacing: '.22em', marginBottom: '4px' }}
        >
          Venue sees only a count
        </div>
        <div
          className="font-mono text-108 font-bold tabular-nums"
          style={{ lineHeight: '.85', letterSpacing: '-.04em' }}
        >
          {padded}
        </div>
        <div
          className="font-body text-12 font-semibold uppercase"
          style={{ letterSpacing: '.28em' }}
        >
          SEALED ORDERS
        </div>
      </div>
      <span className="flex-1 bg-ink opacity-25" style={{ height: '1px' }} />
    </div>
  )
}

type Props = { sealedCount: number }

export default function VenueSpine({ sealedCount }: Props) {
  const a = tokens.bankA
  return (
    <ctxA.DamlLedger token={a.token} party={a.party} httpBaseUrl={httpBaseUrlFor('bankA')} wsBaseUrl={wsBaseUrl}>
      <SpineBody fallback={sealedCount} />
    </ctxA.DamlLedger>
  )
}
