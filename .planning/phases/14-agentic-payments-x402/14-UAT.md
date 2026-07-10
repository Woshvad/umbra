# Phase 14 — Live UAT Checklist (PAY-01 x402 metered access)

**Status:** Built · offline-verified · live UAT pending (2026-07-11)

**Why deferred:** These four items require external infrastructure absent on this box — a reachable FTP Canton x402 facilitator, a CC-funded venue party on a live DevNet node (SV-sponsorship gated), and an external x402-speaking client/agent. Every seam is proven offline: the gate + wire envelope (`x402.test.ts`), the `self` + `canton-cc` backends (`facilitator.test.ts`, stubbed ledger / stubbed `fetch`), and the whole-app wiring (`x402.wiring.test.ts` — default-OFF byte-unchanged + on-402 + free-path allow-list + secret-sweep + buildDeps threading). The §4 golden still clears **$100.00** with the gate present. This mirrors the "Built · live UAT pending" pattern from Phases 8–13.

**Primary invariant (proven offline, no live gate):** with `X402_ENABLED=false` (the default) the gate is a byte-identical no-op — the two metered routes and the §4 money-shot demo behave exactly as before. NONE of the gates below block the offline phase build: the `self` backend is DevNet-capable today; `canton-cc` real-$CC is offline-mocked and the ONLY item that carries the Phase-12-style SV-sponsorship gate.

## How to run the live stack
Boot the Canton DevNet/LocalNet (`:3975/:2975/:4975`) + solver (`:4100`) per `.planning` memory / `scripts/localnet/`. Enable metering via `solver/.env`: set `X402_ENABLED=true` and pick the backend (`X402_FACILITATOR=self` for on-ledger USDCx, or `canton-cc` + `X402_FACILITATOR_URL` + the SecretsProvider-resolved `X402_FACILITATOR_KEY` for real $CC). Confirm the exact `X402_NETWORK`/`X402_ASSET` against the facilitator's `GET /supported` first.

## Live checks (the four external gates)

- [ ] **Gate 1 — a real x402 client pays end-to-end (402 → pay → 200 + X-PAYMENT-RESPONSE).**
  - **Enable/run:** in `solver/.env` set `X402_ENABLED=true` (default `X402_FACILITATOR=self`), restart the solver, then point an external x402-speaking client/agent at `GET /round/:id/solve-preview`.
  - **Expected observable:** the first request (no `X-PAYMENT`) returns **402** with the v1 `accepts[]` envelope (Canton primary + USDCx-self second); the client constructs + retries with a valid `X-PAYMENT`; the second request returns **200** with the deterministic §8 solve **and** an `X-PAYMENT-RESPONSE` header carrying the settlement ref. `POST /competing` behaves identically.
  - **Honest note:** offline-covered today by `x402.wiring.test.ts` ("metering on ⇒ 402" + "byte-unchanged") + `x402.test.ts` ("402 then 200") driving the real gate over `fetch` with a stubbed facilitator — a real external client is the only missing piece.

- [ ] **Gate 2 — the `self` backend settles a real USDCx transfer on a live DevNet node.**
  - **Enable/run:** `X402_ENABLED=true`, `X402_FACILITATOR=self` on a booted DevNet node with a funded desk USDCx Holding; pay with that real desk USDCx Holding cid.
  - **Expected observable:** `verify` passes the fee-source predicate (owner===payer + `USDCx` + unlocked + amount ≥ price); `settle` runs `moveFee(cid, price, venue)` and the **venue's USDCx Holding grows by exactly the fee** while the securities DvP / `Round.Clear` / §8 stay byte-unchanged (the fee is a standalone operator-custody move, never on the settlement path).
  - **Honest note:** `self`-covered today — the `self` backend runs on the live DevNet node with Umbra's own USDCx Holdings (same participant the securities DvP uses); **no SV sponsorship needed**. Offline-verified in `facilitator.test.ts` ("self" reject-ladder + settle→moveFee over a stubbed ledger).

- [ ] **Gate 3 — the `canton-cc` backend settles real Canton Coin via the live FTP facilitator (Phase-12-style SV-sponsorship gate).**
  - **Enable/run:** `X402_ENABLED=true`, `X402_FACILITATOR=canton-cc`, `X402_FACILITATOR_URL=<FTP facilitator base URL>`, and `X402_FACILITATOR_KEY` seeded into the SecretsProvider (server-side only, never committed); a **CC-funded venue party on a live DevNet node**.
  - **Expected observable:** the solver POSTs the pinned `{ x402Version, paymentPayload, paymentRequirements }` body to `${url}/verify` + `${url}/settle` with `Authorization: Bearer <key>`; a real **Canton Coin** transfer settles and `settle` returns the facilitator's transaction ref.
  - **Honest note:** **This is the external SV-sponsorship gate — the same gate as Phase 12** (a CC-funded party on DevNet requires super-validator sponsorship). Offline-mocked today: `facilitator.test.ts` drives `canton-cc` verify/settle against a stubbed `fetch` (pinned body + Bearer header + non-2xx → status-only secret-free reason). Live = UAT.

- [ ] **Gate 4 — exact Canton CAIP-2 network id + Canton Coin asset id + facilitator paths confirmed via `GET /supported`.**
  - **Enable/run:** `curl ${X402_FACILITATOR_URL}/supported` against the live FTP facilitator.
  - **Expected observable:** the returned kinds/schemes confirm the EXACT `X402_NETWORK` (Canton CAIP-2 id) + `X402_ASSET` (Canton Coin id) + the `/verify`+`/settle` path shapes, **and** the wire envelope version (v1 `maxAmountRequired` vs the v2 `amount` rename — Assumptions A1–A5). Update `X402_NETWORK`/`X402_ASSET`/`X402_FACILITATOR_URL` in `.env` to match; if the facilitator speaks v2, flip the single `buildAccepts` mapping in `x402.ts`.
  - **Honest note:** env-driven placeholders today (`canton:devnet` / `CantonCoin`) — NO hard-coded Canton id ships in the code; all field mapping is isolated to `buildAccepts` so a v2 flip is one function. Confirm at UAT.

## Pre-verification regression sweep (run before signing off)
- `cd solver && npx vitest run` — the FULL solver suite green (existing + x402 gate/facilitator/wiring), proving default-OFF byte-compatibility.
- `cd solver && npx tsc --noEmit` — clean of new errors (a single pre-existing `idempotency.test.ts:193` baseline is documented in `deferred-items.md`, not introduced here).
- `cd daml && daml test` — the §4 golden still clears **$100.00** with the gate in the tree (no Daml changed).
- **Secret-sweep pass** — `X402_FACILITATOR_KEY` / operator token / `ANTHROPIC_API_KEY` never appear in a 402 body, the `X-PAYMENT-RESPONSE` header, `/status`, or the boot log (covered by `x402.wiring.test.ts` + `x402.test.ts` + `facilitator.test.ts` secret-sweeps).

## Recorded honest limitations / accepted risks (not defects)
- **`canton-cc` real-$CC settlement** is the external SV-sponsorship gate (a CC-funded venue party on DevNet), identical in kind to the Phase 12 external gate — offline-mocked now, live = UAT.
- **No Canton x402 npm package is published** (`@cantrustai/x402` / `canton-x402` → 404); the `canton-cc` adapter is self-implemented to the generic FTP `/verify`+`/settle` contract. Adopting the eventual FTP client SDK is a deferred swap behind the same `FacilitatorClient` interface.
- **`X402_NETWORK`/`X402_ASSET`/`X402_FACILITATOR_URL`** are operator-set env placeholders confirmed at UAT via `GET /supported` — no live Canton id is committed.
- **Operator-custody honesty:** the `self` backend is a custodian-executed move on the payer's PRESENTED authorization, not a payer-signed transfer (`SELF_CUSTODY_LABEL`); the payer-signed variant is the `canton-cc` path.
- **Single-instance replay guard:** the gate's spent-nonce / spent-holdingCid sets are in-memory TTL-bounded for the single-operator demo; a Postgres-backed swap is documented, not built.
