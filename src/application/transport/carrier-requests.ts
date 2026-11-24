import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { OfferActor, TransportOffer, TransportOfferStatus } from '../../domain/transport/transport-offer';
import { TransportRequestStatus } from '../../domain/transport/transport-request';
import { Money } from '../../domain/transport/value-objects/money';
import { FleetRepository } from './manage-fleet';
import { TransportOfferRepository } from './ports/transport-offer.repository';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface OpenRequestsQuery { carrierUserId: string; latitude: number; longitude: number; radiusKm: number; limit: number }
/** Solicitud abierta vista por un transportista: sin datos personales del cliente. */
export interface OpenRequestView {
  id: string; status: string; distanceKm: number; createdAt: Date;
  cargo: { description: string; type?: string; weightKg?: number; volumeM3?: number };
  origin: { address: string; latitude: number; longitude: number };
  destination: { address: string; latitude: number; longitude: number };
  timeWindow: { startsAt: Date; endsAt: Date };
  myOffer?: { id: string; amount: number; currency: string; status: string; validUntil: Date };
}
export interface CarrierOfferView {
  id: string; requestId: string; amount: number; currency: string; status: string; validUntil: Date; createdAt: Date;
  requestStatus: string; tripId?: string; tripStatus?: string;
  origin: { address: string; latitude: number; longitude: number };
  destination: { address: string; latitude: number; longitude: number };
  cargo: { description: string };
}
export interface CarrierRequestRepository {
  openNear(query: OpenRequestsQuery): Promise<OpenRequestView[]>;
  /** El vehículo indicado (si es del transportista y está habilitado) o el habilitado de mayor capacidad. */
  enabledVehicle(carrierUserId: string, vehicleId?: string): Promise<string | undefined>;
  offersOf(carrierUserId: string, limit: number): Promise<CarrierOfferView[]>;
  reject?(carrierUserId: string, requestId: string, reason: string): Promise<unknown>;
  publishBackhaul?(carrierUserId: string, input: BackhaulInput): Promise<unknown>;
  backhaulsOf?(carrierUserId: string): Promise<unknown[]>;
}
export interface BackhaulInput { vehicleId: string; origin: { address: string; latitude: number; longitude: number }; destination: { address: string; latitude: number; longitude: number }; availableFrom: Date; availableTo: Date; capacityKg: number; }

export const OPEN_REQUESTS_MAX_RADIUS_KM = 100;
export const OFFER_DEFAULT_HOURS = 24;
export const OFFER_MAX_DAYS = 7;
/** Counteroffers allowed in one negotiation (client and carrier together). */
export const MAX_NEGOTIATION_ROUNDS = 4;
const OPEN_FOR_OFFERS = [TransportRequestStatus.OPEN, TransportRequestStatus.MATCHING, TransportRequestStatus.OFFERED];

export class CarrierRequestsHandler {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly requests: TransportRequestRepository,
    private readonly offers: TransportOfferRepository,
    private readonly carrierRequests: CarrierRequestRepository,
  ) {}

  private async enabled(userId: string) {
    const profile = await this.fleet.verification(userId);
    if (!profile) throw new DomainError('Carrier profile was not found');
    if (profile.status !== 'ENABLED') throw new DomainError('Only an enabled carrier can see and offer on requests');
    return profile;
  }

  /** Solicitudes abiertas a ofertas alrededor del transportista, más cercanas primero. */
  async open(userId: string, latitude: number, longitude: number, radiusKm = 30, limit = 30) {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new DomainError('Latitude must be between -90 and 90');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new DomainError('Longitude must be between -180 and 180');
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > OPEN_REQUESTS_MAX_RADIUS_KM) throw new DomainError(`Radius must be greater than 0 and at most ${OPEN_REQUESTS_MAX_RADIUS_KM} km`);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new DomainError('Limit must be between 1 and 50');
    await this.enabled(userId);
    return this.carrierRequests.openNear({ carrierUserId: userId, latitude, longitude, radiusKm, limit });
  }

  /** El transportista ofrece su precio por una solicitud abierta (una oferta vigente por solicitud). */
  async offer(userId: string, requestId: string, input: { amount: number; currency?: string; validUntil?: Date; vehicleId?: string }, now = new Date()) {
    await this.enabled(userId);
    if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000_000) throw new DomainError('Offer amount must be greater than 0');
    const validUntil = input.validUntil ?? new Date(now.getTime() + OFFER_DEFAULT_HOURS * 3600_000);
    if (validUntil.getTime() > now.getTime() + OFFER_MAX_DAYS * 86400_000) throw new DomainError(`Offer validity cannot exceed ${OFFER_MAX_DAYS} days`);
    const request = await this.requests.findById(requestId);
    if (!request) throw new DomainError('Transport request was not found');
    if (request.props.requesterId === userId) throw new DomainError('You cannot offer on your own request');
    if (!OPEN_FOR_OFFERS.includes(request.currentStatus)) throw new DomainError('Request is not available for offers');
    const existing = await this.offers.findByRequestId(requestId);
    if (existing.some(o => o.carrierId === userId && o.currentStatus === TransportOfferStatus.SUBMITTED && o.validUntil > now)) {
      throw new DomainError('You already have an active offer for this request');
    }
    const vehicleId = await this.carrierRequests.enabledVehicle(userId, input.vehicleId);
    if (!vehicleId) throw new DomainError('An enabled vehicle is required to offer');
    const offer = TransportOffer.create({ id: randomUUID(), requestId, carrierId: userId, vehicleId,
      price: Money.create(Math.round(input.amount * 100) / 100, input.currency ?? 'DOP'), validUntil });
    offer.submit();
    if (request.currentStatus !== TransportRequestStatus.OFFERED) request.markOffered();
    await this.offers.save(offer);
    await this.requests.save(request);
    return offer;
  }

  /**
   * UC-TRA-27: the carrier answers the client's counteroffer: accepting it assigns the trip,
   * or it proposes another price that the client may accept. At most MAX_NEGOTIATION_ROUNDS counters.
   */
  async respondToCounter(userId: string, offerId: string, action: 'accept' | 'counter', amount?: number, now = new Date()) {
    await this.enabled(userId);
    const offer = await this.offers.findById(offerId);
    if (!offer || offer.carrierId !== userId) throw new DomainError('Offer was not found');
    if (offer.proposedBy !== OfferActor.CLIENT) throw new DomainError('Only a client counteroffer can be answered');
    if (offer.currentStatus !== TransportOfferStatus.SUBMITTED) throw new DomainError('Only a submitted offer can be answered');
    const request = await this.requests.findById(offer.requestId);
    if (!request) throw new DomainError('Transport request was not found');
    if (action === 'accept') {
      offer.accept();
      request.assign(randomUUID());
      await this.offers.save(offer);
      await this.requests.save(request);
      return { offer, assignmentId: request.currentAssignmentId };
    }
    if (action !== 'counter') throw new DomainError('Invalid answer');
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new DomainError('Offer amount must be greater than 0');
    if (offer.round >= MAX_NEGOTIATION_ROUNDS) throw new DomainError('Negotiation round limit reached');
    const counter = offer.counter({ id: randomUUID(), price: Money.create(Math.round(amount * 100) / 100, offer.price.currency),
      validUntil: new Date(now.getTime() + OFFER_DEFAULT_HOURS * 3600_000), proposedBy: OfferActor.CARRIER });
    await this.offers.save(offer);
    await this.offers.save(counter);
    return { offer: counter };
  }

  async myOffers(userId: string, limit = 30) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('Limit must be between 1 and 100');
    await this.enabled(userId);
    return this.carrierRequests.offersOf(userId, limit);
  }

  async reject(userId: string, requestId: string, reason: string) {
    await this.enabled(userId);
    if (!requestId.trim()) throw new DomainError('Request id is required');
    if (!reason.trim() || reason.length > 500) throw new DomainError('Rejection reason is required');
    if (!this.carrierRequests.reject) throw new DomainError('Carrier request rejection is not configured');
    return this.carrierRequests.reject(userId, requestId, reason.trim());
  }

  async publishBackhaul(userId: string, input: BackhaulInput) {
    await this.enabled(userId);
    if (!input.vehicleId.trim() || !input.origin.address.trim() || !input.destination.address.trim()) throw new DomainError('Backhaul vehicle and addresses are required');
    if (![input.origin.latitude,input.origin.longitude,input.destination.latitude,input.destination.longitude].every(Number.isFinite)) throw new DomainError('Backhaul coordinates are invalid');
    if (!Number.isFinite(input.capacityKg) || input.capacityKg <= 0) throw new DomainError('Backhaul capacity must be positive');
    if (!(input.availableFrom instanceof Date) || !(input.availableTo instanceof Date) || input.availableTo <= input.availableFrom) throw new DomainError('Backhaul window is invalid');
    if (!this.carrierRequests.publishBackhaul) throw new DomainError('Backhaul is not configured');
    return this.carrierRequests.publishBackhaul(userId,input);
  }

  async backhaulsOf(userId: string) {
    await this.enabled(userId);
    if (!this.carrierRequests.backhaulsOf) throw new DomainError('Backhaul is not configured');
    return this.carrierRequests.backhaulsOf(userId);
  }
}
