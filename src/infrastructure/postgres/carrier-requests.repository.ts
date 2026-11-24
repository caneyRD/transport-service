import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { BackhaulInput, CarrierOfferView, CarrierRequestRepository, OpenRequestView, OpenRequestsQuery } from '../../application/transport/carrier-requests';

const place = (address: string, latitude: unknown, longitude: unknown) => ({ address, latitude: Number(latitude), longitude: Number(longitude) });
/** Columns with a custom alias are not decoded by canonicalRows: map offer states to the API names. */
const OFFER_STATUS: Record<string, string> = { borrador: 'DRAFT', enviada: 'SUBMITTED', contraofertada: 'COUNTERED', aceptada: 'ACCEPTED', rechazada: 'REJECTED', retirada: 'WITHDRAWN', expirada: 'EXPIRED' };

export class PostgresCarrierRequestRepository implements CarrierRequestRepository {
  constructor(private readonly client: PoolClient) {}

  async openNear(q: OpenRequestsQuery): Promise<OpenRequestView[]> {
    // Requests open to offers whose pickup is within the radius; never the carrier's own.
    const result = await this.client.query(`
      SELECT r.id, r.estado, r.creado_en AS "createdAt",
             r.origen_direccion AS "oAddress", r.origen_latitud::float8 AS "oLat", r.origen_longitud::float8 AS "oLng",
             r.destino_direccion AS "dAddress", r.destino_latitud::float8 AS "dLat", r.destino_longitud::float8 AS "dLng",
             r.ventana_recogida_desde AS "startsAt", r.ventana_recogida_hasta AS "endsAt",
             c.descripcion AS "cargoDescription", c.tipo_carga, c.peso_kg::float8 AS "weightKg", c.volumen_m3::float8 AS "volumeM3",
             round(d.km::numeric, 1)::float8 AS km,
             o.id AS "offerId", o.monto::float8 AS "offerAmount", o.moneda AS "offerCurrency", o.estado AS "offerStatus", o.reemplazada_por_contraoferta AS "offerCountered", o.vigente_hasta AS "offerValidUntil"
        FROM baney.solicitud_transporte r
        JOIN baney.carga c ON c.solicitud_id = r.id AND c.eliminado_en IS NULL
        CROSS JOIN LATERAL (SELECT 6371 * 2 * asin(sqrt(
               power(sin(radians(r.origen_latitud::float8 - $1) / 2), 2) +
               cos(radians($1)) * cos(radians(r.origen_latitud::float8)) *
               power(sin(radians(r.origen_longitud::float8 - $2) / 2), 2))) AS km) d
        LEFT JOIN LATERAL (SELECT id, monto, moneda, estado, reemplazada_por_contraoferta, vigente_hasta FROM baney.oferta_transporte
               WHERE solicitud_id = r.id AND transportista_uid = $5 AND eliminado_en IS NULL
               ORDER BY creado_en DESC LIMIT 1) o ON true
       WHERE r.eliminado_en IS NULL AND r.estado IN ('abierta', 'en_matching', 'con_ofertas')
         AND r.solicitante_uid <> $5 AND r.ventana_recogida_hasta > now()
         AND NOT EXISTS (SELECT 1 FROM baney.candidato_matching cm JOIN baney.perfil_transportista cp ON cp.id=cm.perfil_transportista_id
               WHERE cm.solicitud_id=r.id AND cp.usuario_uid=$5 AND cm.rechazado_en IS NOT NULL)
         AND r.origen_latitud BETWEEN $1 - $3 / 111.0 AND $1 + $3 / 111.0
         AND d.km <= $3
       ORDER BY d.km, r.creado_en DESC
       LIMIT $4`, [q.latitude, q.longitude, q.radiusKm, q.limit, q.carrierUserId]);
    return result.rows.map(r => ({
      id: r.id, status: r.status, distanceKm: r.km, createdAt: r.createdAt,
      cargo: { description: r.cargoDescription, type: r.cargo_type ?? undefined, weightKg: r.weightKg ?? undefined, volumeM3: r.volumeM3 ?? undefined },
      origin: place(r.oAddress, r.oLat, r.oLng), destination: place(r.dAddress, r.dLat, r.dLng),
      timeWindow: { startsAt: r.startsAt, endsAt: r.endsAt },
      ...(r.offerId ? { myOffer: { id: r.offerId, amount: r.offerAmount, currency: r.offerCurrency, status: r.offerCountered ? 'COUNTERED' : OFFER_STATUS[r.offerStatus] ?? r.offerStatus, validUntil: r.offerValidUntil } } : {}),
    }));
  }

  async enabledVehicle(carrierUserId: string, vehicleId?: string): Promise<string | undefined> {
    const result = await this.client.query(`SELECT v.id FROM baney.vehiculo v
      JOIN baney.perfil_transportista p ON p.usuario_uid = $1 AND p.eliminado_en IS NULL
      WHERE v.dueno_uid IN (p.usuario_uid, p.dueno_flota_uid) AND v.estado = 'habilitado' AND v.eliminado_en IS NULL
        AND ($2::uuid IS NULL OR v.id = $2::uuid)
      ORDER BY v.capacidad_kg DESC, v.id LIMIT 1`, [carrierUserId, vehicleId ?? null]);
    return result.rows[0]?.id;
  }

  async offersOf(carrierUserId: string, limit: number): Promise<CarrierOfferView[]> {
    const result = await this.client.query(`
      SELECT o.id, o.solicitud_id, o.monto::float8 AS "amount", o.moneda AS "currency", o.estado, o.vigente_hasta AS "validUntil",
             o.creado_en AS "createdAt", o.reemplazada_por_contraoferta,
             r.estado AS "requestEstado", r.origen_direccion AS "oAddress", r.origen_latitud::float8 AS "oLat", r.origen_longitud::float8 AS "oLng",
             r.destino_direccion AS "dAddress", r.destino_latitud::float8 AS "dLat", r.destino_longitud::float8 AS "dLng",
             c.descripcion AS "cargoDescription", t.id AS "tripId", t.estado AS "tripEstado"
        FROM baney.oferta_transporte o
        JOIN baney.solicitud_transporte r ON r.id = o.solicitud_id AND r.eliminado_en IS NULL
        JOIN baney.carga c ON c.solicitud_id = r.id AND c.eliminado_en IS NULL
        LEFT JOIN baney.asignacion a ON a.oferta_aceptada_id = o.id AND a.eliminado_en IS NULL
        LEFT JOIN LATERAL (SELECT id, estado FROM baney.viaje WHERE asignacion_id = a.id AND eliminado_en IS NULL ORDER BY creado_en DESC LIMIT 1) t ON true
       WHERE o.transportista_uid = $1 AND o.eliminado_en IS NULL
       ORDER BY o.creado_en DESC LIMIT $2`, [carrierUserId, limit]);
    const decode: Record<string, string> = { abierta: 'OPEN', en_matching: 'MATCHING', con_ofertas: 'OFFERED', asignada: 'ASSIGNED', en_curso: 'IN_PROGRESS', completada: 'COMPLETED', cancelada: 'CANCELLED',
      programado: 'PLANNED', en_transito: 'IN_PROGRESS', entregado: 'COMPLETED', cancelado: 'CANCELLED' };
    return result.rows.map(r => ({
      id: r.id, requestId: r.request_id, amount: r.amount, currency: r.currency, status: r.status, validUntil: r.validUntil, createdAt: r.createdAt,
      requestStatus: decode[r.requestEstado] ?? r.requestEstado,
      ...(r.tripId ? { tripId: r.tripId, tripStatus: decode[r.tripEstado] ?? r.tripEstado } : {}),
      origin: place(r.oAddress, r.oLat, r.oLng), destination: place(r.dAddress, r.dLat, r.dLng),
      cargo: { description: r.cargoDescription },
    }));
  }

  async reject(carrierUserId: string, requestId: string, reason: string) {
    // Nothing creates candidates yet: the rejection creates (or updates) this carrier's candidate row,
    // using its largest enabled vehicle, so the request stops appearing in its open list.
    const result=await this.client.query(`INSERT INTO baney.candidato_matching (solicitud_id,perfil_transportista_id,vehiculo_id,puntuacion,rechazado_en,motivo_rechazo)
      SELECT r.id,p.id,v.id,0,now(),$3 FROM baney.solicitud_transporte r
        JOIN baney.perfil_transportista p ON p.usuario_uid=$1 AND p.eliminado_en IS NULL
        JOIN LATERAL (SELECT id FROM baney.vehiculo WHERE dueno_uid IN (p.usuario_uid,p.dueno_flota_uid) AND estado='habilitado' AND eliminado_en IS NULL
               ORDER BY capacidad_kg DESC,id LIMIT 1) v ON true
       WHERE r.id=$2 AND r.eliminado_en IS NULL
      ON CONFLICT (solicitud_id,vehiculo_id) DO UPDATE SET rechazado_en=COALESCE(baney.candidato_matching.rechazado_en,now()),motivo_rechazo=EXCLUDED.motivo_rechazo
      RETURNING id,solicitud_id AS "requestId",rechazado_en AS "rejectedAt",motivo_rechazo AS reason`,[carrierUserId,requestId,reason]);
    if (!result.rows.length) throw new DomainError('Request or enabled carrier vehicle was not found');
    return result.rows[0];
  }

  async publishBackhaul(carrierUserId: string, input: BackhaulInput) {
    const result=await this.client.query(`INSERT INTO baney.oferta_retorno(perfil_transportista_id,vehiculo_id,origen_direccion,origen_latitud,origen_longitud,destino_direccion,destino_latitud,destino_longitud,disponible_desde,disponible_hasta,capacidad_kg)
      SELECT p.id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM baney.perfil_transportista p JOIN baney.vehiculo v ON v.id=$2 AND v.dueno_uid IN (p.usuario_uid,p.dueno_flota_uid) AND v.estado='habilitado'
      WHERE p.usuario_uid=$1 AND p.estado='habilitado' AND p.eliminado_en IS NULL RETURNING id,perfil_transportista_id AS "profileId",vehiculo_id AS "vehicleId",origen_direccion AS "originAddress",destino_direccion AS "destinationAddress",disponible_desde AS "availableFrom",disponible_hasta AS "availableTo",capacidad_kg AS "capacityKg",estado`,[carrierUserId,input.vehicleId,input.origin.address,input.origin.latitude,input.origin.longitude,input.destination.address,input.destination.latitude,input.destination.longitude,input.availableFrom,input.availableTo,input.capacityKg]);
    if (!result.rows.length) throw new DomainError('Enabled carrier or vehicle was not found');
    return result.rows[0];
  }

  async backhaulsOf(carrierUserId: string) {
    const result=await this.client.query(`SELECT o.id,o.vehiculo_id AS "vehicleId",o.origen_direccion AS "originAddress",o.origen_latitud AS "originLatitude",o.origen_longitud AS "originLongitude",o.destino_direccion AS "destinationAddress",o.destino_latitud AS "destinationLatitude",o.destino_longitud AS "destinationLongitude",o.disponible_desde AS "availableFrom",o.disponible_hasta AS "availableTo",o.capacidad_kg AS "capacityKg",o.estado FROM baney.oferta_retorno o JOIN baney.perfil_transportista p ON p.id=o.perfil_transportista_id WHERE p.usuario_uid=$1 ORDER BY o.creado_en DESC`,[carrierUserId]);
    return result.rows;
  }
}
