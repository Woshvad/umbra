// JoinView (WOW-07) — the guest 4th-desk mobile `/join` route. A phone scans the QR on
// `03 Theatre` (which encodes only the `/join?round=<id>` URL — no token), lands here, and
// submits ONE sealed bid on its OWN scoped token, seeing ONLY its own fill.
//
// Structural per-party privacy (identical to A/B/C): the whole body mounts inside
// `ctxD.DamlLedger` carrying the guest's own bankD token (from the gitignored tokens.json,
// minted by guest-onboard.mjs — NEVER embedded in the QR or web source). Every hook streams
// only the guest's own contracts; a rival desk's Order / Holding / TradeConfirmation
// genuinely never reaches this view. No operator/venue token anywhere (threat T-11-10-PRIV).
//
// Reuses the shipped `OrderTicket` (CTA relabeled `SEAL GUEST ORDER`, one-per-round lock +
// seal-wipe unchanged; onParse never auto-seals) and the private `FillCard` (`YOUR FILL` /
// `Visible only to you`). COMP-01: an ineligible on-ledger submit renders the raw ledger
// reject VERBATIM on a 1px-ink evidence surface — never a render-time guard (T-11-10-COMP).
//
// Mobile-first: single column, max-width 480px, 16px page padding, text-40 headline. Touch
// targets ≥ 44px are already satisfied by the reused controls (do not shrink). Rendered
// standalone (no desktop Header/Nav) via main.tsx's `/join` branch — NOT part of the nav.
import { useState } from 'react'
import { ctxD, type Ctx } from '../ledgerContexts'
import { tokens, httpBaseUrlFor, wsBaseUrl } from '../desks'
import { Order } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import OrderTicket from '../components/OrderTicket'
import FillCard from '../components/FillCard'

const GUEST_KEY = 'bankD' as const
const INK = '#0A0A0A'
const PAPER = '#F4F1EA'
const RED = '#E2231A'

// COMP-01 verbatim reject surface — the raw on-ledger `assertMsg`/`fetchByKey` failure text
// rendered LITERALLY on a 1px-ink evidence surface. Never summarized, never a render guard.
function RejectSurface({ msg }: { msg: string }) {
  return (
    <div style={{ border: `1px solid ${INK}`, padding: '18px 16px', marginTop: '24px' }}>
      <div
        className="flex items-center font-mono text-9 uppercase"
        style={{ letterSpacing: '.16em', color: RED, gap: '6px' }}
      >
        <span aria-hidden style={{ width: '6px', height: '6px', background: RED, display: 'inline-block' }} />
        SUBMISSION REJECTED — NOT ELIGIBLE
      </div>

      {/* Raw ledger rejection — verbatim on the ink evidence surface. */}
      <div
        className="font-mono text-13 tabular-nums"
        style={{
          background: INK,
          color: PAPER,
          padding: '18px 18px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          marginTop: '12px',
        }}
      >
        {msg}
      </div>

      <div className="font-body text-13" style={{ opacity: 0.7, lineHeight: 1.6, marginTop: '12px' }}>
        This desk has no active eligibility credential (accreditation / sanctions).
        Onboarding is operator/Compliance-issued (stub — real KYC vendor is Track B).
      </div>
    </div>
  )
}

// Inner body — rendered INSIDE the guest's own ctxD.DamlLedger provider, so every hook
// reads only the guest's own contracts. Mirrors DeskView's per-party plane, stacked mobile.
function JoinBody({ ctx }: { ctx: Ctx }) {
  const orders = ctx.useStreamQueries(Order)
  const order = orders.contracts[0]?.payload
  // COMP-01 — the verbatim ledger rejection (empty until a submit is rejected).
  const [rejection, setRejection] = useState<string>('')

  return (
    <div style={{ borderTop: `1px solid ${INK}`, paddingTop: '26px' }}>
      <OrderTicket
        ctx={ctx}
        deskKey={GUEST_KEY}
        order={order}
        commitLabel="SEAL GUEST ORDER"
        onCommitRejected={setRejection}
      />

      {/* COMP-01 verbatim reject (only when the ledger actually rejected the submit). */}
      {rejection && <RejectSurface msg={rejection} />}

      {/* Own fill after the batch settles — structural per-party privacy (only the guest
          ever sees this). */}
      <FillCard ctx={ctx} deskKey={GUEST_KEY} />
    </div>
  )
}

export default function JoinView() {
  const { party, token } = tokens.bankD

  return (
    <div style={{ minHeight: '100vh', background: PAPER, color: INK }}>
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '16px' }}>
        {/* Minimal chrome — UMBRA · GUEST wordmark row + DESK D · GUEST tag */}
        <div className="flex items-baseline justify-between" style={{ paddingTop: '8px' }}>
          <div className="flex items-baseline" style={{ gap: '10px' }}>
            <span className="font-display text-30 font-bold" style={{ letterSpacing: '-.02em' }}>
              UMBRA
            </span>
            <span className="font-body text-10 uppercase opacity-55" style={{ letterSpacing: '.16em' }}>
              Guest
            </span>
          </div>
          <span
            className="font-mono text-9 uppercase"
            style={{ letterSpacing: '.16em', border: `1px solid ${INK}`, padding: '3px 7px' }}
          >
            DESK D · GUEST
          </span>
        </div>

        {/* HARD honesty label — red-square mono-9 tag grammar (non-removable contract). */}
        <div
          className="flex items-start font-mono text-9 uppercase"
          style={{ letterSpacing: '.16em', color: RED, gap: '6px', marginTop: '14px', lineHeight: 1.5 }}
        >
          <span
            aria-hidden
            style={{ width: '6px', height: '6px', background: RED, display: 'inline-block', marginTop: '3px', flex: '0 0 auto' }}
          />
          DEV SCOPED TOKEN — NO SECRET IN THE QR · REAL GUEST AUTH IS OIDC (PHASE 12)
        </div>

        <div className="bg-ink" style={{ height: '1px', margin: '18px 0 0' }} />

        {/* Guest headline */}
        <h1
          className="font-display text-40 font-bold"
          style={{ lineHeight: 0.96, letterSpacing: '-.02em', margin: '22px 0 6px' }}
        >
          JOIN THE DARK.
        </h1>
        <div
          className="font-body text-13 uppercase opacity-55"
          style={{ letterSpacing: '.16em', marginBottom: '26px' }}
        >
          Desk D · Guest
        </div>

        {/* Per-party provider — the guest reads/exercises on its OWN scoped connection */}
        <ctxD.DamlLedger token={token} party={party} httpBaseUrl={httpBaseUrlFor(GUEST_KEY)} wsBaseUrl={wsBaseUrl}>
          <JoinBody ctx={ctxD} />
        </ctxD.DamlLedger>
      </main>
    </div>
  )
}
