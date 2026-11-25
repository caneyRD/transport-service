import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { PostgresTransportStore } from './infrastructure/postgres/transport-store';
import { createTransportServer } from './http/server';
import { jwtAuthenticator } from './http/auth';
import { GoogleRoutesProvider } from './infrastructure/google/google-routes.provider';

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
  await store.health();
  const server = createTransportServer(store, jwtAuthenticator({
    publicKey: process.env.JWT_PUBLIC_KEY, secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE,
  }), {
    shareSecret: process.env.SHARE_LINK_SECRET,
    // Swagger UI at /docs; set DOCS_ENABLED=false to hide it.
    docs: process.env.DOCS_ENABLED !== 'false',
    // Real driving routes and ETA when the key is set; otherwise straight-line estimates.
    routes: process.env.GOOGLE_MAPS_API_KEY
      ? new GoogleRoutesProvider(process.env.GOOGLE_MAPS_API_KEY, fetch, { onError: reason => console.warn(`Google Routes unavailable, using estimate: ${reason}`) })
      : undefined,
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE' ? `HTTP server failed: port ${port} is already in use (another process is listening on it)` : `HTTP server failed: ${error.code ?? 'unknown error'}`);
    void store.close(); process.exitCode = 1;
  });
  server.listen(port, () => console.log(`transport-service listening on port ${port}`));
  // Every 5 minutes, close the requests nobody took before their pickup window ended.
  const sweep = setInterval(() => {
    store.execute(r => r.requests.expireStale ? r.requests.expireStale() : Promise.resolve([] as string[]))
      .then(ids => { if (ids.length) console.log(`expired ${ids.length} transport request(s)`); })
      .catch(() => console.error('Expiring stale requests failed'));
  }, 5 * 60_000);
  sweep.unref();
  const shutdown = () => { clearInterval(sweep); server.close(() => { void store.close(); }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch(() => { console.error('Transport startup failed. Check database and authentication configuration.'); process.exitCode = 1; });
