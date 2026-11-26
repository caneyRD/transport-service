import { commissionFor } from '../../application/transport/client-services';
import { encode } from './canonical-values';
import { Location } from '../../domain/transport/value-objects/location';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { Trip, TripStatus } from '../../domain/transport/trip';
import { TrackingPoint } from '../../domain/transport/tracking-point';
import { TransportException } from '../../domain/transport/transport-exception';
import { transportEvent } from '../../domain/transport/events';
import { TripEvidenceInput, TripMilestone, TripOperationsRepository } from '../../application/transport/trip-operations';
import { TransportRequestRepository } from '../../application/transport/ports/transport-request.repository';
import { TransportDomainOutbox } from '../../application/transport/ports/transport-domain-outbox';

export class PostgresTripOperationsRepository implements TripOperationsRepository {
  constructor(private readonly client:PoolClient,private readonly requests:TransportRequestRepository,private readonly outbox:TransportDomainOutbox) {}
  private async version(tripId:string) {
    const result=await this.client.query(`SELECT COALESCE(max(agregado_version),0)::int AS version FROM baney.outbox WHERE modulo='transporte' AND agregado_tipo='Trip' AND agregado_uid=$1`,[tripId]);
    return result.rows[0].version as number;
  }
  /** The assigned enabled carrier's trip for a request; created as 'programado' the first time (UC-TRA-128). */
  private async plannedTrip(requestId:string,userId:string) {
    const request=await this.requests.findById(requestId);
    if(!request?.currentAssignmentId) throw new DomainError('Request has no active assignment');
    const assignment=await this.client.query(`SELECT a.id FROM baney.asignacion a JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id
      JOIN baney.vehiculo v ON v.id=a.vehiculo_id WHERE a.id=$1 AND a.solicitud_id=$2 AND a.estado='activa' AND a.eliminado_en IS NULL
      AND d.usuario_uid=$3 AND d.estado='habilitado' AND d.eliminado_en IS NULL AND v.estado='habilitado' AND v.eliminado_en IS NULL FOR UPDATE OF a,d,v`,[request.currentAssignmentId,requestId,userId]);
    if(!assignment.rows.length) throw new DomainError('Only the assigned enabled carrier can operate the trip');
    const existing=await this.client.query(`SELECT *,estado AS "tripState" FROM baney.viaje WHERE asignacion_id=$1 AND eliminado_en IS NULL ORDER BY creado_en DESC LIMIT 1 FOR UPDATE`,[request.currentAssignmentId]);
    let row=existing.rows[0];
    if(!row) {
      row=(await this.client.query(`INSERT INTO baney.viaje(id,solicitud_id,asignacion_id,estado,monto_acordado,moneda) SELECT $1,$2,$3,'programado',o.monto,o.moneda FROM baney.asignacion a JOIN baney.oferta_transporte o ON o.id=a.oferta_aceptada_id WHERE a.id=$3 RETURNING *,estado AS "tripState"`,[randomUUID(),requestId,request.currentAssignmentId])).rows[0];
    }
    return {request,row};
  }
  /** UC-TRA-128: the carrier confirms the assigned trip; the client is told. Idempotent. */
  async confirm(requestId:string,userId:string) {
    const {request,row}=await this.plannedTrip(requestId,userId);
    if(row.tripState!=='programado' || row.confirmado_en) return this.tripView(row.id);
    await this.client.query(`UPDATE baney.viaje SET confirmado_en=now(),actualizado_en=now(),version_fila=version_fila+1 WHERE id=$1`,[row.id]);
    await this.client.query(`INSERT INTO baney.viaje_evento(id,viaje_id,estado_anterior,estado_nuevo,tipo_evento,actor_uid) VALUES($1,$2,'programado','programado','CONFIRM_ASSIGNMENT',$3)`,[randomUUID(),row.id,userId]);
    await this.notifyClient(request.props.requesterId,row.id,'trip_confirmed','Tu transportista confirmó el viaje','El transportista confirmó tu solicitud y se prepara para salir.',`trip-confirmed:${row.id}`);
    return this.tripView(row.id);
  }
  private async tripView(tripId:string) {
    const r=await this.client.query(`SELECT id AS "tripId",solicitud_id AS "requestId",estado AS "tripState",confirmado_en AS "confirmedAt",salida_a_origen_en AS "departedAt",
      llegada_origen_en AS "arrivedOriginAt",cargado_en AS "loadedAt",iniciado_en AS "startedAt" FROM baney.viaje WHERE id=$1`,[tripId]);
    const x=r.rows[0];
    return {id:x.tripId,requestId:x.requestId,state:x.tripState,confirmedAt:x.confirmedAt,departedAt:x.departedAt,arrivedOriginAt:x.arrivedOriginAt,loadedAt:x.loadedAt,startedAt:x.startedAt};
  }
  private async notifyClient(userId:string,tripId:string,template:string,title:string,body:string,key:string) {
    await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      VALUES($1,'viaje',$2,$3,$4,jsonb_build_object('tripId',$5::text,'requestId',(SELECT solicitud_id::text FROM baney.viaje WHERE id=$5::uuid)),$6) ON CONFLICT (idempotency_key) DO NOTHING`,[userId,template,title,body,tripId,key]);
  }
  async start(requestId:string,userId:string) {
    const {request,row}=await this.plannedTrip(requestId,userId);
    if(row.tripState==='en_transito' && request.currentStatus==='IN_PROGRESS') return row;
    // UC-TRA-135: departing with the cargo; the pre-start steps (confirm, depart, check-in, loaded) are optional.
    if(!['programado','hacia_origen','en_origen','cargado'].includes(row.tripState)) throw new DomainError(`Trip cannot start from ${row.tripState}`);
    const trip=Trip.restore({id:row.id,requestId,assignmentId:row.assignment_id,status:TripStatus.PLANNED,version:await this.version(row.id)});
    trip.start();request.startTrip();await this.requests.save(request);
    const result=await this.client.query(`UPDATE baney.viaje SET estado='en_transito',iniciado_en=now(),actualizado_en=now(),version_fila=version_fila+1 WHERE id=$1 RETURNING *`,[row.id]);
    await this.client.query(`INSERT INTO baney.viaje_evento(id,viaje_id,estado_anterior,estado_nuevo,tipo_evento,actor_uid) VALUES($1,$2,$3,'en_transito','START_TRIP',$4)`,[randomUUID(),row.id,row.tripState,userId]);
    await this.issueDeliveryOtp(row.id,request.props.requesterId);
    await this.outbox.append(trip.pullDomainEvents());return result.rows[0];
  }
  /** UC-TRA-85: delivery code for the client. Only its hash is stored; the client gets it in its notifications. */
  private async issueDeliveryOtp(tripId:string,requesterId:string) {
    const pending=await this.client.query('SELECT otp_entrega_hash IS NULL AS "needsOtp" FROM baney.viaje WHERE id=$1',[tripId]);
    if(!pending.rows[0]?.needsOtp) return;
    const code=String(randomInt(0,1_000_000)).padStart(6,'0');
    await this.client.query('UPDATE baney.viaje SET otp_entrega_hash=$2,otp_entrega_intentos=0 WHERE id=$1',[tripId,createHash('sha256').update(code).digest('hex')]);
    await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      VALUES($1,'viaje','delivery_otp','Código de entrega',$2,jsonb_build_object('tripId',$3::text,'deliveryCode',$4::text,'requestId',(SELECT solicitud_id::text FROM baney.viaje WHERE id=$3::uuid)),$5) ON CONFLICT (idempotency_key) DO NOTHING`,
      [requesterId,`Dale este código al transportista al recibir tu carga: ${code}`,tripId,code,`delivery-otp:${tripId}`]);
  }
  /** Delivery closes the request and releases the carrier and vehicle for new trips. */
  private async finishDelivery(requestId:string,tripId:string) {
    const request=await this.requests.findById(requestId);
    if(!request) throw new DomainError('Transport request was not found');
    if(request.currentStatus==='IN_PROGRESS') { request.complete(); await this.requests.save(request); }
    await this.client.query(`UPDATE baney.asignacion SET estado='completada',completado_en=now() WHERE solicitud_id=$1 AND estado='activa' AND eliminado_en IS NULL`,[requestId]);
    await this.settleSafely(tripId);
  }
  /**
   * Paying the carrier must never undo a confirmed delivery: if the ledger write fails, the delivery stands,
   * the cause is logged and settlePending() retries it (idempotent) from the periodic sweep.
   */
  private async settleSafely(tripId:string) {
    await this.client.query('SAVEPOINT settle_trip');
    try {
      await this.settle(tripId);
      await this.client.query('RELEASE SAVEPOINT settle_trip');
      return true;
    } catch (error) {
      await this.client.query('ROLLBACK TO SAVEPOINT settle_trip');
      console.error(`[transport] settlement pending for trip ${tripId}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  /**
   * Capturing the client's authorized payment belongs to Payments; Transport only asks for it at delivery.
   * Without permission on baney.pago (its own database role) or on any failure, the delivery still stands.
   */
  private async capturePaymentSafely(tripId:string) {
    await this.client.query('SAVEPOINT capture_payment');
    try {
      await this.client.query(`UPDATE baney.pago SET estado='capturado',monto_capturado=monto,capturado_en=COALESCE(capturado_en,now()),actualizado_en=now() WHERE viaje_id=$1 AND estado IN ('autorizado','preautorizado')`,[tripId]);
      await this.client.query('RELEASE SAVEPOINT capture_payment');
    } catch (error) {
      await this.client.query('ROLLBACK TO SAVEPOINT capture_payment');
      console.error(`[transport] payment capture pending for trip ${tripId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /** Delivered trips (last 60 days) whose freight was not credited yet. Returns the ids settled now. */
  async settlePending(limit=50):Promise<string[]> {
    const pending=await this.client.query(`SELECT t.id AS "tripId" FROM baney.viaje t
      WHERE t.estado='entregado' AND t.eliminado_en IS NULL AND t.monto_acordado>0 AND t.entregado_en > now()-interval '60 days'
        AND NOT EXISTS (SELECT 1 FROM baney.movimiento m WHERE m.viaje_id=t.id AND m.tipo='flete')
      ORDER BY t.entregado_en LIMIT $1 FOR UPDATE OF t SKIP LOCKED`,[limit]);
    const settled:string[]=[];
    for (const row of pending.rows) if (await this.settleSafely(row.tripId)) settled.push(row.tripId);
    return settled;
  }
  /**
   * UC-TRA-48/156: credits the carrier's account with the freight and debits BANEY's commission
   * (current transport rule). Idempotent: the ledger allows one entry per account, type and origin.
   */
  private async settle(tripId:string) {
    const trip=(await this.client.query(`SELECT t.monto_acordado AS "agreedAmount",t.moneda AS "tripCurrency",p.usuario_uid AS "carrierUid",
        COALESCE(u.nombre_completo,u.email) AS "carrierName" FROM baney.viaje t JOIN baney.asignacion a ON a.id=t.asignacion_id
        JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id JOIN baney.usuario u ON u.id=p.usuario_uid WHERE t.id=$1`,[tripId])).rows[0];
    const gross=Number(trip.agreedAmount), currency=String(trip.tripCurrency).trim();
    if (!(gross>0)) return;
    await this.client.query(`INSERT INTO baney.cuenta(titular_tipo,titular_uid,titular_nombre,moneda) VALUES('transportista',$1,$2,$3) ON CONFLICT DO NOTHING`,[trip.carrierUid,trip.carrierName,currency]);
    const account=(await this.client.query(`SELECT id AS "accountId" FROM baney.cuenta WHERE titular_uid=$1 AND titular_tipo='transportista' AND moneda=$2 AND estado='activa'`,[trip.carrierUid,currency])).rows[0];
    if (!account) throw new DomainError('Carrier account is not active');
    const credited=await this.client.query(`INSERT INTO baney.movimiento(cuenta_id,tipo,monto,saldo_despues,moneda,estado_fondos,viaje_id,descripcion)
      VALUES($1,'flete',$2,0,$3,'disponible',$4,'Flete del viaje') ON CONFLICT DO NOTHING RETURNING id`,[account.accountId,gross,currency,tripId]);
    if (!credited.rows.length) return;
    const rule=(await this.client.query(`SELECT id AS "ruleId",porcentaje AS "rulePct",monto_fijo AS "ruleFixed",minimo AS "ruleMin",maximo AS "ruleMax" FROM baney.regla_comision
      WHERE aplica_a='transporte' AND ambito='global' AND moneda=$1 AND vigente_desde<=now() AND (vigente_hasta IS NULL OR vigente_hasta>now())
      ORDER BY prioridad ASC,vigente_desde DESC LIMIT 1`,[currency])).rows[0];
    if (!rule) return;
    const commission=commissionFor({percentage:Number(rule.rulePct),fixedAmount:Number(rule.ruleFixed),minimum:rule.ruleMin===null?undefined:Number(rule.ruleMin),maximum:rule.ruleMax===null?undefined:Number(rule.ruleMax)},gross);
    if (commission<=0) return;
    const fee=(await this.client.query(`INSERT INTO baney.comision(viaje_id,obligado_uid,obligado_tipo,regla_id,base_calculo,porcentaje_aplicado,monto,total,moneda)
      VALUES($1,$2,'transportista',$3,$4,$5,$6,$6,$7) RETURNING id AS "feeId"`,[tripId,trip.carrierUid,rule.ruleId,gross,Number(rule.rulePct),commission,currency])).rows[0];
    await this.client.query(`INSERT INTO baney.movimiento(cuenta_id,tipo,monto,saldo_despues,moneda,estado_fondos,viaje_id,comision_id,descripcion)
      VALUES($1,'comision',$2,0,$3,'disponible',$4,$5,'Comisión BANEY del viaje')`,[account.accountId,-commission,currency,tripId,fee.feeId]);
  }
  private async active(tripId:string,userId:string) {
    // Lock request first, matching cancellation/start lock order.
    const requestId=(await this.client.query('SELECT solicitud_id FROM baney.viaje WHERE id=$1',[tripId])).rows[0]?.request_id;
    if(!requestId) throw new DomainError('Trip was not found');
    const request=await this.requests.findById(requestId);
    const result=await this.client.query(`SELECT t.*,d.usuario_uid,t.estado AS "tripState",COALESCE(t.salida_a_origen_en,t.iniciado_en) AS "trackFrom"
      FROM baney.viaje t JOIN baney.asignacion a ON a.id=t.asignacion_id
      JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id WHERE t.id=$1 AND t.eliminado_en IS NULL AND a.eliminado_en IS NULL
      AND a.estado='activa' AND d.eliminado_en IS NULL AND d.usuario_uid=$2 FOR UPDATE OF t`,[tripId,userId]);
    const row=result.rows[0];
    // Live GPS from the moment the carrier leaves for the pickup until delivery: the client sees it coming.
    const moving=['hacia_origen','en_origen','cargado','en_transito','en_destino','descargado'];
    if(!row || !moving.includes(row.tripState) || !['ASSIGNED','IN_PROGRESS'].includes(String(request?.currentStatus))) throw new DomainError('Only the assigned carrier can update an in-progress trip');
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
    // A few seconds of clock skew between the phone and the server are tolerated.
    if(point.recordedAt.getTime()<new Date(row.trackFrom).getTime()-60_000) throw new DomainError('Tracking points must be chronological and after trip start');
    const last=await this.client.query('SELECT registrado_en FROM baney.punto_rastreo WHERE viaje_id=$1 ORDER BY registrado_en DESC LIMIT 1',[point.tripId]);
    if(last.rows[0] && point.recordedAt<new Date(last.rows[0].recorded_at)) throw new DomainError('Tracking points must be chronological');
    const trip=Trip.restore({id:row.id,requestId:row.request_id,assignmentId:row.assignment_id,status:TripStatus.IN_PROGRESS,version:await this.version(row.id)});
    trip.recordTrackingPoint(point);
    const result=await this.client.query(`INSERT INTO baney.punto_rastreo(id,viaje_id,origen_actor,punto_origen_id,latitud,longitud,registrado_en)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[point.id,point.tripId,source,sourcePointId,point.location.latitude,point.location.longitude,point.recordedAt]);
    await this.outbox.append(trip.pullDomainEvents());return result.rows[0];
  }
  /**
   * Incidents from either side of the trip. The carrier reports while it holds the assignment (from confirmation
   * until delivery); the client reports damage, missing cargo, a no-show, delays or asks for help (UC-TRA-87/88/90/91),
   * and damage or missing cargo also right after delivery.
   */
  async incident(userId:string,incident:TransportException) {
    const ctx=(await this.client.query(`SELECT t.id,t.estado AS "tripState",t.solicitud_id AS "requestId",s.solicitante_uid AS "clientUid",
        d.usuario_uid AS "carrierUid",a.estado AS "assignmentState" FROM baney.viaje t JOIN baney.solicitud_transporte s ON s.id=t.solicitud_id
      JOIN baney.asignacion a ON a.id=t.asignacion_id JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id
      WHERE t.id=$1 AND t.eliminado_en IS NULL FOR UPDATE OF t`,[incident.tripId])).rows[0];
    if(!ctx) throw new DomainError('Trip was not found');
    const open=!['entregado','cancelado'].includes(ctx.tripState);
    let role:'transportista'|'cliente';
    if(ctx.carrierUid===userId) {
      if(!open || ctx.assignmentState!=='activa') throw new DomainError('Only the assigned carrier can report on an ongoing trip');
      role='transportista';
    } else if(ctx.clientUid===userId) {
      const clientTypes=['DAMAGE','CARGO_MISSING','NO_SHOW','ASSISTANCE','SOS','DELAY','OTHER'];
      if(!clientTypes.includes(incident.type)) throw new DomainError('The client cannot report this incident type');
      const afterDelivery=ctx.tripState==='entregado' && ['DAMAGE','CARGO_MISSING'].includes(incident.type);
      if(!open && !afterDelivery) throw new DomainError('The trip is closed');
      if(incident.type==='NO_SHOW' && !['programado','hacia_origen'].includes(ctx.tripState)) throw new DomainError('A no-show can only be reported before pickup');
      role='cliente';
    } else throw new DomainError('Only a trip participant can report an incident');
    const result=await this.client.query(`INSERT INTO baney.incidente(id,viaje_id,tipo,descripcion,ocurrido_en,reportado_por_uid,reportante_rol,gravedad) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [incident.id,incident.tripId,encode(incident.type),incident.description,incident.occurredAt,userId,role,incident.type === 'SOS' ? 'critica' : 'media']);
    // The other side learns about it.
    const other=role==='cliente' ? ctx.carrierUid : ctx.clientUid;
    await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      VALUES($1,'viaje','trip_incident',$2,$3,jsonb_build_object('tripId',$4::text,'incidentId',$5::text,'type',$6::text),$7) ON CONFLICT (idempotency_key) DO NOTHING`,
      [other,role==='cliente'?'El cliente reportó un incidente':'El transportista reportó un incidente',incident.description,incident.tripId,incident.id,incident.type,`trip-incident:${incident.id}`]);
    await this.outbox.append([transportEvent('TransportExceptionReported',ctx.id,'Trip',(await this.version(ctx.id))+1,ctx.requestId,{incidentId:incident.id,type:incident.type,reportedBy:role})]);
    return result.rows[0];
  }


  async milestone(tripId:string,userId:string,milestone:TripMilestone) {
    const current=await this.client.query(`SELECT t.id,t.estado AS "tripState",t.solicitud_id AS "requestId"
      FROM baney.viaje t JOIN baney.asignacion a ON a.id=t.asignacion_id
      JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id
      WHERE t.id=$1 AND t.eliminado_en IS NULL AND a.estado='activa' AND d.usuario_uid=$2 FOR UPDATE OF t`,[tripId,userId]);
    const row=current.rows[0];
    if (!row) throw new DomainError('Only the assigned carrier can update this trip');
    const transitions: Record<TripMilestone,{from:string[];to:string;column:string}> = {
      CONFIRM_ASSIGNMENT:{from:['programado'],to:'programado',column:'confirmado_en'},
      // Pre-start steps (UC-TRA-28/29/129/130/133): the trip exists from confirm(); start() then moves it to en_transito.
      DEPART_TO_ORIGIN:{from:['programado'],to:'hacia_origen',column:'salida_a_origen_en'},
      CHECKIN_ORIGIN:{from:['hacia_origen'],to:'en_origen',column:'llegada_origen_en'},
      MARK_LOADED:{from:['en_origen'],to:'cargado',column:'cargado_en'},
      CHECKIN_DESTINATION:{from:['en_transito'],to:'en_destino',column:'llegada_destino_en'},
      UNLOAD:{from:['en_destino'],to:'descargado',column:'descargado_en'},
      COMPLETE_DELIVERY:{from:['descargado'],to:'entregado',column:'entregado_en'},
    };
    const transition=transitions[milestone];
    if (!transition.from.includes(row.tripState)) throw new DomainError(`Milestone ${milestone} is invalid from ${row.tripState}`);
    const next = transition.to;
    const updated=await this.client.query(`UPDATE baney.viaje SET estado=$2,${transition.column}=COALESCE(${transition.column},now()),actualizado_en=now(),version_fila=version_fila+1 WHERE id=$1 RETURNING *`,[tripId,next]);
    await this.client.query(`INSERT INTO baney.viaje_evento(id,viaje_id,estado_anterior,estado_nuevo,tipo_evento,actor_uid) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),tripId,row.tripState,next,milestone,userId]);
    if (next==='entregado') await this.finishDelivery(row.requestId,tripId);
    const notices:Partial<Record<TripMilestone,[string,string]>>={DEPART_TO_ORIGIN:['Tu transportista va en camino','Salió hacia el punto de recogida.'],
      CHECKIN_ORIGIN:['Tu transportista llegó a la recogida','Está en el punto de recogida.'],MARK_LOADED:['Tu carga fue recogida','La carga ya está en el camión.'],
      CHECKIN_DESTINATION:['Tu carga llegó al destino','El transportista está en el destino.']};
    const notice=notices[milestone];
    if (notice) {
      const client=(await this.client.query('SELECT solicitante_uid AS "clientUid" FROM baney.solicitud_transporte WHERE id=$1',[row.requestId])).rows[0].clientUid;
      await this.notifyClient(client,tripId,`trip_${milestone.toLowerCase()}`,notice[0],notice[1],`trip-milestone:${tripId}:${milestone}`);
    }
    return updated.rows[0];
  }
  async evidence(tripId:string,userId:string,input:TripEvidenceInput) {
    const trip=await this.client.query(`SELECT t.estado AS "tripState" FROM baney.viaje t JOIN baney.asignacion a ON a.id=t.asignacion_id
      JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id
      WHERE t.id=$1 AND t.eliminado_en IS NULL AND a.estado='activa' AND a.eliminado_en IS NULL AND d.usuario_uid=$2 FOR UPDATE OF t`,[tripId,userId]);
    const state=trip.rows[0]?.tripState as string|undefined;
    if(!state) throw new DomainError('Only the assigned carrier can add trip evidence');
    // Pickup evidence from the origin check-in; delivery evidence once in transit or later.
    const allowed=input.stage==='recogida' ? ['en_origen','cargado','en_transito'] : ['en_transito','en_destino','descargado'];
    if(!allowed.includes(state)) throw new DomainError(`Evidence of stage ${input.stage} is not allowed while the trip is ${state}`);
    const result=await this.client.query(`INSERT INTO baney.viaje_evidencia(id,viaje_id,etapa,tipo,url,subido_por_uid,latitud,longitud)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,viaje_id AS "tripId",etapa AS stage,tipo AS type,url,latitud AS latitude,longitud AS longitude,creado_en AS "createdAt"`,
      [randomUUID(),tripId,input.stage,input.type,input.url,userId,input.latitude ?? null,input.longitude ?? null]);
    return result.rows[0];
  }
  async listEvidence(tripId:string,userId:string) { const access=await this.client.query(`SELECT t.id FROM baney.viaje t JOIN baney.solicitud_transporte s ON s.id=t.solicitud_id JOIN baney.asignacion a ON a.id=t.asignacion_id JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id WHERE t.id=$1 AND (s.solicitante_uid=$2 OR p.usuario_uid=$2) AND t.eliminado_en IS NULL`,[tripId,userId]); if(!access.rows[0]) throw new DomainError('Trip was not found or is not accessible'); const r=await this.client.query(`SELECT id,etapa AS stage,tipo AS type,url,latitud AS latitude,longitud AS longitude,creado_en AS "uploadedAt" FROM baney.viaje_evidencia WHERE viaje_id=$1 ORDER BY creado_en,id`,[tripId]); return r.rows.map(x=>({...x,latitude:x.latitude===null?undefined:Number(x.latitude),longitude:x.longitude===null?undefined:Number(x.longitude)})); }
  async verifyDeliveryOtp(tripId:string,userId:string,otp:string,recipientName?:string,recipientDocument?:string) {
    const current=await this.client.query(`SELECT t.id,t.estado AS "tripState",t.solicitud_id AS "requestId",t.otp_entrega_hash,t.otp_entrega_intentos FROM baney.viaje t
      JOIN baney.asignacion a ON a.id=t.asignacion_id JOIN baney.perfil_transportista d ON d.id=a.perfil_transportista_id
      WHERE t.id=$1 AND d.usuario_uid=$2 AND t.eliminado_en IS NULL AND a.estado='activa' FOR UPDATE OF t`,[tripId,userId]);
    const row=current.rows[0];
    if (!row) throw new DomainError('Only the assigned carrier can confirm delivery');
    if (!['en_transito','en_destino','descargado'].includes(row.tripState)) throw new DomainError('Trip is not ready for delivery confirmation');
    if (row.otp_entrega_intentos >= 5) throw new DomainError('Delivery OTP attempts exceeded');
    const actual=createHash('sha256').update(otp).digest('hex');
    const expected=String(row.otp_entrega_hash ?? '');
    const valid=expected.length===actual.length && timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
    if (!valid) {
      // Returned, not thrown: the failed attempt must be committed or the 5-attempt limit never applies.
      const attempts=await this.client.query('UPDATE baney.viaje SET otp_entrega_intentos=otp_entrega_intentos+1,actualizado_en=now() WHERE id=$1 RETURNING otp_entrega_intentos',[tripId]);
      return { delivered:false, attemptsRemaining:Math.max(0,5-Number(attempts.rows[0].otp_entrega_intentos)) };
    }
    const result=await this.client.query(`UPDATE baney.viaje SET estado='entregado',entregado_en=COALESCE(entregado_en,now()),recibido_por_nombre=$2,recibido_por_documento=$3,actualizado_en=now(),version_fila=version_fila+1 WHERE id=$1 RETURNING *`,[tripId,recipientName ?? null,recipientDocument ?? null]);
    await this.capturePaymentSafely(tripId);
    await this.client.query(`INSERT INTO baney.viaje_evento(id,viaje_id,estado_anterior,estado_nuevo,tipo_evento,actor_uid) VALUES($1,$2,$3,'entregado','DELIVERY_OTP_VERIFIED',$4)`,[randomUUID(),tripId,row.tripState,userId]);
    await this.finishDelivery(row.requestId,tripId);
    return result.rows[0];
  }
  async rate(tripId:string,userId:string,target:'carrier'|'client',score:number,comment?:string) {
    const trip=await this.client.query(`SELECT t.id,t.estado AS "tripState",r.solicitante_uid AS "clientUid",a.perfil_transportista_id,p.usuario_uid AS carrier_uid
      FROM baney.viaje t JOIN baney.solicitud_transporte r ON r.id=t.solicitud_id JOIN baney.asignacion a ON a.id=t.asignacion_id
      JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id WHERE t.id=$1 AND t.eliminado_en IS NULL`,[tripId]);
    const row=trip.rows[0];
    if (!row) throw new DomainError('Trip was not found');
    if (row.tripState !== 'entregado') throw new DomainError('Only delivered trips can be rated');
    const isCarrier=userId===row.carrier_uid, isClient=userId===row.clientUid;
    if ((target==='carrier' && !isClient) || (target==='client' && !isCarrier)) throw new DomainError('Only a trip participant can rate this target');
    const targetUid=target==='carrier' ? row.carrier_uid : row.clientUid;
    const result=await this.client.query(`INSERT INTO baney.resena(id,tipo,calificado_uid,autor_uid,autor_nombre,viaje_id,puntuacion,comentario,moderacion)
      SELECT $1,$2,$3,$4::uuid,COALESCE(u.nombre_completo,u.email,$4::text),$5,$6,$7,'pendiente' FROM baney.usuario u WHERE u.id=$4::uuid
      RETURNING id,tipo,calificado_uid AS "targetUserId",autor_uid AS "authorUserId",puntuacion AS score,comentario,moderacion`,
      [randomUUID(),target==='carrier'?'transportista':'cliente',targetUid,userId,tripId,score,comment ?? null]);
    if (!result.rows.length) throw new DomainError('Rating author was not found');
    return result.rows[0];
  }
  async invoice(tripId:string,userId:string) {
    const result=await this.client.query(`SELECT f.id,f.numero_interno,f.ncf,f.tipo_ecf,f.moneda,f.subtotal,f.itbis,f.total,f.estado,f.fecha_emision,f.pdf_url,f.xml_url
      FROM baney.factura f JOIN baney.viaje v ON v.id=f.viaje_id JOIN baney.solicitud_transporte s ON s.id=v.solicitud_id
      LEFT JOIN baney.asignacion a ON a.id=v.asignacion_id
      LEFT JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id
      WHERE f.viaje_id=$1 AND (s.solicitante_uid=$2 OR p.usuario_uid=$2) AND f.estado IN ('emitida','enviada_dgii','aceptada_dgii') ORDER BY f.fecha_emision DESC LIMIT 1`,[tripId,userId]);
    if(!result.rows[0]) throw new DomainError('Invoice was not found or is not accessible');
    return result.rows[0];
  }
}
