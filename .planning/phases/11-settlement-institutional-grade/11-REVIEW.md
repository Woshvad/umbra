---
phase: 11-settlement-institutional-grade
reviewed: 2026-07-10T00:00:00Z
depth: deep
files_reviewed: 27
files_reviewed_list:
  - daml/Umbra/Auction.daml
  - daml/Umbra/Compliance.daml
  - daml/Umbra/Holding.daml
  - daml/Umbra/Instrument.daml
  - daml/Umbra/Roles.daml
  - daml/Umbra/Settlement.daml
  - daml/Umbra/Setup.daml
  - daml/Umbra/Tests.daml
  - daml/daml.yaml
  - solver/src/api.ts
  - solver/src/ledger.ts
  - solver/src/settlement.ts
  - solver/src/topology.ts
  - web/src/App.tsx
  - web/src/main.tsx
  - web/src/solver.ts
  - web/src/desks.ts
  - web/src/ledgerContexts.ts
  - web/src/components/DvpLegs.tsx
  - web/src/components/OrderTicket.tsx
  - web/src/components/QrJoin.tsx
  - web/src/components/TopologyNode.tsx
  - web/src/views/JoinView.tsx
  - web/src/views/SettlementView.tsx
  - web/src/views/TopologyView.tsx
  - web/src/lib/qrPayload.ts
  - scripts/localnet/guest-onboard.mjs
findings:
  blocker: 0
  high: 0
  medium: 1
  low: 5
  total: 6
status: findings
---

# Phase 11: Code Review Report — Settlement & Institutional Grade

**Reviewed:** 2026-07-10
**Depth:** deep (cross-file: Daml ⇄ solver ⇄ web parity + settlement call chains)
**Files Reviewed:** 27
**Status:** findings (1 MEDIUM, 5 LOW — no BLOCKER / HIGH)

## Summary

I reviewed the Phase 11 settlement layer (DFIN-01/02/03), the keyless compliance
gate (COMP-01), the guest/QR onboarding (WOW-07), and the §4 canary path with an
adversarial stance, tracing the settlement call chain end-to-end (`Round.Clear` →
`buildGrossInstructions` → `settleBatch` → `moveThread` → `Holding.Split/Reassign`)
and cross-checking Daml ⇄ TS parity (`Settlement.daml` ↔ `settlement.ts`).

The core is genuinely solid. I specifically tried and **failed** to break the
following, which I record as verified-safe rather than as findings:

- **Conservation & atomicity.** `settleBatch` threads each source `Holding` across
  its receivers; any over-draw throws in `Split`'s strict guard and rolls back the
  whole `Round.Clear` transaction (proven on-ledger in `test_netting_conserves`
  clause (d) and `test_atomicity`). No leg is ever a separate commit.
- **Removed single-funded-buyer path.** The N-buyer × M-seller `zip`-pairing
  conserves cash and bond per instrument on any verified allocation
  (`test_multibuyer_golden`, A=6/D=4/B=7/C=3 @ 100).
- **Compliance gate.** Every `Order`-creation path (`Venue.SubmitOrder` and
  `OrderCommitment.RevealOrder`, whose upstream `CommitOrder` is gated) requires
  operator authority + a matching `DeskEligibility` credential; a desk is not a
  signatory of its credential and `assertDeskEligible` pins `cred.desk == desk`
  and `cred.operator == operator`, so no forge/substitute/self-issue is possible
  (`test_ineligible_submit_rejected`, incl. the substituted-rival-credential case).
- **Guest/QR secret hygiene.** `buildJoinPayload` emits only `…/join?round=<id>`;
  `guest-onboard.mjs` never prints the token and writes it solely into the
  gitignored `web/src/tokens.json`; `qrPayload.ts` has no token path. `.operator-token`
  and `tokens.json` are both gitignored — no secret is committed.
- **§4 canary + token-agnosticism.** `test_clears_at_100`,
  `test_commit_reveal_clears_at_100`, and `test_cash_instrument_agnostic` (EURt swap)
  all hold; `cashInstrument` is genuinely a choice parameter, never hardcoded on
  the ledger path.
- **§8 recompute-and-assert backstop intact.** `Round.Clear` re-fetches the sealed
  orders, recomputes §8, and asserts price + multiset allocation equality before any
  settlement leg runs (`test_clear_rejects_bad_allocation`; `tamperClear` never settles).

The findings below are display-fidelity and defense-in-depth nuances, not
correctness or security defects on the money-shot path.

## Medium

### MD-01: Settlement view mis-attributes DvP legs (and cash symbol) for N-buyer / non-USDCx rounds

**File:** `web/src/views/SettlementView.tsx:90-101` (`legsFromPreview`), `:72-85` (`toNettedLegs`), `:197-205`

**Issue:** `legsFromPreview` hard-assumes a **single buyer**:
```ts
const buyer = coded.find((a) => a.side === 'Buy' && a.filledQty > 0)?.desk ?? '—'
```
It then attributes every seller's full bond leg (and the paired cash) to that one
buyer. For the exact generalization Phase 11 ships — the 2-buyer × 2-seller golden
and the WOW-07 guest joining as a 4th (buyer) desk — the settlement visualization is
wrong: the guest's cash/bond legs are drawn as if BLUEROCK (the first buyer)
transacted them, so the on-screen "second wow beat" contradicts the (correct)
on-ledger `buildGrossInstructions` result. Compounding factors:
- `toNettedLegs` nets per **seller→buyer pair**, but its comment (`:69`) and the
  `DvpLegs` "NETTED" tag claim "one net instruction per party·instrument (DFIN-02)"
  — that is the on-ledger `netLegs`/CCP semantics, which this bilateral pair-netting
  does not reproduce for a multi-buyer batch.
- The solver never emits the `preview.settlement` meta block (no assignment to
  `body.settlement` exists in `solver/src/api.ts`), so `cashSymbol` and `provenance`
  always fall back to `'USDCx'` / `'CN TOKEN STANDARD (CIP-0056)'` (`:198-199`).
  A DFIN-03 EURt-swap round would still render "USDCx" on the cash arrows, defeating
  the token-agnostic display claim.

The balance table (`balanceRowsFromPreview` → `deskBalancesFromAllocations`) reads
per-desk allocations directly and stays correct, and the §4 single-buyer demo is
unaffected (netted === gross there), so this is display-only — but it is a visible
incorrectness during the WOW-07 guest demo, which is in-scope for this phase.

**Fix:** Drive the legs from authoritative data instead of a single-buyer heuristic.
Either (a) have the solver populate `SettlementMeta.grossLegs`/`nettedLegs`/`cashSymbol`
from `settlement.ts` `grossLegs`/`netLegs` and render those directly, or (b) fix
`legsFromPreview` to pair buyers↔sellers the same way `buildGrossInstructions` does
(desk-sorted unit `zip`, aggregated per (buyer,seller) pair) rather than collapsing
all sellers onto one buyer, and correct the `toNettedLegs` comment/tag to say
"per counterparty pair" unless true per-party CCP netting is implemented.

## Low

### LW-01: `conservationOk` cannot detect a value-imbalanced batch (weaker than documented)

**File:** `daml/Umbra/Settlement.daml:121-129`; asserted at `daml/Umbra/Auction.daml:386-388`

**Issue:** `instrumentConserves inst = sum [ netAmount legs p inst | p <- parties ] == 0.0`.
For any well-formed transfer list every leg contributes `+amount` to its receiver and
`-amount` to its sender, so this sum is **structurally always 0** regardless of whether
the batch is economically balanced. The code and comments frame `conservationOk` as
the "fail-loud" per-instrument conservation gate in `Round.Clear`, but its only
discriminating checks are `amount >= 0` and `sender /= receiver`. A hypothetically
mis-built batch (e.g. a cash leg with the wrong per-unit amount) would pass this gate.
This is not currently exploitable because the real protections are redundant and
present: the §8 recompute pins `price`, `buildGrossInstructions` derives amounts from
the verified allocation, and `moveThread`'s `Split` aborts any over-draw. So it is a
weaker-than-advertised defense-in-depth layer, not a live hole.

**Fix:** Either downgrade the comments to state honestly that `conservationOk` proves
well-formedness (non-negative, no self-leg) and that numeric conservation is proven
on-ledger by before/after `Holding` totals (as `test_netting_conserves` already does),
or strengthen the check to verify economic balance against the source amounts
(e.g. Σ cash-out per buyer == filledQty × p*).

### LW-02: Eligibility rejection message cites "jurisdiction" that `isEligible` never gates

**File:** `daml/Umbra/Compliance.daml:87-88` (message), `:71-72` (`isEligible`)

**Issue:** `assertMsg "desk not eligible (accreditation/jurisdiction/sanctions)" (isEligible cred)`
but `isEligible e = e.accredited && e.sanctionsClear` — `jurisdiction` is recorded and
observable yet never enforced. The verbatim rejection is surfaced to the user on the
`JoinView` `RejectSurface`, so the operator-/guest-facing text implies a jurisdiction
gate that does not exist. Documented as an MVP stub, but the message is misleading.

**Fix:** Drop `jurisdiction` from the assert message (e.g. "desk not eligible
(accreditation/sanctions)") to match what `isEligible` actually checks, or fold a
jurisdiction predicate into `isEligible` if a gate is intended.

### LW-03: `demoReal` honesty flag is fragile to a co-hosted party spanning >1 participant

**File:** `solver/src/topology.ts:120-121`

**Issue:** `demoReal = hostingParticipants.size <= 1` where `hostingParticipants` is
the union of hosting participant ids across ALL focused parties. The `perParty` type
comments (here and in `web/src/solver.ts:406`) explicitly note a co-hosted guest "can
appear on more than one" participant. If any single party ever resolves `isLocal:true`
on two participants in the single-operator LocalNet, `demoReal` flips to `false`, the
HARD `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge is dropped, and the view over-claims
"DISTRIBUTED (MULTI-NODE)" — the exact T-11-03-OVERCLAIM the flag exists to prevent.
The shipped `guest-onboard.mjs` co-hosts the guest on one participant, so this is not
currently triggered, but the invariant is one co-host away from breaking.

**Fix:** Base `demoReal` on distinct participants that host at least one party each,
i.e. `demoReal = new Set(nodes.map(n => n.participant)).size <= 1`, or explicitly
collapse co-hosted parties to a single canonical participant before counting, so a
co-hosted party cannot fabricate a "distributed" signal.

### LW-04: Operator topology card labels node-count as "ORDERS RESIDENT"

**File:** `web/src/views/TopologyView.tsx:112` (passes `count={nodes.length}`), `web/src/components/TopologyNode.tsx:161-167`

**Issue:** The inverted operator/synchronizer card renders `count` under
"SEES A COUNT · NEVER CONTENTS" and "{n} ORDERS RESIDENT", but `count` is
`nodes.length` — the number of participant node cards (desks hosted), not the number
of sealed orders. For §4 (3 desks, 3 orders) the two coincide, masking the mismatch;
with a guest who has a node but, say, an unrevealed order, the "ORDERS RESIDENT" count
would misstate the venue-blind count it purports to show.

**Fix:** Feed the operator card the actual resident-order count (e.g. from
`RoundStats.sealedOrderCount` / the solver `sealedOrderCount`) rather than
`nodes.length`, or relabel the metric to "NODES RESIDENT" so the caption matches the
value.

### LW-05: Guest scoped token ships in the client bundle, not "delivered server-side"

**File:** `scripts/localnet/guest-onboard.mjs:19-23,113-118`; `web/src/desks.ts:5-10`; `web/src/views/JoinView.tsx:96`

**Issue:** Multiple comments state the guest token is "delivered server-side to the
`/join` page via tokens.json." In fact `web/src/tokens.json` is imported by `desks.ts`
(`import tokensJson from './tokens.json'`) and therefore Vite-bundles the token into
the shipped client JavaScript; `JoinView` reads `tokens.bankD` from that bundle. Any
visitor who loads `/join` can extract the guest token (and A/B/C's) from the bundle.
This matches the pre-existing D6 dev-token model (the file is gitignored, the token is
scoped actAs/readAs bankD only, and the screen carries the HARD `DEV SCOPED TOKEN …
REAL GUEST AUTH IS OIDC (PHASE 12)` label), so it does not widen the existing blast
radius and is not a new vulnerability. But the "delivered server-side" framing is
inaccurate — it is a bundled client credential, and the honesty contract for WOW-07
specifically claims the token is not in the web source.

**Fix:** Correct the comments to say the scoped token is bundled from the gitignored
`tokens.json` (a dev-token, browser-readable, superseded by OIDC in Phase 12) rather
than "delivered server-side," so the honesty labeling matches the actual delivery
mechanism. No runtime change needed for the hackathon dev model.

---

_Reviewed: 2026-07-10_
_Reviewer: gsd-code-reviewer (adversarial)_
_Depth: deep_
