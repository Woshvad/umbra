---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Progress
status: executing
stopped_at: Completed 09-07-PLAN.md
last_updated: "2026-07-09T17:42:00.000Z"
last_activity: 2026-07-09 -- Completed 09-07 (WOW-06 cost-of-leakage simulator: pure client-side leakage.ts + SettlementView dashed-border SIMULATION panel — $X lost vs $0 leaked → $X saved; WOW-06 closed, Phase 9 plans 7/7)
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 14
  completed_plans: 14
  percent: 24
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-25)

**Core value:** The privacy money shot — three desks submit sealed orders blind to each other, an AI solver clears them at one uniform price ($100.00 on the §4 fixture), and the whole batch settles atomically in a single Canton transaction.
**Current focus:** Phase 09 — auction-depth-live-viz

## Current Position

Phase: 09 (auction-depth-live-viz) — EXECUTING (all 7 plans built; end-of-phase live UAT pending)
Plan: 09-07 done (wave 5, final) — Phase 9 plans 7/7 built
Status: Phase 9 build complete; end-of-phase human verification pending
Last activity: 2026-07-09 -- Completed 09-07 (WOW-06 cost-of-leakage simulator: pure client-side leakage.ts + SettlementView dashed-border SIMULATION panel — $X lost vs $0 leaked → $X saved; WOW-06 closed)

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
| Phase 08 P01 | 12min | 2 tasks | 9 files |
| Phase 08 P02 | 9min | 2 tasks | 4 files |
| Phase 08 P03 | 9 min | 3 tasks | 6 files |
| Phase 08 P04 | 16 min | 3 tasks | 9 files |
| Phase 08 P05 | 12 min | 3 tasks | 7 files |
| Phase 08 P06 | 6 min | 3 tasks | 4 files |
| Phase 08 P07 | ~8 min | 3 tasks | 8 files |
| Phase 09 P01 | 22min | 3 tasks tasks | 12 files files |
| Phase 09 P02 | ~11 min | 2 tasks | 5 files |
| Phase 09 P04 | ~14 min | 2 tasks | 7 files |
| Phase 09 P03 | ~12 min | 2 tasks | 5 files |
| Phase 09 P05 | ~18 min | 2 tasks | 10 files |
| Phase 09 P06 | ~7 min | 1 task | 1 file |
| Phase 09 P07 | ~7 min | 2 tasks | 3 files |

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
- [Phase ?]: [08-01 / TRUST-01]: Reused the existing auction.test.ts §4 fixture (clears 100.00, A=10/B=8/C=2 + the 99-vs-100 tie-break trap) as the CI golden gate — no new golden file; the vitest suite IS the regression gate. .github/workflows/ci.yml runs golden vitest on every push/PR touching solver/** or daml/**; daml build+test gated to main push (SDK install is heavy).
- [Phase ?]: [08-01]: Killed the :4000->:4100 port drift in web/src via a single derived source — web/src/solver.ts parses SOLVER_BASE_URL once into exported solverPort + OFFLINE_CAPTION; AgentView/SettlementView/TheatreView import OFFLINE_CAPTION (no caption carries a literal port digit). solver/src/index.ts DEFAULT_SOLVER_PORT=4100; solver/proofs/ gitignored; web/.env.example documents VITE_SOLVER_URL=http://localhost:4100.
- [Phase 08]: [08-02 / WOW-01]: PeekConsole fires a raw per-party JSON Ledger API v2 active-contracts POST as the selected desk's OWN token for a rival's Order/TradeConfirmation; empty []/403 rendered verbatim + red-square verdict. Pure lib/peek.ts (buildPeekRequest/classifyPeekResult/elideBearer) unit-tested; token never in body, node/CORS error rendered distinct from the privacy verdict (Pitfall 4). No operator token in the browser.
- [Phase ?]: [08-03 / TRUST-02, WOW-03]: proposeClearing now imposes a Promise.race deadline (withTimeout rejects AgentTimeoutError into the existing catch -> deterministic §4 fallback); AGENT_TIMEOUT_MS env / AgentDeps.timeoutMs override, default 8000ms. Six-rung ladder (keyless/malformed/zod-invalid/disagreement/SDK-error/TIMEOUT) all clear 100.00, locked by a ladder-table test. parseOrder(text) mirrors proposeClearing (messages.parse + jsonSchemaOutputFormat + orderSchema.safeParse; NOT zodOutputFormat) -> validated {side,qty,limit}|null, key module-private, never auto-submits; POST /parse-order (zod .strict {text:min1max280}, 422 PARSE_FAILED, 400 INVALID_BODY) wired via AppDeps.parseOrder=agent.parseOrder. Secret sweep extended to /parse-order. 49 vitest green, tsc clean; /settle byte-unchanged.
- [Phase 08]: [08-05 / TRUST-03, WOW-05]: NEW solver/src/proof.ts writeProofBundle/readProofBundle (node:crypto sha256) writes an immutable secret-free bundle to solver/proofs/<id>.json at settle — {roundId,timestamp,modelId,systemPromptHash=sha(SYSTEM_PROMPT),batchHash=sha(buildBatchMessage),rawAiProposal(numbers+rationale+source),deterministicRecompute,verified,clearingHash}; stores systemPromptHash NOT the raw prompt/key; roundId sanitized (path-traversal guard). Settle-time write is an ADDITIVE side effect in index.ts settleResult (calls agent.proposeClearing off-authority for provenance); api.ts /settle handler + ledger.ts settle() BYTE-UNCHANGED (0 deletions in api.ts). GET /round/:id/proof serves it read-only (404 absent). NEW solver/src/proofpack.ts renderProofPackHtml copies the deck :root tokens verbatim (#F4F1EA/#0A0A0A/#D6FB3C + Google-Fonts + -webkit-print-color-adjust:exact) with four bundles (clearing proof lime 100.00 hero + §4 fills A=10/B=8/C=2 / best-ex receipts / DvP finality legs A↔B 8@100·A↔C 2@100 + atomic stamp / AI decision bundle); generateProofPackPdf spawns Chrome→Edge --print-to-pdf, ENOENT→{pdf:false,html} window.print() fallback (zero new npm deps; execFile+writer injected, mocked in tests). GET /round/:id/proof-pack.pdf streams the PDF (attachment) or serves the HTML fallback; secret-free PROOFPACK_FAILED 500. 83 vitest green, tsc clean; §4 still $100.00.
- [Phase 08]: [08-07 / WOW-04, WOW-05]: web/src/solver.ts gains rationaleStreamUrl(id)/proofPackUrl(id) (plain URLs off SOLVER_BASE_URL — no :4000, no auth header/credential; EventSource + <a download> consume them) + getBrief(id) (reuses getRound; brief? added to RoundResponse). AgentRationale gains an optional roundId: present + EventSource → opens the SSE stream, appends data deltas into the SAME ink panel (flame caret rides insertion), closes on the `done` event; error-before-any-token OR no roundId → shipped single-shot 26ms/char typewriter (identical look); onerror closes ES (no reconnect); reduced-motion honored (per-chunk append). AgentView passes roundId. NEW RoundBrief.tsx (post-settle 1px-ink block: server brief via getBrief + client fallback from settled preview mirroring composeBrief, no number drift; COPY BRIEF clipboard + DOWNLOAD BRIEF ↓ Blob .txt) + ProofPackButton.tsx (ink-ghost DOWNLOAD PROOF-PACK ↓ fetches proofPackUrl → Blob save pdf/html; ready/preparing/done/error + verbatim WOW-05 error copy). Both gated phase==='settled' below the Settlement CTA; new scoped .umbra-ink-ghost hover rule in index.css (ink-fill/paper-text, existing tokens; never red/lime, no new keyframe). New pure web/src/lib/solverUrls.test.ts (URL construction, no :4000, no credential). web build + 30 vitest green. Live stream/brief/PDF behavior deferred to end-of-phase human verification. Phase 08 COMPLETE (7/7).
- [Phase 08]: [08-06 / WOW-02, WOW-03]: web/src/solver.ts gains parseOrder(text)→POST /parse-order and tamperClear(id,mode)→POST /round/:id/tamper-clear (both reuse SOLVER_BASE_URL/call<T>; no port literal, no operator/Anthropic credential in the bundle). NEW web/src/components/BreakTheAiPanel.tsx mounted on AgentView BELOW the shipped proposal/rationale grid — DEMO · ADVERSARIAL tag, Wrong price/Over-fill toggle, red-ghost FORCE A WRONG CLEAR → tamperClear → verbatim on-ledger reject rendered on the ink evidence surface (never summarized), then RUN CORRECT CLEAR → settle() → lime 100.00 34px umbra-slam sub-reveal + VERIFIED · SETTLED @ 100.00 red-square row; SolverError OFFLINE → graceful caption; no confirm dialog (tamper is atomic/harmless). Scoped .break-ai-force:hover CSS rule added to index.css (red fill/paper text, existing tokens only — inline styles can't do :hover). OrderTicket gains an NL sub-block ABOVE the side toggle: plain-English input (1px ink underline) + PARSE → calls parseOrder → PREFILLS side/qty/limit (Side enum, qty→String, limit→toFixed(2)) + PROPOSED BY CLAUDE — REVIEW & SEAL note; 422/SolverError → verbatim error copy; SEAL ORDER stays the SINGLE confirm (onParse NEVER calls onSeal) and ticketLocked one-per-round lock is byte-unchanged. web build + 21 vitest green; grep-clean of :4000/operator-token/Anthropic-key literals.
- [Phase 08]: [08-04 / WOW-04, WOW-02]: agent.streamRationale(views,{onDelta,onDone,onError}) proxies client.messages.stream().on('text'); keyless/stream-less/thrown -> onError EXACTLY once, never leaking key/prompt (AgentClient.messages.stream is OPTIONAL so a parse-only fake still typechecks; call through client.messages.stream to keep the SDK `this`). GET /round/:id/rationale-stream is SSE (NOT wrap()): text/event-stream data: delta frames + `event: done` sentinel; onError writes ONE deterministic composeBrief fallback frame then ends (no sentinel). New pure brief.ts composeBrief(price,matched,allocs,rationale) -> shareable NL summary, secret-free, no number drift; surfaced additively as `brief` on the terminal-settled GET body. WOW-02: DEDICATED ledger.tamperClear(roundId,'wrong-price'|'overfill') copies settle()'s exact cid-gathering but perturbs ONLY numeric values (badPrice=p*-1 / Buy filledQty+2, Pitfall 3), attempts Round.Clear, catches the verbatim submitAndWait reject, resolves {rejected,error} — never throws, never settles; POST /round/:id/tamper-clear (zod .strict {mode}) returns the verbatim body. settle() (ledger.ts + api.ts) BYTE-UNCHANGED (git-diff verified); §4 still $100.00. Overfill's faithful first-firing assert is 'allocations do not match recomputed §8' (Daml checks alloc-match before conservation). Secret sweep extended to /rationale-stream + /tamper-clear. 62 vitest green, tsc clean.
- [Phase ?]: [09-01 / AUCT-01]: Additive order model as a PURE REDUCTION — OrderType(Limit|Noncompetitive|AllOrNone|Conditional)+minQty/firmIf on OrderView/Order/Venue.SubmitOrder+TS mirror; effective-limit (limit stays Decimal). New fields INERT until wave 2; §4 stays 100.00/A=10/B=8/C=2, Daml-TS parity intact.
- [Phase ?]: [09-01]: web/daml.js regenerated+committed (fresh-clone invariant 6e4bade); generated Order/SubmitOrder carry orderType/minQty/firmIf. DeskColumn.tsx was a 2nd SubmitOrder site the plan missed (Rule 3 fix).
- [Phase ?]: [09-01 / AUCT-02]: RULEBOOK.md skeleton anchors max-matched->min-imbalance->lower-price + topPrices trap guard + bp formula, cites both Clearing.daml and auction.ts; 09-02/09-03 fill per-type sections. AUCT-01/02 NOT complete (multi-plan foundation).
- [09-02 / AUCT-01,AUCT-02]: coreClear extracted (single-pass §8 kernel) + computeClearing now a two-pass wrapper (partition firm/conditional, provisional coreClear over firm, pass-through `qualifies` hook for 09-03) — behavior-preserving in both planes. Noncompetitive shipped: any-price demand/supply (isNoncomp OR limit), excluded from candidatePrices, TOP-priority ration key `(not noncomp, per-side limit)` — Daml Bool→TS 0/1 (Pitfall 6); per-side direction kept (sells ASC or §4 breaks). Golden parity fixtures test_noncomp_sell_top_priority ⇄ auction.test.ts noncomp (p*=100.00, A=6/B=2/C=4). §4 canary + 99-vs-100 trap green; solver 84/84, daml 16 ok, tsc clean. RULEBOOK Noncompetitive section filled citing both planes. Noncomp kept SELL-side (single funded buyer, Pitfall 3). AUCT-01/02 still NOT complete (AON/MAQ + Conditional + full rulebook land 09-03).
- [09-03 / AUCT-01,AUCT-02]: AON/MAQ + Conditional shipped in lockstep — coreClear rewritten as a bounded (candidate-price × subset) powerset enumeration with a ≥minQty inclusion test (top-level recursive `powerset` + `fillsAtPrice`/`fillOfOrder`/`isAon`/`minQtyOf`; ranking key (negate matched, imbalance, price, subsetIdx) keeps matched PRIMARY so the 99-vs-100 trap survives; §4 reduces via powerset[]==[[]] → single ∅ subset). Conditional = top-level `qualifies` (buy provP≤firmIf / sell provP≥firmIf) wired into the two-pass computeClearing (PASS1 provP over firm; PASS2 firm qualifiers vs provP; NOT a fixpoint). Six golden fixtures (test_maq_excluded/included, test_aon_fills/drops, test_conditional_firms/drops) mirrored Daml⇄TS with identical numbers. No Auction.daml/Roles/web-bindings change (only pure fns changed; OrderView/OrderType data shape unchanged) — Round.Clear auto-covers via computeClearing. daml test all green, solver 93/93, tsc clean; §4 100.00/A=10/B=8/C=2 + trap intact. RULEBOOK.md COMPLETE (all four order-type sections cite both planes). AUCT-02 CLOSED; AUCT-01 stays open pending order-type entry UI (09-06).
- [09-06 / AUCT-01]: Order-type entry UI shipped in OrderTicket (desk plane, submits on the desk's OWN token — grep-clean of operator/@daml/react). Segmented `LIMIT·NONCOMP·MAQ·COND` selector (ink-underline, mono-9 toggle grammar) sits below the WOW-03 NL assist, above the side toggle + an active-type descriptor (umbra-rise). Per-type show/hide: Noncompetitive replaces the limit input with a `FILL AT CLEAR — NO LIMIT PRICE` caption; MAQ(AllOrNone) adds a 1px-assist-tier Min Acceptable Qty (+ `= FULL FILL ONLY` when min==qty); Conditional adds a side-directional Firm-If band (`≤` buy / `≥` sell). Non-blocking validation copy verbatim per UI-SPEC. Type-aware `Venue.SubmitOrder` carries orderType/minQty(String|null)/firmIf(toFixed(1)|null); Noncompetitive sends a `0.0` limit placeholder (the ensure skips limit>0 for it — 09-01 effective-limit). `load demo` resets to plain Limit; NL PARSE never switches the type; single SEAL ORDER confirm + one-per-round lock + seal-wipe byte-unchanged. No new tailwind token/fontSize/keyframe. web build + 30 vitest green. Live per-type submit against a running open round = end-of-phase human-check. AUCT-01 CLOSED.
- [09-05 / AUCT-04]: On-ledger best-ex/TCA. TradeConfirmation gains ownLimit(Optional)/referencePrice/surplusVsLimit/improvementVsLimitBp/improvementVsReferenceBp(signed); Round.Clear computes per-desk surplus at the create site and asserts `surplusVsLimit >= 0` on-ledger (T-09-05-01 — the PROVEN best-ex number). referencePrice is a LABELED stub choice arg (REFERENCE_PRICE_STUB=100 in ledger.ts; a choice body can't read config so it's passed in), driving ONLY the SIGNED improvementVsReferenceBp benchmark — never conflated with the proven ≥0 number. bp = roundBankers 0 ((|limit−p*|/p*)*10000) ⇄ pinned RULEBOOK formula. §4 surpluses A=10/B=8/C=0, all bp-vs-ref=0 (ref==p*). daml test 23/23 green (test_surplus_nonneg + extended test_settled_balances; all 5 Clear call sites pass referencePrice); web/daml.js regenerated+committed. Solver: readTradeConfirmations maps TCA fields, settle/tamperClear pass referencePrice (settle otherwise byte-unchanged), api.ts settled body gains receipts[], proofpack bundle 02 renders two-distinct-surplus (secret sweep green); 94/94 vitest, tsc clean. Web: Receipt type + receipts on RoundResponse; new TcaReceipts.tsx (proven ink vs-LIMIT row + benchmark vs-REFERENCE red-only-when-negative + REFERENCE stub tag + EXPORT RECEIPT ink-ghost). web build + 30 vitest green. Per-desk privacy unchanged (TradeConfirmation observer=desk). Live settled-round receipt = end-of-phase human-check. AUCT-04 CLOSED.
- [09-07 / WOW-06]: Cost-of-leakage simulator shipped as a PURE web leaf lib — web/src/lib/leakage.ts `estimateLeakage(legs)` walks the buy-side matched volume sequentially through a naive public book (unit i premium over the clear = clearingPrice·(SLIPPAGE_BP_PER_UNIT·i + FRONT_RUN_BP)/1e4 — book-depth slippage + flat front-run markup, illustrative bp constants) → `publicBookLost`; sealed clear `umbraLeaked:0`; `saved===publicBookLost`. §4 → $5.10. Pure/DOM-free (no fetch/@daml/document/Date/random), deterministic, empty-safe; `ownLimit` in the LeakageLeg shape but NOT load-bearing (capping at the buyer's limit would zero §4). 7 vitest cases. SettlementView `LeakageSimPanel` (post-settle, BELOW the AUCT-04 receipts): 1px DASHED ink border + `SIMULATION · ILLUSTRATIVE — NOT LEDGER DATA` tag + disclaimer (unmistakably NOT ledger data — real receipts use SOLID ink); `$X LOST` red / `$0 LEAKED` ink / `$X SAVED` ink punchline (never lime), umbra-rise + reduced-motion. Reads only preview.allocations — no solver/ledger call in the sim path. No clearing/template/solver change (§4 canary untouched). web build + 37 vitest green. WOW-06 CLOSED; Phase 9 plans 7/7 built (live UAT end-of-phase).
- [09-04 / AUCT-03,VIZ-01]: OPEN-window aggregate indicative feed — api.ts GET /round/:id attaches an `indicative` block (SCALARS ONLY: `{indicativePrice|coarse+band, netImbalance, estMatched}`) only when status Open with ≥1 sealed order. Small-N guard: exact price published only with ≥2 orders on BOTH sides (else coarse band = round(p*/5)*5 + coarse:true — §4's single buyer → coarse). NO curve/candidatePrices during open (buildCurve stays terminal-only, Pitfall 1). choosePStar threaded through AppDeps/MathPort/buildDeps. api.test.ts +3 (indicative/no-leak, small-N coarse band, open-body secret sweep); solver 87/87, tsc clean. web solver.ts IndicativeMeta type. VIZ-01: CrossingChart gains `mode` prop (assembling|locked, default locked) — assembling hides red p*/marker/label + faint region + ASSEMBLING caption; locked byte-unchanged SVG (296,160/r5/15px) + red-square `p* LOCKED @ {price}` verdict. TheatreView indicative panel (INDICATIVE/NET IMBALANCE/EST. MATCHED, small-N labeled) + assembling chart during open (curve=[] — no per-order geometry crosses the wire). curve.ts UNCHANGED (curve.test.ts §4 marker green); web build + 30 vitest green. Live "updates as orders arrive" = end-of-phase human-check.

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

Last session: 2026-07-09T17:42:00.000Z
Stopped at: Completed 09-07-PLAN.md
Resume file: None
