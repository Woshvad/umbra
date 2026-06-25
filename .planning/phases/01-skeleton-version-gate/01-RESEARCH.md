# Phase 1: Skeleton & Version Gate - Research

**Researched:** 2026-06-25
**Domain:** Daml SDK 2.10.x project skeleton — `daml.yaml` pinning, template/choice syntax, Daml Script setup, `daml start` + HTTP JSON API wiring, on Windows 11
**Confidence:** HIGH (core `daml start` behavior + daml.yaml fields verified against the digital-asset/daml `v2.10.0` source tree; npm peer deps verified against the live registry)

## Summary

Phase 1 is a **pure-Daml, no-npm-install** skeleton phase. It freezes the six templates from spec §7 with their exact field shapes, pins the SDK in `daml.yaml`, seeds the §4 world in `Setup.daml`, and gets `daml start` to compile + run the Canton sandbox with the HTTP JSON API on :7575. No clearing logic, no solver, no frontend, no package installs happen here.

The single most important ground-truth discovery: **in Daml 2.10.x, `daml start` runs a *Canton* sandbox, not the legacy in-memory sandbox.** This was verified by reading `daml-helper/src/DA/Daml/Helper/Start.hs` at tag `v2.10.0`. The exact `daml start` sequence is: `doBuild` → `doCodegen` (only for langs with a configured `output-directory`) → start Canton sandbox + upload DAR → run `init-script` via `daml script ... --wall-clock-time --ledger-host localhost --ledger-port <sandbox>` → optionally start Navigator → start JSON API with `json-api --ledger-host localhost --ledger-port <sandbox> --http-port 7575 --allow-insecure-tokens`. Two Windows-specific facts fall out of the same source: (1) the hot-reload key is **`r` + `Enter`** on Windows (just `r` elsewhere), and (2) party IDs come back as `hint::<fingerprint>` on the Canton sandbox, so they are **not predictable across restarts** and must be captured at allocation time.

**Primary recommendation:** Pin `sdk-version: 2.10.4`, lay out modules as `Asset.daml` / `Auction.daml` / `Roles.daml` / `Setup.daml` / `Tests.daml` under `daml/`, copy the spec §7 field shapes verbatim, give `Round.Clear` a compiling placeholder body that returns a frozen `ClearResult` record, and capture party IDs to `parties.json` via a **separate `daml script --output-file` invocation** run against the live sandbox (not via `init-script`, which `daml start` invokes without `--output-file`). Decimal literals must be written with an explicit decimal point (`5000.0`, not `5000`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**SDK & Version Gate (LEDG-04 — do this FIRST, before any other build work)**
- **Daml SDK 2.10.4** is the target line (latest stable 2.x; confirmed the newest non-3.x release). Install via the Windows SDK tarball; pin `sdk-version: 2.10.4` in `daml.yaml`.
- **API line: Daml 2.x HTTP JSON API on :7575** — the line `@daml/react`/`@daml/ledger@2.10.4` target. NOT the Daml 3.x / Canton 3.x JSON Ledger API v2 / cn-quickstart line (that is stretch §19).
- Record in `DECISIONS.md`: the detected/installed SDK version, the chosen 2.x HTTP JSON API line, and the React-18 `--legacy-peer-deps` note (the `@daml/react` peer dep wants React 16/17).
- Environment already present: Node 26.x, npm 11.x, JDK 21 (sandbox needs JDK 17+ ✓). `make` is NOT installed — defer the `Makefile` to Phase 7; use npm scripts / direct `daml`/`node` invocations for now.

**Daml data model (frozen — copy field shapes EXACTLY from spec §7)**
- Modules under `daml/Umbra/` per spec §7/§13: `Asset.daml`, `Auction.daml`, `Roles.daml`, `Setup.daml`, `Tests.daml`. Recommended grouping: `Asset` → `Asset.daml`; `Venue` (role contract) → `Roles.daml`; `Order`/`Round`/`RoundStats`/`TradeConfirmation` + `Side`/`OrderStatus`/`RoundStatus`/`Allocation` → `Auction.daml`. (Planner may adjust grouping but field shapes are fixed.)
- `Asset`: `signatory operator`, `observer owner`, `ensure quantity >= 0.0`; choices `Split`, `Merge`, `Reassign(newOwner)` under Operator authority alone (operator-custody MVP model).
- `Venue`: `signatory operator`, `observer desks`; `nonconsuming choice SubmitOrder` (controller desk) creating an `Order` signed by operator + desk.
- `Order`: `signatory operator, desk`; `ensure quantity > 0 && limit > 0.0`; `data Side = Buy | Sell`, `data OrderStatus = Sealed | Filled | PartiallyFilled | Unfilled`.
- `Round`: `signatory operator`, `observer desks`; `data RoundStatus = Open | Closed | Cleared | Settled`; choices `CloseRound` and `Clear` (with `clearingPrice : Decimal`, `allocations : [Allocation]`, controller operator). **Phase 1 freezes the `Clear` signature with a placeholder/compiling body; the real verify+DvP body lands in Phase 2.**
- `RoundStats`: `signatory operator`, `observer desks`, `sealedOrderCount : Int` (count only).
- `TradeConfirmation`: `signatory operator`, `observer desk` (visible only to that desk).
- `data Allocation = Allocation with desk : Party; side : Side; filledQty : Int`.

**Setup & fixture (spec §4 + §14)**
- `Setup.daml` allocates `Operator`, `BankA`, `BankB`, `BankC`; creates one `Venue{operator, desks=[A,B,C]}`; mints §4 holdings as `Asset`s: A→5,000 USDCx; B→20 BONDX + 1,000 USDCx; C→15 BONDX + 1,000 USDCx.
- Second script `RunCanonicalRound` submits the three §4 orders (A Buy 10 @≤101, B Sell 8 @≥99, C Sell 5 @≥100) — used by tests and as a one-command demo seed. (Its clearing assertion is exercised once Phase 2 implements `Clear`.)
- Expose party IDs/tokens to the frontend + solver by generating `parties.json` / `.env` entries (mechanism finalized in Phase 3 when JWTs are wired; Phase 1 just needs the allocation script + a place to write IDs).

**Repo scaffolding & hygiene**
- Layout per spec §13: `daml/`, `solver/`, `web/`, `scripts/`, plus root `README.md`, `DECISIONS.md`, `.env.example`. Phase 1 creates `daml/` fully; `solver/`+`web/` may be stubbed.
- `.gitignore` excludes `.env`, `.daml/`, `node_modules/`, `dist/`, `.dist/`, build artifacts, and the SDK download temp. `.env.example` ships per spec §15.
- **Commit the binding source inputs** now: `spec.md` and `Umbra design/` (currently untracked) become tracked.

### Claude's Discretion
- Exact module grouping within the fixed field shapes; placeholder body for `Clear`; `daml.yaml` `name`/`version`/dependency list; ordering of Setup operations; README skeleton wording.

### Deferred Ideas (OUT OF SCOPE)
- `Round.Clear` verify+settlement body, the §8 algorithm, atomicity/conservation checks → Phase 2.
- Per-party JWT token generation + party-scoped JSON API auth → Phase 3.
- `Makefile` + `make demo` orchestration → Phase 7 (and `make` must be installed first).
- Daml Finance holdings, Canton LocalNet deploy → stretch (§19), post-Phase-7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEDG-01 | Daml project compiles with templates `Asset`, `Venue`, `Order`, `Round`, `RoundStats`, `TradeConfirmation`; `daml start` runs sandbox + HTTP JSON API on :7575 | "Version Gate Procedure", "`daml start` Wiring", "Standard Stack" — exact `daml start` step sequence + daml.yaml verified from `Start.hs@v2.10.0` |
| LEDG-02 | `Setup.daml` allocates Operator/BankA/BankB/BankC + mints §4 holdings; party IDs/tokens written to a generated `parties.json`/`.env` | "Daml Script for Setup.daml", "parties.json Export Mechanism" — `allocatePartyWithHint`, `--output-file`, return-record-of-PartyIds pattern |
| LEDG-03 | `Asset` operator-custodied (signatory operator, observer owner), Split/Merge/Reassign used only by Operator | "Template & Choice Syntax → Asset" — operator-authority choice bodies, compiling examples |
| LEDG-04 | Detect installed SDK, pin in `daml.yaml`, record version + API line in `DECISIONS.md` before any other build work | "Version Gate Procedure" — `daml version`, `sdk-version` pin, DECISIONS.md content |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tokenized holdings (Asset) | Database / Ledger (Daml) | — | Persistence + authority + privacy are ledger concerns; operator is sole signatory |
| Order submission gate (Venue) | Ledger (Daml) | — | Multi-party authority (operator + desk) only expressible on-ledger |
| Round lifecycle / status (Round, RoundStats) | Ledger (Daml) | Solver service (P4, drives it) | Status is on-ledger state; the solver *automates* transitions but the truth lives in the contract |
| Fill receipts (TradeConfirmation) | Ledger (Daml) | — | Per-desk private receipt; disclosure enforced by observer |
| Party allocation + seeding (Setup) | Ledger (Daml Script) | Node post-step (P3) reads `parties.json` | Allocation is a ledger admin op; export is a dev-tooling concern |
| Version gate (SDK pin) | Build tooling (`daml.yaml`) | Docs (`DECISIONS.md`) | Pure config; no runtime tier |

**Phase-1 note:** every capability above lands in the **Ledger (Daml)** tier. There is no client/API/CDN tier work in this phase. The solver-service and frontend tiers are stubbed only.

## Standard Stack

### Core (this phase)
| Tool / Library | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Daml SDK | `2.10.4` | Compiler (`damlc`), Canton sandbox, HTTP JSON API, Daml Script runner, `daml start` | Latest stable 2.x; one-command dev loop; the API line `@daml/*@2.10.4` targets [CITED: github.com/digital-asset/daml v2.10.0 source] |
| `daml-prim` | bundled w/ SDK | Daml primitives (always present) | Implicit dependency in every project [VERIFIED: daml.yaml convention] |
| `daml-stdlib` | bundled w/ SDK | Standard library (`DA.*` modules, `Decimal`, lists, `getTime`) | Standard dependency [VERIFIED] |
| `daml-script` | bundled w/ SDK | `Script` monad, `allocateParty`, `submit`, `assertMsg` in scripts | Required for `Setup.daml` + `Tests.daml` [VERIFIED: daml-script source @v2.10.0] |
| JDK | **21 (present)** | Runs the Canton sandbox JVM | Sandbox needs JDK 17+; 21 satisfies [VERIFIED: env init] |
| Node | **26.x (present)** | Not used in P1 (downstream codegen consumer) | — |

### Supporting (downstream — documented for the freeze, NOT installed in P1)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@daml/react` | `2.10.4` | React hooks over JSON API | Phase 3 frontend [VERIFIED: npm registry] |
| `@daml/ledger` | `2.10.4` | JS/TS Ledger client over HTTP JSON API | Phase 3 + solver (P4) [VERIFIED: npm registry] |
| `@daml/types` | `2.10.4` | Party/Decimal/ContractId TS mappings | Transitive dep [VERIFIED: npm registry, version 2.10.4 published] |
| `@daml.js/umbra` | generated | Project-specific bindings from `daml codegen js` | Phase 3/4 — produced FROM the templates frozen here |
| `@anthropic-ai/sdk` | `0.106.0` | Claude client (server-side only) | Phase 5 [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `daml start` Canton sandbox | `cn-quickstart` Canton LocalNet (Daml 3.x) | Multi-GB Docker, different JSON Ledger API v2 that `@daml/react` does not target — stretch §19 only |
| Operator-custody `Asset` | Daml Finance Holding/Instrument/Account | Adds multi-party authority + allocate/approve complexity — stretch §19 only |
| `allocatePartyWithHint` | bare `allocateParty` | Hint makes party IDs human-readable (`bankA::<fp>`); still not stable across Canton restarts but easier to read/debug |

**Installation:** None for Phase 1. The Daml SDK is installed out-of-band (tarball, already in progress per the orchestrator). `daml.yaml` declares `daml-prim`, `daml-stdlib`, `daml-script` as dependencies; these are bundled with the SDK and resolved automatically — no `npm install` / no package download.

**Version verification (run as the FIRST build step — the gate):**
```bash
daml version          # confirm 2.10.4 is the selected/default SDK
```
Verified package facts (live npm registry, 2026-06-25):
- `@daml/react@2.10.4` peerDependencies: `{ "react": "^16.12.0 || ^17.0.0" }` → **does not list React 18** → install downstream with `--legacy-peer-deps` (or npm `overrides`). [VERIFIED: registry.npmjs.org/@daml/react/2.10.4]
- `@daml/react@2.10.4` deps: `@daml/ledger@2.10.4`, `@daml/types@2.10.4` (pin all three identical). [VERIFIED]
- `@anthropic-ai/sdk@0.106.0` peerDependencies: `{ "zod": "^3.25.0 || ^4.0.0" }`. [VERIFIED]

## Package Legitimacy Audit

> Phase 1 installs **no external packages** (pure-Daml skeleton; `daml-prim`/`daml-stdlib`/`daml-script` ship inside the SDK tarball and are not registry installs). The table below audits the *downstream* JS packages that this phase's frozen templates will later feed, run through `slopcheck scan` on 2026-06-25 for early assurance.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@daml/react` | npm | 5+ yrs | — | github.com/digital-asset/daml | [OK] | Approved (downstream P3) |
| `@daml/ledger` | npm | 5+ yrs | — | github.com/digital-asset/daml | [OK] | Approved (downstream P3/P4) |
| `@daml/types` | npm | 5+ yrs | — | github.com/digital-asset/daml | [ERR: registry timeout] | Approved (version 2.10.4 confirmed via direct `registry.npmjs.org/@daml/types/2.10.4`) |
| `@anthropic-ai/sdk` | npm | mature | — | github.com/anthropics/anthropic-sdk-typescript | [OK] | Approved (downstream P5) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
*No registry install occurs in Phase 1; the planner does not need a `checkpoint:human-verify` gate for this phase. Re-audit at the start of Phase 3 (frontend npm install) and Phase 5 (`@anthropic-ai/sdk`).*

## Version Gate Procedure (LEDG-04 — do this FIRST)

The version gate is the spec's #1 risk and must complete before any template work.

**Step 1 — Detect the installed SDK:**
```bash
daml version
```
Expect `2.10.4` to be present and the default. If multiple SDKs are listed, `2.10.4` must be the one resolved (it will be, because `daml.yaml` `sdk-version` forces it for this project).

**Step 2 — Pin in `daml.yaml`:** set `sdk-version: 2.10.4` (the project-level pin; the assistant downloads/uses exactly this SDK for every later command).

**Step 3 — Record in `DECISIONS.md`.** Minimum content:
- **Detected/installed SDK version:** `2.10.4` (from `daml version`).
- **API line:** Daml **2.x HTTP JSON API on :7575** (the line `@daml/react`/`@daml/ledger@2.10.4` target). NOT Daml 3.x / Canton 3.x JSON Ledger API v2 / cn-quickstart.
- **React-18 peer-dep note:** `@daml/react@2.10.4` peerDependencies = `react ^16.12.0 || ^17.0.0`; React 18 works at runtime but npm 7+ errors on install → install the frontend with `--legacy-peer-deps` (or add npm `overrides`). Verified directly from the published package on 2026-06-25.
- **Sandbox flavor:** `daml start` runs a **Canton** sandbox in 2.10.x (verified from `Start.hs@v2.10.0`), which means party IDs are `hint::<fingerprint>` and unstable across restarts → capture them to `parties.json`.
- **Windows hot-reload:** press **`r` + `Enter`** (Windows), not bare `r`.

**Why a gate:** every later layer (codegen package version, JSON API request shapes, JWT token format) is determined by this choice. Recording it makes the whole build reproducible and prevents a mid-hackathon drift to the 3.x line.

## Architecture Patterns

### System Architecture Diagram (Phase 1 scope)

```
                ┌───────────────────────────────────────────────┐
   developer ──▶│  daml start  (one command)                    │
                │   1. doBuild        → .daml/dist/umbra.dar     │
                │   2. doCodegen      → (skipped in P1: no       │
                │                        codegen block yet)      │
                │   3. Canton sandbox ← uploads umbra.dar        │
                │   4. init-script: Setup  (daml script,         │
                │        --wall-clock-time, allocates parties,   │
                │        mints §4 Assets, creates Venue)         │
                │   5. (navigator optional — disabled)           │
                │   6. JSON API  --http-port 7575                │
                │                --allow-insecure-tokens         │
                └───────────────┬───────────────────────────────┘
                                │ HTTP JSON API :7575
                                ▼
        ┌──────────────────────────────────────────────┐
        │  (Phase 3+) frontend / solver query as a party │   ← stubbed in P1
        └──────────────────────────────────────────────┘

   SEPARATE step (not part of daml start):
   daml script --script-name Setup:exportParties
               --output-file parties.json  --ledger-host localhost --ledger-port <sandbox>
        → writes { operator, bankA, bankB, bankC } party IDs as JSON  (LEDG-02)
```

Data flow a reader can trace: `daml start` builds the DAR from the six templates → uploads it to the Canton sandbox → runs `Setup` to allocate the four parties and mint the §4 `Asset` holdings → exposes everything over the JSON API on :7575. A second `daml script --output-file` run captures the allocated party IDs into `parties.json` for downstream phases.

### Recommended Project Structure
```
umbra/
├── daml/
│   ├── daml.yaml              # sdk-version: 2.10.4, init-script, deps
│   └── Umbra/
│       ├── Asset.daml         # template Asset + Split/Merge/Reassign  (LEDG-03)
│       ├── Auction.daml       # Side/OrderStatus/RoundStatus/Allocation/ClearResult
│       │                      #   + Order, Round (+placeholder Clear), RoundStats, TradeConfirmation
│       ├── Roles.daml         # template Venue + SubmitOrder
│       ├── Setup.daml         # allocateParty + mint §4 + RunCanonicalRound + exportParties (LEDG-02)
│       └── Tests.daml         # Daml Script test scaffolds (bodies grow in P2/P3)
├── solver/                    # stubbed (created in P4)
├── web/                       # stubbed (created in P3)
├── scripts/                   # parties.json export helper if Node-side needed
├── README.md                  # run instructions (direct daml/node, no make yet)
├── DECISIONS.md               # the version-gate record
├── .env.example               # ANTHROPIC_API_KEY=, JSON_API_URL=..., etc.
├── .gitignore
├── spec.md                    # commit as tracked source input
└── Umbra design/              # commit as tracked source input
```
Note `daml.yaml` `source:` is relative to the `daml.yaml` location. If `daml.yaml` lives in `daml/`, then `source: Umbra` (or `source: .`). Keep this consistent — a wrong `source` path is the #1 "it won't build" cause.

### Pattern 1: Minimal `daml.yaml` for SDK 2.10.x
**What:** the project config that pins the SDK and drives `daml start`.
**When to use:** the very first file written after the version gate.
**Example (fields verified from `Start.hs` / `Codegen.hs` / `ProjectConfig.scala` @v2.10.0):**
```yaml
# Source: github.com/digital-asset/daml v2.10.0 (daml-helper Start.hs / Codegen.hs)
sdk-version: 2.10.4
name: umbra
version: 0.1.0
source: Umbra              # relative to this daml.yaml; the folder holding the .daml modules
init-script: Setup:initialize   # Module:function — run by `daml start` after sandbox boots
start-navigator: false          # we don't need Navigator; speeds up daml start
dependencies:
  - daml-prim
  - daml-stdlib
  - daml-script
# script-options applied to the init-script run by `daml start`:
# script-options:
#   - --output-file
#   - parties.json
# codegen block: NOT in Phase 1. Adding it makes `daml start` run daml2js every boot.
# Add in Phase 3 when @daml.js/umbra is needed:
# codegen:
#   js:
#     output-directory: ../web/daml.js
#     npm-scope: daml.js
```
**Verified facts:**
- `init-script` value is `Module:function`, run by `daml start` as `daml script --dar <dar> --script-name <init-script> --wall-clock-time --ledger-host localhost --ledger-port <sandbox>`. [CITED: Start.hs runStart]
- `start-navigator` defaults to `true`; set `false` to skip it. [CITED: Start.hs `queryProjectConfig ["start-navigator"]`, default `True`]
- `daml start` runs codegen **only** for a lang whose `codegen.<lang>.output-directory` is set. With no `codegen:` block, codegen is skipped — correct for Phase 1. [CITED: Start.hs `doCodegen`]
- `sandbox-options`, `navigator-options`, `json-api-options`, `script-options` are list-valued daml.yaml fields appended to the respective sub-process. [CITED: Start.hs `withOptsFromProjectConfig`]

### Pattern 2: `Round.Clear` compiling placeholder (defers Phase-2 logic)
**What:** freeze the choice *signature* + a frozen `ClearResult` record, with a body that compiles but does no settlement.
**When to use:** so the project builds in P1 while the real DvP body is written in P2.
**`ClearResult` is referenced by spec §7.4 but never defined there.** Recommend freezing this minimal record now (it becomes the shared cross-layer return type):
```haskell
-- Source: recommended freeze (spec §7.4 references ClearResult without defining it)
data ClearResult = ClearResult with
    roundId         : Text
    clearingPrice   : Decimal
    totalMatched    : Int
    confirmations   : [ContractId TradeConfirmation]
  deriving (Eq, Show)
```
Placeholder choice body that compiles and is honest about being a stub:
```haskell
-- Source: recommended Phase-1 placeholder — real verify+DvP lands in Phase 2
choice Clear : ClearResult
  with
    clearingPrice : Decimal
    allocations   : [Allocation]
  controller operator
  do
    -- PHASE 1 PLACEHOLDER: signature frozen, settlement deferred to Phase 2.
    assertMsg "Clear not yet implemented (Phase 2)" False
    pure ClearResult with
      roundId
      clearingPrice
      totalMatched  = 0
      confirmations = []
```
Using `assertMsg "..." False` makes the body type-check, returns the right type, and **fails loudly if exercised early** — preferable to a silent no-op that could mask a missing Phase-2 implementation. (`abort "..."` is an equally valid stub; both type to any return type.)

### Pattern 3: Operator-only `Asset` choices
**What:** Split/Merge/Reassign authorized by the operator alone (operator-custody model).
**Example:**
```haskell
-- Source: spec §7.1 field shapes (frozen) + standard Daml choice syntax
template Asset
  with
    operator : Party
    owner    : Party
    symbol   : Text
    quantity : Decimal
  where
    signatory operator
    observer owner
    ensure quantity >= 0.0

    choice Split : (ContractId Asset, ContractId Asset)
      with splitQty : Decimal
      controller operator
      do
        assertMsg "splitQty out of range" (splitQty > 0.0 && splitQty < quantity)
        a <- create this with quantity = splitQty
        b <- create this with quantity = quantity - splitQty
        pure (a, b)

    choice Merge : ContractId Asset
      with otherCid : ContractId Asset
      controller operator
      do
        other <- fetch otherCid
        assertMsg "symbol mismatch"  (other.symbol == symbol)
        assertMsg "owner mismatch"   (other.owner == owner)
        archive otherCid
        create this with quantity = quantity + other.quantity

    choice Reassign : ContractId Asset
      with newOwner : Party
      controller operator
      do create this with owner = newOwner
```
Because `operator` is the sole signatory, the operator alone can authorize all three choices — no multi-party authority puzzle. This is exactly why the spec chose operator custody for the MVP.

### Pattern 4: `Setup.daml` with party allocation + §4 mint + parties export
**What:** allocate the four parties, create the `Venue`, mint §4 holdings, and provide an export script.
**Example:**
```haskell
-- Source: daml-script @v2.10.0 (allocatePartyWithHint, PartyIdHint) + spec §4/§14
module Setup where

import Daml.Script
import Umbra.Asset
import Umbra.Roles
import Umbra.Auction

-- Frozen shape returned by the export script → becomes parties.json
data Parties = Parties with
    operator : Party
    bankA    : Party
    bankB    : Party
    bankC    : Party
  deriving (Eq, Show)

allocateAll : Script Parties
allocateAll = do
  operator <- allocatePartyWithHint "Operator" (PartyIdHint "operator")
  bankA    <- allocatePartyWithHint "BankA"    (PartyIdHint "bankA")
  bankB    <- allocatePartyWithHint "BankB"    (PartyIdHint "bankB")
  bankC    <- allocatePartyWithHint "BankC"    (PartyIdHint "bankC")
  pure Parties with operator, bankA, bankB, bankC

mintAsset : Party -> Party -> Text -> Decimal -> Script (ContractId Asset)
mintAsset operator owner symbol quantity =
  submit operator do
    createCmd Asset with operator, owner, symbol, quantity

-- init-script for daml.yaml: allocates + seeds the §4 world
initialize : Script Parties
initialize = do
  p@Parties{..} <- allocateAll
  -- Venue with all three desks as observers
  submit operator do
    createCmd Venue with operator, desks = [bankA, bankB, bankC]
  -- §4 holdings (Decimal literals MUST carry a decimal point)
  mintAsset operator bankA "USDCx" 5000.0
  mintAsset operator bankB "BONDX" 20.0
  mintAsset operator bankB "USDCx" 1000.0
  mintAsset operator bankC "BONDX" 15.0
  mintAsset operator bankC "USDCx" 1000.0
  pure p

-- export script: run SEPARATELY with --output-file parties.json (see export mechanism)
exportParties : Script Parties
exportParties = allocateAll
```
> ⚠ Naming note: `daml start`'s init-script must NOT *re-allocate* parties on every restart if you intend `parties.json` to stay valid. On the Canton sandbox each `daml start` is a fresh ledger, so allocation + export both happen per-boot — that's fine; just ensure the export step runs **against the same running sandbox** (see below) so the IDs in `parties.json` match the live ledger.

**`RunCanonicalRound`** (submits the three §4 orders; clearing assertion deferred to Phase 2):
```haskell
-- Source: spec §4 fixture + §14
runCanonicalRound : Script ()
runCanonicalRound = do
  p@Parties{..} <- initialize
  venueCid <- ... -- query/create the Venue
  -- A Buy 10 @ ≤101, B Sell 8 @ ≥99, C Sell 5 @ ≥100
  submit bankA do exerciseCmd venueCid SubmitOrder with desk = bankA, roundId = "R1", side = Buy,  quantity = 10, limit = 101.0
  submit bankB do exerciseCmd venueCid SubmitOrder with desk = bankB, roundId = "R1", side = Sell, quantity = 8,  limit = 99.0
  submit bankC do exerciseCmd venueCid SubmitOrder with desk = bankC, roundId = "R1", side = Sell, quantity = 5,  limit = 100.0
  pure ()
  -- Phase 2 adds: open Round, CloseRound, Clear → assert clearingPrice == 100.0
```

### Anti-Patterns to Avoid
- **Writing Decimal literals without a decimal point** (`5000`): Daml will not infer `Decimal` from a bare integer literal in `Decimal` position the way you'd hope — write `5000.0`. (`Int` literals and `Decimal` literals are distinct.) This is the most common P1 compile error for this fixture.
- **Adding a `codegen:` block in Phase 1:** it makes every `daml start` run `daml2js` and (without a `web/` consumer) just slows the loop. Defer to Phase 3.
- **Relying on `init-script` to write `parties.json`:** `daml start` runs the init-script WITHOUT `--output-file` (verified in `Start.hs`). Capture IDs with a separate `daml script --output-file` run, or put `--output-file parties.json` in `script-options` so the init-script's *return value* is written.
- **Assuming stable party IDs:** on the Canton sandbox, `allocatePartyWithHint "bankA"` → `bankA::<fingerprint>`. Never hard-code a fingerprint; always read from `parties.json`.
- **Leaving the `Clear` body as a silent no-op `pure ...`:** prefer a loud `assertMsg ... False` / `abort` so an early exercise fails instead of silently "succeeding" with no settlement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Running sandbox + JSON API + build together | A custom shell orchestration of `daml build` + `daml sandbox` + `daml json-api` | `daml start` | It already sequences build → codegen → sandbox → upload → init-script → JSON API and handles port files/readiness probes [CITED: Start.hs] |
| Party allocation | Manual participant admin API calls | `allocateParty` / `allocatePartyWithHint` in Daml Script | Standard, idHint controls the readable prefix [CITED: daml-script PartyManagement.daml] |
| Exporting party IDs to JSON | A bespoke parser of `daml ledger` output | `daml script --output-file parties.json` (writes the script's return value as Daml-LF JSON) | Built-in, documented [CITED: daml-script docs] |
| Fixed-point money math | A custom rational type | `Decimal` (= `Numeric 10`, precision 38 scale 10) | Native, exact, what the JSON API encodes [CITED: GHC/Types.daml] |
| JSON API dev auth | A custom auth server | `daml start`'s `--allow-insecure-tokens` + HS256 unsafe dev JWTs (wired in Phase 3) | Built into the dev JSON API [CITED: Start.hs withJsonApi] |

**Key insight:** Phase 1 is almost entirely "use the Daml toolchain as designed." The only thing you genuinely author is the six templates + the Setup script. Everything around them (build, sandbox, JSON API, party admin, JSON export) is a flag or a built-in.

## `daml start` Wiring (LEDG-01) — verified behavior

From `daml-helper/src/DA/Daml/Helper/Start.hs` at tag **v2.10.0**, `runStart` executes, in order:

1. **`doBuild`** — compiles to `.daml/dist/<name>-<version>.dar`.
2. **`doCodegen projectConfig`** — for each lang (`java`, `js`) that has `codegen.<lang>.output-directory` set, runs codegen. With no `codegen:` block, this is a no-op (Phase 1).
3. **`withSandbox`** — starts a **Canton sandbox** (`withCantonSandbox`), waits for the port file, then `runLedgerUploadDar` uploads the DAR. Default Canton ledger API port is the sandbox port (the JSON API connects to it on localhost).
4. **init-script** (`whenJust mbInitScript`) — runs:
   ```
   daml script --dar <dar> --script-name <init-script> \
     --wall-clock-time --ledger-host localhost --ledger-port <sandboxPort> <script-options...>
   ```
   (`--static-time` is used instead of `--wall-clock-time` only if `sandbox-options` contains `-s`/`--static-time`.)
5. **hot-reload listener** — after a 20-second startup delay, prints rebuild instructions and listens for a keypress; on `r` it does `doReset` → `doBuild` → `doCodegen` → `doUploadDar` → re-run init-script. **On Windows the prompt is "Press 'r' + 'Enter'"; elsewhere just 'r'.** (Skipped when the DAR's LF version supports package upgrades — not relevant on 2.10.x default LF.)
6. **Navigator** — started only if `start-navigator` is true (we set `false`).
7. **JSON API** (`withJsonApi`) — runs:
   ```
   daml json-api --ledger-host localhost --ledger-port <sandboxPort> \
     --http-port <jsonApiPort> --allow-insecure-tokens <json-api-options...>
   ```
   waits for `http://localhost:<jsonApiPort>/readyz`. The default `<jsonApiPort>` is **7575**.

**LEDG-01 acceptance** = `daml start` reaches "JSON API started" with the six templates compiled, and `curl http://localhost:7575/readyz` returns ready.

## parties.json Export Mechanism (LEDG-02)

`daml start`'s init-script is invoked **without** `--output-file`, so it cannot itself write `parties.json` unless you add the flag via `script-options`. Two reliable options — recommend **Option A** for clarity:

**Option A (recommended): a separate `daml script` run against the live sandbox.**
After `daml start` is up (or as a one-shot during seeding), run:
```bash
daml script \
  --dar .daml/dist/umbra-0.1.0.dar \
  --script-name Setup:exportParties \
  --ledger-host localhost --ledger-port <sandboxLedgerApiPort> \
  --output-file parties.json
```
This writes the `Parties` record as Daml-LF JSON, e.g.:
```json
{ "operator": "operator::1220...", "bankA": "bankA::1220...", "bankB": "bankB::1220...", "bankC": "bankC::1220..." }
```
⚠ Caveat: a *separate* `allocateParties` run would allocate *new* parties distinct from the init-script's. To keep `parties.json` consistent with the seeded ledger, either (a) make `initialize` itself the init-script AND run the export against the SAME sandbox using a `listKnownParties`-based lookup, or (b) **simplest**: skip the init-script for seeding and instead run a single `daml script --script-name Setup:initialize --output-file parties.json` against a started sandbox, so the same run both seeds and exports. The planner should pick one and document it; Phase 1 only needs the IDs landed in `parties.json`.

**Option B: `script-options` in daml.yaml.**
```yaml
init-script: Setup:initialize
script-options:
  - --output-file
  - parties.json
```
Then `daml start` writes the init-script's return value (the `Parties` record) to `parties.json` automatically on each boot. Verified that `script-options` are appended to the init-script run. [CITED: Start.hs `withOptsFromProjectConfig "script-options"`] This is the lowest-friction path — recommend the planner try B first and fall back to A if the working directory of the write is surprising.

**`.env` entries:** the actual per-party JWTs are minted in Phase 3 (HS256 unsafe dev tokens against `--allow-insecure-tokens`). Phase 1 only needs the party IDs in `parties.json`; the `.env.example` ships the static keys (`ANTHROPIC_API_KEY=`, `JSON_API_URL=http://localhost:7575`, `SOLVER_PORT=4000`, `ROUND_SECONDS=60`, `PRODUCT_NAME=Umbra`) per spec §15.

## `daml codegen js` Workflow (note for Phase 3/4 — NOT built in P1)

When the frontend/solver need bindings, add to `daml.yaml`:
```yaml
codegen:
  js:
    output-directory: ../web/daml.js   # generated @daml.js/umbra lands here
    npm-scope: daml.js
```
Then either `daml codegen js` runs standalone, or `daml start` runs it automatically each boot (because the `output-directory` is set). The generated package is installed into the consumer with `npm install ../web/daml.js/umbra --legacy-peer-deps`. [CITED: Codegen.hs `runCodegen JavaScript`: `daml2js <dar> -o <output-directory> -s<npm-scope>`] The bindings are derived FROM the templates frozen in this phase — which is why freezing the field shapes now matters.

## Common Pitfalls

### Pitfall 1: Bare-integer Decimal literals
**What goes wrong:** `quantity = 5000` in `Decimal` position fails to compile (type mismatch Int vs Decimal/Numeric).
**Why it happens:** Daml's `5000` is an `Int` literal; `Decimal` literals need a decimal point.
**How to avoid:** write `5000.0`, `20.0`, `101.0`, etc. throughout `Setup.daml`.
**Warning signs:** `damlc` "No instance for (Numeric ...)" or "expected Decimal, got Int" errors.

### Pitfall 2: Wrong `source:` path → "no modules found"
**What goes wrong:** `daml build` reports it can't find the modules.
**Why it happens:** `source:` is relative to the `daml.yaml` directory; if `daml.yaml` is in `daml/` and modules are in `daml/Umbra/`, `source: Umbra` (or `source: .`) must point at the right folder, and module headers (`module Umbra.Asset where`) must match the directory layout.
**How to avoid:** keep module names and folder structure aligned (`Umbra/Asset.daml` → `module Umbra.Asset`), and set `source` to the folder that *contains* the top package dir.
**Warning signs:** build error listing zero modules, or "could not find module Umbra.Asset".

### Pitfall 3: Expecting stable party IDs (Canton sandbox)
**What goes wrong:** hard-coded `bankA` party string fails authorization; IDs change between `daml start` runs.
**Why it happens:** `daml start` uses a Canton sandbox in 2.10.x; allocation yields `bankA::<fingerprint>` and a fresh ledger each boot.
**How to avoid:** always read party IDs from `parties.json`; never embed a fingerprint. Use `allocatePartyWithHint` so the prefix stays readable.
**Warning signs:** "party not known on ledger" or auth failures when querying the JSON API with a stale ID.

### Pitfall 4: Windows hot-reload needs Enter
**What goes wrong:** pressing `r` seems to do nothing during `daml start`.
**Why it happens:** on Windows the reload binding is `r` + `Enter` (verified `isWindows` branch in `Start.hs`).
**How to avoid:** press `r` then `Enter`. Document this in README.
**Warning signs:** "Press 'r' + 'Enter' to re-build" line in the `daml start` output.

### Pitfall 5: First `daml start` is slow / firewall prompt on Windows
**What goes wrong:** Canton sandbox boot is JVM-heavy; Windows may pop a firewall dialog for the JVM listening on localhost ports.
**Why it happens:** Canton sandbox + JSON API are separate JVM processes binding local ports.
**How to avoid:** allow the JVM through the firewall (localhost only); expect 20–40s first boot. The reload listener intentionally waits 20s before printing instructions.
**Warning signs:** "Waiting for canton sandbox to start." lingering; a Windows Defender prompt.

### Pitfall 6: `init-script` value format
**What goes wrong:** `init-script: initialize` (no module) fails to resolve.
**Why it happens:** it must be `Module:function` (e.g. `Setup:initialize`).
**How to avoid:** always qualify with the module name.

## Code Examples

(See Patterns 1–4 above for the verified, copy-ready `daml.yaml`, `Asset`, `Setup`, and `Round.Clear` placeholder. All field shapes are copied verbatim from spec §7; all toolchain flags are cited from `Start.hs`/`Codegen.hs` @v2.10.0.)

## Runtime State Inventory

> Phase 1 is greenfield scaffolding, not a rename/refactor. This section is included only to record the one piece of state that *is* generated.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The Canton sandbox ledger is **ephemeral** — recreated on each `daml start`; no persistent DB to migrate | None — re-seed via init-script each boot |
| Live service config | None | None — verified greenfield |
| OS-registered state | None | None — `make` not installed, no scheduled tasks/services |
| Secrets/env vars | `.env` not yet created; `.env.example` ships the keys; `ANTHROPIC_API_KEY` consumed only by `solver/` (Phase 5) | Ship `.env.example`, gitignore `.env` |
| Build artifacts | `.daml/dist/umbra-0.1.0.dar`, `parties.json` (generated) | Gitignore `.daml/`; decide whether `parties.json` is tracked (recommend gitignore — it holds ephemeral per-boot IDs) |

## State of the Art

| Old Approach | Current Approach (2.10.x) | When Changed | Impact |
|--------------|---------------------------|--------------|--------|
| `daml start` ran the legacy in-memory **Sandbox** | `daml start` runs a **Canton** sandbox (`withCantonSandbox`) | Daml 2.x | Party IDs are `hint::<fingerprint>`, fresh ledger each boot → must export `parties.json` |
| Party IDs == the hint string | Party IDs == `hint::<fingerprint>` | Daml 2.0 | Never hard-code party strings; read from export |
| `output_format` / older JSON encodings | Daml-LF JSON encoding via `--output-file` | stable in 2.x | `parties.json` is plain JSON of the script's return record |

**Deprecated/outdated for this build:**
- Daml 3.x / Canton 3.x JSON Ledger API v2 + `cn-quickstart` — explicitly OUT (stretch §19). `@daml/react` does not target it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ClearResult` record shape (`roundId`, `clearingPrice`, `totalMatched`, `confirmations`) | Pattern 2 | LOW — it's a Phase-1 freeze; spec §7.4 leaves it undefined. Planner may simplify; the only hard requirement is that `Clear : ClearResult` compiles. The shape can be revised in Phase 2 if the DvP body needs different fields. |
| A2 | Recommended module grouping (Venue→Roles, Order/Round/etc→Auction) | Project Structure | NONE — explicitly Claude's-discretion per CONTEXT; field shapes are the only fixed part. |
| A3 | Option B (`script-options: --output-file parties.json`) writes the init-script return value on each `daml start` boot | parties.json Export | LOW — mechanism is cited (script-options are appended to the script run) but the exact write-directory under `daml start` wasn't runtime-verified; Option A (separate run) is the guaranteed fallback. |
| A4 | Default JSON API port under `daml start` is 7575 | daml start Wiring | LOW — 7575 is the documented + conventional default; can be forced via `json-api-options: [--http-port, 7575]` if a different default appears. |

## Open Questions

1. **Does `parties.json` from Option B land in the project root or the sandbox temp dir?**
   - What we know: `script-options` are appended to the init-script's `daml script` invocation; `--output-file` writes relative to the script process CWD.
   - What's unclear: the exact CWD `daml start` uses for the init-script sub-process on Windows.
   - Recommendation: try Option B; if `parties.json` lands somewhere unexpected, use Option A (explicit separate `daml script --output-file parties.json` from the repo root). Either satisfies LEDG-02.

2. **Should `RunCanonicalRound` live in `Setup.daml` or `Tests.daml`?**
   - What we know: spec §14 calls it a setup/seed script; spec §16 uses it from tests.
   - Recommendation: define it in `Setup.daml` (it's a seed) and call it from `Tests.daml` — avoids duplication. Claude's discretion per CONTEXT.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Daml SDK | all of P1 | (installing now, out-of-band) | 2.10.4 (target) | none — hard blocker until installed; **do not run `daml` until on PATH** |
| JDK | Canton sandbox | ✓ | 21 | none needed (17+ required) |
| Node | downstream only | ✓ | 26.x | not used in P1 |
| npm | downstream only | ✓ | 11.x | not used in P1 |
| `make` | Makefile (P7) | ✗ | — | use direct `daml`/`node` commands + npm scripts (per CONTEXT) |

**Missing dependencies with no fallback:**
- Daml SDK 2.10.4 — being installed out-of-band; **all `daml` commands block until it is on PATH.** The planner's first task must verify `daml version` succeeds before any build step.

**Missing dependencies with fallback:**
- `make` — defer the Makefile to Phase 7; Phase 1 uses direct `daml start` / `daml build` / `daml script` invocations and (optionally) root `package.json` scripts.

## Validation Architecture

> `workflow.nyquist_validation: true` → this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Daml Script** (built into SDK 2.10.4; no install) — run via `daml test` |
| Config file | `daml/daml.yaml` (declares `daml-script` dependency) |
| Quick run command | `daml build` (proves the six templates + placeholders compile — the core P1 gate) |
| Full suite command | `daml test` (runs all `Script ()` test functions in `Tests.daml`) |

> Phase 1 has **no behavioral logic to assert** beyond "it compiles and seeds." The clearing/settlement/privacy assertions (tests 1–6 in spec §16) belong to Phases 2–3. P1's validation is: the project builds, `daml start` boots to JSON API ready, and `Setup:initialize` runs without error.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEDG-01 | Six templates compile; `daml start` reaches JSON API on :7575 | smoke | `daml build` then `daml start` + `curl http://localhost:7575/readyz` | ❌ Wave 0 (project not yet created) |
| LEDG-02 | `Setup:initialize` allocates 4 parties + mints §4 holdings without error; `parties.json` written | integration (Daml Script) | `daml test` running a `test_setup_seeds` script that asserts 4 parties + 5 Assets created | ❌ Wave 0 |
| LEDG-03 | `Asset.Split`/`Merge`/`Reassign` are exercisable by operator and preserve quantity | unit (Daml Script) | `daml test` running `test_asset_split_merge` | ❌ Wave 0 |
| LEDG-04 | SDK pinned + recorded | manual/static | inspect `daml.yaml` `sdk-version: 2.10.4` + `DECISIONS.md` content; `daml version` | ❌ Wave 0 (static check, no test file) |

### Sampling Rate
- **Per task commit:** `daml build` (fast; proves compile).
- **Per wave merge:** `daml test` (runs the Daml Script smoke/integration tests in `Tests.daml`).
- **Phase gate:** `daml build` green + `daml start` boots to JSON API ready + `Setup:initialize` runs + `daml test` green, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `daml/daml.yaml` — pins SDK, declares `daml-script`, sets `init-script` (framework + config)
- [ ] `daml/Umbra/Tests.daml` — `test_setup_seeds` (LEDG-02), `test_asset_split_merge` (LEDG-03)
- [ ] `daml/Umbra/Setup.daml` — `initialize` + `exportParties` (the thing under test)
- [ ] No framework install needed — Daml Script ships with the SDK; `daml test` is the runner.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` → included. Phase 1 is ledger-skeleton with no network endpoints exposed to untrusted clients yet (JSON API runs in dev mode with `--allow-insecure-tokens`), so most ASVS categories are deferred to the phases that introduce auth (P3) and the HTTP solver API (P4).

### Applicable ASVS Categories

| ASVS Category | Applies (P1) | Standard Control |
|---------------|--------------|-----------------|
| V2 Authentication | no (deferred P3) | HS256 unsafe dev JWTs against `--allow-insecure-tokens` — wired in Phase 3 |
| V3 Session Management | no | — (per-party JWT in P3) |
| V4 Access Control | **yes (on-ledger)** | Daml signatory/observer disclosure — the privacy model. `Order` stakeholders = operator+desk only; `Asset` = operator+owner; `TradeConfirmation` = operator+desk. Field shapes frozen here enforce it. |
| V5 Input Validation | **yes (on-ledger)** | `ensure` clauses: `Asset` `quantity >= 0.0`, `Order` `quantity > 0 && limit > 0.0`; `assertMsg "desk not registered"` in `SubmitOrder` |
| V6 Cryptography | no | — (dev-mode HS256 secret in P3; never hand-roll) |
| V14 Config / Secrets | **yes** | `ANTHROPIC_API_KEY` never in frontend/never committed; `.env` gitignored; ship `.env.example`. Strict per spec §15 + CLAUDE.md. |

### Known Threat Patterns for this stack (Phase 1 surface)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A desk forging another desk's order | Spoofing | `Order` signatory = `operator, desk` (both authorities required); created only via `Venue.SubmitOrder` controlled by `desk` |
| Cross-desk order/holding visibility leak | Information disclosure | Daml disclosure: stakeholders restricted by signatory/observer; no broad observers. Frozen field shapes are the control. |
| Negative / zero quantities corrupting balances | Tampering | `ensure quantity >= 0.0` (Asset), `ensure quantity > 0 && limit > 0.0` (Order); `Split` range check |
| Secret leakage (Anthropic key) | Information disclosure | Key in `solver/` env only; `.env` gitignored; `.env.example` ships placeholders |
| Insecure dev JWT in a non-dev context | Spoofing/Elevation | `--allow-insecure-tokens` is **dev-sandbox only**; documented in DECISIONS.md as NOT for any deploy. (No external exposure in P1.) |

**Security note for the planner:** the privacy guarantees (PRIV-01..04, asserted in Phase 3) are *structurally established* in Phase 1 by the frozen signatory/observer shapes. Getting these field shapes exactly right here is the security-critical deliverable of the phase — a stray `observer` would silently break the money shot.

## Sources

### Primary (HIGH confidence)
- `github.com/digital-asset/daml` tag **v2.10.0** — `sdk/daml-assistant/daml-helper/src/DA/Daml/Helper/Start.hs` (exact `daml start` sequence, ports, init-script invocation, `--allow-insecure-tokens`, Windows hot-reload key) — ground truth for LEDG-01.
- Same repo — `.../Helper/Codegen.hs` (`codegen js` → `daml2js <dar> -o <out> -s<scope>`) and `.../Internal/Questions/PartyManagement.daml` (`allocateParty`, `allocatePartyWithHint`, `PartyIdHint`).
- Same repo — `sdk/compiler/damlc/daml-prim-src/GHC/Types.daml` (`Decimal`, `Numeric n`, precision 38).
- `registry.npmjs.org/@daml/react/2.10.4`, `/@daml/ledger/2.10.4`, `/@daml/types/2.10.4`, `/@anthropic-ai/sdk/latest` — exact versions + peer deps (live, 2026-06-25).

### Secondary (MEDIUM confidence)
- docs.daml.com (unversioned → resolves to 2.10.x): Daml Script `--output-file`/`--input-file` JSON behavior; `parties-users.html` (party ID = `hint::<fingerprint>` in 2.0+); `authorization.html` (HS256 unsafe token / `actAs`/`ledgerId` JWT fields).
- blog.digitalasset.com "Parties and users in Daml 2.0" — `allocatePartyWithHint` readable-prefix behavior.

### Tertiary (LOW confidence)
- WebSearch summaries of `init-script` / `script-options` integration with `daml start` — corroborated by the `Start.hs` source (so effectively promoted to HIGH for the cited facts).

## Metadata

**Confidence breakdown:**
- Standard stack / SDK + npm versions: **HIGH** — verified against live npm registry + daml source tree.
- `daml start` wiring / daml.yaml fields: **HIGH** — read directly from `Start.hs`/`Codegen.hs` at the matching minor tag (v2.10.0; project pins 2.10.4 patch).
- Template/choice syntax: **HIGH** — standard Daml 2.x syntax + spec §7 frozen shapes.
- parties.json export (Option B write location): **MEDIUM** — mechanism cited; exact CWD not runtime-verified (Option A is the guaranteed fallback).
- Pitfalls (Windows specifics): **HIGH** — `isWindows` branch read from source.

**Research date:** 2026-06-25
**Valid until:** ~2026-07-25 (stable SDK line; daml 2.10.x is mature). Re-verify npm peer deps only if the planner bumps `@daml/*` patch versions.

## RESEARCH COMPLETE

**Phase:** 1 - Skeleton & Version Gate
**Confidence:** HIGH

### Key Findings
- `daml start` in 2.10.x runs a **Canton** sandbox (verified from `Start.hs@v2.10.0`); the exact step order is build → codegen(if configured) → sandbox+upload → init-script (`--wall-clock-time`) → navigator(opt) → JSON API `--http-port 7575 --allow-insecure-tokens`.
- Party IDs come back as `hint::<fingerprint>` and are not stable across boots → `parties.json` must be captured at allocation time (recommend `daml script --output-file`, with `script-options` as the in-band alternative).
- `Decimal` = `Numeric 10`; all §4 literals must carry a decimal point (`5000.0`) — the most likely P1 compile error.
- `ClearResult` is undefined in spec §7.4 → recommend freezing a minimal record now; `Round.Clear` gets a loud `assertMsg ... False` placeholder body so it compiles but fails if exercised before Phase 2.
- Windows specifics: hot-reload is **`r` + `Enter`**; expect a JVM firewall prompt + ~20–40s first boot.
- `@daml/react@2.10.4` peer dep = `react ^16.12.0 || ^17.0.0` (confirmed live) → record the `--legacy-peer-deps` note in DECISIONS.md (the gate).

### File Created
`.planning/phases/01-skeleton-version-gate/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | npm registry + daml source tree verified |
| Architecture / `daml start` wiring | HIGH | read from `Start.hs` at matching tag |
| Pitfalls | HIGH | Windows branch + Decimal type read from source |

### Open Questions
- Exact write-directory of `parties.json` under Option B (`script-options`) — fallback is the explicit Option A `daml script --output-file` run; either satisfies LEDG-02.

### Ready for Planning
Research complete. The planner can now create PLAN.md files; the six template field shapes, `daml.yaml`, the `daml start` sequence, the Setup/export pattern, the `ClearResult` freeze, and the version-gate procedure are all specified with cited, copy-ready examples.
