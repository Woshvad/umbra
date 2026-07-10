#!/usr/bin/env bash
# ============================================================================
# Umbra — scheduled pg_dump backup for the DevNet participant/validator store
# (CHAIN-03). Env-driven creds, TIMESTAMPED dumps, gzip, retention pruning.
#
# ⚠ Registering this on a schedule (cron / systemd timer / Task Scheduler) against
#   a LIVE node is UAT. Offline this file is validated with `bash -n` only; it is
#   NOT run here (no live Postgres on this box).
#
# Run manually (AT THE GATE):   ./pg-dump.sh
# Schedule example (cron, daily 02:15, creds from a gitignored env file):
#   15 2 * * *  set -a; . /opt/umbra/devnet.env; set +a; /opt/umbra/deploy/devnet/backup/pg-dump.sh >> /var/log/umbra-pgdump.log 2>&1
#
# Env (placeholders — real values from a gitignored .env, NEVER committed):
#   PGHOST         default localhost
#   PGPORT         default 55434  (matches deploy/devnet/postgres/docker-compose.yaml)
#   PGUSER         default umbra_devnet
#   PGDATABASE     default umbra_devnet_participant
#   PGPASSWORD     REQUIRED — export server-side; never hard-code / commit
#   BACKUP_DIR     default ./backups   (dumps land here)
#   RETENTION_DAYS default 14          (older *.sql.gz are pruned)
# ============================================================================
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-55434}"
PGUSER="${PGUSER:-umbra_devnet}"
PGDATABASE="${PGDATABASE:-umbra_devnet_participant}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "✗ PGPASSWORD is required (export it server-side from a gitignored .env; never commit it)" >&2
  exit 1
fi
export PGPASSWORD

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/umbra-devnet-${PGDATABASE}-${TS}.sql.gz"

echo "▸ pg_dump ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE} → ${OUT}"
# --no-password: rely on PGPASSWORD/.pgpass, never prompt in an unattended run.
pg_dump --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
        --dbname="$PGDATABASE" --no-password --format=plain \
  | gzip -c > "$OUT"

# Fail loudly if the dump is empty/truncated (a silent 0-byte backup is worse than none).
if [ ! -s "$OUT" ]; then
  echo "✗ backup ${OUT} is empty — pg_dump likely failed" >&2
  rm -f "$OUT"
  exit 1
fi
echo "✓ backup written ($(du -h "$OUT" | cut -f1))"

# Retention: prune dumps older than RETENTION_DAYS.
echo "▸ pruning backups older than ${RETENTION_DAYS} day(s) in ${BACKUP_DIR}"
find "$BACKUP_DIR" -name 'umbra-devnet-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "✓ pg-dump backup complete"
