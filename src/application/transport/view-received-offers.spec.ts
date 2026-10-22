import { ViewReceivedOffersHandler } from './view-received-offers';
import { CreateTransportRequestHandler } from './create-transport-request';
import { InMemoryTransportOfferRepository } from '../../infrastructure/in-memory/transport-offer-in-memory.repository';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { Money } from '../../domain/transport/value-objects/money';
import { TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';
import { DomainError } from '../../domain/shared/domain-error';

describe('UC-TRA-04 View received offers', () => {
  afterEach(() => jest.useRealTimers());

  const createRequest = async (repository: InMemoryTransportRequestRepository) => new CreateTransportRequestHandler(repository, () => 'request-1').execute({
    requesterId: 'client-1',
    cargo: { description: 'Arena' },
    origin: { address: 'Origen', latitude: 18.4, longitude: -69.9 },
    destination: { address: 'Destino', latitude: 18.5, longitude: -70 },
    timeWindow: { startsAt: new Date('2026-10-20T08:00:00Z'), endsAt: new Date('2026-10-20T12:00:00Z') },
  });

  it('returns offers for the request owner and expires stale submitted offers', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-20T08:00:00Z'));
    const requestRepository = new InMemoryTransportRequestRepository();
    const offerRepository = new InMemoryTransportOfferRepository();
    await createRequest(requestRepository);
    const offer = TransportOffer.create({
      id: 'offer-1', requestId: 'request-1', carrierId: 'carrier-1', price: Money.create(1500, 'DOP'),
      validUntil: new Date('2026-10-20T08:01:00Z'),
    });
    offer.submit();
    await offerRepository.save(offer);
    jest.setSystemTime(new Date('2026-10-20T08:02:00Z'));

    const result = await new ViewReceivedOffersHandler(requestRepository, offerRepository).execute({ requestId: 'request-1', requesterId: 'client-1' });

    expect(result).toEqual([offer]);
    expect(result[0].currentStatus).toBe(TransportOfferStatus.EXPIRED);
  });

  it('rejects access from a different requester', async () => {
    const requestRepository = new InMemoryTransportRequestRepository();
    await createRequest(requestRepository);
    const handler = new ViewReceivedOffersHandler(requestRepository, new InMemoryTransportOfferRepository());

    await expect(handler.execute({ requestId: 'request-1', requesterId: 'other-client' })).rejects.toThrow(DomainError);
  });
});
