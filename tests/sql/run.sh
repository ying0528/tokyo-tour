#!/usr/bin/env bash
# 在本機暫時啟動 PostgreSQL，套用 schema.sql 兩次（確認可重複執行），再跑權限測試。
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-$(dirname "$(command -v postgres 2>/dev/null || echo /usr/lib/postgresql/16/bin/postgres)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT:-54329}"
RUNAS=()
if [ "$(id -u)" = "0" ]; then chown -R nobody "$DATA"; RUNAS=(runuser -u nobody --); fi
"${RUNAS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
trap '"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f tests/sql/supabase_stubs.sql
"${PSQL[@]}" -f supabase/schema.sql
"${PSQL[@]}" -f supabase/schema.sql
echo "schema.sql 套用成功（含重複執行）"
"${PSQL[@]}" -f tests/sql/scenarios.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
