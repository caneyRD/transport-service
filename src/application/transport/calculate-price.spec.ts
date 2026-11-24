import { CalculatePriceHandler } from './calculate-price';
import { Money } from '../../domain/transport/value-objects/money';

describe('Transport price and payout calculation',()=>{
  it('returns estimated price, commission and carrier payout with a breakdown',()=>{
    const result=new CalculatePriceHandler().execute(100,{basePrice:Money.create(1000,'DOP'),pricePerKm:Money.create(20,'DOP'),commissionRate:.1});
    expect(result).toMatchObject({distanceKm:100,estimated:{amount:3000,currency:'DOP'},commission:{amount:300},payout:{amount:2700},distanceCharge:{amount:2000}});
  });
  it('honors commission limits and rejects invalid rules',()=>{
    const handler=new CalculatePriceHandler();
    const result=handler.execute(10,{basePrice:Money.create(100,'DOP'),pricePerKm:Money.create(10,'DOP'),commissionRate:.01,minimumCommission:Money.create(50,'DOP')});
    expect(result.commission.amount).toBe(50);
    expect(()=>handler.execute(0,{basePrice:Money.create(1,'DOP'),pricePerKm:Money.create(1,'DOP'),commissionRate:0})).toThrow('Distance');
    expect(()=>handler.execute(1,{basePrice:Money.create(1,'DOP'),pricePerKm:Money.create(1,'DOP'),commissionRate:2})).toThrow('Commission');
  });
});
