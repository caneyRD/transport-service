import { TransportRequest } from '../../domain/transport/transport-request';
import { TransportRequestRepository } from '../../application/transport/ports/transport-request.repository';

export class InMemoryTransportRequestRepository implements TransportRequestRepository {
  private readonly requests = new Map<string, TransportRequest>();

  async save(request: TransportRequest): Promise<void> {
    this.requests.set(request.props.id, request);
  }

  async findById(id: string): Promise<TransportRequest | undefined> {
    return this.requests.get(id);
  }
}
