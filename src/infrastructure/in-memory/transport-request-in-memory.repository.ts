import { TransportRequest } from '../../domain/transport/transport-request';
import { TransportRequestRepository } from '../../application/transport/ports/transport-request.repository';
import { DomainError } from '../../domain/shared/domain-error';

export class InMemoryTransportRequestRepository implements TransportRequestRepository {
  private readonly requests = new Map<string, TransportRequest>();
  private readonly rowVersions = new Map<string, number>();
  private readonly idempotencyKeys = new Map<string, string>();

  async save(request: TransportRequest, expectedRowVersion?: number, idempotencyKey?: string): Promise<void> {
    const currentVersion = this.rowVersions.get(request.props.id);
    if (expectedRowVersion !== undefined && currentVersion !== expectedRowVersion) {
      throw new DomainError(`Transport request ${request.props.id} changed concurrently`);
    }
    this.requests.set(request.props.id, request);
    this.rowVersions.set(request.props.id, (currentVersion ?? 0) + 1);
    if (idempotencyKey) this.idempotencyKeys.set(`${request.props.requesterId}:${idempotencyKey}`, request.props.id);
  }

  async findById(id: string): Promise<TransportRequest | undefined> {
    return this.requests.get(id);
  }

  async findByIdempotencyKey(requesterId: string, idempotencyKey: string): Promise<TransportRequest | undefined> {
    const requestId = this.idempotencyKeys.get(`${requesterId}:${idempotencyKey}`);
    return requestId ? this.findById(requestId) : undefined;
  }
}
