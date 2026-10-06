import { DomainError } from '../../shared/domain-error';

export class Weight {
  private constructor(readonly value: number, readonly unit: 'kg') {}
  static create(value: number): Weight {
    if (!Number.isFinite(value) || value <= 0) throw new DomainError('Weight must be positive');
    return new Weight(value, 'kg');
  }
}

export class Volume {
  private constructor(readonly value: number, readonly unit: 'm3') {}
  static create(value: number): Volume {
    if (!Number.isFinite(value) || value <= 0) throw new DomainError('Volume must be positive');
    return new Volume(value, 'm3');
  }
}

export class Distance {
  private constructor(readonly value: number, readonly unit: 'km') {}
  static create(value: number): Distance {
    if (!Number.isFinite(value) || value <= 0) throw new DomainError('Distance must be positive');
    return new Distance(value, 'km');
  }
}
