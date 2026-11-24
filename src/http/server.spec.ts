import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { createTransportServer } from './server';
import { InMemoryTransportRequestRepository } from '../infrastructure/in-memory/transport-request-in-memory.repository';
import { InMemoryTransportOfferRepository } from '../infrastructure/in-memory/transport-offer-in-memory.repository';
import { InMemoryMatchingCandidateRepository } from '../infrastructure/in-memory/matching-candidate-in-memory.repository';
import { TransportOffer } from '../domain/transport/transport-offer';
import { Money } from '../domain/transport/value-objects/money';
import { HttpError } from './auth';

describe('Transport HTTP API', () => {
  let server: Server, base: string;
  let requests: InMemoryTransportRequestRepository, offers: InMemoryTransportOfferRepository;
  const input = { requesterId: 'forged-client', cargo: { description: 'Arena', weightKg: 500 },
    origin: { address: 'Origen', latitude: 18.4, longitude: -69.9 },
    destination: { address: 'Destino', latitude: 18.5, longitude: -70 },
    timeWindow: { startsAt: '2026-10-31T08:00:00Z', endsAt: '2026-10-31T12:00:00Z' } };
  beforeEach(async () => {
    requests = new InMemoryTransportRequestRepository(); offers = new InMemoryTransportOfferRepository();
    (requests as InMemoryTransportRequestRepository & { addCargoPhoto: (requestId:string, requesterId:string, url:string)=>Promise<unknown> }).addCargoPhoto = async (requestId, requesterId, url) => ({ id:'photo-1', requestId, url, uploadedBy: requesterId });
    server = createTransportServer({ execute: action => action({ operations:{start:async()=>({status:'IN_PROGRESS'}),track:async (_user,point)=>point,incident:async (_user,incident)=>incident}, tripHistory:{history:async()=>[],requests:async(userId:string)=>[{id:'r-1',status:'OPEN',requester:userId}]}, fleet: { verification: async userId => ({id:'profile-1',userId,status: userId === 'other-client' ? 'ENABLED' : 'PENDING'}), saveVehicle: async v => v, availability: async () => ({status:'UNAVAILABLE'}), updateLocation: async (_userId, location) => location, currentAvailability: async () => ({ available: true, startsAt: new Date('2030-01-01T00:00:00Z'), endsAt: new Date('2030-01-01T12:00:00Z') }), nearby: async query => [{ id: 'token-1', latitude: query.latitude + 0.01, longitude: query.longitude, distanceKm: 1.1, bodyType: 'DUMP_TRUCK', capacityValue: 12, capacityUnit: 'M3', updatedAt: new Date('2030-01-01T00:00:00Z') }] }, carriers: { register: async userId => ({ id: 'profile-1', userId, status: 'PENDING' }) }, requests, offers, candidates: new InMemoryMatchingCandidateRepository(), tracking: { findLiveByRequestId: async () => [] }, carrierRequests: { openNear: async q => [{ id: 'req-9', status: 'OPEN', distanceKm: 2.5, createdAt: new Date(), cargo: { description: 'Grava' }, origin: { address: 'A', latitude: q.latitude, longitude: q.longitude }, destination: { address: 'B', latitude: 18.5, longitude: -70 }, timeWindow: { startsAt: new Date(), endsAt: new Date() } }], enabledVehicle: async () => 'veh-1', offersOf: async () => [] }, approval: { reviewerRole: async userId => userId === 'other-client' ? 'moderador' : 'usuario', listCarriers: async status => [{ userId: 'c-1', status: status ?? 'pendiente' }], carrierDetail: async id => ({ userId: id, vehicles: [], documents: [], missingDocuments: [] }), setCarrierStatus: async (id, status, who, reason) => ({ userId: id, status, reviewedBy: who.id, reason }), setVehicleStatus: async (id, status) => ({ id, status }) }, admin: { liveTrips: async () => [{ tripId: 't-1' }], disputes: async () => [], resolveDispute: async (_who, id, outcome, _note, amount) => ({ id, outcome, refundAmount: amount }), createZone: async (_who, zone) => ({ id: 'z-1', ...zone }), updateZone: async (_who, id, changes) => ({ id, ...changes }), createCommissionRule: async (_who, rule) => ({ id: 'c-1', ...rule }) }, documents: { add: async (_u, d) => d, list: async () => [], review: async (id, reviewer, status) => ({ id, status, reviewedBy: reviewer }) }, clientServices: { priceRule: async () => ({ id: 'p-1', basePrice: 1000, pricePerKm: 50, pricePerTon: 0, minimum: 0, currency: 'DOP' }), commissionTerms: async () => ({ percentage: 0.1, fixedAmount: 0 }), cargoReady: async (requestId) => ({ requestId }), assertParticipant: async (_trip, userId) => { if (userId !== 'client-1') throw new Error('not a participant'); }, sharedTrip: async () => ({ state: 'en_transito' }) } }), health: async () => {} }, async authorization => {
      if (!authorization) throw new HttpError(401, 'Token required');
      return authorization === 'Bearer owner' ? 'client-1' : 'other-client';
    }, { shareSecret: 'http-share-secret-0123456' });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  async function call(path: string, method = 'GET', body?: unknown, token = 'owner', extra: Record<string, string> = {}) {
    return fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function create() { const response = await call('/transport-requests', 'POST', input); expect(response.status).toBe(201); return response.json(); }
  it('estimates price and earnings, marks cargo ready and serves a shared trip without a token', async()=>{
    const estimate=await call('/transport-requests/price-estimate','POST',{origin:{address:'A',latitude:18.4,longitude:-69.9},destination:{address:'B',latitude:18.5,longitude:-70}});
    expect(estimate.status).toBe(200); expect(await estimate.json()).toMatchObject({currency:'DOP',breakdown:{base:1000}});
    expect((await call('/transport-requests/price-estimate','POST',{origin:{address:'A',latitude:99,longitude:0},destination:{address:'B',latitude:1,longitude:1}})).status).toBe(400);
    expect(await (await call('/carrier/earning-estimate','POST',{amount:1000})).json()).toEqual({gross:1000,commission:100,net:900,currency:'DOP'});
    expect((await call('/transport-requests/r-1/cargo-ready','POST',{})).status).toBe(200);
    const shared=await call('/trips/t-1/share','POST',{});
    expect(shared.status).toBe(201);
    const { path } = await shared.json() as { path: string };
    const open=await fetch(base+path);
    expect(open.status).toBe(200); expect(await open.json()).toEqual({state:'en_transito'});
    expect((await fetch(base+'/shared/trips/forged.token')).status).toBe(404);
  });
  it('lets only moderators review KYC documents (UC-TRA-37)', async()=>{
    expect((await call('/carrier-documents/d-1/review','PATCH',{status:'aprobado'})).status).toBe(403);
    const ok=await call('/carrier-documents/d-1/review','PATCH',{status:'aprobado'},'moderator');
    expect(ok.status).toBe(200); expect(await ok.json()).toEqual({id:'d-1',status:'aprobado',reviewedBy:'other-client'});
    expect((await call('/carrier-documents/d-1/review','PATCH',{status:'rechazado'},'moderator')).status).toBe(400);
  });
  it('serves the transport back office only to moderators', async()=>{
    expect((await call('/admin/trips/live')).status).toBe(403);
    expect(await (await call('/admin/trips/live','GET',undefined,'moderator')).json()).toEqual([{tripId:'t-1'}]);
    expect((await call('/admin/disputes/d-1/resolve','POST',{outcome:'reembolso_parcial',resolution:'ok',amount:50},'moderator')).status).toBe(400);
    const resolved=await call('/admin/disputes/d-1/resolve','POST',{outcome:'reembolso_parcial',resolution:'ok',amount:50},'moderator',{'idempotency-key':'k-1'});
    expect(resolved.status).toBe(200); expect(await resolved.json()).toEqual({id:'d-1',outcome:'reembolso_parcial',refundAmount:50});
    expect((await call('/admin/zones','POST',{name:'SD',latitude:18.4,longitude:-69.9,radiusMeters:20000},'moderator')).status).toBe(201);
    expect((await call('/admin/zones/z-1','PATCH',{active:'no'},'moderator')).status).toBe(400);
    expect((await call('/admin/zones/z-1','PATCH',{active:false},'moderator')).status).toBe(200);
    expect((await call('/admin/commission-rules','POST',{name:'12%',type:'porcentaje',percentage:0.12},'moderator')).status).toBe(201);
    expect((await call('/admin/commission-rules','POST',{name:'12%',type:'porcentaje',percentage:0.12})).status).toBe(403);
  });
  it('lets only moderators list and approve carriers and vehicles', async()=>{
    expect((await call('/admin/carriers?status=pendiente')).status).toBe(403);
    expect((await call('/admin/carriers/c-1/status','PATCH',{status:'habilitado'})).status).toBe(403);
    const list=await call('/admin/carriers?status=pendiente','GET',undefined,'moderator');
    expect(list.status).toBe(200); expect(await list.json()).toEqual([{userId:'c-1',status:'pendiente'}]);
    expect((await call('/admin/carriers?status=raro','GET',undefined,'moderator')).status).toBe(400);
    expect((await call('/admin/carriers/c-1','GET',undefined,'moderator')).status).toBe(200);
    const ok=await call('/admin/carriers/c-1/status','PATCH',{status:'habilitado'},'moderator');
    expect(ok.status).toBe(200); expect(await ok.json()).toMatchObject({userId:'c-1',status:'habilitado',reviewedBy:'other-client'});
    expect((await call('/admin/carriers/c-1/status','PATCH',{status:'suspendido'},'moderator')).status).toBe(400);
    expect((await call('/admin/carriers/other-client/status','PATCH',{status:'habilitado'},'moderator')).status).toBe(400);
    expect((await call('/admin/vehicles/v-1/status','PATCH',{status:'habilitado'},'moderator')).status).toBe(200);
  });
  it('uploads cargo photos only with a valid URL and request ownership', async()=>{
    const created=await create();
    const uploaded=await call(`/transport-requests/${created.id}/photos`,'POST',{url:'https://cdn.example.test/cargo-1.jpg'});
    expect(uploaded.status).toBe(201); expect(await uploaded.json()).toMatchObject({requestId:created.id,url:'https://cdn.example.test/cargo-1.jpg'});
    expect((await call(`/transport-requests/${created.id}/photos`,'POST',{url:'file:///tmp/cargo.jpg'})).status).toBe(400);
    expect((await call(`/transport-requests/${created.id}/photos`,'POST',{url:'not-a-url'})).status).toBe(400);
  });
  async function offer(requestId: string, id: string) {
    const request = (await requests.findById(requestId))!; request.markOffered();
    const result = TransportOffer.create({ id, requestId, carrierId: 'carrier-1', price: Money.create(1500, 'DOP'), validUntil: new Date(Date.now() + 3600000) });
    result.submit(); await offers.save(result); return result;
  }
  it('exposes verification and validates fleet inputs through HTTP', async()=>{
    expect((await (await call('/carriers/me/verification')).json()).userId).toBe('client-1');
    const invalid=await call('/vehicles','POST',{registrationNumber:'A',bodyType:'DUMP_TRUCK',capacityValue:2,capacityUnit:'TON',capacityKg:2000});
    expect(invalid.status).toBe(400);
    const availability=await call('/carriers/me/availability','PUT',{available:'yes',startsAt:'2030-01-01',endsAt:'2030-01-02'});
    expect(availability.status).toBe(400);
  });
  it('lets an enabled carrier list open requests, offer and see its offers; pending carriers are refused', async()=>{
    const created=await create();
    const open=await call('/carrier/requests/open?latitude=18.4&longitude=-69.9&radiusKm=20','GET',undefined,'other');
    expect(open.status).toBe(200);
    expect((await open.json())[0]).toMatchObject({id:'req-9',distanceKm:2.5});
    expect((await call('/carrier/requests/open?latitude=18.4&longitude=-69.9','GET',undefined,'owner')).status).toBe(409);
    expect((await call('/carrier/requests/open?latitude=18.4','GET',undefined,'other')).status).toBe(400);
    const offered=await call(`/carrier/requests/${created.id}/offers`,'POST',{amount:3500},'other');
    expect(offered.status).toBe(201);
    expect(await offered.json()).toMatchObject({requestId:created.id,carrierId:'other-client',vehicleId:'veh-1',status:'SUBMITTED',price:{amount:3500,currency:'DOP'}});
    expect((await call(`/carrier/requests/${created.id}/offers`,'POST',{amount:3000},'other')).status).toBe(409);
    expect((await call(`/carrier/requests/${created.id}/offers`,'POST',{amount:'mucho'},'other')).status).toBe(400);
    const received=await (await call(`/transport-requests/${created.id}/offers`)).json();
    expect(received).toHaveLength(1);
    expect((await call('/carrier/offers','GET',undefined,'other')).status).toBe(200);
    expect((await call('/carriers/me/availability')).status).toBe(200);
  });
  it('lists only the authenticated client requests and validates pagination', async()=>{
    const mine=await call('/transport-requests?limit=10');
    expect(mine.status).toBe(200);
    expect(await mine.json()).toEqual([{id:'r-1',status:'OPEN',requester:'client-1'}]);
    for (const q of ['?limit=0','?limit=101','?offset=-1','?limit=abc']) expect((await call('/transport-requests'+q)).status).toBe(400);
    expect((await fetch(base+'/transport-requests')).status).toBe(401);
  });
  it('reports the carrier location and lists nearby carriers without identities', async()=>{
    const reported=await call('/carriers/me/location','PUT',{latitude:18.47,longitude:-69.93});
    expect(reported.status).toBe(200);
    expect(await reported.json()).toMatchObject({latitude:18.47,longitude:-69.93});
    for (const body of [{latitude:'18',longitude:-69},{latitude:91,longitude:-69},{latitude:18,longitude:-69,recordedAt:'2999-01-01T00:00:00Z'}]) {
      expect((await call('/carriers/me/location','PUT',body)).status).toBe(400);
    }
    const nearby=await call('/carriers/nearby?latitude=18.47&longitude=-69.93&radiusKm=10');
    expect(nearby.status).toBe(200);
    const list=await nearby.json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({id:'token-1',distanceKm:1.1,bodyType:'DUMP_TRUCK'});
    expect(list[0]).not.toHaveProperty('userId');
    for (const query of ['','?latitude=18.4','?latitude=abc&longitude=-69','?latitude=18&longitude=-69&radiusKm=500','?latitude=18&longitude=-69&limit=0']) {
      expect((await call('/carriers/nearby'+query)).status).toBe(400);
    }
    expect((await fetch(base+'/carriers/nearby?latitude=18&longitude=-69')).status).toBe(401);
  });
  it('schedules and revises requests through all six request endpoints',async()=>{
    const scheduled=await call('/transport-requests/scheduled','POST',{...input,timeWindow:{startsAt:'2040-01-01',endsAt:'2040-01-02'}});
    expect(scheduled.status).toBe(201);const request=await scheduled.json();const path='/transport-requests/'+request.id;
    for(const suffix of ['pickup-window','reschedule']) expect((await call(path+'/'+suffix,'PATCH',{startsAt:'2040-01-03',endsAt:'2040-01-04'})).status).toBe(200);
    expect((await call(path+'/cargo-weight','PATCH',{weightKg:250})).status).toBe(200);
    expect((await call(path+'/cargo-volume','PATCH',{volumeM3:3})).status).toBe(200);
    const revised=await call(path,'PATCH',{cargo:{description:'Updated'}});expect(revised.status).toBe(200);
    const data=await revised.json();expect(data.cargo).toMatchObject({description:'Updated',weightKg:250,volumeM3:3});
    expect((await call(path+'/cargo-weight','PATCH',{weightKg:1},'foreign')).status).toBe(403);
  });
  it('compares offers and validates history pagination through HTTP',async()=>{
    const request=await create();await offer(request.id,'compare-1');
    expect((await (await call('/transport-requests/'+request.id+'/compare-offers')).json())[0].id).toBe('compare-1');
    expect(await (await call('/trips/history')).json()).toEqual([]);
    expect((await call('/trips/history?limit=1000')).status).toBe(400);
    // The fixture profile is pending, so carrier-only load data stays protected.
    expect((await call('/carrier/requests/'+request.id+'/cargo')).status).toBe(409);
  });
  it('exposes start, GPS and incident routes with validated types',async()=>{
    expect((await call('/carrier/requests/request-1/start','POST',{})).status).toBe(200);
    const point=await call('/trips/trip-1/tracking','POST',{latitude:18,longitude:-69,recordedAt:new Date().toISOString(),sourcePointId:'point-1'});expect(point.status).toBe(200);
    for(const [route,type] of [['incidents','OTHER'],['breakdown','BREAKDOWN'],['delay','DELAY'],['cargo-damage','DAMAGE'],['accident','ACCIDENT'],['cargo-missing','CARGO_MISSING'],['no-show','NO_SHOW'],['customer-absent','CUSTOMER_ABSENT'],['assistance','ASSISTANCE'],['sos','SOS']]) {
      const result=await call('/trips/trip-1/'+route,'POST',{type:'OTHER',description:'Test'});expect(result.status).toBe(200);expect((await result.json()).type).toBe(type);
    }
    expect((await call('/trips/trip-1/incidents','POST',{type:'BAD',description:'Test'})).status).toBe(400);
  });
  it('registers only the authenticated carrier without granting approval', async () => {
    const response = await call('/carriers/me', 'POST', { userId: 'forged', status: 'ENABLED' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'profile-1', userId: 'client-1', status: 'PENDING' });
    const denied = await fetch(base + '/carriers/me', { method: 'POST' });
    expect(denied.status).toBe(401);
  });
  it('creates, selects cargo, lists nearby trucks and offers, then cancels', async () => {
    const created = await create(); expect(created.requesterId).toBe('client-1'); expect(created.domainEvents).toBeUndefined();
    const path = `/transport-requests/${created.id}`;
    const selected = await call(path + '/cargo-type', 'PATCH', { type: 'AGGREGATES' });
    expect(selected.status).toBe(200); expect((await selected.json()).cargo.type).toBe('AGGREGATES');
    expect(await (await call(path + '/nearby-trucks?maxDistanceKm=20')).json()).toEqual([]);
    expect(await (await call(path + '/tracking')).json()).toEqual([]);
    expect(await (await call(path + '/offers')).json()).toEqual([]);
    expect((await (await call(path + '/cancel', 'POST', {})).json()).status).toBe('CANCELLED');
  });
  it('returns the same request for an idempotent retry', async () => {
    const first = await call('/transport-requests', 'POST', input, 'owner', { 'idempotency-key': 'retry-1' });
    const second = await call('/transport-requests', 'POST', input, 'owner', { 'idempotency-key': 'retry-1' });
    expect((await first.json()).id).toBe((await second.json()).id);
  });
  it('lists and accepts a received offer', async () => {
    const created = await create(); await offer(created.id, 'offer-1'); const path = `/transport-requests/${created.id}`;
    expect((await (await call(path + '/offers')).json())[0].status).toBe('SUBMITTED');
    const accepted = await call(path + '/offers/offer-1/accept', 'POST', {});
    expect(accepted.status).toBe(200); expect((await accepted.json()).request.status).toBe('ASSIGNED');
  });
  it('counteroffers with an explicit client actor', async () => {
    const created = await create(); await offer(created.id, 'offer-1');
    const counter = await call(`/transport-requests/${created.id}/offers/offer-1/counter`, 'POST', { amount: 1300, currency: 'DOP', validUntil: new Date(Date.now() + 3600000).toISOString() });
    expect(counter.status).toBe(201); expect((await counter.json()).proposedBy).toBe('CLIENT');
  });
  it('denies another owner for every request route, including cargo selection and truck listings', async () => {
    const created = await create(); const path = `/transport-requests/${created.id}`;
    for (const [suffix, method, body] of [['', 'GET', undefined], ['/cargo-type', 'PATCH', { type: 'OTHER' }], ['/nearby-trucks', 'GET', undefined], ['/offers', 'GET', undefined], ['/cancel', 'POST', {}]] as const) {
      expect((await call(path + suffix, method, body, 'other')).status).toBe(403);
    }
    expect((await requests.findById(created.id))!.currentStatus).toBe('OPEN');
  });
  it('rejects missing auth, invalid JSON shapes, numbers and dates without 500 errors', async () => {
    expect((await fetch(base + '/transport-requests')).status).toBe(401);
    for (const body of [null, {}, { ...input, origin: { ...input.origin, latitude: '18' } }, { ...input, timeWindow: { startsAt: 'invalid', endsAt: 'invalid' } }]) {
      expect((await call('/transport-requests', 'POST', body)).status).toBe(400);
    }
    const created = await create();
    expect((await call(`/transport-requests/${created.id}/nearby-trucks?maxDistanceKm=NaN`)).status).toBe(400);
    expect((await call('/transport-requests/missing')).status).toBe(404);
  });
});
