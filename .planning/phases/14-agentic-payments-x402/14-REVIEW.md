---
phase: 14-agentic-payments-x402
reviewed: 2026-07-11T00:00:56Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - solver/src/x402.ts
  - solver/src/facilitator.ts
  - solver/src/ledger.ts
  - solver/src/api.ts
  - solver/src/index.ts
  - solver/src/x402.test.ts
  - solver/src/facilitator.test.ts
  - solver/src/x402.wiring.test.ts
findings:
  critical: 1
  high: 1
  medium: 4
  low: 4
  total: 10
status: fixes_applied
fixes_applied_at: 2026-07-11
fixes:
  fixed: 10
  skipped: 0
---

## Fix Status (2026-07-11)

All 10 findings fixed. Full solver suite green (351 tests, +20 regression tests incl. CR-01 +
HI-01); `tsc --noEmit` clean except the documented pre-existing `idempotency.test.ts:193`;
`daml test` green (§4 `test_clears_at_100: ok`). Author `woshvad`, zero attribution.

| ID | Status | Commit | Notes |
|----|--------|--------|-------|
| CR-01 | FIXED | `a186500` | `self` gate now authenticates the caller (reused dev-HS256/OIDC token seam, new `payer-auth.ts`, no new dep) and binds the fee source to `owner === authenticatedParty`; a forged `from`/unauthenticated caller is rejected `unauthorized_payer` and `moveFee` is never called. Regression tests at gate (`x402.test.ts`) + facilitator (`facilitator.test.ts`) + seam (`payer-auth.test.ts`) levels. |
| HI-01 | FIXED | `0beae4b` | Gate reordered to verify → serve → settle-only-on-2xx (res.json interposition); a handler 4xx/5xx no longer charges the payer. Regression test proves settle is not called on a 500. |
| MD-01 | FIXED | `fd1ac2b` | `validBefore` bounded to `now + maxTimeoutSeconds`; spent nonce/cid entries kept alive until `max(now+ttl, validBefore)` so a nonce is never TTL-evicted while replayable. |
| MD-02 | FIXED | `a186500` | Facilitator now constructed LAZILY — with metering OFF `index.ts` builds `createX402Gate({ enabled: false })` directly and skips `createFacilitator`, so a `canton-cc`/typo backend no longer crashes the solver at boot. (Bundled in the CR-01 index.ts wiring commit.) |
| MD-03 | FIXED | `ad236c5` | `canton-cc` fetch now carries `AbortSignal.timeout(maxTimeoutSeconds*1000)`; a hung facilitator is aborted and mapped to a secret-free reason. |
| MD-04 | FIXED | `8568f55` | `buildAccepts` is backend-aware: `self` advertises ONLY the payable USDCx-self scheme, `canton-cc` the CantonCoin scheme (no more unpayable CantonCoin primary under the default `self` backend). |
| LO-01 | FIXED (live/UAT verify) | `181e045` | `moveFee` now returns the EXACT newly-created venue Holding cid from the Reassign (diffed against the pre-Reassign ACS), not any pre-existing operator-owned USDCx Holding. Live-ledger path — offline-covered only via the facilitator port stub; confirm on booted LocalNet at UAT. |
| LO-02 | FIXED | `3f00fed` | `self` verify asserts `payload.value === maxAmountRequired` (atomic-unit string equality) → `amount_too_low` on mismatch. |
| LO-03 | FIXED (live/UAT verify) | `181e045` | `moveFee` split-slice + full-move comparisons use integer atomic units (`round(x*100)`), not reconstructed-float `===`. Live-ledger path — verify on LocalNet at UAT. |
| LO-04 | FIXED | `fd1ac2b` | Added a distinct `holding_replayed` reason for a re-presented spent `holdingCid` (was conflated with `invalid_holding`). |

# Phase 14: x402 Metered Solver Access — Code Review

**Reviewed:** 2026-07-11T00:00:56Z
**Depth:** deep (cross-file: x402 gate → facilitator → ledger primitives → api/index wiring)
**Diff:** `160b5c8..HEAD` (11 commits)
**Status:** issues_found

## Summary

The x402 wire layer (`x402.ts`) and the boot/DI plumbing are careful and match the stated invariants well: the **default-OFF invariant holds** (first handler line `if (!opts.enabled) return next()`, and `createApp` defaults an absent gate to `createX402Gate({ enabled: false })`), the gate is attached to **exactly** `/round/:id/solve-preview` + `/competing` (no `app.use`, no free/lifecycle/settlement path), the §8/`settle`/`tamperClear`/`Round.Clear` surface is **byte-unchanged** (the ledger.ts diff is purely additive), and secret discipline on the reason/echo paths is real (facilitator reasons are filtered through `safeReason`/`ALLOWED_REASONS`, the facilitator key rides only the `Authorization` header, non-2xx collapses to a status-only string that the gate then further collapses to `invalid_payload`). The §4 canary in the wiring test proves the money shot still clears at $100.00.

The problems are concentrated in the **`self` settlement backend and the settle-ordering / replay lifetime**, i.e. exactly the "real payment code" surface. The headline defect is that the `self` backend authorizes a fund move purely on an **attacker-controlled, unauthenticated `from` + `holdingCid`** — there is no cryptographic proof the caller controls the fee source. Below, most-severe first.

## Critical Issues

### CR-01: `self` backend authorizes fee seizure on an unauthenticated, forgeable `from` + `holdingCid`

**File:** `solver/src/facilitator.ts:84-100` (verify predicate) + `solver/src/ledger.ts:875-919` (`moveFee`) + `solver/src/x402.ts:201-214,350-390`
**Issue:** In the `self` backend the only "authorization" for moving money is the decoded X-PAYMENT payload's `from` and `holdingCid` fields. Both are fully attacker-controlled (base64 JSON in a request header, **no signature**). `verify` accepts iff a ledger Holding with `contractId === payload.holdingCid` has `owner === payload.from`, is USDCx, unlocked, and `amount >= price`. `settle`→`moveFee` then Reassigns exactly `price` of that Holding to the venue under **operator authority** (operator is the sole signatory of every `Holding`, so it can move anyone's).

Concrete attack (metering enabled, default `self` backend): an attacker constructs
`X-PAYMENT = base64({..., payload:{ from: "<victimDesk::party>", holdingCid: "<victim's USDCx cid>", value:"...", validBefore: <future>, nonce:<fresh> }})`.
`verify` passes (owner === claimed `from`), `settle` seizes the victim's USDCx and pays the venue, and the **attacker** receives the metered AI compute. The victim funds the attacker's access.

The design leans on the holding contractId being unguessable, yet the code itself explicitly disclaims that: ledger.ts:868-874 / 883-884 call the cid "an already-public ledger id, never a secret." A security control whose only barrier is the secrecy of a value the same code documents as non-secret is broken. `moveFee` also re-checks nothing about ownership (`ledger.ts:889-895` only checks exists/not-locked/amount), so it will move whatever cid `verify` waved through. This is real payment code and the fee move is irreversible on-ledger.

**Fix:** Do not treat the claimed `from` as authorization. Bind the fee-payer to an authenticated identity or a signature:
- Require the caller to present the desk's own scoped party token (the same JWT the JSON API uses) and assert `payload.from === authenticatedParty` before `verify`; **or**
- Require a payer signature over `(holdingCid, value, nonce, validBefore)` and verify it on-ledger (this is precisely the "payer-signed is the canton-cc path" the honesty label alludes to — the `self` path currently has no such proof); **or**
- Restrict the `self` backend to a trusted single-tenant/demo deployment and gate it behind an explicit `X402_SELF_TRUSTED=true` acknowledgement so it can never be the default in a multi-desk venue.

## High

### HI-01: Fee settles BEFORE the wrapped handler runs — charge-without-service on any handler 4xx/5xx

**File:** `solver/src/x402.ts:364-385`
**Issue:** The gate runs `verify`→`settle`→(burn nonce/cid)→`next()`. Settlement is committed on-ledger *before* the route handler executes and validates the request. If the handler then fails — e.g. `GET /round/<bogus-or-purged-id>/solve-preview` where `readSealedOrders` yields nothing / 404, or `/competing` with a body that later fails deeper validation, or any 5xx — the payer has been charged (`moveFee` is irreversible) but receives no compute and there is no refund path. A client that pays for a nonexistent/expired round simply loses the fee.
**Fix:** Settle only after the request is known to be serviceable. Either (a) validate serviceability (round exists / sealed orders present) in the gate before `settle`, or (b) restructure so the handler computes first and settlement is the last step, or (c) implement a compensating refund when `res.statusCode >= 400` after `next()`. At minimum, move the cheap existence check ahead of `facilitator.settle`.

## Medium

### MD-01: Replay-guard lifetime is decoupled from `validBefore`; nonce is replayable after TTL eviction

**File:** `solver/src/x402.ts:282,326-329,353-357,374-375`
**Issue:** Spent nonces/holdingCids live in a fixed-TTL set (`DEFAULT_NONCE_TTL_MS = 5 min`), but `validBefore` has **no upper bound** — the gate only checks `p.validBefore > now()` (x402.ts:353). A payment can declare `validBefore` arbitrarily far in the future. Once 5 minutes pass, `createTtlSet` evicts the nonce/cid (has() deletes expired, add() sweeps), so re-presenting the **identical** header passes the nonce/holding checks again. For the `self` backend the on-ledger cid burn is the real backstop (the Reassigned cid is archived, so the replayed `moveFee` throws) — but for the **canton-cc** backend the gate's in-memory set is the only gate-layer replay guard, and it forgets the nonce while the payment is still "valid," so a replay within the payment's own validity window is not caught here.
**Fix:** Reject `payload.validBefore > now() + maxTimeoutSeconds*1000` up front, and set each spent-set entry's expiry to `max(validBefore, now()+ttlMs)` so a nonce is never forgotten before the payment it guards can expire.

### MD-02: Facilitator is constructed unconditionally at boot even when metering is disabled — misconfig crashes the solver

**File:** `solver/src/index.ts:388-398`
**Issue:** `main()` calls `createFacilitator({ backend: x402Backend, ... })` regardless of `x402Enabled`. `createFacilitator` throws loud on `backend === 'canton-cc'` without url+key (facilitator.ts:204-209) or on an unknown backend value (facilitator.ts:214-215). So an operator who sets `X402_FACILITATOR=canton-cc` (or a typo'd backend) but leaves `X402_ENABLED=false` will crash the solver at boot — even though metering is off. That violates the "disabled gate never alters/breaks anything" spirit of the primary invariant.
**Fix:** Short-circuit when `!x402Enabled`: build the disabled no-op directly (`createX402Gate({ enabled: false })`) and skip `createFacilitator` entirely, or wrap the facilitator construction so a disabled gate is never coupled to backend config validity.

### MD-03: No request timeout on the `canton-cc` facilitator fetch — a hung facilitator hangs the gated request

**File:** `solver/src/facilitator.ts:143-166`; `maxTimeoutSeconds` advertised in `solver/src/x402.ts:162,175`
**Issue:** `post()` awaits `fetchImpl(...)` with no `AbortController`/timeout. A slow or hanging FTP facilitator blocks the async gate closure (x402.ts:364) indefinitely, holding the client connection open with no upper bound. `maxTimeoutSeconds` is advertised in the `accepts[]` envelope but never enforced anywhere in the code.
**Fix:** Pass an `AbortSignal` (e.g. `AbortSignal.timeout(maxTimeoutSeconds*1000)`) into the fetch and map a timeout to a secret-free `invalid_payload`/re-advertise, so the advertised timeout is real.

### MD-04: `self` backend advertises an unpayable CantonCoin primary in `accepts[]`

**File:** `solver/src/x402.ts:156-197` (`buildAccepts` always emits both) vs `solver/src/facilitator.ts:83-101`
**Issue:** `buildAccepts` unconditionally returns `[canton (asset: CantonCoin, primary), usdcxSelf (asset: USDCx)]` regardless of the configured backend. With the **default `self`** backend, only USDCx Holdings can settle — `verify` rejects anything whose ledger Holding isn't `instrumentId === 'USDCx'` (`wrong_instrument`). A spec-conformant x402 client tries `accepts[0]` (CantonCoin) first and is always rejected under the default backend, so metered access is effectively broken/confusing for conformant clients. The advertisement doesn't match the capability.
**Fix:** Make `buildAccepts` backend-aware: when the backend is `self`, advertise only the USDCx-self entry (or make it `accepts[0]`); when `canton-cc`, advertise the CantonCoin entry. Thread the backend/capability into `X402Options`.

## Low

### LO-01: `moveFee` settlement confirmation is vacuous and returns a misleading txRef when `payTo === operator` (the default)

**File:** `solver/src/ledger.ts:911-918`
**Issue:** After the Reassign, `moveFee` confirms success by scanning `listHoldings()` for *any* `owner === newOwner && USDCx && !locked && amount >= qty` and returns `umbra-x402-<that cid>`. `listHoldings` is filtered to the operator party (ledger.ts:294-301), and `X402_PAY_TO` defaults to `operatorParty` (index.ts:350). The operator/custodian already owns many USDCx Holdings, so the confirmation matches a pre-existing unrelated Holding and the returned `txRef` points to it, not the fee move — the "confirmation" proves nothing (the real guarantee is `exerciseChoice` throwing on failure) and the settlement ref is not auditable back to this fee.
**Fix:** Capture the actual Reassigned contract id. In the full-amount branch you can diff the ACS for the specific new venue-owned cid created by this Reassign; in the split branch you already located `slice`, so track its post-Reassign successor. Return that exact cid as the ref.

### LO-02: `payload.value` is schema-required but never checked against `maxAmountRequired` in the `self` backend

**File:** `solver/src/facilitator.ts:84-100`; schema `solver/src/x402.ts:127-137`
**Issue:** The wire declares `value` (the amount the payer intends to pay), but the `self` backend ignores it entirely — it charges `fromAtomic(requirements.maxAmountRequired)` = `price` unconditionally in `settle`. So `value` is decorative: a client that declares `value:"1"` is still charged the full `price`, and a client that expects `value` to be honored is misled. (No underpayment risk, since the charge is always `price`.)
**Fix:** Assert `payload.value === requirements.maxAmountRequired` (atomic units) in `verify` and reject with `amount_too_low` on mismatch, or explicitly document that `value` is ignored for the `self` scheme.

### LO-03: Float-equality on decimal amounts in `moveFee` slice re-location and the atomic mapping

**File:** `solver/src/ledger.ts:903` (`Number(c.createArgument.amount) === qty`); `solver/src/x402.ts:118-122`
**Issue:** `toAtomic`/`fromAtomic` route through JS floats (`Math.round(Number(x)*100)`, `/100`) and the split-slice lookup compares `Number(amount) === qty`. Exact for 2-dp round fees like `1.00`, but fragile for sub-unit prices (e.g. `0.29`) where float round-trips and `===` on decoded ledger Decimals can drift, causing the slice `.find` to miss and throw `x402 fee: split slice not found` on a legitimate move.
**Fix:** Compare on integer atomic units / string equality rather than reconstructed floats; carry the amount as the atomic string end-to-end and match `String`-to-`String`.

### LO-04: Replayed-holding hit reports `invalid_holding`, conflating replay with a bad holding

**File:** `solver/src/x402.ts:355-357`
**Issue:** When a previously-spent `holdingCid` is re-presented, the gate returns `X402_REASON.invalid_holding`, indistinguishable from "this cid was never a valid fee source." A distinct replay reason (as the nonce path uses `nonce_replayed`) would be clearer for clients/debugging. Cosmetic, not a security issue.
**Fix:** Return a dedicated replay reason (e.g. reuse `nonce_replayed`, or add `holding_replayed` to `X402_REASON`) for the spent-holding branch.

## Test coverage notes (not defects, but gaps that hide the above)

- `facilitator.test.ts` proves the `self` verify predicate but **only ever sets `payload.from === holding.owner`** — it never asserts that a caller *cannot* pay from a Holding they don't control with a spoofed `from`. That is exactly CR-01; the test suite gives false confidence because the threat model it should encode (unauthenticated payer identity) is untested.
- No test exercises the settle-then-handler-failure ordering (HI-01) — every wiring test uses a handler that succeeds.
- No test covers `validBefore` far in the future + post-TTL replay (MD-01); the replay test resends immediately, within the TTL window, so it can't catch eviction-based replay.
- The secret-sweep tests are structurally real (they assert the sentinel is absent from bodies/headers/results) — good — but they only cover the reason/echo channels, not a log sink; confirm at UAT that no `console.*` path logs the raw header or key.

---

**Verdict:** 10 findings: 1 CRITICAL, 1 HIGH, 4 MEDIUM, 4 LOW. Default-OFF invariant, the two-route allow-list, and §4 byte-invariance all hold; the risk is concentrated in the `self` settlement backend — CR-01 (unauthenticated fee seizure) must be resolved before metering is enabled against real funds.

_Reviewed: 2026-07-11T00:00:56Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
