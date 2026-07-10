---
phase: 14-agentic-payments-x402
plan: 03
subsystem: payments
tags: [x402, wiring, config, di, uat, express-middleware]

# Dependency graph
requires:
  - phase: 14-agentic-payments-x402 (Plan 01)
    provides: "createX402Gate / PaymentGate / X402Options — the DI-defaulted gate bundle wired here"
  - phase: 14-agentic-payments-x402 (Plan 02)
    provides: "createFacilitator (self | canton-cc) + FacilitatorLedger port; ledger.ts listHoldings/moveFee — the settlement backend constructed at boot"
provides:
  - "solver/src/api.ts — AppDeps.x402? optional DI slot + per-route gate attachment on EXACTLY GET /round/:id/solve-preview + POST /competing; DISABLED no-op default"
  - "solver/src/index.ts — X402_* config read (default-OFF) + SecretsProvider facilitator key + createFacilitator→createX402Gate→buildDeps threading"
  - "solver/.env.example — documented X402_* config block (X402_ENABLED=false default)"
  - ".planning/phases/14-agentic-payments-x402/14-UAT.md — the four live/external gates + regression sweep"
affects: [14-UAT live $CC on DevNet]

# Tech tracking
tech-stack:
  added: []  # zero new npm packages — express per-route middleware + existing SecretsProvider seam
  patterns:
    - "Optional DI slot mirroring idempotency? — AppDeps.x402? defaulted ONCE in createApp to a DISABLED no-op (byte-unchanged default-OFF)"
    - "Per-route middleware attachment (the /fix express.text precedent) on EXACTLY the two metered routes — NEVER app.use (no free-path can be metered)"
    - "Three-tier config: non-secret X402_* via process.env ?? default in main(); X402_FACILITATOR_KEY via SecretsProvider.get() (module-private, canton-cc-only)"

key-files:
  created:
    - solver/src/x402.wiring.test.ts
    - .planning/phases/14-agentic-payments-x402/14-UAT.md
  modified:
    - solver/src/api.ts
    - solver/src/index.ts
    - solver/src/x402.ts
    - solver/.env.example

key-decisions:
  - "Relaxed createX402Gate to accept a disabled-only { enabled: false } construction (facilitator + non-enabled options optional) so api.ts's DI default type-checks — Plan 01 had shipped it requiring a full facilitator + options (Rule 3 blocking fix)"
  - "DROPPED the optional /status x402-availability line — PaymentGate exposes only `middleware`, so surfacing enabled/network would need PaymentGate/status.ts surface expansion; the plan marks it droppable, and dropping it keeps the token-free /status contract + secret-sweep untouched"
  - "x402/facilitator constructors dynamically imported in main() after dotenv (the ledger/agent pattern); PaymentGate is a type-only top-level import so index.test.ts stays import-safe"
  - "X402_PAY_TO defaults to ledger.operatorParty (the venue); network/asset/URL are env-driven placeholders (no hard-coded Canton CAIP-2 id / facilitator hostname) — UAT-confirmed via GET /supported"

patterns-established:
  - "Default-OFF whole-app invariant: createApp with NO x402 dep ⇒ createX402Gate({ enabled:false }) ⇒ the two metered routes + the §4 money-shot are byte-unchanged (proven at the whole-app level)"
  - "EXACTLY-two-routes metering: per-route attach + a free-path allow-list test asserting /health,/status,GET /round/:id,/settle,/sandbox/round are NEVER 402"

requirements-completed: [PAY-01]  # COMPLETE — wire+gate (01) + facilitator backends (02) + boot wiring/config/UAT (03)

# Metrics
duration: ~22min
completed: 2026-07-11
---

# Phase 14 Plan 03: x402 Gate Boot Wiring + Config + UAT Summary

**The integration slice that closes PAY-01 offline: an optional `AppDeps.x402` DI slot defaulted to a DISABLED no-op (so existing tests + the §4 money-shot demo are byte-unchanged), `x402.middleware` attached per-route on EXACTLY the two metered AI endpoints, `X402_*` config read in `main()` with the facilitator key resolved through `SecretsProvider`, a documented `.env.example` block, and a `14-UAT.md` recording the four external live gates.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-11
- **Tasks:** 3 (Task 1 api.ts + wiring test; Task 2 index.ts config/threading + .env.example; Task 3 14-UAT.md)
- **Files:** 2 created, 4 modified

## Accomplishments
- **Optional DI gate in `api.ts`** — `AppDeps.x402?: PaymentGate` next to `idempotency?`; `createApp` defaults it ONCE to `deps.x402 ?? createX402Gate({ enabled: false })` (a byte-identical no-op). `x402.middleware` is attached PER-ROUTE (before `wrap()`) on EXACTLY `GET /round/:id/solve-preview` and `POST /competing` — never `app.use`, so no free/lifecycle/settlement path can ever be metered (T-14-11).
- **`X402_*` config + facilitator/gate construction in `index.ts`** — `main()` reads `X402_ENABLED` (default false), `X402_FACILITATOR` (self|canton-cc), `X402_NETWORK`, `X402_ASSET`, `X402_PRICE`, `X402_PAY_TO` (default `ledger.operatorParty`), `X402_FACILITATOR_URL` via `process.env.X ?? default`; resolves `X402_FACILITATOR_KEY` through the SAME `SecretsProvider` seam as `ANTHROPIC_API_KEY` (try/catch, module-private, degrades to undefined). It builds the `FacilitatorLedger` port from `ledger.listHoldings`/`moveFee` → `createFacilitator` → `createX402Gate` → threads the gate through `buildDeps({ x402 })`. `BuildDepsArgs.x402?` returns onto `AppDeps.x402` (undefined ⇒ createApp's disabled default holds).
- **`.env.example` documentation** — a `── PAY-01 x402 metered access ──` block documenting every `X402_*` key, with `X402_ENABLED=false` stated as the default that keeps the money-shot demo byte-unchanged, the USDCx-2dp price scale, the env-driven UAT-confirmed network/asset/URL placeholders, and the server-side-only `X402_FACILITATOR_KEY`.
- **`14-UAT.md`** — the four external live gates (real x402 client end-to-end; `self` USDCx on live DevNet; `canton-cc` real $CC via the FTP facilitator = the Phase-12-style SV-sponsorship gate; exact CAIP-2/asset/version via `GET /supported`), each with an enable/run command + expected observable + an honest "offline-verified / self-covered-today" label; plus the pre-verification regression sweep. Explicitly states none block the offline build.
- **Whole-app wiring test** (`x402.wiring.test.ts`, 6 tests) — default-OFF byte-unchanged (§4 $100.00 through both metered routes with no gate), metering-on ⇒ both routes 402 with `accepts[]`, the free-path allow-list (/health, /status, GET /round/:id, /settle, /sandbox/round NEVER 402), a secret-sweep, and the `buildDeps` threading proof.
- **Full regression green:** solver **331/331** vitest; `tsc` clean of new errors; `daml test` **`test_clears_at_100: ok`** (§4 golden still $100.00); grep invariants confirmed (`x402.middleware` on exactly 2 routes, no `app.use(x402`, `X402_ENABLED=false` default, no secret in the boot log, CORS `ALLOWED_ORIGIN` unchanged).

## Task Commits

1. **Task 1: attach the gate in api.ts (optional DI, per-route, allow-list-safe)** — `100b818` (feat)
2. **Task 2: X402_* config + facilitator/gate boot wiring in index.ts + .env.example** — `e9d0df4` (feat)
3. **Task 3: 14-UAT.md — the four live/external gates + regression sweep** — `dfbe212` (docs)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `solver/src/api.ts` — `AppDeps.x402?: PaymentGate`; `createApp` defaults `deps.x402 ?? createX402Gate({ enabled: false })`; `x402.middleware` per-route on the two metered endpoints; imports `createX402Gate`/`PaymentGate` from `./x402.js`.
- `solver/src/index.ts` — `BuildDepsArgs.x402?` threaded through `buildDeps` onto `AppDeps`; `main()` reads the `X402_*` config, resolves the facilitator key via `SecretsProvider`, constructs `createFacilitator`→`createX402Gate`, and passes `x402` into `buildDeps({...})`; type-only `PaymentGate` import at top.
- `solver/src/x402.ts` — `createX402Gate` relaxed to accept a disabled-only `{ enabled: false }` construction (facilitator + non-enabled options optional; a module-private `NOOP_FACILITATOR` covers the disabled path). No change to the shipped gate behavior.
- `solver/.env.example` — the documented `X402_*` block (`X402_ENABLED=false` default).
- `solver/src/x402.wiring.test.ts` — the whole-app wiring proof (default-OFF byte-unchanged + on-402 + free-path allow-list + secret-sweep + buildDeps threading).
- `.planning/phases/14-agentic-payments-x402/14-UAT.md` — the four live/external gates + regression sweep.

## Decisions Made
- **Relaxed `createX402Gate`** to accept a disabled-only `{ enabled: false }` call so api.ts's DI default type-checks — Plan 01 shipped it requiring a full facilitator + options, which the plan's `createX402Gate({ enabled: false })` default did not satisfy (Rule 3 blocking fix; see Deviations).
- **Dropped the optional `/status` x402-availability line** — `PaymentGate` exposes only `middleware`, so surfacing an aggregate `enabled/network` would require expanding `PaymentGate`/`status.ts`. The plan marks the line droppable; dropping it keeps the token-free `/status` contract + the secret-sweep untouched.
- **Dynamic imports of `createFacilitator`/`createX402Gate` in `main()`** (the ledger/agent pattern) with a type-only top-level `PaymentGate` import — keeps `index.test.ts` boot-wiring import-safe.
- **`X402_PAY_TO` defaults to `ledger.operatorParty`** (the venue); network/asset/URL stay env-driven placeholders (no hard-coded Canton CAIP-2 id / facilitator hostname), UAT-confirmed via `GET /supported`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createX402Gate({ enabled: false })` did not type-check against Plan 01's signature**
- **Found during:** Task 1 (wiring the DI default into `createApp`)
- **Issue:** The plan requires `createApp` to default `deps.x402 ?? createX402Gate({ enabled: false })` (an explicit acceptance grep). But Plan 01 shipped `createX402Gate` requiring `{ facilitator: FacilitatorClient } & X402Options` — i.e. a facilitator plus `network/asset/price/payTo` — so a disabled-only `{ enabled: false }` call failed `tsc`.
- **Fix:** Relaxed `createX402Gate`'s parameter to `{ facilitator?: FacilitatorClient } & Partial<X402Options> & { enabled: boolean }`, defaulting the missing options to inert values and a module-private `NOOP_FACILITATOR` (never called — the gate's first line is `if (!opts.enabled) return next()`). The existing `x402.test.ts` call (`createX402Gate({ facilitator, ...opts })`) still satisfies the looser signature.
- **Files modified:** solver/src/x402.ts
- **Verification:** `tsc --noEmit` clean of new errors; `x402.test.ts` + `x402.wiring.test.ts` green; the disabled gate is a byte-identical no-op.
- **Committed in:** `100b818` (Task 1 feat)

**Dropped (as-permitted, not a deviation):** the optional aggregate `/status` x402-availability line — the plan explicitly marks it droppable; dropped to keep the token-free `/status` contract + secret-sweep untouched (see Decisions).

---

**Total deviations:** 1 auto-fixed (1 blocking). **Impact on plan:** a one-function signature relaxation in `x402.ts` (no shipped behavior change); no scope creep.

## Issues Encountered
- **Pre-existing `tsc` error at `idempotency.test.ts:193`** (TS2571 — the `Response.json()` `unknown` pattern documented in 14-01/14-02 `deferred-items.md`) — confirmed a baseline BEFORE this plan; `tsc` is clean for all Plan 03 code and still reports only that single deferred line. Left untouched per the executor scope boundary.

## Threat Flags
None — no security surface beyond the plan's `<threat_model>`. T-14-11 (per-route metering, free-path allow-list test), T-14-12 (SecretsProvider key module-private + secret-sweep + secret-free boot log), T-14-13 (CORS `ALLOWED_ORIGIN` untouched), T-14-14 (default-OFF byte-unchanged + §4 $100.00), T-14-15 (fee never on the DvP path — `/settle`/`Round.Clear`/§8 never gated) all mitigated in code as registered; T-14-SC `accept` — zero packages added.

## User Setup Required
For LIVE metering only (the default demo needs NONE): set `X402_ENABLED=true` in `solver/.env`; for the `canton-cc` backend also set `X402_FACILITATOR=canton-cc` + `X402_FACILITATOR_URL` + seed `X402_FACILITATOR_KEY` into the SecretsProvider (server-side only). All four live gates are recorded in `14-UAT.md`.

## Next Phase Readiness
- **PAY-01 is closed offline end-to-end** (wire+gate 01 · facilitator backends 02 · boot wiring/config/UAT 03). The default-OFF invariant is proven at the whole-app level; the §4 money-shot is byte-unchanged.
- No blockers. The four external gates (real x402 client; `self` USDCx on live DevNet; `canton-cc` real $CC = the Phase-12-style SV-sponsorship gate; `GET /supported` confirm) remain the `14-UAT.md` live checklist — none block the build.

## Self-Check: PASSED

- FOUND: solver/src/x402.wiring.test.ts
- FOUND: .planning/phases/14-agentic-payments-x402/14-UAT.md
- FOUND: solver/src/api.ts (AppDeps.x402? + per-route x402.middleware)
- FOUND: solver/src/index.ts (X402_ENABLED + createFacilitator + createX402Gate + buildDeps threading)
- FOUND: solver/.env.example (X402_ENABLED=false)
- FOUND commit: 100b818 (Task 1 feat)
- FOUND commit: e9d0df4 (Task 2 feat)
- FOUND commit: dfbe212 (Task 3 docs)

---
*Phase: 14-agentic-payments-x402*
*Completed: 2026-07-11*
