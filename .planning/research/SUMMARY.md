# Project Research Summary

**Project:** Umbra — Sealed-Bid Batch Auction & Atomic Settlement on Canton
**Domain:** Daml-on-Canton privacy-native DeFi dApp (sealed-bid uniform-price call auction + atomic DvP) with an off-ledger Claude AI solver agent and a React frontend
**Researched:** 2026-06-25
**Confidence:** HIGH

## Executive Summary

Umbra is a LOCKED-SPEC hackathon build (Encode Club / HackCanton, Track 1 — Private DeFi & Capital Markets): three trading desks submit sealed limit orders for a tokenized bond, an AI solver clears them at one uniform price (exactly $100.00 on the canonical section-4 fixture), and the whole batch settles delivery-versus-payment atomically in a single Canton transaction, each desk seeing only its own data. The four research tracks converge: the spec design is the standard, idiomatic way experts build this, and the research confirms-and-pins rather than re-scopes. The expert shape is the canonical three-tier Daml app (ledger to HTTP JSON API to @daml/react frontend) plus one mandated addition — an off-ledger Node/TS solver service that holds Operator authority, runs the auction clock plus AI, and fronts an Express API so the browser never holds operator credentials.

The recommended approach is fully resolved at the version level: build on Daml SDK 2.10.4 via daml start (sandbox + HTTP JSON API on 7575 + JS codegen in one command), with React 18.3.1 (install with --legacy-peer-deps; @daml/react 2.10.4 declares a React 16/17 peer dep), Vite 5.4, Tailwind 3.4 (NOT 4), @daml/react / @daml/ledger / @daml/types all pinned to 2.10.4, and @anthropic-ai/sdk 0.106.0 calling claude-haiku-4-5 at temperature 0 with structured outputs (output_config.format json_schema; forced-tool-use is the documented fallback). The Daml 2.x-vs-3.x decision — the spec's stated #1 risk — is resolved in favor of the 2.x line; cn-quickstart/LocalNet is a deploy-time stretch only.

The key risks are correctness-and-privacy, not scale, and all four tracks agree on the mitigations. Verify-don't-trust is the central invariant: the AI numbers are never settled unverified — a deterministic section-8 recompute in TS gates the proposal, and Round.Clear re-verifies again on-ledger (max-volume + limits + conservation + no overdraw). Privacy must be real, not faked: each desk browser uses its own JWT so it physically cannot fetch rival data; observers must be declared exactly per spec (a stray observer, or order contents leaking into RoundStats, kills the money shot). Atomicity requires every settlement leg inside one Round.Clear transaction. The subtlest correctness bug — and the one most likely to break the hero number — is the clearing tie-break: the imbalance tie-break must apply ONLY among max-matched candidates (at p=99 imbalance is lower but it loses at the volume gate; clearing there yields the wrong 99). The whole build is gated on a Phase-1 action: detect and record the installed Daml SDK version in DECISIONS.md before any other work, and on shipping the privacy-clear-settle vertical slice by end of Phase 3 even if everything after is rough.

## Key Findings

### Recommended Stack

The stack is fully locked by spec section-6 and pinned by research against the npm registry and official docs (not training data). Build the entire MVP on the Daml 2.x line with daml start; treat Daml 3.x/Canton 3.x (cn-quickstart LocalNet, JSON Ledger API v2, multi-GB Docker, different token model) as the section-19 deploy-time stretch only. The single biggest install gotcha is React 18 against the @daml/react React-16/17 peer dep — install with --legacy-peer-deps (or an npm overrides block) and record it in DECISIONS.md. See STACK.md.

**Core technologies:**
- Daml SDK 2.10.4 (pin sdk-version in daml.yaml): smart-contract language + sandbox + HTTP JSON API + daml start + Daml Script — latest stable 2.x; one-command dev loop; the API line @daml/react targets. Detect the actual installed version first (MEDIUM confidence it is exactly 2.10.4 on the build machine) and match @daml/* to whatever daml codegen js emits if it differs.
- React 18.3.1 + Vite 5.4 + @vitejs/plugin-react 4.3 + Tailwind 3.4: frontend — spec-mandated; Tailwind stays on 3.x (the design comp targets a v3 tailwind.config.ts; v4 changes the PostCSS pipeline). Install web deps with --legacy-peer-deps.
- @daml/react / @daml/ledger / @daml/types @ 2.10.4 (identical versions) + generated @daml.js/umbra: React hooks over the JSON API, the Operator client for the solver, and the contract bindings — must match the SDK that generated them or decode errors appear.
- Node 20 LTS + TypeScript 5.4-5.6 + express 4.19 + cors + dotenv + jsonwebtoken 9 + zod 3.23 + vitest 2: the solver service — Operator client, Express 4000 API, per-party dev JWT minting, AI-output validation, and the 5-plus-scenario clearing unit tests.
- @anthropic-ai/sdk 0.106.0 to claude-haiku-4-5 at temperature 0, structured outputs via output_config.format (type json_schema); forced tool use (strict:true + tool_choice) is the portable fallback. Key server-side only. Charts: hand-rolled SVG, no chart library.

### Expected Features

The feature set is locked (spec.md); research validated the correct behaviors and re-ran the section-8 algorithm against the section-4 fixture — it clears at exactly 100.00, fills A=10/B=8/C=2, produces the section-4 balances, and conserves cash to zero. See FEATURES.md.

**Must have (table-stakes correctness invariants — the thesis fails if any is wrong):**
- Deterministic uniform clearing price p-star = max-over-p of min(demand, supply); fixture clears at exactly $100.00 (float-safe, rounded to 2dp).
- Correct two-level tie-break: minimize abs(demand-supply) ONLY among max-matched candidates, then lower price. (THE most likely clearing bug — p=99 has lower imbalance but loses at the volume gate.)
- Short side fills fully; long side rationed by price priority then pro-rata; integer allocation never exceeds traded (deterministic leftover-to-largest rule, identical in TS and Daml).
- Order privacy via exact signatory/observer scoping (Order = signatory operator+desk, no observer); pre-clear desks see RoundStats.sealedOrderCount only; per-desk private TradeConfirmation/Asset.
- Single-transaction atomic DvP inside Round.Clear (all-or-nothing; conservation asserted); on-ledger re-verification rejects bad allocations.
- Party-scoped frontend auth — each desk its own JWT; privacy enforced at the API boundary, not in render logic.

**Should have (differentiators — what wins):**
- The 3-up Privacy money shot (three DamlLedger providers, each blind to the others) — the screenshot that wins; build first in the vertical slice.
- AI Solver Agent (verify-don't-trust) + natural-language clearing rationale — the autonomous-agent-in-institutional-DeFi thesis without risking correctness.
- Atomic settlement animation, hand-rolled supply/demand crossing SVG, native-to-Canton pitch framing.

**Defer (v2-plus — spec section-19 stretch, do NOT start before Phase 7):**
- Daml Finance Holding/Batch/Instruction settlement; cn-quickstart LocalNet cross-node deploy; competing AI solvers; residual routing / multiple rounds / order cancel-replace.

### Architecture Approach

The canonical three-tier Daml app (the create-daml-app shape) plus an off-ledger solver service as a privileged Operator party. The load-bearing detail is per-party token auth: the JSON API decodes each JWT to the acting party and returns only that party stakeholder contracts, so privacy is structurally real, not UI-faked. Build order is forced by the dependency graph and maps 1:1 onto spec section-17, landing a working privacy-clear-settle slice by end of Phase 3. Two tracks parallelize: Phase 2 (Clear + atomicity) is frontend-independent (tests 1-3 pass purely in Daml Script), and the privacy track depends only on the data model + party tokens (not on clearing). Freeze the template field names + the Allocation data type in Phase 1 — they are the shared contract across Daml, the TS solver, and the generated bindings. See ARCHITECTURE.md.

**Major components:**
1. Daml ledger (daml/Umbra/*.daml) — source of truth: state, authority, privacy (disclosure), and atomicity; Round.Clear is the single atomic DvP transaction that re-verifies section-8.
2. HTTP JSON API (started by daml start, 7575) — the privacy enforcement point at the wire; decodes JWT to party, returns only that party contracts; no app code.
3. Solver service (solver/, Node 20, 4000) — the only Operator-authority actor outside Daml Script: auction clock + 60s window, deterministic section-8, Claude calls, and the browser-facing Express API; holds the Anthropic key + Operator token.
4. Frontend (web/, React+Vite+Tailwind) — 5 views; one DamlLedger context per impersonated identity with that identity token; drives the demo via the solver Express API (no ledger-admin rights in the browser).
5. Setup/Tests (Daml Script) — allocate parties, mint section-4 holdings, write parties.json/tokens, run the canonical round.

### Critical Pitfalls

Top items from PITFALLS.md; the two most expensive mistake categories are anything that breaks the privacy money shot (Phase 3) or the exact-100.00 clear (Phases 2/4).

1. Observer/signatory mis-declaration leaks an Order to rival desks — keep the spec exact declarations (Order = signatory operator+desk, no observer; TradeConfirmation/Asset = single observer; RoundStats = count only). Never add an observer for the UI; write privacy tests 4-5 BEFORE the 3-up view. (Phase 1 declare + Phase 3 prove.)
2. Trusting the AI numbers — the deterministic TS section-8 recompute is the settlement input and gates Claude output by equality; Round.Clear re-verifies on-ledger. Claude is narrator/candidate only. (Phase 4 + Phase 5; on-ledger gate Phase 2.)
3. Non-atomic / contended settlement — do every leg (split/merge/reassign + confirmations + status) inside one Round.Clear; fetch each Asset once; add a conservation assertion. Multi-transaction settlement forfeits atomicity and risks ContentionError. (Phase 2.)
4. Integer rationing / tie-break off-by-one — implement section-8 literally (two-level tie-break in order, leftover-to-largest); use 2dp/Decimal price comparison, never raw float equality; make TS and Daml produce identical output; test ties, imbalance, and no-cross. (Phase 4 TS + Phase 2 Daml.)
5. Daml/Canton version drift + per-party token mis-scoping — Phase-1 gate: daml version, pin in daml.yaml, record in DECISIONS.md, choose the API line and verify the live endpoint shape before building views. Mint one token per desk scoped to only that party; route Operator actions through the solver. (Phase 1 + Phase 3.)

Plus the two scope/sequencing traps: overscope (starting LocalNet / Daml Finance before the slice works) and polishing before the slice clears end-to-end — both guarded by vertical-slice-demoable-by-end-of-Phase-3-first.

## Implications for Roadmap

The dependency graph forces a strict order that maps 1:1 onto spec section-17. The win condition is the privacy-clear-settle vertical slice shipped by end of Phase 3, even if rough; everything after is differentiating polish.

### Phase 1: Skeleton (data model + dev loop, with the version gate)
**Rationale:** Every other layer codes against the Daml templates + the Allocation type and against a known SDK/API line. Nothing can proceed until these are frozen.
**Delivers:** Asset/Venue/Order/Round/RoundStats/TradeConfirmation compile with exact spec privacy declarations; Setup.daml seeds section-4; daml start runs; DECISIONS.md records the detected SDK version + chosen API line + the legacy-peer-deps decision.
**Addresses:** the data contract underpinning all features.
**Avoids:** Pitfall 5 (version drift, the Phase-1 gating action) and Pitfall 1 (declare templates correctly the first time).

### Phase 2: Clear and settle on-ledger
**Rationale:** Round.Clear is the precondition for both atomic settlement and the AI backstop; it is frontend-independent and can run in parallel with the privacy track. Tests 1-3 pass purely in Daml Script.
**Delivers:** Round.Clear (re-verify section-8 + single-transaction atomic DvP + per-desk confirmations); fixture clears at 100.00; atomicity rollback proven.
**Uses:** Daml SDK 2.10.4 / Daml Script.
**Implements:** the ledger source-of-truth + atomicity boundary.
**Avoids:** Pitfalls 3 (atomicity/contention) and 4 (rationing/tie-break, Daml side).

### Phase 3: Privacy proof, the vertical slice (SHIP THIS)
**Rationale:** Depends only on the data model + party tokens (not on clearing), so it parallels Phase 2. This is the slice that must ship, the hero screenshot.
**Delivers:** parties.json/per-party JWTs; per-party DamlLedger wiring; tests 4-5 pass at the HTTP layer; the 3-up Privacy money shot.
**Uses:** the daml-react bindings, jsonwebtoken (unsigned dev tokens).
**Avoids:** Pitfalls 1 (observer leak) and 6 (faked privacy / token mis-scope).

### Phase 4: Solver service
**Rationale:** The Clear choice must exist (Phase 2) before a service can call it; the deterministic core is the settlement input that later gates the AI.
**Delivers:** Node service, 60s window + force-close, deterministic section-8 in TS, exercise Clear, Express 4000 API, 5-plus-scenario unit tests (ties, imbalance, no-cross, section-4).
**Avoids:** Pitfalls 2 (deterministic core is the input) and 4 (TS tie-break/rationing).

### Phase 5: AI agent layer
**Rationale:** Additive, drops into the Phase-4 agent seam; never on the critical settlement path, so if it slips the deterministic clear still settles.
**Delivers:** Claude propose + rationale (structured outputs, temp 0), verify-dont-trust equality gate, Solver Agent panel.
**Uses:** the anthropic-ai-sdk 0.106.0, claude-haiku-4-5, zod.

### Phase 6: Theatre + chart + animation
**Rationale:** Needs live Phase 3-5 data; reactive contract changes drive the animations.
**Delivers:** countdown, hand-rolled supply/demand crossing SVG, atomic-settle animation.

### Phase 7: Polish + demo
**Rationale:** Polish only after the slice is real (Pitfall 8).
**Delivers:** 100% design-comp fidelity, make demo, README + 3-min script, the two pitch screenshots.

### Phase 8: Stretch (only after Phase 7)
**Delivers:** Daml Finance settlement, cn-quickstart LocalNet, competing solvers, residual routing.

### Phase Ordering Rationale
- Forced by dependencies: templates to Clear to service to AI; the AI depends on the deterministic core, never the reverse (decoupling = risk mitigation).
- Parallelizable: Phase 2 (clear/atomicity, Daml-only) and the Phase 3 privacy track (data model + tokens) are independent; work both toward the end-of-Phase-3 slice.
- Avoids the two sequencing pitfalls: the slice ships before any stretch (Pitfall 7) and before any polish (Pitfall 8); the canonical fixture stays a continuous smoke test (must keep clearing at 100.00).

### Research Flags

Phases likely needing deeper research during planning (gsd-plan-phase with research-phase N):
- Phase 1: version-line detection is empirical; the exact installed SDK and its JSON API shape must be verified against the live endpoint (the spec #1 risk); confirm the bindings-to-codegen version lock and the React-18 peer-dep workaround on the actual machine.
- Phase 5: confirm GA structured outputs (output_config.format) are enabled for the account/region; if not, wire the forced-tool-use fallback. Verify exact anthropic-ai-sdk call shape against current docs.

Phases with standard, well-documented patterns (skip research-phase):
- Phase 2: Daml choices/atomicity/conservation are idiomatic and spec-specified literally.
- Phase 3: per-party DamlLedger + unsigned dev JWT is the documented create-daml-app pattern.
- Phase 4: deterministic section-8 is fully specified with a worked example; Express service is standard.
- Phases 6-7: binding design comp + hand-rolled SVG; no novel research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry plus official Daml and Anthropic docs; React-18 peer-dep range read directly from the published package. The one MEDIUM is whether the build machine has exactly SDK 2.10.4; detect and adapt. |
| Features | HIGH | Locked spec; section-8 re-implemented and validated against section-4 (clears at 100.00, fills 10/8/2, balances and conservation); matches standard call-auction theory and Daml semantics. |
| Architecture | HIGH | Three-tier Daml app plus JSON-API token auth plus daml-react bindings plus daml start, verified against docs.daml.com and the cn-quickstart repo; only the 3.x token-model drift is MEDIUM (matters only at the LocalNet stretch). |
| Pitfalls | HIGH | Privacy, contention and JSON-API claims verified against docs.daml.com; Claude structured-output claims against platform.claude.com; clearing and scope pitfalls reasoned from the locked spec. |

**Overall confidence:** HIGH

### Gaps to Address
- Exact installed Daml SDK and API line: the only material unknown. Resolve in Phase 1 (daml version, pin, record in DECISIONS.md, verify live endpoint shape). All ledger code is portable; only the JS-binding and JSON-API wiring is line-specific.
- Bindings-to-codegen version lock: if the installed daml version is not 2.10.4, set the binding packages to the version daml codegen js emits (read the generated package.json), not a hard 2.10.4 pin.
- Anthropic structured-outputs availability: confirm GA output_config.format for the account in Phase 5; fall back to forced tool use if disabled.
- TS-Daml clearing parity: the two section-8 implementations must produce byte-identical output; enforce via the section-4 golden fixture plus tie, imbalance and no-cross tests on both sides; verify continuously, not once.
- Git attribution constraint (process, not technical): the orchestrator commits all research; no Claude co-authorship on any commit or push (strict user requirement). Author and committer stays woshvad.

## Sources

### Primary (HIGH confidence)
- Daml docs, docs.daml.com : SDK 2.10.4 (latest stable 2.x), daml start and daml codegen js wiring (sandbox plus HTTP JSON API 7575), app architecture (three-tier, JWT per-party auth), JSON API (token required even on unsecured sandbox; actAs and readAs payload), ledger privacy (stakeholders = signatories union observers), contention (one-transaction settlement, ContentionError).
- npm registry: the daml binding packages at 2.10.4 (React 16/17 peer dep) and the anthropic-ai-sdk 0.106.0 (Node 20).
- Anthropic, platform.claude.com/docs : structured outputs (GA output_config.format, no beta header; strict tool-use fallback; temperature 0 does not guarantee determinism), model IDs and pricing (claude-haiku-4-5, sonnet-4-6, opus-4-8).
- spec.md (locked) sections 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19 plus .planning/PROJECT.md; local re-validation of section-8 against section-4 (clears at 100.00, fills 10/8/2, balances, conservation delta 0).
- Detailed research: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.

### Secondary (MEDIUM confidence)
- Call-auction theory (max matched volume plus imbalance tie-break): arXiv 1904.07583, 1304.3135, 2104.08437; NYSE closing-auction imbalance.
- cn-quickstart, github.com/digital-asset/cn-quickstart (Splice LocalNet, JSON Ledger API v2, Keycloak IDP; 3.x token-model drift); relevant only to the section-19 stretch.

### Tertiary (LOW confidence)
- None; no findings rest on a single unverified source; the one empirical unknown (installed SDK patch) is resolved by the Phase-1 detection action, not by research.

---
*Research completed: 2026-06-25*
*Ready for roadmap: yes*
