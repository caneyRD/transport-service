import { CounterOfferHandler } from './counter-offer';
import { CreateTransportRequestHandler } from './create-transport-request';
import { InMemoryTransportOfferRepository } from '../../infrastructure/in-memory/transport-offer-in-memory.repository';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { Money } from '../../domain/transport/value-objects/money';
import { OfferActor, TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';

describe('UC-TRA-06 Counteroffer price', () => {
  it('creates a client counteroffer and closes the original offer as countered', async () => {
    const requests = new InMemoryTransportRequestRepository();
    const offers = new InMemoryTransportOfferRepository();
    await new CreateTransportRequestHandler(requests, () => 'request-1').execute({
      requesterId: 'client-1', cargo: { description: 'Arena' },
      origin: { address: 'Origen', latitude: 18.4, longitude: -69.9 }, destination: { address: 'Destino', latitude: 18.5, longitude: -70 },
      timeWindow: { startsAt: new Date('2026-10-20T08:00:00Z'), endsAt: new Date('2026-10-20T12:00:00Z') },
    });
    const offer = TransportOffer.create({ id: 'offer-1', requestId: 'request-1', carrierId: 'carrier-1', price: Money.create(1500, 'DOP'), validUntil: new Date('2026-12-01T00:00:00Z') });
    offer.submit();
    await offers.save(offer);

    const counter = await new CounterOfferHandler(requests, offers, () => 'offer-2').execute({ requestId: 'request-1', offerId: 'offer-1', requesterId: 'client-1', amount: 1300, currency: 'DOP', validUntil: new Date('2026-12-02T00:00:00Z') });

    expect(offer.currentStatus).toBe(TransportOfferStatus.COUNTERED);
    expect(counter.currentStatus).toBe(TransportOfferStatus.SUBMITTED);
    expect(counter.proposedBy).toBe(OfferActor.CLIENT);
    expect(counter.parentOfferId).toBe('offer-1');
  });
});
