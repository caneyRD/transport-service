import { DomainError } from '../shared/domain-error';

export class DriverProfile {
  private constructor(
    readonly id: string,
    readonly userId: string,
    private enabled: boolean,
  ) {}

  static create(props: { id: string; userId: string; enabled?: boolean }): DriverProfile {
    if (!props.id.trim() || !props.userId.trim()) throw new DomainError('Driver profile id and user id are required');
    return new DriverProfile(props.id, props.userId, props.enabled ?? false);
  }

  isEnabled(): boolean { return this.enabled; }
  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
}
