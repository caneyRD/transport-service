import { encode } from './canonical-values';
import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { Vehicle } from '../../domain/transport/vehicle';
import { CarrierRegistration } from '../../application/transport/register-carrier';
import { CarrierLocation, FleetRepository, NearbyCarrier, NearbyCarriersQuery } from '../../application/transport/manage-fleet';

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
  async updateLocation(userId: string, location: CarrierLocation): Promise<CarrierLocation> {
    // Out-of-order reports never move the carrier back to an older position.
    const updated=await this.client.query(`UPDATE baney.perfil_transportista
      SET ultima_latitud=$2, ultima_longitud=$3, ultima_ubicacion_en=$4, actualizado_en=now()
      WHERE usuario_uid=$1 AND eliminado_en IS NULL AND (ultima_ubicacion_en IS NULL OR ultima_ubicacion_en<=$4)
      RETURNING ultima_latitud::float8 AS lat, ultima_longitud::float8 AS lng, ultima_ubicacion_en AS at`,
      [userId,location.latitude,location.longitude,location.recordedAt]);
    const row=updated.rows[0] ?? (await this.client.query(`SELECT ultima_latitud::float8 AS lat, ultima_longitud::float8 AS lng,
      ultima_ubicacion_en AS at FROM baney.perfil_transportista WHERE usuario_uid=$1 AND eliminado_en IS NULL`,[userId])).rows[0];
    if (!row) throw new DomainError('Carrier profile was not found');
    return { latitude: row.lat, longitude: row.lng, recordedAt: row.at };
  }
  async nearby(q: NearbyCarriersQuery): Promise<NearbyCarrier[]> {
    // Only enabled carriers with an enabled vehicle, available now, located in the
    // last minutes and without an active assignment. Positions are rounded to ~110 m
    // and the id is a daily opaque token: the client map never identifies a driver.
    const result=await this.client.query(`
      SELECT md5(p.id::text || current_date::text) AS token,
             round(p.ultima_latitud::numeric,3)::float8 AS lat, round(p.ultima_longitud::numeric,3)::float8 AS lng,
             round(d.km::numeric,1)::float8 AS km, p.ultima_ubicacion_en AS located_at,
             v.tipo_carroceria, v.capacidad::float8 AS capacidad, v.unidad_capacidad
        FROM baney.perfil_transportista p
        JOIN LATERAL (SELECT tipo_carroceria, capacidad, unidad_capacidad FROM baney.vehiculo v
               WHERE v.dueno_uid IN (p.usuario_uid, p.dueno_flota_uid) AND v.estado='habilitado' AND v.eliminado_en IS NULL
               ORDER BY v.capacidad_kg DESC LIMIT 1) v ON true
        CROSS JOIN LATERAL (SELECT 6371 * 2 * asin(sqrt(
               power(sin(radians(p.ultima_latitud::float8 - $1) / 2), 2) +
               cos(radians($1)) * cos(radians(p.ultima_latitud::float8)) *
               power(sin(radians(p.ultima_longitud::float8 - $2) / 2), 2))) AS km) d
       WHERE p.eliminado_en IS NULL AND p.estado='habilitado'
         AND p.ultima_latitud IS NOT NULL AND p.ultima_longitud IS NOT NULL
         AND p.ultima_ubicacion_en > now() - make_interval(mins => $5::int)
         AND p.ultima_latitud BETWEEN $1 - $3 / 111.0 AND $1 + $3 / 111.0
         AND (p.disponible OR EXISTS (SELECT 1 FROM baney.disponibilidad_transportista a WHERE a.perfil_transportista_id=p.id
               AND a.desde<=now() AND a.hasta>now() AND a.estado='disponible'))
         AND NOT EXISTS (SELECT 1 FROM baney.disponibilidad_transportista a WHERE a.perfil_transportista_id=p.id
               AND a.desde<=now() AND a.hasta>now() AND a.estado='no_disponible')
         AND NOT EXISTS (SELECT 1 FROM baney.asignacion s WHERE s.perfil_transportista_id=p.id AND s.estado='activa' AND s.eliminado_en IS NULL)
         AND d.km <= $3
       ORDER BY d.km, p.id
       LIMIT $4`,[q.latitude,q.longitude,q.radiusKm,q.limit,q.freshMinutes]);
    return result.rows.map(r=>({ id: r.token, latitude: r.lat, longitude: r.lng, distanceKm: r.km,
      bodyType: r.body_type, capacityValue: r.capacity_value ?? r.capacidad, capacityUnit: r.capacity_unit, updatedAt: r.located_at }));
  }
  async currentAvailability(userId: string) {
    // Same rule as matching: an UNAVAILABLE window wins over an AVAILABLE one.
    const result=await this.client.query(`SELECT a.estado, a.desde, a.hasta FROM baney.disponibilidad_transportista a
      JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id
      WHERE p.usuario_uid=$1 AND p.eliminado_en IS NULL AND a.desde<=now() AND a.hasta>now()
      ORDER BY (a.estado='no_disponible') DESC, a.desde DESC LIMIT 1`,[userId]);
    const row=result.rows[0];
    if (!row) return { available: false };
    return { available: row.status === 'AVAILABLE', startsAt: row.starts_at, endsAt: row.ends_at };
  }
}
