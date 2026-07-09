---
phase: 10
slug: cryptographic-privacy
status: approved
shadcn_initialized: false
preset: none
design_system: "Umbra design/ comp (binding) + web/tailwind.config.ts tokens (frozen from P3/P6, UI-07 = 24/24)"
baseline: "06-UI-SPEC.md (approved binding contract) + 07-UI-SPEC.md (100% comp fidelity) + 08-UI-SPEC.md (ink-evidence/verbatim-wire + red-square verdict) + 09-UI-SPEC.md (dashed-vs-solid simulation-vs-ledger separation) + Umbra design/Umbra.dc.html (ground truth)"
created: 2026-07-09
reviewed_at: 2026-07-09
---

# Phase 10 — UI Design Contract (Cryptographic Privacy — CRYP-01/02/03 · VIZ-02)

> **This is an ADDITIVE contract.** The full design system is already locked in `06-UI-SPEC.md`
> (approved 6/6), refined to **100% comp fidelity in `07-UI-SPEC.md` (UI-07 = 24/24)**, extended
> additively in `08-UI-SPEC.md` (raw-wire evidence + red-square verdicts) and `09-UI-SPEC.md`
> (dashed-vs-solid ledger/simulation separation), and grounded in the binding comp
> `Umbra design/Umbra.dc.html`. **Phase 10 introduces no new tokens, fonts, type sizes, palette
> entries, spacing values, or keyframes.** Every color / font / size / animation named below resolves
> to a value already declared in `web/tailwind.config.ts` or `web/src/index.css`; the checker BLOCKS
> anything that does not. Phase 10 is **new states/panels on already-shipped views + exactly ONE new
> view** (06 · Time Machine), each visually **indistinguishable** from the surrounding system.
>
> **Governing rule (inherited from UI-07):** where any literal here appears to differ from the binding
> comp, the comp wins. The five numbered views (01 Privacy · 02 Desk · 03 Theatre · 04 Agent ·
> 05 Settlement) are **not redesigned**; the three-desk → one-uniform-price → atomic-settle **money
> shot** (still the visual climax), the money-shot reveal, and the simultaneous-settle beat are
> **untouched**. Phase 10 wraps cryptography *around* the shipped flow.
>
> **§4 invariant (continuous canary):** the canonical batch still flows **commit → reveal → clear →
> settle** and still reads **$100.00 / A=10 / B=8 / C=2** on every numeric surface. The crypto layer is
> additive; the clearing math (Phase 9 `computeClearing`) and the settlement primitives are unchanged.
>
> **Honesty is a first-class design requirement here (the phase most prone to overclaiming).** Every
> cryptographic surface must state, on-screen, **both its guarantee and its limitation**, via the
> Provenance & Honest-Labeling Grammar below. Off-ledger / weaker / PoC surfaces are visually
> distinct from real on-ledger data and can never be mistaken for it.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — binding hand-authored comp; no shadcn (`components.json` absent by design; CLAUDE.md rule 2 makes the comp the pixel source of truth, so a component registry is intentionally not used) |
| Preset | not applicable |
| Component library | none (raw React 18 + Tailwind 3.4 + inline `style` for exact comp values) |
| Icon library | none — every mark is a CSS/SVG primitive (squares, dots, arrows, redaction stripes, carets, lock glyph as a CSS square + shackle stroke) |
| Font | Space Grotesk (display) · IBM Plex Mono (crypto data/hashes/ciphertext/proof, `tabular-nums`) · Inter (body/labels) — already wired in `web/index.html` |

**shadcn gate:** executed → **not applicable**. The project has an established, binding, hand-authored
design system; initializing shadcn would violate the 100%-comp-fidelity mandate (CLAUDE.md rule 2). No
registry, no third-party blocks. Registry-safety vetting gate: not applicable.

---

## Provenance & Honest-Labeling Grammar (the central Phase-10 contract)

This is the visual system that keeps every crypto claim honest. It is a **three-tier border + tag
rule** that extends, verbatim, the shipped precedents: Phase 8's ink "evidence surface" + red-square
verdict (comp line 131) and Phase 9's **dashed = NOT ledger data / solid = ledger truth** separation.
Every Phase-10 surface MUST declare its tier. Executors must not deviate.

| Tier | Provenance | Border (existing CSS, no new token) | Mandatory tag | Reserved for |
|------|-----------|-------------------------------------|---------------|--------------|
| **T1 — On-ledger truth** | Real, ledger-committed, ledger-verified | **SOLID 1px ink** `#0A0A0A` (shipped default) | none required; optional neutral `ON-LEDGER` caption (ink, mono `9`) | `OrderCommitment` record, revealed `Order`, `TradeConfirmation`, settled balances, **the on-ledger proof-HASH anchor line**, authentic ledger-event cells in the Time Machine |
| **T2 — Real crypto, external-trust** | Real, strong cryptography whose guarantee rests on an external network | **SOLID 1px ink** + **mandatory ink mono tag** naming the mechanism | ink tag: `TIMELOCK · DRAND QUICKNET`, `ZK PROOF · GROTH16` | tlock ciphertext during the window (real drand), the ZK proof artifact bytes |
| **T3 — Off-ledger / weaker / PoC** | Not ledger-verified, or a weaker fallback, or reconstructed/derived | **DASHED 1px ink** (`border-style: dashed`, no new token) + **mandatory RED-bordered mono tag** stating the exact limitation | red tag: `OFF-LEDGER VERIFY · POC`, `OFFLINE FALLBACK · WEAKER THAN DRAND`, `RECONSTRUCTED` | the off-ledger ZK **verify result** panel, the offline timelock fallback, any derived Time-Machine stage |

**Rules that make this checkable:**

1. **SOLID border = ledger/real-crypto truth. DASHED border = off-ledger / weaker / PoC.** This is
   the exact dashed-vs-solid rule Phase 9 established for simulation-vs-ledger; Phase 10 reuses it for
   ledger-vs-off-ledger. A T3 surface can never render with a solid border.
2. **Guarantee AND limitation always co-appear.** Every T2/T3 surface pairs a **guarantee caption**
   (Inter `13`/1.6 or mono `11`) with a **limitation tag** (mono `9`, bordered). No crypto claim ships
   without its limitation visible in the same panel.
3. **The verify/anchor split is a visual split.** CRYP-03's ZK **verification** verdict sits on a
   **DASHED T3** surface (`OFF-LEDGER VERIFY · POC`); the **on-ledger HASH anchor** line sits on a
   **SOLID T1** surface (`ANCHORED ON-LEDGER`). Placing them on different tiers *is* the honest
   statement "off-ledger verify + on-ledger hash anchor (Canton has no zk precompile)."
4. **Raw crypto renders literally, never as a badge.** Hashes, salts, ciphertext, proof bytes, public
   inputs, and verification keys render in **IBM Plex Mono on the ink evidence surface**
   (`#0A0A0A` bg / `#F4F1EA` text, `white-space: pre-wrap`, `tabular-nums`, inner padding `22px 24px`
   — identical to Phase 8's `PeekConsole` / `AgentRationale`). Long values are **middle-truncated**
   `0xab12…9f3c` with the full value in `title` / `aria-label` (and an optional expand). A styled
   badge is never a substitute for the actual artifact — the literal bytes are the credibility.
5. **Positive verdicts are ink; loss / limitation / rejection verdicts are red.** A passing check uses
   the shipped **ink** square + mono `9` `.16em` (Phase 9 `ON-LEDGER · SURPLUS ≥ 0` grammar). A
   forfeit, a mismatch, a tamper-rejection, or the off-ledger gap uses the shipped **red** `#E2231A`
   square + mono `9` `.16em` (comp line 131 / Phase 8 `REJECTED BY LEDGER` grammar).

---

## Spacing Scale

Phase 10 uses the **binding-comp irregular literal scale** already exposed in `web/tailwind.config.ts`
(`spacing`) and used across all five views. Do **not** normalize to an 8-point grid (would break comp
fidelity — CLAUDE.md rule 2). This is the standing binding-comp exception, unchanged from P6–P9.

| Token (config) | Value | Usage in Phase-10 surfaces |
|----------------|-------|----------------------------|
| (raw) | 4px | red/ink verdict-square → text gap (6px per comp line 131), tag micro-gaps |
| (raw) | 8px | caption → value gap, timeline stage-node → label gap |
| (raw) | 12px | evidence-panel label → panel, tag padding (`3px 7px`), time-machine cell inner padding |
| (raw) | 16px | evidence-panel inner padding-y, commit/reveal row padding-y |
| `14` | 14px | section-marker gap, commit-panel field group gap, time-machine column gap |
| `18` | 18px | crypto sub-panel top margin, scrubber → grid gap |
| `22`/`24` | 22/24px | ink evidence-panel inner padding (`22px 24px`, matches AgentRationale), CRYP-03 panel padding |
| `26`/`30` | 26–30px | sub-block margins inside the Desk ticket / Settlement blocks |
| `34` | 34px | post-clear / post-settle crypto-block margin-top (matches shipped Settlement CTA rhythm) |
| `48` | 48px | page horizontal padding (every `<main>`, unchanged — incl. the new Time Machine view) |

**Page frame is unchanged:** every host view keeps its shipped `<main>` padding, section marker, 1px
ink rule, and headline. Phase-10 surfaces insert **within** the Desk Order Ticket (CRYP-01/02 commit /
timelock / reveal states), **below** the Settlement DvP-legs / atomic-stamp / `RoundBrief` (CRYP-03),
and as the **one new view** (VIZ-02, which reuses the standard page frame). Exceptions: none beyond
the irregular literal set above.

---

## Typography

**No new type sizes.** Every Phase-10 element maps to a size already declared in `tailwind.config.ts
fontSize`. Every mono numeral/hash/ciphertext carries `font-variant-numeric: tabular-nums`. Two weights
dominate per comp grammar — **400 (Inter labels/body)** and **600 (mono data + display)** — with **700
confined strictly to the shipped export/parse/download CTA grammar** (`REVEAL ORDER →`, `GENERATE
PROOF →`, `EXPORT PROOF ↓`), inherited from the shipped CTA row, never added here (per the Phase-9
Dimension-4 resolution).

| Role | Family | Size / LH (token) | Weight | Where (Phase 10) |
|------|--------|-------------------|--------|------------------|
| Section / sub-block label | Inter | `10` (10px/1.2, `.14–.16em`, uppercase, opacity .5–.55) | 400 | "Commit · Reveal", "Timelock · Sealed Until Close", "Proof of Correct Clearing", "Time Machine · Per-Party Replay" |
| Guarantee / body prose | Inter | `13` (13px/1.6, opacity .6–.7) | 400 | venue-blind statement, "reveals no losing order", the PoC / off-ledger explainer, forfeit warning |
| Verbatim crypto (hash / salt / ciphertext / proof bytes / public inputs) | IBM Plex Mono | `13` (13px/1.6, `white-space:pre-wrap`, tabular) | 400 | commitment `0x…`, ciphertext hex, proof bytes, verification key, anchor hash |
| Evidence-panel caption | IBM Plex Mono | `11`/`12` (11–12px/1.2–1.4, `.16em`, uppercase, opacity .6) | 600 | `COMMITMENT`, `CIPHERTEXT`, `PROOF`, `PUBLIC INPUTS`, `ANCHOR`, per-party column captions |
| Verdict / status line | IBM Plex Mono | `9` (9px/1, `.16em`, uppercase) | 600 | `COMMITMENT VERIFIED ON-LEDGER`, `PROOF VERIFIED OFF-LEDGER`, `BOND FORFEITED — NO REVEAL BY CLOSE`, `TAMPERED CLEARING → PROOF REJECTED` |
| Provenance / limitation tag | IBM Plex Mono | `9` (9px/1, `.12em`, uppercase, 1px border, `3px 7px` pad) | 600 | ink: `ON-LEDGER`, `TIMELOCK · DRAND QUICKNET`, `ZK PROOF · GROTH16`; red: `OFF-LEDGER VERIFY · POC`, `OFFLINE FALLBACK · WEAKER THAN DRAND`, `RECONSTRUCTED` |
| Timeline stage label | IBM Plex Mono | `9` (9px/1, `.16em`, uppercase) | 600 | OPEN · COMMITTED/TIMELOCKED · SEALED/REVEALED · CLEARED · SETTLED |
| Party column code | IBM Plex Mono | `13` (13px, `.16em`) | 600 | BANK-A · BANK-B · BANK-C · OPERATOR (matches shipped `DeskColumn` code) |
| Drand round # / countdown | IBM Plex Mono | `22` (22px/1) or `18` (18px/1) tabular | 600 | target beacon round number, time-to-beacon countdown |
| Bond / small numeric | IBM Plex Mono | `14` (14px/1) or `18` (18px/1) tabular | 600 | posted USDCx bond amount, proof size / timing metadata |
| §4 revealed-clear numerals | IBM Plex Mono | `44` (desk ticket numeral) / shipped reveal `34`/`120` | 600 | REVEALED order values (desk `44`, shipped) + the shipped `100.00` reveal (unchanged; never re-scaled here) |
| View headline (Time Machine) | Space Grotesk | `54` (54px/.96, `-.02em`) | 700 | the one new view's `<h1>` (matches Desk/Agent/Settlement headline scale) |
| CTA / control label | IBM Plex Mono | `13` (13px, `.14–.16em`, uppercase) | 700 | `COMMIT & POST BOND`, `REVEAL ORDER →`, `GENERATE PROOF →`, `VERIFY PROOF`, `EXPORT PROOF ↓` |

---

## Color

The 60/30/10 split and its Theatre inversion (paper text on the `#0A0A0A` stage) are unchanged. Phase 10
adds **no new token**; it only extends the *reserved-for* lists of the existing accent (lime), signal
(red), semantic order-side (buy/sell), and reuses the redaction stripe.

| Role | Value (token) | Usage |
|------|---------------|-------|
| Dominant (60%) | `#F4F1EA` `paper` | page background, all light surfaces, **ink-evidence-surface text**, Time-Machine paper columns |
| Secondary (30%) | `#0A0A0A` `ink` | all 1px borders (T1 solid + T3 dashed), text, dark CTA fills, **the ink "evidence" surface** (hash/ciphertext/proof panes), positive verdict squares, provenance tags |
| Accent (10%) | `#D6FB3C` `lime` | RESERVED — see list |
| Destructive / signal | `#E2231A` `red` | RESERVED — see list |
| Order side (semantic) | `#2B3AF2` `buy` · `#FF3D9A` `sell` | RESERVED — revealed/settled fill side only (shipped `FillCard` rule) |
| Redaction | `#0A0A0A`/`#262626` stripe (`bg-redact`) + seal-wipe (`bg-redact-wipe`) | **RESERVED — the sealed/timelocked/redacted-cell motif** (see list) |
| Agent flame | `#FF6A1A` `flame` | SOLVER-AGENT-00 identity only — **no new Phase-10 use** |

**Redaction stripe (`bg-redact` / `bg-redact-wipe`) — Phase-10 additions to the reserved list (the core motif reuse):**
- **CRYP-01 COMMITTED / CRYP-02 TIMELOCKED order body** — the would-be order contents render **under the
  `bg-redact` stripe** (the shipped privacy motif) while sealed; only the commitment hash + bond + status
  are legible. The venue-blind timelock stage renders the **operator's** view redacted too.
- **VIZ-02 redacted cells** — any per-party cell that party could NOT see at that stage renders as the
  `bg-redact` stripe (reusing `PrivacyView` / `DeskColumn` exactly).
- **REVEAL** lifts the stripe via `umbra-wipe` (the shipped seal-wipe reveal), exposing the order values.

**Accent (lime `#D6FB3C`) — reserved-for (NO new use added in Phase 10):** the shipped clearing-reveal
only. When the §4 batch REVEALS and clears, the shipped `100.00` lime reveal renders **unchanged**
(Theatre `120` hero / Desk sub-reveal). **No lime is introduced on any commit / timelock / proof
surface** — a passing commitment check and a verified proof are deliberately **ink** (T1/T3 verdict
squares), not lime; lime stays exclusively the uniform-clear signal.

**Signal red (`#E2231A`) — Phase-10 additions to the reserved list (semantic = loss / limitation / rejection):**
- **CRYP-01 bond forfeiture** — the `BOND FORFEITED — NO REVEAL BY CLOSE` verdict + the struck bond amount.
- **CRYP-01 commitment mismatch** — `COMMITMENT MISMATCH — REVEAL REJECTED` on the ink evidence surface.
- **CRYP-02 offline fallback tag** — the red-bordered `OFFLINE FALLBACK · WEAKER THAN DRAND` T3 tag.
- **CRYP-03 off-ledger / PoC tags + tamper-rejection** — the red-bordered `OFF-LEDGER VERIFY · POC` tag
  and the `TAMPERED CLEARING → PROOF REJECTED` verdict square.
- **VIZ-02 `RECONSTRUCTED` tag** — the red-bordered derived-stage tag.

**Semantic order-side (`#2B3AF2` buy · `#FF3D9A` sell):** only on **revealed** fill side / signed qty
(shipped `FillCard` rule). Sealed/committed/timelocked orders show **no side color** — the side is part
of the sealed contents.

**Never** use lime or red for generic affordances. All Phase-10 non-adversarial CTAs (`COMMIT & POST
BOND`, `REVEAL ORDER →`, `GENERATE PROOF →`, `VERIFY PROOF`, `EXPORT PROOF ↓`) are **ink/paper** (dark
fill or the shipped `.umbra-ink-ghost` bordered ghost), matching the shipped SEAL ORDER / DOWNLOAD
PROOF-PACK grammar.

---

## Per-Surface Layout & Composition Contract

Each surface is additive; the shipped host view is otherwise untouched. Two data planes are preserved:
commit / reveal / timelock desk UI runs on the **per-party JSON Ledger API v2 plane** inside the active
desk's own `ctx.DamlLedger` (never an operator token in the browser); CRYP-03 proof generation/verify and
the VIZ-02 event replay run on the **solver operator plane** via `web/src/solver.ts` (`VITE_SOLVER_URL`,
live port :4100). Crypto keys / salts / the Anthropic key stay server-side and never enter responses/logs.

### CRYP-01 + CRYP-02 — Commit · Reveal · Timelock → **02 Desk** (`DeskView.tsx` / `OrderTicket.tsx`)

The shipped Order Ticket gains a **commit-reveal lifecycle** wrapped around the existing seal flow. The
`load demo order` still loads a **plain §4 Limit** and the batch still clears **$100.00**. The lifecycle
is a state machine rendered in-place where the shipped sealed-order card sits (below the qty/limit inputs,
inside the active desk's own ctx). One order per round, one commitment per round — the existing per-round
lock is byte-unchanged.

**Lifecycle states (each is a T1/T2/T3-tagged card per the Provenance Grammar):**

1. **DRAFT → COMMIT.** The shipped ticket (side · qty `44` · limit `44`, plus the Phase-9 order-type
   selector) is unchanged. The single confirm becomes **`COMMIT & POST BOND`** (ink-fill CTA, mono
   `13`/700 `.14em`, padding `~15px 28px`). Its confirmation copy states the bond amount and the forfeit
   consequence (see Copywriting — this is the one new consequential affordance).

2. **COMMITTED** *(T1 — solid ink)* — the order is committed on-ledger, contents sealed:
   - **Commitment pane** (ink evidence surface): caption `COMMITMENT` (mono `11` `.16em` opacity .6) →
     the `hash(order‖salt)` rendered verbatim/middle-truncated `0xab12…9f3c` (mono `13` pre-wrap tabular).
   - **Bond row:** caption `BOND POSTED` → `{n} USDCx` (mono `18` tabular, ink). A neutral ink tag
     `ON-LEDGER` sits top-right.
   - **Sealed contents:** the would-be order values render **under the `bg-redact` stripe** with a mono
     `9` `.16em` opacity .6 caption `CONTENTS SEALED — VISIBLE ONLY TO YOU AT REVEAL`.
   - Self-check note (Inter `13` opacity .7): the desk still sees its own draft; rivals + the venue see
     only the commitment + bond.

3. **TIMELOCKED** *(T2 — solid ink + ink tag `TIMELOCK · DRAND QUICKNET`)* — during the open window the
   payload is timelock-encrypted; **even the operator/solver holds only ciphertext**:
   - **Lock glyph** (a CSS `#0A0A0A` square + a 1px ink shackle stroke — no new asset) beside the caption.
   - **Ciphertext pane** (ink evidence surface): caption `CIPHERTEXT` → the tlock ciphertext hex
     middle-truncated (mono `13` pre-wrap tabular). This is the real drand-backed artifact, shown literally.
   - **Target beacon row:** caption `DRAND ROUND` → the target round number (mono `22` tabular) + a
     `TIME TO BEACON` countdown (mono `18` tabular, `umbra-pulse` on the trailing status square while
     pending). Guarantee caption (Inter `13`): "Undecryptable by anyone — including the venue — until the
     drand beacon publishes at close."
   - **Offline fallback variant** *(T3 — DASHED ink border + red tag `OFFLINE FALLBACK · WEAKER THAN
     DRAND`)*: identical layout, but the dashed border + red tag + a mono `9` sub-line
     `LOCAL KEY RELEASED AT CLOSE — NO THRESHOLD GUARANTEE` mark it unmistakably weaker than the real
     drand path. Prose (Inter `13` opacity .7): "drand unreachable — using a local held-key fallback.
     Weaker than real tlock; for demo continuity only."

4. **REVEALED** *(T1 — solid ink)* — at window close the desk reveals (see CTA below); the ledger
   re-checks the commitment:
   - **`umbra-wipe`** lifts the `bg-redact` stripe (the shipped seal-wipe reveal beat), exposing the order
     values (mono `44`, side-tinted `buy`/`sell` per the shipped rule).
   - **Verdict:** ink square (`6px`) + `COMMITMENT VERIFIED ON-LEDGER` (mono `9` `.16em` ink) — a passing
     check is ink, not red, not lime.
   - **Bond returned** row: `BOND RETURNED · {n} USDCx` (mono `14` tabular, ink).
   - On mismatch (adversarial/demo): red square + `COMMITMENT MISMATCH — REVEAL REJECTED` + the verbatim
     ledger rejection on the ink evidence surface (never summarized — Phase 8 grammar).
   - The §4 batch proceeds to the **shipped** clear/settle; the `100.00` reveal is unchanged.

5. **REVEAL CTA:** when the window closes, a **`REVEAL ORDER →`** ink-fill CTA appears with a
   **reveal-deadline countdown** (mono `18` tabular). It is time-critical but non-destructive (it reclaims
   the bond). Missing it → the FORFEITED state.

6. **FORFEITED** *(loss state — red verdict)* — a desk that fails to reveal by close:
   - red square + `BOND FORFEITED — NO REVEAL BY CLOSE` (mono `9` `.16em` `#E2231A`).
   - the bond amount rendered **struck / red** (mono `18` tabular), caption `BOND SLASHED TO OPERATOR POT`.
   - prose (Inter `13` opacity .7): "You committed but never revealed. The posted bond is forfeited — the
     deterrent against commit-then-vanish that would distort the batch."

### CRYP-03 — Proof of Correct Clearing → **05 Settlement** (`SettlementView.tsx`) — operator plane (:4100)

Canonical home = the Settlement view, as a **post-clear** block inserted **below** the shipped DvP-legs /
atomic-stamp / CTA and the `RoundBrief`, alongside the WOW-05 proof-pack export (it extends the Phase-8
decision-proof story: on-ledger clearing hash → a real ZK proof). A trigger MAY be mirrored on the Agent
view (04, the verify-don't-trust surface) at executor discretion; the panel is specified once here. **It
must be visually distinct from the SOLID-border on-ledger settlement record above it** — the off-ledger
verify surface is DASHED/PoC-tagged per the Provenance Grammar (the same dashed-vs-solid separation
Phase 9 used for simulation-vs-ledger).

- **Block label:** "Proof of Correct Clearing" (Inter `10` uppercase `.16em` opacity .55) + 1px ink rule
  + a persistent red-bordered tag `POC · CRYPTOGRAPHER REVIEW PENDING` (mono `9` `.12em`).
- **Statement (Inter `13`/1.6 opacity .7):** "Proves — over the sealed batch, revealing no losing order —
  that every fill is within its order quantity, buy fills clear ≥ p* and sell fills ≤ p*, and buy volume =
  sell volume = matched volume." (the reduced-but-meaningful CRYP-03 statement, verbatim-honest).
- **GENERATE:** `GENERATE PROOF →` (ink-fill, mono `13`/700). State `GENERATING…` with an `umbra-pulse`
  status square; hidden until `phase === 'cleared' | 'settled'`.
- **Proof artifact pane** *(T2 — solid ink + ink tag `ZK PROOF · GROTH16`)* — ink evidence surface:
  - caption `PUBLIC INPUTS` → the order **commitments** + `p* = 100.00` + `matched = 10` (mono `13`
    pre-wrap tabular; the losing/unmatched orders are **absent** — that absence is the "reveals no losing
    order" property, stated in an adjacent mono `9` note `NO LOSING ORDER IN THE WITNESS`).
  - caption `PROOF` → the proof bytes, middle-truncated (mono `13` pre-wrap tabular) + `SIZE {n}B ·
    {ms}ms` metadata (mono `12`).
- **VERIFY (off-ledger) pane** *(T3 — **DASHED** ink border + red tag `OFF-LEDGER VERIFY · POC`)* — this
  is the honest gap made visual:
  - `VERIFY PROOF` (ink-ghost CTA) runs the off-ledger verifier.
  - passing verdict: **ink** square + `PROOF VERIFIED OFF-LEDGER` (mono `9` `.16em`).
  - limitation prose (Inter `13` opacity .7): "Verified by an off-ledger verifier — **Canton has no
    zk-verifier precompile**, so on-ledger we anchor only the proof hash. On-ledger native verification is
    the production path."
- **On-ledger ANCHOR line** *(T1 — **SOLID** ink, distinct surface)*: caption `ANCHORED ON-LEDGER` →
  the proof / verification-key **hash** committed on-ledger `0x…` (mono `13` tabular) + ink tag
  `ON-LEDGER`. The deliberate solid-vs-dashed contrast between this anchor (T1) and the verify pane (T3)
  **is** the "off-ledger verify + on-ledger hash anchor" statement.
- **Tamper-rejection demo (mirrors Phase-8 Break-the-AI):** a `RUN TAMPERED CLEARING` control (red 1px
  ghost, `.break-ai-force`) → the verifier **rejects** it: red square + `TAMPERED CLEARING → PROOF
  REJECTED` + the verbatim verifier failure on the ink evidence surface. Proves the proof is real, not a
  stub.
- **EXPORT:** `EXPORT PROOF ↓` (`.umbra-ink-ghost`, mono `13`/700 `.14em`) — bundles proof + public inputs
  + anchor into the WOW-05 proof-pack; never red/lime.
- **States:** hidden pre-clear · generating (`umbra-pulse`) · generated (artifact pane) · verified (T3
  verdict + T1 anchor) · rejected (tamper demo) · `offline` → shipped `OFFLINE_CAPTION` governs.

### VIZ-02 — Privacy Time Machine → **NEW view 06** (`TimeMachineView.tsx`) — operator plane (:4100), authentic ledger events

The one new view. It reconstructs **each party's exact view at each round stage** from **authentic JSON
Ledger API v2 events**, reusing `PrivacyView`'s redaction motif + per-party plane. It is appended to the
shipped nav as **`06 · Time Machine`** (shipped nav grammar: mono `11`, active = ink underline); the
shipped 5 views and their nav entries are untouched. (Executor may alternatively mount it as a Privacy
sub-route — the layout contract is identical either way.)

- **Standard page frame:** `<main>` padding `30px 48px 64px`, section marker `06` (mono `13`) + `Time
  Machine · Per-Party Replay` (Inter `11` uppercase `.16em` opacity .55), 1px ink rule, headline `<h1>`
  (Space Grotesk `54`/.96 `-.02em`) — copy: **`REWIND THE BLINDNESS.`**
- **Timeline scrubber** (horizontal, on a 1px ink rail): **five stage nodes** — `OPEN` ·
  `COMMITTED/TIMELOCKED` · `SEALED/REVEALED` · `CLEARED` · `SETTLED` (mono `9` `.16em` labels). Active
  node = ink-filled square (`8px`); inactive = ink-outline. Keyboard-operable (←/→ moves stages; focus =
  ink outline). `marginBottom: 18`.
- **Per-party grid** (four columns, reusing `DeskColumn` grammar, internal 1px ink borders, gap 0, last
  borderless): **BANK-A · BANK-B · BANK-C · OPERATOR** (mono `13` `.16em` code headers). Each column
  renders **what that party could see at the scrubbed stage**:
  - **Visible** cell *(T1)* → the actual contract data (mono `13` tabular) with a neutral ink caption
    `LEDGER EVENT @ {offset}` (authentic ledger event — the privacy story is provable, not staged).
  - **Blinded** cell → the **`bg-redact` stripe** + mono `9` `.16em` opacity .6 caption `NOT VISIBLE`.
  - **Reconstructed/derived** cell *(T3)* → **DASHED** cell border + red tag `RECONSTRUCTED` (only where a
    stage is inferred rather than read from a captured event — honest labeling of any derived stage).
- **The venue-blind beat:** at the `COMMITTED/TIMELOCKED` stage the **OPERATOR** column is **also
  redacted** (only commitment + bond visible, contents under `bg-redact`) — the visual proof that "even
  the venue can't see your order early" (CRYP-02). At `SEALED/REVEALED` the owner column un-redacts (its
  own order), rivals stay redacted; at `CLEARED/SETTLED` each desk sees only its own `TradeConfirmation`,
  the operator sees the aggregate — mirroring the shipped money shot across time.
- **Stage transition:** `umbra-fade` between stages (reduced-motion → instant). No new keyframe.
- **States:** empty (no round captured yet — see Copywriting) · loaded (scrubber + grid) · `offline` →
  shipped `OFFLINE_CAPTION`. Reduced-motion honored.

---

## Copywriting Contract

All new copy in the Umbra register (terse mono uppercase for machine/verdict/tag lines; Inter sentence
case for prose). Verbatim numbers stay on the §4 invariant ($100.00 / A=10 / B=8 / C=2).

| Element | Copy |
|---------|------|
| **Primary CTA (commit)** | COMMIT & POST BOND |
| CRYP-01 sub-label | Commit · Reveal |
| CRYP-01 committed caption | COMMITMENT |
| CRYP-01 bond-posted caption | BOND POSTED |
| CRYP-01 sealed-contents caption | CONTENTS SEALED — VISIBLE ONLY TO YOU AT REVEAL |
| CRYP-01 reveal CTA | REVEAL ORDER → |
| CRYP-01 reveal verdict (match) | COMMITMENT VERIFIED ON-LEDGER |
| CRYP-01 reveal verdict (mismatch) | COMMITMENT MISMATCH — REVEAL REJECTED |
| CRYP-01 bond returned | BOND RETURNED · {n} USDCx |
| **Destructive confirmation (commit)** | COMMIT & POST BOND: "Posts a {n} USDCx bond and seals your order on-ledger. Reveal by close to reclaim it — miss the reveal and the bond is forfeited." |
| CRYP-01 forfeit verdict | BOND FORFEITED — NO REVEAL BY CLOSE |
| CRYP-01 forfeit sub-caption | BOND SLASHED TO OPERATOR POT |
| CRYP-02 sub-label | Timelock · Sealed Until Close |
| CRYP-02 real-drand tag | TIMELOCK · DRAND QUICKNET |
| CRYP-02 ciphertext caption | CIPHERTEXT |
| CRYP-02 drand-round caption / countdown | DRAND ROUND · TIME TO BEACON |
| CRYP-02 guarantee | Undecryptable by anyone — including the venue — until the drand beacon publishes at close. |
| CRYP-02 offline fallback tag | OFFLINE FALLBACK · WEAKER THAN DRAND |
| CRYP-02 offline sub-line | LOCAL KEY RELEASED AT CLOSE — NO THRESHOLD GUARANTEE |
| CRYP-02 offline prose | drand unreachable — using a local held-key fallback. Weaker than real tlock; for demo continuity only. |
| CRYP-03 block label | Proof of Correct Clearing |
| CRYP-03 PoC tag | POC · CRYPTOGRAPHER REVIEW PENDING |
| CRYP-03 statement | Proves — over the sealed batch, revealing no losing order — that every fill is within its order quantity, buy fills clear ≥ p* and sell fills ≤ p*, and buy volume = sell volume = matched volume. |
| CRYP-03 generate CTA / verify CTA | GENERATE PROOF → · VERIFY PROOF |
| CRYP-03 public-inputs / proof captions | PUBLIC INPUTS · PROOF |
| CRYP-03 no-losing-order note | NO LOSING ORDER IN THE WITNESS |
| CRYP-03 proof tag | ZK PROOF · GROTH16 |
| CRYP-03 verify verdict | PROOF VERIFIED OFF-LEDGER |
| CRYP-03 off-ledger tag | OFF-LEDGER VERIFY · POC |
| CRYP-03 off-ledger prose | Verified by an off-ledger verifier — Canton has no zk-verifier precompile, so on-ledger we anchor only the proof hash. On-ledger native verification is the production path. |
| CRYP-03 anchor caption / tag | ANCHORED ON-LEDGER · ON-LEDGER |
| CRYP-03 tamper control / verdict | RUN TAMPERED CLEARING · TAMPERED CLEARING → PROOF REJECTED |
| CRYP-03 export CTA | EXPORT PROOF ↓ |
| VIZ-02 view / section label | Time Machine · Per-Party Replay |
| VIZ-02 headline | REWIND THE BLINDNESS. |
| VIZ-02 stage labels | OPEN · COMMITTED/TIMELOCKED · SEALED/REVEALED · CLEARED · SETTLED |
| VIZ-02 party headers | BANK-A · BANK-B · BANK-C · OPERATOR |
| VIZ-02 visible-cell caption | LEDGER EVENT @ {offset} |
| VIZ-02 blinded-cell caption | NOT VISIBLE |
| VIZ-02 reconstructed tag | RECONSTRUCTED |
| **Empty state heading (VIZ-02)** | No round to replay yet. |
| **Empty state body (VIZ-02)** | Open and run a round — commit, reveal, clear, settle — and each party's exact view at every stage rebuilds here from authentic ledger events. |
| **Error state (drand)** | Timelock network unreachable. Falling back to a clearly-weaker local timelock — the demo continues; the guarantee does not. |
| **Error state (proof)** | Proof couldn't be generated. Check the solver on the configured port and try again. |
| Offline caption (all solver-plane surfaces) | (shipped `OFFLINE_CAPTION` — reflects the live configured port :4100, unchanged) |

**Destructive / irreversible actions:** `COMMIT & POST BOND` is the **one new value-locking action** — it
posts a real USDCx bond that is **forfeited on non-reveal by close**, so it carries the explicit
bond+forfeit confirmation copy above (no separate modal beyond that copy; the bond amount + forfeit
consequence are shown at commit time). `REVEAL ORDER →` is time-critical but **non-destructive** (reclaims
the bond). `RUN TAMPERED CLEARING` is adversarial but **harmless** (the off-ledger verifier rejects it;
nothing settles) — the red `.break-ai-force` ghost + verbatim rejection are the safety signal, no confirm
dialog. `GENERATE PROOF`, `VERIFY PROOF`, `EXPORT PROOF` are non-destructive. The only on-ledger
value-moving settlement action remains the shipped `SETTLE ATOMICALLY` (confirmation via the atomic stamp,
per 06-UI-SPEC).

---

## Motion Contract

**No new keyframes.** Reuse only the shipped aliases:
- `umbra-wipe` — the **REVEAL** beat (lifts the `bg-redact` seal stripe off the order contents; this is
  literally the shipped seal-wipe reveal).
- `umbra-pulse` — any in-flight status square (TIMELOCKED pending / countdown, GENERATING proof).
- `umbra-rise` — commit/reveal/proof card + Time-Machine grid mount.
- `umbra-fade` — Time-Machine stage transitions.
- `umbra-slam` — the shipped §4 `100.00` reveal, **unchanged** (never re-scaled or re-homed here).

Every motion honors `prefers-reduced-motion: reduce` → collapse to instant, consistent with the shipped
views (hashes, ciphertext, proof bytes, bond amounts, and the per-party grid are static content and are
unaffected by motion prefs). The three-desk → one-price → atomic-settle beats and the money-shot reveal
are untouched; all new motion is subordinate and never competes with the reveal or the simultaneous settle.

---

## Accessibility, States & Responsive

- **Contrast:** ink `#0A0A0A` on paper `#F4F1EA` ≈ 19:1; paper on the ink evidence surface (inverted) is
  the shipped high-contrast pane. Red `#E2231A` `9px` verdicts inherit the shipped comp-line-131 grammar
  (already in use P8/P9). Redaction stripe cells are decorative (`aria-hidden`) — the sealed/blinded state
  is conveyed by adjacent text (`CONTENTS SEALED` / `NOT VISIBLE`), never by color/stripe alone.
- **Truncated crypto:** every middle-truncated `0x…` value carries the full string in `title` +
  `aria-label` (and an optional inline expand) so the artifact is never lossy to a reader or screen reader.
- **Provenance is textual, not just visual:** the solid-vs-dashed border distinction is always
  accompanied by a text tag (`ON-LEDGER` / `OFF-LEDGER VERIFY · POC` / `RECONSTRUCTED`), so honesty does
  not depend on perceiving border style or color.
- **Time-Machine scrubber:** keyboard-operable (←/→ across stages, `Home`/`End` to ends), each stage node
  a focusable control with an ink focus outline and an accessible name (`Stage: SEALED/REVEALED`).
- **States per surface:** empty · loading (`umbra-pulse`) · loaded · error · offline are all specified
  above; every solver-plane surface degrades to the shipped `OFFLINE_CAPTION` when the service is down.
- **Responsive:** the Time-Machine 4-column grid collapses to a stacked single column below the shipped
  view breakpoint (party header → cell), preserving the redaction/visible/reconstructed treatment; the
  scrubber stays horizontal and scrolls if needed. Desk commit/timelock/reveal cards and the CRYP-03 panel
  reflow within their shipped host columns (no fixed widths beyond the shipped `<main>` frame).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| (none) | — | not applicable — no shadcn, no third-party registries; all UI is hand-authored React/SVG against the binding comp. Crypto libraries (`tlock-js`, circom/snarkjs) are **solver-side / build-side only** and produce no UI component code — nothing enters the frontend registry surface. |

---

## Component Inventory — Reuse vs New

| Component | Status | Notes |
|-----------|--------|-------|
| `PrivacyView`, `DeskView`/`OrderTicket`, `TheatreView`, `AgentView`, `SettlementView` | **Extend, do not redesign** | Phase-10 states/panels compose in; shipped layout / reveal / simultaneous-settle beats untouched |
| Commit/Timelock/Reveal lifecycle in `OrderTicket` (CRYP-01/02) | **NEW (in-place)** | 02 — COMMIT & POST BOND → COMMITTED (T1) → TIMELOCKED (T2 drand / T3 offline) → REVEALED (T1) / FORFEITED; `load demo` stays plain §4 Limit; §4 still clears 100.00 |
| `ProofOfClearingPanel` (CRYP-03) | **NEW** | 05 — post-clear; T2 proof artifact + T3 off-ledger verify + T1 on-ledger anchor + tamper-reject; `EXPORT PROOF ↓`; distinct from the SOLID on-ledger settlement record above |
| `TimeMachineView` (VIZ-02) | **NEW — the one new view (06)** | timeline scrubber × 4 party columns; authentic ledger events; reuses `DeskColumn`/`bg-redact` per-party plane; venue-blind at the timelocked stage |
| Ink "evidence" surface | **Reuse pattern** | `#0A0A0A`/`#F4F1EA`, IBM Plex Mono `13` pre-wrap tabular, padding `22px 24px` — hashes/ciphertext/proof rendered literally (Phase 8) |
| Red-square / ink-square verdict row | **Reuse pattern** | comp line 131 grammar — ink square = pass (`COMMITMENT VERIFIED`), red square = loss/reject (`BOND FORFEITED`, `PROOF REJECTED`) |
| Dashed-vs-solid border separation | **Reuse pattern** | Phase 9 simulation-vs-ledger → Phase 10 off-ledger/PoC-vs-on-ledger (Provenance Grammar) |
| Provenance / limitation tag | **Reuse pattern** | mono `9` `.12em` 1px-bordered tag (comp `SELECTED` grammar) — ink neutral / red limitation |
| `bg-redact` / `bg-redact-wipe` stripe | **Reuse token** | sealed / timelocked / blinded-cell motif + the `umbra-wipe` reveal |
| `.umbra-ink-ghost` / `.break-ai-force` | **Reuse class** | `EXPORT PROOF ↓` ink-ghost; `RUN TAMPERED CLEARING` red-ghost (existing index.css classes) |
| `DeskColumn` per-party plane | **Reuse pattern** | VIZ-02 four-column grid inherits its border/gap/redaction grammar |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
