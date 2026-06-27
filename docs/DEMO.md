# Umbra — 3-Minute Demo Script

> Umbra is a private, **sealed-bid uniform-price batch auction** for a tokenized bond,
> settled **atomically (DvP)** on Canton, with a **Claude AI agent as the solver**. The
> whole pitch is one sentence made real: **three desks bid blind → an AI clears them at
> one price → the batch settles in a single atomic transaction, each desk seeing only its
> own fill.** The canonical §4 fixture clears at exactly **$100.00**.

**Setup (one line):** `make demo` (macOS/Linux) or the 4-terminal flow in the
[README](../README.md) — `daml start` (:7575) · `node scripts/mint-tokens.mjs` ·
`cd solver && npm run dev` (:4000) · `cd web && npm run dev` (:5173). Open
`http://localhost:5173`.

---

## 0:00 — The hook (15s)
> "Two trading desks want to trade the same bond. Today, whoever shows their hand first
> loses — the order book leaks intent. Umbra is a sealed-bid batch auction where **nobody
> sees anyone else's order**, an **AI computes the fair clearing price**, and the trade
> **settles atomically** — all on Canton."

## 0:15 — 01 Privacy · "Everyone's blind. That's the point." (45s)
Open **01 Privacy**. Three desks — **BLUEROCK**, **MERIDIAN**, **HALWARD** — submit into one
batch. Use the desk switcher (top bar) to show it's **BLUEROCK's** own browser session:
- BLUEROCK sees **its own** ticket in full: **BUY 10 BONDX, limit ≤ 101.0**, holdings 0 / 5000.
- MERIDIAN and HALWARD are **REDACTED — not visible to you**.
- The venue itself sees only a **count: 03 sealed orders** — never contents.

> "This isn't redaction in the UI — it's enforced at the wire. Each desk authenticates with
> **its own JSON-API token**, so it's structurally impossible to fetch a rival's order.
> (`node scripts/verify-privacy.mjs` proves it: each desk's query returns only its own order,
> zero rivals.)"

*Screenshot: [`01-privacy-3up.svg`](./01-privacy-3up.svg).*

## 1:00 — 03 Theatre · Close & Solve → the reveal (45s)
Open **03 Theatre** (the Operator view). A 60-second window counts down; the venue shows
**3 sealed orders**. Hit **CLOSE & SOLVE**:
- The **Solver Agent** computes — then the uniform clearing price **slams in: `100.00`**.
- The hand-rolled **supply × demand** chart marks **p\*** where matched volume peaks —
  **MATCHED 10 @ 100.00**.

> "The AI proposes the price and writes the rationale — but **its numbers are never trusted
> blind**. A deterministic §8 algorithm recomputes the clear, and the on-ledger `Round.Clear`
> choice re-verifies it again. Verify-don't-trust: the AI is on the narration path, never the
> settlement path. (Run keyless and it gracefully degrades to the deterministic result + a
> neutral rationale — the price is still 100.00.)"

## 1:45 — 04 Agent · the rationale + the badge (20s)
Open **04 Agent**: SOLVER-AGENT-00's proposal — Clearing **100.00**, Matched **10 units**,
per-desk fills **BLUEROCK +10 · MERIDIAN −8 · HALWARD −2** — with a **VERIFIED** badge
(`CLAUDE` when keyed, `DETERMINISTIC` when not) and the typewriter rationale.

## 2:05 — 05 Settlement · "One transaction. All or nothing." (45s)
Open **05 Settlement**. Two **DvP legs** are staged:
- **MERIDIAN 8 BONDX → BLUEROCK ← 800 USDCx**
- **HALWARD 2 BONDX → BLUEROCK ← 200 USDCx**

Hit **SETTLE ATOMICALLY**: every leg and every balance snaps **simultaneously** (one rAF
clock) — because atomic *means* simultaneous. The **1 TRANSACTION · ATOMIC** stamp lands.
Before → after balances finalize at the §4 numbers:

| Desk | BONDX | USDCx |
|------|------:|------:|
| BLUEROCK | 0 → **10** | 5000 → **4000** |
| MERIDIAN | 20 → **12** | 1000 → **1800** |
| HALWARD | 15 → **13** | 1000 → **1200** |

> "One Canton transaction. If any single leg can't settle, the whole thing reverts — no
> half-trades. And a second settle returns **409**: it already happened, atomically."

*Screenshot: [`02-atomic-settlement.svg`](./02-atomic-settlement.svg).*

## 2:50 — The close (10s)
> "Sealed-bid privacy, an AI solver you can verify, and atomic delivery-versus-payment —
> the three things institutional trading needs and a public order book can't give. That's
> Umbra."

---

## The numbers to call out (the §4 fixture — the single correctness reference)
- Clears at **$100.00**, **matched 10**.
- Fills: **BLUEROCK +10 · MERIDIAN −8 · HALWARD −2** (HALWARD's 5-lot is partially filled; 3 residual).
- DvP legs: **A↔B 8 @ 100** · **A↔C 2 @ 100**.
- Final balances: **BLUEROCK 10 / 4000 · MERIDIAN 12 / 1800 · HALWARD 13 / 1200**.

## Talking points (the three pillars)
1. **Privacy at the wire** — per-party JSON-API tokens; a desk *structurally* cannot read a
   rival's order, fill, or holdings. Not UI redaction — credential isolation.
2. **AI solver, verify-don't-trust** — Claude proposes the clear + rationale; the deterministic
   §8 core and the on-ledger `Round.Clear` re-verification are the source of truth. The AI is
   never on the settlement path; the operator token + Anthropic key never reach the browser.
3. **Atomic DvP** — the whole batch reassigns bond + cash and issues per-desk confirmations in
   **one** Canton transaction. All-or-nothing.
