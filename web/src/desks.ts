// Desk identity metadata — the comp's column codes/roles mapped onto the real
// per-boot desk parties (UI-SPEC "Per-Party Identity", lines 311-318). The browser
// holds ONLY the desk tokens (web/src/tokens.json); the operator's privileged
// token never enters this bundle (D6 / threat T-03-06).
//
// HONEST DELIVERY MODEL (D6 dev-token): tokens.json is gitignored (never committed to
// source), but this `import` makes Vite BUNDLE the desk tokens into the shipped client JS —
// they are browser-readable DEV-scoped tokens (each actAs/readAs its own desk only), not a
// server-side-held secret. Real per-party auth is OIDC (Phase 12).
import tokensJson from './tokens.json'
import { JSON_API_URL } from './config'
import type { DeskKey } from './ledgerContexts'

export type DeskToken = { party: string; token: string; base?: string }
export const tokens = tokensJson as Record<DeskKey, DeskToken>

// Column code + role + book side, transcribed from the binding comp (BLUEROCK Buyer /
// MERIDIAN Seller / HALWARD Seller — UI-SPEC line 222 + 283).
export type DeskMeta = { key: DeskKey; code: string; role: string }

export const DESKS: DeskMeta[] = [
  { key: 'bankA', code: 'BLUEROCK', role: 'Buyer' },
  { key: 'bankB', code: 'MERIDIAN', role: 'Seller' },
  { key: 'bankC', code: 'HALWARD', role: 'Seller' },
]

// WOW-07 guest 4th desk (bankD). Deliberately a SEPARATE export — NOT a member of
// `DESKS` — so the desktop PartySwitcher/Header keep iterating exactly the three
// primary desks (guest is mobile-/join-only per UI-SPEC; the topology GUEST card
// appears only once a guest has actually joined). Consumers that need the guest
// (the /join route, TopologyView) reference this directly.
export const GUEST: DeskMeta = { key: 'bankD', code: 'GUEST', role: 'Guest' }

// Every desk this app can resolve — the three primary desks plus the WOW-07 guest.
const ALL_DESKS: DeskMeta[] = [...DESKS, GUEST]

// Resolve a live desk PARTY id to its DeskKey.
//
// PARTY-ID SHAPE IS NOT CONTRACTUAL. This used to parse the prefix before "::" and assume it
// WAS the DeskKey — true only because the LocalNet boot allocates bare `bankA` hints, giving
// `bankA::<fingerprint>`. The shared FiveNorth DevNet validator also hosts other teams'
// parties, so scripts/devnet/up.mjs namespaces the hint to avoid collisions and a desk's real
// party is `umbra-bankA-<ts>::<fingerprint>` — whose prefix is NOT "bankA". Prefix parsing
// silently resolved to undefined there: the Time Machine replayed no orders, and Settlement /
// Agent surfaced a raw `umbra-bankA-…::1220a14c…` where the comp demands BLUEROCK.
//
// So resolve by EXACT IDENTITY against tokens.json — the source of truth for which party each
// desk actually IS — which is independent of however the id happens to be shaped. The prefix
// match survives only as a FALLBACK (a LocalNet-shaped id still resolves if tokens.json is
// stale or absent); exact identity always wins.
export const deskKeyForParty = (party: string): DeskKey | undefined => {
  const exact = ALL_DESKS.find((d) => tokens[d.key]?.party === party)
  if (exact) return exact.key
  const prefix = party.split('::')[0]
  return ALL_DESKS.find((d) => d.key === prefix)?.key
}

// Resolve a live desk PARTY id to its comp display CODE (BLUEROCK/MERIDIAN/HALWARD, or GUEST).
// The solver returns allocations keyed by the full party id; the comp + the BEFORE balances are
// keyed by code. Falls back to the raw value if unmatched (never throws).
export const codeForParty = (party: string): string => {
  const key = deskKeyForParty(party)
  return ALL_DESKS.find((d) => d.key === key)?.code ?? party
}

// Same-origin base for the v2 shim (web/src/ledger/v2react.tsx), which appends
// /v2/... paths. The browser talks to Vite (:5173), which proxies to a Canton
// participant. For §19 cross-node, EACH desk routes to its OWN node via a per-desk
// proxy path from tokens.json `base`: '/cn/app-user' → :2975, '/cn/sv' → :4975,
// '' → app-provider :3975 (the single-node default). Each desk's JWT is forwarded.
// (config.JSON_API_URL='/' stays the same-origin marker; wsBaseUrl is retained for
// the DamlLedger prop but unused — the v2 shim polls, not streams.)
void JSON_API_URL
const ORIGIN =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'http://localhost:5173'

// Per-desk participant base (the v2 shim appends /v2/...). Defaults to app-provider.
export const httpBaseUrlFor = (key: DeskKey): string => `${ORIGIN}${tokens[key]?.base ?? ''}/`

// Back-compat single base (app-provider) for non-desk-specific callers.
export const httpBaseUrl = `${ORIGIN}/`
export const wsBaseUrl =
  typeof window !== 'undefined'
    ? `ws://${window.location.host}/`
    : 'ws://localhost:5173/'
