import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { Trip, TripStatus } from '../../domain/transport/trip';
import { TrackingPoint } from '../../domain/transport/tracking-point';
import { TransportException } from '../../domain/transport/transport-exception';
import { transportEvent } from '../../domain/transport/events';
import { TripOperationsRepository } from '../../application/transport/trip-operations';
import { TransportRequestRepository } from '../../application/transport/ports/transport-request.repository';
import { TransportDomainOutbox } from '../../application/transport/ports/transport-domain-outbox';

export class PostgresTripOperationsRepository implements TripOperationsRepository {
  constructor(private readonly client:PoolClient,private readonly requests:TransportRequestRepository,private readonly outbox:TransportDomainOutbox) {}
  private async version(tripId:string) {
    const result=await this.client.query(`SELECT COALESCE(max(aggregate_version),0)::int AS version FROM transport.outbox_events WHERE aggregate_type='Trip' AND aggregate_id=$1`,[tripId]);
    return result.rows[0].version as number;
  }
  async start(requestId:string,userId:string) {
    const request=await this.requests.findById(requestId);
    if(!request?.currentAssignmentId) throw new DomainError('Request has no active assignment');
    const assignment=await this.client.query(`SELECT a.id FROM transport.assignments a JOIN transport.driver_profiles d ON d.id=a.driver_profile_id
      JOIN transport.vehicles v ON v.id=a.vehicle_id WHERE a.id=$1 AND a.request_id=$2 AND a.status='ACTIVE' AND a.deleted_at IS NULL
      AND d.user_id=$3 AND d.status='ENABLED' AND d.deleted_at IS NULL AND v.status='ENABLED' AND v.deleted_at IS NULL FOR UPDATE OF a,d,v`,[request.currentAssignmentId,requestId,userId]);
    if(!assignment.rows.length) throw new DomainError('Only the assigned enabled carrier can start the trip');
    const existing=await this.client.query(`SELECT * FROM transport.trips WHERE assignment_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[request.currentAssignmentId]);
    let row=existing.rows[0];
    if(row?.status==='IN_PROGRESS' && request.currentStatus==='IN_PROGRESS') return row;
    if(!row) {
      row=(await this.client.query(`INSERT INTO transport.trips(id,request_id,assignment_id,status) VALUES($1,$2,$3,'PLANNED') RETURNING *`,[randomUUID(),requestId,request.currentAssignmentId])).rows[0];
    }
    const trip=Trip.restore({id:row.id,requestId,assignmentId:row.assignment_id,status:row.status,version:await this.version(row.id)});
    trip.start();request.startTrip();await this.requests.save(request);
    const result=await this.client.query(`UPDATE transport.trips SET status='IN_PROGRESS',started_at=now() WHERE id=$1 RETURNING *`,[row.id]);
    await this.outbox.append(trip.pullDomainEvents());return result.rows[0];
  }
  private async active(tripId:string,userId:string) {
    // Lock request first, matching cancellation/start lock order.
    const requestId=(await this.client.query('SELECT request_id FROM transport.trips WHERE id=$1',[tripId])).rows[0]?.request_id;
    if(!requestId) throw new DomainError('Trip was not found');
    const request=await this.requests.findById(requestId);
    const result=await this.client.query(`SELECT t.*,d.user_id FROM transport.trips t JOIN transport.assignments a ON a.id=t.assignment_id
      JOIN transport.driver_profiles d ON d.id=a.driver_profile_id WHERE t.id=$1 AND t.deleted_at IS NULL AND a.deleted_at IS NULL
      AND a.status='ACTIVE' AND d.deleted_at IS NULL AND d.user_id=$2 FOR UPDATE OF t`,[tripId,userId]);
    const row=result.rows[0];
    if(!row || row.status!=='IN_PROGRESS' || request?.currentStatus!=='IN_PROGRESS') throw new DomainError('Only the assigned carrier can update an in-progress trip');
    return row;
  }
  async track(userId:string,point:TrackingPoint,sourcePointId:string) {
    const row=await this.active(point.tripId,userId);const source='carrier:'+userId;
    const existing=await this.client.query('SELECT * FROM transport.tracking_points WHERE source=$1 AND source_point_id=$2',[source,sourcePointId]);
    if(existing.rows[0]) {
      const old=existing.rows[0];
      if(old.trip_id!==point.tripId || Number(old.latitude)!==point.location.latitude || Number(old.longitude)!==point.location.longitude || new Date(old.recorded_at).getTime()!==point.recordedAt.getTime()) throw new DomainError('Tracking point already exists with different data');
      return old;
    }
    if(point.recordedAt<new Date(row.started_at)) throw new DomainError('Tracking points must be chronological and after trip start');
    const last=await this.client.query('SELECT recorded_at FROM transport.tracking_points WHERE trip_id=$1 ORDER BY recorded_at DESC LIMIT 1',[point.tripId]);
    if(last.rows[0] && point.recordedAt<new Date(last.rows[0].recorded_at)) throw new DomainError('Tracking points must be chronological');
    const trip=Trip.restore({id:row.id,requestId:row.request_id,assignmentId:row.assignment_id,status:TripStatus.IN_PROGRESS,version:await this.version(row.id)});
    trip.recordTrackingPoint(point);
    const result=await this.client.query(`INSERT INTO transport.tracking_points(id,trip_id,source,source_point_id,latitude,longitude,recorded_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[point.id,point.tripId,source,sourcePointId,point.location.latitude,point.location.longitude,point.recordedAt]);
    await this.outbox.append(trip.pullDomainEvents());return result.rows[0];
  }
  async incident(userId:string,incident:TransportException) {
    const row=await this.active(incident.tripId,userId);
    const result=await this.client.query(`INSERT INTO transport.transport_exceptions(id,trip_id,type,description,occurred_at) VALUES($1,$2,$3,$4,$5) RETURNING *`,[incident.id,incident.tripId,incident.type,incident.description,incident.occurredAt]);
    await this.outbox.append([transportEvent('TransportExceptionReported',row.id,'Trip',(await this.version(row.id))+1,row.request_id,{incidentId:incident.id,type:incident.type})]);
    return result.rows[0];
  }
}
