---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: "MILESTONE v1.0 COMPLETE — all 7 phases done, all 38 v1 requirements Complete. Phase 7 (Polish/Demo/Acceptance) closed 2026-06-27: UI-07 fidelity 24/24 (06-UI-REVIEW findings closed), Makefile + README + npm mirror (DEMO-01), daml test 6/6 (DEMO-02), live E2E money shot proven (DEMO-03 — privacy at the wire, clear 100.00, atomic settle, §4 finals, 409), pitch frames + 3-min docs/DEMO.md (DEMO-04). The live E2E surfaced & fixed 2 genuine wiring bugs (solver @daml/ledger named-import boot fix; settlement party-id→code mapping). Gates: code-review ship-ready (0 critical), verify 4/4 MET, ui-review 24/24."
last_updated: "2026-06-27T23:30:00.000Z"
last_activity: 2026-06-27 -- Phase 7 complete & verified; milestone v1.0 done (all 7 phases / 38 requirements)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 22
  completed_plans: 22
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-25)

**Core value:** The privacy money shot — three desks submit sealed orders blind to each other, an AI solver clears them at one uniform price ($100.00 on the §4 fixture), and the whole batch settles atomically in a single Canton transaction.
**Current focus:** MILESTONE v1.0 COMPLETE — all 7 phases done.

## Current Position

Phase: 07 (Polish, Demo & Acceptance) — COMPLETE & VERIFIED (3/3 plans; gates: code-review ship-ready, verify 4/4, ui-review 24/24)
Plans: 3 of 3 done (07-01 UI-07, 07-02 Makefile/README, 07-03 live-E2E acceptance)
Status: **Milestone v1.0 COMPLETE.** Privacy money shot proven LIVE end-to-end (3 desks blind → clear $100.00 → atomic DvP settle → per-desk fills) + UI 100% comp fidelity + stranger-runnable (make demo / README) + pitch frames + 3-min script. 2 live-E2E wiring bugs surfaced & fixed.
Last activity: 2026-06-27 -- Phase 7 complete & verified; milestone v1.0 done

Milestone progress: 7/7 phases [███████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 3
- Average duration: ~3 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | ~10 min | ~3 min |

**Recent Trend:**

- Last 5 plans: 01-01 (2 min), 01-02 (~2 min), 01-03 (~6 min)
- Trend: —

*Updated after each plan completion*
| Phase 02 P01 | 4 min | 2 tasks | 2 files |
| Phase 02 P02 | 10 min | 2 tasks | 4 files |
| Phase 02 P03 | 5 min | 2 tasks | 2 files |
| Phase 03 P01 | 3min | 2 tasks | 2 files |
| Phase 03 P02 | 9min | 4 tasks | 16 files |
| Phase 3 P3 | 8 | 2 tasks | 15 files |
| Phase 04 P01 | 12 min | 3 tasks | 8 files |
| Phase 04 P02 | 5 min | 2 tasks | 2 files |
| Phase 04 P03 | 6min | 2 tasks | 2 files |
| Phase 04 P04 | 5min | 2 tasks | 6 files |
| Phase 5 P1 | 18min | 3 tasks | 4 files |
| Phase 5 P2 | 12min | 2 tasks | 5 files |
| Phase 06 P01 | 22min | 2 tasks | 17 files |
| Phase 06 P03 | 5min | 2 tasks | 4 files |
| Phase 06 P04 | 4min | 2 tasks | 7 files |
| Phase 07 P02 | 6 min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Build on Daml 2.x line via `daml start`; Canton LocalNet / Daml Finance are §19 stretch (deferred past P7).
- [Roadmap]: Standard mode (horizontal layers) — early phases are ledger-only with no UI; vertical slice emerges at P3.
- [Roadmap]: Ship the privacy→clear→settle slice by end of Phase 3 even if everything after is rough.
- [01-01 / LEDG-04]: Daml SDK pinned to **2.10.4** in `daml/daml.yaml` (version gate passed) — recorded in `DECISIONS.md`.
- [01-01]: API line = Daml 2.x HTTP JSON API on :7575, NOT Daml 3.x / cn-quickstart (stretch §19).
- [01-01]: `daml.yaml` uses `source: .` (folder containing `Umbra/`); no `codegen:` block in P1; frontend (P3) installs `@daml/react@2.10.4` with `--legacy-peer-deps`.
- [01-02]: Six §7 templates frozen verbatim across `Asset.daml`/`Auction.daml`/`Roles.daml`; signatory/observer sets are the privacy control (Order has NO observer; TradeConfirmation observes singular `desk`) — no stray observers.
- [01-02]: `Round.Clear` is a signature-frozen compiling placeholder (real verify+DvP body = Phase 2); `ClearResult` defined as a minimal record (spec §7.4 left it undefined).
- [env]: Daml 2.10.4 installed at `%APPDATA%\daml`; invoked as bare `daml` via `~/bin/daml` shim (system PATH lacks `%APPDATA%\daml\bin`); `daml build` verified working on this Windows machine.
- [Phase ?]: [02-01]: §8 clearing math in dedicated pure Umbra/Clearing.daml; rationByPriority top-level recursive (Daml-LF forbids recursive local bindings).
- [Phase ?]: [02-02 / D7]: Round.Clear uses additive Option-B fields; Side/Allocation relocated to leaf Clearing + re-exported (byte-identical).
- [02-03]: Round.Clear retires settled Orders via an operator-only consuming Order.Retire choice, NOT the built-in `archive` (archive needs every signatory's authority — operator AND desk — which operator-authority-only Clear lacks).
- [02-03]: Settlement tests use a parameterised seedAndClose (B BONDX 20.0 funded / 5.0 underfunded) returning a SeedResult of the Option-B ContractIds; atomicity proven by submitMustFail + sorted before/after Asset snapshot equality.
- [Phase ?]: [03-01]: Privacy proven on-ledger by per-party query @T (test_privacy_orders PRIV-01/02/04 + test_privacy_confirmations PRIV-03); pure additions, no template observer changed (privacy is structural from Phase 1).
- [Phase ?]: [03-01 / CLEAR-01]: seedOpenRound leaves Round status=Open and SEEDS RoundStats{count=3}; live lifecycle + solver auto-increment deferred to Phase 4. Frontend money-shot live state, solver-free.
- [Phase ?]: Generated bindings package is @daml.js/umbra-0.1.0 (import from /lib/Umbra/*)
- [Phase ?]: Zero-dep node:crypto HS256 JWT minting (no jsonwebtoken); operator token to scripts/.operator-token, never web/src (T-03-06)
- [04-01]: solver/ is Node ESM (type:module, tsconfig moduleResolution:Bundler + esModuleInterop); generated @daml.js/umbra-0.1.0 CJS bindings + @daml/ledger import cleanly under Node via direct named imports (no fallback) — RESEARCH Open Question 1 / Pitfall 6 resolved.
- [04-01]: auction.ts ports Clearing.daml 1:1 (pure, no imports); for a no-cross round choosePStar returns a candidate price with matched 0 (NOT 0.0) — the 0.0 branch fires only on an empty order book. No-cross invariant is matched===0, enforced by tests + on-ledger Round.Clear backstop.
- [04-02 / SOLV-04]: solver/src/ledger.ts is the Operator wire layer — JWT read from scripts/.operator-token (zero-dep node:crypto HS256 fallback-mint), held strictly module-private (never returned/logged); only operatorParty (public id) exported. Absolute http://localhost:7575/ base URL (no Vite proxy server-side, Pitfall 2).
- [04-02 / SOLV-01]: sealedOrderCount has no update choice → maintained by archive+recreate (updateStats); refreshStats recomputes readSealedOrders.length and writes it via updateStats (the live call site that advances a fresh round off '0' — proven on a stubbed-ledger vitest).
- [04-02]: Option-B Round.Clear — settle gathers orderCids/buyerUsdcCid/sellerBondCids from the live ACS, re-queries the Round cid before each exercise (CloseRound/Clear recreate it, Pitfall 4), Int/Decimal as strings (Pitfall 5), sellerBondCids as DA.Types.Tuple2 { _1, _2 }. ContractId<T> is a branded string → cast gathered cids at the exercise site.
- [04-02 / A2]: settle's asset selection assumes a single sufficient holding per (owner, symbol) — holds for the §4 fixture; non-canonical/fresh rounds with split or insufficient holdings throw a clean secret-free 'insufficient or missing <symbol> holding for <party>' error (auto-merge is stretch §19).
- [04-03 / SOLV-03, SOLV-04]: solver/src/api.ts is the §11 HTTP surface — createApp(deps) DI factory exposing 5 endpoints on :4000, cors(:5173) only (never *), zod-validated POST /round, secret-safe `{ error: { code, message } }` envelope that never echoes the token/key/process.env/headers. GET /round/:id calls refreshStats FIRST (BLOCKER fix → solver-maintained sealedOrderCount). solve-preview derives matchedVolume = matchedAt(views, pStar) (NOT a ClearingResult field), builds the {price,demand,supply} curve, returns rationale:null (the additive P5 seam) — computes but does NOT settle. settle returns 409 on a Cleared/Settled round (T-04-06). Tests stub the ledger deps + use real §8 helpers via Node fetch on app.listen(0); 14 vitest green, tsc clean.
- [04-04 / SOLV-01]: solver/src/clock.ts is an in-memory Map<roundId, RoundState> clock — openRoundClock arms a single setTimeout(ROUND_SECONDS*1000) auto-close; forceClose cancels it (clearTimeout) and is idempotent; rehydrate seeds from a live query(Round) without arming a timer. The map is cache/clock state ONLY; the ledger Round.status is authoritative (T-04-10). Proven by fake-timer vitest.
- [04-04 / SOLV-02]: solver/src/index.ts boots — dotenv.config() first, rehydrate via ledger.queryAllRounds, buildDeps(...) wiring POST /round → openRound + openRoundClock(roundId, ROUND_SECONDS) and POST /round/:id/close → clock.forceClose, createApp(deps).listen(SOLVER_PORT). Entrypoint-guarded main() + dynamic ledger import keeps index.test.ts ledger-free; injected-dep test asserts both openRound + openRoundClock fire (WARNING fix). Secret-free boot log ':<port> as <operatorParty>'. Thin adapters project ledger CreateEvent<Round>/ClearResult onto the API RoundView/SettleResult; settle allocations recomputed via computeClearing.
- [05-01 / AGENT-01, AGENT-02]: solver/src/agent.ts is the AI Solver Agent — createAgent({client?, computeClearing, matchedAt}) DI factory → proposeClearing(views). Calls Claude (claude-haiku-4-5, temperature 0, max_tokens 1024) via client.messages.parse with output_config.format = jsonSchemaOutputFormat(jsonSchemaLiteral) → reads message.parsed_output; verify-don't-trust gate = proposalSchema.safeParse (zod 3) then priceEqual (Math.round(p*100), 2dp float-safe) AND allocationsEqual (set by desk|side→filledQty, order-insensitive). Agreement → deterministic NUMBERS + the model's rationale (verified:true, source:'claude'); EVERY other path (disagreement / malformed / null / SDK error|timeout / no key) → deterministic §4 fallback @100.00 + neutral rationale (verified:false, source:'deterministic-fallback'). proposeClearing NEVER throws. ANTHROPIC_API_KEY read once at module scope, module-private, never exported/returned/logged (mirrors ledger.ts _operatorToken); catch logs a fixed secret-free string + err.name only. 9 mocked-SDK agent tests + 30-total suite green; tsc clean; auction.ts byte-unchanged.
- [05-01 / DEVIATION]: Used the SDK's jsonSchemaOutputFormat helper (from @anthropic-ai/sdk/helpers/json-schema, zod-v4-free) NOT zodOutputFormat — @anthropic-ai/sdk@0.106.0's helpers/zod hard-imports zod/v4 + z.toJSONSchema, which the CLAUDE.md-pinned zod@3.23.8 lacks. zod stays 3.23.8 and drives the verify-side safeParse only. Installed with --legacy-peer-deps (SDK peerOptional zod ^3.25||^4; same convention as @daml/react). The forced-tool-use fallback is documented in agent.ts as the locked alternative. PROMPT.md (05-02) must mirror SYSTEM_PROMPT verbatim.
- [05-02 / AGENT-03, AGENT-04]: api.ts AppDeps gains proposeClearing: (views) => Promise<AgentResult>; solve-preview + GET /round/:id terminal branch call deps.proposeClearing(views) and emit rationale: agent.rationale (was null in P4) + an additive agent:{verified,source} block — the deterministic clearingPrice/matchedVolume/allocations/curve stay byte-unchanged (P4 backward-compatible). settle is UNCHANGED and never calls proposeClearing (AI off the settlement path). index.ts main() constructs the real agent once via createAgent({computeClearing, matchedAt}) (NO client arg — agent.ts owns the module-private ANTHROPIC_API_KEY, keyless-degrades; index.ts never reads the key) and threads proposeClearing through buildDeps/BuildDepsArgs. api.test.ts extended (verified-claude + deterministic-fallback + GET-terminal rationale tests; secret sweep extended with an ANTHROPIC_API_KEY sentinel asserted absent from both responses). solver/PROMPT.md (new, AGENT-04) documents the system prompt VERBATIM (byte-matched to agent.ts SYSTEM_PROMPT, keep-in-sync note), the user batch JSON shape, the required response JSON {clearingPrice, allocations:[{desk,side,filledQty}], rationale}, the §4 worked example (100.00, A=10/B=8/C=2), and the never-used-unverified guarantee. 33-test suite green; tsc clean. Phase 5 COMPLETE (2/2).
- [06-03 / UI-04, UI-05]: 03 Auction Theatre on the operator plane (:4000) — CountdownRing (hand-rolled 280×280 SVG, CIRC=753.98, stroke-dashoffset=753.98*(1-s/60), red≤10s, 84px mono; pure presentation of `seconds`, the clock lives in TheatreView). TheatreView: 1s setInterval 60→0 auto-fires Close&Solve at 0; Close&Solve = closeRound then solvePreview (NOT GET — Pitfall 4); SOLVER OFFLINE caption on a SolverError 'OFFLINE'; interval cleaned up on unmount. CrossingChart (UI-05, no chart lib): viewBox 0 0 480 360, step supply (animate-umbra-draw, dasharray 640) + dashed demand derived from the LIVE solve-preview curve via lib/curve sx/sy (NOT hard-coded binding polylines), p* rule/dropline/marker positioned by crossingPoint(curve,price,vol)→(296,160) for §4. PriceReveal: lime #D6FB3C 120px hero slab + animate-umbra-slam + red skewX sliver, "1 for all" sub-stats. Solved state = COMPUTING (animate-umbra-pulse) → 2-col chart+reveal grid. No operator token/no @daml/react context in TheatreView/CountdownRing/CrossingChart/PriceReveal (grep-clean, T-06-01). web build + 11 vitest green. CrossingChart reused by 06-04 (AgentView).
- [Phase ?]: [06-01]: web/src/solver.ts is the operator-plane :4000 fetch client (VITE_SOLVER_URL) mirroring solver/src/api.ts; SolverError throws OFFLINE on network reject — no operator token/no @daml/react context in the bundle. Pure lib helpers (curve crossing→296/160, deskBalancesFromAllocations→§4 finals, badgeLabel+parseSolvePreview) vitest@2.1.9-tested. tailwind: umbraLeg + fontSize literals + umbra-draw/pulse/caret/leg aliases (existing values byte-unchanged). Nav 5-tab; App routes 5 + lifts roundId(R1)/phase/preview/offline via operatorState.ts; 4 stub views; Privacy untouched. build+11 vitest green.
- [Phase ?]: 06-04: Settlement plays via a SINGLE rAF settleProgress driving ALL DvP legs + balance lerps simultaneously; aggregate derived from solver allocations with Allocation shape confirmed vs auction.ts; agent badge maps agent.source via badgeLabel

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [P1 gate]: RESOLVED (01-01) — Daml SDK 2.10.4 detected, pinned in `daml/daml.yaml`, and recorded in `DECISIONS.md` with the Daml 2.x HTTP JSON API line + React-18 `--legacy-peer-deps` note.
- [P5 flag]: Confirm GA structured outputs (`output_config.format`) for the Anthropic account/region; wire forced-tool-use fallback if disabled.
- [04-04 / Task 3 DEFERRED]: live `daml start` E2E (open→close→solve-preview 100.00→settle Settled→409; a fresh round's sealedOrderCount advances off 0) NOT run headless — deferred to phase verification per the Phases 1–3 precedent. All non-sandbox behavior is green (21 vitest + tsc clean across 04-01/02/03/04). See 04-04-SUMMARY.md "Deferred Human-Verification Checkpoint" for the exact resume steps.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Stretch (STR) | Daml Finance settlement, cn-quickstart LocalNet, competing solvers, residual routing, multi-round / cancel-replace | v2 — not before P7 | Roadmap creation |

## Session Continuity

Last session: 2026-06-27T21:22:54.425Z
Stopped at: Completed 05-02-PLAN.md — wired the AI Solver Agent into the API (solve-preview + GET /round/:id terminal branch emit the agent rationale + an additive agent:{verified,source} block; deterministic numbers unchanged; settle untouched / AI off the settlement path), constructed the real keyless-safe agent at boot in index.ts, extended api.test.ts (verified/fallback/GET-terminal + ANTHROPIC_API_KEY sentinel), and wrote solver/PROMPT.md (the AGENT-04 contract, SYSTEM_PROMPT byte-matched). 33-test suite green; tsc clean. Phase 5 COMPLETE (2/2).
Resume file: None
