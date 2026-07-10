---
phase: 14-agentic-payments-x402
plan: 02
subsystem: payments
tags: [x402, facilitator, canton, ledger, holding, settlement, zod]

# Dependency graph
requires:
  - phase: 14-agentic-payments-x402 (Plan 01)
    provides: "FacilitatorClient interface (verify/settle), PaymentRequirements/PaymentPayload types, fromAtomic, X402_REASON secret-free reasons — the stable seam this plan implements"
provides:
  - "solver/src/facilitator.ts — createFacilitator(config) selecting self (on-ledger USDCx) | canton-cc (FTP /verify+/settle fetch) behind the Plan 01 FacilitatorClient interface"
  - "FacilitatorLedger port (listHoldings/moveFee), FacilitatorConfig, HoldingRecord, SELF_CUSTODY_LABEL"
  - "solver/src/ledger.ts — listHoldings() + moveFee(cid, qty, newOwner) operator-authority fee primitives (reused Holding Split/Reassign; NO new Daml)"
affects: [14-03 api/index wiring (createFacilitator + ledger port), 14-UAT live $CC]

# Tech tracking
tech-stack:
  added: []  # zero new npm packages — zod + node fetch, all in-tree
  patterns:
    - "Interface + swappable backend (createFacilitator default 'self' | 'canton-cc') mirroring createSecretsProvider (env|vault)"
    - "Injected ledger PORT (FacilitatorLedger) so facilitator.ts has no import-time dependency on ledger.ts (which reads the operator credential at module load) — tests stub it, index.ts wires ledger.ts in"
    - "Injectable fetchImpl transport seam (tlock.ts TlockOptions.client precedent) for offline-mocked canton-cc"
    - "Secret-free-by-construction: facilitator key rides only the Authorization header, module-private, non-2xx → status-only reason (secrets.ts Vault HTTP ${status} precedent)"
    - "TS mirror of Daml moveExactHolding: full Reassign vs Split+Reassign, slice re-located by ACS diff"

key-files:
  created:
    - solver/src/facilitator.ts
    - solver/src/facilitator.test.ts
  modified:
    - solver/src/ledger.ts

key-decisions:
  - "self backend takes an INJECTED FacilitatorLedger port rather than importing ledger.ts directly — keeps facilitator.ts import-time-pure (ledger.ts reads scripts/.operator-token at module load) and lets tests stub the ledger"
  - "moveFee's Split path re-locates the slice by diffing the ACS (new operator-owned USDCx Holding of exactly qty) because exerciseChoice resolves void (cannot return the Daml (slice, remainder) tuple)"
  - "canton-cc non-2xx collapses to a status-only reason (Facilitator HTTP <status>); a malformed body collapses to invalid_payload — the key/body are never echoed"
  - "self verify groups missing / wrong-owner / locked cid all under invalid_holding (T-14-06); wrong instrument → wrong_instrument; insufficient → amount_too_low"
  - "paymentPayload in the /verify+/settle body is the FULL PaymentPayload (holdingCid nested under .payload) per 14-RESEARCH §4 — corrected a RED-test assertion that flattened it"

patterns-established:
  - "FacilitatorClient backend factory: self (DevNet-capable today) default | canton-cc (offline-mocked, live=UAT), unknown value → loud secret-free throw"
  - "Operator-authority single-Holding fee transfer (moveFee) is standalone — never touches settle()/Round.Clear, so §8 stays the sole securities-DvP authority (T-14-10)"

requirements-completed: [PAY-01]  # PARTIAL — PAY-01 facilitator backends; Plan 03 boot wiring completes it

# Metrics
duration: ~15min
completed: 2026-07-11
---

# Phase 14 Plan 02: FacilitatorClient Backends (self on-ledger USDCx + canton-cc FTP fetch) Summary

**The settlement swap behind the Plan 01 `FacilitatorClient` seam: a `self` backend that verifies + settles the x402 fee on Umbra's own Canton ledger in operator-custody USDCx (reused `Holding` Split/Reassign — no new Daml), and a `canton-cc` backend that speaks the generic FTP `/verify`+`/settle` HTTP contract over an injectable fetch (offline-mocked; live = UAT).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-11T00:22:00Z
- **Completed:** 2026-07-11T00:36:00Z
- **Tasks:** 2 (Task 1 straight-through; Task 2 TDD RED→GREEN)
- **Files modified:** 2 created, 1 modified

## Accomplishments
- **`self` backend** — `verify` runs the exact `gatherHoldingCids` predicate over an injected `FacilitatorLedger.listHoldings()` (owner===payer + `instrumentId==='USDCx'` + `!locked` + `amount ≥ fromAtomic(price)`), returning secret-free `invalid_holding` / `wrong_instrument` / `amount_too_low`; `settle` calls `moveFee(presentedCid, price, payTo)` and returns its txRef, collapsing a moveFee throw to `{ settled:false, txRef:'' }`.
- **`ledger.ts` fee primitives** — `listHoldings()` (reuses `queryByEntity('Holding')` → secret-free `HoldingRecord`) and `moveFee(cid, qty, newOwner)` (TS mirror of `moveExactHolding`: a full-amount `Reassign`, or `Split`+`Reassign` for a partial, under operator authority — reusing the existing `Holding` choices, **no new Daml template/choice**). `settle`/`tamperClear`/`Round.Clear` are byte-unchanged (0 deletions in `ledger.ts`).
- **`canton-cc` backend** — POSTs the pinned `{ x402Version:1, paymentPayload, paymentRequirements }` body to `${url}/verify` and `${url}/settle` over an injectable `fetchImpl` with `Authorization: Bearer <key>`, zod-parses the responses, maps `isValid`/`invalidReason` + `success`/`transaction`; a non-2xx → status-only secret-free reason. Network/asset/URL are env-driven — **no hard-coded Canton CAIP-2 literal or facilitator hostname** in the file.
- **`createFacilitator`** selects `self` (default) | `canton-cc`; an unrecognized value + missing per-backend deps fail loud and secret-free (mirrors `createSecretsProvider`).
- **20 offline facilitator tests** green (self reject-ladder + settle; canton-cc valid/invalid/non-2xx/settle; secret-sweep; factory); full solver suite **325/325**; `tsc` clean of new errors; **§4 golden still clears $100.00** (`daml test` green — the no-new-Daml invariant proven).

## Task Commits

1. **Task 1: operator-authority fee-transfer primitives in ledger.ts** — `c9d31db` (feat)
2. **Task 2 RED: failing FacilitatorClient proof** — `ff2d3ee` (test)
3. **Task 2 GREEN: FacilitatorClient factory (self + canton-cc)** — `49a012b` (feat)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `solver/src/facilitator.ts` — `createFacilitator` factory; module-private `selfFacilitator` (on-ledger verify/settle over the `FacilitatorLedger` port) + `cantonCcFacilitator` (FTP `/verify`+`/settle` over injectable fetch); `FacilitatorLedger`/`FacilitatorConfig`/`HoldingRecord` types; `SELF_CUSTODY_LABEL` honesty constant; zod response schemas.
- `solver/src/ledger.ts` — new `listHoldings()` + `moveFee()` exports + `HoldingRecord` interface in a dedicated PAY-01 section (after `currentOffset`); reuses `queryByEntity`/`exerciseChoice`/`operatorParty`; no touch to `settle`/`tamperClear`.
- `solver/src/facilitator.test.ts` — self (stubbed `FacilitatorLedger`) reject-ladder + settle→moveFee proof; canton-cc (stubbed `fetchImpl`) pinned-body/Bearer/mapping/non-2xx proof; secret-sweep; factory loud-throws.

## Decisions Made
- **Injected `FacilitatorLedger` port** instead of a direct `ledger.ts` import — keeps `facilitator.ts` import-time-pure (ledger.ts reads the operator credential at module load) and makes the `self` backend unit-testable against an in-memory stub. Plan 03 passes `{ listHoldings, moveFee }` from `ledger.ts`.
- **Split-slice re-location by ACS diff** — `exerciseChoice` resolves `void` (it cannot return Daml's `(slice, remainder)` tuple), so `moveFee` re-queries and finds the newly-created operator-owned USDCx Holding of exactly `qty` to `Reassign`.
- **Status-only canton-cc failure reason** — a non-2xx throws `Facilitator HTTP <status>` (status only; body never echoed); a malformed body collapses to `invalid_payload`. The key lives only in the request header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RED-test assertion flattened the `paymentPayload` wire shape**
- **Found during:** Task 2 (GREEN — first canton-cc test failed)
- **Issue:** The RED test asserted the `/verify` request body as `paymentPayload: { holdingCid }`, but per 14-RESEARCH §4 `paymentPayload` is the FULL `PaymentPayload` object (holdingCid nests under `.payload`). The implementation (sending the full payload) was correct; the test's `toMatchObject` was wrong and failed.
- **Fix:** Corrected the assertion to `paymentPayload: { payload: { holdingCid } }` matching the pinned contract; added a clarifying comment.
- **Files modified:** solver/src/facilitator.test.ts
- **Verification:** facilitator.test.ts 20/20 green; the request body matches §4.
- **Committed in:** `49a012b` (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 test-assertion bug).
**Impact on plan:** Test-only correction to match the pinned wire contract; no change to the shipped facilitator surface. No scope creep.

## Issues Encountered
- **Pre-existing `tsc` error at `idempotency.test.ts:193`** (TS2571 — the `Response.json()` `unknown` pattern documented in 14-01's `deferred-items.md`) — confirmed present in the baseline BEFORE this plan's changes, so it is NOT introduced here. `tsc --noEmit` is clean for all Plan 02 code and still reports only that single deferred line. Left untouched per the executor scope boundary.

## Threat Flags
None — no security surface beyond the plan's `<threat_model>`. T-14-06 (fee-source predicate) and T-14-08/09 (facilitator-key + operator-bearer secret discipline) are mitigated in code exactly as registered; T-14-10 (fee never leaks onto the DvP path) holds — `settle`/`tamperClear`/`Round.Clear` byte-unchanged; T-14-SC `accept` — zero packages added.

## User Setup Required
None - no external service configuration required (the `X402_*` config keys + `.env.example` + `X402_FACILITATOR_KEY` via `SecretsProvider` land in Plan 03). Live `self` on a booted LocalNet and live `canton-cc` real-$CC settlement remain the `14-UAT.md` external gate.

## Next Phase Readiness
- **Plan 03** can wire `createFacilitator({ backend, ledger: { listHoldings, moveFee }, facilitatorUrl, facilitatorKey })` into `index.ts` and pass the resulting `FacilitatorClient` into `createX402Gate` (per-route on `/solve-preview` + `/competing`), defaulting to a disabled gate so existing tests + the money-shot demo stay byte-unchanged. `X402_FACILITATOR_KEY` resolves via `SecretsProvider.get()` (canton-cc only).
- No blockers. Live `$CC`-on-DevNet settlement (`canton-cc`) remains the `14-UAT.md` external SV-sponsorship gate; `self` runs on the live DevNet node today.

## Self-Check: PASSED

- FOUND: solver/src/facilitator.ts
- FOUND: solver/src/facilitator.test.ts
- FOUND: solver/src/ledger.ts exports listHoldings + moveFee
- FOUND commit: c9d31db (Task 1 feat)
- FOUND commit: ff2d3ee (Task 2 RED test)
- FOUND commit: 49a012b (Task 2 GREEN feat)

---
*Phase: 14-agentic-payments-x402*
*Completed: 2026-07-11*
