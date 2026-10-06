import { DomainError } from '../shared/domain-error';

export enum TransportExceptionType {
  DELAY = 'DELAY',
  DAMAGE = 'DAMAGE',
  BREAKDOWN = 'BREAKDOWN',
  ROUTE_DEVIATION = 'ROUTE_DEVIATION',
  OTHER = 'OTHER',
}

export class TransportException {
  private constructor(
    readonly id: string,
    readonly tripId: string,
    readonly type: TransportExceptionType,
    readonly description: string,
    readonly occurredAt: Date,
  ) {}

  static create(props: { id: string; tripId: string; type: TransportExceptionType; description: string; occurredAt?: Date }): TransportException {
    if (!props.id.trim() || !props.tripId.trim()) throw new DomainError('Exception id and trip id are required');
    if (!props.description.trim()) throw new DomainError('Exception description is required');
    return new TransportException(props.id, props.tripId, props.type, props.description.trim(), props.occurredAt ?? new Date());
  }
}
