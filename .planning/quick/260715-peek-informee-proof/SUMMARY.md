---
quick_id: 260715-uha
slug: peek-informee-proof
date: 2026-07-15
status: complete
commits:
  - 9fe6780  fix(web): base the Try-to-Peek proof on informee refusal, not credential scoping
  - dbf9750  docs(08): record the WOW-01 peek mechanism deviation + the DevNet privacy proof
  - 8a8a003  fix(web): resolve party -> desk by identity, not "::" prefix parsing
---

# Summary: Try-to-Peek re-based onto informee refusal (+ two bugs it uncovered)

## What was wrong

The WOW-01 peek tested **credential scoping** — "can bankA's *token* read bankB?" — via
`POST /v2/state/active-contracts` filtered to the rival party. That is an ops property, and a
shared-token network defeats it. On DevNet all three desks carry ONE m2m bearer
(`validator-devnet-m2m`, user 6) with `readAs` on every party, so the read returned **7 rival
contracts** and `classifyPeekResult` classified it `VERDICT_LEAK` — the money-shot panel rendered a
red **privacy-regression** banner on real Canton.

## What shipped

Re-based the proof onto **ledger-enforced projection**: ask, as the peeking desk's OWN party with
its OWN token, for a rival's contract by id.

```
POST /v2/events/events-by-contract-id
{ contractId, eventFormat: { filtersByParty: { <own party>: { cumulative: [] } }, verbose: true } }
```

Because we ask as ourselves, the token always permits the requesting party — so the ONLY thing that
can refuse is Canton's stakeholder projection. **Both nets now return the same 404.** One proof, one
verdict, no auth divergence.

New verdict `VERDICT_NOT_INFORMEE = '404 — LEDGER REFUSED THE READ · NOT AN INFORMEE'`, mirroring the
403 grammar. `VERDICT_FORBIDDEN` / `VERDICT_EMPTY` / `VERDICT_LEAK` byte-identical. LEAK detection
untouched. Zero visual change — the comp contract holds.

The rival cid is obtained out-of-band with the **rival's own token** and surfaced honestly in the
REQUEST pane. It is a deliberate handicap: we hand the attacker the exact contract id AND (on DevNet)
a bearer with read rights on all three desks. The ledger still answers *not visible*.

## Two bugs this uncovered (both real, both fixed)

1. **Party-id prefix parsing** (`8a8a003`). `codeForParty` / `deskKeyOfParty` / `partyForDesk` parsed
   the prefix before `"::"` and assumed it was the DeskKey. True only on LocalNet (`bankA::<fp>`). The
   shared DevNet validator forces a namespaced hint, so the real id is `umbra-bankA-<ts>::<fp>` and
   every lookup silently returned undefined: **Time Machine (06) replayed an empty book**, and
   **Settlement (05) / Agent (04) would render a raw party id where the comp demands BLUEROCK**. Now
   resolved by exact identity against `tokens.json`, with prefix matching only as a fallback.
2. **Stale ACS fixture.** `TimeMachine.test.tsx` hard-coded `packageName: 'umbra'`, which rotted at the
   `umbra-sealed-auction` rename. Now imports `UMBRA_PACKAGE_NAME`.

Both stacked on the same 3 VIZ-02 failures. Those tests were **correctly reporting a real bug**, not
flaking — they build fixtures from the live `tokens.json` party ids.

## Gates (observed)

| Gate | Result |
|---|---|
| web unit tests | **151 / 151** (was 148 passed / 3 failed) |
| `web` build (`tsc --noEmit && vite build`) | clean — 193 modules, built in 3.84s |
| solver tests | **363 / 363** (27 files) |
| peek.test.ts | 25 tests (was 15) |
| **live DevNet, real shipped module** | discovery → real cid · CONTROL as owner → **HTTP 200** · PEEK as rival → **HTTP 404 CONTRACT_EVENTS_NOT_FOUND** → `404 — LEDGER REFUSED THE READ · NOT AN INFORMEE` |
| **live browser panel (DevNet)** | REQUEST pane shows the handed-over cid + elided bearer; RESPONSE pane shows the raw 404; verdict row correct. **No LEAK banner.** |

The owner-side **200 control** matters: `CONTRACT_EVENTS_NOT_FOUND` is also returned for an unknown
cid, so without it a stale/bogus cid would 404 and render "privacy enforced" vacuously. The control
proves the cid is live and visible to its owner at that instant.

## Deviations from plan

1. **Added an `inconclusive` outcome.** The plan's four branches let 400/500 and non-informee 404s fall
   through to `VERDICT_EMPTY` — a wire error would have rendered "PRIVACY ENFORCED AT THE WIRE". Any
   non-2xx that is not one of the two refusals now withholds the verdict row.
2. **`extractInformeeRows` is not template-filtered.** We targeted one specific cid, so any disclosed
   createdEvent is a leak regardless of template; filtering could downgrade a real leak to "empty".
3. **Scope grew** to the party-resolver fix — out of the original brief, but it was a live DevNet
   correctness bug surfaced by the gates.

## Honest limitation (unchanged — do not overstate)

Proves the ledger will not disclose to a **non-stakeholder PARTY**. Does **NOT** prove one desk's
**CREDENTIAL** cannot impersonate another: on DevNet a holder of the shared bearer could simply ask as
bankB. **Per-desk m2m clients from the organizers remain the only fix for credential isolation.**
Documented in `peek.ts`, `PeekConsole.tsx`, `08-UI-SPEC.md`, `docs/DEVNET.md`.
