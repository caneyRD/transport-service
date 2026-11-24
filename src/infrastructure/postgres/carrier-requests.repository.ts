import { PoolClient } from 'pg';
import { CarrierOfferView, CarrierRequestRepository, OpenRequestView, OpenRequestsQuery } from '../../application/transport/carrier-requests';

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
}
