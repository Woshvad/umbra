# Umbra — Decisions Log

This file is the authoritative record of locked build decisions. The **version
gate (LEDG-04)** below is the spec's #1 risk and was resolved *before* any Daml
template work, so every later layer (codegen package versions, JSON API request
shapes, JWT token format) is built against a known, pinned SDK.

---

## D1 — Daml SDK version gate (LEDG-04) — RESOLVED

**Decision:** Pin **Daml SDK `2.10.4`** for the entire build.

**Detected version** (`daml version` on this machine, 2026-06-25):

```
SDK versions:
  2.10.4  (default SDK version for new projects)
  3.4.11  (latest release, not installed)
```

`2.10.4` is present and resolvable as the default; it is pinned via
`sdk-version: 2.10.4` in `daml/daml.yaml`, which forces exactly this SDK for
every project command.

**Toolchain location caveat (this machine):** the SDK lives at
`%APPDATA%\daml` (`C:\Users\woshv\AppData\Roaming\daml`). `%APPDATA%\daml\bin`
is **NOT** on the system PATH; a shim at `~/bin/daml` provides access
(`which daml` → `/c/Users/woshv/bin/daml`). `daml build` is verified working
on this machine. Do not run `daml install` — the SDK is already installed.

---

## D2 — API line: Daml 2.x HTTP JSON API on :7575 (NOT 3.x / cn-quickstart)

**Decision:** Build against the **Daml 2.x HTTP JSON API** served on port
**:7575** by `daml start`. This is the line the JS bindings target:
`@daml/react` / `@daml/ledger` / `@daml/types` at **`2.10.4`** (all three pinned
identical, matched to the generating SDK).

**Explicitly NOT** the Daml 3.x / Canton 3.x **JSON Ledger API v2** +
`cn-quickstart` LocalNet line — that has different request/response shapes,
`@daml/react` is not its canonical client, and it is multi-GB Docker. It is a
**stretch goal (spec §19)** only, attempted (if at all) after the app works
locally, never mid-hackathon.

---

## D3 — React-18 peer-dependency note (frontend, Phase 3)

`@daml/react@2.10.4` declares `peerDependencies: { "react": "^16.12.0 || ^17.0.0" }`
(verified directly from the published package on 2026-06-25 — the range does
**not** list React 18). React 18 works at runtime (the hooks API used is stable),
but **npm 7+ errors on install** due to the peer-range mismatch.

**Decision:** the Phase-3 frontend installs with **`--legacy-peer-deps`** (or,
equivalently, adds an npm `overrides` block:
`"overrides": { "@daml/react": { "react": "$react", "react-dom": "$react-dom" } }`).
Pin `@daml/react` / `@daml/ledger` / `@daml/types` all to the same `2.10.4`,
matched to the SDK that generated `@daml.js/umbra`.

---

## D4 — Canton sandbox: ephemeral, unstable party IDs → parties.json

In Daml 2.10.x, `daml start` runs a **Canton sandbox** (verified from
`Start.hs@v2.10.0`), not the legacy in-memory sandbox. Consequences:

- Party IDs come back as **`hint::<fingerprint>`** (e.g. `bankA::1220...`).
- The ledger is **fresh on every `daml start`**; party IDs are **NOT stable
  across restarts**.

**Decision:** never hard-code a party fingerprint. Allocate with
`allocatePartyWithHint` for readable prefixes and **capture the IDs to
`parties.json`** at allocation time; all downstream code reads `parties.json`.
`parties.json` is gitignored (ephemeral per-boot state).

**Windows note:** the `daml start` hot-reload key is **`r` + `Enter`** on
Windows (bare `r` elsewhere); first boot is JVM-heavy (~20–40s) and may trigger
a Windows Defender firewall prompt for the localhost JVM ports.

---

## D5 — Dev-only `--allow-insecure-tokens` (threat T-01-05)

`daml start` runs the JSON API with **`--allow-insecure-tokens`**, which enables
HS256 unsafe dev JWTs. This is **dev-sandbox ONLY and MUST NEVER be used for any
deploy** (including the §19 LocalNet/Canton stretch). Per-party JWT minting is
wired in Phase 3 against this dev flag; no external exposure exists in Phase 1.
This satisfies threat **T-01-05** (insecure dev JWT misuse).

---

## D6 — Secrets handling (threat T-01-04, ASVS V14)

`ANTHROPIC_API_KEY` is read **solely by `solver/`** (Phase 5), **never** by the
frontend, and is **never committed**. `.env` is gitignored; the repo ships
`.env.example` with empty placeholder values only (spec §15). Satisfies threat
**T-01-04**.
