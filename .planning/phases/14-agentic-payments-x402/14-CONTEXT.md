# Phase 14: Agentic Payments (x402 Metered Solver Access) — Context

**Gathered:** 2026-07-10
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss (user: "add it… see if it's actually possible and if it'll work on devnet too and implement it"). Feasibility was researched before this CONTEXT (web + codebase map); all decisions below are Claude's researched picks and are overridable.

<domain>
## Phase Boundary

Monetize the solver's HTTP surface with **x402**, the HTTP-native payment protocol for autonomous agents, now live on Canton. Gate Umbra's AI endpoints behind a spec-accurate HTTP `402` so a machine client pays a small fee **per solve** — reinforcing the "AI agent + agentic payments on Canton" story — built on the CURRENT stack (Daml 3.4.11 + Canton 3.4 + JSON Ledger API v2 on :3975, solver :4100, web :5173). One requirement:

- **PAY-01** x402 metered access to the AI solver: an HTTP 402 payment-gate over the two direct-Claude endpoints (`GET /round/:id/solve-preview`, `POST /competing`), advertising a real Canton payment scheme in the x402 `accepts[]` envelope, honoring `X-PAYMENT` on retry, settlement swappable behind a `FacilitatorClient` interface.

**Feasibility (confirmed, cited):**
- x402 is chain-agnostic by spec (the `accepts` array enumerates any network/scheme via CAIP-2-style ids). It is **live on Canton**: the FTP/CanTrustAI dev-fund integration (`canton-foundation/canton-dev-fund#78`, **MERGED**) delivers a Canton x402 **facilitator** (`/verify` + `/settle`), a **client SDK**, and **resource-server middleware**, with **Canton Coin** as a selectable x402 scheme. A live **DevNet** reference runs at `dev.cantrustai.xyz` (+ mainnet `cantrustai.xyz`), and the retroactive component recognizes an already-delivered per-request payment-settlement stack — i.e. it works, it is not vaporware.
- **Will it work on DevNet?** Yes. Canton Coin, CIP-56 token transfers, and transfer preapprovals (free 90-day base duration) are native DevNet operations; Umbra already talks to Canton via the JSON Ledger API. The `self` backend runs on DevNet **today** with Umbra's own token; the `canton-cc` backend settles real $CC on DevNet once the FTP facilitator + a CC-funded venue party are available.

**The honest scope boundary (load-bearing):** Umbra's cash leg is **operator-custody USDCx** — an `InstrumentId operator "USDCx"` `Holding` that implements the CN Token Standard `HoldingV1` **view interface** (which has NO choices; transfers go through Umbra's own operator-authority `Reassign`/`Split`/`moveExactHolding`). Umbra has **no Amulet / Canton Coin / AllocationV1 / TransferInstruction / transfer-preapproval** wired (`DECISIONS.md` D13 explicitly disclaims external Amulet/wallet interop). Therefore x402 here **speaks the real Canton x402 wire protocol**, but *settlement* is swappable behind one interface: a `self` backend settles the fee in Umbra's own token (built + offline-verified); a `canton-cc` backend settles real Canton Coin via the FTP facilitator (offline-mocked; live = the DevNet-sponsorship-gated UAT — the same external gate Phase 12 waits on).

**In scope:** real, unit-tested solver code + config for the 402 gate, the `FacilitatorClient` interface + both backends (self live-capable, canton-cc offline-mocked), the operator-custody fee transfer, a tiny payment-construction helper, and an **optional** droppable web "pay-to-solve" affordance. Follows the established "Built · offline-verified · live UAT pending" pattern.

**Out of scope (external/UAT gates):** the live FTP Canton x402 facilitator hookup + real $CC settlement on a live DevNet node (needs the SV-sponsored connection + a CC-funded venue party); publishing/registering an upstream Canton x402 scheme; a production payer-signed wallet flow.

**Hard invariants (never violated):**
- The canonical §4 fixture still clears at **exactly $100.00** (A=10 / B=8 / C=2). x402 must not perturb it.
- **Default-OFF** (`X402_ENABLED=false`): with metering off, every existing endpoint and the canonical money-shot demo are **byte-unchanged**. This is the primary invariant guard.
- x402 is a fee for **access**, entirely **separate from the securities DvP** — the atomic single-transaction settlement core is untouched. **AI stays off the settlement path.**
- `ANTHROPIC_API_KEY`, party/operator tokens, and any x402 facilitator secret are **server-side only** — never in the browser bundle, never committed (secret-sweep).
- No Claude git attribution (author/committer stays `woshvad`). Design comp binding for any UI. New Daml (if any) keyless.

</domain>

<decisions>
## Implementation Decisions

### Area 1 — x402 resource server & the 402 envelope (PAY-01 core)
- **Author a dependency-light payment-gate middleware in the solver**, mirroring the `idempotency.ts` factory shape (`idempotencyMiddleware(store, opts) → RequestHandler` + `createX402Gate(...)`). **Do NOT depend on `x402-express`** — the published server middleware is EVM-scheme-oriented (EIP-3009/USDC) and does not speak a Canton Coin scheme; we stay **wire-compatible** with the x402 v2 envelope so any x402 client can pay us, without an EVM dependency. (Record this as a deviation, same register as the `zod`/`@daml/react` peer decisions.)
- **Attach** as a per-route gate on the two metered handlers (the `/fix`-style per-route middleware precedent at `api.ts:1287`), or as a global opt-in gate that self-selects the metered paths (the idempotency precedent at `api.ts:594`) — planner's choice; per-route is cleaner for two routes.
- **Unpaid request →** `402` with a JSON body carrying `accepts: [ … ]`. The **primary** `accepts` entry advertises the **real Canton Coin scheme**: `scheme` (Canton exact-transfer), `network` (a CAIP-2-style Canton id, e.g. `canton:<network>`, from `X402_NETWORK`), `payTo` (the venue party), `maxAmountRequired`/price (`X402_PRICE`), `asset` (Canton Coin), `resource` (the endpoint), plus `description`/`mimeType` per the x402 v2 spec. A **second, honestly-labeled** `accepts` entry MAY advertise the operator-custody USDCx self-settle scheme. Emit via `ApiError(402,'PAYMENT_REQUIRED',…)` or inline `res.status(402)` so the existing secret-safe error middleware (`api.ts:1471`) renders it.
- **Retried request with `X-PAYMENT`** (base64-JSON payment payload) → the gate calls `FacilitatorClient.verify()` then `.settle()` (or combined), and on success runs the wrapped handler and sets an `X-PAYMENT-RESPONSE` header (settlement ref). Invalid / insufficient / expired / absent payment → `402` (re-advertise) with a secret-free reason. The gate **never throws raw** (wrap in `ApiError`), never leaks a token/secret.
- The planner's research step must pin the **exact x402 v2 field names** (`accepts[]` shape, `X-PAYMENT` / `X-PAYMENT-RESPONSE` encoding) from the x402 v2 spec so the envelope is byte-faithful to a real x402 client.

### Area 2 — FacilitatorClient interface + two backends (the settlement swap)
- **`FacilitatorClient` interface** mirrors the x402 facilitator contract: `verify(requirements, payment) → { valid, reason? }` and `settle(requirements, payment) → { settled, txRef }`. Selected by `X402_FACILITATOR` env (`self` default | `canton-cc`). This is the same **interface-with-swappable-backend** discipline as `SecretsProvider` (env|vault) and `auth.ts` OIDC dual-mode.
- **`self` backend (default — built + offline-verified, DevNet-capable today):** the solver is its own facilitator. It verifies/settles the fee **on the Canton ledger** via the operator credential (`ledger.ts`) as a single operator-custody USDCx `Holding` transfer of `price` from the paying desk to the venue party — reusing `moveExactHolding` (`Holding.daml:109`) / `Reassign` / a one-leg `settleBatch` (`Settlement.daml:170`), exactly the `OrderCommitment.ForfeitBond` "seize a desk cash Holding to the operator" pattern (`Auction.daml:225`). No external dependency; fully unit-testable with a stubbed ledger (the project's DI convention); runs on real DevNet with Umbra's own Holdings.
  - **Custody honesty:** in this custody model the *custodian* (operator) executes the transfer on the payer's off-band authorization (the payer presents its fee-source `Holding` cid in the `X-PAYMENT` payload). Label this honestly: "operator-custody x402 — custodian-executed on presented authorization; the payer-signed variant is the `canton-cc` path." The exact mechanism (present-cid + operator-move vs a small desk-signed fee-authorization choice) is planner's discretion; default to reusing existing primitives with no new authority model.
- **`canton-cc` backend (adapter — offline-mocked, live = UAT):** POST `/verify` + `/settle` to the FTP Canton x402 facilitator (`X402_FACILITATOR_URL`, e.g. `https://dev.cantrustai.xyz/...`) to settle **real Canton Coin**. Built to the interface + wire spec; offline-tested against a **mock of the `/verify`+`/settle` contract** (stubbed `fetch`, the `tlock`/drand precedent). Live hookup (real facilitator endpoint/SDK + a CC-funded venue party on DevNet) is the UAT item.

### Area 3 — Config, gating scope, invariant safety
- **Config** follows the existing three-tier pattern (`secrets.ts` recon §5): non-secret values via `process.env.X ?? default` read in `main()` and threaded through `buildDeps`; any facilitator secret via `SecretsProvider.get()` at boot (module-private, never logged/returned). Keys: `X402_ENABLED` (default **false**), `X402_FACILITATOR` (`self`|`canton-cc`), `X402_NETWORK`, `X402_ASSET`, `X402_PRICE`, `X402_PAY_TO` (venue party), `X402_FACILITATOR_URL`, `X402_FACILITATOR_KEY` (SecretsProvider). Document each in `solver/.env.example` after the `SOLVER_PORT` block.
- **Default-OFF pass-through is the invariant guard:** with `X402_ENABLED=false` the gate is a no-op — existing endpoints + the §4 demo are byte-unchanged and still clear $100.00. Metering engages only when explicitly enabled (tests assert both off=unchanged and on=402/200).
- **Metered:** `GET /round/:id/solve-preview` (`api.ts:818`) + `POST /competing` (`api.ts:1350`) — the two explicit Claude calls. **Never metered:** `/health`, `/status`, `/status.html`, `POST /round` + lifecycle, `POST /round/:id/settle`, `/sandbox/round`, `/fix`, `/rfq*`, `/issuance*`. Note `GET /round/:id` also calls `proposeClearing` at terminal status (`api.ts:736`) — **leave it free** (it is the primary round-status read; gating it would break the demo/status flow). Settlement is never gated.
- **Payment ≠ settlement:** the x402 fee is a standalone operator-custody transfer, off the securities DvP path; the deterministic §8 clear + on-ledger `Round.Clear` remain the sole settlement authority.

### Area 4 — Client/demo surface (optional, droppable)
- **Solver-side helper:** a tiny pure function to construct a `self`-scheme `X-PAYMENT` payload (used by tests and, if shipped, the web affordance). Belongs with the x402 module; secret-free.
- **Web (OPTIONAL — decide in UI-SPEC, droppable like 13-14):** when a metered call returns `402`, an Agent-view "pay to run the solver" affordance renders the advertised price + a pay-and-retry action — the agentic-payments money shot ("the AI agent pays to compute"). Because metering is default-OFF, the canonical demo is untouched; the affordance appears only when enabled. Design-comp-faithful, minimal, credential-free (calls the solver over the single `SOLVER_BASE_URL`, no operator/facilitator secret in the bundle); lime reserved per the comp. If the UI-SPEC step doesn't justify it within budget, ship backend-only + advertise x402 availability on the existing `/status` surface.

### Claude's Discretion
- Exact module/file names (`x402.ts` gate + `facilitator.ts` / `x402-facilitator.ts`, or one module), wave ordering, and test counts (≥ project norm).
- Per-route vs global-opt-in gate attachment; combined verify+settle vs two calls.
- The precise `self`-backend authorization mechanism (present-cid + operator-move vs a desk-signed fee-authorization choice) — default to reusing existing operator-custody primitives with **no new Daml** if it holds; if a minimal keyless helper choice is cleaner, it must be keyless (LF 2.1).
- Whether to ship the web affordance now or advertise-on-status + defer (bias to a small additive Agent-view panel if the UI-SPEC clears it cheaply).

</decisions>

<code_context>
## Existing Code Insights (from the solver + cash-leg recon)

### Reusable Assets (file:line anchors)
- **Solver middleware chain** — `api.ts`: `createApp(deps)` at `api.ts:583`; chain is `express.json()` (`:585`) → `cors(:5173)` (`:588`) → idempotency (`:594`) → routes → secret-safe error mw (`:1471`). **No auth/bearer middleware** — the x402 gate is a new entry in exactly this chain. `ApiError(status,code,message)` at `api.ts:335`; `wrap()` async bridge at `api.ts:515`.
- **Middleware pattern to mirror** — `idempotency.ts`: factory `idempotencyMiddleware(store,opts) → RequestHandler` (`:79`, opt-in passthrough guards + inline `res.status(422).json({error})`) + `createIdempotency()` bundler (`:174`); wired as optional DI dep `AppDeps.idempotency?` (`api.ts:246`) defaulted in `createApp` (`api.ts:593`). Add `x402?: PaymentGate` the same way; thread through `BuildDepsArgs` (`index.ts:63`) + `buildDeps` return (`index.ts:167`).
- **Metered handlers** — `GET /round/:id/solve-preview` (`api.ts:818`, runs §8 then `deps.proposeClearing`) and `POST /competing` (`api.ts:1350`, `deps.proposeCompeting` races ≤8 Claude configs). Model `claude-haiku-4-5` (`agent.ts:134`). The AI **never throws / degrades to deterministic §8** — so the gate must block at the HTTP layer.
- **Cash/fee token** — `Holding.daml`: template `:34` (`operator` sole signatory, `owner` observer, `instrument`, `amount`, `lock`); choices `Split`/`Merge`/`Reassign` all `controller operator`; **`moveExactHolding cid qty newOwner`** helper at `:109`; implements `HoldingV1.Holding` **view interface (no choices)** at `:88`. Cash instrument = `InstrumentId operator "USDCx"` (`Instrument.daml:28`, `ledger.ts:44` `CASH_SYMBOL='USDCx'`). "Pay the venue" precedent = `OrderCommitment.ForfeitBond` `Reassign … newOwner=operator` (`Auction.daml:225`). DvP engine `settleBatch operator legs sources` (`Settlement.daml:170`).
- **Config/secrets** — plain env+default in `main()` (`index.ts:275` `roundSeconds`/`solverPort`; `DEFAULT_SOLVER_PORT=4100` `:28`); `SecretsProvider` `createSecretsProvider()` (`secrets.ts:84`, `env`|`vault`), used for `ANTHROPIC_API_KEY` at `index.ts:314`; `.env.example` documents each var. Ports: solver **:4100**, JSON Ledger API **:3975**, Vite **:5173** (sole CORS origin `api.ts:65`).
- **Web** — `web/src/solver.ts` single `SOLVER_BASE_URL` credential-free client (`call<T>()`); additive panels + pure-lib + vitest convention (e.g. `SolverLeaderboard` from 13-12).

### Established Patterns
- **Interface + swappable backend**, offline-verified default + live UAT backend: `SecretsProvider` (env|vault), `auth.ts` OIDC dual-mode, `tlock` drand-primary/offline-fallback. **x402 `FacilitatorClient` (self|canton-cc) follows this exactly.**
- **Secret-safe by construction:** secrets module-private, never returned/logged/echoed; secret-sweep tests assert sentinels absent. (Governs `X402_FACILITATOR_KEY`.)
- **Verify-don't-trust / AI off settlement:** unchanged; x402 gates *access*, not settlement.
- **DI factories + co-located vitest + zod-validated endpoints + `--legacy-peer-deps`.** Honest labeling for demo-real / external gates.

### Integration Points
- New gate + optional endpoints register on the existing Express app (`createApp(deps)`); DI wired in `index.ts` `buildDeps`.
- Fee transfer uses the existing operator credential + `Holding`/`Settlement` primitives — **no new authority model**; likely **no new Daml** (reuse `moveExactHolding`/`Reassign`/`settleBatch`).
- `canton-cc` facilitator calls go out over `fetch` to `X402_FACILITATOR_URL` (offline-mocked in tests).

</code_context>

<specifics>
## Specific Ideas
- **Advertise the REAL Canton scheme as the primary `accepts` entry** (Canton Coin, Canton network id, venue payTo) so the wire is faithful to a real x402 client; the operator-custody USDCx self-settle path is the honestly-labeled, offline-verifiable *backend* — not a different protocol.
- **Default-OFF is non-negotiable:** the money-shot demo must be provably byte-unchanged with metering off. Ship a test that asserts off ⇒ existing responses identical, on ⇒ 402 then 200-with-payment.
- The "will it work on DevNet" answer is concrete: `self` runs on DevNet today with Umbra's token; `canton-cc` settles real $CC on DevNet once the FTP facilitator + CC-funded venue party exist (same SV-sponsorship gate as Phase 12).
- x402 is the agentic-payments counterpart to the AI solver — the demo beat is "an autonomous agent pays per solve, settled on Canton."

</specifics>

<deferred>
## Deferred Ideas (UAT / external gates — built to the seam, not run live)
- **Real Canton Coin settlement** via the live FTP Canton x402 facilitator (`/verify`+`/settle`) with a CC-funded venue party on a live DevNet node — gated on the SV-sponsored connection (the Phase 12 external gate). Offline-mocked now; live = 14-UAT.md.
- **Upstream Canton x402 scheme registration / SDK adoption** if/when FTP's open-source facilitator + client SDK packages publish — swap the `canton-cc` adapter's transport for the official client behind the same interface.
- **Payer-signed wallet flow** (a desk signs the transfer via its own wallet/preapproval) — the production shape of `self`; the demo uses custodian-executed-on-presented-authorization, labeled.
- **Multi-instance / persisted payment-idempotency store** — in-memory default with a documented Postgres swap (mirrors the OPS-03 idempotency store note).

</deferred>
