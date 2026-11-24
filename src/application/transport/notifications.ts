import { DomainError } from '../../domain/shared/domain-error';
export interface TransportNotification { id:string; category:string; title:string; body:string; payload:unknown; status:string; readAt?:Date; createdAt:Date }
export interface TransportNotificationRepository { list(userId:string,limit:number,offset:number):Promise<TransportNotification[]>; markRead(userId:string,id:string):Promise<TransportNotification>; }
export class TransportNotificationsHandler {
  constructor(private readonly repository:TransportNotificationRepository) {}
  list(userId:string,limit=25,offset=0) { if(!Number.isInteger(limit)||limit<1||limit>100) throw new DomainError('Limit must be between 1 and 100'); if(!Number.isInteger(offset)||offset<0) throw new DomainError('Offset must be non-negative'); return this.repository.list(userId,limit,offset); }
  read(userId:string,id:string) { if(!id.trim()) throw new DomainError('Notification id is required'); return this.repository.markRead(userId,id); }
}
