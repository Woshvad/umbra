---
phase: 12-real-on-chain-canton-devnet
reviewed: 2026-07-10T00:00:00Z
depth: deep
files_reviewed: 22
files_reviewed_list:
  - daml/Umbra/Approval.daml
  - daml/Umbra/Auction.daml
  - daml/Umbra/Tests.daml
  - solver/src/auth.ts
  - solver/src/auth.test.ts
  - solver/src/ledger.ts
  - solver/src/ledger.test.ts
  - web/src/App.tsx
  - web/src/solver.ts
  - web/src/operatorState.ts
  - web/src/auth/oidc.ts
  - web/src/auth/oidc.test.ts
  - web/src/components/ComplianceApproval.tsx
  - web/src/views/TheatreView.tsx
  - web/src/views/SettlementView.tsx
  - deploy/keycloak/umbra-realm.json
  - deploy/keycloak/docker-compose.yaml
  - deploy/keycloak/Caddyfile
  - deploy/canton/participant-oidc-auth.conf
  - deploy/devnet/devnet-deploy.mjs
  - deploy/devnet/validator-compose/docker-compose.yaml
  - deploy/devnet/postgres/docker-compose.yaml
findings:
  critical: 0
  high: 2
  medium: 3
  low: 3
  total: 8
status: findings
---

# Phase 12: Code Review Report — Real On-Chain / Canton DevNet (IDEN-01/02/03)

**Reviewed:** 2026-07-10
**Depth:** deep (cross-file: Daml gate ↔ solver ledger client ↔ web control)
**Files Reviewed:** 22
**Status:** findings

## Summary

Phase 12 adds three things: (1) an on-ledger four-eyes clearing-approval gate
(`ClearingApproval` / `Round.Clear` fetch+assert), (2) a dual-mode OIDC credential
seam (solver client-credentials RS256 + web PKCE public client), and (3) DevNet
deploy artifacts (Keycloak realm, Canton auth HOCON, validator/Postgres compose).

Verdicts on the focus areas:

- **OIDC secret hygiene — SOUND.** `OIDC_CLIENT_SECRET` is module-private in
  `auth.ts`, placed only in the client-credentials POST body, never returned/logged
  (proven by the secret-sweep test). The web client is genuinely secret-less
  (`buildOidcSettings` has no `client_secret`; a source scan test enforces it).
  `jwtVerify` is pinned to `RS256` with the Canton audience — alg-confusion (`none`/HS256)
  is defeated. No real secret, sponsor URL, or onboarding secret is committed — every
  value in the diff is a `REPLACE_*`/`CHANGE_ME`/`SENTINEL`/`MOCK` placeholder.
- **§4 invariant — PRESERVED.** `test_four_eyes_clears_at_100` + every settle test
  thread `withCanonicalApproval` @100.0 and still assert $100.00 / A=10·B=8·C=2 and the
  exact post-balances. No regression.
- **Config sanity — OK.** Keycloak ports (:8443/:8081/:55433) and DevNet ports
  (:6975/:5003/:55434) are off the LocalNet stack (:3975/:2975/:4975/:55432). Realm JSON,
  compose YAML and the Canton HOCON are well-formed; the audience-XOR-scope pitfall is
  respected.
- **Honesty — GOOD.** The live SV-sponsored connection, live token exchange and live MFA
  are consistently labeled UAT/external-gate, never claimed as working.

The material concerns are about the four-eyes control's **runtime** enforcement (as opposed
to the `daml test` proof), which is where an adversary would push. See HIGH-01/HIGH-02.

## HIGH

### HIGH-01: On-ledger four-eyes gate does not enforce `operator ≠ compliance` — self-approval passes when the two party ids are equal

**File:** `daml/Umbra/Approval.daml:61-64, 91-96` (and `daml/Umbra/Auction.daml:394-395`)

**Issue:** The separation of duties rests entirely on `ApproveClearing` being
`controller compliance` and `ClearingApproval` being `signatory operator, compliance`.
Neither `ApproveClearing` nor `assertClearingApproved` asserts that `compliance` is a
**distinct** party from `operator`. If a deployment allocates (or falls back to) a
`compliance` party equal to the `operator` party, then:

- the operator alone can create the `ClearingApprovalRequest` (signatory operator),
- the operator alone can exercise `ApproveClearing` (controller compliance == operator),
- `assertClearingApproved` only checks `appr.operator == operator && appr.roundId == roundId`
  and the price — it happily accepts `appr.compliance == operator`.

So the gate silently degrades to operator self-approval with **no on-ledger error**. The
`test_operator_cannot_self_approve` proof only holds because the test allocates a distinct
party; the Daml layer itself cannot detect the collapsed-party case. This is the direct
answer to "can the gate be bypassed?": yes, by configuring `compliance = operator`, and
nothing on-ledger prevents it.

**Fix:** Make distinctness a ledger invariant so a misconfiguration fails loudly:
```daml
-- in ApproveClearing (Approval.daml), and/or assertClearingApproved:
assertMsg "four-eyes: compliance signer must differ from operator" (compliance /= operator)
```
Add a negative test that a `compliance == operator` approval is rejected on-ledger.

### HIGH-02: Solver `settle()` always self-approves — the runtime Compliance "REJECT" is cosmetic and bypassable

**File:** `solver/src/ledger.ts:432-463, 511`; `web/src/solver.ts:240-256`; `deploy/devnet/devnet-deploy.mjs:45`

**Issue:** `settle()` unconditionally calls `gatherApprovalCid`, which *creates* the
`ClearingApprovalRequest` and *approves* it in the same server flow before exercising
`Round.Clear`. There is no service-layer check of any compliance verdict. The web
"APPROVE/REJECT" pair (`approveClearing`/`rejectClearing`) only does a reachability probe
(`getRound`) and records a **local** `ClearingApprovalDecision`; it never creates or blocks
an on-ledger approval. Consequences:

- A direct `POST /round/:id/settle` (bypassing the UI CTA gate in `SettlementView`) settles
  regardless of any "REJECT" — the reject is UI-only.
- In the shipped default (no `scripts/.compliance-token`), `resolveCompliance()` falls back
  to `{ token: operatorToken, party: operatorParty }`, so `gatherApprovalCid` runs
  operator-held — combined with HIGH-01, the runtime provides **no** real second-person
  control. Note `devnet-deploy.mjs` `PARTY_HINTS` allocates no compliance party at all and
  grants the admin user actAs only operator/bankA/bankB/bankC, so on DevNet the approval is
  necessarily operator-held.

This is honestly labeled ("DEV COMPLIANCE PARTY — LIVE HUMAN FOUR-EYES AT UAT"), so it is a
disclosed limitation rather than a hidden defect — but adversarially, the four-eyes control
as *run* is not a real control. Keep it clearly scoped, and do not let downstream copy imply
the running solver enforces four-eyes.

**Fix:** For a defensible runtime control, gate `settle()` on a real, externally-supplied
compliance decision (e.g. require a pre-existing compliance-signed `ClearingApproval` the
solver did NOT mint, or a distinct compliance token whose absence hard-fails rather than
falls back to the operator). At minimum, make the fallback-to-operator path
opt-in/explicit (env flag) so it cannot silently engage in a "real" deployment, and have
`rejectClearing` short-circuit the settle path server-side.

## MEDIUM

### MED-01: `TheatreView.closeAndSolve` resets phase to `open` after `closeRound` may have already committed — UI/ledger divergence

**File:** `web/src/views/TheatreView.tsx:62-77`

**Issue:** `closeAndSolve` sets phase `solving`, `await closeRound(roundId)` (which flips the
round to `Closed` on-ledger), then `await solvePreview(roundId)`. If `solvePreview` throws a
non-OFFLINE error, the catch resets `setPhase('open')`. The round is now `Closed`
server-side but the operator UI shows an open/running window; re-running the window is
inconsistent with ledger state, and `CloseRound` is idempotent-only from `Open`. No data
loss, but the operator can be stranded in a state the ledger won't honor.

**Fix:** On a post-close failure, route to a distinct "closed — retry solve" state (phase
`solving`/`cleared`-error) rather than `open`, or re-query the round status and derive the
phase from the ledger truth instead of assuming `open`.

### MED-02: Duplicate Postgres services bind the same named volume — concurrent bring-up risks store corruption

**File:** `deploy/devnet/postgres/docker-compose.yaml:29-40`; `deploy/devnet/validator-compose/docker-compose.yaml:110-127`

**Issue:** Both the standalone `devnet-postgres` and the inline `devnet-postgres` in the
validator compose declare the external volume name `umbra-devnet-participant-data`. Running
both compose files at once starts two Postgres 15 containers pointed at the *same* data
directory — a classic multi-attach corruption footgun. The comment says "point both at the
SAME volume name if you consolidate," which invites exactly this.

**Fix:** Document these as strictly mutually exclusive (and ideally give the standalone
maintenance instance a distinct volume name, or add a guard/README warning that only one
Postgres may mount the volume at a time).

### MED-03: `verifyToken` does not pin the token issuer (`iss`)

**File:** `solver/src/auth.ts:97-101`

**Issue:** `jwtVerify` is correctly pinned to `RS256` + audience, but does not assert the
`iss` claim against `OIDC_ISSUER`. The JWKS URL scopes the accepted keys, so this is
defense-in-depth rather than an open hole, and the participant is the authoritative verifier
— but an environment that ever pointed the JWKS at a shared/multi-tenant key set would accept
same-audience tokens from another issuer.

**Fix:** Add `issuer: oidcIssuer()` to the `jwtVerify` options and cover it with a
wrong-issuer rejection test alongside the existing wrong-audience/wrong-key/expired axes.

## LOW

### LOW-01: Clearing-price match uses exact float equality

**File:** `solver/src/ledger.ts:445, 459`

**Issue:** `gatherApprovalCid` locates the request/approval via
`Number(c.createArgument.clearingPrice) === clearingPrice`. This is exact float equality on a
value that has round-tripped through the JSON wire as a string. It is safe for the §4 fixture
(100.0) and typical 2-dp prices, but is brittle for prices whose decimal expansion is not
float-exact. The on-ledger gate compares at 2-dp (`roundBankers 2`); the client match should
too.

**Fix:** Compare on the rounded value (e.g. `Number(x).toFixed(2) === clearingPrice.toFixed(2)`)
to mirror `assertClearingApproved`'s 2-dp comparison.

### LOW-02: `tamperClear` leaves live `ClearingApprovalRequest` + `ClearingApproval` on-ledger

**File:** `solver/src/ledger.ts:637`

**Issue:** `tamperClear` calls `gatherApprovalCid` (which commits the request + approval in
their own transactions) before attempting the deliberately-bad `Clear`. The bad `Clear` rolls
back, but the approval contracts persist. Repeated tamper demos accumulate dangling
approvals for the round. Harmless to correctness (each is round+price scoped and valid), but
untidy and could confuse an operator inspecting the ACS.

**Fix:** For the tamper path, either archive the just-created approval on rejection, or skip
`gatherApprovalCid` and rely on the §8 recompute firing before the approval fetch (the code
comment already notes the recompute-and-assert runs first, so a dummy/absent approval would
still reject at §8).

### LOW-03: `verifyToken` is exported but never used in the request path

**File:** `solver/src/auth.ts:97-101`; `solver/src/ledger.ts` (no import of `verifyToken`)

**Issue:** The solver acquires and forwards a bearer; the participant verifies it.
`verifyToken` is intentional offline-testable defense-in-depth (and is exercised by
`auth.test.ts`), so this is a note, not a defect — but it is easy to mistake for an active
verification step. Consider a one-line comment at the (absent) call site, or wiring it into
an admin/introspection endpoint so the defense-in-depth is actually engaged.

---

_Reviewed: 2026-07-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
