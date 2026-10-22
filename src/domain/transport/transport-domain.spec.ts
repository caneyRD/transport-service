import { DomainError } from '../shared/domain-error';
import { Assignment, AssignmentStatus } from './assignment';
import { DriverProfile } from './driver-profile';
import { TrackingPoint } from './tracking-point';
import { Trip, TripStatus } from './trip';
import { TransportException, TransportExceptionType } from './transport-exception';
import { OfferActor, TransportOffer, TransportOfferStatus } from './transport-offer';
import { Vehicle, VehicleBodyType, VehicleCapacityUnit } from './vehicle';
import { Route } from './route';
import { Location } from './value-objects/location';
import { Money } from './value-objects/money';
import { Distance } from './value-objects/quantities';
import { MatchingCandidate } from './matching-candidate';

describe('Transport domain', () => {
  const enabledDriver = () => DriverProfile.create({ id: 'driver-1', userId: 'carrier-1', enabled: true });
  const enabledVehicle = () => Vehicle.create({ id: 'vehicle-1', ownerId: 'carrier-1', registrationNumber: 'A123456', capacityKg: 1000, enabled: true });

  it('validates and progresses an offer', () => {
    const offer = TransportOffer.create({
      id: 'offer-1', requestId: 'request-1', carrierId: 'carrier-1',
      price: Money.create(1500, 'DOP'), validUntil: new Date(Date.now() + 60_000), vehicleId: 'vehicle-1',
    });
    offer.submit();
    offer.accept();
    expect(offer.currentStatus).toBe(TransportOfferStatus.ACCEPTED);
    expect(offer.pullDomainEvents().map((event) => event.type)).toEqual(['TransportOfferSubmitted', 'TransportOfferAccepted']);
  });

  it('requires enabled driver and vehicle for assignment', () => {
    const driver = DriverProfile.create({ id: 'driver-1', userId: 'carrier-1' });
    const vehicle = enabledVehicle();
    expect(() => Assignment.create({ id: 'assignment-1', requestId: 'request-1', driver, vehicle })).toThrow(DomainError);
  });

  it('only starts a trip from an active assignment', () => {
    const assignment = Assignment.create({ id: 'assignment-1', requestId: 'request-1', driver: enabledDriver(), vehicle: enabledVehicle() });
    const trip = Trip.create({ id: 'trip-1', requestId: 'request-1', assignment });
    trip.start();
    trip.recordTrackingPoint(TrackingPoint.create({ id: 'point-1', tripId: 'trip-1', location: Location.create('Santo Domingo', 18.48, -69.93) }));
    trip.complete();
    expect(trip.currentStatus).toBe(TripStatus.COMPLETED);
    expect(assignment.currentStatus).toBe(AssignmentStatus.ACTIVE);
    expect(trip.pullDomainEvents().map((event) => event.type)).toEqual(['TripStarted', 'TrackingUpdated', 'TripCompleted']);
  });

  it('rejects tracking points with missing identity', () => {
    expect(() => TrackingPoint.create({ id: '', tripId: 'trip-1', location: Location.create('Baní', 18.28, -70.33) })).toThrow(DomainError);
  });

  it('creates a route with explicit distance and duration units', () => {
    const route = Route.create({
      id: 'route-1',
      origin: Location.create('Santo Domingo', 18.48, -69.93),
      destination: Location.create('Baní', 18.28, -70.33),
      distance: Distance.create(65),
      estimatedDurationMinutes: 90,
    });
    expect(route.distance.unit).toBe('km');
  });

  it('keeps matching scores within a normalized range', () => {
    const candidate = MatchingCandidate.create({ id: 'candidate-1', requestId: 'request-1', carrierId: 'carrier-1', vehicleId: 'vehicle-1', score: 0.85 });
    expect(candidate.score).toBe(0.85);
    expect(() => MatchingCandidate.create({ id: 'candidate-2', requestId: 'request-1', carrierId: 'carrier-1', vehicleId: 'vehicle-1', score: 2 })).toThrow(DomainError);
  });

  it('normalizes vehicle registration numbers and preserves capacity units', () => {
    const vehicle = Vehicle.create({
      id: 'vehicle-2',
      ownerId: 'carrier-1',
      registrationNumber: ' a-123 456 ',
      capacityKg: 12000,
      bodyType: VehicleBodyType.DUMP_TRUCK,
      capacityValue: 12,
      capacityUnit: VehicleCapacityUnit.M3,
    });
    expect(vehicle.registrationNumberNormalized).toBe('A123456');
    expect(vehicle.capacityValue).toBe(12);
    expect(vehicle.capacityUnit).toBe('M3');
  });

  it('supports counteroffers and expiration events', () => {
    const offer = TransportOffer.create({
      id: 'offer-2', requestId: 'request-1', carrierId: 'carrier-1',
      price: Money.create(1500, 'DOP'), validUntil: new Date(Date.now() + 60_000),
    });
    offer.submit();
    const counter = offer.counter({
      id: 'offer-3', price: Money.create(1700, 'DOP'), validUntil: new Date(Date.now() + 60_000),
      proposedBy: OfferActor.CLIENT,
    });
    expect(offer.currentStatus).toBe(TransportOfferStatus.COUNTERED);
    expect(counter.currentStatus).toBe(TransportOfferStatus.SUBMITTED);
    expect(counter.parentOfferId).toBe('offer-2');
    expect(counter.round).toBe(1);
    expect(counter.pullDomainEvents().map((event) => event.type)).toEqual(['TransportOfferSubmitted']);

    const expiring = TransportOffer.create({
      id: 'offer-4', requestId: 'request-1', carrierId: 'carrier-1',
      price: Money.create(1800, 'DOP'), validUntil: new Date(Date.now() + 60_000),
    });
    expiring.submit();
    expect(expiring.expire(new Date(Date.now() + 120_000))).toBe(true);
    expect(expiring.currentStatus).toBe(TransportOfferStatus.EXPIRED);
    expect(expiring.pullDomainEvents().map((event) => event.type)).toEqual([
      'TransportOfferSubmitted', 'TransportOfferExpired',
    ]);
  });

  it('requires a description for transport exceptions', () => {
    expect(() => TransportException.create({ id: 'exception-1', tripId: 'trip-1', type: TransportExceptionType.DELAY, description: ' ' })).toThrow(DomainError);
  });
});
