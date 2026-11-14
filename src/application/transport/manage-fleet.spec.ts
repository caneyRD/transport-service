import { ManageFleetHandler, FleetRepository } from './manage-fleet';
import { VehicleBodyType, VehicleCapacityUnit } from '../../domain/transport/vehicle';
describe('Fleet use cases',()=>{
  const repository: FleetRepository={verification:jest.fn(async userId=>({id:'driver',userId,status:'ENABLED' as const})),saveVehicle:jest.fn(async v=>v),availability:jest.fn(async()=>({}))};
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
});

