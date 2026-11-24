import { DomainError } from '../../domain/shared/domain-error';
export interface TripMessage { id:string; tripId:string; senderId:string; body:string; sentAt:Date }
export interface TripChatRepository { send(tripId:string,userId:string,body:string):Promise<TripMessage>; list(tripId:string,userId:string,limit:number,offset:number):Promise<TripMessage[]>; }
export class TripChatHandler {
 constructor(private readonly repository:TripChatRepository) {}
 send(tripId:string,userId:string,body:string){ if(!tripId.trim()||!body.trim()||body.length>4000) throw new DomainError('Trip and message body are required'); return this.repository.send(tripId,userId,body.trim()); }
 list(tripId:string,userId:string,limit=50,offset=0){ if(!Number.isInteger(limit)||limit<1||limit>100) throw new DomainError('Limit must be between 1 and 100'); if(!Number.isInteger(offset)||offset<0) throw new DomainError('Offset must be non-negative'); return this.repository.list(tripId,userId,limit,offset); }
}
