// QrJoin (WOW-07) — the guest 4th-desk QR host, rendered BELOW the dark stage on
// `03 Theatre`. It encodes the join deep-link (`/join?round=<id>`) as an ink-on-paper
// SVG QR — never a token or secret (buildJoinPayload is URL+roundId only; the scoped
// guest token is delivered server-side, threat T-11-10-QR).
//
// QR contrast rule (11-UI-SPEC, HARD): modules are ink #0A0A0A on a paper #F4F1EA
// quiet-zone ONLY — never lime or red (scannability + palette fidelity). Rendered as an
// <svg> (QRCodeSVG), never an <img>, and with NO external fetch — qrcode.react computes
// the bitmap in-process (package-legitimacy gate: ISC, no install/telemetry scripts).
//
// The block carries the HARD honesty label `DEV TOKEN — PRODUCTION GUEST AUTH IS OIDC
// (PHASE 12)` in the red-square mono-9 tag grammar — a non-removable on-screen contract.
import { QRCodeSVG } from 'qrcode.react'
import { buildJoinPayload } from '../lib/qrPayload'

const INK = '#0A0A0A'
const PAPER = '#F4F1EA'
const RED = '#E2231A'

type Props = {
  roundId: string
}

function joinOrigin(): string {
  return typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://localhost:5173'
}

export default function QrJoin({ roundId }: Props) {
  // URL + roundId ONLY — never a token (buildJoinPayload asserts this; qrPayload.test.ts
  // proves no eyJ/bearer/token substring can appear).
  const payload = buildJoinPayload(joinOrigin(), roundId)

  return (
    <div style={{ border: `1px solid ${INK}`, padding: '24px 22px 26px', maxWidth: '360px' }}>
      {/* Sub-label + heading (font-body sub-label grammar + a mono/display heading) */}
      <div
        className="font-body text-10 uppercase"
        style={{ letterSpacing: '.16em', opacity: 0.55 }}
      >
        Guest · 4th Desk
      </div>
      <div className="font-display text-22 font-bold" style={{ marginTop: '8px', letterSpacing: '-.01em' }}>
        SCAN TO JOIN AS A 4TH DESK
      </div>

      {/* The QR — ink modules on a paper quiet-zone. marginSize gives the quiet zone;
          bgColor keeps it paper. SVG output → stylable ink-on-paper, no external fetch. */}
      <div style={{ background: PAPER, padding: '12px', marginTop: '18px', display: 'inline-block' }}>
        <QRCodeSVG
          value={payload}
          size={160}
          level="M"
          fgColor={INK}
          bgColor={PAPER}
          marginSize={2}
          title="Scan to join Umbra as a 4th desk"
        />
      </div>

      {/* Sub-caption */}
      <div className="font-body text-13" style={{ opacity: 0.7, lineHeight: 1.6, marginTop: '16px' }}>
        Point a phone camera at the code — you become Desk D and submit one sealed bid.
      </div>

      {/* HARD honesty label — red-square mono-9 tag grammar (non-removable). */}
      <div
        className="flex items-center font-mono text-9 uppercase"
        style={{ letterSpacing: '.16em', color: RED, gap: '6px', marginTop: '16px' }}
      >
        <span aria-hidden style={{ width: '6px', height: '6px', background: RED, display: 'inline-block' }} />
        DEV TOKEN — PRODUCTION GUEST AUTH IS OIDC (PHASE 12)
      </div>
    </div>
  )
}
