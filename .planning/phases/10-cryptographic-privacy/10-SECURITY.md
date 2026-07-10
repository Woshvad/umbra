---
phase: 10-cryptographic-privacy
slug: cryptographic-privacy
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-10
---

# Phase 10 — Cryptographic Privacy — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (32 threats across 10 plans). This audit VERIFIES each
> declared mitigation is genuinely present in implemented code — it does not re-derive a
> retroactive STRIDE register. Static verification only (no live stack booted).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| desk → ledger (commit/reveal) | Each desk drives commit/reveal on its OWN JSON Ledger API v2 plane | `commitment : Text` (sha256 hash) at commit; full order + salt at reveal |
| operator → bond Asset | Operator is sole Asset custodian; bond locked in operator custody while commitment live | USDCx bond ContractId (locked, not moved) |
| solver (operator token) → ledger | Solver exercises operator-authority ForfeitBond / ProofAnchor | Operator token (Authorization header only, module-private) |
| solver → drand quicknet | Timelock seal binds to a future drand beacon | Ciphertext + public round metadata; no long-term secret |
| ciphertext-on-ledger-during-window | During the open window only the commitment hash + bond ref are on-ledger | Order contents do NOT exist on-ledger until verified reveal |
| browser (:5173) → solver (:4100) | Credential-free operator-plane crypto calls (seal/prove/verify/anchor/offsets) | Public payloads only; no auth header, no :4000 |
| prover → proof artifact | Witness must NOT cross the prover boundary | Only `{proof, publicSignals, sizeBytes, ms}`; salt/qty/limit/fill stay private |
| off-ledger verify vs on-ledger anchor | Groth16 verify is off-ledger (Canton has no zk precompile); ledger records only hashes | proofHash / vkeyHash (Text) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-10-01 | Tampering | RevealOrder | mitigate | On-ledger `assertMsg "commitment mismatch" (commitment == commitOf …)` — `daml/Umbra/Auction.daml:207-208`; test `Tests.daml:693 test_reveal_mismatch_rejected` | closed |
| T-10-02 | Repudiation/DoS | commit-then-vanish | mitigate | `ForfeitBond` controller operator, CONSUMING — `Auction.daml:221-224`; `ledger.ts:535 forfeitNonRevealed`; test `Tests.daml:763 test_bond_forfeit` | closed |
| T-10-03 | Info Disclosure | order pre-reveal | mitigate | `OrderCommitment` holds only `commitment:Text` + `bondCid` on-ledger, signatory operator+desk / NO observer — `Auction.daml:181-189` | closed |
| T-10-04 | Tampering | non-canonical serialization | mitigate | Single `serializeOrder` — `Auction.daml:148-155` — shared by commit and reveal via `commitOf` `:161-162` | closed |
| T-10-05 | Repudiation | alpha crypto API drift | accept | SDK pinned `daml/daml.yaml:15` (3.4.11); `-Wno-crypto-text-is-alpha` `daml/daml.yaml:33`; honest alpha label `DECISIONS.md:235-239` | closed (accepted) |
| T-10-SC | Tampering | npm installs + circom.exe | mitigate | Pinned canonical iden3/drand packages (`snarkjs@0.7.6`); `circom.exe` SHA-256 pin `e43f132e…d185e1` recorded — `10-02-SUMMARY.md:14,42` | closed |
| T-10-06 | Tampering | zk build artifacts committed by mistake | mitigate | `solver/src/zk/.gitignore` ignores `*.wasm/*.zkey/*.ptau/*.r1cs/*.sym/*_js`; only §4 fixtures + `circom.exe` force-kept | closed (info) |
| T-10-07 | Info Disclosure | operator/solver peeks in window | mitigate | tlock early-decrypt block (`timelockOpen` throws "too early") — `tlock.ts:142-147`; test `tlock.test.ts:90-96`; only ciphertext on-ledger | closed (warning) |
| T-10-08 | Info Disclosure | salt/timelock key leakage | mitigate | `_offlineKey` module-private, never exported/returned/logged — `tlock.ts:83`; SECRET-SWEEP test `tlock.test.ts:132-159` | closed |
| T-10-09 | DoS/Trust | drand dishonesty/outage | accept | `OFFLINE_FALLBACK_LABEL = 'OFFLINE FALLBACK · WEAKER THAN DRAND'` — `tlock.ts:53`; documented `DECISIONS.md:284-288` | closed (accepted) |
| T-10-10 | Tampering | forged/tampered clearing | mitigate | Real `groth16.verify` — `verify.ts:36-40`; rejects forged p* `verify.test.ts:59-62`, rejects inconsistent witness `verify.test.ts:65-69` | closed |
| T-10-11 | Info Disclosure | losing orders leaked via proof | mitigate | **CR-01 FIXED** — high-entropy salt `randomBytes(31)` `index.ts:348,360`; witness stays private `prove.ts`; no losing value in public signals `verify.test.ts:53-56` | closed |
| T-10-12 | Repudiation | off-ledger verify mistaken for on-ledger | mitigate | `ProofAnchor` records only `proofHash`/`vkeyHash` — `Auction.daml:233-240`; "no zk precompile" `verify.ts:5-8` | closed |
| T-10-13 | Trust | PoC trusted setup (single contributor) | accept | Labeled "PoC-grade / cryptographer-review-gated" `verify.ts:11`, `verify.test.ts:14`; persistent UI tag "POC · CRYPTOGRAPHER REVIEW PENDING" `ProofOfClearingPanel.tsx:287` | closed (accepted) |
| T-10-14 | Elevation of Privilege | forfeit/anchor ops | mitigate | `forfeitNonRevealed` (ForfeitBond controller operator) `ledger.ts:535`; `anchorProof` operator-signed `ledger.ts:548`; `_operatorToken` module-private `ledger.ts:65,86` | closed |
| T-10-15 | Tampering | settle() regression | mitigate | `settle()` `ledger.ts:380` and `tamperClear()` `ledger.ts:416` are distinct functions; crypto fns are new exports; §4 canary `test_commit_reveal_clears_at_100` green (10-REVIEW confirms settle/tamperClear byte-unchanged) | closed |
| T-10-16 | Repudiation | stale bindings hide new templates | mitigate | Regenerated + committed bindings contain OrderCommitment/ProofAnchor/RevealOrder — `web/daml.js/umbra-0.1.0/lib/Umbra/Auction/module.d.ts` | closed |
| T-10-17 | Info Disclosure | crypto endpoint leaks secrets | mitigate | Secret-safe `{error:{code,message}}` envelope `api.ts:853,857`; sentinel sweep `SENTINEL_TLOCK_KEY`/`SENTINEL_WITNESS` `api.test.ts:67,71,1455` | closed |
| T-10-18 | Tampering | malformed crypto inputs | mitigate | zod `.strict()` bodies with size caps (payload ≤8192, ciphertext ≤100000, signals ≤256) — `api.ts:212,236-241,247,258-261` | closed |
| T-10-19 | Repudiation | off-ledger verify conflated with anchor | mitigate | `verify-proof` `solver.ts:357` and `anchor-proof` `solver.ts:366` are DISTINCT endpoints/routes | closed |
| T-10-20 | Tampering | regression on frozen §11/settle handlers | mitigate | Crypto endpoints ADDITIVE, off the §11/settle path — `api.ts:697`; §11 handlers + /settle unchanged (10-REVIEW confirms) | closed |
| T-10-21 | Info Disclosure | operator/Anthropic credential in web bundle | mitigate | `call<T>()` no auth header; `cryptoUrls.test.ts:138-142` asserts no credential literal, `:137` no :4000, `:116-124` no Authorization/bearer | closed |
| T-10-22 | DoS | solver down blocks UI | accept | Network reject → `SolverError(0,'OFFLINE',OFFLINE_CAPTION)` `solver.ts:323-340`; UI OFFLINE state `TimeMachineView.tsx:465,497` | closed (accepted) |
| T-10-23 | Elevation of Privilege | operator token in desk plane | mitigate | Commit/reveal on desk's OWN `ctx.useLedger()` — `OrderTicket.tsx:230,381,436`; no operator token in browser `:2-3,7,12` | closed |
| T-10-24 | Repudiation | weaker seal mistaken for drand truth | mitigate | Provenance grammar: solid ink "TIMELOCK · DRAND QUICKNET" `OrderTicket.tsx:859` vs dashed red "OFFLINE FALLBACK · WEAKER THAN DRAND" `:857` (dashed border `:842`) | closed |
| T-10-25 | Tampering | reveal-different-order | mitigate | RevealOrder on-ledger sha256 assert `Auction.daml:207`; UI exercises on desk's own plane + renders verbatim rejection `OrderTicket.tsx:421,436` | closed |
| T-10-26 | Repudiation | off-ledger verify mistaken for on-ledger | mitigate | DASHED T3 "OFF-LEDGER VERIFY · POC" `ProofOfClearingPanel.tsx:397-401` vs SOLID T1 "ON-LEDGER" anchor `:439`; "no zk-verifier precompile" prose `:11` | closed |
| T-10-27 | Info Disclosure | losing order leaked in UI | mitigate | PUBLIC INPUTS render only p*/matched/commitments + "NO LOSING ORDER IN THE WITNESS" `ProofOfClearingPanel.tsx:355,371`; solver never returns witness `prove.ts` | closed |
| T-10-28 | Tampering | stubbed/fake proof passed off as real | mitigate | "RUN TAMPERED CLEARING" → verbatim rejection `ProofOfClearingPanel.tsx:504,522`; persistent PoC tag `:287`; **WR-02 remediated** — verdict gated on real `tamper.rejected` `:515-519` | closed |
| T-10-29 | Info Disclosure | render-time filtering faked as privacy | mitigate | Each column mounts its OWN `ctx.DamlLedger` + reads ACS-at-offset with that party's token — `TimeMachineView.tsx:5-6,335-359`; rival column returns ∅ `:86` | closed |
| T-10-30 | Elevation of Privilege | operator token in browser | mitigate | Per-party reads use each party's own token; operator token NEVER in browser — `TimeMachineView.tsx:10-12,156-159,350-353` | closed |
| T-10-31 | Repudiation | derived stage passed off as authentic | mitigate | Event-backed cells "LEDGER EVENT @ {offset}" (T1) `TimeMachineView.tsx:17,54`; inferred stage DASHED + red "RECONSTRUCTED" (T3) `:19,53,240` | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Totals: 32 threats — 32 closed, 0 open.** Dispositions: 28 mitigate + 4 accept. No `transfer` dispositions in this phase.

---

## Verification Notes (honest-labeling warnings — non-blocking under `block_on: high`)

These do NOT increment `threats_open`: no declared mitigation is absent and no headline
privacy/settlement guarantee is broken. They are honest-labeling nuances on an
explicitly PoC-grade crypto layer whose full cryptographer review is a documented Track-B gate.

- **W-1 (T-10-07, ex 10-REVIEW WR-01):** Cleartext orders transit the operator-plane solver at
  *seal time* (`OrderTicket.tsx` computes `serializeOrder(built)` then POSTs to
  `/round/:id/timelock-encrypt`) before tlock encryption. Nothing on-ledger leaks (only the
  commitment hash is posted) and no request-body logging exists. The T-10-07 guarantee holds
  *on-ledger* ("operator holds only ciphertext"); some UI/tlock copy ("no one, including the
  venue") overclaims for the in-memory seal moment. WARNING, not a blocker — no secret is
  exposed today; hardening (client-side seal, or narrowed copy) is a follow-up.
- **W-2 (T-10-28, ex 10-REVIEW WR-02) — REMEDIATED:** The tamper panel previously hardcoded
  "PROOF REJECTED"; it now gates the verdict on the real `tamper.rejected` field and renders a
  distinct "ANOMALY — TAMPER ACCEPTED, INVESTIGATE" state otherwise
  (`ProofOfClearingPanel.tsx:515-519`), and `tamperProof` reports `rejected: !verified`
  (`index.ts:389`). Honest-labeling gap closed.
- **Info (10-REVIEW WR-03):** A latent cash-leg fold edge case in `Auction.daml:407-423`
  (`creditCash` returns an archived ContractId on an exact-cash full-consume) can abort a
  multi-seller/exact-remainder Clear. It never fires on the §4 fixture (buyer cash ≫ per-seller
  dues → always the Split branch) and it aborts rather than mis-settling (no data loss). It is a
  correctness edge case, NOT a declared crypto/privacy threat and NOT new attack surface —
  recorded here for traceability only; outside this audit's disposition scope.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-05 | T-10-05 | `DA.Crypto.Text` is an alpha stdlib module; SDK is pinned at 3.4.11 and the single alpha warning is suppressed via `daml.yaml build-options: [-Wno-crypto-text-is-alpha]` and honestly labeled in DECISIONS.md D12. A future SDK bump changing the alpha API is a known, pinned-away drift risk. | woshvad | 2026-07-10 |
| AR-10-09 | T-10-09 | drand quicknet is an external threshold-beacon dependency (dishonesty/outage). On outage the timelock drops to a LOCAL held-key AES-256-GCM seal that is materially weaker (no threshold) — flagged `mode:'offline'` + the load-bearing label "OFFLINE FALLBACK · WEAKER THAN DRAND" (tlock.ts:53, surfaced in the UI as a T3 dashed/red tag). Liveness backstop, never the security claim. | woshvad | 2026-07-10 |
| AR-10-13 | T-10-13 | The Groth16 trusted setup behind `vkey.json` is PoC-grade (single local contributor, `build.mjs`). Labeled "PoC-grade / cryptographer-review-gated" in code (verify.ts:11) and surfaced as a persistent red "POC · CRYPTOGRAPHER REVIEW PENDING" panel tag. Production ceremony / cryptographer review is a documented Track-B gate. | woshvad | 2026-07-10 |
| AR-10-22 | T-10-22 | The operator-plane solver (:4100) is a demo-scope service; if it is down the crypto UI panels degrade to an honest OFFLINE state (`SolverError OFFLINE` → `OFFLINE_CAPTION`) rather than blocking or faking data. Availability is accepted as out of scope for the PoC. | woshvad | 2026-07-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. The threat register was authored at plan time and is complete (32 threats). The two
Phase-10 SUMMARYs that carry a `## Threat Flags` section (`10-04-SUMMARY.md`,
`10-10-SUMMARY.md`) both declare **None** — no new network endpoint, auth path, or
trust-boundary surface was introduced during implementation. Secret sweep confirms: no `.env`
tracked, `ANTHROPIC_API_KEY` appears only in `.env.example` (empty) and security comments/test
sentinels, and the operator token (`_operatorToken`) is module-private (Authorization header only).

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-10 | 32 | 32 | 0 | gsd-security-auditor (Claude, ASVS L1, static verification) |

---

## Sign-Off

- [x] All threats have a disposition (28 mitigate / 4 accept / 0 transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-10-05 / 09 / 13 / 22)
- [x] `threats_open: 0` confirmed (CR-01 fixed; no HIGH-severity mitigation absent)
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-10
