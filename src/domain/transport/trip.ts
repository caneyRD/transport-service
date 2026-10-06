import { DomainError } from '../shared/domain-error';
import { AggregateRoot } from '../shared/aggregate-root';
import { Assignment, AssignmentStatus } from './assignment';
import { TrackingPoint } from './tracking-point';
import { transportEvent } from './events';

export enum TripStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class Trip extends AggregateRoot {
  private status = TripStatus.PLANNED;
  private readonly trackingPoints: TrackingPoint[] = [];

  private constructor(
    readonly id: string,
    readonly requestId: string,
    readonly assignmentId: string,
    readonly routeId?: string,
  ) { super(); }

  static create(props: { id: string; requestId: string; assignment: Assignment; routeId?: string }): Trip {
    if (!props.id.trim() || !props.requestId.trim()) throw new DomainError('Trip id and request id are required');
    if (props.assignment.currentStatus !== AssignmentStatus.ACTIVE) throw new DomainError('Trip requires an active assignment');
    if (props.assignment.requestId !== props.requestId) throw new DomainError('Assignment does not belong to the request');
    return new Trip(props.id, props.requestId, props.assignment.id, props.routeId);
  }

  get currentStatus(): TripStatus { return this.status; }
  start(): void {
    if (this.status !== TripStatus.PLANNED) throw new DomainError('Only a planned trip can start');
    this.status = TripStatus.IN_PROGRESS;
  }
  complete(): void {
    if (this.status !== TripStatus.IN_PROGRESS) throw new DomainError('Only an in-progress trip can complete');
    this.status = TripStatus.COMPLETED;
  }

  recordTrackingPoint(point: TrackingPoint): void {
    if (this.status !== TripStatus.IN_PROGRESS) throw new DomainError('Tracking requires an in-progress trip');
    if (point.tripId !== this.id) throw new DomainError('Tracking point does not belong to the trip');
    const previous = this.trackingPoints[this.trackingPoints.length - 1];
    if (previous && point.recordedAt < previous.recordedAt) throw new DomainError('Tracking points must be chronological');
    this.trackingPoints.push(point);
    this.addDomainEvent(transportEvent('TrackingUpdated', this.id, 'Trip', this.currentVersion + 1, this.id, {
      trackingPointId: point.id,
      latitude: point.location.latitude,
      longitude: point.location.longitude,
    }));
  }

  get tracking(): readonly TrackingPoint[] { return this.trackingPoints; }
  cancel(): void {
    if (this.status === TripStatus.COMPLETED || this.status === TripStatus.CANCELLED) throw new DomainError('Trip cannot be cancelled in its current state');
    this.status = TripStatus.CANCELLED;
  }
}
