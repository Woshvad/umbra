---
phase: 11-settlement-institutional-grade
plan: 03
subsystem: solver-topology-guest-onboarding
tags: [WOW-07, VIZ-03, topology, guest, isLocal, credential-free, cn-localnet]
requires:
  - scripts/localnet/xnode-up.mjs (provisionDesk allocate→user→rights + isLocal probe pattern)
  - scripts/localnet/mint-jwt.mjs (mintJwt HS256 {sub,aud}, secret unsafe)
  - solver/src/ledger.ts (operator-token module-privacy convention, SOLV-04)
  - solver/src/api.ts (wrap + read-only passthrough route idiom) + solver/src/index.ts (buildDeps DI)
provides:
  - solver/src/topology.ts (hostingMap() — per-participant /v2/parties isLocal probe → TopologyResult)
  - "GET /round/:id/topology (credential-free) + GET /guest/bootstrap on api.ts"
  - AppDeps.hostingMap / AppDeps.onboardGuest + GuestBootstrap type
  - scripts/localnet/guest-onboard.mjs (bankD party + user + rights + scoped token → tokens.json)
affects:
  - solver/src/api.ts (2 additive routes, AppDeps extended)
  - solver/src/index.ts (real topology probe + guest bootstrap wiring; optional buildDeps args)
  - solver/src/api.test.ts (+4 tests)
tech-stack:
  added: []
  patterns:
    - "credential-free solver endpoint — admin bearer lives only in the injected probe closure, never in the response (SOLV-04)"
    - "demo-real honesty flag: SAME PARTICIPANT (LOCALNET) when all desks map to one participant (Pitfall 7)"
    - "guest scoped token written ONLY to tokens.json — never in a GET body / URL / QR (T-11-03-QR)"
key-files:
  created:
    - solver/src/topology.ts
    - solver/src/topology.test.ts
    - scripts/localnet/guest-onboard.mjs
  modified:
    - solver/src/api.ts
    - solver/src/index.ts
    - solver/src/api.test.ts
decisions:
  - "hostingMap DI probe (base → PartyDetail[]) so the unit test stubs /v2/parties with no live network"
  - "demoReal = distinct hosting participants ≤ 1; nodes = only participants hosting ≥1 focused desk party"
  - "topology endpoint round-scoped (GET /round/:id/topology) mirroring /proof; guest bootstrap standalone (GET /guest/bootstrap)"
  - "guest co-hosted on app-user (:2975) — no genuine 4th validator on LocalNet (recorded live-UAT limitation)"
metrics:
  duration: ~10 min
  tasks: 3
  files: 6
  completed: 2026-07-10
---

# Phase 11 Plan 03: Guest Onboarding + Topology Machinery (WOW-07 / VIZ-03) Summary

The off-ledger machinery for the 4th-desk guest join (WOW-07) and the three-node topology
view (VIZ-03): a credential-free `hostingMap()` that probes each participant's
`/v2/parties` `isLocal` flag into an honest party→participant map (demo-real flagged), a
pair of credential-free solver endpoints (`GET /round/:id/topology` + `GET /guest/bootstrap`),
and a `guest-onboard.mjs` script that provisions `bankD` + a scoped HS256 token into
`tokens.json` — with the token NEVER crossing a GET body, URL, or QR. Independent of the
settlement migration (no new Daml shape), so it ran clean in Wave 1. Full solver suite
**134/134 green**, `tsc` clean; the five §11 endpoints + `/settle` are byte-unchanged
(0 deletions in `api.ts`).

## What Was Built

### Task 1 — `topology.ts` + `topology.test.ts` (commit `9b85a23`)
- **`hostingMap(probe, { participants?, desks? })`** — a pure-over-the-injected-probe function
  that, for each participant (`app-user` :2975, `app-provider` :3975, `sv` :4975), calls the
  injected `probe(base)` (the real one wraps `GET /v2/parties`) and records, per party, the
  participant(s) where `isLocal:true`. Returns `TopologyResult { nodes, perParty, demoReal,
  caption }`.
- **`demoReal`** = the set of distinct hosting participants ≤ 1 → `true` with the
  `SAME PARTICIPANT (LOCALNET)` caption (the HARD honesty signal, Pitfall 7); genuinely
  distributed A/B/C across three participants → `false` + `DISTRIBUTED (MULTI-NODE)`. `nodes`
  contains only participants that host ≥1 focused desk party (single node when demo-real,
  three when distributed). The `desks` focus keeps the map about DESK residency, not each
  participant's own admin party.
- **Credential-free boundary (SOLV-04 / T-11-03-LEAK):** the admin bearer lives only inside
  the injected probe closure; the returned structure carries only party ids + participant ids
  + caption + booleans. **Live-ledger-optional:** a probe rejection (a down participant) is
  caught per-participant and contributes NO rows — the map degrades honestly rather than
  fabricating residency.
- **`topology.test.ts` (4 tests):** (a) all-desks-on-one → `demoReal:true` + single node;
  (b) distributed → `demoReal:false` + three nodes; (c) secret sweep — the sentinel bearer the
  probe closes over never appears in the result (nor `Bearer`/`token` strings); (d) a non-local
  party is excluded and a down participant fabricates nothing.

### Task 2 — topology + guest endpoints on `api.ts`, real wiring in `index.ts` (commit `4ddc055`)
- **`AppDeps.hostingMap: () => Promise<TopologyResult>`** and **`AppDeps.onboardGuest: () =>
  Promise<GuestBootstrap>`** added; new **`GuestBootstrap { party, joinUrl, roundId }`** type
  (NO token field by construction).
- **`GET /round/:id/topology`** — credential-free read-only passthrough (mirrors the `/proof`
  route idiom) returning `{ roundId, ...hostingMap() }`.
- **`GET /guest/bootstrap`** — returns the guest `/join` bootstrap (party + `/join?round=<id>`
  URL + roundId); side-effect-free (party allocation is the script's job) and token-free
  (T-11-03-QR).
- **`index.ts` real wiring:** `hostingMap` builds a probe that `GET /v2/parties` with the admin
  bearer read from `scripts/.operator-token` (the same `ledger-api-user` token `xnode-up.mjs`
  uses across all three participants) — held ONLY in the closure — focused on the deploy desk
  parties (`daml/parties.json` bankA/B/C + bankD when present). `onboardGuest` reads the guest
  party from `web/src/tokens.json` (never its token) and composes the `/join` deep-link, picking
  a live Open round (degrades to `R1`). Both added as **optional** `BuildDepsArgs` with inert
  secret-free defaults (mirrors the `readProofBundle`/crypto pattern) so `index.test.ts` stays
  green with no injection.
- **`api.test.ts` +4:** topology single-participant (caption asserted), topology distributed
  (three nodes), guest bootstrap (party+URL+roundId, asserts NO `token`/`jwt` field), and a
  combined secret sweep proving neither response carries the operator token, `ANTHROPIC_API_KEY`,
  or a sentinel scoped guest token.

### Task 3 — `guest-onboard.mjs` (commit `4c47830`)
- Mirrors `xnode-up.mjs`'s `provisionDesk` verbatim: allocate `bankD` via `POST /v2/parties`,
  create `umbra-bankD` user, grant `CanActAs`/`CanReadAs`, mint the scoped token via
  `mintJwt('umbra-bankD')`, and **MERGE** a `bankD { party, token, base:'/cn/app-user' }` entry
  into `web/src/tokens.json` in the identical shape to bankA/B/C (existing desks untouched).
- **Co-hosted on app-user (:2975)** — LocalNet has only three participants, so a genuine 4th
  validator is the recorded live-UAT limitation, printed by the script.
- **Token discipline (T-11-03-QR):** the scoped token is written ONLY into `tokens.json`; it is
  NEVER printed to stdout (so it can't be copied into a QR) and NEVER embedded in a URL. The
  script prints only the truncated party id + base. Idempotent (skips if `bankD` already in
  `tokens.json`). CLI-entrypoint-guarded; `node --check` exits 0.

## Verification

| Check | Result |
|-------|--------|
| `cd solver && npx vitest run topology` | ✅ 4/4 green |
| `cd solver && npx vitest run` | ✅ **134/134 green** |
| `cd solver && npx tsc --noEmit` | ✅ exit 0 |
| `node --check scripts/localnet/guest-onboard.mjs` | ✅ `GUEST_ONBOARD_OK` |
| topology secret sweep (no bearer/token in result) | ✅ |
| guest bootstrap carries NO token/jwt field | ✅ |
| api secret sweep (operator token / API key / scoped guest token) | ✅ absent from both responses |
| five §11 endpoints + `/settle` byte-unchanged | ✅ 0 deletions in `api.ts` (additive only) |

## Deviations from Plan

**None that change intent.** Two discretion points resolved:
1. **Guest bootstrap route = `GET /guest/bootstrap`** (the plan offered `POST /guest/onboard` OR
   `GET /guest/bootstrap`). Chose the credential-free, side-effect-free GET — party allocation is
   the `guest-onboard.mjs` job, so the endpoint is a pure read. The topology route is round-scoped
   (`GET /round/:id/topology`) per the must_haves artifact.
2. **`hostingMap` returns an added `caption` field** (beyond the plan's `{ nodes, perParty,
   demoReal }`). It is the pre-computed honesty caption (`SAME PARTICIPANT (LOCALNET)` /
   `DISTRIBUTED (MULTI-NODE)`) the VIZ-03 view will render — a strictly additive convenience,
   still secret-free.

## Honest Limitations / Boundaries (recorded)

- **No genuine 4th validator.** The guest is co-hosted on an existing participant (app-user);
  LocalNet has three participants only. The topology view labels this
  `DEMO-REAL · SINGLE-OPERATOR LOCALNET`; a real 4th institution is a live-UAT item.
- **Live probe is UAT.** `topology.test.ts` proves `hostingMap` over a stubbed `/v2/parties`;
  the real 3-node hosting map + real guest onboarding require a booted LocalNet
  (:3975/:2975/:4975) and are enumerated as live-UAT below. All unit behavior is green offline.
- **Not-yet-consumed.** The `07 Topology` view, the `/join` mobile route, `QrJoin`, and the
  `bankD` desk context/token wiring in `web/` are downstream plans (this plan is the off-ledger
  machinery only). `web/src/tokens.json` gains a `bankD` entry only after a live guest-onboard run.

## Live-UAT Checklist (deferred — needs a booted LocalNet)

1. `node scripts/localnet/xnode-up.mjs` (distributed) then boot the solver → `GET
   /round/R1/topology` returns `demoReal:false` with three nodes (A@app-user, B@sv,
   C@app-provider); the default single-node seed returns `demoReal:true` + `SAME PARTICIPANT
   (LOCALNET)`.
2. `node scripts/localnet/guest-onboard.mjs` → `web/src/tokens.json` gains a `bankD { party,
   token, base }` entry; re-running skips idempotently; the token appears only in the file, never
   in stdout.
3. `GET /guest/bootstrap` returns the guest party + `/join?round=<id>` + roundId with no token.

## Notes for Downstream Plans

- The `07 Topology` view consumes `GET /round/:id/topology` → `{ nodes, perParty, demoReal,
  caption }`; render the HARD non-removable `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge whenever
  `demoReal` (Pitfall 7).
- The `/join` view + `QrJoin` consume `GET /guest/bootstrap`; the QR encodes `joinUrl` only. The
  guest token is read from `tokens.json` (the same D6 boundary as A/B/C), added to
  `ledgerContexts.ts` (`ctxD = make('bankD')`) + `desks.ts`.
- Guest eligibility (`DeskEligibility` for bankD) + the §4-guest seed are the Setup/Compliance
  plan's job — `guest-onboard.mjs` provisions the party + token only.

## Self-Check: PASSED
- Created files exist: `solver/src/topology.ts`, `solver/src/topology.test.ts`,
  `scripts/localnet/guest-onboard.mjs` — all FOUND.
- Commits exist: `9b85a23` (Task 1), `4ddc055` (Task 2), `4c47830` (Task 3) — all FOUND in git log.
- Suites green: `npx vitest run` 134/134, `tsc --noEmit` exit 0, `node --check` OK.
