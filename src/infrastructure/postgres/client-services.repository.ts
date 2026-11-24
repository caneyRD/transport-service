import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { ClientServicesRepository, CommissionTerms, PriceRule } from '../../application/transport/client-services';

const VEHICLES: Record<string, string> = { DUMP_TRUCK: 'volteo', FLATBED: 'plataforma', OTHER: 'otro' };
const CARGO: Record<string, string> = { MATERIALS: 'materiales', AGGREGATES: 'agregados', MACHINERY: 'maquinaria', OTHER: 'otro' };

// Quoted aliases on purpose: canonicalRows renames Spanish columns such as "estado" or "moneda".
export class PostgresClientServicesRepository implements ClientServicesRepository {
  constructor(private readonly client: PoolClient) {}

  async priceRule(vehicleType?: string, cargoType?: string): Promise<PriceRule | undefined> {
    const vehicle = vehicleType ? VEHICLES[vehicleType] ?? vehicleType : null, cargo = cargoType ? CARGO[cargoType] ?? cargoType : null;
    const r = await this.client.query(`SELECT id AS "ruleId",monto_base AS "base",precio_km AS "perKm",precio_tonelada AS "perTon",minimo AS "floor",moneda AS "ruleCurrency"
      FROM baney.regla_precio WHERE activa AND vigente_desde<=now() AND (vigente_hasta IS NULL OR vigente_hasta>now())
        AND (tipo_vehiculo IS NULL OR tipo_vehiculo=$1::text) AND (tipo_carga IS NULL OR tipo_carga=$2::text)
      ORDER BY (tipo_vehiculo IS NOT NULL)::int+(tipo_carga IS NOT NULL)::int DESC,vigente_desde DESC LIMIT 1`, [vehicle, cargo]);
    const x = r.rows[0];
    return x && { id: x.ruleId, basePrice: Number(x.base), pricePerKm: Number(x.perKm), pricePerTon: Number(x.perTon), minimum: Number(x.floor), currency: String(x.ruleCurrency).trim() };
  }

  async commissionTerms(currency: string): Promise<CommissionTerms | undefined> {
    const r = await this.client.query(`SELECT porcentaje AS "pct",monto_fijo AS "fixed",minimo AS "low",maximo AS "high" FROM baney.regla_comision
      WHERE aplica_a='transporte' AND ambito='global' AND moneda=$1 AND vigente_desde<=now() AND (vigente_hasta IS NULL OR vigente_hasta>now())
      ORDER BY prioridad ASC,vigente_desde DESC LIMIT 1`, [currency]);
    const x = r.rows[0];
    return x && { percentage: Number(x.pct), fixedAmount: Number(x.fixed), minimum: x.low === null ? undefined : Number(x.low), maximum: x.high === null ? undefined : Number(x.high) };
  }

  async cargoReady(requestId: string, requesterId: string) {
    const r = (await this.client.query(`SELECT s.estado AS "requestState",p.usuario_uid AS "carrierUid",s.origen_direccion AS "pickup"
      FROM baney.solicitud_transporte s JOIN baney.asignacion a ON a.solicitud_id=s.id AND a.estado='activa' AND a.eliminado_en IS NULL
      JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id
      WHERE s.id=$1::uuid AND s.solicitante_uid=$2::uuid AND s.eliminado_en IS NULL`, [requestId, requesterId])).rows[0];
    if (!r) throw new DomainError('Only the owner of an assigned request can mark the cargo ready');
    const note = await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      VALUES($1,'viaje','cargo_ready','La carga está lista',$2,jsonb_build_object('requestId',$3::text),$4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING creado_en AS "sentAt"`,
      [r.carrierUid, `El cliente confirmó que la carga está lista en ${r.pickup}.`, requestId, `cargo-ready:${requestId}`]);
    const sent = note.rows[0]?.sentAt ?? (await this.client.query(`SELECT creado_en AS "sentAt" FROM baney.notificacion WHERE idempotency_key=$1`, [`cargo-ready:${requestId}`])).rows[0].sentAt;
    return { requestId, cargoReadyAt: sent };
  }

  async assertParticipant(tripId: string, userId: string) {
    const r = await this.client.query(`SELECT 1 FROM baney.viaje t JOIN baney.solicitud_transporte s ON s.id=t.solicitud_id JOIN baney.asignacion a ON a.id=t.asignacion_id
      JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id WHERE t.id=$1::uuid AND t.eliminado_en IS NULL
      AND t.estado NOT IN ('entregado','cancelado') AND (s.solicitante_uid=$2::uuid OR p.usuario_uid=$2::uuid)`, [tripId, userId]);
    if (!r.rows.length) throw new DomainError('Only a participant of an ongoing trip can share it');
  }

  /** Public view: no names, phones or plates; only progress and the last position. */
  async sharedTrip(tripId: string) {
    const r = (await this.client.query(`SELECT t.estado AS "tripState",s.destino_direccion AS "toAddress",s.destino_latitud AS "toLat",s.destino_longitud AS "toLng",
        pr.latitud AS "lastLat",pr.longitud AS "lastLng",pr.registrado_en AS "lastSeenAt"
      FROM baney.viaje t JOIN baney.solicitud_transporte s ON s.id=t.solicitud_id
      LEFT JOIN LATERAL (SELECT latitud,longitud,registrado_en FROM baney.punto_rastreo WHERE viaje_id=t.id ORDER BY registrado_en DESC LIMIT 1) pr ON true
      WHERE t.id=$1::uuid AND t.eliminado_en IS NULL`, [tripId])).rows[0];
    if (!r) throw new DomainError('Shared trip was not found');
    return { state: r.tripState, destination: { address: r.toAddress, latitude: Number(r.toLat), longitude: Number(r.toLng) },
      position: r.lastLat === null ? undefined : { latitude: Number(r.lastLat), longitude: Number(r.lastLng), recordedAt: r.lastSeenAt } };
  }
}
