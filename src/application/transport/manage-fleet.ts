import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { Vehicle, VehicleBodyType, VehicleCapacityUnit } from '../../domain/transport/vehicle';
import { CarrierRegistration } from './register-carrier';

export interface VehicleInput {
  registrationNumber: string; bodyType: VehicleBodyType; capacityValue: number;
  capacityUnit: VehicleCapacityUnit; capacityKg: number;
}
export interface FleetRepository {
  verification(userId: string): Promise<CarrierRegistration | undefined>;
  saveVehicle(vehicle: Vehicle, editing: boolean): Promise<unknown>;
  availability(userId: string, available: boolean, startsAt: Date, endsAt: Date): Promise<unknown>;
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
}
