// web/src/lib/peek.ts — pure request-builder + result-classifier for the WOW-01
// adversarial "Try to Peek" console.
//
// ── WHAT THIS PROVES (and what it deliberately does NOT) ─────────────────────────────
// Canton disclosure is **stakeholder/informee-based, not token-based**: a party is shown a
// contract only if it is a signatory/observer of that contract. So the peek asks the ledger,
// **as the peeking desk's OWN party**, to hand over a RIVAL's contract by contract id:
//
//   POST {base}v2/events/events-by-contract-id
//   { contractId: "<rival cid>",
//     eventFormat: { filtersByParty: { "<MY party>": { cumulative: [] } }, verbose: true } }
//
// Verified live on the FiveNorth DevNet sandbox with the SAME bearer for both calls:
//   requestingParty = bankA (NOT a stakeholder) → HTTP 404 CONTRACT_EVENTS_NOT_FOUND
//                                                 "Contract events not found, or not visible."
//   requestingParty = bankB (the owner)         → HTTP 200 { created: { createdEvent: {…} } }
// (`eventFormat` is MANDATORY — omitting it returns HTTP 400 MISSING_FIELD "event_format".)
//
// WHY THIS MECHANISM AND NOT THE OLD ONE (spec deviation, see 08-UI-SPEC.md WOW-01): the
// previous peek issued `POST /v2/state/active-contracts` filtered to the RIVAL party using the
// active desk's token — i.e. it asked the ledger **as the rival**. That tests *credential
// scoping* (an ops property), not ledger-enforced projection. It 403s on LocalNet (per-desk
// scoped tokens) but SUCCEEDS on DevNet, where all three desks share one m2m bearer holding
// readAs on every party — rendering a FALSE `VERDICT_LEAK` privacy-regression banner on the
// money-shot panel. Asking as our OWN party means the token always permits the requesting
// party, so there is no auth divergence: **LocalNet and DevNet both return the same 404**.
// One proof, one verdict, both nets.
//
// ── HONEST LIMITATION (do not overstate — this must stay documented) ─────────────────
// This proves the ledger will not disclose to a **non-stakeholder PARTY**. It does NOT prove
// one desk's **CREDENTIAL** cannot impersonate another: on DevNet a holder of the shared
// bearer could simply ask as bankB. Per-desk m2m clients remain the only fix for credential
// isolation. See docs/DEVNET.md.
//
// This module is DELIBERATELY pure: it builds requests and classifies responses but performs
// NO fetch, so it is unit-testable without a live ledger. The component (PeekConsole) owns the
// actual fetch and adds the real Authorization header at wire time — the full bearer NEVER
// enters a request body, and only an elided form is ever rendered (UI-SPEC: render
// truncated/elided; threat T-08-02-BEARER).

// ── Verdict copy (VERBATIM from 08-UI-SPEC.md Copywriting — do not edit the glyphs) ──
export const VERDICT_EMPTY = '0 RIVAL ORDERS RETURNED — PRIVACY ENFORCED AT THE WIRE'
export const VERDICT_FORBIDDEN = '403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL'
// The informee refusal — mirrors the 403 grammar (short, uppercase, declarative).
export const VERDICT_NOT_INFORMEE = '404 — LEDGER REFUSED THE READ · NOT AN INFORMEE'
// The "should never happen" branch — a real regression must be LOUD, not silent.
export const VERDICT_LEAK = 'LEAK — RIVAL CONTRACTS RETURNED · PRIVACY REGRESSION'

// The v2 error code the participant returns when the requesting party is not an informee of
// the contract (also returned for a genuinely unknown cid — both mean "not visible to you").
export const CONTRACT_EVENTS_NOT_FOUND = 'CONTRACT_EVENTS_NOT_FOUND'

// The two peek targets (module:entity form, as they appear after the pkg-id prefix in
// a v2 createdEvent.templateId "<pkgid>:Umbra.Auction:Order"). A second target proves
// privacy is structural (signatory/observer), not Order-specific.
export const PEEK_TEMPLATES = {
  Order: 'Umbra.Auction:Order',
  TradeConfirmation: 'Umbra.Auction:TradeConfirmation',
} as const

export type PeekTemplate = (typeof PEEK_TEMPLATES)[keyof typeof PEEK_TEMPLATES]

// ── Step 1: out-of-band cid discovery (the deliberate gift to the attacker) ──────────
// The active-contracts request body — byte-mirrors v2react.tsx fetchAcs (L82-88). NO token,
// NO template on the wire (the query is unfiltered by template; the display filters
// client-side).
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

// ── Step 2: the actual peek — events-by-contract-id AS OUR OWN PARTY ─────────────────
export interface InformeePeekRequestBody {
  contractId: string
  eventFormat: {
    // `cumulative: []` = no template/interface narrowing — ask for the event outright.
    filtersByParty: Record<string, { cumulative: [] }>
    verbose: true
  }
}

export interface InformeePeekRequest {
  url: string
  method: 'POST'
  body: InformeePeekRequestBody
  // Display-only elided auth header — never the full bearer (T-08-02-BEARER).
  authHeaderDisplay: string
  // The party we ask AS — our own. Echoed for the REQUEST pane.
  requestingParty: string
  // The template whose rival cid we targeted (echoed, not on the wire).
  template: PeekTemplate
}

// A minimal shape of a v2 createdEvent row (templateId for the display filter; contractId is
// what the discovery read exists to obtain).
export interface PeekRow {
  templateId: string
  contractId?: string
}

export interface PeekOutcome {
  empty?: boolean
  forbidden?: boolean
  notInformee?: boolean
  leak?: boolean
  // Neither a privacy result nor a leak (e.g. 400/500, or a 404 that is not the informee
  // refusal). The console must render this plainly and WITHHOLD the verdict row — an
  // inconclusive wire error must never masquerade as "privacy enforced" (T-08-02-NODE).
  inconclusive?: boolean
  verdict: string
}

// Truncate a bearer to its first 8 chars + a single ellipsis. NEVER returns the full
// token — the console renders only this form in the REQUEST pane (UI-SPEC).
export const elideBearer = (token: string): string => `Bearer ${token.slice(0, 8)}…`

// Build the raw v2 active-contracts request for `party`, as `thisDeskToken`'s desk. `base` is
// the node base the query should hit (desks.ts httpBaseUrlFor) so it reaches the right
// participant (Pitfall 4). The token is used ONLY to derive the elided display header — it is
// never placed in the body.
//
// In the shipped flow this is the DISCOVERY read, and it is issued with the RIVAL's OWN token
// for the RIVAL's OWN party — a legitimate self-read that any desk can make of its own book.
// bankA could never obtain bankB's cid legitimately; that is exactly the point. We hand it to
// the attacker anyway (the demo bundle carries all three desk tokens for the party switcher),
// because the proof is STRONGER when the attacker is given more than it could ever get.
export const buildPeekRequest = (
  base: string,
  thisDeskToken: string,
  party: string,
  template: PeekTemplate,
  activeAtOffset: number,
): PeekRequest => ({
  url: `${base}v2/state/active-contracts`,
  method: 'POST',
  body: {
    filter: { filtersByParty: { [party]: {} } },
    verbose: true,
    activeAtOffset,
  },
  authHeaderDisplay: elideBearer(thisDeskToken),
  template,
})

// Build the informee peek: ask the ledger, AS `ownParty` (the peeking desk's own party, with
// the peeking desk's own token), to disclose `rivalContractId`. Because we ask as ourselves the
// token always permits the requesting party — so the ONLY thing that can refuse us is Canton's
// stakeholder projection. That is the whole proof, and it is identical on LocalNet and DevNet.
// The token is used ONLY to derive the elided display header — never placed in the body.
export const buildInformeePeekRequest = (
  base: string,
  thisDeskToken: string,
  ownParty: string,
  rivalContractId: string,
  template: PeekTemplate,
): InformeePeekRequest => ({
  url: `${base}v2/events/events-by-contract-id`,
  method: 'POST',
  body: {
    contractId: rivalContractId,
    // `eventFormat` is mandatory — omitting it → HTTP 400 MISSING_FIELD "event_format".
    eventFormat: { filtersByParty: { [ownParty]: { cumulative: [] } }, verbose: true },
  },
  authHeaderDisplay: elideBearer(thisDeskToken),
  requestingParty: ownParty,
  template,
})

// Client-side display filter: keep only rows whose templateId resolves to the requested
// module:entity form ("<pkgid>:Umbra.Auction:Order" → "Umbra.Auction:Order").
export const filterRowsByTemplate = <T extends PeekRow>(rows: T[], template: PeekTemplate): T[] =>
  rows.filter((r) => moduleEntityOf(r.templateId) === template)

// "<pkgid>:Umbra.Auction:Order" → "Umbra.Auction:Order"
const moduleEntityOf = (templateId: string): string => templateId.split(':').slice(1).join(':')

// Extract v2 ACS createdEvent rows (entry.contractEntry.JsActiveContract.createdEvent —
// mirrors v2react.tsx fetchAcs L89-91). Used by the DISCOVERY read.
export const extractAcsRows = (parsed: unknown): PeekRow[] =>
  (Array.isArray(parsed) ? parsed : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => e?.contractEntry?.JsActiveContract?.createdEvent)
    .filter((c: unknown): c is PeekRow => !!c && typeof (c as PeekRow).templateId === 'string')

// Extract the createdEvent from a 200 events-by-contract-id body ({ created: { createdEvent } }).
// Returns [] when absent. NOTE: deliberately NOT template-filtered — we targeted one specific
// rival cid, so ANY disclosed createdEvent for it is a leak regardless of template. Filtering
// here could silently downgrade a real disclosure to VERDICT_EMPTY ("privacy enforced"), which
// would make a regression quiet. LEAK detection must stay loud.
export const extractInformeeRows = (parsed: unknown): PeekRow[] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created = (parsed as any)?.created?.createdEvent
  return created && typeof created.templateId === 'string' ? [created as PeekRow] : []
}

// Read the v2 error code off a raw error body ({ code, cause, … }). Returns undefined when the
// body is not a coded v2 error.
export const errorCodeOf = (parsed: unknown): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (parsed as any)?.code
  return typeof code === 'string' ? code : undefined
}

// Classify a peek response into a UI-SPEC verdict.
//   403                                → privacy enforced (credential scoping refused it)
//   404 + CONTRACT_EVENTS_NOT_FOUND    → privacy enforced (we are not an informee) ← the proof
//   200 + the rival's createdEvent     → LEAK (loud — a real regression must be unmissable)
//   200 + nothing                      → privacy enforced at the wire
//   anything else (400/500/other 404)  → INCONCLUSIVE — no verdict, never "enforced"
export const classifyPeekResult = (
  status: number,
  rows: PeekRow[] | null | undefined,
  code?: string,
): PeekOutcome => {
  if (status === 403) return { forbidden: true, verdict: VERDICT_FORBIDDEN }
  if (status === 404 && code === CONTRACT_EVENTS_NOT_FOUND) {
    return { notInformee: true, verdict: VERDICT_NOT_INFORMEE }
  }
  // A non-2xx that is NOT one of the two refusals above proves nothing about privacy.
  if (status < 200 || status > 299) return { inconclusive: true, verdict: '' }
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return { empty: true, verdict: VERDICT_EMPTY }
  return { leak: true, verdict: VERDICT_LEAK }
}
