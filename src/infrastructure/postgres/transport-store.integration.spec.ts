import { TripOperationsHandler } from '../../application/transport/trip-operations';
import { TransportExceptionType } from '../../domain/transport/transport-exception';
import { TransportQueries } from '../../application/transport/transport-queries';
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
    await expect(store.execute(r=>new TripOperationsHandler(r.operations).incident(trip.id,carrierId,TransportExceptionType.OTHER,'After cancel'))).rejects.toThrow('in-progress');
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
    const accepted=await store.execute(r=>new AcceptOfferHandler(r.requests,r.offers).execute({requestId:request.props.id,requesterId,offerId:counter.id}));
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
});
