import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { Route } from '../../domain/transport/route';
import { Distance } from '../../domain/transport/value-objects/quantities';
import { TransportRequestRepository } from './ports/transport-request.repository';
import { GeodesicRouteProvider, RoutePoint, RouteProvider } from './ports/route-provider';

/** UC-TRA-45/09: route and ETA of a request; from the truck's last position when it is on the way. */
export class CalculateRouteHandler {
  constructor(private readonly requests: TransportRequestRepository, private readonly provider: RouteProvider = new GeodesicRouteProvider()) {}
  async execute(requestId: string, from?: RoutePoint, to: 'origin' | 'destination' = 'destination'): Promise<Route> {
    if (!requestId.trim()) throw new DomainError('Transport request id is required');
    const request = await this.requests.findById(requestId);
    if (!request) throw new DomainError(`Transport request ${requestId} was not found`);
    const plan = await this.provider.plan(from ?? request.props.origin, to === 'origin' ? request.props.origin : request.props.destination);
    return Route.create({ id: randomUUID(), origin: request.props.origin, destination: request.props.destination,
      distance: Distance.create(Math.max(plan.distanceKm, 0.001)), estimatedDurationMinutes: plan.durationMinutes,
      polyline: plan.polyline, provider: plan.provider });
  }
}
