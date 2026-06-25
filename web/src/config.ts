// Single drift constants for the JSON API wiring (RESEARCH Pitfall 2).
//
// JSON_API_URL is '/' because the Vite dev server proxies /v1 -> :7575
// (web/vite.config.ts), so the browser talks same-origin to Vite. Pass this as
// `httpBaseUrl` to @daml/ledger / @daml/react; derive the WS base from it at the
// call site (`ws://${location.host}/`).
export const JSON_API_URL = '/'

// The Canton sandbox ledger/participant id baked into every per-party JWT claim.
// Defaults to "sandbox" (docs.daml.com); Plan 03-03 verifies it live against
// /v1/query before relying on it. Keep this and scripts/mint-tokens.mjs in sync.
export const DAML_LEDGER_ID = 'sandbox'
