# Umbra

A private, **sealed-bid uniform-price batch-auction venue** for tokenized
securities, settled **atomically (DvP)** on **Canton**, with a **Claude AI agent
acting as the auction solver**. Institutions (trading desks) submit sealed limit
orders for a tokenized bond during a short window — blind to one another. When the
window closes, the AI solver computes the single uniform clearing price that
maximizes matched volume, and the whole batch settles delivery-versus-payment in
one transaction, each desk seeing only its own fill. The canonical §4 fixture
clears at exactly **$100.00**.

> Built for the Encode Club / HackCanton hackathon (Track 1 — Private DeFi &
> Capital Markets).

## Architecture — two data planes

Umbra has **two distinct data planes**, and keeping them separate is the privacy
guarantee:

1. **Desk plane (privacy at the wire).** Each trading desk talks to the Canton
   **HTTP JSON API on :7575** as **its own party**, holding only its own desk
   token. The ledger enforces stakeholder visibility, so a desk's `/v1/query`
   returns **only its own** `Order` / `TradeConfirmation` — rival orders are never
   on the wire to the browser. This is structural privacy, proven at the API
   boundary (see `scripts/verify-privacy.mjs`), not a render-time filter.

2. **Operator plane (off the browser).** The clearing/settlement authority runs
   through the **solver service on :4000**, never the browser. The operator token
   lives only in `scripts/.operator-token`; the browser never holds it.

**AI is OFF the critical path (verify-don't-trust).** The Claude agent proposes a
clearing price + allocation, but its numbers are never used unverified. The
deterministic §8 clearing core recomputes the result, and the on-ledger
`Round.Clear` choice re-verifies the allocation before settlement — those are the
source of truth. The **`ANTHROPIC_API_KEY` lives only in `solver/`** and never
reaches the frontend or git history.

## Tech stack (locked)

Daml SDK **2.10.4** + Canton sandbox (ledger) · React 18 + TypeScript + Vite +
Tailwind (frontend) · Node 20 + TypeScript (solver service) · `@anthropic-ai/sdk`.
The version gate (Daml 2.x HTTP JSON API line, **not** 3.x / cn-quickstart) is
recorded in [`DECISIONS.md`](./DECISIONS.md).

## Repo layout

```
daml/          # Daml package (templates, Setup, Tests) — daml.yaml pins SDK 2.10.4
solver/        # AI solver HTTP service on :4000 (built) — Anthropic key lives here only
web/           # React + Vite frontend on :5173 (built) — the five-view UI / privacy money shot
scripts/       # dev tooling: mint-tokens.mjs, verify-privacy.mjs, parties.json export
docs/          # pitch screenshots + DEMO.md (the 3-minute demo script)
DECISIONS.md   # version-gate + locked decisions
.env.example   # config template (spec §15) — copy to .env (gitignored)
spec.md        # authoritative spec
Umbra design/  # binding design comp (pixel-accurate frontend source of truth)
```

## Prerequisites

- **Daml SDK 2.10.4** — verify with `daml version` (must report `2.10.4`).
- **JDK 17+** — required by the Canton sandbox JVM (JDK 21 is fine).
- **Node 20+** and **npm** — for the frontend (`web/`) and solver (`solver/`).

Install the JS dependencies once:

```bash
make install        # web (--legacy-peer-deps) + solver
# Windows / no make:
npm run install:all
```

> `web/` installs with `--legacy-peer-deps` because `@daml/react@2.10.4` declares
> a React 16/17 peer range; React 18 works at runtime (see `DECISIONS.md`).

## Quick start

**macOS/Linux one-liner** — print the canonical flow:

```bash
make demo
```

`make demo` prints the always-works 4-terminal flow (it does not background a JVM
boot — see below). The **manual 4-terminal flow is the canonical, always-works,
cross-platform path**. Windows users (no `make`) use it directly or the root
`npm run <target>` scripts.

### The manual 4-terminal flow (canonical)

Hard ordering: the ledger must be up (it exports `parties.json`) **before** tokens
are minted, and tokens must exist before the solver/web start.

```bash
# Terminal 1 — ledger: boots Canton sandbox + JSON API :7575, seeds the §4 round,
#              exports daml/parties.json. Wait for ":7575" + daml/parties.json.
cd daml && daml start

# Terminal 2 — tokens: needs parties.json from Terminal 1. Writes desk tokens to
#              web/src/tokens.json + the operator token to scripts/.operator-token.
node scripts/mint-tokens.mjs            # or: npm run tokens

# Terminal 3 — solver: Express :4000 (reads scripts/.operator-token).
cd solver && npm run dev                # or: npm run solver

# Terminal 4 — web: Vite :5173 (proxies /v1 -> :7575).
cd web && npm run dev                   # or: npm run web
```

Then open **http://localhost:5173** → the 3-up Privacy view → clear at **$100.00**
→ atomic settle.

## Per-service commands & ports

| Target | Command | Port | Does |
|--------|---------|------|------|
| `ledger` | `cd daml && daml start` | **7575** | Boots Canton sandbox + HTTP JSON API, seeds the §4 round, exports `parties.json`. Long-running. |
| `tokens` | `node scripts/mint-tokens.mjs` | — | Mints per-party dev JWTs. Desk tokens → `web/src/tokens.json`; operator → `scripts/.operator-token`. Needs `parties.json`. |
| `solver` | `cd solver && npm run dev` | **4000** | The AI solver HTTP service (`/round`, `/solve-preview`, `/settle`). |
| `web` | `cd web && npm run dev` | **5173** | The Vite frontend; proxies `/v1` → :7575. |
| `test` | `cd daml && daml test` | — | The Daml Script tests (self-contained — no `daml start` needed). |
| `verify-privacy` | `node scripts/verify-privacy.mjs` | — | Live per-party `/v1/query` wire check. Needs the ledger up + tokens minted. |
| `clean` | — | — | Removes per-boot ephemera (`daml/parties.json`, `web/src/tokens.json`, `scripts/.operator-token`) + `daml/.daml/dist`. Keeps `node_modules`. |

Each `make <target>` is mirrored as `npm run <target>` for Windows.

## The §4 / $100.00 reference

The canonical §4 fixture is the **continuous correctness reference**: it clears at
exactly **$100.00**, with fills **A = 10 · B = 8 · C = 2**, and final balances
**A: 10 / 4000 · B: 12 / 1800 · C: 13 / 1200** (units / cash). If a change moves
the clearing price off $100.00 or these fills/finals, something regressed.

## Tests

```bash
# Daml Script gate (DEMO-02): six scripts — clears-at-100, settled-balances,
# atomicity, order-privacy, confirmation-privacy, clear-rejects-bad-allocation.
cd daml && daml test

# Frontend: type-check/build + the deterministic §8 clearing unit tests.
cd web && npm run build
cd web && npx vitest run src/lib

# Solver: unit tests for the parse/verify path.
cd solver && npm test

# Live wire-level privacy check (needs the ledger up + tokens minted):
node scripts/verify-privacy.mjs
```

## Configuration

```bash
cp .env.example .env   # then fill ANTHROPIC_API_KEY (solver only; never commit .env)
```

See `.env.example` for the full key list (spec §15). **`ANTHROPIC_API_KEY` is read
only by `solver/`** and must never reach the frontend or git history.

**Secret/token boundary (gitignored — never committed):**

- `web/src/tokens.json` — the **three desk tokens only** (bankA/bankB/bankC) + the
  JSON API URL. Never the operator token, never the Anthropic key.
- `scripts/.operator-token` — the **operator token only** (CLI / solver / live
  verify). Never imported under `web/src`.
- `.env` — `ANTHROPIC_API_KEY` (solver only).

All three stay gitignored. The `make clean` target removes the first two (plus
`daml/parties.json`); they are re-created on the next boot/mint.

## Party IDs (`parties.json`)

The Canton sandbox is ephemeral — party IDs come back as `hint::<fingerprint>`
and change on every `daml start`. They are captured to `parties.json` (gitignored,
never committed) at allocation time as `{ operator, bankA, bankB, bankC }`.

**Option B (automatic, default):** `daml/daml.yaml` carries

```yaml
script-options:
  - --output-file
  - parties.json
```

so `daml start` writes the init-script's return value (the `Parties` record) to
`parties.json` on each boot — no extra step.

**Option A (explicit / guaranteed):** run the export script directly against a
booted sandbox (use this if the Option-B write lands somewhere unexpected):

```bash
cd daml
daml script \
  --dar .daml/dist/umbra-0.1.0.dar \
  --script-name Umbra.Setup:exportParties \
  --ledger-host localhost --ledger-port <sandboxLedgerApiPort> \
  --output-file ../parties.json
```

For a quick local capture without a separate sandbox, run it against the
in-process simulated ledger (writes the readable hint IDs):

```bash
cd daml
daml script --dar .daml/dist/umbra-0.1.0.dar \
  --script-name Umbra.Setup:exportParties --ide-ledger \
  --output-file ../parties.json
```

## Notes

First `daml start` boot is JVM-heavy (~20–40s) and may trigger a Windows Defender
firewall prompt for the localhost JVM ports — allow it (localhost only).

**Hot reload:** while `daml start` is running, press **`r` then `Enter`** (the
`Enter` is required on Windows) to rebuild + re-seed.

## Links

- [`spec.md`](./spec.md) — the authoritative spec (every product/technical decision is locked here).
- [`DECISIONS.md`](./DECISIONS.md) — the Daml 2.x version gate + locked decisions.
- [`docs/DEMO.md`](./docs/DEMO.md) — the 3-minute demo script (created in the acceptance pass).
