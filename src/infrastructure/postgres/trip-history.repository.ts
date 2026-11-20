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
}
