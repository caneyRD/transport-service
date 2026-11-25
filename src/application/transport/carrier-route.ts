import { DomainError } from '../../domain/shared/domain-error';
import { TransportRequestStatus } from '../../domain/transport/transport-request';
import { CarrierRequestRepository } from './carrier-requests';
import { FleetRepository } from './manage-fleet';
import { GeodesicRouteProvider, RoutePlan, RoutePoint, RouteProvider } from './ports/route-provider';
import { TransportRequestRepository } from './ports/transport-request.repository';

const OPEN = [TransportRequestStatus.OPEN, TransportRequestStatus.MATCHING, TransportRequestStatus.OFFERED];
/** Trip states in which the truck still has to reach the pickup (null: assigned, no trip yet). */
const TO_PICKUP = [null, 'programado', 'hacia_origen', 'en_origen'];

const leg = (plan: RoutePlan) => ({ distanceKm: plan.distanceKm, estimatedDurationMinutes: plan.durationMinutes, provider: plan.provider, polyline: plan.polyline });

/**
 * Routes on the carrier's map (InDrive-like): from the carrier's GPS to the pickup, and from the pickup to the
 * destination. Open requests can be previewed by any enabled carrier; the ETA is for the assigned carrier.
 */
export class CarrierRouteHandler {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly requests: TransportRequestRepository,
    private readonly carrierRequests: CarrierRequestRepository,
    private readonly routes: RouteProvider = new GeodesicRouteProvider(),
  ) {}

  private async access(userId: string, requestId: string) {
    const profile = await this.fleet.verification(userId);
    if (profile?.status !== 'ENABLED') throw new DomainError('Only an enabled carrier can see request routes');
    const request = await this.requests.findById(requestId);
    if (!request) throw new DomainError(`Transport request ${requestId} was not found`);
    const tripState = await this.carrierRequests.assignedTripState?.(userId, requestId);
    return { request, tripState, open: OPEN.includes(request.currentStatus) };
  }

  /** Pickup → destination, plus my position → pickup when the carrier sends its GPS. */
  async preview(userId: string, requestId: string, from?: RoutePoint) {
    const { request, tripState, open } = await this.access(userId, requestId);
    if (!open && tripState === undefined) throw new DomainError('Only the assigned carrier can see this route');
    const { origin, destination } = request.props;
    const [main, toPickup] = await Promise.all([this.routes.plan(origin, destination), from ? this.routes.plan(from, origin) : Promise.resolve(undefined)]);
    return { origin, destination, ...leg(main), ...(toPickup ? { toPickup: leg(toPickup) } : {}) };
  }

  /** Assigned carrier: from its position to the pickup until loaded, then to the destination. */
  async eta(userId: string, requestId: string, from?: RoutePoint) {
    const { request, tripState } = await this.access(userId, requestId);
    if (tripState === undefined) throw new DomainError('Only the assigned carrier can see the trip ETA');
    const toPickup = TO_PICKUP.includes(tripState);
    const { origin, destination } = request.props;
    const plan = from ? await this.routes.plan(from, toPickup ? origin : destination) : await this.routes.plan(origin, destination);
    return { ...leg(plan), from: from ? 'TRUCK' : 'ORIGIN', leg: from && toPickup ? 'PICKUP' : 'DELIVERY', calculatedAt: new Date().toISOString() };
  }
}
