# Phase 14: Agentic Payments (x402 Metered Solver Access) - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 6 (2 CREATE modules, 3 MODIFY, 1+ CREATE tests)
**Analogs found:** 6 / 6 (all exact or role-match — this phase is deliberately a re-application of established solver seams)

Scope reminder: **solver/TS + config + tests only.** No new Daml, no new web view. Every new mechanism has a proven in-repo analog; the executor's job is to mirror those analogs, not invent a shape.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `solver/src/x402.ts` (CREATE) | middleware | request-response (HTTP 402 gate) | `solver/src/idempotency.ts` | exact (factory → RequestHandler + `create*()` bundler + opt-in passthrough + inline `res.status().json({error})`) |
| `solver/src/facilitator.ts` (CREATE) | service | request-response / event-driven (verify+settle) | `solver/src/secrets.ts` (interface+backend select) + `solver/src/tlock.ts` (primary/fallback + stubbed fetch) + `solver/src/ledger.ts` (on-ledger settle) | exact (interface + swappable backend) |
| `solver/src/api.ts` (MODIFY) | route wiring | request-response | idempotency wiring `api.ts:593-594` + per-route `express.text` `api.ts:1287-1289` | exact |
| `solver/src/index.ts` (MODIFY) | config/DI boot | batch (boot) | env-default reads `index.ts:275-276` + `SecretsProvider.get()` `index.ts:314-317` + `buildDeps` threading `index.ts:132-166,618` | exact |
| `solver/.env.example` (MODIFY) | config | n/a | `SOLVER_PORT` + `SECRETS_PROVIDER` doc blocks `.env.example:10-40` | exact |
| `solver/src/x402.test.ts` + `facilitator.test.ts` (CREATE) | test | n/a | `idempotency.test.ts` (listen(0)+fetch, off/on, secret-sweep) + `tlock`/`secrets` (DI-stubbed) | exact |

## Pattern Assignments

### `solver/src/x402.ts` (middleware, HTTP-402 request-response)

**Analog:** `solver/src/idempotency.ts` (whole file) + `ApiError`/`wrap()` from `api.ts:335,515`.

**1. Factory → RequestHandler + `create*()` bundler shape** (mirror `idempotency.ts:79-92` and `:174-177`):
```typescript
// idempotency.ts:79 — bind config to a handler
export const idempotencyMiddleware = (
  store: Map<string, Entry>,
  opts?: IdempotencyOptions,
): RequestHandler => {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS
  const now = opts?.now ?? Date.now
  return (req, res, next): void => { ... }
}
// idempotency.ts:174 — a create*() unit that news up state + binds the handler
export const createIdempotency = (opts?): Idempotency => {
  const store = new Map<string, Entry>()
  return { middleware: idempotencyMiddleware(store, opts), store }
}
```
Replicate as `x402Gate(facilitator, opts) → RequestHandler` + `createX402Gate({ facilitator, enabled, requirements, ... }) → PaymentGate` (`{ middleware, ... }`). Export a `PaymentGate` interface analogous to `Idempotency` (`idempotency.ts:49-53`).

**2. Opt-in / default-OFF passthrough** — the primary invariant guard (mirror `idempotency.ts:95-98`):
```typescript
// idempotency.ts:95 — no-op unless BOTH conditions hold; else next() untouched
if (req.method !== 'POST') return next()
const key = req.header('Idempotency-Key')
if (!key) return next()
```
Replicate: `if (!enabled) return next()` FIRST (so `X402_ENABLED=false` ⇒ byte-unchanged), then read `X-PAYMENT`. Absent/invalid ⇒ 402; present+verified+settled ⇒ run wrapped handler.

**3. Inline secret-safe error emission** (mirror `idempotency.ts:114-123` and the `ApiError` envelope). Two viable emit paths, both render through the existing secret-safe middleware at `api.ts:1471-1481`:
```typescript
// Option A — inline (idempotency.ts:114 style):
res.status(402).json({ error: { code: 'PAYMENT_REQUIRED', ... }, accepts: [ ... ] })
// Option B — throw ApiError(402,'PAYMENT_REQUIRED', msg) via wrap() (api.ts:335,515)
```
`ApiError` shape to mirror (`api.ts:335-343`):
```typescript
class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message); this.name = 'ApiError'
  }
}
```
Note: the 402 body carries an `accepts: [...]` field IN ADDITION to (or instead of) `{ error }`. The x402 envelope is non-standard vs the `{ error: { code, message } }` shape, so prefer inline `res.status(402).json(...)` (Option A) to keep full control of the body — the secret-safe middleware only shapes thrown errors. **The message/reason must be secret-free** (never interpolate token/key/`X-PAYMENT` contents) — the `idempotency.ts:114` comment ("never echoes the body") is the governing discipline.

**4. Header handling** — the metered handlers are `wrap()`-ed async (`api.ts:820`). The gate runs BEFORE them; on success set `X-PAYMENT-RESPONSE` (settlement ref from `facilitator.settle()`) then `next()`. The AI never throws / degrades to §8 (`api.ts:833-837` note) so **the gate must block at the HTTP layer** — it cannot rely on the handler to reject.

**5. Payment-construction helper** — a tiny pure `buildSelfPayment(...)` → base64-JSON `X-PAYMENT`, secret-free, co-located (Discretion §Area 4). Pure-function + co-located-test convention.

---

### `solver/src/facilitator.ts` (service, verify+settle)

**Analog A — interface + backend selection:** `solver/src/secrets.ts:24-26,84-94`:
```typescript
export interface SecretsProvider { get(name: string): Promise<string> }
export function createSecretsProvider(): SecretsProvider {
  const backend = process.env.SECRETS_PROVIDER ?? 'env'
  switch (backend) {
    case 'env': return envProvider
    case 'vault': return vaultProvider
    default: throw new Error(`Unknown SECRETS_PROVIDER: ${backend} ...`)
  }
}
```
Replicate: `FacilitatorClient { verify(requirements, payment) → {valid, reason?}; settle(requirements, payment) → {settled, txRef} }` + `createFacilitator()` selecting on `X402_FACILITATOR ?? 'self'` → `self` | `canton-cc`, unrecognized → loud secret-free throw.

**Analog B — primary/fallback + stubbed-fetch testability:** `solver/src/tlock.ts` — the `self`-vs-`canton-cc` split follows `drand`-primary/`offline`-fallback (`tlock.ts:116-136`), and the `canton-cc` HTTP calls follow the injectable-client / stubbed-fetch discipline (`tlock.ts:77-79` `TlockOptions.client` seam; tests stub the transport). The `canton-cc` backend is `fetch` to `X402_FACILITATOR_URL` (`/verify` + `/settle`), offline-mocked exactly like tlock's stubbed chain client.

**Analog C — `self` backend on-ledger settle (the fee transfer):** `solver/src/ledger.ts`. The fee is one operator-custody USDCx `Holding` move from the paying desk to the venue party. Reuse the exact wire pattern the forfeit path uses — `exerciseChoice` on a `Holding`'s `Reassign` (the "pay the venue" precedent):
```typescript
// ledger.ts:799 — ForfeitBond precedent: seize a desk Holding to the operator
await exerciseChoice('Umbra.Auction:OrderCommitment', c.contractId, 'ForfeitBond', {})
// ledger.ts:597 — the exerciseChoice(entity, cid, choice, args) shape
// CASH_SYMBOL = 'USDCx' (ledger.ts:44); cash instrument = { issuer: operatorParty, id: CASH_SYMBOL } (ledger.ts:574)
```
Daml primitives (NO new Daml — reuse):
- `daml/Umbra/Holding.daml:109` `moveExactHolding cid qty newOwner` — full-amount `Reassign`, partial `Split`+`Reassign`; honors the lock guard.
- `daml/Umbra/Holding.daml:88` — `Holding` implements `HoldingV1.Holding` **view interface (no choices)**; transfers go through operator-authority `Reassign`/`Split`.
- `daml/Umbra/Auction.daml:222-225` `OrderCommitment.ForfeitBond` — `controller operator` → `Reassign with newOwner = operator`; the "custodian seizes a desk Holding to the venue" precedent.
- `daml/Umbra/Settlement.daml:170` `settleBatch operator legs sources` — a one-leg DvP path if the executor prefers routing the fee through the batch engine (`ledger.ts:560` `settle` shows the full call convention).
- Holding-selection: `ledger.ts:580` `queryByEntity('Holding')` then filter by `(owner, instrument)` — the `gatherHoldingCids` pattern (`ledger.ts:581`, one sufficient Holding per party). The `self`-backend picks the payer's presented fee-source cid from the `X-PAYMENT` payload (custodian-executed-on-presented-authorization).

**Custody-honesty label (load-bearing):** "operator-custody x402 — custodian-executed on presented authorization; the payer-signed variant is the `canton-cc` path." Mirror the honest-labeling convention of `tlock.ts:53` `OFFLINE_FALLBACK_LABEL`.

**Secret discipline** — any `X402_FACILITATOR_KEY` follows `secrets.ts` / `tlock.ts:81-83` module-private rules: resolved via `SecretsProvider.get()`, held module-private, ride only a request header, never returned/logged/echoed; a non-2xx facilitator response throws status-only (`secrets.ts:65-69` `Vault HTTP ${res.status}` precedent).

---

### `solver/src/api.ts` (MODIFY — register the gate)

**Analog — optional DI dep + defaulted unit** (`api.ts:242-246` + `:593`):
```typescript
// AppDeps (api.ts:246): idempotency?: Idempotency
// createApp (api.ts:593): const idempotency = deps.idempotency ?? createIdempotency()
//                         app.use(idempotency.middleware)
```
Add `x402?: PaymentGate` to `AppDeps` the same way; default in `createApp` to a disabled no-op gate (`deps.x402 ?? createX402Gate({ enabled: false })`) so existing tests stay byte-unaffected.

**Attachment — per-route (preferred for two routes), mirror the `/fix` per-route middleware** (`api.ts:1287-1289`):
```typescript
app.post('/fix', express.text({ type: '*/*', limit: '64kb' }), wrap(async (req, res) => { ... }))
```
Attach `deps.x402.middleware` as the pre-handler on exactly the two metered routes:
- `GET /round/:id/solve-preview` (`api.ts:818-849`)
- `POST /competing` (`api.ts:1350`)

**NEVER gate** (per CONTEXT §Area 3): `/health`, `/status`, `/status.html`, `POST /round` + lifecycle, `/round/:id/settle`, `/sandbox/round`, `/fix`, `/rfq*`, `/issuance*`, and critically `GET /round/:id` (calls `proposeClearing` at terminal status, `api.ts:736`, but is the primary status read — leave free). Optional: advertise x402 availability on the aggregate `/status` surface (the `buildStatusInput` block `api.ts:623`), aggregate/non-secret only.

**Registration order:** the gate is per-route (after `express.json()` at `:585`, cors `:588`, idempotency `:594`), so it naturally sits in the existing chain before the secret-safe error middleware (`api.ts:1471`).

---

### `solver/src/index.ts` (MODIFY — config + DI wiring)

**Analog A — env-with-default reads in `main()`** (`index.ts:275-276`):
```typescript
const roundSeconds = Number(process.env.ROUND_SECONDS ?? DEFAULT_ROUND_SECONDS) || DEFAULT_ROUND_SECONDS
const solverPort  = Number(process.env.SOLVER_PORT ?? DEFAULT_SOLVER_PORT)  || DEFAULT_SOLVER_PORT
```
Read: `X402_ENABLED` (default **false** — parse `=== 'true'`), `X402_FACILITATOR` (`self`|`canton-cc`), `X402_NETWORK`, `X402_ASSET`, `X402_PRICE`, `X402_PAY_TO`, `X402_FACILITATOR_URL`.

**Analog B — secret via `SecretsProvider.get()` at boot** (`index.ts:306-325`):
```typescript
const secrets = createSecretsProvider()
try { const apiKey = (await secrets.get('ANTHROPIC_API_KEY')).trim(); ... }
catch { agentClient = null }  // secret-free degradation
```
Resolve `X402_FACILITATOR_KEY` the SAME way (module-private, only for the `canton-cc` backend; degrade/skip when absent).

**Analog C — thread through `BuildDepsArgs` + `buildDeps` + the call site.** Add `x402?: PaymentGate` to `BuildDepsArgs` (like `webhooks?` `index.ts:121`), default it in `buildDeps` (like `readProofBundle` `index.ts:136`), return it in the AppDeps object (like `webhooks: args.webhooks` `index.ts:226`), and pass the constructed gate at the `buildDeps({...})` call site (`index.ts:618-663`). Construct the facilitator + gate in `main()` right after the agent block (`index.ts:330`), analogous to how `webhooks`/`clock` are constructed (`index.ts:356-368`).

---

### `solver/.env.example` (MODIFY — document X402_* keys)

**Analog:** the `SECRETS_PROVIDER` doc block (`.env.example:31-40`) and the `SOLVER_PORT` block (`.env.example:10-12`). Add a `── PAY-01 x402 metered access ──` section after the `SOLVER_PORT`/`ROUND_SECONDS` block documenting each `X402_*` key, stating **`X402_ENABLED=false` is the default and keeps the money-shot demo byte-unchanged**, and that `X402_FACILITATOR_KEY` is server-side-only (never committed, mirror the `ANTHROPIC_API_KEY`/`VAULT_TOKEN` notes at `:17-22,37-40`). Leave `X402_ENABLED=false` and secret keys empty.

---

### `solver/src/x402.test.ts` + `solver/src/facilitator.test.ts` (CREATE)

**Analog — `idempotency.test.ts` (the live-express+fetch, off/on, secret-sweep harness):**
```typescript
// idempotency.test.ts:24 — boot a throwaway app on an ephemeral port, drive via global fetch
const start = (build) => new Promise((resolve) => {
  const app = express(); app.use(express.json()); build(app)
  server = app.listen(0, () => resolve(`http://127.0.0.1:${port}`))
})
```
Required assertions (from CONTEXT §Area 3 invariant + §Specifics):
- **off ⇒ byte-unchanged:** `X402_ENABLED=false` → metered route responds exactly as today (200, no 402, canonical fixture still clears $100.00).
- **on ⇒ 402 then 200:** enabled + no `X-PAYMENT` → 402 carrying a well-formed `accepts[]` envelope; enabled + valid `X-PAYMENT` → verify+settle → 200 + `X-PAYMENT-RESPONSE` header.
- invalid/insufficient/expired/absent payment → 402 re-advertise, secret-free reason.
- **secret-sweep** (mirror `idempotency.test.ts:14`): an Authorization / `X402_FACILITATOR_KEY` sentinel never lands in any response body, header, or the 402 envelope.

**Analog — `facilitator.test.ts` DI-stubbed** (like `secrets.test.ts` / `tlock.ts` stubbed client): stub the ledger `exerciseChoice`/Holding-query for the `self` backend; stub `fetch` for the `canton-cc` backend against a mock of the `/verify`+`/settle` contract. Test count ≥ project norm.

## Shared Patterns

### Interface + swappable backend (offline-default + live-UAT)
**Source:** `secrets.ts:24-26,84-94` (env|vault), `tlock.ts:116-136` (drand|offline), `ledger.ts` HMAC/OIDC dual-mode.
**Apply to:** `facilitator.ts` `FacilitatorClient` (`self` default, live-capable | `canton-cc` offline-mocked, live=UAT). Loud secret-free throw on an unrecognized backend value.

### Optional DI dep, defaulted to a no-op
**Source:** `api.ts:246` `idempotency?: Idempotency` + `:593` `deps.idempotency ?? createIdempotency()`; `index.ts:121,136,226` webhooks/proof threading.
**Apply to:** `AppDeps.x402?`, `BuildDepsArgs.x402?`, defaulted to a disabled gate so existing tests + the money-shot demo are byte-unchanged.

### Secret-safe by construction
**Source:** `secrets.ts:12-19,65-69`, `tlock.ts:16-21,81-83`, error mw `api.ts:1471-1481`.
**Apply to:** `X402_FACILITATOR_KEY` module-private, header-only, status-only throws; the 402 body + `X-PAYMENT-RESPONSE` never echo a token/key/payment secret.

### Default-OFF invariant guard
**Source:** the opt-in passthrough of `idempotency.ts:95-98` ("no-op unless...").
**Apply to:** `x402.ts` — `if (!enabled) return next()` as the first line; the §4 fixture must clear $100.00 unchanged with metering off. This is the primary invariant test.

### AI stays off the settlement path
**Source:** `api.ts:833-837` (proposeClearing is advisory; §8 + on-ledger `Round.Clear` settle) and the whole verify-don't-trust discipline.
**Apply to:** x402 gates *access* to the compute endpoints; the fee is a standalone operator-custody transfer entirely separate from the securities DvP. Never let the gate touch the clearing/settle authority.

## No Analog Found

None. Every mechanism this phase introduces re-applies an existing solver seam. The one genuinely new artifact is the **x402 v2 wire envelope** (`accepts[]` field names, `X-PAYMENT`/`X-PAYMENT-RESPONSE` base64-JSON encoding) — there is no in-repo analog for the exact field names, so per CONTEXT §Area 1 the planner's research step MUST pin them against the x402 v2 spec before the executor writes the envelope. The middleware *plumbing* around it is fully covered by `idempotency.ts`.

## Metadata

**Analog search scope:** `solver/src/` (idempotency, secrets, tlock, api, index, ledger, idempotency.test), `daml/Umbra/` (Holding, Auction, Settlement), `solver/.env.example`.
**Files scanned:** 11
**Pattern extraction date:** 2026-07-10

## PATTERN MAPPING COMPLETE
