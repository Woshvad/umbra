---
phase: 04-solver-service
verified: 2026-06-26T00:45:00Z
status: human_needed
score: 16/16 must-haves verified (autonomous portion); 1 live E2E gate deferred to human
overrides_applied: 0
human_verification:
  - test: "Live open→close→solve-preview→settle→re-settle against a running `daml start` sandbox"
    expected: "GET /round/R1 shows sealedOrderCount 3; close → Closed; solve-preview → clearingPrice 100.00 + matchedVolume 10 + non-empty curve + rationale:null (no settle); settle → Settled at 100.00; second settle → HTTP 409; no response body or boot log contains the Operator token or ANTHROPIC_API_KEY"
    why_human: "Requires the :7575 JSON API up and exercises the real on-ledger Round.Clear DvP — cannot be run headless in this environment; consistent with the Phases 1–3 precedent of deferring live-ledger E2E to phase verification."
  - test: "Solver WRITES sealedOrderCount (advances off 0) for a fresh round"
    expected: "POST /round opens a fresh round at sealedOrderCount 0; after a desk seals an order, GET /round/:id shows the count advanced off 0 — proving refreshStats/updateStats wrote a solver-maintained value, not the Phase-3 R1 seed"
    why_human: "Needs a live sandbox to seal a real Order and observe the on-ledger RoundStats archive+recreate; the recompute-and-write logic itself is unit-proven (ledger.test.ts) but the live on-ledger write is the one path unit tests cannot cover."
---

# Phase 4: Solver Service Verification Report

**Phase Goal:** Stand up the off-ledger Node/TS service that holds Operator authority — it runs the auction clock, computes the deterministic §8 clearing in TypeScript, exercises `Round.Clear`, and fronts an HTTP API on :4000 so the browser never holds Operator/Anthropic credentials.
**Verified:** 2026-06-26
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is achieved in code: the `solver/` package exists, compiles clean (`tsc --noEmit` exit 0), and its 21-test vitest suite is fully green (6 auction + 5 clock + 3 ledger + 5 api + 2 index — matching the expected counts exactly). The §8 correctness core, the Operator wire layer, the 5-endpoint §11 API, the secret boundary, and the 60s clock are all substantive and wired. The single thing that cannot be confirmed headlessly — the live `daml start` on-ledger DvP — is an explicitly deferred human-verification checkpoint (Task 3, blocking-gate in 04-04-PLAN, recorded as DEFERRED in 04-04-SUMMARY), consistent with the Phases 1–3 precedent. It is surfaced below as Human Verification Required and is non-blocking for the autonomous portion.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | §4 fixture clears at exactly 100.00 in TS with fills A=10/B=8/C=2 (C residual 3), identical to Daml `test_clears_at_100` | ✓ VERIFIED | `auction.test.ts:34-61` asserts `clearingPrice===100`, fillOf A=10/B=8/C=2, residual `5−2===3`; test green |
| 2 | Dropping the topPrices max-matched filter clears §4 at 99 — guarded by a dedicated regression test | ✓ VERIFIED | `auction.test.ts:86-101`: `matchedAt(99)===8 < matchedAt(100)===10`, `choosePStar===100`, `.not.toBe(99)`; `auction.ts:64-79` implements the topPrices filter before the (|d−s|, price) tie-break |
| 3 | A no-cross batch yields matched 0; empty book yields pStar 0.0 | ✓ VERIFIED | `auction.test.ts:167-193` (no-cross matched 0; empty book pStar 0, [] allocations) |
| 4 | Generated `@daml.js/umbra-0.1.0` bindings import cleanly under Node ESM | ✓ VERIFIED | `ledger.test.ts` imports `Order`/`RoundStats` from `@daml.js/umbra-0.1.0/lib/Umbra/Auction/module` and runs (template-registration stdout); `ledger-smoke.ts` present; tsc clean |
| 5 | Solver connects as Operator over an absolute :7575 URL using the JWT from `scripts/.operator-token` (or mints it) | ✓ VERIFIED | `ledger.ts:57-95`: `resolveOperatorCredential` reads `../../scripts/.operator-token` then mint-fallback; `new Ledger({ token, httpBaseUrl: …?? 'http://localhost:7575/' })` |
| 6 | Solver creates Round+RoundStats, reads all sealed Orders, maintains sealedOrderCount via refreshStats→updateStats (recompute-and-write) | ✓ VERIFIED | `ledger.ts:101-202` (openRound creates both; readSealedOrders filters Sealed; refreshStats recomputes length + calls updateStats); `ledger.test.ts:129-146` proves count advances off '0' to '3' via archive+recreate |
| 7 | settle() gathers orderCids/buyerUsdcCid/sellerBondCids from the live ACS and exercises Round.Clear with Int/Decimal as strings, re-querying the current Round cid first | ✓ VERIFIED | `ledger.ts:229-301`: queries Asset, sufficiency predicate, clean insufficient/missing-asset error, re-queries Round cid, `Round.Clear` with `String(clearingPrice)`/`String(filledQty)` |
| 8 | Operator token is never returned/logged/serialized by any HTTP-bound value | ✓ VERIFIED | `_operatorToken` (ledger.ts:83) appears only at read + Ledger ctor; never exported/returned; `ledger.test.ts:165-187` sentinel-token assertion (party, result, logs all clean) |
| 9 | The five §11 endpoints exist on :4000 | ✓ VERIFIED | `api.ts` registers exactly 5 routes: POST /round, GET /round/:id, POST /round/:id/close, GET /round/:id/solve-preview, POST /round/:id/settle |
| 10 | GET /round/:id calls refreshStats to return a solver-maintained count | ✓ VERIFIED | `api.ts:151-179` calls `refreshStats(id)` first; `api.test.ts:105-123` asserts `sealedOrderCount===3` AND `refreshStats` called with 'R1' |
| 11 | solve-preview returns clearingPrice 100 + matchedVolume + curve + rationale:null WITHOUT settling | ✓ VERIFIED | `api.ts:192-211`; `api.test.ts:125-147` asserts 100 / matchedVolume 10 / non-empty curve {price,demand,supply} / rationale null; never calls settle |
| 12 | settle 409s on double-settle | ✓ VERIFIED | `api.ts:222-225` (TERMINAL_STATUSES → 409 envelope); `api.test.ts:178-194` asserts 409 + envelope + settle not invoked |
| 13 | CORS scoped to http://localhost:5173 only; POST /round zod-validated; no secret in error envelope | ✓ VERIFIED | `api.ts:122` cors origin literal :5173; `api.ts:87-93` zod; `api.ts:248-255` envelope `{error:{code,message}}` with generic-500 fallback; `api.test.ts:196-210` CORS scope test |
| 14 | In-memory Map<roundId,RoundState> tracks clock state; ledger Round.status authoritative; clock enforces ROUND_SECONDS with auto-close + force-close | ✓ VERIFIED | `clock.ts:58-119`; `clock.test.ts:31-100` fake-timer auto-close-once, force-close-cancels-timer, idempotency, rehydrate-no-timer |
| 15 | POST /round triggers BOTH openRound AND openRoundClock — proven by an injected-dep test | ✓ VERIFIED | `index.ts:66-91` buildDeps wires openRound→openRoundClock; `index.test.ts:90-127` asserts both spies fire once with roundId + ROUND_SECONDS |
| 16 | index.ts loads dotenv, rehydrates from query(Round), wires clock into API deps, listens on SOLVER_PORT with secret-free logging | ✓ VERIFIED | `index.ts:94-189`: dotenv.config() first, queryAllRounds rehydrate, createApp(deps).listen(SOLVER_PORT), log `:<port> as <operatorParty>` (no token/key/env) |

**Score:** 16/16 truths verified (autonomous portion).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `solver/src/auction.ts` | Pure §8 port (computeClearing/choosePStar/rationByPriority + helpers/types) | ✓ VERIFIED | 122 lines (min 60); exports all required symbols; pure (no I/O); imported by ledger.ts + api.ts |
| `solver/src/auction.test.ts` | ≥5 vitest scenarios incl. §4 canary + 99-vs-100 trap | ✓ VERIFIED | 6 scenarios; §4 + tie-break + same-limit + imbalance + no-cross + empty-book; all green |
| `solver/src/ledger.ts` | Operator client: connect/openRound/readSealedOrders/updateStats/refreshStats/closeRound/settle/queryRound/operatorParty | ✓ VERIFIED | 302 lines (min 80); all exports present + queryAllRounds; token module-private |
| `solver/src/ledger.test.ts` | Stubbed-ledger refreshStats recompute-and-write proof | ✓ VERIFIED | 3 tests; count off '0'→'3' via updateStats; idempotent no-op; token never leaked |
| `solver/src/api.ts` | createApp factory, 5 endpoints, cors :5173, zod, secret-safe envelope, refreshStats on GET, matchedVolume via matchedAt | ✓ VERIFIED | 259 lines (min 80); exports createApp; exactly 5 routes |
| `solver/src/api.test.ts` | 5 vitest: refreshStats count, solve-preview 100+matchedVolume, no-secret, 409, CORS | ✓ VERIFIED | 5 tests, all green; sentinel-token absence asserted |
| `solver/src/clock.ts` | In-memory clock: openRoundClock/forceClose/getState/rehydrate, ROUND_SECONDS window | ✓ VERIFIED | 120 lines (min 40); exports createClock + RoundState; holds no secret |
| `solver/src/clock.test.ts` | Fake-timer tests (auto-close, force-close cancels, idempotency) | ✓ VERIFIED | 5 tests, all green; uses vi.useFakeTimers |
| `solver/src/index.ts` | Boot: dotenv, rehydrate, wire (POST /round→openRound+openRoundClock), listen | ✓ VERIFIED | 209 lines (min 25); entrypoint-guarded main(); buildDeps DI factory |
| `solver/src/index.test.ts` | Injected-dep test: POST /round triggers openRound + openRoundClock | ✓ VERIFIED | 2 tests, all green |
| `solver/package.json` | Node ESM, spec-pinned deps, type:module | ✓ VERIFIED | present; type:module; deps installed (node_modules + @daml.js/umbra-0.1.0) |
| `solver/.env.example` | JSON_API_URL/SOLVER_PORT/ROUND_SECONDS/ANTHROPIC_API_KEY (empty) | ✓ VERIFIED | present; ANTHROPIC_API_KEY empty; no real secret; no `.env` tracked in git |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| auction.test.ts | auction.ts | import computeClearing | ✓ WIRED | tests green against real impl |
| ledger.ts | @daml/ledger Ledger | new Ledger({token, httpBaseUrl}) | ✓ WIRED | ledger.ts:92-95 absolute URL w/ trailing slash |
| ledger.ts | scripts/.operator-token | readFileSync(new URL('../../scripts/.operator-token', import.meta.url)) | ✓ WIRED | ledger.ts:60 |
| ledger.ts | Round.Clear | ledger.exercise(Round.Clear, …) | ✓ WIRED | ledger.ts:286 |
| ledger.ts (refreshStats) | ledger.ts (updateStats) | recompute length + updateStats | ✓ WIRED | ledger.ts:194-202; proven by ledger.test.ts |
| api.ts | ledger.ts | injected openRound/refreshStats/settle… | ✓ WIRED | AppDeps DI; index.ts supplies real impls |
| api.ts (GET) | ledger.ts (refreshStats) | refreshStats(id) before returning count | ✓ WIRED | api.ts:156; api.test.ts asserts call |
| api.ts | auction.ts (matchedAt) | matchedVolume = matchedAt(views, pStar) | ✓ WIRED | api.ts:200 |
| api.ts | cors | cors({origin:'http://localhost:5173'}) | ✓ WIRED | api.ts:122; CORS test |
| index.ts | api.ts | createApp(deps).listen(SOLVER_PORT) | ✓ WIRED | index.ts:183-184 |
| index.ts (POST /round) | clock.ts (openRoundClock) | openRound then openRoundClock(roundId, ROUND_SECONDS) | ✓ WIRED | index.ts:70-73; index.test.ts asserts both fire |
| clock.ts | ledger.ts | closeRound on timer expiry | ✓ WIRED | createClock({closeRound: ledger.closeRound}) index.ts:107 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full solver test suite | `cd solver && npx vitest run` | 21 passed (5 files: 6 auction + 5 clock + 3 ledger + 5 api + 2 index) | ✓ PASS |
| TypeScript typecheck | `cd solver && npx tsc --noEmit` | exit 0, clean | ✓ PASS |
| §4 fixture clears at 100 | (in auction.test.ts) | clearingPrice===100, A=10/B=8/C=2, residual 3 | ✓ PASS |
| 99-vs-100 tie-break trap | (in auction.test.ts) | choosePStar===100, .not.toBe(99) | ✓ PASS |
| solve-preview deterministic | (in api.test.ts, real §8 helpers) | 100 + matchedVolume 10 + curve + rationale null | ✓ PASS |
| Secret never serialized | (in api.test.ts + ledger.test.ts) | sentinel token absent from all responses/logs | ✓ PASS |
| Exactly 5 §11 routes | grep app.(get\|post) api.ts | 5 routes, no extras | ✓ PASS |
| Live open→settle→409 on :7575 | requires `daml start` | not runnable headless | ? SKIP (→ Human Verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| CLEAR-02 | 04-01, 04-03 | §8 uniform price + two-level tie-break, rounded 2dp | ✓ SATISFIED | auction.ts choosePStar topPrices+tie-break; tie-break test; surfaced via solve-preview |
| CLEAR-03 | 04-01 | Allocation fills short fully, rations long by price priority, integer rounding ≤ matched | ✓ SATISFIED | computeClearing/rationByPriority; §4 fills A=10/B=8/C=2 test |
| SOLV-01 | 04-02, 04-04 | Open Round, maintain sealedOrderCount, enforce 60s window, CloseRound | ✓ SATISFIED (autonomous) | openRound/refreshStats/updateStats; clock ROUND_SECONDS; closeRound; live count-write is human gate |
| SOLV-02 | 04-02, 04-04 | On close read orders, compute/verify, exercise Round.Clear | ✓ SATISFIED (autonomous) | settle() Option-B sequence; verify-don't-trust on-ledger; live Clear is human gate |
| SOLV-03 | 04-03 | HTTP API on :4000 with the 5 §11 endpoints | ✓ SATISFIED | exactly 5 routes in api.ts |
| SOLV-04 | 04-01/02/03/04 | Anthropic key + Operator creds never exposed to browser | ✓ SATISFIED | token module-private; sentinel tests; CORS :5173; secret-free logging; .env.example empty key |
| SOLV-05 | 04-01 | ≥5 TS clearing unit tests (ties, imbalance, no-cross, §4) | ✓ SATISFIED | 6 auction scenarios |

All seven declared requirement IDs are accounted for and satisfied at the unit/structural level. No orphaned requirements: CLEAR-04/CLEAR-05 map to Phase 2 in REQUIREMENTS.md (not Phase 4), so they are correctly out of scope here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TODO/FIXME/XXX/HACK/TBD/placeholder/"not implemented" in solver/src | — | Clean — no debt markers, no stub bodies |

Note (Info): `solver/.env.example` sets `JSON_API_URL=http://localhost:7575` (no trailing slash) while `ledger.ts`'s default is `http://localhost:7575/` (with slash). The env value is used verbatim. The @daml/ledger client tolerates both forms; the live gate (Human Verification) would surface any issue. Informational only — not a blocker.

### Human Verification Required

#### 1. Live end-to-end round lifecycle against `daml start`

**Test:**
1. `cd daml && daml start` (seeds Open round `R1` + 3 §4 orders), then `node scripts/mint-tokens.mjs`.
2. `cd solver && cp .env.example .env` (leave `ANTHROPIC_API_KEY` empty), `npm run dev` → expect `Solver listening on :4000 as operator::…` with NO token printed.
3. `GET /round/R1` → `sealedOrderCount: 3`; `POST /round/R1/close` → Closed.
4. `GET /round/R1/solve-preview` → `clearingPrice: 100`, `matchedVolume: 10`, non-empty `curve`, `rationale: null` (does NOT settle).
5. `POST /round/R1/settle` → `status: "Settled"`, `clearingPrice: 100`; second `POST …/settle` → HTTP 409.

**Expected:** §4 round drives end-to-end to atomic Settled at 100.00; double-settle returns 409; no response body or boot log contains the Operator token or any `ANTHROPIC_API_KEY` value.

**Why human:** Requires the :7575 JSON API up and exercises the real on-ledger `Round.Clear` DvP — cannot run headless here. Consistent with the Phases 1–3 precedent of deferring live-ledger E2E to phase verification.

#### 2. Solver WRITES sealedOrderCount (advances off 0) for a fresh round

**Test:** `POST /round` opens a fresh round at `sealedOrderCount: 0`; after a desk seals an order, `GET /round/:id` shows the count ADVANCED off 0.

**Expected:** The advanced count proves `refreshStats`/`updateStats` wrote a solver-maintained RoundStats value, not the Phase-3 R1 seed.

**Why human:** Needs a live sandbox to seal a real Order and observe the on-ledger archive+recreate. The recompute-and-write logic is unit-proven (`ledger.test.ts`), but the live on-ledger write is the one path unit tests cannot cover.

### Gaps Summary

No gaps. Every must-have for the autonomous portion of the phase goal is verified against the actual codebase: the §8 clearing math is bit-correct (§4 → 100.00, A=10/B=8/C=2, with the 99-vs-100 trap guarded), the Operator client holds the JWT strictly server-side and drives open/read/refreshStats/close/settle, the 5 §11 endpoints exist with CORS scoped to :5173 and a secret-safe envelope, and the 60s clock + boot wiring are proven by an injected-dep test — all backed by 21 green vitest and a clean `tsc --noEmit`. Git attribution is clean (author/committer = woshvad on every Phase-4 commit; no Claude/Co-Authored-By/Anthropic trailer), and no `.env` or operator token is tracked.

The phase is `human_needed` rather than `passed` solely because two checks require a running `daml start` sandbox (the live on-ledger DvP and the live solver-written count), which the deferral in 04-04 explicitly routes to end-of-phase human verification. These are non-blocking for the autonomous portion; the code would achieve the goal and all unit-level evidence is green.

---

_Verified: 2026-06-26T00:45:00Z_
_Verifier: Claude (gsd-verifier)_
