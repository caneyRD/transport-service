import { TransportOfferRepository } from './ports/transport-offer.repository';
import { TransportOffer } from '../../domain/transport/transport-offer';

export class ExpireOffersHandler {
  constructor(private readonly offers: TransportOfferRepository) {}

  async execute(requestId: string, now = new Date()): Promise<TransportOffer[]> {
    const candidates = await this.offers.findByRequestId(requestId);
    const expired: TransportOffer[] = [];
    for (const offer of candidates) {
      if (offer.expire(now)) {
        await this.offers.save(offer);
        expired.push(offer);
      }
    }
    return expired;
  }
}
