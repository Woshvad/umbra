# Umbra — DevNet Ops RUNBOOK (CHAIN-01/02/03)

> End-to-end procedure to take Umbra onto the **real Canton DevNet**: obtain SV
> sponsorship → boot the Splice validator → vet the frozen DAR → allocate parties +
> grantRights → run the §4 fixture on real Canton → enable backup / monitoring / top-up.
>
> **Honesty boundary.** Steps tagged **[EXTERNAL GATE]** or **[LIVE UAT]** require a
> real, SV-sponsored node and **cannot be performed on this build box** — they are
> never faked. Steps tagged **[BUILT]** are the offline artifacts this repo ships and
> that are already validated (YAML/compose parse, `node --check`, `bash -n`, the
> mocked-v2 deploy test). Booting the compose without sponsorship is **not** a live
> connection.

---

## Prerequisites (do these FIRST — the external gate has days–weeks lead time)

- **[EXTERNAL GATE]** Complete [`SV-SPONSOR-CHECKLIST.md`](./SV-SPONSOR-CHECKLIST.md).
  The egress-IP **allowlist adoption takes 2–7 days** (Pitfall 4) — start on day 1.
  You need, from the sponsoring Super Validator: a `SPONSOR_SV_URL`, and the ability
  to obtain a one-time **JIT onboarding secret** (1h self-serve / 48h SV — Pitfall 5).
- **[BUILT]** The identity stack from Plan 12-03: `deploy/keycloak/` (realm + Caddy TLS)
  and `deploy/canton/participant-oidc-auth.conf` (the `jwt-jwks` dual-mode auth-config).
- **[BUILT]** The frozen `daml/.daml/dist/umbra-0.1.0.dar` (`daml build`). Its package
  hash includes the additive four-eyes templates — so it **must be re-vetted** anywhere
  it is deployed (Pitfall 6).

---

## Step 1 — Obtain SV sponsorship  **[EXTERNAL GATE]**

Follow [`SV-SPONSOR-CHECKLIST.md`](./SV-SPONSOR-CHECKLIST.md) to completion:
static egress IP → send to the sponsoring SV → **allowlist adoption (2–7 days)** →
receive `SPONSOR_SV_URL` → generate the **JIT `ONBOARDING_SECRET` immediately before
Step 2** (it expires in 1h/48h and is one-time-use — Pitfall 5).

> Until this step completes, **no** subsequent step can run against a live network.

## Step 2 — Boot the Splice validator  **[LIVE UAT]**

```bash
cd deploy/devnet/validator-compose
cp .env.example .env          # fill placeholders; secrets stay in the gitignored .env
# Fill: SPONSOR_SV_URL, ONBOARDING_SECRET (fresh!), MIGRATION_ID (== network migration),
#       AUTH_URL/AUTH_JWKS_URL, LEDGER_API_ADMIN_USER, VALIDATOR_AUTH_CLIENT_ID/SECRET.
./start.sh -s "$SPONSOR_SV_URL" -o "$ONBOARDING_SECRET" \
           -p "$PARTY_HINT" -m "$MIGRATION_ID" -w -a
```

- `-p umbra-operator-1` — the **namespaced** `<org>-<function>-<enumerator>` hint DevNet
  enforces (**Pitfall 7**). `-w` wallet UI, `-a` validator app.
- **Wait for health**: the participant must reach **`/readyz`** (HTTP 200) — that means it
  connected to the synchronizer and is serving the JSON Ledger API v2. `/livez` alone is
  not enough. (`deploy/devnet/monitoring/prometheus.yml` scrapes both.)
- **`MIGRATION_ID` must equal the network's current migration**, or routing fails with a
  package/migration mismatch (the Pitfall 6 class).

## Step 3 — Vet the frozen DAR  **[LIVE UAT]** (Pitfall 6)

Uploading the DAR to the participant **vets** it — a prerequisite for routing `Round.Clear`.
The rebuilt DAR (with the additive four-eyes templates) has a **new package hash**, so a
participant that hasn't vetted it will refuse to route (`PACKAGE_SELECTION_FAILED` class).

This is done by `devnet-deploy.mjs` (next step) — it POSTs the DAR to `/v2/packages` and
confirms the package is listed. **[BUILT]** the script + its mocked-v2 shape test; **[LIVE
UAT]** the actual vet on a real participant.

## Step 4 — Allocate parties + grantRights  **[LIVE UAT]** (Pitfall 3 — the #1 live failure)

```bash
# Server-side env (gitignored): OIDC_ISSUER, OIDC_CLIENT_ID=umbra-solver, OIDC_CLIENT_SECRET,
#   LEDGER_API_ADMIN_USER (== the client-credentials token `sub`), DEVNET_JSON_API=:6975
node deploy/devnet/devnet-deploy.mjs
```

`devnet-deploy.mjs` (mirrors `scripts/localnet/deploy.mjs`):
1. acquires an OIDC **client-credentials** bearer (RS256, JWKS-verified by the participant),
2. uploads + **vets** the DAR (Step 3), confirms the package is listed,
3. allocates the **namespaced** parties `umbra-operator-1 / umbra-bankA-1 / -bankB-1 / -bankC-1`,
4. runs **`grantRights`** so the **admin user (== the token `sub`) holds the operator's
   `actAs`/`readAs`**. Canton derives party rights from the **user** the token `sub` maps to,
   **not** from token claims — so **`LEDGER_API_ADMIN_USER` MUST equal the service-account
   `sub`**, and that user MUST be granted the operator rights. Skip this and every ledger
   call returns **403** (Pitfall 3 — the single most common live-onboarding failure).
5. creates per-desk read users (own party only → structural privacy in the browser).

**[BUILT]** the script + a 9-check mocked-v2 test proving these exact request shapes offline.

## Step 5 — Run the §4 fixture on real Canton  **[LIVE UAT]**

Seed the canonical §4 round and drive it through commit→reveal→**four-eyes approve**→clear→settle.
The clearing MUST land at **$100.00** with fills **A=10 / B=8 / C=2** — the continuous
correctness canary. The four-eyes gate (IDEN-03) inserts a Compliance `ClearingApproval`
before `Round.Clear` settles; the §8 recompute-and-assert backstop is unchanged, so the
number is still **$100.00**. A settle without/with a wrong-price approval aborts on-ledger.

> If the clear is anything other than **$100.00 / A=10·B=8·C=2**, STOP — the DAR/vet or the
> approval wiring is wrong; do not proceed to unattended ops.

## Step 6 — Enable backup, monitoring, traffic top-up  **[LIVE UAT / registration]**

- **Backups**: schedule `deploy/devnet/backup/pg-dump.sh` (cron / systemd timer / Task
  Scheduler) with `PGPASSWORD` exported from a gitignored env file. **[BUILT]** the script
  (`bash -n` clean, timestamped gzip dumps + retention); **[LIVE UAT]** the schedule + a
  real Postgres at `:55434`.
- **Monitoring**: run Prometheus against `deploy/devnet/monitoring/prometheus.yml`
  (exposed on `:9095`, off the LocalNet swagger `:9090`); watch `/readyz` + `/livez`.
- **Traffic top-up**: set `TARGET_TRAFFIC_THROUGHPUT` / `MIN_TRAFFIC_TOPUP_INTERVAL`
  (`deploy/devnet/traffic-topup.env.example`). DevNet **auto-taps coin** — no funded wallet.

---

## Pitfall quick-reference (encoded as the ordered steps above)

| # | Pitfall | Where it bites | Guard in this runbook |
|---|---------|----------------|------------------------|
| 3 | `LEDGER_API_ADMIN_USER` / token `sub` mismatch → 403 on every call | Step 4 | admin user == service-account `sub`; `grantRights` grants operator actAs/readAs |
| 4 | Egress-IP allowlist assumed instant (it's 2–7 days) | Step 1 / prerequisites | start the SV gate on day 1 (external) |
| 5 | JIT onboarding secret expiry (1h/48h, one-time) | Step 2 | generate it immediately before `./start.sh` |
| 6 | Rebuilt DAR not re-vetted → PACKAGE_SELECTION_FAILED | Step 3 | `devnet-deploy.mjs` uploads+vets before any Round.Clear |
| 7 | `party_hint` not `<org>-<function>-<enumerator>` | Step 2 / Step 4 | `umbra-operator-1` etc. everywhere |

## Honest limitations

- **CHAIN-01** (SV-sponsored live connection to the real Global Synchronizer),
  **CHAIN-02** (live DAR-vet + §4-on-real-Canton), and **CHAIN-03** (unattended ops on a
  live node) require the external SV gate + a live node — deferred, honestly labeled.
- A single self-hosted validator is **"demo-real"** for the 3-desk privacy money shot;
  genuine 3-institution cross-node privacy (3 independent validators) is a recorded limitation.
