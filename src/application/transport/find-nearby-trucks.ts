import { DomainError } from '../../domain/shared/domain-error';
import { MatchingCandidate } from '../../domain/transport/matching-candidate';
import { TransportRequestRepository } from './ports/transport-request.repository';
import { MatchingCandidateRepository } from './ports/matching-candidate.repository';

export interface FindNearbyTrucksCommand {
  requestId: string;
  maxDistanceKm?: number;
}

export class FindNearbyTrucksHandler {
  constructor(
    private readonly requests: TransportRequestRepository,
    private readonly candidates: MatchingCandidateRepository,
  ) {}

  async execute(command: FindNearbyTrucksCommand): Promise<MatchingCandidate[]> {
    if (!command.requestId.trim()) throw new DomainError('Transport request id is required');
    if (command.maxDistanceKm !== undefined && (!Number.isFinite(command.maxDistanceKm) || command.maxDistanceKm < 0)) {
      throw new DomainError('Maximum distance must be non-negative');
    }
    const request = await this.requests.findById(command.requestId);
    if (!request) throw new DomainError(`Transport request ${command.requestId} was not found`);
    const results = await this.candidates.findByRequestId(command.requestId);
    if (command.maxDistanceKm === undefined) return results;
    return results.filter((candidate) => candidate.distanceKm !== undefined && candidate.distanceKm <= command.maxDistanceKm!);
  }
}
