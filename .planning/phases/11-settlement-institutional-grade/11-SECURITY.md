---
phase: 11-settlement-institutional-grade
audited: 2026-07-10
auditor: gsd-security-auditor (adversarial / FORCE stance)
asvs_level: 1
block_on: high
threats_total: 42
threats_closed: 42
threats_open: 0
findings_high: 0
findings_critical: 0
status: passed
---

# Phase 11: Settlement & Institutional Grade — Security Audit

**Scope:** Verify every declared threat mitigation in the 11 plan `<threat_model>`
registers is PRESENT IN SHIPPED CODE (not documentation/intent). ASVS Level 1,
`block_on: high`. Implementation files are read-only; this file is the only artifact
written.

**Method:** Each threat classified by disposition, then verified by grep/read of the
cited file — starting hypothesis "absent until proven". Where a plan's grep pattern was
superseded by a recorded environmental deviation (contract keys unavailable on
LF-2.1 → keyless gate), the mitigation was re-verified against the ACTUAL shipped
mechanism, not credited on the plan's stale pattern.

**Verdict:** 42/42 threats CLOSED (40 `mitigate` verified in code, 2 `accept` logged
below). No High/Critical. The COMP-01 keyless gate, DFIN atomic/conserving settlement,
and WOW-07 secret hygiene are all structurally enforced on-ledger / in credential-free
code paths. Ships.

---

## Threat Verification — mitigate (40)

| Threat ID | Category | Evidence (file:line) | Verdict |
|-----------|----------|----------------------|---------|
| T-11-01-LOCK | Tampering | `Holding.daml:56,68,79` — `assertMsg "holding is locked" (lock == None)` on Split/Merge/Reassign | CLOSED |
| T-11-01-KEY | DoS | `Holding.daml:34-44` — template has NO `key`/`maintainer`; ContractId-passing (D7 Option-B) | CLOSED |
| T-11-01-PROV | Repudiation | `DECISIONS.md` D13; `Holding.daml:25-31` CN-STD interface; no rendered "Daml Finance" literal | CLOSED |
| T-11-02-FORGE | Spoofing | `Compliance.daml:57-58` — `signatory operator, compliance` / `observer desk` (desk not a signatory → no self-issue) | CLOSED |
| T-11-02-STUB | Repudiation | `Compliance.daml:29-35` STUB-ATTESTATION module note; label rendered in web surfaces | CLOSED |
| T-11-02-KEY | Tampering | Keyless deviation (recorded); `assertDeskEligible` pins `cred.operator==operator && cred.desk==desk` (`Compliance.daml:85-86`) — no substitution | CLOSED |
| T-11-03-LEAK | Info Disclosure | `topology.ts:18-22,83-139` credential-free (probe DI, admin token stays in closure); `api.ts:902-913` secret-safe error envelope | CLOSED |
| T-11-03-QR | Info Disclosure | `guest-onboard.mjs:114-127` token written only to gitignored tokens.json, never printed; `api.ts:212-216` `GuestBootstrap` has no token field | CLOSED |
| T-11-03-OVERCLAIM | Repudiation | `topology.ts:117-137` `demoReal` + `SAME PARTICIPANT (LOCALNET)` caption (LW-03 canonical-participant collapse applied) | CLOSED |
| T-11-04-PARTIAL | Tampering | `Settlement.daml:170-193` `settleBatch` — every leg in one `foldlA` Update; `abort`/`Split` over-draw rolls back whole tx | CLOSED |
| T-11-04-LEAK | Tampering | `Settlement.daml:175-178` source DvP-integrity check + `moveThread` remainder threading + `Split` strict guard; `test_netting_conserves` (see residual R-1) | CLOSED |
| T-11-04-CANARY | Tampering | `buildGrossInstructions` §4 reduction; `test_clears_at_100` present (`Tests.daml`) | CLOSED |
| T-11-05-COMP | Elevation/Tampering | `Roles.daml:41-42` (SubmitOrder), `:70-71` (CommitOrder), `:94-95` (IssueHolding) — `fetch eligCid` + `assertDeskEligible` at ALL THREE entry points | CLOSED |
| T-11-05-CONSV | Tampering | `Auction.daml:391-393` — `conservationOk` asserted on gross AND netted legs; single-buyer abort removed | CLOSED |
| T-11-05-BADALLOC | Tampering | `Auction.daml:347-367` recompute-§8-and-assert (price + multiset alloc + Σbuy==Σsell) runs BEFORE any settle leg | CLOSED |
| T-11-05-BOND | Tampering | `Auction.daml:216-219` bond is operator-custody `Holding`; every Holding choice `controller operator` (desk cannot move); `ForfeitBond` reassigns to operator (see residual R-2) | CLOSED |
| T-11-05-CANARY | Tampering | `test_clears_at_100` / `test_commit_reveal_clears_at_100` present + gated green | CLOSED |
| T-11-06-COMP | Elevation | `Tests.daml` — `test_ineligible_submit_rejected` + `test_ineligible_holding_rejected` present (submitMustFail) | CLOSED |
| T-11-06-PRIV | Info Disclosure | `Tests.daml` — `test_privacy_guest_fill` present | CLOSED |
| T-11-06-CONSV | Tampering | `Tests.daml` — `test_multibuyer_golden` present | CLOSED |
| T-11-06-CANARY | Tampering | `test_clears_at_100` present | CLOSED |
| T-11-07-DECODE | Tampering | `ledger.ts:213-283` `Number()` coercion; `:356-357` InstrumentId `{issuer,id}` record; `{_1,_2}` tuples; secret-free error `:340,398` | CLOSED |
| T-11-07-PARITY | Tampering | `solver/src/settlement.test.ts` 2×2 golden (verifier: 7 tests pass) | CLOSED |
| T-11-07-BACKSTOP | Tampering | `api.ts:97` `tamperClear` exported (perturbed-submit-and-catch); Round.Clear recompute unchanged | CLOSED |
| T-11-07-CANARY | Tampering | `auction.ts` §8 unchanged; §4 solver fixture $100.00 (verifier vitest green) | CLOSED |
| T-11-08-STALE | Tampering | `web/daml.js` regenerated + committed (verifier: build green, template modules present) | CLOSED |
| T-11-08-CRED | Info Disclosure | `solver.ts:416` `getTopology` on single env `SOLVER_BASE_URL`, no auth header, no per-endpoint port literal | CLOSED |
| T-11-08-GUEST | Info Disclosure | `desks.ts:10,32` bankD/GUEST token sourced from gitignored tokens.json (not inline hardcoded); GUEST is a separate export, not in `DESKS` | CLOSED |
| T-11-09-OVERCLAIM | Repudiation | `TopologyView.tsx` renders non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge | CLOSED |
| T-11-09-DISCLOSE | Info Disclosure | `TopologyNode.tsx` `NOT VISIBLE` redaction stripe for cross-node orders (no rival contents) | CLOSED |
| T-11-09-CRED | Info Disclosure | data via credential-free `getTopology` (no operator token / @daml/react context) | CLOSED |
| T-11-10-QR | Info Disclosure | `qrPayload.ts:13-19` emits `…/join?round=<id>` only; `qrPayload.test.ts:24-30` asserts no `eyJ`/bearer/token | CLOSED |
| T-11-10-PRIV | Info Disclosure | `JoinView.tsx` mounts inside `ctxD` (guest's own scoped per-party plane) | CLOSED |
| T-11-10-COMP | Elevation | `JoinView.tsx` renders verbatim `SUBMISSION REJECTED — NOT ELIGIBLE` + raw assertMsg (on-ledger reject, not render guard) | CLOSED |
| T-11-10-AUTH | Repudiation | `JoinView.tsx` + `QrJoin.tsx` render the HARD `… OIDC (PHASE 12)` dev-token label | CLOSED |
| T-11-10-SC | Tampering | `qrcode.react@4.2.0` (package.json:17) via blocking legitimacy checkpoint; `QrJoin.tsx:13,51` `QRCodeSVG`, no external fetch | CLOSED |
| T-11-11-PROV | Repudiation | `SettlementView.tsx` data-driven `CN TOKEN STANDARD (CIP-0056)` / `DAML-FINANCE-PATTERN (IN-REPO)`; no rendered "Daml Finance" | CLOSED |
| T-11-11-NET | Tampering | NETTED⇄GROSS toggle conserves balance-table totals; §4 render canary (MD-01 display fix landed per 11-VERIFICATION) | CLOSED |
| T-11-11-CANARY | Tampering | single-rAF simultaneous-settle beat + §4 BEFORE balances preserved (verifier build/vitest green) | CLOSED |
| T-11-11-CRED | Info Disclosure | SettlementView reads via `solver.ts` solver plane; no operator token / @daml/react context | CLOSED |

## Threat Verification — accept (2, logged as accepted risk)

| Threat ID | Category | Disposition | Accepted-risk justification | Verdict |
|-----------|----------|-------------|------------------------------|---------|
| T-11-01-SC | Tampering (supply chain) | accept | CN Token Standard DARs consumed are official Splice/Canton Foundation `Splice.Api.Token.{HoldingV1,MetadataV1}` artifacts already vetted on all three LocalNet participants (11-RESEARCH audit); no npm/PyPI install; NO forbidden LF-1.17 `daml-finance-*.dar` wired. Confirmed: `Holding.daml:31-32` imports only `Splice.Api.Token.*`. | CLOSED (accepted) |
| T-11-03-SC | Tampering (supply chain) | accept | Guest onboarding reuses `node:crypto` HS256 (`mint-jwt.mjs`) + the existing fetch layer; ZERO new solver runtime deps. Confirmed: `guest-onboard.mjs` imports only `node:fs`/`node:path`/`node:url` + local `mint-jwt.mjs`. | CLOSED (accepted) |

## Unregistered Flags (new attack surface with no threat mapping)

**None.** No `## Threat Flags` section appears in any 11-*-SUMMARY. New attack surface
introduced this phase — the two credential-free solver endpoints (`GET /round/:id/topology`,
`GET /guest/bootstrap`), the guest party (bankD), and the mobile `/join` route — each
maps to an existing registered threat (T-11-03-LEAK/QR, T-11-08-GUEST, T-11-10-*).
The 11-05 SUMMARY explicitly records "No new threat surface beyond the plan's register."

---

## Residual Risks (non-blocking — deferred / defense-in-depth)

These do NOT block the phase (`block_on: high`; none are High/Critical). Each is an
honestly-documented boundary or a redundant-defense weakness with the primary control
present.

**R-1 — `conservationOk` is a well-formedness screen, not a numeric-value gate (LW-01).**
`Settlement.daml:126-134` `instrumentConserves` sums each party's net over all parties,
which is structurally always `0.0` for any balanced-transfer leg list — so it proves
non-negative + no-self-leg shape, NOT that the amounts are economically correct. This is
honestly documented in-code (`:111-125`). It is NOT exploitable: numeric value
conservation is enforced by (a) the §8 recompute pinning `price`/allocation
(`Auction.daml:347-367`), (b) `buildGrossInstructions` deriving amounts from the verified
allocation, (c) `settleBatch`'s source DvP-integrity check + `Split` over-draw abort, and
(d) proven on-ledger by before/after Holding totals in `test_netting_conserves`.
*Disposition:* accepted defense-in-depth weakness; optional hardening (assert Σ cash-out
per buyer == filledQty × p*) deferred.

**R-2 — Bond `Holding.lock` field left `None` (11-05 deviation 4).**
The commit-reveal bond is immovable-by-the-desk because every `Holding` choice is
`controller operator` (the old Asset guarantee), proven by `test_bond_returned`'s
`submitMustFail` desk-Reassign — NOT via the `lock` marker. Setting `lock = Some _` would
also block the operator's own `ForfeitBond` Reassign (the generic mutating choices refuse
a locked holding by design), and adding an unlock choice was out of the plan's edit scope.
The security property (desk cannot move its posted bond) is fully preserved.
*Disposition:* accepted; a lock+unlock refinement is a future custody-model improvement.

**R-3 — Guest scoped token is a browser-BUNDLED dev token (LW-05 / WOW-07 boundary).**
`web/src/tokens.json` is gitignored and never committed (verified: `git check-ignore` +
untracked), but `desks.ts:10` imports it so Vite bundles the scoped token into the shipped
client JS. It is therefore browser-readable — a DEV token scoped `actAs/readAs bankD` only,
NOT a server-side-delivered secret. The shipped comments now state this accurately
(`guest-onboard.mjs:22-27`, `desks.ts:6-9`) and both surfaces carry the HARD
`DEV SCOPED TOKEN … REAL GUEST AUTH IS OIDC (PHASE 12)` label. No new blast radius vs the
pre-existing D6 A/B/C dev-token model.
*Disposition:* deferred — **production guest auth = OIDC (Phase 12)** (labeled, not
silently missing).

## Honest Deferred Boundaries (labeled in shipped code, not gaps)

- **Real KYC/AML vendor = Track B.** `DeskEligibility` is a STUB attestation
  (`accredited`/`sanctionsClear` are operator-signed flags, not a real KYC check). The
  on-ledger property that matters — participation is gated by an authority-signed
  credential a desk cannot self-issue — IS enforced. Labeled `STUB ATTESTATION — REAL KYC
  VENDOR IS TRACK B`.
- **Production guest auth = OIDC (Phase 12)** — see R-3.
- **`jurisdiction` is recorded/observable but not gated** — `isEligible = accredited &&
  sanctionsClear` (`Compliance.daml:71-72`); the reject message was corrected (LW-02) to
  cite only `accreditation/sanctions` (`:91`), so no non-existent jurisdiction gate is
  implied.
- **Single trust domain / co-hosted guest** — LocalNet has three participants in one
  operator domain; a genuine 4th validator is a live-UAT limit, held honest by the
  non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge.

---

## ASVS L1 Control Summary (block_on: high)

| ASVS Category | Control | Status |
|---------------|---------|--------|
| V2 Authentication | Guest scoped HS256 dev JWT; OIDC-labeled; token never in QR/committed | PASS |
| V4 Access Control | On-ledger COMP-01 gate (`assertDeskEligible`) at 3 points; structural per-party privacy | PASS |
| V5 Input Validation | zod on new solver endpoints; Daml `ensure`/`assertMsg` on Holding/Instrument/eligibility | PASS |
| V6 Cryptography | Phase-10 sha256 commit-reveal body byte-unchanged; bond hash re-check intact | PASS |
| V7 Error Handling | Secret-safe `{ error: { code, message } }` envelope; no token/key/env echoed | PASS |
| V14 Config/Secrets | `ANTHROPIC_API_KEY` + operator token never in browser; tokens.json + .operator-token gitignored | PASS |

**High-severity controls (the two `security_block_on: high` gates):** the COMP-01
on-ledger eligibility gate and the atomic-settle/conservation asserts are both
ledger-enforced and covered by negative tests. Both verified present.

---

_Audited: 2026-07-10 · gsd-security-auditor · ASVS L1 · block_on: high_
_Result: PASSED — 42/42 threats closed, 0 High/Critical, 3 documented residual risks (all deferred/defense-in-depth)._
