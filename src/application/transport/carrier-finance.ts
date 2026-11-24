import { DomainError } from '../../domain/shared/domain-error';

export interface CarrierEarning { id:string; type:string; amount:number; currency:string; status:string; description:string; date:Date; tripId?:string }
export interface CarrierPayout { id:string; amount:number; netAmount:number; currency:string; status:string; requestedAt:Date }
export interface CarrierFinanceRepository {
  earnings(userId:string, limit:number, offset:number):Promise<{balance:number;currency:string;items:CarrierEarning[]}>;
  requestPayout(userId:string, amount:number, bankAccountId:string, idempotencyKey:string):Promise<CarrierPayout>;
  schedulePayout?(userId:string,frequency:'diaria'|'semanal'|'quincenal'|'mensual'|'manual',minimumAmount:number):Promise<unknown>;
}
export class CarrierFinanceHandler {
  constructor(private readonly repository:CarrierFinanceRepository) {}
  earnings(userId:string, limit=25, offset=0) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError('Limit must be between 1 and 100');
    if (!Number.isInteger(offset) || offset < 0) throw new DomainError('Offset must be non-negative');
    return this.repository.earnings(userId,limit,offset);
  }
  payout(userId:string, amount:number, bankAccountId:string, idempotencyKey:string) {
    if (!Number.isFinite(amount) || amount <= 0) throw new DomainError('Payout amount must be positive');
    if (!bankAccountId.trim()) throw new DomainError('Bank account is required');
    if (!idempotencyKey.trim() || idempotencyKey.length > 100) throw new DomainError('Idempotency key is required');
    return this.repository.requestPayout(userId,Math.round(amount*100)/100,bankAccountId,idempotencyKey);
  }
  schedule(userId:string,frequency:'diaria'|'semanal'|'quincenal'|'mensual'|'manual',minimumAmount:number) { if(!this.repository.schedulePayout) throw new DomainError('Payout scheduling is not configured'); if(!['diaria','semanal','quincenal','mensual','manual'].includes(frequency)) throw new DomainError('Invalid payout frequency'); if(!Number.isFinite(minimumAmount)||minimumAmount<0) throw new DomainError('Minimum payout amount must be non-negative'); return this.repository.schedulePayout(userId,frequency,Math.round(minimumAmount*100)/100); }
}
