---
phase: 14-agentic-payments-x402
verified: 2026-07-11T02:00:00Z
status: human_needed
score: 4/4 offline criteria + PAY-01 delivered (all offline-achievable; 4 live-UAT items deferred)
re_verification: false
human_verification:
  - test: "A real external x402-speaking client pays end-to-end (402 → construct X-PAYMENT → 200 + X-PAYMENT-RESPONSE) against a booted stack with X402_ENABLED=true"
    expected: "First unpaid GET /round/:id/solve-preview + POST /competing return 402 with the v1 accepts[] envelope; a retry with a valid X-PAYMENT returns the deterministic §8 solve plus an X-PAYMENT-RESPONSE settlement header"
    why_human: "Requires an external x402 agent/client process; offline-covered by x402.test.ts (402→200) + x402.wiring.test.ts driving the real gate over fetch with a stubbed facilitator"
  - test: "The `self` backend settles a real USDCx transfer on a live DevNet node (venue Holding grows by exactly the fee; securities DvP / Round.Clear byte-unchanged)"
    expected: "verify passes owner===authenticatedPayer + USDCx + unlocked + amount≥price; settle runs moveFee(cid, price, venue); the venue USDCx Holding grows by exactly the fee"
    why_human: "Requires a booted LocalNet/DevNet node with a funded desk USDCx Holding; confirms LO-01/LO-03 live-ledger moveFee cid capture. Offline-verified in facilitator.test.ts + ledger.test.ts over a stubbed ledger"
  - test: "The `canton-cc` backend settles real Canton Coin via the live FTP facilitator (POST /verify + /settle with Bearer key)"
    expected: "The solver POSTs the pinned { x402Version, paymentPayload, paymentRequirements } body to ${url}/verify + /settle; a real $CC transfer settles and settle returns the facilitator txRef"
    why_human: "External SV-sponsorship gate (CC-funded venue party on DevNet) — identical in kind to the Phase 12 gate. Offline-mocked in facilitator.test.ts against a stubbed fetch"
  - test: "Exact Canton CAIP-2 network id + Canton Coin asset id + facilitator path shapes confirmed via GET /supported"
    expected: "The facilitator's /supported kinds/schemes confirm X402_NETWORK / X402_ASSET / path shapes and the v1-vs-v2 envelope version; update .env to match (a v2 flip is the single buildAccepts mapping)"
    why_human: "Requires the live FTP facilitator; env-driven placeholders (canton:devnet / CantonCoin) ship — no live Canton id is hard-coded in the code"
---

# Phase 14: Agentic Payments (x402 Metered Solver Access) — Verification Report

**Phase Goal:** Let an autonomous agent pay per solve. Gate Umbra's AI endpoints behind a spec-accurate, Canton-native HTTP 402 so a machine client pays a small fee to run the solver — while keeping the atomic DvP settlement core, the §4 fixture, and the canonical demo entirely untouched.
**Verified:** 2026-07-11T02:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Gate Results (run by the verifier, not trusted from SUMMARY)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Solver test suite | `cd solver && npx vitest run` | **351 passed / 351** across 27 files (incl. `x402.test.ts` 23, `facilitator.test.ts` 24, `payer-auth.test.ts` 7, `x402.wiring.test.ts` 6) |
| TypeScript | `cd solver && npx tsc --noEmit` | Clean **except** the single documented pre-existing `src/idempotency.test.ts(193,12): TS2571` (baseline in `deferred-items.md`, not introduced by Phase 14) |
| Daml §4 golden | `cd daml && daml test` | Exit 0 — `Umbra/Tests.daml:test_clears_at_100: ok`; the §4 fixture still clears **$100.00**, no Daml changed |

## Goal Achievement

### Observable Truths (the 4 ROADMAP Success Criteria + PAY-01)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| SC-1 | Unpaid metered call ⇒ spec-accurate x402 v1 402 with a real-Canton `accepts[]`; valid `X-PAYMENT` ⇒ solve + `X-PAYMENT-RESPONSE` | ✓ DELIVERED (offline) | `x402.ts:358-360` `send402` emits `{x402Version:1, error, accepts}`; `x402.ts:170-214` `buildAccepts` builds the v1 envelope (scheme/network/maxAmountRequired/asset/payTo/resource); gate `x402.ts:386-506` runs authenticate→verify→serve→settle-on-2xx and sets `X-PAYMENT-RESPONSE` (`x402.ts:478-487`). `x402.wiring.test.ts:139-159` asserts the two routes 402 with an `accepts[]` body; `x402.test.ts` "402 then 200" drives the full round-trip. **Live client = UAT Gate 1.** |
| SC-2 | Settlement swappable behind one `FacilitatorClient`: `self` on-ledger USDCx (offline-verified) \| `canton-cc` FTP `/verify`+`/settle` (offline-mocked) | ✓ DELIVERED | Single interface `x402.ts:267-281`; factory `facilitator.ts:206-229` selects `self`\|`canton-cc` (unknown fails loud). `self` verify predicate `facilitator.ts:83-120` + `moveFee` reuse `ledger.ts:874-919` (Split/Reassign, no new Daml). `canton-cc` `facilitator.ts:148-201` POSTs pinned body + Bearer, AbortSignal timeout, status-only secret-free reason. `facilitator.test.ts` (24 tests) covers both backends over stubbed ledger / stubbed fetch. **Real $CC = UAT Gate 3.** |
| SC-3 | Default-OFF ⇒ endpoints + §4 demo byte-unchanged + $100.00; fee off the DvP path; AI off settle; no secret in browser/bodies | ✓ DELIVERED | First handler line `x402.ts:380` `if (!opts.enabled) return next()`; `api.ts:613` defaults an absent gate to `createX402Gate({ enabled: false })`. Gate attached to EXACTLY `/round/:id/solve-preview` (`api.ts:840-841`) + `/competing` (`api.ts:1376-1377`) — no `app.use`, no settlement/lifecycle path. `x402.wiring.test.ts:123-137` proves byte-unchanged clears `clearingPrice === 100`; `:161-181` free-path allow-list; `:183-201` secret-sweep (leaky facilitator reason + Bearer sentinel absent from body/header). `ledger.ts` diff is purely additive (settle/§8/Round.Clear untouched). Facilitator key resolved via SecretsProvider (`index.ts:399-404`), rides only the `Authorization` header (`facilitator.ts:160`). |
| SC-4 | DevNet framing recorded in 14-UAT.md | ✓ DELIVERED | `14-UAT.md` records all 4 external gates with enable/run + expected-observable + honest notes; `self` marked DevNet-capable today (no SV sponsorship), `canton-cc` marked the Phase-12-style SV-sponsorship gate. Pre-verification regression sweep + accepted-risks section present. |
| PAY-01 | x402 metered access to the AI solver, spec-accurate Canton 402, swappable FacilitatorClient, default-OFF, fee off DvP, AI off settle | ✓ DELIVERED (offline) | Composite of SC-1..SC-4 above; all offline seams green. Live $CC-on-DevNet = UAT. |

**Score:** 4/4 offline Success Criteria + PAY-01 delivered and green. 4 items require live infrastructure (human verification).

### Code-Review CRITICAL (CR-01) — fix confirmed present in shipped code

The deep review found CR-01: the `self` backend authorized a fee move on an unauthenticated, forgeable `from`+`holdingCid`. **The fix is present and substantive in the shipped code:**

- New `solver/src/payer-auth.ts` (94 lines) — `verifyDevPartyToken` pins `alg:HS256`, constant-time HMAC compare via `node:crypto` (no new dep); `createPayerAuthenticator` verifies the caller's party token (dev HS256 with OIDC RS256 fallback) and maps `sub`→party, failing closed on unknown subjects.
- Gate enforcement `x402.ts:427-436`: for `backend === 'self'` the gate requires `authenticatePayer`, rejects a missing/invalid token as `unauthorized_payer`, and requires `p.from === authenticatedPayer` (no paying from another's id).
- Facilitator binding `facilitator.ts:84-94`: `self` verify binds the fee source to `h.owner === authenticatedPayer` (NOT the claimed `from`); missing authed identity ⇒ `invalid_holding`.
- Boot wiring `index.ts:432-459`: builds the authenticator from the deploy party map (`buildSubjectToPartyMap`) + operator user, overridable via `X402_PAYER_PARTY_MAP`.
- Regression coverage: `x402.test.ts` (gate), `facilitator.test.ts` (backend), `payer-auth.test.ts` (7 tests, seam). All green.

All 10 review findings (CR-01, HI-01, MD-01..04, LO-01..04) are marked FIXED in `14-REVIEW.md`; HI-01 (settle-before-handler) is fixed via `res.json` interposition (`x402.ts:450-500`, settle only on 2xx); MD-02 (lazy facilitator) confirmed at `index.ts:412-416`.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `solver/src/x402.ts` | v1 wire envelope + default-OFF gate + FacilitatorClient interface | ✓ VERIFIED | 544 lines; substantive, wired into api.ts per-route |
| `solver/src/facilitator.ts` | self \| canton-cc backends behind one factory | ✓ VERIFIED | 230 lines; both backends + loud-fail factory |
| `solver/src/payer-auth.ts` | CR-01 caller authentication | ✓ VERIFIED | 94 lines; token verify + subject→party map; wired index.ts |
| `solver/src/ledger.ts` `moveFee` | operator-custody fee move (Split/Reassign, no new Daml) | ✓ VERIFIED | `ledger.ts:874-919`; additive; LO-01/LO-03 exact-cid capture |
| `solver/src/api.ts` | per-route gate on the two AI endpoints, disabled default | ✓ VERIFIED | `:613, :840-841, :1376-1377` |
| `solver/src/index.ts` | X402_* config, SecretsProvider key, lazy facilitator, authenticator | ✓ VERIFIED | `:382-460`; default-OFF; MD-02 lazy |
| test files | x402/facilitator/wiring/payer-auth | ✓ VERIFIED | 23+24+6+7 tests, all green |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `api.ts` two AI routes | `x402.middleware` | per-route `app.get/post(path, x402.middleware, wrap(...))` | ✓ WIRED |
| gate | facilitator | injected `FacilitatorClient.verify/settle` | ✓ WIRED |
| `self` facilitator | ledger | `FacilitatorLedger` port (`listHoldings`/`moveFee`) injected `index.ts:421` | ✓ WIRED |
| gate (`self`) | payer-auth | `authenticatePayer` → `createPayerAuthenticator` `index.ts:443` | ✓ WIRED |
| `canton-cc` facilitator | FTP facilitator | `fetchImpl` POST `/verify`+`/settle` + Bearer | ✓ WIRED (offline-mocked; live=UAT) |
| facilitator key | SecretsProvider | `secrets.get('X402_FACILITATOR_KEY')` `index.ts:401` | ✓ WIRED |

### Anti-Patterns Found

None blocking. The `X402_NETWORK`/`X402_ASSET` env defaults (`canton:devnet`/`CantonCoin`) are honest placeholders confirmed at UAT via `/supported` — no live Canton id is hard-coded. The single `idempotency.test.ts:193` tsc error is a documented pre-existing baseline, not introduced here.

### Human Verification Required (deferred live-UAT — NOT gaps)

The 4 external gates from `14-UAT.md` require infrastructure absent on this box (a reachable FTP facilitator, a CC-funded venue party on a live DevNet node, an external x402 client). Each has a verified offline fallback and follows the established Phases 8–13 "Built · offline-verified · live UAT pending" pattern. See the `human_verification` frontmatter for the four items (real client end-to-end, `self` live USDCx settle, `canton-cc` real $CC, `/supported` id confirmation).

### Gaps Summary

No offline gaps. Every offline-achievable criterion is delivered and green: the v1 402 envelope, the swappable FacilitatorClient (`self` + `canton-cc`), the default-OFF byte-unchanged invariant with the §4 fixture still clearing $100.00, the secret-sweep, and the CR-01 payer-authentication fix are all present in the shipped code and covered by 351 passing tests + a clean tsc (bar the documented baseline) + a green `daml test`. The only outstanding items are the 4 live-DevNet/facilitator UAT checks, which are legitimately deferred with offline fallbacks — hence `human_needed`, mirroring 13-VERIFICATION.md.

---

_Verified: 2026-07-11T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
