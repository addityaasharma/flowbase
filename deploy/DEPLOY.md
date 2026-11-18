# Deploying Flowbase to the VPS

Layout: `tracker.bitcodes.co.in` → nginx → web (`127.0.0.1:3050`) and `/api` → API (`127.0.0.1:4050`), both under pm2
(`tracker-web`, `tracker-api`). Database: Postgres 16 (`bitcode_tracker`, own role). Code: `/var/www/bitcode-tracker`.

## Update after code changes
```bash
rsync -az --delete --exclude node_modules --exclude .next --exclude dist --exclude .git --exclude '.env*' --exclude ops \
  ./ deploy@your-server:/var/www/bitcode-tracker/
ssh deploy@your-server 'cd /var/www/bitcode-tracker && bash deploy/release.sh'
```
`deploy/release.sh` installs, migrates the database, builds and restarts both processes.

## Server-only files (never in git)
`apps/api/.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT=4050`, `NODE_ENV=production`, `WEB_URL=https://tracker.bitcodes.co.in`,
`RESEND_API_KEY`, `RESEND_FROM`, `UPLOAD_DIR=/var/www/bitcode-tracker-data/uploads` (pasted images; deliberately outside the
deployed folder so `rsync --delete` can never remove them; back this folder up together with the database).

## Operations
```bash
pm2 logs tracker-api        # API logs        | pm2 restart tracker-web tracker-api
pg_dump -U tracker -h localhost bitcode_tracker > backup.sql     # manual backup
```

## Backups, restore and monitoring (installed on the server)

| What | Where | When |
|---|---|---|
| `/usr/local/bin/flowbase-backup.sh` (from `deploy/backup.sh`) | `/root/backups/flowbase/` (`db-*.dump`, `uploads-*.tar.gz`, 14 days) | cron 02:15 daily (`/etc/cron.d/flowbase-backup`) |
| `/usr/local/bin/flowbase-healthcheck.sh` (from `deploy/healthcheck.sh`) | emails `ALERT_EMAIL` after 2 failed checks; one "recovered" email | cron every 5 min (`/etc/cron.d/flowbase-healthcheck`) |
| `/usr/local/bin/flowbase-restore-test.sh` | restores the newest dump into a scratch DB and compares row counts | run by hand |

Restore the database: `su postgres -c "pg_restore --clean --if-exists --no-owner -d bitcode_tracker" < /root/backups/flowbase/db-<stamp>.dump`
(stop `tracker-api` first). Restore images: `tar -xzf uploads-<stamp>.tar.gz -C /var/www/bitcode-tracker-data`.
Copy `/root/backups/flowbase` somewhere outside the server too; a backup on the same disk does not survive losing the server.
After changing these scripts in git, copy them to `/usr/local/bin/` (they are not part of the automatic deploy).
