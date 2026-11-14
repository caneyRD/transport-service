import { TransportQueries } from './transport-queries';
import { InMemoryTransportRequestRepository } from '../../infrastructure/in-memory/transport-request-in-memory.repository';
import { InMemoryTransportOfferRepository } from '../../infrastructure/in-memory/transport-offer-in-memory.repository';
import { CreateTransportRequestHandler } from './create-transport-request';
import { TransportOffer } from '../../domain/transport/transport-offer';
import { Money } from '../../domain/transport/value-objects/money';
describe('Transport read use cases',()=>{
 it('compares submitted offers within currencies and excludes withdrawn offers',async()=>{
   const requests=new InMemoryTransportRequestRepository(),offers=new InMemoryTransportOfferRepository();
   const request=await new CreateTransportRequestHandler(requests).execute({requesterId:'owner',cargo:{description:'load'},origin:{address:'a',latitude:18,longitude:-69},destination:{address:'b',latitude:19,longitude:-70},timeWindow:{startsAt:new Date('2040-01-01'),endsAt:new Date('2040-01-02')}});
   for(const [id,amount,currency] of [['expensive',200,'DOP'],['cheap',100,'DOP'],['usd',5,'USD'],['withdrawn',1,'DOP']] as const) {
     const offer=TransportOffer.create({id,requestId:request.props.id,carrierId:'carrier',price:Money.create(amount,currency),validUntil:new Date(Date.now()+3600000)});
     offer.submit();if(id==='withdrawn')offer.withdraw();await offers.save(offer);
   }
   const query=new TransportQueries(requests,offers,{verification:async()=>undefined,saveVehicle:jest.fn(),availability:jest.fn()},{history:jest.fn()});
   expect((await query.compare(request.props.id,'owner')).map(o=>o.id)).toEqual(['cheap','expensive','usd']);
   await expect(query.compare(request.props.id,'foreign')).rejects.toThrow('owner');
   await expect(query.carrierRequest(request.props.id,'pending')).rejects.toThrow('enabled');
 });
});
