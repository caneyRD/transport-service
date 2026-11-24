import { DomainError } from '../../domain/shared/domain-error';
import { CarrierApprovalHandler, CarrierApprovalRepository } from './carrier-approval';

export type DisputeOutcome = 'reembolso_total' | 'reembolso_parcial' | 'sin_reembolso';
export type CommissionType = 'porcentaje' | 'fijo' | 'mixto';
export interface Reviewer { id: string; role: string }
export interface ZoneInput { name: string; latitude: number; longitude: number; radiusMeters: number; active?: boolean }
export interface CommissionInput { name: string; type: CommissionType; percentage: number; fixedAmount: number; minimum?: number; maximum?: number; currency: string }

/** Back-office operations of the transport module (UC-TRA-38..42). */
export interface TransportAdminRepository {
  liveTrips(): Promise<unknown[]>;
  disputes(status?: string): Promise<unknown[]>;
  resolveDispute(reviewer: Reviewer, disputeId: string, outcome: DisputeOutcome, resolution: string, amount: number | undefined, idempotencyKey: string): Promise<unknown>;
  createZone(reviewer: Reviewer, zone: ZoneInput): Promise<unknown>;
  updateZone(reviewer: Reviewer, zoneId: string, changes: Partial<ZoneInput>): Promise<unknown>;
  createCommissionRule(reviewer: Reviewer, rule: CommissionInput): Promise<unknown>;
}

const DISPUTE_STATES = ['abierta', 'en_revision', 'reembolso_solicitado', 'resuelta'];

export class TransportAdminHandler {
  private readonly reviewers: CarrierApprovalHandler;
  constructor(private readonly repository: TransportAdminRepository, approval: CarrierApprovalRepository) {
    this.reviewers = new CarrierApprovalHandler(approval);
  }
  private async reviewer(userId: string): Promise<Reviewer> { return { id: userId, role: await this.reviewers.assertReviewer(userId) }; }

  async liveTrips(userId: string) { await this.reviewer(userId); return this.repository.liveTrips(); }

  async disputes(userId: string, status?: string) {
    await this.reviewer(userId);
    if (status !== undefined && !DISPUTE_STATES.includes(status)) throw new DomainError('Invalid dispute status');
    return this.repository.disputes(status);
  }

  async resolveDispute(userId: string, disputeId: string, outcome: string, resolution: string, amount: number | undefined, key: string) {
    const reviewer = await this.reviewer(userId);
    if (!disputeId.trim()) throw new DomainError('Dispute id is required');
    if (!['reembolso_total', 'reembolso_parcial', 'sin_reembolso'].includes(outcome)) throw new DomainError('Invalid dispute outcome');
    if (!resolution.trim()) throw new DomainError('A resolution note is required');
    if (outcome === 'reembolso_parcial' && (amount === undefined || !Number.isFinite(amount) || amount <= 0)) throw new DomainError('A partial refund needs a positive amount');
    if (outcome !== 'reembolso_parcial' && amount !== undefined) throw new DomainError('Only a partial refund takes an amount');
    if (outcome !== 'sin_reembolso' && !key.trim()) throw new DomainError('Idempotency key is required to issue a refund');
    return this.repository.resolveDispute(reviewer, disputeId.trim(), outcome as DisputeOutcome, resolution.trim(),
      amount === undefined ? undefined : Math.round(amount * 100) / 100, key.trim());
  }

  async createZone(userId: string, zone: ZoneInput) { const reviewer = await this.reviewer(userId); return this.repository.createZone(reviewer, this.zone(zone, true) as ZoneInput); }
  async updateZone(userId: string, zoneId: string, changes: Partial<ZoneInput>) {
    const reviewer = await this.reviewer(userId);
    if (!zoneId.trim()) throw new DomainError('Zone id is required');
    const valid = this.zone(changes, false);
    if (!Object.keys(valid).length) throw new DomainError('Nothing to update');
    return this.repository.updateZone(reviewer, zoneId.trim(), valid);
  }

  async createCommissionRule(userId: string, rule: CommissionInput) {
    const reviewer = await this.reviewer(userId);
    if (!rule.name?.trim()) throw new DomainError('Commission rule name is required');
    if (!['porcentaje', 'fijo', 'mixto'].includes(rule.type)) throw new DomainError('Invalid commission type');
    if (!Number.isFinite(rule.percentage) || rule.percentage < 0 || rule.percentage > 1) throw new DomainError('Commission percentage must be between 0 and 1');
    if (!Number.isFinite(rule.fixedAmount) || rule.fixedAmount < 0) throw new DomainError('Fixed commission must be non-negative');
    if (rule.type === 'porcentaje' && (rule.percentage === 0 || rule.fixedAmount !== 0)) throw new DomainError('A percentage rule needs only a percentage');
    if (rule.type === 'fijo' && (rule.fixedAmount === 0 || rule.percentage !== 0)) throw new DomainError('A fixed rule needs only a fixed amount');
    if (rule.type === 'mixto' && (rule.fixedAmount === 0 || rule.percentage === 0)) throw new DomainError('A mixed rule needs a percentage and a fixed amount');
    for (const limit of [rule.minimum, rule.maximum]) if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) throw new DomainError('Commission limits must be non-negative');
    if (rule.minimum !== undefined && rule.maximum !== undefined && rule.maximum < rule.minimum) throw new DomainError('Maximum commission is below the minimum');
    if (!/^[A-Z]{3}$/.test(rule.currency)) throw new DomainError('Invalid currency');
    return this.repository.createCommissionRule(reviewer, { ...rule, name: rule.name.trim() });
  }

  private zone(zone: Partial<ZoneInput>, required: boolean): Partial<ZoneInput> {
    const out: Partial<ZoneInput> = {};
    if (zone.name !== undefined || required) { if (!zone.name?.trim()) throw new DomainError('Zone name is required'); out.name = zone.name.trim(); }
    if (zone.latitude !== undefined || zone.longitude !== undefined || required) {
      if (!Number.isFinite(zone.latitude) || zone.latitude! < -90 || zone.latitude! > 90 || !Number.isFinite(zone.longitude) || zone.longitude! < -180 || zone.longitude! > 180) throw new DomainError('Zone center is invalid');
      out.latitude = zone.latitude; out.longitude = zone.longitude;
    }
    if (zone.radiusMeters !== undefined || required) { if (!Number.isFinite(zone.radiusMeters) || zone.radiusMeters! <= 0 || zone.radiusMeters! > 500000) throw new DomainError('Zone radius must be between 0 and 500 km'); out.radiusMeters = zone.radiusMeters; }
    if (zone.active !== undefined) out.active = zone.active;
    return out;
  }
}
