# Phase 13: Platform Baseline & Adjacent — Research

**Researched:** 2026-07-10
**Domain:** Node/TS service hardening (observability, secrets, reliability, integration protocols) + adjacent Daml capabilities (competing solvers, RFQ, primary issuance) on the CURRENT Umbra stack (Daml 3.4.11 / Canton 3.4 LocalNet / JSON Ledger API v2 · solver Node 20 ESM :4100 · React 18 web :5173)
**Confidence:** HIGH on solver/TS surfaces (grounded in the existing codebase + verified npm versions); MEDIUM on the Daml issuance/coupon templates (novel additive templates, verified against existing keyless patterns but not yet compiled); MEDIUM on FIX 4.4 framing (hand-rolled, well-specified but no in-repo precedent)

## Summary

Phase 13 is overwhelmingly **additive TypeScript on the existing solver DI spine** plus **three new keyless Daml modules**. Nothing here changes the §8 clearing math, the `Round.Clear` settlement path, or the §4 fixture ($100.00 · A=10/B=8/C=2). Every requirement plugs into an already-established seam: `createApp(deps)` in `api.ts` for new endpoints, `AppDeps` DI for new capabilities, the `clock.ts` lifecycle for FSM/webhook/metrics hooks, `agent.ts` for competing solvers, and the `Holding`/`Instrument`/`Settlement` templates for RFQ and issuance.

The single most important discipline carries straight through from Phases 4–12: **secrets are module-private, verify-don't-trust, AI off the settlement path, everything unit-tested with co-located `*.test.ts` + secret-sweep, honest "Built · offline-verified · live UAT pending" labeling.** Most of Phase 13's live behavior (OTel collector, real Vault cluster, a counterparty FIX OMS, live alert delivery) is external infra — those are UAT/ops gates; Phase 13 builds the instrumentation, abstraction, and acceptor + config, verified offline.

**Primary recommendation:** Build each requirement as an additive module with a DI factory + co-located vitest, wire it through the existing `AppDeps`/`createApp`/`index.ts` spine, and gate every externally-verifiable behavior as UAT. Use the official CNCF OpenTelemetry packages for OPS-01; hand-roll everything else (idempotency store, FSM, webhooks, FIX, `SecretsProvider`) to honor dependency-minimalism. The three new Daml templates (`Rfq`, `Issuance`, coupon choices) must be **keyless** (fetch-by-ContractId + assert), reusing `Settlement.settleBatch` for DvP.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OTel tracing/metrics (OPS-01) | Solver (Node) | — | Instrumentation lives where the request→clear→exercise→agent path runs; the "→ Canton" leg is a ledger-API **client** span, not in-participant |
| Structured logging (OPS-01) | Solver (Node) | — | In-house secret-redacting JSON logger; no browser logging |
| Alert rules (OPS-01) | Config/Static | Ops (UAT) | A committed Prometheus/Alertmanager YAML; live delivery is ops infra |
| SecretsProvider + Vault (OPS-02) | Solver (Node) | Infra (docker-compose) | Credential resolution is server-side only; Vault dev server is a compose service |
| Public status page (OPS-02) | Frontend Server (solver-served) | Static HTML | Token-free aggregate health; deliberately separate from the authenticated app |
| Idempotency store + FSM (OPS-03) | Solver (API) | — | API-layer guards; ledger `Round.status` stays authoritative |
| Webhooks + sandbox (OPS-04) | Solver (Node) | — | Fired off lifecycle seams; sandbox reuses §8 + settle |
| FIX gateway (OPS-05) | Solver (Node, TCP/HTTP) | — | A protocol acceptor that maps to `Venue.SubmitOrder`; runs beside the HTTP API |
| Competing solvers (ADJ-01) | Solver (agent.ts) | — | Advisory ranking; deterministic §8 is the referee; AI never settles |
| RFQ templates + accept (ADJ-02) | Database/Ledger (Daml) | Solver (orchestration) | Firm signed quote is on-ledger; settles via the same `settleBatch` DvP |
| Issuance + coupon (ADJ-03) | Database/Ledger (Daml) | Solver (orchestration) | Uniform-price mint + lifecycle choices reuse `Holding`/§8 |

## Standard Stack

### Core (new dependencies — OPS-01 only; everything else hand-rolled per dependency-minimalism)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentelemetry/api` | `1.9.1` | Trace/metrics API surface (spans, counters, histograms) | The stable, canonical CNCF API; decouples instrumentation from SDK `[VERIFIED: npm registry — 61.5M weekly dl, official open-telemetry org]` |
| `@opentelemetry/sdk-node` | `0.220.0` | `NodeSDK` bootstrap (tracer + meter providers, resource, exporters) | The official one-call Node bootstrap `[VERIFIED: npm registry — 13M weekly dl]` |
| `@opentelemetry/exporter-trace-otlp-http` | `0.220.0` | OTLP/HTTP span exporter (driven by `OTEL_EXPORTER_OTLP_ENDPOINT`) | Canonical OTLP exporter `[VERIFIED: npm registry — 21.9M weekly dl]` |
| `@opentelemetry/exporter-metrics-otlp-http` | `0.220.0` | OTLP/HTTP metric exporter | Pairs with the trace exporter on the same endpoint `[VERIFIED: npm registry]` |
| `@opentelemetry/sdk-metrics` | `2.9.0` | `ConsoleMetricExporter` + `PeriodicExportingMetricReader` for the console fallback | Stable metrics SDK; provides the no-collector dev path `[VERIFIED: npm registry]` |

> **Console fallback (locked decision):** `ConsoleSpanExporter` ships inside `@opentelemetry/sdk-trace-base` (transitively present via `sdk-node`) and `ConsoleMetricExporter` inside `@opentelemetry/sdk-metrics`. When `OTEL_EXPORTER_OTLP_ENDPOINT` is UNSET, wire the console exporters so tracing/metrics work with no collector running. `[CITED: opentelemetry.io/docs/languages/js/getting-started/nodejs]`

### Supporting (optional / discretionary)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@opentelemetry/auto-instrumentations-node` | `0.78.0` | Auto-instrument http/express/fetch | OPTIONAL — the manual spans (request→clear→exercise→agent) are the load-bearing requirement; auto-instr is convenience only. Adds a large transitive tree — prefer `@opentelemetry/instrumentation-http` (`0.220.0`) alone or skip and hand-instrument. `[ASSUMED — evaluate tree weight before adding]` |

**Do NOT add:** `pino`/`winston` (OPS-01 logging is explicitly in-house, locked), any FIX-engine npm (`quickfix`, `jspurefix` — OPS-05 is hand-rolled, locked), a Vault SDK (`node-vault` — use the KV v2 HTTP API via `fetch`, consistent with `auth.ts`/`ledger.ts` raw-fetch style).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@opentelemetry/sdk-node` NodeSDK | Manual `NodeTracerProvider` + `MeterProvider` wiring | NodeSDK is fewer moving parts and the documented path; manual wiring only if the NodeSDK's auto-detected resource/instrumentation is unwanted |
| Hand-rolled FIX over raw TCP | HTTP-wrapped raw-FIX endpoint | **Pick HTTP-wrapped as primary** (offline-testable with supertest/fetch, no socket lifecycle in vitest); a TCP `net.Server` listener is a thin optional add. CONTEXT gives Claude discretion here. |
| In-memory idempotency/webhook/subscription stores | Postgres-backed | In-memory is the locked default (single-operator demo); document the Postgres swap. LocalNet already runs Postgres for Canton, so the swap is cheap but out of scope. |
| `node-vault` client | Vault KV v2 raw HTTP (`GET /v1/secret/data/umbra/<key>`) | Raw fetch matches the project's zero-heavy-dep credential style and is trivially mockable in vitest |

**Installation (OPS-01 only):**
```bash
cd solver && npm install --legacy-peer-deps \
  @opentelemetry/api@1.9.1 \
  @opentelemetry/sdk-node@0.220.0 \
  @opentelemetry/exporter-trace-otlp-http@0.220.0 \
  @opentelemetry/exporter-metrics-otlp-http@0.220.0 \
  @opentelemetry/sdk-metrics@2.9.0
```
`--legacy-peer-deps` per the established convention (`@anthropic-ai/sdk`/`@daml/react` precedent). Verify no peer conflict with `@anthropic-ai/sdk@0.106.0` at install time.

**Version verification (run in-session before install):**
```bash
npm view @opentelemetry/sdk-node version    # confirmed 0.220.0 (2026-07-02)
npm view @opentelemetry/api version         # confirmed 1.9.1 (2026-05-01)
```

## Package Legitimacy Audit

> slopcheck was **unavailable** at research time (`slopcheck ABSENT`, pip install not attempted in sandbox). Per protocol, the packages below are strongly corroborated by registry signals (official `open-telemetry` CNCF org scope, tens-of-millions weekly downloads, canonical source repo) but are formally tagged for a **single** planner-inserted `checkpoint:human-verify` before the OPS-01 install task. This is strictly safer than baseline.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@opentelemetry/api` | npm | ~6 yrs | 61.5M/wk | github.com/open-telemetry/opentelemetry-js | n/a (absent) | Approved — checkpoint |
| `@opentelemetry/sdk-node` | npm | ~5 yrs | 13.1M/wk | github.com/open-telemetry/opentelemetry-js | n/a | Approved — checkpoint |
| `@opentelemetry/exporter-trace-otlp-http` | npm | ~4 yrs | 21.9M/wk | github.com/open-telemetry/opentelemetry-js | n/a | Approved — checkpoint |
| `@opentelemetry/exporter-metrics-otlp-http` | npm | ~4 yrs | (high) | github.com/open-telemetry/opentelemetry-js | n/a | Approved — checkpoint |
| `@opentelemetry/sdk-metrics` | npm | ~5 yrs | (high) | github.com/open-telemetry/opentelemetry-js | n/a | Approved — checkpoint |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none — but all tagged `[ASSUMED]` pending the single verify checkpoint because slopcheck could not run. No `postinstall` scripts observed on the OTel packages (verify `npm view <pkg> scripts.postinstall` returns empty at install time).

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
   FIX OMS ──raw FIX──▶   │  FIX acceptor (OPS-05)                        │
   (TCP/HTTP)             │  parse 35=D → Venue.SubmitOrder → 35=8 report │
                          └───────────────┬─────────────────────────────┘
                                          │
   Browser :5173 ──HTTP──▶ ┌──────────────▼──────────────────────────────┐
                           │  Express createApp(deps)  (solver :4100)     │
   Idempotency-Key header ▶│  ┌── idempotency mw (OPS-03) ──┐             │
                           │  │  key+sha256(body) store      │             │
                           │  └──────────────┬──────────────┘             │
                           │   FSM guard (OPS-03): Open→Sealed→Cleared→Settled
                           │        │                                     │
                           │  ┌─────▼──── span: request (OPS-01) ────────┐│
                           │  │  span: §8 clear-compute (auction.ts)     ││
                           │  │  span: JSON Ledger API v2 exercise ──────┼┼──▶ Canton participant :3975
                           │  │        (ledger.ts, CLIENT span)          ││    (Round.Clear / settleBatch)
                           │  │  span: Claude agent (agent.ts) ──────────┼┼──▶ Anthropic API
                           │  └──────────────┬───────────────────────────┘│
                           │   metrics: counters/histograms (OPS-01)      │
                           │   webhook emit (OPS-04) off lifecycle seam ──┼──▶ subscriber URLs (HMAC-signed, retried)
                           │   GET /status /status.html (OPS-02, token-free)
                           └──────────────┬──────────────┬────────────────┘
                                          │              │
              SecretsProvider (OPS-02) ◀──┘              └──▶ OTel exporter
              env | vault (KV v2 HTTP)                        OTLP if OTEL_EXPORTER_OTLP_ENDPOINT set,
              docker-compose vault dev                        else ConsoleSpanExporter/ConsoleMetricExporter

   Competing solvers (ADJ-01): agent.ts proposeCompeting(views, configs[]) → rank verified proposals
   RFQ (ADJ-02) / Issuance+Coupon (ADJ-03): new keyless Daml templates → reuse Settlement.settleBatch DvP
```

### Component Responsibilities

| File (new or extended) | Requirement | Responsibility |
|------------------------|-------------|----------------|
| `solver/src/telemetry.ts` (new) | OPS-01 | NodeSDK init, exporter selection (OTLP vs console), span helpers, meter + instruments |
| `solver/src/logger.ts` (new) | OPS-01 | Secret-redacting JSON logger (`ts/level/msg/round.id/trace.id`), no deps |
| `alerts/umbra-rules.yml` (new, config) | OPS-01 | Prometheus/Alertmanager thresholds (committed, not delivered live) |
| `solver/src/secrets.ts` (new) | OPS-02 | `SecretsProvider` interface + `env` + `vault` backends |
| `solver/src/status.ts` (new) | OPS-02 | `/status` JSON + `/status.html` builders (pure, token-free) |
| `solver/src/idempotency.ts` (new) | OPS-03 | Store keyed by `(key, sha256(body))`; Express middleware |
| `solver/src/fsm.ts` (new) or extend `clock.ts` | OPS-03 | Pure `transition(from, event)` rejecting illegal transitions |
| `solver/src/webhooks.ts` (new) | OPS-04 | HMAC signing, subscription registry, retry/backoff, delivery log |
| `solver/src/fix.ts` (new) | OPS-05 | FIX 4.4 subset: framing (9/10), parse 35=D, emit 35=8, session A/0/5 |
| `daml/Umbra/Rfq.daml` (new) | ADJ-02 | Keyless `RfqRequest` + `Quote` templates + accept choice |
| `daml/Umbra/Issuance.daml` (new) | ADJ-03 | Uniform-price primary issuance over §8 + coupon/redemption choices |
| `agent.ts` (extend) | ADJ-01 | `proposeCompeting(views, configs)` — additive to `proposeClearing` |

### Recommended Project Structure
```
solver/src/
├── telemetry.ts        # OPS-01 NodeSDK + span/metric helpers   (+ telemetry.test.ts)
├── logger.ts           # OPS-01 secret-redacting JSON logger     (+ logger.test.ts)
├── secrets.ts          # OPS-02 SecretsProvider (env|vault)       (+ secrets.test.ts)
├── status.ts           # OPS-02 /status + /status.html builders   (+ status.test.ts)
├── idempotency.ts      # OPS-03 store + middleware                (+ idempotency.test.ts)
├── fsm.ts              # OPS-03 round-lifecycle transition guard  (+ fsm.test.ts)
├── webhooks.ts         # OPS-04 sign/retry/registry/log           (+ webhooks.test.ts)
├── fix.ts              # OPS-05 FIX 4.4 subset acceptor           (+ fix.test.ts)
├── competing.ts        # ADJ-01 ranking (or fold into agent.ts)   (+ competing.test.ts)
└── (extend) api.ts index.ts agent.ts ledger.ts clock.ts
alerts/umbra-rules.yml               # OPS-01 config
daml/Umbra/Rfq.daml                  # ADJ-02  (+ Tests.daml scenarios)
daml/Umbra/Issuance.daml             # ADJ-03  (+ Tests.daml scenarios)
```

### Pattern 1: NodeSDK init with OTLP-or-console fallback (OPS-01)
**What:** Initialize telemetry ONCE at boot, before other imports evaluate, selecting exporter by env.
**When to use:** `solver/src/telemetry.ts`, imported first in `index.ts` `main()`.
```typescript
// Source: opentelemetry.io/docs/languages/js/getting-started/nodejs (adapted, ESM)
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'

const otlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
const traceExporter = otlp ? new OTLPTraceExporter() : new ConsoleSpanExporter()
const metricExporter = otlp ? new OTLPMetricExporter() : new ConsoleMetricExporter()

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({ 'service.name': 'umbra-solver' }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({ exporter: metricExporter }),
})
sdk.start()  // call before creating spans; sdk.shutdown() on SIGTERM
```
> NOTE: OTLP exporters read `OTEL_EXPORTER_OTLP_ENDPOINT` automatically (no explicit `url:` needed). Verify the exact resource helper name (`resourceFromAttributes`) against the installed `@opentelemetry/resources` version — the API around `Resource` changed across 1.x→2.x; `[CITED: opentelemetry.io/docs/languages/js]`, confirm at implement time.

### Pattern 2: Manual nested spans with a round.id attribute (OPS-01)
```typescript
// Source: @opentelemetry/api trace API
import { trace, SpanStatusCode } from '@opentelemetry/api'
const tracer = trace.getTracer('umbra-solver')

async function settleWithSpans(roundId: string) {
  return tracer.startActiveSpan('round.settle', async (span) => {
    span.setAttribute('round.id', roundId)   // correlation key across all child spans
    try {
      const det = tracer.startActiveSpan('clear.compute', (s) => { const r = computeClearing(views); s.end(); return r })
      // ledger.ts exercise = a CLIENT span (label honestly: not in-participant)
      await tracer.startActiveSpan('ledger.exercise', async (s) => { s.setAttribute('span.kind','client'); await settle(roundId); s.end() })
      // agent call span (agent.ts already off the settlement path)
      span.end()
    } catch (e) { span.setStatus({ code: SpanStatusCode.ERROR }); span.end(); throw e }
  })
}
```
Instruments (OTel Metrics API): `meter.createCounter('umbra.rounds.opened')`, `meter.createHistogram('umbra.clear.latency_ms')`, `meter.createHistogram('umbra.settle.latency_ms')`, `meter.createCounter('umbra.agent.verified_total')` (attr `{source}`), `meter.createCounter('umbra.webhook.delivery_total')` (attr `{status}`).

### Pattern 3: Secret-redacting JSON logger, zero-dep (OPS-01)
```typescript
// solver/src/logger.ts — no pino; mirrors the secret-free discipline in agent.ts/ledger.ts
const SECRET_KEYS = /^(.*token.*|.*key.*|authorization|cookie|secret|password|env)$/i
const redact = (o: unknown): unknown =>
  o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v)]))
    : o
export const log = (level: string, msg: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(fields) }))
```
Correlate with `trace.getActiveSpan()?.spanContext().traceId` to add `trace.id` when present. The redaction is **belt-and-suspenders** — the primary guarantee remains that secrets are never passed into log fields (existing discipline).

### Pattern 4: Idempotency middleware keyed by (key, sha256(body)) (OPS-03)
```typescript
// solver/src/idempotency.ts
import { createHash } from 'node:crypto'
type Entry = { bodyHash: string; status: number; body: unknown; at: number }
const store = new Map<string, Entry>()   // in-memory (documented Postgres swap)
const TTL_MS = 24 * 3600_000
export const idempotency = (req, res, next) => {
  const key = req.header('Idempotency-Key')
  if (!key || req.method !== 'POST') return next()
  const bodyHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex')
  const prior = store.get(key)
  if (prior) {
    if (prior.bodyHash !== bodyHash)
      return res.status(422).json({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Idempotency-Key reused with a different body' } })
    return res.status(prior.status).json(prior.body)   // replay the ORIGINAL response
  }
  // capture res.json to store the first response, then next()
  ...
}
```
> **Pitfall:** requires `express.json()` to run BEFORE the middleware (it does — `app.use(express.json())` is first). For byte-exact body hashing prefer hashing the parsed body deterministically, or capture the raw body — the parsed-JSON hash is acceptable here since clients send JSON.

### Pattern 5: Round-lifecycle FSM (OPS-03) — extend clock.ts RoundStatus
```typescript
// pure transition; ledger Round.status stays authoritative, this is the API-layer guard
const LEGAL: Record<RoundStatus, RoundStatus[]> = {
  Open: ['Closed'], Closed: ['Cleared'], Cleared: ['Settled'], Settled: [],
}
export const transition = (from: RoundStatus, to: RoundStatus): RoundStatus => {
  if (!LEGAL[from].includes(to)) throw new ApiError(409, 'ILLEGAL_TRANSITION', `cannot go ${from}→${to}`)
  return to
}
```
Note the existing `clock.ts` states are `Open | Closed | Cleared | Settled` — CONTEXT names them `Open → Sealed → Cleared → Settled`. **Reconcile:** treat `Sealed` as the label for the ledger `Closed` state (the window is sealed at close). Keep the wire/ledger enum as `Closed` (byte-compat with `ledger.ts`/Daml `RoundStatus`), and if a `Sealed` alias is surfaced, map it in the FSM/status layer only — do NOT rename the Daml `RoundStatus` (that would ripple through `web/daml.js` and every test).

### Pattern 6: HMAC-SHA256 webhook signing (OPS-04, Stripe-style)
```typescript
// solver/src/webhooks.ts
import { createHmac, timingSafeEqual } from 'node:crypto'
const sign = (secret: string, ts: string, rawBody: string) =>
  'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
// headers: X-Umbra-Signature, X-Umbra-Timestamp, X-Umbra-Event, X-Umbra-Delivery
// retry: ~5 attempts, exponential backoff w/ jitter; delivery log {status,attempts,lastError}
```
> **Pitfall:** the receiver verifies over the RAW body, so if a future receiver is added inside this app it must use `express.raw` on that route. For OUTBOUND webhooks (our case) we control serialization — sign the exact string we POST. Never include secrets in the payload; the signature secret is per-subscription and never echoed.

### Pattern 7: Hand-rolled FIX 4.4 order-entry subset (OPS-05)
```
Framing (SOH = \x01):
  8=FIX.4.4 | 9=<BodyLength> | 35=<MsgType> | ...fields... | 10=<CheckSum>
  BodyLength(9)  = byte count from after "9=<n>\x01" up to and incl. the SOH before "10="
  CheckSum(10)   = (sum of all bytes up to and incl. the SOH before "10=") mod 256, 3-digit zero-padded
NewOrderSingle (35=D): 55=Symbol(BONDX) 54=Side(1 Buy/2 Sell) 38=OrderQty 44=Price 40=OrdType(2 Limit)
  → map to a sealed Venue.SubmitOrder (Buy/Sell, qty, limit)
ExecutionReport (35=8): 37 OrderID 39 OrdStatus(0 New / 8 Rejected) 150 ExecType 17 ExecID
Session: Logon(35=A)/Heartbeat(35=0)/Logout(35=5); monotonic 34=MsgSeqNum; 49 SenderCompID / 56 TargetCompID
```
> **Locked design decision:** ship the **HTTP-wrapped raw-FIX endpoint as the primary** (POST a raw FIX string, get a raw ExecutionReport string) — it is fully offline-testable in vitest with no socket lifecycle. A `net.Server` TCP listener is an optional thin add. Honest label: "FIX 4.4 subset — order entry only; live OMS interop is a UAT gate." Parse and re-serialize are pure functions (`parseFix`, `buildFix`, `bodyLength`, `checkSum`) — unit-test the checksum/bodylength against a known-good reference message.

### Pattern 8: Competing solvers ranking (ADJ-01) — additive to agent.ts
```typescript
// proposeCompeting runs N configs concurrently; deterministic §8 is the REFEREE.
// A proposal is ELIGIBLE/verified ONLY if it equals the deterministic result (priceEqual && allocationsEqual — reuse agent.ts predicates).
// Rank eligible proposals by (matchedVolume desc, surplus desc) for a NARRATIVE leaderboard.
// The deterministic clear STILL settles unconditionally — AI never on the settlement path.
export const proposeCompeting = async (views, configs) => {
  const det = computeClearing(views)
  const results = await Promise.all(configs.map(cfg => runOne(cfg, views)))  // reuse proposeClearing internals per cfg
  const verified = results.filter(r => r.verified)   // equal-to-deterministic only
  return { winner: rank(verified)[0] ?? null, leaderboard: rank(verified), deterministic: det }
}
```
Each `runOne` reuses the existing verify gate; a failing/timeout config degrades to `verified:false` (excluded from ranking), never throws. Surface additively on the Agent view as a ranked leaderboard panel.

### Anti-Patterns to Avoid
- **Renaming the Daml `RoundStatus` enum** to add `Sealed` — ripples through `web/daml.js`, `ledger.ts`, every `daml test`. Keep `Closed`; alias `Sealed` only at the API/status label layer.
- **Adding contract keys** to the new `Rfq`/`Issuance` templates — UNSUPPORTED on LF 2.1 (D7). Use fetch-by-ContractId + `assertMsg`.
- **Putting the AI on the settlement/issuance/RFQ path** — competing solvers rank; the deterministic §8 + `Round.Clear` settle. Same for issuance clearing (deterministic uniform price).
- **Logging `err.message` / raw objects** in any new module — mirror agent.ts: log a fixed string + `err.name` only.
- **Returning secrets from `SecretsProvider`** in a way that lands in a response — keep resolved secrets module-private, exactly like `ledger.ts` `_operatorToken` and `auth.ts` `oidcClientSecret`.
- **Serving private order data on `/status`** — token-free page exposes ONLY aggregate health + last clear price (never an individual order).
- **A heavy FIX engine** or a Vault SDK — hand-roll / raw HTTP per dependency-minimalism.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distributed tracing / metrics plumbing | A custom span/exporter format | OpenTelemetry SDK (OPS-01) | OTLP is the industry standard; a collector/Grafana can consume it directly at UAT |
| HMAC / SHA-256 / timing-safe compare | A custom crypto routine | `node:crypto` (`createHmac`, `createHash`, `timingSafeEqual`) | Stdlib, already used across the repo (proof.ts, zk) |
| DvP atomic settlement for RFQ/issuance | A new settlement mechanism | `Umbra.Settlement.settleBatch` + `Round.Clear` machinery | Atomicity = Daml transactionality; reuse the proven, tested path |
| Uniform-price clearing for issuance | A parallel issuance auction | The existing §8 `computeClearing`/`coreClear` | "Proves the auction engine is issuance-capable, not a parallel mechanism" (CONTEXT) |
| JSON schema validation of inbound bodies | Manual field checks | `zod` (already pinned 3.23.8) | Established convention across every endpoint |

**Key insight:** Everything except OTel is *deliberately* hand-rolled here — but the hand-rolled pieces (FIX, idempotency, webhooks, FSM, SecretsProvider) are small, pure, and testable. The one place to NOT hand-roll is observability, where OTLP interop is the whole point.

## Runtime State Inventory

> Phase 13 is additive, not a rename/refactor. This inventory covers new runtime state Phase 13 *introduces* (relevant for the FSM/idempotency/webhook stores and secrets migration).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New in-memory stores: idempotency `Map`, webhook subscription registry `Map`, delivery log `Map`. All process-local, TTL-bounded. | None persistent — documented Postgres swap is out of scope; each resets on solver restart (acceptable for single-operator demo) |
| Live service config | OTel collector endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`), Vault dev server (docker-compose), alert-rules file consumed by a Prometheus/Alertmanager NOT run in-repo | All UAT/ops gates — config shipped, live delivery deferred |
| OS-registered state | None — no new OS-level tasks/services beyond the existing LocalNet docker compose | None (the Vault service is added to the existing compose, not a new OS registration) |
| Secrets/env vars | New env: `SECRETS_PROVIDER` (env\|vault), `VAULT_ADDR`, `VAULT_TOKEN`/AppRole vars, `OTEL_EXPORTER_OTLP_ENDPOINT`, `FIX_PORT`, webhook subscription secrets. Existing `ANTHROPIC_API_KEY`/operator token now resolved THROUGH `SecretsProvider` (env backend preserves current `.env` behavior byte-for-byte). | Add keys to `solver/.env.example`; the `env` backend must be default so nothing breaks when Vault is absent |
| Build artifacts | New OTel deps in `solver/package.json`/`node_modules`; no generated-binding regen UNLESS ADJ-02/03 add Daml templates → then `daml codegen js` regenerates + commits `web/daml.js` (fresh-clone invariant) | Regenerate + commit `web/daml.js` after any `daml/Umbra/*.daml` addition (Rfq, Issuance) |

**Nothing found in category (OS-registered state):** None — verified by inspecting `scripts/localnet/` (all docker-compose driven; no Task Scheduler / systemd registration introduced by Phase 13).

## Common Pitfalls

### Pitfall 1: NodeSDK started too late / ESM import ordering
**What goes wrong:** Spans are dropped or auto-instrumentation misses modules loaded before `sdk.start()`.
**Why:** OTel patches modules at require/import time; in ESM the SDK should start before instrumented modules evaluate.
**How to avoid:** `import './telemetry.js'` as the FIRST import in `index.ts` `main()` and call `sdk.start()` at module top; call `sdk.shutdown()` on `SIGTERM`. For manual spans (the load-bearing requirement) ordering matters less, but keep init first anyway.
**Warning signs:** empty console-exporter output, missing parent-child nesting.

### Pitfall 2: OTLP exporter API drift across the 0.2xx experimental line
**What goes wrong:** Exporter constructor / resource helper signatures changed between minor versions (the `0.2xx` experimental line moves fast; `Resource` → `resourceFromAttributes`).
**Why:** OTel JS metrics/exporters are on the experimental version track (`0.220.0`), the API on stable `2.x`/`1.9.x`.
**How to avoid:** Pin exact versions (done); confirm the exact `resourceFromAttributes`/`ConsoleSpanExporter` import paths against the installed package's `.d.ts` at implement time; the `sdk.start()` return type changed (void vs Promise) across versions.
**Warning signs:** TS type errors on `NodeSDK({...})`, `resource` shape mismatch.

### Pitfall 3: FIX BodyLength/CheckSum off-by-one
**What goes wrong:** BodyLength counts the wrong byte range; CheckSum includes/excludes the wrong terminator.
**Why:** The spec ranges are precise: BodyLength = bytes after `9=<n>\x01` up to and including the `\x01` before `10=`; CheckSum = sum of all bytes up to and including the `\x01` before `10=`, mod 256, 3-digit zero-padded.
**How to avoid:** Unit-test against a canonical known-good FIX 4.4 NewOrderSingle with a precomputed checksum; assert round-trip `buildFix(parseFix(m)) === m`.
**Warning signs:** an OMS rejects with "CheckSum(10) verification failed" (a UAT symptom — offline the test vector catches it).

### Pitfall 4: Idempotency body-hash instability
**What goes wrong:** `JSON.stringify` key ordering differs, producing a different `sha256(body)` for the "same" body → false 422.
**Why:** Object key order in JSON is not canonical.
**How to avoid:** Hash the raw request body bytes (capture via a small raw-capture) OR canonicalize (sorted keys) before hashing. Given clients here are our own web/FIX layers, a documented canonicalization is sufficient; note it in tests.
**Warning signs:** legitimate retries returning `IDEMPOTENCY_KEY_REUSED`.

### Pitfall 5: FSM label vs ledger enum divergence (Sealed vs Closed)
**What goes wrong:** Introducing a `Sealed` state into the wire/Daml enum breaks `web/daml.js` decode + every settled-round test.
**Why:** The ledger/TS enum is `Open|Closed|Cleared|Settled` (Daml `RoundStatus`); CONTEXT's `Sealed` is a UX label for `Closed`.
**How to avoid:** Keep the authoritative enum unchanged; treat `Sealed` as a display alias in `fsm.ts`/`status.ts` only.
**Warning signs:** `daml codegen js` diff churn, RoundStatus decode errors in web.

### Pitfall 6: §4 fixture perturbation via new capabilities
**What goes wrong:** Sandbox/issuance/RFQ/competing-solvers subtly change the canonical clear.
**Why:** Shared helpers (`computeClearing`, `settleBatch`) touched incorrectly.
**How to avoid:** Every new module is ADDITIVE — the sandbox round ASSERTS $100.00/A=10/B=8/C=2; keep `auction.ts`/`Clearing.daml`/`Round.Clear` byte-unchanged; run the existing golden vitest + `daml test` as the regression gate (CI already does — 08-01).
**Warning signs:** the golden §4 test fails; `daml test` non-zero exit.

### Pitfall 7: Secret leakage through new surfaces (status page, webhooks, FIX, OTel)
**What goes wrong:** A token/key lands in a `/status` field, a webhook payload, a FIX report, or an OTel span attribute / log line.
**Why:** New serialization surfaces are new leak vectors.
**How to avoid:** Extend the existing secret-sweep test discipline to EVERY new endpoint/emitter (assert the `ANTHROPIC_API_KEY`/operator-token sentinels are absent from `/status`, webhook bodies, FIX reports, span attributes, and log output). The redacting logger is belt-and-suspenders on top.
**Warning signs:** a secret-sweep assertion fails.

## Code Examples

See Patterns 1–8 above (each grounded in the existing codebase conventions or cited OTel docs). Additional Daml sketch for ADJ-02/03:

### RFQ templates (ADJ-02) — keyless, firm signed quote
```daml
-- daml/Umbra/Rfq.daml  (keyless — fetch-by-cid + assert, D7)
template RfqRequest with
    operator : Party
    requester : Party
    instrument : InstrumentId
    side : Side           -- reuse Clearing.Side
    quantity : Int
  where
    signatory operator, requester
    observer ...          -- dealers who may quote (explicit observer set = the privacy control)

    choice AcceptQuote : ContractId ...  -- requester accepts best quote
      with quoteCid : ContractId Quote
      controller requester
      do
        q <- fetch quoteCid              -- keyless fetch + assert
        assertMsg "quote instrument mismatch" (q.instrument == instrument)
        -- settle the 1×1 batch via Umbra.Settlement.settleBatch (SAME atomic DvP path)
        ...

template Quote with        -- a FIRM, signatory-bound commitment
    operator : Party
    dealer : Party
    requester : Party
    instrument : InstrumentId
    price : Decimal
    quantity : Int
  where
    signatory operator, dealer   -- dealer signs → the quote is firm (binding)
    observer requester
```

### Issuance + coupon (ADJ-03) — uniform-price mint reusing §8
```daml
-- Issuer offers a tranche; desks bid; the SAME §8 clear allocates at one uniform price;
-- winners get Holdings minted (create Holding with operator, owner=winner, instrument=bond).
-- Post-settlement lifecycle choices on Instrument/Holding:
--   choice Coupon    — issuer pays cash pro-rata to current holders (deterministic amounts, reuse cash Holding transfers)
--   choice Redeem    — repay principal at maturity, retire the bond Holdings
-- Reuse computeClearing for the uniform issuance price; NEVER a parallel mechanism.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Resource` class constructor | `resourceFromAttributes(...)` helper | OTel JS 1.x→2.x | Confirm import at implement time (Pitfall 2) |
| Legacy Daml 2.x HTTP JSON API v1 (`@daml/ledger`) | JSON Ledger API v2 (`/v2/commands/submit-and-wait`) | Repo migrated Phases 11–12 | New Daml templates address by `#umbra:Module:Entity`; Int/Decimal in as numbers, out as strings |
| Daml Finance library | CN Token Standard (CIP-0056) `splice-api-token-*` | Repo (D13) | ADJ-03 issuance mints `Holding` conforming to `HoldingV1.Holding`, not a Finance `Instrument` |
| Contract keys | Keyless fetch-by-ContractId + assert | LF 2.1 (D7) | ADJ-02/03 templates MUST be keyless |

**Deprecated/outdated:**
- Package-id template reference form → use package-NAME form `#umbra:...` (deprecated in 3.4).
- `output_format` top-level Anthropic param → `output_config.format` (already handled in agent.ts).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@opentelemetry/auto-instrumentations-node` is optional; manual spans satisfy OPS-01 | Standard Stack | Low — manual spans are the locked requirement; auto-instr is convenience |
| A2 | `resourceFromAttributes` / `ConsoleSpanExporter` import paths hold at `sdk-node@0.220.0` | Pattern 1 / Pitfall 2 | Medium — API drift on the 0.2xx line; verify against installed `.d.ts` |
| A3 | slopcheck-unavailable OTel packages are legitimate (official CNCF org) | Package Legitimacy Audit | Low — 61M/13M/21M weekly downloads, canonical repo; planner adds one verify checkpoint |
| A4 | HTTP-wrapped raw-FIX is the more testable-offline primary vs a TCP listener | Pattern 7 | Low — CONTEXT explicitly gives Claude this discretion |
| A5 | `Sealed` is a display alias for the ledger `Closed` state (enum unchanged) | Pattern 5 / Pitfall 5 | Medium — if the planner renames the Daml enum it ripples through web/daml.js + tests |
| A6 | Reusing `settleBatch`/`Round.Clear` for a 1×1 RFQ batch requires no §8 change | ADJ-02 | Medium — the RFQ accept path must marshal cids the way `settle` does (04-02 gather pattern) |
| A7 | Issuance uniform price = the existing `computeClearing` over issuance bids | ADJ-03 | Medium — mapping mint-side allocation to `create Holding` is new; verify conservation on-ledger |
| A8 | OTLP exporters auto-read `OTEL_EXPORTER_OTLP_ENDPOINT` without explicit `url` | Pattern 1 | Low — standard OTel env behavior; confirm at implement |

## Open Questions

1. **Which lifecycle seam fires each webhook event, exactly?**
   - What we know: open is in `index.ts` (`POST /round` → `openRound` + `openRoundClock`); close/clear/settle flow through `clock.ts` `forceClose` and `api.ts` settle handler.
   - What's unclear: whether `fill.posted` fires per-TradeConfirmation at settle or once per settled round.
   - Recommendation: fire `round.settled` once and `fill.posted` per confirmation read from `readTradeConfirmations` (already available in `AppDeps`).

2. **Does the OPS-03 idempotency middleware wrap ALL mutating POSTs or a whitelist?**
   - What we know: CONTEXT names `POST /round`, order submission, `POST /round/:id/settle`.
   - What's unclear: whether tamper/sandbox/webhook-register POSTs are in scope.
   - Recommendation: apply globally to POSTs that carry `Idempotency-Key` (opt-in by header presence), which the Pattern-4 sketch does — safe default.

3. **Vault auth mode for the dev docker-compose: root token vs AppRole?**
   - What we know: CONTEXT allows "token or AppRole."
   - Recommendation: dev-mode Vault server with a fixed root token in compose (labeled UNSAFE-DEV, mirrors the `unsafe` HMAC dev-token precedent); document AppRole as the prod path in the runbook. Live rotation is a UAT item.

4. **ADJ-03 coupon holder enumeration** — how are "current holders" discovered on-ledger for pro-rata payment?
   - What we know: `Holding` is keyless, per-(owner,instrument); the operator can query the ACS.
   - Recommendation: solver reads active `Holding`s for the bond instrument via the ACS query (like `readSealedOrders`), computes pro-rata cash, and the `Coupon` choice transfers cash `Holding`s deterministically. Verify no double-pay via a per-round coupon marker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all solver work | ✓ | 20.x | — |
| npm (`--legacy-peer-deps`) | OTel install | ✓ | — | — |
| `daml` CLI (Bash PATH only) | ADJ-02/03 build + codegen | ✓ | 3.4.11 | `/c/Users/woshv/bin/daml`; Bash tool only (not PowerShell) |
| Canton LocalNet (:3975/:2975/:4975) | live settle/issuance/RFQ E2E | ✓ (docker compose) | 3.4 | Offline: DI-stubbed ledger in vitest (established pattern) |
| Docker (compose) | Vault dev service, LocalNet | ✓ | — | Vault backend degrades to `env` backend when absent |
| OTel collector | live OTLP export | ✗ | — | **ConsoleSpanExporter/ConsoleMetricExporter** (locked fallback) — no collector needed for dev/offline verify |
| HashiCorp Vault | live secret reads | ✗ | — | **`env` backend** (default) — preserves current `.env` behavior byte-for-byte |
| Prometheus/Alertmanager | live alerting | ✗ | — | Ship `alerts/umbra-rules.yml` config only; delivery is UAT |
| Counterparty FIX OMS | live FIX interop | ✗ | — | Offline: test vectors + round-trip parse/build; interop is UAT |

**Missing dependencies with no fallback:** none — every missing piece has an offline verify path or a graceful degrade.
**Missing dependencies with fallback:** OTel collector → console exporters; Vault → env backend; Prometheus → config-only; FIX OMS → offline test vectors. All match the project's "Built · offline-verified · live UAT pending" pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 (solver) + Daml Script `daml test` (ledger) + vitest (web) |
| Config file | solver co-located `*.test.ts`; `daml/Umbra/Tests.daml` |
| Quick run command | `cd solver && npm test` (vitest run) |
| Full suite command | `cd solver && npm test && npm run typecheck` + (Bash) `daml test` + `cd web && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | Spans nest request→clear→exercise→agent with `round.id`; console fallback when endpoint unset; metrics emitted; logger redacts secrets | unit | `cd solver && npm test -- telemetry logger` | ❌ Wave 0 |
| OPS-01 | Alert-rules YAML parses / has expected thresholds | unit | `cd solver && npm test -- alerts` (or a lint) | ❌ Wave 0 |
| OPS-02 | `SecretsProvider` env backend returns `.env` values; vault backend reads KV v2 (mocked fetch); secret never in a response | unit | `cd solver && npm test -- secrets` | ❌ Wave 0 |
| OPS-02 | `/status` + `/status.html` token-free, aggregate-only, no order data, no secret sentinel | unit | `cd solver && npm test -- status` | ❌ Wave 0 |
| OPS-03 | Same key+body → original response; same key+diff body → 422; new key → executes | unit | `cd solver && npm test -- idempotency` | ❌ Wave 0 |
| OPS-03 | FSM rejects settle-before-clear / double-settle (409); legal path passes | unit | `cd solver && npm test -- fsm` | ❌ Wave 0 |
| OPS-04 | HMAC signature verifies; replay-guard on stale timestamp; retry/backoff; delivery log; no secret in payload | unit | `cd solver && npm test -- webhooks` | ❌ Wave 0 |
| OPS-04 | `POST /sandbox/round` deterministically clears $100.00 / A=10·B=8·C=2 | unit+integration | `cd solver && npm test -- sandbox` | ❌ Wave 0 |
| OPS-05 | parse 35=D → SubmitOrder mapping; build 35=8; BodyLength/CheckSum against a known vector; session A/0/5 seqnum | unit | `cd solver && npm test -- fix` | ❌ Wave 0 |
| ADJ-01 | N configs ranked; only equal-to-deterministic proposals eligible; deterministic still settles; §4 unperturbed | unit | `cd solver && npm test -- competing` | ❌ Wave 0 |
| ADJ-02 | Firm quote signatory-bound; accept-best settles 1×1 via settleBatch; conservation on-ledger | daml test | (Bash) `daml test` | ❌ Wave 0 (Tests.daml) |
| ADJ-03 | Uniform-price issuance mints Holdings at one price; coupon pro-rata; redemption retires; §4 bond untouched | daml test | (Bash) `daml test` | ❌ Wave 0 (Tests.daml) |
| ALL | §4 golden regression ($100.00/A=10/B=8/C=2) unchanged | regression | `cd solver && npm test -- auction` + `daml test` | ✅ exists (08-01 CI gate) |

### Sampling Rate
- **Per task commit:** `cd solver && npm test -- <module>` (the touched module's co-located test) + `npm run typecheck`
- **Per wave merge:** `cd solver && npm test` (full solver suite) + `cd web && npm test`; for Daml waves (Bash) `daml test`
- **Phase gate:** full solver + web vitest green, `daml test` exit 0 (§4 golden intact), bundle secret-scan 0, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `solver/src/telemetry.test.ts` — OPS-01 spans/metrics/console-fallback (inject a fake exporter/reader)
- [ ] `solver/src/logger.test.ts` — OPS-01 redaction + JSON shape
- [ ] `solver/src/secrets.test.ts` — OPS-02 env/vault backends (mock fetch)
- [ ] `solver/src/status.test.ts` — OPS-02 token-free aggregate + secret sweep
- [ ] `solver/src/idempotency.test.ts` — OPS-03 replay/422/new-key
- [ ] `solver/src/fsm.test.ts` — OPS-03 legal/illegal transitions
- [ ] `solver/src/webhooks.test.ts` — OPS-04 sign/replay/retry/log/secret-sweep
- [ ] `solver/src/fix.test.ts` — OPS-05 parse/build/checksum vector/session
- [ ] `solver/src/competing.test.ts` (or extend `agent.test.ts`) — ADJ-01 ranking + referee
- [ ] `daml/Umbra/Tests.daml` scenarios — ADJ-02 RFQ accept+settle, ADJ-03 issuance+coupon+redeem
- [ ] Extend `api.test.ts` secret-sweep to every new endpoint (`/status`, `/sandbox/round`, webhook register, FIX-over-HTTP)
- [ ] Framework install: OTel packages (`--legacy-peer-deps`) — gated behind the legitimacy checkpoint

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing OIDC dual-mode (`auth.ts`); FIX session is app-layer only (no new auth surface — behind operator boundary); status page is deliberately public/token-free |
| V3 Session Management | partial | FIX `MsgSeqNum` monotonicity is a session-integrity control (not user auth); OTel context propagation is not a session |
| V4 Access Control | yes | CORS scoped to :5173 (unchanged); `/status` exposes ONLY aggregate health (no private orders); webhook subscription register is an authenticated endpoint |
| V5 Input Validation | yes | zod on every new endpoint body; FIX field parsing bounds-checked; idempotency body hashing; NL/status inputs capped |
| V6 Cryptography | yes | `node:crypto` HMAC-SHA256 (webhooks), SHA-256 (idempotency) — never hand-rolled crypto; Vault KV v2 for secret storage |
| V7 Error/Logging | yes | Secret-redacting JSON logger; fixed secret-free error strings + `err.name`; no `err.message`/raw-object logging |
| V9 Communications | partial | OTLP/Vault/webhook HTTP are plaintext on LocalNet (dev); TLS is a UAT/ops gate (mirrors Caddy TLS from Phase 12) |
| V14 Configuration | yes | Secrets out of `.env` into Vault (OPS-02); `SECRETS_PROVIDER` env switch; `.env.example` documents keys; no secret committed |

### Known Threat Patterns for {solver Node/TS + new integration surfaces}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leak via new serialization surface (status/webhook/FIX/OTel span/log) | Information Disclosure | Secret-sweep tests on every new emitter + redacting logger (Pitfall 7) |
| Webhook forgery / replay | Spoofing/Tampering | HMAC-SHA256 signature + `X-Umbra-Timestamp` replay-guard + `timingSafeEqual` |
| Idempotency-key collision / cross-body reuse | Tampering | Key keyed by `(key, sha256(body))`; 422 on same-key-diff-body |
| Illegal round-state drive by a bad client | Tampering | FSM `transition` guard (409) + ledger `Round.status` authoritative backstop |
| AI proposes an unfair clear (competing solvers) | Tampering | Deterministic §8 referee — only equal-to-deterministic eligible; deterministic settles (AI off settlement path) |
| FIX field injection / malformed frame | Tampering/DoS | Bounds-checked parse, BodyLength/CheckSum validation, reject → 35=8 ExecType rejected |
| Prompt injection via NL / FIX text | Tampering | Verify-don't-trust (existing); zod re-validation; the model only prefills, never auto-submits/settles |
| Vault token exposure | Information Disclosure | Vault token module-private (mirror `_operatorToken`); dev root token labeled UNSAFE-DEV; never logged/returned |
| Status page private-order leak | Information Disclosure | Aggregate-only by construction; secret+order sweep test |

## Project Constraints (from CLAUDE.md + STATE.md)

- **No Claude git attribution** — author/committer stays `woshvad`; no `Co-Authored-By`, no "Generated with" in any commit/PR. (Overrides default tooling.)
- **§4 fixture must still clear $100.00** (A=10/B=8/C=2) — nothing in Phase 13 may perturb it; the golden vitest + `daml test` are the regression gate.
- **`ANTHROPIC_API_KEY` + party/operator tokens server-side only** — module-private, never in the browser bundle, never logged/echoed; secret-sweep tests are the norm.
- **AI never on the settlement path** — deterministic §8 + on-ledger `Round.Clear` are authoritative (governs ADJ-01 directly).
- **Dependency-minimalism** — prefer stdlib/hand-rolled; new npm installs use `--legacy-peer-deps`; VET legitimacy (OTel is the only new dep, gated by a checkpoint).
- **Keyless Daml (D7)** — contract keys UNSUPPORTED on LF 2.1; new templates (Rfq, Issuance) fetch-by-cid + assert.
- **CN Token Standard (CIP-0056)**, not the Daml Finance library (unbuildable on this line) — ADJ-03 mints `Holding` conforming to `HoldingV1.Holding`.
- **Design comp binding** for any UI surface — the status page honors brand tokens (`#F4F1EA`/`#0A0A0A`/`#D6FB3C`, Space Grotesk/IBM Plex Mono) but is self-contained/token-free.
- **Solver conventions** — Node ESM, DI factories (`createApp(deps)`/`createAgent(deps)`), co-located `*.test.ts` vitest, zod-validated endpoints, secret-safe `{error:{code,message}}` envelope; reuse `solver/src/{api,index,ledger,clock,agent,auth,auction,settlement}.ts`.
- **Ports** — solver :4100 (NOT :4000 — augur owns :4000), web :5173, JSON Ledger API v2 :3975.
- **`daml` is Bash-PATH-only** at `/c/Users/woshv/bin/daml` — invoke Daml builds/tests/codegen via the Bash tool, not PowerShell.

**Project skills:** none found (checked — no `.claude/skills/`, `.agents/skills/`; CLAUDE.md confirms "No project skills found").

## Sources

### Primary (HIGH confidence)
- Existing Umbra codebase (in-session reads): `solver/src/{api,agent,auth,clock,ledger}.ts`, `solver/src/.env.example`, `solver/package.json`, `daml/Umbra/{Instrument,Holding,Settlement,Auction}.daml`, `.planning/{STATE.md,REQUIREMENTS.md}`, `13-CONTEXT.md` — the authoritative source for conventions, seams, and reusable assets.
- npm registry (in-session `npm view`): OpenTelemetry package versions + npm downloads API (61.5M/13M/21.9M weekly) — `@opentelemetry/{api@1.9.1, sdk-node@0.220.0, exporter-trace-otlp-http@0.220.0, exporter-metrics-otlp-http@0.220.0, sdk-metrics@2.9.0}`.

### Secondary (MEDIUM confidence)
- OpenTelemetry JS docs (cited, not fetched in-session): `opentelemetry.io/docs/languages/js/getting-started/nodejs` — NodeSDK init, exporter selection, `OTEL_EXPORTER_OTLP_ENDPOINT` behavior. Verify exact import paths against installed `.d.ts` (Pitfall 2).
- FIX 4.4 framing (BodyLength/CheckSum) — standard protocol knowledge; validate with a known-good test vector offline.

### Tertiary (LOW confidence)
- `@opentelemetry/auto-instrumentations-node@0.78.0` tree weight — assess before adding (manual spans are the requirement).

## Metadata

**Confidence breakdown:**
- Standard stack (OTel + hand-rolled): HIGH — versions verified on npm; hand-rolled pieces grounded in existing repo patterns
- Architecture / seams: HIGH — every hook point read directly from the existing solver/Daml source
- OTel API specifics: MEDIUM — the 0.2xx experimental line drifts; confirm import paths at implement time
- Daml ADJ-02/03 templates: MEDIUM — novel additive templates, patterned on existing keyless Holding/Settlement but not yet compiled
- FIX 4.4 subset: MEDIUM — well-specified, hand-rolled, no in-repo precedent
- Pitfalls / security: HIGH — carried forward from the project's established secret-safe / verify-don't-trust discipline

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 for the stack (OTel 0.2xx line moves fast — re-verify versions if implementing past ~2 weeks); the codebase-grounded patterns are stable until the solver/Daml conventions change.
