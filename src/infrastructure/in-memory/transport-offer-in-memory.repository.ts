import { TransportOfferRepository } from '../../application/transport/ports/transport-offer.repository';
import { TransportOffer } from '../../domain/transport/transport-offer';

export class InMemoryTransportOfferRepository implements TransportOfferRepository {
  private readonly offers = new Map<string, TransportOffer>();

  async save(offer: TransportOffer): Promise<void> {
    this.offers.set(offer.id, offer);
  }

  async findById(id: string): Promise<TransportOffer | undefined> {
    return this.offers.get(id);
  }

  async findByRequestId(requestId: string): Promise<TransportOffer[]> {
    return [...this.offers.values()].filter((offer) => offer.requestId === requestId);
  }
}
