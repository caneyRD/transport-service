import { DomainError } from '../../domain/shared/domain-error';

/** Statuses a back-office reviewer can set on a carrier profile or a vehicle. */
export type ApprovalStatus = 'habilitado' | 'deshabilitado' | 'suspendido' | 'pendiente';
export const APPROVAL_STATUSES: ApprovalStatus[] = ['habilitado', 'deshabilitado', 'suspendido', 'pendiente'];
/** User Service roles allowed to approve carriers, vehicles and KYC documents. */
export const REVIEWER_ROLES = ['moderador', 'superadmin'];

/** Thrown when the caller is not a moderator/superadmin; the HTTP layer answers 403. */
export class ReviewerRequiredError extends DomainError {}

export interface CarrierApprovalRepository {
  /** Role of an active user, read from the shared users table. */
  reviewerRole(userId: string): Promise<string | undefined>;
  listCarriers(status?: ApprovalStatus): Promise<unknown[]>;
  carrierDetail(carrierUserId: string): Promise<unknown>;
  setCarrierStatus(carrierUserId: string, status: ApprovalStatus, reviewer: { id: string; role: string }, reason?: string): Promise<unknown>;
  setVehicleStatus(vehicleId: string, status: ApprovalStatus, reviewer: { id: string; role: string }, reason?: string): Promise<unknown>;
}

export class CarrierApprovalHandler {
  constructor(private readonly repository: CarrierApprovalRepository) {}

  async assertReviewer(userId: string): Promise<string> {
    const role = await this.repository.reviewerRole(userId);
    if (!role || !REVIEWER_ROLES.includes(role)) throw new ReviewerRequiredError('Only moderators can review carriers');
    return role;
  }

  async list(reviewerId: string, status?: string) {
    await this.assertReviewer(reviewerId);
    return this.repository.listCarriers(status === undefined ? undefined : this.status(status));
  }

  async detail(reviewerId: string, carrierUserId: string) {
    await this.assertReviewer(reviewerId);
    return this.repository.carrierDetail(this.id(carrierUserId, 'Carrier'));
  }

  async setCarrier(reviewerId: string, carrierUserId: string, status: string, reason?: string) {
    const role = await this.assertReviewer(reviewerId);
    const id = this.id(carrierUserId, 'Carrier');
    if (id === reviewerId) throw new DomainError('You cannot review your own carrier account');
    return this.repository.setCarrierStatus(id, this.status(status), { id: reviewerId, role }, this.reason(status, reason));
  }

  async setVehicle(reviewerId: string, vehicleId: string, status: string, reason?: string) {
    const role = await this.assertReviewer(reviewerId);
    return this.repository.setVehicleStatus(this.id(vehicleId, 'Vehicle'), this.status(status), { id: reviewerId, role }, this.reason(status, reason));
  }

  private id(value: string, label: string) { if (!value?.trim()) throw new DomainError(`${label} id is required`); return value.trim(); }
  private status(value: string): ApprovalStatus {
    if (!APPROVAL_STATUSES.includes(value as ApprovalStatus)) throw new DomainError('Invalid approval status');
    return value as ApprovalStatus;
  }
  /** Disabling or suspending must say why: the carrier sees the reason. */
  private reason(status: string, reason?: string) {
    const trimmed = reason?.trim();
    if ((status === 'deshabilitado' || status === 'suspendido') && !trimmed) throw new DomainError('A reason is required to disable or suspend');
    return trimmed || undefined;
  }
}
