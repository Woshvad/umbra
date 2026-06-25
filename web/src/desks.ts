// Desk identity metadata — the comp's column codes/roles mapped onto the real
// per-boot desk parties (UI-SPEC "Per-Party Identity", lines 311-318). The browser
// holds ONLY the three desk tokens (web/src/tokens.json); the operator's privileged
// token never enters this bundle (D6 / threat T-03-06).
import tokensJson from './tokens.json'
import { JSON_API_URL } from './config'
import type { DeskKey } from './ledgerContexts'

export type DeskToken = { party: string; token: string }
export const tokens = tokensJson as Record<DeskKey, DeskToken>

// Column code + role + book side, transcribed from the binding comp (BLUEROCK Buyer /
// MERIDIAN Seller / HALWARD Seller — UI-SPEC line 222 + 283).
export type DeskMeta = { key: DeskKey; code: string; role: string }

export const DESKS: DeskMeta[] = [
  { key: 'bankA', code: 'BLUEROCK', role: 'Buyer' },
  { key: 'bankB', code: 'MERIDIAN', role: 'Seller' },
  { key: 'bankC', code: 'HALWARD', role: 'Seller' },
]

// Same-origin base via the Vite proxy — but @daml/ledger's Ledger constructor
// REQUIRES an absolute `http(s)://…/` URL (it throws "httpBaseUrl must start with
// 'http://'…" on a bare '/'). So resolve the live same-origin absolute URL at the
// call site: the browser still talks to Vite (:5173), which proxies /v1 -> :7575.
// (config.JSON_API_URL='/' is kept as the documented same-origin marker.)
void JSON_API_URL
export const httpBaseUrl =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/`
    : 'http://localhost:5173/'
export const wsBaseUrl =
  typeof window !== 'undefined'
    ? `ws://${window.location.host}/`
    : 'ws://localhost:5173/'
