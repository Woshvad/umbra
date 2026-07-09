# Phase 10: Cryptographic Privacy - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 11 (8 code + zk module + 2 test/artifact groups)
**Analogs found:** 11 / 11 (every new file has a strong in-repo analog)

> Scope: CRYP-01 (on-ledger commit–reveal + bond), CRYP-02 (tlock/drand timelock),
> CRYP-03 (circom/snarkjs ZK PoC + on-ledger hash anchor), VIZ-02 (per-party ledger
> replay). All crypto is ADDITIVE around the unchanged §8 clearing; the §4 fixture must
> still read $100.00 / A=10 / B=8 / C=2 through commit→reveal→clear→settle.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `daml/Umbra/Auction.daml` (MOD: `OrderCommitment` template, `RevealOrder` choice, `Round.Clear` slash + `proofHash` anchor) | model/template | event-driven (on-ledger verify) | same file — `Order` / `Round.Clear` / `TradeConfirmation` + `Umbra/Asset.daml` bond primitives | exact |
| `daml/Umbra/Commit.daml` (NEW, optional — canonical serializer + `commitOf`) | utility (Daml) | transform | `daml/Umbra/Clearing.daml` (leaf pure-math module, cycle-break precedent) | role-match |
| `solver/src/tlock.ts` (NEW) | service | file-I/O + external-network (encrypt/decrypt) | `solver/src/proof.ts` (server-only crypto/hashing module, secret-safe) | role-match |
| `solver/src/zk/` (NEW module: `clearing.circom`, `build.mjs`, `prove.ts`, `verify.ts`) | service | transform (prove/verify) | `solver/src/proof.ts` + `solver/src/auction.ts` (`computeClearing` = the reduced statement) | role-match |
| `solver/src/api.ts` (MOD: reveal-timing, tlock, prove/verify, VIZ-02 offset endpoints) | controller | request-response | same file — existing `createApp(deps)` + zod + `wrap()` handlers | exact |
| `solver/src/ledger.ts` (MOD: `OrderCommitment` create/exercise, bond queries, stage→offset capture) | service | CRUD (v2 submit-and-wait + ACS) | same file — `queryByEntity` / `createContract` / `exerciseChoice` / `settle` | exact |
| `web/src/components/OrderTicket.tsx` (MOD: commit/timelock/reveal lifecycle) | component | request-response (per-party plane) | same file — seal flow + `bg-redact`/`umbra-wipe`; `DeskColumn.tsx` redaction grammar | exact |
| `web/src/components/ProofOfClearingPanel.tsx` (NEW, in `SettlementView`) | component | request-response (operator plane :4100) | `SettlementView.LeakageSimPanel` (dashed-vs-solid) + `ProofPackButton.tsx` (solver fetch) | role-match |
| `web/src/views/TimeMachineView.tsx` (NEW view 06) | view | event-driven replay (per-party ACS-at-offset) | `PrivacyView.tsx` + `DeskColumn.tsx` + `web/src/lib/peek.ts` (`activeAtOffset`) | exact (composed) |
| `daml/Umbra/Setup.daml` + `daml/Umbra/Tests.daml` (MOD: §4 via commit→reveal; new tests) | test/seed | batch | same files — `initialize` seed + `test_clears_at_100` canary | exact |
| `web/daml.js` (REGENERATE + commit) | generated bindings | — | committed `web/daml.js` (regenerated on every template change) | exact |

---

## Shared Patterns

### On-ledger verify-don't-trust (recompute + `assertMsg`)
**Source:** `daml/Umbra/Auction.daml` `Round.Clear` (lines 227-247)
**Apply to:** `RevealOrder` choice + `Round.Clear` commitment re-check (CRYP-01).
The exact idiom to copy — fetch, recompute, assert equality on-ledger:
```daml
orders <- mapA fetch orderCids
let (pStarExpected, allocsExpected) = computeClearing views
assertMsg "clearingPrice does not match recomputed §8 p*"
  (roundBankers 2 clearingPrice == roundBankers 2 pStarExpected)
```
For CRYP-01 the analogous line is `assertMsg "commitment mismatch" (commitment == commitOf (canonical order) salt)` — the ledger, not the operator, rejects a bad reveal. The `WOW-02 tamperClear` seam in `solver/src/ledger.ts` (lines 416-496) is the exact template for the CRYP-03 tamper-rejection demo (perturb values, catch the verbatim rejection, never throw a fake pass).

### Operator-custody Asset bond (Split / Reassign)
**Source:** `daml/Umbra/Asset.daml` (whole file) + `moveExact` in `Auction.daml` (lines 37-44)
**Apply to:** CRYP-01 bond post / return / slash. Reuse `Asset` (symbol `USDCx`) as the bond; return = `Reassign` to desk, slash = `Reassign`/`Retire`-style consuming move to operator pot. `moveExact` already handles the full-vs-partial move (Split is strict `< quantity`). Do NOT introduce a new asset type (A3).

### Server-side secret-safe crypto module
**Source:** `solver/src/proof.ts` (lines 25-43, 78-114)
**Apply to:** `solver/src/tlock.ts` + `solver/src/zk/*`. Copy the module-private hashing/keys pattern (`createHash('sha256')`, `fileURLToPath(new URL('../proofs', import.meta.url))`, `safeName` roundId sanitizer, gitignored output dir). tlock offline-fallback key and zk witness NEVER enter a response/log — same discipline as `systemPromptHash` (never the raw prompt).

### Dependency-injected Express handler + zod + secret-safe envelope
**Source:** `solver/src/api.ts` (lines 74-134 `AppDeps`; 150-176 zod schemas; 186-190 `wrap`; 609-621 error middleware)
**Apply to:** every new CRYP endpoint. Add functions to `AppDeps`, a `z.object().strict()` body schema, wrap async handlers with `wrap()`, throw `ApiError(status, code, message)` (secret-free). Mirror the `/round/:id/tamper-clear` handler (lines 552-565) for prove/verify/tamper.

### v2 Ledger API CRUD (submit-and-wait + ACS-at-offset)
**Source:** `solver/src/ledger.ts` (lines 112-159 `submitAndWait`/`createContract`/`exerciseChoice`/`queryByEntity`) and `web/src/lib/peek.ts` / `web/src/ledger/v2react.tsx` `fetchAcs` (lines 75-85)
**Apply to:** `OrderCommitment` create/exercise + bond queries (solver plane, operator token) AND VIZ-02 per-party reads (browser plane, each party's own token). The `activeAtOffset` field IS the time-machine primitive: `queryByEntity` already reads `activeAtOffset = await ledgerEnd()`; VIZ-02 records the stage offsets and replays each with `filtersByParty: { [party]: {} }, activeAtOffset`. Template addressing is the package-name form `#umbra:Umbra.Auction:OrderCommitment`.

### Provenance grammar: dashed-vs-solid + ink/red verdict + `bg-redact`
**Source:** `SettlementView.LeakageSimPanel` (lines 266-345 — `border: '1px dashed #0A0A0A'` + tag), `DeskColumn.RedactedBody` (lines 162-214 — `bg-redact`, red 6px square), `OrderTicket` seal-wipe (lines 488-537 — `bg-redact` / `animate-umbra-wipe`)
**Apply to:** all Phase-10 UI. T1 = solid 1px ink; T3 = dashed 1px ink + red-bordered tag; sealed/blinded = `bg-redact`; reveal = `umbra-wipe`; pass verdict = ink 6px square, loss/reject = red `#E2231A` 6px square (verbatim from `DeskColumn` line 210). No new tokens.

### Solver-plane browser client (`web/src/solver.ts`)
**Source:** `web/src/solver.ts` (SOLVER_BASE_URL/`solverPort`/`OFFLINE_CAPTION`) + `ProofPackButton.tsx` (fetch → blob → state machine)
**Apply to:** ProofOfClearingPanel (generate/verify/export) and the VIZ-02 stage→offset map fetch. Add typed response mirrors + a `proveUrl`/`verifyUrl` helper; degrade to `OFFLINE_CAPTION` on reject. Browser holds no operator/Anthropic credential.

---

## Pattern Assignments

### `daml/Umbra/Auction.daml` (model, on-ledger verify) — MODIFY

**Analog:** self — `Order` template (87-121), `Round.Clear` (205-360), `TradeConfirmation` (131-149); `Asset` bond primitives from `Umbra/Asset.daml`.

**Additive-template discipline** (from the file's own header + `TradeConfirmation` AUCT-04 append): add `OrderCommitment` + a `proofHash : Optional Text` anchor field additively so §4 + existing tests survive.

**On-ledger hash (CRYP-01)** — new import + canonical serializer (RESEARCH Pattern 1, verified):
```daml
{-# OPTIONS_GHC -Wno-crypto-text-is-alpha #-}
import DA.Crypto.Text (sha256, toHex)
commitOf : Text -> Text -> Text
commitOf payload salt = sha256 (toHex (payload <> "|" <> salt))
```
`sha256 : BytesHex -> BytesHex` requires hex input — always `toHex` first (Pitfall 1). Canonical serialization must be injective and shared by commit + reveal (Pitfall 2): fixed field order, explicit `Some x`/`None` tokens, `Decimal` via pinned scale.

**`OrderCommitment` template** (RESEARCH lines 306-316) — signatory `operator, desk` (copy the `Order` stakeholder set at lines 98-99, which IS the privacy model); holds `commitment : Text`, `bondCid : ContractId Asset`, `roundId`. `RevealOrder` choice recomputes + asserts, returns the bond, creates the sealed `Order`. Copy the operator-only consuming-choice pattern from `Order.Retire` (lines 119-122) for the non-reveal slash inside `Round.Clear`.

**`Round.Clear` additions:** (1) per-revealed-order commitment re-check (defense-in-depth, mirrors the existing recompute-and-assert), (2) slash any still-live `OrderCommitment` (a consuming move of its bond `Asset` to operator — reuse `moveExact`/`Reassign`), (3) record `proofHash`. §4 flow unchanged — the money-shot number is the canary.

---

### `solver/src/tlock.ts` (service, external-network) — NEW

**Analog:** `solver/src/proof.ts` (module structure, secret-safety) for shape; RESEARCH Pattern 2 for the API.

**Pattern (RESEARCH lines 160-168, verified round-trip):**
```ts
import { timelockEncrypt, timelockDecrypt, roundAt, mainnetClient, Buffer } from 'tlock-js'
const client = mainnetClient()               // quicknet, preconfigured (RFC9380)
const info = await client.chain().info()     // period 3, genesis 1692803367
const target = roundAt(Date.now() + windowMs, info)
const ct = await timelockEncrypt(target, Buffer.from(payloadJson), client)
const pt = await timelockDecrypt(ct, client) // throws "too early" before the beacon
```
`tlock-js` is CommonJS — named CJS interop in the ESM solver (`defaultChainOptions` is NOT exported; use `mainnetClient()`). Add `DRAND_URL` / `DRAND_CHAIN_HASH` env like `PARTICIPANT` env resolution in `ledger.ts` (lines 44-48). Offline-fallback local key = a NEW server-only secret (never logged/returned), labeled weaker (Pitfall 6). Target `roundAt(now + windowMs, info)` with a safety margin.

---

### `solver/src/zk/` (service, transform) — NEW

**Analog:** `solver/src/proof.ts` (artifact write/read + hashing) + `solver/src/auction.ts` `computeClearing` (the statement the circuit reduces from) + the `tamperClear` seam in `ledger.ts`.

**Circuit + statement:** copy the verified reduced circuit verbatim from RESEARCH (lines 257-292) and the exact §4 statement (lines 296-302). Poseidon commitments + `fill ≤ qty` + side-gated limit-vs-p* + conservation. Watch Pitfall 4 (introduce intermediate signals for triple products) — already handled in the RESEARCH circuit.

**Prove/verify (RESEARCH Pattern 3, verified — ESM-safe):**
```ts
import * as snarkjs from 'snarkjs'
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, 'zk/clearing.wasm', 'zk/clearing_final.zkey')
const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof)
```
Never use circom's `generate_witness.js` (CommonJS — Pitfall 3). Host-side Poseidon via `circomlibjs buildPoseidon` must match in-circuit params. Anchor `sha256(proof ‖ publicSignals)` + vkey hash (both `Text`) — reuse `proof.ts` `sha()`. Tamper-reject test mirrors `tamperClear` (perturb, expect verify=false / witness fail).

---

### `solver/src/api.ts` (controller, request-response) — MODIFY

**Analog:** self — `createApp(deps)`, `AppDeps` (74-134), zod schemas (150-176), `wrap` (186-190), `/tamper-clear` handler (552-565), SSE handler for any streaming (431-492), error middleware (614-621).

Add to `AppDeps`: `timelockEncrypt/Decrypt`, `generateProof`, `verifyProof`, `captureStageOffsets`. New `z.object().strict()` bodies (reveal payload, prove/verify inputs, tamper mode — reuse the `tamperClearBody` enum shape). Throw `ApiError` (secret-free). Reveal-timing endpoints reuse the `TERMINAL_STATUSES`/round-status guard pattern (lines 178-179, 499-506). Serves on the live :4100 (env-driven).

---

### `solver/src/ledger.ts` (service, CRUD) — MODIFY

**Analog:** self — `createContract`/`exerciseChoice`/`queryByEntity` (124-159), `openRound`/`readSealedOrders` (163-250), `settle` (332-399), `ledgerEnd` (103-107).

Add `OrderCommitment` create/exercise (copy `createContract('Umbra.Auction:OrderCommitment', {...})`), bond `Asset` queries (copy the `queryByEntity('Asset')` + owner/symbol filter from `settle` lines 350-361), and **stage→offset capture for VIZ-02**: call `ledgerEnd()` (already private, line 103) at each round transition and expose the `{stage: offset}` map. Wire types verbatim (Int/Decimal in as numbers, out as strings → `Number()`; tuples `{_1,_2}`; `#umbra:` template refs).

---

### `web/src/components/OrderTicket.tsx` (component, per-party plane) — MODIFY

**Analog:** self — the seal state machine (`ticketLocked`, `onSeal`, lines 63-194), `bg-redact` SEALED row (488-505), `umbra-wipe` overlay (531-537), the `nlPhase` async state machine (81-142); `DeskColumn.RedactedBody` red-verdict grammar (162-214).

Wrap the shipped seal flow in a `phase: 'draft'|'committed'|'timelocked'|'revealed'|'forfeited'` state machine (extend the existing `nlPhase` idiom). `COMMIT & POST BOND` replaces the single confirm (ink-fill CTA, copy `OrderTicket` line 507-516). COMMITTED/TIMELOCKED render order body under `bg-redact` (reuse line 493 stripe); REVEAL lifts it via `animate-umbra-wipe` (line 533). Verdicts: ink 6px square (pass) / red `#E2231A` 6px square (forfeit/mismatch — copy `DeskColumn` line 210). Ciphertext/commitment render on the ink evidence surface (mono `13` pre-wrap tabular). Stays on the desk's own `ctx.useLedger()` plane — `load demo` stays plain §4 Limit; still clears 100.00. Regenerated `OrderCommitment` binding imported like `Order`/`Venue` (lines 16-18).

---

### `web/src/components/ProofOfClearingPanel.tsx` (component, operator plane :4100) — NEW (in SettlementView)

**Analog:** `SettlementView.LeakageSimPanel` (lines 266-345 — the dashed T3 panel + tag + disclaimer, the exact honest-labeling precedent) + `ProofPackButton.tsx` (fetch→blob→state machine, ink-ghost export CTA) + `web/src/solver.ts` client.

Insert BELOW the shipped DvP-legs/atomic-stamp/`RoundBrief` (SettlementView lines 228-240), hidden until `phase === 'cleared'|'settled'`. Three-tier layout: T2 proof artifact pane (solid ink + `ZK PROOF · GROTH16` tag, ink evidence surface — copy the LeakageSim panel scaffold but SOLID border for T1/T2), T3 off-ledger verify pane (`border: '1px dashed #0A0A0A'` verbatim from line 279 + red `OFF-LEDGER VERIFY · POC` tag), T1 solid on-ledger anchor line. Tamper control reuses `.break-ai-force` red-ghost + verbatim rejection (mirror the `tamperClear` UI in `BreakTheAiPanel.tsx`). Export reuses `ProofPackButton` `.umbra-ink-ghost` grammar. All fetches via `solver.ts` → `OFFLINE_CAPTION` on reject.

---

### `web/src/views/TimeMachineView.tsx` (view 06, per-party replay) — NEW

**Analog:** `PrivacyView.tsx` (page frame + 3/4-up grid, lines 23-88), `DeskColumn.tsx` (per-party `ctx.DamlLedger` plane + redaction, whole file), `web/src/lib/peek.ts` (`buildPeekRequest` with `activeAtOffset`, lines 74-90).

Standard page frame from `PrivacyView`/`DeskView` (section marker `06`, 1px ink rule, Space Grotesk `54` `<h1>` = `REWIND THE BLINDNESS.`). Four party columns (BANK-A/B/C/OPERATOR) reuse `DeskColumn`'s border/gap grammar and each mount their OWN `ctx.DamlLedger` with that party's token (authentic per-party reads — the operator token never enters the browser). The scrubber selects a stage→offset (from the solver map); each column re-reads its ACS at that offset via the `activeAtOffset` primitive already in `peek.ts`/`v2react.tsx`. Visible cell = T1 `LEDGER EVENT @ {offset}`; blinded = `bg-redact` + `NOT VISIBLE` (copy `DeskColumn.RedactedBody`); derived = dashed + red `RECONSTRUCTED`. Venue-blind beat: OPERATOR column also `bg-redact` at the TIMELOCKED stage. Append to nav as `06 · Time Machine` (shipped `Nav.tsx` grammar).

---

### `daml/Umbra/Setup.daml` + `daml/Umbra/Tests.daml` (seed/test) — MODIFY

**Analog:** self — `initialize` seed (Setup lines 49-60, `mintAsset` helper), the `test_clears_at_100` canary in `Tests.daml`.

Add bond mints (reuse `mintAsset operator bank "USDCx"`), route §4 through commit→reveal (new script steps), and the Wave-0 test set from RESEARCH (lines 391-394): `test_commit_reveal_clears_at_100`, `test_reveal_mismatch_rejected`, `test_bond_forfeit`, `test_bond_returned`. Run Git-Bash-PATH-only: `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml test"`. The §4 `$100.00 / A=10/B=8/C=2` assertion is the continuous canary.

---

### `web/daml.js` (generated) — REGENERATE + COMMIT

**Analog:** the committed `web/daml.js` tree (regenerated on every prior template change per repo history "commit generated daml.js bindings"). STALE the moment `OrderCommitment` / `proofHash` land. Regenerate via `daml codegen js` and commit; `OrderTicket`/`TimeMachineView`/`DeskColumn` import the new template like `@daml.js/umbra-0.1.0/lib/Umbra/Auction/module`.

---

## No Analog Found

None. Every Phase-10 file maps to a strong in-repo analog. The only genuinely NEW primitives — `DA.Crypto.Text.sha256` (on-ledger), `tlock-js`, `circom`/`snarkjs` — are library/SDK-backed and covered by verified RESEARCH code examples (§ "Code Examples", lines 254-317) rather than a codebase analog; use those excerpts directly.

## Metadata

**Analog search scope:** `daml/Umbra/*.daml`, `solver/src/**`, `web/src/views/**`, `web/src/components/**`, `web/src/lib/**`, `web/src/ledger/**`, `web/src/solver.ts`
**Files scanned:** 18 read in full or targeted
**Pattern extraction date:** 2026-07-09
