---
quick_id: 260715-uha
slug: peek-informee-proof
date: 2026-07-15
status: planned
---

# Quick Task: Fix the Try-to-Peek privacy proof (informee refusal, correct on LocalNet AND DevNet)

## Problem (empirically verified on live DevNet, 2026-07-15)

`web/src/lib/peek.ts` builds `POST /v2/state/active-contracts` with
`filter.filtersByParty = { RIVAL_PARTY }` using the active desk's own token — i.e. it asks the
ledger **as the rival**.

- **LocalNet:** each desk token is scoped to its own party → the read 403s → `VERDICT_FORBIDDEN`. Looks right.
- **DevNet:** all three desks share ONE m2m bearer (`validator-devnet-m2m`, user id 6) holding
  `readAs` on **every** party → the read **SUCCEEDS**, returning 7 rival contracts →
  `classifyPeekResult` (peek.ts:104-109) classifies any non-empty result as
  `VERDICT_LEAK = 'LEAK — RIVAL CONTRACTS RETURNED · PRIVACY REGRESSION'`.

So on DevNet the money-shot panel renders a **red privacy-regression banner**. Top-priority bug.

Root cause: the current peek tests **credential scoping** (can bankA's *token* reach bankB?), which is
an ops property that a shared bearer defeats. It does not test **ledger-enforced projection** (is bankA
the *party* an informee of bankB's contract?), which is the actual Canton privacy guarantee.

## The fix (mechanism verified live on DevNet with the shared token)

Canton disclosure is **stakeholder/informee-based, not token-based**. Asking *as a non-stakeholder party*
is refused even when the token has full read rights on all parties.

```
POST /v2/events/events-by-contract-id
{ "contractId": "<rival's Order cid>",
  "eventFormat": { "filtersByParty": { "<PARTY>": { "cumulative": [] } }, "verbose": true } }
```

Verified against the live FiveNorth sandbox, **same shared bearer for both calls**:

| requestingParty | Result |
|---|---|
| bankA (rival, NOT a stakeholder) | **HTTP 404 `CONTRACT_EVENTS_NOT_FOUND`** — "Contract events not found, or not visible." |
| bankB (owner, control) | **HTTP 200** with the full `createdEvent` |

`eventFormat` is mandatory — omitting it returns HTTP 400 `MISSING_FIELD` ("The submitted command is
missing a mandatory field: event_format").

**Key benefit — the nets converge.** Asking AS the peeking desk's OWN party means the token always
permits the requesting party, so there is no 403 divergence: **both LocalNet and DevNet return the same
404**. One proof, one verdict, both nets.

## Where the rival contract id comes from (honest framing — REQUIRED)

bankA legitimately cannot discover bankB's cid; that is the point. The demo bundle already contains all
three desk tokens (`web/src/tokens.json`, by design, for the party switcher). So `PeekConsole` performs an
**out-of-band discovery read using the RIVAL's OWN token** to learn the rival's cid, then attempts the peek
with the **active desk's** token asking **AS the active desk's party**.

This must be explicit in code comments AND surfaced in the UI. It **strengthens** the proof — the
adversarial framing is deliberately generous to the attacker:

> We hand the attacker more than they could ever obtain: the rival's exact contract ID, **and** (on DevNet)
> a bearer with read rights on all three desks. The ledger still answers *not visible*.

Do NOT fabricate a cid. It must come from a real read.

## Tasks

1. **`web/src/lib/peek.ts`** — keep DELIBERATELY PURE (builder + classifier, no fetch).
   - Add `buildInformeePeekRequest(base, thisDeskToken, ownParty, rivalContractId, template)` →
     `POST {base}v2/events/events-by-contract-id` with the `eventFormat` body above. Token used ONLY to
     derive `elideBearer()` display; never in the body (threat T-08-02-BEARER).
   - Add `VERDICT_NOT_INFORMEE = '404 — LEDGER REFUSED THE READ · NOT AN INFORMEE'` — mirrors the existing
     403 grammar (`'403 — LEDGER REFUSED THE READ · PRIVACY IS STRUCTURAL'`): short, uppercase, declarative.
   - Extend `classifyPeekResult(status, rows, code?)`:
     - `404` + `CONTRACT_EVENTS_NOT_FOUND` → privacy enforced (`VERDICT_NOT_INFORMEE`)
     - `403` → privacy enforced (`VERDICT_FORBIDDEN`, unchanged)
     - `200` with the rival's createdEvent → **`VERDICT_LEAK`** (LOUD — do not weaken)
     - `200`/empty → `VERDICT_EMPTY` (unchanged)
   - Keep `VERDICT_FORBIDDEN` / `VERDICT_EMPTY` / `VERDICT_LEAK` copy **byte-identical**.

2. **`web/src/components/PeekConsole.tsx`** — owns the fetch.
   - Step 1: discovery read with the RIVAL's own token → rival's cid for the selected template.
   - Step 2: `events-by-contract-id` as the ACTIVE desk's party, with the ACTIVE desk's token.
   - Render the discovery step honestly in the REQUEST pane (a short "handed to the attacker" note).
   - Keep the network/CORS failure path distinct (T-08-02-NODE) — an unreachable node must NOT
     masquerade as "privacy enforced".
   - **Do NOT restyle.** Sub-label, toggles, rival chips, CTA, two-pane ink surface, red-square verdict row
     and the self-check note stay pixel-identical.
   - If no rival cid exists for the selected template (e.g. `TradeConfirmation` pre-settle), render a plain
     note — NOT a verdict. Absence of a target is not a privacy proof.

3. **`web/src/lib/peek.test.ts`** — cover new branches: 404 informee refusal, 403, 200-leak, 200-empty,
   plus the new request builder shape. Keep all existing tests green.

4. **`.planning/phases/08-demo-hardening/08-UI-SPEC.md`** — **spec deviation, must be recorded.**
   Line 179 mandates "a raw `POST /v2/state/active-contracts` … filtered to the RIVAL party" and line 277
   lists the 403 verdict. That mechanism is empirically broken on a shared-token network. Update the
   mechanism prose + verdict table to the informee-refusal proof, with a note on why. The **visual**
   contract (comp) is unchanged and remains binding.

5. **`docs/DEVNET.md`** — document the proof + keep the honest limitation prominent.

## Honest limitation (MUST remain documented — do not overstate)

This proves the ledger will **not disclose to a non-stakeholder PARTY**. It does **NOT** prove one desk's
**CREDENTIAL** cannot impersonate another — on DevNet a holder of the shared bearer could simply ask as
bankB. Per-desk m2m clients from the organizers remain the only fix for credential isolation.

## Hard constraints

- **NEVER add Claude as a git contributor** — no `Co-Authored-By`, no "Generated with Claude Code", no
  Anthropic attribution. Author/committer stays `woshvad <woshvad@gmail.com>`.
- §4 canonical fixture still clears at exactly **$100.00** (A=10 / B=8 / C=2).
- Do not weaken or remove LEAK detection.
- No secret/token in a tracked file (`web/src/tokens.json` is gitignored).

## Gates (all must pass before commit)

- `npm run build` in `web/` clean
- web unit tests green (incl. `peek.test.ts`)
- solver test suite green
- **live DevNet verification**: vite :5173, solver :4100, fresh OPEN round R1
  (A Buy 10@101 / B Sell 8@99 / C Sell 5@100). Panel must show the privacy-enforced verdict, NOT a LEAK.
