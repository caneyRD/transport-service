import { CargoType } from '../../domain/transport/cargo';
import { TransportRequestStatus } from '../../domain/transport/transport-request';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { CreateTransportRequestHandler } from './create-transport-request';
import { SelectCargoTypeHandler } from './select-cargo-type';

describe('UC-TRA-02 Select cargo type', () => {
  it('selects a cargo type on an open request', async () => {
    const repository = new InMemoryTransportRequestRepository();
    const create = new CreateTransportRequestHandler(repository, () => 'request-1');
    const select = new SelectCargoTypeHandler(repository);
    const request = await create.execute({
      requesterId: 'user-1',
      cargo: { description: 'Construction materials', weightKg: 500 },
      origin: { address: 'Santo Domingo', latitude: 18.48, longitude: -69.93 },
      destination: { address: 'Baní', latitude: 18.28, longitude: -70.33 },
      timeWindow: { startsAt: new Date('2026-10-20T08:00:00Z'), endsAt: new Date('2026-10-20T12:00:00Z') },
    });

    const result = await select.execute({ requestId: 'request-1', type: CargoType.MATERIALS });

    expect(result.currentStatus).toBe(TransportRequestStatus.OPEN);
    expect(result.props.cargo.cargoType).toBe(CargoType.MATERIALS);
    expect((await repository.findById('request-1'))?.props.cargo.cargoType).toBe(CargoType.MATERIALS);
  });

  it('rejects selecting a type for a missing request', async () => {
    const select = new SelectCargoTypeHandler(new InMemoryTransportRequestRepository());
    await expect(select.execute({ requestId: 'missing', type: CargoType.MACHINERY })).rejects.toThrow('was not found');
  });
});
