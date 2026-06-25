<!-- GSD:project-start source:PROJECT.md -->

## Project

**Umbra**

Umbra is a private, **sealed-bid uniform-price batch-auction venue** for tokenized securities, settled **atomically (DvP)** on **Canton**, with a **Claude AI agent acting as the auction solver**. Institutions (trading desks) submit sealed limit orders for a tokenized bond during a short window; no one — not rival desks, not the public — can see anyone else's orders. When the window closes, the AI solver computes the single uniform clearing price that maximizes matched volume, and the whole batch settles delivery-versus-payment in one transaction. Built for the Encode Club / HackCanton hackathon (Track 1 — Private DeFi & Capital Markets).

**Core Value:** **The privacy money shot must work and be screenshot-ready:** three desks submit orders blind to each other → an AI solver clears them at one uniform price ($100.00 on the canonical fixture) → the entire batch settles atomically in a single Canton transaction, with each desk seeing only its own fill. If everything else is rough, this end-to-end vertical slice (privacy → clearing → atomic settlement) is what wins, so it is the top build priority.

### Constraints

- **Tech stack**: Daml + Canton (ledger) · React 18 + TypeScript + Vite + Tailwind (frontend) · Node 20 + TypeScript (solver service) · `@anthropic-ai/sdk` — fixed by spec §6
- **Secrets**: `ANTHROPIC_API_KEY` via env only, read solely by `solver/`; **never** in the frontend, never committed. `.env` gitignored; ship `.env.example`
- **Version drift (spec's #1 risk)**: detect the installed Daml SDK and adapt import paths from official docs — Daml 2.x exposes the HTTP JSON API used by `@daml/react`; Daml 3.x / Canton 3.x uses the JSON Ledger API v2 + `cn-quickstart`. Keep templates standard so they compile on either line. Record the version in `DECISIONS.md`
- **Determinism / correctness**: the AI's numbers are never used unverified; the deterministic clearing algorithm (§8) + on-ledger `Round.Clear` re-verification are the source of truth. The canonical fixture must clear at **$100.00**
- **Design fidelity**: the `Umbra design/` comp is binding — frontend must match it exactly
- **Git attribution**: Claude must **never** be added as a contributor to any commit or push during this build (no `Co-Authored-By`, no "Generated with" — strict user requirement). Author/committer stays `woshvad`
- **Timeline**: hackathon pace — ship a working vertical slice (privacy → clear → atomic settle) **by the end of Phase 3** even if everything after is rough; defer all stretch goals to after the polish phase
- **Ports** (defaults): JSON API `7575`, Vite dev `5173`, solver service `4000`

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## The Daml 2.x vs 3.x decision (the spec's #1 risk — resolved)

| | Daml **2.10.x** (RECOMMENDED) | Daml 3.x / Canton 3.x |
|---|---|---|
| Fast loop | `daml start` builds Daml + JS bindings + runs sandbox + **HTTP JSON API on :7575** in one command, with hot-reload (`r`↵) | No single `daml start`; uses Dockerized LocalNet (`cn-quickstart`) |
| Frontend API | **HTTP JSON API v1** — the API `@daml/react` / `@daml/ledger` were built for | **JSON Ledger API v2** — different request/response shapes; `@daml/react` is *not* the canonical client |
| Footprint | JVM sandbox, no Docker required | `cn-quickstart` LocalNet ≈ multi-GB Docker (validators, super-validator, CC wallet) |
| Maturity of JS bindings | `@daml/react/ledger/types@2.10.4` published & matched to this SDK | JS binding story for v2 is in flux; higher drift risk mid-hackathon |
| Hackathon fit | **Optimal** — fastest path to the privacy money shot | Deploy-time "it runs on Canton" claim only |

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

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `daml` assistant | `daml start`, `daml build`, `daml codegen js`, `daml script` | Installs the SDK pinned in `daml.yaml` automatically; run `daml version` first to detect what's there |
| Java/JDK 17+ | Required by the Daml sandbox (JVM) | No Docker needed for the `daml start` path — that's the whole point vs LocalNet |
| Makefile | `make ledger / setup / solver / web / demo` | Spec §6 command surface |
| concurrently (optional) | Run solver + web together under `make demo` | Or just background processes in the Makefile |

## The exact Daml → JS codegen workflow

# then `npm install` the generated package into web/ and solver/

## AI layer — strict JSON from Claude (spec §9, the differentiator)

## Installation

# --- Ledger (Daml assistant; check what's installed first) ---

# if absent: install latest 2.x stable per https://docs.daml.com (pins via daml.yaml: sdk-version: 2.10.4)

# --- Frontend (web/) ---

# @daml.js/umbra is installed from the codegen output dir, e.g.:

#   npm install ./daml.js/umbra --legacy-peer-deps

# --- Solver service (solver/) ---

# solver imports @daml.js/umbra too (the generated bindings)

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

- Pin `daml.yaml` to that snapshot and set `@daml/*` to the version `daml codegen js` actually emits (read `@daml.js/<pkg>/package.json`).
- Because the generated bindings carry their own `@daml/types` dep, matching them avoids decode skew.
- Build/test entirely on `daml start` first; only then deploy the **same DAR** to `cn-quickstart` LocalNet.
- Expect a different client wiring (JSON Ledger API v2 / gRPC); keep the ledger code (standard templates) untouched and swap only the connection layer. Budget real time — it's the spec's #1 risk.
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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

---

## ⚠ Critical Project Rules (read before any commit or frontend work)

These are strict, user-mandated rules for the entire Umbra build. They override default tooling behavior.

1. **Never add Claude as a git contributor.** No `Co-Authored-By: Claude ...`, no `🤖 Generated with Claude Code`, no Anthropic attribution in any commit message or PR body — ever, for any commit/push during this build. Keep author/committer = `woshvad <woshvad@gmail.com>`. This overrides the default Claude Code commit-trailer behavior.
2. **The design comp is binding — follow it 100%.** `Umbra design/` (`Umbra.dc.html` + `support.js` + `screenshots/`) is the pixel-accurate source of truth for all frontend work. Match its tokens (`#F4F1EA` paper · `#0A0A0A` ink · `#D6FB3C` lime · red CTA), typography (Space Grotesk · IBM Plex Mono · Inter), layout, redaction + draw-on motifs, and the five numbered views exactly. Run `/gsd-ui-phase` against it before building UI.
3. **`spec.md` (repo root) is the authoritative spec.** Every product/technical decision is locked there — build to spec, do not seek clarification. The canonical §4 fixture must clear at exactly **$100.00** (fills A=10 / B=8 / C=2) and is the continuous correctness reference.

