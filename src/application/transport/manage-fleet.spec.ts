import { ManageFleetHandler, FleetRepository } from './manage-fleet';
import { VehicleBodyType, VehicleCapacityUnit } from '../../domain/transport/vehicle';
describe('Fleet use cases',()=>{
  const repository: FleetRepository={verification:jest.fn(async userId=>({id:'driver',userId,status:'ENABLED' as const})),saveVehicle:jest.fn(async v=>v),availability:jest.fn(async()=>({})),updateLocation:jest.fn(async(_u,l)=>l),nearby:jest.fn(async()=>[])};
  const handler=new ManageFleetHandler(repository);
  const input={registrationNumber:' A-123 ',bodyType:VehicleBodyType.DUMP_TRUCK,capacityValue:20,capacityUnit:VehicleCapacityUnit.M3,capacityKg:20000};
  it('normalizes plate and registers a vehicle disabled pending approval',async()=>{
    const vehicle=await handler.vehicle('owner',input) as {registrationNumberNormalized:string;isEnabled():boolean};
    expect(vehicle.registrationNumberNormalized).toBe('A123'); expect(vehicle.isEnabled()).toBe(false);
  });
  it('rejects incompatible capacities and invalid availability windows',async()=>{
    await expect(handler.vehicle('owner',{...input,capacityUnit:VehicleCapacityUnit.TON})).rejects.toThrow('cubic');
    await expect(handler.vehicle('owner',{...input,capacityKg:-1})).rejects.toThrow('positive');
    await expect(handler.availability('owner',true,new Date('invalid'),new Date())).rejects.toThrow('period');
    await expect(handler.availability('owner',false,new Date(),new Date(0))).rejects.toThrow('period');
  });
  it('validates carrier location reports',async()=>{
    const now=new Date('2030-01-01T12:00:00Z');
    await expect(handler.updateLocation('owner',{latitude:18.47,longitude:-69.93,recordedAt:now},now)).resolves.toMatchObject({latitude:18.47});
    await expect(handler.updateLocation('owner',{latitude:120,longitude:-69,recordedAt:now},now)).rejects.toThrow('Latitude');
    await expect(handler.updateLocation('owner',{latitude:18,longitude:-200,recordedAt:now},now)).rejects.toThrow('Longitude');
    await expect(handler.updateLocation('owner',{latitude:18,longitude:-69,recordedAt:new Date(now.getTime()+5*60_000)},now)).rejects.toThrow('future');
    await expect(handler.updateLocation('owner',{latitude:18,longitude:-69,recordedAt:new Date(now.getTime()-60*60_000)},now)).rejects.toThrow('too old');
  });
  it('bounds the nearby search and only considers fresh positions',async()=>{
    await handler.nearby(18.47,-69.93);
    expect(repository.nearby).toHaveBeenLastCalledWith({latitude:18.47,longitude:-69.93,radiusKm:15,limit:30,freshMinutes:5});
    await expect(handler.nearby(18,-69,0)).rejects.toThrow('Radius');
    await expect(handler.nearby(18,-69,51)).rejects.toThrow('Radius');
    await expect(handler.nearby(18,-69,10,51)).rejects.toThrow('Limit');
    await expect(handler.nearby(18,-69,10,1.5)).rejects.toThrow('Limit');
  });
});
