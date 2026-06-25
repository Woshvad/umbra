# Phase 4: Solver Service - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per user directive "run phases 4–6 without my input, go with recommended")

<domain>
## Phase Boundary

Stand up the off-ledger **Node 20 + TypeScript solver service** in `solver/` that holds **Operator** authority: it computes the deterministic §8 clearing in TypeScript (bit-identical to `daml/Umbra/Clearing.daml`), runs the auction clock (60s window + force-close), maintains `RoundStats.sealedOrderCount`, exercises `Round.Clear` to settle, and fronts the Express HTTP API on :4000 so the browser never holds Operator/Anthropic credentials.

**In scope (P4):** `solver/src/auction.ts` (pure §8 + ≥5 vitest scenarios), `ledger.ts` (Operator JSON-API client), `api.ts` (Express, spec §11 endpoints), `index.ts` (round clock + boot), `.env`/`.env.example` solver keys.
**Out of scope (deferred):** Claude proposal + NL rationale + `agent.ts` + `solver/PROMPT.md` → **Phase 5**; wiring endpoints into Theatre/Settlement views → **Phase 6**; `make solver`/`make demo` Makefile → **Phase 7**. The clearing answer is deterministic; the AI layer is strictly additive and off the settlement path.
</domain>

<decisions>
## Implementation Decisions

### Ledger Integration (Operator authority)
- The solver connects to the **HTTP JSON API** (`JSON_API_URL`, default `http://localhost:7575`) as **Operator**, using `@daml/ledger@2.10.4` + the generated `@daml.js/umbra-0.1.0` bindings — the same SDK line the frontend uses. Type-safe, reuses the package-id template registration, and exercises `Round.Clear`/`CloseRound` with the real choice argument types. (Alt considered: raw `fetch` to `/v1/*` with hand-built package-id template IDs — rejected for type-safety/parity.)
- Operator authority comes from the **Operator JWT** read server-side from `scripts/.operator-token` (already minted by `scripts/mint-tokens.mjs`, gitignored, never shipped to `web/`). Fallback if absent: mint at startup from `daml/parties.json` + the dev HS256 secret using zero-dep `node:crypto` (the established pattern). The token is **never** returned by any HTTP endpoint (SOLV-04).
- `@daml/ledger`'s `Ledger` constructor requires an absolute `http(s)://…/` base URL (the bare-`/` gotcha from Phase 3) — the solver uses the absolute `JSON_API_URL` directly (server-side, no proxy), `ledgerId = 'sandbox'`.
- File split mirrors spec §13: `auction.ts` = pure algorithm, `ledger.ts` = connect/query/exercise wrapper, `api.ts` = Express app, `index.ts` = clock + server boot. `agent.ts` + `PROMPT.md` are created empty-of-AI in P4 only if needed as seams; otherwise added in P5.

### Clearing Algorithm — TypeScript parity with Daml (CLEAR-02, CLEAR-03)
- Port `daml/Umbra/Clearing.daml` **exactly**: candidate prices = sorted distinct limits in buys ∪ sells; for each `p`, `demand(p)=Σqty buys with limit≥p`, `supply(p)=Σqty sells with limit≤p`, `matched(p)=min(demand,supply)`. Choose `p* = argmax matched`, tie-break **(a) minimize |demand−supply| ONLY among the max-matched candidates, (b) lower price**, round to 2 decimals. This is the tie-break-trap-safe form already proven on-ledger (without (a)-restricted-to-max-matched the §4 fixture clears at 99, not 100).
- Allocation at `p*`: short side fills fully; long side rationed by **price priority** (most aggressive first: lowest-limit sells / highest-limit buys), then **pro-rata** for ties, integer rounding never exceeding `traded`, **leftover unit(s) to the largest order** (deterministic, identical rule in TS and Daml).
- Output shape `{ clearingPrice: number, allocations: { desk, side, filledQty }[] }` mirrors Daml `Allocation` so it feeds `Round.Clear` directly. Prices as `number`, rounded `Math.round(p*100)/100`; the on-ledger `Round.Clear` re-verification (Phase 2) is the backstop for any float skew — the TS number is never trusted unverified.
- ≥5 vitest scenarios (SOLV-05): (1) **§4 fixture** → `p*=100.00`, A=10/B=8/C=2, C residual 3; (2) exact same-limit ties (pro-rata + leftover-to-largest); (3) all-or-nothing imbalance; (4) no-cross (best buy < best sell → matched 0, no clear); (5) the **max-matched tie that exercises the lower-price tie-break** (the 99-vs-100 trap as a regression guard).

### Round Lifecycle & Clock (SOLV-01, SOLV-02)
- In-memory `Map<roundId, RoundState>` (single-process demo; the **ledger holds the authoritative contracts** — the map is just clock/cache state). Round IDs are stable strings (e.g. `round-<counter>` or reuse the seeded `roundId`).
- 60s window from `ROUND_SECONDS` env (default 60); a per-round timer auto-advances to Closed at expiry. **Force-close** via `POST /round/:id/close` so the live demo never waits 60s. On close: read the round's sealed `Order`s as Operator → compute/verify §8 → hold the verified allocation ready for `settle`.
- `RoundStats.sealedOrderCount` is maintained by the Operator as orders arrive (poll the round's visible Orders and update/recreate the `RoundStats` contract). Desks still see only the count (privacy preserved from Phase 1).
- The Phase-3 `seedOpenRound` already seeds one Open round + 3 §4 orders for the money shot; the solver's `POST /round` opens a **fresh** round (Operator authority). Reading/closing/clearing is by `roundId`, so the solver can also operate on the seeded round for the canonical demo.

### HTTP API on :4000 (SOLV-03, SOLV-04)
- **Express 4.19** + **cors** (allow the Vite dev origin `http://localhost:5173`) + **zod** request validation; structured JSON error responses; the Anthropic key and Operator token are strictly server-side and never appear in any response or log.
- Endpoints exactly per spec §11: `POST /round` (open → returns roundId), `GET /round/:id` (status, sealedOrderCount, and after clear: clearingPrice + aggregate matched volume + supply/demand curve points + rationale), `POST /round/:id/close` (force-close), `GET /round/:id/solve-preview` (run the solver, return proposal + rationale WITHOUT settling), `POST /round/:id/settle` (exercise `Round.Clear`).
- **Phase-4 behaviour of solve-preview/settle:** `solve-preview` returns the **deterministic §8** proposal + supply/demand curve points + `rationale: null` (the Claude rationale is added **additively** in Phase 5 — the response shape already carries the `rationale` field so P5 is a drop-in). `settle` exercises `Round.Clear` with the verified deterministic allocation and guards against double-settle (reject if the round is already Cleared/Settled). This keeps the full API shippable now while the AI layer lands off the critical path.

### Claude's Discretion
- Exact in-memory state struct, error-envelope shape, logging, and whether `agent.ts` is stubbed in P4 or first appears in P5 — all at the executor's discretion, guided by spec §11/§13 and existing repo conventions (zero-dep crypto JWT, `node:crypto`, ESM/TS config matching `web/`).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `daml/Umbra/Clearing.daml` — the §8 source of truth to port to TS verbatim (`computeClearing`/`choosePStar` tie-break-trap-safe, `rationByPriority` leftover-to-largest).
- `daml/Umbra/Auction.daml` — `Round.Clear` choice signature (Option-B additive ContractId fields `orderCids`/`buyerUsdcCid`/`sellerBondCids`, `clearingPrice`, `allocations`), `CloseRound`, `Order`, `RoundStats`, `Allocation`, `Side` — the contracts the solver exercises/reads.
- `daml/parties.json` — Operator + BankA/B/C party IDs (exported by `seedOpenRound` init-script).
- `scripts/mint-tokens.mjs` + `scripts/.operator-token` — zero-dep `node:crypto` HS256 JWT minting; the Operator token the solver authenticates with (gitignored, server-side only).
- `web/daml.js/umbra-0.1.0` — generated bindings the solver imports (`@daml.js/umbra-0.1.0/lib/Umbra/*`).

### Established Patterns
- Daml SDK **2.10.4**, ledgerId `sandbox`, JSON API on :7575 with `--allow-insecure-tokens`; package-**id** form template IDs (package-name form is unresolved by the 2.10 JSON API).
- JWT shape `{"https://daml.com/ledger-api":{ledgerId:"sandbox",applicationId:"umbra",actAs:[party],readAs:[party]}}`, HS256 dev secret, `Authorization: Bearer`.
- TypeScript 5.4–5.6, Node 20; `@daml/ledger`'s `Ledger` needs an absolute `http://…/` base URL.
- Strict secret hygiene (spec §15 / D6): `ANTHROPIC_API_KEY` + Operator token in `solver/` env only; `.env` gitignored; ship `.env.example`.

### Integration Points
- Solver ↔ JSON API :7575 as **Operator** (query sealed Orders, update RoundStats, exercise CloseRound/Clear).
- Solver HTTP :4000 ↔ frontend (consumed in Phase 6 Theatre/Settlement views; CORS to :5173).
- Reads `daml/parties.json` + `scripts/.operator-token`; env via `dotenv` (`JSON_API_URL`, `SOLVER_PORT`, `ROUND_SECONDS`, `ANTHROPIC_API_KEY` [unused until P5]).
</code_context>

<specifics>
## Specific Ideas

- The canonical §4 fixture is the continuous correctness reference: TS `auction.ts` MUST produce `clearingPrice=100.00`, fills A=10/B=8/C=2 (C residual 3) — identical to `test_clears_at_100` on the Daml side.
- Keep the response shape of `solve-preview`/`GET /round/:id` forward-compatible with Phase 5: include a nullable `rationale` and the supply/demand curve points now so the AI layer and the Theatre chart (Phase 6) drop in without API changes.
- "Verify, don't trust" is structural even in P4: the deterministic TS result is what gets submitted, and `Round.Clear` re-verifies on-ledger; no number is settled unchecked.
</specifics>

<deferred>
## Deferred Ideas

- Claude integration (`agent.ts`, `@anthropic-ai/sdk`, structured-output proposal, temperature-0, NL rationale) + `solver/PROMPT.md` → **Phase 5** (AGENT-01..04).
- Theatre countdown/reveal, hand-rolled SVG supply/demand chart, settlement animation, Desk view → **Phase 6** (UI-02/04/05/06).
- `make solver` / `make demo` orchestration + README run docs → **Phase 7** (DEMO-01).
- Competing solvers, residual routing, multi-round — stretch §19 (post-P7).
</deferred>
