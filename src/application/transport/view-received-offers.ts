import { DomainError } from '../../domain/shared/domain-error';
import { TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';
import { TransportOfferRepository } from './ports/transport-offer.repository';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface ViewReceivedOffersCommand {
  readonly requestId: string;
  readonly requesterId: string;
}

export class ViewReceivedOffersHandler {
  constructor(
    private readonly requestRepository: TransportRequestRepository,
    private readonly offerRepository: TransportOfferRepository,
  ) {}

  async execute(command: ViewReceivedOffersCommand): Promise<TransportOffer[]> {
    const request = await this.requestRepository.findById(command.requestId);
    if (!request) throw new DomainError(`Transport request ${command.requestId} was not found`);
    if (request.props.requesterId !== command.requesterId) {
      throw new DomainError('Only the request owner can view received offers');
    }

    const offers = await this.offerRepository.findByRequestId(command.requestId);
    for (const offer of offers) {
      if (offer.currentStatus === TransportOfferStatus.SUBMITTED && offer.expire()) {
        await this.offerRepository.save(offer);
      }
    }
    return offers;
  }
}
