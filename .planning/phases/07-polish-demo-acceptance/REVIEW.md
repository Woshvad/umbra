---
phase: 07-polish-demo-acceptance
reviewed: 2026-06-27T00:00:00Z
depth: deep
files_reviewed: 13
files_reviewed_list:
  - solver/src/ledger.ts
  - solver/src/ledger.test.ts
  - solver/src/ledger-smoke.ts
  - web/src/desks.ts
  - web/src/views/SettlementView.tsx
  - web/src/components/AgentProposal.tsx
  - web/src/components/AgentRationale.tsx
  - web/src/views/AgentView.tsx
  - web/src/components/PriceReveal.tsx
  - web/src/views/TheatreView.tsx
  - web/src/components/CrossingChart.tsx
  - web/src/components/DeskColumn.tsx
  - Makefile
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-27
**Depth:** deep (cross-file: import graph + call-chain + privacy-boundary trace)
**Files Reviewed:** 13 source files (docs/`.planning`/`docs/*.svg`/lockfiles excluded per scope)
**Status:** issues_found

## Summary

The two Phase 7 bug fixes are substantively **correct**. The named `Ledger` import
(`solver/src/ledger.ts:28`) is the right fix for the CJS↔ESM interop crash, the
re-instantiation at `:99` (`new Ledger(...)`) now resolves to the class, and the
`type`-only `CreateEvent` import is correct. `codeForParty` (`web/src/desks.ts:24`)
is robust — it never throws on a missing `::`, an unknown prefix, or an empty string,
and falls back to the raw value as documented. All three live allocation-display sites
(`AgentProposal`, `SettlementView` legs, `SettlementView` balances) are now mapped to
comp codes.

The **privacy invariant holds**: no operator-token or `ANTHROPIC_API_KEY` path was
introduced into `web/src` (verified by grep — the 14 `operator` hits are display-plane
comments/labels only); the README/Makefile correctly scope secrets
(`scripts/.operator-token` CLI/solver-only, key in `solver/` only, desk tokens in
`web/src/tokens.json`); `.gitignore` covers all three and none are committed. The UI-07
px/typography changes are cosmetic with no logic, data, or animation regression. The
`AgentRationale` `preview` binding is fully null-safe (guarded by the `preview ?` gate
in `AgentView` plus `preview?.x ?? fallback` inside the component).

Two WARNING-level items remain — both are about the **completeness** of the named-import
fix and the test signal around it, not the primary code path — plus three minor quality
notes.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Lingering `@daml/ledger` default import in `ledger-smoke.ts` — and it's a wired npm target

**File:** `solver/src/ledger-smoke.ts:8` (and `:16`)
**Issue:** The fix changed `ledger.ts` to the named `Ledger` import, but
`ledger-smoke.ts` still uses `import Ledger from '@daml/ledger'` — the *exact* default
form that the fix's own comment (`ledger.ts:22-27`) says binds the CJS namespace object
rather than the class. This file is not dead code: `solver/package.json:10` exposes it
as `"smoke": "tsx src/ledger-smoke.ts"`, so `npm run smoke` runs it. Worse, the script's
stated *purpose* is to *prove the import resolves to the class* (`:16`
`console.log('Ledger constructor =', typeof Ledger)`), yet under the same tsx/esbuild
interop it will print `'object'` (the namespace) instead of `'function'` — i.e. the
smoke test now validates the broken import shape and would give a falsely "OK"-looking
diagnostic. It does not `new Ledger()`, so it won't crash, but it is an actively
misleading signal that contradicts the recorded 04-01 decision the fix cites.
**Fix:**
```ts
// solver/src/ledger-smoke.ts:8
import { Ledger } from '@daml/ledger'
// optional, make the smoke actually assert the class resolves:
// if (typeof Ledger !== 'function') { console.error('FAIL: Ledger is not a constructor'); process.exit(1) }
```

### WR-02: The unit-test mock structurally cannot catch the interop bug it now documents

**File:** `solver/src/ledger.test.ts:63`
**Issue:** The updated mock `vi.mock('@daml/ledger', () => ({ default: FakeLedger, Ledger: FakeLedger }))`
provides both keys, but because it always supplied `default: FakeLedger`, the test
suite would pass equally with the *old* broken `import Ledger from '@daml/ledger'`.
The mock masks the very CJS↔ESM interop defect that shipped to live boot — so the
"mock parity" added here restores the named path but adds **no regression guard**: a
future revert to the default import would still be green. The real-interop assertion
belongs in the smoke script (see WR-01), which is currently also broken. Net: there is
no automated guard preventing this exact crash from recurring.
**Fix:** Fix WR-01 so `npm run smoke` performs the real (un-mocked) import and asserts
`typeof Ledger === 'function'`, and run it in the solver's pre-boot/CI step. Optionally
add a comment in `ledger.test.ts` noting the mock cannot cover interop and the smoke
script is the real guard.

## Info

### IN-01: `codeAllocations` invoked twice per render (duplicated mapping work)

**File:** `web/src/views/SettlementView.tsx:57, 71`
**Issue:** `legsFromPreview` and `balanceRowsFromPreview` each independently call
`codeAllocations(preview)`, re-running the `map` + `codeForParty` lookup over the full
allocation list twice on every render (and these run on each rAF-driven `settleProgress`
tick because both are called inline in JSX at `:167` and `:203`). Pure recomputation —
not a correctness bug and out of v1 perf scope — but it is duplicated logic that could
desync if one call site is later changed and the other isn't.
**Fix:** Compute `const coded = codeAllocations(preview)` once and pass the coded list
into both helpers, or memoize via `useMemo` keyed on `preview`.

### IN-02: `codeForParty` collision risk is unguarded (latent, not currently triggered)

**File:** `web/src/desks.ts:24`; consumed at `web/src/views/SettlementView.tsx:50`
**Issue:** `codeForParty` maps party-id prefix → code 1:1, which is correct for the
canonical 3-desk fixture. But if the live ledger ever returned two allocations whose
party ids share a `DeskKey` prefix (e.g. two `bankA::*` parties), both would collapse to
the same code, and downstream the React `key={`${a.desk}-${a.side}`}` in `AgentProposal`
(now keyed on the mapped value? — no, it keys on raw `a.desk`, so it's safe) and the
balance aggregation in `deskBalancesFromAllocations` would silently *sum* them under one
code. Not reachable on the §4 fixture; noting for robustness.
**Fix:** None required for the hackathon scope; if multi-party-per-desk is ever a real
case, aggregate-by-key explicitly or assert uniqueness.

### IN-03: `Makefile` `clean` target uses `rm -f`/`rm -rf` — non-portable on the documented Windows dev box

**File:** `Makefile:72-75`
**Issue:** The header (`:3`) correctly states `make` is not installed on the Windows dev
box and that npm-script mirrors are the cross-platform contract — but the root
`package.json` mirror (reviewed) does **not** mirror `clean` or `demo`, so a Windows user
has no scripted clean path and must delete the four ephemeral paths by hand. This is a
documentation/parity gap, not a defect (the manual flow is documented). No secret-leak
or correctness impact.
**Fix:** Optionally add a cross-platform `clean` (e.g. a tiny `node` rimraf script) to
the root `package.json`, or note in the README that `clean` is macOS/Linux-only.

---

## Privacy / security verification (explicit, no findings)

- **No operator token or Anthropic key in `web/src`** — grep for
  `operator-token|ANTHROPIC_API_KEY|operatorToken` under `web/src` returns nothing; the
  14 `operator` hits are display-plane comments/labels.
- **README/Makefile scope secrets correctly** — operator token only in
  `scripts/.operator-token` (CLI/solver), key only in `solver/`, desk tokens (intended
  browser-side) in `web/src/tokens.json`. No instruction routes a secret into the browser.
- **Nothing secret committed** — `git ls-files` shows no `tokens.json`, `.operator-token`,
  or `.env`; `.gitignore` covers all three.
- **`new Ledger(...)` at `solver/src/ledger.ts:99`** now resolves to the class via the
  named import; module-private `_operatorToken` is never returned/spread/logged
  (unchanged this phase, re-verified at the call boundary).

## Acknowledged non-blockers (per task brief — not re-flagged)

- `GET /round/:id` reads `clearingPrice 0` at Settled status (recompute on retired sealed
  orders) — documented out-of-scope in `docs/LIVE-EVIDENCE.md`; UI uses the cached
  solve-preview.
- Raster screenshots environment-blocked; `docs/*.svg` are comp-faithful frames.

---

_Reviewed: 2026-06-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
