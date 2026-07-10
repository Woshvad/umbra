# Umbra — Splice DevNet validator compose (CHAIN-01)

> ⚠ **EXTERNAL GATE — never faked offline.** This compose joins the **real** Global
> Synchronizer on Canton DevNet. It cannot connect without **Super-Validator
> sponsorship**. Booting it without sponsorship is **not** a live connection.
> See [`deploy/SV-SPONSOR-CHECKLIST.md`](../../SV-SPONSOR-CHECKLIST.md) and
> [`deploy/RUNBOOK.md`](../../RUNBOOK.md).

## What this is

A parameterized self-hosted **Splice validator** (Canton participant + validator app +
wallet/CNS UIs) that joins DevNet via the Global Synchronizer. Every network/auth/secret
value is a placeholder in [`.env.example`](./.env.example) — **no real secret, sponsor URL,
or onboarding secret is committed.**

## Offline validation (what CAN be checked on this box)

```bash
# YAML parses:
node -e "require('fs').readFileSync('deploy/devnet/validator-compose/docker-compose.yaml','utf8')"
# .env.example carries every required parameter:
grep -q SPONSOR_SV_URL deploy/devnet/validator-compose/.env.example
grep -q umbra-operator-1 deploy/devnet/validator-compose/.env.example
grep -q canton.network.global deploy/devnet/validator-compose/.env.example
```

## Bring-up AT THE GATE (CHAIN-01 live UAT)

1. Complete [`SV-SPONSOR-CHECKLIST.md`](../../SV-SPONSOR-CHECKLIST.md): static egress IP →
   SV allowlist adoption (**2–7 days**, Pitfall 4) → `SPONSOR_SV_URL` → **one-time JIT
   `ONBOARDING_SECRET`** (1h self-serve / 48h SV, Pitfall 5 — generate it **just before**
   `./start.sh`).
2. `cp .env.example .env` and fill the placeholders (secrets stay in the **gitignored** `.env`).
3. Run the official Splice invocation with the namespaced party hint (Pitfall 7):

   ```bash
   ./start.sh -s "$SPONSOR_SV_URL" -o "$ONBOARDING_SECRET" \
              -p "$PARTY_HINT" -m "$MIGRATION_ID" -w -a
   ```

   (`-p umbra-operator-1` — the `<org>-<function>-<enumerator>` format DevNet enforces;
   `-w` wallet UI, `-a` validator app.)
4. Then run [`../devnet-deploy.mjs`](../devnet-deploy.mjs) to upload+**vet** the frozen DAR,
   allocate parties, and `grantRights` so `LEDGER_API_ADMIN_USER == token sub` (Pitfall 3).

## Ports (off the LocalNet + Keycloak stacks)

| Service | Host port | Note |
|---------|-----------|------|
| Participant JSON Ledger API v2 | `${JSON_LEDGER_API_PORT:-6975}` | off LocalNet `:3975/:2975/:4975` |
| Validator app admin | `${VALIDATOR_ADMIN_PORT:-5003}` | |
| Wallet UI | `${WALLET_UI_PORT:-3020}` | |
| CNS UI | `${CNS_UI_PORT:-3021}` | |
| Participant Postgres | isolated volume | off LocalNet `:55432`, Keycloak `:55433` |

## Honest limitation

A single self-hosted validator is **"demo-real"** for the 3-desk privacy money shot; genuine
3-institution cross-node privacy (3 independent validators) is a recorded limitation.
