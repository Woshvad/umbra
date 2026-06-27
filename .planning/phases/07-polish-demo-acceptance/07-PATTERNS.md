# Phase 7 — Patterns (file → closest analog)

**Mapped:** 2026-06-27. Frozen layers (daml/, solver/, web logic + data planes) are NOT touched —
only UI px polish, repo-root docs/orchestration, and verification.

## Workstream A — UI-07 (edit existing, follow their own established style)
| File (edit) | Pattern to follow | Notes |
|-------------|-------------------|-------|
| `web/src/components/PriceReveal.tsx` | itself (P6) | inline-style px literals; change only the 3 spots in 07-UI-SPEC |
| `web/src/views/TheatreView.tsx` | itself (P6) | restructure sealed-count to the comp's inline baseline row; headline margin |
| `web/src/components/CrossingChart.tsx` | itself (P6) | add `fillOpacity={0.7}` to the `p*` / `q=10` `<text>` |
| `web/src/components/AgentRationale.tsx` | sibling components that take `preview` (PriceReveal/CrossingChart receive `clearingPrice`/`matchedVolume`) | add a `preview` prop; thread from `AgentView.tsx`; bind the two numerals |
| `web/src/views/AgentView.tsx` | how `TheatreView`/`SettlementView` read the lifted `preview` from `operatorState` | pass `preview` down to `AgentRationale` |
| (sweep) `PrivacyView.tsx`, `DeskView.tsx`, components | each view's own P3/P6 style | comp re-verify; fix only real drift |

**Style invariant:** match each file's existing convention (inline `style={{}}` px literals + the
tailwind token classes `font-mono/font-display/font-body`, `text-NN`, `tabular-nums`). No new utilities.

## Workstream B — DEMO-01 (new repo-root files)
| File (new/rewrite) | Closest analog | Notes |
|--------------------|----------------|-------|
| `Makefile` (new, repo root) | spec §6 command surface (`make ledger/setup/solver/web/demo`); the existing `package.json` `tokens` script + `scripts/*.mjs` | `.PHONY`; granular targets + composite `demo`; commands = the exact run wiring in 07-RESEARCH |
| `README.md` (rewrite) | the current README's accurate sections (parties.json, hot-reload, .env) — keep those; replace the "stubbed" + "Makefile arrives in P7" language | document the full built system + `make demo` + manual flow |
| `package.json` (root, edit) | its existing `"tokens"` script | add `ledger`/`solver`/`web`/`test`/`demo:*` npm-script mirrors of the Makefile targets (Windows path) |

## Workstream C — DEMO-02/03/04
| Artifact | Analog | Notes |
|----------|--------|-------|
| live E2E driver (curl assertions) | `scripts/verify-privacy.mjs` (per-party `/v1/query` privacy check) + `solver/src/api.test.ts` (the endpoint contract) | run by the orchestrator at top level; not a committed script unless useful |
| `docs/DEMO.md` (new) | `spec.md` §17/§18 narrative + the CONTEXT money-shot description | 3-min script: setup → click-path → talking points → §4 numbers |
| `docs/01-privacy-3up.png`, `docs/02-atomic-settlement.png` (new) | `Umbra design/screenshots/` (the comp reference frames) | captured from the live polished UI |

## Threats / invariants to preserve (do not regress)
- **Privacy at the wire:** `web/src/tokens.json` holds ONLY desk tokens; the operator token stays in
  `scripts/.operator-token` (never under `web/src`); the Anthropic key never leaves `solver/`. The
  README/Makefile must not instruct putting the operator token or key in the browser. (T-03-06 / T-06-01 /
  SOLV-04.)
- **`.env` + tokens + parties.json stay gitignored** — never commit secrets or per-boot ids. `docs/`
  screenshots show the §4 fixture only (no secrets in frame).
- **No Claude git attribution** — all commits `woshvad <woshvad@gmail.com>`.
