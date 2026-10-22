import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';
import { TransportRequest } from '../../domain/transport/transport-request';
import { TransportOfferRepository } from './ports/transport-offer.repository';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface AcceptOfferCommand {
  readonly requestId: string;
  readonly offerId: string;
  readonly requesterId: string;
}

export class AcceptOfferHandler {
  constructor(
    private readonly requestRepository: TransportRequestRepository,
    private readonly offerRepository: TransportOfferRepository,
    private readonly generateAssignmentId: () => string = randomUUID,
  ) {}

  async execute(command: AcceptOfferCommand): Promise<{ request: TransportRequest; offer: TransportOffer }> {
    const request = await this.requestRepository.findById(command.requestId);
    if (!request) throw new DomainError(`Transport request ${command.requestId} was not found`);
    if (request.props.requesterId !== command.requesterId) throw new DomainError('Only the request owner can accept an offer');
    const offer = await this.offerRepository.findById(command.offerId);
    if (!offer || offer.requestId !== command.requestId) throw new DomainError(`Offer ${command.offerId} was not found for the request`);
    if (offer.currentStatus !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be accepted');

    offer.accept();
    request.assign(this.generateAssignmentId());
    await this.offerRepository.save(offer);
    await this.requestRepository.save(request);
    return { request, offer };
  }
}
