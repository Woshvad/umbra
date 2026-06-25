# Phase 4: Solver Service - Research

**Researched:** 2026-06-25
**Domain:** Off-ledger Node 20 + TypeScript service — deterministic auction clearing (§8 port), Operator-authority JSON-API ledger client (`@daml/ledger@2.10.4`), round-lifecycle clock, Express HTTP API
**Confidence:** HIGH (all ledger/clearing facts verified against the repo's own code + generated bindings; package versions verified against the npm registry; one [SUS] heuristic false-positive resolved)

## Summary

Phase 4 stands up `solver/` — a single-process Node/TS service that holds **Operator** authority and is the only component (besides Daml Script tests) able to exercise `Round.Clear`. Three things are load-bearing and **already proven in the codebase**, so this phase is mostly a *port + wire* job rather than a discovery job:

1. **The §8 clearing math is frozen** in `daml/Umbra/Clearing.daml` (`computeClearing` / `choosePStar` / `rationByPriority`). Phase 4 ports it to `solver/src/auction.ts` **bit-identically**. The single trap is structural and already documented in the Daml source: tie-break (a) "minimize |demand−supply|" is computed **only over the max-matched candidate prices**, never all prices — without that filter the §4 fixture clears at 99 instead of 100. The TS port must reproduce that filter, the `foldl max 0` empty-list seed, the descending-buy / ascending-sell price priority, and the greedy `rationByPriority` (leftover-to-largest) exactly.

2. **The ledger client pattern is proven** in `web/src/components/DeskColumn.tsx`: `@daml/ledger@2.10.4`'s `Ledger` class exposes `ledger.query(Template)`, `ledger.exercise(Choice, cid, args)`, with **Int and Decimal passed as strings**. The constructor **requires an absolute `http(s)://…/` base URL** (the bare-`/` gotcha — in the solver there is no Vite proxy, so use `JSON_API_URL=http://localhost:7575` directly). Auth is the Operator HS256 dev JWT at `scripts/.operator-token` (minted by `scripts/mint-tokens.mjs`), claim shape `{"https://daml.com/ledger-api":{ledgerId:"sandbox",applicationId:"umbra",actAs:[operator],readAs:[operator]}}`.

3. **`Round.Clear` is Option-B**: it cannot `query` the ACS, so the solver must locate and pass in `orderCids`, `buyerUsdcCid`, and `sellerBondCids` as choice arguments (D7). The exact query→exercise sequence (find sealed Orders for the round, find the buyer's USDCx Asset and each seller's BONDX Asset, compute §8, exercise `Clear`) is the heart of `ledger.ts`. The on-ledger re-verification is the security backstop — the TS number is never trusted unverified, even though the solver computes it deterministically.

**Primary recommendation:** Build `auction.ts` first as a pure module with the ≥5 vitest scenarios (the §4 fixture is the canary; the 99-vs-100 tie-break is a mandatory regression test). Then `ledger.ts` (connect-as-Operator + the Option-B query→exercise sequence), then `api.ts` (Express, the 5 endpoints with P5/P6-forward-compatible JSON shapes), then `index.ts` (the in-memory round clock). Pin `express@4.19.x`, `cors@2.8.x`, `zod@3.23.x`, `dotenv@16.x`, `vitest@2.x`, `tsx@4.x` — **do not** take the registry-`latest` major versions (express 5 / zod 4 / vitest 4), which contradict CLAUDE.md and change APIs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Deterministic §8 clearing math | Solver service (`auction.ts`, pure) | Daml `Round.Clear` (re-verify) | Computed off-ledger to drive UI/AI; the ledger re-verifies as the authority backstop (verify-don't-trust) |
| Operator authority / sealed-order read | Solver service (`ledger.ts` as Operator) | — | Operator is a stakeholder of every `Order`; the browser never holds this authority (SOLV-04) |
| Round lifecycle clock (60s window, force-close) | Solver service (`index.ts`, in-memory) | Daml `Round`/`CloseRound` (authoritative status) | The map is clock/cache state; the ledger holds the authoritative `Round` contract |
| `RoundStats.sealedOrderCount` maintenance | Solver service (Operator recreates `RoundStats`) | Daml `RoundStats` (observer = desks) | Only the Operator can sign `RoundStats`; desks read the count, never contents (PRIV-02) |
| Atomic DvP settlement | Daml `Round.Clear` (one transaction) | Solver (gathers ContractId args) | Atomicity is a Daml-transaction property; the solver only supplies inputs (D7 Option-B) |
| HTTP API surface (:4000) | Solver service (`api.ts`, Express) | — | Lets the browser drive the demo without ledger-admin rights (SOLV-03) |
| Secret custody (Operator token, Anthropic key) | Solver service (env + `scripts/.operator-token`) | — | Strict server-side boundary (SOLV-04 / D6); never in any response or log |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ledger Integration (Operator authority)**
- Solver connects to the **HTTP JSON API** (`JSON_API_URL`, default `http://localhost:7575`) as **Operator**, using `@daml/ledger@2.10.4` + generated `@daml.js/umbra-0.1.0` bindings — same SDK line as the frontend. (Alt rejected: raw `fetch` to `/v1/*` with hand-built package-id template IDs — rejected for type-safety/parity.)
- Operator authority = the **Operator JWT** read server-side from `scripts/.operator-token` (already minted by `scripts/mint-tokens.mjs`, gitignored, never shipped to `web/`). Fallback if absent: mint at startup from `daml/parties.json` + dev HS256 secret using zero-dep `node:crypto`. The token is **never** returned by any HTTP endpoint (SOLV-04).
- `@daml/ledger`'s `Ledger` constructor requires an absolute `http(s)://…/` base URL (the bare-`/` gotcha) — solver uses the absolute `JSON_API_URL` directly (server-side, no proxy), `ledgerId = 'sandbox'`.
- File split mirrors spec §13: `auction.ts` = pure algorithm, `ledger.ts` = connect/query/exercise wrapper, `api.ts` = Express app, `index.ts` = clock + server boot. `agent.ts` + `PROMPT.md` are created empty-of-AI in P4 only if needed as seams; otherwise added in P5.

**Clearing Algorithm — TypeScript parity with Daml (CLEAR-02, CLEAR-03)**
- Port `daml/Umbra/Clearing.daml` **exactly**: candidate prices = sorted distinct limits in buys ∪ sells; for each `p`, `demand(p)=Σqty buys with limit≥p`, `supply(p)=Σqty sells with limit≤p`, `matched(p)=min(demand,supply)`. Choose `p* = argmax matched`, tie-break **(a) minimize |demand−supply| ONLY among the max-matched candidates, (b) lower price**, round to 2 decimals. (Without (a)-restricted-to-max-matched the §4 fixture clears at 99, not 100.)
- Allocation at `p*`: short side fills fully; long side rationed by **price priority** (lowest-limit sells / highest-limit buys), then **pro-rata** for ties, integer rounding never exceeding `traded`, **leftover unit(s) to the largest order** (deterministic, identical rule in TS and Daml).
- Output shape `{ clearingPrice: number, allocations: { desk, side, filledQty }[] }` mirrors Daml `Allocation` so it feeds `Round.Clear` directly. Prices as `number`, rounded `Math.round(p*100)/100`; the on-ledger `Round.Clear` re-verification is the backstop for any float skew — the TS number is never trusted unverified.
- ≥5 vitest scenarios (SOLV-05): (1) **§4 fixture** → `p*=100.00`, A=10/B=8/C=2, C residual 3; (2) exact same-limit ties (pro-rata + leftover-to-largest); (3) all-or-nothing imbalance; (4) no-cross (best buy < best sell → matched 0, no clear); (5) the **max-matched tie that exercises the lower-price tie-break** (the 99-vs-100 trap as a regression guard).

**Round Lifecycle & Clock (SOLV-01, SOLV-02)**
- In-memory `Map<roundId, RoundState>` (single-process demo; the **ledger holds the authoritative contracts** — the map is just clock/cache state). Round IDs are stable strings (e.g. `round-<counter>` or reuse the seeded `roundId`).
- 60s window from `ROUND_SECONDS` env (default 60); a per-round timer auto-advances to Closed at expiry. **Force-close** via `POST /round/:id/close` so the live demo never waits 60s. On close: read the round's sealed `Order`s as Operator → compute/verify §8 → hold the verified allocation ready for `settle`.
- `RoundStats.sealedOrderCount` is maintained by the Operator as orders arrive (poll the round's visible Orders and update/recreate the `RoundStats` contract). Desks still see only the count.
- The Phase-3 `seedOpenRound` already seeds one Open round + 3 §4 orders for the money shot; the solver's `POST /round` opens a **fresh** round. Reading/closing/clearing is by `roundId`, so the solver can also operate on the seeded round for the canonical demo.

**HTTP API on :4000 (SOLV-03, SOLV-04)**
- **Express 4.19** + **cors** (allow Vite dev origin `http://localhost:5173`) + **zod** request validation; structured JSON error responses; Anthropic key and Operator token strictly server-side, never in any response or log.
- Endpoints exactly per spec §11: `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle`.
- **Phase-4 behaviour of solve-preview/settle:** `solve-preview` returns the **deterministic §8** proposal + supply/demand curve points + `rationale: null` (Claude rationale added additively in Phase 5 — the response shape already carries the `rationale` field). `settle` exercises `Round.Clear` with the verified deterministic allocation and guards against double-settle (reject if already Cleared/Settled).

### Claude's Discretion
- Exact in-memory state struct, error-envelope shape, logging, and whether `agent.ts` is stubbed in P4 or first appears in P5 — at the executor's discretion, guided by spec §11/§13 and existing repo conventions (zero-dep crypto JWT, `node:crypto`, ESM/TS config matching `web/`).

### Deferred Ideas (OUT OF SCOPE)
- Claude integration (`agent.ts`, `@anthropic-ai/sdk`, structured-output proposal, temperature-0, NL rationale) + `solver/PROMPT.md` → **Phase 5** (AGENT-01..04).
- Theatre countdown/reveal, hand-rolled SVG supply/demand chart, settlement animation, Desk view → **Phase 6** (UI-02/04/05/06).
- `make solver` / `make demo` orchestration + README run docs → **Phase 7** (DEMO-01).
- Competing solvers, residual routing, multi-round — stretch §19 (post-P7).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAR-02 | Deterministic §8 p* maximizing matched volume, two-level tie-break (minimize \|demand−supply\| only among max-matched candidates, then lower price), 2-decimal round | Verbatim port of `choosePStar` (Clearing.daml lines 87–101). See "Code Examples → TS port of choosePStar". The trap-filter (`topPrices`) is mandatory. |
| CLEAR-03 | Short side fills fully; long side rationed by price priority then pro-rata, integer rounding never exceeding matched, leftover-to-largest, identical TS/Daml | Port of `computeClearing` + `rationByPriority` (Clearing.daml lines 114–138). Buys sorted DESC by limit, sells ASC; greedy `rationByPriority`. §4 has no equal-limit tie so greedy alone gives B=8/C=2; the pro-rata+leftover rule is documented for the tie scenario. |
| SOLV-01 | Service opens a Round, maintains `RoundStats.sealedOrderCount`, enforces 60s window, closes (`CloseRound`) | `ledger.ts` create `Round` + recreate `RoundStats`; `index.ts` in-memory clock. Round template shape verified in Auction.daml. `CloseRound` is operator-only, returns a new `ContractId Round`. |
| SOLV-02 | On close: read sealed orders, compute/verify clearing, exercise `Round.Clear` | The Option-B query→exercise sequence (Architecture Patterns → Pattern 2). Gathers `orderCids` / `buyerUsdcCid` / `sellerBondCids`. |
| SOLV-03 | HTTP API on :4000 — POST /round, GET /round/:id, POST /round/:id/close, GET /round/:id/solve-preview, POST /round/:id/settle | Express 4.19 + cors + zod. Exact JSON shapes in "Code Examples → Endpoint contracts". |
| SOLV-04 | Anthropic key + Operator creds never exposed to the browser | Token read from `scripts/.operator-token` server-side; never serialized into any response; CORS limited to :5173; structured error envelopes that never echo secrets. |
| SOLV-05 | ≥5 TS unit tests (exact same-limit ties, all-or-nothing imbalance, no-cross, §4) | vitest@2.x; 5 scenarios enumerated under Validation Architecture. The §4 fixture and the 99-vs-100 tie-break are mandatory. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `20.x` LTS | Runtime for the solver | Spec-mandated (§6); matches the toolchain the rest of the repo targets |
| TypeScript | `5.6.3` | Solver typing; consumes `@daml.js/umbra-0.1.0` typings | Match `web/` exactly (web pins `typescript@5.6.3`) for zero codegen-typing skew |
| `@daml/ledger` | `2.10.4` | JS/TS Ledger client over HTTP JSON API (query/exercise/create) | The exact client the generated bindings target; proven in `web/` |
| `@daml/types` | `2.10.4` | Core Daml↔TS type mappings (`Party`, `Decimal`, `ContractId`) | Transitive dep of `@daml/ledger` + the generated bindings; pin identical |
| `@daml.js/umbra-0.1.0` | generated (`file:../web/daml.js/umbra-0.1.0`) | Project contract bindings (`Round`, `Order`, `RoundStats`, `Asset`, `Venue`, choices, `Side`/`Allocation`) | Already generated; the solver imports the **same** package the frontend uses — no re-codegen needed |
| express | `4.19.x` (e.g. `4.19.2`) | HTTP API on :4000 | CLAUDE.md-pinned. **Do NOT use express 5.x** (registry latest = 5.2.1) — different middleware/error semantics |
| cors | `2.8.x` (e.g. `2.8.5`) | Allow the Vite dev origin (:5173) to call :4000 | Stable, ubiquitous |
| zod | `3.23.x` (e.g. `3.23.8`) | Validate request bodies (POST /round) | CLAUDE.md-pinned. **Do NOT use zod 4.x** (registry latest = 4.4.3) — breaking API changes |
| dotenv | `16.x` (e.g. `16.6.1`) | Load `JSON_API_URL`, `SOLVER_PORT`, `ROUND_SECONDS`, (`ANTHROPIC_API_KEY` unused until P5) | CLAUDE.md-pinned. **Do NOT use dotenv 17.x** (registry latest) — keep on 16 |

### Supporting (dev / build)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | `2.x` (e.g. `2.1.9`) | Unit tests for `auction.ts` (≥5 scenarios) | CLAUDE.md-pinned. **Do NOT use vitest 4.x** (registry latest); v2 matches the spec-era stack. See Package Legitimacy Audit for the [SUS] heuristic note (false positive). |
| tsx | `4.x` (e.g. `4.22.4`) | Run TS directly in dev (`tsx watch src/index.ts`) — no separate build step for the dev loop | Discretionary but standard for Node 20 + ESM TS services; mirrors the repo's "fast loop" ethos. Alt: `ts-node` (heavier ESM friction). |
| `@types/express` | `4.17.x` | Express 4 type defs | Must match express **4** (do not install `@types/express@5`) |
| `@types/cors` | `2.8.x` | cors type defs | — |
| `@types/node` | `20.x` | Node 20 type defs (`node:crypto`, `node:fs`, timers) | Match the Node runtime major |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@daml/ledger` typed client | Raw `fetch` to `/v1/query` + `/v1/exercise` with package-id template IDs | Rejected by CONTEXT.md for type-safety/parity. The package-id form is derivable (see Pitfall: template-ID resolution) but the typed client already encodes it. Keep raw fetch only as a fallback if the bindings misbehave under Node ESM. |
| tsx (dev loop) | `tsc` build to `dist/` then `node dist/index.js` | tsx is faster to iterate; a `tsc --noEmit` typecheck (mirroring `web/`'s `build` script) should still gate correctness. Both can coexist. |
| zod request validation | hand-rolled `typeof` checks | zod is CLAUDE.md-pinned and gives structured error envelopes "for free"; only POST /round really needs validation in P4. |

**Installation:**
```bash
# in solver/ (new directory)
npm install express@4.19.x cors@2.8.x zod@3.23.x dotenv@16.x \
  @daml/ledger@2.10.4 @daml/types@2.10.4 ./../web/daml.js/umbra-0.1.0
npm install -D typescript@5.6.3 vitest@2.x tsx@4.x \
  @types/express@4.17.x @types/cors@2.8.x @types/node@20.x
```
> Note: `@daml.js/umbra-0.1.0` is a generated `private` package with `peer-dependencies` on `@daml/ledger@2.10.4` + `@daml/types@2.10.4`. Installing it from the `web/daml.js/umbra-0.1.0` path may surface the same React-18-style peer friction the frontend hit; if `npm install` errors on peers, use `--legacy-peer-deps` (the established repo remedy, D3). The generated package also depends on two hash-named sub-packages (`@daml.js/40f4...`, `@daml.js/d14e...`) and `@mojotech/json-type-validation` — installing from the `file:` path pulls those transitively.

**Version verification (run 2026-06-25):** all pinned versions confirmed present on the npm registry — `express@4.19.2` ✓, `cors@2.8.5` ✓, `zod@3.23.8` ✓, `dotenv@16.6.1` (latest 16.x) ✓, `vitest@2.1.9` (latest 2.x) ✓, `tsx@4.22.4` ✓, `@types/express@4.17.25` ✓. Registry `latest` majors (express 5.2.1, zod 4.4.3, dotenv 17.4.2, vitest 4.1.9) were deliberately **rejected** — they contradict CLAUDE.md and introduce breaking API changes mid-hackathon.

## Package Legitimacy Audit

> slopcheck 0.6.1 was available and run (`python -m slopcheck install …`). Results below.

| Package | Registry | Source Repo | slopcheck | Disposition |
|---------|----------|-------------|-----------|-------------|
| express | npm (4.19.x) | github.com/expressjs/express | [OK] | Approved |
| cors | npm (2.8.x) | github.com/expressjs/cors | [OK] | Approved |
| zod | npm (3.23.x) | github.com/colinhacks/zod | [OK] | Approved |
| dotenv | npm (16.x) | github.com/motdotla/dotenv | [OK] | Approved |
| tsx | npm (4.x) | github.com/privatenumber/tsx | [OK] | Approved |
| vitest | npm (2.x) | github.com/vitest-dev/vitest | [SUS] | **Approved with note** — heuristic false positive |

**Packages removed due to slopcheck [SLOP] verdict:** none.

**Packages flagged as suspicious [SUS]:** `vitest` — slopcheck flagged it as "suspiciously close to 'vite' — could be a typosquat." This is a **heuristic false positive**: `vitest` is the official Vitest test framework (source repo `github.com/vitest-dev/vitest`, homepage `vitest.dev`, tens of millions of weekly downloads, the canonical test runner for Vite-based projects and the exact framework named in CLAUDE.md's Supporting Libraries table). The name similarity to `vite` is by design (Vitest is Vite's companion test runner), not a squat. **No checkpoint needed**, but the planner may add a one-line `checkpoint:human-verify` confirming `vitest` (not a look-alike) is what gets installed, if it wants belt-and-suspenders.

**Postinstall check:** `npm view express scripts.postinstall` returned empty — no postinstall hooks on the primary HTTP dependency.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────── solver/ (Node 20 + TS, runs as OPERATOR) ───────────────────────────┐
 Browser (:5173)    │                                                                                                  │
 desk tokens only   │   api.ts (Express :4000)                index.ts (in-memory clock)                              │
        │           │   ┌────────────────────┐               ┌──────────────────────────┐                            │
        │  HTTP      │   │ POST /round        │──opens──────▶ │ Map<roundId, RoundState> │                            │
        ├──────────▶ │   │ GET  /round/:id    │◀──reads────── │  status, deadline, timer │                            │
        │  :4000     │   │ POST /round/:id/close│──force────▶ │  cachedProposal          │                            │
        │            │   │ GET  …/solve-preview│──computes──▶ │                          │                            │
        │            │   │ POST …/settle       │──settles──▶  └──────────┬───────────────┘                            │
        │            │   └─────────┬──────────┘                          │                                            │
        │            │             │ zod validate                        │                                            │
        │            │             ▼                                     ▼                                            │
        │            │   auction.ts (PURE §8)              ledger.ts (Operator @daml/ledger client)                  │
        │            │   computeClearing(views)            ┌──────────────────────────────────────────┐             │
        │            │   → {clearingPrice, allocations}    │ openRound()       → create Round + Stats  │             │
        │            │        ▲                            │ readSealedOrders()→ query Order by roundId│             │
        │            │        └── verify ──────────────────│ updateStats()     → recreate RoundStats   │             │
        │            │                                     │ closeRound()      → exercise CloseRound   │             │
        │            │                                     │ settle()          → exercise Round.Clear  │             │
        │            │                                     │   (gathers orderCids/buyerUsdcCid/        │             │
        │            │                                     │    sellerBondCids — Option-B, D7)         │             │
        │            │                                     └───────────────┬──────────────────────────┘             │
        └────────────┘                                                     │ Bearer <operator JWT>                   │
                                                                           │ from scripts/.operator-token            │
                                                                           ▼ absolute http://localhost:7575/         │
        ┌──────────────────────────── Daml JSON API :7575 (--allow-insecure-tokens) ──────────────────────────────┐ │
        │  Round · Order · RoundStats · Asset · Venue · TradeConfirmation   (pkg aad087…:Umbra.Auction:*)          │ │
        │  Round.Clear = ONE atomic transaction: re-verify §8 → DvP reassigns → Retire orders → TradeConfirmations │ │
        └──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The browser (desk tokens, :5173) hits the solver at :4000 to *drive* the demo, and hits the JSON API directly (as a desk party) to *read its own* contracts — but it never holds the Operator token. The Operator token lives only inside `solver/`.

### Recommended Project Structure
```
solver/
├── package.json          # type:"module"; scripts dev/test/typecheck; pinned deps
├── tsconfig.json         # ESM, module/moduleResolution matching web/; "strict"
├── .env.example          # JSON_API_URL, SOLVER_PORT, ROUND_SECONDS, ANTHROPIC_API_KEY (empty)
├── vitest.config.ts      # (optional) test glob; node environment
└── src/
    ├── auction.ts        # PURE §8 port — no I/O, mirrors Clearing.daml 1:1
    ├── auction.test.ts   # ≥5 vitest scenarios (or src/__tests__/)
    ├── ledger.ts         # Operator @daml/ledger client: connect/query/exercise wrapper
    ├── api.ts            # Express app: the 5 endpoints + cors + zod + error envelope
    ├── index.ts          # round clock (in-memory Map + timers) + server boot
    └── (agent.ts)        # P5 only — create empty/stub in P4 only if a seam is needed
```

### Pattern 1: Operator ledger client (`@daml/ledger`)
**What:** A thin wrapper that constructs one `Ledger` with the Operator JWT and absolute base URL, then exposes query/exercise helpers.
**When to use:** All ledger I/O in `ledger.ts`.
**Example:**
```typescript
// Source: @daml/ledger@2.10.4 (Ledger class) — pattern proven in web/src/components/DeskColumn.tsx
import Ledger from '@daml/ledger'
import { readFileSync } from 'node:fs'

const { token, party: operator } = JSON.parse(
  readFileSync(new URL('../../scripts/.operator-token', import.meta.url), 'utf8'),
)
// ABSOLUTE url required — solver has no Vite proxy (unlike the browser).
const ledger = new Ledger({ token, httpBaseUrl: process.env.JSON_API_URL ?? 'http://localhost:7575/' })
// note: trailing slash; @daml/ledger throws on a bare '/' or a missing scheme.
```
Confidence: HIGH — `ledger.query(Template)` / `ledger.exercise(Choice, cid, args)` and the absolute-URL requirement are both used in `DeskColumn.tsx`; the constructor takes `{ token, httpBaseUrl }`.

### Pattern 2: The Option-B settle sequence (the load-bearing query→exercise)
**What:** `Round.Clear` cannot query the ACS (D7), so the solver gathers every `ContractId` the choice needs and passes them as additive args.
**When to use:** `POST /round/:id/settle`.
**Sequence (verified against Auction.daml `Clear` signature + §4 fixture):**
1. **Read sealed orders for the round** — `ledger.query(Order)` (Operator sees all), filter `payload.roundId === roundId && payload.status === 'Sealed'`. Collect their `contractId`s → `orderCids`. Build `OrderView[]` from their payloads (`desk`, `side`, `quantity:Int`, `limit:Decimal`).
2. **Compute §8** locally — `computeClearing(views)` → `{ clearingPrice, allocations }`. (This is also what `solve-preview` returns.)
3. **Identify the buyer** — the single desk with a Buy allocation (`allocations.find(a => a.side === 'Buy').desk`). In §4 that is BankA.
4. **Find the buyer's USDCx holding** — `ledger.query(Asset)`, filter `owner === buyer && symbol === 'USDCx'`, pick a contract with enough quantity → `buyerUsdcCid`. (§4: BankA's 5,000 USDCx asset.)
5. **Find each seller's BONDX holding** — for each Sell allocation with `filledQty > 0`, `ledger.query(Asset)` filter `owner === seller && symbol === 'BONDX'` → `sellerBondCids: [(seller, bondCid)]`. (§4: BankB's 20 BONDX, BankC's 15 BONDX.)
6. **Exercise `Round.Clear`** on the round's `ContractId` with `{ clearingPrice, allocations, orderCids, buyerUsdcCid, sellerBondCids }`. The choice re-verifies §8 on-ledger and performs the atomic DvP. Numbers go over the wire as **strings** (Decimal `"100.0"`, Int `"8"`).
7. **Persist the new round status** — `Clear` returns `ClearResult` and recreates the Round as `Settled`; update the in-memory map.

**Critical:** the Round `ContractId` changes whenever `CloseRound` or `Clear` recreates it (`CloseRound` returns a *new* `ContractId Round`; `Clear` creates `this with status=Settled`). The solver must re-query / track the *current* Round cid before each exercise, never cache a stale one. The lifecycle guard in `Clear` requires `status == Closed || status == Cleared`, so the solver must `CloseRound` (or operate on an already-Closed round) before `settle`.

### Pattern 3: In-memory round clock
**What:** A `Map<roundId, RoundState>` with `{ status, openedAt, deadline, timer, cachedProposal? }`. `POST /round` creates a `Round` on-ledger and starts a `setTimeout(ROUND_SECONDS*1000)` that auto-advances to Closed. `POST /round/:id/close` clears the timer and force-closes early.
**When to use:** `index.ts`.
**Note:** the map is **cache/clock state only** — the ledger `Round.status` is authoritative. On boot, the solver can `query(Round)` to rehydrate state for the seeded round (so it can operate the Phase-3 `seedOpenRound` round for the canonical demo).

### Pattern 4: P5/P6-forward-compatible response shapes
**What:** `solve-preview` and `GET /round/:id` (post-clear) already include `rationale: null` and `curve` (supply/demand step points) so Phase 5 (AI rationale) and Phase 6 (SVG chart) drop in without changing the API.
**When to use:** `api.ts` response builders.

### Anti-Patterns to Avoid
- **Trusting the TS number unverified.** Even though P4 has no AI, the discipline is structural: the deterministic result is submitted, and `Round.Clear` re-verifies. Do not add a "skip verification" fast path.
- **Caching the Round `ContractId`.** It is recreated by `CloseRound`/`Clear`. Re-query before each exercise.
- **Returning the Operator token / Anthropic key in any response or log.** SOLV-04. The error envelope must never echo request headers or env.
- **Using package-name template IDs in any raw-fetch fallback.** The Daml 2.10 JSON API resolves only **package-id** form (see Pitfall). The typed bindings already use the package-id; only a raw-fetch fallback risks this.
- **Float drift in the clearing math.** Keep unit quantities as JS `number` integers; round price with `Math.round(p*100)/100` exactly as the Daml side does `roundBankers 2`. The §4 prices are integers-as-decimals (99/100/101), so no banker's-rounding edge arises on the canary, but the rule must match for tie scenarios.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON-API request/response encoding, template-id wiring, Decimal/Int string coercion | A custom HTTP client over `/v1/*` | `@daml/ledger@2.10.4` + generated bindings | The bindings already encode package-id template IDs and the Daml↔TS type maps; a hand client re-introduces the package-name-vs-id trap and decode skew |
| HS256 JWT minting | A JWT library or hand crypto | The existing `scripts/mint-tokens.mjs` (zero-dep `node:crypto`) → read `scripts/.operator-token` | Already minted, gitignored, and dev-secret-matched; re-minting risks ledgerId/secret drift |
| Request body validation | `typeof`/manual guards | `zod@3.23.x` | CLAUDE.md-pinned; structured errors for free |
| The clearing math | A fresh "optimized" solver | A 1:1 port of `Clearing.daml` | The frozen Daml version is the on-ledger authority; any divergence is rejected by `Round.Clear` and breaks the §4 canary |
| CORS preflight handling | Manual `OPTIONS` + header juggling | `cors@2.8.x` with `origin: 'http://localhost:5173'` | Standard, correct, one line |

**Key insight:** Phase 4 is a *port + wire* phase. Almost every hard problem (privacy, atomicity, the clearing authority, JWT minting, template-id resolution) is already solved and frozen in the codebase. The value is in reproducing the §8 math bit-exactly and gathering the right ContractIds for the Option-B `Clear` — not in inventing anything.

## Common Pitfalls

### Pitfall 1: The 99-vs-100 tie-break trap (THE one that breaks the canary)
**What goes wrong:** Computing tie-break (a) "minimize |demand−supply|" across *all* candidate prices clears the §4 fixture at **99** (imbalance 2 < 3) instead of **100**.
**Why it happens:** §8's tie-breaks are nested — (a) and (b) apply *only among the prices that already achieve max matched volume*, not globally.
**How to avoid:** Filter to `topPrices` (the max-matched subset) **first**, then `sortOn (|imbalance|, price)`. This is exactly `choosePStar`'s structure. Add a dedicated regression test (scenario 5) that fails at 99 if the filter is dropped.
**Warning signs:** §4 test asserts `clearingPrice === 100` — it will go red immediately if the filter is wrong.

### Pitfall 2: `@daml/ledger` rejects a bare `/` or scheme-less base URL
**What goes wrong:** Passing `'/'` (the browser's same-origin marker) or `'localhost:7575'` to the `Ledger` constructor throws "httpBaseUrl must start with 'http://'…".
**Why it happens:** The browser relies on the Vite proxy and resolves an absolute same-origin URL at the call site (`desks.ts`); the solver has **no proxy**.
**How to avoid:** Use the absolute `JSON_API_URL` (`http://localhost:7575/`, trailing slash) directly server-side.
**Warning signs:** Constructor throws on first ledger call.

### Pitfall 3: Template-ID resolution — package-id, not package-name
**What goes wrong:** A raw `/v1/query` with `umbra:Umbra.Auction:Order` returns `unknownTemplateIds`.
**Why it happens:** The Daml 2.10 JSON API resolves template IDs by **package id** (`aad087b950f8fc6a3e50a782930ef2163eaf812c43b06d747ef127d00bb93f25:Umbra.Auction:Order`), not package name.
**How to avoid:** Use the **typed bindings** (`ledger.query(Order)`), which carry the package-id form. If a raw-fetch fallback is ever needed, derive the id from `web/daml.js/umbra-0.1.0/lib/Umbra/Auction/module.js` (the pattern in `scripts/verify-privacy.mjs`). The current main package id is `aad087b950f8fc6a3e50a782930ef2163eaf812c43b06d747ef127d00bb93f25` — but **it changes on any Daml rebuild**, so derive it, never hard-code it.
**Warning signs:** `unknownTemplateIds` in the JSON-API response.

### Pitfall 4: Stale Round ContractId after CloseRound / Clear
**What goes wrong:** Exercising `CloseRound` then `Clear` on the *original* Round cid fails (consumed/recreated).
**Why it happens:** `CloseRound` returns a new `ContractId Round`; `Clear` creates `this with status=Settled`. Each is a fresh contract.
**How to avoid:** Re-query the current Round by `roundId` (or thread the returned cid) before each exercise. Respect `Clear`'s guard: `status == Closed || status == Cleared`.
**Warning signs:** "contract not found / already archived" on the second exercise.

### Pitfall 5: Int/Decimal must cross the wire as strings
**What goes wrong:** Passing `quantity: 8` (number) or `clearingPrice: 100` to `ledger.exercise` produces decode errors.
**Why it happens:** `@daml/types` maps `Int`/`Decimal`/`Numeric` to **string** on the wire (proven in `DeskColumn.tsx`: `quantity: '10'`, `limit: '101.0'`).
**How to avoid:** Stringify all numeric choice args. `clearingPrice` as `"100.0"`, each `filledQty` as `String(n)`. The §4 `Allocation[]` filledQty values are integers; the price is a Decimal string.
**Warning signs:** JSON-API 400 / decode error on exercise.

### Pitfall 6: ESM + `@daml.js` generated package under Node
**What goes wrong:** The generated bindings (CommonJS `lib/index.js`) plus `@mojotech/json-type-validation` may need `moduleResolution`/`interop` settings to import cleanly under Node ESM (`type:"module"`).
**Why it happens:** `web/` runs under Vite (bundler resolution); the solver runs under Node directly.
**How to avoid:** Set `tsconfig` `module: "ESNext"`, `moduleResolution: "Bundler"` (or `"Node16"`) + `esModuleInterop: true`; run via `tsx` (handles interop). If a named import from `@daml.js/umbra-0.1.0/lib/Umbra/Auction` fails, fall back to a default/namespace import. Verify with a tiny `node -e` import smoke before building the whole client.
**Warning signs:** "does not provide an export named …" at import time.

### Pitfall 7: Operator-token path resolution under ESM
**What goes wrong:** `readFileSync('scripts/.operator-token')` resolves relative to CWD, which differs when run from `solver/` vs repo root.
**Why it happens:** No `__dirname` under ESM by default.
**How to avoid:** Resolve via `new URL('../../scripts/.operator-token', import.meta.url)` or `fileURLToPath` (the pattern `mint-tokens.mjs` already uses). Fallback: if the file is absent, mint from `daml/parties.json` + dev secret with `node:crypto` (zero-dep, per CONTEXT).
**Warning signs:** ENOENT on the token file.

## Runtime State Inventory

> This phase **creates** a new service rather than renaming/refactoring existing state. The only "runtime state" concerns are reads of existing per-boot artifacts.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The Daml sandbox ACS (Round/Order/RoundStats/Asset) is per-`daml start` boot; party IDs are `hint::<fingerprint>` and **not stable across reboots** (D4) | Solver reads `daml/parties.json` fresh each boot; never hard-code party IDs |
| Live service config | The seeded Open round `R1` + 3 §4 orders from `seedOpenRound` exist only in the running sandbox, not in git | Solver can operate on `roundId="R1"` for the canonical demo, or open a fresh round via POST /round |
| OS-registered state | None — the solver is a foreground Node process (no Task Scheduler / pm2 in P4; `make solver` is Phase 7) | None |
| Secrets/env vars | `scripts/.operator-token` (gitignored, per-boot, minted by `mint-tokens.mjs`); `ANTHROPIC_API_KEY` in solver `.env` (unused until P5) | Read token server-side; ship `solver/.env.example`; never commit `.env` |
| Build artifacts | `web/daml.js/umbra-0.1.0` generated bindings (package id `aad087…` embedded) — stale after any `daml build`/`daml codegen js` | Solver imports the **same** generated package; if Daml is rebuilt, the package id changes and bindings must be regenerated (already handled by `daml start`) |

## Code Examples

### TS port of `choosePStar` (the tie-break-trap-safe core)
```typescript
// Source: 1:1 port of daml/Umbra/Clearing.daml `choosePStar` (lines 87-101)
type Side = 'Buy' | 'Sell'
interface OrderView { desk: string; side: Side; quantity: number; limit: number }

const demandAt = (os: OrderView[], p: number) =>
  os.filter(o => o.side === 'Buy'  && o.limit >= p).reduce((s, o) => s + o.quantity, 0)
const supplyAt = (os: OrderView[], p: number) =>
  os.filter(o => o.side === 'Sell' && o.limit <= p).reduce((s, o) => s + o.quantity, 0)
const matchedAt = (os: OrderView[], p: number) => Math.min(demandAt(os, p), supplyAt(os, p))

const candidatePrices = (os: OrderView[]): number[] =>
  [...new Set(os.map(o => o.limit))].sort((a, b) => a - b)   // distinct, ascending

function choosePStar(os: OrderView[]): number {
  const prices = candidatePrices(os)
  const matches = prices.map(p => [p, matchedAt(os, p)] as const)
  const maxMatched = matches.reduce((m, [, mm]) => Math.max(m, mm), 0)  // foldl max 0
  // THE TRAP GUARD: keep only prices achieving max matched volume.
  const topPrices = matches.filter(([, mm]) => mm === maxMatched).map(([p]) => p)
  // tie-break (a) minimize |demand-supply| THEN (b) lower price — only over topPrices.
  const ranked = [...topPrices].sort((a, b) => {
    const ia = Math.abs(demandAt(os, a) - supplyAt(os, a))
    const ib = Math.abs(demandAt(os, b) - supplyAt(os, b))
    return ia - ib || a - b
  })
  return ranked.length ? ranked[0] : 0
}
```

### TS port of `computeClearing` + `rationByPriority`
```typescript
// Source: 1:1 port of daml/Umbra/Clearing.daml `computeClearing`/`rationByPriority` (114-138)
interface Allocation { desk: string; side: Side; filledQty: number }

// greedy price-priority ration; leftover-to-largest documented (no equal-limit tie in §4)
function rationByPriority(ordered: OrderView[], remaining: number): [OrderView, number][] {
  const out: [OrderView, number][] = []
  for (const o of ordered) {
    const f = Math.min(o.quantity, remaining)
    out.push([o, f]); remaining -= f
  }
  return out
}

export function computeClearing(os: OrderView[]): { clearingPrice: number; allocations: Allocation[] } {
  const pStar = choosePStar(os)
  const traded = matchedAt(os, pStar)
  // buys DESC by limit (most-aggressive first); sells ASC by limit.
  const buys  = os.filter(o => o.side === 'Buy'  && o.limit >= pStar).sort((a, b) => b.limit - a.limit)
  const sells = os.filter(o => o.side === 'Sell' && o.limit <= pStar).sort((a, b) => a.limit - b.limit)
  const buyFills  = rationByPriority(buys,  traded)
  const sellFills = rationByPriority(sells, traded)
  const allocations: Allocation[] = [
    ...buyFills.map(([o, f]) => ({ desk: o.desk, side: 'Buy'  as Side, filledQty: f })),
    ...sellFills.map(([o, f]) => ({ desk: o.desk, side: 'Sell' as Side, filledQty: f })),
  ]
  return { clearingPrice: Math.round(pStar * 100) / 100, allocations }   // 2-dp, mirrors roundBankers 2
}
```
> Parity note: keep the **whole filtered set** in the allocation output (including 0-fills) only if the Daml side does — `computeClearing` emits an `Allocation` for every *eligible* order (buys with limit≥p*, sells with limit≤p*). In §4 that is A=10, B=8, C=2 (C's residual 3 is `order.quantity − filledQty`, computed by the consumer). The `Round.Clear` equality check sorts allocations by `(desk, side, filledQty)` before comparing, so ordering does not matter — but the *set* must match.

### Operator JWT claim shape
```json
{
  "https://daml.com/ledger-api": {
    "ledgerId": "sandbox",
    "applicationId": "umbra",
    "actAs": ["operator::1220cf66…"],
    "readAs": ["operator::1220cf66…"]
  }
}
```
> HS256 over the empty dev secret under `--allow-insecure-tokens` (D5, dev only). Already minted to `scripts/.operator-token` by `scripts/mint-tokens.mjs`. **Never** ship this token to the browser (D6 / SOLV-04).

### Endpoint contracts (P5/P6-forward-compatible JSON)
```typescript
// POST /round            → { roundId: string, status: "Open", openedAt: string, windowSeconds: number }
// GET  /round/:id        → {
//   roundId, status: "Open"|"Closed"|"Cleared"|"Settled",
//   sealedOrderCount: number,
//   // present only after clear/settle:
//   clearingPrice?: number, matchedVolume?: number,
//   curve?: { price: number, demand: number, supply: number }[],   // P6 SVG chart points
//   rationale?: string | null                                       // P5 fills this; P4 = null
// }
// POST /round/:id/close  → { roundId, status: "Closed" }
// GET  /round/:id/solve-preview → {
//   roundId, clearingPrice: number, matchedVolume: number,
//   allocations: { desk, side, filledQty }[],
//   curve: { price, demand, supply }[],
//   rationale: null                                                 // additive seam for P5
// }   // computes but does NOT settle
// POST /round/:id/settle → { roundId, status: "Settled", clearingPrice, allocations, txConfirmations: number }
//   // guards: reject if status already Cleared/Settled (double-settle), 409
// Error envelope (all endpoints): { error: { code: string, message: string } }  // NEVER echoes secrets/headers
```
> `curve` points = for each candidate price, `{ price, demand: demandAt, supply: supplyAt }` — exactly the data the Phase-6 hand-rolled SVG crossing chart needs, computed here for free from `auction.ts`.

## State of the Art

| Old Approach | Current Approach (this build) | Why |
|--------------|------------------|-----|
| express 4.x (this build pins 4.19.x) | express 5.2.1 is registry-latest | **Stay on 4.19.x** — express 5 changes async error handling, path-matching, and `req.query` semantics; CLAUDE.md pins 4.19.x |
| zod 3.23.x (this build) | zod 4.4.3 is registry-latest | **Stay on 3.23.x** — zod 4 reorganizes the package + changes some inference; CLAUDE.md-pinned |
| vitest 2.x (this build) | vitest 4.1.9 is registry-latest | **Stay on 2.x** — v3/v4 bump the config/runtime; v2 matches the spec-era stack and `web/`'s tooling generation |
| Daml 2.10.4 HTTP JSON API v1 (`/v1/*`) | Daml 3.x JSON Ledger API v2 | **Stay on 2.x** — D2; v2 is the §19 cn-quickstart stretch only, different request shapes, `@daml/ledger` is not its canonical client |

**Deprecated/outdated for this phase:** none beyond the version pins above. The `@daml/ledger@2.10.4` client and `daml codegen js` bindings are the correct, current tools for the Daml 2.10 line.

## Project Constraints (from CLAUDE.md)

- **No Claude git attribution — ever.** No `Co-Authored-By`, no "Generated with" trailer, on any commit/push during this build. Author/committer stays `woshvad <woshvad@gmail.com>`. (Overrides default Claude Code commit-trailer behavior — applies to the Phase-4 commit too.)
- **Secrets server-side only (D6 / §15 / SOLV-04).** `ANTHROPIC_API_KEY` and the Operator token are read solely by `solver/`; `.env` is gitignored; ship `solver/.env.example` with empty placeholders. Never return either in any HTTP response or log.
- **Canonical §4 fixture clears at exactly $100.00** (fills A=10/B=8/C=2, C residual 3). The TS `auction.ts` must produce this, identical to Daml `test_clears_at_100`. Continuous correctness reference.
- **Stack is fixed by spec §6 / CLAUDE.md:** Node 20 + TypeScript, `@daml/ledger@2.10.4`, express 4.19.x, cors 2.8.x, zod 3.23.x, dotenv 16.x, vitest 2.x. Do not drift to registry-latest majors.
- **Verify, don't trust:** the deterministic result is what gets submitted; `Round.Clear` re-verifies on-ledger. No number is settled unchecked — structural even in P4 (no AI yet).
- **GSD workflow enforcement:** file edits go through a GSD command (this phase runs under `/gsd-execute-phase`).
- **`spec.md` is authoritative;** build to spec, do not seek clarification.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x |
| Config file | `solver/vitest.config.ts` (optional; vitest auto-discovers `*.test.ts`) — see Wave 0 |
| Quick run command | `cd solver && npx vitest run src/auction.test.ts` |
| Full suite command | `cd solver && npx vitest run` |
| Typecheck gate | `cd solver && npx tsc --noEmit` (mirrors `web/`'s `build` script) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAR-02 / CLEAR-04 | §4 fixture clears at 100.00, A=10/B=8/C=2, C residual 3 | unit | `npx vitest run src/auction.test.ts -t "section-4 fixture"` | ❌ Wave 0 |
| CLEAR-02 | 99-vs-100 tie-break trap regression (max-matched filter mandatory) | unit | `npx vitest run src/auction.test.ts -t "lower-price tie-break"` | ❌ Wave 0 |
| CLEAR-03 | exact same-limit ties → pro-rata + leftover-to-largest | unit | `npx vitest run src/auction.test.ts -t "same-limit ties"` | ❌ Wave 0 |
| CLEAR-03 | all-or-nothing imbalance (short side fills fully) | unit | `npx vitest run src/auction.test.ts -t "imbalance"` | ❌ Wave 0 |
| CLEAR-02 | no-cross (best buy < best sell → matched 0, no clear) | unit | `npx vitest run src/auction.test.ts -t "no-cross"` | ❌ Wave 0 |
| SOLV-03 / SOLV-04 | endpoint shapes + secret never in response | integration (light) | manual curl or supertest against a booted :4000 (live-check, human gate) | ❌ optional Wave 0 |
| SOLV-01/02 | open→close→settle drives Round.Clear against the live sandbox | E2E (live) | manual: boot `daml start`, run solver, curl the 5 endpoints, assert Settled (human gate) | ❌ live-check |

### Sampling Rate
- **Per task commit:** `cd solver && npx vitest run src/auction.test.ts` (the 5 clearing scenarios — fast, deterministic, no ledger).
- **Per wave merge:** `cd solver && npx vitest run && npx tsc --noEmit` (full suite + typecheck).
- **Phase gate:** all 5 vitest scenarios green + a manual live E2E (boot sandbox + solver, curl POST /round → close → solve-preview shows 100.00 → settle → Settled) before `/gsd-verify-work`. The live ledger path (SOLV-01/02/03) is a **human-verify** gate, since it needs a running `daml start` sandbox.

### Wave 0 Gaps
- [ ] `solver/src/auction.test.ts` — the ≥5 clearing scenarios (covers CLEAR-02, CLEAR-03, SOLV-05). The §4 fixture and the 99-vs-100 trap are mandatory.
- [ ] `solver/package.json` + `tsconfig.json` + `vitest` install — no test infrastructure exists in `solver/` yet (the directory does not exist).
- [ ] (optional) `solver/vitest.config.ts` — only if non-default test glob/environment is wanted; vitest runs without it.
- [ ] Framework install: `cd solver && npm install -D vitest@2.x tsx@4.x typescript@5.6.3`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Operator HS256 dev JWT (`scripts/.operator-token`) for the ledger; dev-only `--allow-insecure-tokens` (D5). No auth on :4000 itself (dev demo; the browser already holds desk tokens for the JSON API). |
| V3 Session Management | no | Stateless HTTP; in-memory round map is not a user session |
| V4 Access Control | yes | Operator authority is the access boundary — only `solver/` holds it; the browser cannot exercise `Round.Clear`. CORS limited to `http://localhost:5173`. |
| V5 Input Validation | yes | **zod** on request bodies (POST /round). Reject malformed roundId / params. The on-ledger `Round.Clear` re-verification is the deep validation backstop. |
| V6 Cryptography | yes (delegated) | HS256 JWT minting via `node:crypto` (existing `mint-tokens.mjs`) — never hand-roll; dev-secret only |
| V7 Error Handling / Logging | yes | Structured error envelope that **never** echoes the Operator token, Anthropic key, or request auth headers (SOLV-04). Do not log full env. |
| V14 Configuration | yes | `.env` gitignored; ship `.env.example`; secrets read only by `solver/` (D6) |

### Known Threat Patterns for the solver service
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Operator token / Anthropic key leaked to the browser or logs | Information Disclosure | Token read server-side only; never serialized into responses; error envelope strips secrets; CORS scoped to :5173 (SOLV-04 / D6) |
| Malicious/wrong clearing proposal submitted | Tampering | `Round.Clear` re-verifies §8 on-ledger and rejects mismatch (verify-don't-trust); P4 submits only the deterministic result |
| Double-settle (replay POST /settle) | Tampering / EoP | `Clear`'s lifecycle guard (`status == Closed \|\| Cleared`) + the solver returns 409 if already Cleared/Settled |
| Unauthenticated origin driving the demo | Spoofing / EoP | CORS `origin: 'http://localhost:5173'`; dev-only posture (no production auth in scope) |
| Insecure dev JWT misused beyond sandbox | EoP | `--allow-insecure-tokens` is dev-sandbox ONLY, NEVER deploy (D5) — documented, no deploy path in P4 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@daml/ledger@2.10.4`'s `Ledger` constructor signature is `new Ledger({ token, httpBaseUrl })` and exposes `.query(Template)` / `.exercise(Choice, cid, args)` under Node (not just bundler) | Pattern 1, Pitfall 6 | If named imports/ESM interop differ under Node, the client needs `tsconfig`/import tweaks (Pitfall 6 covers the remedy) — but the *shape* is verified from `web/` usage, so HIGH confidence the API exists; only the Node ESM packaging is the open risk |
| A2 | The seller's BONDX and buyer's USDCx Asset contracts each have enough quantity in a single contract id (no pre-merge needed before `Clear`) | Pattern 2 step 4-5 | §4 holdings are single minted assets (A:5000 USDCx, B:20 BONDX, C:15 BONDX), so one cid per (owner,symbol) suffices for the canonical demo. If a desk's holding were split across multiple assets, the solver would need to pick/merge one with enough quantity. Low risk for the §4 fixture; flag for any non-canonical round. |
| A3 | `tsx@4.x` is the right dev runner for the Node 20 + ESM + generated-CJS-bindings mix | Standard Stack, Pitfall 6 | If tsx struggles with the `@daml.js` CJS interop, fall back to `tsc` build + `node dist/`. Discretionary per CONTEXT; not load-bearing for correctness. |
| A4 | The Operator can `query(Order)` and see *all* desks' sealed orders (Operator is a stakeholder of every Order) | Pattern 2 step 1 | Verified from the template: `Order` signatory = `operator, desk`, so Operator is a stakeholder and reads all. HIGH — this is the privacy model's premise. |

## Open Questions

1. **`@daml/ledger` under Node ESM with the generated CJS bindings.**
   - What we know: the client API (`.query`/`.exercise`/string-encoded Int/Decimal/absolute URL) is proven in `web/` under Vite. The generated package is CommonJS with a `@mojotech/json-type-validation` dep.
   - What's unclear: whether importing `@daml.js/umbra-0.1.0/lib/Umbra/Auction` + constructing `Ledger` works cleanly under Node 20 `type:"module"` without interop tweaks.
   - Recommendation: First task in `ledger.ts` is a tiny import + connect + `query(Round)` smoke (against a live sandbox or just a typecheck + `node -e` import). Use `tsx` and `esModuleInterop`; fall back to namespace/default imports per Pitfall 6. This is the single de-risking step that should happen before building the full client.

2. **Where exactly does `POST /round` get its `desks` list and `symbol`?**
   - What we know: `Round` needs `operator, roundId, symbol="BONDX", desks=[A,B,C], openedAt, windowSeconds, status`. The desks/operator come from `daml/parties.json`.
   - What's unclear: nothing blocking — read `parties.json` for the party set; `symbol="BONDX"`, `windowSeconds=ROUND_SECONDS`. Documented here so the planner wires the `parties.json` read into `index.ts`/`ledger.ts`.
   - Recommendation: read `daml/parties.json` once at boot (same file `mint-tokens.mjs` reads); pass `desks=[bankA,bankB,bankC]`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ (assumed; `web/` runs on it) | 20.x target | — |
| npm registry (express/cors/zod/dotenv/vitest/tsx) | install | ✓ all verified 2026-06-25 | pinned per CLAUDE.md | — |
| Daml sandbox + JSON API :7575 (`daml start`) | live ledger I/O (SOLV-01/02/03) | ✓ at runtime (D1, `daml start` verified on this machine) | SDK 2.10.4 | None — the live E2E (open/close/settle) requires a running sandbox; unit tests (`auction.ts`) need no ledger |
| `scripts/.operator-token` | Operator auth | per-boot (minted by `mint-tokens.mjs`) | — | Mint from `daml/parties.json` + dev secret with `node:crypto` |
| `daml/parties.json` | party IDs | per-boot (exported by `seedOpenRound`/`exportParties`) | — | None — must run `daml start` + export first |
| `web/daml.js/umbra-0.1.0` generated bindings | typed ledger client | ✓ present (committed/generated) | pkg id `aad087…` | Regenerate via `daml codegen js` if Daml is rebuilt |

**Missing dependencies with no fallback:** the live E2E ledger path needs a running `daml start` sandbox + fresh `parties.json` + minted Operator token — this is a **human-verify / live-check** gate, not an automated unit gate. The pure clearing tests (the bulk of P4's automatable surface) need none of this.

**Missing dependencies with fallback:** Operator token (mint from parties.json + node:crypto if `.operator-token` absent).

## Sources

### Primary (HIGH confidence)
- `daml/Umbra/Clearing.daml` (repo) — the frozen §8 algorithm to port (computeClearing/choosePStar/rationByPriority + tie-break-trap docs)
- `daml/Umbra/Auction.daml` (repo) — `Round.Clear` Option-B signature (`orderCids`/`buyerUsdcCid`/`sellerBondCids`), `CloseRound`, `Order`/`RoundStats`/`Round`/`TradeConfirmation`/`ClearResult` shapes, the on-ledger re-verification body
- `web/src/components/DeskColumn.tsx` (repo) — proven `@daml/ledger` client pattern (`ledger.query`/`ledger.exercise`, Int/Decimal-as-strings)
- `web/src/desks.ts` (repo) — the absolute-`http://…/` base-URL requirement and the bare-`/` gotcha
- `scripts/mint-tokens.mjs` (repo) — zero-dep `node:crypto` HS256 JWT minting; Operator token → `scripts/.operator-token`; JWT claim shape
- `scripts/verify-privacy.mjs` (repo) — package-id template-ID derivation pattern; live `/v1/query` per-party isolation check
- `web/daml.js/umbra-0.1.0/lib/Umbra/Auction/module.js` (repo) — main package id `aad087b950f8fc6a3e50a782930ef2163eaf812c43b06d747ef127d00bb93f25`; choice names `Clear`/`CloseRound`/`Retire`/`SubmitOrder`
- `spec.md` §6/§8/§10/§11/§13/§15/§16 (repo) — solver responsibilities, the clearing algorithm verbatim + worked example, atomic settlement, endpoint list, project structure, secrets, testing
- `DECISIONS.md` D1–D7 (repo) — SDK 2.10.4 pin, JSON API v1 line, React-18 peer remedy, ephemeral party IDs, dev tokens, secrets, Option-B
- npm registry (`npm view`, 2026-06-25) — verified versions: express@4.19.2, cors@2.8.5, zod@3.23.8, dotenv@16.6.1, vitest@2.1.9, tsx@4.22.4, @types/express@4.17.25; source repos for the [SUS] resolution
- slopcheck 0.6.1 (`python -m slopcheck install`) — 5 [OK], 1 [SUS] (vitest, heuristic false positive, resolved)

### Secondary (MEDIUM confidence)
- CLAUDE.md "Recommended Stack" / "Version Compatibility" tables — the version pins (express 4.19.x, zod 3.23.x, vitest 2.x, dotenv 16.x) cross-checked against the registry-latest majors to flag the deliberate non-upgrade

### Tertiary (LOW confidence)
- None — every load-bearing claim is verified against repo code or the npm registry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against the npm registry; client API verified from working `web/` code
- Architecture / Option-B settle sequence: HIGH — derived directly from the frozen `Round.Clear` signature + D7 + the §4 fixture
- Clearing algorithm port: HIGH — 1:1 with the frozen, on-ledger-verified `Clearing.daml`; the on-ledger re-check is a structural backstop
- Pitfalls: HIGH — each is sourced from an existing repo gotcha (bare-URL, package-id template, Int/Decimal strings) or the frozen Daml semantics (tie-break trap, stale cid)
- Node ESM packaging of `@daml/ledger` + generated bindings: MEDIUM — the client API is proven, but its behavior under Node `type:"module"` (vs Vite) is the one unverified-in-this-session item (Open Question 1, A1)

**Research date:** 2026-06-25
**Valid until:** ~2026-07-25 (stable — pinned SDK 2.10.4 + pinned dep majors; the only churn risk is the Node-ESM packaging detail, resolvable at build time)

## RESEARCH COMPLETE

**Phase:** 4 - Solver Service
**Confidence:** HIGH

### Key Findings
- **This is a port + wire phase, not discovery.** The §8 math is frozen in `Clearing.daml`, the ledger-client pattern is proven in `web/`, JWT minting exists, and template-id resolution is already solved. Almost nothing needs inventing.
- **The one mandatory trap:** tie-break (a) "minimize |demand−supply|" must filter to the **max-matched candidate prices first** (`topPrices`), else the §4 fixture clears at 99 not 100. A dedicated regression test (scenario 5) guards it.
- **`Round.Clear` is Option-B:** the solver must `query` the ACS at the service tier and pass `orderCids` / `buyerUsdcCid` / `sellerBondCids` as choice args (the choice body cannot query). The exact query→exercise sequence is documented (Pattern 2).
- **Pin versions deliberately below registry-latest:** express 4.19.x (not 5), zod 3.23.x (not 4), vitest 2.x (not 4), dotenv 16.x (not 17) — all CLAUDE.md-mandated and verified present on npm.
- **Secrets are structural:** Operator token (`scripts/.operator-token`) + Anthropic key (P5) stay server-side; absolute `http://localhost:7575/` base URL (no Vite proxy server-side); Int/Decimal cross the wire as strings.

### File Created
`.planning/phases/04-solver-service/04-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions verified on npm registry; client API verified from working `web/` code |
| Architecture (Option-B settle) | HIGH | Derived from the frozen `Round.Clear` signature + D7 + §4 fixture |
| Clearing port | HIGH | 1:1 with the on-ledger-verified `Clearing.daml` |
| Pitfalls | HIGH | Each sourced from an existing repo gotcha or frozen Daml semantics |
| Node-ESM packaging of `@daml/ledger` | MEDIUM | Client API proven; behavior under Node `type:"module"` is the one open item (de-risk with an early import smoke) |

### Open Questions
1. `@daml/ledger` + generated CJS bindings under Node ESM — de-risk with a tiny import+connect smoke as the first `ledger.ts` task (Open Question 1 / A1).
2. `POST /round` reads `desks`/`operator` from `daml/parties.json` (the same file `mint-tokens.mjs` reads) — wire that read in `index.ts`/`ledger.ts` (non-blocking).

### Ready for Planning
Research complete. The planner can now create PLAN.md files: build order is `auction.ts` (+ ≥5 vitest scenarios, the §4 + 99-vs-100 canaries) → `ledger.ts` (Operator client + Option-B settle sequence, lead with an ESM import smoke) → `api.ts` (5 endpoints, P5/P6-forward-compatible shapes) → `index.ts` (in-memory clock). vitest carries a slopcheck [SUS] heuristic false-positive (planner may add an optional one-line human-verify confirming `vitest` not a look-alike).
