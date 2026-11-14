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
}

export class PostgresCarrierRepository implements CarrierRepository {
  constructor(private readonly client: PoolClient) {}
  async register(userId: string): Promise<CarrierRegistration> {
    const result = await this.client.query(`INSERT INTO transport.driver_profiles(id,user_id,status)
      VALUES ($1,$2,'PENDING') ON CONFLICT (user_id) DO UPDATE
      SET user_id=EXCLUDED.user_id
      WHERE transport.driver_profiles.deleted_at IS NULL
      RETURNING id,user_id AS "userId",status`, [randomUUID(),userId]);
    if (!result.rows.length) throw new DomainError('Carrier already registered and archived; contact support');
    return result.rows[0] as CarrierRegistration;
  }
}

export class PostgresTrackingRepository {
  constructor(private readonly client: PoolClient) {}
  async findLiveByRequestId(requestId: string): Promise<unknown[]> {
    const result = await this.client.query(`SELECT p.id, p.trip_id AS "tripId", p.latitude, p.longitude,
        p.recorded_at AS "recordedAt", p.source
      FROM transport.tracking_points p JOIN transport.trips t ON t.id=p.trip_id
      WHERE t.request_id=$1 AND t.status='IN_PROGRESS' AND t.deleted_at IS NULL
      ORDER BY p.recorded_at DESC, p.id DESC`, [requestId]);
    return result.rows;
  }
}

export class PostgresTransportOutbox implements TransportDomainOutbox {
  constructor(private readonly client: PoolClient) {}
  async append(events: readonly DomainEvent[]): Promise<void> {
    for (const e of events) {
      await this.client.query(`INSERT INTO transport.outbox_events
        (event_id, aggregate_type, aggregate_id, event_type, aggregate_version, correlation_id, schema_version, payload, occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.eventId,e.aggregateType,e.aggregateId,e.type,e.version,e.correlationId,e.schemaVersion,JSON.stringify(e.payload),e.occurredAt]);
    }
  }
  async pending(): Promise<DomainEvent[]> {
    const result = await this.client.query('SELECT * FROM transport.outbox_events WHERE published_at IS NULL ORDER BY occurred_at, aggregate_version');
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
    const result = await this.client.query(`SELECT r.*, c.description,c.cargo_type,c.weight_kg,c.volume_m3
      FROM transport.transport_requests r JOIN transport.transport_cargos c ON c.request_id=r.id
      WHERE r.id=$1 AND r.deleted_at IS NULL AND c.deleted_at IS NULL FOR UPDATE OF r`,[id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : undefined;
  }
  async findByIdempotencyKey(requesterId: string, key: string): Promise<TransportRequest | undefined> {
    // Serialize concurrent first-time submissions too, before a request row exists.
    await this.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[JSON.stringify([requesterId,key])]);
    const result = await this.client.query(`SELECT id FROM transport.transport_requests
      WHERE requester_id=$1 AND idempotency_key=$2 AND deleted_at IS NULL`,[requesterId,key]);
    return result.rows[0] ? this.findById(result.rows[0].id) : undefined;
  }
  async save(request: TransportRequest, expectedRowVersion?: number, key?: string): Promise<void> {
    const p=request.props;
    const expected=expectedRowVersion ?? this.versions.get(request);
    if (request.currentStatus === TransportRequestStatus.ASSIGNED && request.currentAssignmentId) {
      const existing = await this.client.query('SELECT id FROM transport.assignments WHERE id=$1 AND request_id=$2',
        [request.currentAssignmentId,p.id]);
      if (!existing.rows[0]) {
        const eligible = await this.client.query(`SELECT o.id AS offer_id, d.id AS driver_id, v.id AS vehicle_id
          FROM transport.transport_offers o JOIN transport.driver_profiles d ON d.user_id=o.carrier_id
          JOIN transport.vehicles v ON v.id=o.vehicle_id AND v.owner_id=o.carrier_id
          WHERE o.request_id=$1 AND o.status='ACCEPTED' AND o.deleted_at IS NULL
          AND d.status='ENABLED' AND d.deleted_at IS NULL AND v.status='ENABLED' AND v.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM transport.driver_availability a WHERE a.driver_profile_id=d.id AND a.starts_at<=now() AND a.ends_at>now() AND a.status='UNAVAILABLE')
          FOR UPDATE OF d,v`,[p.id]);
        const candidate=eligible.rows[0];
        if (!candidate) throw new DomainError('Assignment requires an accepted offer with an enabled carrier and vehicle');
        const busy=await this.client.query(`SELECT id FROM transport.assignments WHERE status='ACTIVE' AND deleted_at IS NULL
          AND (driver_profile_id=$1 OR vehicle_id=$2)`,[candidate.driver_id,candidate.vehicle_id]);
        if (busy.rows.length) throw new DomainError('Carrier or vehicle already has an active assignment');
        await this.client.query(`INSERT INTO transport.assignments
          (id,request_id,driver_profile_id,vehicle_id,status,accepted_offer_id) VALUES ($1,$2,$3,$4,'ACTIVE',$5)`,
        [request.currentAssignmentId,p.id,candidate.driver_id,candidate.vehicle_id,candidate.offer_id]);
      }
    }
    if (request.currentStatus === TransportRequestStatus.CANCELLED) {
      await this.client.query(`UPDATE transport.assignments SET status='RELEASED',released_at=now()
        WHERE request_id=$1 AND status='ACTIVE' AND deleted_at IS NULL`,[p.id]);
    }
    if (expected === undefined) {
      await this.client.query(`INSERT INTO transport.transport_requests
        (id,requester_id,idempotency_key,status,origin_address,origin_latitude,origin_longitude,
         destination_address,destination_latitude,destination_longitude,window_starts_at,window_ends_at,
         active_assignment_id,aggregate_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.id,p.requesterId,key ?? null,request.currentStatus,p.origin.address,p.origin.latitude,p.origin.longitude,
        p.destination.address,p.destination.latitude,p.destination.longitude,p.timeWindow.startsAt,p.timeWindow.endsAt,
        request.currentAssignmentId ?? null,request.currentVersion]);
      this.versions.set(request,1);
    } else {
      const result=await this.client.query(`UPDATE transport.transport_requests SET status=$2, active_assignment_id=$3,
        aggregate_version=$4,row_version=row_version+1,updated_at=now(),
        origin_address=$6,origin_latitude=$7,origin_longitude=$8,destination_address=$9,destination_latitude=$10,destination_longitude=$11,window_starts_at=$12,window_ends_at=$13,
        cancelled_at=CASE WHEN $2::transport.transport_request_status='CANCELLED' THEN COALESCE(cancelled_at,now()) ELSE cancelled_at END
        WHERE id=$1 AND row_version=$5 AND deleted_at IS NULL RETURNING row_version`,
      [p.id,request.currentStatus,request.currentAssignmentId ?? null,request.currentVersion,expected,p.origin.address,p.origin.latitude,p.origin.longitude,p.destination.address,p.destination.latitude,p.destination.longitude,p.timeWindow.startsAt,p.timeWindow.endsAt]);
      if (!result.rows[0]) throw new DomainError(`Transport request ${p.id} changed concurrently`);
      this.versions.set(request,result.rows[0].row_version);
    }
    await this.client.query(`INSERT INTO transport.transport_cargos (id,request_id,description,cargo_type,weight_kg,volume_m3)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (request_id) DO UPDATE SET description=EXCLUDED.description,
      cargo_type=EXCLUDED.cargo_type,weight_kg=EXCLUDED.weight_kg,volume_m3=EXCLUDED.volume_m3,updated_at=now()`,
    [randomUUID(),p.id,p.cargo.description,p.cargo.cargoType ?? null,p.cargo.weight?.value ?? null,p.cargo.volume?.value ?? null]);
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
    const result=await this.client.query('SELECT * FROM transport.transport_offers WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : undefined;
  }
  async findByRequestId(id:string):Promise<TransportOffer[]> {
    const result=await this.client.query('SELECT * FROM transport.transport_offers WHERE request_id=$1 AND deleted_at IS NULL ORDER BY created_at,id FOR UPDATE',[id]);
    return result.rows.map(r=>this.hydrate(r));
  }
  async save(offer:TransportOffer):Promise<void> {
    const version=this.versions.get(offer);
    if(version===undefined) {
      await this.client.query(`INSERT INTO transport.transport_offers
        (id,request_id,carrier_id,vehicle_id,amount,currency,status,valid_until,parent_offer_id,proposed_by,round,aggregate_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [offer.id,offer.requestId,offer.carrierId,offer.vehicleId ?? null,offer.price.amount,offer.price.currency,offer.currentStatus,
        offer.validUntil,offer.parentOfferId ?? null,offer.proposedBy ?? null,offer.round,offer.currentVersion]);
      this.versions.set(offer,1);
    } else {
      const result=await this.client.query(`UPDATE transport.transport_offers SET status=$2,aggregate_version=$3,
        row_version=row_version+1,updated_at=now() WHERE id=$1 AND row_version=$4 AND deleted_at IS NULL RETURNING row_version`,
      [offer.id,offer.currentStatus,offer.currentVersion,version]);
      if(!result.rows[0]) throw new DomainError(`Transport offer ${offer.id} changed concurrently`);
      this.versions.set(offer,result.rows[0].row_version);
    }
    await this.events.save(offer);
  }
}

export class PostgresMatchingCandidateRepository implements MatchingCandidateRepository {
  constructor(private readonly client:PoolClient) {}
  async findByRequestId(id:string):Promise<MatchingCandidate[]> {
    const result=await this.client.query(`SELECT c.*,d.user_id AS carrier_id FROM transport.matching_candidates c
      JOIN transport.driver_profiles d ON d.id=c.driver_profile_id JOIN transport.vehicles v ON v.id=c.vehicle_id
      WHERE c.request_id=$1 AND (c.expires_at IS NULL OR c.expires_at>now())
      AND d.status='ENABLED' AND d.deleted_at IS NULL AND v.status='ENABLED' AND v.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM transport.driver_availability a WHERE a.driver_profile_id=d.id AND a.starts_at<=now() AND a.ends_at>now() AND a.status='UNAVAILABLE')
      ORDER BY c.distance_km ASC NULLS LAST,c.score DESC,c.id`,[id]);
    return result.rows.map(r=>MatchingCandidate.create({id:r.id,requestId:r.request_id,carrierId:r.carrier_id,
      vehicleId:r.vehicle_id,score:Number(r.score),distanceKm:r.distance_km===null ? undefined : Number(r.distance_km)}));
  }
}

/** A unit of work: repositories and outbox share one connection and transaction. */
export class PostgresTransportStore {
  constructor(private readonly pool:Pool) {}
  async execute<T>(action:(repositories:TransportRepositories)=>Promise<T>):Promise<T> {
    const client=await this.pool.connect();
    const outbox=new PostgresTransportOutbox(client);
    const events=new TransactionEvents(outbox);
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      const result=await action({requests:new PostgresTransportRequestRepository(client,events),
        offers:new PostgresTransportOfferRepository(client,events),candidates:new PostgresMatchingCandidateRepository(client),outbox,
        tripHistory:new PostgresTripHistoryRepository(client),fleet:new PostgresFleetRepository(client),carriers:new PostgresCarrierRepository(client),tracking:new PostgresTrackingRepository(client)});
      await client.query('COMMIT'); events.committed(); return result;
    } catch(error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  }
  async health():Promise<void> { await this.pool.query('SELECT 1 FROM transport.transport_requests LIMIT 1'); }
  async close():Promise<void> { await this.pool.end(); }
}
