#!/bin/sh
set -eu
: "${BANEY_APP_PASSWORD:?BANEY_APP_PASSWORD is required}"
psql -v ON_ERROR_STOP=1 -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$BANEY_APP_PASSWORD" <<'SQL'
BEGIN;
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'baney_app') THEN
    CREATE ROLE baney_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$role$;
SELECT format('ALTER ROLE baney_app PASSWORD %L', :'app_password') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO baney_app', current_database()) \gexec
SELECT format('GRANT USAGE ON SCHEMA %I TO baney_app', nspname)
 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO baney_app', nspname)
 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO baney_app', nspname)
 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema') \gexec
REVOKE INSERT,UPDATE,DELETE ON platform.schema_versions FROM baney_app;
REVOKE UPDATE,DELETE ON baney_caja.movimiento, governance.audit_entries, baney_caja.auditoria, baney_catalog.bids FROM baney_app;
REVOKE INSERT,UPDATE,DELETE ON baney_caja.saldo_cuenta FROM baney_app;
ALTER FUNCTION baney_caja.post_movement() SECURITY DEFINER;
ALTER FUNCTION baney_caja.post_movement() SET search_path = pg_catalog;
ALTER FUNCTION baney_caja.update_balance() SECURITY DEFINER;
ALTER FUNCTION baney_caja.update_balance() SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION baney_caja.post_movement(), baney_caja.update_balance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION baney_caja.post_movement(), baney_caja.update_balance() TO baney_app;
ALTER ROLE baney_app SET timezone = 'UTC';
ALTER ROLE baney_app SET search_path = public;
COMMIT;
SQL
