# Umbra — Super-Validator Sponsorship Checklist (CHAIN-01 EXTERNAL GATE)

> ⚠ **This is the one genuinely EXTERNAL, non-code deliverable of Phase 12.** Joining
> the real Global Synchronizer on Canton DevNet requires a **Super Validator (SV) to
> sponsor your node**: adopt your egress IP onto its allowlist, hand you a sponsor URL,
> and let you generate a one-time onboarding secret. **None of this can be produced on
> the build box** — and no offline artifact may be labeled as a live connection.
>
> **Lead time is days–weeks, not code.** The egress-IP **allowlist adoption alone takes
> 2–7 days** (Pitfall 4). Per the ROADMAP, **start this gate immediately** — before the
> compose/scripts even matter.

---

## Legend

- **[EXTERNAL]** — depends on a third party (the sponsoring SV / your network provider);
  cannot be done or accelerated from this repo.
- **[YOU]** — an action you take, but that only unlocks a live connection once the
  **[EXTERNAL]** steps complete.
- **[LIVE UAT]** — verified only against the real, sponsored node (see `RUNBOOK.md`).

## Checklist (in order — front-loaded so the slow steps start first)

### 1. Secure a static egress IP  **[YOU]**
- [ ] Obtain a **static egress IP** for the ops box/network the validator will run from
      (the SV allowlists this exact IP; a dynamic/NAT IP will break onboarding).
- [ ] Record it; you will send it to the sponsoring SV in step 3.

### 2. Identify a sponsoring Super Validator  **[EXTERNAL]**
- [ ] Reach out to a DevNet Super Validator operator willing to sponsor onboarding
      (via the Canton Network / Splice community channels or a partner SV).
- [ ] Confirm they operate on the DevNet **migration** you will target (`MIGRATION_ID`).

### 3. Submit your egress IP for allowlist adoption  **[EXTERNAL]** ⏳ **2–7 days**
- [ ] Send your static egress IP (step 1) to the sponsoring SV.
- [ ] **Wait for allowlist adoption — this takes 2–7 days** (Pitfall 4). This is the
      long pole; there is **no way to shorten it from code**. Do NOT plan a demo before
      this clears.
- [ ] Confirm with the SV that adoption is complete before proceeding.

### 4. Receive the sponsor URL  **[EXTERNAL]**
- [ ] Obtain the **`SPONSOR_SV_URL`** from the sponsoring SV (the onboarding endpoint your
      validator's `./start.sh -s` points at).
- [ ] Put it in the **gitignored** `deploy/devnet/validator-compose/.env` — **never commit
      a real sponsor URL** (`.env.example` carries a placeholder only).

### 5. Generate the JIT onboarding secret  **[YOU]** ⏱ **expires 1h / 48h, one-time**
- [ ] Generate the **`ONBOARDING_SECRET`** (DevNet self-serve ≈ **1h** validity; SV-issued
      ≈ **48h**), **one-time-use** — **Pitfall 5**.
- [ ] Generate it **immediately before** `./start.sh` (RUNBOOK Step 2). A stale/expired or
      already-used secret fails onboarding — if it expires, generate a fresh one.
- [ ] Keep it in the **gitignored** `.env`; **never commit it**.

### 6. Boot + verify  **[LIVE UAT]**
- [ ] Run `RUNBOOK.md` Step 2 (`./start.sh -s … -o … -p umbra-operator-1 -m … -w -a`).
- [ ] Confirm the participant reaches **`/readyz`** (connected to the synchronizer).
- [ ] Proceed to DAR vet + party alloc + §4 (RUNBOOK Steps 3–5).

---

## What is BUILT vs EXTERNAL (honesty boundary)

| Item | Status |
|------|--------|
| Validator compose + parameterized `.env.example` | **[BUILT]** — `deploy/devnet/validator-compose/` |
| DAR upload+vet+party-alloc+grantRights script + mocked-v2 test | **[BUILT]** — `deploy/devnet/devnet-deploy.mjs` |
| Postgres / backup / monitoring / traffic top-up | **[BUILT]** — `deploy/devnet/{postgres,backup,monitoring}`, `traffic-topup.env.example` |
| Static egress IP + SV sponsorship + **allowlist adoption (2–7 days)** | **[EXTERNAL]** — this checklist |
| Sponsor URL + JIT onboarding secret | **[EXTERNAL]** / **[YOU]** — steps 4–5 |
| Live connection + live DAR vet + §4-on-real-Canton + unattended ops | **[LIVE UAT]** — after the gate clears |

## Honest limitation

Everything on the **[BUILT]** rows is validated offline (compose parse, `node --check`,
`bash -n`, the mocked-v2 deploy test). The **[EXTERNAL]** / **[LIVE UAT]** rows are the
genuine gate — deferred and labeled, never faked. A single self-hosted, sponsored validator
is **"demo-real"** for the 3-desk privacy money shot; genuine 3-institution cross-node
privacy (3 independent validators) is a recorded limitation.
