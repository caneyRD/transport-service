import { CarrierFinanceHandler } from './carrier-finance';

describe('Carrier earnings and payouts',()=>{
  const repository={
    earnings:jest.fn(async()=>({balance:2500,currency:'DOP',items:[]})),
    requestPayout:jest.fn(async (_u:string,amount:number,bank:string)=>({id:'p-1',amount,netAmount:amount,currency:'DOP',status:'solicitado',requestedAt:new Date(),bank})),
    schedulePayout:jest.fn(async (_u:string,frequency:string,minimumAmount:number)=>({frequency,minimumAmount,active:true}))
  };
  it('lists earnings with bounded pagination',async()=>{
    await expect(new CarrierFinanceHandler(repository).earnings('carrier',50,10)).resolves.toMatchObject({balance:2500});
    expect(repository.earnings).toHaveBeenCalledWith('carrier',50,10);
  });
  it('validates and requests an idempotent payout',async()=>{
    await expect(new CarrierFinanceHandler(repository).payout('carrier',100.129,'bank-1','idem-1')).resolves.toMatchObject({amount:100.13});
    expect(repository.requestPayout).toHaveBeenCalledWith('carrier',100.13,'bank-1','idem-1');
    expect(()=>new CarrierFinanceHandler(repository).payout('carrier',0,'bank','idem')).toThrow('positive');
    expect(()=>new CarrierFinanceHandler(repository).earnings('carrier',101,0)).toThrow('between');
  });
  it('configures an automatic payout schedule',async()=>{await expect(new CarrierFinanceHandler(repository).schedule('carrier','semanal',500)).resolves.toMatchObject({frequency:'semanal',minimumAmount:500});expect(()=>new CarrierFinanceHandler(repository).schedule('carrier','bad' as never,0)).toThrow('frequency');});
});
