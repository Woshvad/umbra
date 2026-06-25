---
phase: 03-privacy-proof-vertical-slice
plan: 02
subsystem: ui
tags: [daml-codegen, vite, react, tailwind, jwt, hs256, daml-js, frontend-scaffold]

# Dependency graph
requires:
  - phase: 01-foundation-and-version-gate
    provides: "daml.yaml SDK 2.10.4 pin, parties.json export, Umbra.* templates (Asset/Auction/Roles)"
  - phase: 02-clearing-and-settlement
    provides: "frozen Order/RoundStats/TradeConfirmation/Round/Venue/Asset template shapes that codegen binds"
provides:
  - "@daml.js/umbra-0.1.0 typed JS bindings generated from umbra-0.1.0.dar"
  - "web/ scaffold (Vite 5.4 + React 18.3.1 + TypeScript + Tailwind 3.4) that passes npm run build"
  - "web/tailwind.config.ts — the binding comp theme (paper/ink/lime/red/redact tokens, 3 fonts, redaction gradient, 8 keyframes)"
  - "Vite dev proxy /v1 -> JSON API :7575 (ws true)"
  - "scripts/mint-tokens.mjs — zero-dep HS256 per-party dev-JWT minter (Daml claim shape)"
  - "web/src/config.ts — JSON_API_URL + DAML_LEDGER_ID drift constants"
affects: [03-03 Privacy view, Phase 4 solver service, Phase 6 remaining views]

# Tech tracking
tech-stack:
  added: [vite@5.4.21, "@vitejs/plugin-react@4.7.0", react@18.3.1, react-dom@18.3.1, tailwindcss@3.4.19, postcss@8.5.15, autoprefixer@10.4.20, "@daml/react@2.10.4", "@daml/ledger@2.10.4", "@daml/types@2.10.4", "@daml.js/umbra-0.1.0 (generated)", typescript@5.6.3]
  patterns: ["daml codegen js -> file: bindings consumed via --legacy-peer-deps", "zero-dep node:crypto HS256 JWT minting", "operator token kept out of the browser bundle (web/src) by writing it to scripts/.operator-token"]

key-files:
  created: [web/package.json, web/vite.config.ts, web/tailwind.config.ts, web/postcss.config.js, web/tsconfig.json, web/tsconfig.node.json, web/index.html, web/src/main.tsx, web/src/App.tsx, web/src/index.css, web/src/config.ts, web/src/vite-env.d.ts, scripts/mint-tokens.mjs, package.json]
  modified: [daml/daml.yaml, .gitignore]

key-decisions:
  - "Generated package is @daml.js/umbra-0.1.0 at web/daml.js/umbra-0.1.0/ (name = <darname>-<version>), NOT @daml.js/umbra as the plan assumed"
  - "Selected the zero-dep node:crypto HS256 path (Task 1 gate); jsonwebtoken NOT installed"
  - "Operator token written to scripts/.operator-token (gitignored, CLI-only), NEVER into web/src — stricter than the plan's 'all four in tokens.json'"
  - "Mint script reads daml/parties.json (real hint::fingerprint IDs) in preference to repo-root parties.json (plain names)"
  - "Added a codegen.js block to daml.yaml so daml start auto-regenerates bindings"

patterns-established:
  - "Frontend installs always use --legacy-peer-deps (D3) — committed package-lock reflects it"
  - "Per-boot generated/credential state (web/daml.js/, web/src/tokens.json, scripts/.operator-token) is gitignored; only source + lockfile are tracked"

requirements-completed: [PRIV-05, UI-01, UI-03]

# Metrics
duration: 9min
completed: 2026-06-25
---

# Phase 3 Plan 02: Codegen + Frontend Scaffold + Token Minter Summary

**Generated @daml.js/umbra-0.1.0 typed bindings, stood up a build-green Vite 5.4 + React 18.3.1 + Tailwind 3.4 web/ scaffold carrying the binding comp theme + a :7575 JSON-API proxy, and wrote a zero-dependency node:crypto HS256 per-party JWT minter that keeps the operator token out of the browser bundle.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-25T17:03:27Z
- **Completed:** 2026-06-25T17:12:01Z
- **Tasks:** 4 (Task 1 = supply-chain gate, satisfied via zero-dep path)
- **Files modified:** 16 (14 created, 2 modified)

## Accomplishments
- `daml codegen js` produced typed `@daml.js/umbra-0.1.0` bindings; the import subpaths are recorded below for Plan 03-03.
- `web/` compiles: `cd web && npm run build` exits 0 (tsc --noEmit clean + vite build → dist/).
- `web/tailwind.config.ts` transcribes the binding comp theme verbatim (paper/ink/lime/red/redact + buy/sell/flame, Space Grotesk / IBM Plex Mono / Inter, the redaction `repeating-linear-gradient(90deg,#0A0A0A 0 5px,#262626 5px 7px)`, the 8 keyframes).
- Zero-dep `scripts/mint-tokens.mjs` mints correct Daml-claim HS256 tokens; the operator token is written out of `web/src` (D6 / threat T-03-06).

## @daml.js/umbra-0.1.0 Import Subpaths (for Plan 03-03)

> Generated package name: **`@daml.js/umbra-0.1.0`** (installed `file:./daml.js/umbra-0.1.0`). Module layout mirrors the Daml modules under `lib/Umbra/`.

| Import from | Templates / types |
|-------------|-------------------|
| `@daml.js/umbra-0.1.0/lib/Umbra/Auction` | `Order`, `RoundStats`, `TradeConfirmation`, `Round`, `Clear`, `ClearResult`, `CloseRound`, `Retire`, `OrderStatus`, `RoundStatus` |
| `@daml.js/umbra-0.1.0/lib/Umbra/Roles` | `Venue`, `SubmitOrder` |
| `@daml.js/umbra-0.1.0/lib/Umbra/Asset` | `Asset`, `Split`, `Merge`, `Reassign` |
| `@daml.js/umbra-0.1.0/lib/Umbra/Clearing` | `Side`, `Allocation`, `OrderView` |

## Token Path Decision (for Plan 03-03)
- **Zero-dep crypto path** was used (Task 1). `scripts/mint-tokens.mjs` uses `node:crypto` `createHmac('sha256', '')` + base64url. No `jsonwebtoken` in the dependency tree.
- Browser imports `web/src/tokens.json` = `{ bankA:{party,token}, bankB:{…}, bankC:{…} }` — **desk tokens only**. There is no `operator` key in that file. The operator token lives at `scripts/.operator-token` (gitignored) for CLI/live-verify/Phase-4 use.
- Both files are per-boot; re-run `node scripts/mint-tokens.mjs` (or `cd web && npm run tokens`) after every `daml start`.

## Task Commits

1. **Task 2: daml codegen js → bindings (+ daml.yaml codegen block)** - `113a1fb` (feat)
2. **Task 3: web/ scaffold with comp theme + :7575 proxy** - `c1db0b7` (feat)
3. **Task 4: zero-dep HS256 mint script** - `3fa4e83` (feat)

(Task 1 was a supply-chain verification gate — satisfied by selecting the zero-dep crypto path; no commit.)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `daml/daml.yaml` - Added `codegen.js` block (output `../web/daml.js`, scope `daml.js`) for auto-regen on `daml start`.
- `web/package.json` - umbra-web; scripts dev/build/preview/tokens; pinned deps incl. `file:./daml.js/umbra-0.1.0`.
- `web/vite.config.ts` - React plugin, dev server :5173, `/v1` proxy → :7575 (ws true).
- `web/tailwind.config.ts` - The binding comp theme (verbatim from 03-UI-SPEC).
- `web/postcss.config.js` - tailwindcss + autoprefixer.
- `web/tsconfig.json` / `web/tsconfig.node.json` - Strict Vite-React TS config.
- `web/index.html` - Google Fonts link (Space Grotesk/IBM Plex Mono/Inter) + root + module script.
- `web/src/index.css` - @tailwind layers + comp global resets (paper bg, lime ::selection).
- `web/src/main.tsx` - React 18 createRoot.
- `web/src/App.tsx` - Placeholder paper-bg + UMBRA wordmark (Plan 03-03 fills the shell + Privacy view).
- `web/src/config.ts` - `JSON_API_URL='/'`, `DAML_LEDGER_ID='sandbox'` drift constants.
- `web/src/vite-env.d.ts` - Vite client types.
- `scripts/mint-tokens.mjs` - Zero-dep per-party HS256 JWT minter.
- `package.json` (root) - `tokens` script.
- `.gitignore` - Added `web/daml.js/`, `web/src/tokens.json`, `scripts/.operator-token`.

## Decisions Made
- See key-decisions in frontmatter. Most load-bearing: the real generated package name is `@daml.js/umbra-0.1.0` (not `@daml.js/umbra`); Plan 03-03 must import from `@daml.js/umbra-0.1.0/lib/Umbra/...`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Generated package name/path differs from the plan's assumption**
- **Found during:** Task 2 (codegen)
- **Issue:** The plan and its verify assumed `@daml.js/umbra` at `web/daml.js/umbra/package.json`. `daml codegen js` (SDK 2.10.4 `daml2js`) actually emits `@daml.js/umbra-0.1.0` at `web/daml.js/umbra-0.1.0/` (directory + npm name = `<dar-name>-<version>`), and declares `@daml/types` under `peer-dependencies` (not `dependencies`).
- **Fix:** Installed from `file:./daml.js/umbra-0.1.0`; recorded the true import subpaths; adapted the verify to the real path (`web/daml.js/umbra-0.1.0/package.json`, which contains `@daml/types`).
- **Files modified:** web/package.json (dependency path)
- **Verification:** `test -f web/daml.js/umbra-0.1.0/package.json && grep @daml/types` → CODEGEN_OK; `npm install` linked `node_modules/@daml.js/umbra-0.1.0`.
- **Committed in:** `113a1fb` / `c1db0b7`

**2. [Rule 3 - Blocking] tsconfig.node.json referenced project could not disable emit**
- **Found during:** Task 3 (build gate)
- **Issue:** `tsc --noEmit` failed: TS6310 — a `composite` referenced project may not set `noEmit: true`.
- **Fix:** Replaced `noEmit:true` with `emitDeclarationOnly:true` + `outDir:./.tsbuild-node` on the node tsconfig (standard Vite scaffold pattern).
- **Files modified:** web/tsconfig.node.json
- **Verification:** `npm run build` then exits 0.
- **Committed in:** `c1db0b7`

**3. [Rule 2 - Missing Critical / Security] Operator token kept entirely out of web/src**
- **Found during:** Task 4 (mint script)
- **Issue:** The plan's literal Task-4 spec writes all four identities (incl. operator) into `web/src/tokens.json`. Threat T-03-06 (mitigate) + orchestrator constraint require the operator's broad-authority token never enter the browser bundle.
- **Fix:** Mint script writes only desk tokens (bankA/B/C) to `web/src/tokens.json`; the operator token goes to `scripts/.operator-token` (gitignored, CLI-only). Documented in the script header and SUMMARY.
- **Files modified:** scripts/mint-tokens.mjs, .gitignore
- **Verification:** Mint verify asserts `tokens.operator` is absent from web/src and the bankA claim is correct → MINT_OK.
- **Committed in:** `3fa4e83`

**4. [Rule 1 - Bug] Mint reads daml/parties.json (real IDs) not just repo-root parties.json**
- **Found during:** Task 4
- **Issue:** Repo-root `parties.json` holds plain names (`"bankA":"bankA"`); the real per-boot `hint::fingerprint` IDs the sandbox knows are in `daml/parties.json`. Tokens built from plain names would 401 against a live sandbox.
- **Fix:** Script prefers `daml/parties.json`, falls back to repo-root `parties.json`.
- **Files modified:** scripts/mint-tokens.mjs
- **Verification:** Mint output: `Read parties from: …\daml\parties.json`; actAs[0] === the fingerprint party.
- **Committed in:** `3fa4e83`

---

**Total deviations:** 4 auto-fixed (2 bug, 1 blocking, 1 missing-critical/security)
**Impact on plan:** All necessary for correctness/security/build. No scope creep — only a placeholder App was added (real UI is Plan 03-03).

## Issues Encountered
- npm reported 2 audit advisories (1 moderate, 1 high) in the transitive dev/runtime tree at the pinned versions. Not addressed: the versions are pinned by CLAUDE.md / RESEARCH for SDK compatibility, and `npm audit fix --force` would break the `@daml/*` peer-pinned line. Out of scope for this scaffold; logged for later review.

## Known Stubs
- `web/src/App.tsx` is an intentional placeholder (paper bg + UMBRA wordmark) with `// Plan 03-03 fills this in`. The real global shell + 3-up Privacy view are Plan 03-03. This is documented and scoped, not a blocking stub.

## User Setup Required
None — no external service configuration. Note the per-boot ordering for live work (Plan 03-03 / demos): `daml start` → export `parties.json` → `npm run tokens` → `npm run dev`.

## Next Phase Readiness
- Plan 03-03 can import the typed bindings from the recorded `@daml.js/umbra-0.1.0/lib/Umbra/*` subpaths, mount per-desk `<DamlLedger>` providers with `web/src/tokens.json`, and build the Privacy view on the comp theme that is already wired.
- Live drift check still pending (Plan 03-03): verify `DAML_LEDGER_ID='sandbox'` against `/v1/query` with a freshly minted desk token before relying on it (RESEARCH Pitfall 2).

## Self-Check: PASSED

- All created files verified present (codegen package, web scaffold, mint script, build dist/, minted token files).
- All three task commits verified in git log: `113a1fb`, `c1db0b7`, `3fa4e83`.

---
*Phase: 03-privacy-proof-vertical-slice*
*Completed: 2026-06-25*
