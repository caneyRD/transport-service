import { PoolClient } from 'pg';
import { TripHistoryRepository } from '../../application/transport/transport-queries';
export class PostgresTripHistoryRepository implements TripHistoryRepository {
  constructor(private readonly client:PoolClient) {}
  async history(userId:string,limit:number,offset:number) {
    const result=await this.client.query(`SELECT t.id,t.request_id AS "requestId",t.status,
      t.started_at AS "startedAt",t.completed_at AS "completedAt",r.origin_address AS origin,r.destination_address AS destination
      FROM transport.trips t JOIN transport.transport_requests r ON r.id=t.request_id
      WHERE r.requester_id=$1 AND r.deleted_at IS NULL AND t.deleted_at IS NULL
      ORDER BY t.created_at DESC,t.id DESC LIMIT $2 OFFSET $3`,[userId,limit,offset]);
    return result.rows;
  }
}
