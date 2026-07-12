#!/usr/bin/env bash
# deploy/devnet/onboard.sh — wire the DevNet onboarding inputs into the Splice validator
# Compose bundle's start.sh. It does NOT ship the Splice validator bundle: download it from
# the official Splice release for your pinned SPLICE_VERSION and set VALIDATOR_BUNDLE_DIR.
#
# Grounded in the Splice validator docs (see docs/DEVNET.md §2). VERIFY the flags/hostnames
# against the exact bundle version you download — Splice releases evolve, so treat this as a
# reviewed skeleton, not a turnkey script.
#
# Usage:
#   cp deploy/devnet/.env.devnet.example deploy/devnet/.env.devnet   # then fill it in
#   bash deploy/devnet/onboard.sh          # DRY RUN: validate inputs + print the start command
#   RUN=1 bash deploy/devnet/onboard.sh    # actually invoke the bundle's start.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
env_file="${here}/.env.devnet"
[ -f "$env_file" ] || { echo "✗ missing ${env_file} (copy .env.devnet.example and fill it in)"; exit 1; }
set -a; . "$env_file"; set +a

req() { [ -n "${!1:-}" ] || { echo "✗ ${1} is required in ${env_file}"; exit 1; }; }
req SPONSOR_SV_URL
req MIGRATION_ID
req VALIDATOR_BUNDLE_DIR
[ -x "${VALIDATOR_BUNDLE_DIR}/start.sh" ] || {
  echo "✗ ${VALIDATOR_BUNDLE_DIR}/start.sh not found."
  echo "  Download the Splice validator Compose bundle for SPLICE_VERSION=${SPLICE_VERSION:-<unset>}"
  echo "  and point VALIDATOR_BUNDLE_DIR at the extracted dir."
  exit 1
}

# 1. Onboarding secret: self-serve on DevNet if not supplied (valid ~1h).
secret="${ONBOARDING_SECRET:-}"
if [ -z "$secret" ]; then
  echo "▸ self-serving a DevNet onboarding secret from ${SPONSOR_SV_URL} ..."
  secret="$(curl -fsS -X POST "${SPONSOR_SV_URL}/api/sv/v0/devnet/onboard/validator/prepare" | tr -d '"[:space:]')"
  [ -n "$secret" ] || { echo "✗ could not obtain an onboarding secret (check SPONSOR_SV_URL / that it is DevNet)"; exit 1; }
  echo "  ✓ obtained a secret (valid ~1h)"
fi

# 2. Assemble the start command (VERIFY flags against your bundle version).
flags=(-s "$SPONSOR_SV_URL" -o "$secret")
[ "${ENABLE_OIDC:-false}" = "true" ] && flags+=(-a)
echo "▸ MIGRATION_ID=${MIGRATION_ID} (also set it in the bundle's values/env per its docs)"
echo "▸ egress IP ${EGRESS_IP:-<unset>} must be SV-allowlisted first (~2-7 days)"
echo "▸ validator start command:"
echo "    ( cd '${VALIDATOR_BUNDLE_DIR}' && MIGRATION_ID='${MIGRATION_ID}' ./start.sh ${flags[*]//$secret/<secret>} )"

if [ "${RUN:-0}" = "1" ]; then
  echo "▸ RUN=1 → invoking start.sh ..."
  ( cd "$VALIDATOR_BUNDLE_DIR" && MIGRATION_ID="$MIGRATION_ID" ./start.sh "${flags[@]}" )
else
  echo "▸ dry run — nothing launched. Re-run with RUN=1 once inputs + allowlisting are ready."
fi
