#!/usr/bin/env bash
# Run on the server from /var/www/bitcode-tracker. Builds with limited memory/priority: the box hosts other apps.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_OPTIONS=--max-old-space-size=1536 NEXT_PUBLIC_API_URL=/api NEXT_TELEMETRY_DISABLED=1
# The server runs Node 20; pnpm 11 (the repo's packageManager) needs Node 22, so use pnpm 10 and don't auto-switch versions.
PNPM="${PNPM:-npx -y pnpm@10 --config.manage-package-manager-versions=false}"
nice -n 10 $PNPM install --frozen-lockfile
$PNPM --filter @bitcode/shared build
(cd apps/api && $PNPM exec prisma generate)
$PNPM --filter @bitcode/api build
nice -n 10 $PNPM --filter @bitcode/web build
# migrate only now, right before the restart, so the running API is never on a half-migrated schema during the long build
(cd apps/api && $PNPM exec prisma migrate deploy)
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
