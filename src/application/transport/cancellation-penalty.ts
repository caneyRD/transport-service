import { DomainError } from '../../domain/shared/domain-error';
export interface CancellationPenalty { baseAmount:number; rate:number; amount:number; currency:string; late:boolean; }
export class CancellationPenaltyHandler {
  execute(baseAmount:number,currency:string,scheduledAt:Date,now=new Date()):CancellationPenalty { if(!Number.isFinite(baseAmount)||baseAmount<0) throw new DomainError('Base amount must be non-negative'); if(!currency.trim()) throw new DomainError('Currency is required'); const hours=(scheduledAt.getTime()-now.getTime())/3600000; if(!Number.isFinite(hours)) throw new DomainError('Invalid scheduled date'); const rate=hours<2?.2:hours<12?.1:0; return {baseAmount,rate,amount:Math.round(baseAmount*rate*100)/100,currency,late:rate>0}; }
}
