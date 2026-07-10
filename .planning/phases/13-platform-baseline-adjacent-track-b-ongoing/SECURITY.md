# SECURITY.md — Phase 13: Platform Baseline + Adjacent (Track B)

**Audit date:** 2026-07-10
**Diff range verified:** `5753996..HEAD` (18651f1)
**ASVS Level:** 1
**Block policy:** block on HIGH/CRITICAL open threats
**Verdict:** SECURED — 42/42 threats CLOSED (41 mitigate + 1 accepted). 0 open. No HIGH/CRITICAL.

Every mitigation below was verified by locating the actual control in implemented code
(and its guarding test), not by accepting plan/summary intent. Implementation files were
read-only; nothing was patched.

---

## Threat Verification (STRIDE register T-13-SC, T-13-01…T-13-41)

| Threat ID | Category | Disposition | Status | Evidence (file:line) |
|-----------|----------|-------------|--------|----------------------|
| T-13-SC | Tampering (npm supply chain) | mitigate | CLOSED | Only official CNCF `@opentelemetry/*` scoped packages imported (`solver/src/telemetry.ts:35-64`); 13-01-SUMMARY "Checkpoint Resolution (Task 1)" records official-org + no-postinstall gate |
| T-13-01 | Information Disclosure | mitigate | CLOSED | `logger.ts:20-37` `redact()` regex `(token\|key\|authorization\|cookie\|secret\|password\|env)` recursive; `telemetry.ts:231` span sets `round.id` only; `logger.test.ts` + `telemetry.test.ts` secret-sweep |
| T-13-02 | Information Disclosure (error logging) | mitigate | CLOSED | Catch logs fixed string + `err.name` only, never `err.message`: `agent.ts:149,390,556,601`, `telemetry.ts:238`, `webhooks.ts:182` |
| T-13-03 | Information Disclosure (Vault) | mitigate | CLOSED | `secrets.ts:40` `vaultToken()` module-private, `:60` token in `X-Vault-Token` header only, `:65` throw `Vault HTTP ${status}` (body never interpolated); `secrets.test.ts` SENTINEL_VAULT_TOKEN sweep |
| T-13-04 | Information Disclosure (/status) | mitigate | CLOSED | `status.ts:45-55` `buildStatus` explicit allow-list keys (no spread); `StatusInput`/`StatusJson` health-only types; `status.test.ts` order-sweep + secret-sweep |
| T-13-05 | Spoofing (dev Vault root token) | **accept** | CLOSED | Accepted risk logged below; AppRole documented as prod path; live Vault is a UAT gate |
| T-13-06 | Tampering (idempotency) | mitigate | CLOSED | `idempotency.ts:72-73` sha256 over `canonicalJson`, `:92-104` 422 on same-key-diff-body; `canonicalJson:56-69` defeats false 422 |
| T-13-07 | Tampering (FSM) | mitigate | CLOSED | `fsm.ts:48-51` `transition()` throws 409 ILLEGAL_TRANSITION on illegal edge; `fsm.test.ts:29` settle-before-clear rejected |
| T-13-08 | Information Disclosure (idem store) | mitigate | CLOSED | `idempotency.ts:32-37` `Entry` = {bodyHash,status,body,at} only (no token/header/secret); `idempotency.test.ts` secret-sweep |
| T-13-09 | Spoofing/Tampering (webhook sig) | mitigate | CLOSED | `webhooks.ts:39-40` HMAC-SHA256 over `${ts}.${rawBody}`, `:45-55` `timingSafeEqual` verify (length-guarded), `:60-64` `isReplayFresh` replay-guard, `:167` X-Umbra-Timestamp header |
| T-13-10 | Information Disclosure (payload) | mitigate | CLOSED | `webhooks.ts:132` secret in private closure Map, `:196-201` `register` returns secret-free handle, `:146` payload secret-free, `:83-90` DeliveryRecord secret-free (`lastError`=name/HTTP status); `webhooks.test.ts` SECRET sweep |
| T-13-11 | Tampering (sandbox drift) | mitigate | CLOSED | `sandbox.ts:63-71` `assertSandboxClears` asserts $100.00 + set {A:10,B:8,C:2}; `auction.ts` byte-unchanged in diff |
| T-13-12 | Tampering/DoS (FIX parse) | mitigate | CLOSED | `fix.ts:93-107` `parseFix` returns null (never throws), `:210-215` `handleFixMessage` → 35=8 reject; `bodyLength`/`checkSum` bounds-guarded `:63-88`; `fix.test.ts:151` malformed → reject, no-throw |
| T-13-13 | Spoofing (session) | mitigate | CLOSED | `fix.ts:164-166` `buildOutbound` increments monotonic `outSeqNum`(34) on every outbound; `fix.test.ts:172` monotonic MsgSeqNum |
| T-13-14 | Information Disclosure (FIX out) | mitigate | CLOSED | `fix.ts` reads no operator token / ANTHROPIC key; `buildExecReport:181-203` echoes only mapped fields + fixed reason strings; `fix.test.ts` secret-sweep |
| T-13-15 | Tampering (prompt inj via FIX) | mitigate | CLOSED | `fix.ts:54-58,139` `submitOrderSchema` zod re-validation; foreign symbol/OrdType/Side → null `:132-137`; no free text reaches AI |
| T-13-16 | Tampering (quote forgery) | mitigate | CLOSED | `Rfq.daml:111` `signatory operator, dealer`; `AcceptQuote:69-74` fetch + assertMsg operator/requester/instrument/quantity; `Tests.daml:1653` `test_rfq_quote_is_firm` |
| T-13-17 | Information Disclosure (RFQ leak) | mitigate | CLOSED | `Rfq.daml:50` `observer dealers` (explicit set); `:112` Quote `observer requester` only; `Tests.daml:1677` `test_rfq_privacy` |
| T-13-18 | Tampering (settlement bypass) | mitigate | CLOSED | `Rfq.daml:95` `settleBatch operator …` reuses proven DvP-integrity path, all-or-nothing (Daml transactionality) |
| T-13-19 | Information Disclosure (/status+spans) | mitigate | CLOSED | Composite of T-13-04 (buildStatus aggregate-only) + T-13-01 (redacting logger, `round.id`-only span); `api.test.ts` secret-sweep extended to new endpoints |
| T-13-20 | Tampering (idem/FSM) | mitigate | CLOSED | Composite of T-13-06 (dedupe/422) + T-13-07 (409); ledger `Round.status` backstop |
| T-13-21 | Information Disclosure (SecretsProvider) | mitigate | CLOSED | `secrets.ts` `get()` returns value only; ANTHROPIC key resolved server-side, `agent.ts:287` `_client` module-private, never returned/logged/echoed |
| T-13-22 | Tampering (over-mint) | mitigate | CLOSED | `Issuance.daml:109` `computeClearing`, `:114-117` `buyFills == sellFills` && `<= trancheSize`; `Tests.daml:1820` `totalOf after bond2 === 10.0` "no over-mint" |
| T-13-23 | Tampering (double coupon) | mitigate | CLOSED | `Issuance.daml:152` `notElem period couponsPaid`, `:170` append on success; `Tests.daml:1856` `submitMustFail` on 2nd same-period coupon + positive control (period 2 pays) |
| T-13-24 | Tampering (§4 perturbation) | mitigate | CLOSED | `Clearing.daml` byte-unchanged in diff; `Issuance.daml` imports leaf types only (not `Auction`); distinct `BOND2` instrument; `Tests.daml` BONDX total byte-identical |
| T-13-25 | Spoofing/Tampering (webhook emit) | mitigate | CLOSED | Reuses T-13-09 HMAC + replay guard; `webhooks.ts:146` payload carries only aggregate/round data |
| T-13-26 | Information Disclosure (register resp) | mitigate | CLOSED | `webhooks.ts:196-201` subscription secret never echoed; `webhooks.test.ts` secret-sweep |
| T-13-27 | Tampering/DoS (POST /fix) | mitigate | CLOSED | `fix.ts` bounds-checked parse; malformed → 35=8, never a 500 (T-13-12 path) |
| T-13-28 | Tampering (POST /sandbox/round drift) | mitigate | CLOSED | `sandbox.ts` `assertSandboxClears`; isolated fixture (`sandboxFixtureOrders` returns fresh copy) |
| T-13-29 | Tampering (unfair clear) | mitigate | CLOSED | `agent.ts:370-375` referee gate — verified only on exact §8 match; deterministic clear settles unconditionally (AI off settle path) |
| T-13-30 | Denial of Service (hang) | mitigate | CLOSED | `agent.ts:315` `withTimeout`, `:386-392` per-config catch → `verified:false`; `proposeCompeting` never throws |
| T-13-31 | Information Disclosure (CompetingResult) | mitigate | CLOSED | `agent.ts:287` `_client` module-private key discipline; catch logs `err.name`; secret-sweep in agent tests |
| T-13-32 | Tampering (RFQ forgery via ledger) | mitigate | CLOSED | `ledger.ts:968-1012` `acceptQuote` exercises on-ledger `AcceptQuote` (instrument/requester/quantity asserts); dealer-signatory firm quote |
| T-13-33 | Tampering (issuance over-mint via ledger) | mitigate | CLOSED | `ledger.ts:1094-1152` `clearIssuance` exercises on-ledger `ClearIssuance` (§8 + conservation asserts); mint == cleared |
| T-13-34 | Information Disclosure (endpoints/wrappers) | mitigate | CLOSED | `ledger.ts:148,230` `_devOperatorToken` in Authorization header only, never echoed; RFQ/issuance summaries are scalars + party/contract ids only |
| T-13-35 | Tampering (AI as authoritative) | mitigate | CLOSED | `api.ts:261-262` `/competing` "no settlement path consults the winner (AI strictly off the settlement path)"; deterministic §8 + Round.Clear settle |
| T-13-36 | Information Disclosure (web solver.ts) | mitigate | CLOSED | `web/src/solver.ts` every fn rides `SOLVER_BASE_URL`, no auth header; `cryptoUrls.test.ts:137-141` + `leaderboard.test.ts:144-147` source-scan asserts no `:4000` / `ANTHROPIC_API_KEY` / `sk-ant` / auth header |
| T-13-37 | Tampering (misrepresent AI) | mitigate | CLOSED | `SolverLeaderboard.tsx:27` `HONEST_TAG = 'LEADERBOARD · NARRATIVE — NOT A SETTLEMENT INPUT'`, `:8-10` `DETERMINISTIC §8 CLEAR — AUTHORITATIVE`; winner ink weight, never lime (`:180`) |
| T-13-38 | Information Disclosure (RfqPanel bundle) | mitigate | CLOSED | `RfqPanel.tsx` desk-plane only, no operator token / `@daml/react` / Anthropic key; `RfqPanel.test.tsx:155` grep-clean sweep + credential-free request assertion (`:142-147`) |
| T-13-39 | Tampering (misrepresent settlement) | mitigate | CLOSED | `RfqPanel.tsx:42` `HONEST_TAG = 'RFQ · 1×1 DVP — SAME ATOMIC SETTLEMENT'`, reuses real `DvpLegs` + `AtomicStamp` (`:30-31,195`) — no separate engine implied |
| T-13-40 | Information Disclosure (IssuancePanel bundle) | mitigate | CLOSED | `IssuancePanel.tsx` theatre-plane display only; `IssuancePanel.test.tsx:132` grep-clean of `@daml/react`/`ANTHROPIC`/`sk-ant`/`Authorization`/`Bearer`/`:4000` + credential-free request (`:119-121`) |
| T-13-41 | Tampering (design fidelity — lime) | mitigate | CLOSED | `IssuancePanel.tsx:7-10` all lime delegated to reused `PriceReveal` uniform-price reveal; panel introduces no raw lime literal of its own |

---

## Accepted Risks Log

| Threat ID | Category | Rationale | Compensating control | Prod path / gate |
|-----------|----------|-----------|----------------------|------------------|
| T-13-05 | Spoofing (dev Vault root token) | The MVP runs the `SECRETS_PROVIDER=vault` backend against a dev-mode root token, mirroring the pre-existing `unsafe` HMAC dev-token precedent used across the local stack. A root token is unsafe for production but acceptable for the single-operator local/UAT demo. | Backend is opt-in (`SECRETS_PROVIDER` unset ⇒ `.env`); the `env` default preserves current behavior. `VAULT_TOKEN` is module-private (`secrets.ts:40`) and never logged/echoed; non-2xx throws status-only. | AppRole (short-lived, scoped) is the documented prod credential path; live Vault wiring is an explicit UAT gate before any prod claim. |

---

## Unregistered Flags (new attack surface without a threat mapping)

None. The three SUMMARY files that declare a `## Threat Flags` section (13-06, 13-07, 13-09)
each report "None" and map every new surface (`/webhooks`, `/sandbox/round`, `/fix`,
RFQ/issuance choices) to enumerated T-13-NN threats. No new attack surface appeared during
implementation that lacks a threat mapping.

---

## Invariants Re-verified (regression backstops)

- `daml/Umbra/Clearing.daml` — **byte-unchanged** in `5753996..HEAD` (T-13-24).
- `solver/src/auction.ts` — **byte-unchanged** in `5753996..HEAD` (T-13-11, T-13-24).
- §4 golden fixture still clears **$100.00** with fills A=10 / B=8 / C=2 (sandbox + issuance
  are additive on a distinct `BOND2`, never perturbing `BONDX`).
- Reported green suites: solver 284/284, web 136/136, `daml test` exit 0 (secret-sweeps pass).

---

## Result

**SECURED.** 42/42 threats CLOSED (41 mitigated in code + tests, 1 accepted with documented
compensating control and prod gate). 0 open. No HIGH or CRITICAL findings — no ship blocker.
