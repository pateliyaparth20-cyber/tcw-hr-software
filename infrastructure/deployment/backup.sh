#!/usr/bin/env sh
set -eu
umask 077
mkdir -p backups
backup_path="backups/peopleos-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$backup_path"
echo "Backup written to $backup_path. Test restoration on an isolated database."
