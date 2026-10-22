import { TransportOffer } from '../../../domain/transport/transport-offer';

export interface TransportOfferRepository {
  save(offer: TransportOffer): Promise<void>;
  findByRequestId(requestId: string): Promise<TransportOffer[]>;
}
