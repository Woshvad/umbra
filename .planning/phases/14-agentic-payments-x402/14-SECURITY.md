---
phase: 14-agentic-payments-x402
audit: security
audited: 2026-07-11
auditor: gsd-secure-phase (adversarial / FORCE stance)
asvs_level: 2
verdict: SECURED
threats_total: 16
threats_closed: 16
threats_open: 0
high_critical_unmitigated: 0
files_reviewed:
  - solver/src/x402.ts
  - solver/src/facilitator.ts
  - solver/src/payer-auth.ts
  - solver/src/ledger.ts
  - solver/src/api.ts
  - solver/src/index.ts
  - solver/src/x402.test.ts
  - solver/src/facilitator.test.ts
  - solver/src/payer-auth.test.ts
  - solver/src/x402.wiring.test.ts
  - solver/.env.example
---

# Phase 14 — x402 Metered Solver Access — Security Audit

**Verdict: `SECURED`** — 16/16 declared threats CLOSED, 0 high/critical unmitigated.

Every mitigation in the three `<threat_model>` blocks (14-01/02/03-PLAN.md) plus the two
load-bearing code-review findings the objective singled out (CR-01 payer spoofing, HI-01
charge-without-service) was verified to EXIST in the shipped code at a specific file:line and to
be covered by a real regression test — not accepted on documentation or intent. ASVS target
assessed at **L2** (real value movement / fee seizure surface → V2/V4/V5/V6/V7 apply).

The audit was run adversarially: each mitigation was assumed absent until a grep/read proved it
present AND applied to every entry point (both metered routes, both facilitator backends, the
gate + facilitator + seam layers).

---

## 1. Declared threat register verification (STRIDE — from PLAN `<threat_model>` blocks)

| Threat ID | STRIDE | Disposition | Mitigation in code (file:line) | Status | Test |
|-----------|--------|-------------|--------------------------------|--------|------|
| T-14-01 | Spoofing/Elevation — X-PAYMENT replay | mitigate | Spent-nonce `TtlSet` + `validBefore` guard: `x402.ts:375,400,407`; nonce burned post-settle `x402.ts:476` | **MITIGATED** | `x402.test.ts:292-300` (nonce_replayed), `:335-355` (post-TTL replay) |
| T-14-02 | Tampering — double-use of a fee-Holding cid | mitigate | Spent-holding `TtlSet` `x402.ts:376,408-411`; burned post-settle `x402.ts:477`; ledger archive backstop `ledger.ts:900,916` | **MITIGATED** (HTTP layer offline; ledger-archive leg = UAT) | `x402.test.ts:303-320` (holding_replayed) |
| T-14-03 | Info Disclosure — secret in 402 body / X-PAYMENT-RESPONSE / raw throw | mitigate | `send402` authored reasons `x402.ts:358`; `safeReason` allow-list filter `x402.ts:110,363`; `X402Error` carries only a reason code `x402.ts:113-118`; catch-all collapse `x402.ts:502-505` | **MITIGATED** | `x402.test.ts:446-465` (sentinel absent from body+header) |
| T-14-04 | DoS/Tampering — malformed / oversized X-PAYMENT | mitigate | zod `.strict()` outer+nested + bounded string lengths `x402.ts:135-154`; `MAX_HEADER_LEN=8192` pre-decode bound `x402.ts:157,219` | **MITIGATED** | `x402.test.ts:142-162` (malformed/oversized/wrong-shape) |
| T-14-05 | Tampering — default-OFF perturbs the money-shot | mitigate | FIRST handler line `if (!opts.enabled) return next()` `x402.ts:380`; DI default `createX402Gate({ enabled: false })` `api.ts:613` | **MITIGATED** | `x402.test.ts:187-203` (byte-identical), `x402.wiring.test.ts:123-137` (§4 canary $100) |
| T-14-06 | Tampering — insufficient / wrong-instrument / wrong-owner / locked fee Holding | mitigate | `self.verify` predicate `facilitator.ts:84-108` (owner===authedPayer, USDCx, !locked, value===price, amount≥price) | **MITIGATED** (hardened past the original spec by CR-01) | `facilitator.test.ts:115-175` (full reject ladder) |
| T-14-07 | Tampering — double-settle of the same cid | mitigate | Gate spent-cid set (see T-14-02) + on-ledger Reassign archives the cid `ledger.ts:900,916` so a stale re-verify fails naturally | **MITIGATED** (ledger-archive backstop confirmable at UAT) | `x402.test.ts:303-320`; `facilitator.test.ts:185-191` |
| T-14-08 | Info Disclosure — facilitator key exposure (canton-cc) | mitigate | Key rides ONLY `Authorization` header `facilitator.ts:160`, closure-private, never returned; non-2xx → status-only `Facilitator HTTP <status>` `facilitator.ts:172-176` | **MITIGATED** | `facilitator.test.ts:237-258` (non-2xx status-only), `:327-352` (key absent from all results) |
| T-14-09 | Info Disclosure — operator bearer / raw ledger error via settle | mitigate | `moveFee` uses the module-private operator bearer (`ledger.ts` exerciseChoice); settle throw collapses to `{settled:false,txRef:''}` `facilitator.ts:114-118`; txRef is synthetic `umbra-x402-<cid>` `ledger.ts:933` | **MITIGATED** | `facilitator.test.ts:185-191` (throw collapse) |
| T-14-10 | Tampering — fee leaking onto the securities DvP path | mitigate | `moveFee` is a standalone single-Holding Split/Reassign `ledger.ts:872-934` — never calls `settle`/`settleBatch`/`Round.Clear`; §8/settle/tamperClear additive-only (per REVIEW diff) | **MITIGATED** | `x402.wiring.test.ts:128,136` (§4 clears $100 with gate present) |
| T-14-11 | Elevation — gate meters a free/lifecycle/settlement endpoint | mitigate | Per-route attach on EXACTLY 2 routes `api.ts:841,1377`; no `app.use(x402` anywhere (grep=0) | **MITIGATED** | `x402.wiring.test.ts:161-182` (/health,/status,GET round,/settle,/sandbox never 402) |
| T-14-12 | Info Disclosure — facilitator/operator/ANTHROPIC key in 402/header/boot log | mitigate | Key via `SecretsProvider.get` try/catch, module-private `index.ts:399-405`; no `console.*`/logger touches key or header (grep=0 across x402/facilitator/payer-auth); secret-safe error middleware `api.ts` | **MITIGATED** | `x402.wiring.test.ts:184-201` (sentinel absent from 402 body+header) |
| T-14-13 | Elevation — CORS widening | mitigate | `cors({ origin: ALLOWED_ORIGIN })` `api.ts:601`; `ALLOWED_ORIGIN='http://localhost:5173'` `api.ts:69` — never `*`, gate adds no origin | **MITIGATED** | existing api suite (CORS scope unchanged) |
| T-14-14 | Tampering — enabling metering perturbs the §4 demo | mitigate | Default `X402_ENABLED=false` `.env.example:23`, `index.ts:387`; disabled → no-op gate `index.ts:412-416` | **MITIGATED** | `x402.wiring.test.ts:123-137` (§4 canary) |
| T-14-15 | Tampering — fee leaking onto the securities DvP path (wiring) | mitigate | Gate wraps ONLY the 2 AI-compute endpoints; `/settle` never gated `api.ts` (no middleware arg on settle route) | **MITIGATED** | `x402.wiring.test.ts:176-177` (settle never 402) |
| T-14-SC | Tampering — npm supply chain | **accept** | Zero new packages: no `x402-express`/`@x402`/`viem`/`wagmi`/`@solana`/`@coinbase` import anywhere (grep=0); nothing added to `package.json` | **CLOSED (accepted)** — see Accepted Risks | grep verification (this audit) |

**Declared register: 15/15 `mitigate` CLOSED · 1/1 `accept` documented.**

---

## 2. Code-review finding verification (objective's explicit audit checklist)

The objective singled out CR-01 + HI-01 and 8 further REVIEW findings, all marked "fixed."
Each was re-verified in the shipped code against its declared property (not the review's word).

| ID | Property to prove | Verified in code | Status | Test |
|----|-------------------|------------------|--------|------|
| **CR-01** | `self` authenticates the caller and binds the fee source to `owner === authenticatedParty`, NOT the forgeable `payload.from`; a spoofed `from` without the victim's token → `unauthorized_payer`, `moveFee` never called | Gate: authenticate → reject if `!authed` or `p.from !== authed` BEFORE verify/settle `x402.ts:428-436`; passes `authedPayer` (not `from`) to verify `x402.ts:443`. Facilitator: `owner === authenticatedPayer` (fail-closed on missing) `facilitator.ts:88-94`. Seam: HS256 verify + subject→party map, `alg:HS256` pinned `payer-auth.ts:37-52,74-92` | **MITIGATED** | Attacker-can't-mint property: `payer-auth.test.ts:31-33` (wrong-secret→null), `:35-38` (alg:none). Gate: `x402.test.ts:396-412` (spoof→unauthorized, verify+settle never called), `:414-428` (from≠caller). Facilitator: `facilitator.test.ts:94-113` (spoofed from + no-authed both invalid_holding) |
| **HI-01** | verify → serve → settle-ONLY-on-2xx; a handler error does not settle | `res.json` interposition: settle only when `status>=200 && <300` `x402.ts:452-459`; verify is the no-move pre-check `x402.ts:443` | **MITIGATED** | `x402.test.ts:357-374` (500 handler → settle NOT called, no header), `:376-394` (2xx settles once) |
| MD-01 | replay lifetime coupled to `validBefore`; no replay-after-eviction | `validBefore` bounded to `now+maxTimeoutMs` `x402.ts:404-406`; spent entries kept alive to `max(now+ttl, validBefore)` `x402.ts:351,476-477` | **MITIGATED** | `x402.test.ts:322-333,335-355` |
| MD-02 | disabled gate not coupled to backend-config validity | lazy: `!x402Enabled` builds no-op directly, skips `createFacilitator` `index.ts:412-416` | **MITIGATED** | boot-wiring `x402.wiring.test.ts:225-234` |
| MD-03 | canton-cc fetch timeout enforced | `AbortSignal.timeout(maxTimeoutSeconds*1000)` `facilitator.ts:170` | **MITIGATED** | `facilitator.test.ts:290-308` |
| MD-04 | backend-aware accepts[] (no unpayable primary) | `self`→USDCx only, `canton-cc`→CantonCoin only `x402.ts:211-213` | **MITIGATED** | `x402.test.ts:102-119` |
| LO-01 | moveFee returns the EXACT new venue cid | diff pre-Reassign ACS `ledger.ts:894-933` | **MITIGATED (live-ledger UAT)** | port-stubbed offline |
| LO-02 | `value === maxAmountRequired` enforced | atomic-string equality `facilitator.ts:101-103` | **MITIGATED** | `facilitator.test.ts:168-175` |
| LO-03 | integer atomic-unit comparison (no float `===`) | `atomic(x)=round(x*100)` `ledger.ts:892,897,912,930` | **MITIGATED (live-ledger UAT)** | port-stubbed offline |
| LO-04 | distinct `holding_replayed` reason | `X402_REASON.holding_replayed` `x402.ts:101,410` | **MITIGATED** | `x402.test.ts:303-320` |

---

## 3. Audit-checklist coverage (objective's 7 items)

1. **Payer spoofing / unauthenticated fee seizure (CR-01):** MITIGATED. The money-move
   authorization is bound to the server-verified identity at BOTH layers (gate `p.from===authed`;
   facilitator `owner===authedPayer`). Critically, presenting your OWN valid token but a victim's
   `holdingCid` still fails — `facilitator.ts:92` compares the on-ledger holding's `owner` to the
   authenticated caller, so you cannot pay from a cid you do not control. The attacker-can't-mint
   property is directly encoded (`payer-auth.test.ts:31-33`).
2. **Charge-without-service (HI-01):** MITIGATED — settle is the last step, gated on a 2xx.
3. **X-PAYMENT replay:** MITIGATED — spent-nonce + spent-holding sets, `validBefore` bounded to
   the retention window, entries kept alive until `validBefore` (no replay-after-eviction).
4. **Fee source integrity:** MITIGATED — cannot over/under-declare (`value===price`), cannot
   double-collect a cid (spent-set + ledger archive), cannot pay in the wrong instrument.
5. **Secret discipline:** MITIGATED — key via SecretsProvider, module-private; no secret in any
   402 body / X-PAYMENT-RESPONSE / `/status` (no x402 status line was added) / log line (zero
   `console.*` in the x402 paths). Secret-sweep tests assert the sentinel is absent.
6. **canton-cc adapter:** MITIGATED — key only on the Authorization header; non-2xx → status-only
   reason (body not echoed); `AbortSignal` timeout enforced.
7. **Blast-radius / invariants:** MITIGATED — fee path is OFF the DvP path; default-OFF is a true
   no-op; CORS stays `:5173`-only; zod `.strict` bounds malformed/oversized input.

---

## 4. Unregistered flags / new attack surface

None unmapped. The only genuinely-new surface — the untrusted `X-PAYMENT` header and the
`Authorization` payer-token — is covered by T-14-01/03/04 + CR-01. No new npm dependency, no new
Daml template/choice, no new CORS origin, no new logging sink was introduced.

---

## 5. Residual / accepted risks (all offline-covered; none block the phase)

- **Live-ledger `moveFee` ref-integrity (LO-01/LO-03):** the exact-new-cid capture and the
  integer-atomic split-slice match are proven only against the stubbed `FacilitatorLedger` port
  offline; the on-ledger Reassign archive (the T-14-07 backstop) and the sub-unit-fee split are
  confirmable only on a booted LocalNet at UAT (`14-UAT.md`). Offline behavior is correct; this is
  an execution-environment gap, not a code gap.
- **Payer-signed on-ledger variant deferred:** the `self` backend is honestly labeled
  custodian-executed-on-presented-authorization (`SELF_CUSTODY_LABEL`, `facilitator.ts:37`); the
  true payer-signed transfer is the `canton-cc` path, deferred to UAT. CR-01 closes the spoof for
  the demo via caller-authentication — a strictly weaker-but-sufficient control that is documented
  as such, not over-claimed.
- **Log-sink secret sweep:** verified offline by ABSENCE (grep: zero `console.*`/logger calls in
  x402.ts / facilitator.ts / payer-auth.ts, and no key/header interpolation in the `index.ts` boot
  log). A full runtime log audit remains a cheap UAT belt-and-suspenders confirmation.
- **Multi-instance replay store:** the spent-nonce/holding sets are single-instance in-memory
  (mirrors idempotency.ts); a horizontally-scaled deployment needs the documented Postgres swap.
  Accepted for the single-instance demo posture.
- **T-14-SC supply chain (accepted):** zero external packages added; the EVM/Solana x402 middleware
  was evaluated and rejected, not installed. Nothing to monitor in `package.json` for this phase.

---

## 6. Verdict

**`SECURED` — 16/16 threats CLOSED, 0 high/critical unmitigated.**

The headline critical (CR-01 unauthenticated fee seizure) and high (HI-01 charge-without-service)
are both genuinely fixed in shipped code with property-level regression tests — the fee move is
bound to a server-verified identity at two layers and only fires on a serviceable 2xx. The
default-OFF invariant, the two-route allow-list, the CORS `:5173` scope, and the §8/`settle`/
`Round.Clear` byte-invariance all hold. Metering MAY be enabled against real funds subject only to
the live-ledger UAT gates in `14-UAT.md` (LO-01/LO-03 ref-integrity, real-$CC canton-cc, log-sink
sweep) — none of which are code defects.
