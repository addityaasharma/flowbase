# Deploying Bitcode Tracker to the VPS

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
`RESEND_API_KEY`, `RESEND_FROM`.

## Operations
```bash
pm2 logs tracker-api        # API logs        | pm2 restart tracker-web tracker-api
pg_dump -U tracker -h localhost bitcode_tracker > backup.sql     # manual backup
```
