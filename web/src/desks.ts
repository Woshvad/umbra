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

// Same-origin base via the Vite proxy (config.JSON_API_URL = '/'); derive the WS
// base from the live host so streaming hooks connect through the proxy too.
export const httpBaseUrl = JSON_API_URL
export const wsBaseUrl =
  typeof window !== 'undefined'
    ? `ws://${window.location.host}/`
    : 'ws://localhost:5173/'
