# Phase 3: Privacy Proof (Vertical Slice) - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous, recommended answers accepted) — backend privacy decisions are spec-locked (§7/§10/§12/§16); frontend decisions are bound by the `Umbra design/` comp (follow 100%).

<domain>
## Phase Boundary

Prove order/fill/holding privacy is **structurally real at the API boundary**, and ship the **3-up Privacy money shot** — the end-to-end privacy→clear→settle slice that wins even if everything after is rough. This is the TOP-PRIORITY phase (ship it).

**In scope (two halves):**
- **A — Privacy proof (ledger + per-party API):** Daml Script tests proving no cross-desk visibility (`test_privacy_orders`, `test_privacy_confirmations`) + RoundStats-count-only + Asset owner-only; per-party HS256 dev JWT tokens for the JSON API; `Venue.SubmitOrder` one-sealed-order-per-round flow (CLEAR-01).
- **B — Frontend (Privacy view + global shell ONLY):** a React 18 + Vite + Tailwind app authenticating **per-party** (one `DamlLedger` provider + token per identity), with the top-bar **party switcher** + **round-status indicator** (UI-01) and the **3-up Privacy view** (UI-03) — three desk panels side by side, each driven by that desk's own credentials, a center column showing the shared `RoundStats` count, redaction motif on the "other" columns. Built to the `Umbra design/` comp **100%**.

**Explicitly NOT in scope (later phases):** the off-ledger solver service + round lifecycle automation / 60s window (Phase 4); the AI agent (Phase 5); the Desk(02)/Theatre(03)/Agent(04)/Settlement(05) views + supply-demand chart + settlement animation (Phase 6); design-comp polish pass + screenshots + `make demo` (Phase 7).
</domain>

<decisions>
## Implementation Decisions

### A. Per-party JWT auth (PRIV-05 — privacy enforced at the wire, not render logic)
- The JSON API runs in dev mode (`daml start` with `--allow-insecure-tokens`). Mint **HS256 unsafe-dev JWTs** (the Daml `{"https://daml.com/ledger-api": {actAs:[party], readAs:[party], ledgerId, applicationId}}` claim shape) — one token per identity (operator, bankA, bankB, bankC), signed with an empty/dev secret.
- A token-minting script (Node + `jsonwebtoken`, or a tiny TS util) reads `daml/parties.json` (the Phase-1 export: operator/bankA/bankB/bankC `hint::fingerprint` IDs) and writes per-party tokens to a frontend-readable location (e.g. `web/src/parties.json` or `.env`/generated `tokens.json`). The browser holds ONLY desk tokens + the JSON API URL — never the Operator's privileged automation, never the Anthropic key.
- **The frontend mounts one `DamlLedger` provider per panel/identity** with that party's token → each panel can structurally only fetch that party's contracts. This is what makes the money shot real, not faked.

### A. Privacy Daml Script tests (PRIV-01..04 — spec §16 tests 4–5)
- `test_privacy_orders` (PRIV-01): submit the 3 §4 orders; assert `query @Order` as BankA returns BankA's order and **zero** of BankB/BankC's (and symmetrically). Use Script `queryFilter`/`query` per-party (stakeholder visibility).
- `test_privacy_confirmations` (PRIV-03): after a settled round, assert each `TradeConfirmation` is visible only to its `desk` (BankA cannot see BankB's).
- PRIV-02: pre-clear, desks see only `RoundStats.sealedOrderCount` (a count), never `Order` contents. PRIV-04: `Asset` visible only to owner + operator. Assert both via per-party `query`.
- These extend `daml/Umbra/Tests.daml`; `daml test` stays exit 0. (Privacy is already STRUCTURAL from the Phase-1 field shapes — these tests PROVE it.)

### A. Order submission (CLEAR-01)
- `Venue.SubmitOrder` (exists, Phase 1): nonconsuming, controller `desk`, runs under Venue's operator authority — so a desk with its OWN token can submit via the JSON API. One order per round; the frontend disables the ticket after submit.
- For the slice's money shot, the demo state can be **seeded** (Operator opens a `Round` + `RoundStats{sealedOrderCount=3}`; the 3 §4 orders submitted via `runCanonicalRound`); the frontend reads this state per-party. Live in-browser submission is supported (desk token → SubmitOrder) but the seeded path guarantees a screenshot-ready 3-up. RoundStats auto-update on submit is the Operator's job → Phase 4 (solver service); Phase 3 seeds/sets the count.

### B. Frontend stack (spec §6 + CLAUDE.md version pins)
- `web/` = **React 18.3.1 + TypeScript + Vite 5.4 + Tailwind CSS 3.4** (NOT v4) + **`@daml/react` / `@daml/ledger` / `@daml/types` @ 2.10.4** + generated **`@daml.js/umbra`**.
- **Codegen:** `daml codegen js daml/.daml/dist/umbra-0.1.0.dar -o web/daml.js` → then `npm install ./daml.js/umbra --legacy-peer-deps`.
- **Install with `--legacy-peer-deps`** (the `@daml/react` peer dep wants React 16/17; recorded in DECISIONS.md from Phase 1). Alternatively add the `overrides` block. Vite proxy or direct calls to JSON API :7575.

### B. Design fidelity (the `Umbra design/` comp is BINDING — follow 100%)
- Tokens (from the comp): paper bg **#F4F1EA**, ink **#0A0A0A**, red CTA **#E2231A**, lime accent **#D6FB3C**; accents #FF6A1A / #FF3D9A / #2B3AF2 / #262626 (charcoal panel). 1px solid #0A0A0A borders, 48px main padding.
- Fonts: **Space Grotesk** (display/wordmark/big numerals), **IBM Plex Mono** (data/labels/tabular-nums), **Inter** (body).
- Motifs: the **redaction stripe** on "other"/hidden columns (`repeating-linear-gradient`-style), "REDACTED"/"HIDDEN" labels; the draw-on/reveal animation feel. The `Umbra design/Umbra.dc.html` + `support.js` + `screenshots/01-*.png` are the pixel source — the UI-SPEC (generated next via gsd-ui-phase) extracts the exact Privacy-view layout.
- **Scope this phase: the global shell (header/wordmark, party switcher, round-status indicator) + the Privacy view (view 01) only.** Other views deferred to Phase 6.

### Claude's Discretion
- Token-minting implementation (Node script vs Vite plugin); where tokens land (`web/src/parties.json` vs `.env`); exact React component tree; how the center column reads the shared RoundStats (operator-token read vs a public count); Tailwind config structure mirroring the comp tokens; whether to use `@daml/react` hooks (`useStream`/`useQuery`/`useLedger`) or `@daml/ledger` directly per panel.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (Phases 1–2, all green)
- `daml/` — compiling DAR `umbra-0.1.0.dar`; templates with the privacy-correct signatory/observer shapes (Order sig operator+desk/no observer; Asset obs owner; TradeConfirmation obs desk; RoundStats obs desks count-only). `daml start` boots JSON API :7575 (`--allow-insecure-tokens`). `daml/parties.json` exports the 4 party IDs.
- `daml/Umbra/Tests.daml` — extend with the 2 privacy tests (+ PRIV-02/04 assertions); `daml test` green.
- `DECISIONS.md` — already records the React-18 `--legacy-peer-deps` note + the dev-token caveat.
- `Round.Clear` (Phase 2) settles + issues TradeConfirmations — used by `test_privacy_confirmations`.

### Established Patterns
- Daml 2.10.4; `daml build`/`daml test` exit-code gates; `daml` via `~/bin/daml` shim; Node 26/npm 11; no `make`. Decimal=Numeric 10.
- Privacy is structural (Phase-1 field shapes) — Phase 3 proves + surfaces it.

### Integration Points
- The frontend reads the JSON API :7575 per-party (no solver service yet). Codegen bindings `@daml.js/umbra` are the typed contract. `parties.json` is the party-ID source for token minting.
</code_context>

<specifics>
## Specific Ideas
- **The money shot is the win:** three desk panels side by side, each authenticated as its own desk, each showing ONLY its own order, with a center "3 SEALED ORDERS" count and redaction stripes on the columns a desk can't see. This is the screenshot that wins (`screenshots/01-*.png` are the visual target). Privacy must be REAL (per-party tokens), not a render-time filter.
- Build to the comp 100% — the binding design source overrides the spec's reference to a (nonexistent) `frontend-design-prompt.md`.
</specifics>

<deferred>
## Deferred Ideas
- Solver service + 60s round lifecycle + auto-updating sealedOrderCount + close/solve → Phase 4.
- Desk / Theatre / Agent / Settlement views, supply-demand chart, settlement animation → Phase 6.
- `make demo`, screenshots into docs/, README polish → Phase 7.
- AI agent rationale → Phase 5.
</deferred>
