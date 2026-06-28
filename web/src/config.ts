// JSON Ledger API v2 wiring constant.
//
// JSON_API_URL stays '/' as the same-origin marker: the Vite dev server proxies
// /v2 -> :3975 (web/vite.config.ts), so the browser talks same-origin to Vite. The
// v2 shim (web/src/ledger/v2react.tsx) builds requests from the live absolute
// same-origin base in web/src/desks.ts (httpBaseUrl) + /v2/... paths.
export const JSON_API_URL = '/'

// The Canton sandbox ledger/participant id baked into every per-party JWT claim.
// Defaults to "sandbox" (docs.daml.com); Plan 03-03 verifies it live against
// /v1/query before relying on it. Keep this and scripts/mint-tokens.mjs in sync.
export const DAML_LEDGER_ID = 'sandbox'
