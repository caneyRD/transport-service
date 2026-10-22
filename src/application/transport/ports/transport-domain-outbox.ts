import { DomainEvent } from '../../../domain/shared/aggregate-root';

export interface TransportDomainOutbox {
  append(events: readonly DomainEvent[]): Promise<void>;
  pending(): Promise<DomainEvent[]>;
}
