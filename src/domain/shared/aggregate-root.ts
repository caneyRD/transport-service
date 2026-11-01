export interface DomainEvent {
  readonly type: string;
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly correlationId: string;
  readonly schemaVersion: number;
  readonly payload: Readonly<Record<string, unknown>>;
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

  peekDomainEvents(): readonly DomainEvent[] {
    return [...this.events];
  }

  protected restoreVersion(version: number): void {
    if (!Number.isInteger(version) || version < 0) throw new Error('Invalid aggregate version');
    this.version = version;
  }

  get currentVersion(): number {
    return this.version;
  }
}
