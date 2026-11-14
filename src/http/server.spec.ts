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
    server = createTransportServer({ execute: action => action({ fleet: { verification: async userId => ({id:'profile-1',userId,status:'PENDING'}), saveVehicle: async v => v, availability: async () => ({status:'UNAVAILABLE'}) }, carriers: { register: async userId => ({ id: 'profile-1', userId, status: 'PENDING' }) }, requests, offers, candidates: new InMemoryMatchingCandidateRepository(), tracking: { findLiveByRequestId: async () => [] } }), health: async () => {} }, async authorization => {
      if (!authorization) throw new HttpError(401, 'Token required');
      return authorization === 'Bearer owner' ? 'client-1' : 'other-client';
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
  async function call(path: string, method = 'GET', body?: unknown, token = 'owner', extra: Record<string, string> = {}) {
    return fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  async function create() { const response = await call('/transport-requests', 'POST', input); expect(response.status).toBe(201); return response.json(); }
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
