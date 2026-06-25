# Umbra — Sealed-Bid Batch Auction & Atomic Settlement on Canton

> **Codename:** Umbra (sealed/shadow orders). The product name lives in one constant (`PRODUCT_NAME`) and is trivially renameable. **Hackathon:** Build on Canton (Encode Club). **Track:** 1 — Private DeFi & Capital Markets. **Differentiator:** an AI-agent solver.

---

## 0. Read this first — how to use this document

You (Claude Code) are building a complete, demoable hackathon project from this spec. **Every product, technical, and scenario decision has already been made and is written below. Do not ask the human for clarification — build exactly what is specified.** If a detail is genuinely missing, choose the simplest option consistent with the rest of the spec and note it in a `DECISIONS.md` file.

Build in the phases in §17. Aim for a working end-to-end vertical slice (one order from each of three desks → one cleared price → one atomic settlement, with each desk seeing only its own data) **before** polishing. The visual "privacy money shot" (three desks side-by-side, each blind to the others, clearing at one price) is the single most important thing to get working — it is what wins the hackathon.

### Decisions already made (do NOT ask)
- **What we trade:** one tokenized bond, symbol `BONDX`, against tokenized cash `USDCx`. Prices are quoted in USDCx per unit of BONDX.
- **Parties (5):** `Operator` (the venue: runs the auction, hosts the AI solver, custodies tokenized assets for the MVP), and three trading desks — `BankA` = "BlueRock Capital", `BankB` = "Meridian Asset Management", `BankC` = "Halward Securities". All firm names are fictional.
- **Auction type:** sealed-bid, uniform-price **call auction** (one clearing price for the whole batch). Not a continuous order book.
- **Round window:** 60 seconds (config `ROUND_SECONDS`, default 60).
- **Canonical demo fixture** (used in setup, tests, and the live demo): see §4. It must clear at **$100.00**.
- **Stack:** Daml + Canton for the ledger; React + TypeScript + Vite + Tailwind for the frontend; a Node/TypeScript off-ledger "solver service"; Anthropic Claude API for the AI-agent layer. See §6.
- **Privacy model:** each desk can see only its own orders, holdings, and fills. The pre-clear batch shows only a *count* of sealed orders, never their contents. Enforced by Daml signatory/observer disclosure (and, on Canton, sub-transaction privacy across participant nodes). See §10.
- **Money shot:** a three-up split screen proving desks are blind to each other, plus a single-transaction atomic settlement. Build it.

---

## 1. Product overview

**Umbra is a private, sealed-bid batch-auction venue for tokenized securities, settled atomically on Canton, with an AI agent acting as the auction solver.**

Institutions submit sealed limit orders for a tokenized asset during a short window. No one — not rival desks, not the public — can see anyone else's orders. When the window closes, an **AI solver agent** computes the single **uniform clearing price** that maximizes matched volume, matches buyers directly against sellers (coincidence of wants), and the entire batch **settles delivery-versus-payment (DvP) atomically in one transaction**. Each desk then sees only its own fills.

**Why it can only work well on Canton:** on transparent chains, order privacy must be bolted on (off-chain order books, ZK) and MEV must be fought. On Canton there is no public mempool and contracts are private to their stakeholders by construction, so sealed-bid auctions are native, and Daml settlement is atomic by default. **The pitch line:** *"Cantex is a continuous private order book; Umbra is the sealed-bid batch auction that gives institutions one provably fair clearing price with zero information leakage — cleared by an AI agent and settled atomically."*

**Non-goals (explicitly out of scope):** multi-asset cross-auctions; real fiat; KYC onboarding flows; production key management; mainnet deployment; order cancellation/replace (a desk submits once per round in the MVP); continuous trading.

---

## 2. Glossary
- **Call auction / batch auction:** orders collected over a window and cleared together at one price, instead of matched continuously.
- **Uniform clearing price (p\*):** the single price at which every trade in the batch executes.
- **Coincidence of wants (CoW):** a buyer matched directly against a seller, no intermediary/market-maker spread.
- **DvP (delivery-versus-payment):** the asset leg and the cash leg settle together or not at all.
- **Sealed order:** an order visible only to its submitter and the Operator until clearing.
- **Solver:** the agent that computes p\* and the allocation. Here it is an AI agent whose proposal is verified against deterministic rules.
- **Sub-transaction privacy (Canton):** each party sees only the parts of a transaction it is a stakeholder of.

---

## 3. The mechanism (what we are implementing)

A **sealed-bid uniform-price call auction**:
1. Operator opens a **round** for `BONDX` with a 60s window.
2. Each desk submits one **sealed order**: side (Buy/Sell), quantity (integer units), limit price (Decimal, USDCx/unit). Buys mean "willing to pay **up to** the limit"; sells mean "willing to receive **at least** the limit."
3. Window closes. No new orders.
4. The **solver** computes the uniform clearing price `p*` that **maximizes matched volume**, then allocates fills (§8).
5. The batch **settles atomically** (§10): asset and cash holdings are reassigned in one transaction; per-desk `TradeConfirmation`s are issued.
6. Each desk sees its own fills and updated balances. Unfilled quantity simply expires (MVP).

---

## 4. Canonical demo fixture (single source of truth)

Used by the setup script (§14), the Daml Script tests (§16), and the live demo. **These exact numbers must clear at $100.00.**

### Parties & initial holdings
| Party | Display name | BONDX | USDCx | Role in demo |
|---|---|---:|---:|---|
| `Operator` | Umbra Venue | — | — | venue, solver, custodian |
| `BankA` | BlueRock Capital | 0 | 5,000 | buyer |
| `BankB` | Meridian Asset Management | 20 | 1,000 | seller |
| `BankC` | Halward Securities | 15 | 1,000 | seller |

### Orders submitted this round
| Desk | Side | Qty | Limit (USDCx/BONDX) |
|---|---|---:|---:|
| BankA | Buy | 10 | ≤ 101 |
| BankB | Sell | 8 | ≥ 99 |
| BankC | Sell | 5 | ≥ 100 |

### Expected result (assert these in tests)
- **Clearing price p\*** = **100.00** (see §8 for why: max matched volume = 10 units; tie between 100 and 101 broken to the lower price).
- **Fills:** BankA buys 10; BankB sells 8 (fully, price-priority since its limit 99 < 100); BankC sells 2 (of 5); BankC residual 3 **unfilled**.
- **Settled balances after the atomic DvP:**
  | Party | BONDX | USDCx |
  |---|---:|---:|
  | BankA | 10 | 4,000 |
  | BankB | 12 | 1,800 |
  | BankC | 13 | 1,200 |
- **Cash check:** A pays 10×100 = 1,000; B receives 8×100 = 800; C receives 2×100 = 200. Conserved.
- **Privacy assertions:** a JSON-API query as `BankA` returns BankA's order and confirmation but **zero** of BankB's or BankC's orders; same symmetrically. Pre-clear, the round exposes only `sealedOrderCount = 3`.

---

## 5. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + TS + Vite + Tailwind)                            │
│  • Desk views (A/B/C) — order ticket, own orders, own holdings     │
│  • 3-up Privacy view (the money shot)                              │
│  • Auction theatre — countdown, sealed count, clearing reveal      │
│  • Solver Agent panel — AI rationale, supply/demand crossing       │
│  • Settlement ledger — atomic DvP, before/after balances           │
│        │ uses @daml/react + @daml/ledger (generated bindings)      │
│        ▼ HTTP JSON API (localhost:7575)                            │
├────────────────────────────────────────────────────────────────────┤
│  LEDGER (Daml on Canton sandbox / LocalNet)                        │
│  Templates: Venue, Round, Order, Asset, TradeConfirmation,         │
│             ClearingProposal  (see §7)                             │
├────────────────────────────────────────────────────────────────────┤
│  SOLVER SERVICE (Node + TS, runs as `Operator`)                    │
│  • watches Rounds, enforces the 60s window                         │
│  • reads sealed Orders (Operator is a stakeholder)                 │
│  • computes p* deterministically (§8)                              │
│  • AI layer: Claude proposes/explains/competes (§9)                │
│  • submits Clear + atomic Settle via Ledger API                    │
│        │ @anthropic-ai/sdk (server-side only)                      │
└────────────────────────────────────────────────────────────────────┘
```

Data flow: desks `SubmitOrder` → solver service detects window close → computes/clears → exercises `Clear` (atomic settlement) → frontends reactively update via the JSON API streaming/queries.

---

## 6. Tech stack, versions, and how to run

### Ledger / Daml
- **Primary path (fast iteration):** Daml SDK with the `create-daml-app`-style scaffold and `daml start` (builds Daml, generates JS bindings, runs the sandbox + HTTP JSON API). Use the installed Daml SDK; if none, install the latest stable via `https://docs.daml.com`. Pin the version in `daml.yaml`.
- **Canton path (deploy target / stretch, §19):** Digital Asset's **`cn-quickstart`** (`github.com/digital-asset/cn-quickstart`) which runs a Dockerized **LocalNet** simulating Canton (validators, super validator, CC wallet). Use this for the "it runs on Canton" claim once the app works locally.
- **Version note:** Daml 2.x exposes the HTTP JSON API used by `@daml/react`; Daml 3.x / Canton 3.x uses the JSON Ledger API v2 and `cn-quickstart`. **Detect the installed SDK and adapt import paths from the official docs.** Keep all Daml templates standard (templates/choices/interfaces) so they compile on either line. Record the version you used in `DECISIONS.md`.

### Frontend
- React 18 + TypeScript + **Vite** + **Tailwind CSS**.
- `@daml/react`, `@daml/ledger`, and the generated `@daml.js` bindings (`daml codegen js`).
- Charts: hand-rolled **SVG** for the supply/demand crossing (no heavy chart lib needed); small helpers only.
- Visual direction: **see `frontend-design-prompt.md`** (Swiss + Postmodern). This spec defines *what* the screens do; that file defines *how they look*.

### Solver service
- Node 20 + TypeScript. Connects to the ledger as `Operator` via `@daml/ledger` (JSON API) — or gRPC Ledger API on the Canton path.
- `@anthropic-ai/sdk` for the AI-agent layer. **API key via `ANTHROPIC_API_KEY` env var only — never in the frontend, never committed.**

### Ports & commands (defaults)
- JSON API: `7575`. Frontend dev: `5173`. Solver service: `4000`.
- Root scripts (provide a `Makefile` and `package.json` scripts):
  - `make ledger` → `daml start` (or `make start` for cn-quickstart).
  - `make setup` → run the Daml Script in §14 to allocate parties + seed holdings.
  - `make solver` → start the solver service.
  - `make web` → start the Vite dev server.
  - `make demo` → orchestrates the above + opens the 3-up view. Document everything in `README.md`.

---

## 7. Daml data model

Implement in `daml/Umbra/` (modules: `Asset.daml`, `Auction.daml`, `Roles.daml`, `Setup.daml`, `Tests.daml`). Field types are Daml. **Authority/privacy rationale is given for each — preserve it.**

### 7.1 `Asset` — operator-custodied tokenized holding
```
template Asset
  with
    operator : Party        -- sole signatory & custodian (MVP simplification)
    owner    : Party        -- the beneficial owner (observer)
    symbol   : Text         -- "BONDX" | "USDCx"
    quantity : Decimal      -- >= 0
  where
    signatory operator
    observer owner
    ensure quantity >= 0.0
    -- choices used only by Operator inside settlement (see Round.Clear):
    -- Split, Merge, Reassign(newOwner). Operator authority alone suffices.
```
*Privacy:* an `Asset` is visible only to `operator` + its `owner`, so desks never see each other's balances. *Why operator-custody:* it removes multi-party authority puzzles for the MVP. The production upgrade uses **Daml Finance** holdings with real custodians and the allocate/approve settlement flow (§19).

### 7.2 `Venue` — the role contract that lets desks submit sealed orders
```
template Venue
  with
    operator : Party
    desks    : [Party]          -- [BankA, BankB, BankC]
  where
    signatory operator
    observer desks
    nonconsuming choice SubmitOrder : ContractId Order
      with
        desk      : Party
        roundId   : Text
        side      : Side        -- data Side = Buy | Sell
        quantity  : Int         -- > 0
        limit     : Decimal     -- > 0
      controller desk
      do
        assertMsg "desk not registered" (desk `elem` desks)
        create Order with
          operator; desk; roundId; side; quantity; limit
          status = Sealed
```
*Privacy:* the choice runs under `operator` authority (Venue signatory) **and** `desk` authority (controller), so the created `Order` is signed by both and observed by neither of the other desks. Other desks observe the `Venue` (so they can submit) but **not** the `Order`s it creates.

### 7.3 `Order` — a sealed limit order
```
data Side = Buy | Sell deriving (Eq, Show)
data OrderStatus = Sealed | Filled | PartiallyFilled | Unfilled deriving (Eq, Show)

template Order
  with
    operator : Party
    desk     : Party
    roundId  : Text
    side     : Side
    quantity : Int
    limit    : Decimal
    status   : OrderStatus
  where
    signatory operator, desk     -- both; unforgeable, and private to these two
    ensure quantity > 0 && limit > 0.0
```
*Privacy:* stakeholders are exactly `operator` + `desk`. **No other desk can see it.** This is the core of the money shot.

### 7.4 `Round` — the auction round (the thing the solver acts on)
```
data RoundStatus = Open | Closed | Cleared | Settled deriving (Eq, Show)

template Round
  with
    operator      : Party
    roundId       : Text
    symbol        : Text          -- "BONDX"
    desks         : [Party]
    openedAt      : Time
    windowSeconds : Int           -- 60
    status        : RoundStatus
  where
    signatory operator
    observer desks                -- desks see the round + status + (later) count, never contents
    -- Operator-only automation choices:
    choice CloseRound : ContractId Round            -- after the window
    choice Clear : ClearResult                      -- THE atomic settlement choice (see §10)
      with
        clearingPrice : Decimal
        allocations   : [Allocation]                -- solver output, verified on-ledger
      controller operator
      -- body: re-verify the allocation against the sealed orders & holdings,
      --       reassign Assets (DvP) and emit TradeConfirmations — all in ONE transaction.
```
The frontend reads `Round` to render status and `sealedOrderCount` (computed as the number of `Order`s for the round visible to `operator`; desks see the *count* via a published `RoundStats` contract — see below — never the orders).

### 7.5 `RoundStats` — the only pre-clear info desks may see
```
template RoundStats
  with
    operator : Party
    roundId  : Text
    desks    : [Party]
    sealedOrderCount : Int     -- count ONLY, no contents
  where
    signatory operator
    observer desks
```
Operator updates this as orders arrive so every desk sees "3 sealed orders" without seeing any order.

### 7.6 `TradeConfirmation` — each desk's private fill receipt
```
template TradeConfirmation
  with
    operator      : Party
    desk          : Party
    roundId       : Text
    symbol        : Text
    side          : Side
    filledQty     : Int
    clearingPrice : Decimal
    cashMoved     : Decimal
  where
    signatory operator
    observer desk         -- visible only to this desk
```

### 7.7 `Allocation` (plain data, the solver's verified output)
```
data Allocation = Allocation with
  desk      : Party
  side      : Side
  filledQty : Int
```

---

## 8. The clearing algorithm (deterministic core — must be exact)

Implemented twice for safety: in **TypeScript** in the solver service (to drive the AI + UI) and re-verified inside the Daml **`Round.Clear`** choice (so a wrong/malicious solver proposal is rejected on-ledger). Same logic, same result.

**Inputs:** sealed orders for the round → `buys: {qty, limit}[]`, `sells: {qty, limit}[]`.

**Step 1 — candidate prices:** the sorted set of all distinct limit prices appearing in buys ∪ sells.

**Step 2 — for each candidate price `p`:**
- `demand(p)` = Σ qty of buys with `limit ≥ p`
- `supply(p)` = Σ qty of sells with `limit ≤ p`
- `matched(p)` = `min(demand(p), supply(p))`

**Step 3 — choose `p*`:** the price maximizing `matched(p)`. **Tie-breaks, in order:** (a) minimize `|demand(p) − supply(p)|`; (b) if still tied, choose the **lower** price (conservative/buyer-favorable and reproducible). Round `p*` to 2 decimals.

**Step 4 — allocation at `p*`:** eligible buys = buys with `limit ≥ p*`; eligible sells = sells with `limit ≤ p*`. `traded = matched(p*)`. The **short side fills fully**; the **long side is rationed by price priority** (most aggressive first: lowest-limit sells, or highest-limit buys), then **pro-rata** for ties, with integer rounding that never exceeds `traded` (give leftover unit(s) to the largest order; document the rule).

**Step 5 — output:** `clearingPrice = p*`, and an `Allocation[]` (each desk's `filledQty` and side). Unfilled = order qty − filled.

### Worked example (must match §4)
Buys: A{10, 101}. Sells: B{8, 99}, C{5, 100}. Candidate prices {99, 100, 101}.
- p=99: demand=10 (A: 101≥99), supply=8 (B: 99≤99; C: 100≤99? no) → matched 8.
- p=100: demand=10 (A: 101≥100), supply=13 (B+C) → matched 10.
- p=101: demand=10, supply=13 → matched 10.
Max matched = 10 at {100, 101}; tie-break (a) imbalance equal (3 vs 3); tie-break (b) lower price → **p\*=100**. Allocation: traded=10, short side = buys (10) fills fully → A buys 10. Long side = sells (13) rationed by price priority: B (limit 99, most aggressive) fills 8; C fills remaining 2; C residual 3 unfilled. ✔ matches §4.

---

## 9. The AI solver agent (the differentiator)

The clearing **answer** is deterministic (§8). The **AI layer** makes it a HackCanton-thesis "autonomous agent in institutional DeFi" without risking correctness:

1. **Agent framing:** the solver service runs an autonomous "Solver Agent" that, when a round closes, ingests the sealed batch and **proposes** a clearing (price + allocation) by calling Claude (`@anthropic-ai/sdk`) with a structured prompt (the orders, the rules from §8, output as strict JSON).
2. **Verify, don't trust:** the service recomputes the deterministic result (§8) and **only submits an allocation that passes verification**; the on-ledger `Round.Clear` choice **re-verifies** again (max-volume + conservation + limit compliance) and rejects anything inconsistent. So the AI can never produce a wrong/unfair clear — the ledger is the backstop.
3. **Competing solvers (stretch, §19):** run N agent instances (e.g., different prompts/temperatures or strategies); each returns a candidate; rank by `matched volume`, then `price improvement`; the best wins. Show the competition in the UI.
4. **Explanation:** Claude returns a 2–3 sentence natural-language rationale ("Cleared at 100.00: maximizes matched volume at 10 units; Meridian filled first on price priority…") for the **Solver Agent panel**. This is the demo's "wow" narration.

**Prompt contract (document in `solver/PROMPT.md`):** system prompt states the auction rules verbatim; user message provides the batch as JSON; require a JSON response `{ clearingPrice, allocations: [...], rationale }`. Temperature 0 for the canonical agent. Never let the model's number be used unverified.

---

## 10. Atomic settlement & privacy (the two things judges check)

### Atomic DvP
All settlement happens inside the single `Round.Clear` transaction. In one transaction the Operator:
1. re-verifies the proposed `allocations` against the sealed `Order`s and current `Asset` balances (limits respected, cash and asset conservation, no overdraw);
2. **reassigns `Asset`s**: split/merge as needed and move BONDX from sellers→buyer and USDCx from buyer→sellers at `p*`;
3. archives the round's `Order`s (or marks them Filled/Partial/Unfilled);
4. creates a `TradeConfirmation` per participating desk;
5. sets `Round.status = Settled`.

Because it is one Daml transaction, it is **atomic by construction** — if any leg fails (e.g., insufficient holding), the whole thing rolls back. That is the DvP guarantee. (Production upgrade: Daml Finance `Batch`/`Instruction` with allocate/approve — §19.)

### Privacy (build a test for each, §16)
- An `Order` is visible only to `operator` + `desk`. Query the JSON API as BankA → see only A's order. As BankB → only B's. **No cross-visibility.**
- Pre-clear, desks see only `RoundStats.sealedOrderCount`, never contents.
- A `TradeConfirmation` is visible only to its `desk`. BankA cannot see BankB's fill.
- `Asset`s are visible only to owner + operator.
On Canton (LocalNet), these guarantees are enforced across **separate participant nodes** via sub-transaction privacy; on the dev sandbox they hold via Daml's disclosure rules. Demo on whichever is running; claim the Canton property and show it via the per-party queries.

---

## 11. Solver service (off-ledger) — responsibilities & shape

Directory `solver/`. Runs as `Operator`. Responsibilities:
- **Round lifecycle:** create/open a `Round`, maintain `RoundStats.sealedOrderCount`, enforce the 60s window, `CloseRound`.
- **Clear:** on close, read sealed orders → AI propose (§9) → verify (§8) → exercise `Round.Clear`.
- **HTTP API for the frontend** (Express, port 4000) so the UI can drive the demo without ledger-admin rights:
  - `POST /round` → open a new round (returns roundId).
  - `GET /round/:id` → status, sealedOrderCount, and (after clear) clearingPrice + aggregate matched volume + supply/demand curve points + solver rationale.
  - `POST /round/:id/close` → force-close (so the demo doesn't wait 60s).
  - `GET /round/:id/solve-preview` → run the AI solver and return its proposal + rationale **without** settling (for the "watch the agent think" moment), then `POST /round/:id/settle` to commit.
- **Never expose** the Anthropic key or Operator credentials to the browser; the browser talks to this service and to the JSON API as individual desk parties only.

---

## 12. Frontend — functional requirements

React SPA. **Look & feel: follow `frontend-design-prompt.md` exactly.** Functionally it must deliver:

### 12.1 Global
- **Party switcher** (top bar): impersonate `BankA`, `BankB`, `BankC`, or `Operator`. Each uses that party's JSON-API token so the UI literally cannot fetch other desks' private data — privacy is real, not faked. (Use the dev `daml start` party tokens / JSON API auth; document in README.)
- Round status indicator (Open · Closed · Cleared · Settled) + live countdown.

### 12.2 Desk view (BankA/B/C)
- **Order ticket:** Side toggle (Buy/Sell), Quantity (int), Limit price (decimal), Submit (→ `Venue.SubmitOrder`). One order per round (disable after submit). Pre-fill the §4 fixture values per desk via a "load demo order" affordance.
- **Your order:** shows your sealed order + status. Shows nothing about others.
- **Your holdings:** BONDX & USDCx live (from your `Asset`s).
- **After settlement:** your `TradeConfirmation` (filled qty, clearing price, cash moved) and updated holdings.

### 12.3 Privacy view (the money shot) — **flagship screen**
- Three desk panels **side by side** (A | B | C), each rendered with that desk's own credentials, so each panel can only ever show that desk's order. A center column shows the **shared** `RoundStats` ("3 sealed orders") — proving the venue sees a count, not contents. Visually emphasize the blindness (redaction motif on the "other" columns). This is what you screenshot for the pitch.

### 12.4 Auction theatre (Operator)
- Countdown ring for the 60s window; live `sealedOrderCount`.
- "Close & Solve" → triggers `solve-preview`: show the **Solver Agent panel** computing, then reveal the **uniform clearing price** as a hero moment.
- **Supply/demand crossing chart** (hand-rolled SVG): step demand curve (down) and supply curve (up); mark `p*` where matched volume is maximized; annotate matched = 10.
- "Settle atomically" → `settle`; play the **atomic settlement animation** (all legs snap simultaneously); show before/after balances.

### 12.5 Solver Agent panel
- Streams/render the agent's rationale (from Claude). If competing solvers (stretch), show candidates and the winner by matched volume / price improvement.

### 12.6 Settlement ledger
- The cleared trades as DvP legs (A↔B: 8 @100; A↔C: 2 @100), each a paired asset+cash arrow; a single "one transaction" badge; before/after balances per desk (but each desk, in its own view, sees only its own).

---

## 13. Project structure
```
umbra/
  daml/
    daml.yaml
    Umbra/Asset.daml  Auction.daml  Roles.daml  Setup.daml  Tests.daml
  solver/                 # Node + TS service (runs as Operator)
    src/index.ts  auction.ts(clearing algo)  agent.ts(Claude)  ledger.ts  api.ts
    PROMPT.md
  web/                    # React + TS + Vite + Tailwind
    src/ (App, components, daml.js bindings, views per §12)
    tailwind.config.ts    # implements the design tokens from frontend-design-prompt.md
  scripts/  Makefile  README.md  DECISIONS.md  .env.example
```

---

## 14. Setup script (exact — Daml Script `Setup.daml`)
Allocate parties `Operator, BankA, BankB, BankC`. Create one `Venue{operator, desks=[A,B,C]}`. Mint the §4 holdings as `Asset`s: A→5,000 USDCx; B→20 BONDX + 1,000 USDCx; C→15 BONDX + 1,000 USDCx. Expose party IDs/tokens to the frontend and solver (write to `.env`/a generated `parties.json`). Provide a second script `RunCanonicalRound` that submits the three §4 orders and clears, used by tests and as a one-command demo seed.

---

## 15. Configuration & secrets
`.env` (gitignored; ship `.env.example`): `ANTHROPIC_API_KEY=`, `JSON_API_URL=http://localhost:7575`, `SOLVER_PORT=4000`, `ROUND_SECONDS=60`, `PRODUCT_NAME=Umbra`, plus generated party IDs/tokens. The key is read only by `solver/`. The frontend gets only desk tokens + the solver URL.

---

## 16. Testing & acceptance criteria

**Daml Script tests (`Tests.daml`) — must pass:**
1. `test_clears_at_100`: run the §4 fixture → assert `clearingPrice == 100.0`, fills A=10/B=8/C=2, C residual 3.
2. `test_settled_balances`: assert post-settlement balances exactly match §4 (A:10/4000, B:12/1800, C:13/1200).
3. `test_atomicity`: a round where a seller lacks the asset → `Clear` fails and **no** balances change (all-or-nothing).
4. `test_privacy_orders`: assert `BankA` is **not** a stakeholder of BankB's `Order` (query visibility) and vice-versa.
5. `test_privacy_confirmations`: each `TradeConfirmation` is observed only by its desk.
6. `test_clear_rejects_bad_allocation`: an allocation that violates max-volume/limits/conservation is rejected by `Round.Clear`.

**TypeScript unit tests (solver):** the clearing algorithm on ≥5 scenarios incl. exact ties, all-or-nothing imbalance, no-cross (no match), and the §4 case.

**E2E acceptance (the demo must show):** three desks submit blind → 3-up view proves no cross-visibility → solver reveals **100.00** with rationale → one-click atomic settle → each desk sees only its own fill; Operator sees the aggregate. Privacy verified live by switching parties.

> Add a final **verification pass**: run all Daml + TS tests, then manually execute the E2E script and capture screenshots of (a) the 3-up blindness and (b) the atomic settlement, into `docs/`. These screenshots are the pitch.

---

## 17. Build milestones (phased — do in order)
1. **Skeleton:** Daml project compiles; `Asset`, `Venue`, `Order`, `Round`, `RoundStats`, `TradeConfirmation`; `Setup.daml` seeds §4; `daml start` runs.
2. **Clear & settle on-ledger:** implement `Round.Clear` (verify + atomic DvP + confirmations); pass tests 1–3.
3. **Privacy proof:** wire party-scoped JSON API; pass tests 4–5; build the **3-up Privacy view**.
4. **Solver service:** window lifecycle, deterministic clearing, exercise `Clear`; HTTP API; TS unit tests.
5. **AI agent layer:** Claude proposes + explains; verify-don't-trust; Solver Agent panel.
6. **Auction theatre + settlement animation + supply/demand chart.**
7. **Polish to the design spec; capture screenshots; write README + 3-min demo script.**
8. **Stretch (§19) as time allows.**

Ship a working vertical slice by end of phase 3 even if everything after is rough.

---

## 18. Risks & mitigations
- **Daml/Canton version drift:** detect installed SDK; keep templates standard; record version. If `cn-quickstart` is heavy (8GB Docker), build on `daml start` first and treat LocalNet as deploy-time.
- **Authority/privacy bugs:** the operator-custody model (§7.1) sidesteps multi-party authority; keep it for the MVP.
- **AI nondeterminism:** never use the model's numbers unverified; deterministic core + on-ledger re-verification are the source of truth (§9).
- **Overscope:** order cancel/replace, multi-asset, real Daml Finance settlement are all stretch — do not start them before phase 7.

---

## 19. Stretch goals (only after phase 7)
- **Daml Finance settlement:** replace operator-custody `Asset` with Daml Finance `Holding`/`Instrument`/`Account` and settle via `Batch`/`Instruction` (allocate/approve) for a production-grade DvP story.
- **Canton LocalNet:** deploy the DAR to `cn-quickstart` LocalNet; run desks on separate participant nodes to demonstrate true cross-node sub-transaction privacy; settle cash in real `USDCx`/CC.
- **Competing AI solvers:** N agents, ranked by matched volume / price improvement, shown racing in the UI.
- **Residual routing:** route unfilled residual (C's 3 units) to a mock on-network liquidity venue ("→ Cantex").
- **Multiple rounds / order cancel-replace.**

---

## 20. Definition of done & 3-minute demo script
**Done =** all §16 tests pass; the E2E acceptance runs; README lets a stranger run `make demo`; screenshots captured.

**Demo (180s):**
1. (20s) "Three institutions, one tokenized bond. Watch what each can see." Open the 3-up Privacy view.
2. (40s) Each desk submits its sealed order. Point: the venue shows "3 sealed orders" — **contents invisible**, even to us.
3. (40s) Close the round. The **AI Solver Agent** computes and narrates: "Clears at 100.00, 10 units matched, Meridian filled first on price priority." Show the supply/demand crossing.
4. (40s) One click → **atomic DvP settlement**; all legs snap at once; balances update.
5. (40s) Switch parties: BlueRock sees only its 10-unit fill; Meridian only its 8; Halward its 2 + residual. "One fair price, zero information leakage, atomic settlement — native to Canton. Cantex is a continuous private book; **Umbra is the sealed-bid batch auction with an AI solver.**"

---

## 21. References (consult for exact, current APIs)
- Daml docs: `https://docs.daml.com` — app architecture, `create-daml-app`, JSON API, `@daml/react`, `@daml/ledger`, `daml codegen js`, Daml Script.
- Daml Finance: `https://docs.daml.com/daml-finance` — Holding/Instrument/Account, Settlement (Batch/Instruction, allocate/approve), DvP.
- Canton quickstart: `https://github.com/digital-asset/cn-quickstart` and `https://docs.digitalasset.com/build` (LocalNet, `make setup/build/start`).
- Canton developer resources: `https://www.canton.network/developer-resources`.
- Anthropic SDK: `https://docs.claude.com` — `@anthropic-ai/sdk`, structured/JSON output.
