import { ExpireOffersHandler } from './expire-offers';
import { InMemoryTransportOfferRepository } from '../../infrastructure/in-memory/transport-offer-in-memory.repository';
import { TransportOffer } from '../../domain/transport/transport-offer';
import { Money } from '../../domain/transport/value-objects/money';

describe('UC-TRA-44 Expire offer by timeout', () => {
  it('expires only submitted offers whose validity has elapsed', async () => {
    const repo = new InMemoryTransportOfferRepository();
    const stale = TransportOffer.create({ id:'stale', requestId:'r', carrierId:'c', price:Money.create(1,'DOP'), validUntil:new Date('2026-12-01') });
    const fresh = TransportOffer.create({ id:'fresh', requestId:'r', carrierId:'c', price:Money.create(1,'DOP'), validUntil:new Date('2027-01-01') });
    stale.submit(); fresh.submit(); await repo.save(stale); await repo.save(fresh);
    const expired = await new ExpireOffersHandler(repo).execute('r', new Date('2026-12-02'));
    expect(expired.map(o => o.id)).toEqual(['stale']);
  });
});
