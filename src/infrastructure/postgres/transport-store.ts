import { CancellationPenaltyHandler } from '../../application/transport/cancellation-penalty';
import { encode, canonicalRows } from './canonical-values';
import { PostgresTripOperationsRepository } from './trip-operations.repository';
import { PostgresTripHistoryRepository } from './trip-history.repository';
import { PostgresCarrierRequestRepository } from './carrier-requests.repository';
import { PostgresFleetRepository } from './fleet.repository';
import { CarrierRepository, CarrierRegistration } from '../../application/transport/register-carrier';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { AggregateRoot, DomainEvent } from '../../domain/shared/aggregate-root';
import { DomainError } from '../../domain/shared/domain-error';
import { TransportRequest, TransportRequestStatus } from '../../domain/transport/transport-request';
import { TransportOffer, TransportOfferStatus, OfferActor } from '../../domain/transport/transport-offer';
import { Cargo, CargoType } from '../../domain/transport/cargo';
import { Location } from '../../domain/transport/value-objects/location';
import { TimeWindow } from '../../domain/transport/value-objects/time-window';
import { Weight, Volume } from '../../domain/transport/value-objects/quantities';
import { Money } from '../../domain/transport/value-objects/money';
import { MatchingCandidate } from '../../domain/transport/matching-candidate';
import { TransportRequestRepository } from '../../application/transport/ports/transport-request.repository';
import { CarrierFinanceRepository } from '../../application/transport/carrier-finance';
import { TransportDisputeRepository, DisputeReason } from '../../application/transport/disputes';
import { TransportNotificationRepository } from '../../application/transport/notifications';
import { TripChatRepository } from '../../application/transport/trip-chat';
import { ServiceZoneRepository } from '../../application/transport/service-zones';
import { TripCallRepository } from '../../application/transport/trip-call';
import { TransportCommissionRuleRepository } from '../../application/transport/commission-rule';
import { TransportOfferRepository } from '../../application/transport/ports/transport-offer.repository';
import { MatchingCandidateRepository } from '../../application/transport/ports/matching-candidate.repository';
import { TransportDomainOutbox } from '../../application/transport/ports/transport-domain-outbox';
import { CarrierDocumentInput, CarrierDocumentRepository } from '../../application/transport/carrier-documents';
import { CarrierApprovalRepository } from '../../application/transport/carrier-approval';
import { PostgresCarrierApprovalRepository } from './carrier-approval.repository';
import { TransportAdminRepository } from '../../application/transport/transport-admin';
import { PostgresTransportAdminRepository } from './transport-admin.repository';
import { ClientServicesRepository } from '../../application/transport/client-services';
import { PostgresClientServicesRepository } from './client-services.repository';

export interface TransportRepositories {
  requests: TransportRequestRepository;
  offers: TransportOfferRepository;
  candidates: MatchingCandidateRepository;
  outbox: TransportDomainOutbox;
  tracking: PostgresTrackingRepository;
  carriers: CarrierRepository;
  fleet: PostgresFleetRepository;
  tripHistory: PostgresTripHistoryRepository;
  operations: PostgresTripOperationsRepository;
  carrierRequests: PostgresCarrierRequestRepository;
  documents: CarrierDocumentRepository;
  finance: CarrierFinanceRepository;
  disputes: TransportDisputeRepository;
  notifications: TransportNotificationRepository;
  chat: TripChatRepository;
  zones: ServiceZoneRepository;
  calls: TripCallRepository;
  commission: TransportCommissionRuleRepository;
  approval: CarrierApprovalRepository;
  admin: TransportAdminRepository;
  clientServices: ClientServicesRepository;
}

export class PostgresCarrierDocumentRepository implements CarrierDocumentRepository {
  constructor(private readonly client: PoolClient) {}
  async add(userId: string, document: CarrierDocumentInput & { id: string }) {
    const result = await this.client.query(`INSERT INTO baney.documento_usuario
      (id,usuario_uid,tipo,url,tipo_contenido,bytes,sha256,fecha_vencimiento)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,usuario_uid AS "userId",tipo AS type,url,tipo_contenido AS "contentType",bytes,sha256,fecha_vencimiento AS "expiresAt",estado AS status`,
      [document.id,userId,document.type,document.url,document.contentType,document.bytes,document.sha256.toLowerCase(),document.expiresAt ?? null]);
    return result.rows[0];
  }
  async list(userId: string) {
    const result = await this.client.query(`SELECT id,usuario_uid AS "userId",tipo AS type,url,tipo_contenido AS "contentType",bytes,sha256,
      fecha_vencimiento AS "expiresAt",estado AS status,motivo_estado AS "statusReason",subido_en AS "uploadedAt",revisado_en AS "reviewedAt"
      FROM baney.documento_usuario WHERE usuario_uid=$1 ORDER BY subido_en DESC,id`, [userId]);
    return result.rows;
  }
  async review(documentId:string,reviewerId:string,status:'aprobado'|'rechazado',reason?:string) { const r=await this.client.query(`UPDATE baney.documento_usuario SET estado=$2,motivo_estado=$3,revisado_en=now(),revisado_por_uid=$4 WHERE id=$1 AND usuario_uid<>$4 RETURNING id,usuario_uid AS "userId",tipo AS type,estado AS status,motivo_estado AS "statusReason",revisado_en AS "reviewedAt",revisado_por_uid AS "reviewedBy"`,[documentId,status,reason??null,reviewerId]); if(!r.rows[0]) throw new DomainError('Carrier document was not found or is your own'); return r.rows[0]; }
}

export class PostgresCarrierRepository implements CarrierRepository {
  constructor(private readonly client: PoolClient) {}
  async register(userId: string): Promise<CarrierRegistration> {
    const result = await this.client.query(`INSERT INTO baney.perfil_transportista(id,usuario_uid,dueno_flota_uid,estado)
      VALUES ($1,$2,$2,'pendiente') ON CONFLICT (usuario_uid) DO UPDATE
      SET usuario_uid=EXCLUDED.usuario_uid
      WHERE baney.perfil_transportista.eliminado_en IS NULL
      RETURNING id,usuario_uid AS "userId",estado`, [randomUUID(),userId]);
    if (!result.rows.length) throw new DomainError('Carrier already registered and archived; contact support');
    return result.rows[0] as CarrierRegistration;
  }
}

export class PostgresTrackingRepository {
  constructor(private readonly client: PoolClient) {}
  async findLiveByRequestId(requestId: string): Promise<unknown[]> {
    const result = await this.client.query(`SELECT p.id, p.viaje_id AS "tripId", p.latitud, p.longitud,
        p.registrado_en AS "recordedAt", p.origen_actor, t.estado AS "tripState"
      FROM baney.punto_rastreo p JOIN baney.viaje t ON t.id=p.viaje_id
      WHERE t.solicitud_id=$1 AND t.estado NOT IN ('programado','entregado','cancelado') AND t.eliminado_en IS NULL
      ORDER BY p.registrado_en DESC, p.id DESC`, [requestId]);
    return result.rows;
  }
}

export class PostgresTransportOutbox implements TransportDomainOutbox {
  constructor(private readonly client: PoolClient) {}
  async append(events: readonly DomainEvent[]): Promise<void> {
    for (const e of events) {
      await this.client.query(`INSERT INTO baney.outbox
        (id, modulo, agregado_tipo, agregado_uid, tipo_evento, agregado_version, correlacion_id, version_esquema, carga, creado_en)
        VALUES ($1,'transporte',$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.eventId,e.aggregateType,e.aggregateId,e.type,e.version,e.correlationId,e.schemaVersion,JSON.stringify(e.payload),e.occurredAt]);
    }
  }
  async pending(): Promise<DomainEvent[]> {
    const result = await this.client.query("SELECT * FROM baney.outbox WHERE modulo='transporte' AND publicado_en IS NULL ORDER BY creado_en, agregado_version");
    return result.rows.map(r => ({ eventId:r.event_id, aggregateType:r.aggregate_type, aggregateId:r.aggregate_id,
      type:r.event_type, version:r.aggregate_version, correlationId:r.correlation_id, schemaVersion:r.schema_version,
      payload:r.payload, occurredAt:new Date(r.occurred_at) }));
  }
}

class TransactionEvents {
  private readonly aggregates = new Set<AggregateRoot>();
  private readonly saved = new Set<string>();
  constructor(private readonly outbox: PostgresTransportOutbox) {}
  async save(aggregate: AggregateRoot): Promise<void> {
    const events = aggregate.peekDomainEvents().filter(e => !this.saved.has(e.eventId));
    await this.outbox.append(events);
    events.forEach(e => this.saved.add(e.eventId));
    this.aggregates.add(aggregate);
  }
  committed(): void { this.aggregates.forEach(a => a.pullDomainEvents()); }
}

/** Reason stored on requests closed because nobody took them in time. */
export const EXPIRED_REASON = 'Vencida: ningún transportista la tomó antes de la hora de recogida';

export class PostgresTransportRequestRepository implements TransportRequestRepository {
  private readonly versions = new WeakMap<TransportRequest, number>();
  constructor(private readonly client: PoolClient, private readonly events: TransactionEvents) {}
  private hydrate(r: QueryResultRow): TransportRequest {
    const cargo = Cargo.create({ description:r.description,
      weight:r.weight_kg === null ? undefined : Weight.create(Number(r.weight_kg)),
      volume:r.volume_m3 === null ? undefined : Volume.create(Number(r.volume_m3)) });
    if (r.cargo_type) cargo.selectType(r.cargo_type as CargoType);
    const request = TransportRequest.restore({ id:r.id, requesterId:r.requester_id, cargo,
      origin:Location.create(r.origin_address,Number(r.origin_latitude),Number(r.origin_longitude)),
      destination:Location.create(r.destination_address,Number(r.destination_latitude),Number(r.destination_longitude)),
      timeWindow:TimeWindow.create(new Date(r.window_starts_at),new Date(r.window_ends_at)),
      requestedVehicleType:r.tipo_vehiculo_solicitado === 'volteo' ? 'DUMP_TRUCK' : r.tipo_vehiculo_solicitado === 'plataforma' ? 'FLATBED' : r.tipo_vehiculo_solicitado ? 'OTHER' : undefined,
      requestedCapacityKg:r.capacidad_solicitada_kg === null ? undefined : Number(r.capacidad_solicitada_kg),
      specialInstructions:r.instrucciones_especiales ?? undefined },
    r.status as TransportRequestStatus,r.aggregate_version,r.active_assignment_id ?? undefined);
    this.versions.set(request,r.row_version);
    return request;
  }
  /**
   * Requests nobody took before the end of their pickup window are closed as "Vencida": the request is
   * cancelled (domain event TransportRequestExpired), pending offers expire and the client is told.
   */
  async expireStale(requesterId?: string, limit = 200): Promise<string[]> {
    const stale = await this.client.query(`SELECT id FROM baney.solicitud_transporte
      WHERE estado IN ('borrador','abierta','en_matching','con_ofertas') AND ventana_recogida_hasta <= $3::timestamptz AND eliminado_en IS NULL
        AND ($1::uuid IS NULL OR solicitante_uid=$1::uuid)
      ORDER BY ventana_recogida_hasta LIMIT $2 FOR UPDATE SKIP LOCKED`, [requesterId ?? null, limit, new Date()]);
    const expired: string[] = [];
    for (const row of stale.rows) {
      const request = await this.findById(row.id);
      if (!request?.isStale()) continue;
      request.expire();
      await this.save(request);
      await this.client.query(`UPDATE baney.solicitud_transporte SET motivo_cancelacion=$2 WHERE id=$1`, [request.props.id, EXPIRED_REASON]);
      await this.client.query(`UPDATE baney.oferta_transporte SET estado='expirada',actualizado_en=now() WHERE solicitud_id=$1 AND estado='enviada' AND eliminado_en IS NULL`, [request.props.id]);
      await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
        VALUES($1,'cancelacion','request_expired','Tu solicitud venció',$2,jsonb_build_object('requestId',$3::text),$4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [request.props.requesterId, `Ningún transportista tomó tu solicitud hacia ${request.props.destination.address} antes de la hora de recogida. Puedes crearla de nuevo.`, request.props.id, `request-expired:${request.props.id}`]);
      expired.push(request.props.id);
    }
    return expired;
  }
  async isExpired(requestId: string): Promise<boolean> {
    const r = await this.client.query(`SELECT motivo_cancelacion AS "cancelReason" FROM baney.solicitud_transporte WHERE id=$1`, [requestId]);
    return r.rows[0]?.cancelReason === EXPIRED_REASON;
  }
  async findById(id: string): Promise<TransportRequest | undefined> {
    const result = await this.client.query(`SELECT r.*, c.descripcion,c.tipo_carga,c.peso_kg,c.volumen_m3
      FROM baney.solicitud_transporte r JOIN baney.carga c ON c.solicitud_id=r.id
      WHERE r.id=$1 AND r.eliminado_en IS NULL AND c.eliminado_en IS NULL FOR UPDATE OF r`,[id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : undefined;
  }
  async findByIdempotencyKey(requesterId: string, key: string): Promise<TransportRequest | undefined> {
    // Serialize concurrent first-time submissions too, before a request row exists.
    await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[JSON.stringify([requesterId,key])]);
    const result = await this.client.query(`SELECT id FROM baney.solicitud_transporte
      WHERE solicitante_uid=$1 AND idempotency_key=$2 AND eliminado_en IS NULL`,[requesterId,key]);
    return result.rows[0] ? this.findById(result.rows[0].id) : undefined;
  }
  /** UC-TRA-25: carriers available within 30 km of the pickup (located in the last 30 minutes) are told about a new request. */
  private async notifyNearbyCarriers(requestId:string,requesterId:string,latitude:number,longitude:number,address:string) {
    // Best effort: a failure telling carriers must never stop the client from creating the request.
    await this.client.query('SAVEPOINT notify_nearby_carriers');
    try {
      await this.insertNearbyNotifications(requestId,requesterId,latitude,longitude,address);
      await this.client.query('RELEASE SAVEPOINT notify_nearby_carriers');
    } catch (error) {
      await this.client.query('ROLLBACK TO SAVEPOINT notify_nearby_carriers');
      console.error(`[transport] nearby-carrier notification skipped for request ${requestId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private async insertNearbyNotifications(requestId:string,requesterId:string,latitude:number,longitude:number,address:string) {
    await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      SELECT p.usuario_uid,'viaje','nearby_request','Nueva solicitud cerca de ti',
        'Recogida en '||$4::text||' a '||round(d.km::numeric,1)||' km.',jsonb_build_object('requestId',$1::text,'distanceKm',round(d.km::numeric,1)),
        'nearby-request:'||$1::text||':'||p.usuario_uid::text
      FROM baney.perfil_transportista p
      CROSS JOIN LATERAL (SELECT 6371*2*asin(sqrt(power(sin(radians(p.ultima_latitud::float8-$2)/2),2)+cos(radians($2))*cos(radians(p.ultima_latitud::float8))*power(sin(radians(p.ultima_longitud::float8-$3)/2),2))) AS km) d
      WHERE p.eliminado_en IS NULL AND p.estado='habilitado' AND p.usuario_uid<>$5::uuid
        AND p.ultima_latitud IS NOT NULL AND p.ultima_ubicacion_en > now()-interval '30 minutes'
        AND p.ultima_latitud BETWEEN $2-30/111.0 AND $2+30/111.0
        AND (p.disponible OR EXISTS (SELECT 1 FROM baney.disponibilidad_transportista a WHERE a.perfil_transportista_id=p.id AND a.desde<=now() AND a.hasta>now() AND a.estado='disponible'))
        AND NOT EXISTS (SELECT 1 FROM baney.disponibilidad_transportista a WHERE a.perfil_transportista_id=p.id AND a.desde<=now() AND a.hasta>now() AND a.estado='no_disponible')
        AND NOT EXISTS (SELECT 1 FROM baney.asignacion s WHERE s.perfil_transportista_id=p.id AND s.estado='activa' AND s.eliminado_en IS NULL)
        AND d.km<=30
      ORDER BY d.km LIMIT 50
      ON CONFLICT (idempotency_key) DO NOTHING`,[requestId,latitude,longitude,address,requesterId]);
  }
  async addCargoPhoto(requestId: string, requesterId: string, url: string): Promise<{ id: string; requestId: string; url: string }> {
    const owner = await this.client.query(`SELECT id FROM baney.solicitud_transporte WHERE id=$1 AND solicitante_uid=$2 AND eliminado_en IS NULL`, [requestId, requesterId]);
    if (!owner.rows[0]) throw new DomainError('Transport request was not found or is not owned by the requester');
    const id = randomUUID();
    await this.client.query(`INSERT INTO baney.carga_foto (id,solicitud_id,url,subido_por_uid) VALUES ($1,$2,$3,$4)`, [id, requestId, url, requesterId]);
    return { id, requestId, url };
  }
  async save(request: TransportRequest, expectedRowVersion?: number, key?: string): Promise<void> {
    const p=request.props;
    const expected=expectedRowVersion ?? this.versions.get(request);
    if (request.currentStatus === TransportRequestStatus.ASSIGNED && request.currentAssignmentId) {
      const existing = await this.client.query('SELECT id FROM baney.asignacion WHERE id=$1 AND solicitud_id=$2',
        [request.currentAssignmentId,p.id]);
      if (!existing.rows[0]) {
        const eligible = await this.client.query(`SELECT o.id AS offer_id, d.id AS driver_id, v.id AS vehiculo_id
          FROM baney.oferta_transporte o JOIN baney.perfil_transportista d ON d.usuario_uid=o.transportista_uid
          JOIN baney.vehiculo v ON v.id=o.vehiculo_id AND v.dueno_uid=o.transportista_uid
          WHERE o.solicitud_id=$1 AND o.estado='aceptada' AND o.eliminado_en IS NULL
          AND d.estado='habilitado' AND d.eliminado_en IS NULL AND v.estado='habilitado' AND v.eliminado_en IS NULL
          AND NOT EXISTS (SELECT 1 FROM baney.disponibilidad_transportista a WHERE a.perfil_transportista_id=d.id AND a.desde<=now() AND a.hasta>now() AND a.estado='no_disponible')
          FOR UPDATE OF d,v`,[p.id]);
        const candidate=eligible.rows[0];
        if (!candidate) throw new DomainError('Assignment requires an accepted offer with an enabled carrier and vehicle');
        const busy=await this.client.query(`SELECT id FROM baney.asignacion WHERE estado='activa' AND eliminado_en IS NULL
          AND (perfil_transportista_id=$1 OR vehiculo_id=$2)`,[candidate.driver_id,candidate.vehicle_id]);
        if (busy.rows.length) throw new DomainError('Carrier or vehicle already has an active assignment');
        await this.client.query(`INSERT INTO baney.asignacion
          (id,solicitud_id,perfil_transportista_id,vehiculo_id,estado,oferta_aceptada_id) VALUES ($1,$2,$3,$4,'activa',$5)`,
        [request.currentAssignmentId,p.id,candidate.driver_id,candidate.vehicle_id,candidate.offer_id]);
      }
    }
    if (request.currentStatus === TransportRequestStatus.CANCELLED) {
      // UC-TRA-49: cancelling once a carrier is committed carries the late-cancellation penalty on the agreed price.
      const committed=(await this.client.query(`SELECT a.id AS "assignmentId",o.monto AS "agreedAmount",o.moneda AS "agreedCurrency",p.usuario_uid AS "carrierUid"
        FROM baney.asignacion a JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id LEFT JOIN baney.oferta_transporte o ON o.id=a.oferta_aceptada_id
        WHERE a.solicitud_id=$1 AND a.estado='activa' AND a.eliminado_en IS NULL`,[p.id])).rows[0];
      const penalty=committed?.agreedAmount!=null ? new CancellationPenaltyHandler().execute(Number(committed.agreedAmount),String(committed.agreedCurrency).trim(),p.timeWindow.startsAt) : undefined;
      const cancelled=await this.client.query(`UPDATE baney.viaje SET estado='cancelado',cancelado_en=now(),cancelado_por_uid=$2,motivo_cancelacion='Cancelada por el cliente',
          penalidad_cancelacion=$3,actualizado_en=now(),version_fila=version_fila+1
        WHERE solicitud_id=$1 AND estado NOT IN ('entregado','cancelado') AND eliminado_en IS NULL RETURNING id`,[p.id,p.requesterId,penalty?.amount ?? 0]);
      if (!cancelled.rows.length && committed && penalty && penalty.amount>0) {
        // The carrier had not opened the trip yet: record it cancelled so the penalty is kept.
        await this.client.query(`INSERT INTO baney.viaje(id,solicitud_id,asignacion_id,estado,monto_acordado,moneda,cancelado_en,cancelado_por_uid,motivo_cancelacion,penalidad_cancelacion)
          VALUES($1,$2,$3,'cancelado',$4,$5,now(),$6,'Cancelada por el cliente',$7)`,[randomUUID(),p.id,committed.assignmentId,committed.agreedAmount,committed.agreedCurrency,p.requesterId,penalty.amount]);
      }
      if (committed) {
        await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
          VALUES($1,'cancelacion','trip_cancelled_by_client','El cliente canceló el viaje',$2,$3::jsonb,$4) ON CONFLICT (idempotency_key) DO NOTHING`,
          [committed.carrierUid,penalty?.late ? `Se aplicó una penalidad de ${penalty.amount} ${penalty.currency} por cancelación tardía.` : 'Ya puedes aceptar otras solicitudes.',
            JSON.stringify({requestId:p.id,penalty:penalty?.amount ?? 0}),`trip-cancelled:${p.id}`]);
      }

      await this.client.query(`UPDATE baney.asignacion SET estado='liberada',liberada_en=now()
        WHERE solicitud_id=$1 AND estado='activa' AND eliminado_en IS NULL`,[p.id]);
    }
    if (expected === undefined) {
      await this.client.query(`INSERT INTO baney.solicitud_transporte
        (id,solicitante_uid,idempotency_key,estado,origen_direccion,origen_latitud,origen_longitud,
         destino_direccion,destino_latitud,destino_longitud,ventana_recogida_desde,ventana_recogida_hasta,
         tipo_vehiculo_solicitado,capacidad_solicitada_kg,instrucciones_especiales,asignacion_activa_id,agregado_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [p.id,p.requesterId,key ?? null,encode(request.currentStatus),p.origin.address,p.origin.latitude,p.origin.longitude,
        p.destination.address,p.destination.latitude,p.destination.longitude,p.timeWindow.startsAt,p.timeWindow.endsAt,
        encode(p.requestedVehicleType),p.requestedCapacityKg ?? null,p.specialInstructions ?? null,request.currentAssignmentId ?? null,request.currentVersion]);
      this.versions.set(request,1);
      await this.notifyNearbyCarriers(p.id,p.requesterId,p.origin.latitude,p.origin.longitude,p.origin.address);
    } else {
      const result=await this.client.query(`UPDATE baney.solicitud_transporte SET estado=$2, asignacion_activa_id=$3,
        agregado_version=$4,version_fila=version_fila+1,actualizado_en=now(),
        origen_direccion=$6,origen_latitud=$7,origen_longitud=$8,destino_direccion=$9,destino_latitud=$10,destino_longitud=$11,ventana_recogida_desde=$12,ventana_recogida_hasta=$13,tipo_vehiculo_solicitado=$14,capacidad_solicitada_kg=$15,instrucciones_especiales=$16,
        cancelado_en=CASE WHEN $2::text='cancelada' THEN COALESCE(cancelado_en,now()) ELSE cancelado_en END
        WHERE id=$1 AND version_fila=$5 AND eliminado_en IS NULL RETURNING version_fila`,
      [p.id,encode(request.currentStatus),request.currentAssignmentId ?? null,request.currentVersion,expected,p.origin.address,p.origin.latitude,p.origin.longitude,p.destination.address,p.destination.latitude,p.destination.longitude,p.timeWindow.startsAt,p.timeWindow.endsAt,encode(p.requestedVehicleType),p.requestedCapacityKg ?? null,p.specialInstructions ?? null]);
      if (!result.rows[0]) throw new DomainError(`Transport request ${p.id} changed concurrently`);
      this.versions.set(request,result.rows[0].row_version);
    }
    await this.client.query(`INSERT INTO baney.carga (id,solicitud_id,descripcion,tipo_carga,peso_kg,volumen_m3)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (solicitud_id) DO UPDATE SET descripcion=EXCLUDED.descripcion,
      tipo_carga=EXCLUDED.tipo_carga,peso_kg=EXCLUDED.peso_kg,volumen_m3=EXCLUDED.volumen_m3,actualizado_en=now()`,
    [randomUUID(),p.id,p.cargo.description,encode(p.cargo.cargoType) ?? null,p.cargo.weight?.value ?? null,p.cargo.volume?.value ?? null]);
    await this.events.save(request);
  }
}

export class PostgresCarrierFinanceRepository implements CarrierFinanceRepository {
  constructor(private readonly client:PoolClient) {}
  async earnings(userId:string,limit:number,offset:number) {
    const account=await this.client.query(`SELECT id,moneda AS "accountCurrency" FROM baney.cuenta WHERE titular_uid=$1 AND titular_tipo='transportista' AND estado='activa'`,[userId]);
    if (!account.rows[0]) throw new DomainError('Carrier account was not found');
    const balance=await this.client.query(`SELECT disponible FROM baney.saldo_cuenta WHERE cuenta_id=$1`,[account.rows[0].id]);
    const rows=await this.client.query(`SELECT id,tipo AS "movType",monto AS "movAmount",moneda AS "movCurrency",estado_fondos,descripcion AS "movDescription",fecha_valor,viaje_id AS "movTripId" FROM baney.movimiento WHERE cuenta_id=$1 ORDER BY fecha_valor DESC,creado_en DESC LIMIT $2 OFFSET $3`,[account.rows[0].id,limit,offset]);
    return {balance:Number(balance.rows[0]?.disponible ?? 0),currency:String(account.rows[0].accountCurrency).trim(),items:rows.rows.map(r=>({id:r.id,type:r.movType,amount:Number(r.movAmount),currency:String(r.movCurrency).trim(),status:r.estado_fondos,description:r.movDescription,date:new Date(r.fecha_valor),tripId:r.movTripId ?? undefined}))};
  }
  async requestPayout(userId:string,amount:number,bankAccountId:string,idempotencyKey:string) {
    const result=await this.client.query(`SELECT p.id,p.monto AS "payAmount",p.monto_neto,p.moneda AS "payCurrency",p.estado AS "payState",p.solicitado_en FROM baney.payout p JOIN baney.cuenta c ON c.id=p.cuenta_id WHERE c.titular_uid=$1 AND p.idempotency_key=$2`,[userId,idempotencyKey]);
    if(result.rows[0]) { const x=result.rows[0]; return {id:x.id,amount:Number(x.payAmount),netAmount:Number(x.monto_neto),currency:String(x.payCurrency).trim(),status:x.payState,requestedAt:new Date(x.solicitado_en)}; }
    const account=await this.client.query(`SELECT c.id,c.moneda AS "accountCurrency",sc.disponible FROM baney.cuenta c JOIN baney.saldo_cuenta sc ON sc.cuenta_id=c.id WHERE c.titular_uid=$1 AND c.titular_tipo='transportista' AND c.estado='activa' FOR UPDATE`,[userId]);
    if(!account.rows[0]) throw new DomainError('Carrier account was not found');
    if(Number(account.rows[0].disponible)<amount) throw new DomainError('Insufficient available balance');
    const bank=await this.client.query(`SELECT id FROM baney.cuenta_bancaria WHERE id=$1 AND cuenta_id=$2 AND activa AND verificada`,[bankAccountId,account.rows[0].id]);
    if(!bank.rows[0]) throw new DomainError('Verified bank account was not found');
    const row=await this.client.query(`INSERT INTO baney.payout(numero,cuenta_id,cuenta_bancaria_id,origen,monto,comision_retiro,monto_neto,moneda,idempotency_key) VALUES('PAYOUT-'||upper(substr(gen_random_uuid()::text,1,12)),$1,$2,'solicitud_manual',$3,0,$3,$4,$5) RETURNING id,monto AS "payAmount",monto_neto,moneda AS "payCurrency",estado AS "payState",solicitado_en`,[account.rows[0].id,bankAccountId,amount,account.rows[0].accountCurrency,idempotencyKey]);
    const r=row.rows[0]; return {id:r.id,amount:Number(r.payAmount),netAmount:Number(r.monto_neto),currency:String(r.payCurrency).trim(),status:r.payState,requestedAt:new Date(r.solicitado_en)};
  }
  async schedulePayout(userId:string,frequency:'diaria'|'semanal'|'quincenal'|'mensual'|'manual',minimumAmount:number) { const account=await this.client.query(`SELECT id FROM baney.cuenta WHERE titular_uid=$1 AND titular_tipo='transportista' AND estado='activa'`,[userId]); if(!account.rows[0]) throw new DomainError('Carrier account was not found'); // The schema requires the weekday for weekly and the day of month for monthly payouts (Monday / day 1).
    const r=await this.client.query(`INSERT INTO baney.payout_programacion(cuenta_id,frecuencia,dia_semana,dia_mes,monto_minimo,activa) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(cuenta_id) DO UPDATE SET frecuencia=EXCLUDED.frecuencia,dia_semana=EXCLUDED.dia_semana,dia_mes=EXCLUDED.dia_mes,monto_minimo=EXCLUDED.monto_minimo,activa=true RETURNING cuenta_id AS "accountId",frecuencia,dia_semana AS "weekday",dia_mes AS "dayOfMonth",monto_minimo AS "minimumAmount",activa`,[account.rows[0].id,frequency,frequency==='semanal'?1:null,frequency==='mensual'?1:null,minimumAmount]); return r.rows[0]; }
}

export class PostgresTransportDisputeRepository implements TransportDisputeRepository {
  constructor(private readonly client:PoolClient) {}
  async open(userId:string,tripId:string,reason:DisputeReason,description:string,amount:number) {
    const payment=await this.client.query(`SELECT id,pagador_uid,moneda AS "payCurrency" FROM baney.pago WHERE viaje_id=$1 AND pagador_uid=$2 AND estado='capturado' ORDER BY creado_en DESC LIMIT 1`,[tripId,userId]);
    if(!payment.rows[0]) throw new DomainError('Captured trip payment was not found');
    const p=payment.rows[0], id=randomUUID();
    const result=await this.client.query(`INSERT INTO baney.disputa(id,abierta_por_uid,pago_id,entidad_tipo,entidad_id,pagador_uid,motivo,descripcion,monto,moneda,pago_activo_id) VALUES($1,$2,$3,'viaje',$4,$2,$5,$6,$7,$8,$3) RETURNING id,numero,estado AS "disputeState",creado_en AS "createdAt"`,[id,userId,p.id,tripId,reason,description,amount,p.payCurrency]);
    return result.rows[0];
  }
  async requestRefund(userId:string,disputeId:string,amount:number,reason:string,idempotencyKey:string) {
    const existing=await this.client.query(`SELECT id,monto AS "refundAmount",moneda AS "refundCurrency",estado AS "refundState",creado_en AS "createdAt" FROM baney.reembolso WHERE idempotency_key=$1`,[idempotencyKey]);
    if(existing.rows[0]) return existing.rows[0];
    const d=await this.client.query(`SELECT d.id,d.pago_id AS "paymentId",d.monto AS "disputeAmount",d.moneda AS "disputeCurrency" FROM baney.disputa d WHERE d.id=$1 AND d.abierta_por_uid=$2 AND d.estado IN ('abierta','en_revision')`,[disputeId,userId]);
    if(!d.rows[0]) throw new DomainError('Open dispute was not found');
    if(amount>Number(d.rows[0].disputeAmount)) throw new DomainError('Refund exceeds dispute amount');
    const result=await this.client.query(`INSERT INTO baney.reembolso(pago_id,monto,moneda,origen,origen_id,motivo,idempotency_key,solicitado_por_uid) VALUES($1,$2,$3,'disputa',$4,$5,$6,$7) RETURNING id,monto AS "refundAmount",moneda AS "refundCurrency",estado AS "refundState",creado_en AS "createdAt"`,[d.rows[0].paymentId,amount,d.rows[0].disputeCurrency,disputeId,reason,idempotencyKey,userId]);
    await this.client.query(`UPDATE baney.disputa SET estado='reembolso_solicitado',reembolso_solicitado_en=now(),actualizado_en=now() WHERE id=$1`,[disputeId]);
    return result.rows[0];
  }
}

export class PostgresTransportNotificationRepository implements TransportNotificationRepository {
  constructor(private readonly client:PoolClient) {}
  async list(userId:string,limit:number,offset:number) { const result=await this.client.query(`SELECT id,categoria AS category,titulo AS title,cuerpo AS body,carga AS payload,estado AS status,leida_en AS "readAt",creado_en AS "createdAt" FROM baney.notificacion WHERE usuario_uid=$1 ORDER BY creado_en DESC,id LIMIT $2 OFFSET $3`,[userId,limit,offset]); return result.rows; }
  async markRead(userId:string,id:string) { const result=await this.client.query(`UPDATE baney.notificacion SET leida_en=COALESCE(leida_en,now()) WHERE id=$1 AND usuario_uid=$2 RETURNING id,categoria AS category,titulo AS title,cuerpo AS body,carga AS payload,estado AS status,leida_en AS "readAt",creado_en AS "createdAt"`,[id,userId]); if(!result.rows[0]) throw new DomainError('Notification was not found'); return result.rows[0]; }
}

export class PostgresTripChatRepository implements TripChatRepository {
  constructor(private readonly client:PoolClient) {}
  private async conversation(tripId:string,userId:string) { const r=await this.client.query(`SELECT c.id FROM baney.conversacion c JOIN baney.conversacion_participante cp ON cp.conversacion_id=c.id WHERE c.viaje_id=$1 AND cp.usuario_uid=$2 AND cp.salio_en IS NULL AND c.estado='activa'`,[tripId,userId]); if(!r.rows[0]) throw new DomainError('User is not a participant in the trip chat'); return r.rows[0].id as string; }
  async send(tripId:string,userId:string,body:string) { const conversationId=await this.conversation(tripId,userId), id=randomUUID(); const r=await this.client.query(`INSERT INTO baney.mensaje(id,conversacion_id,remitente_uid,cuerpo) VALUES($1,$2,$3,$4) RETURNING id,remitente_uid AS "senderId",cuerpo AS body,enviado_en AS "sentAt"`,[id,conversationId,userId,body]); return {...r.rows[0],tripId}; }
  async list(tripId:string,userId:string,limit:number,offset:number) { const conversationId=await this.conversation(tripId,userId); const r=await this.client.query(`SELECT id,remitente_uid AS "senderId",cuerpo AS body,enviado_en AS "sentAt" FROM baney.mensaje WHERE conversacion_id=$1 AND eliminado_en IS NULL ORDER BY enviado_en,id LIMIT $2 OFFSET $3`,[conversationId,limit,offset]); return r.rows.map(x=>({...x,tripId})); }
}
export class PostgresServiceZoneRepository implements ServiceZoneRepository {
  constructor(private readonly client:PoolClient) {}
  async active(){ const r=await this.client.query(`SELECT id,nombre AS name,tipo AS type,centro_latitud AS latitude,centro_longitud AS longitude,radio_metros AS "radiusMeters",poligono AS polygon FROM baney.zona_servicio WHERE activa=true ORDER BY nombre,id`); return r.rows.map(x=>({id:x.id,name:x.name,type:x.type,center:{latitude:Number(x.latitude),longitude:Number(x.longitude)},radiusMeters:x.radiusMeters===null?undefined:Number(x.radiusMeters),polygon:x.polygon??undefined})); }
}
export class PostgresTripCallRepository implements TripCallRepository {
  constructor(private readonly client:PoolClient) {}
  async request(tripId:string,userId:string){
    const participants=await this.client.query(`SELECT c.id,cp.usuario_uid AS "participantId" FROM baney.conversacion c JOIN baney.conversacion_participante cp ON cp.conversacion_id=c.id WHERE c.viaje_id=$1 AND cp.salio_en IS NULL AND c.estado='activa'`,[tripId]);
    if(!participants.rows.some(x=>x.participantId===userId)) throw new DomainError('User is not a participant in the trip');
    const other=participants.rows.find(x=>x.participantId!==userId); if(!other) throw new DomainError('Trip has no call recipient');
    const id=randomUUID(), key=`trip-call:${tripId}:${id}`;
    await this.client.query(`INSERT INTO baney.notificacion(id,usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key) VALUES($1,$2,'viaje','trip_call_requested','Solicitud de llamada','El participante del viaje solicita una llamada',jsonb_build_object('tripId',$3::text,'callId',$5::text),$4)`,[id,other.participantId,tripId,key,id]);
    return {id,tripId,requestedBy:userId,status:'requested',createdAt:new Date()};
  }
}
export class PostgresTransportCommissionRuleRepository implements TransportCommissionRuleRepository {
  constructor(private readonly client:PoolClient) {}
  async current(){ const r=await this.client.query(`SELECT id,nombre AS name,tipo AS type,porcentaje,monto_fijo AS "fixedAmount",minimo AS minimum,maximo AS maximum,moneda AS "ruleCurrency", vigente_desde AS "validFrom",vigente_hasta AS "validTo" FROM baney.regla_comision WHERE aplica_a='transporte' AND vigente_desde<=now() AND (vigente_hasta IS NULL OR vigente_hasta>now()) ORDER BY prioridad ASC,vigente_desde DESC LIMIT 1`); if(!r.rows[0]) throw new DomainError('No active transport commission rule'); const x=r.rows[0]; return {id:x.id,name:x.name,type:x.type,percentage:Number(x.porcentaje),fixedAmount:Number(x.fixedAmount),minimum:x.minimum===null?undefined:Number(x.minimum),maximum:x.maximum===null?undefined:Number(x.maximum),currency:String(x.ruleCurrency).trim(),validFrom:new Date(x.validFrom),validTo:x.validTo?new Date(x.validTo):undefined}; }
}

export class PostgresTransportOfferRepository implements TransportOfferRepository {
  private readonly versions=new WeakMap<TransportOffer,number>();
  constructor(private readonly client:PoolClient,private readonly events:TransactionEvents) {}
  private hydrate(r:QueryResultRow):TransportOffer {
    const offer=TransportOffer.restore({id:r.id,requestId:r.request_id,carrierId:r.carrier_id,
      price:Money.create(Number(r.amount),r.currency.trim()),validUntil:new Date(r.valid_until),vehicleId:r.vehicle_id ?? undefined,
      parentOfferId:r.parent_offer_id ?? undefined,proposedBy:r.proposed_by as OfferActor | undefined,round:r.round,
      status:r.status as TransportOfferStatus,version:r.aggregate_version});
    this.versions.set(offer,r.row_version); return offer;
  }
  async findById(id:string):Promise<TransportOffer | undefined> {
    const result=await this.client.query('SELECT * FROM baney.oferta_transporte WHERE id=$1 AND eliminado_en IS NULL FOR UPDATE',[id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : undefined;
  }
  async findByRequestId(id:string):Promise<TransportOffer[]> {
    const result=await this.client.query('SELECT * FROM baney.oferta_transporte WHERE solicitud_id=$1 AND eliminado_en IS NULL ORDER BY creado_en,id FOR UPDATE',[id]);
    return result.rows.map(r=>this.hydrate(r));
  }
  async save(offer:TransportOffer):Promise<void> {
    const version=this.versions.get(offer);
    if(version===undefined) {
      await this.client.query(`INSERT INTO baney.oferta_transporte
        (id,solicitud_id,transportista_uid,vehiculo_id,monto,moneda,estado,vigente_hasta,oferta_padre_id,propuesta_por,ronda,agregado_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [offer.id,offer.requestId,offer.carrierId,offer.vehicleId ?? null,offer.price.amount,offer.price.currency,encode(offer.currentStatus),
        offer.validUntil,offer.parentOfferId ?? null,encode(offer.proposedBy) ?? null,offer.round,offer.currentVersion]);
      this.versions.set(offer,1);
    } else {
      const result=await this.client.query(`UPDATE baney.oferta_transporte SET estado=$2,agregado_version=$3,
        reemplazada_por_contraoferta=$5,
        version_fila=version_fila+1,actualizado_en=now() WHERE id=$1 AND version_fila=$4 AND eliminado_en IS NULL RETURNING version_fila`,
      [offer.id,offer.currentStatus === TransportOfferStatus.COUNTERED ? 'retirada' : encode(offer.currentStatus),
        offer.currentVersion,version,offer.currentStatus === TransportOfferStatus.COUNTERED]);
      if(!result.rows[0]) throw new DomainError(`Transport offer ${offer.id} changed concurrently`);
      this.versions.set(offer,result.rows[0].row_version);
    }
    await this.events.save(offer);
  }
}

export class PostgresMatchingCandidateRepository implements MatchingCandidateRepository {
  constructor(private readonly client:PoolClient) {}
  async findByRequestId(id:string):Promise<MatchingCandidate[]> {
    const result=await this.client.query(`SELECT c.*,d.usuario_uid AS transportista_uid FROM baney.candidato_matching c
      JOIN baney.perfil_transportista d ON d.id=c.perfil_transportista_id JOIN baney.vehiculo v ON v.id=c.vehiculo_id
      WHERE c.solicitud_id=$1 AND (c.expira_en IS NULL OR c.expira_en>now())
      AND d.estado='habilitado' AND d.eliminado_en IS NULL AND v.estado='habilitado' AND v.eliminado_en IS NULL
      AND NOT EXISTS (SELECT 1 FROM baney.disponibilidad_transportista a WHERE a.perfil_transportista_id=d.id AND a.desde<=now() AND a.hasta>now() AND a.estado='no_disponible')
      ORDER BY c.distancia_km ASC NULLS LAST,c.puntuacion DESC,c.id`,[id]);
    return result.rows.map(r=>MatchingCandidate.create({id:r.id,requestId:r.request_id,carrierId:r.carrier_id,
      vehicleId:r.vehicle_id,score:Number(r.score),distanceKm:r.distance_km===null ? undefined : Number(r.distance_km)}));
  }
}

/** A unit of work: repositories and outbox share one connection and transaction. */
export class PostgresTransportStore {
  constructor(private readonly pool:Pool) {}
  async execute<T>(action:(repositories:TransportRepositories)=>Promise<T>):Promise<T> {
    const client=canonicalRows(await this.pool.connect());
    const outbox=new PostgresTransportOutbox(client);
    const events=new TransactionEvents(outbox);
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path TO baney, public');
      await client.query("SET LOCAL lock_timeout = '5s'");
      const requests=new PostgresTransportRequestRepository(client,events);
      const documents=new PostgresCarrierDocumentRepository(client);
      const result=await action({requests,operations:new PostgresTripOperationsRepository(client,requests,outbox),
        offers:new PostgresTransportOfferRepository(client,events),candidates:new PostgresMatchingCandidateRepository(client),outbox,
        tripHistory:new PostgresTripHistoryRepository(client),fleet:new PostgresFleetRepository(client),carriers:new PostgresCarrierRepository(client),tracking:new PostgresTrackingRepository(client),carrierRequests:new PostgresCarrierRequestRepository(client),documents,finance:new PostgresCarrierFinanceRepository(client),disputes:new PostgresTransportDisputeRepository(client),notifications:new PostgresTransportNotificationRepository(client),chat:new PostgresTripChatRepository(client),zones:new PostgresServiceZoneRepository(client),calls:new PostgresTripCallRepository(client),commission:new PostgresTransportCommissionRuleRepository(client),approval:new PostgresCarrierApprovalRepository(client),admin:new PostgresTransportAdminRepository(client),clientServices:new PostgresClientServicesRepository(client)});
      await client.query('COMMIT'); events.committed(); return result;
    } catch(error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  }
  async health():Promise<void> {
    const version=await this.pool.query("SELECT version FROM baney.version_esquema WHERE version='002'");
    if (version.rowCount !== 1) throw new Error('Shared BANEY schema version 002 is required');
    await this.pool.query('SELECT 1 FROM baney.solicitud_transporte LIMIT 1');
  }
  async close():Promise<void> { await this.pool.end(); }
}
