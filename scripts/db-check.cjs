// Read-only connectivity check. Load secrets from .env or the process environment.
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000, query_timeout: 8000, max: 1 });
  try {
    const { rows } = await pool.query(`SELECT current_database() AS database,
      to_regclass('baney.solicitud_transporte') IS NOT NULL AS requests,
      to_regclass('baney.oferta_transporte') IS NOT NULL AS offers,
      to_regclass('baney.outbox') IS NOT NULL AS outbox`);
    if (!rows[0].requests || !rows[0].offers || !rows[0].outbox) {
      throw new Error('Transport schema is missing. See database setup instructions.');
    }
    console.log('OK: PostgreSQL authentication and transport schema verified');
  } finally { await pool.end(); }
}

main().catch(error => {
  // Avoid exposing connection strings or server details in console output.
  console.error('Database check failed:', error.code || 'configuration/schema error');
  process.exitCode = 1;
});
