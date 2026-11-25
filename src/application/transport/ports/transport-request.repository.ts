import { TransportRequest } from '../../../domain/transport/transport-request';

export interface TransportRequestRepository {
  save(request: TransportRequest, expectedRowVersion?: number, idempotencyKey?: string): Promise<void>;
  findById(id: string): Promise<TransportRequest | undefined>;
  findByIdempotencyKey(requesterId: string, idempotencyKey: string): Promise<TransportRequest | undefined>;
  /** Closes the unassigned requests whose pickup window ended (all, or one requester's). Returns their ids. */
  expireStale?(requesterId?: string): Promise<string[]>;
  /** True when the request was closed because nobody took it in time. */
  isExpired?(requestId: string): Promise<boolean>;
  addCargoPhoto?(requestId: string, requesterId: string, url: string): Promise<{ id: string; requestId: string; url: string }>;
}
