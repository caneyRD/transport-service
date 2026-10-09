import { TransportRequest } from '../../../domain/transport/transport-request';

export interface TransportRequestRepository {
  save(request: TransportRequest): Promise<void>;
  findById(id: string): Promise<TransportRequest | undefined>;
}
