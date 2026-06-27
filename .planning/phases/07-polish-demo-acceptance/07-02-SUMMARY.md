---
phase: 07-polish-demo-acceptance
plan: 02
subsystem: repo-root-docs-orchestration
tags: [makefile, readme, npm-scripts, demo, privacy-docs, DEMO-01]
requires:
  - "The built daml/solver/web layers (Phases 1–6) — frozen, untouched"
  - "scripts/mint-tokens.mjs, scripts/verify-privacy.mjs"
provides:
  - "Repo-root Makefile (granular + composite demo targets)"
  - "Root package.json npm-script mirror (Windows path)"
  - "Full built-system README.md"
affects:
  - "DEMO-01 (a stranger can run the system)"
tech-stack:
  added: []
  patterns:
    - "document-the-flow + best-effort orchestration (manual 4-terminal flow is the contract)"
    - "every Makefile target mirrored as a root npm script for the no-make Windows box"
key-files:
  created:
    - Makefile
    - .planning/phases/07-polish-demo-acceptance/07-02-SUMMARY.md
  modified:
    - package.json
    - README.md
decisions:
  - "demo target prints the canonical 4-terminal flow rather than backgrounding a JVM boot (07-RESEARCH open-question 1)"
  - "no backgrounding demo npm script — not portable; manual flow documented in README instead"
  - "conservative clean: only gitignored per-boot ephemera + daml/.daml/dist; never node_modules"
metrics:
  duration: "~6 min"
  completed: 2026-06-27
---

# Phase 7 Plan 02: Makefile + README + npm-script mirror Summary

DEMO-01 runway: a repo-root `Makefile` (granular + composite `demo`), a root
`package.json` npm-script mirror for the no-`make` Windows box, and a full README
rewrite documenting the built end-to-end system — clone → run → privacy → clear at
$100.00 → atomic settle. No code/logic changes; the daml/solver/web layers are
frozen.

## What was built

### Task 1 — Makefile + npm-script mirror

**`Makefile`** (repo root, `.PHONY` on every target, `help` as default goal):

| Target | Command | Notes |
|--------|---------|-------|
| `help` | (lists targets) | default goal — bare `make` is self-documenting |
| `install` | `cd web && npm install --legacy-peer-deps` then `cd solver && npm install` | web needs legacy-peer-deps for @daml/react |
| `ledger` | `cd daml && daml start` | long-running; :7575; exports parties.json |
| `tokens` | `node scripts/mint-tokens.mjs` | needs parties.json; runs after ledger |
| `solver` | `cd solver && npm run dev` | Express :4000 |
| `web` | `cd web && npm run dev` | Vite :5173 |
| `test` | `cd daml && daml test` | self-contained |
| `verify-privacy` | `node scripts/verify-privacy.mjs` | live wire check |
| `clean` | rm `daml/.daml/dist`, `daml/parties.json`, `web/src/tokens.json`, `scripts/.operator-token` | conservative; keeps node_modules |
| `demo` | prints the canonical 4-terminal flow | document-the-flow (no JVM background juggling) |

**`package.json`** (root) — npm-script mirror added (kept existing `tokens`):
`install:all`, `ledger`, `tokens`, `solver`, `web`, `test`, `verify-privacy`.
Each uses simple shell-portable `cd X && Y` (no PID backgrounding; no `demo` npm
script).

### Task 2 — README.md rewrite

Replaced the Phase-1-era README (which called solver/web "stubbed" and said "a
Makefile arrives in Phase 7"). New sections: one-paragraph pitch (clears at
$100.00); **two-data-plane architecture** (desk plane → JSON API :7575 as own
parties = privacy at the wire; operator plane → solver :4000, never the browser; AI
OFF the critical path via verify-don't-trust); repo layout (solver/ + web/ BUILT;
added docs/); prerequisites (Daml 2.10.4 / JDK 17+ / Node 20+); Quick start
(`make demo` + the canonical manual 4-terminal flow); per-service commands + ports
table (7575/4000/5173); the §4/$100.00 reference (fills A=10/B=8/C=2, finals
A:10/4000 · B:12/1800 · C:13/1200); tests (`daml test`, `web build` + vitest,
`solver test`, `verify-privacy`); links to spec.md / DECISIONS.md / docs/DEMO.md
(noted as created in the acceptance pass). Kept verbatim: parties.json
ephemerality (Option A/B), hot-reload `r`↵, `.env` / ANTHROPIC_API_KEY-solver-only.

## Privacy invariants (preserved in docs)

- Desk tokens ONLY in `web/src/tokens.json`; operator token ONLY in
  `scripts/.operator-token` (never under web/src); `ANTHROPIC_API_KEY` read solely
  by `solver/`. All three gitignored / never committed — stated explicitly in the
  README secret/token boundary section.
- Secret-leak scan of README + Makefile (JWT / sk-ant / `hint::` party-ID patterns)
  returned empty. No token, key, or parties.json content committed.

## Acceptance checks

- **Task 1 gate:** `node -e` root-npm-scripts check → `root npm scripts OK:
  install:all, ledger, tokens, solver, web, test, verify-privacy`. `grep -c
  '^\.PHONY' Makefile` → **10** (≥ 1). PASS.
- **Task 2 gate:** `make demo` ∧ 7575 ∧ 4000 ∧ 5173 ∧ 100.00 ∧ `daml test`
  present; `stubbed` ∧ `Makefile arrives` absent → **README content checks OK**.
  PASS.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `2364ed4` — chore(07-02): add repo-root Makefile (granular + demo targets) + npm-script mirror
- `3874857` — docs(07-02): rewrite README as full built-system guide (run flow, ports, §4 ref, privacy boundary)

Both authored AND committed by `woshvad <woshvad@gmail.com>` — zero Claude/Anthropic attribution.

## Self-Check: PASSED
- FOUND: Makefile
- FOUND: README.md
- FOUND: package.json
- FOUND commit: 2364ed4
- FOUND commit: 3874857
