# Deploying Umbra as a public link

Solver → **Railway**. Web → **Vercel**. Ledger → the existing **FiveNorth DevNet** validator.

This is the runbook for putting the live demo behind a URL anyone can open. It assumes the
DevNet stack already works locally (`scripts/devnet/up.mjs` has run, `solver/.env.devnet`
exists, and the §4 fixture clears at $100.00).

---

## 1. The shape of the deployment (and why it is shaped that way)

```
  browser (Vercel, static)          solver (Railway, Node 20)        FiveNorth DevNet
  ┌──────────────────────┐          ┌───────────────────────┐        ┌──────────────┐
  │ operator plane  ─────┼─────────▶│ /round, /settle, …    │───────▶│  validator   │
  │ ledger plane    ─────┼─────────▶│ /cn/devnet/v2/*       │──┐     │ JSON API v2  │
  │                      │          │   ledgerproxy.ts      │  │     └──────────────┘
  │ NO credential        │          │   + Bearer (injected) │──┘
  └──────────────────────┘          └───────────────────────┘
```

**The one load-bearing change:** the browser used to call the validator directly (through the
Vite dev proxy) with a bearer *bundled into the client JS*. That is unshippable — a static
build has no dev proxy, and anyone could read the token out of the bundle. So the solver grew
a **ledger proxy** (`solver/src/ledgerproxy.ts`): the browser calls the solver, and the solver
attaches the bearer server-side.

Consequences worth internalising before you debug anything:

- **There is exactly one URL to configure.** The ledger proxy is mounted on the same service as
  the operator API, so `VITE_SOLVER_URL` alone points the whole frontend at the backend.
- **Privacy is enforced by the ledger, not the proxy.** Canton discloses a contract only to its
  stakeholders. The proxy forwards `filtersByParty` / `eventFormat.filtersByParty` / `actAs`
  **verbatim**, and returns the validator's status and body **unchanged**. That is why the
  Try-to-Peek 404 (`CONTRACT_EVENTS_NOT_FOUND`) still renders after the extra hop.
- **The proxy is a closed allow-list**, not an open proxy: four `/v2/*` paths, nothing else.

## 2. The honest limitation (do not overstate this in the demo)

**All desks are served by ONE shared DevNet m2m bearer.** The hackathon organizers issue a
single client (`validator-devnet-m2m`), so there is no per-desk credential to hand out.

Moving that bearer server-side **removes a leak; it does not add isolation.** Precisely:

| Claim | Status |
| --- | --- |
| The shipped client JS contains no ledger credential | **True now** (it did before). |
| A desk sees only its own orders/holdings/fills; rivals are redacted | **True** — Canton stakeholder projection, enforced by the participant. |
| A rival cannot read another desk's contract by id | **True** — 404 `CONTRACT_EVENTS_NOT_FOUND`, asking as its own party. This is the WOW-01 proof and it holds under a shared bearer. |
| One desk's *credential* cannot impersonate another | **FALSE, and unchanged by this deploy.** With one shared bearer, anything that can reach the proxy can ask as any party. Per-desk m2m clients from the organizers are the only fix. |

This is why the peek proof was deliberately rebuilt on **informee refusal** rather than
credential scoping (see `web/src/lib/peek.ts`). Present it that way.

The practical corollary: **the proxy is unauthenticated by design for the demo.** Anyone with
the Railway URL can issue the four allow-listed ledger reads as any party. That is acceptable
for a hackathon demo on a throwaway DevNet, and it must not be described as production
multi-tenant privacy. Scope `CORS_ORIGIN` to your Vercel origin to keep casual browsers out;
that is a speed bump, not an authorization boundary.

---

## 3. Deploy the solver to Railway

### 3.1 Env vars

`railway.json` carries **no values** — only build/start/health config. Every value is set as a
Railway variable. The full contract, with placeholder shapes, is in
[`solver/.env.railway.example`](../solver/.env.railway.example).

**Required:**

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | secret · the AI solver agent; server-side only, never in the browser |
| `JSON_API_URL` | `https://ledger-api.validator.devnet.sandbox.fivenorth.io` — also the proxy's default forwarding target |
| `OIDC_ISSUER` | setting this is what switches the solver onto the real OIDC path |
| `OIDC_TOKEN_URL` | Authentik's token endpoint (not the Keycloak default path) |
| `OIDC_JWKS_URL` | |
| `OIDC_CLIENT_ID` | `validator-devnet-m2m` |
| `OIDC_CLIENT_SECRET` | **secret** |
| `OIDC_AUDIENCE` | |
| `OIDC_OPERATOR_PARTY` | public party id |
| `COMPLIANCE_PARTY` | public party id |
| `COMPLIANCE_TOKEN` | **secret** · the distinct four-eyes compliance bearer |
| `UMBRA_PACKAGE_ID` | |
| `UMBRA_PACKAGE_NAME` | `umbra-sealed-auction` |
| `CORS_ORIGIN` | your Vercel origin, e.g. `https://umbra.vercel.app` (comma-separated list; `*` = reflect any origin) |

**Do NOT set `PORT`** — Railway injects it and the solver binds it
(`process.env.PORT ?? SOLVER_PORT ?? 4100`).

**Optional:** `LEDGER_PROXY=off` (disable the proxy), `LEDGER_PROXY_TARGET` (defaults to
`JSON_API_URL`), `LEDGER_PROXY_TOKEN` (a static bearer that overrides OIDC acquisition —
normally omit; with `OIDC_ISSUER` set the proxy mints and refreshes its own).

### 3.2 Commands

Run from the **repo root** (the service root directory must stay the repo root — the build
installs into `solver/` via `--prefix`):

```bash
railway login
railway init                 # or: railway link   (to an existing project)

# Push the values. Read them from the gitignored solver/.env.devnet — never commit them.
railway variables \
  --set "ANTHROPIC_API_KEY=…" \
  --set "JSON_API_URL=https://ledger-api.validator.devnet.sandbox.fivenorth.io" \
  --set "OIDC_ISSUER=…" \
  --set "OIDC_TOKEN_URL=…" \
  --set "OIDC_JWKS_URL=…" \
  --set "OIDC_CLIENT_ID=validator-devnet-m2m" \
  --set "OIDC_CLIENT_SECRET=…" \
  --set "OIDC_AUDIENCE=…" \
  --set "OIDC_OPERATOR_PARTY=…" \
  --set "COMPLIANCE_PARTY=…" \
  --set "COMPLIANCE_TOKEN=…" \
  --set "UMBRA_PACKAGE_ID=…" \
  --set "UMBRA_PACKAGE_NAME=umbra-sealed-auction" \
  --set "NIXPACKS_NODE_VERSION=20"

railway up                   # build + deploy
railway domain               # mint the public URL → https://<service>.up.railway.app
```

Set `CORS_ORIGIN` once you know the Vercel URL (step 4), then redeploy or
`railway variables --set "CORS_ORIGIN=https://<your-app>.vercel.app"`.

### 3.3 Verify the solver

```bash
S=https://<service>.up.railway.app

curl -s $S/health                                   # {"status":"ok",…}
curl -s -X POST $S/sandbox/round -H 'content-type: application/json' -d '{}'
#   → clearingPrice 100, allocations A=10 / B=8 / C=2   ← the §4 fixture, deterministic

curl -s $S/cn/devnet/v2/state/ledger-end             # NO Authorization header sent
#   → {"offset":…}   ← proves server-side injection works
```

---

## 4. Deploy the web to Vercel

### 4.1 Build settings

`web/vercel.json` pins them (no secrets in it):

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework | Vite |
| Install Command | `npm install --legacy-peer-deps` (the `@daml/react`-era peer range) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

`npm run build` runs `prebuild` → `web/scripts/ensure-tokens.mjs`, which materialises the
gitignored `web/src/tokens.json` from the committed, **token-free**
`web/src/parties.default.json` (or from a `UMBRA_PARTIES` env var). That script **refuses to
write a `token` field**, so a clean clone builds and a credential still cannot enter the bundle.

### 4.2 Env vars

**Exactly one is required:**

| Variable | Value | Environments |
| --- | --- | --- |
| `VITE_SOLVER_URL` | `https://<service>.up.railway.app` (no trailing slash) | Production, Preview |

Optional: `UMBRA_PARTIES` (a JSON party map, if the DevNet parties differ from the committed
defaults), `VITE_LEDGER_BASE_URL` (only for a split deployment where the ledger proxy is not
co-hosted with the solver), `VITE_UMBRA_PACKAGE_NAME`, `VITE_ROUND_ID`.

**No secret ever goes into a `VITE_*` variable** — Vite inlines them into the client bundle.

### 4.3 Commands

```bash
cd web
vercel login
vercel link
vercel env add VITE_SOLVER_URL production      # paste the Railway URL
vercel env add VITE_SOLVER_URL preview
vercel deploy --prod
```

Then close the loop: `railway variables --set "CORS_ORIGIN=https://<the-vercel-url>"`.

---

## 5. Verify the live link (the money shot)

1. Open the Vercel URL. The three desk columns populate → the ledger proxy is reachable and
   the party filters are being honoured.
2. **DevTools → Network:** no request carries an `Authorization` header, and no JWT appears in
   the JS bundle (`view-source`, search `eyJ`). The credential is server-side.
3. **01 Privacy → Try to Peek:** pick a rival, ATTEMPT PEEK → the response pane shows the raw
   `404 CONTRACT_EVENTS_NOT_FOUND` and the verdict row reads
   `404 — LEDGER REFUSED THE READ · NOT AN INFORMEE`.
4. Seal three orders (A Buy 10 @101 · B Sell 8 @99 · C Sell 5 @100), close the round, run
   solve-preview → **$100.00**, then settle → fills **A=10 / B=8 / C=2**, one atomic DvP tx.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Desk columns empty, browser console shows a CORS error | `CORS_ORIGIN` does not include the Vercel origin | `railway variables --set "CORS_ORIGIN=https://<app>.vercel.app"` |
| Ledger calls return **502 `LEDGER_AUTH_UNAVAILABLE`** | The proxy could not mint a bearer — OIDC vars wrong/missing | Check `OIDC_*` on Railway; the solver never echoes the underlying error (by design) |
| Ledger calls return **502 `LEDGER_UNREACHABLE`** | The validator is down or `JSON_API_URL` is wrong | Curl the validator directly |
| Ledger calls **404** on a path you expected to work | Not on the proxy's allow-list | By design — add it to `LEDGER_PROXY_ROUTES` deliberately, never as a wildcard |
| Peek returns 200 with a rival's contract (`VERDICT_LEAK`) | A real privacy regression | Stop. Check that the proxy is not rewriting `filtersByParty` and that the round's parties are correct |
| Vercel build fails on `tokens.json` not found | `ensure-tokens.mjs` did not run | Confirm Build Command is `npm run build` (not `vite build`, which skips `prebuild`) |
| Solver boots but binds 4100 on Railway | `PORT` was set manually, or an old build | Unset `PORT`; Railway injects it |
