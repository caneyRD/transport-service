import { DomainError } from '../../domain/shared/domain-error';

export class InMemoryProcessedEvents {
  private readonly processed = new Set<string>();

  markProcessed(consumer: string, eventId: string): boolean {
    if (!consumer.trim() || !eventId.trim()) throw new DomainError('Consumer and event id are required');
    const key = `${consumer}:${eventId}`;
    if (this.processed.has(key)) return false;
    this.processed.add(key);
    return true;
  }
}
