import { TransportRequest } from '../../../domain/transport/transport-request';

export interface TransportRequestRepository {
  save(request: TransportRequest, expectedRowVersion?: number, idempotencyKey?: string): Promise<void>;
  findById(id: string): Promise<TransportRequest | undefined>;
  findByIdempotencyKey(requesterId: string, idempotencyKey: string): Promise<TransportRequest | undefined>;
  addCargoPhoto?(requestId: string, requesterId: string, url: string): Promise<{ id: string; requestId: string; url: string }>;
}
