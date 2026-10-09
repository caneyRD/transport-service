import { DomainError } from '../../domain/shared/domain-error';
import { TransportRequestStatus } from '../../domain/transport/transport-request';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { CreateTransportRequestHandler } from './create-transport-request';

describe('UC-TRA-01 Create transport request', () => {
  const command = {
    requesterId: 'user-1',
    cargo: { description: 'Construction materials', weightKg: 500 },
    origin: { address: 'Santo Domingo', latitude: 18.48, longitude: -69.93 },
    destination: { address: 'Baní', latitude: 18.28, longitude: -70.33 },
    timeWindow: {
      startsAt: new Date('2026-10-20T08:00:00Z'),
      endsAt: new Date('2026-10-20T12:00:00Z'),
    },
  };

  it('creates and stores an open request without a database', async () => {
    const repository = new InMemoryTransportRequestRepository();
    const handler = new CreateTransportRequestHandler(repository, () => 'request-1');

    const result = await handler.execute(command);

    expect(result.currentStatus).toBe(TransportRequestStatus.OPEN);
    expect(result.props.requesterId).toBe('user-1');
    expect(await repository.findById('request-1')).toBe(result);
    expect(result.pullDomainEvents().map((event) => event.type)).toEqual(['TransportRequestCreated']);
  });

  it('rejects invalid input through the domain rules', async () => {
    const handler = new CreateTransportRequestHandler(new InMemoryTransportRequestRepository(), () => 'request-1');

    await expect(handler.execute({ ...command, cargo: { description: '', weightKg: 500 } })).rejects.toThrow(DomainError);
    await expect(handler.execute({ ...command, origin: { ...command.origin, latitude: 100 } })).rejects.toThrow(DomainError);
  });
});
