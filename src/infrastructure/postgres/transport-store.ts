import { encode, canonicalRows } from './canonical-values';
import { PostgresTripOperationsRepository } from './trip-operations.repository';
import { PostgresTripHistoryRepository } from './trip-history.repository';
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
import { TransportOfferRepository } from '../../application/transport/ports/transport-offer.repository';
import { MatchingCandidateRepository } from '../../application/transport/ports/matching-candidate.repository';
import { TransportDomainOutbox } from '../../application/transport/ports/transport-domain-outbox';

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
        p.registrado_en AS "recordedAt", p.origen_actor
      FROM baney.punto_rastreo p JOIN baney.viaje t ON t.id=p.viaje_id
      WHERE t.solicitud_id=$1 AND t.estado='en_transito' AND t.eliminado_en IS NULL
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
      timeWindow:TimeWindow.create(new Date(r.window_starts_at),new Date(r.window_ends_at)) },
    r.status as TransportRequestStatus,r.aggregate_version,r.active_assignment_id ?? undefined);
    this.versions.set(request,r.row_version);
    return request;
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
      await this.client.query(`UPDATE baney.viaje SET estado='cancelado',cancelado_en=now(),actualizado_en=now()
        WHERE solicitud_id=$1 AND estado IN ('programado','en_transito') AND eliminado_en IS NULL`,[p.id]);

      await this.client.query(`UPDATE baney.asignacion SET estado='liberada',liberada_en=now()
        WHERE solicitud_id=$1 AND estado='activa' AND eliminado_en IS NULL`,[p.id]);
    }
    if (expected === undefined) {
      await this.client.query(`INSERT INTO baney.solicitud_transporte
        (id,solicitante_uid,idempotency_key,estado,origen_direccion,origen_latitud,origen_longitud,
         destino_direccion,destino_latitud,destino_longitud,ventana_recogida_desde,ventana_recogida_hasta,
         asignacion_activa_id,agregado_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.id,p.requesterId,key ?? null,encode(request.currentStatus),p.origin.address,p.origin.latitude,p.origin.longitude,
        p.destination.address,p.destination.latitude,p.destination.longitude,p.timeWindow.startsAt,p.timeWindow.endsAt,
        request.currentAssignmentId ?? null,request.currentVersion]);
      this.versions.set(request,1);
    } else {
      const result=await this.client.query(`UPDATE baney.solicitud_transporte SET estado=$2, asignacion_activa_id=$3,
        agregado_version=$4,version_fila=version_fila+1,actualizado_en=now(),
        origen_direccion=$6,origen_latitud=$7,origen_longitud=$8,destino_direccion=$9,destino_latitud=$10,destino_longitud=$11,ventana_recogida_desde=$12,ventana_recogida_hasta=$13,
        cancelado_en=CASE WHEN $2::text='cancelada' THEN COALESCE(cancelado_en,now()) ELSE cancelado_en END
        WHERE id=$1 AND version_fila=$5 AND eliminado_en IS NULL RETURNING version_fila`,
      [p.id,encode(request.currentStatus),request.currentAssignmentId ?? null,request.currentVersion,expected,p.origin.address,p.origin.latitude,p.origin.longitude,p.destination.address,p.destination.latitude,p.destination.longitude,p.timeWindow.startsAt,p.timeWindow.endsAt]);
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
      const result=await action({requests,operations:new PostgresTripOperationsRepository(client,requests,outbox),
        offers:new PostgresTransportOfferRepository(client,events),candidates:new PostgresMatchingCandidateRepository(client),outbox,
        tripHistory:new PostgresTripHistoryRepository(client),fleet:new PostgresFleetRepository(client),carriers:new PostgresCarrierRepository(client),tracking:new PostgresTrackingRepository(client)});
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
