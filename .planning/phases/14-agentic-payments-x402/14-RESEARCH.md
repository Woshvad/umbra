# Phase 14: Agentic Payments (x402 Metered Solver Access) — Research

**Researched:** 2026-07-10
**Domain:** HTTP-native machine payments (x402 protocol) over a Node/Express solver, settled on Canton via operator-custody Holdings (self) or the FTP Canton Coin facilitator (canton-cc)
**Confidence:** HIGH on the x402 v1 wire format (pinned verbatim from the coinbase/x402 spec) and the codebase seams; MEDIUM on Canton-scheme mechanics; LOW / UAT on FTP-specific field names (Canton scheme not yet published upstream)

## Summary

x402 is an open HTTP payment protocol (coinbase/x402, 75M+ tx / $24M+ volume) that reuses the HTTP `402 Payment Required` status: an unpaid request gets a `402` carrying a JSON `accepts[]` array of payment options; the client retries with a base64-encoded `X-PAYMENT` header; the server verifies + settles (itself or via a facilitator's `POST /verify` + `POST /settle`) and returns `200` with an `X-PAYMENT-RESPONSE` header. The protocol is chain-agnostic by design — `accepts[]` enumerates any `(scheme, network, asset)` — so Umbra can advertise a Canton scheme without touching the core envelope. `[CITED: github.com/coinbase/x402/specs/x402-specification-v1.md]`

Canton x402 is real but young: the FTP/CanTrustAI dev-fund proposal (`canton-foundation/canton-dev-fund#78`, **MERGED**) funds a Canton facilitator (`/verify`+`/settle`), a client SDK, and resource-server middleware, with Canton Coin as a selectable scheme; CanTrustAI runs it in production. **However**, as of this research the upstream `scheme_exact_canton.md` is **not yet published** (0 canton refs in coinbase/x402), so the *exact* Canton CAIP-2 network id, the Canton Coin `asset` representation, and the Canton `payload` shape are **not publicly documented** — they must be treated as `[ASSUMED]`/UAT and NOT invented. `[VERIFIED: gh api coinbase/x402/contents/specs/schemes/exact — no canton file; search/code canton→0]`

The published `x402`/`x402-express`/`@x402/express` npm middleware pulls in `viem`, `wagmi`, `@solana/kit`, `@coinbase/cdp-sdk` — it is EVM/Solana-scheme-oriented (EIP-3009/USDC) and cannot advertise a Canton Coin scheme. `[VERIFIED: npm view x402 dependencies]` The CONTEXT decision to **hand-roll a small wire-compatible middleware** (mirroring `idempotency.ts`) is correct and avoids a heavy, wrong-chain dependency.

**Primary recommendation:** Hand-roll a dependency-free `createX402Gate(...)` Express middleware that is byte-faithful to the **x402 v1 HTTP wire format** (pinned below), gating only `GET /round/:id/solve-preview` and `POST /competing`, default-OFF via `X402_ENABLED`. Put verify/settle behind a `FacilitatorClient` interface with two backends: `self` (operator-custody USDCx `moveExactHolding` on the Canton JSON Ledger API v2, live-capable) and `canton-cc` (fetch to the FTP facilitator `/verify`+`/settle`, offline-mocked). Advertise the real Canton Coin scheme as the primary `accepts` entry and the self-settle USDCx scheme as an honestly-labeled second entry.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Hand-roll the payment-gate middleware** in the solver, mirroring `idempotency.ts` (`createX402Gate(...)` factory). **Do NOT depend on `x402-express`** (EVM-oriented). Stay wire-compatible with the x402 v2/v1 envelope. Record as a deviation.
- Attach as a **per-route gate** on the two metered handlers (or a global opt-in gate) — planner's choice; per-route is cleaner for two routes.
- Unpaid request → `402` with JSON `accepts:[…]`. **Primary `accepts` entry = the real Canton Coin scheme** (`scheme`, `network` from `X402_NETWORK`, `payTo` = venue party, `maxAmountRequired`/price from `X402_PRICE`, `asset` = Canton Coin, `resource` = endpoint, `description`/`mimeType`). A **second, honestly-labeled** entry MAY advertise the operator-custody USDCx self-settle scheme. Emit via `ApiError(402,'PAYMENT_REQUIRED',…)` or inline `res.status(402)`.
- Retried request with `X-PAYMENT` (base64-JSON) → gate calls `FacilitatorClient.verify()` then `.settle()` (or combined); on success run the wrapped handler + set `X-PAYMENT-RESPONSE`. Invalid/insufficient/expired/absent → `402` re-advertise with a **secret-free** reason. Gate **never throws raw** (wrap in `ApiError`), never leaks a token/secret.
- Pin the **exact x402 field names** from the spec (done below).
- **`FacilitatorClient` interface**: `verify(requirements, payment) → { valid, reason? }` and `settle(requirements, payment) → { settled, txRef }`. Selected by `X402_FACILITATOR` env (`self` default | `canton-cc`). Same interface-with-swappable-backend discipline as `SecretsProvider` / `auth.ts` dual-mode.
- **`self` backend (default, DevNet-capable):** solver is its own facilitator — verifies/settles the fee on the Canton ledger via the operator credential as a single operator-custody USDCx `Holding` transfer of `price` from the paying desk to the venue party, reusing `moveExactHolding`/`Reassign`/one-leg `settleBatch` — the `OrderCommitment.ForfeitBond` "seize a desk cash Holding to operator" pattern. Custodian-executed on presented authorization (payer presents its fee-source `Holding` cid in the `X-PAYMENT` payload). Label honestly.
- **`canton-cc` backend (offline-mocked, live=UAT):** POST `/verify`+`/settle` to the FTP facilitator (`X402_FACILITATOR_URL`, e.g. `https://dev.cantrustai.xyz/...`) to settle real Canton Coin. Offline-tested against a stubbed `fetch` mock.
- **Config** follows the three-tier pattern: non-secret via `process.env.X ?? default` in `main()` → `buildDeps`; facilitator secret via `SecretsProvider.get()` at boot. Keys: `X402_ENABLED` (default **false**), `X402_FACILITATOR` (`self`|`canton-cc`), `X402_NETWORK`, `X402_ASSET`, `X402_PRICE`, `X402_PAY_TO`, `X402_FACILITATOR_URL`, `X402_FACILITATOR_KEY` (SecretsProvider). Document each in `solver/.env.example` after the `SOLVER_PORT` block.
- **Metered:** `GET /round/:id/solve-preview` (`api.ts:818`) + `POST /competing` (`api.ts:1350`). **Never metered:** `/health`, `/status`, `/status.html`, `POST /round` + lifecycle, `POST /round/:id/settle`, `/sandbox/round`, `/fix`, `/rfq*`, `/issuance*`, and `GET /round/:id` (leave free — primary status read). Settlement never gated.
- **Solver-side helper:** a tiny pure function to construct a `self`-scheme `X-PAYMENT` payload (tests + optional web). Secret-free.

### Claude's Discretion
- Exact module/file names (`x402.ts` gate + `facilitator.ts`/`x402-facilitator.ts`, or one module), wave ordering, test counts (≥ project norm).
- Per-route vs global-opt-in gate attachment; combined verify+settle vs two calls.
- The precise `self`-backend authorization mechanism (present-cid + operator-move vs a desk-signed fee-authorization choice) — default to reusing existing operator-custody primitives with **no new Daml**; if a minimal keyless helper choice is cleaner, it must be keyless (LF 2.1).
- Whether to ship the web affordance now or advertise-on-status + defer (bias to a small additive Agent-view panel if UI-SPEC clears it cheaply).

### Deferred Ideas (OUT OF SCOPE)
- Real Canton Coin settlement via the live FTP facilitator with a CC-funded venue party on a live DevNet node — SV-sponsorship gated (the Phase 12 external gate). Offline-mocked now; live = `14-UAT.md`.
- Upstream Canton x402 scheme registration / SDK adoption when FTP publishes — swap the `canton-cc` transport for the official client behind the same interface.
- Payer-signed wallet flow (a desk signs the transfer via its own wallet/preapproval) — production shape of `self`; demo uses custodian-executed-on-presented-authorization, labeled.
- Multi-instance / persisted payment-idempotency store — in-memory default with a documented Postgres swap.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAY-01 | x402 metered access to the AI solver: HTTP 402 gate over `/solve-preview` + `/competing`; settlement swappable behind a `FacilitatorClient` (`self` on-ledger USDCx \| `canton-cc` FTP `/verify`+`/settle`); default-OFF; fee via operator-custody `moveExactHolding`/`Reassign`; §4 untouched; AI off settle; secrets server-side | The x402 v1 wire format is pinned verbatim (Standard Stack / Code Examples). The middleware seam mirrors `idempotency.ts` (`api.ts:594`). The `FacilitatorClient` mirrors `SecretsProvider`. The `self` fee transfer reuses `gatherHoldingCids`+`moveExactHolding` (`Holding.daml:109`) and the `ForfeitBond` seize pattern (`Auction.daml:222`). Default-OFF pass-through is the invariant guard. Config mirrors `secrets.ts`. Validation Architecture maps every behavior to a vitest or a live-UAT gate. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 402 signalling + `accepts[]` envelope | API / Backend (solver Express) | — | HTTP payment negotiation is a resource-server concern; belongs in the middleware chain, never the browser |
| `X-PAYMENT` decode + validation | API / Backend (x402 gate) | — | Untrusted client input parsed server-side; secret-free error path |
| Payment verify (no settle) | API / Backend (`FacilitatorClient.verify`) | Canton ledger (self) / FTP facilitator (canton-cc) | Verification is a ledger/facilitator read; the gate orchestrates |
| Payment settle (fee transfer) | Database / Ledger (Canton JSON API v2, operator authority) | FTP facilitator (canton-cc) | Actual value movement is a ledger write via the module-private operator credential |
| Fee-source Holding selection | API / Backend (`ledger.ts`) | Canton ledger | Reuses `gatherHoldingCids` (owner+instrument+amount match) against the ACS |
| Config + secret resolution | API / Backend (`index.ts main()` + `secrets.ts`) | — | Non-secret env in `main()`; facilitator key via `SecretsProvider.get()`, module-private |
| Optional pay-to-solve affordance | Frontend Server (Vite/React web) | API / Backend | Reads the advertised price + retries; credential-free over `SOLVER_BASE_URL` |

## Standard Stack

This phase installs **NO new external packages**. It is built entirely from the existing solver dependencies (`express@4.19`, `node:crypto`, global `fetch`, `zod@3.23.8`, `vitest@2.x`) plus the in-repo seams. The x402 wire format is implemented by hand.

### Core (all already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | 4.19.x `[VERIFIED: solver/package.json in-tree]` | The middleware chain the gate registers into (`api.ts:583`) | Existing solver HTTP surface |
| node:crypto | Node 20 builtin | base64 decode of `X-PAYMENT` (`Buffer.from(h,'base64')`), nonce/hash for replay guard | Zero-dep, already used in `idempotency.ts`/`proof.ts` |
| global `fetch` | Node 20 builtin | `canton-cc` facilitator calls + `self` JSON Ledger API v2 calls (`ledger.ts` uses it already) | No axios/node-fetch dependency in this repo |
| zod | 3.23.8 `[CITED: CLAUDE.md pin]` | Validate the decoded `X-PAYMENT` payload + facilitator response shapes before use | Established belt-and-suspenders convention |
| vitest | 2.x `[VERIFIED: STATE.md — solver 291 tests]` | Unit tests for the gate, both backends, envelope shapes | Project test runner |

### Deliberately NOT used
| Library | Version | Why rejected |
|---------|---------|-------------|
| `x402` (core) | 1.2.0 `[VERIFIED: npm view x402]` | Deps: `viem`, `wagmi`, `@solana/kit`, `@solana-program/*` — EVM/Solana schemes only; no Canton scheme |
| `x402-express` | 1.2.0 `[VERIFIED: npm view x402-express dependencies]` | Deps: `@solana/kit`, `@coinbase/cdp-sdk`, `viem`, `x402` — EVM/Solana middleware; cannot advertise Canton Coin |
| `@x402/express` | 2.18.0 `[VERIFIED: npm view @x402/express]` | v2 scoped middleware (`@x402/core`+`@x402/extensions`); same EVM/Solana scheme orientation; no published Canton scheme to plug in |
| `@cantrustai/x402` / `canton-x402` | — | `[VERIFIED: npm view → 404]` No Canton x402 client/facilitator npm package is published today. Self-implement the `canton-cc` adapter to the generic facilitator contract. |

**Installation:** none. (If the planner later chooses to depend on the eventual FTP client SDK, that is a deferred swap behind the `canton-cc` adapter, gated by a `checkpoint:human-verify`.)

## Package Legitimacy Audit

> This phase installs **no external packages**. The x402 npm packages below were **evaluated and rejected** (wrong-chain scheme orientation), not installed. No slopcheck gate is required because nothing is added to `package.json`.

| Package | Registry | Downloads | Source Repo | Disposition |
|---------|----------|-----------|-------------|-------------|
| x402 | npm 1.2.0 | high (coinbase) | github.com/coinbase/x402 | NOT INSTALLED — EVM/Solana only |
| x402-express | npm 1.2.0 | moderate | github.com/coinbase/x402 | NOT INSTALLED — EVM/Solana only |
| @x402/express | npm 2.18.0 | moderate | github.com/coinbase/x402 | NOT INSTALLED — no Canton scheme |
| @cantrustai/x402 | — | — | none published | DOES NOT EXIST — self-implement adapter |

**Packages removed due to slopcheck [SLOP] verdict:** none (nothing installed).
**Packages flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
  x402 client / AI agent / (optional) web pay-to-solve panel
        │  1. GET /round/:id/solve-preview   (no X-PAYMENT)
        ▼
  ┌─────────────────────── solver Express app (:4100) ──────────────────────┐
  │ express.json → cors(:5173) → idempotency → [ x402 gate ] → route handler │
  │                                                 │                         │
  │   X402_ENABLED=false ─────────────────────────► pass-through (no-op)      │
  │                                                 │  (byte-unchanged demo)  │
  │   X402_ENABLED=true, no/invalid X-PAYMENT ─────► 402 { x402Version,       │
  │                                                 │      error, accepts:[   │
  │                                                 │        cantonCoin(1st),  │
  │                                                 │        usdcxSelf(2nd) ]} │
  │                                                 │                         │
  │   retry WITH X-PAYMENT (base64 JSON) ──────────► decode+zod validate      │
  │                                                 │      │                  │
  │                                                 │      ▼                  │
  │                              FacilitatorClient.verify(reqs, payment)      │
  │                                    ├── self ────► JSON Ledger API v2       │
  │                                    │             (query fee-Holding cid,   │
  │                                    │              owner/instrument/amount) │
  │                                    └── canton-cc► fetch POST /verify       │
  │                                                 │      │                  │
  │                                  valid? ──no──► 402 re-advertise (reason)  │
  │                                        └─yes─► .settle(reqs, payment)      │
  │                                    ├── self ────► moveExactHolding(cid,    │
  │                                    │              price, venueParty) via   │
  │                                    │              operator authority       │
  │                                    └── canton-cc► fetch POST /settle       │
  │                                                 │  txRef                   │
  │                                                 ▼                         │
  │                        run wrapped handler → 200 + X-PAYMENT-RESPONSE      │
  └──────────────────────────────────────────────────────────────────────────┘
        │
        ▼  (fee = access charge, ENTIRELY SEPARATE from the securities DvP;
            §4 Round.Clear / deterministic §8 remain the sole settlement authority;
            AI never touches settlement)
```

### Recommended module structure (Claude's discretion on names)
```
solver/src/
├── x402.ts            # createX402Gate(deps, opts) → RequestHandler  (mirrors idempotency.ts factory)
│                      #   + pure helpers: decodePayment, buildAccepts, encodePaymentResponse,
│                      #     constructSelfPayment (the secret-free X-PAYMENT builder)
├── facilitator.ts     # FacilitatorClient interface + createFacilitator(env) → self | canton-cc
├── x402.test.ts       # gate: off=unchanged, on=402-then-200, envelope shape, secret-sweep
└── facilitator.test.ts# self (stubbed ledger) + canton-cc (stubbed fetch) verify/settle
```
Wire as an optional DI dep `AppDeps.x402?: PaymentGate` defaulted in `createApp` (mirror `deps.idempotency ?? createIdempotency()` at `api.ts:593`); thread through `BuildDepsArgs` (`index.ts:63`) + `buildDeps` return (`index.ts:167`).

### Pattern 1: Factory middleware mirroring idempotency.ts
**What:** `createX402Gate(facilitator, opts) → RequestHandler`, opt-in/no-op unless `X402_ENABLED`.
**When to use:** the whole gate.
**Example:**
```typescript
// Mirrors solver/src/idempotency.ts:79 (factory) + api.ts:593 (default-in-createApp)
export const createX402Gate = (fac: FacilitatorClient, opts: X402Options): RequestHandler =>
  (req, res, next) => {
    if (!opts.enabled) return next()                 // default-OFF pass-through (invariant guard)
    const header = req.header('X-PAYMENT')
    const requirements = buildAccepts(opts, req)     // primary Canton + secondary USDCx-self
    if (!header) return send402(res, requirements, 'X-PAYMENT header is required')
    // ... decode + verify + settle below; all errors → send402(res, requirements, reason)
  }
```

### Pattern 2: FacilitatorClient interface (swappable backend — mirrors SecretsProvider)
```typescript
// Mirrors solver/src/secrets.ts createSecretsProvider() env|vault selection
export interface FacilitatorClient {
  verify(requirements: PaymentRequirements, payment: PaymentPayload): Promise<{ valid: boolean; reason?: string }>
  settle(requirements: PaymentRequirements, payment: PaymentPayload): Promise<{ settled: boolean; txRef: string }>
}
export const createFacilitator = (): FacilitatorClient => {
  switch (process.env.X402_FACILITATOR ?? 'self') {
    case 'self':      return selfFacilitator      // on-ledger USDCx via ledger.ts
    case 'canton-cc': return cantonCcFacilitator  // fetch to X402_FACILITATOR_URL
    default: throw new Error(`Unknown X402_FACILITATOR (expected 'self' or 'canton-cc')`)
  }
}
```

### Anti-Patterns to Avoid
- **Depending on `x402-express`/`x402`** — drags in viem/wagmi/@solana; cannot speak Canton. Hand-roll.
- **Gating `GET /round/:id`** — it is the primary round-status read (calls `proposeClearing` at terminal status, `api.ts:736`); gating it breaks the demo/status flow. Leave free.
- **Throwing raw from the gate** — always `ApiError`/`res.status(402)` so the secret-safe error middleware (`api.ts:1471`) renders it; never let a stack/token reach the client.
- **Putting the facilitator key or operator token anywhere near a 402 body or the browser** — module-private, `SecretsProvider.get()` at boot only.
- **Inventing the Canton CAIP-2 network id / Canton payload shape** — not yet published upstream; drive from `X402_NETWORK`/`X402_ASSET` env and mark UAT.
- **Letting the fee touch the securities DvP** — the x402 fee is a standalone operator-custody transfer; `Round.Clear`/§8 stay the sole settlement authority; AI stays off settlement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| The x402 **envelope** (`accepts[]`, `X-PAYMENT`, `X-PAYMENT-RESPONSE`) | A novel/guessed field set | The **pinned x402 v1 field names below** | A real x402 client must be able to pay you byte-faithfully |
| base64 of the payment payload | Custom encoding | `Buffer.from(json).toString('base64')` / `Buffer.from(h,'base64').toString('utf8')` | Spec mandates base64-JSON |
| Fee-source Holding selection | New ACS scan | Reuse `gatherHoldingCids` shape (`ledger.ts:628`) — owner+instrument.id+amount match, `used` set | Already proven for settle; identical logic |
| Fee transfer to the venue | New Daml choice / authority model | `moveExactHolding cid qty newOwner` (`Holding.daml:109`) under operator authority — the `ForfeitBond` Reassign-to-operator precedent (`Auction.daml:222`) | No new authority model; keyless-safe; reuses tested primitives |
| Config/secret resolution | New env plumbing | `process.env.X ?? default` in `main()` + `SecretsProvider.get('X402_FACILITATOR_KEY')` | Established three-tier pattern (`index.ts`/`secrets.ts`) |
| The middleware itself | A from-scratch gate | The `idempotency.ts` factory shape + `AppDeps.x402?` DI slot | Same opt-in/no-op/secret-safe discipline |

**Key insight:** Everything this phase needs already exists in-repo except the x402 wire vocabulary — and that is a small, well-specified JSON contract, not a library.

## The x402 Wire Format (PINNED — the highest-value output)

> Pinned verbatim from `coinbase/x402` `specs/x402-specification-v1.md` + `specs/transports-v1/http.md`. `[CITED: github.com/coinbase/x402]` The deployed ecosystem (all current facilitators, the CanTrustAI middleware which "mirrors the existing x402 TypeScript middleware") uses this v1 HTTP shape. **A v2 spec exists** (`x402-specification-v2.md`) that renames `maxAmountRequired`→`amount`, adds a top-level `resource` object + `extensions`, and moves `description`/`mimeType` into that `resource` object — **but v2 is not yet what live facilitators speak.** Recommendation: **implement v1** (`x402Version: 1`) as the primary envelope; keep the field-mapping isolated in one `buildAccepts`/`decodePayment` helper so a v2 flip is a one-file change. Confirm the FTP facilitator's version at UAT.

### 1. The `402` response body (`PaymentRequirementsResponse`)
```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "resource": "https://api.example.com/premium-data",
      "description": "Access to premium market data",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" }
    }
  ]
}
```
Top-level (all required): `x402Version` (number), `error` (string), `accepts` (array).
`accepts[]` entry fields:

| Field | Type | Req | Meaning (and Umbra mapping) |
|-------|------|-----|------------------------------|
| `scheme` | string | ✓ | `"exact"` (fixed-amount transfer). Umbra: `"exact"` for both entries. |
| `network` | string | ✓ | CAIP-2-ish network id. **Umbra: `X402_NETWORK`** (Canton id `[ASSUMED]` — see UAT). |
| `maxAmountRequired` | string | ✓ | amount in **atomic units** as a decimal **string**. Umbra: `X402_PRICE` (atomic-encode the fee). |
| `asset` | string | ✓ | token id (EVM: contract addr). **Umbra: `X402_ASSET`** — Canton Coin id `[ASSUMED]` (primary) / `InstrumentId operator "USDCx"` (self entry). |
| `payTo` | string | ✓ | recipient. **Umbra: `X402_PAY_TO`** = the venue party id. |
| `resource` | string | ✓ | URL of the gated resource. Umbra: the request URL (`req.originalUrl` off `SOLVER_BASE_URL`). |
| `description` | string | ✓ | human string. Umbra: e.g. `"Umbra AI solver — metered solve-preview"`. |
| `mimeType` | string | opt | `"application/json"`. |
| `outputSchema` | object | opt | JSON schema of the response, or `null`. |
| `maxTimeoutSeconds` | number | ✓ | payment completion window. Umbra: from `X402_PRICE`/config (e.g. 60). |
| `extra` | object | opt | scheme-specific. Umbra self: label `{ "custody": "operator", "instrument": "USDCx" }`; Canton: per FTP scheme (UAT). |

### 2. The `X-PAYMENT` request header (`PaymentPayload`, base64-encoded JSON)
Header value = `base64( JSON.stringify(paymentPayload) )`. Decoded shape:
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": { /* scheme-specific — EVM shown below */ }
}
```
Top-level (all required): `x402Version` (number), `scheme` (string), `network` (string), `payload` (object).
For the **EVM `exact`** scheme `payload` = `{ signature, authorization:{ from, to, value, validAfter, validBefore, nonce } }` (EIP-3009). **Umbra's `self` scheme defines its own `payload`** — NOT EVM. Recommended `self` payload (keep it minimal + secret-free):
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "<X402_NETWORK>",
  "payload": {
    "from": "<payer desk party id>",
    "to": "<venue party id>",
    "value": "<atomic price>",
    "instrument": "USDCx",
    "holdingCid": "<the payer's fee-source Holding ContractId>",
    "validBefore": "<unix ts>",
    "nonce": "<32-byte hex, replay guard>"
  }
}
```
`holdingCid` is how the payer presents its fee-source `Holding` (the "custodian-executed on presented authorization" model). `validBefore` + `nonce` drive the replay/expiry guard.

### 3. The `X-PAYMENT-RESPONSE` response header (`SettlementResponse`, base64-encoded JSON)
Header value = `base64( JSON.stringify(settlementResponse) )`. Decoded shape:
```json
{
  "success": true,
  "transaction": "0x1234…",
  "network": "base-sepolia",
  "payer": "0x857b…"
}
```
Fields: `success` (bool, req), `errorReason` (string, opt — omit on success), `transaction` (string, req — blockchain tx hash / **Umbra self: the Canton update/settlement ref**, `""` on failure), `network` (string, req), `payer` (string, req). On failure the server returns `402` with the same header plus an `accepts` re-advertise body.

### 4. Facilitator `POST /verify`
**Request:** `{ "x402Version": 1, "paymentPayload": {…PaymentPayload}, "paymentRequirements": {…the chosen accepts[] entry} }`
**Success:** `{ "isValid": true, "payer": "<addr/party>" }`
**Error:** `{ "isValid": false, "invalidReason": "insufficient_funds", "payer": "<addr/party>" }`

### 5. Facilitator `POST /settle`
**Request:** same body as `/verify`.
**Success:** `{ "success": true, "payer": "<…>", "transaction": "<tx>", "network": "<…>" }`
**Error:** `{ "success": false, "errorReason": "insufficient_funds", "payer": "<…>", "transaction": "", "network": "<…>" }`

### 6. (Optional) `GET /supported`
`{ "kinds": [ { "x402Version": 1, "scheme": "exact", "network": "<…>" }, … ] }` — the FTP facilitator would list a Canton kind here; Umbra's `self` MAY expose this on `/status` per the CONTEXT optional line.

**Standard error-reason strings** (use these verbatim in `reason`/`invalidReason`/`errorReason`): `insufficient_funds`, `invalid_payload`, `invalid_network`, `invalid_payment_requirements`, plus the EVM-specific `invalid_exact_evm_payload_*` family (not used by the `self` scheme — Umbra self coins its own secret-free reasons like `invalid_holding`, `wrong_instrument`, `amount_too_low`, `payment_expired`, `nonce_replayed`).

## Canton Scheme Specifics (MEDIUM / UAT)

- **CIP-2/CAIP-2 network id for Canton:** **not published.** `[VERIFIED: 0 canton refs in coinbase/x402; scheme_exact_canton.md absent]` The FTP proposal commits to submitting `scheme_exact_canton.md` upstream (mirroring `scheme_exact_svm.md`) but it is not merged. **Do NOT hard-code a Canton network string.** Drive `network` from `X402_NETWORK` (e.g. an operator-set `"canton"` or `"canton:devnet"` placeholder) and mark the exact value `[ASSUMED]` → confirm at UAT against the live FTP facilitator's `GET /supported`.
- **Canton Coin `asset` representation:** not published; drive from `X402_ASSET`. `[ASSUMED]`
- **How the FTP facilitator settles on Canton:** the proposal says the facilitator's `/settle` "submits the validated payment payload to the Canton ledger" via smart contracts handling "payment authorisation and settlement in Canton Coin," with "duplicate settlement protection (equivalent to the settlement cache pattern in the x402 SVM reference implementation)." `[CITED: canton-dev-fund#78 proposal x402-by-ftp-team.md]` The precise on-ledger mechanism (CIP-56 transfer vs transfer-preapproval vs Allocation vs a TransferCommand) is **not disclosed** in the proposal → `[ASSUMED]`/UAT. Umbra's `canton-cc` adapter does **not** need to know it — it only speaks the generic `/verify`+`/settle` HTTP contract (pinned above).
- **Facilitator base URL:** live DevNet reference `dev.cantrustai.xyz` (+ mainnet `cantrustai.xyz`) `[CITED: CONTEXT / proposal]`; exact `/verify`+`/settle` paths not documented → `X402_FACILITATOR_URL` is operator-set; confirm at UAT. `[ASSUMED]`
- **No Canton x402 npm package is published** (`@cantrustai/x402`, `canton-x402` → 404). `[VERIFIED: npm view]` Self-implement the `canton-cc` adapter to the generic contract; the eventual FTP client SDK is a deferred swap behind the same interface.

## `self` Backend — On-Ledger Verify/Settle (HIGH on mechanics)

Reuse `ledger.ts` patterns exactly:
- **Verify** (`verify()`): query the ACS for the payer's fee-source `Holding` and confirm it satisfies the requirement.
  - The active-contracts query is `POST /v2/state/active-contracts` with `filter.filtersByParty[operatorParty]` (`ledger.ts:294`), then client-filter to `packageName==='umbra'` + entity `Holding`.
  - Match the presented `holdingCid` against a contract with `owner === payer`, `instrument.id === 'USDCx'` (`CASH_SYMBOL`, `ledger.ts:44`), and `Number(amount) >= price` — the exact predicate `gatherHoldingCids` uses (`ledger.ts:640`). Wire note: v2 returns `amount` as a **zero-padded STRING** → `Number()` it. `[VERIFIED: ledger.ts:623,645]`
  - Reject (secret-free `reason`) on: missing cid, wrong owner, wrong instrument, insufficient amount, `locked` (`lock != None`), expired `validBefore`, replayed `nonce`.
- **Settle** (`settle()`): `moveExactHolding(holdingCid, price, venueParty)` under operator authority — a full-amount `Reassign` or a `Split`+`Reassign` (`Holding.daml:109`). Submit via the existing `exerciseChoice`/`submitAndWait` (`ledger.ts:281,259`) as `actAs: [operatorParty]` with the module-private operator bearer. This is the `ForfeitBond` "Reassign to operator" pattern generalized to "Reassign to venue" (`Auction.daml:222–225`). `[VERIFIED: Holding.daml, Auction.daml, ledger.ts]`
  - **Confirm receipt:** re-query the ACS and assert a `Holding` with `owner === venueParty`, `instrument.id === 'USDCx'`, `amount >= price` now exists (the same query shape). Return its ledger ref (command id / created cid) as `transaction`.
  - **No new Daml required** — `moveExactHolding`/`Reassign`/`Split` already exist and are operator-authority-only. If the planner prefers a desk-signed fee-authorization choice, it MUST be keyless (LF 2.1) — but the default (present-cid + operator-move) needs zero new templates.
- **Custody honesty label (required in code + any UI):** *"operator-custody x402 — custodian-executed on presented authorization; the payer-signed variant is the `canton-cc`/deferred wallet path."*
- **DevNet capability:** `self` runs on the live DevNet node today with Umbra's own USDCx Holdings (same participant the securities DvP uses). No SV sponsorship needed for `self`; only `canton-cc` real-$CC settlement is SV-gated. `[CITED: CONTEXT]`

## Runtime State Inventory

> Rename/migration inventory is N/A (this is an additive backend feature, no rename). The load-bearing runtime-state concern here is **replay/idempotency of payments**, covered below and in the threat model.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The in-memory idempotency store (`idempotency.ts`) is per-endpoint; an x402 nonce-replay guard needs its **own** in-memory set (spent nonces + used fee-Holding cids), TTL-bounded like the idempotency `Map`. | New module-private `Set`/`Map` in the gate; documented Postgres swap deferred (mirrors OPS-03). |
| Live service config | `X402_FACILITATOR_URL` points at the external FTP facilitator (DevNet). Not in git; operator-set. | Document in `.env.example`; offline-mocked in tests. |
| OS-registered state | None. | None — verified: no scheduler/pm2 entries touch payments. |
| Secrets/env vars | `X402_FACILITATOR_KEY` (facilitator auth) via `SecretsProvider.get()`; operator token already module-private (`ledger.ts`); `ANTHROPIC_API_KEY` unchanged. | Read the facilitator key at boot only, module-private, never logged/returned/echoed. |
| Build artifacts | None (no new package, no codegen — reuses existing `@daml.js/umbra` bindings). | None. |

## Common Pitfalls

### Pitfall 1: Default-OFF must be a true no-op (the primary invariant)
**What goes wrong:** the gate subtly changes a header/timing/body even when `X402_ENABLED=false`, perturbing the §4 money-shot demo.
**How to avoid:** first line of the middleware is `if (!opts.enabled) return next()`. Ship a test asserting off ⇒ existing `/solve-preview` + `/competing` responses are **byte-identical** to the pre-gate baseline, and the §4 fixture still clears **$100.00**.
**Warning signs:** any diff in the metered responses with metering off.

### Pitfall 2: v1 vs v2 field drift (`maxAmountRequired` vs `amount`)
**What goes wrong:** mixing v1 and v2 field names so a real x402 client can't decode the `accepts` entry.
**How to avoid:** implement **v1** (`x402Version: 1`, `maxAmountRequired`, flat `description`/`mimeType`) in one `buildAccepts` helper; isolate the mapping so a v2 flip is one file. Confirm the FTP facilitator's version at UAT. `[CITED: both spec files]`

### Pitfall 3: `POST /competing` roundId is in the BODY, not the path
**What goes wrong:** the gate assumes `req.params.id` like `/solve-preview`, but `/competing` takes `{ roundId, configs }` in the body (`api.ts:1352`).
**How to avoid:** the gate must not depend on `:id`; build `resource` from `req.originalUrl` and let the wrapped handler read the body. Register the gate AFTER `express.json()` (like idempotency) so the body is parsed if the gate needs it.

### Pitfall 4: A secret leaking into a 402 body or `X-PAYMENT-RESPONSE`
**What goes wrong:** an operator token / facilitator key / `ANTHROPIC_API_KEY` / raw ledger error text lands in an `error`/`reason` field.
**How to avoid:** all gate errors are `ApiError`/`res.status(402)` with authored secret-free messages (the `api.ts:1471` middleware collapses unknowns to a generic 500). Facilitator key read via `SecretsProvider.get()`, module-private. Extend the secret-sweep test with an `X402_FACILITATOR_KEY` sentinel asserted absent from every body/header. `[VERIFIED: idempotency.ts + secrets.ts discipline]`

### Pitfall 5: Double-use of a presented fee-Holding cid / X-PAYMENT replay
**What goes wrong:** the same `X-PAYMENT` (or the same `holdingCid`) is presented twice → double-settle or a settled-then-reused Holding.
**How to avoid:** module-private spent-nonce set + spent-holdingCid set (TTL-bounded); reject a replayed nonce (`nonce_replayed`) and a cid already consumed. On the `self` path the ledger also protects: once `moveExactHolding` runs, the old cid is archived, so a re-verify against a stale cid fails naturally — but guard at the HTTP layer too (don't rely solely on the ledger race).

### Pitfall 6: Atomic-units encoding of the price
**What goes wrong:** `maxAmountRequired`/`value` are **strings in atomic units**, but Umbra prices/USDCx amounts are decimals; mismatched scaling makes the fee wrong or a real client reject.
**How to avoid:** pick an explicit atomic scale for `X402_PRICE` (document the decimals in `.env.example`); the `self` verify converts atomic→decimal before the `Number(amount) >= price` compare. Keep the mapping in one helper.

### Pitfall 7: Gating a free/lifecycle endpoint by accident
**What goes wrong:** a global gate self-selects the wrong paths and meters `/status`, `/settle`, or `GET /round/:id`, breaking the demo.
**How to avoid:** prefer **per-route** attachment on exactly the two handlers (`api.ts:818`, `api.ts:1350`) — the `/fix`-style per-route precedent — over a global opt-in gate. If global, the allow-list must exclude every never-metered path in the CONTEXT list. Add a test asserting `/status`/`/settle`/`GET /round/:id` are never 402.

## Code Examples

### Emit the 402 (secret-safe, mirrors ApiError usage)
```typescript
// Source: coinbase/x402 transports-v1/http.md (v1 shape) + api.ts:1471 secret-safe middleware
const send402 = (res: Response, accepts: PaymentRequirements[], error: string) =>
  res.status(402).json({ x402Version: 1, error, accepts })   // never interpolate a secret into `error`
```

### Decode the X-PAYMENT header
```typescript
// Source: coinbase/x402 transports-v1/http.md — base64-encoded PaymentPayload
const decodePayment = (header: string): PaymentPayload =>
  paymentPayloadSchema.parse(JSON.parse(Buffer.from(header, 'base64').toString('utf8')))
// zod .strict schema → { x402Version, scheme, network, payload:{ from,to,value,instrument,holdingCid,validBefore,nonce } }
```

### Set the X-PAYMENT-RESPONSE header on success
```typescript
// Source: coinbase/x402 transports-v1/http.md — base64-encoded SettlementResponse
const settlement = { success: true, transaction: txRef, network: opts.network, payer: payment.payload.from }
res.setHeader('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify(settlement)).toString('base64'))
```

### `self` fee transfer (reuses existing ledger primitives)
```typescript
// Source: solver/src/ledger.ts (exerciseChoice/queryByEntity) + daml/Umbra/Holding.daml:109
// verify: find the presented cid, owner===payer, instrument.id==='USDCx', Number(amount) >= price, lock===null
// settle: exercise the Reassign / Split+Reassign via moveExactHolding under actAs:[operatorParty]
//         then re-query the ACS to confirm a venue-owned USDCx Holding >= price exists.
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| No machine-payment layer on Canton | FTP Canton x402 facilitator + SDK + middleware (Canton Coin scheme) | `canton-dev-fund#78` merged 2026-05-21 | Canton Coin becomes a selectable x402 scheme; live ref at CanTrustAI |
| x402 v1 (`maxAmountRequired`, flat resource) | x402 v2 (`amount`, `resource` object, `extensions`) drafted | v2 spec in-repo, not yet what live facilitators speak | Implement v1; isolate mapping for a cheap v2 flip |
| EVM-only middleware | `@x402/express@2.18` + multi-scheme (`exact` on EVM/SVM/Aptos/Hedera/Stellar/Sui/Keeta/Algo) | ongoing | Canton scheme (`scheme_exact_canton.md`) promised upstream, not merged |

**Deprecated/outdated:** none affecting this phase. The `self` scheme is Umbra-defined and stable.

## Validation Architecture

> `nyquist_validation` treated as ENABLED (no `.planning/config.json` present → default on).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x `[VERIFIED: STATE.md — solver 291 tests green]` |
| Config file | `solver/vitest.config.ts` (existing) |
| Quick run command | `cd solver && npx vitest run src/x402.test.ts src/facilitator.test.ts` |
| Full suite command | `cd solver && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAY-01 | Default-OFF ⇒ `/solve-preview` + `/competing` byte-unchanged | unit | `npx vitest run src/x402.test.ts -t "off unchanged"` | ❌ Wave 0 |
| PAY-01 | On + no X-PAYMENT ⇒ 402 with pinned `accepts[]` (Canton primary, USDCx-self second) | unit | `npx vitest run src/x402.test.ts -t "402 envelope"` | ❌ Wave 0 |
| PAY-01 | On + valid X-PAYMENT ⇒ verify→settle→200 + `X-PAYMENT-RESPONSE` | unit | `npx vitest run src/x402.test.ts -t "402 then 200"` | ❌ Wave 0 |
| PAY-01 | Invalid/insufficient/expired/absent/replayed ⇒ 402 secret-free reason | unit | `npx vitest run src/x402.test.ts -t "reject"` | ❌ Wave 0 |
| PAY-01 | `self` verify/settle against a stubbed ledger (owner/instrument/amount/lock) | unit | `npx vitest run src/facilitator.test.ts -t "self"` | ❌ Wave 0 |
| PAY-01 | `canton-cc` verify/settle against stubbed `fetch` of `/verify`+`/settle` | unit | `npx vitest run src/facilitator.test.ts -t "canton-cc"` | ❌ Wave 0 |
| PAY-01 | Secret-sweep: no operator token / `X402_FACILITATOR_KEY` / `ANTHROPIC_API_KEY` in any body/header | unit | `npx vitest run src/x402.test.ts -t "secret sweep"` | ❌ Wave 0 |
| PAY-01 | §4 fixture still clears $100.00 with the gate present | unit | `npx vitest run src/auction.test.ts -t "100"` (existing golden) | ✅ |
| PAY-01 | Never-metered paths (`/status`,`/settle`,`GET /round/:id`) never 402 | unit | `npx vitest run src/x402.test.ts -t "free paths"` | ❌ Wave 0 |
| PAY-01 | `constructSelfPayment` helper builds a valid X-PAYMENT (round-trips through decode) | unit | `npx vitest run src/x402.test.ts -t "construct payment"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/x402.test.ts src/facilitator.test.ts`
- **Per wave merge:** `cd solver && npx vitest run` (full suite) + `cd daml && daml test` (§4 golden untouched)
- **Phase gate:** full solver suite green + `tsc` clean + §4 $100.00 before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `solver/src/x402.test.ts` — gate behavior (off/on/402/200/reject/secret-sweep/free-paths/construct)
- [ ] `solver/src/facilitator.test.ts` — self (stubbed ledger) + canton-cc (stubbed fetch)
- [ ] No new framework install (vitest already present).

### Live-UAT gates (NOT offline-automatable → `14-UAT.md`)
- Real FTP facilitator `/verify`+`/settle` reachable at `X402_FACILITATOR_URL`.
- Real $CC settlement on a live DevNet node with a CC-funded venue party (SV-sponsorship gated — same as Phase 12).
- A real x402 client paying the gate end-to-end.
- The exact Canton CAIP-2 network id + Canton Coin asset id confirmed against `GET /supported`.

## Security Domain

> `security_enforcement` treated as ENABLED (no config → default on).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | The fee-payment IS an auth-for-access gate; the operator credential stays module-private (`ledger.ts`); facilitator key via `SecretsProvider` |
| V3 Session Management | no | Stateless per-request (x402 is accountless by design) |
| V4 Access Control | yes | Gate meters exactly the two AI endpoints; never-metered allow-list enforced; settlement never gated |
| V5 Input Validation | yes | zod `.strict` on the decoded `X-PAYMENT` payload + facilitator responses before use |
| V6 Cryptography | partial | base64 decode via `Buffer` (transport, not crypto); nonce via `node:crypto`; do NOT hand-roll signature crypto — the `self` scheme uses presented-cid + operator authority (no signature); a future payer-signed variant is deferred |
| V7 Error Handling / Logging | yes | Secret-safe envelope (`api.ts:1471`); reasons authored secret-free; nothing logged that carries a token/key |

### Known Threat Patterns (feeds the planner's `<threat_model>`)
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `X-PAYMENT` replay (resend a valid payload) | Spoofing / Elevation | Module-private spent-`nonce` set + `validBefore` expiry check; reject `nonce_replayed`/`payment_expired` |
| Double-use of a presented fee-Holding cid | Tampering | Spent-`holdingCid` set + ledger archives the cid on `moveExactHolding`; reject reused cid |
| Insufficient / wrong-instrument amount | Tampering | `self` verify: `owner===payer` + `instrument.id==='USDCx'` + `Number(amount) >= price` + `lock===null` (the `gatherHoldingCids` predicate) |
| Facilitator key exposure | Information Disclosure | `SecretsProvider.get('X402_FACILITATOR_KEY')` at boot; module-private; never logged/returned/echoed; secret-sweep test |
| Operator token / ANTHROPIC key in a 402 body or browser | Information Disclosure | Never in the gate; `self` uses the existing module-private operator bearer; secret-sweep sentinels |
| CORS widening | Elevation | Keep `cors({ origin: ALLOWED_ORIGIN })` (:5173 only, `api.ts:588`) — never `*`; the gate adds no new origin |
| Raw ledger/facilitator error text leaking internals | Information Disclosure | Collapse to authored secret-free `reason`; the `api.ts:1471` middleware collapses unknowns to generic 500 |
| Malformed `X-PAYMENT` / oversized body | DoS / Tampering | zod `.strict` parse → 400/402 secret-free; base64 length bound |
| Fee leaking onto the securities DvP path | Tampering | Fee is a standalone operator-custody transfer; `Round.Clear`/§8 untouched; AI off settlement (hard invariant) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Canton CAIP-2 `network` id (e.g. `"canton"`/`"canton:devnet"`) is operator-set via `X402_NETWORK`; exact value not published | Canton Scheme Specifics | Low — driven by env; confirm at UAT via `/supported`. Wrong value only affects the `canton-cc` live path, offline-mocked meanwhile |
| A2 | Canton Coin `asset` id is operator-set via `X402_ASSET`; representation not published | Canton Scheme Specifics | Low — env-driven; UAT-confirmed |
| A3 | The FTP facilitator exposes `/verify`+`/settle` at paths under `X402_FACILITATOR_URL` per the generic x402 spec | Canton Scheme Specifics | Low — proposal states "compliant with the x402 facilitator spec"; exact base path UAT-confirmed |
| A4 | Live facilitators speak x402 **v1** (`maxAmountRequired`), not v2 | Wire Format / Pitfall 2 | Medium — if the FTP facilitator is v2, flip the one `buildAccepts` helper; isolate the mapping |
| A5 | The FTP on-ledger settlement mechanism (CIP-56 transfer vs preapproval vs Allocation) is opaque to Umbra's `canton-cc` adapter | Canton Scheme Specifics | Low — the adapter only speaks HTTP `/verify`+`/settle`; mechanism is the facilitator's concern |
| A6 | The `self` scheme's `X-PAYMENT` `payload` shape (`holdingCid`/`nonce`/`validBefore`) is Umbra-defined (no external client depends on it) | Wire Format §2 | Low — Umbra owns both ends of the `self` path; the helper + tests pin it |
| A7 | An atomic-unit scale for `X402_PRICE` must be chosen + documented | Pitfall 6 | Low — a config decision; document decimals in `.env.example` |

## Open Questions

1. **Exact Canton network id + Canton Coin asset id + facilitator paths.**
   - Know: FTP facilitator exists, `/verify`+`/settle`, Canton Coin scheme, live at `dev.cantrustai.xyz`.
   - Unclear: the precise CAIP-2 string, asset id, and endpoint paths (upstream scheme not merged).
   - Recommendation: env-drive all three (`X402_NETWORK`/`X402_ASSET`/`X402_FACILITATOR_URL`); confirm at UAT via `GET /supported`. Do not hard-code.
2. **v1 vs v2 envelope for the live FTP facilitator.**
   - Know: v1 is the deployed ecosystem shape; v2 exists in-repo.
   - Recommendation: implement v1; isolate the field mapping so a v2 flip is one file; confirm at UAT.
3. **`self` payload: present-cid vs a keyless desk-signed fee-authorization choice.**
   - Recommendation: default to present-cid + operator-move (no new Daml). Only add a keyless choice if it is clearly cheaper; if added, LF 2.1 keyless.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20 + `fetch`/`Buffer`/`node:crypto` | gate + both backends | ✓ | Node 20 (solver toolchain) | — |
| express 4.19 | middleware chain | ✓ | in-tree | — |
| zod 3.23.8 | payload validation | ✓ | in-tree | — |
| vitest 2.x | tests | ✓ | in-tree | — |
| Canton JSON Ledger API v2 (:3975) | `self` live verify/settle | ✓ (dev) | Canton 3.4 LocalNet | tests stub the ledger deps (DI convention) |
| FTP Canton x402 facilitator | `canton-cc` live | ✗ (external, SV-gated) | — | offline `fetch` mock; live = `14-UAT.md` |
| CC-funded venue party on DevNet | `canton-cc` real $CC | ✗ (SV-sponsorship gated) | — | `self` runs with USDCx today; real $CC = UAT |

**Missing dependencies with fallback:** the FTP facilitator + CC-funded venue party (offline-mocked / `self` covers the live-capable path). **Missing with no fallback:** none blocks the offline build.

## Sources

### Primary (HIGH confidence)
- `github.com/coinbase/x402` `specs/x402-specification-v1.md` — 402 body, `accepts[]` fields, PaymentPayload, SettlementResponse, `/verify`+`/settle`+`/supported`, error-reason strings `[CITED]`
- `github.com/coinbase/x402` `specs/transports-v1/http.md` — `X-PAYMENT` / `X-PAYMENT-RESPONSE` base64 encoding + HTTP status mapping `[CITED]`
- `github.com/coinbase/x402` `specs/x402-specification-v2.md` — v2 field renames (`amount`, `resource` object, `extensions`) `[CITED]`
- `gh api coinbase/x402/contents/specs/schemes/exact` → no `scheme_exact_canton.md`; `search/code canton repo:coinbase/x402` → 0 `[VERIFIED: this session]`
- `npm view x402 / x402-express / @x402/express dependencies` → viem/wagmi/@solana/@coinbase — EVM/Solana orientation confirmed; `@cantrustai/x402`/`canton-x402` → 404 `[VERIFIED: this session]`
- Codebase: `solver/src/idempotency.ts`, `secrets.ts`, `ledger.ts` (:44,:253,:294,:560,:628), `api.ts` (:583,:588,:594,:818,:1350,:1471), `daml/Umbra/Holding.daml` (:34,:88,:109), `daml/Umbra/Auction.daml` (:222) `[VERIFIED: read this session]`

### Secondary (MEDIUM confidence)
- `canton-foundation/canton-dev-fund#78` proposal `proposals/x402-by-ftp-team.md` (merged) — facilitator `/verify`+`/settle`, Canton Coin scheme, CanTrustAI reference, settlement-cache dup-protection `[CITED]`

### Tertiary (LOW / UAT)
- Exact Canton CAIP-2 network id, Canton Coin asset id, FTP facilitator base paths, live x402 version — **not publicly documented**; env-driven + UAT-confirmed `[ASSUMED]`

## Metadata

**Confidence breakdown:**
- x402 wire format (v1): HIGH — pinned verbatim from the authoritative spec + HTTP transport doc
- Codebase seams (middleware, ledger, secrets, Holding): HIGH — read directly with file:line anchors
- `self` on-ledger verify/settle mechanics: HIGH — reuses proven `gatherHoldingCids`/`moveExactHolding`
- Canton scheme specifics (network id/asset/paths/version): LOW/UAT — upstream scheme not merged; env-driven
- Package rejection (x402-express EVM-oriented): HIGH — verified via `npm view` dependency lists

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 (30 days) for the v1 wire format; **7 days** for the Canton scheme specifics (fast-moving — watch for `scheme_exact_canton.md` merging upstream, which would upgrade A1–A5 from `[ASSUMED]` to `[CITED]`)
