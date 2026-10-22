import { DomainError } from '../shared/domain-error';
import { Location } from './value-objects/location';
import { TimeWindow } from './value-objects/time-window';
import { TransportRequest, TransportRequestStatus } from './transport-request';
import { Cargo } from './cargo';
import { Weight } from './value-objects/quantities';
import { CargoType } from './cargo';

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
    aggregate.selectCargoType(CargoType.MATERIALS);
    aggregate.startMatching();
    aggregate.markOffered();
    aggregate.assign('assignment-1');
    aggregate.startTrip();
    aggregate.complete();
    expect(aggregate.currentStatus).toBe(TransportRequestStatus.COMPLETED);
    const events = aggregate.pullDomainEvents();
    expect(events.map((event) => event.type)).toEqual([
      'TransportRequestCreated', 'TransportRequestOpened', 'TransportMatchingStarted',
      'TransportRequestOffered', 'TransportAssigned', 'TransportRequestInProgress', 'TransportRequestCompleted',
    ]);
    expect(events.map((event) => event.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(events[0]).toMatchObject({ schemaVersion: 1, payload: { requesterId: 'user-1' } });
    expect((events[0] as unknown as Record<string, unknown>).requesterId).toBeUndefined();
  });

  it('does not retain an assignment when the transition is invalid', () => {
    const aggregate = request();
    expect(() => aggregate.assign('assignment-1')).toThrow(DomainError);
    aggregate.open();
    aggregate.selectCargoType(CargoType.MATERIALS);
    aggregate.startMatching();
    expect(() => aggregate.assign('assignment-2')).not.toThrow();
  });

  it('requires a cargo type before matching', () => {
    const aggregate = request();
    aggregate.open();
    expect(() => aggregate.startMatching()).toThrow('Cargo type is required before matching');
  });

  it('does not allow a second active assignment', () => {
    const aggregate = request();
    aggregate.open();
    aggregate.selectCargoType(CargoType.MATERIALS);
    aggregate.markOffered();
    aggregate.assign('assignment-1');
    expect(() => aggregate.assign('assignment-2')).toThrow(DomainError);
  });

  it('rejects invalid lifecycle transitions', () => {
    expect(() => request().startTrip()).toThrow(DomainError);
  });

  it('releases an assignment and returns to matching', () => {
    const aggregate = request();
    aggregate.open();
    aggregate.selectCargoType(CargoType.MATERIALS);
    aggregate.startMatching();
    aggregate.assign('assignment-1');
    aggregate.releaseAssignment();
    expect(aggregate.currentStatus).toBe(TransportRequestStatus.MATCHING);
    expect(aggregate.currentAssignmentId).toBeUndefined();
  });
});
