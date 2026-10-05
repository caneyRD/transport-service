import { DomainError } from '../../shared/domain-error';

export class Location {
  private constructor(
    readonly address: string,
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static create(address: string, latitude: number, longitude: number): Location {
    if (!address.trim()) throw new DomainError('Location address is required');
    if (latitude < -90 || latitude > 90) throw new DomainError('Latitude must be between -90 and 90');
    if (longitude < -180 || longitude > 180) throw new DomainError('Longitude must be between -180 and 180');
    return new Location(address.trim(), latitude, longitude);
  }
}
