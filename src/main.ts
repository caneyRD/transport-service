import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { PostgresTransportStore } from './infrastructure/postgres/transport-store';
import { createTransportServer } from './http/server';
import { jwtAuthenticator } from './http/auth';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000, statement_timeout: 15000, application_name: 'baney-transport-service',
  });
  pool.on('error', () => console.error('Idle database connection failed'));
  const store = new PostgresTransportStore(pool);
  const server = createTransportServer(store, jwtAuthenticator({
    publicKey: process.env.JWT_PUBLIC_KEY, secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE,
  }));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('error', () => { console.error('HTTP server failed'); void store.close(); process.exitCode = 1; });
  server.listen(port, () => console.log(`transport-service listening on port ${port}`));
  const shutdown = () => server.close(() => { void store.close(); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch(() => { console.error('Transport startup failed. Check database and authentication configuration.'); process.exitCode = 1; });
