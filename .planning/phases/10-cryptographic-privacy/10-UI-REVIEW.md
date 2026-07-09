# Phase 10 — UI Review (Cryptographic Privacy · CRYP-01/02/03 · VIZ-02)

**Audited:** 2026-07-10
**Baseline:** 10-UI-SPEC.md (approved additive contract) + `Umbra design/` binding comp + `web/tailwind.config.ts` / `web/src/index.css` tokens
**Screenshots:** not captured — static code-only audit (advisory, non-blocking, no dev server booted per instruction)
**Scope:** ONLY the new Phase-10 surfaces — `OrderTicket.tsx` (CRYP-01/02), `ProofOfClearingPanel.tsx` (CRYP-03), `TimeMachineView.tsx` (VIZ-02), plus their wiring in `App.tsx` / `Nav.tsx` / `SettlementView.tsx`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every contract string is verbatim; honest defensive states added beyond the contract |
| 2. Visuals | 3/4 | Tier grammar is unambiguous, but the Time-Machine **T1 "solid ink" border is rendered faint** (`rgba(10,10,10,.14)`) and the CRYP-01 sealed-contents is a decorative stripe rather than values-under-stripe |
| 3. Color | 4/4 | Ink/red/paper discipline held; no lime on any crypto surface; side color only on revealed values |
| 4. Typography | 4/4 | Only declared token sizes; IBM Plex Mono `tabular-nums` on all hashes/ciphertext/proof |
| 5. Spacing | 4/4 | Literal comp scale; evidence padding `22px 24px`, block margin `34px`, tag pad `3px 7px` all exact |
| 6. Experience Design | 4/4 | Loading / empty / offline / error / reduced-motion / keyboard scrubber / aria all present |

**Overall: 23/24**

---

## Honest-Labeling Grammar Verdict (THE KEY DESIGN CONTRACT)

**VERDICT: CORRECT and UNAMBIGUOUS. No overclaiming detected. No tier collision found.**

The three-tier T1/T2/T3 provenance grammar is implemented faithfully and is visually distinct at every surface. Concrete evidence:

- **T1 (on-ledger truth → SOLID ink + neutral `ON-LEDGER` tag):**
  - CRYP-01 COMMITTED card (`OrderTicket.tsx:791-799`): `border: '1px solid #0A0A0A'` + `ProvTag tone="ink"` `ON-LEDGER`.
  - CRYP-01 REVEALED card (`:997-1002`): solid ink + `ON-LEDGER` + `COMMITMENT VERIFIED ON-LEDGER` **ink** verdict square (not lime, not red — matches contract rule that a passing check is ink).
  - CRYP-03 on-ledger anchor pane (`ProofOfClearingPanel.tsx:440-443`): distinct `1px solid #0A0A0A` surface + ink `ON-LEDGER` tag, rendering `PROOF HASH` / `VKEY HASH`.
- **T2 (real strong crypto / external-trust → SOLID ink + ink mechanism tag):**
  - CRYP-02 drand timelock (`OrderTicket.tsx:838-859`): solid border **only** when `seal.mode !== 'offline'`, tag `TIMELOCK · DRAND QUICKNET` (ink), ciphertext rendered literally on the ink evidence surface + drand round + `TIME TO BEACON`.
  - CRYP-03 proof artifact (`ProofOfClearingPanel.tsx:349-352`): `1px solid #0A0A0A` + ink `ZK PROOF · GROTH16`, raw proof bytes + public inputs literal.
- **T3 (off-ledger / weaker / PoC → DASHED border + RED tag):** both mandated tags are present, exact, red-toned, and on dashed surfaces:
  - `OFF-LEDGER VERIFY · POC` — `ProofOfClearingPanel.tsx:401`, `tone="red"`, on `border: '1px dashed #0A0A0A'` pane (`:398`). ✔ exact string.
  - `OFFLINE FALLBACK · WEAKER THAN DRAND` — `OrderTicket.tsx:857`, `tone="red"`, on the TIMELOCKED card whose border flips to `1px dashed #0A0A0A` when `seal.mode === 'offline'` (`:842`), plus the sub-line `LOCAL KEY RELEASED AT CLOSE — NO THRESHOLD GUARANTEE` in red. ✔ exact string.
  - `RECONSTRUCTED` — `TimeMachineView.tsx:240`, red square + dashed cell border.

**The verify/anchor split is a real visual split** (contract rule 3): CRYP-03 renders the ZK verification verdict on a **dashed T3** pane and the proof-hash anchor on a **distinct solid T1** pane — the honest "off-ledger verify + on-ledger hash anchor (Canton has no zk precompile)" statement is made structurally, not just in prose. The `OFF_LEDGER_PROSE` co-appears (`:435`), satisfying "guarantee AND limitation always co-appear."

**No T3 can masquerade as T1/T2:** every off-ledger/PoC/weaker state carries BOTH a dashed border AND a red tag AND (per the accessibility clause) a textual tag, so honesty does not depend on perceiving border-style alone. The persistent `POC · CRYPTOGRAPHER REVIEW PENDING` red tag brands the entire CRYP-03 panel.

**Venue-blind honesty (VIZ-02) is a standout:** because the browser holds no operator token, the OPERATOR column is honestly labeled `RECONSTRUCTED` (T3) at every non-blind stage (`operatorCell`, `:147-150`) and `blinded` at the COMMITTED/TIMELOCKED stage — it never fakes an authentic aggregate read. Rival redaction is enforced at the wire (each column reads with its own token via `readAcsAtOffset`, `:154-169`), so `NOT VISIBLE` reflects genuine access-control absence, not a render-time filter. This is the anti-overclaiming ideal.

**Anomaly guard (bonus honesty):** the tamper demo only claims `TAMPERED CLEARING → PROOF REJECTED` when `tamper.rejected` is genuinely true; a tamper that anomalously verified surfaces `ANOMALY — TAMPER ACCEPTED, INVESTIGATE` instead of a false pass (`ProofOfClearingPanel.tsx:515-519`). Similarly the reveal path never fabricates a mismatch for an offline failure (`OrderTicket.tsx:453-461`).

---

## Top 3 Priority Fixes (all WARNING — none blocking)

1. **Time-Machine T1 "visible" cell border is faint, not solid ink** — `CellFrame` renders visible/blinded cells with `1px solid rgba(10,10,10,.14)` (`TimeMachineView.tsx:251`), whereas the grammar reserves **SOLID 1px ink `#0A0A0A`** for T1 truth. The truth signal is softened; a viewer scanning borders sees near-invisible T1 frames while only the red-dashed T3 pops. *Fix:* render authentic (visible) cells at full `1px solid #0A0A0A` (or lean on the shipped `DeskColumn` internal-ink-border grammar) so T1 reads as solid-ink truth. Provenance is still textually safe (the `LEDGER EVENT @ {offset}` caption), so this is fidelity, not a collision.

2. **Reconstructed T3 cell border is red-dashed, not ink-dashed** — `border: '1px dashed #E2231A'` (`TimeMachineView.tsx:251`). The master grammar table specifies T3 border = **DASHED 1px ink**, with red carried by the *tag*. This over-signals rather than under-signals (so no overclaiming risk), but it diverges from the shipped dashed-ink separator grammar used in CRYP-02/03. *Fix:* switch the border to `1px dashed #0A0A0A` and keep the red `RECONSTRUCTED` tag/square for the limitation, matching `ProofOfClearingPanel` and `OrderTicket` T3 surfaces for a consistent system.

3. **CRYP-01 sealed-contents is a decorative stripe, not values-under-stripe** — `OrderTicket.tsx:815-825` renders a standalone 34px `bg-redact` block above the `CONTENTS SEALED` caption, rather than the would-be order values rendered *beneath* the redaction stripe (per spec §CRYP-01 COMMITTED). The intent (sealed indicator + adjacent caption) is met and accessible, but it loses the "your real values are hidden right here" beat that `umbra-wipe` later lifts. *Fix:* render the draft values under the `bg-redact` overlay so the REVEAL wipe exposes them in place (the reveal card already tints values `buy`/`sell`, so the wire is present).

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
Contract strings are verbatim across all three surfaces: `COMMIT & POST BOND`, the bond+forfeit confirmation copy (`:764-767`), `CONTENTS SEALED — VISIBLE ONLY TO YOU AT REVEAL`, `REVEAL ORDER →`, `COMMITMENT VERIFIED ON-LEDGER`, `BOND FORFEITED — NO REVEAL BY CLOSE`, `BOND SLASHED TO OPERATOR POT`, the drand guarantee/offline prose, the full CRYP-03 `STATEMENT` and `OFF_LEDGER_PROSE`, `NO LOSING ORDER IN THE WITNESS`, `RUN TAMPERED CLEARING`, `EXPORT PROOF ↓`, VIZ-02 `REWIND THE BLINDNESS.`, the empty-state heading/body, and both error-state strings. Honest additive states (`OFF-LEDGER VERIFY FAILED`, `ANOMALY — TAMPER ACCEPTED, INVESTIGATE`, `REVEAL RUNS ON THE LIVE LEDGER…`) extend the contract without contradicting it. No generic/placeholder labels.

### Pillar 2: Visuals (3/4)
Strong visual hierarchy: ink evidence surfaces for all raw crypto, a CSS lock glyph (`LockGlyph`, no new asset), ink/red verdict squares, and unmistakable tier separation. Docked one point for the two fidelity slips in fixes #1 and #3 — the faint T1 border in the Time-Machine grid softens the "solid-ink = truth" signal that the whole provenance grammar rests on, and the CRYP-01 sealed stripe is decorative rather than concealing the actual values. Neither breaks honesty; both are comp-fidelity regressions against the 100%-comp mandate.

### Pillar 3: Color (4/4)
60/30/10 discipline held. No lime introduced on any commit/timelock/proof surface (verified by grep) — lime remains the clearing-reveal signal only. Red is strictly semantic loss/limitation/rejection: forfeit, mismatch, offline fallback, off-ledger PoC tags, tamper rejection, reconstructed. Side colors `#2B3AF2`/`#FF3D9A` appear only on revealed values (`OrderTicket.tsx:1010-1016`, `VisibleCellBody:193`), never on sealed cards. All inline hex values map exactly to `tailwind.config.ts` tokens; `rgba(10,10,10,·)` usages are opacity variants of ink, not new palette entries. Minor note: the reconstructed-cell border uses red instead of ink (fix #2) — a color-token deviation, but it over-signals the limitation rather than hiding it, so no honesty impact.

### Pillar 4: Typography (4/4)
Every size resolves to a declared `fontSize` token (`text-9/10/11/12/13/14/18/22/44/54`). All hashes, ciphertext, proof bytes, public inputs, drand round, countdowns, and bond amounts render in IBM Plex Mono with `tabular-nums`. Weight grammar respected: 400/600 dominate, 700 confined to CTAs (`COMMIT & POST BOND`, `REVEAL ORDER →`, `GENERATE PROOF →`, `EXPORT PROOF ↓`). Time-Machine headline is `font-display text-54 font-bold` at `-.02em` per contract. Middle-truncation (`truncHex`, `middleTruncate`) with full value in `title`/`aria-label` keeps artifacts lossless.

### Pillar 5: Spacing (4/4)
Comp literal scale honored: evidence-surface inner padding `22px 24px` (matches AgentRationale), CRYP-03 block `marginTop: 34px`, tag padding `3px 7px`, card padding `16px`, gap `18px` between lifecycle cards, scrubber `marginBottom: 18`, view frame `30px 48px 64px`. No arbitrary Tailwind bracket values (`[12px]` / `[#…]`) found in any Phase-10 file.

### Pillar 6: Experience Design (4/4)
Full state coverage: draft/committing/committed/timelocked/revealing/revealed/forfeited (CRYP-01/02); hidden-pre-clear/generating/generated/verified/rejected/offline/export-error (CRYP-03); reading/empty/loaded/offline (VIZ-02). `prefers-reduced-motion` honored everywhere motion is used (pulse, rise, wipe, fade). Scrubber is keyboard-operable (←/→/Home/End) with `aria-current="step"` and per-node `aria-label`. Redaction stripes are `aria-hidden` with state conveyed by adjacent text. `COMMIT & POST BOND` carries its bond+forfeit consequence copy inline (the one value-locking action); `REVEAL`/`GENERATE`/`VERIFY`/`EXPORT` are non-destructive; `RUN TAMPERED CLEARING` is a harmless `.break-ai-force` red ghost. Secret boundary respected — no operator token / Anthropic key in the browser; the private witness never crosses out.

---

## Registry Safety
`components.json` absent by design (no shadcn; hand-authored comp is the binding source). No third-party registries. Crypto libraries (`tlock-js`, circom/snarkjs) are solver-/build-side only and emit no frontend component code. **Registry audit: not applicable — 0 blocks, no flags.**

---

## Files Audited
- `web/src/components/OrderTicket.tsx` (CRYP-01/02 lifecycle)
- `web/src/components/ProofOfClearingPanel.tsx` (CRYP-03)
- `web/src/views/TimeMachineView.tsx` (VIZ-02)
- `web/src/views/SettlementView.tsx` (CRYP-03 mount / placement below solid on-ledger record)
- `web/src/App.tsx` + `web/src/components/Nav.tsx` (06 · Time Machine nav registration)
- `web/src/solver.ts` (SealMode / Stage / envelope types backing the tier labels)
- `web/tailwind.config.ts` + `web/src/index.css` (token baseline)
- Cross-checked: `web/src/components/TcaReceipts.tsx` (shipped ON-LEDGER verdict grammar reuse)
