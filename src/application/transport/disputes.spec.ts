import { TransportDisputesHandler } from './disputes';
describe('Transport disputes and refunds',()=>{
  const repo={open:jest.fn(async()=>({id:'d-1',status:'abierta'})),requestRefund:jest.fn(async()=>({id:'r-1',status:'solicitado'}))};
  it('opens a validated dispute',async()=>{await expect(new TransportDisputesHandler(repo).open('u','t','mercancia_danada','Golpe',100)).resolves.toEqual({id:'d-1',status:'abierta'});});
  it('requests a bounded idempotent refund',async()=>{await expect(new TransportDisputesHandler(repo).refund('u','d',50,'Daño','key')).resolves.toMatchObject({status:'solicitado'});expect(()=>new TransportDisputesHandler(repo).refund('u','d',0,'x','k')).toThrow('positive');});
});
