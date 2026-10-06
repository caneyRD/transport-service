import { AggregateRoot } from '../shared/aggregate-root';
import { DomainError } from '../shared/domain-error';
import { Money } from './value-objects/money';
import { transportEvent } from './events';

export enum TransportOfferStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export class TransportOffer extends AggregateRoot {
  private status = TransportOfferStatus.DRAFT;

  private constructor(
    readonly id: string,
    readonly requestId: string,
    readonly carrierId: string,
    readonly price: Money,
    readonly validUntil: Date,
    readonly vehicleId?: string,
  ) { super(); }

  static create(props: {
    id: string;
    requestId: string;
    carrierId: string;
    price: Money;
    validUntil: Date;
    vehicleId?: string;
  }): TransportOffer {
    if (!props.id.trim() || !props.requestId.trim() || !props.carrierId.trim()) throw new DomainError('Offer ids are required');
    if (props.validUntil <= new Date()) throw new DomainError('Offer validity must be in the future');
    return new TransportOffer(props.id, props.requestId, props.carrierId, props.price, new Date(props.validUntil), props.vehicleId);
  }

  get currentStatus(): TransportOfferStatus { return this.status; }
  submit(): void {
    if (this.status !== TransportOfferStatus.DRAFT) throw new DomainError('Only a draft offer can be submitted');
    this.status = TransportOfferStatus.SUBMITTED;
    this.addDomainEvent(transportEvent('TransportOfferSubmitted', this.id, 'TransportOffer', 1, this.requestId, {
      requestId: this.requestId,
      carrierId: this.carrierId,
    }));
  }
  accept(): void {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be accepted');
    if (this.validUntil <= new Date()) throw new DomainError('Expired offer cannot be accepted');
    this.status = TransportOfferStatus.ACCEPTED;
  }
  reject(): void {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be rejected');
    this.status = TransportOfferStatus.REJECTED;
  }
  withdraw(): void {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be withdrawn');
    this.status = TransportOfferStatus.WITHDRAWN;
  }
}
