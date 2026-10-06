import { DomainError } from '../shared/domain-error';
import { DriverProfile } from './driver-profile';
import { Vehicle } from './vehicle';

export enum AssignmentStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  COMPLETED = 'COMPLETED',
}

export class Assignment {
  private status = AssignmentStatus.ACTIVE;

  private constructor(
    readonly id: string,
    readonly requestId: string,
    readonly carrierId: string,
    readonly vehicleId: string,
    readonly assignedAt: Date,
  ) {}

  static create(props: {
    id: string;
    requestId: string;
    driver: DriverProfile;
    vehicle: Vehicle;
    assignedAt?: Date;
  }): Assignment {
    if (!props.id.trim() || !props.requestId.trim()) throw new DomainError('Assignment id and request id are required');
    if (!props.driver.isEnabled()) throw new DomainError('Assignment requires an enabled driver');
    if (!props.vehicle.isEnabled()) throw new DomainError('Assignment requires an enabled vehicle');
    return new Assignment(props.id, props.requestId, props.driver.userId, props.vehicle.id, props.assignedAt ?? new Date());
  }

  get currentStatus(): AssignmentStatus { return this.status; }
  release(): void {
    if (this.status !== AssignmentStatus.ACTIVE) throw new DomainError('Only an active assignment can be released');
    this.status = AssignmentStatus.RELEASED;
  }
  complete(): void {
    if (this.status !== AssignmentStatus.ACTIVE) throw new DomainError('Only an active assignment can be completed');
    this.status = AssignmentStatus.COMPLETED;
  }
}
