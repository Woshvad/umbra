# Pitfalls Research

**Domain:** Sealed-bid batch-auction venue on Daml/Canton (operator-custody DvP) + Claude AI solver agent
**Researched:** 2026-06-25
**Confidence:** HIGH (Daml privacy/contention/JSON-API claims verified against docs.daml.com; Claude structured-output claims verified against platform.claude.com; clearing-algorithm and hackathon-scope pitfalls reasoned directly from spec.md §7–§18)

> Phase names below map to spec §17: **1 Skeleton · 2 Clear & settle · 3 Privacy proof · 4 Solver service · 5 AI agent · 6 Theatre · 7 Polish**. The single most expensive mistake category for THIS project is anything that breaks the privacy money shot (Phase 3) or the exact-$100.00 clear (Phases 2/4), because those are the two things judges check and the two things the spec stakes the win on.

---

## Critical Pitfalls

### Pitfall 1: Observer/signatory mis-declaration leaks an `Order` to rival desks (kills the money shot)

**What goes wrong:**
An `Order` (or `TradeConfirmation`, or `Asset`) ends up visible to a desk that should be blind to it. The 3-up Privacy view then shows BankA something about BankB's order, and the entire pitch ("zero information leakage") collapses live on stage. Common concrete causes:
- Putting `desks` (the whole list) as an observer on `Order` instead of just the single `desk`.
- Declaring the `Round` or `Venue` with `observer desks` (correct — they must see the round to submit) but then *carrying order contents into the Round/RoundStats contract* (e.g., storing the order list or a per-desk breakdown on `RoundStats`), so the count-only guarantee leaks.
- Adding `operator` correctly but also adding a convenience observer "so the UI can read it" during debugging and never removing it.

**Why it happens:**
In Daml, contract visibility = signatories ∪ observers ∪ (choice observers/actors of exercised choices). Developers reach for observers to make a contract "readable from the frontend" without realizing observer = *full contract visibility to that party forever*. The spec's design is deliberately tight (`Order` signatory = `operator, desk`; no observers) precisely so no third desk can ever be a stakeholder — any added observer breaks it. Per Daml's privacy model, "contracts should only be shown to their stakeholders" and stakeholders are the union of signatories and observers ([ledger-privacy](https://docs.daml.com/concepts/ledger-model/ledger-privacy.html)).

**How to avoid:**
- Keep the spec's exact declarations: `Order` → `signatory operator, desk` and **no observer**; `TradeConfirmation` → `signatory operator`, `observer desk` (single party, not the list); `Asset` → `signatory operator`, `observer owner`; `RoundStats` carries **only** `sealedOrderCount : Int` and never any per-order data.
- Write the privacy tests (spec §16 tests 4 & 5) **in Phase 3, before** building the UI, and run them as a gate. A Daml Script `queryFilter`/`query` as BankA must return zero of BankB's `Order`s.
- Never add an observer "for the UI." The UI reads as a *party* via its own JWT (Pitfall 8); if a party can't see a contract, that's correct, not a bug to patch with an observer.

**Warning signs:**
- A Daml Script `query @Order bankA` returns more than BankA's own orders.
- You find yourself adding `observer desks` to `Order` to "make the frontend work."
- `RoundStats` has any field beyond the count (e.g., `orders`, `sides`, `totalDemand`).

**Phase to address:** Phase 1 (declare templates correctly) + Phase 3 (prove with tests 4–5 before the 3-up view).

---

### Pitfall 2: Trusting the AI's numbers — using Claude's clearing price/allocation unverified

**What goes wrong:**
The solver service submits `Round.Clear` with the price/allocation Claude returned, without recomputing them deterministically. The model hallucinates a price (e.g., 100.5 instead of 100.00), mis-rations the long side, or returns an allocation that violates a limit — and because the demo's canonical fixture is small, it may *look* plausible. On stage the clear shows the wrong number, or worse, a subtly unfair fill that a judge spots.

**Why it happens:**
The AI is the differentiator, so there's pressure to make it "really" do the work. It's tempting to skip the deterministic recompute because "the model got it right in testing." LLM arithmetic on multi-step rationing is exactly the kind of task models get *almost* right.

**How to avoid — this is the project's central backstop, emphasize it everywhere:**
**Deterministic core + on-ledger re-verify.** Two independent guards, both mandatory:
1. **Off-ledger:** the solver service computes p\* and the allocation with the deterministic TypeScript algorithm (§8). Claude's output is used **only** for (a) the narration/rationale and (b) optionally as a *candidate* that must byte-match the deterministic result before it is allowed to drive settlement. If Claude disagrees, the deterministic result wins and the disagreement is logged, never settled.
2. **On-ledger:** `Round.Clear` re-verifies the submitted `clearingPrice` + `allocations` against the sealed `Order`s and current `Asset` balances (max-volume, every fill within its order's limit, cash+asset conservation, no overdraw) and **rejects** anything inconsistent (spec §10, §16 test 6). The ledger is the final authority; a wrong/malicious solver proposal cannot settle.
- Treat Claude as a *narrator and optional competitor*, never as the source of truth for any number that moves an asset.

**Warning signs:**
- `agent.ts` output is passed to `ledger.exercise(Clear, ...)` without a `recompute()` equality check in between.
- The deterministic TS algorithm exists but is only used for the UI chart, not as the settlement input.
- `Round.Clear` accepts `allocations` and reassigns assets without re-deriving `matched(p*)` and checking conservation on-ledger.

**Phase to address:** Phase 4 (deterministic core is the settlement input) and Phase 5 (AI layer is additive, verified-don't-trusted). On-ledger re-verify is Phase 2.

---

### Pitfall 3: Asset split/merge contention & non-atomic settlement inside `Round.Clear`

**What goes wrong:**
Settlement reassigns multiple `Asset`s (split a seller's BONDX, move part to the buyer, move USDCx the other way, merge residuals). If this is done across *multiple* transactions/commands instead of one, you get: (a) a contention/`ContentionError` when two operations consume the same `Asset` contract, or (b) a partial settlement where the asset leg moved but the cash leg failed — destroying the DvP/atomicity guarantee the whole pitch rests on. Test 3 (`test_atomicity`) then fails: a seller short on the asset should roll back *everything*, but balances changed.

**Why it happens:**
Developers naturally model "move asset" and "move cash" as separate steps and exercise them sequentially. Daml's atomicity guarantee only holds **within one transaction**; splitting the settlement into several exercises forfeits it. Contention specifically arises when multiple transactions try to consume the same contract — only one succeeds ([reduce contention](https://docs.daml.com/daml/resource-management/contention-reducing.html), [error codes](https://docs.daml.com/canton/reference/error_codes.html)).

**How to avoid:**
- Do **all** settlement legs inside the single `Round.Clear` choice body: re-verify → split/merge/reassign every `Asset` → archive/mark `Order`s → create every `TradeConfirmation` → set `status = Settled`. One transaction = atomic by construction (spec §10). The split+merge of a position can and should happen inside that one settlement transaction, not as separate commands ([contention techniques](https://docs.daml.com/daml/resource-management/contention-techniques.html)).
- Fetch each `Asset` by ContractId once inside the choice and thread the resulting ContractIds through the local computation; never exercise the same `Asset` ContractId twice expecting both to succeed.
- Add an explicit **conservation assertion** in the choice body: total BONDX before == after, total USDCx before == after, and `assertMsg` on any overdraw — so insufficient holdings fail the whole transaction (test 3).

**Warning signs:**
- `Clear` logic spans more than one `exercise`/`submit` on the ledger side.
- `test_atomicity` shows changed balances after a deliberately-underfunded seller.
- A `ContentionError`/`LOCAL_VERDICT_LOCKED_CONTRACTS` appears when clearing.

**Phase to address:** Phase 2 (all DvP inside one `Clear`; pass tests 1–3).

---

### Pitfall 4: Integer rationing / pro-rata rounding that overshoots matched volume or mismatches the fixture

**What goes wrong:**
The long-side rationing (spec §8 step 4) distributes `traded` units across eligible orders with integer rounding. Naive `round(qty_i * traded / total)` per order can sum to **more or fewer** than `traded`, so the allocation over-fills (asset/cash conservation breaks → `Clear` rejects, or settles a non-conserving batch) or under-fills (leftover units silently dropped). For the canonical fixture this surfaces as **not clearing at exactly 100.00 / not getting fills A=10, B=8, C=2** — the one number the entire demo hinges on.

**Why it happens:**
Pro-rata + integer rounding is a classic off-by-one generator. The tie-break order (§8 step 3: max matched → minimize |demand−supply| → lower price) and the allocation order (price priority, then pro-rata, leftover to largest order) are precise and easy to implement *almost* correctly. A subtly different tie-break (e.g., choosing the higher price, or float comparison making 100.00 ≠ 100.0) yields a different p\* and the demo shows the wrong hero number.

**How to avoid:**
- Implement §8 **literally**, including the documented leftover rule ("give leftover unit(s) to the largest order") and the two-level tie-break in order. Use integer arithmetic for quantities; use `Decimal`/fixed 2-dp for price and compare with a tolerance or rounded-to-2dp canonical form, never raw float `==`.
- Make the **TS and Daml implementations produce identical output by construction**: same candidate-price set, same sort, same tie-break, same leftover rule. Cross-check them on the fixture in both `Tests.daml` (test 1/2) and TS unit tests.
- Unit-test the rationing invariant directly: `Σ filledQty(short side) == Σ filledQty(long side) == traded` for every scenario, including exact ties, imbalance, and **no-cross** (no candidate price yields a positive match → empty allocation, `matched = 0`, nobody settles).
- Add the §8 worked example (A{10,101}, B{8,99}, C{5,100} → p\*=100, fills 10/8/2) as a frozen golden test in both languages.

**Warning signs:**
- TS clear and Daml clear disagree on any scenario.
- A rationing test where filled quantities don't sum to `traded`.
- The fixture clears at 101.00 (tie-break wrong), or `100.00 !== 100.0` assertion failures from float comparison.
- No explicit no-cross test (the auction must cleanly produce "no match," not crash or divide-by-zero on empty supply/demand).

**Phase to address:** Phase 4 (TS algorithm + unit tests incl. ties/no-cross) and Phase 2 (Daml re-verify must match; tests 1, 2, 6).

---

### Pitfall 5: Daml/Canton version drift — 2.x JSON API vs 3.x JSON Ledger API v2, and the codegen↔bindings version lock

**What goes wrong:**
The build assumes the Daml 2.x **HTTP JSON API** (`@daml/react` + `@daml/ledger` + `daml codegen js`, JSON API on `:7575`), but the installed SDK is on the 3.x / Canton line, which exposes the **JSON Ledger API v2** with different endpoints, payload shapes, and auth. Imports, query shapes, and streaming all differ, and half a day vanishes chasing 404s/shape errors. A subtler variant: `@daml/react`/`@daml/ledger` npm versions don't match the SDK that ran `daml codegen js`, so the generated `@daml.js` bindings are incompatible with the runtime libraries.

**Why it happens:**
The spec explicitly flags this as risk #1 but the failure is easy to walk into because `daml start` "just works" until a JSON shape differs. The `@daml/*` libraries are tightly coupled to the SDK that generated the bindings; a global SDK upgrade or a stale `package.json` version silently desyncs them.

**How to avoid:**
- **Phase 1, first task:** detect the installed SDK (`daml version`), pin it in `daml.yaml`, and record it in `DECISIONS.md`. Choose the API line (2.x HTTP JSON API vs 3.x JSON Ledger API v2) once, from that detection, and adapt import paths from the matching docs version — not from memory/training data, which may be stale.
- Generate bindings with the **same** SDK and let `daml start`/`create-daml-app` scaffolding set `@daml/react`/`@daml/ledger` versions; don't hand-bump them. Keep all templates standard (templates/choices/interfaces only) so the DAR compiles on either line (spec §6 note).
- Treat the JSON API version as a hard fact to verify against the running endpoint early (hit a known query and confirm the response shape) before building five views on top of an assumption.

**Warning signs:**
- `@daml/react` calls 404 or return an unexpected shape against `:7575`.
- `@daml.js` bindings throw type/runtime errors against the installed `@daml/ledger`.
- `DECISIONS.md` has no recorded SDK version, or it doesn't match `daml version`.

**Phase to address:** Phase 1 (detect, pin, record, choose API line before any frontend work).

---

### Pitfall 6: Per-party JWT/token setup wrong — privacy is faked, not real (or queries return nothing)

**What goes wrong:**
The party switcher uses a single admin/operator token (or a token with `readAs` of all parties) for every desk, so the UI *can* fetch other desks' data and merely hides it in the frontend. A judge who inspects the network tab sees BankA's session pulling BankB's contracts — the "privacy is real, not faked" claim (spec §12.1, PROJECT.md) is falsified. The opposite failure: tokens are mis-scoped (`actAs`/`readAs`/`ledgerId`/`applicationId` wrong) so per-party queries return empty and nothing renders.

**Why it happens:**
Dev JWTs in the Daml JSON API are unsigned/loosely validated, so a too-powerful token "works" and the mistake is invisible until someone looks. The JSON API decodes the token to fill party fields: for queries the token must prove the bearer can act and/or read for a party; for submissions it must prove `actAs` ([JSON API auth](https://docs.daml.com/json-api/index.html)). Getting `ledgerId`/`applicationId`/`actAs` right in the JWT payload is fiddly.

**How to avoid:**
- Mint **one token per desk** scoped to *only that party* (`actAs`/`readAs` = `[that desk]`), generated by the setup script (spec §14) into `parties.json`/`.env`. The browser, when impersonating BankA, holds only BankA's token — so it physically cannot query BankB.
- Route any operation needing Operator authority (open round, close, solve, settle) through the **solver service**, which alone holds Operator credentials; the browser never gets an Operator/admin token for desk views (spec §11, §12.1).
- Verify in Phase 3: with BankA's token, a JSON API query for BankB's `Order` returns empty — confirm at the HTTP layer, not just in the UI.

**Warning signs:**
- One shared token in the frontend for all parties, or a desk token with `readAs` including other desks.
- The network tab shows a desk session receiving another desk's contracts.
- Per-party queries return empty for the *owning* party (token mis-scoped).

**Phase to address:** Phase 3 (party-scoped tokens are the mechanism that makes the money shot real).

---

### Pitfall 7: Hackathon overscope — starting cn-quickstart LocalNet or Daml Finance settlement too early

**What goes wrong:**
The team boots `cn-quickstart` LocalNet (≈8GB Docker, validators + super-validator + CC wallet) or starts replacing the operator-custody `Asset` with Daml Finance `Holding`/`Batch`/`Instruction` settlement *before* the vertical slice works. Days disappear on Docker/infra and the allocate/approve multi-party settlement flow, and the privacy-→-clear-→-atomic-settle slice (the thing that actually wins) is never finished.

**Why it happens:**
"Runs on real Canton" and "production-grade Daml Finance DvP" sound more impressive, so they pull focus. Both are explicitly **stretch (§19)** and both are heavy: LocalNet is resource-hungry; Daml Finance reintroduces exactly the multi-party authority complexity the operator-custody model was chosen to avoid (spec §7.1, §18).

**How to avoid:**
- Follow §17 order strictly. Build on `daml start` (sandbox + JSON API); keep the operator-custody `Asset` model for the MVP; **ship a working vertical slice by end of Phase 3.** Defer LocalNet and Daml Finance to after Phase 7 polish, "as time allows."
- Treat "it runs on Canton" as a *claim demonstrated by sub-transaction-privacy semantics* you can make on the sandbox (spec §10 says: demo on whichever is running, claim the Canton property via per-party queries) — you do not need LocalNet running to make the privacy point.

**Warning signs:**
- Anyone runs `make start`/`cn-quickstart` or imports Daml Finance packages before Phase 7.
- The vertical slice (3 orders → 100.00 → atomic settle → per-desk fills) isn't demoable but effort is going into infra/custody upgrades.

**Phase to address:** Phase 7+ only (stretch §19). Guard it in Phases 1–6 by gating on "vertical slice works first."

---

### Pitfall 8: Polishing before the vertical slice clears end-to-end

**What goes wrong:**
The team builds the five high-fidelity design views, the settlement animation, and the supply/demand SVG against mocked data while `Round.Clear` doesn't yet truly settle atomically or the privacy tests don't pass. The demo looks gorgeous but the hero moment (real atomic clear at 100.00, real per-party blindness) isn't wired, and the last hours are spent connecting plumbing under a finished skin.

**Why it happens:**
The binding design comp (`Umbra design/`) is concrete and fun to build; ledger correctness is invisible until it's done. Spec §0 and §17 both warn explicitly: get the end-to-end slice working **before** polishing.

**How to avoid:**
- Enforce the §17 ordering: Phases 1–3 produce a *rough but real* end-to-end slice (real ledger, real privacy, real atomic settle) before Phase 6/7 visual polish. Wire each view to live JSON API data as soon as that view's data exists, not to mocks.
- Use the canonical fixture as a continuous integration smoke test: `RunCanonicalRound` (spec §14) must keep clearing at 100.00 with the §4 balances throughout the build.

**Warning signs:**
- Frontend views render from hardcoded/mock data past Phase 3.
- Screenshots exist before tests 1–6 pass.
- The settlement animation plays but no `TradeConfirmation`/`Asset` actually changed on the ledger.

**Phase to address:** Phases 1–3 (slice first); Phases 6–7 (polish only after slice is real).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Operator-custody `Asset` instead of Daml Finance holdings | Sidesteps multi-party authority; one signatory suffices for split/merge/reassign | Not a "real" custody/DvP story; reviewers may note centralization | **Yes, for the MVP** — explicitly the chosen design (§7.1); Daml Finance is stretch §19 |
| Force-close endpoint instead of waiting 60s | Demo doesn't stall on stage | Round timing logic less exercised | **Yes** — spec ships `POST /round/:id/close` for exactly this |
| Single fixture (the §4 round) as the only real scenario | Fast to demo, guaranteed to clear at 100.00 | Clearing edge cases (ties, no-cross) untested | **Only if** TS unit tests still cover ties/no-cross/imbalance (spec §16) — never skip those |
| Adding a debug observer to read a contract from the UI | Instant frontend visibility | **Breaks privacy permanently** — leaks to that party | **Never** — read as the party via its JWT instead |
| Settling across multiple ledger commands | Easier to reason about leg-by-leg | Forfeits atomicity/DvP; contention risk | **Never** — all legs in one `Clear` transaction |
| Passing Claude's numbers straight to `Clear` | Less code; "the AI really did it" | Wrong/unfair clear; falsifies correctness claim | **Never** — deterministic core + on-ledger re-verify are mandatory |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic SDK (`@anthropic-ai/sdk`) | Calling Claude from the browser, exposing `ANTHROPIC_API_KEY` | Server-side only in `solver/`; key from env, never committed, never shipped to the frontend (spec §6, §15) |
| Anthropic SDK — output format | Hoping a prompt yields clean JSON; parsing prose; schema drift between runs | Use the **structured outputs / strict tool-use** feature (constrained decoding) so the response is guaranteed-valid JSON matching the `{clearingPrice, allocations, rationale}` schema, not free-text prompting ([structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). Still re-verify the numbers — structured output guarantees *shape*, not *correct arithmetic* |
| Anthropic SDK — determinism | Assuming `temperature: 0` makes the model deterministic | Temperature 0 reduces but does **not** guarantee identical outputs; the docs do not promise determinism. Never let flakiness reach settlement — the deterministic TS core is the source of truth; Claude's number is candidate/narration only |
| Daml JSON API auth | One admin token for all parties; UI hides others' data | One party-scoped JWT per desk (`actAs`/`readAs` = that party only); Operator actions via the solver service ([JSON API](https://docs.daml.com/json-api/index.html)) |
| `daml codegen js` ↔ `@daml/ledger`/`@daml/react` | Hand-bumping npm versions out of sync with the SDK that generated bindings | Generate and run with one pinned SDK; let scaffolding fix the `@daml/*` versions (Pitfall 5) |
| `daml start` JSON API vs Canton JSON Ledger API v2 | Building the frontend against the wrong API line | Detect SDK, choose the API line in Phase 1, verify response shape against the live endpoint before building views |

## Performance Traps

> This is a fixed-cast hackathon demo (5 parties, one round, a handful of orders). True scale is not a concern; the relevant "traps" are demo-time stalls and latency, not throughput.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous Claude call on the settlement path | Settlement waits seconds for the model; demo feels laggy or times out | Run the AI as `solve-preview` (the "watch it think" beat) decoupled from `settle`; settlement uses the already-computed deterministic result | Whenever the API is slow/rate-limited mid-demo |
| Polling the JSON API in a tight loop for round status | UI jank, wasted calls | Use the JSON API streaming/query-as-needed; drive state changes from the solver service's HTTP API | Even at demo scale, visibly janky |
| Re-querying all contracts per render | Sluggish 3-up view | Scope queries per party/template; the 3-up view is three independent party-scoped reads | Noticeable with the redaction-heavy Privacy view |
| Live 60s countdown blocking the demo | Awkward dead air on stage | Use the force-close endpoint; treat 60s as config, not a hard wait | Every live run if not force-closed |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `ANTHROPIC_API_KEY` reachable from the browser or committed | Key leak, abuse, disqualification optics | Env-only, read solely by `solver/`; `.env` gitignored, ship `.env.example` (spec §15) |
| Over-broad desk JWTs (`readAs` includes other desks) | Privacy claim is false; judge sees cross-desk reads | Strictly per-party tokens; verify with a cross-party query returning empty (Pitfall 6) |
| Frontend holding Operator/admin credentials | Browser could open/close/clear rounds or read everything | Operator authority lives only in the solver service; browser gets desk tokens + solver URL only (spec §11, §12.1) |
| `Round.Clear` trusting client-supplied `allocations` | A crafted proposal could settle an unfair/non-conserving batch | On-ledger re-verification (max-volume, limits, conservation, no overdraw) rejects bad input — the ledger is the backstop (spec §10, test 6) |
| Committing Claude as a co-author | Violates the strict user requirement (PROJECT.md constraints) | Author/committer stays `woshvad`; no `Co-Authored-By`, no "Generated with" lines on any commit |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing the sealed order *contents* in any aggregate/Operator view pre-clear | Undermines the "venue sees only a count" claim — the core narrative | Pre-clear, surface **only** `sealedOrderCount`; reveal contents/curve only after clear (spec §10, §12.3) |
| Faking blindness in the frontend (filtering others' data client-side) | A network-tab inspection exposes the fake; pitch falls apart | Each panel rendered with that desk's own token so it *cannot* fetch others' data (spec §12.1) |
| Allowing a second order per round | Contradicts the MVP mechanism (one order/desk/round); confuses the demo | Disable the ticket after submit; one sealed order per desk per round |
| Settlement animation playing without real ledger change | Looks done, isn't; judges may ask to verify | Drive the animation from actual `TradeConfirmation`/`Asset` updates via the JSON API |
| Hero number rendered from the AI's text | A flaky/hallucinated number shows on stage | Render p\* from the verified deterministic result; AI text is narration beside it, not the source |

## "Looks Done But Isn't" Checklist

- [ ] **Privacy money shot:** Often missing *real* per-party tokens — verify a JSON API query as BankA returns **zero** of BankB's `Order`s at the HTTP layer (tests 4–5), not just hidden in the UI.
- [ ] **Atomic settlement:** Often missing the all-or-nothing rollback — verify `test_atomicity`: an underfunded seller makes `Clear` fail with **no** balance changes.
- [ ] **Clearing correctness:** Often missing rationing-sum and no-cross handling — verify `Σ short fills == Σ long fills == traded` and that an empty/no-cross batch yields `matched=0` cleanly, plus the fixture clears at exactly **100.00** in *both* TS and Daml.
- [ ] **AI verify-don't-trust:** Often missing the equality gate — verify the deterministic recompute runs *between* Claude's output and `Round.Clear`, and that `Clear` re-verifies again on-ledger (test 6 rejects a bad allocation).
- [ ] **Version pin:** Often missing — verify `DECISIONS.md` records the exact SDK version, it matches `daml version`, and the chosen JSON API line matches the live endpoint's response shape.
- [ ] **Secret hygiene:** Often missing — verify `ANTHROPIC_API_KEY` is absent from the frontend bundle and from git history; `.env.example` ships without a real key.
- [ ] **Conservation:** Often missing an explicit on-ledger check — verify total BONDX and total USDCx are unchanged across `Clear` (cash-in == cash-out at p\*).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Observer leak on `Order`/`TradeConfirmation`/`Asset` | LOW–MEDIUM | Remove the stray observer; recompile; rerun privacy tests 4–5; redeploy DAR (state is dev-seeded, so re-run `Setup.daml`) |
| AI numbers used unverified | LOW | Insert the deterministic recompute + equality gate before `exercise(Clear)`; ensure on-ledger re-verify exists (test 6) |
| Non-atomic / contended settlement | MEDIUM | Refactor all settlement legs into the single `Round.Clear` choice body; fetch each `Asset` once; add conservation/overdraw asserts; rerun test 3 |
| Rationing/rounding off-by-one or fixture ≠ 100.00 | MEDIUM | Re-implement §8 step 4 literally (leftover-to-largest, two-level tie-break); add sum-invariant + golden fixture tests in both languages |
| Wrong Daml API line chosen | MEDIUM–HIGH | Re-detect SDK; switch import paths/query shapes to the correct line; regenerate bindings with the pinned SDK |
| Faked frontend privacy discovered | MEDIUM | Replace shared token with per-party JWTs from `parties.json`; route Operator actions through the solver service |
| Overscope sink (LocalNet/Daml Finance started early) | HIGH | Park the stretch branch; return to `daml start` + operator-custody; finish the Phase 1–3 slice first |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Observer/signatory leak | Phase 1 (declare) + Phase 3 (prove) | Tests 4–5: query as BankA returns none of BankB's orders/confirmations |
| 2. Trusting AI numbers | Phase 4 (det. core is input) + Phase 5 (AI additive) | Equality gate before `Clear`; on-ledger re-verify (test 6) |
| 3. Settlement contention / non-atomicity | Phase 2 | Tests 1–3; `test_atomicity` shows no partial settlement; no `ContentionError` |
| 4. Rationing/rounding & fixture mismatch | Phase 4 (TS) + Phase 2 (Daml re-verify) | Fixture clears at 100.00, fills 10/8/2 in both langs; sum-invariant + no-cross tests |
| 5. Daml/Canton version drift | Phase 1 | `daml version` pinned in `daml.yaml` + `DECISIONS.md`; live endpoint shape matches chosen API line |
| 6. Per-party token / faked privacy | Phase 3 | HTTP-layer cross-party query returns empty; Operator actions only via solver service |
| 7. Overscope (LocalNet / Daml Finance) | Phase 7+ (stretch only) | Vertical slice demoable before any stretch work begins |
| 8. Polish before slice works | Phases 1–3 (slice) then 6–7 (polish) | `RunCanonicalRound` keeps clearing at 100.00; no screenshots before tests 1–6 pass |

## Sources

- Daml ledger privacy model (stakeholders = signatories ∪ observers; contracts shown only to stakeholders; observers see only state-changing actions): https://docs.daml.com/concepts/ledger-model/ledger-privacy.html and https://docs.daml.com/daml/reference/templates.html
- Daml contention — reducing/avoiding, split+merge inside one settlement transaction, `ContentionError`/locked-contracts: https://docs.daml.com/daml/resource-management/contention-reducing.html , https://docs.daml.com/daml/resource-management/contention-techniques.html , https://docs.daml.com/canton/reference/error_codes.html
- Daml HTTP JSON API — per-party JWT (`actAs`/`readAs`, token decoded to fill party fields), version line vs Ledger API v2: https://docs.daml.com/json-api/index.html
- `@daml/react` / `@daml/ledger` / `daml codegen js` coupling to the JSON API and create-daml-app scaffold: https://www.npmjs.com/package/@daml/react , https://www.npmjs.com/package/@daml/ledger
- Anthropic structured outputs (constrained decoding for guaranteed-valid JSON; strict tool use; JSON-mode/prompting are less reliable; temperature determinism not guaranteed): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Project spec.md (§7 data model & privacy rationale, §8 clearing algorithm, §9 AI solver verify-don't-trust, §10 atomicity & privacy, §16 tests, §17 phases, §18 risks) and .planning/PROJECT.md (constraints, key decisions)

---
*Pitfalls research for: sealed-bid batch-auction venue on Daml/Canton + Claude AI solver*
*Researched: 2026-06-25*
