import { DomainError } from '../../domain/shared/domain-error';
import { Money } from '../../domain/transport/value-objects/money';

export interface PriceRuleInput { basePrice: Money; pricePerKm: Money; commissionRate: number; fixedCommission?: Money; minimumCommission?: Money; maximumCommission?: Money; }
export interface PriceBreakdown { distanceKm: number; base: Money; distanceCharge: Money; estimated: Money; commission: Money; payout: Money; }

export class CalculatePriceHandler {
  execute(distanceKm: number, rule: PriceRuleInput): PriceBreakdown {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new DomainError('Distance must be positive');
    if (rule.basePrice.currency !== rule.pricePerKm.currency) throw new DomainError('Pricing rule currencies must match');
    if (!Number.isFinite(rule.commissionRate) || rule.commissionRate < 0 || rule.commissionRate > 1) throw new DomainError('Commission rate must be between 0 and 1');
    const currency=rule.basePrice.currency;
    const round=(n:number)=>Math.round(n*100)/100;
    const estimated=round(rule.basePrice.amount + distanceKm*rule.pricePerKm.amount);
    let commission=round(estimated*rule.commissionRate + (rule.fixedCommission?.amount ?? 0));
    if (rule.minimumCommission && rule.minimumCommission.currency !== currency) throw new DomainError('Commission currencies must match');
    if (rule.maximumCommission && rule.maximumCommission.currency !== currency) throw new DomainError('Commission currencies must match');
    if (rule.minimumCommission) commission=Math.max(commission,rule.minimumCommission.amount);
    if (rule.maximumCommission) commission=Math.min(commission,rule.maximumCommission.amount);
    commission=round(Math.min(commission,estimated));
    return { distanceKm:Number(distanceKm.toFixed(3)), base:Money.create(rule.basePrice.amount,currency), distanceCharge:Money.create(round(distanceKm*rule.pricePerKm.amount),currency), estimated:Money.create(estimated,currency), commission:Money.create(commission,currency), payout:Money.create(round(estimated-commission),currency) };
  }
}
