// Desk identity metadata — the comp's column codes/roles mapped onto the real
// per-boot desk parties (UI-SPEC "Per-Party Identity", lines 311-318). The browser
// holds ONLY the three desk tokens (web/src/tokens.json); the operator's privileged
// token never enters this bundle (D6 / threat T-03-06).
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

// Resolve a live desk PARTY id ("bankA::<fingerprint>") to its comp display CODE
// (BLUEROCK/MERIDIAN/HALWARD). The solver returns allocations keyed by the full party
// id; the comp + the BEFORE balances are keyed by code, and the party-id prefix before
// "::" is exactly the DeskKey. Falls back to the raw value if unmatched (never throws).
export const codeForParty = (party: string): string => {
  const key = party.split('::')[0]
  return DESKS.find((d) => d.key === key)?.code ?? party
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
