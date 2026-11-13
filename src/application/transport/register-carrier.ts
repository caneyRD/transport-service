import { DomainError } from '../../domain/shared/domain-error';

export interface CarrierRegistration {
  id: string;
  userId: string;
  status: 'PENDING' | 'ENABLED' | 'DISABLED' | 'SUSPENDED';
}

export interface CarrierRepository {
  register(userId: string): Promise<CarrierRegistration>;
}

/** Registration never grants permission to carry loads; approval remains separate. */
export class RegisterCarrierHandler {
  constructor(private readonly carriers: CarrierRepository) {}
  async execute(userId: string): Promise<CarrierRegistration> {
    if (!userId.trim()) throw new DomainError('Carrier user id is required');
    return this.carriers.register(userId);
  }
}
