// Desk identity metadata — the comp's column codes/roles mapped onto the real
// per-boot desk parties (UI-SPEC "Per-Party Identity", lines 311-318). The browser
// holds ONLY the desk tokens (web/src/tokens.json); the operator's privileged
// token never enters this bundle (D6 / threat T-03-06).
//
// DELIVERY MODEL (was D6 dev-token; now server-side for the public deploy):
// tokens.json is gitignored and carries PUBLIC party ids + a node `base` only. It NO LONGER
// carries a bearer, because `import` makes Vite BUNDLE whatever is in it into the shipped
// client JS — which is survivable for a laptop demo and fatal for a public link (the DevNet
// bearer would be readable by anyone who opens the bundle). The credential now lives in the
// solver and is injected server-side by its ledger proxy (solver/src/ledgerproxy.ts).
//
// `token` therefore stays in the TYPE but is OPTIONAL and normally ABSENT. It is retained
// only so a legacy/LocalNet tokens.json carrying per-desk scoped tokens still works
// byte-unchanged (see httpBaseUrlFor below, which routes such a desk through the Vite dev
// proxy exactly as before). Every consumer reads a normalized `''` when it is absent, and
// every wire call omits the Authorization header entirely for an empty token.
import tokensJson from './tokens.json'
import { JSON_API_URL } from './config'
import { SOLVER_BASE_URL } from './solver'
import type { DeskKey } from './ledgerContexts'

export type DeskToken = { party: string; token: string; base?: string }

// Normalize the raw JSON so an absent `token` reads as '' rather than undefined — this keeps
// every existing consumer (`const { party, token } = tokens[k]`) type-correct and unchanged.
type RawDeskEntry = { party: string; token?: string; base?: string }
const rawTokens = tokensJson as Record<string, RawDeskEntry>
export const tokens = Object.fromEntries(
  Object.entries(rawTokens).map(([key, entry]) => [
    key,
    { party: entry.party, token: entry.token ?? '', base: entry.base ?? '' },
  ]),
) as Record<DeskKey, DeskToken>

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

// ── The ledger base for a TOKEN-FREE desk (the public-deploy path) ─────────────────
// With no bearer in the bundle the browser cannot talk to the validator at all: it must go
// through the solver's ledger proxy, which injects the credential server-side. That proxy is
// mounted on the SAME service the operator plane already uses, so it rides the SAME single
// base URL (no second host to configure, no second thing to get wrong at deploy time):
//
//   {SOLVER}/cn/devnet/v2/state/active-contracts   ← tokens.json `base` = '/cn/devnet'
//
// VITE_LEDGER_BASE_URL overrides it for the (unusual) split deployment where the ledger proxy
// is not co-hosted with the solver API. Locally both resolve to http://localhost:4100.
const LEDGER_PROXY_ORIGIN = (
  (import.meta.env.VITE_LEDGER_BASE_URL as string | undefined) ?? SOLVER_BASE_URL
).replace(/\/+$/, '')

// Per-desk participant base (the v2 shim appends /v2/...).
//
// Two routes, selected by whether the desk still HAS a client-held token:
//   • token ABSENT (shipped/DevNet): route to the solver's ledger proxy, which attaches the
//     bearer server-side. This is the only route that works for a public static build.
//   • token PRESENT (legacy per-desk LocalNet tokens.json): keep the historical same-origin
//     Vite-dev-proxy route byte-unchanged, so the scoped-token LocalNet loop is unaffected by
//     this deploy work.
export const httpBaseUrlFor = (key: DeskKey): string => {
  const base = tokens[key]?.base ?? ''
  const origin = tokens[key]?.token ? ORIGIN : LEDGER_PROXY_ORIGIN
  return `${origin}${base}/`
}

// Back-compat single base (app-provider) for non-desk-specific callers.
export const httpBaseUrl = `${ORIGIN}/`
export const wsBaseUrl =
  typeof window !== 'undefined'
    ? `ws://${window.location.host}/`
    : 'ws://localhost:5173/'
