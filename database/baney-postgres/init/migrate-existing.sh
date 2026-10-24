#!/bin/sh
set -eu

: "${DATABASE_HOST:?Set DATABASE_HOST to Dokploy's Internal Host}"
: "${DATABASE_NAME:?Set DATABASE_NAME to the existing PostgreSQL database}"
: "${DATABASE_USER:?Set DATABASE_USER from Dokploy's Internal Credentials}"
: "${DATABASE_PASSWORD:?Set DATABASE_PASSWORD from Dokploy's Internal Credentials}"
DATABASE_PORT="${DATABASE_PORT:-5432}"

export PGPASSWORD="$DATABASE_PASSWORD"
until pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME"; do
  echo "Waiting for Dokploy PostgreSQL at ${DATABASE_HOST}:${DATABASE_PORT}..."
  sleep 3
done

has_version="$(psql -X -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -Atqc \
  "SELECT to_regclass('platform.schema_versions') IS NOT NULL")"

if [ "$has_version" = "t" ]; then
  baseline="$(psql -X -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -Atqc \
    "SELECT EXISTS (SELECT 1 FROM platform.schema_versions WHERE version='001')")"
  if [ "$baseline" != "t" ]; then
    echo "platform.schema_versions exists, but baseline 001 is missing; refusing to modify this database." >&2
    exit 1
  fi
  echo "BANEY baseline 001 already exists; skipping schema.sql."
else
  object_count="$(psql -X -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -Atqc \
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','S')")"
  if [ "$object_count" != "0" ]; then
    echo "The target database is not empty ($object_count user objects); refusing to apply the baseline." >&2
    exit 1
  fi
  echo "Applying BANEY schema to the empty database ${DATABASE_NAME}..."
  psql -X -v ON_ERROR_STOP=1 -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -f /migration/schema.sql
fi

echo "BANEY schema migration completed successfully."
