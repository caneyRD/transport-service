export interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly correlationId: string;
}

export abstract class AggregateRoot {
  private readonly events: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    return this.events.splice(0);
  }
}
