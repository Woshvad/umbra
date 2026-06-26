# Phase 6: Auction Theatre & Settlement Animation - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 19 (12 NEW, 3 MODIFIED, + 4 lib/test)
**Analogs found:** 17 / 19 (2 SVG components have no in-repo analog — hand-rolled per UI-SPEC geometry)

This phase is presentation-only over a FROZEN Phase 1–5 core. Every new file copies a Phase-3 React/Tailwind pattern or type-mirrors a frozen solver shape. No ledger/solver/Daml edits.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/src/solver.ts` (NEW) | service/client | request-response (REST) | `solver/src/api.ts` (response shapes to mirror) | role-match (type-mirror) |
| `web/src/views/DeskView.tsx` (NEW, 02) | view | CRUD (per-party read + exercise) | `web/src/views/PrivacyView.tsx` + `DeskColumn.tsx` | exact |
| `web/src/views/TheatreView.tsx` (NEW, 03) | view | request-response + event (timer/rAF) | `web/src/views/PrivacyView.tsx` (frame) | role-match |
| `web/src/views/AgentView.tsx` (NEW, 04) | view | request-response | `web/src/views/PrivacyView.tsx` (frame) | role-match |
| `web/src/views/SettlementView.tsx` (NEW, 05) | view | request-response + event (rAF) | `web/src/views/PrivacyView.tsx` (frame) | role-match |
| `web/src/components/OrderTicket.tsx` (NEW) | component | event-driven (form → exercise) | `DeskColumn.tsx` `ActiveBody` (submit path) | exact |
| `web/src/components/HoldingsPanel.tsx` (NEW) | component | CRUD (read) | `DeskColumn.tsx` `ActiveBody` (holdings sum) | exact |
| `web/src/components/FillCard.tsx` (NEW) | component | CRUD (read TradeConfirmation) | `DeskColumn.tsx` (own-contract read) + `OrderRow.tsx` | role-match |
| `web/src/components/CountdownRing.tsx` (NEW) | component | event-driven (setInterval) | none (hand-rolled SVG; comp `startClock`) | no analog |
| `web/src/components/CrossingChart.tsx` (NEW) | component | transform (curve→SVG path) | none (hand-rolled SVG; UI-SPEC geometry) | no analog |
| `web/src/components/PriceReveal.tsx` (NEW) | component | request-response (display) | `VenueSpine.tsx` (big-numeral block) | partial |
| `web/src/components/AgentProposal.tsx` (NEW) | component | request-response (display) | `DeskColumn.tsx` (tag + OrderRow list) | role-match |
| `web/src/components/AgentRationale.tsx` (NEW) | component | event-driven (typewriter) | none (comp `startType`); shell from PrivacyView panel | partial |
| `web/src/components/DvpLegs.tsx` + `AtomicStamp.tsx` (NEW) | component | event-driven (rAF settleProgress) | none (comp `settle`); markup shell from DeskColumn | partial |
| `web/src/components/BalanceTable.tsx` (NEW) | component | event-driven (lerp) | `DeskColumn.tsx` holdings + `OrderRow.tsx` | role-match |
| `web/src/lib/*.ts` (NEW pure helpers) | utility | transform | `solver/src/auction.ts` (pure-fn style) | role-match |
| `web/src/lib/*.test.ts` (NEW) | test | — | `solver/src/auction.test.ts` + `vitest.config.ts` | exact |
| `web/src/App.tsx` (MODIFIED) | provider/router | — | itself (extend `screen` switch + lift state) | exact |
| `web/src/components/Nav.tsx` (MODIFIED) | component | — | itself (widen `Screen` union, enable tabs) | exact |
| `web/tailwind.config.ts` (MODIFIED) | config | — | itself (add `umbraLeg` + fontSize literals) | exact |

---

## Pattern Assignments

### `web/src/solver.ts` (NEW — service/client, request-response)

**Analog:** `solver/src/api.ts` (the frozen server — mirror its response JSON exactly).

The full client is pre-authored in RESEARCH Pattern 1 (lines 184-261) — copy it. Type sources verified against the live server:

- **Endpoints** (`api.ts` lines 132-259): `POST /round` → 201 `{roundId,status:'Open',openedAt,windowSeconds}`; `GET /round/:id` → `{roundId,status,sealedOrderCount}` + (only when status ∈ {Cleared,Settled}) `{clearingPrice,matchedVolume,allocations,curve,rationale,agent}`; `POST /round/:id/close` → `{roundId,status:'Closed'}`; `GET /round/:id/solve-preview` → `{roundId,clearingPrice,matchedVolume,allocations,curve,rationale,agent}`; `POST /round/:id/settle` → `{roundId,status:'Settled',clearingPrice,matchedVolume,allocations,txConfirmations}`.
- **`CurvePoint`** = `{ price:number; demand:number; supply:number }` — from `buildCurve` (`api.ts` lines 115-123). JSON **numbers**, not strings.
- **`Allocation`** = `{ desk:string; side:'Buy'|'Sell'; filledQty:number }` — VERIFIED from `solver/src/auction.ts` lines 30-34 (resolves RESEARCH Open Question #1 / A4). `side` is `Side` (`'Buy'|'Sell'`).
- **`agent`** = `{ verified:boolean; source:'claude'|'deterministic-fallback' }` — VERIFIED from `agent.ts` lines 127-129. Badge map: `source==='claude' ? 'VERIFIED · CLAUDE' : 'VERIFIED · DETERMINISTIC'` (RESEARCH Pitfall 5).
- **Error envelope** (`api.ts` lines 266-273): `{ error: { code:string; message:string } }`. Mirror as `SolverError`; a `fetch` network reject → `SolverError(0,'OFFLINE','SOLVER OFFLINE — START THE SERVICE ON :4000')`.
- **CORS** (`api.ts` lines 29-30, 129): server allows `http://localhost:5173` only → direct cross-origin `fetch`, no Vite proxy.

**Base-URL knob** mirrors `web/src/config.ts` style (single drift const + comment):
```typescript
export const SOLVER_BASE_URL = import.meta.env.VITE_SOLVER_URL ?? 'http://localhost:4000'
```

---

### `web/src/views/DeskView.tsx` (NEW, 02 — view, CRUD)

**Analog:** `web/src/views/PrivacyView.tsx` (frame) + `web/src/components/DeskColumn.tsx` (per-party plane).

**Frame pattern** (PrivacyView lines 22-48) — copy `<main>` + section marker + ink rule + headline:
```tsx
<main style={{ position:'relative', padding:'30px 48px 64px', overflow:'hidden' }}>
  {/* section marker: mono 13 "02" + Inter 11 uppercase .16em "Desk · {firm}" */}
  <div className="bg-ink" style={{ height:'1px', margin:'12px 0 0' }} />
  <h1 className="font-display font-bold" style={{ fontSize:'54px', lineHeight:.96, letterSpacing:'-.02em', margin:'26px 0 36px' }}>
    ORDERS IN THE DARK
  </h1>
```
Note: headline is **54px** (not the `text-78` Privacy literal) — needs the new `fontSize` token (see tailwind section).

**Per-party provider mount** (DeskColumn lines 212-227) — wrap the body in the ACTIVE desk's ctx:
```tsx
<ctx.DamlLedger token={token} party={party} httpBaseUrl={httpBaseUrl} wsBaseUrl={wsBaseUrl}>
  <DeskBody ctx={ctx} deskKey={deskKey} />
</ctx.DamlLedger>
```
Select `ctx`/`deskKey` from `activeDesk` via `ctxFor` (`ledgerContexts.ts` lines 40-44).

---

### `web/src/components/OrderTicket.tsx` (NEW — component, event-driven)

**Analog:** `DeskColumn.tsx` `ActiveBody` submit path (lines 39-81) — the EXACT reuse target.

**Imports** (DeskColumn lines 17-25) — note `Side` lives in `Clearing`, `Venue` in `Roles`:
```typescript
import { Order, TradeConfirmation } from '@daml.js/umbra-0.1.0/lib/Umbra/Auction/module'
import { Asset } from '@daml.js/umbra-0.1.0/lib/Umbra/Asset/module'
import { Venue } from '@daml.js/umbra-0.1.0/lib/Umbra/Roles/module'
import { Side } from '@daml.js/umbra-0.1.0/lib/Umbra/Clearing/module'
```

**Submit pattern** (DeskColumn lines 60-81) — one-per-round lock + Int/Decimal as STRINGS (Pitfall 1):
```typescript
const ticketLocked = submitted || !!order      // one order per round (line 60)
const venues = await ledger.query(Venue)
const venueCid = venues[0]?.contractId          // (lines 66-68)
await ledger.exercise(Venue.SubmitOrder, venueCid, {
  desk: tokens[deskKey].party, roundId: 'R1',
  side,                          // Side.Buy | Side.Sell
  quantity: String(qty),         // '10'  — STRING
  limit: limit.toFixed(1),       // '101.0' — STRING
})
```
Extend beyond the minimal DeskColumn affordance: real Side toggle / qty / limit inputs (UI-SPEC 154-163), "load demo order" prefill (A: Buy 10@101 · B: Sell 8@99 · C: Sell 5@100), seal-wipe overlay (`animate-umbra-wipe`, already in tailwind line 73).

---

### `web/src/components/HoldingsPanel.tsx` + `FillCard.tsx` (NEW — component, CRUD read)

**Analog:** `DeskColumn.tsx` `ActiveBody` (lines 51-56 holdings; the own-contract read pattern).

**Holdings sum** (DeskColumn lines 51-56) — copy verbatim:
```typescript
const bond = assets.contracts.filter(c => c.payload.symbol === 'BONDX')
  .reduce((a,c) => a + Number(c.payload.quantity), 0)
const cash = assets.contracts.filter(c => c.payload.symbol === 'USDCx')
  .reduce((a,c) => a + Number(c.payload.quantity), 0)
```

**FillCard own-fill read** (DeskColumn own-contract pattern + RESEARCH Code Examples 504-513). `TradeConfirmation = { operator, desk, roundId, symbol, side, filledQty:Int, clearingPrice:Numeric, cashMoved:Numeric }` — all Daml numbers come as STRINGS → wrap `Number(...)`:
```typescript
const tc = confirms.contracts[0]?.payload          // own confirmation only (privacy)
const fillColor = Number(tc?.filledQty) > 0 ? '#2B3AF2' : '#FF3D9A'  // buy / sell
```
Row layout reuses `OrderRow.tsx` (label + value + color + tabular) — same component DeskColumn uses (lines 108-125). Card uses `animate-umbra-rise` (tailwind line 76).

---

### `web/src/views/TheatreView.tsx` + `CountdownRing.tsx` + `PriceReveal.tsx` (NEW, 03)

**Analog:** PrivacyView frame; operator plane via `solver.ts` (Pattern 3 — NO DamlLedger provider). Animation techniques are pre-transcribed from the comp in RESEARCH Patterns 4 & 5 (countdown `setInterval` + `753.98*(1-s/60)`; `closeAndSolve` = `closeRound`→`solvePreview`→`umbraSlam`).

**CountdownRing** — no in-repo analog (hand-rolled SVG). Binding geometry: UI-SPEC line 179; technique RESEARCH lines 327-349. `CIRC=753.98`, `r=120`, red at `seconds<=10`, auto-fire at 0.

**PriceReveal hero slab** — closest in-repo big-numeral is `VenueSpine.tsx` (108px count block), but the exact slab markup is binding in RESEARCH Code Examples lines 516-528 (lime `#D6FB3C` bg, 120px mono, red skew sliver). Uses `animate-umbra-slam` (tailwind line 74). Cleanup timers on unmount (Pitfall 6).

---

### `web/src/views/AgentView.tsx` + `AgentProposal.tsx` + `AgentRationale.tsx` (NEW, 04)

**Analog:** PrivacyView frame + `DeskColumn.tsx` for the tag + OrderRow list.

**Proposal tag** — reuse DeskColumn's `SELECTED`-style tag (lines 98-103): `font-mono text-9 border` `letterSpacing:.12em` `padding:3px 7px`. The NEW `agent` badge uses the SAME styling, ink text (UI-SPEC 203).
**Fill rows** — reuse `OrderRow.tsx` with signed-qty coloring `#2B3AF2`/`#FF3D9A`/`rgba(10,10,10,.4)` (UI-SPEC 204).
**Rationale typewriter** — no in-repo analog; comp `startType` (~26ms/char), `animate-umbra-caret` (tailwind line 69, flame). Reduced-motion → full text instantly (Pitfall 7). Ink panel shell mirrors PrivacyView's paragraph block.

---

### `web/src/views/SettlementView.tsx` + `DvpLegs.tsx` + `AtomicStamp.tsx` + `BalanceTable.tsx` (NEW, 05)

**Analog:** PrivacyView frame; settle animation pre-transcribed in RESEARCH Pattern 7 (lines 396-423) — ONE `requestAnimationFrame` `settleProgress` 0→1 over ~800ms driving ALL legs + ALL balance lerps simultaneously. **Never sequence legs** (Anti-pattern). `AtomicStamp` uses `animate-umbra-stamp` (tailwind line 75).

**BalanceTable** — holdings numerals reuse the DeskColumn sum logic; per-desk own row sources from `TradeConfirmation` (verified), aggregate from `allocations` (`Allocation` shape now confirmed above). lerp: `x + (y-x)*settleProgress`.

§4 final balances (pin exactly): BLUEROCK 10/4000 · MERIDIAN 12/1800 · HALWARD 13/1200.

---

### `web/src/lib/*.ts` + `*.test.ts` (NEW — pure helpers + vitest)

**Analog:** `solver/src/auction.ts` (pure-fn style) + `solver/vitest.config.ts` + `solver/src/auction.test.ts`.

**vitest config** mirror (`solver/vitest.config.ts` whole file) — add a `test` block to `web/vite.config.ts` OR a sibling `web/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } })
```
Match `vitest@2.1.9` (solver parity). Helpers to test: curve→SVG path mapping (§4 curve crosses at binding marker `(296,160)`, p*=100, q=10 — UI-SPEC "SVG Crossing Chart"); solver payload parse (`clearingPrice===100`, `matchedVolume===10`, badge map); offline guard (`SolverError.code==='OFFLINE'`). Test style: `describe/it/expect` + the `SECTION4_VIEWS` fixture convention from `solver/src/auction.test.ts` / `api.test.ts`.

---

### `web/src/App.tsx` (MODIFIED — provider/router)

**Analog:** itself. Keep the `RoundStateProbe` (lines 18-38) feeding `StatusIndicator` unchanged. Extend the single-line `screen==='privacy'` switch (lines 72-74) to route all 5 views. Lift solver round state (`roundId`, theatre `phase`, `preview`) + an `offline` flag to App so Theatre→Agent→Settlement share one round (RESEARCH Pattern 8). Default `roundId` = `'R1'` (seeded; RESEARCH Open Question #2). Thread `activeDesk` to DeskView.

---

### `web/src/components/Nav.tsx` (MODIFIED — component)

**Analog:** itself. Widen the union (line 6) and enable the four disabled tabs (lines 8-14):
```typescript
export type Screen = 'privacy' | 'desk' | 'theatre' | 'agent' | 'settlement'
// set each TAB: screen:'desk'|'theatre'|'agent'|'settlement', enabled:true
```
Active-tab rule (red 3px top / ink fg) is already correct (lines 25-27) — no style change.

---

### `web/tailwind.config.ts` (MODIFIED — config)

**Analog:** itself. Two additive edits (do NOT alter existing values — binding comp):

1. **Add `umbraLeg` keyframe** alongside existing keyframes (lines 62-71) + animation (lines 72-78), per UI-SPEC line 262:
```typescript
umbraLeg: { from: { strokeDashoffset: 'var(--len)' }, to: { strokeDashoffset: '0' } }
```
(Optional — RESEARCH A3: the width-scale `div` leg approach needs no keyframe; add only if SVG-stroke legs chosen.)

2. **Add large `fontSize` literals** to the existing block (lines 25-36) — comp numerals not yet present: `'54'`(.96), `'56'`(.98), `'44'`, `'40'`, `'30'`, `'34'`, `'84'`, `'120'`(.9), `'22'`, `'18'`, `'15'` per UI-SPEC Typography table. Existing `umbraSlam`/`umbraStamp`/`umbraDraw`/`umbraCaret`/`umbraPulse`/`umbraRise`/`umbraWipe` are ALL already present — reuse, don't redefine.

---

## Shared Patterns

### Two data planes (cross-cutting — THE auth boundary)
- **Desk plane (:7575):** `web/src/ledgerContexts.ts` `ctxA/B/C` (per-party isolated React contexts, lines 30-44) + `web/src/desks.ts` `tokens`/`httpBaseUrl`/`wsBaseUrl` (lines 10, 28-35). **Apply to:** DeskView, FillCard, SettlementView per-desk row. Mount pattern: `DeskColumn.tsx` lines 212-227.
- **Operator plane (:4000):** `web/src/solver.ts` (NEW), NO DamlLedger provider, no operator token in bundle (`desks.ts` lines 3-4). **Apply to:** TheatreView, AgentView, SettlementView aggregate.

### Section-marker + frame (every NEW view)
**Source:** `PrivacyView.tsx` lines 24-48. **Apply to:** all 4 new views. `<main padding:30px 48px {64|48|72}px>` → mono num + Inter `.16em` label → 1px `bg-ink` rule → 54px display headline.

### Numbers-as-strings boundary
**Source:** `DeskColumn.tsx` line 69 comment + lines 51-56. **Apply to:** every desk-plane read (`Number(...)`) and every `Venue.SubmitOrder` arg (`String(...)`/`.toFixed`). Solver-plane numbers are already JS numbers — do not wrap (Pitfall 2).

### Reduced-motion gate + timer cleanup
**Source:** comp `reduced()` (RESEARCH Pitfall 7) + `useEffect` cleanup (Pitfall 6). **Apply to:** CountdownRing, PriceReveal, AgentRationale, DvpLegs (clear `setInterval`/`cancelAnimationFrame` on unmount; reduced-motion → instant).

### §4 fixture canary
**Source:** spec §4 / CLAUDE.md. **Apply to:** every view + every lib test. Display the solver's returned values but ASSERT they equal 100.00 / matched 10 / fills A=+10,B=−8,C=−2 / balances A:10/4000·B:12/1800·C:13/1200. Never hard-code a fabricated drift value.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/src/components/CountdownRing.tsx` | component | event-driven | First hand-rolled animated SVG in repo; geometry binding from UI-SPEC line 179 + comp `startClock`. Technique fully specified in RESEARCH Pattern 4 — copy that. |
| `web/src/components/CrossingChart.tsx` | component | transform | First hand-rolled chart SVG; no chart lib (spec §6/§12.4). Exact polyline coords binding in UI-SPEC "SVG Crossing Chart" §; mapping fn in RESEARCH Pattern 6. |

(`AgentRationale` typewriter and `DvpLegs` rAF settle have no in-repo analog either, but their markup shells reuse PrivacyView/DeskColumn and the techniques are pre-transcribed in RESEARCH Patterns 5 & 7 — classified "partial" above rather than "no analog".)

---

## Metadata

**Analog search scope:** `web/src/` (views, components, ledgerContexts, desks, config, tailwind), `solver/src/` (api, auction, agent, *.test, vitest.config).
**Files scanned:** 14 read in full/targeted + grep across `solver/src`.
**Pattern extraction date:** 2026-06-26

## PATTERN MAPPING COMPLETE

**Phase:** 6 - Auction Theatre & Settlement Animation
**Files classified:** 19
**Analogs found:** 17 / 19

### Coverage
- Files with exact/strong analog: 11
- Files with partial analog (shell reused, technique from RESEARCH/comp): 6
- Files with no analog (hand-rolled SVG): 2

### Key Patterns Identified
- Two data planes: desk reads/exercises via per-party `ctxA/B/C` (:7575, `DeskColumn` mount pattern); all operator actions via the new `web/src/solver.ts` (:4000), no operator token in browser.
- Every new view copies the `PrivacyView` `<main>` frame (section marker + ink rule + display headline); animation techniques are already transcribed verbatim in RESEARCH Patterns 4–7 (countdown, slam, typewriter, single-rAF simultaneous settle).
- Type-mirroring is exact: `Allocation` = `{desk,side,filledQty}` (auction.ts 30-34), `agent` = `{verified, source:'claude'|'deterministic-fallback'}` (agent.ts 127-129); Daml numbers are STRINGS, solver numbers are JS numbers.

### File Created
`.planning/phases/06-auction-theatre-settlement-animation/06-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can reference each analog file + line range directly in PLAN action steps.
