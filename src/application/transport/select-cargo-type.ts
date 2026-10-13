import { DomainError } from '../../domain/shared/domain-error';
import { CargoType } from '../../domain/transport/cargo';
import { TransportRequest } from '../../domain/transport/transport-request';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface SelectCargoTypeCommand {
  readonly requestId: string;
  readonly type: CargoType;
}

export class SelectCargoTypeHandler {
  constructor(private readonly repository: TransportRequestRepository) {}

  async execute(command: SelectCargoTypeCommand): Promise<TransportRequest> {
    const request = await this.repository.findById(command.requestId);
    if (!request) throw new DomainError(`Transport request ${command.requestId} was not found`);

    request.selectCargoType(command.type);
    await this.repository.save(request);
    return request;
  }
}
