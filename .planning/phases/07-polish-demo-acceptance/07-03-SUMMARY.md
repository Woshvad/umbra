---
phase: 07-polish-demo-acceptance
plan: 03
type: execute
execution: orchestrator-run
status: complete
requirements: [DEMO-02, DEMO-03, DEMO-04]
completed: 2026-06-27
---

# 07-03 Summary — Acceptance: Daml tests + live E2E + pitch frames

**Orchestrator-run** (live ledger + background processes + browser preview can't live in a
subagent). The full stack was booted and the money shot driven through the **real UI**, with the
solver HTTP API asserted in parallel as the authoritative numeric proof. Full evidence:
[`docs/LIVE-EVIDENCE.md`](../../../docs/LIVE-EVIDENCE.md).

## DEMO-02 — `daml test` (6/6 PASS)
All six acceptance scripts `ok`:
`test_clears_at_100` · `test_settled_balances` · `test_atomicity` · `test_privacy_orders` ·
`test_privacy_confirmations` · `test_clear_rejects_bad_allocation`. The Daml layer is unchanged
from Phases 1–3 — confirmation gate.

## DEMO-03 — live E2E money shot (PASS)
Stack: `daml start` (:7575, seeded **R1** Open + 3 sealed orders) → `mint-tokens` → solver (:4000)
→ web (:5173). Observed live (every numeral read from the running app):

- **Privacy at the wire:** `verify-privacy.mjs` → each desk's `/v1/query` returns **only its own**
  Order, 0 rivals. UI 01 Privacy: BLUEROCK sees its own BUY 10 ≤101.0 (hold 0/5000); MERIDIAN +
  HALWARD **REDACTED**; venue **03 SEALED**.
- **Clearing:** `solve-preview` → `clearingPrice 100`, `matchedVolume 10`, allocations A+10/B−8/C−2,
  rationale present, `agent {verified:false, source:"deterministic-fallback"}` (keyless degrade).
  UI 03 Theatre Close & Solve → **CLEARS AT 100.00**, chart **MATCHED 10 @ 100.00**.
- **Atomic settle (UI Settle Atomically):** legs **MERIDIAN 8→BLUEROCK ←800** · **HALWARD 2→BLUEROCK
  ←200**; **SETTLED — both legs, one tx** + `1 TRANSACTION · ATOMIC`; balances → §4 finals
  **BLUEROCK 10/4000 · MERIDIAN 12/1800 · HALWARD 13/1200**.
- **Post-settle:** `GET /round/R1` status **Settled**; per-desk TradeConfirmation privacy (bankA→1
  bankA, bankB→1 bankB, bankC→1 bankC — each sees only its own fill); second settle → **409
  ALREADY_SETTLED**.

### Two genuine wiring bugs surfaced + fixed (the point of a live E2E)
1. **`fix(07-03)` `3401138` — solver wouldn't boot:** `@daml/ledger` (CJS) exposes `Ledger` as both
   `default` and a named export; the default import bound the namespace object (not the class) under
   tsx/esbuild → `new Ledger()` "not a constructor". Only exercised on a real boot, so the
   DI-stubbed tests missed it. Fixed to the named import + mock parity; solver boots, **33/33 tests
   green**.
2. **`fix(07-03)` `4816c91` — settlement showed BEFORE balances + raw party ids:** solver allocations
   are keyed by the live party id (`bankA::<fp>`); the UI keys by display code. Added a shared
   `codeForParty` (desks.ts) used by SettlementView + AgentProposal. Now balances → §4 finals, legs →
   comp codes (verified live). Build + 11 lib tests green.

### Third bug — `GET /round/:id` read 0 post-settle — FIXED (commit `2f17e09`, follow-up)
At *Settled* status the handler recomputed §8 from the sealed orders that `Round.Clear` retired → empty
book → `clearingPrice`/`matchedVolume` read 0. Fixed by reconstructing from the persisted per-desk
**TradeConfirmations** (`readTradeConfirmations`, ledger-truth/restart-proof) when the orders are gone;
the pre-retire path is unchanged. **Verified live:** post-settle `GET /round/R1` → `100 / 10 / 3 fills`
+ a factual settled rationale. Unit test added (solver **34/34**).

## DEMO-04 — pitch frames + 3-min script
- [`docs/01-privacy-3up.svg`](../../../docs/01-privacy-3up.svg) + [`docs/02-atomic-settlement.svg`](../../../docs/02-atomic-settlement.svg)
  — **comp-faithful** frames built from the binding comp tokens + the live-verified §4 data.
- [`docs/DEMO.md`](../../../docs/DEMO.md) — the 3-minute demo script (setup → click-path → talking
  points → §4 numbers).
- [`docs/LIVE-EVIDENCE.md`](../../../docs/LIVE-EVIDENCE.md) — the live verification log + the capture
  limitation.

**Capture limitation (honest):** raw browser PNGs could not be produced — the headless preview's
`preview_screenshot` times out on this app (confirmed across views, even after closing the streaming
WebSocket + dropping the ledger; the accessibility *snapshot* always works), and the preview tool
returns an inline image, not a file writable into `docs/`. Same persistent-WS / headless-capture
limitation noted in Phases 1–3. The frames reproduce exactly what the live UI rendered (snapshots in
LIVE-EVIDENCE.md). To capture native PNGs for a deck, run the stack per the README and screenshot the
browser directly — the limitation is the headless tool, not the app.

## Status
DEMO-02 ✅ · DEMO-03 ✅ (money shot live, **3 bugs surfaced & fixed** — solver boot, settlement
balances/legs, GET-post-settle) · DEMO-04 ✅ (frames + script + evidence; raster capture env-blocked +
documented). Phase-7 acceptance complete.
