import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { Route } from '../../domain/transport/route';
import { Distance } from '../../domain/transport/value-objects/quantities';
import { TransportRequestRepository } from './ports/transport-request.repository';

const EARTH_RADIUS_KM = 6371;
function haversine(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export class CalculateRouteHandler {
  constructor(private readonly requests: TransportRequestRepository) {}
  async execute(requestId: string): Promise<Route> {
    if (!requestId.trim()) throw new DomainError('Transport request id is required');
    const request = await this.requests.findById(requestId);
    if (!request) throw new DomainError(`Transport request ${requestId} was not found`);
    const distanceKm = haversine(request.props.origin, request.props.destination);
    const distance = Math.max(distanceKm, 0.001);
    const duration = Math.max(1, Math.ceil(distance / 40 * 60));
    return Route.create({ id: randomUUID(), origin: request.props.origin, destination: request.props.destination,
      distance: Distance.create(Number(distance.toFixed(3))), estimatedDurationMinutes: duration });
  }
}
