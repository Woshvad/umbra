---
phase: 01-skeleton-version-gate
verified: 2026-06-25T15:02:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 1: Skeleton & Version Gate Verification Report

**Phase Goal:** Freeze the Daml data model and the SDK/API line so every other layer codes against a known, compiling contract that seeds the canonical §4 world.
**Verified:** 2026-06-25T15:02:00Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth (success criteria) | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | Installed Daml SDK detected, pinned, recorded BEFORE other work (version gate, LEDG-04) | ✓ VERIFIED | `daml version` → 2.10.4 default; `daml/daml.yaml` `sdk-version: 2.10.4`; `DECISIONS.md` records SDK + Daml 2.x HTTP JSON API line + React-18 `--legacy-peer-deps`; commit `a3f7984` is the first task. |
| 2 | `daml start` compiles project + runs sandbox + HTTP JSON API on :7575 (LEDG-01) | ✓ VERIFIED | `daml build` exit 0 → `umbra-0.1.0.dar`. Live `daml start` boot: Canton sandbox :6865 → DAR uploaded → init-script ran → JSON API `ServerBinding(/127.0.0.1:7575)`; `curl :7575/readyz` **HTTP 200**, `curl :7575/livez` **HTTP 200**. |
| 3 | `Setup.daml` allocates 4 parties + mints §4 holdings; writes `parties.json` (LEDG-02) | ✓ VERIFIED | `daml test` exit 0 incl. `test_setup_seeds`; init-script during `daml start` wrote `daml/parties.json` with operator/bankA/bankB/bankC (Canton `hint::fingerprint` IDs); §4 mints A→5000.0 USDCx, B→20 BONDX+1000.0 USDCx, C→15 BONDX+1000.0 USDCx. |
| 4 | `Asset` operator-custodied + field names/`Allocation` frozen as cross-layer contract (LEDG-03) | ✓ VERIFIED | grep audit: `Asset` sig operator/obs owner + Split/Merge/Reassign; `Order` sig operator,desk / NO observer; `TradeConfirmation` obs `desk` (singular); `Round`/`RoundStats`/`Venue` obs `desks`; data `Side`/`OrderStatus`/`RoundStatus`/`Allocation`/`ClearResult` present; `test_asset_split_merge` green. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `daml/daml.yaml` | SDK pin + daml start wiring | ✓ EXISTS + SUBSTANTIVE | `sdk-version: 2.10.4`, `source: .`, `init-script: Umbra.Setup:initialize`, `script-options: [--output-file, parties.json]`, daml-prim/stdlib/script deps, no codegen block |
| `daml/Umbra/Asset.daml` | operator-custody Asset | ✓ EXISTS + SUBSTANTIVE | sig operator/obs owner, ensure ≥0.0, Split/Merge/Reassign |
| `daml/Umbra/Auction.daml` | Order/Round/RoundStats/TradeConfirmation + data types | ✓ EXISTS + SUBSTANTIVE | all four templates + Side/OrderStatus/RoundStatus/Allocation/ClearResult; Round.Clear signature-frozen placeholder |
| `daml/Umbra/Roles.daml` | Venue + nonconsuming SubmitOrder | ✓ EXISTS + SUBSTANTIVE | sig operator/obs desks, nonconsuming SubmitOrder controller desk |
| `daml/Umbra/Setup.daml` | allocate + §4 mint + Venue + runCanonicalRound + exportParties | ✓ EXISTS + SUBSTANTIVE | `initialize` seeds §4; `runCanonicalRound` submits 3 orders; `exportParties` → parties.json |
| `daml/Umbra/Tests.daml` | test_setup_seeds + test_asset_split_merge | ✓ EXISTS + SUBSTANTIVE | both scripts run `ok` under `daml test` (exit 0) |
| `DECISIONS.md` | version-gate record | ✓ EXISTS + SUBSTANTIVE | SDK 2.10.4, 2.x JSON API line, legacy-peer-deps, dev-token caveat |
| `.gitignore` / `.env.example` / `README.md` | repo hygiene | ✓ EXISTS + SUBSTANTIVE | secrets gitignored; §15 keys placeholder; run docs (no `make`) |
| `umbra-0.1.0.dar` | compiling DAR | ✓ EXISTS | produced by `daml build` (exit 0) |

**Artifacts:** 9/9 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `daml.yaml` init-script | `Umbra.Setup:initialize` | `daml start` boot | ✓ WIRED | init-script ran on boot (log: "Running the initialization script") |
| `Setup.initialize` | `parties.json` | `script-options --output-file` | ✓ WIRED | `daml/parties.json` written with all 4 parties on boot |
| `Setup` | frozen templates | imports Umbra.Asset/Roles/Auction | ✓ WIRED | `daml build` resolves all imports (exit 0) |
| desk | `Order` | `Venue.SubmitOrder` | ✓ WIRED | `runCanonicalRound` submits 3 §4 orders under `daml test` (ok) |

**Wiring:** 4/4 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| LEDG-01: project compiles (6 templates) + `daml start` runs JSON API :7575 | ✓ SATISFIED | - |
| LEDG-02: Setup allocates parties + mints §4 holdings + writes parties.json | ✓ SATISFIED | - |
| LEDG-03: Asset operator-custodied + Split/Merge/Reassign | ✓ SATISFIED | - |
| LEDG-04: SDK detected/pinned/recorded before other work (version gate) | ✓ SATISFIED | - |

**Coverage:** 4/4 requirements satisfied

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `daml/Umbra/Auction.daml` | Round.Clear body | `assertMsg "Clear not implemented until Phase 2" False` | ℹ️ Info | INTENTIONAL signature-frozen placeholder — real verify+DvP is Phase 2 (per phase scope) |
| `daml/Umbra/Auction.daml` | CloseRound body | minimal `status = Closed` recreate | ℹ️ Info | INTENTIONAL operator-only placeholder — real lifecycle is Phase 2 |

**Anti-patterns:** 0 blockers, 0 warnings (2 intentional, in-scope placeholders)

## Human Verification Required

None — all items checked programmatically. The `daml start` :7575 boot (normally a long-running human-check) was verified live by the orchestrator (Canton :6865 + JSON API :7575 both up; `/readyz`+`/livez` HTTP 200) and the process tree was then stopped.

## Gaps Summary

**No gaps found.** Phase goal achieved — the Daml data model and SDK/API line are frozen and compiling, `daml start` boots the sandbox + JSON API on :7575, and `Setup.daml` seeds the canonical §4 world with `parties.json` exported. Ready to proceed to Phase 2 (Clear & Settle On-Ledger).

## Verification Metadata

**Verification approach:** Goal-backward (derived from the 4 phase success criteria)
**Must-haves source:** ROADMAP.md Phase 1 success criteria + PLAN frontmatter
**Automated checks:** 5 passed (daml build exit 0, daml test exit 0, daml start :7575 /readyz 200 + /livez 200, parties.json content, signatory/observer grep audit), 0 failed
**Human checks required:** 0 (daml start boot verified live by orchestrator)
**Total verification time:** ~2 min

---
*Verified: 2026-06-25T15:02:00Z*
*Verifier: Claude (orchestrator — firsthand build/test/runtime evidence)*
