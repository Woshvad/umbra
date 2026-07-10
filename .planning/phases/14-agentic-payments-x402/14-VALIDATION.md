---
phase: 14
slug: agentic-payments-x402
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
approved: 2026-07-10
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 14-RESEARCH.md "## Validation Architecture". Phase 14 is 100% solver/TS + config (no new Daml, no web view). Every new module ships a co-located vitest with a secret-sweep; the §4 golden ($100.00) + `daml test` remain the continuous regression gate (untouched by this phase). The **default-OFF byte-unchanged** assertion is the primary invariant test.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (solver/) · Daml Script `daml test` (regression only — untouched) |
| **Config file** | `solver/vitest.config.ts` (existing) |
| **Quick run command** | `cd solver && npx vitest run src/x402.test.ts src/facilitator.test.ts` |
| **Full suite command** | `cd solver && npx vitest run` (+ `cd daml && daml test` for the §4 golden) |
| **Estimated runtime** | solver ~15–40s · `daml test` ~60–120s (JVM; regression only) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/x402.test.ts src/facilitator.test.ts` (< 20s).
- **After every plan wave:** full solver `npx vitest run`; run `daml test` only if any Daml is touched (expected: none).
- **Before verify:** full solver suite green + `tsc` clean + the §4 golden ($100.00 / A=10·B=8·C=2) intact + a secret-sweep pass.
- **Max feedback latency:** < 20s for the x402/facilitator module tests.

---

## Per-Task Verification Map

> Populated per-plan by the planner (each task carries `<acceptance_criteria>` + an `<automated>` verify command). The per-requirement validation architecture below (from 14-RESEARCH.md) is the source; task IDs are assigned when PLAN.md files are written.

| Requirement | Observable validation (automated) | Test type | Live/UAT gate |
|-------------|-----------------------------------|-----------|---------------|
| PAY-01 default-OFF | vitest: `X402_ENABLED=false` ⇒ `/solve-preview` + `/competing` responses **byte-identical** to pre-gate (the primary invariant) | unit | — (fully offline) |
| PAY-01 402 envelope | vitest: on + no `X-PAYMENT` ⇒ HTTP 402 body carries pinned x402 v1 `accepts[]` (Canton Coin primary entry: `scheme`/`network`/`maxAmountRequired`/`asset`/`payTo`/`resource`; USDCx-self second, labeled) | unit | exact Canton CAIP-2 net id + CC asset id via `/supported` → UAT |
| PAY-01 pay-then-serve | vitest: on + valid `X-PAYMENT` ⇒ `FacilitatorClient.verify`→`settle`→200 + base64 `X-PAYMENT-RESPONSE` | unit | live client pay-and-retry → UAT |
| PAY-01 reject ladder | vitest: invalid / insufficient / expired / absent / **replayed** ⇒ 402 with a secret-free reason (`nonce_replayed`/`payment_expired`/…) | unit | — |
| PAY-01 `self` backend | vitest: verify predicate (owner===payer + `instrument.id==='USDCx'` + `amount>=price` + `lock===null`) + settle = `moveExactHolding(cid,price,venue)` against a **stubbed ledger** | unit | real USDCx transfer on live DevNet → UAT |
| PAY-01 `canton-cc` backend | vitest: verify/settle against **stubbed `fetch`** of the generic `/verify`+`/settle` contract | unit | real FTP facilitator + real $CC → UAT |
| PAY-01 secret-sweep | vitest: no operator token / `X402_FACILITATOR_KEY` / `ANTHROPIC_API_KEY` sentinel in any body or header (402 envelope + `X-PAYMENT-RESPONSE` included) | unit | — |
| PAY-01 free-path allow-list | vitest: `/health`,`/status`,`GET /round/:id`,`/settle`,`/sandbox/round`,`/fix`,`/rfq*`,`/issuance*` never return 402 | unit | — |
| PAY-01 payment helper | vitest: `constructSelfPayment(...)` builds a valid `X-PAYMENT` that round-trips through the gate's decode | unit | — |
| PAY-01 §4 untouched | vitest: existing `auction.test.ts` §4 golden still clears $100.00 with the gate in the tree | unit (existing) | — |

---

## Wave 0 Requirements

- [ ] `solver/src/x402.test.ts` — gate behavior scaffold (off-unchanged / 402-envelope / 402-then-200 / reject-ladder / secret-sweep / free-paths / construct-payment).
- [ ] `solver/src/facilitator.test.ts` — `self` (stubbed ledger) + `canton-cc` (stubbed `fetch`) scaffold.
- [ ] **No new framework/dependency install** — vitest is present; the phase adds **zero npm packages** (hand-rolled, wire-compatible; `x402-express` is EVM/Solana-oriented and rejected).

*Existing vitest infrastructure covers all phase requirements; Wave 0 adds the two new-module test scaffolds only. No Daml scaffolds (no new Daml).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real x402 client pays the gate end-to-end and gets the solve | PAY-01 | Needs an external x402-speaking client/agent | Enable metering, point an x402 client at `/solve-preview`, confirm 402 → pay → 200 |
| `canton-cc` settles real Canton Coin via the live FTP facilitator | PAY-01 | Needs the FTP Canton x402 facilitator reachable + a CC-funded venue party on a live DevNet node (SV-sponsorship gated) | Set `X402_FACILITATOR=canton-cc` + `X402_FACILITATOR_URL`, drive a paid round, confirm on-ledger $CC settle |
| `self` settles a real USDCx transfer on live DevNet | PAY-01 | Needs a booted Canton DevNet node + funded desk USDCx | Enable metering (`self`), pay with a real desk USDCx Holding cid, confirm the venue Holding grows |
| Exact Canton CAIP-2 network id + Canton Coin asset id | PAY-01 | Not publicly documented; env-driven | Confirm against the facilitator's `GET /supported` at UAT |

---

## Validation Sign-Off

- [x] All PAY-01 behaviors map to an `<automated>` vitest verify or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (single-requirement phase, dense coverage)
- [x] Wave 0 covers the two new-module test scaffolds (no MISSING framework refs)
- [x] No watch-mode flags (all `vitest run`)
- [x] Feedback latency < 20s (module tests)
- [x] `nyquist_compliant: true` set in frontmatter (per-task IDs assigned when the planner writes PLAN.md files)

**Approval:** approved 2026-07-10 (derived from 14-RESEARCH.md Validation Architecture; default-OFF byte-unchanged is the primary invariant test)
