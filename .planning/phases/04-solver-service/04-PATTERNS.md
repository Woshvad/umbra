# Phase 4: Solver Service - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 9 (5 src + 4 config)
**Analogs found:** 9 / 9 (all in-repo; this is a port + wire phase)

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `solver/src/auction.ts` | utility (pure algorithm) | transform | `daml/Umbra/Clearing.daml` | exact (1:1 language port) |
| `solver/src/auction.test.ts` | test | transform | `daml/Umbra/Tests.daml` (`test_clears_at_100`) + RESEARCH §"TS port" | role-match (Daml Script → vitest) |
| `solver/src/ledger.ts` | service (ledger client) | request-response / CRUD | `web/src/components/DeskColumn.tsx` (client usage) + `scripts/mint-tokens.mjs` (JWT) + `scripts/verify-privacy.mjs` (query/template-id) | exact (same `@daml/ledger@2.10.4` API, server-side) |
| `solver/src/api.ts` | controller (Express) | request-response | *(no Express analog in repo)* — RESEARCH §"Endpoint contracts" + `scripts/verify-privacy.mjs` error/envelope style | no-analog (use RESEARCH) |
| `solver/src/index.ts` | service (clock + boot) | event-driven (timers) | *(no analog)* — RESEARCH §"Pattern 3: In-memory round clock" | no-analog (use RESEARCH) |
| `solver/package.json` | config | — | `web/package.json` | role-match (web is bundler, solver is Node ESM) |
| `solver/tsconfig.json` | config | — | `web/tsconfig.json` | role-match (adjust moduleResolution for Node) |
| `solver/vitest.config.ts` | config | — | *(none — web has no vitest)* | no-analog (optional; vitest auto-discovers) |
| `solver/.env.example` | config | — | `web/src/config.ts` conventions + `mint-tokens.mjs` constants | partial |

## Pattern Assignments

### `solver/src/auction.ts` (utility, transform)

**Analog:** `daml/Umbra/Clearing.daml` — port **1:1**, function-for-function. The RESEARCH file already contains the verified TS port (RESEARCH lines 313-373); use it verbatim. Below is the load-bearing source to mirror.

**Type/data shapes** (`Clearing.daml` lines 31-50) — `Side='Buy'|'Sell'`, `OrderView{desk,side,quantity:number,limit:number}`, `Allocation{desk,side,filledQty:number}`. Output `{ clearingPrice:number, allocations:Allocation[] }`.

**`demandAt`/`supplyAt`/`matchedAt`/`candidatePrices`** (`Clearing.daml` lines 58-74):
```daml
demandAt orders p = sum [ o.quantity | o <- orders, isBuy o, o.limit >= p ]
supplyAt orders p = sum [ o.quantity | o <- orders, isSell o, o.limit <= p ]
matchedAt orders p = min (demandAt orders p) (supplyAt orders p)
candidatePrices orders = sort (dedup [ o.limit | o <- orders ])   -- distinct ASC
```

**`choosePStar` — THE tie-break-trap-safe core** (`Clearing.daml` lines 87-101). Reproduce the `topPrices` filter EXACTLY or §4 clears at 99 not 100:
```daml
maxMatched = foldl max 0 [ m | (_, m) <- matches ]        -- empty-list-safe seed (no-cross → 0)
topPrices  = [ p | (p, m) <- matches, m == maxMatched ]   -- TRAP GUARD: max-matched subset ONLY
ranked     = sortOn (\p -> (abs (demandAt orders p - supplyAt orders p), p)) topPrices
-- (a) min |demand-supply| THEN (b) lower price — applied ONLY over topPrices
```

**`rationByPriority` (greedy, leftover-to-largest)** (`Clearing.daml` lines 114-118):
```daml
rationByPriority (o :: rest) remaining =
  let f = min o.quantity remaining in (o, f) :: rationByPriority rest (remaining - f)
```

**`computeClearing` — sort order is load-bearing** (`Clearing.daml` lines 125-138):
```daml
buys  = sortOn (\o -> negate o.limit) [eligible buys]   -- DESC by limit (most aggressive first)
sells = sortOn (.limit)               [eligible sells]  -- ASC by limit
-- emit an Allocation for EVERY eligible order (incl. partial-fills like C);
-- price rounded: TS = Math.round(pStar*100)/100 (mirrors Daml roundBankers 2)
```

---

### `solver/src/auction.test.ts` (test, transform)

**Analog:** the §4 canary in `daml/Umbra/Tests.daml` (`test_clears_at_100`) is the assertion contract; `Clear`'s on-ledger re-verify in `Auction.daml` lines 179-189 shows the equality semantics to mirror (multiset allocation equality via sort key, price compared at 2-dp).

**5 mandatory scenarios** (RESEARCH lines 446-452):
1. **§4 fixture** → `clearingPrice===100`, A=10/B=8/C=2 (C residual = `quantity-filledQty` = 3). The canary.
2. **same-limit ties** → pro-rata + leftover-to-largest.
3. **all-or-nothing imbalance** → short side fills fully.
4. **no-cross** (best buy < best sell) → matched 0, no clear (verifies `foldl max 0` seed → pStar 0.0).
5. **99-vs-100 tie-break regression** → fails at 99 if the `topPrices` filter is dropped. MANDATORY guard.

**Allocation-equality pattern to assert** (`Auction.daml` lines 183-185): sort by `(desk, side, filledQty)` before comparing — order-independent multiset equality.

---

### `solver/src/ledger.ts` (service, request-response + CRUD)

**Analog:** `web/src/components/DeskColumn.tsx` (client API) + `scripts/mint-tokens.mjs` (JWT) + `scripts/verify-privacy.mjs` (template-id derivation). NOTE: server-side uses the ABSOLUTE base URL, NOT the browser's same-origin `/`.

**Binding imports** (`DeskColumn.tsx` lines 20-23) — import templates/choices from the SAME generated package the frontend uses:
```typescript
import { Order } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import { Venue } from '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'
// Round, RoundStats, RoundStatus, Allocation, ClearResult are in .../Umbra/Auction/module
```

**Ledger construction — absolute URL (the bare-`/` gotcha)** (`desks.ts` lines 22-31 explains WHY the browser differs; solver has no proxy → use absolute). RESEARCH Pattern 1 (lines 199-210):
```typescript
import Ledger from '@daml/ledger'
import { readFileSync } from 'node:fs'
const { token, party: operator } = JSON.parse(
  readFileSync(new URL('../../scripts/.operator-token', import.meta.url), 'utf8'))
const ledger = new Ledger({ token,
  httpBaseUrl: process.env.JSON_API_URL ?? 'http://localhost:7575/' })  // ABSOLUTE + trailing slash
```

**Operator token source** (`mint-tokens.mjs` lines 87-90 writes it; lines 60-74 show mint). The fallback-mint pattern (if `scripts/.operator-token` absent) is `mint-tokens.mjs` verbatim — zero-dep `node:crypto` HS256, claim shape (lines 63-73):
```javascript
{ 'https://daml.com/ledger-api': { ledgerId: 'sandbox', applicationId: 'umbra',
    actAs: [party], readAs: [party] } }   // HS256 over '' dev secret; createHmac('sha256','')
```
ESM path resolution: `new URL('../../scripts/.operator-token', import.meta.url)` / `fileURLToPath` (the `mint-tokens.mjs` pattern, lines 24-28). The token is NEVER returned by any HTTP endpoint (SOLV-04).

**Query usage** (`DeskColumn.tsx` line 66): `const venues = await ledger.query(Venue)`. For the solver: `ledger.query(Order)` (Operator sees all — `Order` signatory = operator+desk, `Auction.daml` line 69), filter `payload.roundId===roundId && payload.status==='Sealed'`.

**Exercise usage — Int/Decimal as STRINGS** (`DeskColumn.tsx` lines 70-76):
```typescript
await ledger.exercise(Venue.SubmitOrder, venueCid, {
  desk: ..., roundId: 'R1', side: Side.Buy, quantity: '10', limit: '101.0' })  // STRINGS
```

**Create usage (Round + RoundStats)** — `Round` and `RoundStats` have NO operator "open" choice (`Auction.daml` lines 123-134, 101-109); the Operator is sole signatory, so create them directly with `ledger.create(Round, {...})` / `ledger.create(RoundStats, {...})`. `RoundStats.sealedOrderCount` is maintained by archive+recreate (no update choice exists). Round fields: `{operator, roundId, symbol:'BONDX', desks:[...], openedAt, windowSeconds, status:'Open'}`.

**The Option-B `Clear` settle sequence** (`Auction.daml` lines 151-157 = the choice signature; RESEARCH Pattern 2 lines 213-225 = the full sequence):
```daml
choice Clear : ClearResult with
    clearingPrice  : Decimal                      -- "100.0"
    allocations    : [Allocation]                 -- {desk, side, filledQty:String(n)}
    orderCids      : [ContractId Order]           -- gathered from query(Order)
    buyerUsdcCid   : ContractId Asset             -- buyer's USDCx (query Asset, owner===buyer, symbol==='USDCx')
    sellerBondCids : [(Party, ContractId Asset)]  -- per seller's BONDX
  controller operator
```
Guard (`Auction.daml` lines 163-164): only settleable when `status == Closed || status == Cleared` → `CloseRound` first. `CloseRound` (lines 140-143) returns a NEW `ContractId Round`; `Clear` recreates as `Settled`. **Re-query the current Round cid before each exercise — never cache** (Pitfall 4). Buyer = the single Buy-side desk in allocations (`a.side==='Buy'`).

---

### `solver/src/api.ts` (controller, request-response) — NO repo analog

Use RESEARCH §"Endpoint contracts" (lines 389-410) for exact JSON shapes. Express 4.19 + cors (`origin:'http://localhost:5173'`) + zod on `POST /round`. Five endpoints: `POST /round`, `GET /round/:id`, `POST /round/:id/close`, `GET /round/:id/solve-preview`, `POST /round/:id/settle` (409 on double-settle).

**Forward-compat (P5/P6):** every clear/preview response carries `rationale: null` (P5 fills) and `curve: {price,demand,supply}[]` (P6 SVG) — computed for free from `auction.ts`. **Error envelope:** `{ error: { code, message } }` — never echo the Operator token / Anthropic key / request headers. Closest in-repo style precedent for structured error/remedy messaging is `verify-privacy.mjs` lines 95-106 (no secrets in output).

---

### `solver/src/index.ts` (service, event-driven) — NO repo analog

Use RESEARCH §"Pattern 3" (lines 227-230). In-memory `Map<roundId, RoundState>` = `{status, openedAt, deadline, timer, cachedProposal?}`. `POST /round` → `ledger.create(Round)` + `setTimeout(ROUND_SECONDS*1000)` auto-close. The map is cache/clock only; ledger `Round.status` is authoritative — on boot, `ledger.query(Round)` to rehydrate (so the solver can drive the seeded `R1` round).

---

### `solver/package.json` / `solver/tsconfig.json` (config)

**Analog:** `web/package.json` (lines 1-30) + `web/tsconfig.json` (lines 1-24). Mirror: `"type":"module"`, `"private":true`, `typescript@5.6.3`, `@daml/ledger@2.10.4` + `@daml/types@2.10.4` pinned IDENTICAL. Install `@daml.js/umbra-0.1.0` via `file:../web/daml.js/umbra-0.1.0` (use `--legacy-peer-deps` if peer friction — D3).

**Deviation from web (Node, not bundler):** `web/tsconfig.json` uses `moduleResolution:"bundler"`, `jsx:"react-jsx"`, `noEmit:true`. The solver runs under Node ESM, so set `module:"ESNext"`, `moduleResolution:"Bundler"` (or `"Node16"`) + `esModuleInterop:true` (Pitfall 6 — the generated bindings are CJS); drop `jsx`. Keep `strict:true`. Scripts: `dev:"tsx watch src/index.ts"`, `test:"vitest run"`, `typecheck:"tsc --noEmit"` (mirrors web's `build` gate, `web/package.json` line 8).

Pinned versions (RESEARCH lines 110-120): `express@4.19.x cors@2.8.x zod@3.23.x dotenv@16.x`; dev `vitest@2.x tsx@4.x @types/express@4.17.x @types/cors@2.8.x @types/node@20.x`. Do NOT take registry-latest majors (express 5 / zod 4 / vitest 4 / dotenv 17).

---

### `solver/.env.example` (config)

No direct analog; mirror the constants used by `mint-tokens.mjs` / `verify-privacy.mjs`: `JSON_API_URL=http://localhost:7575`, `SOLVER_PORT=4000`, `ROUND_SECONDS=60`, `ANTHROPIC_API_KEY=` (empty placeholder, unused until P5). `.env` gitignored; ship only `.env.example` (D6 / SOLV-04).

## Shared Patterns

### Operator JWT / secret custody
**Source:** `scripts/mint-tokens.mjs` lines 60-90 (mint + write `scripts/.operator-token`); claim shape lines 63-73.
**Apply to:** `ledger.ts` (read token), `.env.example` (key placeholders). The Operator token + Anthropic key are server-side only and NEVER appear in any HTTP response or log (SOLV-04).

### Int/Decimal as strings on the wire
**Source:** `DeskColumn.tsx` lines 70-76 (`quantity:'10'`, `limit:'101.0'`).
**Apply to:** every `ledger.exercise`/`ledger.create` in `ledger.ts` — `clearingPrice:"100.0"`, each `filledQty:String(n)`, `windowSeconds:String(n)`.

### Template-id is package-id form (raw-fetch fallback only)
**Source:** `verify-privacy.mjs` lines 37-52 — derive `<pkgId>:Umbra.Auction:Order` from `web/daml.js/umbra-0.1.0/lib/Umbra/Auction/module.js`; NEVER hard-code (changes on rebuild).
**Apply to:** only a raw-fetch fallback if the typed bindings misbehave under Node ESM. The typed `ledger.query(Order)` already carries the package-id form — prefer it.

### ESM path resolution under Node
**Source:** `mint-tokens.mjs` lines 24-28, `verify-privacy.mjs` lines 26-27 (`fileURLToPath(import.meta.url)` / `new URL(..., import.meta.url)`).
**Apply to:** `ledger.ts` token read, any `daml/parties.json` fallback read. No `__dirname` under ESM.

## No Analog Found

| File | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| `solver/src/api.ts` | controller | request-response | No Express service exists in the repo yet | RESEARCH §"Endpoint contracts" (lines 389-410) + §"Pattern 4" |
| `solver/src/index.ts` | service | event-driven | No in-memory clock/timer service exists | RESEARCH §"Pattern 3" (lines 227-230) |
| `solver/vitest.config.ts` | config | — | `web/` has no vitest; optional file | RESEARCH lines 462-464 (vitest auto-discovers `*.test.ts`; only add for non-default glob) |

## Metadata

**Analog search scope:** `daml/Umbra/` (Clearing, Auction, Roles), `web/src/`, `web/` config, `scripts/`
**Files scanned:** 10
**Key insight:** This is a *port + wire* phase — the hard problems (clearing math, JWT, template-id resolution, the `Clear` settle sequence, Int/Decimal-as-strings) are all already solved and frozen in-repo. `auction.ts` ports `Clearing.daml` 1:1; `ledger.ts` reuses the `@daml/ledger@2.10.4` API proven in `DeskColumn.tsx` + the JWT pattern in `mint-tokens.mjs`. Only `api.ts` and `index.ts` are genuinely new (lean on RESEARCH).

## PATTERN MAPPING COMPLETE

**Phase:** 4 - Solver Service
**Files classified:** 9
**Analogs found:** 9 / 9 (6 exact/role-match in-repo, 3 lean on RESEARCH)

### Coverage
- Files with exact/strong in-repo analog: 6 (auction.ts, auction.test.ts, ledger.ts, package.json, tsconfig.json, .env.example)
- Files with no analog (RESEARCH-driven): 3 (api.ts, index.ts, vitest.config.ts)

### Key Patterns Identified
- `auction.ts` is a 1:1 TypeScript port of `daml/Umbra/Clearing.daml` — the `topPrices` max-matched filter in `choosePStar` is mandatory (drop it → §4 clears at 99 not 100).
- `ledger.ts` reuses the exact `@daml/ledger@2.10.4` client API proven in `DeskColumn.tsx` (`query`/`exercise`/`create`, Int/Decimal as strings) + the zero-dep `node:crypto` Operator JWT from `mint-tokens.mjs`; absolute base URL `http://localhost:7575/` (no Vite proxy server-side).
- The Option-B `Round.Clear` settle is gather-cids-then-exercise (`orderCids`/`buyerUsdcCid`/`sellerBondCids`); `CloseRound`/`Clear` recreate the Round, so re-query the current cid before each exercise.
