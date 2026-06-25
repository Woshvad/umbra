# Phase 1: Skeleton & Version Gate - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous, recommended answers accepted) — infrastructure phase, grey-area questions auto-resolved from the locked spec

<domain>
## Phase Boundary

Freeze the Daml data model and the SDK/API line so every other layer codes against a known, compiling contract that seeds the canonical §4 world. This phase delivers **only the skeleton**: the six templates compile, `Setup.daml` seeds the §4 fixture, and `daml start` runs the sandbox + HTTP JSON API on :7575.

**In scope:** Daml SDK detection + pinning (the version gate, done FIRST), the `Asset`/`Venue`/`Order`/`Round`/`RoundStats`/`TradeConfirmation` templates with frozen field shapes, the `Allocation` data type, `Setup.daml` (+ `RunCanonicalRound` seed), repo scaffolding, `.gitignore`/`.env.example`, and committing the binding source inputs (`spec.md`, `Umbra design/`).

**Explicitly NOT in scope (later phases):** the real `Round.Clear` clearing+settlement body (Phase 2 — Phase 1 only freezes the choice *signature* with a compiling placeholder body), the §8 algorithm, the TS solver service, the AI agent, and all frontend (Phase 3+).
</domain>

<decisions>
## Implementation Decisions

### SDK & Version Gate (LEDG-04 — do this FIRST, before any other build work)
- **Daml SDK 2.10.4** is the target line (latest stable 2.x; confirmed the newest non-3.x release). Install via the Windows SDK tarball; pin `sdk-version: 2.10.4` in `daml.yaml`.
- **API line: Daml 2.x HTTP JSON API on :7575** — the line `@daml/react`/`@daml/ledger@2.10.4` target. NOT the Daml 3.x / Canton 3.x JSON Ledger API v2 / cn-quickstart line (that is stretch §19).
- Record in `DECISIONS.md`: the detected/installed SDK version, the chosen 2.x HTTP JSON API line, and the React-18 `--legacy-peer-deps` note (the `@daml/react` peer dep wants React 16/17).
- Environment already present: Node 26.x, npm 11.x, JDK 21 (sandbox needs JDK 17+ ✓). `make` is NOT installed — defer the `Makefile` convenience to Phase 7; use npm scripts / direct `daml`/`node` invocations for now.

### Daml data model (frozen as the shared cross-layer contract — copy field shapes EXACTLY from spec §7)
- Modules under `daml/Umbra/` per spec §7/§13: `Asset.daml`, `Auction.daml`, `Roles.daml`, `Setup.daml`, `Tests.daml`. Recommended grouping: `Asset` → `Asset.daml`; `Venue` (role contract) → `Roles.daml`; `Order`/`Round`/`RoundStats`/`TradeConfirmation` + `Side`/`OrderStatus`/`RoundStatus`/`Allocation` → `Auction.daml`. (Planner may adjust grouping but field shapes are fixed.)
- `Asset`: `signatory operator`, `observer owner`, `ensure quantity >= 0.0`; choices `Split`, `Merge`, `Reassign(newOwner)` under Operator authority alone (operator-custody MVP model).
- `Venue`: `signatory operator`, `observer desks`; `nonconsuming choice SubmitOrder` (controller desk) creating an `Order` signed by operator + desk.
- `Order`: `signatory operator, desk`; `ensure quantity > 0 && limit > 0.0`; `data Side = Buy | Sell`, `data OrderStatus = Sealed | Filled | PartiallyFilled | Unfilled`.
- `Round`: `signatory operator`, `observer desks`; `data RoundStatus = Open | Closed | Cleared | Settled`; choices `CloseRound` and `Clear` (with `clearingPrice : Decimal`, `allocations : [Allocation]`, controller operator). **Phase 1 freezes the `Clear` signature with a placeholder/compiling body; the real verify+DvP body lands in Phase 2.**
- `RoundStats`: `signatory operator`, `observer desks`, `sealedOrderCount : Int` (count only).
- `TradeConfirmation`: `signatory operator`, `observer desk` (visible only to that desk).
- `data Allocation = Allocation with desk : Party; side : Side; filledQty : Int`.

### Setup & fixture (spec §4 + §14)
- `Setup.daml` allocates `Operator`, `BankA`, `BankB`, `BankC`; creates one `Venue{operator, desks=[A,B,C]}`; mints §4 holdings as `Asset`s: A→5,000 USDCx; B→20 BONDX + 1,000 USDCx; C→15 BONDX + 1,000 USDCx.
- Provide a second script `RunCanonicalRound` that submits the three §4 orders (A Buy 10 @≤101, B Sell 8 @≥99, C Sell 5 @≥100) — used by tests and as a one-command demo seed. (Its clearing assertion is exercised once Phase 2 implements `Clear`.)
- Expose party IDs/tokens to the frontend + solver by generating `parties.json` / `.env` entries (mechanism finalized in Phase 3 when JWTs are wired; Phase 1 just needs the allocation script + a place to write IDs).

### Repo scaffolding & hygiene
- Layout per spec §13: `daml/`, `solver/`, `web/`, `scripts/`, plus root `README.md`, `DECISIONS.md`, `.env.example`. Phase 1 creates `daml/` fully; `solver/`+`web/` may be stubbed (created in their phases).
- `.gitignore` excludes `.env`, `.daml/`, `node_modules/`, `dist/`, `.dist/`, build artifacts, and the SDK download temp. `.env.example` ships per spec §15 (`ANTHROPIC_API_KEY=`, `JSON_API_URL=http://localhost:7575`, `SOLVER_PORT=4000`, `ROUND_SECONDS=60`, `PRODUCT_NAME=Umbra`).
- **Commit the binding source inputs** now that the repo is being scaffolded: `spec.md` and `Umbra design/` (currently untracked) become tracked so every later phase references versioned sources.

### Claude's Discretion
- Exact module grouping within the fixed field shapes; placeholder body for `Clear`; daml.yaml `name`/`version`/dependency list; ordering of Setup operations; README skeleton wording.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield. `spec.md` (repo root) is the authoritative data-model + fixture source; `Umbra design/` is the binding frontend design comp (not used until Phase 3).

### Established Patterns
- Repo is its own git isolated git repo (git-init'd off the home repo). Author/committer MUST stay `woshvad` — **never** add Claude as a git contributor (no `Co-Authored-By`, no "Generated with"). This is a strict, build-wide rule.

### Integration Points
- `daml.yaml` `sdk-version` is the version gate consumed by every later layer. The template field shapes + `Allocation` frozen here are imported by the solver (`@daml.js` codegen) and re-verified on-ledger in Phase 2.
</code_context>

<specifics>
## Specific Ideas

- The canonical §4 fixture is the single correctness reference for the whole build and must ultimately clear at **exactly $100.00** (fills A=10 / B=8 / C=2, C residual 3). Phase 1 only needs the fixture *seeded*; the $100.00 assertion is proven in Phase 2.
- Keep all Daml templates standard (templates/choices/interfaces only) so the same DAR compiles on the Daml 2.x line now and, as a stretch, the Canton 3.x line later (spec §6 version-drift mitigation).
</specifics>

<deferred>
## Deferred Ideas

- `Round.Clear` verify+settlement body, the §8 algorithm, atomicity/conservation checks → Phase 2.
- Per-party JWT token generation + party-scoped JSON API auth → Phase 3.
- `Makefile` + `make demo` orchestration → Phase 7 (and `make` must be installed first).
- Daml Finance holdings, Canton LocalNet deploy → stretch (§19), post-Phase-7.
</deferred>
