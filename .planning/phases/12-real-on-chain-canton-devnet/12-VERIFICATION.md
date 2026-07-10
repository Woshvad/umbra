---
phase: 12-real-on-chain-canton-devnet
verified: 2026-07-10T14:05:00Z
status: human_needed
score: 5/5 code-and-config deliverables built + offline-verified (all 5 criteria carry a live/external UAT tail)
re_verification:
  previous_status: none
  note: "Initial verification. Runs after the 12-REVIEW code review whose 2 HIGH + 3 MED + 3 LOW findings are all fixed in git (commits 86c7090, 853446a, b37ed55, 1385103, 8781590, 878c500, 1032c56, 6b19641) and re-verified below."
human_verification:
  - test: "Obtain a Super-Validator sponsorship and connect the Splice validator compose to the real Global Synchronizer on DevNet (CHAIN-01)"
    expected: "The participant/validator joins DevNet via the sponsor URL + JIT onboarding secret; `/readyz`+`/livez` green; the node is a live member of the network"
    why_human: "Genuinely EXTERNAL business gate — SV sponsorship + static-egress-IP allowlist adoption (2–7 days). Cannot be produced on this box; it is not code. Compose + .env.example + SV-SPONSOR-CHECKLIST + RUNBOOK are built and offline-validated."
  - test: "Upload + vet the frozen umbra-0.1.0.dar on the live DevNet participant, allocate the namespaced desk parties, and run the §4 fixture end-to-end on real Canton (CHAIN-02)"
    expected: "DAR vets on-participant (new four-eyes package hash), parties umbra-operator-1/bankA/B/C-1 allocated, §4 clears exactly $100.00 with fills A=10/B=8/C=2 on real Canton"
    why_human: "Requires the live CHAIN-01 node. §4-at-$100.00 is proven offline (daml test) and the deploy script's upload/vet/allocate/grantRights shapes are proven by the 9-check mocked-v2 test; the on-real-Canton run is UAT."
  - test: "Boot Keycloak + Caddy TLS + isolated Postgres, import the umbra realm, and perform a live OIDC token exchange (solver client-credentials RS256, desk auth-code/PKCE) accepted by a Canton participant configured for the issuer, with live MFA/OTP on Compliance+Admin (IDEN-01/02)"
    expected: "Solver acquires a live RS256 client-credentials token and the JSON Ledger API v2 accepts it; desk PKCE login redirects through Keycloak; OTP is prompted for Compliance/Admin; service-account `sub` matches `LEDGER_API_ADMIN_USER`"
    why_human: "Live token exchange + live MFA need a booted Keycloak + a Canton participant wired to the issuer. Acquire+verify are proven offline against a mocked issuer (jose keypair + local JWKS + mock /token); realm shape is proven by realm.test.mjs 8/8."
  - test: "A distinct, MFA'd human Compliance operator approves the recomputed clearing price in the UI before Round.Clear commits (IDEN-03 live four-eyes)"
    expected: "A real Compliance identity (not the operator, not an auto-approving token) signs ApproveClearing; settlement proceeds only after that human sign-off; a REJECT withholds settlement"
    why_human: "The on-ledger gate + distinct-authority invariant + solver seam are built and daml-test-proven offline; a live human second-person approver against a booted stack is UAT. The shipped dev path uses a distinct dev compliance token (auto-approval), honestly labeled."
  - test: "Run the DevNet node unattended: scheduled pg_dump backups, a live Prometheus target scraping the participant/validator, and live Canton-Coin traffic auto-top-up (CHAIN-03)"
    expected: "Backups produce timestamped gzip dumps on schedule; Prometheus shows the participant UP; traffic balance auto-tops-up on DevNet without manual intervention"
    why_human: "Needs the live CHAIN-01 node. The Postgres compose, pg-dump.sh, prometheus.yml, and traffic-topup config are built and offline-validated (compose config valid, bash -n clean)."
---

# Phase 12: Real On-Chain (Canton DevNet) Verification Report

**Phase Goal:** Take Umbra off LocalNet onto the real Canton Network (DevNet) on real auth/ops — the frozen DAR ports unchanged; the work is the connection/auth/ops layer plus the external sponsor gate.
**Verified:** 2026-07-10T14:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (post code-review; all 8 review findings fixed and re-checked)

## Verdict in one line

Every **code / config / ops / script** deliverable the phase promised is present, substantive, wired, and passes its offline gate. The **on-ledger four-eyes control (IDEN-03) is a REAL, `daml test`-proven gate** — not a UI decoration. The genuinely-live and external items (SV sponsorship, DAR-vet-on-real-Canton, §4-on-real-Canton, live OIDC token exchange, live MFA, unattended live ops) are **honestly scoped to UAT / external-gate**, matching the "Built · live UAT pending" pattern of Phases 8–11. No code gaps found → `human_needed`, not `gaps_found`.

## Gate Results (run by the verifier, not trusted from SUMMARY)

| Gate | Command | Result |
|------|---------|--------|
| Daml tests (incl. four-eyes + §4) | `cd daml && daml test` | **ALL OK** — every test `ok`, exit clean. `test_four_eyes_clears_at_100`, `test_settled_balances`, `test_settle_without_approval_rejected`, `test_settle_wrong_approval_rejected`, `test_operator_cannot_self_approve`, `test_four_eyes_requires_distinct_party` all `ok` |
| Solver unit tests | `cd solver && npx vitest run` | **151/151 passed** (14 files) — incl. `auth.test.ts` (acquire+JWKS verify, accept/reject axes), `ledger.test.ts` (four-eyes settle) |
| Web build | `cd web && npm run build` | **green** (tsc --noEmit + vite; 119 modules) |
| Keycloak realm shape | `node deploy/keycloak/realm.test.mjs` | **8/8 passed**, exit 0 |
| DevNet deploy shape | `node deploy/devnet/devnet-deploy.test.mjs` | **9/9 passed**, exit 0 |
| Web-bundle secret scan | `grep client_secret\|OIDC_CLIENT_SECRET\|umbra-solver web/dist/assets/*.js` | **0 matches** — the confidential secret never reaches the browser |

## Goal Achievement — Observable Truths (the 5 ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
| - | ------------------------- | ------ | -------- |
| 1 | A Canton node connects to the real Global Synchronizer on DevNet, SV-sponsored (CHAIN-01) | ✓ BUILT · ⚠ EXTERNAL GATE (live) | `deploy/devnet/validator-compose/docker-compose.yaml` (+ `.env.example` exposing every SV/auth/traffic var as a placeholder), `deploy/SV-SPONSOR-CHECKLIST.md`, `deploy/RUNBOOK.md`. `docker compose config -q` valid. The live SV-sponsored connection is a genuinely external days–weeks business gate, honestly labeled — **not a code gap**. |
| 2 | Frozen DAR uploaded+vetted on DevNet, parties allocated, §4 clears $100 on real Canton (CHAIN-02) | ✓ BUILT + offline-proven · ⚠ live UAT | `deploy/devnet/devnet-deploy.mjs` uploads+vets DAR (POST /v2/packages octet-stream → GET vet-confirm) + allocates namespaced parties + grantRights; proven by the 9-check mocked-v2 test. §4=$100.00/A10·B8·C2 proven offline by `daml test`. On-real-Canton run needs the CHAIN-01 node → UAT. |
| 3 | Unsafe HMAC replaced by real OIDC (Keycloak/TLS): solver client-creds, desks auth-code, RBAC+MFA+scoped keys (IDEN-01/02) | ✓ BUILT + offline-tested · ⚠ live token exchange/MFA = UAT | `solver/src/auth.ts` (acquireToken client-credentials + jose `jwtVerify` pinned RS256, audience + **iss** pinned), `web/src/auth/oidc.ts` (PKCE public client, secret-less), `deploy/keycloak/umbra-realm.json` (Trader/Compliance/Admin roles, conditional OTP on settlement roles, confidential solver + public web clients), `deploy/keycloak/Caddyfile` (TLS), `deploy/canton/participant-oidc-auth.conf` (jwt-jwks, audience XOR scope). Dual-mode: dev HMAC preserved. Secrets server-side (0 bundle matches). solver 151/151, realm 8/8. |
| 4 | Compliance must approve the clearing price before Round.Clear commits — four-eyes (IDEN-03) | ✓ VERIFIED on-ledger (the REAL control) · ⚠ live human = UAT | `daml/Umbra/Approval.daml` `ClearingApproval` (signatory operator, compliance) + `ApproveClearing` (controller compliance) + `assertClearingApproved`; `daml/Umbra/Auction.daml:394-395` `fetch approvalCid` + assert after §8 recompute, before Batch DvP. On-ledger **operator≠compliance** invariant enforced in BOTH `ApproveClearing` and `assertClearingApproved` (HIGH-01 fix). Solver refuses operator-held approval unless explicit dev opt-in (HIGH-02 fix). `daml test`: §4-with-four-eyes + 4 negatives all `ok`. UI wired (Theatre control → Settlement CTA gate). Live MFA'd human approver = UAT. |
| 5 | Node runs unattended: isolated per-network Postgres, monitoring, backups, Canton-Coin auto-top-up (CHAIN-03) | ✓ BUILT + offline-validated · ⚠ live unattended run = UAT | `deploy/devnet/postgres/docker-compose.yaml` (:55434, distinct volume post-MED-02), `deploy/devnet/backup/pg-dump.sh` (bash -n clean), `deploy/devnet/monitoring/prometheus.yml` (scrape + /readyz+/livez), `deploy/devnet/traffic-topup.env.example`. Unattended run on a live node = UAT. |

**Score:** 5/5 code-and-config deliverables built and offline-verified. Each criterion additionally carries a live/external UAT tail (surfaced in `human_verification`).

## Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `daml/Umbra/Approval.daml` | Four-eyes credential + gate helper | ✓ VERIFIED | 112 lines; two-party ClearingApproval + distinctness asserts + assertClearingApproved. Compiles + daml test green. |
| `daml/Umbra/Auction.daml` | Round.Clear additive approvalCid + fetch/assert | ✓ VERIFIED | approvalCid field (line 339); fetch+assert at 394-395 after §8 recompute, before Batch. §8/Batch byte-unchanged. |
| `daml/Umbra/Tests.daml` | §4-with-four-eyes + negatives | ✓ VERIFIED | 4 four-eyes tests + `test_four_eyes_requires_distinct_party` (HIGH-01), all `ok`. |
| `solver/src/auth.ts` | acquireToken + verifyToken (RS256/JWKS) | ✓ VERIFIED | 103 lines; RS256+aud+iss pinned; OIDC_CLIENT_SECRET module-private. auth.test.ts 7/7. |
| `solver/src/ledger.ts` | Dual-mode creds + gatherApprovalCid + distinct-compliance HARD-FAIL | ✓ VERIFIED | resolveCompliance returns distinct flag; gatherApprovalCid hard-fails on operator-held unless UMBRA_ALLOW_OPERATOR_COMPLIANCE=1 (HIGH-02). ledger.test.ts 9/9. |
| `web/src/auth/oidc.ts` | PKCE public client, secret-less | ✓ VERIFIED | 86 lines; no client_secret; dev-token fallback. 0 secret matches in built bundle. |
| `web/src/components/ComplianceApproval.tsx` | Four-eyes UI control | ✓ VERIFIED (wired) | 162 lines; mounted in TheatreView; verdict lifted via operatorState → gates SettlementView settle CTA (FourEyesGate). |
| `deploy/keycloak/*` | Realm + compose + TLS + Canton auth conf | ✓ VERIFIED | realm.test.mjs 8/8; compose config valid; jwt-jwks + audience present, scope absent. |
| `deploy/devnet/*` | Splice compose + deploy + ops layer | ✓ VERIFIED | devnet-deploy.test.mjs 9/9; both composes config-valid; pg-dump.sh + prometheus.yml + traffic top-up present. |
| `deploy/RUNBOOK.md` + `deploy/SV-SPONSOR-CHECKLIST.md` | Honest external-gate ops docs | ✓ VERIFIED | Present (7.6 KB / 4.5 KB); every step tagged [BUILT]/[EXTERNAL GATE]/[LIVE UAT]. |

## Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `Round.Clear` (Auction.daml) | `ClearingApproval` (Approval.daml) | `fetch approvalCid` + `assertClearingApproved` | ✓ WIRED | Enforced on-ledger, before Batch build; daml test negatives prove rejection of missing/wrong/collapsed approval. |
| `solver settle()` | on-ledger four-eyes | `gatherApprovalCid` → threads `approvalCid` into Clear | ✓ WIRED | Refuses operator-held (self-signed) approval unless explicit dev opt-in (HIGH-02). |
| `TheatreView` ComplianceApproval | `SettlementView` settle CTA | `ClearingApprovalDecision` lifted via `operatorState`/`App` | ✓ WIRED | CTA blocked until `approval === 'approved'`; REJECT withholds + surfaces reject verbatim. |
| `solver/auth.ts` acquireToken | Keycloak `/token` | client-credentials form-POST (RS256) | ✓ WIRED (offline) | jose JWKS verify; live exchange = UAT. |
| `web/auth/oidc.ts` UserManager | Keycloak | auth-code + PKCE (S256), no secret | ✓ WIRED (seam) | Secret-less public client; live redirect flow = UAT (module tested, app-mount is UI/UAT). |
| `devnet-deploy.mjs` | JSON Ledger API v2 | OIDC client-creds → upload/vet/allocate/grantRights | ✓ WIRED (offline) | 9-check mocked-v2 shapes; live participant = UAT. |

## Requirements Coverage

| Requirement | Description | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| IDEN-03 | Four-eyes: Compliance approves clearing price before Round.Clear commits | ✓ SATISFIED (on-ledger, offline-proven) | Real Daml gate + distinct-party invariant + daml test §4+4 negatives; live human MFA'd approver = UAT |
| IDEN-01 | Unsafe HMAC replaced by OIDC (Keycloak/TLS); solver client-creds, desks auth-code | ✓ SATISFIED (built + offline-tested) | auth.ts + oidc.ts + realm + Caddy TLS + Canton jwt-jwks conf; dual-mode; live token exchange = UAT |
| IDEN-02 | Per-desk RBAC (Trader/Compliance/Admin), MFA on settlement actions, scoped/revocable keys | ✓ SATISFIED (config + offline-proven) | Realm roles + conditional OTP on Compliance+Admin + confidential/public clients; realm.test 8/8; live MFA = UAT |
| CHAIN-01 | Node connects to real Global Synchronizer on DevNet, SV-sponsored | ⚠ EXTERNAL GATE (built, live pending) | Splice compose + checklist + runbook; SV sponsorship is external, not code |
| CHAIN-02 | DAR uploaded+vetted on DevNet, parties allocated, §4 on real Canton | ⚠ live UAT (built + offline-proven) | devnet-deploy.mjs + 9-check mocked-v2; §4=$100 offline; live run needs CHAIN-01 |
| CHAIN-03 | Ops hardening: isolated Postgres, backups, monitoring, coin auto-top-up | ⚠ live UAT (built + offline-validated) | Postgres compose + pg-dump + prometheus + traffic top-up; unattended live run = UAT |

## Code-Review Follow-Through (12-REVIEW.md → fixes verified)

| Finding | Fix commit | Verifier check |
| ------- | ---------- | -------------- |
| HIGH-01 on-ledger operator≠compliance not enforced | `86c7090` | ✓ `assertMsg (compliance /= operator)` in BOTH `ApproveClearing` and `assertClearingApproved`; new `test_four_eyes_requires_distinct_party` `ok` (mint-abort + settle-gate reject) |
| HIGH-02 solver always self-approves | `853446a` | ✓ `resolveCompliance` flags `distinct`; `gatherApprovalCid` HARD-FAILS on operator-held unless `UMBRA_ALLOW_OPERATOR_COMPLIANCE=1`; configured-collapse throws |
| MED-01 UI/ledger divergence on post-close solve fail | `b37ed55` | ✓ commit present; web build green |
| MED-02 duplicate Postgres same volume | `1385103` | ✓ standalone Postgres given a distinct volume |
| MED-03 verifyToken did not pin iss | `8781590` | ✓ `iss` now pinned in `jwtVerify` |
| LOW-01/02/03 | `878c500` / `1032c56` / `6b19641` | ✓ 2dp price match, no dangling tamper approvals, verifyToken documented |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (phase source) | — | TBD/FIXME/XXX/TODO | ℹ️ none | Debt-marker scan of Approval.daml, Auction.daml, auth.ts, ledger.ts, oidc.ts, ComplianceApproval.tsx = clean |
| `.env.example` templates | various | `REPLACE_*`/`CHANGE_ME_AT_UAT` placeholders | ℹ️ Info (intentional) | Committed templates; real secrets live in gitignored `.env`. Confirmed no real secret/sponsor-URL/onboarding-secret committed; bundle secret scan 0 matches. Not stubs. |
| `solver/src/ledger.ts` | dev fallback | operator-held compliance behind `UMBRA_ALLOW_OPERATOR_COMPLIANCE` | ℹ️ Info (honestly labeled) | Post-HIGH-02 this is opt-in and the on-ledger gate rejects collapsed parties anyway; live human four-eyes is the labeled UAT step. Not a hidden bypass. |

## Human Verification Required

Five live/external items (all in frontmatter `human_verification`), none of which are code gaps:

1. **SV-sponsored live DevNet connection (CHAIN-01)** — external business gate (days–weeks); compose + checklist + runbook built.
2. **Live DAR-vet + §4-on-real-Canton (CHAIN-02)** — needs the CHAIN-01 node; §4=$100 proven offline.
3. **Live OIDC token exchange + live MFA (IDEN-01/02)** — needs booted Keycloak + issuer-wired Canton; acquire/verify + realm shape proven offline.
4. **Live human MFA'd Compliance four-eyes approval (IDEN-03)** — on-ledger gate proven offline; a distinct human approver against a booted stack is UAT.
5. **Unattended live ops (CHAIN-03)** — needs the live node; configs/scripts offline-validated.

## Gaps Summary

No code gaps. All five ROADMAP success criteria have their buildable code/config/ops deliverables present, substantive, wired, and passing offline gates (daml test all-ok; solver 151/151; web build green; realm 8/8; devnet 9/9; bundle secret scan 0). The IDEN-03 four-eyes control is a genuine on-ledger authority gate (distinct-party invariant enforced and tested, both HIGH review findings fixed and re-verified). The remaining unmet work is exclusively the genuinely-live and external-gate portion — SV sponsorship, on-real-Canton execution, live token exchange, live MFA, and unattended live ops — which the phase explicitly and honestly scoped to UAT / external gate per the project's honesty bar. Status is therefore `human_needed`, not `gaps_found`.

---

_Verified: 2026-07-10T14:05:00Z_
_Verifier: Claude (gsd-verifier)_
_Gates run in-process: daml test · solver vitest · web build · realm.test.mjs · devnet-deploy.test.mjs · bundle secret scan_
