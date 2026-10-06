import { DomainEvent } from '../shared/aggregate-root';

export type TransportDomainEvent = DomainEvent & {
  readonly type:
    | 'TransportRequestCreated'
    | 'TransportOfferSubmitted'
    | 'TransportAssigned'
    | 'TripStarted'
    | 'TripCompleted'
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
    eventId: crypto.randomUUID(),
    occurredAt: new Date(),
    aggregateId,
    aggregateType,
    version,
    correlationId,
    ...data,
  };
}
