const { Pool } = require('pg');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required. Connect to the VPN first.'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('transport-service-migrations',0))");
    if (!(await client.query("SELECT to_regclass('transport.transport_requests') AS table_name")).rows[0].table_name) {
      throw new Error('Install the transport base schema (database/schema.sql) before running migrations.');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS transport.service_migrations
      (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const name of readdirSync(join(__dirname, '../database/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(__dirname, '../database/migrations', name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (await client.query('SELECT checksum FROM transport.service_migrations WHERE name=$1', [name])).rows[0];
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO transport.service_migrations(name,checksum) VALUES ($1,$2)',[name,checksum]);
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
    console.log('Transport migrations up to date');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
})().catch(error => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
