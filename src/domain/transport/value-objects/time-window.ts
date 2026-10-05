import { DomainError } from '../../shared/domain-error';

export class TimeWindow {
  private constructor(readonly startsAt: Date, readonly endsAt: Date) {}

  static create(startsAt: Date, endsAt: Date): TimeWindow {
    if (startsAt >= endsAt) throw new DomainError('Time window must end after it starts');
    return new TimeWindow(new Date(startsAt), new Date(endsAt));
  }
}
