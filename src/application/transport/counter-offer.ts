import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { OfferActor, TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';
import { Money } from '../../domain/transport/value-objects/money';
import { TransportOfferRepository } from './ports/transport-offer.repository';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface CounterOfferCommand {
  readonly requestId: string;
  readonly offerId: string;
  readonly requesterId: string;
  readonly amount: number;
  readonly currency: string;
  readonly validUntil: Date;
}

export class CounterOfferHandler {
  constructor(
    private readonly requestRepository: TransportRequestRepository,
    private readonly offerRepository: TransportOfferRepository,
    private readonly generateOfferId: () => string = randomUUID,
  ) {}

  async execute(command: CounterOfferCommand): Promise<TransportOffer> {
    const request = await this.requestRepository.findById(command.requestId);
    if (!request) throw new DomainError(`Transport request ${command.requestId} was not found`);
    if (request.props.requesterId !== command.requesterId) throw new DomainError('Only the request owner can counter an offer');
    const offer = await this.offerRepository.findById(command.offerId);
    if (!offer || offer.requestId !== command.requestId) throw new DomainError(`Offer ${command.offerId} was not found for the request`);
    if (offer.currentStatus !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be countered');

    const counterOffer = offer.counter({
      id: this.generateOfferId(),
      price: Money.create(command.amount, command.currency),
      validUntil: command.validUntil,
      proposedBy: OfferActor.CLIENT,
    });
    await this.offerRepository.save(offer);
    await this.offerRepository.save(counterOffer);
    return counterOffer;
  }
}
