#!/bin/sh
set -eu

: "${DATABASE_HOST:?Set DATABASE_HOST}"
: "${DATABASE_NAME:?Set DATABASE_NAME}"
: "${DATABASE_USER:?Set DATABASE_USER}"
: "${DATABASE_PASSWORD:?Set DATABASE_PASSWORD}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
export PGPASSWORD="$DATABASE_PASSWORD"

until pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME"; do sleep 3; done

applied="$(psql -X -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -Atqc \
  "SELECT to_regclass('baney.version_esquema') IS NOT NULL AND EXISTS (SELECT 1 FROM baney.version_esquema WHERE version='001')")"
if [ "$applied" = "t" ]; then
  echo 'BANEY unified schema 001 already applied; skipping.'
  exit 0
fi

schema_exists="$(psql -X -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -Atqc \
  "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='baney')")"
if [ "$schema_exists" = "t" ]; then
  echo 'Schema baney exists without version 001; refusing to guess or overwrite it.' >&2
  exit 1
fi

echo 'Applying BANEY unified schema 001 without dropping existing schemas...'
psql -X -v ON_ERROR_STOP=1 -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -f /migration/002_baney_unified_baseline.sql
echo 'BANEY unified schema migration completed.'
