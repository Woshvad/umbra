# Umbra

A private, **sealed-bid uniform-price batch-auction venue** for tokenized
securities, settled **atomically (DvP)** on **Canton**, with a **Claude AI agent
acting as the auction solver**.

Institutions (trading desks) submit sealed limit orders for a tokenized bond
during a short window — blind to one another. When the window closes, the AI
solver computes the single uniform clearing price that maximizes matched volume,
and the whole batch settles delivery-versus-payment in one transaction. The
canonical §4 fixture clears at exactly **$100.00**.

> Built for the Encode Club / HackCanton hackathon (Track 1 — Private DeFi &
> Capital Markets).

## Tech stack (locked)

Daml SDK **2.10.4** + Canton sandbox (ledger) · React 18 + TypeScript + Vite +
Tailwind (frontend) · Node 20 + TypeScript (solver service) · `@anthropic-ai/sdk`.
The version gate (Daml 2.x HTTP JSON API line, **not** 3.x / cn-quickstart) is
recorded in [`DECISIONS.md`](./DECISIONS.md).

## Repo layout

```
daml/          # Daml package (templates, Setup, Tests) — daml.yaml pins SDK 2.10.4
solver/        # AI solver HTTP service (stubbed; built in Phase 5)
web/           # React + Vite frontend (stubbed; built in Phase 3)
scripts/       # dev tooling (parties.json export helper, etc.)
DECISIONS.md   # version-gate + locked decisions
.env.example   # config template (spec §15) — copy to .env (gitignored)
spec.md        # authoritative spec
Umbra design/  # binding design comp (pixel-accurate frontend source of truth)
```

## Prerequisites

- **Daml SDK 2.10.4** — verify with `daml version` (must report `2.10.4`).
- **JDK 17+** — required by the Canton sandbox JVM (JDK 21 is fine).
- **Node 20+** and **npm** — only needed for the downstream frontend/solver
  (Phases 3+), not for the Daml build.

> `make` is **not** required and is not used yet — run the direct `daml` / `node`
> commands below. (A `Makefile` arrives in Phase 7.)

## Build

```bash
cd daml
daml build      # compiles the Daml package to .daml/dist/umbra-0.1.0.dar
```

## Run the sandbox + JSON API

```bash
cd daml
daml start      # builds, boots the Canton sandbox, runs the init-script,
                # then serves the HTTP JSON API on http://localhost:7575
```

First boot is JVM-heavy (~20–40s) and may trigger a Windows Defender firewall
prompt for the localhost JVM ports — allow it (localhost only).

**Hot reload:** while `daml start` is running, press **`r` then `Enter`** (the
`Enter` is required on Windows) to rebuild + re-seed.

## Configuration

```bash
cp .env.example .env   # then fill ANTHROPIC_API_KEY (solver only; never commit .env)
```

See `.env.example` for the full key list (spec §15). `ANTHROPIC_API_KEY` is read
**only** by `solver/` and must never reach the frontend or git history.

## Party IDs (`parties.json`)

The Canton sandbox is ephemeral — party IDs come back as `hint::<fingerprint>`
and change on every `daml start`. They are captured to `parties.json` (gitignored)
at allocation time; the export mechanism is finalized in Plan 03.

## Tests

```bash
cd daml
daml test       # runs the Daml Script tests in Umbra/Tests.daml (added in Plan 03)
```
