import { TripOperationsHandler, TripOperationsRepository } from './trip-operations';
import { TransportExceptionType } from '../../domain/transport/transport-exception';
describe('Trip operation validation',()=>{
 const repository:TripOperationsRepository={start:jest.fn(),track:jest.fn(async (_user,point)=>point),incident:jest.fn(async (_user,incident)=>incident)};
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
});
