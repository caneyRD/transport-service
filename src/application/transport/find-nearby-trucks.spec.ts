import { MatchingCandidate } from '../../domain/transport/matching-candidate';
import { InMemoryMatchingCandidateRepository } from '../../infrastructure/in-memory/matching-candidate-in-memory.repository';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { CreateTransportRequestHandler } from './create-transport-request';
import { FindNearbyTrucksHandler } from './find-nearby-trucks';

describe('UC-TRA-03 Find nearby trucks', () => {
  it('returns candidates ordered by distance and can apply a distance limit', async () => {
    const requests = new InMemoryTransportRequestRepository();
    const create = new CreateTransportRequestHandler(requests, () => 'request-1');
    await create.execute({
      requesterId: 'user-1',
      cargo: { description: 'Construction materials', weightKg: 500 },
      origin: { address: 'Santo Domingo', latitude: 18.48, longitude: -69.93 },
      destination: { address: 'Baní', latitude: 18.28, longitude: -70.33 },
      timeWindow: { startsAt: new Date('2026-10-20T08:00:00Z'), endsAt: new Date('2026-10-20T12:00:00Z') },
    });
    const candidates = new InMemoryMatchingCandidateRepository([
      MatchingCandidate.create({ id: 'candidate-1', requestId: 'request-1', carrierId: 'carrier-1', vehicleId: 'vehicle-1', score: 0.8, distanceKm: 12 }),
      MatchingCandidate.create({ id: 'candidate-2', requestId: 'request-1', carrierId: 'carrier-2', vehicleId: 'vehicle-2', score: 0.9, distanceKm: 5 }),
      MatchingCandidate.create({ id: 'candidate-3', requestId: 'request-1', carrierId: 'carrier-3', vehicleId: 'vehicle-3', score: 0.95, distanceKm: 40 }),
    ]);
    const find = new FindNearbyTrucksHandler(requests, candidates);

    const result = await find.execute({ requestId: 'request-1', maxDistanceKm: 15 });

    expect(result.map((candidate) => candidate.id)).toEqual(['candidate-2', 'candidate-1']);
  });

  it('rejects a missing request', async () => {
    const find = new FindNearbyTrucksHandler(
      new InMemoryTransportRequestRepository(),
      new InMemoryMatchingCandidateRepository(),
    );
    await expect(find.execute({ requestId: 'missing' })).rejects.toThrow('was not found');
  });
});
