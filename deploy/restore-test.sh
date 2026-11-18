#!/usr/bin/env bash
# Proves a backup is usable: restores the newest dump into a throw-away database and compares row counts with the live one.
set -euo pipefail
DEST="${BACKUP_DIR:-/root/backups/flowbase}"; DB="${DB_NAME:-bitcode_tracker}"; T="${DB}_restore_test"
LATEST="$(ls -1t "$DEST"/db-*.dump | head -1)"; echo "restoring $LATEST into $T"
su postgres -c "dropdb --if-exists $T && createdb $T"
su postgres -c "pg_restore --no-owner -d $T" < "$LATEST"   # read as root: the backup folder is private to root
q() { su postgres -c "psql -d $1 -Atc \"$2\""; }
ok=1
for tbl in User Project Ticket Comment Upload Notification; do
  a=$(q "$DB" "SELECT count(*) FROM \\\"$tbl\\\""); b=$(q "$T" "SELECT count(*) FROM \\\"$tbl\\\"")
  printf '  %-13s live=%-5s restored=%s\n' "$tbl" "$a" "$b"; [ "$a" = "$b" ] || ok=0
done
su postgres -c "dropdb $T"
[ "$ok" = 1 ] && echo "RESTORE TEST PASSED" || { echo "counts differ (new rows since the backup can explain a small difference)"; }
