import { DomainError } from '../shared/domain-error';

export enum VehicleBodyType {
  DUMP_TRUCK = 'DUMP_TRUCK',
  FLATBED = 'FLATBED',
  OTHER = 'OTHER',
}

export enum VehicleCapacityUnit {
  M3 = 'M3',
  TON = 'TON',
  FT = 'FT',
}

export class Vehicle {
  private constructor(
    readonly id: string,
    readonly ownerId: string,
    readonly registrationNumber: string,
    readonly registrationNumberNormalized: string,
    readonly bodyType: VehicleBodyType,
    readonly capacityValue: number,
    readonly capacityUnit: VehicleCapacityUnit,
    readonly capacityKg: number,
    private enabled: boolean,
  ) {}

  static create(props: {
    id: string;
    ownerId: string;
    registrationNumber: string;
    capacityKg: number;
    bodyType?: VehicleBodyType;
    capacityValue?: number;
    capacityUnit?: VehicleCapacityUnit;
    enabled?: boolean;
  }): Vehicle {
    if (!props.id.trim() || !props.ownerId.trim()) throw new DomainError('Vehicle id and owner id are required');
    if (!props.registrationNumber.trim()) throw new DomainError('Vehicle registration number is required');
    if (!Number.isFinite(props.capacityKg) || props.capacityKg <= 0) throw new DomainError('Vehicle capacity must be positive');
    const bodyType = props.bodyType ?? VehicleBodyType.OTHER;
    const capacityUnit = props.capacityUnit ?? VehicleCapacityUnit.TON;
    const capacityValue = props.capacityValue ?? props.capacityKg;
    if (!Number.isFinite(capacityValue) || capacityValue <= 0) throw new DomainError('Vehicle capacity value must be positive');
    if (!Object.values(VehicleBodyType).includes(bodyType)) throw new DomainError('Invalid vehicle body type');
    if (!Object.values(VehicleCapacityUnit).includes(capacityUnit)) throw new DomainError('Invalid vehicle capacity unit');
    if (bodyType === VehicleBodyType.DUMP_TRUCK && capacityUnit !== VehicleCapacityUnit.M3) {
      throw new DomainError('Dump trucks require capacity in cubic meters');
    }
    if (bodyType === VehicleBodyType.FLATBED && ![VehicleCapacityUnit.TON, VehicleCapacityUnit.FT].includes(capacityUnit)) {
      throw new DomainError('Flatbed vehicles require capacity in tons or feet');
    }
    const registrationNumber = props.registrationNumber.trim();
    const registrationNumberNormalized = registrationNumber.toUpperCase().replace(/[\s-]/g, '');
    return new Vehicle(props.id, props.ownerId, registrationNumber, registrationNumberNormalized, bodyType, capacityValue, capacityUnit, props.capacityKg, props.enabled ?? false);
  }

  isEnabled(): boolean { return this.enabled; }
  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
}
