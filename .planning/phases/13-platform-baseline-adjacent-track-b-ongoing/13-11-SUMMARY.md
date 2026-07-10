---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 11
subsystem: api
tags: [rfq, issuance, competing-solvers, json-ledger-api-v2, zod, express, canton]

# Dependency graph
requires:
  - phase: 13-08
    provides: "Umbra.Issuance Daml template + regenerated @daml.js bindings (IssuanceRound/ClearIssuance/Coupon/Redeem)"
  - phase: 13-09
    provides: "Umbra.Rfq Daml template (RfqRequest/Quote/AcceptQuote → settleBatch DvP)"
  - phase: 13-10
    provides: "agent.proposeCompeting (ADJ-01 competing-solvers referee = deterministic §8)"
provides:
  - "ledger.ts RFQ exercise wrappers: postRfq / createQuote / listQuotes / acceptQuote (1×1 settleBatch DvP)"
  - "ledger.ts issuance exercise wrappers: openIssuance / clearIssuance / payCoupon / redeem"
  - "Solver HTTP endpoints: POST /competing, POST /rfq, GET /rfq/:id/quotes, POST /rfq/:id/accept, POST /issuance, POST /issuance/:id/coupon, POST /issuance/:id/redeem"
  - "AppDeps + index.ts buildDeps threading for proposeCompeting + the RFQ/issuance ledger wrappers"
affects: [web adjacent panels, RFQ/issuance UI, competing-solvers leaderboard panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyless Option-B exercise wrappers over JSON Ledger API v2: package-NAME templateIds (#umbra:Umbra.Rfq:…), Int/Decimal choice args marshaled as STRINGS, source Holding cids re-queried from a fresh ACS read before every exercise"
    - "Multi-party actAs for solver-orchestrated creates/exercises (e.g. [operator, requester]) — documented dev/LocalNet posture; live per-desk tokens are a UAT concern"
    - "Additive zod-.strict() endpoints on the SAME secret-safe {error:{code,message}} envelope; advisory /competing leaderboard is NARRATIVE-only, never a settlement input"

key-files:
  created: []
  modified:
    - "solver/src/ledger.ts — ADJ-02 RFQ + ADJ-03 issuance exercise wrappers"
    - "solver/src/ledger.test.ts — RFQ + issuance wrapper suites (choice/arg-marshaling + secret sweeps)"
    - "solver/src/api.ts — /competing, /rfq*, /issuance* endpoints + AppDeps additions + zod schemas"
    - "solver/src/api.test.ts — competing/RFQ/issuance endpoint suite (deterministic §4 $100.00, INVALID_BODY, secret sweeps)"
    - "solver/src/index.ts — LedgerPort/BuildDepsArgs additions + buildDeps threading + main() wiring"
    - "solver/src/index.test.ts — buildDeps wiring proof for the new deps"

key-decisions:
  - "Int/Decimal choice args marshaled as STRINGS in the new wrappers (Option-B), asserted in tests; the byte-unchanged settle() path is untouched"
  - "POST /competing body is {roundId, configs} — the roundId locates the sealed batch the solver races (views come from readSealedOrders, not the request body)"
  - "POST /issuance opens AND clears in one call (openIssuance → clearIssuance), returning the single uniform issuance price + cleared-round cid for the Coupon/Redeem lifecycle"
  - "clearIssuance/coupon/redeem/acceptQuote submit with a multi-party actAs (solver orchestration); live per-desk token authority is a UAT wiring concern, mirroring the four-eyes human-gate posture"

patterns-established:
  - "RFQ accept reuses the proven settle() cid-gathering discipline (fresh ACS Holding query + sufficient (owner, instrument) match) to build the 1×1 DvP inputs for on-ledger AcceptQuote → settleBatch"
  - "clearIssuance recomputes the SAME §8 computeClearing the on-ledger ClearIssuance re-verifies (verify-don't-trust), gathering each winner's cash cid as the { _1, _2 } tuple wire shape"

requirements-completed: [ADJ-01, ADJ-02, ADJ-03]

# Metrics
duration: 17min
completed: 2026-07-10
---

# Phase 13 Plan 11: ADJ-01/02/03 Solver-API Surface Summary

**Competing solvers, RFQ (post → firm quote → accept→settle), and primary issuance (clear/mint → coupon → redeem) are now reachable from the web layer through zod-validated, secret-safe solver endpoints, orchestrated server-side over the JSON Ledger API v2 and settling through the proven on-ledger DvP — the §4 golden still clears $100.00 and the five §11 endpoints stay byte-compatible.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-07-10T20:26:25Z
- **Completed:** 2026-07-10T20:43:40Z
- **Tasks:** 3 of 3
- **Files modified:** 6

## Accomplishments
- **ADJ-02 RFQ orchestration** in `ledger.ts` — `postRfq` / `createQuote` / `listQuotes` / `acceptQuote`. `acceptQuote` gathers the bond + cash source Holding cids the way `settle()` does (fresh ACS query, sufficient-amount match, direction by requester side) and exercises `AcceptQuote`, reusing the SAME on-ledger `settleBatch` 1×1 DvP path.
- **ADJ-03 issuance orchestration** in `ledger.ts` — `openIssuance` / `clearIssuance` / `payCoupon` / `redeem`. `clearIssuance` recomputes §8 locally (the referee the on-ledger `ClearIssuance` re-verifies) to determine winners + the uniform price, gathers each winner's cash cid ({ _1, _2 } tuple), and exercises the mint; `payCoupon`/`redeem` enumerate current bond holders via an ACS `Holding` query and pay pro-rata cash.
- **ADJ-01/02/03 endpoints** in `api.ts` — `POST /competing` (advisory leaderboard + deterministic §4 block at $100.00), `POST /rfq`, `GET /rfq/:id/quotes`, `POST /rfq/:id/accept`, `POST /issuance`, `POST /issuance/:id/coupon`, `POST /issuance/:id/redeem`. All additive, `.strict()`-validated, on the secret-safe `{error:{code,message}}` envelope.
- **Deps threaded** through `index.ts` `buildDeps` (LedgerPort + BuildDepsArgs) and wired in `main()` to the real `ledger.*` + `agent.proposeCompeting`.

## Task Commits

Each task was committed atomically (author/committer = woshvad, zero Claude attribution):

1. **Task 1: ledger.ts RFQ orchestration** — `53e89cb` (feat)
2. **Task 2: ledger.ts issuance orchestration** — `023e6d3` (feat)
3. **Task 3: api.ts endpoints + index.ts deps** — `37094b0` (feat)

## Files Created/Modified
- `solver/src/ledger.ts` — ADJ-02 RFQ + ADJ-03 issuance keyless exercise wrappers over JSON Ledger API v2; operator token stays module-private.
- `solver/src/ledger.test.ts` — 10 new tests (RFQ post/quote/list/accept + issuance open/clear/coupon/redeem), asserting choice + string-marshaling shape and per-path secret sweeps.
- `solver/src/api.ts` — new AppDeps fields (proposeCompeting + RFQ/issuance wrappers), zod schemas, and 7 additive endpoints on the secret-safe envelope.
- `solver/src/api.test.ts` — competing/RFQ/issuance endpoint suite: deterministic §4 leaderboard at $100.00, INVALID_BODY 400s, and a secret-sweep across every new response.
- `solver/src/index.ts` — LedgerPort/BuildDepsArgs additions, buildDeps threading, and main() wiring to the real implementations.
- `solver/src/index.test.ts` — buildDeps wiring proof that `/competing` + `/rfq*` + `/issuance*` reach the injected deps.

## Verification
- `cd solver && npx vitest run` — **284 passed / 23 files** (full suite green).
- `cd solver && npx tsc --noEmit` — clean (exit 0).
- §4 golden ($100.00, A=10/B=8/C=2) intact (`auction.test.ts` + `sandbox.test.ts` green); the five §11 endpoints + `/settle` byte-compatible (existing `api.test.ts` suite unchanged and green).
- Secret sweeps green across `/competing`, `/rfq*`, `/issuance*` responses and the new ledger wrappers — no operator token / `ANTHROPIC_API_KEY` sentinel echoed; the browser never holds a credential.

## Threat Model Coverage
- **T-13-32 (RFQ quote forgery):** `acceptQuote` threads only the requester-picked quote cid; the on-ledger `AcceptQuote` asserts instrument/requester/quantity and the firm quote is dealer-signatory — mitigation is on-ledger.
- **T-13-33 (issuance over-mint):** `clearIssuance` submits only §8-derived winners; the on-ledger `ClearIssuance` re-clears + asserts `buyFills == sellFills` — verify-don't-trust preserved.
- **T-13-34 (information disclosure):** all new responses ride the secret-safe envelope; the operator token stays module-private (never returned/logged); secret-sweep on every new endpoint + wrapper.
- **T-13-35 (AI settlement):** `/competing` leaderboard is documented NARRATIVE-only in the route; the deterministic §8 block is the sole settlement input.

## Deviations from Plan

### Auto-added (Rule 2 — critical for the flow)

**1. [Rule 2] `POST /competing` body includes `roundId` (not "solver configs" alone)**
- **Found during:** Task 3
- **Issue:** the plan shorthand "body = solver configs" gives no source for the sealed batch the competing solvers must race.
- **Fix:** body is `{ roundId, configs }`; the handler reads the sealed views via `readSealedOrders(roundId)` (mirrors `solve-preview`), so the deterministic §4 block genuinely clears $100.00.
- **Files modified:** `solver/src/api.ts`, `solver/src/api.test.ts`

**2. [Rule 2] Wrapper params beyond the plan's minimal signatures**
- **Found during:** Tasks 1–2
- **Issue:** `postRfq`/`openIssuance` need more than the plan's headline args to create valid contracts (dealer set, instrument, reservePrice, bids, coupon/redeem params).
- **Fix:** added the necessary params with sensible defaults (dealers → other §4 desks; instrument → §4 bond/cash refs; reservePrice → 0; bids → []). `createQuote` is implemented as a ledger wrapper (per Task 1) but intentionally NOT surfaced as an endpoint (the plan's endpoint list excludes a quote-post route; dealer quoting is a per-desk flow).
- **Files modified:** `solver/src/ledger.ts`

### Note (documented posture, not a code defect)
- The new creates/exercises submit with a multi-party `actAs` (e.g. `[operator, requester]`) under the operator bearer — the solver-orchestrated dev/LocalNet fast-loop. Live, each desk submits its own leg with its own scoped token; this is the same "live per-party authority is a UAT concern" posture as the four-eyes human gate. The operator token still lives only in the Authorization header.

## Known Stubs
None — all endpoints wire real ledger/agent implementations in `main()`; the DI stubs exist only in tests.

## Self-Check: PASSED
