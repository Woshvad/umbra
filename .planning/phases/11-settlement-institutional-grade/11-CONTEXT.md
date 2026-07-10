# Phase 11: Settlement & Institutional Grade - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommendations auto-accepted per user delegation "intelligently pick good options")

<domain>
## Phase Boundary

Replace the MVP settlement primitives with a production-grade, multi-party, compliance-gated settlement stack, and prove it across nodes — on the CURRENT v2 stack (Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 :3975; solver :4100; web :5173). This phase **relaxes two MVP invariants the prior phases deliberately preserved**: operator-custody `Asset` and the single-funded-buyer constraint in `Round.Clear`. It must compose with the Phase-10 `commit → reveal → clear` order flow and the Phase-9 order model, and **the §4 fixture ($100.00, fills A=10 / B=8 / C=2) remains the continuous correctness canary on every change**, still settling atomically.

**IN SCOPE:**
- **DFIN-01** Settlement via Daml Finance Holding/Instrument/Account + a Batch/Instruction (allocate/approve) flow with explicit settlement-finality semantics; retire operator-custody `Asset` from the live settlement path.
- **DFIN-02** `Round.Clear` generalized beyond single-funded-buyer to multi-buyer/multi-seller uniform-price crossing, with optional multilateral netting of the batch; cash + assets conserved on-ledger.
- **DFIN-03** Token-agnostic cash leg — a pluggable settlement/cash instrument (tokenized deposit / stablecoin / wholesale CBDC), not a hardcoded "USDCx" symbol.
- **COMP-01** On-ledger participation gating — only whitelisted, eligibility-checked (accreditation / jurisdiction / sanctions) desk parties may create an `Order` or hold the bond/cash asset (ERC-3643 analog); an ineligible party is rejected on-ledger.
- **WOW-07** A judge/guest becomes a 4th desk via a QR → mobile page, submits a sealed bid, and sees only their own fill.
- **VIZ-03** A live three-node topology view — each desk's order resident on its own Canton participant and the settlement transaction spanning all three atomically.

**OUT OF SCOPE (later phases / tracks):**
- Real on-chain DevNet, OIDC/Keycloak, four-eyes, ops hardening → **Phase 12** (real KYC vendor for the guest's auth is Phase 12's OIDC, not here).
- Real KYC/AML **vendor** integration (Refinitiv/Chainalysis-class) → **Track B** — here the eligibility gate is on-ledger + operator/Compliance-issued attestation stubs, honestly labeled.
- OTel / Vault / FIX / webhooks / competing solvers / RFQ / primary issuance → **Track B**.
- A real market-data reference feed → Track B (the labeled reference-price stub from Phase 9 is reused).

**HONEST LIMITATION (recorded, per PROJECT policy):** true 3-desk cross-node privacy needs 3 real institutions each running their own validator. On a single-operator LocalNet the three-node topology + cross-node atomic settle are **"demo-real"** (a weaker privacy claim). The genuine live cross-node E2E + QR-on-a-real-phone are **live UAT** items, not autonomously verifiable on this box; they are built and demoable locally and labeled as such.

</domain>

<decisions>
## Implementation Decisions

### Daml Finance Settlement Migration (DFIN-01) — retire operator-custody `Asset`

> **⚠ RESEARCH RECONCILIATION (2026-07-10, supersedes the pre-research preference below):** 11-RESEARCH.md establishes with HIGH confidence that **the Daml Finance library cannot run on this stack** — its latest packages are pinned to SDK 2.10.0 / Daml LF 1.17, while Umbra is LF 2.1 (SDK 3.4.11 / Canton 3.4); no 3.x Daml Finance release exists, and its LF-1.17 DARs cannot be vetted on the LF-2.1 participants. The "prefer the real Daml Finance library" target below is therefore **unsatisfiable**. The CORRECT-LINE production settlement standard — already vetted on all three LocalNet participants and used as data-dependencies by cn-quickstart's own `licensing` project — is the **CN Token Standard (CIP-0056)** (`splice-api-token-*`). **Adopted decision:** implement in-repo `Holding`/`Instrument` templates that conform to the **real CN Token Standard interfaces** (real interface conformance + guaranteed build; provenance-tagged `CN TOKEN STANDARD (CIP-0056)`), with a plain in-repo faithful layer (`DAML-FINANCE-PATTERN (IN-REPO)`) as the reliable fallback. **Never claim "Daml Finance the library."** This is a Phase-10-grade honesty pivot: the real, correct-line standard, honestly labeled, beats a broken/faked import. The success-criterion intent (Holding/Instrument/Account + Batch/Instruction allocate/approve + explicit finality, retiring operator-custody `Asset`, §4 still $100.00) is met via the CN Token Standard; the verifier evaluates against THIS reconciled target.

- **~~Library-first~~ Standard-conformant, faithful-fallback:** implement in-repo templates conforming to the CN Token Standard (CIP-0056) `splice-api-token-*` interfaces (Holding/Instrument + a Batch/Instruction allocate→approve→settle finality flow). If full `AllocationV1` DvP conformance overruns the phase budget, start with `HoldingV1`/`MetadataV1` conformance + an in-repo Batch/Instruction finality flow and document the conformance boundary. Prefer real interface conformance over a plain fake; a runnable honest layer beats a broken real one (the Phase-10 honesty bar).
- **Model:** desks hold `Holding`s of a bond `Instrument` (BONDX) and a cash `Instrument` (USDCx) in per-desk `Account`s at a custodian (the operator for the MVP topology). Settlement is a `Batch` of `Instruction`s; the operator (and/or counterparties) `allocate` and `approve`, then the batch `Settle`s **all-or-nothing (atomic)** — explicit settlement finality = the Batch settlement commit.
- **Retire `Asset`:** `Umbra.Asset` is removed from the live settlement path (Split/Merge/Reassign no longer the settlement primitive). It remains reachable in git history / `sandbox-mvp` tag; the §4 seed (BONDX/USDCx holdings) is migrated to Daml Finance `Holding`s. The Phase-10 **bond** (posted with `OrderCommitment`) also migrates to a cash `Holding`, preserving the commit/forfeit mechanics.
- **Clearing ⇄ settlement seam:** `Round.Clear` keeps its recompute-§8-and-assert backstop, then constructs the `Batch` of `Instruction`s from the *verified* allocation, allocates/approves, and settles atomically (replacing today's direct `Asset` Split/Reassign legs). The on-ledger re-verification of the clearing is UNCHANGED in intent (verify-don't-trust).

### Multi-Party Crossing, Netting & Token-Agnostic Cash (DFIN-02, DFIN-03)
- **Remove the single-funded-buyer invariant:** delete the `abort "settlement requires exactly one funded buyer (MVP single-buyer invariant)"` guard in `Round.Clear`; settle N-buyers × M-sellers at the single uniform p\*. On-ledger conservation assertions (Σ bond delivered = Σ bond received; Σ cash paid = Σ cash received) replace the single-buyer shortcut and FAIL LOUDLY on imbalance.
- **Optional multilateral netting:** net each party's per-instrument position (Σ receives − Σ delivers) into one net `Instruction` per (party, instrument) at the `Batch` level; netting DEFAULT ON for the batch, with the gross per-leg legs still derivable for the topology viz / receipts. Netting must conserve cash + assets and preserve each desk's economic result.
- **Token-agnostic cash leg:** the cash leg references a **pluggable cash `Instrument`** (Daml Finance instrument key / interface parameter), not a hardcoded `"USDCx"` string. §4 uses a USDCx-labeled tokenized-deposit instrument; the settlement type supports swapping in another stablecoin/CBDC instrument WITHOUT changing `Round.Clear`.
- **§4 invariant + new multi-buyer golden:** §4 stays single-buyer-shaped (A is the sole buyer) and MUST still clear **$100.00 / A=10 / B=8 / C=2** as a pure reduction of the generalized path. ADD a new multi-buyer/multi-seller golden fixture (e.g. 2 buyers × 2 sellers) proving the generalization clears at one uniform price and conserves cash+assets — mirrored Daml + (where clearing math is touched) `solver/src/auction.ts`, asserted by the golden suite.

### On-Ledger Compliance / Eligibility Gating (COMP-01) — ERC-3643 analog
- **Mechanism:** an on-ledger eligibility credential — an operator/**Compliance**-signed `DeskEligibility` (per-desk) and/or an `EligibilityRegistry` keyed by desk, carrying `accredited`, `jurisdiction`, and `sanctionsClear` flags. Issued by the operator/Compliance role (stub attestation — a real KYC/AML vendor is Track B).
- **Enforcement points (BOTH):** creating an `Order` (via `Venue.SubmitOrder` / the Phase-10 `CommitOrder`) AND receiving/holding the bond or cash `Holding` require an active, valid eligibility credential for that desk. An unlisted/ineligible party's submit or holding-receipt is rejected **on-ledger** (`assertMsg` / `fetchByKey` failure) — not in render logic.
- **§4 compatibility + new negative test:** the three §4 desks (A/B/C) are seeded eligible so §4 still clears $100.00; the guest 4th desk is eligible once onboarded. ADD a test proving an INELIGIBLE party is rejected on-ledger at both enforcement points.
- **Composes additively** with commit → reveal → clear and the Daml Finance holdings — the gate is a precondition, not a change to the clearing math.

### 4th Desk via QR (WOW-07) + Three-Node Topology Viz (VIZ-03)
- **Guest join:** allocate a guest desk party (e.g. `Guest` / BankD) with its own scoped per-party JWT (the SAME zero-dep HS256 per-party token pattern as A/B/C — token never in web source). A mobile-friendly web route (e.g. `/join` or a guest `DeskView`) is reachable via a **QR code** rendered in the operator/Theatre view; the guest submits a sealed bid and sees ONLY its own order/fill (structural per-party privacy, identical to the existing desks).
- **QR generation:** client-side QR (a small vetted lib or hand-rolled encoder) encoding the guest join URL + round context; **no secret in the QR** — dev uses a pre-minted guest token, with an explicit honest note that production guest auth is OIDC auth-code (Phase 12 / IDEN-01).
- **Topology viz:** a new view (`07` Topology / Network) showing three participant nodes each hosting one desk's order, the operator/synchronizer, and the atomic settlement transaction spanning all nodes; driven by ledger/party-hosting metadata where available, with a CLEARLY-LABELED LocalNet single-participant "demo-real" fallback. Reuse the binding design comp's paper/ink/lime + redaction motifs (UI-SPEC will bind it exactly).
- **Honest cross-node reality:** on LocalNet the "three participants" are demo-real; TRUE cross-node privacy needs 3 validators (recorded limitation). Live cross-node atomic settle + QR-on-a-real-phone → **live UAT** items; the viz + join flow are built and locally demoable.

### Claude's Discretion
- Exact Daml Finance package versions + data-dependency wiring (or, if the fallback triggers, the in-repo interface-layer shape), the netting algorithm encoding, the `DeskEligibility`/registry contract + key shape, the QR library choice (or hand-rolled), and the topology viz layout + data-plumbing — all at the planner/researcher's discretion, PROVIDED: the success criteria hold, the §4 fixture still clears **$100.00** and settles atomically, Daml⇄TS parity holds wherever clearing math is touched, and every demo-real / stub / deferred boundary is honestly labeled.
- If any sub-item's real (non-stub) version proves infeasible on this box within the phase, scope it to the strongest HONESTLY-LABELED slice that runs and document the production path + limitation rather than fake it.

</decisions>

<code_context>
## Existing Code Insights

### Reusable / Impacted Assets
- **daml/Umbra/Asset.daml** — operator-custody `Asset` (signatory operator, observer owner; Split/Merge/Reassign all `controller operator`). RETIRED from the settlement path by DFIN-01; §4 holdings migrate to Daml Finance `Holding`s.
- **daml/Umbra/Auction.daml** — the critical file. `Round.Clear` (choice `Clear`) currently: lifecycle guard → recompute-§8-and-assert → **single-funded-buyer** settlement (`fundedBuyers`/`abort` at the "exactly one funded buyer" guard) via `Asset` Reassign/Split → `Retire` orders → per-desk `TradeConfirmation` (already carries `surplusVsLimit`/`referencePrice` from Phase 9). Also hosts `Order` (signatory operator+desk, NO observer = private), `OrderCommitment` + `RevealOrder` + `ForfeitBond` (Phase-10 bond), `ProofAnchor` (Phase-10 ZK), `RoundStats` (count-only, observer=desks), `Round` (CloseRound/Clear). DFIN-01/02/03 rewrite the settlement legs; COMP-01 gates `Order` creation.
- **daml/Umbra/Clearing.daml** — pure §8 core (`computeClearing`, `choosePStar` with the max-matched-subset tie-break trap guard, `rationByPriority`). Clearing MATH is largely unchanged by Phase 11 (this phase is SETTLEMENT, not the clearing algorithm) — but any touch stays Daml⇄TS byte-identical.
- **daml/Umbra/Setup.daml** + **Tests.daml** — §4 seed (holdings + commit→reveal→clear) + the `test_clears_at_100` / settlement / atomicity / privacy tests. Migrate the seed to Daml Finance holdings; add the multi-buyer golden + the ineligible-party negative test; keep all existing tests green.
- **solver/src/ledger.ts / auction.ts / api.ts** — Operator wire layer + TS clearing mirror + Express API (:4100). Settlement submission (`Round.Clear`) moves to the Batch/Instruction flow; the multi-buyer generalization is mirrored in `auction.ts` if the clearing surface changes; new endpoints for eligibility/guest onboarding + topology metadata as needed.
- **web/src/views/** — `DeskView.tsx`/`OrderTicket` (guest reuses this on mobile), `SettlementView.tsx` (Daml-Finance leg rendering + guest's own-fill), `TheatreView.tsx` (QR host), plus a NEW `TopologyView.tsx` (view 07). `ledgerContexts.ts` / `desks.ts` / `tokens.json` — per-party token plumbing the guest desk extends.

### Established Patterns (non-negotiable)
- **Verify-don't-trust + on-ledger re-verification:** any new settlement path is still gated by `Round.Clear`'s recompute-and-assert; the AI/solver number is never trusted.
- **Privacy is structural** (signatory/observer sets) — the guest's order/fill privacy and the topology residency come from the ledger's authority model, not render logic.
- **§4 as continuous canary** — `test_clears_at_100` + the TS §4 test run after every change; a Phase-11 change that breaks $100.00 is reverted, not accommodated.
- **Additive + faithful-fallback + honest labeling** — the Phase-1/2 additive discipline and the Phase-10 "real-or-honestly-labeled-PoC, never a stub-passed-as-real" bar.
- **Daml⇄TS parity (CLEAR-05)** wherever clearing math is touched.
- **No Claude git attribution; author/committer = woshvad** (project non-negotiable) on every commit this phase makes.

### Integration Points
- Daml Finance: `daml.yaml` data-dependencies + `Setup.daml` holdings + `Round.Clear` Batch/Instruction legs + Daml tests + `solver/ledger.ts` submission — in lockstep.
- Compliance gate: `DeskEligibility`/registry → `Venue.SubmitOrder`/`CommitOrder` + holding issuance → seed (A/B/C/guest eligible) → negative test.
- Guest + topology: guest party allocation + scoped token → `/join` mobile route + QR in Theatre → `TopologyView` fed by party-hosting metadata (labeled LocalNet fallback).

</code_context>

<specifics>
## Specific Ideas

- The success criterion wording is explicit that settlement "uses Daml Finance Holding/Instrument/Account and a Batch/Instruction (allocate/approve) flow" — so the REAL Daml Finance library is the target; the in-repo faithful layer is a labeled fallback only if 3.4.11 compatibility fails within the phase.
- Keep the §4 canonical orders single-buyer-shaped so $100.00 / A=10 / B=8 / C=2 survives as a pure reduction; prove the generalization with a SEPARATE multi-buyer golden fixture.
- The guest QR/mobile flow is a demo-real convenience: dev pre-minted scoped token now; real guest OIDC auth-code is Phase 12. Label it.
- Topology "three nodes" on LocalNet is demo-real; the honest cross-node claim + live phone test are UAT.

</specifics>

<deferred>
## Deferred Ideas

- Real KYC/AML **vendor** integration (backs COMP-01 for real value) → Track B.
- Real OIDC auth-code for the guest desk, TLS, four-eyes, ops hardening → **Phase 12**.
- Genuine 3-validator cross-node topology (needs 3 real institutions each running a validator) → recorded honest limitation + **live UAT**; only demo-real locally.
- A real market-data reference feed for TCA → Track B (Phase-9 labeled stub reused).

</deferred>
