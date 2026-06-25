---
phase: 04-solver-service
plan: 02
subsystem: solver
tags: [typescript, node-esm, daml-ledger, operator-authority, jwt, option-b-clear, vitest]

# Dependency graph
requires:
  - phase: 04-solver-service
    plan: 01
    provides: "solver/src/auction.ts (computeClearing/matchedAt/OrderView) + proven Node-ESM import of @daml.js/umbra-0.1.0 + @daml/ledger"
  - phase: 02-clearing-settlement
    provides: "daml/Umbra/Auction.daml Round.Clear (Option-B fields) re-verified on-ledger"
provides:
  - "solver/src/ledger.ts — the Operator-authority @daml/ledger client: connect, openRound, queryRound, readSealedOrders, updateStats, refreshStats, closeRound, settle (Option-B Round.Clear)"
  - "solver/src/ledger.test.ts — stubbed-ledger vitest proving refreshStats advances a fresh round's sealedOrderCount off '0' via updateStats, with a sentinel-token no-leak guard"
affects: [solver-api (Plan 04-03), solver-clock (Plan 04-04), phase-05-ai-agent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator JWT held strictly module-private (read from scripts/.operator-token, zero-dep node:crypto HS256 fallback-mint); never returned/logged (SOLV-04)"
    - "Absolute http://localhost:7575/ base URL server-side (no Vite proxy; Pitfall 2)"
    - "sealedOrderCount maintained by archive+recreate (no update choice); refreshStats = recompute-and-write call site for updateStats"
    - "Option-B Round.Clear: gather orderCids/buyerUsdcCid/sellerBondCids from the live ACS, re-query the Round cid before each exercise, Int/Decimal as strings, Tuple2 as { _1, _2 }"
    - "Stubbed-ledger vitest via vi.mock('@daml/ledger') + vi.mock('node:fs') — no live sandbox"

key-files:
  created:
    - solver/src/ledger.ts
    - solver/src/ledger.test.ts
  modified: []

key-decisions:
  - "ContractId<T> is a branded string in @daml/types; readSealedOrders returns plain `string` cids (per the Plan output contract) and settle casts them to ContractId<Order>/<Asset> at the exercise site — a runtime no-op, type-correct"
  - "sellerBondCids is DA.Types.Tuple2<Party, ContractId<Asset>> on the wire → built as { _1: party, _2: cid }, NOT a positional [party, cid] array"
  - "settle's asset selection is A2-scoped (single sufficient holding per (owner, symbol)); no-match throws a clean secret-free 'insufficient or missing <symbol> holding' error — auto-merge of split holdings is explicitly out of P4 scope (stretch)"
  - "ledger.test.ts mocks node:fs.readFileSync to feed a SENTINEL token so the no-leak assertions are deterministic and independent of the on-disk gitignored token"

requirements-completed: [SOLV-04]
requirements-advanced: [SOLV-01, SOLV-02]  # ledger primitives in place; window-enforcement (SOLV-01) + on-close orchestration (SOLV-02) complete in Plans 04-03/04-04

# Metrics
duration: 5min
completed: 2026-06-26
---

# Phase 4 Plan 02: Operator Ledger Client + Option-B Settle Summary

**`solver/src/ledger.ts` is the load-bearing Operator wire layer — it connects to the JSON API on :7575 over an absolute URL with a strictly module-private Operator JWT, opens a Round + RoundStats, reads every desk's sealed Order, maintains `sealedOrderCount` via `refreshStats`→`updateStats` (recompute-and-write, advancing a fresh round off '0' — proven on a stubbed ledger), force-closes, and runs the Option-B `Round.Clear` settle sequence with the deterministic §8 allocation re-verified on-ledger.**

## Performance
- **Duration:** ~5 min
- **Tasks:** 2 completed
- **Files created:** 2 (`ledger.ts` 285 lines, `ledger.test.ts` 188 lines)

## Accomplishments
- **Operator client (Task 1):** one `new Ledger({ token, httpBaseUrl })` over the absolute `http://localhost:7575/` URL (Pitfall 2 — the solver has no Vite proxy, so the browser's bare `/` would throw). The Operator JWT is resolved from `scripts/.operator-token` (gitignored) with a zero-dep `node:crypto` HS256 fallback-mint from `daml/parties.json` using the exact `mint-tokens.mjs` claim shape — and is held **strictly module-private** (never returned, never spread into a value, never logged; SOLV-04 / T-04-04). Exports `operatorParty` (the public party id only).
- **Round lifecycle + stats:** `openRound` creates `Round` + `RoundStats` directly (neither has an operator open/update choice — Operator is sole signatory); `queryRound` returns the **live** Round cid (callers re-query before every exercise — never cache); `readSealedOrders` maps every desk's `status==='Sealed'` Order for the round to an `OrderView` (Operator is a stakeholder of every Order). `updateStats` maintains `sealedOrderCount` by **archive+recreate** (no update choice exists), with the count stringified (Int, Pitfall 5).
- **`refreshStats` (the BLOCKER fix):** recomputes `readSealedOrders(roundId).length`, compares against the current `RoundStats`, and writes it back via `updateStats` only when changed — giving `updateStats` a real call site so a freshly-opened round's count actually ADVANCES from 0 as sealed orders appear (SOLV-01's "maintains sealedOrderCount", not an exported-but-never-called stub). This is the function the API (04-03) and clock (04-04) invoke.
- **closeRound + Option-B settle (Task 2):** `closeRound` re-queries the live Round cid then exercises `CloseRound` (Pitfall 4 — it returns a new cid). `settle` gathers `orderCids` / `buyerUsdcCid` / `sellerBondCids` from live `ledger.query` calls, computes §8 locally with `computeClearing`, re-queries the current Round cid, and exercises `Round.Clear` with all Int/Decimal as strings and `sellerBondCids` as `DA.Types.Tuple2 { _1, _2 }`. The deterministic clearing is the ONLY thing submitted — `Round.Clear` re-verifies §8 on-ledger (verify-don't-trust, T-04-05); there is no skip-verification path.
- **Stubbed-ledger test:** `ledger.test.ts` mocks `@daml/ledger` (a `FakeLedger` driving an in-memory ACS) and `node:fs` (a sentinel token). It proves `refreshStats('R1')` on a round with 3 stubbed sealed orders archives the old `RoundStats` and recreates it with `sealedOrderCount === '3'` (off `'0'`); asserts the idempotent no-op when the count is unchanged; and proves the sentinel token never appears in `operatorParty`, the `refreshStats` result, or any `console.log`/`console.error` (SOLV-04).

## Task Commits
Each task committed atomically (no AI attribution; author = woshvad):
1. **Task 1: Operator client + create/query/stats + refreshStats** — `85b1e60` (feat)
2. **Task 2: closeRound + Option-B Round.Clear settle** — `f7af76f` (feat)

## Files Created
- `solver/src/ledger.ts` — Operator `@daml/ledger` client. Exports: `operatorParty`, `openRound(roundId, desks, windowSeconds)`, `queryRound(roundId)`, `readSealedOrders(roundId)` → `{ contractId, view: OrderView }[]`, `updateStats(roundId, count)`, `refreshStats(roundId)` → recomputed count, `closeRound(roundId)` → `RoundStatus`, `settle(roundId)` → `{ result: ClearResult, status }`.
- `solver/src/ledger.test.ts` — stubbed-ledger vitest (3 tests): refreshStats advance-off-0, idempotent no-op, sentinel-token no-leak.

## Verification Results
- `cd solver && npx vitest run src/ledger.test.ts` → **3 passed** (refreshStats writes `'3'`; no token leak).
- `cd solver && npx vitest run` (full suite) → **9 passed** (6 auction + 3 ledger).
- `cd solver && npx tsc --noEmit` → **clean** (exit 0) — generated bindings + client type-check under Node ESM.
- Grep checks: the Operator token is never `console.log`ged or returned; `clearingPrice`/`filledQty` are `String(...)`; `queryRound` is called before each exercise; `refreshStats` calls `updateStats`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking type error] ContractId<T> branding on gathered cids**
- **Found during:** Task 2 (settle).
- **Issue:** `@daml/types` types `ContractId<T>` as a *branded* string (`string & { [ContractIdBrand]: T }`). `readSealedOrders` returns `contractId: string` (the Plan's output contract), so `orderCids: string[]`, `sellerBondCids._2: string`, did not satisfy `Round.Clear`'s `ContractId<Order>[]` / `Tuple2<Party, ContractId<Asset>>[]` parameter types — `tsc` exit 2.
- **Fix:** Imported `ContractId` from `@daml/types` and cast the gathered cids (`as ContractId<Order>` / `as ContractId<Asset>`) at the exercise site. This is a runtime no-op (the brand is type-only); the cids are the real ledger contract ids. `buyerUsdcCid` needed no cast (it comes straight from `ledger.query(Asset)`, already branded).
- **Files modified:** `solver/src/ledger.ts`
- **Commit:** `f7af76f`

## Known Limitations
- **RESEARCH Assumption A2 (asset selection):** `settle` picks a SINGLE sufficient holding per `(owner, symbol)` — true for the §4 fixture (BankA 5000 USDCx, BankB 20 BONDX, BankC 15 BONDX). It does NOT merge split holdings. For a non-canonical/fresh `POST /round` round with split or insufficient holdings it throws a clean, secret-free `insufficient or missing <symbol> holding for <party>` error rather than passing an undefined cid into `Clear`. Auto-merge (`Asset.Merge` before settle) is explicitly out of P4 scope (stretch §19).
- **Live end-to-end (open→close→settle reaching `Settled` at 100.00) is NOT exercised here** — it requires a booted `daml start` sandbox and is deferred to phase verification (human gate). This plan's unit tests run on a stubbed ledger by design.

## Known Stubs
None. `ledger.ts` is fully implemented; `refreshStats`/`updateStats`/`settle` all have real bodies. The `settle` live path is intentionally exercised only against a stubbed ledger in this plan (the `@daml/ledger` calls are real, the ledger is faked) — the live sandbox drive lands in Plan 04-03/04-04 and phase verification.

## Threat Flags
None — no new security surface beyond the plan's `<threat_model>`. The Operator JWT is the only credential, held module-private; no new endpoints (those land in Plan 04-03's Express API).

## Self-Check: PASSED
- `solver/src/ledger.ts` present on disk (285 lines).
- `solver/src/ledger.test.ts` present on disk (188 lines).
- Commit `85b1e60` (Task 1) present in git history.
- Commit `f7af76f` (Task 2) present in git history.
- `vitest run` → 9 passed; `tsc --noEmit` → clean.
