import { CalculateRouteHandler } from './calculate-route';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { TransportRequest } from '../../domain/transport/transport-request';
import { Cargo } from '../../domain/transport/cargo';
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
    request.props.cargo.selectType('OTHER');
    await repo.save(request);
    const route = await new CalculateRouteHandler(repo).execute(request.props.id);
    expect(route.distance.value).toBeGreaterThan(0);
    expect(route.estimatedDurationMinutes).toBeGreaterThan(0);
  });
});
