# Feature Research

**Domain:** Sealed-bid uniform-price batch-auction venue for tokenized securities, atomic DvP settlement on Canton (Daml), with a Claude AI solver agent
**Researched:** 2026-06-25
**Confidence:** HIGH

> **Scope note (LOCKED SPEC).** Umbra's feature set is already decided in `spec.md`. This document does **not** propose or re-scope features. It researches the *expected behaviors* and *correct-implementation patterns* of the four mechanisms the spec mandates, so requirements and tests are grounded in how these things actually work. Categories below mean: **Table stakes** = must be correct or the demo/judges reject the thesis; **Differentiators** = what wins the hackathon; **Anti-features** = explicitly out of scope per spec §1/§18/§19 — listed so they are NOT built.
>
> **Validation performed.** The §8 clearing algorithm was re-implemented and run against the §4 fixture: it clears at exactly **$100.00**, fills **A=10 / B=8 / C=2** (C residual 3), produces the §4 settled balances (A: 10/4000, B: 12/1800, C: 13/1200), and conserves cash to zero. The spec is internally consistent and matches standard call-auction theory and Daml platform semantics (sources at bottom).

## Feature Landscape

### Table Stakes (Must Be Correct or the Thesis Fails)

These are non-negotiable. Judges in Track 1 (Private DeFi & Capital Markets) will specifically check privacy and atomicity; getting any of these wrong invalidates the pitch.

| Feature | Why Expected (Correct Behavior) | Complexity | Notes |
|---------|--------------------------------|------------|-------|
| **Deterministic uniform clearing price `p*`** | Single price for the whole batch that **maximizes matched volume** = `max over p of min(demand(p), supply(p))`. This is the textbook call-auction objective. | MEDIUM | Candidate prices = distinct limit prices in buys ∪ sells. Computed twice (TS solver + Daml `Round.Clear`) and must agree. Validated: clears at 100.00. |
| **Correct tie-break ordering** | When multiple prices tie on max matched volume: (a) minimize `\|demand−supply\|` (imbalance); (b) if still tied, choose the **lower** price (buyer-favorable, reproducible); round to 2 dp. | LOW | **Subtlety to encode in tests:** the imbalance tie-break operates **only among max-matched candidates**. In §4, p=99 has lower imbalance (2 vs 3) but is eliminated at the volume gate first (matched 8 < 10). Without this ordering you'd wrongly clear at 99. |
| **Short side fills fully; long side rationed** | The scarcer side fills 100%. The abundant side is rationed by **price priority** (most aggressive first: lowest-limit sells / highest-limit buys), then **pro-rata** for ties at the same limit. | MEDIUM | §4: buys are short (demand 10 < supply 13) → A fills 10. Sells rationed: B (limit 99, most aggressive) fills 8, C (limit 100) fills remaining 2, C residual 3 unfilled. |
| **Integer allocation that never exceeds `traded`** | Fills are whole units. Pro-rata rounding must never sum above matched volume; deterministic leftover rule (give leftover unit(s) to the largest order — document it). | MEDIUM | Hackathon-classic correctness bug: floor of pro-rata under-fills, naive round over-fills/over-draws. Conservation breaks if `Σ buy fills ≠ Σ sell fills`. |
| **Limit compliance** | No buy fills above its limit; no sell fills below its limit; only eligible orders (`buy.limit ≥ p*`, `sell.limit ≤ p*`) participate. | LOW | Re-checked on-ledger in `Round.Clear`; rejection path is test 6. |
| **Order privacy (signatory/observer scoping)** | An `Order`'s stakeholders are exactly `{operator, desk}`. **Daml visibility = signatories ∪ observers**; non-stakeholders cannot query or see the contract. Rival desks are not observers → genuinely invisible, not hidden in UI. | MEDIUM | This is the core of the money shot. Confirmed against Daml ledger-privacy docs: a non-stakeholder cannot see the contract at all. |
| **Pre-clear exposes COUNT only** | Before clearing, desks see only `RoundStats.sealedOrderCount` (e.g. "3 sealed orders"). The Operator updates this as orders arrive; contents (side/qty/limit) never observable by desks. | LOW | Separate `RoundStats` template observed by desks; the `Order`s themselves are never observed by desks. "Venue sees a count, not contents." |
| **Per-desk private `TradeConfirmation`** | Each fill receipt is `signatory operator, observer desk` — visible only to that desk. BankA cannot see BankB's confirmation. | LOW | Test 5. Symmetric per-party JSON-API queries are the proof. |
| **Operator-custody `Asset` privacy** | An `Asset` is `signatory operator, observer owner` — visible only to owner + operator. Desks never see each other's balances. | LOW | Operator-custody (single signatory) deliberately sidesteps multi-party authority for the MVP; this is a *decision*, not a shortcut to fix. |
| **Atomic DvP settlement in ONE transaction** | The entire batch settles inside a single `Round.Clear` exercise: re-verify → reassign BONDX seller→buyer and USDCx buyer→sellers at `p*` → emit confirmations → set `status = Settled`. **All-or-nothing**: if any leg fails (insufficient holding), the whole transaction rolls back and no balance changes. | MEDIUM | Confirmed: a Daml transaction is indivisible; partial settlement is impossible by construction. This is the DvP guarantee. Test 3 (`test_atomicity`) asserts a failing seller leaves all balances unchanged. |
| **Conservation of cash and assets** | Σ BONDX delivered = Σ BONDX received; Σ USDCx paid = Σ USDCx received; no asset created or destroyed. | LOW | §4 cash check: A pays 1000; B receives 800; C receives 200 → conserved (validated, delta = 0). Assert in tests. |
| **On-ledger re-verification (the backstop)** | `Round.Clear` independently re-computes/validates the proposed allocation (max-volume + limit compliance + conservation + no overdraw) and **rejects** anything inconsistent. The ledger is the source of truth, not the solver. | MEDIUM | Test 6 (`test_clear_rejects_bad_allocation`). This is what lets the AI layer exist without risking correctness. |
| **Party-scoped frontend auth** | The party switcher uses each party's own JSON-API token, so the browser *literally cannot* fetch other desks' private data. Privacy is enforced at the API boundary, not in render logic. | MEDIUM | "Privacy is real, not faked." A judge can open dev tools and confirm no cross-party data is ever fetched. |

### Differentiators (What Wins the Hackathon)

These align directly with PROJECT.md Core Value. Don't over-invest elsewhere at their expense.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **The 3-up Privacy "money shot"** | Three desk panels side-by-side, each rendered with its own credentials, each blind to the others; center column shows shared `RoundStats` count only. The single most important visual — it is the screenshot that wins. | MEDIUM | Build this *first* in the vertical slice (end of Phase 3). Redaction-stripe motif on the "other" columns dramatizes the blindness. |
| **AI Solver Agent (verify-don't-trust)** | An autonomous agent (Claude) *proposes* a clearing on round close; the service recomputes deterministically and only submits a verified allocation; the ledger re-verifies again. Delivers the "autonomous agent in institutional DeFi" thesis **without** ever risking a wrong/unfair clear. | MEDIUM | Temperature 0 for the canonical agent. The model's numbers are **never** used unverified. Prompt contract documented in `solver/PROMPT.md`. |
| **Natural-language clearing rationale** | Claude returns a 2–3 sentence explanation for the Solver Agent panel: *"Cleared at 100.00: maximizes matched volume at 10 units; Meridian filled first on price priority…"* This is the demo's "wow" narration. | LOW | **Good rationale = states the price, the objective met (max volume = 10 units), and why a specific desk was prioritized/rationed (price priority).** It explains a deterministic result; it must not introduce numbers that disagree with the verified clear. |
| **Atomic settlement animation** | All DvP legs "snap" simultaneously in one transaction; before/after balances update together; a single "one transaction" badge. Dramatizes the all-or-nothing guarantee visually. | MEDIUM | Settlement ledger view shows paired asset+cash arrows (A↔B: 8@100; A↔C: 2@100). |
| **Supply/demand crossing chart** | Hand-rolled SVG step curves (demand down, supply up) marking `p*` where matched volume is maximized; annotate matched = 10. Makes the abstract clearing legible to judges. | MEDIUM | No chart library needed; small SVG helpers. The crossing point visually justifies why 100.00. |
| **"Native to Canton" framing** | On transparent chains privacy is bolted on (off-chain books, ZK) and MEV is fought; on Canton there's no public mempool and contracts are private by construction, so sealed-bid auctions are native and settlement is atomic by default. | LOW (narrative) | This is the pitch differentiator vs a continuous private book ("Cantex is continuous; Umbra is the sealed-bid batch auction with an AI solver"). |

### Anti-Features (Explicitly Out of Scope — DO NOT BUILD)

Per spec §1 non-goals, §18 risks, §19 stretch. Listed so they are not accidentally built during the hackathon sprint. Anything marked **stretch** must not be started before Phase 7.

| Feature | Why It Seems Tempting | Why Avoid (for MVP) | What To Do Instead |
|---------|----------------------|---------------------|--------------------|
| **Order cancel / replace** | "Real venues let you amend orders." | Adds order-lifecycle state machine + re-count logic; not needed to prove the thesis. | One order per desk per round; **disable the ticket after submit**. |
| **Continuous trading / live order book** | "Order books feel more like a real exchange." | It is the *opposite* of the differentiator. Umbra IS a batch auction by design. | Sealed-bid call auction with a fixed 60s window only. |
| **Multi-asset cross-auctions** | "More markets = more impressive." | Multiplies clearing/settlement complexity; clutters the money shot. | One bond `BONDX` vs one cash `USDCx`, prices in USDCx/BONDX. |
| **Real fiat / KYC onboarding** | "Institutions need KYC." | Irrelevant to privacy + atomicity thesis; huge surface area. | Tokenized `USDCx` cash leg only; pre-seeded parties. |
| **Daml Finance `Holding`/`Batch`/`Instruction` settlement (allocate/approve)** | "Production-grade DvP story." | Introduces multi-party authority puzzles that the operator-custody model deliberately avoids. **Stretch §19.** | Operator-custody `Asset` with `Split`/`Merge`/`Reassign` under operator authority alone. |
| **Canton LocalNet (`cn-quickstart`) cross-node deploy** | "Proves true cross-node sub-transaction privacy." | 8GB Docker, heavy iteration cost. **Stretch §19.** | Build on `daml start`; privacy holds via Daml disclosure on the sandbox; *claim* the Canton property and demo via per-party queries. |
| **Competing AI solvers (N agents racing)** | "Cooler agent narrative." | Extra orchestration + ranking UI; not needed for the core thesis. **Stretch §19.** | One canonical agent at temperature 0. |
| **Residual routing ("→ Cantex"), multiple rounds** | "What happens to C's unfilled 3 units?" | Out-of-scope plumbing. **Stretch §19.** | Unfilled quantity simply **expires** at end of round (MVP). |
| **Production key management / mainnet** | "Make it deployable." | Hackathon MVP. | Dev sandbox party tokens; `ANTHROPIC_API_KEY` server-side env only, never committed. |
| **Letting the AI's number settle directly** | "The agent is the solver — trust it." | A wrong/hallucinated price would settle unfairly; destroys the credibility of the whole pitch. | **Verify-don't-trust**: deterministic recompute + on-ledger re-verification gate every clear. |

## Feature Dependencies

```
[Daml data model: Asset, Venue, Order, Round, RoundStats, TradeConfirmation]
    └──requires──> [Setup.daml seeds §4 fixture]
            └──enables──> [Deterministic clearing algorithm §8]
                    └──requires──> [Round.Clear: on-ledger re-verify + atomic DvP]
                            ├──enables──> [Atomic settlement animation]
                            └──enables──> [Per-desk TradeConfirmation]

[Order privacy: signatory/observer scoping]  (independent of clearing)
    └──requires──> [Party-scoped JSON-API auth]
            └──enables──> [3-up Privacy money shot]
            └──enables──> [RoundStats count-only pre-clear view]

[Deterministic clearing algorithm §8]
    └──enables──> [AI Solver Agent (propose)]   ──verified-by──> [§8 recompute + Round.Clear]
            └──enables──> [Natural-language rationale]
            └──enables──> [Supply/demand crossing chart]

[Solver service: round lifecycle + 60s window + HTTP API]
    └──enables──> [Auction theatre: countdown, close & solve, settle]
```

### Dependency Notes (build-order implications)

- **Clearing algorithm (§8) must exist before settlement.** `Round.Clear` re-verifies an allocation it cannot produce without the algorithm. The deterministic core is the precondition for both atomic settlement *and* the AI layer. **Build §8 (TS + Daml, agreeing) before any AI work.**
- **AI solver depends on the deterministic core, never the reverse.** The agent *proposes*; §8 + `Round.Clear` *verify*. If the AI layer slips, the deterministic clear still settles correctly. This decoupling is the risk mitigation — wire it so the agent is additive, not on the critical settlement path.
- **Privacy track is independent of the clearing track** and can be built in parallel. Order privacy + party-scoped auth + the 3-up view depend only on the data model and Daml disclosure, not on clearing. This is why the spec sequences Privacy proof (Phase 3) to land the vertical slice early.
- **`RoundStats` is a separate template, not a field on `Round`.** Desks observe `RoundStats` (count only); they must NOT observe the `Order`s. Conflating these leaks contents → breaks the no-leakage claim.
- **Atomicity depends on single-transaction settlement.** If settlement is split across multiple transactions (e.g., asset leg then cash leg), the all-or-nothing guarantee is lost. Everything in `Round.Clear` must be one exercise.
- **Conservation + integer rounding are coupled.** The leftover-unit rule must be deterministic and identical in TS and Daml, or the two computations disagree and `Round.Clear` rejects a valid clear.

## MVP Definition

> The spec's "MVP" is the locked hackathon scope. "v1.x / v2+" map to spec §19 stretch goals — included only to mark the deferral boundary, **not** to plan additional work.

### Launch With (v1 — the locked vertical slice, ship by end of Phase 3 even if rough)

- [ ] **Daml model + `Setup.daml` seeding §4** — everything downstream depends on it.
- [ ] **Order privacy via signatory/observer + party-scoped JSON-API auth** — the thesis; testable via per-party queries (tests 4, 5).
- [ ] **`RoundStats` count-only pre-clear view** — "venue sees a count, not contents."
- [ ] **Deterministic clearing §8 (TS + Daml, agreeing), clears §4 at 100.00** — tests 1.
- [ ] **`Round.Clear`: on-ledger re-verify + atomic DvP + confirmations** — tests 2, 3, 6; the atomicity guarantee.
- [ ] **3-up Privacy money shot** — the screenshot that wins.
- [ ] **`make demo` runs end-to-end; README + 3-min script; screenshots captured** — definition of done.

### Add After the Slice Works (still in-scope MVP, Phases 4–7)

- [ ] **Solver service** (round lifecycle, 60s window, force-close, HTTP API) — trigger: vertical slice green.
- [ ] **AI agent layer** (Claude propose + rationale, verify-don't-trust) — trigger: deterministic clear stable.
- [ ] **Auction theatre + settlement animation + supply/demand SVG** — trigger: solver service wired.
- [ ] **Full 5-view frontend matching the design comp 100%** — trigger: functionality complete; polish phase.

### Future Consideration (v2+ — spec §19 STRETCH, do NOT start before Phase 7)

- [ ] **Daml Finance Holding/Instrument/Account + Batch/Instruction settlement** — production-grade DvP.
- [ ] **Canton LocalNet (`cn-quickstart`) cross-node deploy** — true cross-node sub-transaction privacy.
- [ ] **Competing AI solvers (N agents, ranked)** — agent-racing UI.
- [ ] **Residual routing ("→ Cantex"), multiple rounds, cancel/replace.**

## Feature Prioritization Matrix

| Feature | User/Judge Value | Implementation Cost | Priority |
|---------|------------------|---------------------|----------|
| Deterministic clearing §8 (clears at 100.00) | HIGH | MEDIUM | P1 |
| Order privacy (signatory/observer + party-scoped auth) | HIGH | MEDIUM | P1 |
| Atomic DvP `Round.Clear` (all-or-nothing + conservation) | HIGH | MEDIUM | P1 |
| On-ledger re-verification (the backstop) | HIGH | MEDIUM | P1 |
| 3-up Privacy money shot | HIGH | MEDIUM | P1 |
| `RoundStats` count-only pre-clear | HIGH | LOW | P1 |
| Per-desk `TradeConfirmation` | HIGH | LOW | P1 |
| AI Solver Agent (propose + verify-don't-trust) | HIGH | MEDIUM | P2 |
| Natural-language rationale | MEDIUM | LOW | P2 |
| Solver service + HTTP API + 60s window | MEDIUM | MEDIUM | P2 |
| Atomic settlement animation | MEDIUM | MEDIUM | P2 |
| Supply/demand crossing SVG | MEDIUM | MEDIUM | P2 |
| Full 5-view design-comp fidelity | MEDIUM | MEDIUM | P2 |
| Daml Finance / LocalNet / competing solvers / residual routing | LOW (MVP) | HIGH | P3 (stretch) |

**Priority key:** P1 = the vertical slice that wins (privacy → clear → atomic settle); P2 = the differentiating polish (AI agent, theatre, design); P3 = spec §19 stretch, deferred past Phase 7.

## Mechanism Correctness Reference (for requirements & tests)

These are the concrete, testable assertions each mechanism must satisfy — derived from spec §8/§10/§16 and validated against §4.

| Mechanism | Correct-behavior assertions (test these) |
|-----------|------------------------------------------|
| **Clearing** | Candidate prices = distinct limits {99,100,101}. matched(99)=8, matched(100)=10, matched(101)=10. Max=10 at {100,101}; both imbalance 3; lower price → **p\*=100.00**. (Validated.) |
| **Allocation** | traded=10. Short side (buys, 10) fills fully → A=10. Long side (sells, 13) by price priority: B(99)=8, C(100)=2, C residual 3 unfilled. Integer, never exceeds traded. |
| **Settlement** | Post-DvP: A 10/4000, B 12/1800, C 13/1200. Cash: A −1000, B +800, C +200, sum 0. (Validated.) |
| **Atomicity** | A round where a seller lacks the asset → `Round.Clear` fails, **no** balances change (all-or-nothing rollback). |
| **Privacy (orders)** | JSON-API query as BankA returns A's order + confirmation, **zero** of B's/C's; symmetric. BankA is not a stakeholder of BankB's `Order`. |
| **Privacy (pre-clear)** | Round exposes only `sealedOrderCount = 3`; no order contents visible to any desk. |
| **Privacy (confirmations)** | Each `TradeConfirmation` observed only by its desk. |
| **Rejection** | An allocation violating max-volume / limits / conservation is rejected by `Round.Clear` (test 6). |
| **AI verify-don't-trust** | The model's proposed price/allocation is only submitted if it equals the deterministic §8 result; on-ledger re-verification is the final gate. Rationale must not contradict the verified numbers. |

## Sources

- **Spec & project (authoritative, locked):** `spec.md` §3 (mechanism), §4 (canonical fixture), §8 (clearing algorithm + worked example), §9 (AI solver), §10 (atomic settlement & privacy), §12 (frontend functional reqs), §16 (tests); `.planning/PROJECT.md`. **HIGH.**
- **Local validation:** re-implemented §8 against §4 — clears at 100.00, fills A=10/B=8/C=2, §4 balances, cash conserved (delta 0). **HIGH.**
- **Call-auction theory** (maximize matched volume = max of min(demand,supply); imbalance as secondary objective/tie-break): *Clearing price distributions in call auctions* (arXiv:1904.07583 / Quantitative Finance, tandfonline); *Maximizing Matching in Double-sided Auctions* (arXiv:1304.3135); *Verified Double Sided Auctions for Financial Markets* (arXiv:2104.08437); [NYSE closing-auction imbalance](https://www.nyse.com/data-insights/nyse-introduces-closing-auction-imbalance-analysis-tool). Confirms the spec's objective + tie-break conventions are standard. **HIGH.**
- **Daml privacy / stakeholder visibility** (visibility = signatories ∪ observers; non-stakeholders cannot query a contract; sub-transaction privacy on Canton): [Daml ledger-privacy docs](https://docs.daml.com/concepts/ledger-model/ledger-privacy.html); [Digital Asset privacy explanation](https://docs.digitalasset.com/overview/3.4/explanations/ledger-model/ledger-privacy.html); [Explicit contract disclosure](https://docs.daml.com/app-dev/explicit-contract-disclosure.html). Confirms order/confirmation/asset privacy is enforced by construction. **HIGH.**
- **Daml atomicity / DvP** (single transaction is indivisible all-or-nothing; both legs settle or neither): [Taking tokenization to the next level with Daml Finance](https://blog.digitalasset.com/blog/taking-tokenization-next-level-daml-finance); [Atomic Settlement / onchain DvP — Chainlink](https://chain.link/article/atomic-settlement-onchain-dvp); [Canton FOP/DvP transfer workflows](https://deepwiki.com/canton-foundation/cips/5.1.1-fop-and-dvp-transfer-workflows). Confirms the spec's `Round.Clear` atomicity guarantee. **HIGH.**

---
*Feature research for: sealed-bid uniform-price batch auction + atomic DvP on Canton/Daml + AI solver (Umbra, LOCKED SPEC)*
*Researched: 2026-06-25*
