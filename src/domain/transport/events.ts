import { DomainEvent } from '../shared/aggregate-root';
import { randomUUID } from 'node:crypto';

export type TransportDomainEvent = DomainEvent & {
  readonly type:
    | 'TransportRequestCreated'
    | 'TransportRequestOpened'
    | 'TransportMatchingStarted'
    | 'TransportRequestOffered'
    | 'TransportRequestCancelled'
    | 'TransportRequestAssignmentReleased'
    | 'TransportOfferSubmitted'
    | 'TransportOfferAccepted'
    | 'TransportOfferRejected'
    | 'TransportOfferWithdrawn'
    | 'TransportOfferCountered'
    | 'TransportOfferExpired'
    | 'TransportAssigned'
    | 'TripStarted'
    | 'TripCompleted'
    | 'TripCancelled'
    | 'TransportRequestInProgress'
    | 'TransportRequestCompleted'
    | 'TrackingUpdated';
};

export function transportEvent(
  type: TransportDomainEvent['type'],
  aggregateId: string,
  aggregateType: string,
  version: number,
  correlationId = aggregateId,
  data: Record<string, unknown> = {},
): TransportDomainEvent {
  return {
    type,
    eventId: randomUUID(),
    occurredAt: new Date(),
    aggregateId,
    aggregateType,
    version,
    correlationId,
    schemaVersion: 1,
    payload: data,
  };
}
