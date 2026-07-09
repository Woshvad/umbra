# Phase 10: Cryptographic Privacy - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommendations auto-accepted per user delegation "intelligently pick good options"), scope grounded in what is actually buildable on this Windows / Node 20 box with the current stack.

<domain>
## Phase Boundary

Upgrade privacy from "rivals can't see you" to "the venue itself can't see you," and demote the AI/solver from trusted to *verifiable* — via LIBRARY-BACKED cryptography, sequenced ahead of a required expert review. Built on the CURRENT v2 stack (Daml 3.4.11 + Canton 3.4 LocalNet + JSON Ledger API v2 :3975; solver :4100; web :5173). Composes with the Phase 9 richer order model (commitments are over the FULL order incl. orderType/params) and the Phase 8 flow. **The §4 fixture ($100.00, A=10 / B=8 / C=2) remains the continuous correctness reference — the crypto layer is ADDITIVE around the clearing, never changing the clearing math.**

**IN SCOPE:**
- **CRYP-01** on-ledger commit–reveal: a desk posts `hash(order‖salt)` during the window and reveals at close; `Round.Clear` re-checks each revealed order against its commitment; a non-revealing desk forfeits a bond
- **CRYP-02** timelock encryption (drand/tlock): orders are provably undecryptable — even by the operator/solver — until the window closes; composes with Canton per-party visibility
- **CRYP-03** a ZK proof-of-correct-clearing PoC: run the clearing check in a zk system over the committed orders, producing a proof any party verifies off-ledger (anchored on-ledger), revealing no losing order
- **VIZ-02** a privacy "time-machine" replay reconstructing each party's exact view across the round timeline (open→committed/sealed→cleared→settled) from ledger events

**HONEST LIMITATIONS (documented, per the roadmap's "cryptographer review gates production use"):**
- **No on-Canton zk verification**: Daml/Canton has no zk-verifier precompile, so CRYP-03's proof is verified OFF-ledger; on-ledger we anchor only the proof HASH. This is a real, documented gap — the production path is an on-ledger/native verifier.
- **PoC-grade, unaudited**: all Phase 10 crypto is demo/PoC-grade. A cryptographer's review is REQUIRED before any of it guards real value (tracked in Track B / Phase 13). This phase delivers working, honestly-labeled cryptography, not production-secure custody.
- **External trust assumptions**: tlock relies on drand's League-of-Entropy threshold network liveness/honesty; the timelock offline fallback (if used) is explicitly weaker.

**OUT OF SCOPE (later/other phases):** Daml Finance settlement, multi-buyer netting, KYC gating (P11); real on-chain DevNet / OIDC / four-eyes (P12); OTel / Vault / FIX / competing solvers (P13); the cryptographer review + KYC vendor + SOC 2 (Track B external deps). The clearing algorithm + settlement primitives are NOT changed here.

</domain>

<decisions>
## Implementation Decisions

### Commit–Reveal (CRYP-01) — HIGH feasibility, pure Daml + flow
- New `OrderCommitment` template (signatory operator + desk) storing `commitment = hash(order‖salt)` plus a posted USDCx **bond**. A `RevealOrder` step: the desk submits the full order + salt; the hash is recomputed and asserted equal to the commitment; the sealed `Order` (Phase-9 order model) is then created. `Round.Clear` clears ONLY revealed orders.
- **On-ledger hashing**: if Daml 3.4 exposes a crypto hash (`DA.Crypto.Text` sha256/keccak256 — the planner CONFIRMS availability in this SDK), enforce the commitment↔reveal binding ON-LEDGER (strongest — the ledger itself rejects a reveal that doesn't match). If NOT available on-ledger, compute the hash in the solver and record commitment + revealed order on-ledger with an operator-asserted equality, documenting the trust nuance (the binding is then operator-enforced + temporally-ordered, not ledger-recomputed).
- **Bond + slashing**: each desk posts a small USDCx bond with its commitment; the bond returns on a timely valid reveal and is **forfeited** (to the operator / a pot) on non-reveal by close — a deterrent against commit-then-vanish griefing that would distort the batch. Bonds are separate from the §4 trade holdings.
- **§4 compatibility**: the canonical orders flow commit → reveal → clear and still clear **$100.00 / A=10 / B=8 / C=2**. The commitment phase is purely additive; the clearing math (Phase 9 `computeClearing`) is unchanged and still re-verified by `Round.Clear`.

### Timelock Encryption (CRYP-02) — MEDIUM-HIGH, library-backed (tlock-js/drand)
- Use `tlock-js` (drand timelock encryption). The desk/solver encrypts the order payload (or the reveal salt/commitment opening) to a FUTURE drand round whose beacon publishes ~at window close; until that beacon exists, the ciphertext is undecryptable by ANYONE — including the operator/solver. At close the beacon is fetched and the payload decrypts. This composes with Canton per-party visibility (the ciphertext is what a party holds during the window).
- **Network**: a public drand endpoint (quicknet / League of Entropy, or a documented testnet); the target round = `now + windowSeconds` mapped to the drand period. Document the endpoint + the liveness/threshold trust assumption.
- **Property proven**: during the open window the operator holds only ciphertext, so "even the venue can't see your order early" is a real, drand-backed guarantee (not just an app promise).
- **Offline fallback**: if drand is unreachable on this box, a documented, CLEARLY-WEAKER local fallback (a held key released at close) keeps the demo runnable — labeled as weaker (no threshold guarantee). Real drand tlock is the primary path when the network is available.

### ZK Proof-of-Correct-Clearing PoC (CRYP-03) — frontier; a real, honestly-labeled PoC
- **Toolchain**: PRIMARY = circom + snarkjs (pure-Node, npm-installable, Groth16 proof + a JS verifier) — the phase-researcher CONFIRMS it installs and runs end-to-end on this Windows / Node 20 box. If circom's tooling fights Windows, the ALTERNATIVES are Noir (nargo/bb) or RISC Zero (Rust zkVM, the "run §8 verbatim in a zkVM" story). Choose whichever ACTUALLY runs end-to-end and produces + verifies a real proof — do not ship a stub.
- **Statement proven** (reduced but meaningful, over Poseidon-committed orders; prover supplies the orders + their sorted arrangement as witness): (a) each published fill ≤ its order quantity; (b) buy fills have `limit ≥ p*`, sell fills have `limit ≤ p*` (limit-compliance); (c) conservation — Σ buy fills = Σ sell fills = published matched volume; (d) the published order commitments match the witnessed orders — all WITHOUT revealing the unmatched/losing orders. This proves "the clearing is correct & fair over the sealed batch, revealing no losing order."
- **Anchoring + verification reality**: the proof is verified OFF-ledger by a verifier script/endpoint (Canton has no zk precompile). On-ledger, a new field/template anchors only the proof (or verification-key) HASH, so settlement records that a valid proof existed. Clearly labeled: off-ledger verify + on-ledger anchor.
- **§4 scope + honesty**: the PoC runs on the §4 fixture (small N), produces a real proof, and the verifier checks it (pass) and rejects a tampered clearing (fail). Labeled a PoC; full §8 (dynamic sort/tie-break) in-circuit and on-Canton verification are the production path; cryptographer review gates real use.

### Privacy Time-Machine (VIZ-02) — MEDIUM, per-party event replay
- Reconstruct each party's view from REAL ledger events (the JSON Ledger API v2 update/transaction stream, captured per round by the solver or read on demand). Each round stage has a per-party visibility snapshot.
- A timeline scrubber renders, for each stage (open → committed/timelocked → sealed/revealed → cleared → settled) × each party (BankA / BankB / BankC / Operator), exactly what that party could see at that moment — driving home structural privacy over time. Includes a "committed-but-timelocked" stage where even the operator sees only ciphertext (CRYP-02).
- Reuse the Privacy view's redaction motif + per-party plane concept; the time-machine is a new replay view/panel. Reconstruct from authentic ledger events where possible; clearly label any derived/reconstructed stage.

### Claude's Discretion
- The exact Daml encoding of `OrderCommitment` / bond mechanics, the drand round-mapping + endpoint, the precise circuit statement + toolchain (within the "must actually run + produce a real proof" bar), and the time-machine's replay data plumbing are at the planner/researcher's discretion, provided the success criteria + §4 invariant + honest-limitation labeling hold.
- If a sub-item's real (non-stub) version proves infeasible on this box within the phase, scope it to the strongest HONESTLY-LABELED PoC that runs, and document the production path + limitation rather than fake it. Prefer a smaller real proof over a larger fake one.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **daml/Umbra/Auction.daml** — `Order` (Phase-9 extended with orderType/minQty/firmIf), `Round` (CloseRound/Clear), `RoundStats`, `TradeConfirmation`. CRYP-01 adds `OrderCommitment` + a reveal choice + bond; `Round.Clear` gains a commitment-check + non-reveal slash. CRYP-03 adds a proof-hash anchor field/template.
- **daml/Umbra/Clearing.daml** + **solver/src/auction.ts** — the clearing core is UNCHANGED by Phase 10 (crypto wraps around it). The ZK statement (CRYP-03) mirrors the clearing's limit-compliance + conservation checks.
- **solver/src/** (api.ts, agent.ts, ledger.ts, index.ts) — the solver orchestrates commit→reveal timing, tlock encrypt/decrypt (CRYP-02), proof generation/verification (CRYP-03), and event capture for the time-machine (VIZ-02). New endpoints slot into api.ts; the Anthropic key stays server-side and untouched by crypto.
- **web/src/views/PrivacyView.tsx** + the redaction motif — VIZ-02 reuses the per-party plane + redaction. **web/src/tokens.json** / per-party `ledger/` contexts — the time-machine reads per-party visibility. **web/src/views/DeskView.tsx** — commit/reveal + timelock desk UI.
- **web/daml.js** (committed, regenerated on template change) — regenerate + commit when `OrderCommitment` / proof-anchor templates are added.
- **Phase-8 proof bundle + proof-pack** (solver/proofs, proofpack.ts) — CRYP-03's proof + CRYP-01's commitment record extend the decision-proof/proof-pack story (on-ledger clearing hash → real ZK proof).

### Established Patterns
- **Verify-don't-trust + on-ledger re-verification**: `Round.Clear` recomputes §8 and asserts. CRYP-01 adds a commitment re-check; CRYP-03 makes the "trust the recompute" bundle a real ZK proof.
- **Additive templates + Optional fields** (Phase 1/2/9 discipline): add `OrderCommitment` and anchor fields additively so §4 + existing tests survive; keep the §4 seed clearing at $100.00.
- **Server-side secrets**: `ANTHROPIC_API_KEY` server-only; crypto keys/salts handled server-side or client-side per the mechanism, never leaked into responses/logs.
- **daml build/test is Git-Bash-PATH-only** on this box: `bash -lc "export PATH=/c/Users/woshv/bin:$PATH && cd daml && daml test"`.
- **Privacy is structural** (signatory/observer) — the crypto STRENGTHENS it (venue-blind), never weakens the existing per-party disclosure.

### Integration Points
- CRYP-01: `OrderCommitment` template + reveal choice + bond + `Round.Clear` commitment-check/slash + Setup/seed (§4 via commit→reveal) + Daml tests + regenerated web/daml.js + solver flow + Desk UI.
- CRYP-02: `tlock-js` in the solver (+ optionally the browser); drand endpoint config; encrypt at submit / decrypt at close; composes with the commit-reveal payload.
- CRYP-03: a new `zk/` (circuit + prover + verifier) module; solver endpoints to generate/verify; on-ledger proof-hash anchor; §4 fixture proof + a tamper-rejection test.
- VIZ-02: solver/ledger event capture per round + a new web replay view reusing the redaction/per-party plane.

</code_context>

<specifics>
## Specific Ideas
- Every Phase 10 crypto claim must be HONEST about its guarantee and its limitation — this is the phase most prone to overclaiming. "Real drand tlock" vs "weaker offline fallback"; "off-ledger ZK verify + on-ledger hash anchor" (NOT on-Canton verification); "PoC, cryptographer-review-gated." Label all of it.
- The §4 fixture must still clear $100.00 / A=10 / B=8 / C=2 through commit→reveal→clear — the money-shot number is the continuous guard.
- Prefer a SMALLER real proof/mechanism that actually runs over a LARGER faked one. A working reduced ZK PoC that verifies on §4 (and rejects a tampered clearing) beats a grand design that doesn't run.
- The time-machine should use authentic ledger events so the privacy story is provable, not staged.
- The crypto is additive around the clearing/settlement — do not modify the Phase 9 clearing math or the settlement primitives (that is Phase 11).

</specifics>

<deferred>
## Deferred Ideas
- On-Canton / on-ledger ZK verification (native verifier / precompile) → production path, out of scope (documented limitation; off-ledger verify + on-ledger hash anchor here).
- Cryptographer's review that gates the crypto for real value → Track B / Phase 13 (external dependency).
- Threshold-encrypted mempool / committee-based sealing beyond drand tlock → future; tlock is the library-backed MVP.
- Full §8 (dynamic sort + tie-break) expressed in-circuit → the PoC proves a reduced clearing-correctness statement; note the scaling path.
- Replacing operator-custody bonds with Daml Finance holdings → Phase 11 (Phase 10 keeps operator-custody Asset for bonds).

</deferred>
