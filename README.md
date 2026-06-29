# Umbra

A private, **sealed-bid uniform-price batch-auction venue** for tokenized
securities, settled **atomically (DvP)** on **real multi-node Canton**, with a
**Claude AI agent acting as the auction solver**. Trading desks submit sealed limit
orders for a tokenized bond during a short window — blind to one another. When the
window closes, the AI solver computes the single uniform clearing price that
maximizes matched volume, the deterministic core verifies it, and the whole batch
settles delivery-versus-payment in one transaction — each desk seeing only its own
fill. The canonical §4 fixture clears at exactly **$100.00**.

> Built for the Encode Club / HackCanton hackathon (Track 1 — Private DeFi &
> Capital Markets). Runs on a real Canton Network LocalNet (Daml 3.4, Canton 3.4.8),
> not a sandbox.

## The money shot (verified end-to-end on real Canton)

1. **Privacy** — three desks submit sealed orders; each desk, using its own JWT,
   sees **only its own** `Order` on the ledger. Rivals are redacted not by a UI
   filter but because the ledger never discloses them (`Order` signatory =
   operator + desk, no observer).
2. **AI clearing** — the Claude solver proposes a clearing price + allocation; the
   deterministic §8 core re-derives it and the on-ledger `Round.Clear` re-verifies
   it. The result carries `{ verified: true, source: "claude" }` only when the AI's
   numbers match the deterministic result exactly.
3. **Atomic settle** — `Round.Clear` settles DvP in one Canton transaction to the
   exact §4 balances (**A: 10 / 4000 · B: 12 / 1800 · C: 13 / 1200**), conserving
   35 BONDX / 7000 USDCx. Each desk gets a private `TradeConfirmation`.

**True cross-node privacy (§19).** The three desks can be hosted on **three
different participant nodes** (`bankA` → app-user, `bankB` → sv, `bankC` →
app-provider). An order then physically lives only on its own desk's node — a
two-participant Canton transaction, partitioned at the node level, not just by
token. The browser routes each desk to its own node. See `--xnode` below.

## Architecture — two data planes

Keeping the two planes separate is the privacy guarantee:

1. **Desk plane (privacy at the wire).** Each desk talks to the **Canton JSON
   Ledger API v2** as **its own party**, holding only its own desk token. The
   ledger enforces stakeholder visibility, so a desk's `/v2/state/active-contracts`
   returns **only its own** contracts. Structural privacy, proven at the API
   boundary (`scripts/localnet/seed.mjs`), not a render-time filter.
2. **Operator plane (off the browser).** Clearing/settlement authority runs through
   the **solver service** (Node/Express), never the browser. The operator token
   lives only in `scripts/.operator-token`; the browser never holds it.

**AI is OFF the critical path (verify-don't-trust).** The Claude agent proposes;
the deterministic §8 core + the on-ledger `Round.Clear` re-verification are the
source of truth. The AI's numbers are never settled unverified. The
**`ANTHROPIC_API_KEY` lives only in `solver/`** and never reaches the frontend or
git history.

## Tech stack

Daml **3.4.11** + **Canton 3.4.8 LocalNet** (cn-quickstart) · **JSON Ledger API
v2** · React 18 + TypeScript + Vite + Tailwind (frontend) · Node 20 + TypeScript
(solver) · `@anthropic-ai/sdk` (Claude `claude-haiku-4-5`). The migration from the
original Daml 2.10.4 `daml start` sandbox to real Canton is recorded in
[`DECISIONS.md`](./DECISIONS.md) (D8–D11). The 2.x sandbox build is preserved at git
tag **`sandbox-mvp`**.

## Quick start (one command)

**Prerequisites:** Docker Desktop · Node 20+ · the Daml SDK 3.4.11 (`daml version`,
to build the DAR) · the **cn-quickstart** LocalNet checked out (default
`C:\Users\woshv\Desktop\cn-quickstart`, override with `CN_QUICKSTART_DIR`).

```bash
node scripts/localnet/up.mjs            # single-node desks
node scripts/localnet/up.mjs --xnode    # §19: desks on three separate nodes
```

`up.mjs` is idempotent and sleep/restart-safe: it boots the Canton LocalNet
(health-gated), vets the DAR on all three participants (building it if missing),
provisions parties/users/tokens, seeds the §4 Round R1, and launches the solver +
web — then prints **http://localhost:5173**. Ledger state persists in the Docker
volume, so after a laptop sleep just re-run it (it skips the re-seed). Stop with:

```bash
node scripts/localnet/down.mjs          # stop solver + web (LocalNet kept)
node scripts/localnet/down.mjs --localnet   # also stop the LocalNet (state kept)
node scripts/localnet/down.mjs --wipe       # stop + delete all ledger state
```

> The solver runs on **:4100** (not :4000) because the dev box's separate `augur`
> project owns :4000; `web/.env` sets `VITE_SOLVER_URL` to match.

## Ports

| Service | Port | What |
|--------|------|------|
| Canton JSON Ledger API v2 — app-provider (operator's node) | **3975** | the participant the solver + bankC talk to |
| Canton JSON Ledger API v2 — app-user | **2975** | bankA's node in `--xnode` mode |
| Canton JSON Ledger API v2 — sv | **4975** | bankB's node in `--xnode` mode |
| Solver HTTP service | **4100** | `/round`, `/solve-preview`, `/settle`, `/close` |
| Vite frontend | **5173** | the five-view UI / privacy money shot |
| Swagger UI (v2 API explorer) | **9090** | browse the live JSON Ledger API |

## LocalNet tooling (`scripts/localnet/`)

| Script | Does |
|--------|------|
| `up.mjs` / `down.mjs` | one-command bring-up / teardown (above) |
| `mint-jwt.mjs` | mint an unsafe-dev HS256 token (`{sub,aud}` over secret `unsafe`) |
| `deploy.mjs` | upload the DAR to all participants + allocate parties/users/rights + write tokens |
| `seed.mjs` | seed the canonical §4 Round R1 (single-node) + prove per-desk privacy |
| `xnode-up.mjs` | distribute desks across nodes + write per-desk config + seed R1 cross-node |
| `verify-settlement.mjs` | assert on-ledger §4 balances, conservation, confirmation privacy |
| `verify-live-flow.mjs` | bulletproof the browser paths: live submit + close→settle |
| `xnode-moneyshot.mjs` | headless proof of the full §4 flow across three nodes |
| `smoke.mjs` | create + read a Venue (templates live on Canton) |

## The §4 / $100.00 reference

The canonical §4 fixture is the **continuous correctness reference**: it clears at
exactly **$100.00**, fills **A = 10 · B = 8 · C = 2**, finals **A: 10 / 4000 · B: 12
/ 1800 · C: 13 / 1200** (units / cash), conserving 35 BONDX / 7000 USDCx. If a change
moves any of these, something regressed.

## What's real (honest accounting)

- **Ledger:** a real Canton Network LocalNet — 3 participant nodes + a global
  synchronizer + Splice super-validator (not a sandbox). Templates deployed as a
  vetted DAR; contracts created/settled via the JSON Ledger API v2.
- **Privacy:** ledger-enforced per-token, proven at both the **party** level
  (single-node) and the **participant** level (`--xnode`).
- **AI solver:** a real Claude call, gated by deterministic re-verification
  (`verified:true / source:"claude"`); keyless or on error it degrades to the
  deterministic clearing (still clears at $100.00).
- **Settlement:** real atomic DvP `Round.Clear` on Canton.

## Tests

```bash
# Daml model (3.4.11): clears-at-100, settled-balances, atomicity, privacy, reject-bad
cd daml && daml build && daml test          # via Git Bash (daml is on the Bash PATH)

# Solver: 36 unit tests (deterministic §8 + v2 client + API + agent verify gate)
cd solver && npm test

# Frontend: typecheck + production build
cd web && npm run build

# Live, on real Canton (after `up.mjs`):
node scripts/localnet/verify-settlement.mjs   # §4 balances + privacy
node scripts/localnet/verify-live-flow.mjs    # live submit + close→settle
node scripts/localnet/xnode-moneyshot.mjs     # full §4 flow across three nodes
```

## Configuration & secrets boundary

```bash
cp solver/.env.example solver/.env   # then fill ANTHROPIC_API_KEY (solver only)
```

Gitignored, **never committed**:

- `solver/.env` — `ANTHROPIC_API_KEY` (read only by `solver/src/agent.ts`).
- `web/src/tokens.json` — the **three desk tokens only** (+ per-desk node `base`).
  Never the operator token, never the Anthropic key.
- `scripts/.operator-token` — the **operator token only** (solver / CLI).
- `daml/parties.json` — per-deploy party IDs.
- `web/.env` — local `VITE_SOLVER_URL` override (:4100 on this box).

## Repo layout

```
daml/              # Daml package (templates + Setup/Tests) — daml.yaml pins SDK 3.4.11
solver/            # AI solver HTTP service (Node/Express) — JSON Ledger API v2 client
web/               # React + Vite frontend — five-view UI; per-desk v2 routing shim
scripts/localnet/  # Canton LocalNet tooling (up/down/deploy/seed/xnode/verify/…)
DECISIONS.md       # locked decisions (D1–D7 = 2.x MVP; D8–D11 = Canton/v2 migration)
spec.md            # the authoritative spec
Umbra design/      # binding design comp (pixel-accurate frontend source of truth)
docs/              # pitch diagrams + DEMO.md + LIVE-EVIDENCE.md
```

## Links

- [`spec.md`](./spec.md) — the authoritative spec.
- [`DECISIONS.md`](./DECISIONS.md) — locked decisions, incl. the Canton/v2 migration.
- [`docs/DEMO.md`](./docs/DEMO.md) — the demo script.
