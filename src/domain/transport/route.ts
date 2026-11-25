import { DomainError } from '../shared/domain-error';
import { Location } from './value-objects/location';
import { Distance } from './value-objects/quantities';

export class Route {
  private constructor(
    readonly id: string,
    readonly origin: Location,
    readonly destination: Location,
    readonly distance: Distance,
    readonly estimatedDurationMinutes: number,
    /** Google encoded polyline of the road path, when a routing provider returned one. */
    readonly polyline?: string,
    readonly provider: 'GOOGLE_ROUTES' | 'GEODESIC_ESTIMATE' = 'GEODESIC_ESTIMATE',
  ) {}

  static create(props: {
    id: string;
    origin: Location;
    destination: Location;
    distance: Distance;
    estimatedDurationMinutes: number;
    polyline?: string;
    provider?: 'GOOGLE_ROUTES' | 'GEODESIC_ESTIMATE';
  }): Route {
    if (!props.id.trim()) throw new DomainError('Route id is required');
    if (!Number.isInteger(props.estimatedDurationMinutes) || props.estimatedDurationMinutes <= 0) {
      throw new DomainError('Estimated route duration must be a positive integer');
    }
    return new Route(props.id, props.origin, props.destination, props.distance, props.estimatedDurationMinutes, props.polyline, props.provider ?? 'GEODESIC_ESTIMATE');
  }
}
