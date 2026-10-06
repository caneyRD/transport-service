import { DomainError } from '../shared/domain-error';
import { Location } from './value-objects/location';
import { TimeWindow } from './value-objects/time-window';
import { TransportRequest, TransportRequestStatus } from './transport-request';
import { Cargo } from './cargo';
import { Weight } from './value-objects/quantities';

const request = () => TransportRequest.create({
  id: 'request-1',
  requesterId: 'user-1',
  cargo: Cargo.create({ description: 'Pallets', weight: Weight.create(100) }),
  origin: Location.create('Santo Domingo', 18.48, -69.93),
  destination: Location.create('Baní', 18.28, -70.33),
  timeWindow: TimeWindow.create(new Date('2026-10-10T08:00:00Z'), new Date('2026-10-10T12:00:00Z')),
});

describe('TransportRequest', () => {
  it('enforces the operational lifecycle', () => {
    const aggregate = request();
    aggregate.open();
    aggregate.startMatching();
    aggregate.markOffered();
    aggregate.assign('assignment-1');
    aggregate.startTrip();
    aggregate.complete();
    expect(aggregate.currentStatus).toBe(TransportRequestStatus.COMPLETED);
    expect(aggregate.pullDomainEvents().map((event) => event.type)).toEqual([
      'TransportRequestCreated', 'TransportAssigned', 'TripStarted', 'TripCompleted',
    ]);
  });

  it('does not allow a second active assignment', () => {
    const aggregate = request();
    aggregate.open();
    aggregate.markOffered();
    aggregate.assign('assignment-1');
    expect(() => aggregate.assign('assignment-2')).toThrow(DomainError);
  });

  it('rejects invalid lifecycle transitions', () => {
    expect(() => request().startTrip()).toThrow(DomainError);
  });
});
