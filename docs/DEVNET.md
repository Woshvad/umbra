# Umbra on Canton DevNet — cutover runbook

Goal: run the **entire** Umbra stack (validator, all parties, solver backend, web
frontend, seeding, the live money shot) against **real Canton DevNet**, not the local
cn-quickstart LocalNet.

Status: **plan confirmed by research (2026-07).** The app code is largely DevNet-ready; the
real work is **infra + validator onboarding**, which has an external, multi-day dependency.

---

## 0. Headline finding (changes the approach)

**cn-quickstart no longer reaches DevNet.** As of a 2025-07-02 change, cn-quickstart is a
**LocalNet-only** dev scaffold — there is no DevNet/MainNet mode in it. To reach real DevNet you
deploy a **Splice validator** directly (Docker Compose or Helm/K8s) and **onboard it**. That is a
separate stack from the one `make up` runs. Source: cn-quickstart README (HIGH confidence).

Consequence: "everything on DevNet" = **self-host our own Splice validator, onboarded to
DevNet, on this box**, then point our existing stack at it. The good news (below) is that our
whole multi-party app then ports over with minimal code change.

---

## 1. What's already DevNet-ready (no code change)

The stack was built dual-mode. Env vars flip local ⇄ DevNet:

| Component | Local (default) | DevNet | Switch |
|---|---|---|---|
| Solver → ledger | `unsafe` HS256, admin `ledger-api-user`, `:3975` | OIDC client-credentials bearer | set `OIDC_ISSUER` (+ `OIDC_JWKS_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_OPERATOR_PARTY`), point `JSON_API_URL` at the validator |
| Solver operator party | `daml/parties.json` | `OIDC_OPERATOR_PARTY` | env |
| Four-eyes compliance | `scripts/.compliance-token` | `COMPLIANCE_PARTY` + `COMPLIANCE_TOKEN` (≠ operator) | env |
| Web desk login | pre-minted `tokens.json` | OIDC auth-code + PKCE | set `VITE_OIDC_AUTHORITY` |
| Web → solver | `VITE_SOLVER_URL=:4100` | same | env |

Refs: `solver/src/ledger.ts` (`OIDC_MODE`), `solver/src/auth.ts`, `web/src/auth/oidc.ts`.
Vars documented in `solver/.env.example` + `web/.env.example`.

**Key research result:** a self-hosted Splice validator's Compose default is *also* "highly
insecure self-signed tokens" (the same unsafe style as LocalNet); real OIDC is opt-in
(`./start.sh -a`). So on our OWN DevNet validator we can, if we choose, **keep the current
unsafe-token scripts working** (verify the exact token format against the Splice version first),
and upgrade to OIDC later. That means the stack ports with *minimal* change.

---

## 2. Research answers (authoritative, sourced)

- **Validator on DevNet (HIGH):** deploy a Splice validator (Compose/Helm). Switch to DevNet by
  setting the synchronizer `MIGRATION_ID`, pointing at a **sponsor SV**, and supplying an
  **onboarding secret**: `./start.sh -s "<SPONSOR_SV_URL>" -o "<ONBOARDING_SECRET>" ...`.
  On DevNet you **self-serve** the secret (valid ~1h):
  `curl -X POST "${SPONSOR_SV_URL}/api/sv/v0/devnet/onboard/validator/prepare"`.
  You also need a **static egress IP** added to the SV allowlist — **adoption takes ~2–7 days**
  (this is the long pole). Footprint ≈ 4 cores / 6–8 GB RAM / 100 GB SSD + its own Postgres;
  first boot ~3–10 min.
- **JSON Ledger API reachability (HIGH):** available, but **localhost-only, no TLS, no external
  ingress by default** on the Compose validator (served via nginx at `json-ledger-api.localhost`).
  → If the validator runs on the **same box** as our solver + web, localhost is fine (no ingress
  needed). Off-box access needs our own reverse proxy + TLS, or the Helm deployment.
- **Auth (HIGH for prod path):** validator operator chooses; DevNet doesn't police it. Default =
  self-signed/unsafe tokens; production = **OIDC client-credentials, RS256/JWKS, Auth0 reference**
  (Keycloak/Okta also fine — bring-your-own IDP).
- **Multi-party (HIGH):** one participant hosts many parties; parties are decoupled from users.
  Since we self-host, **we are the participant admin** → allocate operator + 3 desks + compliance
  and mint per-party tokens exactly like LocalNet.
- **Seaport (NOW CONFIRMED, 2026-07 — see §2.5):** the FiveNorth "Seaport" sandbox validator
  DOES expose the raw JSON Ledger API v2 + OIDC client-credentials to external apps. The earlier
  "not found" was because docs are private (handed out as a PDF). Route B is reachable — but the
  shared credential is rights-capped (§2.5).
- **3-party privacy (HIGH):** all 5 parties on one self-hosted validator works; app-level Daml
  disclosure privacy holds ("each desk sees only its own fill"). **Caveat:** co-hosted parties
  share the node's trust boundary — true *cross-node* privacy between desks needs 3 separate
  validators (spec §19 stretch, out of scope for a single-builder demo).

---

## 2.5 Route B CONFIRMED — FiveNorth "Seaport" DevNet sandbox (2026-07, verified live)

The organizers provided direct Ledger-API access to the shared Seaport sandbox validator. All
of this was **verified live** with read + write probes:

- **Endpoints:** REST `https://ledger-api.validator.devnet.sandbox.fivenorth.io/` (JSON Ledger
  API v2, `/v2/...`); WS `wss://ledger-api.validator.devnet.sandbox.fivenorth.io`.
- **Auth (Authentik OIDC client-credentials):** POST `https://auth.sandbox.fivenorth.io/application/o/token/`
  with `grant_type=client_credentials`, `client_id=validator-devnet-m2m`, the client secret,
  `audience=validator-devnet-m2m`, `scope=daml_ledger_api`. Returns an 8h RS256 Bearer. The secret
  lives ONLY in the gitignored `solver/.env.devnet` (env `SEAPORT_SECRET`), never committed.
- **Verified working:** token exchange → 200; `/v2/state/ledger-end`, `/v2/parties` (10k+),
  `/v2/users` (300), `/v2/packages` (630, umbra not yet present); **party allocation → 200**;
  **user-rights grant → 200** (admin capability confirmed). The m2m user is `id 6`
  (`otc-canton-fund-oauth`), participant namespace `1220a14ca128…`.
- **RESOLVED (was: rights cap).** The shared m2m user briefly sat at Canton's 1000-user-rights
  cap (999/1000) so our 5 parties could not attach. The organizers pruned it (→ ~106/1000) when
  granting Encode-org access; the grant then succeeded and the cutover ran end to end.
- **✅ SHIPPED — §4 settles on real DevNet.** `scripts/devnet/up.mjs` (parties → grant → DAR
  upload by explicit package id → §4 seed → writes `solver/.env.devnet` + `web/src/tokens.json`)
  then solver `/close` + `/settle` → **clearingPrice 100.0, A=10 / B=8 / C=2, txConfirmations 1**.
  `scripts/devnet/verify.mjs` is green: A 10 BONDX/4000 USDCx · B 12/1800 · C 13/1200 · conserved
  35/7000 · each desk party is a stakeholder on ONLY its own TradeConfirmation. The browser
  renders it live through the vite `/cn/devnet` proxy.
- **Interop defects this surfaced (all fixed):** (1) package-NAME collision — an unrelated team
  owns `umbra` (v0.0.3/0.0.4) and their versions are mutually upgrade-inconsistent, so any new
  `umbra` upload was rejected → we publish as **`umbra-sealed-auction`** and pin the explicit
  package id; (2) this validator rejects JSON numbers for Int64/Numeric ("Expected ujson.Str") →
  the solver normalizes numbers to strings on the wire; (3) ACS readers (solver + web) matched
  `packageName === 'umbra'` literally → now env-configurable (`UMBRA_PACKAGE_NAME` /
  `VITE_UMBRA_PACKAGE_NAME`); (4) `resolveCompliance` preferred the LocalNet
  `scripts/.compliance-token` over env → `UNKNOWN_INFORMEES` on DevNet; explicit env now wins.
- **Shared bearer (organizer-issued).** All three desks carry the ONE m2m bearer. Per-desk VIEWS are
  correct; the adversarial peek proof was re-based onto **informee refusal** so it holds here too
  (§2.6). The remaining ask — **per-desk m2m clients** — is now about *credential* isolation only.

---

## 2.6 The adversarial privacy proof on DevNet — informee refusal (2026-07-15, verified live)

**Problem.** The original "Try to Peek" console asked the ledger **as the rival**:
`POST /v2/state/active-contracts` filtered to the RIVAL party, using the active desk's token. That
tests **credential scoping**, an *ops* property — and a shared bearer defeats it. On LocalNet each
desk token is scoped to its own party → 403 → looks right. On DevNet the shared
`validator-devnet-m2m` bearer (user id 6) holds `readAs` on **every** party → the read **SUCCEEDS**
→ the console rendered a **FALSE `LEAK — PRIVACY REGRESSION`** banner on the money-shot panel.

**Fix.** Canton disclosure is **stakeholder/informee-based, not token-based**: a party is shown a
contract only if it is a signatory/observer. So the console now asks **as the peeking desk's OWN
party, with its OWN token**, for a rival's contract by id:

```
POST /v2/events/events-by-contract-id
{ "contractId": "<rival's Order cid>",
  "eventFormat": { "filtersByParty": { "<requesting PARTY>": { "cumulative": [] } },
                   "verbose": true } }
```

Verified live on the Seaport sandbox, **the same shared bearer for both calls**:

| requestingParty | Result |
|---|---|
| bankA (rival, NOT a stakeholder) | **HTTP 404 `CONTRACT_EVENTS_NOT_FOUND`** — "Contract events not found, or not visible." |
| bankB (the owner, control) | **HTTP 200** with the full `createdEvent` |

(`eventFormat` is mandatory — omitting it returns HTTP 400 `MISSING_FIELD` "event_format".)

**The nets converge.** Asking AS our own party means the token always permits the requesting party,
so there is no 403 divergence — **LocalNet and DevNet both return the same 404**. One proof, one
verdict (`404 — LEDGER REFUSED THE READ · NOT AN INFORMEE`), both nets. The 403 verdict is retained
for genuinely scoped-token deployments, and LEAK detection is undiminished.

**The cid is a deliberate gift to the attacker.** bankA cannot legitimately discover bankB's cid —
that is the point. The demo bundle already carries all three desk tokens (for the party switcher),
so the console performs an **out-of-band discovery read with the RIVAL's OWN token** to learn the
cid, and says so verbatim in the REQUEST pane. We hand the attacker the rival's exact contract id
**and** a bearer with read rights on all three desks. The ledger still answers *not visible*.

> ### ⚠ Honest limitation — do not overstate this proof
>
> This proves the ledger will **not disclose to a non-stakeholder PARTY** (ledger-enforced
> projection). It does **NOT** prove one desk's **CREDENTIAL** cannot impersonate another: on DevNet
> a holder of the shared bearer could simply ask *as* bankB and get the 200. **Per-desk m2m clients
> from the organizers remain the only fix for credential isolation.** Present the DevNet panel as
> "the ledger refuses non-informees", not as "bankA's login cannot read bankB".

Code: `web/src/lib/peek.ts` (pure builder + classifier), `web/src/components/PeekConsole.tsx` (owns
the fetch). Spec deviation recorded in `.planning/phases/08-demo-hardening/08-UI-SPEC.md` (WOW-01).

---

## 3. The two routes to "everything on DevNet"

- **Route B — FiveNorth Seaport sandbox (fast; CONFIRMED reachable, §2.5).** Zero infra, real
  DevNet, JSON API + OIDC verified. Gated ONLY on a per-team credential (the shared one is
  rights-capped). This is now the preferred route pending that one organizer ask.
- **Route A — self-host our own Splice validator (fallback, full control).** Our JSON API
  (localhost), our 5 parties, our auth. Our solver/web/scripts port with minimal change. Cost:
  real infra + the **2–7 day allowlist wait** + a sponsor SV + a static egress IP. Use if the
  organizers can't provision a per-team client.

**One ask to the organizers (Discord):** provision a **dedicated per-team m2m client** (ideally
a few — one per desk) for the FiveNorth sandbox, since the shared `validator-devnet-m2m` user is
at the 1000-rights cap. That unblocks Route B end to end.

---

## 4. Route A steps (self-host) — execute once inputs are known

Inputs required first: **sponsor SV URL**, target **MIGRATION_ID**, a **static egress IP**, and
the **Splice version** to pin.

- [ ] Get the Splice validator Compose bundle for the pinned version; pin `MIGRATION_ID`.
- [ ] Self-serve the DevNet onboarding secret from the sponsor SV (valid ~1h).
- [ ] Submit the static egress IP for SV allowlisting (**start early — 2–7 days**).
- [ ] `./start.sh -s <SPONSOR_SV_URL> -o <SECRET> ...` (add `-a` for OIDC, or keep default tokens).
- [ ] Wait for onboarding + ACS/history catch-up.
- [ ] Vet `umbra-0.1.0.dar` (self-contained fat DAR — deps bundled) on the validator.
- [ ] Allocate parties: operator, bankA, bankB, bankC, compliance (distinct).
- [ ] Point solver `JSON_API_URL` at the validator's JSON API host; set token source
      (unsafe-compatible or `OIDC_*`); set `web` ledger base + `VITE_OIDC_AUTHORITY` if OIDC.
- [ ] Reseed §4 (adapted scripts); run money shot; `verify-settlement` green on DevNet.

---

## 5. Code gaps to build for Route A (once the validator exists)

- **Scripts' token source.** `scripts/localnet/{deploy,seed,provision-compliance,verify-
  settlement}.mjs` mint `unsafe` HS256 via `mint-jwt.mjs`. If the DevNet validator keeps the
  default self-signed tokens, they may work as-is against the new host (endpoint is already
  env-driven via `LOCALNET_JSON_API`). If it uses OIDC, add a pluggable token source. **Verify
  the exact default token format on the pinned Splice version before relying on unsafe auth.**
- **Validator host/port scheme.** LocalNet uses `:3975`; the standalone validator uses nginx
  hostnames (`json-ledger-api.localhost:80`). Make the host configurable and set it.
- **Web per-desk ledger base.** `web/src/desks.ts` `httpBaseUrlFor` uses `tokens.json` `base` +
  the Vite proxy. Add a proxy/base for the validator's JSON API (+ CORS/TLS as needed).

---

## 6. Bottom line

**DONE — Umbra runs on real Canton DevNet via Route B (FiveNorth Seaport sandbox).** The DAR is
vetted, our 5 parties are allocated, the §4 fixture seeds, and the round **settles at $100.00**
(A=10 / B=8 / C=2, atomic, four-eyes) through the audit-fixed `Venue.SettleRound` — verified
on-ledger and rendered live in the browser.

Reproduce: `SEAPORT_SECRET=… node scripts/devnet/up.mjs` → run the solver with
`solver/.env.devnet` → `POST /round/R1/close` + `/settle` → `node scripts/devnet/verify.mjs`.

**The adversarial privacy proof now runs on DevNet too** (§2.6): the peek asks
`events-by-contract-id` **as the peeking desk's own party** and the ledger refuses with
`404 CONTRACT_EVENTS_NOT_FOUND` — the same verdict on LocalNet and DevNet, even though the sandbox
hands every desk the same bearer. This is the real Canton guarantee (informee-based projection), so
the money shot can be demoed on real DevNet.

One gap remains, and it is an **organizer ask, not code**: the hackathon issues a single shared
m2m client, so all three desks carry the same bearer. That is a **credential-isolation** gap, not a
ledger-privacy one — a bearer holder could ask *as* bankB and be served. **Per-desk m2m clients**
would close it; LocalNet's scoped tokens already demonstrate it (rival read → 403). Do not claim
credential isolation on DevNet. **Route A (self-hosted Splice validator)** remains the fallback if
the sandbox ever goes away (sponsor SV + static egress IP + a 2–7 day allowlist).
