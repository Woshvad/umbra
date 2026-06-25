# Stack Research

**Domain:** Daml/Canton dApp (sealed-bid batch-auction venue) + React frontend + Node solver service + Claude AI agent
**Researched:** 2026-06-25
**Confidence:** HIGH on all version pins (verified against npm registry + official Daml/Anthropic docs, not training data)

> **Bottom line:** Build the whole MVP on **Daml SDK 2.10.4** with `daml start` (HTTP JSON API on 7575). This is the spec's stated "primary path (fast iteration)" and it is the right call. Do **not** start on Daml 3.x / Canton 3.x / `cn-quickstart` LocalNet — it is the deploy-time stretch (§19) and uses a different (JSON Ledger API v2) wiring that `@daml/react` does not target. The single biggest install gotcha: `@daml/react@2.10.4` declares a **React 16/17** peer dependency, so React 18 needs `--legacy-peer-deps` (or an npm `overrides`) — see Version Compatibility.

---

## The Daml 2.x vs 3.x decision (the spec's #1 risk — resolved)

**Recommendation: Daml SDK `2.10.4` (the 2.x line). Pin it in `daml.yaml`.**

| | Daml **2.10.x** (RECOMMENDED) | Daml 3.x / Canton 3.x |
|---|---|---|
| Fast loop | `daml start` builds Daml + JS bindings + runs sandbox + **HTTP JSON API on :7575** in one command, with hot-reload (`r`↵) | No single `daml start`; uses Dockerized LocalNet (`cn-quickstart`) |
| Frontend API | **HTTP JSON API v1** — the API `@daml/react` / `@daml/ledger` were built for | **JSON Ledger API v2** — different request/response shapes; `@daml/react` is *not* the canonical client |
| Footprint | JVM sandbox, no Docker required | `cn-quickstart` LocalNet ≈ multi-GB Docker (validators, super-validator, CC wallet) |
| Maturity of JS bindings | `@daml/react/ledger/types@2.10.4` published & matched to this SDK | JS binding story for v2 is in flux; higher drift risk mid-hackathon |
| Hackathon fit | **Optimal** — fastest path to the privacy money shot | Deploy-time "it runs on Canton" claim only |

**Why 2.10.4 specifically:** it is the latest **stable** 2.x release (March 27, 2026 per the Daml releases page), so the `@daml/*@2.10.4` npm packages line up exactly with the SDK that `daml codegen js` ships, eliminating codegen/runtime version skew.

**Version-drift guard (keep this in `DECISIONS.md`):** run `daml version` first. If the installed SDK is a 2.10.x snapshot rather than 2.10.4, **match `@daml/*` npm packages to whatever `daml codegen js` actually emits** (read the version in the generated `@daml.js/<pkg>/package.json`) rather than hard-pinning 2.10.4. The Daml templates in §7 are all standard (templates/choices/`data`) and compile on either 2.x or 3.x, so the ledger code is portable; only the **JS binding + JSON API wiring** is line-specific. **Confidence: HIGH** that 2.x + `daml start` is the right primary path; **MEDIUM** on the exact patch (2.10.4) being what's installed on the build machine — detect and adapt.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Daml SDK** | `2.10.4` (pin in `daml.yaml` `sdk-version`) | Smart-contract language + sandbox + HTTP JSON API + `daml start` + Daml Script | Latest stable 2.x; one-command dev loop; the API line `@daml/react` targets |
| **Node.js** | `20.x` LTS | Runtime for solver service | Spec-mandated; matches the toolchain `@anthropic-ai/sdk@0.106.0` was built on (Node 20.20.2) |
| **TypeScript** | `5.4.x`–`5.6.x` | Solver + frontend typing; consumes generated `@daml.js` typings | Stable, well-supported by Vite 5 and the Daml TS codegen output |
| **React** | `18.3.1` | Frontend UI | Spec-mandated React 18; see peer-dep note below |
| **Vite** | `5.4.x` | Frontend dev server (:5173) + build | Fast HMR; clean ESM; pairs with React 18 + Tailwind |
| **Tailwind CSS** | `3.4.x` | Styling (implements the binding design comp) | Stable 3.x; do **not** jump to Tailwind 4 mid-hackathon (config/PostCSS pipeline differs and the design comp targets a v3 `tailwind.config.ts`) |
| **@anthropic-ai/sdk** | `0.106.0` | Claude API client in the solver (server-side only) | Current published version; native structured-output support |

### Daml → JS binding packages (must match the SDK)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@daml/react** | `2.10.4` | React hooks (`useStream`, `useQuery`, `useLedger`, `DamlLedger` provider) over the JSON API | Frontend `web/` |
| **@daml/ledger** | `2.10.4` | JS/TS Ledger client over HTTP JSON API (queries, exercises, streaming) | Frontend **and** solver service (`solver/` connects as `Operator`) |
| **@daml/types** | `2.10.4` | Core Daml↔TS type mappings (`Party`, `Decimal`, `ContractId`, etc.) | Transitive dep of the above + generated bindings |
| **@daml.js/<project>** | generated | Project-specific contract bindings (templates, choices, `data` types) emitted by `daml codegen js` | Imported by both frontend and solver |

> `@daml/ledger@2.10.4` runtime deps (FYI, all auto-installed): `ws@^7`, `cross-fetch@^3`, `isomorphic-ws@^4`, `events@^3`, `@mojotech/json-type-validation@^3`.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **express** | `4.19.x` | Solver HTTP API on :4000 (`/round`, `/round/:id`, `/solve-preview`, `/settle`) | `solver/` — spec §11 |
| **cors** | `2.8.x` | Allow the Vite dev origin (5173) to call the solver (4000) | `solver/` |
| **dotenv** | `16.x` | Load `ANTHROPIC_API_KEY`, `JSON_API_URL`, party tokens from `.env` | `solver/` only (key never reaches browser) |
| **jsonwebtoken** | `9.x` | Mint/inspect dev party JWTs for the JSON API (HS256, unsafe-secret dev mode) | Solver + a small script to emit per-party tokens for the party switcher |
| **zod** | `3.23.x` | Validate the solver's parsed JSON proposal shape before the deterministic re-check | `solver/` — belt-and-suspenders around the AI output |
| **vitest** | `2.x` | Unit tests for the TS clearing algorithm (§8, ≥5 scenarios) | `solver/` |
| **tailwindcss / postcss / autoprefixer** | `3.4.x / 8.x / 10.x` | Tailwind build pipeline | `web/` |
| **@vitejs/plugin-react** | `4.3.x` | React fast-refresh in Vite | `web/` |

> **Charts:** none. Spec §6 says hand-rolled SVG for the supply/demand crossing — do not add a chart lib.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `daml` assistant | `daml start`, `daml build`, `daml codegen js`, `daml script` | Installs the SDK pinned in `daml.yaml` automatically; run `daml version` first to detect what's there |
| Java/JDK 17+ | Required by the Daml sandbox (JVM) | No Docker needed for the `daml start` path — that's the whole point vs LocalNet |
| Makefile | `make ledger / setup / solver / web / demo` | Spec §6 command surface |
| concurrently (optional) | Run solver + web together under `make demo` | Or just background processes in the Makefile |

## The exact Daml → JS codegen workflow

`daml start` (the recommended dev loop) does all of this for you, in order:

1. `daml build` → compiles `daml/` into a **DAR**.
2. `daml codegen js` → reads the DAR, emits a JS package **per Daml package** with `.d.ts` typings into the configured output dir (conventionally `web/daml.js/` or `daml.js/`), published under the `@daml.js/<name>` scope. This is what the frontend/solver `import`.
3. Starts the **sandbox** ledger (gRPC on :6865).
4. Starts the **HTTP JSON API** on **:7575**, pointed at the sandbox.
5. Hot-reload: press `r` (then Enter on Windows) to rebuild Daml, regenerate bindings, and re-upload to the running ledger.

Wire codegen output in `daml.yaml`:

```yaml
sdk-version: 2.10.4
name: umbra
source: daml
codegen:
  js:
    output-directory: daml.js
    npm-scope: daml.js
```

Standalone (when not using `daml start`):

```bash
daml build
daml codegen js .daml/dist/umbra-0.0.1.dar -o daml.js
# then `npm install` the generated package into web/ and solver/
```

**Frontend usage shape** (React 18):

```tsx
import DamlLedger, { useQuery, useLedger, useStreamQueries } from "@daml/react";
import { Order } from "@daml.js/umbra/lib/Umbra/Auction";
// <DamlLedger token={partyToken} party={partyId} httpBaseUrl="http://localhost:7575"> ... </DamlLedger>
```

**Solver usage shape** (Node, as `Operator`):

```ts
import Ledger from "@daml/ledger";
const ledger = new Ledger({ token: operatorJwt, httpBaseUrl: "http://localhost:7575" });
// ledger.query(Round) / ledger.exercise(Round.Clear, cid, { clearingPrice, allocations })
```

## AI layer — strict JSON from Claude (spec §9, the differentiator)

**Use the SDK's native structured outputs, not hand-parsed text and not the older forced-tool-use hack.** Anthropic structured outputs are now **generally available** (no beta header required) on Haiku 4.5, Sonnet 4.6, Opus 4.8 (and others). The parameter moved from the old `output_format` to **`output_config.format`** with `type: "json_schema"`; constrained decoding guarantees the response is schema-valid JSON in `response.content[0].text`.

```ts
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const res = await anthropic.messages.create({
  model: "claude-haiku-4-5",         // see model choice below
  max_tokens: 1024,
  temperature: 0,                     // canonical deterministic agent (spec §9)
  system: AUCTION_RULES_VERBATIM,     // §8 rules
  messages: [{ role: "user", content: batchJson }],
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          clearingPrice: { type: "number" },
          allocations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                desk: { type: "string" },
                side: { type: "string", enum: ["Buy", "Sell"] },
                filledQty: { type: "integer" },
              },
              required: ["desk", "side", "filledQty"],
              additionalProperties: false,
            },
          },
          rationale: { type: "string" },
        },
        required: ["clearingPrice", "allocations", "rationale"],
        additionalProperties: false,
      },
    },
  },
});
// JSON is guaranteed-valid; still Zod-validate, then run the §8 deterministic re-check before submitting.
```

**Model recommendation:** **`claude-haiku-4-5`** for the canonical solver call — fastest, cheapest ($1/$5 per MTok), supports structured outputs, and the task is tiny (3 orders) so frontier reasoning is wasted. The deterministic core + on-ledger `Round.Clear` re-verification (§9) is the correctness backstop, so the model never needs to be "smart," only to emit the right JSON shape and a crisp `rationale`. **`claude-sonnet-4-6`** is the upgrade if the rationale narration needs to be richer for the demo, or for the stretch "competing solvers" (vary model/temperature across agents). Avoid Opus tiers here — latency and cost for no benefit on a 3-order batch.

**Determinism note (be honest in the demo):** `temperature: 0` plus structured outputs makes the JSON shape deterministic and the price near-deterministic, but LLM output is **not bit-for-bit guaranteed**. That is exactly why the spec's verify-don't-trust design exists — never submit the model's number unverified. **Confidence: HIGH** on the API mechanism and model availability.

**Compatibility fallback:** if a given account/region hasn't enabled GA structured outputs, the portable fallback is **forced tool use** — define a single `submit_clearing` tool with `strict: true` and `tool_choice: { type: "tool", name: "submit_clearing" }`; read the JSON from the `tool_use` block. Same schema, works across the 4.x line. Prefer `output_config.format`; keep this as the documented Plan B.

## Installation

```bash
# --- Ledger (Daml assistant; check what's installed first) ---
daml version                 # detect installed SDK; record in DECISIONS.md
# if absent: install latest 2.x stable per https://docs.daml.com (pins via daml.yaml: sdk-version: 2.10.4)

# --- Frontend (web/) ---
npm install react@18.3.1 react-dom@18.3.1
npm install @daml/react@2.10.4 @daml/ledger@2.10.4 @daml/types@2.10.4 --legacy-peer-deps
npm install -D vite@5.4 @vitejs/plugin-react@4.3 typescript@5.6 \
  tailwindcss@3.4 postcss@8 autoprefixer@10
# @daml.js/umbra is installed from the codegen output dir, e.g.:
#   npm install ./daml.js/umbra --legacy-peer-deps

# --- Solver service (solver/) ---
npm install @daml/ledger@2.10.4 @daml/types@2.10.4 \
  @anthropic-ai/sdk@0.106.0 express@4.19 cors@2.8 dotenv@16 jsonwebtoken@9 zod@3.23
npm install -D typescript@5.6 vitest@2 @types/express @types/cors @types/jsonwebtoken @types/node@20
# solver imports @daml.js/umbra too (the generated bindings)
```

> Add `--legacy-peer-deps` to the **frontend** installs (and any install that pulls `@daml/react`) — see below. The solver doesn't use `@daml/react`, so it installs cleanly without the flag.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@daml/react@2.10.4` | `react@16.12–17.x` (peer dep) | **Friction:** peer range is `^16.12.0 \|\| ^17.0.0` — it does **not** list React 18. React 18 works at runtime (the hooks API used is stable), but npm 7+ errors on install. **Fix:** install with `--legacy-peer-deps`, or add to `web/package.json`: `"overrides": { "@daml/react": { "react": "$react", "react-dom": "$react-dom" } }`. Record in DECISIONS.md. **Confidence: HIGH** (peer range read directly from the published package). |
| `@daml/react / ledger / types` | each other @ **identical** version | Always pin all three to the same version, and to the SDK that generated `@daml.js`. Mismatched versions cause subtle decode errors. |
| `@daml.js/umbra` (generated) | `@daml/types` of the **generating** SDK | If `daml version` ≠ 2.10.4, match `@daml/*` to the generated package's declared dep, not to 2.10.4. |
| `@anthropic-ai/sdk@0.106.0` | Node 20.x | Built on Node 20.20.2 / npm 11.6.2; no `engines` floor declared but Node 20 LTS is the safe target. |
| Tailwind `3.4.x` | Vite 5 + PostCSS 8 | Stay on v3; Tailwind 4 changes the config/PostCSS plugin model and the binding design comp's `tailwind.config.ts` targets v3. |
| Vite 5 + `@vitejs/plugin-react@4` | React 18 | Standard, frictionless combo. |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Daml 2.10.4 + `daml start` | Daml 3.x / Canton 3.x + `cn-quickstart` LocalNet | Only for the §19 stretch "true cross-node sub-transaction privacy" deploy claim, **after** the app works locally. It's multi-GB Docker and a different JSON Ledger API v2 wiring. |
| `output_config.format` (structured outputs) | Forced tool use (`tool_choice` + `strict:true`) | If GA structured outputs aren't enabled for the account/region. Same schema; read JSON from the `tool_use` block. |
| `claude-haiku-4-5` solver | `claude-sonnet-4-6` | If demo rationale needs richer prose, or for stretch "competing solvers" diversity. |
| Operator-custody `Asset` (spec §7.1) | Daml Finance Holding/Instrument/Batch settlement | Stretch §19 only — Daml Finance adds multi-party authority + allocate/approve complexity that the MVP deliberately sidesteps. |
| `@daml/ledger` over HTTP JSON API | gRPC Ledger API client | The Canton/3.x deploy path; not for the `daml start` MVP. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Starting on `cn-quickstart` LocalNet first | Multi-GB Docker, slow loop, different (v2) API that `@daml/react` doesn't target — kills hackathon iteration speed | `daml start` on Daml 2.10.4; treat LocalNet as deploy-time stretch (§19) |
| React 19 | `@daml/react` peer dep is 16/17; 18 already needs `--legacy-peer-deps`; 19 widens the gap with no benefit here | React `18.3.1` |
| Tailwind CSS 4 | New config/PostCSS pipeline; design comp targets a v3 `tailwind.config.ts` | Tailwind `3.4.x` |
| Mismatched `@daml/*` versions | Decode/serialization errors between bindings and runtime | Pin `react/ledger/types` + `@daml.js` all to the generating SDK |
| Anthropic key in the frontend | Leaks the secret; spec §15 forbids it | Key in `solver/` env only; browser talks to the solver HTTP API + JSON API with desk tokens |
| Trusting the model's clearing number | LLM output isn't bit-deterministic even at temp 0 | Deterministic §8 recompute + on-ledger `Round.Clear` re-verification |
| Old `output_format` top-level param | Superseded by `output_config.format` (works for now in a transition window) | `output_config.format` with `type: "json_schema"` |

## Stack Patterns by Variant

**If `daml version` reports a 2.10.x snapshot, not exactly 2.10.4:**
- Pin `daml.yaml` to that snapshot and set `@daml/*` to the version `daml codegen js` actually emits (read `@daml.js/<pkg>/package.json`).
- Because the generated bindings carry their own `@daml/types` dep, matching them avoids decode skew.

**If the team must demo "on Canton" (stretch §19):**
- Build/test entirely on `daml start` first; only then deploy the **same DAR** to `cn-quickstart` LocalNet.
- Expect a different client wiring (JSON Ledger API v2 / gRPC); keep the ledger code (standard templates) untouched and swap only the connection layer. Budget real time — it's the spec's #1 risk.

**If GA structured outputs are unavailable for the account:**
- Switch the solver's Claude call to forced tool use (`strict:true` tool + `tool_choice`). One function, same JSON schema, read from the `tool_use` block.

## Sources

- Daml releases / SDK version — https://github.com/digital-asset/daml/releases and https://docs.daml.com/ (SDK **2.10.4**, latest stable 2.x, March 2026) — HIGH
- `daml codegen js` workflow + `daml start` wiring (sandbox + HTTP JSON API on :7575, hot-reload) — https://docs.daml.com/app-dev/bindings-ts/daml2js.html and https://docs.daml.com/json-api/ — HIGH
- `@daml/react@2.10.4` version + **peer dep `react ^16.12 || ^17`** + deps on `@daml/ledger`/`@daml/types@2.10.4` — https://registry.npmjs.org/@daml/react/latest — HIGH
- `@daml/ledger@2.10.4` deps — https://registry.npmjs.org/@daml/ledger/latest — HIGH
- `@anthropic-ai/sdk@0.106.0`, built on Node 20.20.2 — https://registry.npmjs.org/@anthropic-ai/sdk/latest — HIGH
- Anthropic structured outputs (GA, `output_config.format`, no beta header; supported models incl. Haiku 4.5 / Sonnet 4.6 / Opus 4.8; strict tool-use fallback) — https://platform.claude.com/docs/en/build-with-claude/structured-outputs — HIGH
- Claude model IDs (`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-8`, pricing, structured-output support) — https://platform.claude.com/docs/en/about-claude/models/overview — HIGH
- React 18 vs Daml peer-dep friction & `--legacy-peer-deps` / npm `overrides` workaround — npm peer-dependency resolution behavior (npm 7+) — MEDIUM (mechanism standard; verified package range is HIGH)

---
*Stack research for: Daml/Canton sealed-bid batch-auction dApp + Claude solver agent*
*Researched: 2026-06-25*
