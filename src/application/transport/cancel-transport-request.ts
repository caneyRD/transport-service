import { DomainError } from '../../domain/shared/domain-error';
import { TransportRequest } from '../../domain/transport/transport-request';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface CancelTransportRequestCommand {
  readonly requestId: string;
  readonly requesterId: string;
}

export class CancelTransportRequestHandler {
  constructor(private readonly repository: TransportRequestRepository) {}

  async execute(command: CancelTransportRequestCommand): Promise<TransportRequest> {
    const request = await this.repository.findById(command.requestId);
    if (!request) throw new DomainError(`Transport request ${command.requestId} was not found`);
    if (request.props.requesterId !== command.requesterId) throw new DomainError('Only the request owner can cancel the request');
    request.cancel();
    await this.repository.save(request);
    return request;
  }
}
