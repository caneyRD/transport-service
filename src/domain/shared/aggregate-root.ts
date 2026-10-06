export interface DomainEvent {
  readonly type?: string;
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly correlationId: string;
}

export abstract class AggregateRoot {
  private readonly events: DomainEvent[] = [];
  private version = 0;

  protected addDomainEvent(event: DomainEvent): void {
    this.events.push(event);
    this.version = event.version;
  }

  pullDomainEvents(): DomainEvent[] {
    return this.events.splice(0);
  }

  get currentVersion(): number {
    return this.version;
  }
}
