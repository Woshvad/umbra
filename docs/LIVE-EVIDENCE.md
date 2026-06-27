# Umbra — Live E2E Acceptance Evidence (DEMO-02 / DEMO-03 / DEMO-04)

**Run:** 2026-06-27, against the real stack — `daml start` (Canton sandbox :6865 + JSON API
:7575, seeded round **R1**) · solver (:4000) · web (:5173). Every value below was observed
live this session (not asserted from code).

---

## DEMO-03 — the money shot, end to end (PASS)

Driven through the **real UI** (Theatre → Close & Solve → Settlement → Settle Atomically),
with the **solver HTTP API** asserted in parallel as the authoritative numeric proof.

| Beat | Where | Observed | Verdict |
|------|-------|----------|---------|
| Round open + book | `GET :4000/round/R1` | `{status: Open, sealedOrderCount: 3}` | ✅ |
| Privacy at the wire | `node scripts/verify-privacy.mjs` | each desk's `/v1/query` returns **only its own** Order, **0 rivals** (bankA/B/C) | ✅ PASS (PRIV-05) |
| 3-up blindness (UI) | 01 Privacy, BLUEROCK session | BLUEROCK sees its own BUY 10 ≤101.0 (hold 0/5000); MERIDIAN + HALWARD **REDACTED**; venue **03 SEALED** | ✅ |
| Clearing | `GET :4000/round/R1/solve-preview` | `clearingPrice **100**`, `matchedVolume **10**`, allocations **A +10 / B −8 / C −2**, `rationale` present, `agent {verified:false, source:"deterministic-fallback"}` (keyless) | ✅ |
| Reveal (UI) | 03 Theatre, Close & Solve | **CLEARS AT 100.00**, chart **MATCHED 10 @ 100.00**, MATCHED VOLUME **10 units** | ✅ |
| DvP legs (UI) | 05 Settlement | **MERIDIAN 8 BONDX → BLUEROCK ← 800 USDCx** · **HALWARD 2 BONDX → BLUEROCK ← 200 USDCx** | ✅ |
| Atomic settle (UI) | 05 Settlement, Settle Atomically | **SETTLED — both legs, one tx**; `1 TRANSACTION · ATOMIC` stamp; balances lerp to the §4 finals | ✅ |
| Settled balances | UI balance table | **BLUEROCK 10/4000 · MERIDIAN 12/1800 · HALWARD 13/1200** | ✅ |
| Settled status | `GET :4000/round/R1` | `status: Settled` | ✅ |
| Per-desk fill privacy | `/v1/query` TradeConfirmation, each desk token | bankA→1 (bankA), bankB→1 (bankB), bankC→1 (bankC) — **each sees only its own fill** | ✅ |
| Double-settle guard | `POST :4000/round/R1/settle` (2nd time) | `409 {code: ALREADY_SETTLED}` | ✅ |

**Two genuine wiring bugs were surfaced by this live run and fixed (commits `3401138`,
`4816c91`):**
1. **Solver wouldn't boot** — `@daml/ledger` is CJS exposing `Ledger` as both `default` and a
   named export; a default import bound the *namespace object* (not the class) under tsx/esbuild
   interop → `new Ledger()` threw "Ledger is not a constructor". The module-scope construction is
   only exercised on a real boot, so the DI-stubbed unit tests never caught it. Fixed to the named
   import (the recorded 04-01 decision); solver boots + 33/33 tests stay green.
2. **Settlement showed BEFORE balances + raw party ids** — the solver returns allocations keyed by
   the live desk **party id** (`bankA::<fp>`), but the UI keys by display **code** (BLUEROCK/…),
   so the deltas missed and the legs printed party ids. Fixed with a shared `codeForParty`
   (desks.ts) used by SettlementView + AgentProposal. Now: balances → §4 finals, legs → comp codes
   (verified live, table above).

**Third bug — `GET /round/:id` read 0 post-settle — now FIXED (commit `2f17e09`).** At *Settled*
status the handler recomputed §8 from the sealed orders, which `Round.Clear` has **retired**, so the
book was empty and `clearingPrice`/`matchedVolume` read **0**. Fixed by reconstructing the settled
result from the persisted per-desk **TradeConfirmations** (`readTradeConfirmations` — ledger truth,
restart-proof) when the sealed orders are gone; the pre-retire path is unchanged. **Verified live:**
`GET /round/R1` post-settle now returns `clearingPrice 100`, `matchedVolume 10`, the 3 §4 fills
(bankA Buy 10 / bankB Sell 8 / bankC Sell 2), and a factual settled rationale. Unit test added
(solver 34/34 green).

---

## DEMO-02 — Daml Script tests
See `docs/` / the 07-03 summary for the `daml test` run (all six acceptance scripts). The Daml
layer is unchanged from Phases 1–3.

---

## DEMO-04 — pitch frames + the capture limitation (documented)

**The two pitch frames** are in `docs/`:
- [`01-privacy-3up.svg`](./01-privacy-3up.svg) — the 3-up blindness.
- [`02-atomic-settlement.svg`](./02-atomic-settlement.svg) — the atomic DvP settlement.

**Honest provenance.** These are **comp-faithful vector renders** built from the binding
`Umbra design/` comp tokens + the **live-verified §4 data above** — *not* raw browser captures.
A raw browser PNG could not be produced in this environment: the headless preview's
`preview_screenshot` **times out** on this app (confirmed across views and even after closing the
streaming WebSocket and dropping the ledger — the renderer/capture path hangs, while the
accessibility-tree *snapshot* always succeeds), and the preview tool returns an inline image
rather than a file that can be written into `docs/`. This is the same persistent-WebSocket /
headless-capture limitation recorded in Phases 1–3. The frames reproduce exactly what the live UI
rendered (every numeral was read from the running app this session, per the table above); the
accessibility snapshots that prove the live render are reproduced below.

### Live render snapshots (accessibility tree — proof the real UI produced these frames)

**01 Privacy (pre-settle, BLUEROCK session):**
```
01 PRIVACY / THE BOOK — "EVERYONE'S BLIND. THAT'S THE POINT."
VENUE SEES ONLY A COUNT · 03 SEALED ORDERS
BLUEROCK · BUYER · YOU   SIDE BUY · QUANTITY 10 BONDX · LIMIT ≤ 101.0 USDCx · HOLD 0 BONDX / 5000 USDCx
                         "YOUR ORDER — VISIBLE ONLY TO YOU"
MERIDIAN · SELLER · SEALED   "REDACTED — NOT VISIBLE TO YOU"
HALWARD  · SELLER · SEALED   "REDACTED — NOT VISIBLE TO YOU"
```

**03 Theatre (after Close & Solve):**
```
SUPPLY × DEMAND   100.00   q=10   p*   MATCHED 10 @ 100.00
CLEARS AT 100.00   ·   MATCHED VOLUME 10 units   ·   UNIFORM PRICE 1 for all
```

**05 Settlement (after Settle Atomically):**
```
DELIVERY VS PAYMENT · 2 LEGS
  MERIDIAN 8 BONDX → BLUEROCK ← 800 USDCx
  HALWARD  2 BONDX → BLUEROCK ← 200 USDCx
1 TRANSACTION · ATOMIC      SETTLED — BOTH LEGS, ONE TX
BALANCES · BEFORE → AFTER
  BLUEROCK  10 / 4000      MERIDIAN  12 / 1800      HALWARD  13 / 1200
```

To capture native PNGs for a deck, run the stack per the README and screenshot the browser
directly (the limitation is the *headless* capture tool, not the app — the app renders correctly).
