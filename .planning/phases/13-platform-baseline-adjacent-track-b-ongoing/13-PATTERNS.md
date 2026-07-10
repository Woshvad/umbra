# Phase 13: Platform Baseline & Adjacent - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 15 (11 new solver/config + 2 new Daml + 2 extended) + additive web panels
**Analogs found:** 15 / 15 (every new file has a strong in-repo analog — this is a mature codebase; REUSE, do not reinvent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `solver/src/telemetry.ts` (new) | provider/bootstrap | event-driven (spans/metrics) | `solver/src/agent.ts` (DI factory + module-private boot resource) | role-match |
| `solver/src/logger.ts` (new) | utility | transform (redact→emit) | `agent.ts` secret-free `console.error` discipline | role-match |
| `alerts/umbra-rules.yml` (new) | config | batch (static) | (no analog — config-only, see No Analog) | none |
| `solver/src/secrets.ts` (new) | service/provider | request-response (resolve secret) | `solver/src/auth.ts` (module-private secret + raw-fetch OIDC backend) | exact |
| `solver/src/status.ts` (new) | service/builder | request-response (aggregate read) | `api.ts` `buildIndicative` (pure aggregate builder, no private data) | exact |
| `solver/src/idempotency.ts` (new) | middleware | request-response (dedupe) | `api.ts` `wrap`/`ApiError` envelope + `express.json` mw | role-match |
| `solver/src/fsm.ts` (new, or extend `clock.ts`) | utility/state | event-driven (transition) | `solver/src/clock.ts` (`RoundStatus` + NON_OPEN guard) | exact |
| `solver/src/webhooks.ts` (new) | service | pub-sub (sign/retry/deliver) | `auth.ts` (node crypto + module-private secret) + `clock.ts` (timer/retry hygiene) | role-match |
| `solver/src/fix.ts` (new) | controller/protocol | request-response (parse→map→reply) | `agent.ts` `parseOrder` (untrusted-input parse → validated domain map) | role-match |
| `solver/src/competing.ts` (new) or extend `agent.ts` | service | batch (rank N) | `agent.ts` `proposeClearing` verify gate + equality predicates | exact |
| `daml/Umbra/Rfq.daml` (new) | model | request-response (quote→accept→settle) | `daml/Umbra/Holding.daml` (keyless template) + `Settlement.settleBatch` (DvP) | exact |
| `daml/Umbra/Issuance.daml` (new) | model | batch (uniform-price mint + lifecycle) | `Holding.daml` (mint) + `Clearing.computeClearing`/`Settlement` | role-match |
| `agent.ts` (extend) ADJ-01 | service | batch | itself (`proposeClearing`) | exact |
| `api.ts` / `index.ts` (extend) | controller / wiring | request-response | existing `createApp(deps)` route + `buildDeps` seam | exact |
| web additive panels + `status.html` | component / static | request-response | `web/src/solver.ts` client + existing view components | role-match |

## Pattern Assignments

### `solver/src/secrets.ts` (SecretsProvider, OPS-02)

**Analog:** `solver/src/auth.ts` — copy the module-private-secret + lazy-env + raw-`fetch` backend discipline VERBATIM.

**Module-private secret + lazy env resolve** (`auth.ts` lines 32-47): read secret names lazily inside functions (not frozen at import) so tests set `process.env` first; `requireEnv` throws a secret-free `... is unset`. The resolved secret is held module-private and NEVER returned/logged/spread.

**Raw-fetch backend (no SDK)** (`auth.ts` lines 69-90): the `vault` backend mirrors `acquireToken`'s form-POST — `fetch` to `${VAULT_ADDR}/v1/secret/data/umbra/<key>`, non-2xx throws `Vault HTTP ${status}` (status only, response body NEVER interpolated — could carry internals), return only the value. This is the locked "no `node-vault`" path.

**Backend switch:** `SECRETS_PROVIDER` env selects `env` (dev default — preserves current `.env` byte-for-byte) vs `vault`, exactly as `ledger.ts` switches HMAC-dev vs OIDC on `OIDC_ISSUER` presence.

**Anti-leak:** never let a resolved secret land in a response — mirror `ledger.ts` `_operatorToken` (read once at module scope from `scripts/.operator-token`, never crosses out; `ledger.ts` lines 71-77).

---

### `solver/src/fsm.ts` (round-lifecycle FSM, OPS-03)

**Analog:** `solver/src/clock.ts` — extend, don't fork.

**Enum reuse** (`clock.ts` line 23): `export type RoundStatus = 'Open' | 'Closed' | 'Cleared' | 'Settled'`. **DO NOT rename to add `Sealed`** — `Sealed` is a DISPLAY ALIAS for `Closed` only (Pitfall 5 / Anti-Pattern). The wire/Daml enum stays byte-compatible with `ledger.ts` + `web/daml.js`.

**Guard-set pattern** (`clock.ts` lines 37-39): copy the `NON_OPEN: ReadonlySet<RoundStatus>` idea into a `LEGAL: Record<RoundStatus, RoundStatus[]>` table; a pure `transition(from, to)` throws `ApiError(409, 'ILLEGAL_TRANSITION', ...)` on an illegal edge. Ledger `Round.status` stays authoritative — the FSM is the API-layer guard (same authority note as `clock.ts` lines 9-12).

**Error type:** reuse `api.ts` `ApiError` (lines 221-230) — `new ApiError(status, code, message)`.

---

### `solver/src/idempotency.ts` (OPS-03)

**Analog:** `api.ts` middleware + envelope.

**Envelope** (`api.ts` lines 221-230, 375-397): the 422 replay-reuse response uses the secret-safe `{ error: { code: 'IDEMPOTENCY_KEY_REUSED', message } }` shape via `ApiError`/`wrap`. Register the mw AFTER `app.use(express.json())` (`api.ts` line 370) so `req.body` is parsed for hashing.

**Store:** in-memory `Map<string, Entry>` keyed by `(key, sha256(body))`, TTL-bounded — mirror `clock.ts`'s private `Map<string, RoundState>` (line 60), documented Postgres swap. Hash with `node:crypto` `createHash('sha256')` (canonicalize keys before hashing — Pitfall 4).

---

### `solver/src/status.ts` (OPS-02 public status)

**Analog:** `api.ts` `buildIndicative` (lines 348-366) — a PURE aggregate builder that deliberately withholds order-derivable data.

**Aggregate-only discipline:** copy `buildIndicative`'s small-N/guard mindset — `/status` returns only venue up/down, current phase, last clear price/time, uptime, build/version. NEVER an individual order (Pitfall 7 / Anti-Pattern). Secret-sweep test asserts no token/key sentinel and no order in the body.

**Token-free serving:** two GETs registered on `createApp` like `api.ts` line 401 `app.get('/round/:id', wrap(...))`, but WITHOUT any auth context. `/status.html` is a self-contained brand-styled string (tokens `#F4F1EA`/`#0A0A0A`/`#D6FB3C`, Space Grotesk/IBM Plex Mono) — NOT a React view.

---

### `solver/src/webhooks.ts` (OPS-04)

**Analog:** `auth.ts` (node crypto + per-secret discipline) + `clock.ts` (timer hygiene for retry backoff).

**HMAC signing:** `node:crypto` `createHmac('sha256', secret)` over `${ts}.${rawBody}`, `timingSafeEqual` for any verify — headers `X-Umbra-Signature`, `X-Umbra-Timestamp`, `X-Umbra-Event`, `X-Umbra-Delivery`. Per-subscription secret is module-private, never in the payload (mirror `auth.ts` secret discipline lines 14-19).

**Retry/timer hygiene:** copy `clock.ts` single-`setTimeout`-per-unit + always-`clearTimeout` pattern (lines 64-74, 82-88) for the ~5-attempt jittered backoff so a timer can never double-fire.

**Fired off existing seams:** `round.opened` at `index.ts` open path (`openRound`+`openRoundClock`), close/clear/settle through `clock.ts` `forceClose` + `api.ts` settle handler; `fill.posted` per `readTradeConfirmations` entry (already in `AppDeps`, `api.ts` line 100).

---

### `solver/src/fix.ts` (OPS-05)

**Analog:** `agent.ts` `parseOrder`/`parseOrderWith` (lines 82-150) — untrusted-input parse → zod-validated domain object → never-throw degrade.

**Parse→map→validate:** `parseFix` (pure) → map `35=D` fields (`55` Symbol, `54` Side, `38` Qty, `44` Price, `40` OrdType) to a sealed `Venue.SubmitOrder`; re-validate with zod like `orderSchema` (lines 90-94) before it reaches the domain. Malformed → `35=8` reject ExecutionReport, never a throw (mirror `parseOrderWith`'s null-on-error).

**Pure framing helpers:** `parseFix`/`buildFix`/`bodyLength`/`checkSum` are pure like `agent.ts`'s `priceEqual`/`allocationsEqual` (lines 179-189) — unit-test checksum/bodylength against a known-good vector; assert `buildFix(parseFix(m)) === m` (Pitfall 3).

**Primary surface:** HTTP-wrapped raw-FIX endpoint on `createApp` (offline-testable), optional `net.Server` TCP add. Secret-free.

---

### `solver/src/telemetry.ts` + `logger.ts` (OPS-01)

**Analog:** `agent.ts` boot-resource DI (lines 210-215) + secret-free logging (lines 142-149, 374-378).

**Boot-once resource:** mirror `agent.ts`'s module-scope `_client` construction — build `NodeSDK` once, select OTLP vs `ConsoleSpanExporter`/`ConsoleMetricExporter` on `OTEL_EXPORTER_OTLP_ENDPOINT` presence (same env-presence switch idiom as `ledger.ts` OIDC / `secrets.ts`). Import `telemetry.ts` FIRST in `index.ts main()` (Pitfall 1).

**Secret-free logger:** copy `agent.ts`'s "log ONLY a fixed string + `err.name`, never `err.message`/raw object/key" rule (line 144-148) into `logger.ts`; belt-and-suspenders `SECRET_KEYS` redact regex over fields; correlate `trace.id` via `trace.getActiveSpan()`.

---

### `agent.ts` extension — `proposeCompeting` (ADJ-01)

**Analog:** `agent.ts` itself — reuse the verify gate wholesale.

**Referee = deterministic §8** (lines 315-360): `proposeCompeting(views, configs)` calls `computeClearing(views)` as the referee, runs N configs via the existing `proposeClearing` internals, marks each `verified` ONLY on `priceEqual && allocationsEqual` (lines 179-189, 356-358). Rank verified proposals by (matchedVolume desc, surplus desc) for a NARRATIVE leaderboard. The deterministic clear STILL settles unconditionally — AI off the settlement path (lines 8-11). A failing/timeout config degrades to `verified:false` (never throws — reuse `withTimeout` + catch, lines 243-249, 371-380).

---

### `daml/Umbra/Rfq.daml` (ADJ-02)

**Analog:** `daml/Umbra/Holding.daml` (keyless template) + `Umbra.Settlement.settleBatch` (DvP).

**Keyless (D7):** NO contract key — `signatory operator, dealer` on the firm `Quote`; `AcceptQuote` does `q <- fetch quoteCid; assertMsg "instrument mismatch" (...)` exactly like `Holding.daml`'s fetch-by-cid + assert pattern (lines 14-17, 66-70).

**Reuse DvP:** the accept path builds a 1×1 batch and calls `Umbra.Settlement.settleBatch custodian instructions sources` (Settlement.daml lines 170-193) — the SAME atomic all-or-nothing path; do not invent a new mechanism. Gather cids the way `api.ts`/`settle` does. Firm quote = `signatory dealer` makes it binding.

---

### `daml/Umbra/Issuance.daml` (ADJ-03)

**Analog:** `Clearing.computeClearing` (uniform price) + `Holding.daml` (mint) + `Settlement`.

**Reuse §8, mint Holdings:** issuance uses the SAME uniform-price `computeClearing`/`coreClear` — NOT a parallel auction (Don't-Hand-Roll). Winners get `create Holding with operator; owner=winner; instrument=bond; amount` (Holding.daml lines 34-44), conforming to `HoldingV1.Holding` (CIP-0056, lines 25-31).

**Lifecycle choices:** `Coupon` (issuer pays cash pro-rata to current holders — enumerate via ACS `Holding` query like `readSealedOrders`, per Open Question 4) and `Redeem` (retire bond Holdings at maturity), keyless fetch-by-cid + assert. §4 secondary-market bond untouched (Pitfall 6).

---

## Shared Patterns

### Secret-safe by construction
**Source:** `auth.ts` lines 14-19, 32-47, 80-84; `agent.ts` lines 210-215; `ledger.ts` `_operatorToken` lines 71-77
**Apply to:** `secrets.ts`, `webhooks.ts`, `telemetry.ts`, `logger.ts`, `status.ts`, `fix.ts`
Secret read once at module scope, module-private, NEVER returned/logged/echoed. Errors interpolate status/`err.name` only — never the response body, `err.message`, or the key. Extend the secret-sweep test discipline to EVERY new emitter (Pitfall 7).

### Error envelope + zod validation
**Source:** `api.ts` `ApiError` (221-230), `wrap` (303), `openRoundBody` (235-241), route (375-397)
**Apply to:** every new endpoint (`/status`, `/sandbox/round`, webhook-register, FIX-over-HTTP, competing, RFQ orchestration)
`app.post(path, wrap(async (req,res)=>{ const p = schema.safeParse(req.body); if(!p.success) throw new ApiError(400,'INVALID_BODY',...) ... }))`. `.strict()` zod schemas; secret-safe `{error:{code,message}}`.

### DI factory + co-located vitest
**Source:** `createApp(deps)` (api.ts 368), `createAgent(deps)` (agent.ts 291), `createClock(deps)` (clock.ts 58); wiring in `index.ts` (`buildDeps`, lines 223-229, 500, 525)
**Apply to:** every new module ships a `create*(deps)` factory + a co-located `*.test.ts` with DI-stubbed ledger + secret-sweep assertions. New AppDeps fields wire through `index.ts` `buildDeps`.

### Keyless Daml (D7 Option-B)
**Source:** `Holding.daml` lines 14-17, `Settlement.daml` fetch-by-cid + assert
**Apply to:** `Rfq.daml`, `Issuance.daml` — NO contract keys; `fetch cid` + `assertMsg`; controller-authority choices; regenerate + commit `web/daml.js` after any template addition (fresh-clone invariant).

### In-memory store + documented swap
**Source:** `clock.ts` private `Map` (line 60)
**Apply to:** idempotency store, webhook subscription registry, delivery log — process-local, TTL-bounded, documented Postgres swap out of scope.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `alerts/umbra-rules.yml` | config | batch | No Prometheus/Alertmanager config exists in-repo; author from RESEARCH thresholds (solver-down, clear-latency-p95, webhook-failure-rate). Config-only; live delivery is a UAT gate. |
| `solver/src/telemetry.ts` (OTel SDK specifics) | provider | event-driven | The DI/boot SKELETON copies `agent.ts`; the OTel API surface (`NodeSDK`, `resourceFromAttributes`, exporters) is NEW to the repo — use RESEARCH Patterns 1-2 + verify import paths against installed `.d.ts` (Pitfall 2). |

## Metadata

**Analog search scope:** `solver/src/*.ts` (api, index, ledger, clock, agent, auth, auction, settlement), `daml/Umbra/*.daml` (Holding, Instrument, Settlement, Clearing, Auction), `web/src/solver.ts`
**Files scanned:** ~14 source files (targeted reads + greps; early-stopped at strong matches)
**Pattern extraction date:** 2026-07-10
