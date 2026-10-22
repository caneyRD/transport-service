import { AcceptOfferHandler } from './accept-offer';
import { CreateTransportRequestHandler } from './create-transport-request';
import { InMemoryTransportOfferRepository } from '../../infrastructure/in-memory/transport-offer-in-memory.repository';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { Money } from '../../domain/transport/value-objects/money';
import { TransportOffer } from '../../domain/transport/transport-offer';
import { TransportRequestStatus } from '../../domain/transport/transport-request';

describe('UC-TRA-05 Accept offer', () => {
  it('accepts the offer and assigns the request to it', async () => {
    const requests = new InMemoryTransportRequestRepository();
    const offers = new InMemoryTransportOfferRepository();
    const request = await new CreateTransportRequestHandler(requests, () => 'request-1').execute({
      requesterId: 'client-1', cargo: { description: 'Arena' },
      origin: { address: 'Origen', latitude: 18.4, longitude: -69.9 }, destination: { address: 'Destino', latitude: 18.5, longitude: -70 },
      timeWindow: { startsAt: new Date('2026-10-20T08:00:00Z'), endsAt: new Date('2026-10-20T12:00:00Z') },
    });
    request.markOffered();
    const offer = TransportOffer.create({ id: 'offer-1', requestId: 'request-1', carrierId: 'carrier-1', price: Money.create(1500, 'DOP'), validUntil: new Date('2026-12-01T00:00:00Z') });
    offer.submit();
    await offers.save(offer);

    const result = await new AcceptOfferHandler(requests, offers, () => 'assignment-1').execute({ requestId: 'request-1', offerId: 'offer-1', requesterId: 'client-1' });

    expect(result.offer.currentStatus).toBe('ACCEPTED');
    expect(result.request.currentStatus).toBe(TransportRequestStatus.ASSIGNED);
    expect(result.request.currentAssignmentId).toBe('assignment-1');
  });
});
