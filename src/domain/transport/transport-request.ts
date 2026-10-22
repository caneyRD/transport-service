import { AggregateRoot } from '../shared/aggregate-root';
import { DomainError } from '../shared/domain-error';
import { Location } from './value-objects/location';
import { TimeWindow } from './value-objects/time-window';
import { transportEvent } from './events';
import { Cargo } from './cargo';
import { CargoType } from './cargo';

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
  ASSIGNED: [TransportRequestStatus.IN_PROGRESS, TransportRequestStatus.MATCHING, TransportRequestStatus.CANCELLED],
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
    if (!(props.cargo instanceof Cargo)) throw new DomainError('Transport request requires a valid Cargo value');
    const request = new TransportRequest(props);
    request.addCreatedEvent();
    return request;
  }

  get currentStatus(): TransportRequestStatus { return this.status; }
  get currentAssignmentId(): string | undefined { return this.activeAssignmentId; }

  selectCargoType(type: CargoType): void {
    if (this.status !== TransportRequestStatus.OPEN) {
      throw new DomainError('Cargo type can only be selected for an open request');
    }
    this.props.cargo.selectType(type);
  }

  open(): void {
    this.transitionTo(TransportRequestStatus.OPEN);
    this.addEvent('TransportRequestOpened', {});
  }
  startMatching(): void {
    if (!this.props.cargo.cargoType) {
      throw new DomainError('Cargo type is required before matching');
    }
    this.transitionTo(TransportRequestStatus.MATCHING);
    this.addEvent('TransportMatchingStarted', {});
  }
  markOffered(): void {
    this.transitionTo(TransportRequestStatus.OFFERED);
    this.addEvent('TransportRequestOffered', {});
  }
  assign(assignmentId: string): void {
    if (this.activeAssignmentId) throw new DomainError('Transport request already has an active assignment');
    if (!assignmentId.trim()) throw new DomainError('Assignment id is required');
    this.transitionTo(TransportRequestStatus.ASSIGNED);
    this.activeAssignmentId = assignmentId;
    this.addEvent('TransportAssigned', { assignmentId });
  }
  startTrip(): void {
    this.transitionTo(TransportRequestStatus.IN_PROGRESS);
    this.addEvent('TransportRequestInProgress', { assignmentId: this.activeAssignmentId });
  }
  complete(): void {
    this.transitionTo(TransportRequestStatus.COMPLETED);
    this.addEvent('TransportRequestCompleted', { assignmentId: this.activeAssignmentId });
  }
  cancel(): void {
    this.transitionTo(TransportRequestStatus.CANCELLED);
    this.addEvent('TransportRequestCancelled', { assignmentId: this.activeAssignmentId });
  }
  releaseAssignment(): void {
    if (!this.activeAssignmentId) throw new DomainError('Transport request has no active assignment');
    this.transitionTo(TransportRequestStatus.MATCHING);
    const assignmentId = this.activeAssignmentId;
    this.activeAssignmentId = undefined;
    this.addEvent('TransportRequestAssignmentReleased', { assignmentId });
  }

  private transitionTo(next: TransportRequestStatus): void {
    if (!transitions[this.status].includes(next)) {
      throw new DomainError(`Invalid transport request transition: ${this.status} -> ${next}`);
    }
    this.status = next;
  }

  private addCreatedEvent(): void {
    this.addDomainEvent(transportEvent('TransportRequestCreated', this.props.id, 'TransportRequest', 1, this.props.id, { requesterId: this.props.requesterId }));
  }

  private addEvent(type: Parameters<typeof transportEvent>[0], data: Record<string, unknown>): void {
    this.addDomainEvent(transportEvent(type, this.props.id, 'TransportRequest', this.currentVersion + 1, this.props.id, data));
  }
}
