import { TransportOffer } from '../../../domain/transport/transport-offer';

export interface TransportOfferRepository {
  save(offer: TransportOffer): Promise<void>;
  findById(id: string): Promise<TransportOffer | undefined>;
  findByRequestId(requestId: string): Promise<TransportOffer[]>;
}
