import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { Vehicle } from '../../domain/transport/vehicle';
import { CarrierRegistration } from '../../application/transport/register-carrier';
import { FleetRepository } from '../../application/transport/manage-fleet';

export class PostgresFleetRepository implements FleetRepository {
  constructor(private readonly client: PoolClient) {}
  async verification(userId: string): Promise<CarrierRegistration | undefined> {
    const result = await this.client.query(`SELECT id,user_id AS "userId",status FROM transport.driver_profiles
      WHERE user_id=$1 AND deleted_at IS NULL FOR UPDATE`,[userId]);
    return result.rows[0];
  }
  async saveVehicle(v: Vehicle, editing: boolean) {
    // Serialize edits with assignments, which lock the same vehicle row.
    if (editing) {
      const owned = await this.client.query(`SELECT id FROM transport.vehicles WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE`,[v.id,v.ownerId]);
      if (!owned.rows.length) throw new DomainError('Vehicle was not found');
      const busy = await this.client.query(`SELECT id FROM transport.assignments WHERE vehicle_id=$1 AND status='ACTIVE' AND deleted_at IS NULL`,[v.id]);
      if (busy.rows.length) throw new DomainError('Vehicle already has an active assignment');
    }
    const values=[v.id,v.ownerId,v.registrationNumber,v.registrationNumberNormalized,v.bodyType,v.capacityValue,v.capacityUnit,v.capacityKg];
    const result=editing ? await this.client.query(`UPDATE transport.vehicles SET registration_number=$3,
      registration_number_normalized=$4,body_type=$5,capacity_value=$6,capacity_unit=$7,capacity_kg=$8,
      status='PENDING',updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *`,values) :
      await this.client.query(`INSERT INTO transport.vehicles(id,owner_id,registration_number,registration_number_normalized,
      body_type,capacity_value,capacity_unit,capacity_kg,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING') RETURNING *`,values);
    return result.rows[0];
  }
  async availability(userId: string, available: boolean, startsAt: Date, endsAt: Date) {
    const profile=await this.verification(userId);
    if (!profile) throw new DomainError('Carrier profile was not found');
    if (available && profile.status !== 'ENABLED') throw new DomainError('Only an enabled carrier can become available');
    const busy=await this.client.query(`SELECT id FROM transport.assignments WHERE driver_profile_id=$1 AND status='ACTIVE' AND deleted_at IS NULL`,[profile.id]);
    if (busy.rows.length) throw new DomainError('Carrier already has an active assignment');
    // A new window replaces overlapping declarations, retaining non-overlapping history.
    await this.client.query(`DELETE FROM transport.driver_availability WHERE driver_profile_id=$1 AND starts_at<$3 AND ends_at>$2`,[profile.id,startsAt,endsAt]);
    const result=await this.client.query(`INSERT INTO transport.driver_availability(driver_profile_id,starts_at,ends_at,status)
      VALUES($1,$2,$3,$4) RETURNING *`,[profile.id,startsAt,endsAt,available ? 'AVAILABLE' : 'UNAVAILABLE']);
    return result.rows[0];
  }
}
