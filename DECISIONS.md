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

---

## D7 — Round.Clear locates Assets via additive choice fields (Option B), not a contract key

**Decision:** `Round.Clear` **receives** the `ContractId`s it operates on as
**additive choice fields** (Option B) rather than looking them up on-ledger.

**Why a lookup is impossible inside the choice:** Daml choice bodies run in the
`Update` monad and **cannot `query` the ACS**. `query` / `queryContractId` /
`queryFilter` are `Daml.Script`-only functions (the `Script` monad); they are not
in scope inside a choice and would not type-check there. A choice body may only
`fetch` / `exercise` / `create` / `archive` contracts for which it already holds a
`ContractId` (or contract key). Therefore `Round.Clear` must be **given** the
`Order` and `Asset` references it settles.

**Option B (ADOPTED) — additive choice fields.** The `Clear` choice keeps its
frozen shape (`clearingPrice : Decimal`, `allocations : [Allocation]`,
`controller operator`, returning `ClearResult`) and **adds** purely-additive
settlement-input fields:

- `orderCids : [ContractId Order]` — the round's sealed orders (operator is signatory),
- `buyerUsdcCid : ContractId Asset` — the buyer's USDCx holding to debit,
- `sellerBondCids : [(Party, ContractId Asset)]` — each seller's BONDX holding to debit.

The caller — the Daml Script test now, the TS solver service in Phase 4 — locates
these contracts by `query` at the **Script / service tier** (where `query` is
valid) and passes the `ContractId`s in. `Round.Clear` stays a pure
verifier+settler of its inputs.

**This does NOT break the cross-layer contract.** The named frozen fields
(`clearingPrice`, `allocations`, controller `operator`, return `ClearResult`) are
**unchanged**, and the `Allocation` and `ClearResult` **data shapes are
byte-unchanged**. The new fields are *purely additive* settlement inputs — they do
not alter the existing cross-layer surface that downstream codegen (P3+) and the
TS solver (P4) depend on. The Phase-1 `Asset` template is left **byte-untouched**.

**Rejected fallback — Option A (contract key on `Asset`).** Add
`key (operator, owner, symbol)` + `maintainer operator` to `Asset` and use
`fetchByKey` / `exerciseByKey` inside `Clear`. **Rejected** because it mutates the
Phase-1-frozen `Asset` template, and because settlement Splits/Reassigns create
multiple same-symbol Assets per owner — risking a `DuplicateKey` error unless every
credit is `Merge`d back to one-per-key, adding avoidable complexity. Option B keeps
the frozen template intact and matches spec §9's "solver output, verified
on-ledger" framing. (Per 02-CONTEXT phase_critical_constraint 2; 02-RESEARCH
Open Question 1 / Assumptions A1–A2.)

---

## D8 — Migrated to Daml 3.4.11 + Canton LocalNet + JSON Ledger API v2 (supersedes D2)

**Decision:** after the 2.10.4 vertical slice worked, **migrate the live stack to
real multi-node Canton** — the §19 stretch D2 deferred. Daml **3.4.11**, the
cn-quickstart **Canton LocalNet** (Canton 3.4.8: 3 participants + global
synchronizer + Splice), and the **JSON Ledger API v2**.

- **Daml port:** the templates are LF-standard and compiled **unchanged** on the
  3.x line; the only source delta was the Script party allocation
  (`allocatePartyWithHint <name> (PartyIdHint h)` → `allocatePartyByHint
  (PartyIdHint h)` — display names were removed in Daml 3.x). `daml test` is green
  on 3.4.11; the §4 fixture still clears at $100.00. The 2.x build is preserved at
  git tag `sandbox-mvp` (restore `daml/daml.yaml` from there).
- **v2 wire encoding** (proven live): Int/Decimal accept JSON numbers on input and
  return as **strings** on output (Numeric zero-padded to scale, e.g.
  `"101.0000000000"` → coerce with `Number()`; the web shim trims trailing zeros
  for display); enums are strings; Time is ISO-8601; a Daml tuple is `{_1,_2}`;
  templateIds use the package-name form `#umbra:Module:Entity`.

This **supersedes D2** (which chose the 2.x HTTP JSON API v1 and explicitly deferred
3.x). D1/D3/D4 (the 2.x SDK pin, the `@daml/react` peer-dep, `daml start`
parties.json) apply only to the `sandbox-mvp` tag now.

---

## D9 — LocalNet auth: unsafe-jwt-hmac-256, dev-only (extends D5)

The cn-quickstart participants run the ledger API in **`unsafe-jwt-hmac-256`** mode:
an **audience-based** dev JWT `{ sub, aud }`, HS256-signed with the shared secret
**`unsafe`**, audience **`https://canton.network.global`**. `sub` is a Canton user
id; party rights (`actAs`/`readAs`) come from **user management**, not token claims —
so every party needs a user with granted rights (`POST /v2/users/{id}/rights`). The
per-participant admin user is `ledger-api-user`. Minted by
`scripts/localnet/mint-jwt.mjs`. As with D5, this is **dev-only** — the unsafe HMAC
secret must never be used outside the LocalNet.

---

## D10 — Solver + frontend rewired to the v2 API (the @daml/react shim)

**Solver:** `solver/src/ledger.ts` was rewritten from `@daml/ledger` (HTTP JSON API
v1) to the v2 API (`POST /v2/commands/submit-and-wait` + `POST
/v2/state/active-contracts`), **keeping the same exported surface** so `api.ts` /
`index.ts` are unchanged. Verify-don't-trust is intact (the on-ledger `Round.Clear`
re-verifies §8). 36/36 solver tests green.

**Frontend:** `@daml/react` has no v2 equivalent, so `web/src/ledger/v2react.tsx` is
a **drop-in shim** — `createLedgerContext` with the identical hook surface
(`DamlLedger` / `useStreamQueries` / `useLedger`), backed by v2 polling. All nine
desk components (and the pixel-accurate design) are **byte-unchanged**; only
`ledgerContexts.ts` swaps its import. The `@daml.js` bindings are kept as the typed
Daml schema (template/choice companions + the `Side` enum). The Vite proxy sends
`/v2` to the participant; each desk forwards its own JWT.

---

## D11 — §19 true cross-node privacy: desks on separate participants

Desks can be hosted on **different participant nodes** (`bankA` → app-user :2975,
`bankB` → sv :4975, `bankC` → app-provider :3975). Each desk submits its sealed
order **from its own node** (a two-participant Canton transaction co-signed by the
operator); the order then physically lives **only on its stakeholders' nodes** — a
rival desk's node never stores it. The operator co-signs every contract, so
**`Round.Clear` settles from the operator's node unchanged** (the solver needs no
cross-node logic). The browser routes per-desk via Vite proxies (`/cn/app-user` →
:2975, `/cn/sv` → :4975) selected by a `base` field in `tokens.json`
(`httpBaseUrlFor`); backward-compatible (no `base` → single-node).

**One prerequisite this surfaced:** the DAR must be **vetted on every participant
hosting a stakeholder**, or Canton refuses to route the transaction
(`PACKAGE_SELECTION_FAILED`). `deploy.mjs` uploads to all three. Driven by
`scripts/localnet/xnode-up.mjs` (browser) and `xnode-moneyshot.mjs` (headless full
flow); both verified settling to the exact §4 balances across nodes.

---

## D12 — CRYP-01 commit–reveal binding is enforced ON-LEDGER via `DA.Crypto.Text.sha256` (alpha)

**Decision (Phase 10, plan 10-01):** The commitment↔reveal binding is enforced
**on-ledger** — the strongest of the CONTEXT.md options. `OrderCommitment.RevealOrder`
recomputes `sha256(toHex(canonicalOrder ‖ salt))` inside the choice body and
`assertMsg`s equality against the stored `commitment : Text`, so **the ledger
itself** (not the operator, not the solver) rejects any reveal that does not match
the commitment. The hashing primitive is Daml 3.4.11's bundled
`DA.Crypto.Text.sha256` / `toHex`.

**Alpha label (honest):** `DA.Crypto.Text` carries a `{-# WARNING … alpha … can
change without notice #-}`. It is **not** `-Werror`'d away — the single alpha
warning is suppressed via `daml/daml.yaml` `build-options: [-Wno-crypto-text-is-alpha]`
(the bare damlc flag; the `--ghc-option=` form is rejected as "unrecognised warning
flag"). The SDK is pinned at `3.4.11`, so a future SDK bump that changes the alpha
API is a documented watch item (threat T-10-05, disposition *accept*).

**Canonical serialization (Pitfall 1 + 2):** a SINGLE `serializeOrder` renders the
full Phase-9 order (`side`, `quantity`, `limit` at a pinned 2-dp scale, `orderType`,
explicit `Some`/`None` tokens for `minQty`/`firmIf`) with an injective `|<tag>=`
delimiter, and is shared by commit and reveal. `sha256` requires HEX input, so the
UTF-8 payload is `toHex`-encoded FIRST.

**Bond custody = operator-custody LOCK (deviation from the plan's escrow-by-reassign):**
the bond is the desk's OWN USDCx `Asset`. The operator is already that Asset's sole
signatory/custodian and every Asset choice is `controller operator`, so while the
commitment is live the desk cannot move or archive its bond — it is locked in
operator custody. A valid reveal releases the lock (consumes the `OrderCommitment`);
`ForfeitBond` (controller operator) seizes the bond on non-reveal. The plan's
"reassign the bond to the operator at commit" is **not viable**: an operator-OWNED
Asset is invisible to the desk (Asset's observer is `owner` only), so the desk's
`controller desk` `RevealOrder` could not `fetch` it ("contract not visible to the
reading parties"). The lock model gives the identical economic guarantee within
Daml's disclosure rules and keeps the `Asset` settlement primitive byte-unchanged.

**§4 invariant preserved:** `Round.Clear` and the §8 clearing math
(`Umbra.Clearing`) are byte-unchanged — the binding lives entirely in
`RevealOrder`/`ForfeitBond` and the `Venue.CommitOrder` lock. The canonical fixture
still clears **$100.00 / A=10 / B=8 / C=2** through commit → reveal → clear
(`test_commit_reveal_clears_at_100`).

## CRYP-02 — Timelock module (`solver/src/tlock.ts`)

**drand endpoint + chain (env-overridable):** the primary timelock rides drand
**quicknet** — URL `https://api.drand.sh`, chain hash
`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`, period 3s,
genesis 1692803367, scheme `bls-unchained-g1-rfc9380` (RFC9380 unchained). Resolved
via `DRAND_URL` / `DRAND_CHAIN_HASH` (mirroring `ledger.ts` PARTICIPANT resolution);
the quicknet default uses tlock-js `mainnetClient()` directly, a custom hash builds an
`HttpCachingChain`. `tlock-js@0.9.0` is CommonJS — imported by named CJS interop
(`defaultChainOptions` is NOT exported; use `mainnetClient()`).

**The guarantee is cryptographic, not app-level:** a payload sealed to a FUTURE round is
undecryptable by ANYONE holding the ciphertext (operator/solver included) until that
round's threshold beacon publishes — `timelockOpen` throws `"too early"` before it, and
recovers the EXACT payload after. Determinism in CI is achieved with a locally-signed
BLS12-381 chain (a "mocked beacon"), not live quicknet; the real-time quicknet round-trip
is an **end-of-phase human-verify**.

**Offline fallback trust nuance (threat T-10-09, disposition ACCEPT):** when quicknet is
unreachable, `timelockSeal` drops to a LOCAL held-key AES-256-GCM seal and flags
`mode: 'offline'` + the literal label **`OFFLINE FALLBACK · WEAKER THAN DRAND`**. This is
materially weaker — a single module-private server key gates it, with NO threshold
guarantee. It is a liveness backstop for the demo, never the security claim.

**Secret handling (threat T-10-08, mirrors `proof.ts`/`ledger.ts`):** the offline key is
module-private (`node:crypto` `randomBytes`), NEVER exported/returned/logged; the drand
path holds no long-term secret (the beacon is public). A secret-sweep test asserts no
key/salt appears in any result, thrown error, or module export.

---

## D13 — Settlement-standard provenance (Phase 11, DFIN-01) — RESOLVED: CN TOKEN STANDARD (CIP-0056)

**Decision:** Umbra's new custody `Holding` (`daml/Umbra/Holding.daml`) **implements the real
Canton Network Token Standard (CIP-0056) interface** `Splice.Api.Token.HoldingV1.Holding`. The
authorized on-screen / on-ledger settlement provenance tag is therefore:

> **`CN TOKEN STANDARD (CIP-0056)`**

**Why this path (not the plain in-repo fallback):** the CN Token Standard interface DARs
(`splice-api-token-metadata-v1-1.0.0.dar`, `splice-api-token-holding-v1-1.0.0.dar`) are present
on this box (copied from `cn-quickstart/quickstart/daml/dars/` into `daml/vendor/`, wired as
`data-dependencies` in `daml/daml.yaml`). `HoldingV1.Holding` is a **pure view interface**
(`viewtype HoldingView`, **no choices**), so conformance is a total projection of our custody
fields onto `HoldingView` — it needs **no registry/factory context** (11-RESEARCH A1). The build
is green (`daml build` ✓) and every existing `daml test` passes, so the interface-conformance
spike did **not** exceed budget; the plain in-repo fallback (`DAML-FINANCE-PATTERN (IN-REPO)`) was
**not** needed. Field mapping: our `InstrumentId {issuer, id}` → `HoldingV1.InstrumentId
{admin, id}` (operator-custody: issuer is the registry admin); `lock : Optional Text` → the
standard `HoldingV1.Lock` held by the operator, reason carried in `context`; `meta =
emptyMetadata`.

**HARD honesty rule (non-removable):** nothing in this project may EVER be labeled
**"Daml Finance the library."** Daml Finance's latest packages are pinned to SDK 2.10.0 / Daml
**LF 1.17**; Umbra runs **LF 2.1** (SDK 3.4.11, D8). No Daml Finance 3.x release exists and its
LF-1.17 DARs cannot be vetted on the LF-2.1 participants. The only permitted provenance tags are
`CN TOKEN STANDARD (CIP-0056)` (real interface conformance — the shipped path) or, if a future
change loses interface conformance, `DAML-FINANCE-PATTERN (IN-REPO)` (a plain in-repo faithful
layer). Any `daml-finance-*.dar` in `daml.yaml` is forbidden (it would fail vetting — 11-RESEARCH
Pitfall 1). This mirrors the Phase-10 honesty-label bar (D12): a real, correct-line standard
honestly labeled beats a broken/faked import.

**Recorded boundaries (honest scope):**
- **Wallet interoperability ≠ interface conformance** (11-RESEARCH Open Q1). Implementing
  `HoldingV1`/`MetadataV1` gives real interface conformance and honest provenance, but an
  Umbra-issued instrument is **not** registry-recognized by external Amulet/wallet tooling —
  that needs a registry participant/app (Track B / Phase 12). Do NOT claim wallet interop.
- **Full `AllocationV1` DvP conformance is out of this phase's budget** (11-RESEARCH A2). This plan
  ships `HoldingV1`/`MetadataV1` conformance; the atomic allocate→approve→settle finality flow is
  an in-repo `Batch`/`Instruction` (later Phase-11 plan), not the standard's `AllocationV1`
  interface. Upgrading to full `AllocationV1`/`AllocationInstructionV1` conformance is a strictly
  better follow-up if cheap.
- **Vendored DARs are committed** via a `.gitignore` negation (`!daml/vendor/*.dar`) so a fresh
  clone can `daml build`; they are official Splice/Canton Foundation artifacts already vetted on
  all three LocalNet participants (no npm/PyPI supply-chain step — 11 threat register T-11-01-SC,
  disposition *accept*).
