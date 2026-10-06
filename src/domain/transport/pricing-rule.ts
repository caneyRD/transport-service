import { DomainError } from '../shared/domain-error';
import { Money } from './value-objects/money';

export class PricingRule {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly basePrice: Money,
    readonly pricePerKm: Money,
    private active: boolean,
  ) {}

  static create(props: { id: string; name: string; basePrice: Money; pricePerKm: Money; active?: boolean }): PricingRule {
    if (!props.id.trim() || !props.name.trim()) throw new DomainError('Pricing rule id and name are required');
    return new PricingRule(props.id, props.name.trim(), props.basePrice, props.pricePerKm, props.active ?? true);
  }

  isActive(): boolean { return this.active; }
  disable(): void { this.active = false; }
  enable(): void { this.active = true; }
}
