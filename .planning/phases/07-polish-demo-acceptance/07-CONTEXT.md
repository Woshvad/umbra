# Phase 7: Polish, Demo & Acceptance - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per user directive "run all of Phase 7 autonomous, no input")

<domain>
## Phase Boundary

The final phase: take the built-and-verified system (Phases 1–6) the last mile to a
**pitch-ready, stranger-runnable demo**. Three workstreams, no new product behavior:

1. **UI-07 — 100% comp fidelity.** Close the `06-UI-REVIEW.md` gaps (22/24 → 24/24) so the
   frontend matches the binding `Umbra design/` comp pixel-for-pixel across all five numbered
   views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent · 05 Settlement). The drifts are already
   enumerated with exact px + `file:line`; this is a precise polish pass, not redesign.
2. **DEMO-01 — runnable by a stranger.** A `Makefile` (`make demo` orchestrates ledger + setup +
   solver + web and opens the 3-up view) plus granular targets, and a rewritten `README.md` that
   documents every command end-to-end. Cross-platform reality (`make` absent on the Windows dev
   box) is handled by mirroring the targets as root `package.json` npm scripts + a documented
   manual 4-process flow, so the demo runs on any OS.
3. **DEMO-02/03/04 — acceptance.** Prove the six Daml Script tests pass (`daml test`), run the
   **live E2E acceptance flow** (three desks submit blind → 3-up proves no cross-visibility →
   solver reveals **100.00** with rationale → one-click atomic settle → each desk sees only its
   own fill, Operator sees the aggregate), capture the two pitch screenshots (3-up blindness +
   atomic settlement) into `docs/`, and write a 3-minute demo script.

**In scope (P7):** UI-07 (the enumerated comp-fidelity fixes + a full five-view comp sweep),
DEMO-01 (`Makefile` + `make demo` + rewritten `README.md` + npm-script mirror), DEMO-02 (`daml test`
green), DEMO-03 (live end-to-end acceptance), DEMO-04 (`docs/` screenshots + `docs/DEMO.md` 3-min
script). If the live E2E surfaces a real wiring bug, fixing it is in scope (that is what acceptance
is for).

**Out of scope (deferred):** all spec §19 stretch (Daml Finance, cn-quickstart LocalNet, competing
solvers, residual routing, multi-round). **No ledger / solver / Daml logic changes** — those layers
are frozen from Phases 1–5; P7 touches only frontend px polish, docs, and verification. No new
requirements.
</domain>

<decisions>
## Implementation Decisions

### UI-07 — design-comp fidelity (the binding-comp rule governs)
- **The comp (`Umbra design/Umbra.dc.html` + `screenshots/`) is ground truth; where the comp and a
  Phase-6 spec literal conflict, the comp wins** — UI-07's literal success criterion is "follows the
  binding `Umbra design/` comp **100%**", and CLAUDE.md mandates 100% comp fidelity. This resolves the
  two "code matches spec but spec deviates from comp" flags in `06-UI-REVIEW.md` (Pillar 4/5) toward
  the comp px values.
- **Apply the `06-UI-REVIEW.md` findings exactly** (the precise px/opacity/binding fixes, each with
  `file:line`):
  - `AgentRationale.tsx:124-125` — **bind the rank-1 competing-agents row to the live `preview`**
    (`preview.clearingPrice.toFixed(2)` / `preview.matchedVolume`) instead of the hardcoded
    `100.00` / `10 u`. Thread `preview` into the component. (Top-3 #1; the only non-cosmetic fix —
    a credibility hole on any non-§4 round.)
  - `PriceReveal.tsx` — `CLEARS AT` margin-bottom `14px → 4px` (comp 326); sub-stat unit words
    ("units" / "for all") `fontSize 18 → 13px` (comp 334/338).
  - `TheatreView.tsx` — "ONE PRICE. / NO LEAKS." headline `margin 14px 0 0 → 14px 0 18px` (comp 275);
    "Sealed orders in the book" caption → Inter `12px / .2em / opacity .7`, inline-baseline with the
    44px count (`display:flex; align-items:baseline; gap:14px`) (comp 277-278).
  - `CrossingChart.tsx:114` — p\* annotation `fill-opacity .7` (comp 314).
- **Full five-view comp sweep:** re-verify 01 Privacy + 02 Desk against the comp too (UI-07 covers all
  five views, not just the three audited in P6), fixing any additional drift found. Keep §4 values
  exact everywhere (100.00 / matched 10 / fills A=10·B=8·C=2 / balances A:10/4000·B:12/1800·C:13/1200).
- **No behavior/animation change** — the two wow beats (lime `umbra-slam` reveal, single-rAF
  simultaneous settle) and reduced-motion gating are already correct (P6 22/24); P7 only adjusts the
  static px/typography/binding so the still frames match the comp.

### DEMO-01 — Makefile + README + cross-platform
- **`Makefile` with granular + composite targets:** `ledger` (`cd daml && daml start`), `tokens`
  (`node scripts/mint-tokens.mjs`), `solver` (`cd solver && npm run dev`), `web` (`cd web && npm run dev`),
  `test` (`cd daml && daml test`), `install` (npm installs), `clean`, and **`demo`** (the composite that
  brings up ledger + setup + solver + web and opens the 3-up view). Because `daml start` is long-running
  and must be up (and `parties.json` exported) before tokens mint, `demo` documents/threads the correct
  ordering (background the ledger, wait for :7575, mint tokens, background solver + web, open the browser).
- **Cross-platform mirror:** `make` is not installed on the Windows dev box, so mirror the same targets
  as root `package.json` npm scripts (e.g. `npm run demo:*`) and document the **manual 4-process flow**
  (4 terminals: ledger / tokens / solver / web) as the canonical, always-works fallback in the README.
  A stranger on macOS/Linux uses `make demo`; a stranger on Windows uses the npm scripts or the manual
  flow. (Live `make demo` execution can only be smoke-tested where `make` exists — the underlying
  commands are each verified live regardless.)
- **`README.md` full rewrite:** replace the Phase-1-era "stubbed" language; document the architecture
  (two data planes, AI-off-the-critical-path, privacy at the wire), prerequisites, every command, the
  `make demo` one-liner + the manual flow, the §4 fixture / $100.00 reference, ports, and links to
  `spec.md` / `DECISIONS.md` / `docs/DEMO.md`.

### DEMO-02 — Daml test gate
- Run `cd daml && daml test`; assert all **six** scripts pass (`test_clears_at_100`,
  `test_settled_balances`, `test_atomicity`, `test_privacy_orders`, `test_privacy_confirmations`,
  `test_clear_rejects_bad_allocation`). The Daml layer is frozen, so this is a confirmation gate; record
  the output.

### DEMO-03 — live E2E acceptance (the de-risking pass)
- **Boot the full stack and drive the acceptance flow end-to-end live**, executed at the top level
  (long-running background processes + browser preview tooling, which a subagent can't hold):
  `daml start` → mint tokens → `solver` (:4000) → `web` (:5173).
- **Two layers of proof, deterministic backbone first:**
  - **API/ledger layer (authoritative):** drive `POST /round` → desks submit via the JSON API as their
    own parties → `POST /round/:id/close` → `GET /round/:id/solve-preview` (assert `clearingPrice == 100.00`,
    `matchedVolume == 10`, a rationale present) → `POST /round/:id/settle` (assert `Settled`); confirm
    each desk's per-party query returns only its own `Order`/`TradeConfirmation` (privacy at the wire) and
    the Operator/aggregate shows A↔B 8@100 + A↔C 2@100. This is the same path the UI drives and proves
    DEMO-03 regardless of headless-browser quirks.
  - **UI layer (visual):** load the views in the preview browser and verify the 3-up blindness + reveal +
    simultaneous settle render, for the screenshots.
- **If a real wiring bug appears, fix it** (in scope). **Honest reporting:** known environment risk —
  the persistent JSON-API WebSocket made headless PNG capture time out in Phases 1–3; if a specific
  capture is environmentally blocked, document it precisely with evidence and capture via the best
  available route (the Theatre/Settlement views use the :4000 fetch plane with no WS and should capture
  cleanly; the Privacy 3-up is the WS-heavy one).

### DEMO-04 — screenshots + demo script
- Capture **(a)** the 3-up blindness (Privacy view) and **(b)** the atomic settlement (Settlement view)
  into `docs/` as the two pitch screenshots.
- Write **`docs/DEMO.md`** — a 3-minute demo script: the setup line, the click-path (Privacy → Desk
  submits → Theatre Close & Solve reveal 100.00 → Settle atomically), the talking points (sealed-bid
  privacy → AI solver + verify-don't-trust → atomic DvP), and the §4 numbers to call out.

### Git attribution (unchanged, strict)
- **All P7 commits authored `woshvad <woshvad@gmail.com>`, zero Claude attribution** — no
  `Co-Authored-By`, no "Generated with", no Anthropic mention. (Continues the 54-commit clean record.)

### Claude's Discretion
- Exact Makefile target names + whether `demo` uses `concurrently` vs backgrounded processes; the npm
  script mirror shape; README section ordering; the precise screenshot routing; and the demo-script
  prose — executor's discretion, guided by the binding comp, `spec.md` §17/§18, and the existing run
  scripts (`scripts/mint-tokens.mjs`, the package.json scripts).
</decisions>

<code_context>
## Existing Code Insights

### What's already built (frozen — do not change logic)
- **Daml** (`daml/Umbra/`): six §7 templates + `Round.Clear` (§8 re-verify + atomic DvP) + Setup/Tests;
  six Daml Script tests; `daml start` boots sandbox :6865 + JSON API :7575, runs `seedOpenRound`, exports
  `daml/parties.json`.
- **Solver** (`solver/src/`): `auction.ts` (§8), `ledger.ts` (Operator client, `scripts/.operator-token`),
  `api.ts` (Express :4000, 5 endpoints), `agent.ts` (Claude propose + verify-don't-trust), `clock.ts`,
  `index.ts`. 33 vitest green. `npm run dev` = `tsx watch src/index.ts`.
- **Web** (`web/src/`): all five views (Privacy/Desk/Theatre/Agent/Settlement) + components; two data planes
  (operator via `solver.ts`→:4000, desks via `createLedgerContext`→:7575); `npm run build` green + 11 lib
  tests. `npm run dev` = vite :5173.

### Run wiring (the Makefile/README targets)
- `cd daml && daml start` — ledger + JSON API :7575 + seed + `daml/parties.json` export (long-running).
- `node scripts/mint-tokens.mjs` (root `npm run tokens`) — desk tokens → `web/src/tokens.json` (browser),
  operator token → `scripts/.operator-token` (CLI/solver only, never in `web/src`). Needs `parties.json`.
- `cd solver && npm run dev` — solver :4000 (reads `scripts/.operator-token` or fallback-mints).
- `cd web && npm run dev` — vite :5173 (proxies `/v1`→:7575).
- `node scripts/verify-privacy.mjs` — live wire-level privacy check (per-party `/v1/query`).
- `cd daml && daml test` — the six Daml Script tests (DEMO-02).

### The UI-07 fix sites (from 06-UI-REVIEW.md)
- `web/src/components/AgentRationale.tsx` (bind `preview`), `PriceReveal.tsx`, `CrossingChart.tsx`;
  `web/src/views/TheatreView.tsx`. Baseline: `Umbra design/Umbra.dc.html` + `06-UI-SPEC.md` (approved).

### Integration Points
- `docs/` (NEW) — pitch screenshots + `DEMO.md`.
- `Makefile` (NEW, repo root) + `README.md` (rewrite) + root `package.json` (add demo npm scripts).
</code_context>

<specifics>
## Specific Ideas

- The whole phase is the runway for the money shot: a stranger clones the repo, runs one command (or the
  documented 4-process flow), and within a minute sees three desks blind to each other → an AI solver clear
  at **$100.00** with a verified rationale → an atomic one-transaction settle. UI-07 makes every frame match
  the comp; DEMO-* makes it runnable and proves it live.
- The two pitch screenshots ARE the deliverable that wins (per the core-value note): the 3-up blindness and
  the atomic settlement. Capture them from the polished UI.
- Keep the §4 numbers exact and on-comp everywhere; the live E2E must show exactly 100.00 / matched 10 /
  fills A=10·B=8·C=2 / balances A:10/4000·B:12/1800·C:13/1200.
</specifics>

<deferred>
## Deferred Ideas

- All spec §19 stretch (Daml Finance Holding/Instrument/Batch, cn-quickstart LocalNet cross-node privacy,
  competing-solver race UI, residual "→ Cantex" routing, multi-round / cancel-replace) → v2, post-hackathon.
- Live `make demo` execution can only be smoke-tested where `make` is installed; on the Windows dev box the
  underlying commands + the npm-script mirror are what's verified live.
</deferred>
