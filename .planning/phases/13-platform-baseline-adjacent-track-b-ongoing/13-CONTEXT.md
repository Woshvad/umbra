# Phase 13: Platform Baseline & Adjacent — Context

**Gathered:** 2026-07-10
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss (auto-optimized — user delegated all grey-area decisions: "handle everything intelligently without my supervision"). All decisions below are Claude's recommended picks and are overridable.

<domain>
## Phase Boundary

Deliver the **operational baseline** a serious venue is assumed to have, plus the **adjacent capabilities** that widen Umbra's story — built on the CURRENT stack (Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 on :3975, solver :4100, web :5173). Eight requirements:

- **OPS-01** Observability — OpenTelemetry tracing (solver → JSON Ledger API v2 → Canton), structured logs, metrics, alerting.
- **OPS-02** Secrets → vault with rotation (out of `.env`); a **public status page** reports venue/round health.
- **OPS-03** Idempotency keys on order submission (retry never double-submits) under a round-lifecycle state machine enforcing legal transitions.
- **OPS-04** Signed, retried webhooks for round-lifecycle events (round.opened/sealed/cleared/settled, fill.posted) + a sandbox round fixed at the $100.00 fixture.
- **OPS-05** A FIX order-entry gateway so institutional desks submit sealed bids from their existing OMS.
- **ADJ-01** Competing AI solvers — N solver instances/configs ranked by matched volume / surplus, refereed by the deterministic recompute.
- **ADJ-02** An RFQ side-mode for illiquid single bonds — request a signed firm quote, settled via the same atomic Canton DvP path.
- **ADJ-03** On-chain primary bond issuance (uniform-price EasyAuction model) + a post-settlement coupon/redemption lifecycle module.

**In scope:** real, unit-tested code + config/compose for each capability, wired into the existing solver/web/Daml, following the established "Built · offline-verified · live UAT pending" pattern.

**Out of scope for this phase (external/business gates, per ROADMAP):** a cryptographer's review (gates Phase 10 crypto for real value), a KYC/AML vendor engagement (backs COMP-01), and a SOC 2 engagement. These are scheduled here but are not code — noted, not built.

**Hard invariants (never violated by any Phase 13 work):**
- The canonical §4 fixture still clears at **exactly $100.00** (A=10 / B=8 / C=2). Competing solvers, sandbox, issuance, and RFQ must not perturb it.
- `ANTHROPIC_API_KEY` and party tokens are **server-side only** — never in the browser bundle, never committed.
- AI is **never on the settlement path** — the deterministic §8 recompute + on-ledger `Round.Clear` remain the source of truth (competing solvers are additive/advisory).
- No Claude git attribution (author/committer stays `woshvad`).
- Design comp is binding for any UI surface.

</domain>

<decisions>
## Implementation Decisions

### Area 1 — Observability & Public Status (OPS-01, OPS-02 status page)
- **Tracing:** OpenTelemetry Node SDK in the solver. OTLP/http exporter driven by `OTEL_EXPORTER_OTLP_ENDPOINT`; **console-span-exporter fallback when the env var is unset** so tracing works with no collector running (dev) and against a real collector (prod/UAT). Spans nest: inbound HTTP request → §8 clear-compute → JSON Ledger API v2 exercise(s) → Claude agent call, correlated by a `round.id` attribute + W3C traceparent. The "→ Canton" leg is represented by the ledger-API **client** spans (we cannot instrument inside the Canton participant itself; label this honestly — "ledger-API client span, not in-participant").
- **Structured logs:** an in-house secret-redacting JSON logger (extends the existing secret-free logging discipline in `ledger.ts`/`agent.ts`/`api.ts`) — **no new logging dependency (no pino)**; every line is JSON with `ts`, `level`, `msg`, `round.id`/`trace.id` when available. Redaction is belt-and-suspenders: known secret keys (token/key/authorization/env) never serialized.
- **Metrics:** OTel Metrics API counters/histograms — `umbra.rounds.opened`, `umbra.clear.latency_ms`, `umbra.settle.latency_ms`, `umbra.agent.verified_total{source}`, `umbra.webhook.delivery_total{status}`. Same OTLP/console fallback as traces.
- **Alerting:** config-only — ship an alert-rules file (Prometheus/Alertmanager-style thresholds: solver-down, clear-latency-p95, webhook-failure-rate) + a `GET /health` readiness/liveness endpoint. **Live alert delivery is a UAT/ops gate**, not built live.
- **Public status page:** solver-served and **token-free** — `GET /status` (JSON: venue up/down, current round phase, last clear price/time, uptime, build/version) and `GET /status.html` (a small brand-styled static page reading `/status`). **Exposes zero private order data** (only aggregate/health). Public by design; deliberately separate from the authenticated 5-view app. Brand tokens honored (`#F4F1EA`/`#0A0A0A`/`#D6FB3C`, Space Grotesk/IBM Plex Mono) but self-contained (no auth context, no operator/desk token).

### Area 2 — Secrets/Vault + Reliability (OPS-02 vault, OPS-03 idempotency + FSM)
- **Vault:** a `SecretsProvider` abstraction with two backends selected by `SECRETS_PROVIDER` env: `env` (dev default — preserves current `.env` behavior byte-for-byte) and `vault` (HashiCorp Vault **KV v2** over HTTP, token or AppRole auth, path e.g. `secret/umbra/*`). Ship a **dev-mode Vault docker-compose service** + `.env.example` keys + a rotation script/runbook. `ANTHROPIC_API_KEY`, operator token, and party tokens are the managed secrets; the browser never receives any of them (unchanged).
- **Rotation:** a documented rotation procedure + a `rotate` script that writes a new KV version to Vault and the solver re-reads on next boot (or via an authenticated admin refresh). **Live zero-downtime rotation is a UAT item.**
- **Idempotency:** client-supplied `Idempotency-Key` header on mutating POSTs (`POST /round`, order submission, `POST /round/:id/settle`). An idempotency store keyed by `(key, sha256(body))`: a replay with the same key+body returns the **original** stored response (never re-executes); a same-key-different-body returns **422 IDEMPOTENCY_KEY_REUSED**. TTL-bounded, in-memory, with a documented Postgres-backed swap for multi-instance. Secret-safe envelope preserved.
- **Round-lifecycle FSM:** an explicit state machine `Open → Sealed(Closing) → Cleared → Settled` (+ terminal), with a single pure `transition(from, event)` that **rejects illegal transitions** (settle-before-clear, clear-before-close, double-settle → 409/CONFLICT). The **ledger `Round.status` stays authoritative**; the solver FSM is the API-layer guard so a bad client can't drive an illegal sequence. Extends `clock.ts` `RoundState` (which already tracks per-round clock state).

### Area 3 — Integration surfaces (OPS-04 webhooks + sandbox, OPS-05 FIX)
- **Webhooks:** HMAC-SHA256 signature over the raw JSON body with a per-subscription secret; headers `X-Umbra-Signature: sha256=…`, `X-Umbra-Timestamp` (replay-guard), `X-Umbra-Event`, `X-Umbra-Delivery`. At-least-once delivery with exponential backoff (≈5 attempts, jittered) + an in-memory delivery log (status/attempts/last-error). Events: `round.opened`, `round.sealed`, `round.cleared`, `round.settled`, `fill.posted`. Fired off the existing lifecycle seams (open in `index.ts`, close/clear/settle in the clock/settle path). Never leaks secrets in the payload.
- **Webhook subscriptions:** a simple registry (register URL + secret + event filter) via authenticated solver endpoints; in-memory with documented persistence swap.
- **Sandbox round:** `POST /sandbox/round` (or a `sandbox:true` flag) that **always** seeds and clears the canonical §4 fixture deterministically (A=10/B=8/C=2 @ $100.00) and settles — a stable, never-varying fixture for integration/demo, isolated from real rounds. Reuses the §8 core + settle path; asserts $100.00.
- **FIX gateway:** a **hand-rolled minimal FIX 4.4 order-entry acceptor** (dependency-light — no full FIX engine dep, consistent with the project's dep-minimalism). Application layer: parse `NewOrderSingle` (35=D) reading `55` Symbol (BONDX), `54` Side, `38` OrderQty, `44` Price, `40` OrdType → map to a sealed `Venue.SubmitOrder`; reply `ExecutionReport` (35=8, ack/reject). Minimal session layer: `Logon`(A)/`Heartbeat`(0)/`Logout`(5), monotonic `MsgSeqNum`, checksum (10) + bodylength (9) framing. **Honest labeling:** "FIX 4.4 subset — order entry only; live OMS interop is a UAT gate." Exposed over a framed TCP listener (config port) and/or an HTTP-wrapped raw-FIX endpoint for testability. Never exposes operator/Anthropic credentials.

### Area 4 — Adjacent capabilities (ADJ-01 competing solvers, ADJ-02 RFQ, ADJ-03 issuance + coupon)
- **Competing solvers:** on round close, run **N agent configs** (varying model/prompt/temperature) concurrently; each returns a proposed clearing. Rank eligible proposals by (matched volume ↓, total surplus ↓). The **deterministic §8 recompute is the referee**: only a proposal that equals the deterministic result is eligible ("verified"); the ranking picks a narrative "winner" among verified proposals. The deterministic clear still settles unconditionally — **AI stays off the settlement path**. Additive to `agent.ts` (keeps the existing single-agent `proposeClearing`; adds `proposeCompeting(views, configs)`), surfaced additively on the solver API + Agent view (a ranked leaderboard panel).
- **RFQ side-mode:** a desk posts an RFQ (instrument, side, qty) → one or more dealers respond with **signed firm quotes** modeled on-ledger (Daml `RfqRequest` + `Quote` templates; the quote is a firm, signatory-bound commitment) → the requester accepts the best quote → it **settles via the SAME atomic DvP path** (reuse the `Settlement`/`Round.Clear` machinery for a 1×1 batch). Minimal: single bond, firm quotes, no streaming. Solver orchestrates; browser surface is a minimal RFQ panel.
- **Primary issuance (uniform-price EasyAuction):** reuse the existing §8 uniform-price batch clear — an `Issuer` offers a new bond tranche (a CN-Token-Standard `Instrument`); desks submit sealed bids; the same clearing allocates the issuance at one uniform price and **mints `Holding`s** to winners. A thin `Issuance` layer over the existing `Round`/`Clearing` (not a parallel mechanism) — proves the auction engine is issuance-capable, not just secondary-market.
- **Coupon / redemption lifecycle:** post-settlement lifecycle choices on the `Instrument`/`Holding` — a `Coupon` payment choice (issuer pays cash pro-rata to current holders) + a `Redemption`/maturity choice (repay principal, retire the bond holdings). Deterministic amounts; reuses cash `Holding` transfers. Additive module; the §4 secondary-market bond is untouched.

### Claude's Discretion
- Exact file/module names, wave ordering, and test-scenario counts (≥ project norm) are at Claude's discretion during planning/execution.
- Whether webhook/idempotency/subscription stores are backed by an in-memory Map (default) vs a persisted store — default in-memory with a documented swap, unless plan research surfaces a cheap persistent option already in the stack.
- Whether the FIX acceptor ships a TCP listener, an HTTP-wrapped endpoint, or both — pick the most testable-offline option; a raw-FIX HTTP endpoint is acceptable as the primary if a TCP session is heavier than the demo needs.
- Whether competing-solvers / RFQ / status get dedicated web views vs additive panels — bias to additive panels on existing views + one standalone public status page, unless the UI-SPEC step justifies a new numbered view.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Solver (`solver/src/`, Node ESM):** `api.ts` (917 lines — Express DI factory `createApp(deps)`, the §11 endpoints on :4100, cors :5173, zod validation, secret-safe `{error:{code,message}}` envelope), `index.ts` (550 — boot/DI wiring, rehydrate-from-ledger, lifecycle seams for open/close), `ledger.ts` (816 — Operator wire layer over JSON Ledger API v2, module-private token), `clock.ts` (119 — `RoundState` clock + `openRoundClock`/`forceClose`; the natural home to extend into the OPS-03 FSM), `agent.ts` (430 — `createAgent` DI, `proposeClearing`, verify-don't-trust gate; extend for ADJ-01 competing solvers), `auth.ts` (103 — OIDC dual-mode from Phase 12; secrets seam for OPS-02), `auction.ts`/`settlement.ts` (pure §8 + netting — reuse for sandbox/issuance/RFQ), `proof.ts`/`proofpack.ts`/`brief.ts`, `topology.ts`, `tlock.ts`, `zk/`. Test convention: co-located `*.test.ts` vitest, DI-stubbed ledger + secret-sweep assertions.
- **Daml (`daml/Umbra/`):** `Instrument.daml` + `Holding.daml` (CN-Token-Standard CIP-0056 custody — extend for ADJ-03 issuance/coupon), `Settlement.daml` (Batch/Instruction — reuse for RFQ DvP), `Auction.daml`/`Clearing.daml` (`Round.Clear` + pure §8 — reuse for issuance), `Compliance.daml` (DeskEligibility gate), `Approval.daml` (four-eyes), `Roles.daml`, `Setup.daml`, `Tests.daml` (golden §4 + negatives).
- **Web (`web/src/`):** `solver.ts` (single `SOLVER_BASE_URL` client, secret-free), 10 views + Nav union + many components; `index.css` scoped brand rules. Additive panels/views follow the established `solverUrls`/pure-lib + vitest pattern.

### Established Patterns
- **Verify-don't-trust:** deterministic §8 + on-ledger `Round.Clear` are authoritative; AI is additive and off the settlement path. (Directly governs ADJ-01.)
- **Secret-safe by construction:** secrets are module-private in the solver, never returned/logged/echoed; secret-sweep tests assert sentinels absent from responses. (Directly governs OPS-01 logging + OPS-02 vault.)
- **Keyless fetch-by-ContractId (D7 Option-B):** contract keys are unsupported on Canton LF 2.1 — new Daml (RFQ, issuance, coupon) must be keyless (fetch-by-cid + assert), like `Holding`/`Instrument`.
- **DI factories + co-located vitest + zod-validated endpoints + `--legacy-peer-deps` installs** (precedent: `@anthropic-ai/sdk` peer, `@daml/react`).
- **Honest labeling for demo-real / external gates** (single-operator LocalNet, dev-token→OIDC, "subset of X").

### Integration Points
- New solver endpoints register on the existing Express app in `api.ts` (`createApp(deps)`); DI deps wired in `index.ts`.
- Lifecycle events (open/close/clear/settle) already have seams in `index.ts`/`clock.ts` — webhooks + metrics + FSM hook there.
- New Daml templates compile into the existing `umbra` DAR; web bindings regenerate via `daml codegen js` (committed `web/daml.js`, fresh-clone invariant).
- Secrets seam is `auth.ts` + wherever `ANTHROPIC_API_KEY`/operator token are read (`agent.ts`/`ledger.ts`) — route through the new `SecretsProvider`.

</code_context>

<specifics>
## Specific Ideas

- Status page must be **reachable without any token** and must **never** surface an individual order — only aggregate health + last clear price. This is the one deliberately-public surface.
- FIX and status page are the two "meet institutions where they are" surfaces; keep them honest-subset and public-health respectively.
- Sandbox round is the canonical §4 fixture as a **stable API contract** for third-party integration tests — it must be deterministic and never drift from $100.00.
- Competing-solvers output is a **narrative leaderboard**, not a settlement input — the winner is chosen among proposals that already equal the deterministic clear.

</specifics>

<deferred>
## Deferred Ideas

- **External/business gates (scheduled here, not code):** cryptographer's review (gates Phase 10 crypto for production), KYC/AML vendor (backs COMP-01), SOC 2 engagement. Documented as scheduled, not built.
- **Live ops delivery:** running OTel collector + dashboards, production Vault cluster + live zero-downtime rotation, live alert delivery, a real counterparty FIX OMS handshake — these are UAT/ops gates; Phase 13 builds the instrumentation/abstraction/acceptor + config, verified offline.
- **Multi-instance persistence:** Postgres-backed idempotency/webhook/subscription stores — documented swap; default in-memory for the single-operator demo.
- Anything requiring a live SV-sponsored DevNet connection (Phase 12's external gate) — Phase 13 code runs on LocalNet; real-DevNet run is the Phase 12 UAT.

</deferred>
