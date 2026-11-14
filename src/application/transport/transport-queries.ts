import { TransportOfferStatus } from '../../domain/transport/transport-offer';
import { DomainError } from '../../domain/shared/domain-error';
import { TransportRequestStatus } from '../../domain/transport/transport-request';
import { TransportRequestRepository } from './ports/transport-request.repository';
import { TransportOfferRepository } from './ports/transport-offer.repository';
import { FleetRepository } from './manage-fleet';
import { CalculateRouteHandler } from './calculate-route';
import { ViewReceivedOffersHandler } from './view-received-offers';
export interface TripHistoryRepository { history(userId:string,limit:number,offset:number):Promise<unknown[]>; }
export class TransportQueries {
  constructor(private readonly requests:TransportRequestRepository,private readonly offers:TransportOfferRepository,private readonly fleet:FleetRepository,private readonly trips:TripHistoryRepository) {}
  async history(userId:string,limit=25,offset=0) {
    if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0) throw new DomainError('Invalid history pagination');
    return this.trips.history(userId,limit,offset);
  }
  async compare(requestId:string,userId:string) {
    const offers=await new ViewReceivedOffersHandler(this.requests,this.offers).execute({requestId,requesterId:userId});
    return offers.filter(o=>o.currentStatus===TransportOfferStatus.SUBMITTED).sort((a,b)=>a.price.currency.localeCompare(b.price.currency)||a.price.amount-b.price.amount||a.id.localeCompare(b.id));
  }
  async carrierRequest(requestId:string,userId:string) {
    const profile=await this.fleet.verification(userId);
    if(profile?.status!=='ENABLED') throw new DomainError('Only an enabled carrier can inspect requests');
    const request=await this.requests.findById(requestId);
    if(!request || ![TransportRequestStatus.OPEN,TransportRequestStatus.MATCHING,TransportRequestStatus.OFFERED].includes(request.currentStatus)) throw new DomainError('Request is not available for offers');
    return request;
  }
  async route(requestId:string,userId:string) {
    await this.carrierRequest(requestId,userId);
    return new CalculateRouteHandler(this.requests).execute(requestId);
  }
}
