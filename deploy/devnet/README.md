# deploy/devnet — self-host a Splice validator on Canton DevNet

Skeleton for **Route A** (self-hosted validator) from [`docs/DEVNET.md`](../../docs/DEVNET.md).
It gets Umbra's whole multi-party stack onto real DevNet by running our OWN Splice validator
and pointing the existing solver/web/scripts at it (they port over with minimal change).

This directory does **not** contain the Splice validator itself — that bundle comes from the
official Splice release for your pinned version. These files wire the DevNet-specific inputs
into it and stage the app-side profiles.

## Files
- `.env.devnet.example` → copy to `.env.devnet` (gitignored) and fill: sponsor SV, migration id,
  egress IP, onboarding secret (or self-serve), bundle dir, OIDC on/off.
- `onboard.sh` → validates inputs, self-serves the DevNet onboarding secret, and prints (or runs,
  with `RUN=1`) the validator `start.sh` command. Dry-run by default.
- App profiles: [`../../solver/.env.devnet.example`](../../solver/.env.devnet.example) +
  [`../../web/.env.devnet.example`](../../web/.env.devnet.example).

## Order of operations
1. **Get inputs from the organizers:** sponsor SV URL, target `MIGRATION_ID`, and confirmation
   they'll allowlist your egress IP. Pin a `SPLICE_VERSION`.
2. **Submit your static egress IP for allowlisting EARLY** — adoption is ~2-7 days (the long pole).
3. Download the Splice validator Compose bundle for `SPLICE_VERSION`; set `VALIDATOR_BUNDLE_DIR`.
4. `cp .env.devnet.example .env.devnet` and fill it in.
5. `bash onboard.sh` (dry run) to review; `RUN=1 bash onboard.sh` to start the validator.
6. Once it's joined + synced: vet `daml/.daml/dist/umbra-0.1.0.dar` (self-contained fat DAR),
   allocate the 5 parties (operator + bankA/B/C + compliance), copy the app `.env.devnet`
   profiles into place, and reseed §4. Then run the money shot and `make verify` on DevNet.

## Honest caveats
- **VERIFY every flag/host against your bundle version.** Splice releases evolve; this is a
  reviewed skeleton grounded in the docs (see `docs/DEVNET.md §2`), not a turnkey installer.
- The allowlist wait is external and unavoidable — nothing here shortens it.
- If the hackathon's **shared** validator turns out to expose the JSON Ledger API + multi-party
  (Route B, unconfirmed), you can skip all of this and just fill the app `.env.devnet` profiles.
