---
phase: 12-real-on-chain-canton-devnet
audited: 2026-07-10
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
status: passed
verdict: PASS — no High/Critical open; phase not blocked
threats_total: 13
threats_closed: 13
threats_open: 0
findings_high: 0
findings_critical: 0
findings_low: 1
residuals:
  - "scripts/.compliance-token not gitignored (LOW — dev-only unsafe-HS256 token; recommend one-line add)"
  - "Live SV-sponsored DevNet connection (CHAIN-01) — external business gate, days–weeks; labeled"
  - "§4-on-real-Canton + live DAR-vet (CHAIN-02) — live UAT; §4=$100 proven offline"
  - "Live OIDC token exchange + live MFA/OTP (IDEN-01/02) — live UAT; proven offline vs mocked issuer"
  - "Live human MFA'd Compliance four-eyes (IDEN-03) — live UAT; on-ledger gate + distinct-authority proven offline"
  - "Unattended live ops (CHAIN-03) — live UAT; configs/scripts offline-validated"
---

# Phase 12 — Security Threat Verification (Real On-Chain / Canton DevNet)

**Phase:** 12 — Real On-Chain / Canton DevNet (IDEN-01/02/03 + CHAIN-01/02/03)
**ASVS Level:** 1 · **block_on:** high
**Verdict:** **PASS** — every declared mitigation is present in shipped code and independently re-run green. No High/Critical open. One LOW secrets-hygiene advisory (non-blocking). All genuinely-live items are honestly scoped to external-gate / UAT.

This audit does not trust `12-VERIFICATION.md`. Every mitigation below was located by grep in the cited file and, where the control is executable, re-run in-process this session (daml test, solver vitest, realm/devnet node tests, web bundle secret scan).

## Independent Gate Results (re-run this session, not trusted from docs)

| Gate | Command | Result |
|------|---------|--------|
| Daml on-ledger four-eyes + §4 | `daml test` | **exit 0** — all `ok`; `test_four_eyes_clears_at_100`, `test_settled_balances`, `test_settle_without_approval_rejected`, `test_settle_wrong_approval_rejected`, `test_operator_cannot_self_approve`, `test_four_eyes_requires_distinct_party` all `ok` |
| Solver auth (IDEN-01 JWKS) | `vitest run auth` | **7/7** — accept + wrong-aud + wrong-key + expired + wrong-iss reject + secret-sweep |
| Solver ledger (IDEN-03 wiring + §8 backstop) | `vitest run ledger` | **9/9** — four-eyes threaded, §8 wrong-price/overfill reject, no token leak |
| Keycloak realm shape (IDEN-02) | `node realm.test.mjs` | **8/8**, exit 0 |
| DevNet deploy shape (CHAIN-02) | `node devnet-deploy.test.mjs` | **9/9**, exit 0 |
| Web bundle secret scan | `grep client_secret/OIDC_CLIENT_SECRET/umbra-solver web/dist/assets/*.js` | **0 matches** — confidential secret never in the browser |

## Threat Verification (by disposition)

| Threat ID | Category (STRIDE) | Disposition | Verdict | Evidence (shipped code) |
|-----------|-------------------|-------------|---------|-------------------------|
| IDEN-03 | Four-eyes bypass — operator self-approves / collapsed party (Elevation of Privilege) | mitigate | **CLOSED** | `daml/Umbra/Approval.daml:90` `signatory operator, compliance`; `:70` distinctness assert in `ApproveClearing`; `:106` distinctness assert in `assertClearingApproved`; `daml/Umbra/Auction.daml:394-395` `fetch approvalCid` + `assertClearingApproved operator roundId priceDec appr` after §8 recompute, before `buildGrossInstructions`. `test_four_eyes_requires_distinct_party` forges a collapsed `ClearingApproval` into a real `Round.Clear` → rejected. daml test green. |
| IDEN-03 | Solver runtime self-approval (four-eyes bypass) | mitigate | **CLOSED** | `solver/src/ledger.ts:489` `gatherApprovalCid` HARD-FAILS when `!_complianceDistinct && !ALLOW_OPERATOR_COMPLIANCE`; `resolveCompliance` (`:178,:192`) throws when configured compliance party == operator; distinct compliance from `.compliance-token` / `COMPLIANCE_PARTY+TOKEN`. ledger.test 9/9. |
| IDEN-03 | §8 recompute backstop intact (verify-don't-trust) | mitigate | **CLOSED** | `daml/Umbra/Auction.daml:365-366` `assertMsg "clearingPrice does not match recomputed §8 p*"` unchanged, fires before the approval fetch; `test_clear_rejects_bad_allocation` + solver wrong-price/overfill reject tests green. |
| IDEN-01 | alg:none / algorithm-confusion downgrade (Spoofing/Tampering) | mitigate | **CLOSED** | `solver/src/auth.ts:99` `algorithms: ['RS256']` pinned; auth.test rejects wrong-key/forged. Participant `deploy/canton/participant-oidc-auth.conf:39` `type = jwt-jwks` (RS256). |
| IDEN-01 | Wrong-audience token accepted (Elevation of Privilege) | mitigate | **CLOSED** | `auth.ts:100` `audience: CANTON_AUDIENCE`; `:101` `issuer: oidcIssuer()` (MED-03) pinned; `participant-oidc-auth.conf:44` `target-audience = "https://canton.network.global"`, no `target-scope` (audience XOR scope). auth.test: wrong-aud + wrong-iss reject. |
| IDEN-01 | Dual-mode doesn't weaken dev path | mitigate | **CLOSED** | `ledger.ts:69` `OIDC_MODE` switch; dev HS256 `scripts/.operator-token` branch byte-unchanged; OIDC branch additive. Existing solver suite green. |
| IDEN-01 | Client secret leaked in browser bundle (Information Disclosure) | mitigate | **CLOSED** | `web/src/auth/oidc.ts:40-46` public PKCE client (`response_type: 'code'`, `client_id: 'umbra-web'`, **no** `client_secret`); `auth.ts:40,76` `OIDC_CLIENT_SECRET` module-private, only in POST body, never returned/logged. Built web bundle: 0 secret matches. |
| IDEN-02 | Per-desk RBAC (Access Control) | mitigate | **CLOSED** | `deploy/keycloak/umbra-realm.json` realm roles Trader/Compliance/Admin; users mapped (bankA/B/C/guest→Trader, compliance→Compliance, admin→Admin); User-Client-Role mapper + audience mapper → `https://canton.network.global`. realm.test 8/8. |
| IDEN-02 | MFA/OTP on settlement-affecting roles | mitigate | **CLOSED** | `umbra-realm.json` `CONFIGURE_TOTP` required action enabled; conditional browser sub-flows `umbra-otp-compliance` / `umbra-otp-admin` (`conditional-user-role`) bind OTP to Compliance AND Admin; compliance+admin users carry `CONFIGURE_TOTP`. realm.test asserts OTP conditionally bound to both. |
| IDEN-02 | Scoped / revocable keys | mitigate | **CLOSED** | Confidential `umbra-solver` client (serviceAccountsEnabled, publicClient=false) with a rotatable/revocable secret + `daml_ledger_api` default scope; public `umbra-web` holds no secret. Revoke = rotate secret / disable client (documented). |
| CHAIN-02 | Token `sub` maps to no rights → silent 403 (Denial of Service) | mitigate | **CLOSED** | `deploy/devnet/devnet-deploy.mjs:16` grantRights `POST /v2/users/{ADMIN}/rights` so admin==`sub` holds actAs/readAs (Pitfall 3); devnet-deploy.test asserts the grant shape; `participant-oidc-auth.conf:23-29` + `RUNBOOK.md` Step 4 document it as the #1 live watch item. |
| CHAIN-02 | Unvetted DAR routes nothing (Denial of Service) | mitigate | **CLOSED** | `devnet-deploy.mjs:13-14` upload+VET on `/v2/packages` + GET vet-confirm; `RUNBOOK.md:25` re-vet the new four-eyes package hash on every stakeholder participant (Pitfall 6); devnet-deploy.test asserts upload/vet shapes. |
| CHAIN-01 | Stale / one-time onboarding secret reused (Spoofing) | transfer (external gate) | **CLOSED** | `deploy/SV-SPONSOR-CHECKLIST.md` documents the JIT one-time onboarding secret (self-serve 1h / SV 48h) + egress-IP allowlist ordering (Pitfall 5); `validator-compose/.env.example` `ONBOARDING_SECRET=REPLACE_..._AT_UAT` placeholder. Live issuance is the external SV gate, honestly labeled. |

## Secrets Sweep (entire committed phase surface)

**Result: clean — no real secret / client secret / sponsor URL / onboarding secret / DB password committed.**

- `.env.example`, `web/.env.example`: `ANTHROPIC_API_KEY=` / `OIDC_CLIENT_SECRET=` blank; web side documented "PUBLIC, NO SECRET".
- `deploy/devnet/validator-compose/.env.example`: `SPONSOR_SV_URL` / `ONBOARDING_SECRET` / `VALIDATOR_AUTH_CLIENT_SECRET` / `POSTGRES_PASSWORD` all `REPLACE_WITH_..._AT_UAT`.
- `deploy/keycloak/umbra-realm.json`: solver secret `REPLACE_WITH_REAL_CLIENT_SECRET_AT_UAT`; all 6 user credentials `CHANGE_ME_AT_UAT` (temporary=true).
- Compose files (`keycloak`, `postgres`, `validator-compose`): every password/secret is an env-var reference (`${VAR}` / `${VAR:?…}`) or the `REPLACE_*` placeholder default — no literal secrets.
- Web dist bundle: `grep client_secret|OIDC_CLIENT_SECRET|umbra-solver` → 0 matches.
- `.gitignore` covers `.env*`, `web/src/tokens.json`, `scripts/.operator-token`, `scripts/localnet/.deploy.json`/`.tokens.json`, `parties.json`, `solver/proofs/`.

## Residual Findings

### LOW-1 — `scripts/.compliance-token` is not gitignored (secrets hygiene)

The solver reads a compliance bearer from `scripts/.compliance-token` (`solver/src/ledger.ts:171`). `scripts/.operator-token` — the same class of dev credential (HS256, `unsafe`-signed) — IS gitignored (`.gitignore:37`), but `.compliance-token` is not. `git check-ignore scripts/.compliance-token` → **NOT IGNORED**; the file does not exist yet (nothing leaked), so this is a *latent* hygiene gap.

- **Severity:** LOW. The dev compliance token is an `unsafe`-secret-signed HS256 LocalNet bearer (the signing secret is the publicly-known dev value `unsafe`); on the DevNet/prod path the compliance identity comes from `COMPLIANCE_PARTY`/`COMPLIANCE_TOKEN` env (in the gitignored `.env`), never this file. Committing it would leak nothing not already derivable on dev. Not High/Critical → does not block the phase.
- **Not auto-fixed:** implementation/config files are read-only for this audit (only this SECURITY.md is written). Recommended one-line change for the executor:

  ```gitignore
  # Dev/UAT compliance bearer for the four-eyes approve step — same class as .operator-token, never commit.
  scripts/.compliance-token
  ```

## Accepted Residual Risk — Live / External-Gate Items (honestly deferred, not gaps)

All five carry buildable, offline-verified code/config; only the genuinely-live portion is deferred. Consistent with the project's "Built · live UAT pending" honesty bar and the ROADMAP external-gate framing.

| Item | Requirement | Disposition | Why deferred |
|------|-------------|-------------|--------------|
| SV-sponsored live DevNet connection | CHAIN-01 | External gate | SV sponsorship + egress-IP allowlist adoption (2–7 days) is a business/consensus gate, not code. Compose + checklist + runbook built. |
| §4 on real Canton + live DAR-vet | CHAIN-02 | Live UAT | Needs the CHAIN-01 node. §4=$100.00/A10·B8·C2 proven offline (daml test); deploy shapes proven 9/9. |
| Live OIDC token exchange + live MFA/OTP | IDEN-01/02 | Live UAT | Needs booted Keycloak + issuer-wired Canton. Acquire/verify proven offline vs a mocked issuer (jose keypair + local JWKS); realm shape 8/8. |
| Live human MFA'd Compliance four-eyes | IDEN-03 | Live UAT | On-ledger gate + distinct-authority invariant + solver seam built and daml-test-proven offline; a real second-person approver against a booted stack is UAT. The shipped runtime auto-approves via a *distinct* compliance token, honestly labeled ("DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT"). |
| Unattended live ops | CHAIN-03 | Live UAT | Postgres-per-network compose, `pg-dump.sh`, `prometheus.yml`, traffic-topup config built and offline-validated; unattended run needs the live node. |

## Unregistered Flags

None. No new attack surface appeared during implementation that lacks a mapping in the threat register (IDEN-01/02/03, CHAIN-01/02/03) or the STRIDE table in `12-RESEARCH.md § Security Domain`.

## Prior HIGH Findings (12-REVIEW.md) — fixes independently confirmed

| Finding | Fix | Independent confirmation this session |
|---------|-----|----------------------------------------|
| HIGH-01: on-ledger gate did not enforce operator ≠ compliance (collapsed-party self-approval) | distinctness assert added in BOTH `ApproveClearing` and `assertClearingApproved` | `Approval.daml:70` + `:106` present; `test_four_eyes_requires_distinct_party` (forges collapsed approval into a real `Round.Clear`) `ok` under `daml test`. **HOLDS.** |
| HIGH-02: solver `settle()` always self-approved (cosmetic REJECT) | `gatherApprovalCid` hard-fails on non-distinct compliance unless explicit `UMBRA_ALLOW_OPERATOR_COMPLIANCE=1`; `resolveCompliance` throws on configured collapse | `ledger.ts:489` hard-fail + `:178/:192` collapse-throw present; ledger.test four-eyes path uses a distinct compliance party. Runtime four-eyes (distinct-token auto-approval) honestly scoped; live human = UAT. **HOLDS.** |

---

_Audited: 2026-07-10 · gsd-security-auditor · ASVS L1 · block_on: high_
_Method: grep-located mitigation in cited shipped file + in-process re-run of every executable control (daml test, solver vitest, realm/devnet node tests, web bundle secret scan). Documentation and intent were not accepted as evidence._
