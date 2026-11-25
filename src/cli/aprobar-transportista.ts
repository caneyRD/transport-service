import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { CarrierApprovalHandler } from '../application/transport/carrier-approval';
import { PostgresTransportStore } from '../infrastructure/postgres/transport-store';

/**
 * Back-office CLI: approves a carrier and its trucks with the same rules as PATCH /admin/carriers|vehicles.
 * The reviewer is identified by e-mail and must be 'moderador' or 'superadmin' in baney.usuario; every change
 * is audited under that reviewer. Uses DATABASE_URL from .env.
 *
 *   npm run build
 *   node dist/cli/aprobar-transportista.js <reviewer-email> <carrier-user-id> [estado]
 */
async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const [email, carrierId, status = 'habilitado'] = process.argv.slice(2);
  if (!email || !carrierId) {
    console.error('Uso: node dist/cli/aprobar-transportista.js <correo-del-administrador> <id-del-transportista> [habilitado|suspendido|deshabilitado|pendiente]');
    process.exitCode = 2;
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000, application_name: 'baney-transport-cli' });
  try {
    const reviewer = await pool.query(`SELECT id,rol AS "userRole" FROM baney.usuario WHERE lower(email)=lower($1) AND eliminado_en IS NULL`, [email.trim()]);
    if (!reviewer.rows[0]) throw new Error(`No existe un usuario con el correo ${email}`);
    const reviewerId = reviewer.rows[0].id as string;
    console.log(`Administrador: ${email} (rol: ${reviewer.rows[0].userRole})`);
    const store = new PostgresTransportStore(pool);
    const approval = (r: Parameters<Parameters<typeof store.execute>[0]>[0]) => new CarrierApprovalHandler(r.approval);

    const carrier = await store.execute(r => approval(r).setCarrier(reviewerId, carrierId, status)) as { status: string; missingDocuments?: string[] };
    console.log(`Transportista ${carrierId}: ${carrier.status}`);
    const detail = await store.execute(r => approval(r).detail(reviewerId, carrierId)) as { vehicles: Array<{ id: string; plate: string; status: string }> };
    if (!detail.vehicles.length) console.log('No tiene camiones registrados: agrega uno en la app (Flota) y vuelve a correr este comando.');
    for (const v of detail.vehicles) {
      if (v.status === status) { console.log(`Camión ${v.plate}: ya estaba ${status}`); continue; }
      const r = await store.execute(x => approval(x).setVehicle(reviewerId, v.id, status)) as { status: string };
      console.log(`Camión ${v.plate}: ${r.status}`);
    }
    if (carrier.missingDocuments?.length) console.log(`Aviso: documentos sin aprobar: ${carrier.missingDocuments.join(', ')} (para pruebas no bloquea).`);
    console.log('Listo.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(`No se pudo: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
