#!/usr/bin/env bash
set -euo pipefail
# This drill may run only against the isolated PostgreSQL CI container.
[[ "${CI:-}" == "true" && "${RESTORE_TEST_CONTAINER:-}" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Restore drill requires the isolated CI service container.' >&2; exit 1; }
container="$RESTORE_TEST_CONTAINER"
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT
docker exec "$container" psql -U payroll_test -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE tcw_restore_test' >/dev/null
docker exec "$container" pg_dump -U payroll_test -d tcw_payroll_test --format=custom --no-owner --no-privileges > "$archive"
docker exec -i "$container" pg_restore -U payroll_test -d tcw_restore_test --exit-on-error --no-owner --no-privileges < "$archive"
tables="$(docker exec "$container" psql -U payroll_test -d tcw_payroll_test -At -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")"
count=0
while IFS= read -r table; do
  [[ "$table" =~ ^[a-zA-Z0-9_]+$ ]] || exit 1
  sql="SELECT COALESCE(md5(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text)), 'empty') FROM public.\"$table\" AS t"
  original="$(docker exec "$container" psql -U payroll_test -d tcw_payroll_test -At -c "$sql")"
  restored="$(docker exec "$container" psql -U payroll_test -d tcw_restore_test -At -c "$sql")"
  [[ "$original" == "$restored" ]] || { echo "Restore mismatch in $table" >&2; exit 1; }
  count=$((count+1))
done <<< "$tables"
echo "Restore verified: $count tables have matching contents in the isolated database."
