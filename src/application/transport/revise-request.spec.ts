import { ReviseRequestHandler } from './revise-request';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { CargoType } from '../../domain/transport/cargo';
describe('Request scheduling and revision',()=>{
 const repository=new InMemoryTransportRequestRepository(), handler=new ReviseRequestHandler(repository);
 const input=()=>({requesterId:'owner',cargo:{description:'gravel',weightKg:200,volumeM3:1},origin:{address:'a',latitude:18,longitude:-69},destination:{address:'b',latitude:19,longitude:-70},timeWindow:{startsAt:new Date('2040-01-01'),endsAt:new Date('2040-01-02')}});
 it('schedules future requests and changes cargo retaining its type',async()=>{
   const request=await handler.schedule(input());request.selectCargoType(CargoType.AGGREGATES);
   await handler.execute(request.props.id,'owner',{cargo:{weightKg:300}});
   expect(request.props.cargo.weight?.value).toBe(300);expect(request.props.cargo.volume?.value).toBe(1);expect(request.props.cargo.cargoType).toBe(CargoType.AGGREGATES);
 });
 it('rejects past windows, invalid dimensions, foreign owners and changes after matching',async()=>{
   await expect(handler.schedule({...input(),timeWindow:{startsAt:new Date(0),endsAt:new Date(1000)}})).rejects.toThrow('future');
   const request=await handler.schedule(input());
   await expect(handler.execute(request.props.id,'foreign',{cargo:{weightKg:300}})).rejects.toThrow('owner');
   await expect(handler.execute(request.props.id,'owner',{cargo:{volumeM3:0}})).rejects.toThrow('positive');
   request.selectCargoType(CargoType.AGGREGATES);request.startMatching();
   await expect(handler.execute(request.props.id,'owner',{cargo:{weightKg:300}})).rejects.toThrow('before matching');
 });
});
