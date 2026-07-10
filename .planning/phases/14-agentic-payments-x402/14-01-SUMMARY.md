---
phase: 14-agentic-payments-x402
plan: 01
subsystem: payments
tags: [x402, express-middleware, canton, zod, http-402, agentic-payments]

# Dependency graph
requires:
  - phase: 13-platform-baseline
    provides: idempotency.ts factory-middleware pattern (createIdempotency / opt-in passthrough / secret-safe envelope) mirrored by the gate
provides:
  - "solver/src/x402.ts — hand-rolled x402 v1 HTTP wire envelope (accepts[] / X-PAYMENT / X-PAYMENT-RESPONSE) + default-OFF 402 gate middleware"
  - "FacilitatorClient interface (verify/settle) — the stable seam Plan 02 implements (self | canton-cc)"
  - "createX402Gate / PaymentGate / X402Options — the DI-defaulted bundle Plan 03 wires into api.ts/index.ts"
  - "Pure helpers: buildAccepts, decodePayment, encodePaymentResponse, constructSelfPayment, toAtomic/fromAtomic; paymentPayloadSchema (zod .strict); X402_REASON secret-free reasons"
  - "TTL-bounded spent-nonce + spent-holdingCid replay guard (T-14-01 / T-14-02 mitigations)"
affects: [14-02 facilitator backends, 14-03 api/index wiring, 14-UAT live $CC]

# Tech tracking
tech-stack:
  added: []  # zero new npm packages — express + node:Buffer + zod, all in-tree
  patterns:
    - "Factory middleware mirroring idempotency.ts (x402Gate(fac,opts) → RequestHandler + createX402Gate bundler)"
    - "Default-OFF invariant guard as the FIRST handler line (if (!opts.enabled) return next())"
    - "v1-field mapping isolated to one buildAccepts helper for a cheap v2 flip"
    - "Secret-free-by-construction: X402Error carries only a reason code; safeReason whitelists facilitator reasons"

key-files:
  created:
    - solver/src/x402.ts
    - solver/src/x402.test.ts
  modified: []

key-decisions:
  - "Hand-rolled the x402 v1 envelope (no x402-express/viem/@solana) — EVM/Solana-oriented, cannot speak Canton (recorded deviation, same register as zod/@daml/react)"
  - "Implemented v1 (x402Version:1, maxAmountRequired) with ALL field mapping isolated to buildAccepts so a v2 flip is one function"
  - "validBefore is unix epoch MILLISECONDS (documented scale); atomic units at 2 dp (USDCx minor units) via toAtomic/fromAtomic"
  - "Facilitator reasons are whitelisted (safeReason) before echo — a compromised backend cannot leak a secret through its reason string"
  - "x402Gate owns its own TTL-bounded replay-guard sets (per-instance), mirroring idempotency's private store"

patterns-established:
  - "Default-OFF 402 gate: byte-identical no-op when X402_ENABLED=false (primary invariant, proven by 'off unchanged' test)"
  - "Injected FacilitatorClient seam keeps the gate free of all ledger/secret concerns"

requirements-completed: [PAY-01]  # PARTIAL — PAY-01 core wire+gate slice; facilitator backends (02) + boot wiring (03) complete it

# Metrics
duration: ~7min
completed: 2026-07-10
---

# Phase 14 Plan 01: x402 v1 Wire Envelope + Default-OFF 402 Gate Summary

**Hand-rolled, dependency-free x402 v1 HTTP payment gate for the solver — the 402 `accepts[]` negotiation surface (Canton primary + USDCx-self second), zod-`.strict` `X-PAYMENT` decode, TTL-bounded replay guard, and a byte-identical default-OFF no-op — with settlement delegated to an injected `FacilitatorClient`.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-10T23:15:50Z
- **Completed:** 2026-07-10T23:23:00Z
- **Tasks:** 2 (implemented as one cohesive RED→GREEN cycle — both tasks share the same two files)
- **Files modified:** 2 created

## Accomplishments
- **x402 v1 wire vocabulary** pinned verbatim from 14-RESEARCH.md: `PaymentRequirements` / `PaymentRequirementsResponse` / `SelfPaymentPayload` / `PaymentPayload` / `SettlementResponse`, with `buildAccepts` emitting a Canton-Coin primary entry + an honestly-labeled operator-custody USDCx self-settle second entry (v1 `maxAmountRequired`, never the v2 `amount`).
- **Default-OFF 402 gate** whose FIRST handler line is `if (!opts.enabled) return next()` — proven byte-identical to an un-gated route by the `off unchanged` test (the primary money-shot invariant).
- **`FacilitatorClient` interface** (`verify` → `{valid,reason?}`, `settle` → `{settled,txRef}`) — the stable seam Plan 02 implements; the gate carries zero ledger/secret concerns.
- **Replay + expiry guards** (Pitfall 5): TTL-bounded spent-nonce and spent-holdingCid sets, `validBefore` expiry check, all rejecting with secret-free reasons (`nonce_replayed` / `payment_expired` / `invalid_holding`).
- **Secret-safe by construction** (Pitfall 4): `X402Error` carries only a reason code (never the raw header); `safeReason` whitelists facilitator reasons; the secret-sweep test proves an `X402_FACILITATOR_KEY`/`Authorization` sentinel never lands in a 402 body or `X-PAYMENT-RESPONSE`.
- **14 offline tests** (7 pure-helper + 7 gate) green; full solver suite **305/305**; §4 golden still clears **$100.00**.

## Task Commits

TDD RED→GREEN (both tasks share `x402.ts` + `x402.test.ts`, so implemented as one cohesive cycle):

1. **RED — full behavior proof (Tasks 1+2 tests)** - `1fb938b` (test)
2. **GREEN — x402.ts wire helpers + gate + FacilitatorClient (Tasks 1+2 impl)** - `45bd1c0` (feat)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `solver/src/x402.ts` - x402 v1 wire types + zod `.strict` `paymentPayloadSchema`, pure helpers (`buildAccepts`/`decodePayment`/`encodePaymentResponse`/`constructSelfPayment`/`toAtomic`/`fromAtomic`), `X402_REASON` constants, `FacilitatorClient`/`X402Options`/`PaymentGate` interfaces, `x402Gate` factory + `createX402Gate` bundler, TTL-bounded replay-guard sets, secret-safe `send402`.
- `solver/src/x402.test.ts` - the gate behavior proof (off-unchanged / 402-envelope / 402-then-200 / reject-ladder / secret-sweep / free-path / construct-payment / atomic-scale), mirroring the `idempotency.test.ts` `listen(0)`+`fetch` harness.

## Decisions Made
- **Hand-rolled the envelope** (no `x402-express`) — the published middleware is EVM/Solana-oriented and cannot advertise a Canton Coin scheme (recorded deviation; documented in the `x402.ts` docblock).
- **v1 over v2** with the mapping isolated to `buildAccepts` — live facilitators speak v1; a v2 flip is one function.
- **`validBefore` in unix milliseconds** and **atomic units at 2 dp** (USDCx minor units) — both documented at the single mapping site (`toAtomic`/`fromAtomic`).
- **Whitelisted facilitator reasons** via `safeReason` — belt-and-suspenders so a misbehaving backend cannot leak a secret through its `reason` string.
- **`chosen` accepts entry** is selected by matching the presented instrument (else the Canton primary) — honest routing of the self-settle USDCx entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Response.json()` typed `unknown` broke test assertions**
- **Found during:** Task 1/2 (running `tsc --noEmit`)
- **Issue:** Under `@types/node@20.16.5`, global `fetch` `Response.json()` is typed `Promise<unknown>`, so dereferencing `.error`/`.ran`/`.status`/`.asset` on the parsed body failed `tsc` (TS18046/TS2571).
- **Fix:** Added a small `body(r)` helper in the test that narrows `.json()` to `any` for assertions; routed all body dereferences through it.
- **Files modified:** solver/src/x402.test.ts
- **Verification:** `tsc --noEmit` reports zero x402 errors; 14 tests green.
- **Committed in:** `45bd1c0` (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Test-only typing fix; no change to the shipped `x402.ts` surface. No scope creep.

## Issues Encountered
- **Pre-existing `tsc` error at `idempotency.test.ts:193`** (TS2571, same `Response.json()` `unknown` pattern) — verified present WITHOUT the Phase 14 files, so it is NOT introduced here. Left untouched per the executor scope boundary and logged to `.planning/phases/14-agentic-payments-x402/deferred-items.md`. Consequently `tsc --noEmit` is clean for all x402 code but still reports that single pre-existing line.

## Threat Flags
None — no security surface beyond the plan's `<threat_model>`. The gate introduces the 402 negotiation surface exactly as registered (T-14-01…05 all `mitigate`d in code; T-14-SC `accept` — zero packages added).

## User Setup Required
None - no external service configuration required (config keys + `.env.example` land in Plan 03).

## Next Phase Readiness
- **Plan 02** can implement `FacilitatorClient` (`self` on-ledger USDCx via `moveExactHolding` | `canton-cc` FTP `/verify`+`/settle` fetch) against the stable interface exported here.
- **Plan 03** can wire `createX402Gate` / `PaymentGate` / `X402Options` into `api.ts` (per-route on `/solve-preview` + `/competing`) and `index.ts` (env config + `SecretsProvider` key), defaulting to a disabled gate so existing tests + the money-shot demo stay byte-unchanged.
- No blockers. Live $CC-on-DevNet settlement remains the `14-UAT.md` external gate.

## Self-Check: PASSED

- FOUND: solver/src/x402.ts
- FOUND: solver/src/x402.test.ts
- FOUND commit: 1fb938b (RED test)
- FOUND commit: 45bd1c0 (GREEN impl)

---
*Phase: 14-agentic-payments-x402*
*Completed: 2026-07-10*
