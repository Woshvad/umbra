---
phase: 01-skeleton-version-gate
plan: 01
subsystem: build-tooling
tags: [version-gate, daml, scaffold, hygiene, secrets]
requires: []
provides:
  - "daml/daml.yaml — SDK 2.10.4 pin + daml start wiring (source: ., init-script Umbra.Setup:initialize)"
  - "DECISIONS.md — version-gate record (LEDG-04): SDK 2.10.4, Daml 2.x HTTP JSON API line, React-18 peer-dep note, Canton ephemeral-party caveat, dev-only token caveat"
  - "Repo hygiene: .gitignore, .env.example (spec §15 keys), README.md run instructions"
  - "spec.md + Umbra design/ now git-tracked (versioned binding sources)"
affects:
  - "Plan 02 (templates) and Plan 03 (Setup/Tests) build against this pinned SDK + daml.yaml"
  - "Phase 3 frontend install uses the --legacy-peer-deps note recorded here"
tech-stack:
  added: []
  patterns:
    - "Daml SDK pinned via daml.yaml sdk-version (project-level version gate)"
    - "source: . (folder containing the Umbra/ package dir) — not source: Umbra"
    - "Secrets via .env (gitignored) + .env.example placeholders only"
key-files:
  created:
    - daml/daml.yaml
    - DECISIONS.md
    - .gitignore
    - .env.example
    - README.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
  tracked:
    - spec.md
    - "Umbra design/"
decisions:
  - "Pin Daml SDK 2.10.4 (detected as default via daml version) — the version gate (LEDG-04)"
  - "Build the Daml 2.x HTTP JSON API line on :7575, NOT Daml 3.x / cn-quickstart (stretch §19)"
  - "daml.yaml source: . (daml/ folder) so module Umbra.Asset resolves to daml/Umbra/Asset.daml"
  - "No codegen: block in Phase 1 — defer to Phase 3 when @daml.js/umbra has a consumer"
  - "Frontend (Phase 3) installs @daml/react@2.10.4 with --legacy-peer-deps (peer dep wants React 16/17)"
  - "parties.json gitignored (ephemeral per-boot Canton hint::<fingerprint> IDs)"
metrics:
  duration_min: 2
  completed: 2026-06-25
  tasks: 2
  files: 7
---

# Phase 1 Plan 01: Skeleton & Version Gate Summary

Passed the version gate (LEDG-04, the spec's #1 risk) by pinning **Daml SDK 2.10.4** in `daml/daml.yaml` with `daml start` wiring (`source: .`, `init-script: Umbra.Setup:initialize`, `start-navigator: false`, daml-prim/stdlib/script deps, no codegen block), recorded the five version-gate decisions in `DECISIONS.md`, and scaffolded repo hygiene (`.gitignore`, `.env.example`, `README.md`) while bringing `spec.md` + `Umbra design/` under git. Zero Daml templates authored — that lands in Plans 02/03.

## What Was Built

### Task 1 — Version gate (LEDG-04, LEDG-01 config)
- **`daml version`** confirmed `2.10.4` present and the default SDK on this machine.
- **`daml/daml.yaml`**: `sdk-version: 2.10.4`, `name: umbra`, `version: 0.1.0`, `source: .`, `init-script: Umbra.Setup:initialize`, `start-navigator: false`, dependencies `daml-prim`/`daml-stdlib`/`daml-script`. No `codegen:` block. A commented `script-options: --output-file parties.json` hint is left for Plan 03.
  - `source: .` is deliberate: `daml.yaml` lives in `daml/` and the package dir is `daml/Umbra/`, so the folder *containing* `Umbra/` is `.` (Pitfall 2 — `source: Umbra` would break the build).
- **`DECISIONS.md`** records: (D1) SDK 2.10.4 + toolchain-location caveat (`%APPDATA%\daml`, `~/bin/daml` shim, not on system PATH); (D2) Daml 2.x HTTP JSON API on :7575, NOT 3.x/cn-quickstart; (D3) React-18 `--legacy-peer-deps` note; (D4) Canton ephemeral-party caveat + Windows `r`+`Enter` hot-reload; (D5) dev-only `--allow-insecure-tokens` (T-01-05); (D6) secrets handling (T-01-04, ASVS V14).
- **Commit:** `a3f7984`

### Task 2 — Repo scaffolding + track binding sources
- **`.gitignore`**: excludes `.env`, `.daml/`, `*.dar`, `node_modules/`, `dist/`, `.dist/`, `parties.json`, SDK temp/OS noise. Explicitly does NOT ignore `spec.md` / `Umbra design/`.
- **`.env.example`**: spec §15 keys with empty/placeholder values only — `ANTHROPIC_API_KEY=` (empty), `JSON_API_URL=http://localhost:7575`, `SOLVER_PORT=4000`, `ROUND_SECONDS=60`, `PRODUCT_NAME=Umbra`. Comment notes the key is solver-only, never frontend, never committed.
- **`README.md`** (87 lines): tech stack, repo layout, prerequisites, `daml build` / `daml start` (with the Windows `r`+`Enter` hot-reload + firewall note), `.env` setup, `parties.json` note, `daml test`. Direct `daml`/`node` commands only — no `make`.
- **`spec.md`** and **`Umbra design/`** (incl. `Umbra.dc.html`, `support.js`, `.thumbnail`, 7 screenshots) staged and committed — now git-tracked.
- **Commit:** `31bc0a6`

## Verification Results

- `daml version` → `2.10.4` (default). Gate passed.
- `daml.yaml` greps: `sdk-version: 2.10.4` ×1, `init-script: Umbra.Setup:initialize` ×1, `^source:\s*\.$` ×1, `source: Umbra` ×0, uncommented `codegen:` ×0 — all pass.
- `daml build` ran clean and produced `.daml/dist/umbra-0.1.0.dar` (no modules yet, but `source: .` resolves; compilation green is the gate for Plan 02 once templates land).
- `DECISIONS.md`: `2.10.4` ×7, `legacy-peer-deps` ×1, `allow-insecure-tokens` ×2 — all ≥ required.
- `.gitignore`/`.env.example`/`README.md` grep gates → `SCAFFOLD_OK`; no real secret in `.env.example`; README ≥ 15 lines with `daml start` + `r`+`Enter`; no real `.env` present.
- `git ls-files` confirms `spec.md` + `Umbra design/` tracked; `.daml/` correctly NOT staged.

## Deviations from Plan

None — plan executed exactly as written. Note: `daml build` *succeeded* (rather than failing with "no modules found" as the plan's `<verify>` anticipated) because `source: .` resolves to a valid empty source folder; the binding assertion was the `daml.yaml`/`DECISIONS.md` greps, which all passed.

## Threat Surface

All Phase-1 threat-register items are config-level and satisfied:
- **T-01-04** (secret leakage) — `.env` gitignored; `.env.example` ships empty `ANTHROPIC_API_KEY=`; documented solver-only.
- **T-01-05** (insecure dev JWT) — `--allow-insecure-tokens` recorded in DECISIONS.md as dev-sandbox only.
- **T-01-SC** (package installs) — none occurred (pure-Daml skeleton; SDK-bundled deps only).

No new security-relevant surface introduced beyond the threat model.

## Known Stubs

None. (No Daml templates or scripts authored in this plan; `Umbra.Setup:initialize` referenced by `init-script` is created in Plan 03.)

## Next

- **Plan 02:** author the six templates (`Asset`/`Venue`/`Order`/`Round`/`RoundStats`/`TradeConfirmation`) with frozen field shapes + `Round.Clear` placeholder; `daml build` must go green.
- **Plan 03:** `Setup.daml` (`initialize`/`exportParties`/`runCanonicalRound`) + `Tests.daml`; finalize the `parties.json` export mechanism.

## Self-Check: PASSED

All created files exist (daml/daml.yaml, DECISIONS.md, .gitignore, .env.example, README.md, 01-01-SUMMARY.md); both task commits exist (a3f7984, 31bc0a6); spec.md + Umbra design/ confirmed git-tracked.
