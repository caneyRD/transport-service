import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/shared/domain-error';
import { TrackingPoint } from '../../domain/transport/tracking-point';
import { Location } from '../../domain/transport/value-objects/location';
import { TransportException, TransportExceptionType } from '../../domain/transport/transport-exception';
export interface TripOperationsRepository {
  start(requestId:string,userId:string):Promise<unknown>;
  confirm?(requestId:string,userId:string):Promise<unknown>;
  track(userId:string,point:TrackingPoint,sourcePointId:string):Promise<unknown>;
  incident(userId:string,incident:TransportException):Promise<unknown>;
  milestone?(tripId:string,userId:string,milestone:TripMilestone):Promise<unknown>;
  evidence?(tripId:string,userId:string,input:TripEvidenceInput):Promise<unknown>;
  listEvidence?(tripId:string,userId:string):Promise<unknown[]>;
  verifyDeliveryOtp?(tripId:string,userId:string,otp:string,recipientName?:string,recipientDocument?:string):Promise<unknown>;
  rate?(tripId:string,userId:string,target:'carrier'|'client',score:number,comment?:string):Promise<unknown>;
  invoice?(tripId:string,userId:string):Promise<unknown>;
}
export type TripMilestone = 'CONFIRM_ASSIGNMENT' | 'DEPART_TO_ORIGIN' | 'CHECKIN_ORIGIN' | 'MARK_LOADED' | 'CHECKIN_DESTINATION' | 'UNLOAD' | 'COMPLETE_DELIVERY';
export type EvidenceStage = 'recogida' | 'entrega' | 'incidente';
export type EvidenceType = 'foto' | 'firma' | 'ticket_bascula' | 'documento';
export interface TripEvidenceInput { stage: EvidenceStage; type: EvidenceType; url: string; latitude?: number; longitude?: number; }
export class TripOperationsHandler {
  constructor(private readonly repository:TripOperationsRepository) {}
  start(requestId:string,userId:string) { return this.repository.start(requestId,userId); }
  confirm(requestId:string,userId:string) { if(!this.repository.confirm) throw new DomainError('Trip confirmation is not configured'); return this.repository.confirm(requestId,userId); }
  track(tripId:string,userId:string,input:{latitude:number;longitude:number;recordedAt:Date;sourcePointId:string}) {
    if(!input.sourcePointId.trim()||input.sourcePointId.length>200) throw new DomainError('Invalid source point id');
    if(input.recordedAt.getTime()>Date.now()+60000) throw new DomainError('Tracking date cannot be in the future');
    const point=TrackingPoint.create({id:randomUUID(),tripId,location:Location.create('GPS',input.latitude,input.longitude),recordedAt:input.recordedAt});
    return this.repository.track(userId,point,input.sourcePointId);
  }
  incident(tripId:string,userId:string,type:TransportExceptionType,description:string) {
    return this.repository.incident(userId,TransportException.create({id:randomUUID(),tripId,type,description}));
  }
  milestone(tripId:string,userId:string,milestone:TripMilestone) {
    if (!tripId.trim() || !userId.trim()) throw new DomainError('Trip and user are required');
    if (!['CONFIRM_ASSIGNMENT','DEPART_TO_ORIGIN','CHECKIN_ORIGIN','MARK_LOADED','CHECKIN_DESTINATION','UNLOAD','COMPLETE_DELIVERY'].includes(milestone)) throw new DomainError('Invalid trip milestone');
    if (!this.repository.milestone) throw new DomainError('Trip milestones are not configured');
    return this.repository.milestone(tripId,userId,milestone);
  }
  evidence(tripId:string,userId:string,input:TripEvidenceInput) {
    if (!tripId.trim() || !userId.trim()) throw new DomainError('Trip and user are required');
    if (!['recogida','entrega','incidente'].includes(input.stage) || !['foto','firma','ticket_bascula','documento'].includes(input.type)) throw new DomainError('Invalid evidence stage or type');
    if (!input.url.trim() || input.url.length > 2048) throw new DomainError('Evidence url is invalid');
    if (input.latitude !== undefined && (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90)) throw new DomainError('Evidence latitude is invalid');
    if (input.longitude !== undefined && (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180)) throw new DomainError('Evidence longitude is invalid');
    if (!this.repository.evidence) throw new DomainError('Trip evidence is not configured');
    return this.repository.evidence(tripId,userId,input);
  }
  listEvidence(tripId:string,userId:string) { if(!this.repository.listEvidence) throw new DomainError('Trip evidence is not configured'); return this.repository.listEvidence(tripId,userId); }
  verifyDeliveryOtp(tripId:string,userId:string,otp:string,recipientName?:string,recipientDocument?:string) {
    if (!/^\d{6}$/.test(otp)) throw new DomainError('Delivery OTP must contain 6 digits');
    if (!this.repository.verifyDeliveryOtp) throw new DomainError('Delivery OTP is not configured');
    return this.repository.verifyDeliveryOtp(tripId,userId,otp,recipientName,recipientDocument);
  }
  rate(tripId:string,userId:string,target:'carrier'|'client',score:number,comment?:string) {
    if (!['carrier','client'].includes(target)) throw new DomainError('Invalid rating target');
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new DomainError('Rating must be an integer from 1 to 5');
    if (comment !== undefined && (!comment.trim() || comment.length > 1000)) throw new DomainError('Rating comment is invalid');
    if (!this.repository.rate) throw new DomainError('Trip ratings are not configured');
    return this.repository.rate(tripId,userId,target,score,comment?.trim());
  }
  invoice(tripId:string,userId:string) {
    if (!this.repository.invoice) throw new DomainError('Trip invoices are not configured');
    return this.repository.invoice(tripId,userId);
  }
}
