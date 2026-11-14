import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { TrackingPoint } from '../../domain/transport/tracking-point';
import { Location } from '../../domain/transport/value-objects/location';
import { TransportException, TransportExceptionType } from '../../domain/transport/transport-exception';
export interface TripOperationsRepository {
  start(requestId:string,userId:string):Promise<unknown>;
  track(userId:string,point:TrackingPoint,sourcePointId:string):Promise<unknown>;
  incident(userId:string,incident:TransportException):Promise<unknown>;
}
export class TripOperationsHandler {
  constructor(private readonly repository:TripOperationsRepository) {}
  start(requestId:string,userId:string) { return this.repository.start(requestId,userId); }
  track(tripId:string,userId:string,input:{latitude:number;longitude:number;recordedAt:Date;sourcePointId:string}) {
    if(!input.sourcePointId.trim()||input.sourcePointId.length>200) throw new DomainError('Invalid source point id');
    if(input.recordedAt.getTime()>Date.now()+60000) throw new DomainError('Tracking date cannot be in the future');
    const point=TrackingPoint.create({id:randomUUID(),tripId,location:Location.create('GPS',input.latitude,input.longitude),recordedAt:input.recordedAt});
    return this.repository.track(userId,point,input.sourcePointId);
  }
  incident(tripId:string,userId:string,type:TransportExceptionType,description:string) {
    return this.repository.incident(userId,TransportException.create({id:randomUUID(),tripId,type,description}));
  }
}
