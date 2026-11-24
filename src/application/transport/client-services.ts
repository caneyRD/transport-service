import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';

/** A commission rule as stored (UC-TRA-42); applied to a gross amount. */
export interface CommissionTerms { percentage: number; fixedAmount: number; minimum?: number; maximum?: number }
export function commissionFor(terms: CommissionTerms, gross: number): number {
  let fee = gross * terms.percentage + terms.fixedAmount;
  if (terms.minimum !== undefined) fee = Math.max(fee, terms.minimum);
  if (terms.maximum !== undefined) fee = Math.min(fee, terms.maximum);
  return Math.round(Math.min(Math.max(fee, 0), gross) * 100) / 100;
}

export interface PriceRule { id: string; basePrice: number; pricePerKm: number; pricePerTon: number; minimum: number; currency: string }
export interface PriceEstimateInput { origin: { latitude: number; longitude: number }; destination: { latitude: number; longitude: number }; weightKg?: number; cargoType?: string; vehicleType?: string }

export interface ClientServicesRepository {
  /** Active price rule, the most specific for vehicle and cargo type (UC-TRA-72/155). */
  priceRule(vehicleType?: string, cargoType?: string): Promise<PriceRule | undefined>;
  commissionTerms(currency: string): Promise<CommissionTerms | undefined>;
  /** UC-TRA-83: the client says the cargo is ready; the assigned carrier is told. */
  cargoReady(requestId: string, requesterId: string): Promise<unknown>;
  /** UC-TRA-12: only a trip participant can share it. */
  assertParticipant(tripId: string, userId: string): Promise<void>;
  sharedTrip(tripId: string): Promise<unknown>;
}

const EARTH_RADIUS_KM = 6371;
function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (v: number) => v * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const round = (n: number) => Math.round(n * 100) / 100;
const SHARE_HOURS = 12;

export class ClientServicesHandler {
  constructor(private readonly repository: ClientServicesRepository, private readonly shareSecret?: string) {}

  /** UC-TRA-72/73/155: suggested price with its breakdown, before publishing. */
  async priceEstimate(input: PriceEstimateInput) {
    for (const point of [input.origin, input.destination]) {
      if (!Number.isFinite(point?.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point?.longitude) || Math.abs(point.longitude) > 180) throw new DomainError('Origin and destination must be valid coordinates');
    }
    if (input.weightKg !== undefined && (!Number.isFinite(input.weightKg) || input.weightKg <= 0)) throw new DomainError('Weight must be positive');
    const rule = await this.repository.priceRule(input.vehicleType, input.cargoType);
    if (!rule) throw new DomainError('No active price rule');
    const km = Math.max(Number(distanceKm(input.origin, input.destination).toFixed(1)), 0.1);
    const tons = (input.weightKg ?? 0) / 1000;
    const distanceCharge = round(km * rule.pricePerKm), weightCharge = round(tons * rule.pricePerTon);
    const subtotal = round(rule.basePrice + distanceCharge + weightCharge);
    const estimated = Math.max(subtotal, rule.minimum);
    const terms = await this.repository.commissionTerms(rule.currency);
    const commission = terms ? commissionFor(terms, estimated) : 0;
    return { ruleId: rule.id, currency: rule.currency, distanceKm: km, estimatedDurationMinutes: Math.max(1, Math.ceil(km / 40 * 60)),
      breakdown: { base: rule.basePrice, distance: distanceCharge, weight: weightCharge, minimumApplied: estimated > subtotal },
      estimated, commission, carrierPayout: round(estimated - commission) };
  }

  /** UC-TRA-125: what the carrier keeps from an offer amount. */
  async earningEstimate(amount: number, currency: string) {
    if (!Number.isFinite(amount) || amount <= 0) throw new DomainError('Amount must be positive');
    if (!/^[A-Z]{3}$/.test(currency)) throw new DomainError('Invalid currency');
    const terms = await this.repository.commissionTerms(currency);
    const commission = terms ? commissionFor(terms, amount) : 0;
    return { gross: round(amount), commission, net: round(amount - commission), currency };
  }

  cargoReady(requestId: string, requesterId: string) {
    if (!requestId.trim()) throw new DomainError('Request id is required');
    return this.repository.cargoReady(requestId, requesterId);
  }

  async shareTrip(tripId: string, userId: string, now = new Date()) {
    const secret = this.secret();
    await this.repository.assertParticipant(tripId, userId);
    const expiresAt = new Date(now.getTime() + SHARE_HOURS * 3600000);
    const payload = Buffer.from(JSON.stringify({ t: tripId, e: Math.floor(expiresAt.getTime() / 1000) })).toString('base64url');
    const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    return { token, path: `/shared/trips/${token}`, expiresAt };
  }

  async openShared(token: string, now = new Date()) {
    const secret = this.secret();
    const [payload, signature] = token.split('.');
    if (!payload || !signature) throw new DomainError('Invalid share link');
    const expected = createHmac('sha256', secret).update(payload).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new DomainError('Invalid share link');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { t: string; e: number };
    if (data.e * 1000 <= now.getTime()) throw new DomainError('Expired share link');
    return this.repository.sharedTrip(data.t);
  }

  private secret() {
    if (!this.shareSecret || this.shareSecret.length < 16) throw new DomainError('Trip sharing is not configured');
    return this.shareSecret;
  }
}
