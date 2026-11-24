import { DomainError } from '../../domain/shared/domain-error';
export interface TripCallRequest { id:string; tripId:string; requestedBy:string; status:string; createdAt:Date }
export interface TripCallRepository { request(tripId:string,userId:string):Promise<TripCallRequest>; }
export class TripCallHandler { constructor(private readonly repository:TripCallRepository) {} request(tripId:string,userId:string){if(!tripId.trim()) throw new DomainError('Trip id is required');return this.repository.request(tripId,userId);} }
