---
phase: 10-cryptographic-privacy
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - daml/Umbra/Auction.daml
  - daml/Umbra/Roles.daml
  - daml/Umbra/Setup.daml
  - daml/Umbra/Tests.daml
  - solver/src/api.ts
  - solver/src/index.ts
  - solver/src/ledger.ts
  - solver/src/timemachine.ts
  - solver/src/tlock.ts
  - solver/src/zk/build.mjs
  - solver/src/zk/clearing.circom
  - solver/src/zk/prove.ts
  - solver/src/zk/verify.ts
  - solver/src/zk/zk-deps.d.ts
  - web/src/App.tsx
  - web/src/components/Nav.tsx
  - web/src/components/OrderTicket.tsx
  - web/src/components/ProofOfClearingPanel.tsx
  - web/src/lib/truncate.ts
  - web/src/solver.ts
  - web/src/views/SettlementView.tsx
  - web/src/views/TimeMachineView.tsx
  - solver/src/api.test.ts
  - solver/src/tlock.test.ts
  - solver/src/zk/verify.test.ts
  - web/src/lib/cryptoUrls.test.ts
  - web/src/views/TimeMachine.test.tsx
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-10
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Phase 10 layers three cryptographic-privacy features onto the byte-frozen §4 clearing path: on-ledger sha256 commit–reveal (CRYP-01), drand timelock (CRYP-02), and a Groth16 proof-of-correct-clearing with on-ledger hash anchoring (CRYP-03), plus a VIZ-02 per-party Time Machine.

The additive invariant holds: `Round.Clear`, the §8 recompute-and-assert backstop, and `settle()`/`tamperClear()` are untouched, and `test_commit_reveal_clears_at_100` proves the canonical batch still clears at $100.00 with fills A=10/B=8/C=2. The on-ledger commit↔reveal binding is REAL (the ledger recomputes `sha256(serializeOrder ‖ salt)` and rejects mismatches — `test_reveal_mismatch_rejected` covers both wrong-salt and wrong-order). The tlock early-decrypt block and Groth16 tamper-reject are genuine crypto (proven deterministically in `tlock.test.ts` / `verify.test.ts`), not stubs. The secret-safe error envelope, module-private operator token, module-private tlock key, and credential-free browser client are all disciplined.

However one BLOCKER breaks a headline privacy guarantee: the ZK commitment salt is the order index, making the "private witness" recoverable from browser-published public signals. Three warnings concern a crypto-honesty overclaim (venue receives plaintext orders; UI mislabels tamper outcomes) and a latent settlement-fold bug.

## Critical Issues

### CR-01: ZK commitment uses a guessable index salt — private order values are brute-forceable from the public proof

**File:** `solver/src/index.ts:355` (with `solver/src/zk/prove.ts:60-64`, `solver/src/zk/clearing.circom:40-43`)
**Issue:** In `generateProof`, each order's Poseidon commitment is built with `salt: String(i + 1)` — i.e. the salts are the literal, public-derivable values `1`, `2`, `3`. The circuit commits `Poseidon(side, qty, limit, salt)` and publishes each `comm[i]` as a public signal (`publicSignals[2..]`), which the browser renders in `ProofOfClearingPanel` under "Public Inputs / COMMITMENTS" and which the UI captions "NO LOSING ORDER IN THE WITNESS" / "reveals no losing order."

Because the salt is known and the committed domain is tiny (`side ∈ {0,1}`, small integer `qty` and `limit`), an observer holding the public signals can enumerate `Poseidon(side, qty, limit, i+1)` over a few million candidates and recover every order's exact side/quantity/limit in seconds. Poseidon is only hiding with a high-entropy secret salt; with a deterministic index salt it is effectively a lookup. The private witness the proof is supposed to protect (`prove.ts:12-14`, spec §15 / T-10-11) is therefore recoverable from a browser-reachable response — the exact secret-boundary failure this phase is meant to prevent.

The `// PoC-grade` labeling in `index.ts:342-355` acknowledges the substitution, but the surfaced UI still asserts the hiding property as fact, so this is an overclaim, not just a documented reduction.
**Fix:** Derive each order's salt from a high-entropy per-order secret (the desk's real reveal salt, or `randomBytes(31)` as a decimal field element), keep it strictly inside `prove.ts`/`index.ts` (never returned/logged), and never let it be reconstructable from an index. If a real secret salt cannot be wired this phase, downgrade the UI copy so it does not claim the commitments hide the order values (e.g. explicitly label the commitments as non-hiding PoC placeholders).
```ts
// index.ts generateProof — replace the deterministic index salt:
import { randomBytes } from 'node:crypto'
const saltFieldElement = () => BigInt('0x' + randomBytes(31).toString('hex')).toString()
// ...
salt: saltFieldElement(), // high-entropy, module-private, never returned/logged
```

## Warnings

### WR-01: Cleartext orders transit the operator-plane solver during the open window (contradicts the "venue can't peek" claim)

**File:** `web/src/components/OrderTicket.tsx:397,406-409` and `solver/src/api.ts:708-733`
**Issue:** `onCommit` computes `payload = serializeOrder(built)` — the full plaintext order (side/qty/limit) — then calls `runTimelock(payload)` → `POST /round/:id/timelock-encrypt` with `{ payload }`. The solver (operator authority) receives the cleartext order and only THEN seals it. tlock.ts:7-9 claims the payload is "UNDECRYPTABLE — by anyone, including the operator/solver," and TimeMachineView tells the user "at COMMITTED/TIMELOCKED even the venue sees only ciphertext." Both are contradicted: the venue's own service handles the plaintext at seal time, during the open window, before any reveal. Nothing on-ledger leaks (only the commitment hash is posted), and no request-body logging exists today, but any future access log / middleware on the solver would capture the sealed-bid contents, and the stated guarantee is already false.
**Fix:** Perform the timelock encryption client-side (the browser already holds the plaintext and salt) so the solver only ever receives ciphertext + public window params, or explicitly re-scope the UI/tlock copy to "the venue holds only ciphertext ON-LEDGER" and drop the "no one, including the venue" wording. At minimum, guarantee the solver never logs the `/timelock-encrypt` body.

### WR-02: Tamper-proof panel hardcodes "PROOF REJECTED" regardless of the actual verdict

**File:** `web/src/components/ProofOfClearingPanel.tsx:508-517` (with `solver/src/index.ts:378-395`)
**Issue:** `tamperProof` in index.ts returns `verified: false as const` unconditionally and sets `rejected: !verified` — so if a tampered public input ever DID verify (a real safety regression), `rejected` would be `false` but `verified` still reports `false`, and the error string flips to "UNEXPECTED: the tampered public input verified." The panel, however, renders `<RedSquareRow label="TAMPERED CLEARING → PROOF REJECTED" />` whenever `tamper` is truthy, without checking `tamper.rejected`. In the regression case the UI would falsely assert the proof was rejected (the honest-labeling grammar the panel is built around), with only the raw error text hinting otherwise. Unlike `ledger.tamperClear`, which throws loudly on a safety regression (ledger.ts:495), this path degrades silently into a false "rejected" claim.
**Fix:** Gate the verdict row on the real field, e.g. `tamper.rejected ? <RedSquareRow label="TAMPERED CLEARING → PROOF REJECTED" /> : <RedSquareRow label="UNEXPECTED — TAMPER ACCEPTED, INVESTIGATE" />`, and let `tamperProof` report the true `verified` boolean instead of a hardcoded `false`.

### WR-03: Cash-leg fold returns an archived ContractId on an exact-cash full-consume (latent multi-seller abort)

**File:** `daml/Umbra/Auction.daml:407-423`
**Issue:** In `creditCash`, the `cashDue == holding.quantity` branch `exercise usdcCid Reassign` (consuming/archiving `usdcCid`) and then `pure usdcCid`, threading the just-archived cid into the next fold iteration. With more than one remaining seller, the next iteration `fetch usdcCid` hits an archived contract and the whole `Clear` aborts. This never fires on the §4 fixture (buyer cash 5000 ≫ per-seller dues, so every leg takes the `Split` branch), so the additive invariant is intact, but the general single-buyer/multi-seller case where one seller's cash exactly equals the running remainder would fail. It aborts rather than mis-settling (no data loss), but it is an incorrect code path.
**Fix:** On full-consume, thread a sentinel indicating "no remainder left" and assert no further seller has a positive fill, or restructure the fold to compute the total debit once and split sequentially with an explicit remainder guard, rather than returning a consumed cid.

## Info

### IN-01: Groth16 circuit is fixed to exactly 3 integer-limit orders

**File:** `solver/src/zk/clearing.circom:64` and `solver/src/index.ts:344-360`
**Issue:** `component main = Clearing(3)` hardcodes N=3, and `generateProof` builds fixed-length input arrays from the round's views, so `POST /round/:id/prove` throws (generic 500) for any round without exactly 3 orders. Non-integer limits (e.g. 100.5) also break the field-element conversion. This is a documented PoC scope but is not surfaced as a user-facing limitation.
**Fix:** Document the N=3 / integer-limit constraint at the `/prove` route and return a clean 422 (not a generic 500) when the round shape is unsupported.

### IN-02: Stale Auction.daml line references in tamperClear comments

**File:** `solver/src/ledger.ts:403,517-518,546-547`
**Issue:** Comments cite "Auction.daml 183/187/192" (asserts), "Auction.daml 196"/"221" (consume choices), and "226-240" (ProofAnchor); the actual lines have drifted (asserts ~356/361/365, RevealOrder ~196, ForfeitBond ~221, ProofAnchor ~233-240). Misleading for future maintainers.
**Fix:** Update the line references or replace them with stable symbol names (e.g. "the RevealOrder assertMsg").

### IN-03: `commitments()` mislabels [pStar, matched] as commitments for short signal arrays

**File:** `web/src/components/ProofOfClearingPanel.tsx:182-183`
**Issue:** `p.publicSignals.length > 2 ? slice(2) : p.publicSignals` — when the array has ≤2 entries it renders `[pStar, matched]` under the "COMMITMENTS" caption. Cosmetic given the real proof always emits 5 signals, but wrong if an inert/degenerate proof is ever displayed.
**Fix:** Return `[]` (or hide the commitments block) when `publicSignals.length <= 2`.

### IN-04: `isEntrypoint()` basename match is fragile

**File:** `solver/src/index.ts:451-455`
**Issue:** Entry detection compares only the invoked script's basename against the tail of `import.meta.url`, so a different script sharing the basename `index.js` could false-match and boot the service on import.
**Fix:** Compare resolved absolute paths (`fileURLToPath(import.meta.url) === resolve(process.argv[1])`).

### IN-05: 16-bit comparators are unsound for quantities/fills > 65535

**File:** `solver/src/zk/clearing.circom:47-48,53`
**Issue:** `LessEqThan(16)` / `GreaterThan(16)` on `fill`/`qty` silently produce wrong results for values ≥ 2^16, which would let an out-of-range fill pass the `fill ≤ qty` / `fill > 0` gates. Safe for §4's small quantities, but a soundness cliff worth noting for the PoC.
**Fix:** Size the comparators to the intended quantity domain (and range-check inputs), or document the ≤65535 bound alongside the trusted-setup PoC caveat.

---

_Reviewed: 2026-07-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
