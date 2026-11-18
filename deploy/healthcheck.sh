#!/usr/bin/env bash
# Runs every 5 minutes from cron. Emails ALERT_EMAIL (from apps/api/.env) when something stays broken for two checks in a row:
# the site/API/web process is down, Postgres is unreachable, the disk is >88% full, or no backup is younger than 26 hours.
# One email per problem, plus a "recovered" email. Install: /usr/local/bin/flowbase-healthcheck.sh
ENV="${ENV_FILE:-/var/www/bitcode-tracker/apps/api/.env}"; STATE="${STATE_DIR:-/var/lib/flowbase-health}"; mkdir -p "$STATE"
get() { grep -E "^$1=" "$ENV" | head -1 | cut -d= -f2- | tr -d '"'; }
KEY="$(get RESEND_API_KEY)"; FROM="$(get RESEND_FROM)"; TO="$(get ALERT_EMAIL)"
[ -n "$TO" ] && [ -n "$KEY" ] || exit 0
send() {
  curl -s -o /dev/null -X POST https://api.resend.com/emails -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"from":sys.argv[1],"to":[sys.argv[2]],"subject":sys.argv[3],"text":sys.argv[4]}))' "$FROM" "$TO" "$1" "$2")"
}
check() { # name, ok (1/0), message
  local f="$STATE/$1" fails=0 alerted=0; [ -f "$f" ] && read -r fails alerted < "$f"
  if [ "$2" = 0 ]; then
    fails=$((fails + 1))
    if [ "$fails" -ge 2 ] && [ "$alerted" = 0 ]; then send "[Flowbase] $1 problem" "$3 (detected $(date -Is))"; alerted=1; fi
  else
    [ "$alerted" = 1 ] && send "[Flowbase] $1 recovered" "$1 is back to normal at $(date -Is)."
    fails=0; alerted=0
  fi
  echo "$fails $alerted" > "$f"
}
ok() { "$@" >/dev/null 2>&1 && echo 1 || echo 0; }

check "api"    "$(ok curl -fsS --max-time 8 "${API_URL:-http://127.0.0.1:4050/api/health}")"                 "The Flowbase API is not answering on this server."
check "web"    "$(ok curl -fsS --max-time 10 "${WEB_URL_CHECK:-http://127.0.0.1:3050/}")"                    "The Flowbase web app is not answering on this server."
check "site"   "$(ok curl -fsS --max-time 10 "${SITE_URL:-https://tracker.bitcodes.co.in/api/health}")"      "https://tracker.bitcodes.co.in is not reachable from the internet (nginx, DNS or certificate?)."
check "database" "$(ok su postgres -c "psql -d bitcode_tracker -Atc 'select 1'")"                           "PostgreSQL is not accepting connections for bitcode_tracker."
used="$(df --output=pcent / | tail -1 | tr -dc 0-9)"
check "disk"   "$([ "${used:-0}" -lt 88 ] && echo 1 || echo 0)"                                              "The server disk is ${used}% full. Images/uploads and backups need space."
check "backup" "$([ -n "$(find /root/backups/flowbase -name 'db-*.dump' -mmin -1560 2>/dev/null | head -1)" ] && echo 1 || echo 0)" "No database backup in the last 26 hours. Check /var/log/flowbase-backup.log."
