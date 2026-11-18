#!/usr/bin/env bash
# Nightly backup of the Flowbase database and uploaded images. Installed to /usr/local/bin/flowbase-backup.sh and run by cron.
# Keeps the last KEEP_DAYS days. Restore steps are in deploy/DEPLOY.md.
set -euo pipefail
DEST="${BACKUP_DIR:-/root/backups/flowbase}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB="${DB_NAME:-bitcode_tracker}"
UPLOADS="${UPLOAD_PARENT:-/var/www/bitcode-tracker-data}"
STAMP="$(date +%Y%m%d-%H%M%S)"

umask 077; mkdir -p "$DEST"
su postgres -c "pg_dump -Fc $DB" > "$DEST/db-$STAMP.dump"
[ -s "$DEST/db-$STAMP.dump" ] || { echo "backup FAILED: empty database dump"; rm -f "$DEST/db-$STAMP.dump"; exit 1; }
if [ -d "$UPLOADS/uploads" ]; then tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$UPLOADS" uploads; fi
find "$DEST" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: db-$STAMP.dump ($(du -h "$DEST/db-$STAMP.dump" | cut -f1)), $(ls "$DEST" | wc -l) files kept"
