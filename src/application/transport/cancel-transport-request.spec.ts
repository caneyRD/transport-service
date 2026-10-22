import { CancelTransportRequestHandler } from './cancel-transport-request';
import { CreateTransportRequestHandler } from './create-transport-request';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { TransportRequestStatus } from '../../domain/transport/transport-request';

describe('UC-TRA-07 Cancel transport request', () => {
  it('cancels an owned open request', async () => {
    const repository = new InMemoryTransportRequestRepository();
    await new CreateTransportRequestHandler(repository, () => 'request-1').execute({
      requesterId: 'client-1', cargo: { description: 'Arena' },
      origin: { address: 'Origen', latitude: 18.4, longitude: -69.9 }, destination: { address: 'Destino', latitude: 18.5, longitude: -70 },
      timeWindow: { startsAt: new Date('2026-10-20T08:00:00Z'), endsAt: new Date('2026-10-20T12:00:00Z') },
    });

    const result = await new CancelTransportRequestHandler(repository).execute({ requestId: 'request-1', requesterId: 'client-1' });

    expect(result.currentStatus).toBe(TransportRequestStatus.CANCELLED);
  });
});
