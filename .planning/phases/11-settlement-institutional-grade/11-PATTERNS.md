# Phase 11: Settlement & Institutional Grade - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 22 (new + modified)
**Analogs found:** 22 / 22 (all in-repo; CN Token Standard interfaces are the only external reference)

> Settlement target is the **CN Token Standard (CIP-0056)** `splice-api-token-*` interfaces implemented by in-repo templates — NOT the Daml Finance library (unbuildable on LF 2.1 / SDK 3.4.11 per 11-RESEARCH). Provenance tag reads `CN TOKEN STANDARD (CIP-0056)` or the fallback `DAML-FINANCE-PATTERN (IN-REPO)`; **never `DAML FINANCE`.** Every analog below is a real, already-shipping Umbra file — the executor mirrors these, not a hypothetical library.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `daml/Umbra/Instrument.daml` (NEW) | model | CRUD/custody | `daml/Umbra/Asset.daml` | role-match |
| `daml/Umbra/Holding.daml` (NEW) | model | CRUD/custody | `daml/Umbra/Asset.daml` (+ bond-lock in `OrderCommitment`) | exact |
| `daml/Umbra/Settlement.daml` (NEW) | model/service | batch/transform | `Round.Clear` settle legs + `moveExact` (`Auction.daml:42-49, 367-423`) | role-match |
| `daml/Umbra/Compliance.daml` (NEW) | model | keyed-lookup gate | `RoundStats` (keyed shape) + `fetchByKey` gate pattern | role-match |
| `daml/Umbra/Auction.daml` (EDIT) | model | batch/transform | its own `Round.Clear` body (`Auction.daml:323-478`) | self |
| `daml/Umbra/Roles.daml` (EDIT) | model | request-response gate | its own `SubmitOrder`/`CommitOrder` (`Roles.daml`) | self |
| `daml/Umbra/Setup.daml` (EDIT) | config/seed | batch | `seedCommitRevealRound`/`initialize` (`Setup.daml`) | self |
| `daml/Umbra/Tests.daml` (EDIT) | test | batch | existing `test_*` scripts + `CommitRevealSeed` | self |
| `daml/Umbra/Clearing.daml` | model | transform | UNCHANGED (§8 already multi-buyer-general) | n/a |
| `solver/src/ledger.ts` (EDIT) | service | request-response | its own `settle()` (`ledger.ts:332-399`) | self |
| `solver/src/auction.ts` (EDIT) | service | transform | existing golden fixtures (mirror only) | self |
| `solver/src/settlement.ts` (NEW) | utility | transform | `Round.Clear` leg build (Daml⇄TS mirror) | role-match |
| `solver/src/topology.ts` (NEW) | service | request-response | `xnode-up.mjs` `isLocal` probe + `ledger.ts` v2 fetch | role-match |
| `solver/src/api.ts` (EDIT) | controller | request-response | its own `app.get/post` + `wrap`/`zod` routes | self |
| `web/src/views/TopologyView.tsx` (NEW) | component/view | streaming/read | `web/src/views/TimeMachineView.tsx` | exact (per UI-SPEC) |
| `web/src/views/JoinView.tsx` (NEW) | component/view | streaming/read | `web/src/views/DeskView.tsx` | exact |
| `web/src/components/QrJoin.tsx` (NEW) | component | render | `qrcode.react` `QRCodeSVG` (external, vetted) | no-analog (lib) |
| `web/src/components/TopologyNode.tsx` (NEW) | component | render | `web/src/components/DeskColumn.tsx` | role-match |
| `web/src/components/OrderTicket.tsx` (reuse) | component | streaming | itself (guest reuses) | self |
| `web/src/views/SettlementView.tsx` (EDIT) | component/view | streaming | itself (provenance/netting/token-agnostic) | self |
| `web/src/{tokens.json,desks.ts,ledgerContexts.ts}` (EDIT) | config/provider | provider | itself (add `bankD`/guest desk) | self |
| `scripts/localnet/guest-onboard.mjs` (NEW) | script | request-response | `scripts/localnet/xnode-up.mjs` + `mint-jwt.mjs` | exact |

## Pattern Assignments

### `daml/Umbra/Holding.daml` (model, custody) — retires `Asset` on the settlement path

**Analog:** `daml/Umbra/Asset.daml` (whole file) + the bond-LOCK model in `OrderCommitment` (`Auction.daml:181-224`).

**Custody template shape to mirror** (`Asset.daml:7-16`):
```daml
template Asset
  with
    operator : Party        -- sole signatory & custodian (MVP simplification)
    owner    : Party        -- the beneficial owner
    symbol   : Text         -- "BONDX" | "USDCx"
    quantity : Decimal      -- >= 0
  where
    signatory operator
    observer owner
    ensure quantity >= 0.0
```
**Change for Holding:** replace `symbol : Text` with `instrument : InstrumentId` (token-agnostic, DFIN-03), add `lock : Optional Lock` (the Phase-10 bond lock migrates here — Pitfall 2), and `interface instance HoldingV1.Holding for Holding`. **Do NOT add a contract key** (D7/RESEARCH anti-pattern: splits create duplicate same-key holdings).

**Split/Reassign choices to mirror** (`Asset.daml:22-48`) — operator-authority-alone, conservation-preserving:
```daml
    choice Split : (ContractId Asset, ContractId Asset)
      with splitQty : Decimal
      controller operator
      do
        assertMsg "splitQty out of range" (splitQty > 0.0 && splitQty < quantity)
        a <- create this with quantity = splitQty
        b <- create this with quantity = quantity - splitQty
        pure (a, b)
    choice Reassign : ContractId Asset
      with newOwner : Party
      controller operator
      do create this with owner = newOwner
```
**Bond-lock reference** — the OrderCommitment currently locks the desk's own USDCx `Asset` via operator-custody (`Auction.daml:181-224`, `bondCid : ContractId Asset` → migrates to `ContractId Holding`; `ForfeitBond` reassigns to operator). Keep `RevealOrder`'s sha256 re-check byte-unchanged.

---

### `daml/Umbra/Settlement.daml` (service/model, batch) — Batch/Instruction allocate→approve→settle

**Analog:** `Round.Clear`'s settlement legs + the top-level `moveExact` helper (`Auction.daml:42-49`).

**Per-leg move helper to mirror** (`Auction.daml:42-49`) — full-move-vs-split rule (Split is strict `<`):
```daml
moveExact : ContractId Asset -> Decimal -> Party -> Update (ContractId Asset)
moveExact cid qty newOwner = do
  holding <- fetch cid
  if qty == holding.quantity
    then exercise cid Reassign with newOwner
    else do
      (slice, _remainder) <- exercise cid Split with splitQty = qty
      exercise slice Reassign with newOwner
```
**Cash-leg threading pattern to mirror** (`Auction.daml:407-423`) — fold across sellers threading the buyer's remainder cid. Generalize to N buyers × M sellers by building `[Instruction]` first (netted per `(party, instrument)`, default on), then executing each as a Holding transfer **in the one Clear transaction** (atomicity = Daml transactionality; do NOT sequence separate transactions).

**Instruction data shape** (RESEARCH Pattern 2):
```daml
data Instruction = Instruction with
    sender : Party; receiver : Party; instrument : InstrumentId; amount : Decimal
  deriving (Eq, Show)
```
**Conservation asserts** replace the deleted single-buyer guard — see the Auction.daml edit below.

---

### `daml/Umbra/Auction.daml` (EDIT, batch) — generalize `Round.Clear`

**Analog:** its own `Round.Clear` body (`Auction.daml:323-478`). Steps 0-1 (lifecycle guard + recompute-§8-and-assert, `Auction.daml:333-365`) are **UNCHANGED in intent** (verify-don't-trust keystone).

**DELETE the single-buyer guard** (`Auction.daml:379-382`):
```daml
        let fundedBuyers = dedup [ a.desk | a <- allocations, a.side == Buy, a.filledQty > 0 ]
        buyer <- case fundedBuyers of
          [b] -> pure b
          _   -> abort "Clear: settlement requires exactly one funded buyer (MVP single-buyer invariant)"
```
**REPLACE with** a general Batch build from the verified allocation + per-instrument conservation asserts (RESEARCH Code Example; the existing Σbuy==Σsell defense-in-depth at `Auction.daml:362-365` is the pattern to generalize per-instrument):
```daml
forA_ instruments $ \inst ->
  assertMsg ("conservation violated for " <> show inst)
    (sum [ l.amount | l <- legs, sameInst l inst, isReceive l ]
     == sum [ l.amount | l <- legs, sameInst l inst, isDeliver l ])
```
**Signature change:** replace `buyerUsdcCid : ContractId Asset` / `sellerBondCids : [(Party, ContractId Asset)]` with the Holding-cid inputs, and ADD a `cashInstrument : InstrumentId` choice arg (DFIN-03 — no hardcoded `"USDCx"`; today it is a literal at `Auction.daml:406`). Keep the `Retire` loop (`Auction.daml:430`) and the per-desk `TradeConfirmation` create with the on-ledger `surplusVsLimit >= 0` assert (`Auction.daml:435-469`) byte-unchanged.

**§4 stays a pure reduction** (Pitfall 6): A remains sole buyer; the generalized one-buyer batch must reproduce A↔B 8@100 / A↔C 2@100 and $100.00. `test_clears_at_100` is the continuous canary.

---

### `daml/Umbra/Compliance.daml` (NEW, keyed gate) — `DeskEligibility` (COMP-01)

**Analog:** `RoundStats` for the operator-signed/observer-desk shape (`Auction.daml:270-278`); the keyed-fetch gate is the new part (RESEARCH Pattern 3).

**Template** (keyed `(operator, desk)`, maintainer operator):
```daml
template DeskEligibility
  with
    operator : Party; compliance : Party; desk : Party
    accredited : Bool; jurisdiction : Text; sanctionsClear : Bool
  where
    signatory operator, compliance
    observer desk
    key (operator, desk) : (Party, Party)
    maintainer key._1
```
**Gate to insert into `Roles.daml` `SubmitOrder`/`CommitOrder`** (both are `controller desk` with operator authority co-flowing because `Venue` is `signatory operator` — Pitfall 3, so the keyed fetch is authorized):
```daml
    (_, elig) <- fetchByKey @DeskEligibility (operator, desk)
    assertMsg "desk not eligible (accreditation/jurisdiction/sanctions)"
      (elig.accredited && elig.sanctionsClear)
```
Mirror the existing `assertMsg "desk not registered" (desk `elem` desks)` guard already at the top of `SubmitOrder`/`CommitOrder` (`Roles.daml`). Enforce the SAME gate at Holding issuance/transfer to the receiving owner.

---

### `daml/Umbra/Setup.daml` (EDIT, seed) — migrate seed to Holdings + eligibility

**Analog:** `mintAsset` (`Setup.daml:39-42`) and `seedCommitRevealRound` (`Setup.daml:184-259`).

**Mint helper to adapt** (`Setup.daml:39-42`):
```daml
mintAsset : Party -> Party -> Text -> Decimal -> Script (ContractId Asset)
mintAsset operator owner symbol quantity =
  submit operator do createCmd Asset with operator, owner, symbol, quantity
```
→ becomes `mintHolding` creating a `Holding` of an `Instrument`. Keep the EXACT §4 quantities (`Setup.daml:59-63`: A=5000 USDCx, B=20 BONDX+1000 USDCx, C=15 BONDX+1000 USDCx). Add A/B/C/guest `DeskEligibility` seeds (all eligible so §4 clears). Adapt the `CommitRevealSeed` gather (`Setup.daml:166-259`) — `bondCid`/`buyerUsdcCid`/`sellerBondCids` become `ContractId Holding`.

---

### `solver/src/ledger.ts` (EDIT, service) — `settle()` builds the Batch submission

**Analog:** its own `settle()` (`ledger.ts:332-399`). Keep the verify-don't-trust discipline (recompute §8 locally, submit, on-ledger re-verify) — NO skip path.

**ContractId-gather + exercise pattern to mirror** (`ledger.ts:349-390`) — locate holdings by `(owner, symbol/instrument)` with sufficient quantity, encode tuples as `{ _1, _2 }`, coerce Decimals with `Number()` (Pitfall 4, v2 wire):
```daml
  const assets = await queryByEntity('Asset')   // → 'Holding'
  const buyerUsdc = assets.find((c) =>
    c.createArgument.owner === buyer &&
    c.createArgument.symbol === CASH_SYMBOL &&        // → instrument match
    Number(c.createArgument.quantity) >= cashNeeded)
  ...
  sellerBondCids.push({ _1: a.desk, _2: bond.contractId })
  ...
  await exerciseChoice('Umbra.Auction:Round', round.contractId, 'Clear', {
    clearingPrice, allocations: ..., orderCids,
    buyerUsdcCid, sellerBondCids, referencePrice: REFERENCE_PRICE_STUB,
  })
```
Generalize the single `buyAlloc`/`buyer` selection (`ledger.ts:344-347`) to N buyers, add the `cashInstrument` arg. The `#umbra:Module:Entity` templateId form and `submitAndWait` helper (`ledger.ts:112-138`) are unchanged.

---

### `solver/src/topology.ts` (NEW, service) — party→participant hosting probe (VIZ-03)

**Analog:** `scripts/localnet/xnode-up.mjs` `isLocal` probe (`xnode-up.mjs:68`) + `ledger.ts` v2 fetch helpers.

**Probe pattern to mirror** (`xnode-up.mjs:68`):
```javascript
const existing = (await api(base, admin, 'GET', '/v2/parties')).partyDetails
  .find((p) => p.party.startsWith(`${hint}::`) && p.isLocal)
```
Build a `hostingMap` across the three participant bases (`:2975 app-user`, `:3975 app-provider`, `:4975 sv` — RESEARCH Code Example): a party's host is the participant where `/v2/parties` returns `isLocal:true`. All desks → one participant ⇒ emit the `SAME PARTICIPANT (LOCALNET)` demo-real caption; distributed ⇒ real multi-node. The endpoint is credential-free (no operator token crosses out — SOLV-04, `ledger.ts:8-12`).

---

### `solver/src/api.ts` (EDIT, controller) — `GET /round/:id/topology` + guest onboarding

**Analog:** its own `app.get`/`app.post` routes with the `wrap(async (req, res) => …)` + zod-`safeParse` + `ApiError` envelope (`api.ts:640-695`, `708-733`).

**Route pattern to mirror** (`api.ts:659-669`) — read-only passthrough with 404:
```typescript
  app.get('/round/:id/proof', wrap(async (req, res) => {
    const { id } = req.params
    const bundle = await deps.readProofBundle(id)
    if (!bundle) throw new ApiError(404, 'PROOF_NOT_FOUND', `no decision proof bundle for round ${id}`)
    res.json(bundle)
  }))
```
**Body-validated POST pattern to mirror** (`api.ts:640-652`) — zod `safeParse`, first-issue 400, for the guest onboarding endpoint:
```typescript
    const parsed = someBody.safeParse(req.body ?? {})
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ApiError(400, 'INVALID_BODY', `invalid request body: ${issue?.path.join('.') || '(body)'} — ${issue?.message ?? 'invalid'}`)
    }
```
`GET /round/:id/topology` → `deps.hostingMap()`; guest onboarding endpoint returns the scoped `/join` bootstrap (never the token in a GET/QR — token delivered server-side).

---

### `web/src/views/TopologyView.tsx` (NEW, view 07) — three-node topology (VIZ-03)

**Analog:** `web/src/views/TimeMachineView.tsx` (per UI-SPEC — the DOM-free pure core + per-party plane + honest-provenance labeling).

**Pure DOM-free core + verbatim copy tokens to mirror** (`TimeMachineView.tsx:38-63`):
```typescript
export const STAGE_NODES: { key: Stage; label: string }[] = [
  { key: 'open', label: 'OPEN' }, ...
]
export const HEADLINE = 'REWIND THE BLINDNESS.'
export const ledgerEventCaption = (offset: number): string => `LEDGER EVENT @ ${offset}`
```
→ TopologyView exports a `NODES` list + node/edge derivation as a unit-tested pure core (mirrors `TimeMachine.test.tsx`), fed by `deps.hostingMap()`. The **HARD non-removable** `DEMO-REAL · SINGLE-OPERATOR LOCALNET` badge is the honesty analog of TimeMachine's `RECONSTRUCTED (T3)` tag (Pitfall 7). Reuse `ctxA/ctxB/ctxC` from `ledgerContexts.ts` and `httpBaseUrlFor` from `desks.ts` for authentic per-desk residency reads.

---

### `web/src/views/JoinView.tsx` (NEW, `/join` mobile) — guest 4th desk (WOW-07)

**Analog:** `web/src/views/DeskView.tsx` (`DeskView.tsx:1-45`).

**Per-party plane pattern to mirror** (`DeskView.tsx:23-31`) — mount inside the desk's own `ctx.DamlLedger`; every hook reads only that desk's contracts (structural privacy, not render-filter):
```typescript
function DeskBody({ ctx, deskKey }: { ctx: Ctx; deskKey: DeskKey }) {
  const orders = ctx.useStreamQueries(Order)
  const order = orders.contracts[0]?.payload
  const confirms = ctx.useStreamQueries(TradeConfirmation)
  const tc = confirms.contracts[0]?.payload
```
JoinView reuses `OrderTicket` (`components/OrderTicket.tsx`) for the sealed-bid submit and `FillCard` for the own-fill. The guest desk (`bankD`/`Guest`) is added to `ledgerContexts.ts` (`ctxD = make('bankD')`) and `desks.ts` (`DESKS` + `DeskKey` union). QR carries only the `/join` URL + roundId — never the token (V2/V4 security).

---

### `web/src/components/QrJoin.tsx` (NEW) — client SVG QR

**Analog:** none in-repo — external `qrcode.react@4.2.0` `QRCodeSVG` (vetted, RESEARCH). Render ink-on-paper (`#0A0A0A` on `#F4F1EA`), `level="M"`. Hand-rolled SVG encoder is the honest zero-dep fallback if the legitimacy gate rejects the lib. Payload = URL + roundId only; add the honesty note that production guest auth is OIDC (Phase 12).

---

### `scripts/localnet/guest-onboard.mjs` (NEW) — guest party + scoped token

**Analog:** `scripts/localnet/xnode-up.mjs` (party alloc + user + rights, `xnode-up.mjs:59-75`) + `scripts/localnet/mint-jwt.mjs` (`mintJwt`).

**Allocate → user → rights pattern to mirror** (`xnode-up.mjs:59-75`):
```javascript
await api(base, admin, 'POST', '/v2/parties', { partyIdHint: hint, identityProviderId: '' })
await api(base, admin, 'POST', '/v2/users', { user: { id: userId, primaryParty }, rights: [] })
await api(base, admin, 'POST', `/v2/users/${userId}/rights`, {
  rights: partyIds.flatMap((party) => [{ kind: { CanActAs: { value: { party } } } }]) })
```
**Token mint to reuse** (`mint-jwt.mjs:23-28`) — HS256, `{ sub, aud }`, secret `unsafe`, aud `https://canton.network.global`:
```javascript
export const mintJwt = (sub, aud = LOCALNET_JWT_AUD, secret = LOCALNET_JWT_SECRET) => {
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const payload = b64url({ sub, aud })
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}
```
Write the guest desk into `web/src/tokens.json` in the SAME `{ party, token, base }` shape as `bankA/B/C` (co-host on an existing participant — no genuine 4th validator on LocalNet; Open Question 2). Token never enters web source at rest beyond tokens.json (already the D6 boundary).

## Shared Patterns

### Verify-don't-trust (on-ledger recompute)
**Source:** `Round.Clear` steps 0-1 (`Auction.daml:333-365`)
**Apply to:** the rewritten `Round.Clear`, `Settlement.daml`, `ledger.ts settle()`
The recompute-§8-and-assert backstop runs BEFORE the batch build and is UNCHANGED — a bad allocation/price is rejected here regardless of holdings. `tamperClear` (`ledger.ts:416-496`) is the negative-path proof and must keep working.

### v2 wire encoding
**Source:** `ledger.ts` header + reads (`ledger.ts:18-22`, `read*` maps)
**Apply to:** every new Holding/Instrument/eligibility read in `ledger.ts`, `topology.ts`
Decimals/Ints come back as STRINGS → `Number()`; tuples are `{ _1, _2 }`; templateIds are `#umbra:Module:Entity`; enums/Time are strings. (Pitfall 4.)

### Operator-token secrecy (SOLV-04)
**Source:** `ledger.ts:8-12, 51-69`
**Apply to:** `topology.ts`, the guest-onboarding solver endpoint, all new `api.ts` routes
The operator JWT is module-private, never returned/logged/echoed; only party-/contract-level ids cross out. The topology endpoint is credential-free.

### Structural per-party privacy
**Source:** `ledgerContexts.ts` (isolated named contexts) + `Order` signatory/observer set (`Auction.daml:92-104`)
**Apply to:** guest `JoinView`, `TopologyView` residency reads
Privacy comes from the ledger authority model + per-party JWT, never a render-time filter. The guest desk gets its OWN `ctx` and token exactly like A/B/C.

### Honest labeling (HARD, non-removable)
**Source:** TimeMachine `RECONSTRUCTED (T3)` provenance grammar (`TimeMachineView.tsx:16-24`)
**Apply to:** `TopologyView` (`DEMO-REAL · SINGLE-OPERATOR LOCALNET`), `SettlementView` provenance tag (`CN TOKEN STANDARD (CIP-0056)` or `DAML-FINANCE-PATTERN (IN-REPO)` — never `DAML FINANCE`), `QrJoin` (production auth = OIDC/Phase 12), guest desk topology caption.

### Regenerate + commit bindings (fresh-clone invariant)
**Source:** established every-template-change step (RESEARCH Runtime State)
**Apply to:** after any new/changed template (`Holding`/`Instrument`/`DeskEligibility`, `Round.Clear` signature) run `daml codegen js` and COMMIT `web/daml.js/` in lockstep, or the frontend decode breaks silently.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/src/components/QrJoin.tsx` | component | render | No QR rendering exists yet; use `qrcode.react` `QRCodeSVG` (vetted) or hand-rolled SVG fallback |
| CN Token Standard `interface instance` blocks | model | interface conformance | No existing template implements an external interface; pattern source is `docs.sync.global` `Splice.Api.Token.HoldingV1`/`MetadataV1` (DARs already vetted on the box). If interface conformance overruns budget, drop to the plain in-repo layer labeled `DAML-FINANCE-PATTERN (IN-REPO)`. |

## Metadata

**Analog search scope:** `daml/Umbra/`, `solver/src/`, `web/src/{views,components}`, `scripts/localnet/`
**Files scanned:** Auction.daml, Asset.daml, Roles.daml, Setup.daml, ledger.ts, api.ts, xnode-up.mjs, mint-jwt.mjs, desks.ts, ledgerContexts.ts, tokens.json, TimeMachineView.tsx, DeskView.tsx (+ component/script listings)
**Pattern extraction date:** 2026-07-10
</content>
</invoke>
