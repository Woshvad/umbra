---
phase: 12-real-on-chain-canton-devnet
plan: 02
subsystem: auth
tags: [oidc, keycloak, jose, pkce, jwks, client-credentials, dual-mode, four-eyes, IDEN-01, IDEN-02, IDEN-03]

# Dependency graph
requires:
  - phase: 12-real-on-chain-canton-devnet
    plan: 01
    provides: "On-ledger four-eyes ClearingApproval gate + Round.Clear approvalCid field (the seam this plan's solver wiring requests/collects/threads)"
  - phase: 11-settlement-institutional-grade
    provides: "solver/src/ledger.ts operator-authority v2 client (resolveOperator credential seam), api.ts §11 surface, mint-jwt.mjs dev token (aud https://canton.network.global)"
provides:
  - "Dual-mode operator credential: OIDC_ISSUER set => client-credentials RS256 (auth.ts acquireToken) + jose JWKS verify; unset => unchanged dev HMAC (scripts/.operator-token)"
  - "solver/src/auth.ts: acquireToken() + verifyToken() (createRemoteJWKSet + jwtVerify pinned RS256, audience https://canton.network.global); OIDC_CLIENT_SECRET module-private"
  - "web/src/auth/oidc.ts: oidc-client-ts UserManager auth-code + PKCE (public umbra-web client, NO secret) + dev-token fallback (tokens.json)"
  - "Solver four-eyes wiring: gatherApprovalCid (request => compliance-approve => collect) threaded into settle() + tamperClear() Round.Clear"
  - "OIDC env placeholders: .env.example (OIDC_ISSUER/JWKS_URL/CLIENT_ID/CLIENT_SECRET/OPERATOR_PARTY) + web/.env.example (VITE_OIDC_AUTHORITY)"
affects: [12-03-keycloak-tls, 12-04-devnet-splice, 12-05-four-eyes-ui]

# Tech tracking
tech-stack:
  added:
    - "jose@6.2.3 (solver — RS256 JWKS verify: createRemoteJWKSet + jwtVerify)"
    - "oidc-client-ts@3.5.0 (web — auth-code + PKCE UserManager)"
  patterns:
    - "Dual-mode credential seam selected by env (OIDC_ISSUER set => OIDC; unset => dev HMAC); only the signing alg + key source change, audience is identical"
    - "Async bearer resolution: authHeaders() awaits a cached/refreshed OIDC token (exp-aware) or the static dev token; api.ts/index.ts signatures untouched"
    - "Public PKCE web client — secret-less by construction; oidc-client-ts runtime dynamically imported (browser-only) so node unit tests stay pure"
    - "Four-eyes request/collect: operator proposes ClearingApprovalRequest, distinct-when-configured Compliance exercises ApproveClearing, operator collects + threads the ClearingApproval cid (mirrors the orderCids gather)"

key-files:
  created:
    - "solver/src/auth.ts"
    - "solver/src/auth.test.ts"
    - "web/src/auth/oidc.ts"
    - "web/src/auth/oidc.test.ts"
  modified:
    - "solver/src/ledger.ts"
    - "solver/src/ledger.test.ts"
    - "solver/package.json"
    - "web/package.json"
    - ".env.example"
    - "web/.env.example"

key-decisions:
  - "Registry path taken (NOT the offline fallback): npm reachable — jose@6.2.3 + oidc-client-ts@3.5.0 installed --legacy-peer-deps; re-verified no preinstall/install/postinstall; official repos panva/jose + authts/oidc-client-ts"
  - "authHeaders() made async so the OIDC bearer can be acquired/refreshed on demand (exp-aware cache, 30s skew); the dev path resolves synchronously to the static HS256 token (byte-unchanged behaviour), proven by the unchanged ledger.test refreshStats/tamper tests"
  - "OIDC client secret lives ONLY in auth.ts (read lazily inside acquireToken's request body); never returned/logged; the web client is a public PKCE client with NO secret (comment-stripped ?raw source scan + built-bundle grep both clean)"
  - "Solver dev four-eyes may run operator-held compliance when no scripts/.compliance-token exists (honest degraded mode); the REAL distinct-authority SEPARATION is proven by daml test (12-01) and is live UAT"
  - "jose v6 dropped the KeyLike type export — auth.test infers KeyPair/PrivKey from generateKeyPair's result type"

patterns-established:
  - "Mocked-issuer offline auth test: jose.generateKeyPair(RS256) + a stubbed fetch serving a local JWKS + /token proves acquire + verify (accept/reject axes) with no real Keycloak"

requirements-completed: [IDEN-01, IDEN-02]

# Metrics
duration: ~26min
completed: 2026-07-10
---

# Phase 12 Plan 02: OIDC Dual-Mode Auth (IDEN-01/02) + Four-Eyes Solver Wiring (IDEN-03) Summary

**Real OIDC on the DevNet/prod path — solver client-credentials + jose JWKS RS256 verify, web auth-code/PKCE (secret-less public client) — added ALONGSIDE the unchanged unsafe-HMAC LocalNet dev loop (dual-mode, env-selected), plus the solver four-eyes request/collect wiring that threads a compliance-signed ClearingApproval into Round.Clear. Every live token exchange is offline-mocked here; the dev path stays byte-unchanged.**

## Dependency path taken

**Registry path (NOT the offline fallback).** npm was reachable, so `jose@6.2.3` (solver) and `oidc-client-ts@3.5.0` (web) were installed `--legacy-peer-deps` (the repo's zod@3.23.8/@daml precedent). Legitimacy re-verified at install: no `preinstall`/`install`/`postinstall` scripts on either (oidc-client-ts carries only dev-time `prepare`/`prepack` that never run for consumers); official repos `panva/jose` + `authts/oidc-client-ts`. The full `jose`-backed JWKS-verify defense-in-depth and the web PKCE client are both shipped — the reduced-defense offline fallback was not needed.

## Accomplishments

- **`solver/src/auth.ts`** — `acquireToken()` (client-credentials form-POST to `${OIDC_ISSUER}/protocol/openid-connect/token`, returns the access_token) + `verifyToken()` (`createRemoteJWKSet` + `jwtVerify` pinned `algorithms: ['RS256']`, `audience: https://canton.network.global`). `OIDC_CLIENT_SECRET` is read lazily, module-private, and never returned/logged.
- **`ledger.ts` dual-mode `resolveOperator`** — `OIDC_MODE = Boolean(process.env.OIDC_ISSUER)`. OIDC: party from `OIDC_OPERATOR_PARTY`/parties.json + a cached, exp-aware client-credentials bearer. Dev (unset): the existing `scripts/.operator-token` HS256 read, **byte-unchanged**. `authHeaders()` became async; `api.ts`/`index.ts` signatures untouched.
- **`solver/src/auth.test.ts`** — mocked-issuer offline proof: `jose.generateKeyPair('RS256')` + a stubbed `fetch` serving a local JWKS + `/token`. `acquireToken()` posts `grant_type=client_credentials` and returns the token; `verifyToken()` ACCEPTS correct-audience and REJECTS wrong-audience / wrong-key / expired (3 axes) + a secret-sweep on a failed acquisition. 6 tests.
- **`web/src/auth/oidc.ts`** — `oidc-client-ts` `UserManager` (`authority` = `VITE_OIDC_AUTHORITY`, `client_id: 'umbra-web'` PUBLIC, `response_type: 'code'` PKCE, `scope: 'openid daml_ledger_api'`, `${origin}/callback`) + `signinRedirect`/`completeSignin`/`getAccessToken`. DUAL-MODE: authority unset ⇒ pre-minted dev token from `tokens.json` (unchanged). NO client secret; runtime dynamically imported so node tests stay pure.
- **`web/src/auth/oidc.test.ts`** — PKCE config (`response_type: 'code'`, no `client_secret` key), dev-token fallback, and a comment-stripped `?raw` source scan proving the secret string is absent. 8 tests.
- **Solver four-eyes wiring** — `gatherApprovalCid(roundId, price)` proposes a `ClearingApprovalRequest`, the (distinct-when-configured) Compliance party exercises `ApproveClearing`, and the operator collects + threads the resulting `ClearingApproval` cid into `Round.Clear`. Wired into both `settle()` and `tamperClear()` (the four-eyes field is required since 12-01; the §8 backstop still fires before the approval fetch so the tamper demo is intact).
- **OIDC env placeholders** — `.env.example`: `OIDC_ISSUER` / `OIDC_JWKS_URL` / `OIDC_CLIENT_ID=umbra-solver` / `OIDC_CLIENT_SECRET` / `OIDC_OPERATOR_PARTY` (server-side, placeholders only). `web/.env.example`: `VITE_OIDC_AUTHORITY` (public). No real secret committed.

## Dual-mode preserved (proof)

- **Dev HMAC path byte-unchanged:** `ledger.test.ts` refreshStats + tamperClear tests (which run with `OIDC_ISSUER` unset → dev branch) stay green untouched; `authHeaders()` resolves synchronously to the static token on that path.
- **OIDC path unit-tested offline:** `auth.test.ts` proves acquire + verify against a mocked issuer (no real Keycloak / network).
- **Env isolation confirmed:** `auth.test.ts` sets `process.env.OIDC_ISSUER` for the mocked issuer, yet the full solver suite (incl. `ledger.test.ts` in dev mode) stays 150/150 green — vitest per-file isolation holds.

## Secret-absent proof

- `solver/src/auth.ts`: `OIDC_CLIENT_SECRET` appears ONLY in a comment, its lazy resolver, and the `acquireToken` request body — never in a return value or a `console.*` line (grep-verified). The failed-acquisition test asserts the thrown error + all logs are free of the sentinel secret.
- `web/src/auth/oidc.ts`: comment-stripped source contains no `client_secret` and no `secret` string (test-enforced). Built bundle grep: `client_secret`, `OIDC_CLIENT_SECRET`, `umbra-solver` all absent (0 matches) — the confidential secret never reaches the browser.

## Task Commits

1. **Task 1: install jose (solver) + oidc-client-ts (web)** — `2d7641f` (chore)
2. **Task 2: dual-mode operator credential — auth.ts + ledger.ts** — `9ad7002` (feat)
3. **Task 3: mocked-issuer offline auth test** — `5d5aaa9` (test) + `cdd767a` (fix — jose v6 KeyLike)
4. **Task 4: web desk PKCE login (oidc.ts + oidc.test.ts)** — `e1f958e` (feat)
5. **Task 5: four-eyes request/collect wiring + OIDC env placeholders** — `c587835` (feat)

## Files Created/Modified

- `solver/src/auth.ts` (created) — `acquireToken` + `verifyToken`; module-private OIDC secret.
- `solver/src/auth.test.ts` (created) — mocked-issuer JWKS verify + client-credentials (6 tests).
- `web/src/auth/oidc.ts` (created) — PKCE `UserManager` + dev-token fallback; secret-less.
- `web/src/auth/oidc.test.ts` (created) — PKCE config + dev-fallback + secret scan (8 tests).
- `solver/src/ledger.ts` (modified) — dual-mode `resolveOperator`, async `authHeaders`, `gatherApprovalCid`, four-eyes threading in `settle`/`tamperClear`, optional compliance bearer.
- `solver/src/ledger.test.ts` (modified) — mock handles `ApproveClearing` + captures `approvalCid`; 3 new settle four-eyes tests.
- `solver/package.json` / `web/package.json` (modified) — deps pinned exact.
- `.env.example` / `web/.env.example` (modified) — OIDC placeholders (no secrets).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jose v6 dropped the `KeyLike` type export**
- **Found during:** Task 5 (`tsc --noEmit` after the four-eyes wiring surfaced a pre-existing type error in the Task-3 auth.test.ts)
- **Issue:** `import { type KeyLike } from 'jose'` failed under jose@6 (`Module '"jose"' has no exported member 'KeyLike'`) — the alias was removed in v6.
- **Fix:** infer the key types from `generateKeyPair`'s result (`type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>`); no behaviour change, tests still 6/6.
- **Files modified:** `solver/src/auth.test.ts`
- **Commit:** `cdd767a`

### Benign design choices (plan-permitted discretion)

- **`authHeaders()` made async** — the plan said "do not touch api.ts/index.ts signatures"; those are untouched. Making the internal `authHeaders` async (all call sites already `await` inside async fns) was the minimal way to support an on-demand OIDC bearer without changing the exported surface.
- **`OIDC_OPERATOR_PARTY` added** — not enumerated in the plan's four keys, but required because an OIDC token carries no party authority (Canton derives rights from the token user, D9). Placeholder-only; falls back to `daml/parties.json` `operator`.
- **Solver compliance credential is optional** — `scripts/.compliance-token` (distinct authority) when present, else operator-held for the dev fast-loop. The plan explicitly allowed "in dev, a dedicated compliance token/party" with live human four-eyes as UAT; the distinct-signatory separation stays proven by `daml test` (12-01).

## Authentication Gates

None encountered — all token exchange is offline-mocked. Live OIDC token exchange against a booted Keycloak + a Canton participant configured for the issuer, and live MFA, are UAT (12-03 ships the Keycloak realm + TLS; live boot is the external/UAT gate).

## Known Stubs

None that block the plan's goal. The OIDC env placeholders are intentionally empty (a committed `.env.example` template; real values live in the gitignored `.env`). The solver's operator-held-compliance dev fallback is a documented, honestly-labeled degraded mode (the real four-eyes separation is the 12-01 `daml test`-proven control + live UAT).

## Honest Limitations (live UAT)

- **Live OIDC exchange is UAT.** `acquireToken`/`verifyToken` are proven offline against a mocked issuer (jose keypair + local JWKS + mock `/token`); a real Keycloak + a Canton participant configured for the issuer (`ledger-api.auth-services = jwt-jwks`), and live MFA, are UAT. The #1 live-failure watch item is the client-credentials service-account `sub` matching `LEDGER_API_ADMIN_USER` with operator rights (RESEARCH Pitfall 3).
- **Web PKCE login is wired but not yet mounted in the app flow.** `oidc.ts` is the module + tested seam; hooking `signinRedirect`/`getAccessToken` into the desk columns + a `/callback` route is Wave-5 UI (12-05). Consequently `oidc-client-ts` is tree-shaken out of the current bundle (dynamic import, no app importer yet) — expected.
- **Live human four-eyes is UAT / Wave-5.** The solver seam (request/collect/thread) + the on-ledger gate (12-01) are built + offline-tested; a real Compliance user approving in the UI is 12-05 + UAT.

## Self-Check: PASSED

- FOUND: `solver/src/auth.ts`, `solver/src/auth.test.ts`, `web/src/auth/oidc.ts`, `web/src/auth/oidc.test.ts`
- FOUND commits: `2d7641f`, `9ad7002`, `5d5aaa9`, `cdd767a`, `e1f958e`, `c587835`
- `cd solver && npx vitest run` → 150/150 green; `tsc --noEmit` clean
- `cd web && npx vitest run` → 85/85 green; `npm run build` green
- Dual-mode: dev HMAC ledger tests unchanged + green; OIDC path unit-tested offline
- Secret-absent: `client_secret`/`OIDC_CLIENT_SECRET`/`umbra-solver` = 0 matches in the built web bundle
- No Claude/AI git attribution (author/committer = woshvad); STATE.md/ROADMAP.md deliberately not modified per plan instructions

---
*Phase: 12-real-on-chain-canton-devnet*
*Completed: 2026-07-10*
