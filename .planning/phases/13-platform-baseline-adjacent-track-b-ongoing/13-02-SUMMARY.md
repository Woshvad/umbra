---
phase: 13-platform-baseline-adjacent-track-b-ongoing
plan: 02
subsystem: infra
tags: [secrets, vault, kv-v2, status-page, health, observability, express]

# Dependency graph
requires:
  - phase: 12-devnet-identity-oidc
    provides: "auth.ts module-private-secret + lazy-env + raw-fetch backend discipline (the copied analog)"
provides:
  - "SecretsProvider abstraction (solver/src/secrets.ts) — env|vault backends, raw-fetch KV v2, no SDK"
  - "Token-free aggregate /status JSON builder + self-contained brand /status.html (solver/src/status.ts)"
  - "Dev-mode Vault docker-compose service (ops/vault/docker-compose.vault.yml, UNSAFE-DEV)"
  - "KV v2 rotation script (scripts/rotate-secret.mjs) + operator runbook (docs/SECRETS-RUNBOOK.md)"
affects: [13-07-endpoint-wiring, ops, observability, secrets]

# Tech tracking
tech-stack:
  added: [hashicorp-vault-dev-compose]
  patterns:
    - "SecretsProvider seam: SECRETS_PROVIDER selects env (default, byte-for-byte .env) vs vault (KV v2 raw fetch), mirroring ledger.ts HMAC-vs-OIDC switch"
    - "Aggregate-only public surface: buildStatus explicitly lists allow-listed health keys (buildIndicative withholding discipline) so no order/desk/token field can ride along"
    - "Self-contained brand HTML: inlined brand tokens + Google Fonts, no React/Tailwind/auth context, browser polls /status"

key-files:
  created:
    - solver/src/secrets.ts
    - solver/src/secrets.test.ts
    - solver/src/status.ts
    - solver/src/status.test.ts
    - ops/vault/docker-compose.vault.yml
    - scripts/rotate-secret.mjs
    - docs/SECRETS-RUNBOOK.md
  modified: []

key-decisions:
  - "env is the offline default so the dev loop + all existing tests keep working with no Vault deployed; vault is opt-in via SECRETS_PROVIDER=vault"
  - "Vault reads use raw fetch to /v1/secret/data/umbra/<key> (KV v2 nesting data.data.<name>) — no node-vault SDK, matching the locked dep-minimalism"
  - "Order-field sweep uses quoted-key sentinels ('\"side\"' etc.) rather than bare substrings to avoid false positives against prose like 'client-side'"
  - "Dev Vault root token labeled UNSAFE-DEV (T-13-05 accept); AppRole documented as the prod path; live zero-downtime rotation is a UAT gate"

patterns-established:
  - "Public surface = allow-list construction + order-sweep + secret-sweep tests (the load-bearing privacy assertion for the one token-free page)"
  - "Secret-free throws: Vault non-2xx throws 'Vault HTTP <status>' (status only, body never interpolated); requireEnv throws '<name> is unset'"

requirements-completed: [OPS-02]

# Metrics
duration: 6min
completed: 2026-07-10
---

# Phase 13 Plan 02: OPS-02 SecretsProvider + Public Status Page Summary

**SecretsProvider seam (env default preserved byte-for-byte + HashiCorp Vault KV v2 over raw fetch) plus the S1 token-free, aggregate-only /status JSON + brand-styled /status.html — with dev Vault compose, a KV v2 rotation script, and an operator runbook.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-10T18:25:37Z
- **Completed:** 2026-07-10T18:32:00Z
- **Tasks:** 3
- **Files modified:** 7 (all created)

## Accomplishments
- `SecretsProvider` abstraction with `env` (default — preserves current `.env` behavior byte-for-byte) and `vault` (KV v2 over raw fetch, no node-vault SDK) backends selected by `SECRETS_PROVIDER`; `VAULT_TOKEN` held module-private, secret-free throws.
- S1 public status page: pure `buildStatus` aggregate-only JSON builder + self-contained brand-styled `renderStatusHtml` (paper/ink/lime tokens, Space Grotesk/IBM Plex Mono, UMBRA wordmark, honest tag, health pill, idle empty-state, browser poll of `/status`).
- Dev-mode Vault docker-compose (UNSAFE-DEV root token, port 8200, IPC_LOCK), `scripts/rotate-secret.mjs` (writes a new KV v2 version, prints only key+version), and `docs/SECRETS-RUNBOOK.md`.
- Full solver suite green (185 tests / 18 files) including the new order-sweep + secret-sweep on `/status` and `/status.html`; §4 fixture untouched (still clears $100.00).

## Task Commits

Each task was committed atomically (author/committer = woshvad, no Claude attribution):

1. **Task 1: secrets.ts — SecretsProvider (env|vault)** - `d864d7f` (feat)
2. **Task 2: status.ts — token-free aggregate /status + /status.html** - `45ed77b` (feat)
3. **Task 3: Vault compose + rotate-secret.mjs + SECRETS-RUNBOOK.md** - `b0b5360` (chore)

## Files Created/Modified
- `solver/src/secrets.ts` - SecretsProvider interface + createSecretsProvider factory (env|vault backends, raw-fetch KV v2)
- `solver/src/secrets.test.ts` - env default + vault KV v2 read + secret-free throws + VAULT_TOKEN sweep (8 tests)
- `solver/src/status.ts` - buildStatus (pure aggregate JSON) + renderStatusHtml (self-contained brand S1 document)
- `solver/src/status.test.ts` - allow-list key discipline + order-sweep + secret-sweep + S1 copy/state assertions (12 tests)
- `ops/vault/docker-compose.vault.yml` - dev-mode Vault service (UNSAFE-DEV root token, :8200, IPC_LOCK)
- `scripts/rotate-secret.mjs` - KV v2 rotation write (raw fetch, prints only key + version, value never logged)
- `docs/SECRETS-RUNBOOK.md` - env-vs-vault switch, dev Vault boot, seeding, rotate procedure, AppRole prod path, UAT note

## Decisions Made
- `env` is the offline default so nothing breaks when Vault is absent; `vault` is opt-in via `SECRETS_PROVIDER=vault`.
- Vault reads use raw fetch (no node-vault) to honor the locked dep-minimalism.
- Endpoint wiring into the Express app is deferred to plan 13-07 (per the plan objective); this plan ships the pure, unit-tested modules + infra.

## Deviations from Plan

None - plan executed exactly as written. One in-task adjustment (not a deviation from scope): the status order-sweep initially used bare substrings and `'side'` matched the word "client-side" in a code comment; the sweep was tightened to quoted-key sentinels (`'"side"'`) and the comment reworded to "browser" — both strengthen the privacy assertion without changing behavior.

## Issues Encountered
- No standalone YAML parser (js-yaml / python) available on this box to formally parse the compose file; validated structurally against the known-good `deploy/keycloak/docker-compose.yaml` shape and the plan's node regex check (vault + UNSAFE-DEV present).

## User Setup Required
**Vault backend is UAT-only.** The `env` backend is the offline default and requires no setup. To exercise the `vault` path: boot `ops/vault/docker-compose.vault.yml`, set `SECRETS_PROVIDER=vault`, `VAULT_ADDR`, `VAULT_TOKEN`, and seed/rotate per `docs/SECRETS-RUNBOOK.md`. Live zero-downtime rotation is a UAT gate.

## Next Phase Readiness
- `buildStatus`/`renderStatusHtml` and `createSecretsProvider` are ready to be wired onto `createApp` in plan 13-07 (two token-free GETs: `/status`, `/status.html`).
- No blockers. §4 fixture still clears $100.00.

## Self-Check: PASSED

All 7 files verified present on disk; all 3 task commits (`d864d7f`, `45ed77b`, `b0b5360`) verified in git log.

---
*Phase: 13-platform-baseline-adjacent-track-b-ongoing*
*Completed: 2026-07-10*
