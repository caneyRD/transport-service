import { TripOperationsHandler, TripOperationsRepository } from './trip-operations';
import { TransportExceptionType } from '../../domain/transport/transport-exception';
describe('Trip operation validation',()=>{
 const repository:TripOperationsRepository={start:jest.fn(),track:jest.fn(async (_user,point)=>point),incident:jest.fn(async (_user,incident)=>incident),milestone:jest.fn(async (_trip,_user,milestone)=>({milestone}))};
 const handler=new TripOperationsHandler(repository);
 it('rejects invalid GPS coordinates, dates and idempotency identifiers',async()=>{
   const point={latitude:18,longitude:-69,recordedAt:new Date(),sourcePointId:'one'};
   expect(()=>handler.track('trip','carrier',{...point,latitude:NaN})).toThrow('Latitude');
   expect(()=>handler.track('trip','carrier',{...point,recordedAt:new Date('invalid')})).toThrow('date');
   expect(()=>handler.track('trip','carrier',{...point,recordedAt:new Date(Date.now()+3600000)})).toThrow('future');
   expect(()=>handler.track('trip','carrier',{...point,sourcePointId:''})).toThrow('source');
 });
 it('validates each supported incident type and trims descriptions',async()=>{
   for(const type of [TransportExceptionType.OTHER,TransportExceptionType.BREAKDOWN,TransportExceptionType.DELAY,TransportExceptionType.DAMAGE]) {
     const incident=await handler.incident('trip','carrier',type,' Incident ') as {description:string};expect(incident.description).toBe('Incident');
   }
   expect(()=>handler.incident('trip','carrier','unknown' as TransportExceptionType,'x')).toThrow('type');
   expect(()=>handler.incident('trip','carrier',TransportExceptionType.DAMAGE,' ')).toThrow('description');
 });
 it('accepts the ordered operational milestones and rejects invalid names',async()=>{
   for(const milestone of ['CONFIRM_ASSIGNMENT','DEPART_TO_ORIGIN','CHECKIN_ORIGIN','MARK_LOADED','CHECKIN_DESTINATION','UNLOAD','COMPLETE_DELIVERY'] as const) await handler.milestone('trip','carrier',milestone);
   expect(repository.milestone).toHaveBeenCalledTimes(7);
   expect(()=>handler.milestone('trip','carrier','SKIP' as never)).toThrow('Invalid trip milestone');
 });
 it('validates POD evidence before persistence',async()=>{
   const evidence=jest.fn(async (_trip:string,_user:string,input:unknown)=>input);
   const handlerWithEvidence=new TripOperationsHandler({...repository,evidence});
   await handlerWithEvidence.evidence('trip','carrier',{stage:'entrega',type:'firma',url:'https://files.test/signature.png',latitude:18.4,longitude:-69.9});
   expect(evidence).toHaveBeenCalled();
   expect(()=>handlerWithEvidence.evidence('trip','carrier',{stage:'bad' as never,type:'firma',url:'x'})).toThrow('stage');
   expect(()=>handlerWithEvidence.evidence('trip','carrier',{stage:'entrega',type:'firma',url:'',})).toThrow('url');
 });
 it('requires a six-digit delivery OTP',async()=>{
   const verifyDeliveryOtp=jest.fn(async()=>({status:'DELIVERED'}));
   const handlerWithOtp=new TripOperationsHandler({...repository,verifyDeliveryOtp});
   expect(()=>handlerWithOtp.verifyDeliveryOtp('trip','carrier','123')).toThrow('6 digits');
   await expect(handlerWithOtp.verifyDeliveryOtp('trip','carrier','123456')).resolves.toMatchObject({status:'DELIVERED'});
 });
 it('validates participant ratings and score bounds',async()=>{
   const rate=jest.fn(async (_trip,_user,target,score) => ({target,score}));
   const handlerWithRating=new TripOperationsHandler({...repository,rate});
   await expect(handlerWithRating.rate('trip','client','carrier',5,'Good service')).resolves.toEqual({target:'carrier',score:5});
   expect(()=>handlerWithRating.rate('trip','client','carrier',6)).toThrow('1 to 5');
   expect(()=>handlerWithRating.rate('trip','client','unknown' as never,4)).toThrow('target');
 });
 it('delegates invoice retrieval through the trip participant boundary',async()=>{
   const invoice=jest.fn(async()=>({id:'invoice-1',status:'aceptada_dgii'}));
   await expect(new TripOperationsHandler({...repository,invoice}).invoice('trip','client')).resolves.toEqual({id:'invoice-1',status:'aceptada_dgii'});
   expect(invoice).toHaveBeenCalledWith('trip','client');
 });
});
