# Phase 12: Real On-Chain (Canton DevNet) - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommendations auto-accepted per user delegation "intelligently pick good options")

<domain>
## Phase Boundary

Take Umbra off LocalNet toward the real Canton Network (DevNet) on real auth/ops — the frozen DAR ports unchanged; the work is the **connection / auth / ops layer plus the external sponsor gate** (ROADMAP verbatim). Current stack: Daml 3.4.11 + Canton 3.4 LocalNet (cn-quickstart) + JSON Ledger API v2 (:3975/:2975/:4975); solver :4100; web :5173; dev auth = `unsafe-jwt-hmac-256` (HS256 secret `unsafe`, aud `https://canton.network.global`).

**⚠ HONEST SCOPE — the one genuinely-external, non-code item.** CHAIN-01 (a Canton node connecting to the **real** Global Synchronizer on DevNet, **sponsored by a Super Validator**) is explicitly *"an external, days–weeks lead time, not code"* (ROADMAP). It **cannot be obtained or completed autonomously on this box** — there is no SV sponsorship and no live DevNet participant here. Consistent with the project's honesty bar and the "Built · live UAT pending" pattern of Phases 8–10, this phase **builds every code / config / ops / script artifact** and produces a **complete runbook + SV-sponsor outreach checklist**, then **defers the live SV-sponsored connection, live DAR-vetting-on-DevNet, live OIDC token exchange, and unattended-ops-on-a-live-node to an EXTERNAL GATE + live UAT** — honestly labeled, never faked.

**IN SCOPE (built + tested offline this phase):**
- **IDEN-03** on-ledger **four-eyes**: a Compliance role must approve the solver's clearing price before `Round.Clear` commits — a REAL, additive Daml gate, `daml test`-verified, §4 still clears $100.00.
- **IDEN-01/02** real **OIDC (Keycloak) over TLS**: replace the unsafe HMAC path with an RS256/JWKS issuer — solver = client-credentials, desks = auth-code/PKCE; per-desk RBAC roles (Trader / Compliance / Admin), scoped + revocable API keys, MFA config. Shipped as realm config + compose + TLS proxy + solver/web auth code + unit tests; live token exchange is UAT.
- **CHAIN-01/02/03** the **DevNet connection + ops layer as artifacts**: self-hosted Splice (Docker Compose) DevNet-participant config, DAR upload+vet + party-allocation scripts (parameterized for a DevNet endpoint), isolated per-network PostgreSQL, monitoring, backups, Canton-Coin traffic auto-top-up — plus the ops **RUNBOOK** and **SV-sponsor outreach checklist**. The frozen DAR is already portable (LF-standard, built on 3.4.11).

**OUT OF SCOPE / DEFERRED (external gate + live UAT):**
- The actual **SV sponsorship** + live connection to the real Global Synchronizer (CHAIN-01) — external business gate, days–weeks.
- **§4 running end-to-end on real Canton DevNet** (CHAIN-02) — needs the live node from CHAIN-01.
- **Unattended ops on a live node** (CHAIN-03) — needs the live node.
- Live OIDC token exchange + Canton-accepts-OIDC end-to-end + live MFA (IDEN-01/02) — needs booted Keycloak + a Canton configured for the OIDC issuer.
- KMS/HSM-backed keys, SOC 2 — Track B.

**KNOWN LIMITATION (recorded):** a single self-hosted DevNet participant is still "demo-real" for 3-desk privacy (true privacy needs 3 institutions each running a validator). Honest, per PROJECT policy.

</domain>

<decisions>
## Implementation Decisions

### Four-Eyes Compliance Approval (IDEN-03) — REAL, additive, offline-tested
- Add an on-ledger **Compliance-approval gate** on the settlement path: a `ClearingApproval` contract (signatory operator + **compliance**; carries the round id + the approved clearing price) that `Round.Clear` REQUIRES before it commits — i.e. `Round.Clear` fetches/asserts a compliance-signed approval matching the clearing price it is about to settle, so a settle without Compliance sign-off aborts on-ledger. This is ADDITIVE: the §8 recompute-and-assert backstop, the Phase-11 Batch/Instruction settlement, and the clearing MATH are unchanged; a new authority precondition is inserted.
- **Flow (composes with verify-don't-trust):** solver computes + deterministically re-verifies the clearing → requests Compliance approval (a Compliance party exercises `ApproveClearing` at the recomputed price) → `Round.Clear` re-verifies §8 AND requires the matching `ClearingApproval` → settles atomically. A wrong/absent approval price ⇒ on-ledger abort.
- **§4 discipline:** the canonical test threads the approval step and STILL clears **$100.00 / A=10·B=8·C=2**. For the fast local loop, dev may run Compliance = a dedicated dev party (or operator-held compliance) so `daml test`/local runs without a human; the four-eyes SEPARATION (distinct Compliance authority) is the real, tested control. Add a NEGATIVE test: settle without/with-wrong approval is rejected on-ledger.
- Solver wiring: an approval request/collect step + endpoint; a minimal Compliance approve/reject control (Operator/Compliance plane, bound to the comp) surfaces the pending clearing price. Live human four-eyes is UAT; the gate + tests are built.

### OIDC / Keycloak / TLS (IDEN-01/02) — real config + code, dual-mode with the dev path
- **Issuer:** a **Keycloak** realm (`umbra`) exported as realm JSON — clients: `umbra-solver` (confidential, **client-credentials**), `umbra-web` (public, **auth-code + PKCE**); realm roles **Trader / Compliance / Admin**; per-desk users (bankA/B/C + guest) mapped to Trader, a Compliance user, an Admin user; **scoped + revocable** client/API keys; **MFA** (OTP) configured on settlement-affecting roles. Shipped as `deploy/keycloak/umbra-realm.json` + a `docker-compose` for Keycloak + a **TLS** reverse proxy (Caddy or nginx, dev self-signed cert; real cert = UAT).
- **Canton side:** a participant auth config that trusts the Keycloak issuer (JWKS URL + audience) instead of `unsafe-jwt-hmac-256` — provided as a config artifact for the DevNet participant. **Dual-mode, honestly labeled:** the LocalNet `unsafe` HMAC path STAYS for the fast dev loop; OIDC is the DevNet/prod path.
- **Solver:** acquire a token via **client-credentials** from Keycloak (RS256), verify via **JWKS**, present it to the JSON Ledger API v2; the Anthropic key + client secret stay server-side (`.env`, gitignored) — never in the browser. Unit-test the token acquisition + JWKS verify offline (mocked issuer); live exchange = UAT.
- **Web:** an **auth-code/PKCE** login for desks (redirect to Keycloak → code → token), replacing the pre-minted dev token on the OIDC path; the guest `/join` upgrades from the Phase-11 dev token to auth-code (fulfilling the Phase-11 "production guest auth is OIDC (Phase 12)" honesty promise). Dev path unchanged.

### DevNet Connection + DAR Port (CHAIN-01/02) — artifacts + runbook, live = external gate
- **Self-hosted Splice DevNet participant:** a Docker-Compose config for a Canton participant/validator joining DevNet via the Global Synchronizer (Splice), parameterized for the DevNet endpoints + the SV-sponsor onboarding inputs. The genuine connection requires the **SV sponsorship** → **external gate**; the compose + config are built and validated as far as offline allows.
- **DAR port + vet + party alloc:** scripts (mirroring `scripts/localnet/deploy.mjs`/`xnode-up.mjs`) that upload + **vet** the frozen Umbra DAR on a DevNet participant and allocate desk parties, parameterized for DevNet. The DAR is already LF-standard/portable (unchanged by this phase except the additive four-eyes template, which stays byte-portable). Live upload+vet + §4-on-real-Canton = **CHAIN-02 UAT**.
- **SV-sponsor outreach checklist + ops RUNBOOK:** a concrete, honest doc of the external steps (request SV sponsorship, obtain onboarding secret/party hint, connect, vet DAR, allocate parties, run §4) — so the human can execute the external gate.

### Ops Hardening (CHAIN-03) — config + scripts + runbook, unattended-run = UAT
- **Isolated per-network PostgreSQL** (compose service + dedicated volume per network), **monitoring** (health endpoints + a basic metrics/log config, e.g. a Prometheus scrape + structured logs), **backups** (a `pg_dump` schedule script), and **Canton-Coin traffic auto-top-up** (a script hitting the validator/Splice top-up API on a schedule). Shipped as compose + scripts + runbook; unattended operation on a live node = UAT.

### Claude's Discretion
- Exact Keycloak realm layout + mappers, the TLS proxy choice (Caddy vs nginx) + dev cert method, the `ClearingApproval` contract shape (standalone approval contract vs a two-step propose/approve choice), the compose/monitoring/backup/top-up script specifics, and the precise split of OIDC behavior that is unit-testable offline vs UAT — all planner/researcher's discretion, PROVIDED: the frozen DAR stays byte-portable (four-eyes additive only), **§4 still clears $100.00** (with the four-eyes step), the **unsafe-HMAC dev path still works** for the fast loop, secrets never reach the browser, and every external / live / deferred boundary is **honestly labeled**.
- If a real (non-stub) artifact can't be validated offline on this box within the phase, ship the strongest honestly-labeled config + runbook that a human can execute at the external gate, and document the limitation — never fake a live connection.

</decisions>

<code_context>
## Existing Code Insights

### Reusable / Impacted Assets
- **scripts/localnet/** — `up.mjs`/`down.mjs`/`deploy.mjs`/`seed.mjs`/`xnode-up.mjs`/`mint-jwt.mjs`/`guest-onboard.mjs`/`verify-*.mjs`/`probe-xnode.mjs`. `mint-jwt.mjs` is the unsafe HS256 minter (`LOCALNET_JWT_SECRET=unsafe`, aud `https://canton.network.global`); `deploy.mjs` uploads the DAR + assigns user rights. The DevNet scripts + the OIDC token path mirror these.
- **solver/src/ledger.ts** — the Operator wire layer (reads the operator token from `scripts/.operator-token`, HS256). The OIDC client-credentials acquisition + JWKS verify slots in here (dual-mode).
- **solver/src/api.ts / index.ts** — Express surface; the four-eyes approval request/collect endpoint + the OIDC-guarded desk paths.
- **daml/Umbra/Auction.daml** (`Round.Clear`) + **Roles.daml** (`Venue`, Compliance already appears as a signatory of `DeskEligibility` in Phase 11) — the four-eyes `ClearingApproval` gate inserts on the `Round.Clear` settle path; Compliance is an established party.
- **daml/Umbra/Compliance.daml** (Phase 11) — `DeskEligibility` is `signatory operator, compliance`; the four-eyes approval reuses the SAME Compliance party + authority pattern.
- **web/src/ledgerContexts.ts / desks.ts / tokens.json** — per-party token plumbing; the auth-code/PKCE login replaces the pre-minted token on the OIDC path (dev path kept).
- **.env.example / .gitignore** — `JSON_API_URL`; secrets (`ANTHROPIC_API_KEY`, tokens, the new Keycloak client secret) stay gitignored/server-side.

### Established Patterns (non-negotiable)
- **Verify-don't-trust + on-ledger re-verification** — four-eyes is an ADDITIONAL authority gate on top of the §8 recompute; it does not replace it.
- **§4 as continuous canary** — $100.00 / A=10·B=8·C=2 after the four-eyes insertion.
- **Secrets server-side only** — the Keycloak client secret + Anthropic key never reach the browser (CLAUDE.md §15).
- **Additive + honest labeling + real-or-labeled-fallback** (the Phase-10/11 bar) — build real config; label every external/live gate; never fake a connection.
- **NO Claude git attribution; author/committer = woshvad** on every commit.
- **Dual-mode auth** — keep the unsafe-HMAC dev loop working; OIDC is the DevNet/prod path.

### Integration Points
- Four-eyes: `ClearingApproval` (Daml) → `Round.Clear` precondition → solver approval request/collect → Compliance approve control → `daml test` (§4 + negative) + solver test.
- OIDC: Keycloak realm + compose + TLS proxy → Canton participant auth config (JWKS/audience) → solver client-credentials + JWKS verify → web auth-code/PKCE → unit tests (offline) + live UAT.
- DevNet + ops: Splice compose + DAR-port/vet/party scripts + Postgres/monitoring/backup/top-up + RUNBOOK + SV-sponsor checklist (external gate).

</code_context>

<specifics>
## Specific Ideas

- The SV-sponsor connection is the ONLY genuinely-external, non-code deliverable — ship the outreach checklist + runbook, never a faked connection; defer the live connection + §4-on-real-Canton to CHAIN-01/02 UAT.
- Four-eyes is a REAL Daml gate (offline-tested), fulfilling IDEN-03 concretely; it also completes the Phase-11 promise that guest/desk production auth is OIDC.
- Keep the unsafe-HMAC LocalNet path intact for the fast dev loop; OIDC is dual-mode.
- §4 must still clear $100.00 with the four-eyes approval step in the chain.

</specifics>

<deferred>
## Deferred Ideas

- SV sponsorship + live real-DevNet connection (CHAIN-01), §4 on real Canton (CHAIN-02), unattended ops on the live node (CHAIN-03) → **external gate + live UAT**.
- Live OIDC token exchange + Canton-accepts-OIDC + live MFA (IDEN-01/02) → live UAT (needs booted Keycloak + Canton).
- KMS/HSM-backed key custody, SOC 2 → **Track B**.
- Genuine 3-institution cross-node privacy (3 real validators) → recorded honest limitation.
</deferred>
