import { MatchingCandidate } from '../../../domain/transport/matching-candidate';

export interface MatchingCandidateRepository {
  findByRequestId(requestId: string): Promise<MatchingCandidate[]>;
}
