import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { Vehicle, VehicleBodyType, VehicleCapacityUnit } from '../../domain/transport/vehicle';
import { CarrierRegistration } from './register-carrier';

export interface VehicleInput {
  registrationNumber: string; bodyType: VehicleBodyType; capacityValue: number;
  capacityUnit: VehicleCapacityUnit; capacityKg: number;
}
export interface CarrierLocation { latitude: number; longitude: number; recordedAt: Date }
export interface NearbyCarriersQuery { latitude: number; longitude: number; radiusKm: number; limit: number; freshMinutes: number }
/** What a client sees of a carrier before accepting its offer (UC-TRA-76/77): no plates, phones or documents. */
export interface CarrierPublicProfile { userId: string; status: string; ratingAverage: number; reviewCount: number; vehicleCount: number;
  displayName?: string; memberSince?: Date; completedTrips?: number; vehicles?: Array<{ bodyType: string; capacity: number; capacityUnit: string }>;
  recentReviews?: Array<{ score: number; comment?: string; createdAt: Date }>; }
/** Public view of an available carrier: approximate position, no identity (UC-TRA-03). */
export interface NearbyCarrier {
  id: string; latitude: number; longitude: number; distanceKm: number;
  bodyType?: string; capacityValue?: number; capacityUnit?: string; updatedAt: Date;
}
export interface FleetRepository {
  verification(userId: string): Promise<CarrierRegistration | undefined>;
  saveVehicle(vehicle: Vehicle, editing: boolean): Promise<unknown>;
  availability(userId: string, available: boolean, startsAt: Date, endsAt: Date): Promise<unknown>;
  updateLocation(userId: string, location: CarrierLocation): Promise<CarrierLocation>;
  nearby(query: NearbyCarriersQuery): Promise<NearbyCarrier[]>;
  /** Ventana de disponibilidad vigente ahora, si hay una. */
  currentAvailability(userId: string): Promise<{ available: boolean; startsAt?: Date; endsAt?: Date }>;
  publicProfile?(userId: string): Promise<CarrierPublicProfile | undefined>;
}

/** Maximum search radius and result size for the client map. */
export const NEARBY_MAX_RADIUS_KM = 50;
export const NEARBY_MAX_RESULTS = 50;
/** A position older than this is treated as offline. */
export const LOCATION_FRESH_MINUTES = 5;

function coordinates(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new DomainError('Latitude must be between -90 and 90');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new DomainError('Longitude must be between -180 and 180');
}
export class ManageFleetHandler {
  constructor(private readonly repository: FleetRepository) {}
  async verification(userId: string) {
    const profile = await this.repository.verification(userId);
    if (!profile) throw new DomainError('Carrier profile was not found');
    return profile;
  }
  async vehicle(userId: string, input: VehicleInput, id?: string) {
    await this.verification(userId);
    const vehicle = Vehicle.create({ ...input, id: id ?? randomUUID(), ownerId: userId });
    if (!vehicle.registrationNumberNormalized || vehicle.registrationNumber.length > 64) throw new DomainError('Invalid vehicle registration number');
    return this.repository.saveVehicle(vehicle, id !== undefined);
  }
  async availability(userId: string, available: boolean, startsAt: Date, endsAt: Date) {
    if (![startsAt, endsAt].every(d => Number.isFinite(d.getTime())) || endsAt <= startsAt) throw new DomainError('Invalid availability period');
    if (typeof available !== 'boolean') throw new DomainError('Availability must be boolean');
    return this.repository.availability(userId, available, startsAt, endsAt);
  }
  /** UC-TRA-03 support: the carrier app reports its last known position while online. */
  async updateLocation(userId: string, location: CarrierLocation, now = new Date()) {
    coordinates(location.latitude, location.longitude);
    const at = location.recordedAt.getTime();
    if (!Number.isFinite(at)) throw new DomainError('Invalid location time');
    if (at > now.getTime() + 60_000) throw new DomainError('Location time cannot be in the future');
    if (at < now.getTime() - 10 * 60_000) throw new DomainError('Location is too old to be reported');
    return this.repository.updateLocation(userId, location);
  }
  async currentAvailability(userId: string) {
    await this.verification(userId);
    return this.repository.currentAvailability(userId);
  }
  async publicProfile(userId: string) {
    if (!userId.trim()) throw new DomainError('Carrier user id is required');
    if (!this.repository.publicProfile) throw new DomainError('Carrier profile view is not configured');
    const profile=await this.repository.publicProfile(userId);
    if (!profile) throw new DomainError('Carrier profile was not found');
    return profile;
  }
  /** UC-TRA-03: enabled, available and recently located carriers around a point. */
  async nearby(latitude: number, longitude: number, radiusKm = 15, limit = 30) {
    coordinates(latitude, longitude);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > NEARBY_MAX_RADIUS_KM) throw new DomainError(`Radius must be greater than 0 and at most ${NEARBY_MAX_RADIUS_KM} km`);
    if (!Number.isInteger(limit) || limit < 1 || limit > NEARBY_MAX_RESULTS) throw new DomainError(`Limit must be between 1 and ${NEARBY_MAX_RESULTS}`);
    return this.repository.nearby({ latitude, longitude, radiusKm, limit, freshMinutes: LOCATION_FRESH_MINUTES });
  }
}
