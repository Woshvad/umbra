# Phase 11 — Live UAT Checklist

**Status:** Built · live UAT pending (2026-07-10)
**Why deferred:** These items require a booted 3-node Canton LocalNet (`:3975/:2975/:4975`) + the solver (`:4100`) + a real phone. They cannot be autonomously verified on this box; every seam is proven offline by `daml test`, solver `vitest` (141), and `web` build + `vitest` (77). Verification status = `human_needed` (4/4 success criteria code-verified). This mirrors the "Built · live UAT pending" pattern from Phases 8–10.

## How to run the live stack
See `.planning` memory / DECISIONS + `scripts/localnet/`: boot LocalNet, upload+vet the DAR, seed §4, `guest-onboard.mjs` for the guest desk, start the solver + `web`.

## Live checks

- [ ] **§4 on Holdings (DFIN-01):** a live round seeds A/B/C as CN-Token-Standard `Holding`s and clears **$100.00 / A=10·B=8·C=2**, settling atomically via the Batch/Instruction (`settleBatch`) path — operator-custody `Asset` off the live settlement path.
- [ ] **Multi-buyer live settle (DFIN-02/03):** a 2-buyer×2-seller (or guest-4th-buyer) round settles at one uniform p\*, conserving cash+assets, with correct per-buyer DvP leg attribution in `SettlementView` (the fixed `legsFromPreview`), and a token-agnostic cash instrument (swap USDCx → another instrument) settling unchanged.
- [ ] **COMP-01 rejection live:** an ineligible / unlisted party's `SubmitOrder`, `CommitOrder`, and `IssueHolding` are rejected **on-ledger**; the verbatim reject renders on `JoinView` (never "Something went wrong"). Eligible A/B/C/guest succeed.
- [ ] **Guest 4th-desk QR on a real phone (WOW-07):** scan the Theatre QR → `/join` opens on a phone → guest submits ONE sealed bid → guest sees ONLY its own order + fill (rivals invisible). Confirm the QR carries only the join URL (no token), and the DEV-TOKEN → OIDC (Phase 12) honesty label shows.
- [ ] **Three-node topology (VIZ-03):** `TopologyView` (07) shows each desk's order resident on its participant, the operator/synchronizer count-only node, and a red-edge **atomic** cross-node settle. On single-operator LocalNet the **DEMO-REAL · SINGLE-OPERATOR LOCALNET** badge must be on-screen (honest — true 3-validator topology needs 3 real institutions).
- [ ] **Netting toggle live:** NETTED ⇄ GROSS on a real multi-buyer round visibly collapses multilateral legs while conserving.

## Recorded honest limitations (not defects)
- Single-operator LocalNet ⇒ topology + cross-node settle are **demo-real**; genuine 3-desk privacy needs 3 validators (Phase 12 / real institutions).
- Guest token is a browser-bundled **dev** scoped token; production guest auth is **OIDC auth-code (Phase 12 / IDEN-01)**.
- Real KYC/AML vendor backing COMP-01 is **Track B**; the on-ledger gate + stub attestation ship here.
- `Account` template + full `AllocationV1` DvP conformance are out of this phase's budget (operator-custody Holdings; `HoldingV1`/`MetadataV1` conformance shipped) — a documented boundary, not a gap.
