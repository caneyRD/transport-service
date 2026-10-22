import { DomainEvent } from '../../domain/shared/aggregate-root';
import { DomainError } from '../../domain/shared/domain-error';
import { TransportDomainOutbox } from '../../application/transport/ports/transport-domain-outbox';

export class InMemoryTransportDomainOutbox implements TransportDomainOutbox {
  private readonly events: DomainEvent[] = [];
  private readonly keys = new Set<string>();

  async append(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      const key = `${event.aggregateType}:${event.aggregateId}:${event.version}`;
      if (this.keys.has(key)) throw new DomainError(`Duplicate outbox event: ${key}`);
      if (events.some((candidate) => candidate !== event && `${candidate.aggregateType}:${candidate.aggregateId}:${candidate.version}` === key)) {
        throw new DomainError(`Duplicate outbox event: ${key}`);
      }
    }
    for (const event of events) {
      const key = `${event.aggregateType}:${event.aggregateId}:${event.version}`;
      this.keys.add(key);
      this.events.push(event);
    }
  }

  async pending(): Promise<DomainEvent[]> {
    return [...this.events];
  }
}
