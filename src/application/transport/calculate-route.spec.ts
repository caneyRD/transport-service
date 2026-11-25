import { CalculateRouteHandler } from './calculate-route';
import { RoutePoint, RouteProvider } from './ports/route-provider';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { TransportRequest } from '../../domain/transport/transport-request';
import { Cargo, CargoType } from '../../domain/transport/cargo';
import { Location } from '../../domain/transport/value-objects/location';
import { TimeWindow } from '../../domain/transport/value-objects/time-window';

describe('UC-TRA-45/09 route and ETA', () => {
  it('calculates a positive haversine distance and ETA', async () => {
    const repo = new InMemoryTransportRequestRepository();
    const request = TransportRequest.create({ id: 'req-route', requesterId: 'user-1',
      cargo: Cargo.create({ description: 'Carga' }),
      origin: Location.create('A', 18.48, -69.93),
      destination: Location.create('B', 18.50, -69.90),
      timeWindow: TimeWindow.create(new Date(Date.now() + 3600000), new Date(Date.now() + 7200000)) });
    request.props.cargo.selectType(CargoType.OTHER);
    await repo.save(request);
    const route = await new CalculateRouteHandler(repo).execute(request.props.id);
    expect(route.distance.value).toBeGreaterThan(0);
    expect(route.estimatedDurationMinutes).toBeGreaterThan(0);
  });

  it('uses the routing provider and, for the ETA, starts from the truck position', async () => {
    const repo = new InMemoryTransportRequestRepository();
    const request = TransportRequest.create({ id: 'req-road', requesterId: 'user-1', cargo: Cargo.create({ description: 'Carga' }),
      origin: Location.create('A', 18.48, -69.93), destination: Location.create('B', 18.56, -68.37),
      timeWindow: TimeWindow.create(new Date(Date.now() + 3600000), new Date(Date.now() + 7200000)) });
    await repo.save(request);
    const calls: Array<[RoutePoint, RoutePoint]> = [];
    const provider: RouteProvider = { plan: async (from, to) => { calls.push([from, to]); return { distanceKm: 187.4, durationMinutes: 151, polyline: 'abc', provider: 'GOOGLE_ROUTES' }; } };
    const route = await new CalculateRouteHandler(repo, provider).execute('req-road');
    expect(route).toMatchObject({ estimatedDurationMinutes: 151, polyline: 'abc', provider: 'GOOGLE_ROUTES' });
    expect(route.distance.value).toBe(187.4);
    await new CalculateRouteHandler(repo, provider).execute('req-road', { latitude: 18.5, longitude: -69 });
    expect(calls[0][0]).toMatchObject({ latitude: 18.48, longitude: -69.93 });
    expect(calls[1][0]).toEqual({ latitude: 18.5, longitude: -69 });
    expect(calls[1][1]).toMatchObject({ latitude: 18.56, longitude: -68.37 });
    // On the way to the pickup the leg ends at the origin
    await new CalculateRouteHandler(repo, provider).execute('req-road', { latitude: 18.47, longitude: -69.95 }, 'origin');
    expect(calls[2][1]).toMatchObject({ latitude: 18.48, longitude: -69.93 });
  });
});
