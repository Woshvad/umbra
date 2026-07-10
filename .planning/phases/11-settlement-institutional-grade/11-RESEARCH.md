# Phase 11: Settlement & Institutional Grade — Research

**Researched:** 2026-07-10
**Domain:** Daml 3.4.11 / Canton 3.4 LocalNet settlement (Daml Finance vs CN Token Standard vs in-repo faithful layer), on-ledger compliance gating, multi-party crossing/netting, guest onboarding + QR, cross-node topology
**Confidence:** HIGH on the settlement-library verdict (the pivotal question); HIGH on compliance/guest/topology patterns; MEDIUM on the exact CN Token Standard registry-interface effort estimate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **DFIN-01 (settlement migration):** Library-first, faithful-fallback. PREFER the real Daml Finance packages pinned to the release that builds on SDK 3.4.11 (researcher CONFIRMS compatibility before planning). If the real library cannot build/vet on 3.4.11 within the phase, fall back to a **faithful in-repo implementation of the SAME interfaces** (Account / Holding / Instrument + Batch / Instruction `allocate → approve → settle` with explicit finality), honestly labeled `DAML-FINANCE-PATTERN (IN-REPO)`. Attempt real first; prefer a smaller real integration over a larger fake one.
- **Model:** desks hold `Holding`s of a bond `Instrument` (BONDX) and a cash `Instrument` (USDCx) in per-desk `Account`s at a custodian (operator for the MVP topology). Settlement is a `Batch` of `Instruction`s; parties `allocate`/`approve`, then the batch `Settle`s all-or-nothing (atomic). Explicit finality = the Batch settlement commit.
- **Retire `Asset`:** `Umbra.Asset` removed from the live settlement path (remains in git history / `sandbox-mvp` tag). §4 seed (BONDX/USDCx) migrates to holdings. The Phase-10 bond (posted with `OrderCommitment`) also migrates to a cash `Holding`, preserving commit/forfeit mechanics.
- **Clearing⇄settlement seam:** `Round.Clear` keeps its recompute-§8-and-assert backstop, THEN constructs the `Batch` of `Instruction`s from the *verified* allocation and settles atomically. On-ledger re-verification is UNCHANGED in intent (verify-don't-trust).
- **DFIN-02 (multi-party):** Delete the single-funded-buyer `abort` guard; settle N-buyers × M-sellers at one uniform p*. On-ledger conservation asserts (Σ bond delivered = Σ bond received; Σ cash paid = Σ cash received) replace the single-buyer shortcut and FAIL LOUDLY on imbalance.
- **Optional multilateral netting:** net each party's per-instrument position into one net `Instruction` per (party, instrument) at the Batch level; DEFAULT ON, gross legs still derivable for viz/receipts. Must conserve cash+assets and preserve each desk's economic result.
- **DFIN-03 (token-agnostic cash):** cash leg references a pluggable cash `Instrument` (instrument key/interface parameter), not a hardcoded `"USDCx"` string. §4 uses a USDCx-labeled tokenized-deposit instrument; swapping in another stablecoin/CBDC must NOT change `Round.Clear`.
- **§4 invariant + new golden:** §4 stays single-buyer-shaped (A sole buyer) and MUST still clear **$100.00 / A=10 / B=8 / C=2** as a pure reduction. ADD a new multi-buyer/multi-seller golden (e.g. 2×2) proving the generalization clears at one uniform price and conserves cash+assets — mirrored Daml + (where clearing math is touched) `solver/src/auction.ts`.
- **COMP-01 (eligibility):** on-ledger credential — an operator/**Compliance**-signed `DeskEligibility` (per-desk) and/or `EligibilityRegistry` keyed by desk, carrying `accredited`, `jurisdiction`, `sanctionsClear`. Issued by operator/Compliance role (stub attestation — real KYC vendor is Track B).
- **Enforcement points (BOTH):** creating an `Order` (via `Venue.SubmitOrder` / `CommitOrder`) AND receiving/holding the bond or cash `Holding` require an active, valid eligibility credential. An ineligible party's submit or holding-receipt is rejected **on-ledger** (`assertMsg` / `fetchByKey` failure) — not in render logic. §4 A/B/C seeded eligible; guest eligible once onboarded. ADD a negative test.
- **WOW-07 (guest):** allocate a guest desk party (e.g. `Guest`/`BankD`) with its own scoped per-party JWT (same zero-dep HS256 per-party pattern; token never in web source). Mobile route `/join` reachable via QR in the operator/Theatre view; guest submits a sealed bid and sees ONLY its own order/fill. QR: client-side, small vetted lib or hand-rolled; **no secret in the QR**; dev uses a pre-minted guest token, honest note that production guest auth is OIDC (Phase 12).
- **VIZ-03 (topology):** new view `07 Topology` — three participant nodes each hosting one desk's order, the operator/synchronizer, and the atomic settlement transaction spanning all nodes; driven by ledger/party-hosting metadata where available, with a CLEARLY-LABELED LocalNet single-participant "demo-real" fallback. Reuse binding comp motifs (UI-SPEC binds it).

### Claude's Discretion
- Exact Daml Finance package versions + data-dependency wiring (or, if fallback triggers, the in-repo interface-layer shape), the netting algorithm encoding, the `DeskEligibility`/registry contract + key shape, the QR library choice (or hand-rolled), and the topology viz layout + data-plumbing — ALL at planner/researcher discretion, PROVIDED: success criteria hold, §4 still clears **$100.00** and settles atomically, Daml⇄TS parity holds wherever clearing math is touched, and every demo-real/stub/deferred boundary is honestly labeled.
- If any sub-item's real (non-stub) version is infeasible on this box within the phase, scope it to the strongest HONESTLY-LABELED slice that runs and document the production path + limitation rather than fake it.

### Deferred Ideas (OUT OF SCOPE)
- Real KYC/AML **vendor** integration (Refinitiv/Chainalysis-class) → Track B.
- Real OIDC auth-code for the guest desk, TLS, four-eyes, ops hardening → Phase 12.
- Genuine 3-validator cross-node topology (needs 3 real institutions each running a validator) → recorded honest limitation + live UAT; only demo-real locally.
- A real market-data reference feed for TCA → Track B (Phase-9 labeled stub reused).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DFIN-01 | Settlement via Daml Finance Holding/Instrument/Account + Batch/Instruction (allocate/approve) flow with explicit finality, replacing operator-custody `Asset` | **Verdict below:** real Daml Finance does NOT build on 3.4.11 (LF-1.17 pinned). Two honest buildable paths: (A) CN Token Standard `splice-api-token-*` DARs already vetted on the box, or (B) in-repo faithful `Umbra.Settlement` layer. Recommended: in-repo layer that *implements the CN Token Standard interfaces* — real interface conformance + guaranteed build. |
| DFIN-02 | `Round.Clear` generalizes beyond single-funded-buyer to N×M crossing, optional multilateral netting | Delete `fundedBuyers` guard (Auction.daml:379-382); replace with per-instrument conservation asserts; batch-leg derivation (netted + gross) as a shared pure fn. `computeClearing` is ALREADY multi-buyer-general — no clearing-math change. |
| DFIN-03 | Token-agnostic cash leg via a pluggable settlement instrument | `Round.Clear` gains a `cashInstrument` parameter (instrument key/`InstrumentId`), no hardcoded `"USDCx"`. §4 passes a USDCx-labeled instrument. |
| COMP-01 | On-ledger eligibility gate (accreditation/jurisdiction/sanctions) at BOTH Order creation and holding issuance | `DeskEligibility` template keyed `(operator, desk)`, maintainer operator; `fetchByKey` + `assertMsg` inside `Venue.SubmitOrder`/`CommitOrder` and the holding-mint/transfer path. Operator authority is present in those choices (Venue is `signatory operator`), so the key lookup is authorized. |
| WOW-07 | Guest 4th desk via QR → mobile page, own-fill privacy | Allocate guest party on LocalNet (`POST /v2/parties` + user + rights — existing `xnode-up.mjs` pattern); mint scoped HS256 JWT (`mint-jwt.mjs`); `/join` route reuses `OrderTicket`+`FillCard`; QR via `qrcode.react` (vetted below) or hand-rolled SVG; QR encodes only URL+roundId, never the token. |
| VIZ-03 | Live three-node topology view; orders resident per participant; atomic cross-node settle | Party→participant hosting from `GET /v2/parties` `isLocal` probed per participant (:2975/:3975/:4975) — the pattern `xnode-up.mjs`/`probe-xnode.mjs` already use. xnode distribution is genuinely multi-participant (D11); the honest limit is single trust-domain, not single participant. |
</phase_requirements>

## Summary

This phase's pivotal question — "does the real Daml Finance library build on SDK 3.4.11?" — resolves **decisively NO**. Daml Finance's latest published packages (Settlement.V4/4.0.0 etc.) are built against **Daml SDK 2.10.0 and Daml LF 1.17** `[CITED: docs.daml.com/daml-finance, github.com/digital-asset/daml-finance/releases]`. Umbra's live stack is **SDK 3.4.11 / Canton 3.4, which uses Daml LF 2.1** `[VERIFIED: daml/daml.yaml sdk-version:3.4.11; DECISIONS.md D8]`. LF 1.17 DARs cannot be added as `data-dependencies` to, or vetted on, an LF-2.1 (Daml 3.x) participant — the LF major boundary is not crossable. There is no Daml Finance release for the 3.x line. Therefore the CONTEXT's "PREFER the real Daml Finance packages pinned to the release that builds on SDK 3.4.11" has **no satisfiable target**, and the decision rule falls through to the faithful path.

However, "faithful fake" is not the only honest option, and the CONTEXT explicitly says *"prefer a smaller real integration over a faithful fake."* The cn-quickstart LocalNet on this machine **already ships and vets the Canton Network Token Standard (CIP-0056) DARs** — `splice-api-token-holding-v1`, `-allocation-v1`, `-allocation-request-v1`, `-allocation-instruction-v1`, `-transfer-instruction-v1`, `-metadata-v1` — all built for SDK 3.4.11 and used as `data-dependencies` by cn-quickstart's own `licensing` project `[VERIFIED: cn-quickstart/quickstart/daml/dars/ listing + daml/licensing/daml.yaml on this box]`. These interfaces provide the **exact allocate→settle atomic-DvP semantics** the phase wants (Holding, Allocation, AllocationInstruction, atomic multi-leg settlement in one Daml transaction) — they are the Canton-native successor to Daml Finance's settlement pattern `[CITED: docs.sync.global token_standard; canton.network/blog CIP-56]`.

**Primary recommendation:** Build an **in-repo `Umbra.Settlement` interface layer** (Account / Holding / Instrument + Batch / Instruction with `allocate → approve → settle` explicit finality) that is guaranteed to build on 3.4.11 and keeps §4 fully under our control — AND have its `Holding`/`Instrument` templates **implement the CN Token Standard interfaces** (`Splice.Api.Token.HoldingV1`, `MetadataV1`, and — budget permitting — `AllocationV1`/`AllocationInstructionV1`). This delivers *real standard interface conformance* (not a fake) without requiring a full external registry app, guarantees the build, and lets the settlement provenance tag read **`CN TOKEN STANDARD (CIP-0056)`** honestly rather than the false `DAML FINANCE`. If the interface-implementation spike exceeds phase budget, drop to the plain in-repo layer labeled `DAML-FINANCE-PATTERN (IN-REPO)`. **Never claim "Daml Finance the library" — it demonstrably does not run on this line.**

Everything else composes additively: `computeClearing` (§8) is already multi-buyer-general and stays byte-unchanged; commit→reveal→clear (Phase 10, DA.Crypto.Text) is untouched except that the operator-custody bond LOCK migrates from an `Asset` to a cash `Holding`; COMP-01 is a precondition gate; the guest and topology work reuse the existing per-party-token and `xnode-up.mjs` participant-distribution machinery already proven live (D11).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Holding/Instrument/Account custody | Daml ledger (templates) | — | Custody + conservation are ledger authority, not app logic |
| Batch/Instruction allocate→approve→settle finality | Daml ledger (`Round.Clear` body) | Solver (submission) | Atomicity = one Daml transaction; finality = the settle commit |
| Multi-party crossing + conservation asserts | Daml ledger (`Round.Clear`) | — | Verify-don't-trust; conservation must be on-ledger, fail-loud |
| Clearing math (§8) | Daml (`Clearing.daml`) ⇄ TS (`auction.ts`) | — | Unchanged; parity discipline (CLEAR-05) |
| Netting (net legs) + gross-leg derivation | Daml (settlement) ⇄ TS (viz mirror) | Web (render) | Netting is a settlement transform; viz reads gross legs |
| Eligibility credential + gate | Daml ledger (`DeskEligibility`, `Venue`/holding choices) | Solver (onboarding create) | Rejection MUST be structural (on-ledger), not render logic |
| Guest party allocation + scoped token | Canton admin API (`/v2/parties`, users, rights) | Solver/script (`mint-jwt.mjs`) | Party hosting + JWT minting are node-admin operations |
| Guest order submit + own-fill privacy | Daml ledger (signatory/observer sets) + per-party JWT | Web `/join` | Privacy is structural, from the ledger authority model |
| QR generation | Web (client SVG) | — | No secret in payload; pure client render |
| Party→participant hosting metadata | Canton JSON API v2 (`/v2/parties` per participant) | Solver endpoint (credential-free) | `isLocal` per participant is the real hosting signal |
| Topology render + atomic-settle animation | Web (`TopologyView`) | Solver metadata endpoint | Presentation of ledger-derived hosting + settle event |

## Standard Stack

### Core (settlement library — the decision)

| Option | Coordinates / Source | Builds on 3.4.11? | Disposition |
|--------|----------------------|-------------------|-------------|
| **Daml Finance** (`daml-finance-interface-*`, `-holding`, `-account`, `-instrument-token`, `-settlement`) | github.com/digital-asset/daml-finance releases; docs.daml.com/daml-finance | **NO** — pinned to SDK 2.10.0 / **LF 1.17**; no 3.x release exists | **REJECTED for build** — cannot vet on an LF-2.1 participant. Cite as the pattern source only. |
| **CN Token Standard (CIP-0056)** `splice-api-token-*-v1-1.0.0.dar` | Already in `cn-quickstart/quickstart/daml/dars/` on this box; hyperledger-labs/splice token-standard | **YES** — cn-quickstart `licensing` uses them as `data-dependencies` on SDK 3.4.11 | **REAL PATH** — the Canton-native allocate→settle standard, already vetted on :2975/:3975/:4975 |
| **In-repo `Umbra.Settlement`** faithful layer | New Daml in `daml/Umbra/Settlement.daml` (+ `Holding.daml`, `Instrument.daml`) | **YES** — plain templates on 3.4.11 (proven by every existing Umbra template) | **RELIABLE PATH** — guarantees §4 green + full control; label `DAML-FINANCE-PATTERN (IN-REPO)` unless it implements CN interfaces |

**Recommended (hybrid, best of both):** in-repo `Holding`/`Instrument` templates that **implement the CN Token Standard interfaces** (`Splice.Api.Token.HoldingV1.Holding`, `MetadataV1`). Settlement is an in-repo `Batch`/`Instruction` with explicit `allocate → approve → settle`. Provenance tag reads `CN TOKEN STANDARD (CIP-0056)`. Budget-permitting, also implement `AllocationV1`/`AllocationInstructionV1` for full-standard DvP conformance.

**data-dependencies wiring (if CN interfaces are implemented):** copy the six token-standard DARs from cn-quickstart into `daml/vendor/` (or reference by absolute path) and add to `daml/daml.yaml`:
```yaml
data-dependencies:
  - vendor/splice-api-token-metadata-v1-1.0.0.dar
  - vendor/splice-api-token-holding-v1-1.0.0.dar
  - vendor/splice-api-token-allocation-v1-1.0.0.dar
  - vendor/splice-api-token-allocation-request-v1-1.0.0.dar
  - vendor/splice-api-token-allocation-instruction-v1-1.0.0.dar
  - vendor/splice-api-token-transfer-instruction-v1-1.0.0.dar
```
These DARs are already vetted on all three LocalNet participants (they back Amulet/wallet), so no additional `deploy.mjs` vetting step is needed for the interface packages — only Umbra's own DAR re-uploads. `[VERIFIED: cn-quickstart/daml/dars/ + licensing/daml.yaml on this box; live-e2e-ops memory D11 vetting note]`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `qrcode.react` | `4.2.0` | Client-side SVG QR for the guest join code (WOW-07) | `web/` — `QRCodeSVG` component, ink-on-paper, `level="M"` |
| (hand-rolled SVG QR encoder) | — | Zero-dep fallback if the legitimacy gate rejects a lib | `web/components/QrJoin.tsx` fallback |

**No new solver npm deps.** Guest onboarding + topology metadata reuse existing `node:crypto` HS256 minting (`scripts/localnet/mint-jwt.mjs`) and the v2 fetch layer.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-repo layer implementing CN interfaces | Full external CN registry app (issue BONDX/USDCx via a real registry participant) | Most "real," but requires a registry participant + factory choices per instrument — likely exceeds phase budget; the in-repo-implements-interfaces hybrid captures 90% of the realness |
| `qrcode.react` | `qrcode` (node/canvas) or `react-qr-code` | `qrcode.react` v4 emits stylable SVG (`QRCodeSVG`) → ink-on-paper token fidelity; `react-qr-code` is also SVG/MIT but far fewer downloads |
| Netting default-on | Gross-only settlement | Gross needs explicit buyer↔seller pairing; netting (one Instruction per party·instrument) is simpler AND conserves — keep both, netted default |

**Version verification:** `daml-finance` latest = Settlement.V4/4.0.0 on **SDK 2.10.0 / LF 1.17** `[CITED: github releases page, fetched 2026-07-10]`. `qrcode.react@4.2.0`, ISC, created 2014, **6,465,438 weekly downloads** `[VERIFIED: npm view + api.npmjs.org downloads point, 2026-07-10]`. CN Token Standard DARs = `splice-api-token-*-v1-1.0.0.dar` `[VERIFIED: directory listing on this box]`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `qrcode.react` | npm | ~11 yrs (created 2014-03-16) | 6.46M/wk | github.com/zpao/qrcode.react | not run (unavailable) — metadata-verified | **Approved** (ISC license, huge adoption, mature) |
| `splice-api-token-*-v1` (6 DARs) | not npm — Canton DAR artifacts | current (1.0.0, ships with cn-quickstart 3.4.11) | n/a | hyperledger-labs/splice | n/a (not an npm/PyPI pkg) | **Approved** (official Splice/Canton Foundation artifacts, already vetted on the box) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged [SUS]:** none. `qrcode.react` metadata (11-year age, ISC, 6.46M weekly downloads, `zpao`/react-community publisher) clears the Phase-10 legitimacy bar; the plan-time gate should still record publisher + license + "no telemetry/network" confirmation before install, and the hand-rolled SVG encoder remains the honest zero-dep fallback.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌─────────────────────────────────────────────┐
  Guest phone          │              Canton LocalNet (3.4)          │
  (QR scan) ──/join──► │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
        │              │  │app-user  │ │app-prov. │ │   sv     │     │
        │ scoped JWT   │  │ :2975    │ │ :3975    │ │ :4975    │     │
        ▼              │  │ bankA    │ │operator  │ │ bankB    │     │
  web /join ──────────►│  │ +guest?  │ │ bankC    │ │          │     │
  (OrderTicket)        │  └────┬─────┘ └────┬─────┘ └────┬─────┘     │
                       │       │  party→participant via  │           │
                       │       │  GET /v2/parties isLocal │           │
                       └───────┼────────────┼────────────┼───────────┘
                               │            │            │
   COMP-01 gate ───────────────┼──── DeskEligibility fetchByKey (operator,desk)
   (fetchByKey assert)         │            │
                               ▼            ▼
   desk ──CommitOrder──► OrderCommitment (hash + cash-Holding LOCK)
                               │  RevealOrder (sha256 re-check on-ledger, Phase 10)
                               ▼
   solver :4100 ──close──► Round.CloseRound
                               │
                    ┌──────────▼───────────────────────────────────┐
                    │ Round.Clear (ONE atomic transaction)         │
                    │  1. recompute §8 (computeClearing) + assert  │ ◄─ verify-don't-trust (unchanged)
                    │  2. build Batch of Instructions from verified│
                    │     allocation (N buyers × M sellers @ p*)   │
                    │     netted (default) or gross legs           │
                    │  3. allocate → approve → SETTLE (finality)   │ ◄─ Holding transfers, atomic
                    │     assert Σdelivered=Σreceived per instrument│
                    │  4. per-desk TradeConfirmation (observer=desk)│
                    └──────────┬───────────────────────────────────┘
                               ▼
   Topology metadata endpoint (credential-free) ──► 07 TopologyView (atomic-settle span)
   per-desk FillCard (own fill only) ──► /join guest + 02/05 desks
```

### Recommended Project Structure (additive)
```
daml/Umbra/
├── Instrument.daml   # NEW: BONDX/USDCx instrument (implements MetadataV1); InstrumentId key
├── Holding.daml      # NEW: per-desk Holding (implements HoldingV1); replaces Asset in settlement
├── Settlement.daml   # NEW: Batch + Instruction (allocate→approve→settle finality)
├── Compliance.daml   # NEW: DeskEligibility (key (operator,desk)) + issuance choice
├── Auction.daml      # EDIT: Round.Clear settlement legs → Batch; drop single-buyer guard; add conservation asserts; cashInstrument param
├── Roles.daml        # EDIT: SubmitOrder/CommitOrder gain the DeskEligibility fetchByKey gate
├── Setup.daml        # EDIT: seed holdings (not Asset); seed A/B/C/guest eligibility; multi-buyer golden seed
├── Clearing.daml     # UNCHANGED (§8 math already multi-buyer-general)
└── Tests.daml        # EDIT: migrate seeds; ADD multi-buyer golden + ineligible-party negative test

solver/src/
├── ledger.ts         # EDIT: settle() gathers Holding cids + builds the Batch submission
├── auction.ts        # UNCHANGED math; ADD mirrored multi-buyer golden fixture + netLegs mirror
├── settlement.ts     # NEW (optional): pure netLegs/grossLegs for the viz, mirrored Daml⇄TS
├── topology.ts       # NEW: party→participant probe (per-participant /v2/parties isLocal)
└── api.ts            # EDIT: + GET /round/:id/topology (credential-free), guest onboarding endpoint

web/src/
├── views/TopologyView.tsx   # NEW (view 07)
├── views/JoinView.tsx       # NEW (/join mobile route)
├── components/QrJoin.tsx     # NEW (SVG QR + honesty label)
├── components/TopologyNode.tsx  # NEW
└── views/SettlementView.tsx  # EDIT: Batch sub-label, finality grammar, netting toggle, provenance tag, token-agnostic symbol, guest row
```

### Pattern 1: CN Token Standard interface conformance on an in-repo Holding
**What:** in-repo templates that `implements` the standard interface, so provenance is honestly `CN TOKEN STANDARD`.
**When to use:** DFIN-01 primary path.
```daml
-- Source pattern: docs.sync.global token_standard (Splice.Api.Token.HoldingV1)
-- The interface DAR is a data-dependency; the template is Umbra's own.
template Holding
  with
    operator   : Party      -- custodian/registry
    owner      : Party
    instrument : InstrumentId  -- {issuer, id} — token-agnostic (DFIN-03)
    amount     : Decimal
    lock       : Optional Lock -- Phase-10 bond lock migrates here
  where
    signatory operator
    observer owner
    interface instance HoldingV1.Holding for Holding where
      view = HoldingV1.HoldingView with owner; instrumentId = instrument; amount; ...
```

### Pattern 2: Batch / Instruction allocate → approve → settle (explicit finality)
**What:** the settlement primitive replacing `Asset` Split/Reassign legs; atomic = one transaction.
**When to use:** `Round.Clear` step 2, DFIN-01/02.
```daml
-- Faithful Daml-Finance settlement pattern (also expressible via AllocationV1).
data Instruction = Instruction with
    sender     : Party
    receiver   : Party
    instrument : InstrumentId
    amount     : Decimal
  deriving (Eq, Show)

-- Inside Round.Clear, AFTER the §8 recompute+assert backstop:
--   build [Instruction] from the VERIFIED allocation at p* (netted by default),
--   then execute each as a Holding transfer in THIS transaction (all-or-nothing).
--   Explicit finality = these transfers committing together.
settleBatch : Party -> [Instruction] -> [(Party, InstrumentId, ContractId Holding)] -> Update ()
```

### Pattern 3: On-ledger eligibility gate (COMP-01, ERC-3643 analog)
**What:** `fetchByKey` a per-desk credential and `assertMsg` its flags inside the order/holding choices.
```daml
-- Source: standard Daml keyed-lookup gate; operator authority present in the choice.
template DeskEligibility
  with
    operator      : Party
    compliance    : Party      -- may == operator for the MVP stub
    desk          : Party
    accredited    : Bool
    jurisdiction  : Text
    sanctionsClear : Bool
  where
    signatory operator, compliance
    observer desk
    key (operator, desk) : (Party, Party)
    maintainer key._1

-- In Venue.SubmitOrder / CommitOrder (controller desk; operator co-signs via Venue signatory):
    (_, elig) <- fetchByKey @DeskEligibility (operator, desk)
    assertMsg "desk not eligible (accreditation/jurisdiction/sanctions)"
      (elig.accredited && elig.sanctionsClear)
```
**Note:** enforce at holding issuance too — the mint/transfer choice does the same `fetchByKey` on the receiving owner.

### Anti-Patterns to Avoid
- **Claiming "Daml Finance" when the library isn't running.** Provenance tag must read `CN TOKEN STANDARD (CIP-0056)` or `DAML-FINANCE-PATTERN (IN-REPO)` — never `DAML FINANCE`. (HARD honesty label per UI-SPEC.)
- **Adding LF-1.17 daml-finance DARs as data-dependencies.** They will fail vetting on the LF-2.1 participants — do not attempt as the "real first" try; the real-first try is the CN Token Standard.
- **Enforcing eligibility in render logic.** Rejection must be an on-ledger `fetchByKey`/`assertMsg` failure, rendered verbatim (UI-SPEC error contract).
- **Embedding the guest token in the QR payload.** QR carries only the `/join` URL + roundId; the scoped token is delivered server-side to `/join`.
- **Changing `computeClearing` for multi-buyer.** It is already general — DFIN-02 is a *settlement*-leg change plus a new test, not a math change. A math edit would risk the §4 canary for no reason.
- **A contract key on `Holding`.** Same DuplicateKey risk that D7 rejected for `Asset` (splits create multiple same-key holdings). Keys are fine on `DeskEligibility` (one stable per desk) but NOT on `Holding`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token holding/transfer interface | A bespoke incompatible custody API | CN Token Standard `HoldingV1`/`TransferInstructionV1` interfaces (already on the box) | Real, vetted, wallet-interoperable; free interface conformance |
| Atomic multi-leg DvP | Sequenced per-leg transfers | One Daml transaction (Batch settle) | Atomicity IS Daml transactionality; sequencing breaks all-or-nothing |
| QR bitmap encoding | A raster QR from scratch | `qrcode.react` `QRCodeSVG` (or the reference SVG encoder if the gate fails) | QR spec (masking, EC, alignment) is deceptively hard; ink-on-paper needs SVG output |
| Party→participant hosting | Parsing Canton topology transactions | `GET /v2/parties` `isLocal` probed per participant | The v2 API exposes hosting via `isLocal`; the xnode scripts already do this |
| Per-party privacy | Filtering fills in the UI | Per-party JWT + signatory/observer sets | Privacy must be structural (PRIV-05); render filtering is forgeable |
| JWT minting | A new token library | `scripts/localnet/mint-jwt.mjs` (node:crypto HS256, `unsafe`/aud) | The dev-token pattern is established (D9); zero new deps |

**Key insight:** the "real" settlement library problem is already solved on this box by the CN Token Standard — the temptation to either force the incompatible Daml Finance DARs OR build a fully custom custody model both lose to reusing the vetted CIP-0056 interfaces with in-repo template instances.

## Runtime State Inventory

> This is a migration/refactor phase (retiring `Asset`, migrating holdings, relaxing invariants). Runtime state audit below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | LocalNet postgres (:55432 volume) persists the deployed DAR + parties + the seeded **R1 round, Orders, and `Asset` holdings** from prior phases (live-e2e-ops: "deployed DAR + parties + R1 SURVIVE"). After the Asset→Holding migration, the OLD `Asset` contracts remain in the ACS until re-seeded. | Re-run `deploy.mjs` (new DAR) + a NEW holdings seed; the old `Asset` ACS is superseded, not auto-migrated. Old `Asset` template stays in the DAR for history but off the settlement path. |
| **Live service config** | `daml/parties.json`, `web/src/tokens.json`, `scripts/.operator-token` are regenerated by `deploy.mjs`; **the guest desk (BankD) is NOT in any of these yet** — a NEW party+user+rights+token must be provisioned. `web/src/tokens.json` per-desk `base` field (single-node vs `/cn/*` xnode routing) governs which participant each desk (incl. guest) talks to. | Extend `deploy.mjs`/a new guest-onboard script to allocate BankD, grant rights, mint its scoped token into `tokens.json`; decide guest's participant (`base`). |
| **OS-registered state** | None. No Windows Task Scheduler / pm2 / systemd registration embeds settlement or party names (LocalNet is docker-compose, brought up by hand). | None — verified: settlement runs via `npx tsx` + docker compose, no OS-registered names. |
| **Secrets/env vars** | `solver/.env` (`JSON_API_URL`, `ANTHROPIC_API_KEY`), the HS256 `unsafe` LocalNet secret, `web/.env` (`VITE_SOLVER_URL=:4100`). No secret name changes from this phase; the guest token is minted with the SAME `unsafe`/aud secret. | None to rename. Guest token uses the existing minting secret; the `.env` set is unchanged. |
| **Build artifacts** | The generated bindings **`@daml.js/umbra-0.1.0`** (in `web/daml.js/`) are committed and MUST be regenerated after any template change (new `Holding`/`Instrument`/`DeskEligibility`, changed `Round.Clear` signature) — the fresh-clone invariant (09-01 note 6e4bade). Stale bindings silently break the frontend decode. | Run `daml codegen js` and COMMIT the regenerated `web/daml.js/` in lockstep with the Daml change (established every-template-change step). |

**The canonical question — after every repo file is updated, what runtime state still holds the old shape?** The **LocalNet postgres volume** holds old `Asset` holdings + the seeded R1; these are superseded by a fresh `deploy.mjs` + holdings re-seed (not silently migrated). The **guest party** does not exist yet and must be provisioned at the node-admin tier. The **generated JS bindings** must be regenerated+committed or the frontend breaks.

## Common Pitfalls

### Pitfall 1: Attempting the real Daml Finance DARs as a "real first" spike
**What goes wrong:** `daml build` with `data-dependencies: [daml-finance-*.dar]` fails (LF 1.17 vs 2.1), burning phase budget on an impossible target.
**Why it happens:** the CONTEXT says "attempt real first," and Daml Finance is the named library — but its only artifacts are LF 1.17.
**How to avoid:** the "real first" attempt is the **CN Token Standard** (LF 2.1, on the box), not Daml Finance. Skip the Daml Finance DAR spike entirely; cite it only as the pattern origin.
**Warning signs:** any `daml.yaml` line referencing a `daml-finance-*.dar`.

### Pitfall 2: The Phase-10 bond lock breaks when `Asset` is retired
**What goes wrong:** `OrderCommitment.bondCid : ContractId Asset` and `ForfeitBond`'s `Reassign` reference the retired `Asset`. Migrating holdings to `Holding` without re-expressing the operator-custody LOCK loses the commit/forfeit guarantee (D12).
**Why it happens:** the bond is the desk's OWN USDCx `Asset`, locked because every `Asset` choice is `controller operator`. A `Holding` needs an equivalent lock (a `lock` field / the CN Token Standard holding `lock`).
**How to avoid:** migrate `bondCid` to `ContractId Holding`; give `Holding` a lock mechanism (operator-custody or the standard's `Lock`); `ForfeitBond` transfers the locked cash Holding to the operator. Keep `RevealOrder`'s sha256 re-check (DA.Crypto.Text) byte-unchanged — only the bond primitive type changes.
**Warning signs:** `test_commit_reveal_clears_at_100` compiles but the bond can be moved during the window.

### Pitfall 3: `fetchByKey` authorization for the eligibility gate
**What goes wrong:** `fetchByKey @DeskEligibility (operator, desk)` inside a `controller desk` choice fails "requires authorization from operator" if operator authority isn't present.
**Why it happens:** keyed fetch needs the maintainer (operator) to authorize the lookup.
**How to avoid:** it works in `Venue.SubmitOrder`/`CommitOrder` because **Venue is `signatory operator`** — operator authority co-flows into the choice (same reason `SubmitOrder` can create an operator-signed `Order`). Verified from `Roles.daml`. For the holding-issuance gate, the mint choice is operator-authority anyway. Add a test that an eligible desk's submit succeeds AND an ineligible desk's submit fails on-ledger.
**Warning signs:** the gate compiles but only rejects at the Script tier, not inside the choice.

### Pitfall 4: v2 wire encoding for new Holding/Instrument fields
**What goes wrong:** the solver's `settle()` sends/reads Decimal amounts and `InstrumentId` tuples wrong.
**Why it happens:** JSON Ledger API v2 returns Int/Decimal as **strings** (zero-padded to scale, e.g. `"1000.0000000000"`), tuples as `{_1,_2}`, templateIds as `#umbra:Module:Entity` (live-e2e-ops, D8).
**How to avoid:** coerce amounts with `Number()`; encode `InstrumentId` as its record shape; reuse the existing `ledger.ts` v2 conventions (proven in D10). The new Holding cids gather exactly like the old Asset cids in `settle()`.
**Warning signs:** `NaN` amounts or `PACKAGE_SELECTION_FAILED`/decode errors in a fresh settle.

### Pitfall 5: Netting must conserve AND preserve each desk's economics
**What goes wrong:** net-per-party legs zero out a desk's fill or leak cash/assets.
**Why it happens:** naive netting nets across instruments or across parties incorrectly.
**How to avoid:** net **per (party, instrument)** only: `netAmount(party, inst) = Σ receives − Σ delivers`. Assert `Σ over parties netAmount(·, inst) == 0` for every instrument (conservation) on-ledger. Keep gross legs derivable for the viz. Mirror `netLegs` Daml⇄TS with a 2×2 golden fixture.
**Warning signs:** the new multi-buyer golden clears but post-settle balances don't sum to the pre-settle totals.

### Pitfall 6: §4 must stay a PURE REDUCTION of the generalized path
**What goes wrong:** generalizing `Round.Clear` changes the §4 balances or price.
**Why it happens:** removing the single-buyer guard and rebuilding legs can perturb the single-buyer case.
**How to avoid:** §4 stays single-buyer-shaped (A sole buyer); the generalized batch with one buyer must produce the identical A↔B 8@100 / A↔C 2@100 legs and $100.00. Run `test_clears_at_100` + the TS §4 test after every change (continuous canary). Add the 2×2 golden SEPARATELY.
**Warning signs:** `test_clears_at_100` or `test_settled_balances` goes red — revert, don't accommodate.

### Pitfall 7: "Three nodes" over-claim on single-operator LocalNet
**What goes wrong:** the topology view implies 3 independent institutions.
**Why it happens:** the LocalNet participants are all in ONE operator trust domain.
**How to avoid:** the HARD honesty badge `DEMO-REAL · SINGLE-OPERATOR LOCALNET` is non-removable. Be precise: with `xnode-up.mjs` the desks ARE hosted on genuinely different participants (:2975/:3975/:4975) and the cross-node co-signed settle is REAL (D11, `xnode-moneyshot.mjs` settles to §4 balances across nodes) — the honest limit is the single trust domain, not a single participant. Without xnode (default seed) all desks map to one participant → the `SAME PARTICIPANT (LOCALNET)` per-node caption fires.
**Warning signs:** the badge is conditionally hidden, or the view claims institutional independence.

## Code Examples

### Removing the single-buyer guard + conservation asserts (DFIN-02)
```daml
-- REPLACE Auction.daml:379-382 (the fundedBuyers/abort block) with a
-- general Batch build. computeClearing is UNCHANGED (already multi-buyer).
-- After the §8 recompute+assert backstop (steps 0-1 unchanged):
let legs = buildInstructions priceDec allocations cashInstrument bondInstrument  -- netted default
-- Conservation, on-ledger, fail-loud (replaces the single-buyer shortcut):
forA_ instruments $ \inst ->
  assertMsg ("conservation violated for " <> show inst)
    (sum [ l.amount | l <- legs, l.receiver /= l.sender, sameInst l inst, isReceive l ]
     == sum [ l.amount | l <- legs, sameInst l inst, isDeliver l ])
-- then execute each Instruction as a Holding transfer in THIS transaction.
```

### Party→participant hosting probe (VIZ-03, credential-free solver endpoint)
```javascript
// solver/src/topology.ts — reuses the xnode-up.mjs isLocal pattern.
const PARTICIPANTS = { 'app-user': 'http://localhost:2975',
                       'app-provider': 'http://localhost:3975',
                       'sv': 'http://localhost:4975' }
// For each party, the participant where GET /v2/parties returns isLocal:true is its host.
async function hostingMap(admin) {
  const map = {}
  for (const [pid, base] of Object.entries(PARTICIPANTS)) {
    const { partyDetails } = await api(base, admin, 'GET', '/v2/parties')
    for (const d of partyDetails) if (d.isLocal) (map[d.party] ??= []).push(pid)
  }
  return map  // all desks → one pid ⇒ demo-real 'SAME PARTICIPANT'; distributed ⇒ real multi-node
}
```

### Guest party onboarding (WOW-07) — existing pattern
```javascript
// Mirrors xnode-up.mjs: allocate → user → rights, then mint scoped token.
await api(base, admin, 'POST', '/v2/parties', { partyIdHint: 'bankD', identityProviderId: '' })
await api(base, admin, 'POST', '/v2/users', { user: { id: 'umbra-guest', primaryParty: guest, ... } })
await api(base, admin, 'POST', `/v2/users/umbra-guest/rights`, { rights: [{ kind: { CanActAs: { party: guest } } }] })
// Then: node scripts/localnet/mint-jwt.mjs umbra-guest  → scoped HS256 token → /join (never in the QR)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Daml Finance (`daml-finance-*`) on the 2.x line | CN Token Standard (CIP-0056, `splice-api-token-*`) on Canton 3.x | Canton 3.x / Splice era (2024-2025) | Daml Finance is LF-1.17/2.x-only; the Canton-native settlement standard for 3.x is CIP-0056 |
| Operator-custody `Asset` Split/Merge/Reassign | Holding + Batch/Instruction allocate→settle | This phase (DFIN-01) | Multi-party authority + explicit finality; atomic multi-leg in one transaction |
| Single-funded-buyer settlement invariant | N buyers × M sellers with conservation asserts + netting | This phase (DFIN-02) | Realistic batch; on-ledger conservation replaces the shortcut |

**Deprecated/outdated:**
- **Daml Finance for Canton 3.x:** not available — pinned to SDK 2.10.0 / LF 1.17. Use CIP-0056.
- **`daml start` / HTTP JSON API v1 / `@daml/react`:** superseded by JSON Ledger API v2 (D8/D10); the frontend uses the `v2react.tsx` shim.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The CN Token Standard DARs on this box (`splice-api-token-*-v1-1.0.0.dar`) can be added as `data-dependencies` to Umbra's DAR and their interfaces implemented by in-repo templates on 3.4.11 | Standard Stack / Pattern 1 | If the interface signatures need a registry-only context, the hybrid degrades to the plain in-repo layer labeled `DAML-FINANCE-PATTERN (IN-REPO)` — still ships, honestly. Verified analog: cn-quickstart `licensing` builds against these DARs on 3.4.11. |
| A2 | Implementing full `AllocationV1`/`AllocationInstructionV1` DvP conformance is heavier than phase budget; the reliable path is in-repo Batch/Instruction (optionally implementing `HoldingV1`/`MetadataV1` only) | Summary / Alternatives | If wrong (it's cheap), upgrade to full-standard DvP — strictly better provenance. |
| A3 | `qrcode.react@4.2.0` emits stylable SVG via `QRCodeSVG` and runs on React 18 | Supporting stack | If the gate/compat fails, the hand-rolled SVG encoder fallback (already the UI-SPEC honest fallback) ships. |
| A4 | `GET /v2/parties` `isLocal` per participant is sufficient to build the party→participant hosting map (no Canton admin gRPC needed) | VIZ-03 pattern | If `isLocal` is insufficient, fall back to the labeled single-participant demo-real view (still meets the honest-limitation contract). Verified: `xnode-up.mjs`/`probe-xnode.mjs` already use `isLocal` this way. |
| A5 | The Phase-10 bond LOCK can be re-expressed on a cash `Holding` (operator-custody or standard `Lock`) preserving commit/forfeit | Pitfall 2 | If holding-lock semantics differ, keep the bond as an operator-custody Holding with all-choices-controller-operator (mirrors the current Asset lock exactly). |

**All settlement-library realness claims are VERIFIED or CITED — the pivotal DFIN-01 verdict is not assumed.**

## Open Questions

1. **Does the operator-issued in-repo `Holding` need to also satisfy the CN Token Standard's registry/factory expectations to be wallet-interoperable?**
   - What we know: the interfaces (`HoldingV1`, `MetadataV1`) can be implemented by any template; the DARs are vetted.
   - What's unclear: whether Amulet/wallet tooling would recognize an Umbra-issued instrument without a registry participant (irrelevant to §4 settlement, relevant to a "real wallet" claim).
   - Recommendation: implement the interfaces for provenance; do NOT claim wallet interoperability — that needs a registry app (Track B / Phase 12). Label accordingly.

2. **Guest desk participant placement (which node hosts BankD)?**
   - What we know: `tokens.json` `base` routes each desk to a participant; xnode distributes A/B/C across :2975/:4975/:3975.
   - What's unclear: whether the guest should be a 4th resident (e.g. co-hosted on app-user) or its own — LocalNet has 3 participants, so a genuine 4th node isn't available.
   - Recommendation: host the guest on an existing participant (co-resident) and label it honestly in the topology; a genuine 4th validator is the recorded limitation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Daml SDK | build/test | ✓ (Bash PATH only) | 3.4.11 | — (2.10.4 also installed, wrong line) |
| Canton LocalNet (cn-quickstart) | live settle/topology | ✓ (docker, persists) | Canton 3.4.8 / Splice 0.5.3 | — |
| JSON Ledger API v2 | solver/web | ✓ | :2975/:3975/:4975 → 3.4.8 | — |
| CN Token Standard DARs | DFIN-01 interfaces | ✓ (in cn-quickstart/daml/dars) | `*-v1-1.0.0` | in-repo faithful layer |
| Daml Finance DARs | DFIN-01 (named lib) | ✗ (LF 1.17 only) | 2.10.0-line | **CN Token Standard / in-repo layer** |
| `qrcode.react` | WOW-07 QR | ✗ (not installed) | install `4.2.0` | hand-rolled SVG encoder |
| solver runtime | settle/topology | ✓ | Node 20, `npx tsx` :4100 | — |

**Missing dependencies with no fallback:** none blocking.
**Missing dependencies with fallback:** Daml Finance (→ CN Token Standard / in-repo layer); `qrcode.react` (→ hand-rolled SVG); genuine 3rd-party validators for true cross-node privacy (→ demo-real, recorded limitation).

## Validation Architecture

> nyquist_validation enabled. Test framework detected below.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Daml Script (`daml test`) + Vitest 2.x (solver) + Vitest 2.x (web, node-env) |
| Config file | `daml/daml.yaml`; `solver/` vitest (package.json); `web/` vitest (node-env, `.tsx` included per 10-10) |
| Quick run command | `cd solver && npx vitest run` (TS golden + §4) |
| Full suite command | Bash: `daml test` (in `daml/`) + `cd solver && npx vitest run` + `cd web && npm run build && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DFIN-01 | §4 clears $100.00 + settles atomically through Holding/Batch | daml | `daml test` (`test_commit_reveal_clears_at_100`, `test_settled_balances`) | ✅ (migrate seeds) |
| DFIN-01 | Any failing leg rolls back (atomicity) | daml | `daml test` (`test_atomicity` — adapt to Holding) | ✅ (adapt) |
| DFIN-02 | Multi-buyer 2×2 golden clears at one p*, conserves | daml + ts | `daml test` (`test_multibuyer_golden`) + `cd solver && npx vitest run` (mirror) | ❌ Wave 0 |
| DFIN-02 | §4 stays a pure reduction (single-buyer) | daml + ts | `daml test` (`test_clears_at_100`) + solver §4 test | ✅ |
| DFIN-02 | Netting conserves + preserves economics | daml + ts | `daml test` (`test_netting_conserves`) + `settlement.test.ts` netLegs | ❌ Wave 0 |
| DFIN-03 | Cash instrument swap doesn't change Round.Clear | daml | `daml test` (`test_cash_instrument_agnostic` — settle with a non-USDCx instrument) | ❌ Wave 0 |
| COMP-01 | Ineligible party rejected on-ledger at Order creation | daml | `daml test` (`test_ineligible_submit_rejected` via `submitMustFail`) | ❌ Wave 0 |
| COMP-01 | Ineligible party rejected at holding issuance | daml | `daml test` (`test_ineligible_holding_rejected`) | ❌ Wave 0 |
| COMP-01 | Eligible A/B/C/guest still clear $100.00 | daml | `daml test` (`test_clears_at_100` with eligibility seeded) | ✅ (extend seed) |
| WOW-07 | Guest submits + sees only own fill (structural) | daml + manual | `daml test` (`test_privacy_guest_fill`) + live QR-on-phone = **live UAT** | ❌ Wave 0 (+ UAT) |
| VIZ-03 | Party→participant hosting map correct | ts + manual | `topology.test.ts` (stubbed /v2/parties) + live 3-node = **live UAT** | ❌ Wave 0 (+ UAT) |
| — | Daml⇄TS parity (multi-buyer + netting) | ts | golden parity fixtures mirrored both planes | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd solver && npx vitest run` (fast §8 + settlement mirrors) — must stay green (§4 continuous canary).
- **Per wave merge:** `daml test` + full solver vitest + `web` build + vitest.
- **Phase gate:** full suite green + the live-UAT checklist (guest QR on a real phone, live 3-node xnode settle) enumerated for human verification before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `daml/Umbra/Tests.daml` — add `test_multibuyer_golden`, `test_netting_conserves`, `test_cash_instrument_agnostic`, `test_ineligible_submit_rejected`, `test_ineligible_holding_rejected`, `test_privacy_guest_fill`; adapt `test_atomicity`/`test_settled_balances` to Holding.
- [ ] `solver/src/settlement.test.ts` — `netLegs`/`grossLegs` mirror + 2×2 golden (Daml⇄TS parity).
- [ ] `solver/src/topology.test.ts` — hosting-map from stubbed per-participant `/v2/parties`.
- [ ] `web/src/lib/*.test.ts` — topology node/edge derivation + QR payload (no-secret) assertions.
- [ ] Regenerate + commit `web/daml.js/` after the template changes (fresh-clone invariant).

## Security Domain

> security_enforcement enabled, ASVS level 1.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Guest scoped HS256 dev JWT (`unsafe`/aud); honest label that production is OIDC (Phase 12); token NEVER in the QR or web source |
| V3 Session Management | partial | Per-party token = per-session actAs scope; no shared token |
| V4 Access Control | yes | On-ledger COMP-01 gate (`DeskEligibility` fetchByKey); per-party privacy (signatory/observer); eligibility rejection structural not render |
| V5 Input Validation | yes | zod on new solver endpoints (guest onboarding, topology); Daml `ensure`/`assertMsg` on Holding/Instrument/eligibility |
| V6 Cryptography | yes (unchanged) | Phase-10 DA.Crypto.Text sha256 commit-reveal preserved; bond lock migrated, hash re-check byte-unchanged |
| V14 Config/Secrets | yes | `ANTHROPIC_API_KEY`/operator token never in browser; guest token minted server-side; `unsafe` HMAC is dev-only (D5/D9) |

### Known Threat Patterns for {Daml 3.x / Canton LocalNet / JSON API v2}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Ineligible party submits/holds (compliance bypass) | Elevation/Tampering | On-ledger `fetchByKey @DeskEligibility` + `assertMsg` at BOTH order creation and holding issuance; negative test |
| Guest token leakage via QR | Information Disclosure | QR encodes only URL+roundId; token delivered server-side to `/join`; secret-sweep test |
| Cross-desk order/fill visibility | Information Disclosure | Structural per-party signatory/observer; guest reuses the same model; `test_privacy_guest_fill` |
| Non-atomic settle / partial leg | Tampering | One-transaction Batch settle; conservation asserts fail-loud; `test_atomicity` |
| Over-claiming institutional independence | Repudiation/Spoofing (trust) | HARD non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge + honest provenance tag |
| Solver-proposed bad allocation | Tampering | Unchanged Round.Clear recompute-§8-and-assert backstop (verify-don't-trust) runs BEFORE the batch build |

`security_block_on: high` — the COMP-01 on-ledger gate and the atomic-settle conservation asserts are the high-severity controls; both are ledger-enforced and covered by negative tests.

## Sources

### Primary (HIGH confidence)
- `daml/daml.yaml` (sdk-version 3.4.11), `daml/Umbra/{Auction,Asset,Setup,Roles,Clearing}.daml`, `DECISIONS.md` D7–D12, `.planning/STATE.md` — on-box code + decisions (VERIFIED this session)
- `cn-quickstart/quickstart/daml/dars/` listing + `daml/licensing/daml.yaml` — CN Token Standard DARs present + used as data-dependencies on SDK 3.4.11 (VERIFIED on this box)
- `scripts/localnet/{probe-xnode,xnode-up,xnode-moneyshot,deploy}.mjs` — `isLocal` party-hosting probe + guest-onboarding pattern (VERIFIED on this box)
- live-e2e-ops memory — v2 wire encoding, ports, DAR vetting, postgres persistence (dated, cross-checked with DECISIONS.md)
- npm `qrcode.react@4.2.0` — version/license/downloads (VERIFIED: `npm view` + api.npmjs.org, 2026-07-10)

### Secondary (MEDIUM confidence)
- https://github.com/digital-asset/daml-finance/releases — latest = Settlement.V4/4.0.0 on SDK 2.10.0 (CITED, fetched 2026-07-10)
- https://docs.daml.com/daml-finance — "SCU compatible by relying on Daml SDK 2.10.0 and Daml LF 1.17" (CITED)
- https://docs.sync.global/app_dev/token_standard/index.html — CN Token Standard interfaces + allocate→settle DvP (CITED)
- https://www.canton.network/blog/what-is-cip-56-a-guide-to-cantons-token-standard — CIP-56 overview (CITED)
- https://docs.digitalasset.com/build/3.3/quickstart — Splice/CN quickstart on Daml 3.x (CITED)

### Tertiary (LOW confidence)
- General Canton 3.4 / Splice 0.5.0 release notes (blog.digitalasset.com) — version alignment only

## Metadata

**Confidence breakdown:**
- Settlement-library verdict (DFIN-01): HIGH — Daml Finance LF-1.17 vs Umbra LF-2.1 is a hard incompatibility, cross-checked against the on-box CN Token Standard DARs and cn-quickstart's own usage.
- Multi-party/netting/token-agnostic (DFIN-02/03): HIGH — `computeClearing` is already general; the change is settlement-leg + tests; §4 canary discipline is established.
- COMP-01 gate: HIGH — standard keyed-fetch gate; operator authority present (Venue signatory verified in Roles.daml).
- Guest/QR (WOW-07): HIGH — reuses proven per-party token + xnode onboarding; qrcode.react vetted.
- Topology (VIZ-03): MEDIUM-HIGH — `isLocal` probe is proven; the honest demo-real boundary is well-defined; live 3-node/phone are UAT.

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 (30 days; the DFIN-01 verdict is stable — a Daml Finance 3.x release would be the only invalidator; watch github.com/digital-asset/daml-finance/releases).

## RESEARCH COMPLETE

**Phase:** 11 - Settlement & Institutional Grade
**Confidence:** HIGH (pivotal DFIN-01 verdict is verified/cited, not assumed)

### Key Findings
- **Real Daml Finance does NOT build on SDK 3.4.11** — it is pinned to SDK 2.10.0 / LF 1.17; Umbra runs LF 2.1. No 3.x release exists. Do not attempt its DARs as data-dependencies.
- **The real, on-the-correct-line settlement standard is already on the box:** the CN Token Standard (CIP-0056) `splice-api-token-*` DARs, vetted on all three LocalNet participants, providing Holding/Allocation/AllocationInstruction atomic-DvP. Recommended path: in-repo `Holding`/`Instrument` templates that IMPLEMENT the CN interfaces (real conformance + guaranteed build); provenance tag `CN TOKEN STANDARD (CIP-0056)`, never `DAML FINANCE`. Reliable fallback: plain in-repo layer labeled `DAML-FINANCE-PATTERN (IN-REPO)`.
- **DFIN-02/03 are settlement-leg + test changes, not clearing-math changes** — `computeClearing` is already multi-buyer-general; §4 stays a pure reduction; add a 2×2 golden mirrored Daml⇄TS. Netting nets per (party, instrument) with on-ledger conservation asserts replacing the deleted single-buyer guard.
- **COMP-01** = `DeskEligibility` keyed `(operator, desk)` + `fetchByKey`/`assertMsg` at Order creation and holding issuance; operator authority is present because Venue is `signatory operator`.
- **WOW-07/VIZ-03** reuse proven machinery: guest party via `xnode-up.mjs` onboarding + `mint-jwt.mjs` scoped token (never in the QR); topology via `GET /v2/parties` `isLocal` probed per participant. Phase-10 commit-reveal + §8 stay intact; the only Phase-10 impact is migrating the bond LOCK from an `Asset` to a cash `Holding`.

### File Created
`.planning/phases/11-settlement-institutional-grade/11-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack (DFIN-01) | HIGH | Daml Finance LF-1.17 incompatibility verified/cited; CN Token Standard verified on box |
| Architecture (DFIN-02/03, COMP-01) | HIGH | Settlement-leg change; clearing math unchanged; gate authorization verified in Roles.daml |
| Pitfalls | HIGH | Grounded in on-box code, D7/D12 decisions, and v2 wire specifics |
| Topology (VIZ-03) | MEDIUM-HIGH | isLocal probe proven; live 3-node = honest UAT boundary |

### Open Questions
- Guest desk participant placement (co-host on an existing participant; no genuine 4th validator on LocalNet).
- Whether full `AllocationV1`/`AllocationInstructionV1` DvP conformance fits phase budget (A2) — start with `HoldingV1`/`MetadataV1`, upgrade if cheap.

### Ready for Planning
Research complete. The planner should scope DFIN-01 as: (1) spike CN Token Standard interface implementation on an in-repo Holding; (2) if over-budget, ship the plain in-repo faithful layer — both honestly labeled, never claiming the Daml Finance library. §4 $100.00 canary and Daml⇄TS parity are the continuous gates.
