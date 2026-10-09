import { randomUUID } from 'node:crypto';
import { Cargo } from '../../domain/transport/cargo';
import { Location } from '../../domain/transport/value-objects/location';
import { TimeWindow } from '../../domain/transport/value-objects/time-window';
import { Volume, Weight } from '../../domain/transport/value-objects/quantities';
import { TransportRequest } from '../../domain/transport/transport-request';
import { TransportRequestRepository } from './ports/transport-request.repository';

export interface CreateTransportRequestCommand {
  readonly requesterId: string;
  readonly cargo: {
    readonly description: string;
    readonly weightKg?: number;
    readonly volumeM3?: number;
  };
  readonly origin: {
    readonly address: string;
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly destination: {
    readonly address: string;
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly timeWindow: {
    readonly startsAt: Date;
    readonly endsAt: Date;
  };
}

export class CreateTransportRequestHandler {
  constructor(
    private readonly repository: TransportRequestRepository,
    private readonly generateId: () => string = randomUUID,
  ) {}

  async execute(command: CreateTransportRequestCommand): Promise<TransportRequest> {
    const cargo = Cargo.create({
      description: command.cargo.description,
      weight: command.cargo.weightKg === undefined ? undefined : Weight.create(command.cargo.weightKg),
      volume: command.cargo.volumeM3 === undefined ? undefined : Volume.create(command.cargo.volumeM3),
    });
    const request = TransportRequest.create({
      id: this.generateId(),
      requesterId: command.requesterId,
      cargo,
      origin: Location.create(command.origin.address, command.origin.latitude, command.origin.longitude),
      destination: Location.create(command.destination.address, command.destination.latitude, command.destination.longitude),
      timeWindow: TimeWindow.create(command.timeWindow.startsAt, command.timeWindow.endsAt),
    });

    // UC-TRA-51 covers saving a draft. UC-TRA-01 creates an open request.
    request.open();
    await this.repository.save(request);
    return request;
  }
}
