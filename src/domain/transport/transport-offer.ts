import { AggregateRoot } from '../shared/aggregate-root';
import { DomainError } from '../shared/domain-error';
import { Money } from './value-objects/money';
import { transportEvent } from './events';

export enum TransportOfferStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  COUNTERED = 'COUNTERED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

export enum OfferActor {
  CLIENT = 'CLIENT',
  CARRIER = 'CARRIER',
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
    readonly parentOfferId?: string,
    readonly proposedBy?: OfferActor,
    readonly round = 0,
  ) { super(); }

  static create(props: {
    id: string;
    requestId: string;
    carrierId: string;
    price: Money;
    validUntil: Date;
    vehicleId?: string;
    parentOfferId?: string;
    proposedBy?: OfferActor;
    round?: number;
  }): TransportOffer {
    if (!props.id.trim() || !props.requestId.trim() || !props.carrierId.trim()) throw new DomainError('Offer ids are required');
    if (props.validUntil <= new Date()) throw new DomainError('Offer validity must be in the future');
    if (props.round !== undefined && (!Number.isInteger(props.round) || props.round < 0)) throw new DomainError('Offer round must be a non-negative integer');
    if ((props.parentOfferId && !props.proposedBy) || (!props.parentOfferId && props.proposedBy)) {
      throw new DomainError('Counteroffers require a parent offer and an actor');
    }
    return new TransportOffer(props.id, props.requestId, props.carrierId, props.price, new Date(props.validUntil), props.vehicleId, props.parentOfferId, props.proposedBy, props.round ?? 0);
  }

  get currentStatus(): TransportOfferStatus { return this.status; }

  static restore(props: {
    id: string; requestId: string; carrierId: string; price: Money; validUntil: Date;
    vehicleId?: string; parentOfferId?: string; proposedBy?: OfferActor; round: number;
    status: TransportOfferStatus; version: number;
  }): TransportOffer {
    if (!Object.values(TransportOfferStatus).includes(props.status)) throw new DomainError('Invalid offer status');
    const offer = new TransportOffer(props.id, props.requestId, props.carrierId, props.price,
      new Date(props.validUntil), props.vehicleId, props.parentOfferId, props.proposedBy, props.round);
    offer.status = props.status;
    offer.restoreVersion(props.version);
    return offer;
  }
  submit(): void {
    if (this.status !== TransportOfferStatus.DRAFT) throw new DomainError('Only a draft offer can be submitted');
    this.status = TransportOfferStatus.SUBMITTED;
    this.addEvent('TransportOfferSubmitted', {
      requestId: this.requestId,
      carrierId: this.carrierId,
    });
  }
  accept(): void {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be accepted');
    if (this.expireIfNeeded()) throw new DomainError('Expired offer cannot be accepted');
    this.status = TransportOfferStatus.ACCEPTED;
    this.addEvent('TransportOfferAccepted', { requestId: this.requestId });
  }
  reject(): void {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be rejected');
    this.status = TransportOfferStatus.REJECTED;
    this.addEvent('TransportOfferRejected', { requestId: this.requestId });
  }
  withdraw(): void {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be withdrawn');
    this.status = TransportOfferStatus.WITHDRAWN;
    this.addEvent('TransportOfferWithdrawn', { requestId: this.requestId });
  }
  counter(props: {
    id: string;
    price: Money;
    validUntil: Date;
    proposedBy: OfferActor;
    vehicleId?: string;
  }): TransportOffer {
    if (this.status !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be countered');
    if (this.expireIfNeeded()) throw new DomainError('Expired offer cannot be countered');
    this.status = TransportOfferStatus.COUNTERED;
    this.addEvent('TransportOfferCountered', { requestId: this.requestId, counterOfferId: props.id });
    const counterOffer = TransportOffer.create({
      ...props,
      requestId: this.requestId,
      carrierId: this.carrierId,
      vehicleId: props.vehicleId ?? this.vehicleId,
      parentOfferId: this.id,
      round: this.round + 1,
    });
    counterOffer.submit();
    return counterOffer;
  }
  expire(now = new Date()): boolean {
    if (this.status !== TransportOfferStatus.SUBMITTED || this.validUntil > now) return false;
    this.status = TransportOfferStatus.EXPIRED;
    this.addEvent('TransportOfferExpired', { requestId: this.requestId });
    return true;
  }

  private expireIfNeeded(now = new Date()): boolean {
    return this.expire(now);
  }

  private addEvent(type: Parameters<typeof transportEvent>[0], data: Record<string, unknown>): void {
    this.addDomainEvent(transportEvent(type, this.id, 'TransportOffer', this.currentVersion + 1, this.requestId, data));
  }
}
