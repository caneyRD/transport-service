import { AggregateRoot } from '../shared/aggregate-root';
import { DomainError } from '../shared/domain-error';
import { Location } from './value-objects/location';
import { TimeWindow } from './value-objects/time-window';

export enum TransportRequestStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  MATCHING = 'MATCHING',
  OFFERED = 'OFFERED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface Cargo {
  readonly description: string;
  readonly weightKg?: number;
  readonly volumeM3?: number;
}

export interface TransportRequestProps {
  readonly id: string;
  readonly requesterId: string;
  readonly cargo: Cargo;
  readonly origin: Location;
  readonly destination: Location;
  readonly timeWindow: TimeWindow;
}

const transitions: Record<TransportRequestStatus, TransportRequestStatus[]> = {
  DRAFT: [TransportRequestStatus.OPEN, TransportRequestStatus.CANCELLED],
  OPEN: [TransportRequestStatus.MATCHING, TransportRequestStatus.OFFERED, TransportRequestStatus.CANCELLED],
  MATCHING: [TransportRequestStatus.OFFERED, TransportRequestStatus.ASSIGNED, TransportRequestStatus.CANCELLED],
  OFFERED: [TransportRequestStatus.MATCHING, TransportRequestStatus.ASSIGNED, TransportRequestStatus.CANCELLED],
  ASSIGNED: [TransportRequestStatus.IN_PROGRESS, TransportRequestStatus.CANCELLED],
  IN_PROGRESS: [TransportRequestStatus.COMPLETED, TransportRequestStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export class TransportRequest extends AggregateRoot {
  private status = TransportRequestStatus.DRAFT;
  private activeAssignmentId?: string;

  private constructor(readonly props: TransportRequestProps) {
    super();
  }

  static create(props: TransportRequestProps): TransportRequest {
    if (!props.id.trim()) throw new DomainError('Transport request id is required');
    if (!props.requesterId.trim()) throw new DomainError('Requester id is required');
    if (!props.cargo.description.trim()) throw new DomainError('Cargo description is required');
    if (props.cargo.weightKg !== undefined && props.cargo.weightKg <= 0) throw new DomainError('Cargo weight must be positive');
    if (props.cargo.volumeM3 !== undefined && props.cargo.volumeM3 <= 0) throw new DomainError('Cargo volume must be positive');
    return new TransportRequest(props);
  }

  get currentStatus(): TransportRequestStatus { return this.status; }

  open(): void { this.transitionTo(TransportRequestStatus.OPEN); }
  startMatching(): void { this.transitionTo(TransportRequestStatus.MATCHING); }
  markOffered(): void { this.transitionTo(TransportRequestStatus.OFFERED); }
  assign(assignmentId: string): void {
    if (this.activeAssignmentId) throw new DomainError('Transport request already has an active assignment');
    if (!assignmentId.trim()) throw new DomainError('Assignment id is required');
    this.activeAssignmentId = assignmentId;
    this.transitionTo(TransportRequestStatus.ASSIGNED);
  }
  startTrip(): void { this.transitionTo(TransportRequestStatus.IN_PROGRESS); }
  complete(): void { this.transitionTo(TransportRequestStatus.COMPLETED); }
  cancel(): void { this.transitionTo(TransportRequestStatus.CANCELLED); }

  private transitionTo(next: TransportRequestStatus): void {
    if (!transitions[this.status].includes(next)) {
      throw new DomainError(`Invalid transport request transition: ${this.status} -> ${next}`);
    }
    this.status = next;
  }
}
