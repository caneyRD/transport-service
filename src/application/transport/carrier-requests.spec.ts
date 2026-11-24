import { CarrierRequestsHandler, CarrierRequestRepository } from './carrier-requests';
import { FleetRepository } from './manage-fleet';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { InMemoryTransportOfferRepository } from '../../infrastructure/in-memory/transport-offer-in-memory.repository';
import { CreateTransportRequestHandler } from './create-transport-request';

describe('Carrier requests (see and offer)', () => {
  const status = { value: 'ENABLED' as 'ENABLED' | 'PENDING' };
  const fleet: FleetRepository = { verification: jest.fn(async userId => ({ id: 'p', userId, status: status.value })), saveVehicle: jest.fn(), availability: jest.fn(),
    updateLocation: jest.fn(), nearby: jest.fn(), currentAvailability: jest.fn() };
  let requests: InMemoryTransportRequestRepository, offers: InMemoryTransportOfferRepository, handler: CarrierRequestsHandler;
  const repo: CarrierRequestRepository = { openNear: jest.fn(async () => []), enabledVehicle: jest.fn(async () => 'veh-1'), offersOf: jest.fn(async () => []) };
  const now = new Date('2030-01-01T12:00:00Z');
  async function newRequest(requesterId = 'client-1') {
    return new CreateTransportRequestHandler(requests).execute({ requesterId, cargo: { description: 'Grava', weightKg: 1000 },
      origin: { address: 'A', latitude: 18.4, longitude: -69.9 }, destination: { address: 'B', latitude: 18.5, longitude: -70 },
      timeWindow: { startsAt: new Date('2031-01-01T10:00:00Z'), endsAt: new Date('2031-01-01T12:00:00Z') } });
  }
  beforeEach(() => {
    status.value = 'ENABLED';
    requests = new InMemoryTransportRequestRepository(); offers = new InMemoryTransportOfferRepository();
    handler = new CarrierRequestsHandler(fleet, requests, offers, repo);
    jest.clearAllMocks();
  });

  it('validates the open-requests search and requires an enabled carrier', async () => {
    await handler.open('carrier', 18.4, -69.9);
    expect(repo.openNear).toHaveBeenCalledWith({ carrierUserId: 'carrier', latitude: 18.4, longitude: -69.9, radiusKm: 30, limit: 30 });
    await expect(handler.open('carrier', 95, -69.9)).rejects.toThrow('Latitude');
    await expect(handler.open('carrier', 18, -69, 0)).rejects.toThrow('Radius');
    await expect(handler.open('carrier', 18, -69, 101)).rejects.toThrow('Radius');
    status.value = 'PENDING';
    await expect(handler.open('carrier', 18.4, -69.9)).rejects.toThrow('enabled');
  });

  it('submits an offer with the carrier vehicle and marks the request as offered', async () => {
    const request = await newRequest();
    const offer = await handler.offer('carrier', request.props.id, { amount: 4500.555 }, now);
    expect(offer).toMatchObject({ carrierId: 'carrier', vehicleId: 'veh-1', requestId: request.props.id });
    expect(offer.price).toMatchObject({ amount: 4500.56, currency: 'DOP' });
    expect(offer.currentStatus).toBe('SUBMITTED');
    expect(offer.validUntil.getTime()).toBe(now.getTime() + 24 * 3600_000);
    expect((await requests.findById(request.props.id))!.currentStatus).toBe('OFFERED');
    // A second carrier can still offer on an OFFERED request
    await handler.offer('carrier-2', request.props.id, { amount: 4000 }, now);
    expect((await offers.findByRequestId(request.props.id))).toHaveLength(2);
  });

  it('rejects duplicate, own-request, invalid and vehicle-less offers', async () => {
    const request = await newRequest();
    await handler.offer('carrier', request.props.id, { amount: 3000 }, now);
    await expect(handler.offer('carrier', request.props.id, { amount: 2800 }, now)).rejects.toThrow('already');
    await expect(handler.offer('client-1', request.props.id, { amount: 3000 }, now)).rejects.toThrow('own request');
    await expect(handler.offer('carrier-3', request.props.id, { amount: 0 }, now)).rejects.toThrow('amount');
    await expect(handler.offer('carrier-3', request.props.id, { amount: 100, validUntil: new Date(now.getTime() + 8 * 86400_000) }, now)).rejects.toThrow('7 days');
    await expect(handler.offer('carrier-3', 'missing', { amount: 100 }, now)).rejects.toThrow('not found');
    (repo.enabledVehicle as jest.Mock).mockResolvedValueOnce(undefined);
    await expect(handler.offer('carrier-3', request.props.id, { amount: 100 }, now)).rejects.toThrow('vehicle');
  });

  it('does not accept offers on cancelled requests', async () => {
    const request = await newRequest();
    request.cancel(); await requests.save(request);
    await expect(handler.offer('carrier', request.props.id, { amount: 100 }, now)).rejects.toThrow('not available');
  });
});
