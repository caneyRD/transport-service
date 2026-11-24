import { DomainError } from '../../domain/shared/domain-error';
export type DisputeReason='cobro_incorrecto'|'cobro_duplicado'|'cargo_no_autorizado'|'servicio_no_prestado'|'mercancia_danada'|'mercancia_faltante'|'no_es_lo_acordado'|'retraso'|'mal_trato'|'otro';
export interface TransportDisputeRepository { open(userId:string,tripId:string,reason:DisputeReason,description:string,amount:number):Promise<unknown>; requestRefund(userId:string,disputeId:string,amount:number,reason:string,idempotencyKey:string):Promise<unknown>; }
export class TransportDisputesHandler {
  constructor(private readonly repository:TransportDisputeRepository) {}
  open(userId:string,tripId:string,reason:DisputeReason,description:string,amount:number) {
    if(!tripId.trim()||!description.trim()) throw new DomainError('Trip and description are required');
    if(!Number.isFinite(amount)||amount<=0) throw new DomainError('Dispute amount must be positive');
    return this.repository.open(userId,tripId,reason,description,Math.round(amount*100)/100);
  }
  refund(userId:string,disputeId:string,amount:number,reason:string,key:string) {
    if(!disputeId.trim()||!reason.trim()) throw new DomainError('Dispute and refund reason are required');
    if(!Number.isFinite(amount)||amount<=0) throw new DomainError('Refund amount must be positive');
    if(!key.trim()) throw new DomainError('Idempotency key is required');
    return this.repository.requestRefund(userId,disputeId,Math.round(amount*100)/100,reason,key);
  }
}
