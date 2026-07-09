// web/src/lib/peek.ts — pure request-builder + result-classifier for the WOW-01
// adversarial "Try to Peek" console. Authenticated as the CURRENTLY-SELECTED desk's
// OWN token, a raw JSON Ledger API v2 `POST /v2/state/active-contracts` is filtered to
// a RIVAL desk party — the participant returns an empty [] (single-node) or a 403
// (cross-node), and BOTH are valid "privacy enforced at the wire" outcomes (Pitfall 4).
//
// This module is DELIBERATELY pure: it builds the request and classifies the response
// but performs NO fetch, so it is unit-testable without a live ledger. The component
// (PeekConsole) owns the actual fetch and adds the real Authorization header at wire
// time — the full bearer NEVER enters the request body, and only an elided form is ever
// rendered (UI-SPEC: render truncated/elided; threat T-08-02-BEARER).
//
// Wire shape mirrors web/src/ledger/v2react.tsx fetchAcs (L75-85) EXACTLY:
//   GET  /v2/state/ledger-end            → { offset }
//   POST /v2/state/active-contracts      { filter:{ filtersByParty:{ [party]:{} } },
//                                          verbose:true, activeAtOffset }
// The peek asks for ALL of the rival's contracts (filtersByParty[party] = {}), then
// client-filters to the requested template for display (filterRowsByTemplate).

// ── Verdict copy (VERBATIM from 08-UI-SPEC.md Copywriting — do not edit the glyphs) ──
export const VERDICT_EMPTY = '0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE'
export const VERDICT_FORBIDDEN = '403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL'
// The "should never happen" branch — a real regression must be LOUD, not silent.
export const VERDICT_LEAK = 'LEAK — RIVAL CONTRACTS RETURNED · PRIVACY REGRESSION'

// The two peek targets (module:entity form, as they appear after the pkg-id prefix in
// a v2 createdEvent.templateId "<pkgid>:Umbra.Auction:Order"). A second target proves
// privacy is structural (signatory/observer), not Order-specific.
export const PEEK_TEMPLATES = {
  Order: 'Umbra.Auction:Order',
  TradeConfirmation: 'Umbra.Auction:TradeConfirmation',
} as const

export type PeekTemplate = (typeof PEEK_TEMPLATES)[keyof typeof PEEK_TEMPLATES]

// The active-contracts request body — byte-mirrors fetchAcs. NO token, NO template on
// the wire (the query is unfiltered by template; the display filters client-side).
export interface PeekRequestBody {
  filter: { filtersByParty: Record<string, Record<string, never>> }
  verbose: true
  activeAtOffset: number
}

export interface PeekRequest {
  url: string
  method: 'POST'
  body: PeekRequestBody
  // Display-only elided auth header — never the full bearer (T-08-02-BEARER).
  authHeaderDisplay: string
  // The template we intend to client-filter for on display (echoed, not on the wire).
  template: PeekTemplate
}

// A minimal shape of a v2 createdEvent row (we read only templateId for display filter).
export interface PeekRow {
  templateId: string
}

export interface PeekOutcome {
  empty?: boolean
  forbidden?: boolean
  leak?: boolean
  verdict: string
}

// Truncate a bearer to its first 8 chars + a single ellipsis. NEVER returns the full
// token — the console renders only this form in the REQUEST pane (UI-SPEC).
export const elideBearer = (token: string): string => `Bearer ${token.slice(0, 8)}…`

// Build the raw v2 active-contracts request as `thisDeskToken`'s desk, filtered to
// `rivalParty`. `base` is the desk's OWN node base (desks.ts httpBaseUrlFor) so the
// query hits the right participant (Pitfall 4). The token is used ONLY to derive the
// elided display header — it is never placed in the body.
export const buildPeekRequest = (
  base: string,
  thisDeskToken: string,
  rivalParty: string,
  template: PeekTemplate,
  activeAtOffset: number,
): PeekRequest => ({
  url: `${base}v2/state/active-contracts`,
  method: 'POST',
  body: {
    filter: { filtersByParty: { [rivalParty]: {} } },
    verbose: true,
    activeAtOffset,
  },
  authHeaderDisplay: elideBearer(thisDeskToken),
  template,
})

// Client-side display filter: keep only rows whose templateId resolves to the requested
// module:entity form ("<pkgid>:Umbra.Auction:Order" → "Umbra.Auction:Order").
export const filterRowsByTemplate = <T extends PeekRow>(rows: T[], template: PeekTemplate): T[] =>
  rows.filter((r) => moduleEntityOf(r.templateId) === template)

// "<pkgid>:Umbra.Auction:Order" → "Umbra.Auction:Order"
const moduleEntityOf = (templateId: string): string => templateId.split(':').slice(1).join(':')

// Classify a peek response into a UI-SPEC verdict. A 403 (cross-node refusal) and an
// empty array (single-node structural blindness) are BOTH "privacy enforced". A
// non-empty rival array should be impossible — surface it as a loud leak so a real
// regression is unmissable.
export const classifyPeekResult = (status: number, rows: PeekRow[] | null | undefined): PeekOutcome => {
  if (status === 403) return { forbidden: true, verdict: VERDICT_FORBIDDEN }
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return { empty: true, verdict: VERDICT_EMPTY }
  return { leak: true, verdict: VERDICT_LEAK }
}
