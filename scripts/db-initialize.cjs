// Explicit first-install operation, never run by the API entrypoint.
// Refuse any existing application schema instead of replacing its data.
const { Pool } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('transport-base-schema', 0))");
    const existing = await client.query("SELECT nspname FROM pg_namespace WHERE nspname NOT IN ('public', 'information_schema') AND nspname NOT LIKE 'pg_%'");
    const tables = await client.query("SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1");
    if (existing.rowCount || tables.rowCount) throw new Error('Database is not empty; initialization refused. Review existing schema manually.');
    await client.query(readFileSync(join(__dirname, '../database/schema.sql'), 'utf8'));
    console.log('Transport base schema initialized. Run db-migrate.cjs next.');
  } finally { client.release(); }
})().catch(() => { console.error('Transport initialization failed; database must be empty.'); process.exitCode = 1; }).finally(() => pool.end());
