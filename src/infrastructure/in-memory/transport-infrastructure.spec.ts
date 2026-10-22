import { InMemoryProcessedEvents } from './processed-events-in-memory';
import { InMemoryTransportDomainOutbox } from './transport-domain-outbox-in-memory';
import { InMemoryTransportRequestRepository } from './transport-request-in-memory.repository';
import { TransportRequest } from '../../domain/transport/transport-request';
import { Cargo } from '../../domain/transport/cargo';
import { Location } from '../../domain/transport/value-objects/location';
import { TimeWindow } from '../../domain/transport/value-objects/time-window';
import { DomainError } from '../../domain/shared/domain-error';

describe('Transport infrastructure safeguards', () => {
  it('rejects stale optimistic writes', async () => {
    const repository = new InMemoryTransportRequestRepository();
    const request = TransportRequest.create({
      id: 'request-1',
      requesterId: 'user-1',
      cargo: Cargo.create({ description: 'Arena' }),
      origin: Location.create('Origen', 18.4, -69.9),
      destination: Location.create('Destino', 18.5, -70),
      timeWindow: TimeWindow.create(new Date('2026-10-20T08:00:00Z'), new Date('2026-10-20T12:00:00Z')),
    });
    await repository.save(request);
    await repository.save(request, 1);
    await expect(repository.save(request, 1)).rejects.toThrow(DomainError);
  });

  it('keeps outbox events unique by aggregate and version', async () => {
    const outbox = new InMemoryTransportDomainOutbox();
    const event = TransportRequest.create({
      id: 'request-2',
      requesterId: 'user-1',
      cargo: Cargo.create({ description: 'Arena' }),
      origin: Location.create('Origen', 18.4, -69.9),
      destination: Location.create('Destino', 18.5, -70),
      timeWindow: TimeWindow.create(new Date('2026-10-20T08:00:00Z'), new Date('2026-10-20T12:00:00Z')),
    }).pullDomainEvents()[0];
    await outbox.append([event]);
    await expect(outbox.append([event])).rejects.toThrow('Duplicate outbox event');
  });

  it('processes an event only once per consumer', () => {
    const processed = new InMemoryProcessedEvents();
    expect(processed.markProcessed('notifications', 'event-1')).toBe(true);
    expect(processed.markProcessed('notifications', 'event-1')).toBe(false);
    expect(processed.markProcessed('payments', 'event-1')).toBe(true);
  });
});
