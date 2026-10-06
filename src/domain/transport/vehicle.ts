import { DomainError } from '../shared/domain-error';

export class Vehicle {
  private constructor(
    readonly id: string,
    readonly ownerId: string,
    readonly registrationNumber: string,
    readonly capacityKg: number,
    private enabled: boolean,
  ) {}

  static create(props: {
    id: string;
    ownerId: string;
    registrationNumber: string;
    capacityKg: number;
    enabled?: boolean;
  }): Vehicle {
    if (!props.id.trim() || !props.ownerId.trim()) throw new DomainError('Vehicle id and owner id are required');
    if (!props.registrationNumber.trim()) throw new DomainError('Vehicle registration number is required');
    if (!Number.isFinite(props.capacityKg) || props.capacityKg <= 0) throw new DomainError('Vehicle capacity must be positive');
    return new Vehicle(props.id, props.ownerId, props.registrationNumber.trim(), props.capacityKg, props.enabled ?? false);
  }

  isEnabled(): boolean { return this.enabled; }
  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
}
