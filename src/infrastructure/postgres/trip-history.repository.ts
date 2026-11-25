import { PoolClient } from 'pg';
import { TripHistoryRepository } from '../../application/transport/transport-queries';
export class PostgresTripHistoryRepository implements TripHistoryRepository {
  constructor(private readonly client:PoolClient) {}
  async history(userId:string,limit:number,offset:number) {
    const result=await this.client.query(`SELECT t.id,t.solicitud_id AS "requestId",t.estado,
      t.iniciado_en AS "startedAt",t.entregado_en AS "completedAt",r.origen_direccion AS origin,r.destino_direccion AS destination
      FROM baney.viaje t JOIN baney.solicitud_transporte r ON r.id=t.solicitud_id
      WHERE r.solicitante_uid=$1 AND r.eliminado_en IS NULL AND t.eliminado_en IS NULL
      ORDER BY t.creado_en DESC,t.id DESC LIMIT $2 OFFSET $3`,[userId,limit,offset]);
    return result.rows;
  }
  async requests(userId:string,limit:number,offset:number) {
    // Read model for UC-TRA-16: the client's own requests, including those still waiting for a carrier.
    const result=await this.client.query(`SELECT r.id,r.estado,r.creado_en AS "createdAt",
      r.origen_direccion AS "originAddress",r.origen_latitud::float8 AS "originLatitude",r.origen_longitud::float8 AS "originLongitude",
      r.destino_direccion AS "destinationAddress",r.destino_latitud::float8 AS "destinationLatitude",r.destino_longitud::float8 AS "destinationLongitude",
      r.ventana_recogida_desde AS "startsAt",r.ventana_recogida_hasta AS "endsAt",r.motivo_cancelacion AS "cancelReason",
      c.descripcion AS "cargoDescription",c.tipo_carga,c.peso_kg::float8 AS "weightKg",c.volumen_m3::float8 AS "volumeM3"
      FROM baney.solicitud_transporte r JOIN baney.carga c ON c.solicitud_id=r.id AND c.eliminado_en IS NULL
      WHERE r.solicitante_uid=$1 AND r.eliminado_en IS NULL
      ORDER BY r.creado_en DESC,r.id DESC LIMIT $2 OFFSET $3`,[userId,limit,offset]);
    return result.rows.map(row=>({ id:row.id, status:row.status, createdAt:row.createdAt,
      cargo:{ description:row.cargoDescription, type:row.cargo_type ?? null, weightKg:row.weightKg ?? undefined, volumeM3:row.volumeM3 ?? undefined },
      origin:{ address:row.originAddress, latitude:row.originLatitude, longitude:row.originLongitude },
      destination:{ address:row.destinationAddress, latitude:row.destinationLatitude, longitude:row.destinationLongitude },
      timeWindow:{ startsAt:row.startsAt, endsAt:row.endsAt },
      ...(typeof row.cancelReason==='string' && row.cancelReason.startsWith('Vencida') ? { expired:true } : {}) }));
  }
}
