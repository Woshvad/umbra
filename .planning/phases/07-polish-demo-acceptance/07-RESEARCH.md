# Phase 7 — Research

**Researched:** 2026-06-27
**Mode:** Direct (context held from the Phase 1–6 build; no new external framework — this phase is
polish + orchestration + verification over a frozen system).

---

## Workstream A — UI-07 fidelity

Fully specified in `07-UI-SPEC.md` (delta contract) + `06-UI-REVIEW.md` (the audited fix list with
`file:line`) + `Umbra design/Umbra.dc.html` (ground truth). No research gap — the exact comp px/opacity
values are read directly from the comp. Validation = green `web build` + the 11 untouched lib tests +
the ui-review re-audit.

---

## Workstream B — DEMO-01: Makefile + README + cross-platform

### Run topology (the orchestration the Makefile encodes)
Four processes, with a hard ordering dependency:
1. **Ledger** — `cd daml && daml start` → builds, boots Canton sandbox (:6865) + HTTP JSON API
   (:7575), runs init-script `Umbra.Setup:seedOpenRound` (seeds the §4 open round + `RoundStats{count=3}`
   + 3 sealed orders), and **exports `daml/parties.json`**. Long-running, JVM-heavy first boot (~20–40s).
2. **Tokens** — `node scripts/mint-tokens.mjs` (root `npm run tokens`). **Depends on `parties.json`
   existing** → must run *after* the ledger is up. Writes desk tokens → `web/src/tokens.json`, operator
   token → `scripts/.operator-token`.
3. **Solver** — `cd solver && npm run dev` (`tsx watch src/index.ts`) → Express :4000. Reads
   `scripts/.operator-token` (or fallback-mints from `parties.json`). Rehydrates rounds from the ledger.
4. **Web** — `cd web && npm run dev` → Vite :5173 (proxies `/v1`→:7575).

### Makefile design (Pitfall: ordering + long-running processes)
- **Granular targets** (each maps to one command, easy for a stranger to run in its own terminal):
  `install`, `ledger`, `tokens`, `solver`, `web`, `test` (`cd daml && daml test`), `verify-privacy`,
  `clean`.
- **Composite `demo` target** — the one-liner. Because `daml start` blocks and tokens depend on
  `parties.json`, `demo` cannot naively `&&`-chain. Two viable encodings:
  - **(chosen) document-the-flow + best-effort orchestration:** `demo` prints the canonical 4-terminal
    flow and runs the parts that can be safely sequenced; the **manual 4-process flow is the documented
    always-works path**. This is honest for a hackathon (the grader sees the price reveal either way) and
    avoids brittle background-PID juggling in `make` on a JVM boot.
  - (alt) `concurrently` / backgrounded PIDs with a `wait-for-:7575` poll then tokens then solver+web —
    more magical but more fragile across OSes; offered as an optional `demo-auto` if it proves robust.
- **Cross-platform reality:** `make` is **not** installed on the Windows dev box (memory: env). Mirror
  every target as a root `package.json` npm script (`npm run ledger|tokens|solver|web|test`), and document
  the manual flow in the README so the demo runs on macOS/Linux (`make demo`) **and** Windows (npm/manual).
- **`.PHONY`** all targets (none produce a same-named file).

### README rewrite
The current `README.md` is Phase-1 era ("solver/ stubbed; built in Phase 5", "web/ stubbed; built in
Phase 3", "Makefile arrives in Phase 7"). Rewrite to: one-paragraph pitch → architecture (two data
planes; AI off the critical path via verify-don't-trust; privacy at the wire) → prerequisites (Daml
2.10.4, JDK 17+, Node 20+) → **Quick start** (`make demo` + the manual 4-terminal flow) → per-service
commands → the §4 / $100.00 reference → ports (7575/4000/5173) → links to `spec.md`, `DECISIONS.md`,
`docs/DEMO.md`. Keep the existing accurate bits (parties.json ephemerality, hot-reload `r`↵, `.env`).

---

## Workstream C — DEMO-02/03/04: acceptance

### DEMO-02 — Daml test gate
`cd daml && daml test` runs all six scripts (`test_clears_at_100`, `test_settled_balances`,
`test_atomicity`, `test_privacy_orders`, `test_privacy_confirmations`, `test_clear_rejects_bad_allocation`).
Frozen layer → confirmation gate; capture the pass output. (Daml `daml test` is self-contained — it does
not need `daml start` running.)

### DEMO-03 — live E2E acceptance (executed at top level, not delegated)
Long-running background processes + browser preview tooling can't be held inside a subagent, so the
orchestrator drives this. **Deterministic backbone via the HTTP plane (authoritative), UI for the visual:**

- Bring up: `daml start` (bg, wait for :7575) → `npm run tokens` → `solver` (bg, wait for :4000) →
  `web` (bg, :5173).
- **API/ledger proof** (curl, the same path the UI drives):
  - `GET :4000/round/<seedRoundId>` → `sealedOrderCount` reflects the seeded book.
  - Per-party `/v1/query` on :7575 with each desk token → each desk sees **only its own** `Order`
    (privacy at the wire; mirrors `scripts/verify-privacy.mjs`).
  - `POST :4000/round/<id>/close` → `GET :4000/round/<id>/solve-preview` → assert `clearingPrice == 100.00`,
    `matchedVolume == 10`, `rationale` present, `agent:{verified,source}` present.
  - `POST :4000/round/<id>/settle` → assert `Settled`; re-query → each desk sees only its own
    `TradeConfirmation`; aggregate legs A↔B 8@100 + A↔C 2@100; balances A:10/4000 · B:12/1800 · C:13/1200.
  - Re-`POST settle` → 409 (idempotent guard).
- **Seed note:** `seedOpenRound` leaves a ready §4 round (status Open, 3 sealed orders). The acceptance
  run can drive that seeded round straight through close→solve→settle (no need to re-submit), OR open a
  fresh round and submit the three §4 orders per-party to also exercise `SubmitOrder`. Driving the seeded
  round is the minimal honest proof of the money shot; submitting fresh additionally proves DEMO-03's
  "three desks submit blind" clause — do the fresh-submit path if the seeded round's ids cooperate.

### DEMO-04 — screenshots + demo script (Pitfall: WS network-idle timeout)
- **Known environment risk** (Phases 1–3): the Privacy view holds a persistent `@daml/react` JSON-API
  **WebSocket**; headless PNG capture that waits for network-idle **timed out** there (app rendered fine;
  DOM + computed-style verified). Mitigations, in order:
  1. Use the `Claude_Preview` MCP (`preview_start` + `preview_screenshot`) — the sanctioned preview path;
     try it first (it may capture without waiting for net-idle).
  2. The **Theatre/Settlement views use the :4000 fetch plane (no WS)** → these should capture cleanly;
     the 3-up Privacy view is the only WS-heavy one. If Privacy capture is blocked, capture the reveal +
     settlement cleanly and capture Privacy via DOM/computed-style evidence + best-effort frame, and
     document precisely (honest reporting).
- `docs/` (new): `docs/01-privacy-3up.png` (blindness) + `docs/02-atomic-settlement.png` (settle), plus
  `docs/DEMO.md` — the 3-minute script (setup line, click-path, talking points, §4 numbers).

---

## Validation Architecture (for 07-VALIDATION.md)
- **Always-on gate:** `cd web && npm run build` (tsc+vite) green after every UI edit; `cd web && npx
  vitest run src/lib` (11 §4 tests) green (UI px fixes must not touch the pure helpers).
- **DEMO-02 gate:** `cd daml && daml test` → 6/6 pass (captured).
- **DEMO-03 gate:** the live API/ledger assertions above (100.00 / matched 10 / Settled / per-desk
  privacy / aggregate legs / 409) — the authoritative E2E proof.
- **UI-07 / DEMO-04:** visual fidelity by `gsd-ui-review` re-audit (target 24/24) + the captured
  screenshots. Makefile correctness: `make -n demo` parse where `make` exists; npm-script + manual-flow
  mirror is the verified path on Windows.

## Open questions (resolved by decision, not blocking)
1. `make demo` auto-orchestration vs documented manual flow → **documented manual flow is canonical**;
   auto is best-effort/optional. (Honest, robust, OS-portable.)
2. Live screenshots for the WS-heavy Privacy view may be environment-blocked → fall back to clean
   reveal/settlement captures + documented evidence; never fake a screenshot.
