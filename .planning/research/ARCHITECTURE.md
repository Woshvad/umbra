# Architecture Research

**Domain:** Daml-on-Canton sealed-bid batch-auction venue (privacy-native DeFi) with off-ledger AI solver service + React frontend
**Researched:** 2026-06-25
**Confidence:** HIGH (core Daml app architecture, JSON-API token auth, @daml/react, daml start, cn-quickstart all verified against docs.daml.com + the cn-quickstart repo; only minor version-drift items are MEDIUM)

> This document grounds the architecture **already specified** in `spec.md` §5/§7/§11/§13/§17 against current, idiomatic Daml conventions. It does **not** invent a new architecture — it confirms the spec's design is the standard `create-daml-app` shape plus an off-ledger automation service, and pins down the load-bearing details (especially per-party token auth, which is what makes the privacy "real, not faked").

---

## Standard Architecture

Umbra is the canonical **three-tier Daml application** (ledger ↔ HTTP JSON API ↔ `@daml/react` frontend) — exactly the `create-daml-app` shape — with **one addition the spec mandates**: an off-ledger Node/TS **solver service** that holds `Operator` authority, runs the auction clock + AI, and exposes its own HTTP API to the browser. This "off-ledger automation as a privileged party" pattern is the standard Daml way to run autonomous backend logic (it is what Daml's own Trigger/automation guidance and create-daml-app's bot pattern describe).

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (React 18 + TS + Vite + Tailwind)                  :5173        │
│  5 views: 01 Privacy(3-up) · 02 Desk · 03 Theatre · 04 Solver · 05 Settle  │
│                                                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ DamlLedger │ │ DamlLedger │ │ DamlLedger │ │ DamlLedger │  one provider │
│  │  party=A   │ │  party=B   │ │  party=C   │ │ party=Op   │  per identity │
│  │  token=Atk │ │  token=Btk │ │  token=Ctk │ │ token=Optk │              │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘              │
│        │ @daml/react (useStreamQueries / useLedger)  │                     │
│        │   reactive contract sets, scoped BY TOKEN   │ fetch()→ solver API │
└────────┼─────────────────────────────────────────────┼────────────────────┘
         │ HTTP + WebSocket  JSON API                   │ HTTP (Express)
         ▼  :7575                                       ▼  :4000
┌─────────────────────────────────┐        ┌────────────────────────────────┐
│  HTTP JSON API SERVICE          │        │  SOLVER SERVICE (Node 20 + TS)  │
│  (started by `daml start`)      │◄───────┤  runs AS Operator               │
│  - decodes JWT → actAs party    │ JSON   │  - round lifecycle + 60s window │
│  - returns ONLY contracts that  │ API    │  - watch Round/Order/RoundStats │
│    party is a stakeholder of    │ as Op  │  - AI propose (Claude)          │
│  - query + WebSocket streaming  │        │  - verify (§8) → exercise Clear │
└────────────────┬────────────────┘        │  - Express API for the browser  │
                 │ gRPC Ledger API          │  @anthropic-ai/sdk (key here)   │
                 ▼                          └────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│  LEDGER  (Daml on Canton sandbox via `daml start`; LocalNet = stretch)      │
│  Templates: Venue · Order · Round · RoundStats · Asset · TradeConfirmation  │
│  Choice Round.Clear = the single atomic DvP transaction (re-verifies §8)    │
│  Disclosure (signatory/observer) = the privacy boundary                     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility (what it owns) | Implementation |
|-----------|-------------------------------|----------------|
| **Daml ledger** | Source of truth: state, authority, privacy (disclosure), and atomicity. `Round.Clear` re-verifies §8 and does the all-or-nothing DvP. | `daml/Umbra/*.daml` templates + choices, compiled to a DAR, run on the `daml start` sandbox (Canton-compatible). |
| **HTTP JSON API** | Translates REST/WebSocket ↔ gRPC Ledger API; decodes the JWT to learn the acting party; returns only that party's stakeholder contracts. **This is the privacy enforcement point at the wire.** | Bundled binary, launched by `daml start` on `:7575`. No app code. |
| **Solver service** | The only `Operator`-authority actor outside Daml Script. Owns the auction clock, AI calls, deterministic verification, and the browser-facing Express API. Holds the Anthropic key + Operator token. | `solver/`: `ledger.ts` (JSON API client as Operator), `auction.ts` (§8), `agent.ts` (Claude), `api.ts` (Express :4000), `index.ts` (poll loop / window timer). |
| **Frontend** | 5 views; one `DamlLedger` context per impersonated identity, each with that identity's token → genuinely cannot read other desks' data. Drives the demo by calling the solver's Express API (no ledger-admin rights in the browser). | `web/`: React + Vite + Tailwind, `@daml/react` + generated `@daml.js` bindings. |
| **Setup (Daml Script)** | Allocate parties, create `Venue`, mint §4 `Asset` holdings; write `parties.json` / `.env`. A second script runs the canonical round for tests + seed. | `daml/Umbra/Setup.daml` + `Tests.daml`, run via `daml script`. |

---

## Recommended Project Structure

Matches spec §13 exactly; this is the standard create-daml-app monorepo plus a `solver/`:

```
umbra/
├── daml.yaml                  # SDK version pin, dependencies, codegen config
├── daml/
│   └── Umbra/
│       ├── Asset.daml         # operator-custodied holding + Split/Merge/Reassign
│       ├── Auction.daml       # Venue, Order, Round, RoundStats, Allocation, Clear
│       ├── Roles.daml         # party/role helpers (optional thin module)
│       ├── Setup.daml         # Daml Script: allocate parties, mint §4 holdings
│       └── Tests.daml         # Daml Script tests 1–6 (§16)
├── solver/                    # Node 20 + TS — runs AS Operator
│   ├── src/
│   │   ├── index.ts           # boot: poll loop + 60s window timer
│   │   ├── ledger.ts          # JSON API client (Operator token), query/exercise
│   │   ├── auction.ts         # deterministic clearing algorithm (§8)
│   │   ├── agent.ts           # Claude proposal + rationale (@anthropic-ai/sdk)
│   │   └── api.ts             # Express :4000 (round, close, solve-preview, settle)
│   ├── PROMPT.md              # the agent's system/user prompt contract (§9)
│   └── package.json
├── web/                       # React + TS + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx            # party switcher → selects token+party for DamlLedger
│   │   ├── daml.js/           # generated @daml.js bindings (daml codegen js)
│   │   ├── ledger/            # DamlLedger wrappers, token + party config
│   │   ├── api/               # typed client for the solver's Express API
│   │   └── views/             # 01-privacy 02-desk 03-theatre 04-solver 05-settle
│   ├── tailwind.config.ts     # design tokens from Umbra design comp
│   └── package.json
├── scripts/                   # parties.json/.env generation, demo orchestration
├── Makefile                   # make ledger | setup | solver | web | demo
├── README.md  DECISIONS.md  .env.example
```

### Structure Rationale

- **`daml/Umbra/` split by concern, not by template count.** `Asset.daml` is the holding model; `Auction.daml` carries the lifecycle (`Venue`/`Order`/`Round`/`RoundStats` + the `Clear` choice + `Allocation` data) because they are mutually referencing and `Clear` needs all of them in scope. `Setup.daml`/`Tests.daml` are kept separate so test/seed scripts never ship in the runtime DAR's "interesting" surface. This is the idiomatic module-per-bounded-context layout.
- **`solver/` is a peer of `daml/` and `web/`, not nested under either.** It is a *different trust domain*: it alone holds Operator authority and the Anthropic key. Keeping it a top-level package makes the boundary obvious and lets it be deployed/secured independently.
- **`web/src/daml.js/` (generated) is committed-or-gitignored per team taste**, but is produced by `daml codegen js` (which `daml start` runs). Treat it as build output keyed to the DAR — regenerate whenever a template changes.
- **One `package.json` per JS package** (`solver/`, `web/`) rather than a forced workspace — the two share no runtime code (the §8 algorithm is intentionally re-implemented in Daml and TS separately for the verify-don't-trust backstop), so a workspace buys little for a hackathon.

---

## Architectural Patterns

### Pattern 1: Per-party `DamlLedger` context = privacy that is structurally real

**What:** `@daml/react`'s `DamlLedger` provider is configured with a `token` and a `party`. Every `useQuery`/`useStreamQueries`/`useLedger` call inside it routes to the JSON API carrying that token. The JSON API decodes the JWT, extracts the `actAs`/`readAs` party, and the Ledger API returns **only contracts that party is a stakeholder (signatory/observer) of**. There is no client-side filtering to bypass — a desk's browser context literally never receives other desks' `Order`s.

**When to use:** Always, here. The party switcher selects which identity's `(token, party)` pair feeds the active `DamlLedger`. The 3-up Privacy view mounts **three `DamlLedger` providers simultaneously** (A, B, C), each with its own token — so each column can only render its own data. That is the money shot, and it is enforced at the wire, not by UI conditionals.

**Trade-offs:** Requires real per-party tokens in dev (see Pattern 2). Slightly more wiring than a single shared connection, but that wiring *is* the demo's central claim.

**Example:**
```tsx
// web/src/ledger/PartyLedger.tsx
import DamlLedger from "@daml/react";

export function PartyLedger({ identity, children }: { identity: Identity; children: React.ReactNode }) {
  return (
    <DamlLedger
      token={identity.token}        // unsigned dev JWT for THIS party
      party={identity.party}        // e.g. "BankA::1220..."
      httpBaseUrl="http://localhost:7575/"
      wsBaseUrl="ws://localhost:7575/"   // WebSocket = reactive streaming
    >
      {children}
    </DamlLedger>
  );
}

// 3-up Privacy view: three providers, three tokens, true blindness
<div className="grid grid-cols-3">
  <PartyLedger identity={A}><DeskColumn /></PartyLedger>
  <PartyLedger identity={B}><DeskColumn /></PartyLedger>
  <PartyLedger identity={C}><DeskColumn /></PartyLedger>
</div>
```

### Pattern 2: Unsigned dev JWT per party, generated by Setup, surfaced via `parties.json`/`.env`

**What:** The `daml start` sandbox runs **without authorization**, but the JSON API **still requires a token on every request** (verified — HIGH confidence). For an unauthorized ledger you mint **unsigned** JWTs (jwt.io or a tiny library) whose payload is:
```json
{ "https://daml.com/ledger-api": {
    "ledgerId": "sandbox",
    "applicationId": "umbra",
    "actAs": ["BankA::1220abc..."]
} }
```
`actAs` (and/or `readAs`) is the party; that party scopes everything the token can see. **Build flow:** `Setup.daml` allocates the four parties (party IDs are generated/non-deterministic, so they must be captured at runtime), then a small Node/script step writes `scripts/parties.json` (party ID + minted token per identity). The web app imports tokens from there (or a generated `.env`); the solver reads only the `Operator` entry plus the Anthropic key.

**When to use:** This is the mandatory dev mechanism that makes per-party isolation honest. Do not hand the browser an Operator/admin token "for convenience" — that would silently break the privacy claim.

**Trade-offs:** Party IDs change every fresh allocation, so tokens must be regenerated whenever you re-run `make setup`. Acceptable; just never hard-code party IDs.

**Example (token minting helper):**
```ts
// scripts/mkToken.ts — unsigned dev token (sandbox has no auth)
import jwt from "jsonwebtoken";
export const devToken = (party: string) =>
  jwt.sign(
    { "https://daml.com/ledger-api": { ledgerId: "sandbox", applicationId: "umbra", actAs: [party] } },
    "secret",            // signature ignored by the unsecured sandbox
    { algorithm: "HS256" }
  );
// → write { BankA: {party, token}, ... , Operator:{...} } to parties.json
```
> **Version-drift note (MEDIUM):** the unsigned-token custom-claims format above is the Daml **2.x** JSON API path the spec targets. On the Canton **3.x** / cn-quickstart path the JSON Ledger API v2 expects **user tokens** and an IDP (Keycloak in cn-quickstart). Keep templates standard; record the SDK line you used in `DECISIONS.md` and adapt token minting from the docs for that line. This only matters at the LocalNet stretch.

### Pattern 3: Off-ledger automation as a privileged party (the solver service)

**What:** The solver is a long-running Node process that authenticates to the JSON API **as `Operator`** and acts as the auction's autonomous agent: it polls/streams `Round` + `Order` contracts (Operator is a stakeholder of all of them), enforces the 60s window with a timer, and on close runs AI-propose → deterministic-verify → `exerciseByKey`/`exercise` `Round.Clear`. It also fronts an **Express API on :4000** so the browser can *trigger* operator actions (open/close/solve-preview/settle) **without ever holding Operator credentials**. This is the standard "bot/automation reads via JSON API and submits choices" pattern; the Express layer is an app-specific façade so the demo isn't blocked on ledger-admin rights or the literal 60s wait.

**When to use:** Any time backend logic must run with an authority no end-user should hold (here: opening rounds, closing the window, and clearing). Keep the deterministic algorithm here *and* re-verified in `Round.Clear` — the ledger is the backstop against a buggy/malicious solver or a hallucinating model.

**Trade-offs:** Introduces a second backend port the frontend must know about. Worth it: it cleanly separates "things a desk may do" (submit an order, read own data — straight to JSON API as that party) from "things only the venue may do" (open/close/clear — via the solver's Express API).

**Example (Express façade → ledger exercise):**
```ts
// solver/src/api.ts (sketch)
app.post("/round/:id/settle", async (req, res) => {
  const orders = await ledger.queryAsOperator(Order, { roundId: req.params.id });
  const result = clear(orders);                 // §8 deterministic, source of truth
  const proposal = await proposeWithClaude(orders); // §9 AI, for rationale/UI
  assertMatches(result, proposal);              // verify-don't-trust
  await ledger.exercise(Round.Clear, roundCid, {
    clearingPrice: result.price, allocations: result.allocations,
  });                                           // ATOMIC DvP on-ledger (re-verified again)
  res.json({ price: result.price, rationale: proposal.rationale });
});
```

---

## Data Flow

### The end-to-end auction flow (submit → close → AI → verify → Clear → reactive UI)

```
DESK (browser, party=A token)                    SOLVER SERVICE (Operator)        LEDGER
   │ Venue.SubmitOrder ──────────────► JSON API ───────────────────────────────► create Order
   │   (as BankA; choice runs under                                               (sig: Op + BankA;
   │    Operator+desk authority)                                                   NO other desk sees it)
   │                                                  Operator updates RoundStats.sealedOrderCount ──►
   │ ◄─ useStreamQueries(RoundStats) reactively shows "3 sealed" (count only) ─────────────────────
   │
   │ Operator UI: POST /round/:id/close ──► solver (60s timer or force-close) ──► CloseRound
   │ Operator UI: GET  /solve-preview  ──► solver: read sealed orders ──► Claude proposes (§9)
   │                                        solver recomputes §8, verifies, returns {price, rationale}
   │ ◄─ Express JSON: clearingPrice + supply/demand points + rationale (NOT yet settled)
   │
   │ Operator UI: POST /round/:id/settle ─► solver: exercise Round.Clear ──────► ATOMIC TX:
   │                                                                              re-verify §8,
   │                                                                              reassign Assets (DvP),
   │                                                                              archive/mark Orders,
   │                                                                              create TradeConfirmation/desk,
   │                                                                              Round.status = Settled
   │ ◄─ ALL party DamlLedger contexts get a WebSocket push; each desk's
   │    useStreamQueries(TradeConfirmation, Asset) updates to show ONLY its own fill + new balances
```

### State management (frontend)

```
JSON API (WebSocket stream, scoped by token)
        ↓ push on every commit
useStreamQueries(Template) ──► reactive contracts[]  ──► React renders
        ↑ useLedger().exercise / create (writes go back through the same token)

Solver Express API (:4000)
        ↓ fetch() for round status, solve-preview, settle (operator-only actions)
local React state (round phase, countdown, AI rationale, S/D curve points)
```

Two read paths, deliberately: **ledger data** (orders, holdings, confirmations) comes reactively from the JSON API *as the acting party*; **orchestration/AI data** (round phase, rationale, supply/demand curve) comes from the solver's Express API. The atomic `Clear` is the synchronization point — after it commits, the JSON API stream pushes the new `TradeConfirmation`/`Asset` contracts to each party context automatically (no manual refetch).

### Key data flows

1. **Sealed submission with count-only disclosure:** `Order` stakeholders are exactly `{Operator, desk}`. Other desks observe only `Venue` (to submit) and `RoundStats` (a count Operator maintains). No cross-visibility, structurally.
2. **Atomic DvP:** every settlement leg lives inside one `Round.Clear` transaction → all-or-nothing by construction (insufficient holding ⇒ whole tx rolls back). This is the atomicity test (§16 #3) and needs no saga/coordinator.
3. **Reactive reveal:** because all reads are `useStreamQueries` over WebSocket, the post-`Clear` UI update is push-driven — the "settlement animation" is triggered by the contract set changing, not a poll.

---

## Build Order / Component Boundaries

The dependency graph forces a strict order; it maps 1:1 onto spec §17 and lands a **working privacy→clear→settle vertical slice by end of Phase 3** (the stated win condition).

```
[Daml templates] ──► [Setup/Tests scripts] ──► [Round.Clear atomic settle]
                            │                          │
                            ▼                          ▼
                   [parties.json/tokens] ──► [per-party JSON API wiring]
                            │                          │
                            └──────────► [3-up Privacy view]  ◄── VERTICAL SLICE (Phase 3)
                                               │
                                               ▼
                                       [solver service: window + §8 + Clear + Express]
                                               │
                                               ▼
                                       [AI agent layer: Claude propose/verify/explain]
                                               │
                                               ▼
                              [theatre + S/D SVG chart + settlement animation]
                                               │
                                               ▼
                                       [polish to design comp + screenshots + README]
                                               │
                                               ▼
                                  [stretch: Daml Finance / cn-quickstart LocalNet]
```

| Spec §17 phase | What must exist first | Boundary established |
|---|---|---|
| **1. Skeleton** | nothing | Ledger templates (`Asset`,`Venue`,`Order`,`Round`,`RoundStats`,`TradeConfirmation`) compile; `Setup.daml` seeds §4; `daml start` runs. Defines the **data contract** every other layer codes against. |
| **2. Clear & settle on-ledger** | Phase 1 templates | `Round.Clear` (verify §8 + atomic DvP + confirmations). Tests 1–3 pass purely in Daml Script — **no frontend/solver needed yet**. Proves the atomicity boundary in isolation. |
| **3. Privacy proof** | Phase 1–2 + party tokens | Generate `parties.json`/tokens; wire per-party `DamlLedger`; tests 4–5; build the **3-up Privacy view**. This is the slice that must ship. Boundary: browser ↔ JSON API is now per-party. |
| **4. Solver service** | Phase 2 `Clear` choice exists to call | Node service: window lifecycle, §8 in TS, exercise `Clear`, Express :4000, TS unit tests. Boundary: browser ↔ solver Express ↔ JSON API(as Operator). |
| **5. AI agent layer** | Phase 4 service shell | Claude propose + rationale; verify-don't-trust; Solver Agent panel. Drops into the Phase-4 `agent.ts` seam; never changes the ledger backstop. |
| **6. Theatre + chart + animation** | Phases 3–5 data available | Countdown, hand-rolled SVG supply/demand crossing, atomic-settle animation driven by reactive contract changes. |
| **7. Polish** | everything | Match the design comp 100%; README + `make demo`; capture the two pitch screenshots. |
| **8. Stretch** | a working app | Daml Finance settlement; cn-quickstart LocalNet cross-node privacy; competing solvers. |

**Boundary contract to lock early (Phase 1):** the template field names + the `Allocation` data type are the shared interface between Daml, the solver's §8 code, and the generated `@daml.js` bindings the frontend uses. Freeze these in Phase 1 so Phases 3–6 don't churn against codegen output.

---

## Anti-Patterns

### Anti-Pattern 1: One shared (admin/operator) token in the frontend

**What people do:** Connect the whole React app with a single broad token "to keep it simple," then hide other desks' data with UI conditionals or query filters.
**Why it's wrong:** The privacy is then **faked** — the browser actually received the data and merely chose not to show it. A judge opening devtools sees everyone's orders. It destroys the central thesis.
**Do this instead:** One `DamlLedger` per identity, each with that party's own token (Pattern 1+2). The browser never receives data the party isn't a stakeholder of.

### Anti-Pattern 2: Letting the AI's number settle the auction

**What people do:** Take Claude's `clearingPrice`/allocation and exercise `Clear` with it directly.
**Why it's wrong:** Nondeterministic, occasionally wrong/unfair; a wrong clear is a demo-killer and violates the spec's correctness invariant.
**Do this instead:** Deterministic §8 in the solver is the source of truth; the AI output is verified against it (`assertMatches`) before submission; `Round.Clear` **re-verifies again on-ledger** (max-volume + conservation + limit compliance). Three layers; the ledger is the final backstop (§9, §16 #6).

### Anti-Pattern 3: Multi-step / multi-transaction settlement

**What people do:** Move BONDX in one transaction, then USDCx in another (or per-leg choices).
**Why it's wrong:** Breaks atomicity — a failure between steps leaves a half-settled book (DvP violation). Reintroduces exactly the cross-chain/clearing risk Canton removes.
**Do this instead:** Do every reassignment + every `TradeConfirmation` inside the single `Round.Clear` transaction. Atomicity is then free (test §16 #3). The operator-custody `Asset` model (single signatory = Operator) is what makes this one-tx reassignment trivial — keep it for the MVP; Daml Finance allocate/approve is the stretch upgrade.

### Anti-Pattern 4: Giving the browser Operator authority to drive the demo

**What people do:** Have the frontend exercise `CloseRound`/`Clear` directly as Operator.
**Why it's wrong:** Leaks operator authority (and, worse, tempts shipping an operator token to the browser — see Anti-Pattern 1) and couples the UI to ledger-admin timing.
**Do this instead:** The browser calls the solver's Express API (`/close`, `/solve-preview`, `/settle`); only the solver service holds Operator authority and exercises those choices.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Anthropic Claude** | `@anthropic-ai/sdk` **server-side in `solver/` only**; structured JSON output, temperature 0 for the canonical agent. | Key via `ANTHROPIC_API_KEY` env, read solely by the solver. Never in `web/`, never committed. Output is advisory (rationale + a proposal that gets verified), never authoritative. |
| **HTTP JSON API** | Bundled with `daml start`; REST for query/create/exercise, WebSocket for streaming. Auth = JWT per request. | Verified: even the unsecured sandbox requires a token on every request; the token's party scopes visibility. |
| **Canton LocalNet (cn-quickstart, stretch)** | Dockerized Splice LocalNet: 3 participant nodes (App Provider / App User / Super Validator), `make setup/build/start`. DARs mounted to `/canton/dars/`; JSON Ledger API v2 on 2975/3975/4975. | Heavy (~multi-GB Docker, Keycloak IDP, PQS). Switches token model to v2 **user tokens**. Build on `daml start` first; LocalNet only proves true **cross-node** sub-transaction privacy (desks on separate participants). Deploy-time stretch, not MVP. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Browser (desk) ↔ JSON API | HTTP + WebSocket as **that desk's** token | Reads/writes scoped by party; the privacy boundary. |
| Browser (operator UI) ↔ Solver Express :4000 | HTTP `fetch()` | Triggers operator-only actions without holding operator creds. |
| Solver ↔ JSON API | HTTP/WS as **Operator** token | Watches Rounds/Orders, exercises `CloseRound`/`Clear`. |
| Solver §8 (TS) ↔ `Round.Clear` §8 (Daml) | No shared code — intentionally duplicated | Two independent implementations = the verify-don't-trust backstop. Keep them in lockstep via the §4 fixture tests on both sides. |
| Daml templates ↔ frontend | Generated `@daml.js` bindings (`daml codegen js`) | Regenerate on any template change; field names are the contract. |

---

## Sources

- Daml Application Architecture — https://docs.daml.com/app-dev/app-arch.html (three-tier model; @daml/react; JWT per-party auth) — HIGH
- Getting Started / create-daml-app — https://docs.daml.com/getting-started/index.html (`daml/`,`ui/`,`daml.yaml`; `daml start` = sandbox + JSON API + codegen) — HIGH
- HTTP JSON API Service — https://docs.daml.com/json-api/index.html (token required on every request incl. unsecured sandbox; unsigned dev tokens via jwt.io; `actAs`/`readAs` payload `{"https://daml.com/ledger-api":{...}}`; query + WebSocket streaming; party scopes visibility) — HIGH
- @daml/react — https://docs.daml.com/app-dev/bindings-ts/daml-react/ and https://www.npmjs.com/package/@daml/react (`DamlLedger` token+party+http/ws URLs; `useStreamQueries`/`useLedger`; `readAs` multi-party) — HIGH
- cn-quickstart — https://github.com/digital-asset/cn-quickstart (Splice LocalNet; 3 participant nodes; `make setup/build/start`; DARs at `/canton/dars/`; JSON Ledger API v2 ports 2975/3975/4975; Keycloak IDP) — HIGH
- Daml 2.x vs 3.x / Canton 3.x token-model drift (user tokens + IDP on the LocalNet path) — MEDIUM (inferred from cn-quickstart Keycloak module + spec §6 version note; confirm against the SDK line actually installed)

---
*Architecture research for: Daml-on-Canton sealed-bid batch auction with off-ledger AI solver*
*Researched: 2026-06-25*
