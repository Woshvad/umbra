# Phase 3: Privacy Proof (Vertical Slice) - Research

**Researched:** 2026-06-25
**Domain:** Daml 2.10 HTTP JSON API per-party auth (HS256 dev JWTs), `daml codegen js` → `@daml.js/umbra`, `@daml/react` multi-provider per-party wiring, privacy Daml Script tests, React 18 + Vite 5 connection to JSON API :7575 — on Windows 11
**Confidence:** HIGH (the `@daml/react` / `@daml/ledger` provider + hook surface read directly from the published `2.10.4` `.d.ts`; the JWT claim shape + `ledgerId="sandbox"` confirmed from docs.daml.com; the templates' privacy shapes read from the live repo)

## Summary

Phase 3 has two halves that meet at the **JSON API :7575 wire**. The ledger half is already structurally done — the Phase-1/2 templates (`Order` signatory `operator, desk` / no observer; `Asset` observer `owner`; `TradeConfirmation` observer `desk`; `RoundStats` observer `desks` count-only) *are* the privacy model. This phase's ledger work is to **prove** that structure with two new Daml Script tests (`test_privacy_orders`, `test_privacy_confirmations`) plus PRIV-02/PRIV-04 assertions, all extending `daml/Umbra/Tests.daml`, and to surface the privacy at the wire by minting **per-party HS256 dev JWTs**.

The frontend half mounts the React app against the JSON API with the structural-privacy money-shot pattern: **one independent `DamlLedger` provider per desk panel**, each carrying that desk's own `token` + `party`. The single most load-bearing discovery: `@daml/react@2.10.4` ships `createLedgerContext(contextName)` *specifically* "where one needs to be able to nest ledger interactions, by different parties or connections, within one React application" (verbatim from the package `.d.ts`). That is exactly the 3-up Privacy view — three sibling `<DamlLedger>` contexts, A/B/C, each reading only its own contracts because the JSON API filters by the token's `actAs`/`readAs`. The center column reads the shared `RoundStats` (observer = `desks`, so *any* desk token can read the count). Privacy is therefore enforced by the token at the API boundary, not by render-time filtering (PRIV-05).

The token claim shape the Daml 2.x JSON API expects is `{"https://daml.com/ledger-api": {"ledgerId": "sandbox", "applicationId": "umbra", "actAs": [party], "readAs": [party]}}`, signed **HS256 with an arbitrary/empty dev secret** under `--allow-insecure-tokens`, sent as `Authorization: Bearer <jwt>`. The one genuine drift risk is `ledgerId`: the `daml start` Canton sandbox's ledger/participant id defaults to `"sandbox"`, but make it a single configurable constant and verify it live (one `curl` against `/v1/query`) before committing the token-mint output.

**Primary recommendation:** Add a `codegen.js` block to `daml.yaml` (or run `daml codegen js` standalone) → `npm install ./web/daml.js/umbra --legacy-peer-deps`; mint per-party tokens with a tiny Node `jsonwebtoken@9.0.3` script reading `daml/parties.json` → `web/src/tokens.json`; build the Privacy view as three sibling `<DamlLedger>` providers (default context per panel, or `createLedgerContext` per panel) each with its desk token; extend `Tests.daml` with the two privacy tests using per-party `query @T party` (which returns only contracts where `party` is a stakeholder — that IS the privacy assertion). Seed the Round + RoundStats{sealedOrderCount=3} by extending `Setup`/`Tests` seed helpers so the 3-up renders screenshot-ready without a solver service.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Per-party JWT auth (PRIV-05 — privacy enforced at the wire, not render logic)**
- JSON API runs in dev mode (`daml start` with `--allow-insecure-tokens`). Mint **HS256 unsafe-dev JWTs** (`{"https://daml.com/ledger-api": {actAs:[party], readAs:[party], ledgerId, applicationId}}`), one token per identity (operator, bankA, bankB, bankC), signed with an empty/dev secret.
- A token-minting script (Node + `jsonwebtoken`, or a tiny TS util) reads `daml/parties.json` (Phase-1 export: operator/bankA/bankB/bankC `hint::fingerprint` IDs) and writes per-party tokens to a frontend-readable location (`web/src/parties.json` or `.env`/`tokens.json`). The browser holds ONLY desk tokens + the JSON API URL — never the Operator's privileged automation, never the Anthropic key.
- The frontend **mounts one `DamlLedger` provider per panel/identity** with that party's token → each panel can structurally only fetch that party's contracts. This makes the money shot real, not faked.

**A. Privacy Daml Script tests (PRIV-01..04 — spec §16 tests 4–5)**
- `test_privacy_orders` (PRIV-01): submit the 3 §4 orders; assert `query @Order` as BankA returns BankA's order and **zero** of BankB/BankC's (symmetrically). Use Script `queryFilter`/`query` per-party (stakeholder visibility).
- `test_privacy_confirmations` (PRIV-03): after a settled round, assert each `TradeConfirmation` is visible only to its `desk` (BankA cannot see BankB's).
- PRIV-02: pre-clear, desks see only `RoundStats.sealedOrderCount` (a count), never `Order` contents. PRIV-04: `Asset` visible only to owner + operator. Assert both via per-party `query`.
- These extend `daml/Umbra/Tests.daml`; `daml test` stays exit 0. (Privacy is already STRUCTURAL from the Phase-1 field shapes — these tests PROVE it.)

**A. Order submission (CLEAR-01)**
- `Venue.SubmitOrder` (exists): nonconsuming, controller `desk`, runs under Venue's operator authority → a desk with its OWN token can submit via the JSON API. One order per round; the frontend disables the ticket after submit.
- For the money shot, demo state can be **seeded** (Operator opens a `Round` + `RoundStats{sealedOrderCount=3}`; the 3 §4 orders submitted via `runCanonicalRound`); the frontend reads per-party. Live in-browser submission is supported (desk token → SubmitOrder) but the seeded path guarantees a screenshot-ready 3-up. RoundStats auto-update on submit is the Operator's job → Phase 4; Phase 3 seeds/sets the count.

**B. Frontend stack (spec §6 + CLAUDE.md version pins)**
- `web/` = React 18.3.1 + TypeScript + Vite 5.4 + Tailwind CSS 3.4 (NOT v4) + `@daml/react` / `@daml/ledger` / `@daml/types` @ 2.10.4 + generated `@daml.js/umbra`.
- **Codegen:** `daml codegen js daml/.daml/dist/umbra-0.1.0.dar -o web/daml.js` → then `npm install ./daml.js/umbra --legacy-peer-deps`.
- **Install with `--legacy-peer-deps`** (the `@daml/react` peer dep wants React 16/17; recorded in DECISIONS.md D3). Alternatively add the `overrides` block. Vite proxy or direct calls to JSON API :7575.

**B. Design fidelity — the `Umbra design/` comp is BINDING (follow 100%)**
- Tokens: paper bg #F4F1EA, ink #0A0A0A, red CTA #E2231A, lime accent #D6FB3C; accents #FF6A1A / #FF3D9A / #2B3AF2 / #262626. 1px solid #0A0A0A borders, 48px main padding. Fonts: Space Grotesk (display), IBM Plex Mono (data/labels), Inter (body). Redaction stripe motif on "other" columns; "REDACTED"/"HIDDEN" labels.
- **Scope this phase: the global shell (header/wordmark, party switcher, round-status indicator) + the Privacy view (view 01) ONLY.** Other views deferred to Phase 6.
- > **NOTE (this researcher):** the exact visual layout is produced separately by the UI-SPEC (gsd-ui-phase against `Umbra design/`). This research deliberately does NOT specify visual design — it specifies wiring/auth/data only. The planner consumes BOTH documents.

### Claude's Discretion
- Token-minting implementation (Node script vs Vite plugin); where tokens land (`web/src/parties.json` vs `.env` vs `tokens.json`); exact React component tree; how the center column reads the shared RoundStats (operator-token read vs a desk token); Tailwind config structure mirroring the comp tokens; whether to use `@daml/react` hooks (`useStreamQueries`/`useQuery`/`useLedger`) or `@daml/ledger` directly per panel.

### Deferred Ideas (OUT OF SCOPE)
- Solver service + 60s round lifecycle + auto-updating sealedOrderCount + close/solve → Phase 4.
- Desk / Theatre / Agent / Settlement views, supply-demand chart, settlement animation → Phase 6.
- `make demo`, screenshots into docs/, README polish → Phase 7.
- AI agent rationale → Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAR-01 | A registered desk submits exactly one sealed order per round via `Venue.SubmitOrder`; created `Order` signed by operator+desk; ticket disables after submit | "Pattern 4: In-browser SubmitOrder via desk token" (`useLedger().exercise(Venue.SubmitOrder, venueCid, {...})`); `Venue.SubmitOrder` already exists (Roles.daml) |
| PRIV-01 | An `Order` is visible only to operator+desk; JSON-API query as BankA returns BankA's order and ZERO of B/C — `test_privacy_orders` | "Privacy Test 1" copy-ready script; `query @Order party` returns only stakeholder contracts |
| PRIV-02 | Pre-clear, desks see only `RoundStats.sealedOrderCount`, never order contents | "Privacy Test 1 — PRIV-02 assertion" (each desk `query @RoundStats` returns the count; `query @Order otherDesk` returns []) |
| PRIV-03 | A `TradeConfirmation` is observed only by its desk — `test_privacy_confirmations` | "Privacy Test 2" copy-ready script; observer = singular `desk` (Auction.daml) |
| PRIV-04 | `Asset` holdings visible only to owner + operator | "Privacy Test 1 — PRIV-04 assertion" (BankA `query @Asset` excludes B/C holdings) |
| PRIV-05 | Frontend authenticates as each party with that party's own JSON-API token → structurally cannot fetch others' data | "Per-Party JWT Minting" + "Pattern 2/3: per-party DamlLedger providers"; token `actAs`/`readAs` is the wire filter |
| UI-01 | Party switcher (BankA/B/C/Operator, each using that party's token) + round status indicator (Open·Closed·Cleared·Settled) + live countdown | "Pattern 5: Party switcher" + "Round-status indicator" (`useStreamQueries(Round)`); countdown from `openedAt + windowSeconds` |
| UI-03 | Privacy view: three desk panels side by side, each with that desk's credentials, center column = shared RoundStats count, redaction motif on others | "Pattern 3: 3-up money shot tree" — three sibling `<DamlLedger>` providers; center reads RoundStats; visual handled by UI-SPEC |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-party visibility / disclosure | Ledger (Daml signatory/observer) | — | Privacy is enforced by the ledger's disclosure rules; the JSON API only relays the token's parties |
| Wire-level auth (per-party JWT) | Build tooling (Node mint script) → Browser holds token | JSON API :7575 (decodes `actAs`/`readAs`) | Token minting is a dev-tooling concern; the JSON API turns the token into a party-scoped query |
| Contract bindings (`@daml.js/umbra`) | Build tooling (`daml codegen js`) | Frontend (consumes typed templates) | Generated FROM the DAR; both the typed query shapes and exercise payloads come from here |
| Privacy proof (Daml Script tests) | Ledger (Daml Script `query @T party`) | — | `query` returns only stakeholder contracts; that return set IS the privacy assertion |
| Order submission | Ledger (`Venue.SubmitOrder`) | Frontend (desk token exercises it) | Multi-party authority (operator+desk) lives on-ledger; the desk token supplies the desk authority |
| Round/RoundStats seeding | Ledger (Daml Script seed) | — (Phase 4 solver automates it later) | A choice body can't drive lifecycle/timing; Script seeds the demo state |
| 3-up Privacy view composition | Frontend Server (Vite SPA) / Browser | Ledger (per-panel query) | The component tree mounts one ledger context per panel; each panel's data tier is its own token |
| Privacy view visual design | (Out of scope here — UI-SPEC) | — | Produced separately by gsd-ui-phase against `Umbra design/` |

**Note:** No backend/API-server tier exists in Phase 3 (the solver HTTP service is Phase 4). The browser talks **directly** to the JSON API :7575 with desk tokens. The Operator token must NOT be shipped to the browser for any privileged automation — only the read-only count/round it observes (see Security Domain).

## Standard Stack

### Core (this phase)
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `@daml/react` | `2.10.4` | `DamlLedger` provider + hooks (`useQuery`, `useStreamQueries`, `useLedger`, `useParty`, `createLedgerContext`) over the JSON API | The line the 2.x HTTP JSON API targets; `createLedgerContext` is purpose-built for per-party nesting [VERIFIED: published 2.10.4 `.d.ts`] |
| `@daml/ledger` | `2.10.4` | JS Ledger client (`new Ledger({token, httpBaseUrl, wsBaseUrl})`, `.query`, `.exercise`, `.streamQueries`) | Underlies `@daml/react`; usable directly per panel [VERIFIED: published 2.10.4 `.d.ts` — `LedgerOptions { token, httpBaseUrl?, wsBaseUrl?, reconnectThreshold? }`] |
| `@daml/types` | `2.10.4` | `Party`, `Decimal`, `ContractId` TS mappings | Transitive dep of both above + generated bindings; pin identical [VERIFIED: registry] |
| `@daml.js/umbra` | generated | Typed `Order`/`Asset`/`RoundStats`/`TradeConfirmation`/`Venue`/`Round` templates + `SubmitOrder` choice | Emitted by `daml codegen js` FROM `umbra-0.1.0.dar`; the typed contract for query/exercise |
| `react` / `react-dom` | `18.3.1` | UI runtime | Spec-mandated React 18 [VERIFIED: registry, 18.3.1 latest 18.x] |
| `vite` | `5.4.21` | Dev server :5173 + build; HMR; dev proxy to :7575 | Spec-mandated; pairs with React 18 + Tailwind 3 [VERIFIED: registry, 5.4.21] |
| `@vitejs/plugin-react` | `4.7.0` | React fast-refresh in Vite 5 | Standard React-18 + Vite-5 combo (stay on v4, NOT v6 which targets newer toolchains) [VERIFIED: registry; 4.7.0 is the v4 line head] |
| `tailwindcss` | `3.4.19` | Styling pipeline (implements the comp tokens) | Stay on v3 — the comp targets a v3 `tailwind.config.ts`; v4 changes the PostCSS model [VERIFIED: registry, 3.4.19] |
| `postcss` | `8.5.15` | Tailwind 3 build pipeline | Tailwind 3 requires PostCSS 8 [VERIFIED: registry] |
| `autoprefixer` | `10.5.2` | Vendor prefixes for the comp's CSS | Standard Tailwind 3 companion [VERIFIED: registry] |
| TypeScript | `5.4.x`–`5.6.x` | Frontend + mint-script typing | Stable with Vite 5; consumes `@daml.js` typings [CITED: CLAUDE.md pin] |

### Supporting (token minting)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jsonwebtoken` | `9.0.3` | HS256 `jwt.sign(payload, secret)` to mint per-party dev tokens | The Node token-mint script (`scripts/`); the canonical auth0 lib [VERIFIED: registry; repo github.com/auth0/node-jsonwebtoken; no postinstall script] |
| `@types/jsonwebtoken` | `9.0.10` | Types for the mint script (if TS) | dev-dep of the mint script [VERIFIED: registry] |

> **Alternative (zero-dependency):** the dev JWT is HS256 over `header.payload` with an arbitrary secret; it can be hand-built with Node's built-in `crypto.createHmac('sha256', secret)` + base64url — no `jsonwebtoken` install at all. Recommend `jsonwebtoken` for clarity/correctness, but the zero-dep path is viable and keeps the mint script out of `web/`'s dependency tree.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Three sibling default `<DamlLedger>` providers | `createLedgerContext("bankA")` etc. per panel | `createLedgerContext` gives *named* contexts (cleaner errors, no accidental cross-context hook use). The default `DamlLedger` works because each provider establishes its own React context boundary; but for THREE simultaneous parties the named-context API is the documented intent. Recommend `createLedgerContext` per desk for the 3-up. |
| `@daml/react` hooks | `@daml/ledger` `new Ledger({token,...}).query(...)` directly | Hooks give reactive streaming + loading state for free; direct `Ledger` is simpler for one-shot reads but you manage refresh yourself. Use hooks for the live panels. |
| Vite dev proxy `/v1 → :7575` | Direct `httpBaseUrl: http://localhost:7575` | Direct is simpler but the JSON API must send permissive CORS (it does in dev). A Vite proxy avoids CORS entirely and is the safer default on Windows. Recommend the proxy. |
| `jsonwebtoken@9` | Node `crypto` HMAC by hand | jsonwebtoken is clearer; hand-rolled is zero-dep. Either is fine. |

**Installation (frontend, `web/`):**
```bash
# 1. generate bindings FROM the DAR (Daml side), then install them
daml codegen js daml/.daml/dist/umbra-0.1.0.dar -o web/daml.js
# 2. frontend deps — note --legacy-peer-deps (D3: @daml/react peer dep wants React 16/17)
cd web
npm install react@18.3.1 react-dom@18.3.1 \
  @daml/react@2.10.4 @daml/ledger@2.10.4 @daml/types@2.10.4 \
  --legacy-peer-deps
npm install -D typescript@5.6 vite@5.4 @vitejs/plugin-react@4.7 \
  tailwindcss@3.4 postcss@8 autoprefixer@10 \
  @types/react@18 @types/react-dom@18 --legacy-peer-deps
# 3. the generated, project-specific bindings package
npm install ./daml.js/umbra --legacy-peer-deps
```
```bash
# token-mint script deps (root or scripts/ — NOT in web/'s runtime deps)
npm install jsonwebtoken@9.0.3
npm install -D @types/jsonwebtoken@9.0.10   # if the mint script is TS
```

**Version verification (run before pinning):**
```bash
npm view @daml/react@2.10.4 version          # confirm the binding line matches the SDK
npm view jsonwebtoken version                 # 9.0.3
```
Verified live 2026-06-25: `@daml/react@2.10.4` peerDependencies `{ "react": "^16.12.0 || ^17.0.0" }` → does NOT list React 18 → `--legacy-peer-deps` required (DECISIONS.md D3).

## Package Legitimacy Audit

> `slopcheck` could not be installed in this research session (`slopcheck not available`). Per the Package Legitimacy Gate, the NEW external package this phase introduces (`jsonwebtoken`) is therefore not auto-rated `[OK]`; it is verified by registry + provenance below and is marked `[VERIFIED via provenance]` rather than `[ASSUMED]` because it is the universally-known auth0 library with an authoritative source repo. The planner SHOULD still gate the install behind a `checkpoint:human-verify` task for belt-and-suspenders. The `@daml/*` packages were audited in Phase 1.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `jsonwebtoken` | npm | ~10 yrs | ~20M+/wk | github.com/auth0/node-jsonwebtoken | n/a (tool unavailable) | Approved — canonical auth0 lib; **no postinstall** (`npm view jsonwebtoken scripts.postinstall` empty); registry-confirmed `9.0.3` |
| `@types/jsonwebtoken` | npm | mature | high | DefinitelyTyped | n/a | Approved (dev-only types) |
| `@daml/react` | npm | 5+ yrs | — | github.com/digital-asset/daml | (P1: OK) | Approved |
| `@daml/ledger` | npm | 5+ yrs | — | github.com/digital-asset/daml | (P1: OK) | Approved |
| `@daml/types` | npm | 5+ yrs | — | github.com/digital-asset/daml | (P1: OK) | Approved |
| `@daml.js/umbra` | local (generated) | n/a | n/a | this repo (`daml codegen js` output) | n/a | Approved — built from the local DAR, not a registry package |
| `vite` / `@vitejs/plugin-react` / `tailwindcss` / `postcss` / `autoprefixer` / `react` / `react-dom` | npm | mature | very high | well-known OSS | n/a | Approved — all registry-confirmed at the pinned versions above |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Postinstall-script check:** `jsonwebtoken` has no `postinstall` (verified). The `@daml/*` packages are pure JS bindings with no install scripts.

*Planner action: add ONE `checkpoint:human-verify` before the first `npm install` of `jsonwebtoken` (since slopcheck was unavailable). The `@daml/*` + `@daml.js/umbra` installs were pre-cleared in Phase 1 and re-confirmed here.*

## Per-Party JWT Minting (PRIV-05) — the wire-level privacy

### The token shape the Daml 2.x JSON API expects

```json
{
  "https://daml.com/ledger-api": {
    "ledgerId": "sandbox",
    "applicationId": "umbra",
    "actAs": ["bankA::1220483163bbd2...8f"],
    "readAs": ["bankA::1220483163bbd2...8f"]
  }
}
```
- **Algorithm:** HS256 (the unsafe dev algorithm `--allow-insecure-tokens` accepts). [CITED: docs.daml.com Authorization / JSON API "for a ledger without authorization … use an arbitrary secret"]
- **Secret:** arbitrary in dev — use an empty string `""` or a fixed dev string. The JSON API under `--allow-insecure-tokens` does not cryptographically validate the signature. [CITED: docs.daml.com json-api]
- **`applicationId`:** mandatory; any string (`"umbra"`). [CITED: docs.daml.com json-api "the application id is mandatory"]
- **`actAs` / `readAs`:** lists; queries require at least one party in either. For a desk token, both = `[thisDeskPartyId]`. The JSON API turns this into a party-scoped query — **this is the wire-level privacy filter**. [CITED: docs.daml.com json-api]
- **`ledgerId`:** for the `daml start` sandbox this corresponds to the participant/ledger id, which **defaults to `"sandbox"`**. [CITED: docs.daml.com json-api "the JWT payload should include a ledgerId of 'sandbox' … corresponds to the participant id which by default is just 'sandbox'"] — **but treat this as the phase's #1 drift risk** (see Pitfall 2): make it a single constant and verify live.
- **Transport:** `Authorization: Bearer <jwt>`. [CITED: docs.daml.com authorization]

### Recommended mint script (Node + `jsonwebtoken@9.0.3`)

Place in `scripts/mint-tokens.mjs` (or `.ts`). Reads `daml/parties.json` (the Phase-1 export of `hint::fingerprint` IDs), emits per-party tokens to `web/src/tokens.json`.

```js
// Source: jsonwebtoken@9 API (jwt.sign) + Daml 2.x JSON API claim shape (docs.daml.com)
// scripts/mint-tokens.mjs  — run: node scripts/mint-tokens.mjs
import { readFileSync, writeFileSync } from "node:fs";
import jwt from "jsonwebtoken";

const LEDGER_ID = process.env.DAML_LEDGER_ID ?? "sandbox"; // ← the one drift knob (Pitfall 2)
const APP_ID    = "umbra";
const DEV_SECRET = "";                                     // unsafe dev secret (--allow-insecure-tokens)

const parties = JSON.parse(readFileSync("daml/parties.json", "utf8"));
// parties = { operator, bankA, bankB, bankC } each "hint::fingerprint"

const mint = (party) =>
  jwt.sign(
    { "https://daml.com/ledger-api": {
        ledgerId: LEDGER_ID, applicationId: APP_ID,
        actAs: [party], readAs: [party],
    }},
    DEV_SECRET,
    { algorithm: "HS256" }
  );

const tokens = Object.fromEntries(
  Object.entries(parties).map(([name, party]) => [name, { party, token: mint(party) }])
);
writeFileSync("web/src/tokens.json", JSON.stringify(tokens, null, 2));
console.log("Wrote web/src/tokens.json for:", Object.keys(tokens).join(", "));
```

Output `web/src/tokens.json`:
```json
{
  "operator": { "party": "operator::1220...", "token": "eyJhbGci..." },
  "bankA":    { "party": "bankA::1220...",    "token": "eyJhbGci..." },
  "bankB":    { "party": "bankB::1220...",    "token": "eyJhbGci..." },
  "bankC":    { "party": "bankC::1220...",    "token": "eyJhbGci..." }
}
```

> **Zero-dependency variant** (avoids adding `jsonwebtoken`): build the HS256 JWT with Node `crypto`:
> ```js
> import { createHmac } from "node:crypto";
> const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
> const sign = (payload, secret="") => {
>   const head = b64({ alg: "HS256", typ: "JWT" });
>   const body = b64(payload);
>   const sig  = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
>   return `${head}.${body}.${sig}`;
> };
> ```

> **Regeneration coupling (Pitfall 6):** `parties.json` changes on every `daml start` (fresh `hint::fingerprint`). The tokens embed the party id → **re-run the mint script after every `daml start`**, before the frontend connects. Make it an npm script (`"tokens": "node scripts/mint-tokens.mjs"`) and document the order: `daml start` → export `parties.json` → `npm run tokens` → start Vite.

> **Security boundary (Security Domain below):** the browser receives the **desk** tokens (bankA/B/C) and the center column gets a desk token to read the count. The **operator** token grants broad read/write and the authority to drive settlement — keep it OUT of any shipped browser bundle except, optionally, the read-only round/RoundStats it observes. For the party switcher's "Operator" mode in this phase, scope it to read-only operator queries; no operator-authored writes happen in the browser in Phase 3.

## `daml codegen js` → `@daml.js/umbra` Workflow

### Command (standalone) — Claude's-discretion either path

```bash
# DAR path is .daml/dist/<name>-<version>.dar → umbra-0.1.0.dar
daml codegen js daml/.daml/dist/umbra-0.1.0.dar -o web/daml.js
```
- `-o web/daml.js` is the output directory; `daml codegen js` invokes `daml2js <dar> -o <out> -s<scope>`. [CITED: Codegen.hs `runCodegen JavaScript`, Phase-1 research]
- Default npm scope is `daml.js` → the generated package is **`@daml.js/umbra`** (scope `@daml.js`, name from the DAR `name: umbra`). It lands at `web/daml.js/umbra/` with its own `package.json` declaring a `@daml/types` dep.

### Or via a `daml.yaml` `codegen` block (auto-runs on every `daml start`)
```yaml
# add to daml/daml.yaml (Phase-1 research left a commented stub for exactly this)
codegen:
  js:
    output-directory: ../web/daml.js
    npm-scope: daml.js
```
With this block, `daml start` runs `daml2js` each boot (the `doCodegen` step), keeping `@daml.js/umbra` in sync with template changes automatically. [CITED: Start.hs `doCodegen` runs codegen only for langs with `output-directory` set]

### Consuming it in `web/`
```bash
npm install ./daml.js/umbra --legacy-peer-deps
```
```ts
// typed templates + choices, imported by the frontend
import { Order, RoundStats, TradeConfirmation, Asset } from "@daml.js/umbra/lib/Umbra/Auction";
import { Venue } from "@daml.js/umbra/lib/Umbra/Roles";
import { Round } from "@daml.js/umbra/lib/Umbra/Auction";
```
> **Module path note:** the generated import path mirrors the Daml module layout (`Umbra.Auction` → `@daml.js/umbra/lib/Umbra/Auction`). `Order`, `RoundStats`, `TradeConfirmation`, `Round`, `ClearResult` live in `Umbra/Auction`; `Venue` + `SubmitOrder` in `Umbra/Roles`; `Asset` in `Umbra/Asset`. Verify the exact subpath after first codegen (it is deterministic from the module names). [ASSUMED: exact `/lib/...` subpath — confirm against the generated `package.json` `main`/exports after first `daml codegen js`]

> **Regen after DAR changes (Pitfall 5):** any template field/choice change → rebuild the DAR (`daml build`) → re-run `daml codegen js` (or `daml start` with the codegen block) → the `@daml.js/umbra` types update. A stale binding silently decodes wrong. Phase 3 changes no template field shapes (privacy is already structural), so a single codegen pass at the start of the phase suffices — but re-run if the planner adds any field.

## Architecture Patterns

### System Architecture Diagram (Phase 3)

```
  daml start ──▶ Canton sandbox ──uploads──▶ umbra-0.1.0.dar
       │                │
       │                ├── Setup:initialize  (4 parties, §4 Assets, Venue)
       │                └── seed: Round{Open} + RoundStats{count=3} + 3 §4 Orders
       │
       └── JSON API :7575  (--allow-insecure-tokens)
                │   decodes token.actAs/readAs → party-scoped ACS query
                │   ▲ Authorization: Bearer <per-party JWT>
   ┌────────────┼─────────────────────────────────────────────────┐
   │  Vite SPA :5173   (dev proxy  /v1 → localhost:7575)           │
   │                                                               │
   │   web/src/tokens.json  ◀── scripts/mint-tokens.mjs ◀── parties.json
   │                                                               │
   │   ┌──────────────────── Privacy view (UI-03) ──────────────┐ │
   │   │ <DamlLedger token=A party=A>   center     <... C>       │ │
   │   │   panel A: useStreamQueries(Order) → [A's order]        │ │
   │   │   panel A: query @Asset → [A's holdings]                │ │
   │   │           reads RoundStats.count ─┐                     │ │
   │   │ <DamlLedger token=B party=B>      │   (any desk token   │ │
   │   │   panel B → [B's order only]      ├──  reads the shared │ │
   │   │ <DamlLedger token=C party=C>      │    count: observer  │ │
   │   │   panel C → [C's order only]      ┘    = desks)         │ │
   │   └──────────────────────────────────────────────────────────┘ │
   │   global shell: party switcher (UI-01) + round-status indicator│
   └───────────────────────────────────────────────────────────────┘

  privacy is REAL: each panel's token only authorizes that desk's ACS slice;
  the JSON API returns []. for B/C orders when queried with A's token.
```

Trace: `daml start` seeds the ledger and serves the JSON API. The mint script turns `parties.json` into per-party tokens. The SPA mounts three independent `DamlLedger` contexts (A/B/C); each issues queries carrying only its own token, so the JSON API returns only that desk's `Order`/`Asset`. The center column reads the shared `RoundStats` count (observer = `desks`) with any desk token. The party switcher swaps which token the main shell uses.

### Pattern 1: `@daml/ledger` direct, per-party (one-shot reads / the simplest mental model)
```ts
// Source: @daml/ledger@2.10.4 LedgerOptions { token, httpBaseUrl?, wsBaseUrl? } (published .d.ts)
import Ledger from "@daml/ledger";
import { Order } from "@daml.js/umbra/lib/Umbra/Auction";
import tokens from "./tokens.json";

const ledgerA = new Ledger({
  token: tokens.bankA.token,
  httpBaseUrl: "http://localhost:7575/",  // or "/" when using the Vite proxy
  // wsBaseUrl: "ws://localhost:7575/",    // for streaming
});
const aOrders = await ledgerA.query(Order);  // ⇒ ONLY BankA's order; B/C invisible at the wire
```

### Pattern 2: Per-party `DamlLedger` provider (reactive hooks inside one panel)
```tsx
// Source: @daml/react@2.10.4 LedgerProps { token, party, httpBaseUrl?, wsBaseUrl? } (published .d.ts)
import DamlLedger, { useStreamQueries, useLedger, useParty } from "@daml/react";
import { Order, Asset } from "@daml.js/umbra/lib/Umbra/Auction";
import tokens from "./tokens.json";

function DeskPanel({ id }: { id: "bankA" | "bankB" | "bankC" }) {
  const { party, token } = tokens[id];
  return (
    <DamlLedger token={token} party={party}
                httpBaseUrl="http://localhost:7575/" wsBaseUrl="ws://localhost:7575/">
      <DeskPanelBody />
    </DamlLedger>
  );
}
function DeskPanelBody() {
  const me = useParty();
  const orders = useStreamQueries(Order);     // streams ONLY this desk's order
  const assets = useStreamQueries(Asset);     // ONLY this desk's holdings (PRIV-04)
  // render me + orders.contracts[0] + assets.contracts ; loading = orders.loading
  return null;
}
```

### Pattern 3: The 3-up money shot (UI-03) — three sibling contexts + shared center
```tsx
// Three INDEPENDENT ledger contexts, one per desk. createLedgerContext gives named
// contexts so hooks in one panel can never read another panel's connection — the
// structural privacy guarantee (PRIV-05). [VERIFIED: @daml/react .d.ts — createLedgerContext
// "where one needs to be able to nest ledger interactions, by different parties or
//  connections, within one React application."]
import { createLedgerContext } from "@daml/react";
import { Order, Asset, RoundStats } from "@daml.js/umbra/lib/Umbra/Auction";
import tokens from "./tokens.json";

const ctxA = createLedgerContext("bankA");
const ctxB = createLedgerContext("bankB");
const ctxC = createLedgerContext("bankC");

function Panel({ ctx, id }: { ctx: typeof ctxA; id: "bankA"|"bankB"|"bankC" }) {
  const { party, token } = tokens[id];
  const Body = () => {
    const orders = ctx.useStreamQueries(Order);  // this desk only
    const assets = ctx.useStreamQueries(Asset);  // this desk only
    return /* render party + orders.contracts[0] + assets */ null;
  };
  return (
    <ctx.DamlLedger token={token} party={party}
                    httpBaseUrl="/" wsBaseUrl={`ws://${location.host}/`}>
      <Body />
    </ctx.DamlLedger>
  );
}

function CenterCount() {
  // The shared count: RoundStats observer = `desks`, so ANY desk token reads it.
  // Reuse one desk's context (e.g. ctxA) — no operator token needed in the browser.
  const stats = ctxA.useStreamQueries(RoundStats);
  const count = stats.contracts[0]?.payload.sealedOrderCount ?? 0;
  return /* "{count} SEALED ORDERS" */ null;
}

function PrivacyView() {
  return (
    <>
      <Panel ctx={ctxA} id="bankA" />
      <CenterCount />            {/* center column: the shared count, redaction motif on A/B/C cross-cells */}
      <Panel ctx={ctxB} id="bankB" />
      <Panel ctx={ctxC} id="bankC" />
    </>
  );
}
```
> Visual arrangement (columns, redaction stripes, labels) comes from the UI-SPEC; the WIRING is: three contexts, one center read. The redaction motif on the "other" columns is **honest** here — those cells genuinely have no data because the token can't fetch it.

### Pattern 4: In-browser `SubmitOrder` via the desk token (CLEAR-01, live path)
```tsx
// Source: Venue.SubmitOrder (Roles.daml) is nonconsuming, controller = desk.
import { useLedger, useParty } from "@daml/react";
import { Venue, SubmitOrder } from "@daml.js/umbra/lib/Umbra/Roles";
import { Side } from "@daml.js/umbra/lib/Umbra/Clearing";   // Side re-exported via Auction too

async function submit(ledger: ReturnType<typeof useLedger>, venueCid: string, desk: string) {
  await ledger.exercise(Venue.SubmitOrder, venueCid, {
    desk, roundId: "R1", side: Side.Buy, quantity: "10", limit: "101.0",
  });
  // disable the ticket after this resolves (CLEAR-01: one order per round)
}
```
> The desk's own token carries the `desk` party authority that `controller desk` requires; the operator authority comes from the Venue being operator-signed. So a desk submits with ONLY its token — no operator token in the browser. Note `quantity` is an `Int` (sent as a string in the JSON API) and `limit` a `Decimal` (string). Confirm the exact codegen field encoding (Int→string, Decimal→string) against the generated types.

### Pattern 5: Party switcher + round-status indicator (UI-01)
```tsx
// Switcher: swap which token the main shell mounts. Each identity = its own <DamlLedger>.
const [who, setWho] = useState<"bankA"|"bankB"|"bankC"|"operator">("bankA");
const { party, token } = tokens[who];
// <DamlLedger key={who} token={token} party={party} ...>  (key forces a fresh context on switch)

// Round-status indicator: stream the Round the desk observes.
import { Round } from "@daml.js/umbra/lib/Umbra/Auction";
function RoundStatus() {
  const rounds = useStreamQueries(Round);
  const r = rounds.contracts[0]?.payload;
  // r.status ∈ {Open,Closed,Cleared,Settled}; countdown = openedAt + windowSeconds - now
  return null;
}
```
> Use `key={who}` on the switcher's `<DamlLedger>` so React tears down the old connection and mounts a fresh one with the new token — avoids a stale stream reading with the prior party.

### Vite dev proxy (recommended over direct CORS)
```ts
// web/vite.config.ts — proxy /v1 (REST) and the WS to the JSON API, sidestepping CORS on Windows.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": { target: "http://localhost:7575", changeOrigin: true, ws: true },
    },
  },
});
```
With the proxy, use `httpBaseUrl: "/"` and `wsBaseUrl: \`ws://${location.host}/\`` so the browser talks same-origin to Vite, which forwards to :7575.

### Anti-Patterns to Avoid
- **Render-time filtering instead of token isolation:** fetching all contracts with one token and hiding others in React. This FAKES privacy — a console/network inspection reveals all data. The money shot must be REAL: each panel's token can't fetch the others (PRIV-05). The 3-up uses three tokens, full stop.
- **Shipping the operator token to the browser for writes:** the operator can read everything and drive settlement. In Phase 3 the browser needs at most a read-only operator view; never an operator-authored exercise. Keep settlement automation server-side (Phase 4).
- **Hard-coding a party fingerprint:** `bankA::1220...` changes every `daml start`. Always read `parties.json` → mint tokens fresh (Pitfall 3/6).
- **Forgetting `--legacy-peer-deps`:** npm 7+ aborts on the `@daml/react` React-16/17 peer range (D3).
- **A stale `ledgerId` in tokens:** if the sandbox's ledger id isn't `"sandbox"`, every query 401/UNAUTHENTICATEDs. Make it one constant; verify live (Pitfall 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-party ledger contexts in one app | A custom React context + fetch wrapper per party | `createLedgerContext(name)` / nested `<DamlLedger>` | Purpose-built for "nest ledger interactions, by different parties or connections, within one React application" [VERIFIED: @daml/react .d.ts] |
| Reactive contract streaming | Polling `/v1/query` on a timer | `useStreamQueries(T)` | WebSocket streaming + loading state + auto-reload on ledger change [VERIFIED: .d.ts] |
| JSON API client (query/exercise/encode) | `fetch` to `/v1/query` with hand-built payloads | `@daml/ledger` `Ledger.query/exercise` + `@daml.js/umbra` types | Handles Daml-LF JSON encoding (Decimal/Int/ContractId) correctly; hand-encoding drifts |
| Typed template/choice bindings | Hand-written TS interfaces for `Order`/`Venue` | `daml codegen js` → `@daml.js/umbra` | Generated from the DAR; always matches the on-ledger shape |
| HS256 dev JWT | A bespoke crypto signer (if you want a lib) | `jsonwebtoken@9` (or Node `crypto` HMAC for zero-dep) | Correct base64url + HS256; the zero-dep path is also documented above |
| Privacy assertion | A custom "is X a stakeholder" check | Daml Script `query @T party` | `query` returns ONLY contracts where `party` is a stakeholder — the return set IS the disclosure check |

**Key insight:** every wire-level privacy guarantee in this phase is a *Daml disclosure property surfaced through a token*. You author almost no privacy logic — you mint the right token, mount the right context, and let `query`'s stakeholder semantics (Script side) and `actAs`/`readAs` (wire side) do the enforcement.

## Runtime State Inventory

> Phase 3 is additive frontend + test wiring, not a rename/refactor. Included for the generated/coupled state it introduces.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Canton sandbox ledger is **ephemeral** — re-seeded each `daml start`; no persistent store. The seeded Round + RoundStats{count=3} + 3 Orders live only for that boot. | None — re-seed via Setup/seed helper each boot |
| Live service config | The JSON API :7575 runs `--allow-insecure-tokens` (set by `daml start`, not in repo config). | None — dev flag, documented in DECISIONS D5 |
| OS-registered state | None — no scheduled tasks/services; `make` absent. | None |
| Secrets/env vars | `web/src/tokens.json` (generated, holds per-boot desk JWTs) + `parties.json` (per-boot IDs). NEITHER is a real secret in dev, but tokens.json should be **gitignored** (per-boot, and a token is a bearer credential even if dev-only). `ANTHROPIC_API_KEY` stays out of `web/` entirely (Phase 5). | Gitignore `web/src/tokens.json`; never commit it. Re-mint after every `daml start`. |
| Build artifacts | `web/daml.js/umbra/` (generated bindings) + `web/node_modules/`. The bindings are stale after any template change. | Gitignore `web/daml.js/` + `web/node_modules/`; regen on DAR change (Pitfall 5) |

**OS-registered state / Live service config beyond the above:** None — verified greenfield frontend; the only running service is `daml start` (sandbox + JSON API), which is dev-launched, not OS-registered.

## Common Pitfalls

### Pitfall 1: Faked privacy (render-time filtering)
**What goes wrong:** one token fetches everything; React hides other desks' data. A judge opens DevTools → sees all orders → the money shot is a lie.
**Why it happens:** it's the path of least resistance with a single ledger connection.
**How to avoid:** three tokens, three `DamlLedger`/`createLedgerContext` contexts; each panel can only ever fetch its own. Verify live: query as BankA, confirm B/C orders are absent from the network response, not just the DOM.
**Warning signs:** other desks' order data appears anywhere in a network response under BankA's token.

### Pitfall 2: `ledgerId` mismatch → every query unauthenticated (the #1 drift risk)
**What goes wrong:** tokens with the wrong `ledgerId` get rejected by the Canton sandbox AuthService; all queries fail (401/UNAUTHENTICATED) even though `--allow-insecure-tokens` skips signature checks.
**Why it happens:** the `daml start` Canton sandbox's ledger/participant id is *usually* `"sandbox"` but is not guaranteed across SDK patch lines / configs.
**How to avoid:** put `ledgerId` in ONE constant (`DAML_LEDGER_ID`, default `"sandbox"`). **Verify live before committing tokens:** mint a BankA token and curl the JSON API:
```bash
curl -sS http://localhost:7575/v1/query \
  -H "Authorization: Bearer <bankA-token>" -H "Content-Type: application/json" \
  -d '{"templateIds":["umbra:Umbra.Auction:Order"]}'
```
A `200` with a `result` array (even empty) = correct `ledgerId`. A `401`/`UNAUTHENTICATED` = wrong `ledgerId` → adjust the constant. (If `"sandbox"` fails, try the participant id reported by `daml start`'s logs.)
**Warning signs:** all hooks stuck `loading` or returning auth errors; `/v1/query` returns `UNAUTHENTICATED`.
**Confidence:** the `"sandbox"` default is CITED from docs.daml.com; the live-verify step is the guaranteed fallback. [CITED: docs.daml.com json-api]

### Pitfall 3: Stale party IDs after `daml start`
**What goes wrong:** tokens minted against a previous boot's `parties.json` carry dead party ids → "party not known on ledger."
**Why it happens:** the Canton sandbox is fresh each boot; `hint::fingerprint` changes.
**How to avoid:** mint AFTER `parties.json` is (re)exported for the current sandbox. Order: `daml start` → export `parties.json` → `npm run tokens` → start Vite.
**Warning signs:** auth/"unknown party" errors right after a restart.

### Pitfall 4: CORS on direct :7575 calls (Windows)
**What goes wrong:** browser blocks cross-origin `:5173 → :7575` requests.
**Why it happens:** the JSON API's dev CORS may not cover the WS upgrade or all headers on every Windows setup.
**How to avoid:** use the Vite dev proxy (`/v1 → :7575`, `ws: true`) and `httpBaseUrl: "/"`. Same-origin, no CORS.
**Warning signs:** CORS errors in console; WS connection failures.

### Pitfall 5: Stale `@daml.js/umbra` after a DAR change
**What goes wrong:** template field/choice edits aren't reflected in the bindings → silent decode mismatches or type errors.
**How to avoid:** `daml build` → `daml codegen js` (or `daml start` with the codegen block) → `npm install ./daml.js/umbra` again if the package version bumped. Phase 3 changes no field shapes, so one codegen pass suffices unless the planner adds a field.
**Warning signs:** "unknown field" decode errors; TS types missing a template.

### Pitfall 6: Token/party-id coupling not re-run
**What goes wrong:** the frontend uses old tokens.json with new sandbox ids.
**How to avoid:** make `npm run tokens` a mandatory step after every `daml start`; consider a single `dev` script that chains export → mint → vite.
**Warning signs:** same as Pitfall 3.

### Pitfall 7: `--legacy-peer-deps` omitted
**What goes wrong:** `npm install` aborts on the `@daml/react` React-16/17 peer range (D3).
**How to avoid:** always pass `--legacy-peer-deps` (or the `overrides` block) for every install in `web/`.
**Warning signs:** `ERESOLVE could not resolve` mentioning `@daml/react` + `react@18`.

### Pitfall 8: Int vs Decimal JSON encoding in SubmitOrder
**What goes wrong:** sending `quantity: 10` (number) or `limit: 101.0` (number) where the codegen expects strings → decode/validation error.
**Why it happens:** Daml `Int` and `Decimal` are encoded as JSON **strings** in the JSON API.
**How to avoid:** pass `quantity: "10"`, `limit: "101.0"` (strings). Confirm against the generated `Venue.SubmitOrder` argument types.
**Warning signs:** 400 from `/v1/exercise`; "expected Int/Numeric, got number."

## Privacy Daml Script Tests (extend `daml/Umbra/Tests.daml`)

> Key fact: in Daml Script, `query @T party` returns **only** contracts where `party` is a signatory or observer (a stakeholder). The returned set IS the disclosure boundary — asserting its length/contents per party proves privacy. No special "visibility" API is needed. The existing `Tests.daml` already imports `query` from `Daml.Script` and uses it throughout (e.g. `query @Asset operator`), so these patterns drop in.

### Privacy Test 1 — `test_privacy_orders` (PRIV-01) + PRIV-02 + PRIV-04 assertions
```haskell
-- Source: Daml.Script query stakeholder semantics + spec §16 test 4 + templates (Auction.daml)
-- Submit the 3 §4 orders, then prove per-party Order visibility is isolated, the
-- RoundStats count is the ONLY pre-clear shared info, and Assets are owner-scoped.
test_privacy_orders : Script ()
test_privacy_orders = do
  p@Parties{..} <- initialize
  venues <- query @Venue operator
  let venueCid = case venues of ((v,_)::_) -> v; [] -> error "no Venue"
  -- the three §4 orders, each submitted by its own desk
  _ <- submit bankA do exerciseCmd venueCid SubmitOrder with
         desk = bankA; roundId = "R1"; side = Buy;  quantity = 10; limit = 101.0
  _ <- submit bankB do exerciseCmd venueCid SubmitOrder with
         desk = bankB; roundId = "R1"; side = Sell; quantity = 8;  limit = 99.0
  _ <- submit bankC do exerciseCmd venueCid SubmitOrder with
         desk = bankC; roundId = "R1"; side = Sell; quantity = 5;  limit = 100.0

  -- seed RoundStats{count = 3} (operator-signed, observer = desks) for PRIV-02
  _ <- submit operator do createCmd RoundStats with
         operator; roundId = "R1"; desks = [bankA, bankB, bankC]; sealedOrderCount = 3

  -- PRIV-01: each desk sees exactly ITS OWN order, zero of the others' ----------
  aOrders <- query @Order bankA
  bOrders <- query @Order bankB
  cOrders <- query @Order bankC
  length aOrders === 1
  length bOrders === 1
  length cOrders === 1
  -- the single visible order belongs to the querying desk (no cross-leak)
  assertMsg "BankA sees only its own order" (all (\(_,o) -> o.desk == bankA) aOrders)
  assertMsg "BankB sees only its own order" (all (\(_,o) -> o.desk == bankB) bOrders)
  assertMsg "BankC sees only its own order" (all (\(_,o) -> o.desk == bankC) cOrders)
  -- operator (Order signatory) sees all three
  ops <- query @Order operator
  length ops === 3

  -- PRIV-02: desks see the RoundStats COUNT, never order contents of others ------
  aStats <- query @RoundStats bankA
  length aStats === 1
  assertMsg "desk sees the sealed-order count = 3"
    (all (\(_,s) -> s.sealedOrderCount == 3) aStats)
  -- (already proven above: BankA's query @Order returns ONLY its own — never B/C contents)

  -- PRIV-04: Assets are visible only to owner + operator -------------------------
  aAssets <- query @Asset bankA
  assertMsg "BankA sees only its own holdings"
    (all (\(_,a) -> a.owner == bankA) aAssets)
  bAssets <- query @Asset bankB
  assertMsg "BankB sees only its own holdings"
    (all (\(_,a) -> a.owner == bankB) bAssets)
  -- operator (Asset signatory) sees ALL holdings
  allAssets <- query @Asset operator
  length allAssets === 5   -- the §4 seed: A USDCx, B BONDX+USDCx, C BONDX+USDCx
```

### Privacy Test 2 — `test_privacy_confirmations` (PRIV-03)
```haskell
-- Source: spec §16 test 5 + TradeConfirmation observer = singular `desk` (Auction.daml)
-- After a real Round.Clear settles the §4 fixture, each desk sees ONLY its own
-- TradeConfirmation; no cross-visibility of fills. Reuses the Phase-2 seed helper.
test_privacy_confirmations : Script ()
test_privacy_confirmations = do
  SeedResult{..} <- seedCanonicalAndClose            -- opens+closes the round (Tests.daml)
  let Parties{..} = parties
  -- settle with the verified §4 allocation @100.0 (operator authority)
  _ <- submit operator do
    exerciseCmd roundCid Clear with
      clearingPrice  = 100.0
      allocations    = canonicalAllocs bankA bankB bankC
      orderCids; buyerUsdcCid; sellerBondCids

  -- each desk sees exactly its own confirmation; operator sees all three
  aConfs <- query @TradeConfirmation bankA
  bConfs <- query @TradeConfirmation bankB
  cConfs <- query @TradeConfirmation bankC
  length aConfs === 1
  length bConfs === 1
  length cConfs === 1
  assertMsg "BankA sees only its own confirmation" (all (\(_,t) -> t.desk == bankA) aConfs)
  assertMsg "BankB sees only its own confirmation" (all (\(_,t) -> t.desk == bankB) bConfs)
  assertMsg "BankC sees only its own confirmation" (all (\(_,t) -> t.desk == bankC) cConfs)
  -- cross-check: BankA is NOT a stakeholder of BankB's confirmation (its query excludes it)
  assertMsg "no cross-desk confirmation leak"
    (notElem bankB [ t.desk | (_,t) <- aConfs ])
  allConfs <- query @TradeConfirmation operator
  length allConfs === 3
```

> **Import additions to `Tests.daml`:** the existing import block already brings `Order`, `Round`, `RoundStatus`, `TradeConfirmation`, `CloseRound`, `Clear`, `Venue`, `SubmitOrder`, `Side`, `Allocation`. Add `RoundStats(..)` to the `Umbra.Auction` import list for the PRIV-02 create/query. (Already-present helpers `seedCanonicalAndClose`, `canonicalAllocs`, `initialize`, `Parties` are reused as-is.)

> **Why these are tests, not new privacy logic:** the templates already enforce disclosure. If a future edit added a stray `observer` to `Order`, `length bOrders === 1` would jump and the test fails loudly — these tests are the regression guard on the money shot.

## Round / RoundStats Seeding for the Money Shot

The 3-up view needs, without a solver service: a `Round{Open}`, a `RoundStats{sealedOrderCount = 3}`, and the 3 §4 `Order`s. Two paths (Claude's discretion):

**Recommended — extend the existing seed helper.** `Tests.daml` already has `seedAndClose`/`seedCanonicalAndClose` which open a Round, submit the three orders, and locate cids. For the *frontend* money shot you want the Round left **Open** (not closed/settled) with a `RoundStats{count=3}`. Add a small `seedOpenRound` (or extend `Setup.runCanonicalRound`) that:
1. `initialize` (parties + §4 Assets + Venue),
2. creates `Round{status = Open, roundId="R1", symbol="BONDX", desks=[A,B,C], windowSeconds=60}`,
3. submits the three §4 orders via `Venue.SubmitOrder`,
4. creates `RoundStats{operator, roundId="R1", desks=[A,B,C], sealedOrderCount = 3}`.

Run it as a one-shot `daml script --script-name Umbra.Setup:seedOpenRound` (or wire it as the `init-script`) against the live sandbox so the SPA reads it per-party.

**Who reads the center RoundStats count:** `RoundStats` has `observer desks` — so **every desk token can read the count** (it's deliberately count-only, never contents). The center column therefore needs **no operator token**: reuse any desk context (e.g. `ctxA.useStreamQueries(RoundStats)`). This keeps the operator token out of the browser entirely for the money shot. (An operator-token read would also work but is unnecessary and weakens the security boundary.)

> **PRIV-02 nuance for the planner:** in Phase 3 the count is *seeded* to 3 (the solver auto-incrementing it on each submit is Phase 4). The desks legitimately see only the count — they cannot see each other's `Order` contents because the order isn't observed by other desks. The seeded count and the per-desk order isolation together are the money shot.

## State of the Art

| Old Approach | Current Approach (2.10.x) | When | Impact |
|--------------|---------------------------|------|--------|
| One ledger connection, filter in UI | `createLedgerContext` per party — structural isolation | stable in `@daml/react` 2.x | The 3-up is REAL per-party, not faked |
| `useStreamQuery` (singular, deprecated) | `useStreamQueries` (plural) | `@daml/react` 2.x | Use `useStreamQueries`; the singular is `@deprecated` in the .d.ts |
| Hand-built JSON API requests | `@daml/ledger` + `@daml.js` typed query/exercise | 2.x | Correct Daml-LF JSON encoding for free |

**Deprecated/outdated for this build:**
- `useStreamQuery` (singular) — deprecated in favor of `useStreamQueries`. [VERIFIED: @daml/react 2.10.4 .d.ts `@deprecated prefer useStreamQueries`]
- Daml 3.x JSON Ledger API v2 / `cn-quickstart` — OUT (stretch §19); `@daml/react` does not target it (DECISIONS D2).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `daml start` Canton sandbox ledgerId is `"sandbox"` | Per-Party JWT Minting / Pitfall 2 | MEDIUM — CITED from docs, but the #1 drift risk. Mitigated: `ledgerId` is one constant + a live `curl` verify step. If `"sandbox"` fails, read the participant id from `daml start` logs. |
| A2 | Generated import subpath is `@daml.js/umbra/lib/Umbra/Auction` (etc.) | Codegen Workflow | LOW — deterministic from module names; confirm against the generated `package.json` after first `daml codegen js`. Wrong-guess = a one-line import fix. |
| A3 | `Int`/`Decimal` choice args are JSON strings (`"10"`, `"101.0"`) over the JSON API | Pattern 4 / Pitfall 8 | LOW — standard Daml-LF JSON encoding; confirm against the generated `SubmitOrder` arg types. |
| A4 | Dev secret can be empty `""` with `--allow-insecure-tokens` | Mint script | LOW — CITED ("arbitrary secret"); if an empty secret is rejected by jsonwebtoken, use a fixed dev string. |
| A5 | `createLedgerContext`-per-panel is the cleanest 3-up pattern (vs three default `<DamlLedger>`) | Pattern 3 | NONE — both work; this is a style/robustness recommendation, explicitly Claude's discretion. |

## Open Questions

1. **Exact sandbox `ledgerId` value on THIS machine.**
   - What we know: docs say `"sandbox"` (= participant id default).
   - What's unclear: whether the 2.10.4 Canton sandbox on this Windows box reports `"sandbox"` or a different participant id.
   - Recommendation: first frontend task is the live `curl /v1/query` verify (Pitfall 2); set the `DAML_LEDGER_ID` constant from the result. Do this BEFORE building any panel.

2. **Generated module subpaths.**
   - What we know: paths mirror Daml module names.
   - Recommendation: run `daml codegen js` once at phase start, inspect `web/daml.js/umbra/package.json` + the `lib/Umbra/` tree, and pin the exact import paths in the plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Daml SDK | codegen + sandbox + JSON API + privacy tests | ✓ | 2.10.4 (via `~/bin/daml` shim) | none — hard requirement; `daml build`/`daml test` are the gates |
| JDK | Canton sandbox | ✓ | 21 | none needed (17+ ok) |
| Node | mint script + Vite + npm | ✓ | 26.x | none |
| npm | installs (with `--legacy-peer-deps`) | ✓ | 11.x | none |
| `@daml/*@2.10.4` | frontend bindings | ✗ (not yet installed) | — | install in `web/` with `--legacy-peer-deps` |
| `jsonwebtoken@9.0.3` | token mint | ✗ (not yet installed) | — | Node `crypto` HMAC zero-dep variant (provided) |
| `make` | (N/A this phase) | ✗ | — | use npm scripts / direct `daml`/`node` (per CONTEXT) |
| Running `daml start` (sandbox + JSON API :7575) | live per-party verification + the SPA | launch-time | — | must be running for the live `curl` check + the frontend; tests don't need it (`daml test` is in-process) |

**Missing dependencies with no fallback:**
- A **running `daml start`** is required for the live per-party JSON-API check and for the SPA to load data. The Daml Script tests (`daml test`) run in-process and do NOT need it.

**Missing dependencies with fallback:**
- `jsonwebtoken` — Node `crypto` HMAC variant (zero-dep) is provided.
- `make` — npm scripts / direct commands.

## Validation Architecture

> `workflow.nyquist_validation: true` → included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Daml Script** (`daml test`) for the privacy assertions; **Vite/`tsc`** for the frontend build/typecheck; a **live `curl`** for the per-party wire check |
| Config file | `daml/daml.yaml` (Daml Script); `web/tsconfig.json` + `web/vite.config.ts` (frontend) |
| Quick run command | `daml build` (compiles templates + tests) and `cd web && npm run build` (typecheck + bundle) |
| Full suite command | `daml test` (all `Script ()` incl. the 2 new privacy tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRIV-01 | BankA query @Order returns 1 (its own), 0 of B/C | unit (Daml Script) | `daml test` → `test_privacy_orders` | ❌ Wave 0 — add to `Tests.daml` |
| PRIV-02 | Pre-clear desks see only RoundStats.count | unit (Daml Script) | `daml test` → `test_privacy_orders` (RoundStats assertion) | ❌ Wave 0 |
| PRIV-03 | Each TradeConfirmation visible only to its desk | unit (Daml Script) | `daml test` → `test_privacy_confirmations` | ❌ Wave 0 |
| PRIV-04 | Asset visible only to owner+operator | unit (Daml Script) | `daml test` → `test_privacy_orders` (Asset assertion) | ❌ Wave 0 |
| CLEAR-01 | Desk submits one sealed order via Venue.SubmitOrder | integration | `daml test` (already covered by seed) + live exercise via desk token | ✓ (Venue.SubmitOrder exists) / live: manual |
| PRIV-05 | Frontend authenticates per-party at the wire | live smoke | `curl /v1/query -H "Bearer <bankA>"` returns only A's contracts; same with B/C | ❌ Wave 0 — add a `scripts/verify-privacy.sh` |
| UI-01 / UI-03 | Switcher + status indicator + 3-up render | build/typecheck + manual screenshot | `cd web && npm run build` (typecheck) + manual visual check vs UI-SPEC | ❌ Wave 0 — `web/` not yet created |

### Sampling Rate
- **Per task commit:** `daml build` (Daml changes) or `cd web && npm run build` (frontend changes).
- **Per wave merge:** `daml test` (full Daml suite incl. both privacy tests).
- **Phase gate:** `daml test` green (all 8 tests: 6 §16 + the 2 new privacy) + `cd web && npm run build` typechecks clean + the live per-party `curl` check passes (BankA token returns only A's order; B/C return only theirs) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `daml/Umbra/Tests.daml` — add `test_privacy_orders` (PRIV-01/02/04) + `test_privacy_confirmations` (PRIV-03); add `RoundStats(..)` to the `Umbra.Auction` import.
- [ ] `daml/Umbra/Setup.daml` — add `seedOpenRound` (Round{Open} + RoundStats{count=3} + 3 orders) for the live money shot.
- [ ] `daml.yaml` — add the `codegen.js` block (or run `daml codegen js` standalone in a build script).
- [ ] `scripts/mint-tokens.mjs` — per-party HS256 dev JWT minter.
- [ ] `scripts/verify-privacy.sh` (or `.ps1`) — live `curl` per-party check (PRIV-05 smoke).
- [ ] `web/` — Vite + React 18 + Tailwind 3 scaffold (`vite.config.ts` proxy, `tailwind.config.ts`, `tsconfig.json`), `@daml/*` + `@daml.js/umbra` installed `--legacy-peer-deps`.
- [ ] Framework installs: `jsonwebtoken@9.0.3` (or zero-dep); the `web/` dep set above.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` → included. Phase 3 introduces the first untrusted client surface (the browser SPA holding bearer tokens). The auth model is **dev-only** (`--allow-insecure-tokens`, HS256 unsafe secret) and MUST NOT be carried to any deploy (DECISIONS D5).

### Applicable ASVS Categories
| ASVS Category | Applies (P3) | Standard Control |
|---------------|--------------|-----------------|
| V2 Authentication | **yes** | Per-party HS256 dev JWT (`actAs`/`readAs`) — the wire identity. Dev-mode only; NOT production auth. |
| V3 Session Management | partial | Token = the session; each `<DamlLedger>` holds one. `key={who}` on switch forces a fresh connection (no stale-token reuse). |
| V4 Access Control | **yes (the core)** | Daml disclosure (signatory/observer) + the token's `actAs`/`readAs`. The JSON API returns only the token-party's ACS slice — this IS the privacy boundary (PRIV-01..05). |
| V5 Input Validation | **yes (on-ledger)** | `Order` `ensure quantity > 0 && limit > 0.0`; `SubmitOrder` `assertMsg "desk not registered"`. The frontend should also validate before submit, but the ledger is the authority. |
| V6 Cryptography | no (dev) | HS256 with an arbitrary dev secret — never hand-roll; never deploy. Production crypto is the Canton path (§19). |
| V14 Config / Secrets | **yes** | `ANTHROPIC_API_KEY` never enters `web/` (Phase 5, solver-only). `web/src/tokens.json` gitignored. The **operator** token (broad authority) MUST NOT be shipped to the browser for writes; the center count uses a desk token. |

### Known Threat Patterns for this stack (Phase 3 surface)
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| One desk reading another's order via the API | Information disclosure | Per-party token: BankA's token's `actAs`/`readAs` = [BankA] → JSON API returns only A's `Order`. Proven by `test_privacy_orders` + the live `curl` check. |
| Faked privacy (UI hides data fetched under one token) | Information disclosure | Three independent tokens/contexts; each panel structurally cannot fetch others (PRIV-05). Verify in the network tab, not the DOM. |
| Operator token leaking to the browser → privileged writes | Elevation of privilege | Ship only desk tokens to the SPA; the center RoundStats read uses a desk token (observer = desks). No operator-authored exercise in the browser in P3. |
| Anthropic key exposure via the frontend bundle | Information disclosure | Key read ONLY by `solver/` (Phase 5); never imported in `web/`; `.env` gitignored; `.env.example` placeholders only (D6). |
| A desk forging another desk's order | Spoofing | `Order` signatory = `operator, desk`; created only via `Venue.SubmitOrder` `controller desk` — the desk's own token supplies its authority; it cannot mint another desk's order. |
| Dev JWT (insecure secret) reused in a real deploy | Spoofing/Elevation | `--allow-insecure-tokens` is dev-sandbox ONLY (D5). Tokens.json gitignored. Documented as never-for-deploy. |

**Security note for the planner:** the whole point of Phase 3 is to demonstrate that privacy holds **at the API boundary**, not in render code. The two ledger tests + the live `curl` per-party check are the security-critical deliverables; the visual 3-up is the *presentation* of that proof. Do not let a convenience shortcut (one shared token, UI-side filtering) substitute for real per-party tokens — that would make the money shot a security lie.

## Sources

### Primary (HIGH confidence)
- **`@daml/react@2.10.4` published package `.d.ts`** (`npm pack` → `createLedgerContext.d.ts`, `defaultLedgerContext.d.ts`, `index.d.ts`) — `LedgerProps { token, party, httpBaseUrl?, wsBaseUrl?, user?, reconnectThreshold? }`; `createLedgerContext(contextName)` "nest ledger interactions, by different parties or connections, within one React application"; `useQuery`/`useStreamQueries`/`useLedger`/`useParty` signatures; `useStreamQuery` `@deprecated`. Read live 2026-06-25.
- **`@daml/ledger@2.10.4` published package `.d.ts`** — `LedgerOptions { token, httpBaseUrl?, wsBaseUrl?, reconnectThreshold?, multiplexQueryStreams? }`; `class Ledger` `query`/`exercise`/`streamQueries`. Read live 2026-06-25.
- **Live npm registry (2026-06-25):** `jsonwebtoken@9.0.3` (repo github.com/auth0/node-jsonwebtoken, no postinstall), `@types/jsonwebtoken@9.0.10`, `react@18.3.1`, `vite@5.4.21`, `@vitejs/plugin-react@4.7.0`, `tailwindcss@3.4.19`, `postcss@8.5.15`, `autoprefixer@10.5.2`.
- **Repo source (read this session):** `daml/Umbra/{Roles,Auction,Asset,Setup,Tests}.daml`, `daml/daml.yaml`, `daml/parties.json`, `DECISIONS.md`, `spec.md` §6/§10/§12/§15/§16, `.planning/phases/01-skeleton-version-gate/01-RESEARCH.md`.

### Secondary (MEDIUM confidence)
- **docs.daml.com (resolves to 2.10.x):** HTTP JSON API JWT claim shape `{"https://daml.com/ledger-api": {ledgerId, applicationId, actAs, readAs}}`; `ledgerId: "sandbox"` (= participant id default); `applicationId` mandatory; queries need ≥1 party in `actAs`/`readAs`; arbitrary secret for the no-auth sandbox; JSON API relays the token to the Ledger API AuthService. (Pages render navigation-only via WebFetch; claims corroborated across multiple search results.)

### Tertiary (LOW confidence)
- Exact generated `@daml.js/umbra` import subpaths + Int/Decimal-as-string choice-arg encoding — standard Daml-LF JSON behavior, but confirm against the generated package after the first `daml codegen js` (Assumptions A2/A3).

## Metadata

**Confidence breakdown:**
- `@daml/react`/`@daml/ledger` provider + hook surface: **HIGH** — read directly from the published 2.10.4 `.d.ts`.
- Per-party multi-context pattern (the money shot wiring): **HIGH** — `createLedgerContext`'s documented purpose is exactly this.
- JWT claim shape + transport: **HIGH** — consistent across docs + search; matches Phase-1 DECISIONS.
- `ledgerId` = `"sandbox"`: **MEDIUM** — CITED but the #1 drift risk; mitigated by a one-constant + live-verify step.
- Privacy test patterns: **HIGH** — `query @T party` stakeholder semantics + existing `Tests.daml` patterns.
- Frontend package versions: **HIGH** — live registry.

**Research date:** 2026-06-25
**Valid until:** ~2026-07-25 (stable 2.10.x line). Re-verify only if `@daml/*` patch bumps or the SDK changes.

## RESEARCH COMPLETE

**Phase:** 3 - Privacy Proof (Vertical Slice)
**Confidence:** HIGH

### Key Findings
- **The money-shot wiring is a first-class `@daml/react` feature:** `createLedgerContext(name)` exists specifically to "nest ledger interactions, by different parties or connections, within one React application" (verbatim from the published 2.10.4 `.d.ts`). Three sibling contexts (A/B/C), each with its desk token → structural per-party privacy at the wire (PRIV-05), not render-time filtering.
- **Token shape is settled:** `{"https://daml.com/ledger-api": {ledgerId:"sandbox", applicationId:"umbra", actAs:[party], readAs:[party]}}`, HS256 with an arbitrary/empty dev secret, `Authorization: Bearer`. A 25-line `jsonwebtoken@9.0.3` (or zero-dep `crypto`) script reads `parties.json` → `web/src/tokens.json`.
- **`ledgerId` is the one drift risk** (Pitfall 2): default `"sandbox"` per docs, but make it one constant and verify live with a `curl /v1/query` before building panels.
- **Privacy tests are assertions on existing structure:** `query @T party` returns only stakeholder contracts, so `test_privacy_orders` (PRIV-01/02/04) and `test_privacy_confirmations` (PRIV-03) drop into `Tests.daml` reusing `initialize` + `seedCanonicalAndClose` + `canonicalAllocs`; copy-ready scripts provided. Phase 3 changes NO template field shapes — privacy was frozen in Phase 1.
- **Center count needs no operator token:** `RoundStats` observer = `desks`, so any desk token reads the shared count — keeps the operator token out of the browser entirely.
- **Codegen + install:** `daml codegen js daml/.daml/dist/umbra-0.1.0.dar -o web/daml.js` (or a `codegen.js` daml.yaml block) → `npm install ./web/daml.js/umbra --legacy-peer-deps`; all `web/` installs need `--legacy-peer-deps` (D3).

### File Created
`.planning/phases/03-privacy-proof-vertical-slice/03-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack (`@daml/*`, frontend deps) | HIGH | Provider/hook surface read from published 2.10.4 `.d.ts`; versions live-verified on npm |
| Per-party DamlLedger / 3-up wiring | HIGH | `createLedgerContext` documented for exactly this |
| JWT minting + transport | HIGH | Claim shape consistent across docs + search; matches DECISIONS |
| `ledgerId` value | MEDIUM | CITED `"sandbox"`; mitigated by one-constant + live-verify (Pitfall 2) |
| Privacy Daml tests | HIGH | `query @T party` semantics + existing Tests.daml patterns |

### Open Questions
- Exact sandbox `ledgerId` on this machine (verify via `curl /v1/query` — first frontend task).
- Exact generated `@daml.js/umbra` import subpaths + Int/Decimal-as-string encoding (confirm after first `daml codegen js`).

### Ready for Planning
Research complete. The planner can create PLAN.md files for: (1) codegen + `@daml.js/umbra` install, (2) the per-party token-mint script, (3) the two privacy Daml tests + RoundStats seed, (4) the Vite/React/Tailwind scaffold with the 3-up `createLedgerContext` per-party tree + party switcher + round-status indicator, (5) the live per-party `curl` verification. The UI-SPEC (gsd-ui-phase) supplies the visual layout that this wiring renders.
