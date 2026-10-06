import { DomainError } from '../shared/domain-error';
import { Location } from './value-objects/location';

export class TrackingPoint {
  private constructor(
    readonly id: string,
    readonly tripId: string,
    readonly location: Location,
    readonly recordedAt: Date,
  ) {}

  static create(props: { id: string; tripId: string; location: Location; recordedAt?: Date }): TrackingPoint {
    if (!props.id.trim() || !props.tripId.trim()) throw new DomainError('Tracking point id and trip id are required');
    return new TrackingPoint(props.id, props.tripId, props.location, props.recordedAt ?? new Date());
  }
}
