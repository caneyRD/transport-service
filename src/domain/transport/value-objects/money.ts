import { DomainError } from '../../shared/domain-error';

export class Money {
  private constructor(readonly amount: number, readonly currency: string) {}

  static create(amount: number, currency: string): Money {
    if (!Number.isFinite(amount) || amount < 0) throw new DomainError('Money amount must be a non-negative number');
    if (!/^[A-Z]{3}$/.test(currency)) throw new DomainError('Currency must be an ISO 4217 code');
    return new Money(amount, currency);
  }
}
