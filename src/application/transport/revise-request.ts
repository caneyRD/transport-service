import { DomainError } from '../../domain/shared/domain-error';
import { Cargo } from '../../domain/transport/cargo';
import { Location } from '../../domain/transport/value-objects/location';
import { TimeWindow } from '../../domain/transport/value-objects/time-window';
import { Weight, Volume } from '../../domain/transport/value-objects/quantities';
import { TransportRequestRepository } from './ports/transport-request.repository';
import { CreateTransportRequestCommand, CreateTransportRequestHandler } from './create-transport-request';

export interface ReviseRequest {
  cargo?: {description?: string;weightKg?: number;volumeM3?: number};
  origin?: {address:string;latitude:number;longitude:number};
  destination?: {address:string;latitude:number;longitude:number};
  timeWindow?: {startsAt:Date;endsAt:Date};
}
export class ReviseRequestHandler {
  constructor(private readonly requests: TransportRequestRepository) {}
  async schedule(command: CreateTransportRequestCommand, now=new Date()) {
    this.futureWindow(command.timeWindow,now);
    return new CreateTransportRequestHandler(this.requests).execute(command);
  }
  private futureWindow(window: {startsAt:Date;endsAt:Date},now:Date) {
    const result=TimeWindow.create(window.startsAt,window.endsAt);
    if (result.startsAt<=now) throw new DomainError('Pickup window must be in the future');
    return result;
  }
  async execute(requestId:string,userId:string,changes:ReviseRequest,now=new Date()) {
    const request=await this.requests.findById(requestId);
    if (!request) throw new DomainError('Transport request was not found');
    if (request.props.requesterId!==userId) throw new DomainError('Only the request owner can modify it');
    if (!Object.values(changes).some(v=>v!==undefined)) throw new DomainError('At least one change is required');
    const old=request.props.cargo;
    const cargo=changes.cargo ? Cargo.create({description:changes.cargo.description??old.description,
      weight:changes.cargo.weightKg===undefined ? old.weight : Weight.create(changes.cargo.weightKg),
      volume:changes.cargo.volumeM3===undefined ? old.volume : Volume.create(changes.cargo.volumeM3)}) : undefined;
    if(cargo && old.cargoType) cargo.selectType(old.cargoType);
    const origin=changes.origin ? Location.create(changes.origin.address,changes.origin.latitude,changes.origin.longitude) : undefined;
    const destination=changes.destination ? Location.create(changes.destination.address,changes.destination.latitude,changes.destination.longitude) : undefined;
    const timeWindow=changes.timeWindow ? this.futureWindow(changes.timeWindow,now) : undefined;
    request.revise({cargo,origin,destination,timeWindow});
    await this.requests.save(request);
    return request;
  }
}
