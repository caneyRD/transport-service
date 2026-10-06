import { DomainError } from '../shared/domain-error';

export class MatchingCandidate {
  private constructor(
    readonly id: string,
    readonly requestId: string,
    readonly carrierId: string,
    readonly vehicleId: string,
    readonly score: number,
  ) {}

  static create(props: { id: string; requestId: string; carrierId: string; vehicleId: string; score: number }): MatchingCandidate {
    if (!props.id.trim() || !props.requestId.trim() || !props.carrierId.trim() || !props.vehicleId.trim()) {
      throw new DomainError('Matching candidate identifiers are required');
    }
    if (!Number.isFinite(props.score) || props.score < 0 || props.score > 1) {
      throw new DomainError('Matching score must be between 0 and 1');
    }
    return new MatchingCandidate(props.id, props.requestId, props.carrierId, props.vehicleId, props.score);
  }
}
