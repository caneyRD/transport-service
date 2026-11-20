import { encode } from './canonical-values';
import { Location } from '../../domain/transport/value-objects/location';
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
    const result=await this.client.query(`SELECT COALESCE(max(agregado_version),0)::int AS version FROM baney.outbox WHERE modulo='transporte' AND agregado_tipo='Trip' AND agregado_uid=$1`,[tripId]);
    return result.rows[0].version as number;
  }
  async start(requestId:string,userId:string) {
    const request=await this.requests.findById(requestId);
    if(!request?.currentAssignmentId) throw new DomainError('Request has no active assignment');
    const assignment=await this.client.query(`SELECT a.id FROM baney.asignacion a JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id
      JOIN baney.vehiculo v ON v.id=a.vehiculo_id WHERE a.id=$1 AND a.solicitud_id=$2 AND a.estado='activa' AND a.eliminado_en IS NULL
      AND d.usuario_uid=$3 AND d.estado='habilitado' AND d.eliminado_en IS NULL AND v.estado='habilitado' AND v.eliminado_en IS NULL FOR UPDATE OF a,d,v`,[request.currentAssignmentId,requestId,userId]);
    if(!assignment.rows.length) throw new DomainError('Only the assigned enabled carrier can start the trip');
    const existing=await this.client.query(`SELECT * FROM baney.viaje WHERE asignacion_id=$1 AND eliminado_en IS NULL ORDER BY creado_en DESC LIMIT 1 FOR UPDATE`,[request.currentAssignmentId]);
    let row=existing.rows[0];
    if(row?.status==='IN_PROGRESS' && request.currentStatus==='IN_PROGRESS') return row;
    if(!row) {
      row=(await this.client.query(`INSERT INTO baney.viaje(id,solicitud_id,asignacion_id,estado,monto_acordado,moneda) SELECT $1,$2,$3,'programado',o.monto,o.moneda FROM baney.asignacion a JOIN baney.oferta_transporte o ON o.id=a.oferta_aceptada_id WHERE a.id=$3 RETURNING *`,[randomUUID(),requestId,request.currentAssignmentId])).rows[0];
    }
    const trip=Trip.restore({id:row.id,requestId,assignmentId:row.assignment_id,status:row.status,version:await this.version(row.id)});
    trip.start();request.startTrip();await this.requests.save(request);
    const result=await this.client.query(`UPDATE baney.viaje SET estado='en_transito',iniciado_en=now() WHERE id=$1 RETURNING *`,[row.id]);
    await this.outbox.append(trip.pullDomainEvents());return result.rows[0];
  }
  private async active(tripId:string,userId:string) {
    // Lock request first, matching cancellation/start lock order.
    const requestId=(await this.client.query('SELECT solicitud_id FROM baney.viaje WHERE id=$1',[tripId])).rows[0]?.request_id;
    if(!requestId) throw new DomainError('Trip was not found');
    const request=await this.requests.findById(requestId);
    const result=await this.client.query(`SELECT t.*,d.usuario_uid FROM baney.viaje t JOIN baney.asignacion a ON a.id=t.asignacion_id
      JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id WHERE t.id=$1 AND t.eliminado_en IS NULL AND a.eliminado_en IS NULL
      AND a.estado='activa' AND d.eliminado_en IS NULL AND d.usuario_uid=$2 FOR UPDATE OF t`,[tripId,userId]);
    const row=result.rows[0];
    if(!row || row.status!=='IN_PROGRESS' || request?.currentStatus!=='IN_PROGRESS') throw new DomainError('Only the assigned carrier can update an in-progress trip');
    return row;
  }
  async track(userId:string,point:TrackingPoint,sourcePointId:string) {
    // Canonicalize at the same six-decimal precision as PostgreSQL numeric(9,6).
    point=TrackingPoint.create({id:point.id,tripId:point.tripId,recordedAt:point.recordedAt,
      location:Location.create(point.location.address,Number(point.location.latitude.toFixed(6)),Number(point.location.longitude.toFixed(6)))});
    const row=await this.active(point.tripId,userId);const source='carrier:'+userId;
    const existing=await this.client.query('SELECT * FROM baney.punto_rastreo WHERE origen_actor=$1 AND punto_origen_id=$2',[source,sourcePointId]);
    if(existing.rows[0]) {
      const old=existing.rows[0];
      if(old.trip_id!==point.tripId || Number(old.latitude)!==point.location.latitude || Number(old.longitude)!==point.location.longitude || new Date(old.recorded_at).getTime()!==point.recordedAt.getTime()) throw new DomainError('Tracking point already exists with different data');
      return old;
    }
    if(point.recordedAt<new Date(row.started_at)) throw new DomainError('Tracking points must be chronological and after trip start');
    const last=await this.client.query('SELECT registrado_en FROM baney.punto_rastreo WHERE viaje_id=$1 ORDER BY registrado_en DESC LIMIT 1',[point.tripId]);
    if(last.rows[0] && point.recordedAt<new Date(last.rows[0].recorded_at)) throw new DomainError('Tracking points must be chronological');
    const trip=Trip.restore({id:row.id,requestId:row.request_id,assignmentId:row.assignment_id,status:TripStatus.IN_PROGRESS,version:await this.version(row.id)});
    trip.recordTrackingPoint(point);
    const result=await this.client.query(`INSERT INTO baney.punto_rastreo(id,viaje_id,origen_actor,punto_origen_id,latitud,longitud,registrado_en)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[point.id,point.tripId,source,sourcePointId,point.location.latitude,point.location.longitude,point.recordedAt]);
    await this.outbox.append(trip.pullDomainEvents());return result.rows[0];
  }
  async incident(userId:string,incident:TransportException) {
    const row=await this.active(incident.tripId,userId);
    const result=await this.client.query(`INSERT INTO baney.incidente(id,viaje_id,tipo,descripcion,ocurrido_en,reportado_por_uid,reportante_rol) VALUES($1,$2,$3,$4,$5,$6,'transportista') RETURNING *`,[incident.id,incident.tripId,encode(incident.type),incident.description,incident.occurredAt,userId]);
    await this.outbox.append([transportEvent('TransportExceptionReported',row.id,'Trip',(await this.version(row.id))+1,row.request_id,{incidentId:incident.id,type:incident.type})]);
    return result.rows[0];
  }
}
