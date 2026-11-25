import { CarrierDocumentsHandler } from '../../application/transport/carrier-documents';
import { CarrierApprovalHandler } from '../../application/transport/carrier-approval';
import { TransportAdminHandler } from '../../application/transport/transport-admin';
import { ClientServicesHandler } from '../../application/transport/client-services';
import { CarrierFinanceHandler } from '../../application/transport/carrier-finance';
import { TransportDisputesHandler } from '../../application/transport/disputes';
import { TransportNotificationsHandler } from '../../application/transport/notifications';
import { TripChatHandler } from '../../application/transport/trip-chat';
import { TripCallHandler } from '../../application/transport/trip-call';
import { TripOperationsHandler } from '../../application/transport/trip-operations';
import { TransportExceptionType } from '../../domain/transport/transport-exception';
import { TransportQueries } from '../../application/transport/transport-queries';
import { CarrierRequestsHandler } from '../../application/transport/carrier-requests';
import { ViewReceivedOffersHandler } from '../../application/transport/view-received-offers';
import { ReviseRequestHandler } from '../../application/transport/revise-request';
import { ManageFleetHandler } from '../../application/transport/manage-fleet';
import { VehicleBodyType, VehicleCapacityUnit } from '../../domain/transport/vehicle';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { PostgresTransportStore } from './transport-store';
import { canonicalRows } from './canonical-values';
import { CreateTransportRequestHandler } from '../../application/transport/create-transport-request';
import { SelectCargoTypeHandler } from '../../application/transport/select-cargo-type';
import { CounterOfferHandler } from '../../application/transport/counter-offer';
import { AcceptOfferHandler } from '../../application/transport/accept-offer';
import { CancelTransportRequestHandler } from '../../application/transport/cancel-transport-request';
import { CargoType } from '../../domain/transport/cargo';
import { TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';
import { Money } from '../../domain/transport/value-objects/money';
import { TransportRequestStatus } from '../../domain/transport/transport-request';

// Explicit opt-in. All fixtures and operations remain in one outer transaction,
// rolled back even after a failed assertion. No cleanup DELETE touches shared data.
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
jest.setTimeout(30000);
integration('PostgreSQL transport integration', () => {
  let pool: Pool;
  let client: PoolClient;
  let store: PostgresTransportStore;
  const requesterId = randomUUID();
  const carrierId = randomUUID();
  const driverId = randomUUID();
  const vehicleId = randomUUID();
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 10000 });
    client = canonicalRows(await pool.connect());
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO baney, public');
    await client.query(`INSERT INTO baney.usuario(id,email) VALUES($1,$2),($3,$4)`,[carrierId,`${carrierId}@integration.test`,requesterId,`${requesterId}@integration.test`]);
    const adapter = {
      query: async (sql: string, values?: unknown[]) => {
        if (sql === 'BEGIN') return client.query('SAVEPOINT test_unit_of_work');
        if (sql === 'COMMIT') {
          await client.query('SET CONSTRAINTS ALL IMMEDIATE');
          await client.query('SET CONSTRAINTS ALL DEFERRED');
          return client.query('RELEASE SAVEPOINT test_unit_of_work');
        }
        if (sql === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT test_unit_of_work');
        return client.query(sql, values);
      },
      release: () => undefined,
    };
    store = new PostgresTransportStore({ connect: async () => adapter } as unknown as Pool);
    await client.query(`INSERT INTO baney.perfil_transportista(id,usuario_uid,dueno_flota_uid,estado,induccion_completada_en) VALUES ($1,$2,$2,'habilitado',now())`,[driverId,carrierId]);
    await client.query(`INSERT INTO baney.vehiculo
      (id,dueno_uid,placa,placa_normalizada,tipo_carroceria,capacidad,unidad_capacidad,capacidad_kg,estado)
      VALUES ($1,$2,$3,$3,'volteo',20,'m3',25000,'habilitado')`,[vehicleId,carrierId,randomUUID().replace(/-/g,'').toUpperCase()]);
  },30000);
  afterAll(async () => {
    if (client) { await client.query('ROLLBACK'); client.release(); }
    if (pool) await pool.end();
  });
  const command = () => ({ requesterId, cargo:{ description:'Integration gravel',weightKg:1200,volumeM3:2 },
    origin:{address:'Origin',latitude:18.4,longitude:-69.9},destination:{address:'Destination',latitude:18.5,longitude:-70},
    timeWindow:{startsAt:new Date('2030-01-01T10:00:00Z'),endsAt:new Date('2030-01-01T12:00:00Z')} });
  async function offeredRequest() {
    const request=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute(command()));
    const offer=TransportOffer.create({id:randomUUID(),requestId:request.props.id,carrierId,vehicleId,
      price:Money.create(1200,'DOP'),validUntil:new Date(Date.now()+3600000)});
    offer.submit();
    await store.execute(async r=> {
      const current=(await r.requests.findById(request.props.id))!;
      current.markOffered(); await r.requests.save(current); await r.offers.save(offer);
    });
    return {request,offer};
  }
  it('registers pending carriers idempotently and preserves approval and archived profiles', async () => {
    const first = await store.execute(r => r.carriers.register(requesterId));
    expect(first.status).toBe('PENDING');
    expect(first.userId).toBe(requesterId);
    expect(await store.execute(r => r.carriers.register(requesterId))).toEqual(first);
    const approved = await store.execute(r => r.carriers.register(carrierId));
    expect(approved.id).toBe(driverId);
    expect(approved.status).toBe('ENABLED');
    await client.query('UPDATE baney.perfil_transportista SET eliminado_en=now() WHERE id=$1',[first.id]);
    await expect(store.execute(r => r.carriers.register(requesterId))).rejects.toThrow('archived');
    await client.query('UPDATE baney.perfil_transportista SET eliminado_en=NULL WHERE id=$1',[first.id]);
  });
  it('reads verification, registers and edits owned vehicles without retaining approval',async()=>{
    expect((await store.execute(r=>new ManageFleetHandler(r.fleet).verification(carrierId))).status).toBe('ENABLED');
    const input={registrationNumber:randomUUID(),bodyType:VehicleBodyType.FLATBED,capacityValue:10,capacityUnit:VehicleCapacityUnit.TON,capacityKg:10000};
    const vehicle=await store.execute(r=>new ManageFleetHandler(r.fleet).vehicle(carrierId,input)) as {id:string;status:string};
    expect(vehicle.status).toBe('PENDING');
    await expect(store.execute(r=>new ManageFleetHandler(r.fleet).vehicle(requesterId,input,vehicle.id))).rejects.toThrow('not found');
    await client.query("UPDATE baney.vehiculo SET estado='habilitado' WHERE id=$1",[vehicle.id]);
    const edited=await store.execute(r=>new ManageFleetHandler(r.fleet).vehicle(carrierId,{...input,capacityKg:11000},vehicle.id)) as {status:string;capacity_kg:string};
    expect(edited.status).toBe('PENDING'); expect(Number(edited.capacity_kg)).toBe(11000);
    await expect(store.execute(r=>new ManageFleetHandler(r.fleet).vehicle(carrierId,input))).rejects.toMatchObject({code:'23505'});
  });
  it('persists availability without altering verification and forbids pending carriers becoming available',async()=>{
    const start=new Date(Date.now()-1000),end=new Date(Date.now()+3600000);
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,start,end));
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,false,start,end));
    const rows=await client.query('SELECT estado FROM baney.disponibilidad_transportista WHERE perfil_transportista_id=$1',[driverId]);
    expect(rows.rows).toEqual([{status:'UNAVAILABLE'}]);
    expect((await store.execute(r=>r.fleet.verification(carrierId)))?.status).toBe('ENABLED');
    await expect(store.execute(r=>new ManageFleetHandler(r.fleet).availability(requesterId,true,start,end))).rejects.toThrow('enabled');
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,start,end));
  });
  it('full cycle: carrier sees nearby open request, offers, client accepts, carrier starts and tracks',async()=>{
    const carrier=(r:Parameters<Parameters<typeof store.execute>[0]>[0])=>new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests);
    const request=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),
      timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const id=request.props.id;
    // Near the pickup (18.4,-69.9) the carrier sees it; far away (Santiago) it does not
    const near=await store.execute(r=>carrier(r).open(carrierId,18.41,-69.91,10)) as Array<{id:string;distanceKm:number;cargo:{description:string};myOffer?:unknown}>;
    const seen=near.find(x=>x.id===id);
    expect(seen).toMatchObject({cargo:{description:'Integration gravel'}});
    expect(seen!.distanceKm).toBeLessThan(3); expect(seen!.myOffer).toBeUndefined();
    expect((await store.execute(r=>carrier(r).open(carrierId,19.45,-70.69,10)) as Array<{id:string}>).some(x=>x.id===id)).toBe(false);
    // The client never sees its own request as an offer opportunity, and cannot offer on it
    await expect(store.execute(r=>carrier(r).open(requesterId,18.41,-69.91,10))).rejects.toThrow('enabled');
    // Offer
    const offer=await store.execute(r=>carrier(r).offer(carrierId,id,{amount:3500}));
    expect(offer.currentStatus).toBe('SUBMITTED'); expect(offer.vehicleId).toBe(vehicleId);
    expect((await store.execute(r=>r.requests.findById(id)))!.currentStatus).toBe('OFFERED');
    await expect(store.execute(r=>carrier(r).offer(carrierId,id,{amount:3000}))).rejects.toThrow('already');
    const again=await store.execute(r=>carrier(r).open(carrierId,18.41,-69.91,10)) as Array<{id:string;myOffer?:{amount:number;status:string}}>;
    expect(again.find(x=>x.id===id)!.myOffer).toMatchObject({amount:3500,status:'SUBMITTED'});
    // Client sees and accepts it
    const received=await store.execute(r=>new ViewReceivedOffersHandler(r.requests,r.offers).execute({requestId:id,requesterId}));
    expect(received.map(o=>o.id)).toContain(offer.id);
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:id,requesterId,offerId:offer.id}));
    expect((await store.execute(r=>carrier(r).open(carrierId,18.41,-69.91,10)) as Array<{id:string}>).some(x=>x.id===id)).toBe(false);
    let mine=(await store.execute(r=>carrier(r).myOffers(carrierId)) as Array<{id:string;status:string;requestStatus:string;tripId?:string}>).find(o=>o.id===offer.id)!;
    expect(mine).toMatchObject({status:'ACCEPTED',requestStatus:'ASSIGNED'}); expect(mine.tripId).toBeUndefined();
    // Carrier starts the trip and sends GPS; the client sees it live
    const trip=await store.execute(r=>new TripOperationsHandler(r.operations).start(id,carrierId)) as {id:string};
    await store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,carrierId,{latitude:18.42,longitude:-69.92,recordedAt:new Date(),sourcePointId:'gps-1'}));
    const live=await store.execute(r=>r.tracking.findLiveByRequestId(id));
    expect(live.length).toBe(1);
    mine=(await store.execute(r=>carrier(r).myOffers(carrierId)) as Array<{id:string;status:string;requestStatus:string;tripId?:string;tripStatus?:string}>).find(o=>o.id===offer.id)!;
    expect(mine).toMatchObject({requestStatus:'IN_PROGRESS',tripId:trip.id,tripStatus:'IN_PROGRESS'});
    // Release the carrier for later tests
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:id,requesterId}));
  });
  it('reports the current availability window, unavailable winning over available',async()=>{
    const now=Date.now();
    const fleet=(f:(h:ManageFleetHandler)=>Promise<unknown>)=>store.execute(r=>f(new ManageFleetHandler(r.fleet)));
    await fleet(h=>h.availability(carrierId,true,new Date(now-3600000),new Date(now+3600000)));
    expect(await fleet(h=>h.currentAvailability(carrierId))).toMatchObject({available:true});
    await fleet(h=>h.availability(carrierId,false,new Date(now-3600000),new Date(now+3600000)));
    expect(await fleet(h=>h.currentAvailability(carrierId))).toMatchObject({available:false});
    await fleet(h=>h.availability(carrierId,true,new Date(now-3600000),new Date(now+3600000)));
  });
  it('lists the client own requests, newest first, even before a carrier is assigned',async()=>{
    const created=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute(command()));
    const list=await store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).myRequests(requesterId,100,0)) as Array<{id:string;createdAt:Date;timeWindow:{startsAt:Date}}>;
    const mine=list.find(x=>x.id===created.props.id);
    expect(mine).toMatchObject({status:'OPEN',cargo:{description:'Integration gravel',weightKg:1200,volumeM3:2},
      origin:{address:'Origin',latitude:18.4,longitude:-69.9},destination:{address:'Destination',latitude:18.5,longitude:-70}});
    expect(new Date(mine!.timeWindow.startsAt).toISOString()).toBe('2030-01-01T10:00:00.000Z');
    expect(list.every((x,k)=>k===0 || new Date(list[k-1].createdAt)>=new Date(x.createdAt))).toBe(true);
    const others=await store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).myRequests(carrierId,100,0)) as Array<{id:string}>;
    expect(others.some(x=>x.id===created.props.id)).toBe(false);
  });
  it('locates available carriers nearby, hides identities and excludes offline, far, unavailable or pending ones',async()=>{
    const fleet=(f:(h:ManageFleetHandler)=>Promise<unknown>)=>store.execute(r=>f(new ManageFleetHandler(r.fleet)));
    const now=Date.now();
    await fleet(h=>h.availability(carrierId,true,new Date(now-3600000),new Date(now+3600000)));
    await fleet(h=>h.updateLocation(carrierId,{latitude:18.48612,longitude:-69.93118,recordedAt:new Date(now)}));
    // An older, out-of-order report does not move the carrier back
    const kept=await fleet(h=>h.updateLocation(carrierId,{latitude:18.9,longitude:-70.5,recordedAt:new Date(now-60_000)})) as {latitude:number};
    expect(kept.latitude).toBeCloseTo(18.48612,5);
    const near=await fleet(h=>h.nearby(18.47,-69.93,5)) as Array<Record<string,unknown>>;
    const mine=near.find(c=>c.latitude===18.486 && c.longitude===-69.931);
    expect(mine).toMatchObject({bodyType:'DUMP_TRUCK',capacityValue:20,capacityUnit:'M3'});
    expect(mine!.distanceKm).toBeGreaterThan(1.5); expect(mine!.distanceKm).toBeLessThan(2.2);
    expect(String(mine!.id)).toMatch(/^[0-9a-f]{32}$/); expect(mine!.id).not.toBe(driverId);
    // Too far for the radius
    expect((await fleet(h=>h.nearby(19.45,-70.69,5)) as unknown[]).some(c=>(c as {id:unknown}).id===mine!.id)).toBe(false);
    // Unavailable now
    await fleet(h=>h.availability(carrierId,false,new Date(now-3600000),new Date(now+3600000)));
    expect((await fleet(h=>h.nearby(18.47,-69.93,5)) as unknown[]).some(c=>(c as {id:unknown}).id===mine!.id)).toBe(false);
    await fleet(h=>h.availability(carrierId,true,new Date(now-3600000),new Date(now+3600000)));
    // Stale position (offline phone)
    await client.query("UPDATE baney.perfil_transportista SET ultima_ubicacion_en=now()-interval '10 minutes' WHERE id=$1",[driverId]);
    expect((await fleet(h=>h.nearby(18.47,-69.93,5)) as unknown[]).some(c=>(c as {id:unknown}).id===mine!.id)).toBe(false);
    // Users without a carrier profile cannot report; pending carriers can report but never appear
    await expect(fleet(h=>h.updateLocation(randomUUID(),{latitude:18.47,longitude:-69.93,recordedAt:new Date()}))).rejects.toThrow('not found');
    await fleet(h=>h.updateLocation(carrierId,{latitude:18.48612,longitude:-69.93118,recordedAt:new Date()}));
    await client.query("UPDATE baney.perfil_transportista SET estado='pendiente' WHERE id=$1",[driverId]);
    expect((await fleet(h=>h.nearby(18.47,-69.93,5)) as unknown[]).some(c=>(c as {id:unknown}).id===mine!.id)).toBe(false);
    await client.query("UPDATE baney.perfil_transportista SET estado='habilitado' WHERE id=$1",[driverId]);
    expect((await fleet(h=>h.nearby(18.47,-69.93,5)) as unknown[]).some(c=>(c as {id:unknown}).id===mine!.id)).toBe(true);
  });
  it('preserves unavailable time outside a partially overlapping availability change',async()=>{
    const now=Date.now();
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,false,new Date(now-3600000),new Date(now+3600000)));
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(now+1800000),new Date(now+2700000)));
    const rows=await client.query("SELECT estado FROM baney.disponibilidad_transportista WHERE perfil_transportista_id=$1 AND desde<=$2 AND hasta>$2",[driverId,new Date(now)]);
    expect(rows.rows).toEqual([{status:'UNAVAILABLE'}]);
    for(const [instant,status] of [[now+2200000,'AVAILABLE'],[now+3000000,'UNAVAILABLE']] as const) {
      const fragment=await client.query('SELECT estado FROM baney.disponibilidad_transportista WHERE perfil_transportista_id=$1 AND desde<=$2 AND hasta>$2',[driverId,new Date(instant)]);
      expect(fragment.rows).toEqual([{status}]);
    }
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(now-3600000),new Date(now+3600000)));
  });
  it('persists scheduling, pickup windows, rescheduling, dimensions and route edits with versioned events',async()=>{
    const request=await store.execute(r=>new ReviseRequestHandler(r.requests).schedule(command()));
    const window={startsAt:new Date('2040-01-01T10:00:00Z'),endsAt:new Date('2040-01-01T12:00:00Z')};
    await store.execute(r=>new ReviseRequestHandler(r.requests).execute(request.props.id,requesterId,{timeWindow:window}));
    await store.execute(r=>new ReviseRequestHandler(r.requests).execute(request.props.id,requesterId,{timeWindow:{startsAt:new Date('2040-01-02'),endsAt:new Date('2040-01-03')}}));
    await store.execute(r=>new ReviseRequestHandler(r.requests).execute(request.props.id,requesterId,{cargo:{weightKg:2200}}));
    await store.execute(r=>new ReviseRequestHandler(r.requests).execute(request.props.id,requesterId,{cargo:{volumeM3:4}}));
    await store.execute(r=>new ReviseRequestHandler(r.requests).execute(request.props.id,requesterId,{origin:{address:'Revised',latitude:18,longitude:-69},cargo:{description:'New load'}}));
    const loaded=(await store.execute(r=>r.requests.findById(request.props.id)))!;
    expect(loaded.props.timeWindow.startsAt.toISOString()).toBe('2040-01-02T00:00:00.000Z');
    expect(loaded.props.cargo.weight?.value).toBe(2200);expect(loaded.props.cargo.volume?.value).toBe(4);
    expect(loaded.props.origin.address).toBe('Revised');expect(loaded.props.cargo.description).toBe('New load');
    const events=await client.query("SELECT count(*)::int AS count FROM baney.outbox WHERE agregado_uid=$1 AND tipo_evento='TransportRequestRevised'",[request.props.id]);
    expect(events.rows[0].count).toBe(5);
    await expect(store.execute(r=>new ReviseRequestHandler(r.requests).execute(request.props.id,carrierId,{cargo:{weightKg:1}}))).rejects.toThrow('owner');
  });
  it('compares persisted offers and restricts carrier cargo, route and distance queries',async()=>{
    const {request,offer}=await offeredRequest();
    await store.execute(async r=>{
      const query=new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory);
      expect((await query.compare(request.props.id,requesterId)).map(o=>o.id)).toEqual([offer.id]);
      expect((await query.carrierRequest(request.props.id,carrierId)).props.cargo.description).toBe('Integration gravel');
      const route=await query.route(request.props.id,carrierId);expect(route.distance.value).toBeGreaterThan(0);expect(route.origin.address).toBe('Origin');
    });
    await expect(store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).carrierRequest(request.props.id,requesterId))).rejects.toThrow('enabled');
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:request.props.id,requesterId}));
    await expect(store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).route(request.props.id,carrierId))).rejects.toThrow('available');
  });
  it('starts the assigned trip, tracks GPS idempotently and persists incidents with outbox atomically',async()=>{
    const {request,offer}=await offeredRequest();
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:request.props.id,requesterId,offerId:offer.id}));
    await expect(store.execute(r=>new TripOperationsHandler(r.operations).start(request.props.id,requesterId))).rejects.toThrow('assigned');
    const trip=await store.execute(r=>new TripOperationsHandler(r.operations).start(request.props.id,carrierId)) as {id:string;status:string};
    expect(trip.status).toBe('IN_PROGRESS');
    expect((await store.execute(r=>r.requests.findById(request.props.id)))?.currentStatus).toBe('IN_PROGRESS');
    expect((await store.execute(r=>new TripOperationsHandler(r.operations).start(request.props.id,carrierId)) as {id:string}).id).toBe(trip.id);
    const input={latitude:18.41234567,longitude:-69.91234567,recordedAt:new Date(),sourcePointId:randomUUID()};
    const point=await store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,carrierId,input)) as {id:string};
    expect((await store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,carrierId,input)) as {id:string}).id).toBe(point.id);
    await expect(store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,requesterId,input))).rejects.toThrow('assigned');
    await expect(store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,carrierId,{...input,latitude:19}))).rejects.toThrow('different data');
    await expect(store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,carrierId,{...input,sourcePointId:randomUUID(),recordedAt:new Date(0)}))).rejects.toThrow('chronological');
    expect(await store.execute(r=>r.tracking.findLiveByRequestId(request.props.id))).toHaveLength(1);
    for(const type of [TransportExceptionType.OTHER,TransportExceptionType.BREAKDOWN,TransportExceptionType.DELAY,TransportExceptionType.DAMAGE]) {
      const incident=await store.execute(r=>new TripOperationsHandler(r.operations).incident(trip.id,carrierId,type,'Test incident')) as {type:string};expect(incident.type).toBe(type);
    }
    await expect(store.execute(async r=>{await new TripOperationsHandler(r.operations).incident(trip.id,carrierId,TransportExceptionType.OTHER,'Rollback');throw new Error('Injected');})).rejects.toThrow('Injected');
    expect((await client.query('SELECT count(*)::int AS count FROM baney.incidente WHERE viaje_id=$1',[trip.id])).rows[0].count).toBe(4);
    expect((await client.query("SELECT agregado_version FROM baney.outbox WHERE agregado_tipo='Trip' AND agregado_uid=$1 ORDER BY agregado_version",[trip.id])).rows.map(r=>r.aggregate_version)).toEqual([1,2,3,4,5,6]);
    await expect(store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,false,new Date(),new Date(Date.now()+3600000)))).rejects.toThrow('active assignment');
    const vehicle={registrationNumber:'TEST',bodyType:VehicleBodyType.DUMP_TRUCK,capacityValue:20,capacityUnit:VehicleCapacityUnit.M3,capacityKg:25000};
    await expect(store.execute(r=>new ManageFleetHandler(r.fleet).vehicle(carrierId,vehicle,vehicleId))).rejects.toThrow('active assignment');
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:request.props.id,requesterId}));
    await expect(store.execute(r=>new TripOperationsHandler(r.operations).incident(trip.id,carrierId,TransportExceptionType.OTHER,'After cancel'))).rejects.toThrow('ongoing trip');
  });
  it('reloads persisted values and event versions, and replays idempotent create',async()=>{
    const input={...command(),idempotencyKey:randomUUID()};
    const request=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute(input));
    const replay=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute(input));
    expect(replay.props.id).toBe(request.props.id);
    await store.execute(r=>new SelectCargoTypeHandler(r.requests).execute({requestId:request.props.id,type:CargoType.AGGREGATES}));
    const loaded=await store.execute(r=>r.requests.findById(request.props.id));
    expect(loaded?.props.cargo.cargoType).toBe(CargoType.AGGREGATES);
    expect(loaded?.props.cargo.weight?.value).toBe(1200);
    expect(loaded?.currentStatus).toBe(TransportRequestStatus.OPEN);
    expect(loaded?.peekDomainEvents()).toEqual([]);
    const events=await client.query('SELECT agregado_version FROM baney.outbox WHERE agregado_uid=$1 ORDER BY agregado_version',[request.props.id]);
    expect(events.rows.map(r=>r.aggregate_version)).toEqual([1,2]);
  });
  it('persists a counteroffer and original offer together, then assigns and releases real resources',async()=>{
    const {request,offer}=await offeredRequest();
    const counter=await store.execute(r=>new CounterOfferHandler(r.requests,r.offers).execute({requestId:request.props.id,
      requesterId,offerId:offer.id,amount:1100,currency:'DOP',validUntil:new Date(Date.now()+3600000)}));
    expect((await store.execute(r=>r.offers.findById(offer.id)))?.currentStatus).toBe(TransportOfferStatus.COUNTERED);
    expect(counter.parentOfferId).toBe(offer.id);
    // The client cannot accept its own counteroffer; the carrier does (UC-TRA-27)
    await expect(store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:request.props.id,requesterId,offerId:counter.id}))).rejects.toThrow('Only the carrier');
    await store.execute(r=>carrierH(r).respondToCounter(carrierId,counter.id,'accept'));
    const accepted={request:(await store.execute(r=>r.requests.findById(request.props.id)))!};
    const assignment=(await client.query('SELECT * FROM baney.asignacion WHERE id=$1',[accepted.request.currentAssignmentId])).rows[0];
    expect(assignment.vehicle_id).toBe(vehicleId); expect(assignment.accepted_offer_id).toBe(counter.id);
    const tripId=randomUUID();
    await client.query(`INSERT INTO baney.viaje(id,solicitud_id,asignacion_id,estado,iniciado_en,monto_acordado)
      VALUES ($1,$2,$3,'en_transito',now(),1100)`,[tripId,request.props.id,assignment.id]);
    await client.query(`INSERT INTO baney.punto_rastreo(id,viaje_id,origen_actor,punto_origen_id,latitud,longitud,registrado_en)
      VALUES ($1,$2,'integration',$3,18.4,-69.9,now())`,[randomUUID(),tripId,randomUUID()]);
    expect(await store.execute(r=>r.tracking.findLiveByRequestId(request.props.id))).toHaveLength(1);
    expect(await store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).history(requesterId))).toEqual(expect.arrayContaining([expect.objectContaining({id:tripId,requestId:request.props.id})]));
    expect(await store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).history(carrierId))).toEqual([]);

    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:request.props.id,requesterId}));
    const loaded=await store.execute(r=>r.requests.findById(request.props.id));
    expect(loaded?.currentAssignmentId).toBeUndefined(); expect(loaded?.currentStatus).toBe(TransportRequestStatus.CANCELLED);
    expect((await client.query('SELECT estado FROM baney.asignacion WHERE id=$1',[assignment.id])).rows[0].status).toBe('RELEASED');
  });
  it('rolls back offer, request and outbox when a unit of work fails',async()=>{
    const {request,offer}=await offeredRequest();
    const before=await client.query('SELECT count(*)::int AS count FROM baney.outbox WHERE correlacion_id=$1',[request.props.id]);
    await expect(store.execute(async r=>{
      await new AcceptOfferHandler(r.requests,r.offers).execute({requestId:request.props.id,requesterId,offerId:offer.id});
      throw new Error('Injected failure after all writes');
    })).rejects.toThrow('Injected failure');
    expect((await store.execute(r=>r.offers.findById(offer.id)))?.currentStatus).toBe(TransportOfferStatus.SUBMITTED);
    expect((await store.execute(r=>r.requests.findById(request.props.id)))?.currentStatus).toBe(TransportRequestStatus.OFFERED);
    expect((await client.query('SELECT count(*)::int AS count FROM baney.asignacion WHERE solicitud_id=$1',[request.props.id])).rows[0].count).toBe(0);
    expect((await client.query('SELECT count(*)::int AS count FROM baney.outbox WHERE correlacion_id=$1',[request.props.id])).rows).toEqual(before.rows);
  });
  it('rejects a stale optimistic write without changing the request',async()=>{
    const request=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute(command()));
    await expect(store.execute(async r=>{const loaded=(await r.requests.findById(request.props.id))!;loaded.cancel();await r.requests.save(loaded,999);})).rejects.toThrow('changed concurrently');
    expect((await store.execute(r=>r.requests.findById(request.props.id)))?.currentStatus).toBe(TransportRequestStatus.OPEN);
  });

  // ---------- Casos de uso de la Fase 1 (UC-TRA-10..156) contra el esquema real ----------
  type R=Parameters<Parameters<typeof store.execute>[0]>[0];
  const carrierH=(r:R)=>new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests);
  async function startedTrip() {
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),
      timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const offer=await store.execute(r=>carrierH(r).offer(carrierId,req.props.id,{amount:4200}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:req.props.id,requesterId,offerId:offer.id}));
    const trip=await store.execute(r=>new TripOperationsHandler(r.operations).start(req.props.id,carrierId)) as {id:string};
    return {requestId:req.props.id,tripId:trip.id};
  }

  /** Delivers a started trip with the OTP the client received, freeing the carrier for the next test. */
  async function deliver(tripId:string) {
    const otp=(await client.query(`SELECT carga->>'deliveryCode' AS "code" FROM baney.notificacion WHERE plantilla_codigo='delivery_otp' AND carga->>'tripId'=$1`,[tripId])).rows[0].code;
    await store.execute(r=>new TripOperationsHandler(r.operations).verifyDeliveryOtp(tripId,carrierId,otp));
  }

  it('trip lifecycle: OTP to the client, milestones, evidence, payment capture, delivery frees the carrier, ratings',async()=>{
    const {requestId,tripId}=await startedTrip();
    const ops=(r:R)=>new TripOperationsHandler(r.operations);
    // Authorized payment that delivery must capture (UC-TRA-47)
    await client.query(`INSERT INTO baney.pago(pagador_uid,concepto,viaje_id,metodo,proveedor,monto,idempotency_key,estado)
      VALUES($1,'viaje',$2,'transferencia','banco',4200,$3,'autorizado')`,[requesterId,tripId,`pay-${tripId}`]);
    // The client got the delivery code in its notifications; it is hashed in the trip
    const notes=await store.execute(r=>new TransportNotificationsHandler(r.notifications).list(requesterId)) as Array<{id:string;payload:{tripId?:string;deliveryCode?:string}}>;
    const otpNote=notes.find(n=>n.payload?.tripId===tripId && n.payload?.deliveryCode) as {id:string;payload:{tripId?:string;deliveryCode?:string;requestId?:string}}|undefined;
    expect(otpNote).toBeDefined();
    expect(otpNote!.payload).toMatchObject({requestId});
    const code=otpNote!.payload.deliveryCode!;
    expect(code).toMatch(/^\d{6}$/);
    expect((await client.query('SELECT otp_entrega_hash FROM baney.viaje WHERE id=$1',[tripId])).rows[0].otp_entrega_hash).toMatch(/^[0-9a-f]{64}$/);
    await store.execute(r=>new TransportNotificationsHandler(r.notifications).read(requesterId,otpNote!.id));
    // Incidents with the new types; SOS is always critical
    for (const type of ['ACCIDENT','SOS','CUSTOMER_ABSENT','ASSISTANCE','CARGO_MISSING','NO_SHOW']) {
      await store.execute(r=>ops(r).incident(tripId,carrierId,type as TransportExceptionType,`Prueba ${type}`));
    }
    const sos=await client.query("SELECT gravedad FROM baney.incidente WHERE viaje_id=$1 AND tipo='sos'",[tripId]);
    expect(sos.rows[0].gravedad).toBe('critica');
    // Milestones from the started trip; live tracking continues at destination
    await store.execute(r=>ops(r).milestone(tripId,carrierId,'CHECKIN_DESTINATION'));
    await store.execute(r=>ops(r).track(tripId,carrierId,{latitude:18.5,longitude:-70,recordedAt:new Date(),sourcePointId:`gps-dest-${tripId}`}));
    expect((await store.execute(r=>r.tracking.findLiveByRequestId(requestId))).length).toBe(1);
    await expect(store.execute(r=>ops(r).milestone(tripId,carrierId,'MARK_LOADED'))).rejects.toThrow('invalid from en_destino');
    await store.execute(r=>ops(r).milestone(tripId,carrierId,'UNLOAD'));
    // Evidence (POD) is visible to the client
    await store.execute(r=>ops(r).evidence(tripId,carrierId,{stage:'entrega',type:'foto',url:`https://cdn.test/${tripId}.jpg`,latitude:18.5,longitude:-70}));
    const evidence=await store.execute(r=>ops(r).listEvidence(tripId,requesterId)) as Array<{type:string;uploadedAt:Date}>;
    expect(evidence).toHaveLength(1); expect(evidence[0].uploadedAt).toBeInstanceOf(Date);
    await expect(store.execute(r=>ops(r).listEvidence(tripId,randomUUID()))).rejects.toThrow('not accessible');
    // Rating before delivery is refused
    await expect(store.execute(r=>ops(r).rate(tripId,requesterId,'carrier',5))).rejects.toThrow('delivered');
    // Wrong code counts an attempt; the right one delivers
    const wrong=code==='000000' ? '111111' : '000000';
    expect(await store.execute(r=>ops(r).verifyDeliveryOtp(tripId,carrierId,wrong))).toEqual({delivered:false,attemptsRemaining:4});
    expect((await client.query('SELECT otp_entrega_intentos FROM baney.viaje WHERE id=$1',[tripId])).rows[0].otp_entrega_intentos).toBe(1);
    await store.execute(r=>ops(r).verifyDeliveryOtp(tripId,carrierId,code,'Ana Pérez','001-0000000-1'));
    const trip=(await client.query('SELECT estado,recibido_por_nombre FROM baney.viaje WHERE id=$1',[tripId])).rows[0];
    expect(trip).toMatchObject({status:'COMPLETED',recibido_por_nombre:'Ana Pérez'});
    expect((await store.execute(r=>r.requests.findById(requestId)))!.currentStatus).toBe(TransportRequestStatus.COMPLETED);
    expect((await client.query("SELECT estado FROM baney.pago WHERE viaje_id=$1",[tripId])).rows[0].status).toBe('capturado');
    expect((await client.query("SELECT count(*)::int n FROM baney.asignacion WHERE solicitud_id=$1 AND estado='activa'",[requestId])).rows[0].n).toBe(0);
    // UC-TRA-48: the freight is credited to the carrier's account exactly once
    const freight=(await client.query(`SELECT m.monto AS "movAmount" FROM baney.movimiento m JOIN baney.cuenta c ON c.id=m.cuenta_id WHERE c.titular_uid=$1 AND m.viaje_id=$2 AND m.tipo='flete'`,[carrierId,tripId])).rows;
    expect(freight.map(f=>Number(f.movAmount))).toEqual([4200]);
    // The carrier is free again: can declare availability
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    // Both sides rate each other
    await store.execute(r=>ops(r).rate(tripId,requesterId,'carrier',5,'Excelente'));
    await store.execute(r=>ops(r).rate(tripId,carrierId,'client',4));
    await expect(store.execute(r=>ops(r).rate(tripId,carrierId,'carrier',5))).rejects.toThrow('participant');
    expect((await client.query('SELECT count(*)::int n FROM baney.resena WHERE viaje_id=$1',[tripId])).rows[0].n).toBe(2);

    // Disputes and refunds on the captured payment (UC-TRA-18/39/40)
    const dispute=await store.execute(r=>new TransportDisputesHandler(r.disputes).open(requesterId,tripId,'otro' as never,'Faltó carga',1000)) as {id:string};
    await expect(store.execute(r=>new TransportDisputesHandler(r.disputes).refund(requesterId,dispute.id,5000,'Exceso',`ref-x-${tripId}`))).rejects.toThrow('exceeds');
    const refund=await store.execute(r=>new TransportDisputesHandler(r.disputes).refund(requesterId,dispute.id,800,'Faltante',`ref-${tripId}`)) as {refundAmount:string;refundCurrency:string};
    expect(Number(refund.refundAmount)).toBe(800); expect(String(refund.refundCurrency).trim()).toBe('DOP');
  });

  it('trip chat and call between the two participants only',async()=>{
    const {requestId,tripId}=await startedTrip();
    const conv=(await client.query(`INSERT INTO baney.conversacion(contexto_tipo,viaje_id,creado_por_uid,estado) VALUES('viaje',$1,$2,'activa') RETURNING id`,[tripId,requesterId])).rows[0].id;
    await client.query(`INSERT INTO baney.conversacion_participante(conversacion_id,usuario_uid,rol) VALUES($1,$2,'cliente'),($1,$3,'transportista')`,[conv,requesterId,carrierId]);
    await store.execute(r=>new TripChatHandler(r.chat).send(tripId,carrierId,'Voy en camino'));
    const msgs=await store.execute(r=>new TripChatHandler(r.chat).list(tripId,requesterId)) as Array<{body:string;senderId:string}>;
    expect(msgs).toEqual([expect.objectContaining({body:'Voy en camino',senderId:carrierId})]);
    await expect(store.execute(r=>new TripChatHandler(r.chat).list(tripId,randomUUID()))).rejects.toThrow('participant');
    const call=await store.execute(r=>new TripCallHandler(r.calls).request(tripId,requesterId)) as {id:string};
    const carrierNotes=await store.execute(r=>new TransportNotificationsHandler(r.notifications).list(carrierId)) as Array<{payload:{callId?:string}}>;
    expect(carrierNotes.some(n=>n.payload?.callId===call.id)).toBe(true);
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId,requesterId}));
  });

  it('carrier earnings, idempotent payout to a verified bank account and payout schedule',async()=>{
    // The account already exists: delivered trips credited it (UC-TRA-48)
    const cuenta=(await client.query(`SELECT id FROM baney.cuenta WHERE titular_uid=$1 AND titular_tipo='transportista'`,[carrierId])).rows[0].id;
    const before=Number((await client.query('SELECT disponible FROM baney.saldo_cuenta WHERE cuenta_id=$1',[cuenta])).rows[0].disponible);
    expect(before).toBeGreaterThan(0);
    await client.query(`INSERT INTO baney.movimiento(cuenta_id,tipo,monto,saldo_despues,moneda,descripcion,estado_fondos) VALUES($1,'flete',5000,5000,'DOP','Flete Bávaro','disponible')`,[cuenta]);
    const bank=(await client.query(`INSERT INTO baney.cuenta_bancaria(cuenta_id,banco,tipo,numero_cifrado,ultimos4,titular_nombre,titular_documento,verificada,activa) VALUES($1,'Banreservas','ahorro','enc','1234','Chofer','00100000001',true,true) RETURNING id`,[cuenta])).rows[0].id;
    const fin=(r:R)=>new CarrierFinanceHandler(r.finance);
    const earnings=await store.execute(r=>fin(r).earnings(carrierId));
    expect(earnings).toMatchObject({balance:before+5000,currency:'DOP'});
    expect(earnings.items).toEqual(expect.arrayContaining([expect.objectContaining({type:'flete',amount:5000,currency:'DOP',description:'Flete Bávaro'}),
      expect.objectContaining({type:'flete',amount:4200,description:'Flete del viaje'})]));
    const payout=await store.execute(r=>fin(r).payout(carrierId,3000,bank,'payout-1'));
    expect(payout).toMatchObject({amount:3000,netAmount:3000,currency:'DOP'});
    expect(await store.execute(r=>fin(r).payout(carrierId,3000,bank,'payout-1'))).toMatchObject({id:payout.id});
    await expect(store.execute(r=>fin(r).payout(carrierId,999999,bank,'payout-2'))).rejects.toThrow('Insufficient');
    await expect(store.execute(r=>fin(r).payout(carrierId,100,randomUUID(),'payout-3'))).rejects.toThrow('bank account');
    expect(await store.execute(r=>fin(r).schedule(carrierId,'semanal',1000))).toMatchObject({frecuencia:'semanal',weekday:1});
    expect(await store.execute(r=>fin(r).schedule(carrierId,'mensual',1000))).toMatchObject({frecuencia:'mensual',dayOfMonth:1,weekday:null});
  });

  it('KYC documents: upload, list and review by another user, never own',async()=>{
    const docs=(r:R)=>new CarrierDocumentsHandler(r.documents);
    const doc=await store.execute(r=>docs(r).add(carrierId,{type:'licencia_conducir',url:`https://cdn.test/lic-${randomUUID()}.pdf`,contentType:'application/pdf',bytes:20000,sha256:'a'.repeat(64)})) as {id:string};
    expect((await store.execute(r=>docs(r).list(carrierId))).length).toBeGreaterThan(0);
    await expect(store.execute(r=>docs(r).review(doc.id,carrierId,'aprobado'))).rejects.toThrow('own');
    expect(await store.execute(r=>docs(r).review(doc.id,requesterId,'aprobado'))).toMatchObject({status:'aprobado'});
  });

  it('zones, commission rule, cargo photo, reject hides the request, backhaul and public profile',async()=>{
    await client.query(`INSERT INTO baney.zona_servicio(nombre,tipo,centro_latitud,centro_longitud,radio_metros,activa) VALUES('Gran Santo Domingo','zona_servicio',18.48,-69.93,30000,true)`);
    expect((await store.execute(r=>r.zones.active())).some(z=>z.name==='Gran Santo Domingo')).toBe(true);
    await client.query(`INSERT INTO baney.regla_comision(nombre,aplica_a,ambito,tipo,porcentaje,vigente_desde,creado_por_uid,prioridad) VALUES('Transporte base','transporte','global','porcentaje',0.10,now()-interval '1 day',$1,1)`,[requesterId]);
    expect(await store.execute(r=>r.commission.current())).toMatchObject({percentage:0.1,currency:'DOP'});
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    await store.execute(r=>r.requests.addCargoPhoto!(req.props.id,requesterId,`https://cdn.test/carga-${req.props.id}.jpg`));
    await expect(store.execute(r=>r.requests.addCargoPhoto!(req.props.id,carrierId,'https://cdn.test/otra.jpg'))).rejects.toThrow('not owned');
    const seen=()=>store.execute(r=>carrierH(r).open(carrierId,18.41,-69.91,10)) as Promise<Array<{id:string}>>;
    expect((await seen()).some(x=>x.id===req.props.id)).toBe(true);
    await store.execute(r=>carrierH(r).reject(carrierId,req.props.id,'Muy lejos'));
    expect((await seen()).some(x=>x.id===req.props.id)).toBe(false);
    const backhaul=await store.execute(r=>carrierH(r).publishBackhaul(carrierId,{vehicleId,origin:{address:'Bávaro',latitude:18.6,longitude:-68.4},destination:{address:'SD',latitude:18.48,longitude:-69.93},
      availableFrom:new Date(Date.now()+3600000),availableTo:new Date(Date.now()+7200000),capacityKg:10000}));
    expect(backhaul).toMatchObject({vehicleId});
    expect((await store.execute(r=>carrierH(r).backhaulsOf(carrierId))).length).toBeGreaterThan(0);
    const profile=await store.execute(r=>new ManageFleetHandler(r.fleet).publicProfile(carrierId));
    expect(profile).toMatchObject({userId:carrierId,status:'ENABLED',vehicles:[{bodyType:'volteo',capacity:20,capacityUnit:'m3'}]});
    expect(profile!.completedTrips).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(profile)).not.toMatch(/placa|registration|telefono|licencia/i);
    expect(profile).not.toHaveProperty('licencia_numero');
  });
  it('a moderator approves a pending carrier and its truck; then it can go available and see requests',async()=>{
    const pendingId=randomUUID(), moderatorId=randomUUID(), truckId=randomUUID();
    await client.query(`INSERT INTO baney.usuario(id,email,nombre_completo) VALUES($1,$2,'Chofer Pendiente'),($3,$4,'Moderador')`,[pendingId,`${pendingId}@integration.test`,moderatorId,`${moderatorId}@integration.test`]);
    await client.query(`UPDATE baney.usuario SET rol='moderador' WHERE id=$1`,[moderatorId]);
    await store.execute(r=>r.carriers.register(pendingId));
    await client.query(`INSERT INTO baney.vehiculo(id,dueno_uid,placa,placa_normalizada,tipo_carroceria,capacidad,unidad_capacidad,capacidad_kg)
      VALUES ($1,$2,$3,$3,'volteo',14,'m3',20000)`,[truckId,pendingId,randomUUID().replace(/-/g,'').slice(0,10).toUpperCase()]);
    const admin=(r:R)=>new CarrierApprovalHandler(r.approval);
    // Before approval: the carrier cannot work.
    await expect(store.execute(r=>carrierH(r).open(pendingId,18.41,-69.91,10))).rejects.toThrow('Only an enabled carrier');
    // Only moderators: a regular user (and the carrier itself) is refused.
    await expect(store.execute(r=>admin(r).list(requesterId,'pendiente'))).rejects.toThrow('Only moderators');
    await expect(store.execute(r=>admin(r).setCarrier(pendingId,pendingId,'habilitado'))).rejects.toThrow('Only moderators');
    const queue=await store.execute(r=>admin(r).list(moderatorId,'pendiente')) as Array<{userId:string;fullName:string;vehicleCount:number}>;
    expect(queue.find(c=>c.userId===pendingId)).toMatchObject({fullName:'Chofer Pendiente',vehicleCount:1});
    const detail=await store.execute(r=>admin(r).detail(moderatorId,pendingId)) as {vehicles:Array<{id:string;status:string}>;missingDocuments:string[]};
    expect(detail.vehicles).toEqual([expect.objectContaining({id:truckId,status:'pendiente'})]);
    expect(detail.missingDocuments).toEqual(['cedula_frente','cedula_reverso','licencia_conducir']);
    await expect(store.execute(r=>admin(r).setCarrier(moderatorId,pendingId,'suspendido'))).rejects.toThrow('reason');
    await expect(store.execute(r=>admin(r).setCarrier(moderatorId,pendingId,'aprobado'))).rejects.toThrow('Invalid approval status');
    expect(await store.execute(r=>admin(r).setCarrier(moderatorId,pendingId,'habilitado'))).toMatchObject({userId:pendingId,status:'habilitado'});
    expect(await store.execute(r=>admin(r).setVehicle(moderatorId,truckId,'habilitado'))).toMatchObject({id:truckId,status:'habilitado'});
    // Audited and notified.
    const audit=await client.query(`SELECT accion AS "act",actor_rol AS "actorRole" FROM baney.auditoria WHERE actor_uid=$1 ORDER BY creado_en`,[moderatorId]);
    expect(audit.rows.map(a=>a.act).sort()).toEqual(['transportista.estado','vehiculo.estado']);
    expect(audit.rows[0].actorRole).toBe('moderador');
    const note=await client.query(`SELECT titulo AS "title" FROM baney.notificacion WHERE usuario_uid=$1 AND plantilla_codigo='carrier_status'`,[pendingId]);
    expect(note.rows[0].title).toContain('aprobada');
    // After approval: available + sees open requests.
    expect((await store.execute(r=>new ManageFleetHandler(r.fleet).verification(pendingId)))).toMatchObject({status:'ENABLED'});
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(pendingId,true,new Date(Date.now()-60000),new Date(Date.now()+3600000)));
    expect(Array.isArray(await store.execute(r=>carrierH(r).open(pendingId,18.41,-69.91,10)))).toBe(true);
    // Suspending takes it off the map.
    await store.execute(r=>admin(r).setCarrier(moderatorId,pendingId,'suspendido','Documento vencido'));
    const after=await client.query(`SELECT disponible AS "isAvailable" FROM baney.perfil_transportista WHERE usuario_uid=$1`,[pendingId]);
    expect(after.rows[0].isAvailable).toBe(false);
  });
  it('back office: live map, dispute resolution with refund, zones and commission rules (moderators only)',async()=>{
    const moderatorId=randomUUID();
    await client.query(`INSERT INTO baney.usuario(id,email,rol) VALUES($1,$2,'superadmin')`,[moderatorId,`${moderatorId}@integration.test`]);
    const admin=(r:R)=>new TransportAdminHandler(r.admin,r.approval);
    await expect(store.execute(r=>admin(r).liveTrips(requesterId))).rejects.toThrow('Only moderators');
    // UC-TRA-38: the started trip is on the live map with its last GPS point
    const {tripId}=await startedTrip();
    await store.execute(r=>new TripOperationsHandler(r.operations).track(tripId,carrierId,{latitude:18.45,longitude:-69.95,recordedAt:new Date(),sourcePointId:`live-${tripId}`}));
    const live=await store.execute(r=>admin(r).liveTrips(moderatorId)) as Array<{tripId:string;state:string;position?:{latitude:number}}>;
    expect(live.find(t=>t.tripId===tripId)).toMatchObject({state:'en_transito',position:{latitude:18.45}});
    // UC-TRA-39/40: two disputes on captured payments; one gets a partial refund, the client's pending request is reused
    const payment=async(amount:number)=>(await client.query(`INSERT INTO baney.pago(pagador_uid,concepto,viaje_id,metodo,proveedor,monto,monto_capturado,idempotency_key,estado,autorizado_en,capturado_en)
      VALUES($1,'viaje',$2,'transferencia','banco',$3,$3,$4,'capturado',now(),now()) RETURNING id`,[requesterId,tripId,amount,`cap-${randomUUID()}`])).rows[0].id;
    await payment(4200);
    const disputes=(r:R)=>new TransportDisputesHandler(r.disputes);
    const first=await store.execute(r=>disputes(r).open(requesterId,tripId,'mercancia_faltante','Faltaron 2 m3',1500)) as {id:string};
    await store.execute(r=>disputes(r).refund(requesterId,first.id,1500,'Faltante',`req-${first.id}`));
    expect((await store.execute(r=>admin(r).disputes(moderatorId,'reembolso_solicitado')) as Array<{id:string}>).some(d=>d.id===first.id)).toBe(true);
    await expect(store.execute(r=>admin(r).disputes(moderatorId,'rara'))).rejects.toThrow('Invalid dispute status');
    await expect(store.execute(r=>admin(r).resolveDispute(moderatorId,first.id,'reembolso_parcial','Sin monto',undefined,'k'))).rejects.toThrow('positive amount');
    await expect(store.execute(r=>admin(r).resolveDispute(moderatorId,first.id,'reembolso_parcial','Demasiado',2000,'k'))).rejects.toThrow('exceeds');
    const resolved=await store.execute(r=>admin(r).resolveDispute(moderatorId,first.id,'reembolso_parcial','Se verificó 1 m3 faltante',700,`adm-${first.id}`)) as {status:string;refundAmount:number;refundId:string};
    expect(resolved).toMatchObject({status:'resuelta',refundAmount:700});
    const refund=(await client.query(`SELECT estado AS "refundState",monto AS "refundAmount",autorizado_por_uid AS "by" FROM baney.reembolso WHERE id=$1`,[resolved.refundId])).rows[0];
    expect(refund).toMatchObject({refundState:'autorizado',by:moderatorId}); expect(Number(refund.refundAmount)).toBe(700);
    expect((await client.query(`SELECT count(*)::int n FROM baney.reembolso WHERE origen_id=$1`,[first.id])).rows[0].n).toBe(1);
    await expect(store.execute(r=>admin(r).resolveDispute(moderatorId,first.id,'sin_reembolso','Otra vez',undefined,''))).rejects.toThrow('already resolved');
    const events=(await client.query(`SELECT tipo AS "eventType" FROM baney.disputa_evento WHERE disputa_id=$1 ORDER BY creado_en`,[first.id])).rows.map(e=>e.eventType);
    expect(events).toEqual(expect.arrayContaining(['reembolso_emitido','resuelta']));
    const note=(await client.query(`SELECT titulo AS "title" FROM baney.notificacion WHERE usuario_uid=$1 AND plantilla_codigo='dispute_resolved'`,[requesterId])).rows;
    expect(note).toHaveLength(1);
    // A second dispute (the first freed the payment) closed without refund
    const second=await store.execute(r=>disputes(r).open(requesterId,tripId,'retraso','Llegó tarde',300)) as {id:string};
    expect(await store.execute(r=>admin(r).resolveDispute(moderatorId,second.id,'sin_reembolso','El retraso fue por lluvia',undefined,''))).toMatchObject({status:'resuelta',outcome:'sin_reembolso'});
    // UC-TRA-41: zones
    await expect(store.execute(r=>admin(r).createZone(requesterId,{name:'X',latitude:18,longitude:-70,radiusMeters:1000}))).rejects.toThrow('Only moderators');
    await expect(store.execute(r=>admin(r).createZone(moderatorId,{name:'X',latitude:95,longitude:-70,radiusMeters:1000}))).rejects.toThrow('center');
    const zone=await store.execute(r=>admin(r).createZone(moderatorId,{name:'Santiago',latitude:19.45,longitude:-70.69,radiusMeters:25000})) as {id:string};
    expect((await store.execute(r=>r.zones.active())).some(z=>z.name==='Santiago')).toBe(true);
    expect(await store.execute(r=>admin(r).updateZone(moderatorId,zone.id,{radiusMeters:30000,active:false}))).toMatchObject({radiusMeters:30000,active:false});
    expect((await store.execute(r=>r.zones.active())).some(z=>z.name==='Santiago')).toBe(false);
    // UC-TRA-42: a new commission rule replaces the current one
    await client.query(`INSERT INTO baney.regla_comision(nombre,aplica_a,ambito,tipo,porcentaje,vigente_desde,creado_por_uid,prioridad) VALUES('Vieja','transporte','global','porcentaje',0.10,now()-interval '1 day',$1,1)`,[moderatorId]);
    await expect(store.execute(r=>admin(r).createCommissionRule(moderatorId,{name:'Mala',type:'porcentaje',percentage:1.5,fixedAmount:0,currency:'DOP'}))).rejects.toThrow('between 0 and 1');
    await expect(store.execute(r=>admin(r).createCommissionRule(moderatorId,{name:'Mala',type:'mixto',percentage:0.1,fixedAmount:0,currency:'DOP'}))).rejects.toThrow('mixed');
    const rule=await store.execute(r=>admin(r).createCommissionRule(moderatorId,{name:'Transporte 12%',type:'porcentaje',percentage:0.12,fixedAmount:0,minimum:100,currency:'DOP'})) as {replaced:number};
    expect(rule.replaced).toBeGreaterThanOrEqual(1);
    const audit=(await client.query(`SELECT accion AS "act" FROM baney.auditoria WHERE actor_uid=$1`,[moderatorId])).rows.map(a=>a.act);
    expect(audit).toEqual(expect.arrayContaining(['disputa.resolver','zona.crear','zona.editar','comision.crear']));
    await deliver(tripId);
  });
  it('pre-start steps: confirm, depart, check-in at origin, pickup evidence, loaded, then start; the client follows each step',async()=>{
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const offer=await store.execute(r=>carrierH(r).offer(carrierId,req.props.id,{amount:3900}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:req.props.id,requesterId,offerId:offer.id}));
    const ops=(r:R)=>new TripOperationsHandler(r.operations);
    await expect(store.execute(r=>ops(r).confirm(req.props.id,requesterId))).rejects.toThrow('assigned enabled carrier');
    const confirmed=await store.execute(r=>ops(r).confirm(req.props.id,carrierId)) as {id:string;state:string;confirmedAt:Date};
    expect(confirmed).toMatchObject({state:'programado'}); expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    expect(await store.execute(r=>ops(r).confirm(req.props.id,carrierId))).toMatchObject({id:confirmed.id});
    const tripId=confirmed.id;
    await expect(store.execute(r=>ops(r).evidence(tripId,carrierId,{stage:'recogida',type:'foto',url:`https://cdn.test/early-${tripId}.jpg`}))).rejects.toThrow('not allowed');
    // Before leaving, no GPS; from "on the way to the pickup", the client sees the truck coming
    await expect(store.execute(r=>ops(r).track(tripId,carrierId,{latitude:18.46,longitude:-69.92,recordedAt:new Date(),sourcePointId:`early-${tripId}`}))).rejects.toThrow('in-progress trip');
    await store.execute(r=>ops(r).milestone(tripId,carrierId,'DEPART_TO_ORIGIN'));
    await store.execute(r=>ops(r).track(tripId,carrierId,{latitude:18.465,longitude:-69.915,recordedAt:new Date(),sourcePointId:`to-pickup-${tripId}`}));
    const live=await store.execute(r=>r.tracking.findLiveByRequestId(req.props.id)) as Array<{tripState:string;latitude:string}>;
    expect(live).toHaveLength(1); expect(live[0]).toMatchObject({tripState:'hacia_origen'}); expect(Number(live[0].latitude)).toBe(18.465);
    await expect(store.execute(r=>ops(r).milestone(tripId,carrierId,'MARK_LOADED'))).rejects.toThrow('invalid from hacia_origen');
    await store.execute(r=>ops(r).milestone(tripId,carrierId,'CHECKIN_ORIGIN'));
    await store.execute(r=>ops(r).evidence(tripId,carrierId,{stage:'recogida',type:'ticket_bascula',url:`https://cdn.test/ticket-${tripId}.jpg`,latitude:18.4,longitude:-69.9}));
    await expect(store.execute(r=>ops(r).evidence(tripId,carrierId,{stage:'entrega',type:'foto',url:`https://cdn.test/pod-early-${tripId}.jpg`}))).rejects.toThrow('not allowed');
    await store.execute(r=>ops(r).milestone(tripId,carrierId,'MARK_LOADED'));
    await expect(store.execute(r=>ops(r).milestone(tripId,carrierId,'CHECKIN_DESTINATION'))).rejects.toThrow('invalid from cargado');
    // The request is still assigned until the carrier departs with the cargo
    expect((await store.execute(r=>r.requests.findById(req.props.id)))!.currentStatus).toBe(TransportRequestStatus.ASSIGNED);
    const started=await store.execute(r=>ops(r).start(req.props.id,carrierId)) as {id:string};
    expect(started.id).toBe(tripId);
    expect((await store.execute(r=>r.requests.findById(req.props.id)))!.currentStatus).toBe(TransportRequestStatus.IN_PROGRESS);
    const steps=(await client.query(`SELECT estado AS "tripState",confirmado_en IS NOT NULL AS c,salida_a_origen_en IS NOT NULL AS d,llegada_origen_en IS NOT NULL AS o,cargado_en IS NOT NULL AS l,iniciado_en IS NOT NULL AS s FROM baney.viaje WHERE id=$1`,[tripId])).rows[0];
    expect(steps).toEqual({tripState:'en_transito',c:true,d:true,o:true,l:true,s:true});
    const events=(await client.query(`SELECT tipo_evento AS "kind" FROM baney.viaje_evento WHERE viaje_id=$1 ORDER BY ocurrido_en,tipo_evento`,[tripId])).rows.map(e=>e.kind);
    expect(events).toEqual(expect.arrayContaining(['CONFIRM_ASSIGNMENT','DEPART_TO_ORIGIN','CHECKIN_ORIGIN','MARK_LOADED','START_TRIP']));
    const notes=(await client.query(`SELECT plantilla_codigo AS "template" FROM baney.notificacion WHERE usuario_uid=$1 AND carga->>'tripId'=$2`,[requesterId,tripId])).rows.map(n=>n.template);
    expect(notes).toEqual(expect.arrayContaining(['trip_confirmed','trip_depart_to_origin','trip_checkin_origin','trip_mark_loaded','delivery_otp']));
    // Both evidence stages are kept; delivery evidence is now allowed
    await store.execute(r=>ops(r).evidence(tripId,carrierId,{stage:'entrega',type:'firma',url:`https://cdn.test/firma-${tripId}.png`}));
    expect((await store.execute(r=>ops(r).listEvidence(tripId,requesterId))).length).toBe(2);
    // Release the carrier for the other tests
    await deliver(tripId);
    expect((await client.query(`SELECT estado AS "aState",completado_en IS NOT NULL AS done FROM baney.asignacion WHERE solicitud_id=$1`,[req.props.id])).rows[0]).toEqual({aState:'completada',done:true});
    // UC-TRA-156: with the 12% rule (minimum 100) created by the back-office test, 3900 → 468 commission
    const ledger=(await client.query(`SELECT m.tipo AS "movType",m.monto AS "movAmount" FROM baney.movimiento m WHERE m.viaje_id=$1 ORDER BY m.tipo`,[tripId])).rows.map(x=>[x.movType,Number(x.movAmount)]);
    expect(ledger).toEqual([['comision',-468],['flete',3900]]);
    expect(Number((await client.query(`SELECT monto AS "feeAmount" FROM baney.comision WHERE viaje_id=$1`,[tripId])).rows[0].feeAmount)).toBe(468);
  });
  it('late cancellation of an assigned request records the penalty and tells the carrier (UC-TRA-49)',async()=>{
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    // Pickup in 1 hour: less than 2 hours ahead → 20% penalty
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const offer=await store.execute(r=>carrierH(r).offer(carrierId,req.props.id,{amount:5000}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:req.props.id,requesterId,offerId:offer.id}));
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:req.props.id,requesterId}));
    const trip=(await client.query(`SELECT estado AS "tripState",penalidad_cancelacion AS "penalty",cancelado_por_uid AS "by" FROM baney.viaje WHERE solicitud_id=$1`,[req.props.id])).rows[0];
    expect(trip).toMatchObject({tripState:'cancelado',by:requesterId}); expect(Number(trip.penalty)).toBe(1000);
    const note=(await client.query(`SELECT cuerpo AS "text" FROM baney.notificacion WHERE usuario_uid=$1 AND idempotency_key=$2`,[carrierId,`trip-cancelled:${req.props.id}`])).rows[0];
    expect(note.text).toContain('1000');
    expect((await client.query(`SELECT count(*)::int n FROM baney.asignacion WHERE solicitud_id=$1 AND estado='activa'`,[req.props.id])).rows[0].n).toBe(0);
    // A trip cancelled mid-way (after departing) is closed too, not left on the map
    const second=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+48*3600000),endsAt:new Date(Date.now()+50*3600000)}}));
    const o2=await store.execute(r=>carrierH(r).offer(carrierId,second.props.id,{amount:2000}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:second.props.id,requesterId,offerId:o2.id}));
    const t2=await store.execute(r=>new TripOperationsHandler(r.operations).confirm(second.props.id,carrierId)) as {id:string};
    await store.execute(r=>new TripOperationsHandler(r.operations).milestone(t2.id,carrierId,'DEPART_TO_ORIGIN'));
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:second.props.id,requesterId}));
    const closed=(await client.query(`SELECT estado AS "tripState",penalidad_cancelacion AS "penalty" FROM baney.viaje WHERE id=$1`,[t2.id])).rows[0];
    expect(closed.tripState).toBe('cancelado'); expect(Number(closed.penalty)).toBe(0);
  });
  it('client services: nearby carriers are told of a new request, price estimate, earning estimate, cargo ready and shared trip link',async()=>{
    const services=(r:R)=>new ClientServicesHandler(r.clientServices,'integration-share-secret-0123');
    // UC-TRA-25: the available carrier located near the pickup gets a notification
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    await store.execute(r=>new ManageFleetHandler(r.fleet).updateLocation(carrierId,{latitude:18.41,longitude:-69.91,recordedAt:new Date()}));
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const nearby=(await client.query(`SELECT titulo AS "title",carga AS "data" FROM baney.notificacion WHERE usuario_uid=$1 AND idempotency_key=$2`,[carrierId,`nearby-request:${req.props.id}:${carrierId}`])).rows;
    expect(nearby).toHaveLength(1); expect(nearby[0].data.distanceKm).toBeLessThan(5);
    expect((await client.query(`SELECT count(*)::int n FROM baney.notificacion WHERE usuario_uid=$1 AND plantilla_codigo='nearby_request' AND carga->>'requestId'=$2`,[requesterId,req.props.id])).rows[0].n).toBe(0);
    // UC-TRA-72/73/155: estimate from the most specific active price rule plus the current commission
    await expect(store.execute(r=>services(r).priceEstimate({origin:{latitude:18.4,longitude:-69.9},destination:{latitude:18.5,longitude:-70}}))).rejects.toThrow('No active price rule');
    await client.query(`INSERT INTO baney.regla_precio(nombre,monto_base,precio_km,precio_tonelada,minimo,activa,vigente_desde) VALUES('General',1000,50,100,1500,true,now()-interval '1 day'),('Volteo',1500,60,0,0,true,now()-interval '1 day')`);
    await client.query(`UPDATE baney.regla_precio SET tipo_vehiculo='volteo' WHERE nombre='Volteo'`);
    const general=await store.execute(r=>services(r).priceEstimate({origin:{latitude:18.4,longitude:-69.9},destination:{latitude:18.5,longitude:-70},weightKg:10000})) as {distanceKm:number;estimated:number;breakdown:{base:number;weight:number};commission:number;carrierPayout:number};
    expect(general.breakdown).toMatchObject({base:1000,weight:1000});
    expect(general.estimated).toBeCloseTo(1000+general.distanceKm*50+1000,1);
    expect(general.commission+general.carrierPayout).toBeCloseTo(general.estimated,2);
    const volteo=await store.execute(r=>services(r).priceEstimate({origin:{latitude:18.4,longitude:-69.9},destination:{latitude:18.5,longitude:-70},vehicleType:'DUMP_TRUCK'})) as {breakdown:{base:number}};
    expect(volteo.breakdown.base).toBe(1500);
    // UC-TRA-125: 12% rule with a 100 minimum from the back-office test
    expect(await store.execute(r=>services(r).earningEstimate(5000,'DOP'))).toEqual({gross:5000,commission:600,net:4400,currency:'DOP'});
    expect(await store.execute(r=>services(r).earningEstimate(500,'DOP'))).toMatchObject({commission:100,net:400});
    // UC-TRA-83: only once assigned, only the owner; the carrier is told once
    await expect(store.execute(r=>services(r).cargoReady(req.props.id,requesterId))).rejects.toThrow('assigned request');
    const offer=await store.execute(r=>carrierH(r).offer(carrierId,req.props.id,{amount:4000}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:req.props.id,requesterId,offerId:offer.id}));
    await expect(store.execute(r=>services(r).cargoReady(req.props.id,carrierId))).rejects.toThrow('owner');
    const ready=await store.execute(r=>services(r).cargoReady(req.props.id,requesterId)) as {cargoReadyAt:Date};
    expect(ready.cargoReadyAt).toBeInstanceOf(Date);
    await store.execute(r=>services(r).cargoReady(req.props.id,requesterId));
    expect((await client.query(`SELECT count(*)::int n FROM baney.notificacion WHERE usuario_uid=$1 AND plantilla_codigo='cargo_ready' AND carga->>'requestId'=$2`,[carrierId,req.props.id])).rows[0].n).toBe(1);
    // UC-TRA-12: a participant shares the trip; anyone with the link sees progress, not identities
    const trip=await store.execute(r=>new TripOperationsHandler(r.operations).start(req.props.id,carrierId)) as {id:string};
    await store.execute(r=>new TripOperationsHandler(r.operations).track(trip.id,carrierId,{latitude:18.43,longitude:-69.93,recordedAt:new Date(),sourcePointId:`share-${trip.id}`}));
    await expect(store.execute(r=>services(r).shareTrip(trip.id,randomUUID()))).rejects.toThrow('participant');
    const link=await store.execute(r=>services(r).shareTrip(trip.id,requesterId));
    const view=await store.execute(r=>services(r).openShared(link.token)) as Record<string,unknown>;
    expect(view).toMatchObject({state:'en_transito',position:{latitude:18.43}});
    expect(JSON.stringify(view)).not.toMatch(/nombre|plate|phone|carrier/i);
    await expect(store.execute(r=>services(r).openShared(link.token.slice(0,-2)+'xx'))).rejects.toThrow('Invalid share link');
    await expect(store.execute(r=>services(r).openShared(link.token,new Date(Date.now()+13*3600000)))).rejects.toThrow('Expired');
    await expect(store.execute(r=>new ClientServicesHandler(r.clientServices).shareTrip(trip.id,requesterId))).rejects.toThrow('not configured');
    await deliver(trip.id);
  });
  it('the client and the carrier download the issued trip invoice; nobody else, and never a draft (UC-TRA-17)',async()=>{
    const {tripId}=await startedTrip();
    const ops=(r:R)=>new TripOperationsHandler(r.operations);
    await expect(store.execute(r=>ops(r).invoice(tripId,requesterId))).rejects.toThrow('Invoice was not found');
    const issuer=(await client.query(`INSERT INTO baney.contribuyente(rnc,tipo_documento,razon_social,tipo_contribuyente,usuario_uid) VALUES($1,'rnc','BANEY SRL','persona_juridica',$2) RETURNING id`,[String(Date.now()).slice(-9),requesterId])).rows[0].id;
    const insert=(estado:string,ncf:string|null)=>client.query(`INSERT INTO baney.factura(numero_interno,emisor_tipo,emisor_contribuyente_id,emisor_rnc,emisor_nombre,receptor_nombre,
        subtotal,base_imponible,itbis,total,origen,viaje_id,estado,ncf,fecha_emision,pdf_url)
      VALUES($1,'plataforma',$2,'131000001','BANEY SRL','Cliente',4200,4200,756,4956,'viaje',$3,$4,$5,$6,$7) RETURNING id`,
      [`F-${randomUUID().slice(0,8)}`,issuer,tripId,estado,ncf,ncf?new Date():null,`https://cdn.test/factura-${tripId}.pdf`]);
    await insert('borrador',null);
    await expect(store.execute(r=>ops(r).invoice(tripId,requesterId))).rejects.toThrow('Invoice was not found');
    // Billing issues it (one invoice per trip)
    await client.query(`UPDATE baney.factura SET estado='emitida',ncf='E310000000001',fecha_emision=now() WHERE viaje_id=$1`,[tripId]);
    const forClient=await store.execute(r=>ops(r).invoice(tripId,requesterId)) as Record<string,unknown>;
    expect(forClient).toMatchObject({ncf:'E310000000001',pdf_url:`https://cdn.test/factura-${tripId}.pdf`});
    expect(Number(forClient.total)).toBe(4956);
    expect(await store.execute(r=>ops(r).invoice(tripId,carrierId))).toMatchObject({ncf:'E310000000001'});
    await expect(store.execute(r=>ops(r).invoice(tripId,randomUUID()))).rejects.toThrow('not accessible');
    await deliver(tripId);
  });
  it('the client reports damage, missing cargo, a no-show and asks for help; the carrier is told (UC-TRA-87/88/90/91)',async()=>{
    const ops=(r:R)=>new TripOperationsHandler(r.operations);
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const offer=await store.execute(r=>carrierH(r).offer(carrierId,req.props.id,{amount:3000}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:req.props.id,requesterId,offerId:offer.id}));
    const {id:tripId}=await store.execute(r=>ops(r).confirm(req.props.id,carrierId)) as {id:string};
    // Before pickup: the client reports a no-show; the carrier reports a breakdown on the way
    await store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.NO_SHOW,'No llegó a la hora'));
    await store.execute(r=>ops(r).milestone(tripId,carrierId,'DEPART_TO_ORIGIN'));
    await store.execute(r=>ops(r).incident(tripId,carrierId,TransportExceptionType.BREAKDOWN,'Goma ponchada'));
    await expect(store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.CUSTOMER_ABSENT,'x'))).rejects.toThrow('cannot report');
    await expect(store.execute(r=>ops(r).incident(tripId,randomUUID(),TransportExceptionType.DELAY,'x'))).rejects.toThrow('participant');
    await store.execute(r=>ops(r).start(req.props.id,carrierId));
    await expect(store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.NO_SHOW,'tarde'))).rejects.toThrow('before pickup');
    await store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.ASSISTANCE,'Necesito ayuda con la descarga'));
    await deliver(tripId);
    // After delivery the client can still report damage or missing cargo, the carrier nothing
    await store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.DAMAGE,'Bloques rotos'));
    await store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.CARGO_MISSING,'Faltó medio metro'));
    await expect(store.execute(r=>ops(r).incident(tripId,requesterId,TransportExceptionType.DELAY,'tarde'))).rejects.toThrow('closed');
    await expect(store.execute(r=>ops(r).incident(tripId,carrierId,TransportExceptionType.DELAY,'tarde'))).rejects.toThrow('ongoing trip');
    const rows=(await client.query(`SELECT tipo AS "kind",reportante_rol AS "who" FROM baney.incidente WHERE viaje_id=$1 ORDER BY ocurrido_en,tipo`,[tripId])).rows;
    expect(rows.filter(x=>x.who==='cliente').map(x=>x.kind).sort()).toEqual(['mercancia_danada','mercancia_faltante','no_show_transportista','solicitud_ayuda']);
    expect(rows.filter(x=>x.who==='transportista').map(x=>x.kind)).toEqual(['averia']);
    expect((await client.query(`SELECT count(*)::int n FROM baney.notificacion WHERE usuario_uid=$1 AND plantilla_codigo='trip_incident' AND carga->>'tripId'=$2`,[carrierId,tripId])).rows[0].n).toBe(4);
  });
  it('persists special instructions, requested vehicle type and capacity and reloads them (UC-TRA-67/70/71)',async()=>{
    const created=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),
      requestedVehicleType:'FLATBED',requestedCapacityKg:18000,specialInstructions:'Llamar al llegar; portón azul'}));
    const loaded=await store.execute(r=>r.requests.findById(created.props.id));
    expect(loaded!.props).toMatchObject({requestedVehicleType:'FLATBED',requestedCapacityKg:18000,specialInstructions:'Llamar al llegar; portón azul'});
    const raw=(await client.query(`SELECT tipo_vehiculo_solicitado AS "vehicleKind",capacidad_solicitada_kg AS "kg",instrucciones_especiales AS "notes" FROM baney.solicitud_transporte WHERE id=$1`,[created.props.id])).rows[0];
    expect(raw).toMatchObject({vehicleKind:'plataforma',notes:'Llamar al llegar; portón azul'}); expect(Number(raw.kg)).toBe(18000);
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:created.props.id,requesterId}));
  });
  it('the carrier answers the client counteroffer: counters back or accepts; rounds are limited (UC-TRA-27)',async()=>{
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    const req=await store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+3600000),endsAt:new Date(Date.now()+7200000)}}));
    const first=await store.execute(r=>carrierH(r).offer(carrierId,req.props.id,{amount:5000}));
    const counter=(id:string,amount:number)=>store.execute(r=>new CounterOfferHandler(r.requests,r.offers).execute({requestId:req.props.id,requesterId,offerId:id,amount,currency:'DOP',validUntil:new Date(Date.now()+3600000)}));
    const c1=await counter(first.id,4000);
    await expect(store.execute(r=>carrierH(r).respondToCounter(carrierId,first.id,'accept'))).rejects.toThrow('client counteroffer');
    await expect(store.execute(r=>carrierH(r).respondToCounter(randomUUID(),c1.id,'accept'))).rejects.toThrow();
    const back=(await store.execute(r=>carrierH(r).respondToCounter(carrierId,c1.id,'counter',4500))).offer;
    expect(back).toMatchObject({proposedBy:'CARRIER',round:2,parentOfferId:c1.id}); expect(back.price.amount).toBe(4500);
    const c3=await counter(back.id,4300);
    const c4=(await store.execute(r=>carrierH(r).respondToCounter(carrierId,c3.id,'counter',4400))).offer;
    const c5=await counter(c4.id,4350);
    await expect(store.execute(r=>carrierH(r).respondToCounter(carrierId,c5.id,'counter',4380))).rejects.toThrow('round limit');
    // The carrier accepts the client's last counter instead
    await store.execute(r=>carrierH(r).respondToCounter(carrierId,c5.id,'accept'));
    const assigned=await store.execute(r=>r.requests.findById(req.props.id));
    expect(assigned!.currentStatus).toBe(TransportRequestStatus.ASSIGNED);
    const agreed=(await client.query(`SELECT o.monto AS "agreed" FROM baney.asignacion a JOIN baney.oferta_transporte o ON o.id=a.oferta_aceptada_id WHERE a.solicitud_id=$1 AND a.estado='activa'`,[req.props.id])).rows[0];
    expect(Number(agreed.agreed)).toBe(4350);
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:req.props.id,requesterId}));
  });
  it('requests nobody took before the pickup window ended expire: cancelled as "Vencida", offers expired, client told',async()=>{
    await store.execute(r=>new ManageFleetHandler(r.fleet).availability(carrierId,true,new Date(Date.now()-7200000),new Date(Date.now()+7200000)));
    const make=()=>store.execute(r=>new CreateTransportRequestHandler(r.requests).execute({...command(),timeWindow:{startsAt:new Date(Date.now()+60000),endsAt:new Date(Date.now()+7200000)}}));
    const stale=await make(), withOffer=await make(), fresh=await make(), assigned=await make();
    await store.execute(r=>carrierH(r).offer(carrierId,withOffer.props.id,{amount:3000}));
    const taken=await store.execute(r=>carrierH(r).offer(carrierId,assigned.props.id,{amount:3100}));
    await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:assigned.props.id,requesterId,offerId:taken.id}));
    // The pickup window of three of them ended yesterday
    await client.query(`UPDATE baney.solicitud_transporte SET ventana_recogida_desde=now()-interval '26 hours',ventana_recogida_hasta=now()-interval '24 hours' WHERE id = ANY($1::uuid[])`,[[stale.props.id,withOffer.props.id,assigned.props.id]]);
    const expired=await store.execute(r=>r.requests.expireStale!(requesterId));
    expect(expired.sort()).toEqual([stale.props.id,withOffer.props.id].sort());
    const state=async(id:string)=>(await client.query(`SELECT estado AS "requestState",motivo_cancelacion AS "reason",cancelado_en IS NOT NULL AS "closed" FROM baney.solicitud_transporte WHERE id=$1`,[id])).rows[0];
    expect(await state(stale.props.id)).toMatchObject({requestState:'cancelada',closed:true,reason:expect.stringMatching(/^Vencida/)});
    expect((await state(fresh.props.id)).requestState).not.toBe('cancelada');
    expect((await state(assigned.props.id)).requestState).toBe('asignada');
    expect((await client.query(`SELECT estado AS "offerState" FROM baney.oferta_transporte WHERE solicitud_id=$1`,[withOffer.props.id])).rows[0].offerState).toBe('expirada');
    const events=(await client.query(`SELECT tipo_evento AS "eventType" FROM baney.outbox WHERE agregado_uid=$1 ORDER BY agregado_version DESC LIMIT 1`,[stale.props.id])).rows[0];
    expect(events.eventType).toBe('TransportRequestExpired');
    expect((await client.query(`SELECT count(*)::int n FROM baney.notificacion WHERE usuario_uid=$1 AND plantilla_codigo='request_expired'`,[requesterId])).rows[0].n).toBe(2);
    // The client's list marks them, and running again changes nothing
    const mine=await store.execute(r=>r.tripHistory.requests(requesterId,100,0)) as Array<{id:string;status:string;expired?:boolean}>;
    expect(mine.find(x=>x.id===stale.props.id)).toMatchObject({status:'CANCELLED',expired:true});
    expect(mine.find(x=>x.id===fresh.props.id)?.expired).toBeUndefined();
    expect(await store.execute(r=>r.requests.isExpired!(stale.props.id))).toBe(true);
    expect(await store.execute(r=>r.requests.expireStale!())).toEqual([]);
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:assigned.props.id,requesterId}));
    await store.execute(r=>new CancelTransportRequestHandler(r.requests).execute({requestId:fresh.props.id,requesterId}));
  });
});
