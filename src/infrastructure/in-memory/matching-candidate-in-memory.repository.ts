import { MatchingCandidate } from '../../domain/transport/matching-candidate';
import { MatchingCandidateRepository } from '../../application/transport/ports/matching-candidate.repository';

export class InMemoryMatchingCandidateRepository implements MatchingCandidateRepository {
  constructor(private readonly candidates: MatchingCandidate[] = []) {}

  async findByRequestId(requestId: string): Promise<MatchingCandidate[]> {
    return this.candidates
      .filter((candidate) => candidate.requestId === requestId)
      .sort((left, right) => {
        if (left.distanceKm === undefined && right.distanceKm !== undefined) return 1;
        if (left.distanceKm !== undefined && right.distanceKm === undefined) return -1;
        if (left.distanceKm !== undefined && right.distanceKm !== undefined && left.distanceKm !== right.distanceKm) {
          return left.distanceKm - right.distanceKm;
        }
        return right.score - left.score;
      });
  }
}
