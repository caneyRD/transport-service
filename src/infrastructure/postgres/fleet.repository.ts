import { encode } from './canonical-values';
import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { Vehicle } from '../../domain/transport/vehicle';
import { CarrierRegistration } from '../../application/transport/register-carrier';
import { FleetRepository } from '../../application/transport/manage-fleet';

export class PostgresFleetRepository implements FleetRepository {
  constructor(private readonly client: PoolClient) {}
  async verification(userId: string): Promise<CarrierRegistration | undefined> {
    const result = await this.client.query(`SELECT id,usuario_uid AS "userId",estado FROM baney.perfil_transportista
      WHERE usuario_uid=$1 AND eliminado_en IS NULL FOR UPDATE`,[userId]);
    return result.rows[0];
  }
  async saveVehicle(v: Vehicle, editing: boolean) {
    // Serialize edits with assignments, which lock the same vehicle row.
    if (editing) {
      const owned = await this.client.query(`SELECT id FROM baney.vehiculo WHERE id=$1 AND dueno_uid=$2 AND eliminado_en IS NULL FOR UPDATE`,[v.id,v.ownerId]);
      if (!owned.rows.length) throw new DomainError('Vehicle was not found');
      const busy = await this.client.query(`SELECT id FROM baney.asignacion WHERE vehiculo_id=$1 AND estado='activa' AND eliminado_en IS NULL`,[v.id]);
      if (busy.rows.length) throw new DomainError('Vehicle already has an active assignment');
    }
    const values=[v.id,v.ownerId,v.registrationNumber,v.registrationNumberNormalized,encode(v.bodyType),v.capacityValue,encode(v.capacityUnit),v.capacityKg];
    const result=editing ? await this.client.query(`UPDATE baney.vehiculo SET placa=$3,
      placa_normalizada=$4,tipo_carroceria=$5,capacidad=$6,unidad_capacidad=$7,capacidad_kg=$8,
      estado='pendiente',actualizado_en=now() WHERE id=$1 AND dueno_uid=$2 RETURNING *`,values) :
      await this.client.query(`INSERT INTO baney.vehiculo(id,dueno_uid,placa,placa_normalizada,
      tipo_carroceria,capacidad,unidad_capacidad,capacidad_kg,estado) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pendiente') RETURNING *`,values);
    return result.rows[0];
  }
  async availability(userId: string, available: boolean, startsAt: Date, endsAt: Date) {
    const profile=await this.verification(userId);
    if (!profile) throw new DomainError('Carrier profile was not found');
    if (available && profile.status !== 'ENABLED') throw new DomainError('Only an enabled carrier can become available');
    const busy=await this.client.query(`SELECT id FROM baney.asignacion WHERE perfil_transportista_id=$1 AND estado='activa' AND eliminado_en IS NULL`,[profile.id]);
    if (busy.rows.length) throw new DomainError('Carrier already has an active assignment');
    // A new window replaces overlapping declarations, retaining non-overlapping history.
    const overlapping=await this.client.query(`SELECT * FROM baney.disponibilidad_transportista
      WHERE perfil_transportista_id=$1 AND desde<$3 AND hasta>$2 FOR UPDATE`,[profile.id,startsAt,endsAt]);
    for(const window of overlapping.rows) {
      await this.client.query('DELETE FROM baney.disponibilidad_transportista WHERE id=$1',[window.id]);
      const preserve=async (start:Date,end:Date)=>this.client.query(`INSERT INTO baney.disponibilidad_transportista
        (perfil_transportista_id,vehiculo_id,desde,hasta,estado) VALUES($1,$2,$3,$4,$5)`,[profile.id,window.vehicle_id,start,end,encode(window.status)]);
      if(new Date(window.starts_at)<startsAt) await preserve(new Date(window.starts_at),startsAt);
      if(new Date(window.ends_at)>endsAt) await preserve(endsAt,new Date(window.ends_at));
    }
    const result=await this.client.query(`INSERT INTO baney.disponibilidad_transportista(perfil_transportista_id,desde,hasta,estado)
      VALUES($1,$2,$3,$4) RETURNING *`,[profile.id,startsAt,endsAt,available ? 'disponible' : 'no_disponible']);
    return result.rows[0];
  }
}
