import { FleetRepository, ManageFleetHandler } from '../application/transport/manage-fleet';
import { VehicleBodyType, VehicleCapacityUnit } from '../domain/transport/vehicle';
import { CarrierRepository, RegisterCarrierHandler } from '../application/transport/register-carrier';
import { createServer, IncomingMessage } from 'node:http';
import { CreateTransportRequestHandler } from '../application/transport/create-transport-request';
import { SelectCargoTypeHandler } from '../application/transport/select-cargo-type';
import { FindNearbyTrucksHandler } from '../application/transport/find-nearby-trucks';
import { CalculateRouteHandler } from '../application/transport/calculate-route';
import { ViewReceivedOffersHandler } from '../application/transport/view-received-offers';
import { AcceptOfferHandler } from '../application/transport/accept-offer';
import { CounterOfferHandler } from '../application/transport/counter-offer';
import { CancelTransportRequestHandler } from '../application/transport/cancel-transport-request';
import { ExpireOffersHandler } from '../application/transport/expire-offers';
import { TransportRequestRepository } from '../application/transport/ports/transport-request.repository';
import { TransportOfferRepository } from '../application/transport/ports/transport-offer.repository';
import { MatchingCandidateRepository } from '../application/transport/ports/matching-candidate.repository';
import { DomainError } from '../domain/shared/domain-error';
import { TransportRequest } from '../domain/transport/transport-request';
import { TransportOffer } from '../domain/transport/transport-offer';
import { CargoType } from '../domain/transport/cargo';
import { Authenticate, HttpError } from './auth';

export interface Repositories {
  fleet: FleetRepository;
  carriers: CarrierRepository;
  requests: TransportRequestRepository;
  offers: TransportOfferRepository;
  candidates: MatchingCandidateRepository;
  tracking: { findLiveByRequestId(requestId: string): Promise<unknown[]> };
}
export interface TransportStore {
  execute<T>(action: (repositories: Repositories) => Promise<T>): Promise<T>;
  health(): Promise<void>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Expected a JSON object');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new HttpError(400, `${name} must be a nonempty string (maximum 2000 characters)`);
  return value;
}
function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, `${name} must be a finite number`);
  return value;
}
function date(value: unknown, name: string): Date {
  const result = new Date(text(value, name));
  if (!Number.isFinite(result.getTime())) throw new HttpError(400, `${name} must be a valid date`);
  return result;
}
function location(value: unknown) {
  const body = object(value);
  return { address: text(body.address, 'address'), latitude: number(body.latitude, 'latitude'), longitude: number(body.longitude, 'longitude') };
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, 'Request body exceeds 64 KiB');
    chunks.push(Buffer.from(chunk));
  }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { throw new HttpError(400, 'Invalid JSON object'); }
}
export function requestDto(request: TransportRequest) {
  return {
    id: request.props.id, requesterId: request.props.requesterId, status: request.currentStatus,
    assignmentId: request.currentAssignmentId, version: request.currentVersion,
    cargo: { description: request.props.cargo.description, type: request.props.cargo.cargoType,
      weightKg: request.props.cargo.weight?.value, volumeM3: request.props.cargo.volume?.value },
    origin: request.props.origin, destination: request.props.destination, timeWindow: request.props.timeWindow,
  };
}
export function offerDto(offer: TransportOffer) {
  return { id: offer.id, requestId: offer.requestId, carrierId: offer.carrierId, vehicleId: offer.vehicleId,
    price: offer.price, validUntil: offer.validUntil, status: offer.currentStatus,
    parentOfferId: offer.parentOfferId, proposedBy: offer.proposedBy, round: offer.round };
}

export function createTransportServer(store: TransportStore, authenticate: Authenticate) {
  return createServer(async (request, response) => {
    const send = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        try { await store.health(); send(200, { service: 'transport-service', status: 'ok', database: 'connected' }); }
        catch { send(503, { service: 'transport-service', status: 'unavailable', database: 'disconnected' }); }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/') {
        send(200, { service: 'transport-service', message: 'Backend de Transporte BANEY activo' }); return;
      }
      const requesterId = await authenticate(request.headers.authorization);
      if (url.pathname === '/carriers/me' && request.method === 'POST') {
        await readBody(request);
        const carrier = await store.execute(({ carriers }) => new RegisterCarrierHandler(carriers).execute(requesterId));
        send(200, carrier); return;
      }
      const fleetParts = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/carriers/me/verification' && request.method === 'GET') {
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).verification(requesterId))); return;
      }
      if (url.pathname === '/carriers/me/availability' && request.method === 'PUT') {
        const body=await readBody(request);
        if (typeof body.available !== 'boolean') throw new HttpError(400,'available must be boolean');
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).availability(requesterId,body.available as boolean,date(body.startsAt,'startsAt'),date(body.endsAt,'endsAt')))); return;
      }
      if (fleetParts[0] === 'vehicles' && ((fleetParts.length === 1 && request.method === 'POST') || (fleetParts.length === 2 && request.method === 'PUT'))) {
        const body=await readBody(request);
        const data=await store.execute(({fleet}) => new ManageFleetHandler(fleet).vehicle(requesterId, {
          registrationNumber:text(body.registrationNumber,'registrationNumber'),bodyType:text(body.bodyType,'bodyType') as VehicleBodyType,
          capacityValue:number(body.capacityValue,'capacityValue'),capacityUnit:text(body.capacityUnit,'capacityUnit') as VehicleCapacityUnit,
          capacityKg:number(body.capacityKg,'capacityKg') },fleetParts[1]));
        send(fleetParts.length === 1 ? 201 : 200,data); return;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'transport-requests') throw new HttpError(404, 'Route not found');
      const body = ['POST', 'PATCH'].includes(request.method ?? '') ? await readBody(request) : {};
      const result = await store.execute(async ({ requests, offers, candidates, tracking }) => {
        if (parts.length === 1 && request.method === 'POST') {
          const cargo = object(body.cargo), window = object(body.timeWindow);
          const key = request.headers['idempotency-key'];
          const created = await new CreateTransportRequestHandler(requests).execute({
            requesterId, idempotencyKey: key === undefined ? undefined : text(key, 'Idempotency-Key'),
            cargo: { description: text(cargo.description, 'cargo.description'),
              weightKg: cargo.weightKg === undefined ? undefined : number(cargo.weightKg, 'weightKg'),
              volumeM3: cargo.volumeM3 === undefined ? undefined : number(cargo.volumeM3, 'volumeM3') },
            origin: location(body.origin), destination: location(body.destination),
            timeWindow: { startsAt: date(window.startsAt, 'startsAt'), endsAt: date(window.endsAt, 'endsAt') },
          });
          return { status: 201, data: requestDto(created) };
        }
        if (parts.length < 2) throw new HttpError(404, 'Route not found');
        const requestId = parts[1];
        const owned = await requests.findById(requestId);
        if (!owned) throw new HttpError(404, 'Transport request was not found');
        if (owned.props.requesterId !== requesterId) throw new HttpError(403, 'Only the request owner can access this request');
        if (parts.length === 2 && request.method === 'GET') return { status: 200, data: requestDto(owned) };
        if (parts.length === 3 && parts[2] === 'cargo-type' && request.method === 'PATCH') {
          const type = text(body.type, 'type') as CargoType;
          return { status: 200, data: requestDto(await new SelectCargoTypeHandler(requests).execute({ requestId, type })) };
        }
        if (parts.length === 3 && parts[2] === 'nearby-trucks' && request.method === 'GET') {
          const rawDistance = url.searchParams.get('maxDistanceKm');
          const maxDistanceKm = rawDistance === null ? undefined : number(rawDistance.trim() === '' ? NaN : Number(rawDistance), 'maxDistanceKm');
          const data = await new FindNearbyTrucksHandler(requests, candidates).execute({ requestId, maxDistanceKm });
          return { status: 200, data };
        }
        if (parts.length === 3 && (parts[2] === 'compatible-trucks' || parts[2] === 'matching-candidates') && request.method === 'GET') {
          const data = await new FindNearbyTrucksHandler(requests, candidates).execute({ requestId });
          return { status: 200, data };
        }
        if (parts.length === 3 && (parts[2] === 'route' || parts[2] === 'eta') && request.method === 'GET') {
          const route = await new CalculateRouteHandler(requests).execute(requestId);
          return { status: 200, data: { routeId: route.id, distanceKm: route.distance.value,
            estimatedDurationMinutes: route.estimatedDurationMinutes, calculatedAt: new Date().toISOString() } };
        }
        if (parts.length === 3 && parts[2] === 'tracking' && request.method === 'GET') {
          return { status: 200, data: await tracking.findLiveByRequestId(requestId) };
        }
        if (parts.length === 3 && parts[2] === 'offers' && request.method === 'GET') {
          const data = await new ViewReceivedOffersHandler(requests, offers).execute({ requestId, requesterId });
          return { status: 200, data: data.map(offerDto) };
        }
        if (parts.length === 4 && parts[2] === 'offers' && parts[3] === 'expire' && request.method === 'POST') {
          return { status: 200, data: (await new ExpireOffersHandler(offers).execute(requestId)).map(offerDto) };
        }
        if (parts.length === 5 && parts[2] === 'offers' && request.method === 'POST') {
          const offerId = parts[3];
          if (parts[4] === 'accept') {
            const accepted = await new AcceptOfferHandler(requests, offers).execute({ requestId, requesterId, offerId });
            return { status: 200, data: { request: requestDto(accepted.request), offer: offerDto(accepted.offer) } };
          }
          if (parts[4] === 'counter') {
            const counter = await new CounterOfferHandler(requests, offers).execute({ requestId, requesterId, offerId,
              amount: number(body.amount, 'amount'), currency: text(body.currency, 'currency'), validUntil: date(body.validUntil, 'validUntil') });
            return { status: 201, data: offerDto(counter) };
          }
        }
        if (parts.length === 3 && parts[2] === 'cancel' && request.method === 'POST') {
          return { status: 200, data: requestDto(await new CancelTransportRequestHandler(requests).execute({ requestId, requesterId })) };
        }
        throw new HttpError(404, 'Route not found');
      });
      send(result.status, result.data);
    } catch (error) {
      if (error instanceof HttpError) send(error.status, { message: error.message });
      else if (error instanceof DomainError) send(/concurrent|transition|already|Only|Expired/.test(error.message) ? 409 : 400, { message: error.message });
      else {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === '22P02') send(400, { message: 'Invalid identifier or value' });
        else if (code === '23505' || code === '40001' || code === '40P01') send(409, { message: 'Concurrent update; retry the request' });
        else send(500, { message: 'Internal server error' });
      }
    }
  });
}
