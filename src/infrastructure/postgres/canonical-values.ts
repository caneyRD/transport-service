import { PoolClient, QueryResultRow } from 'pg';

const encodings: Record<string,string> = {"DRAFT": "borrador", "OPEN": "abierta", "MATCHING": "en_matching", "OFFERED": "con_ofertas", "ASSIGNED": "asignada", "IN_PROGRESS": "en_curso", "COMPLETED": "completada", "CANCELLED": "cancelada", "SUBMITTED": "enviada", "COUNTERED": "contraofertada", "ACCEPTED": "aceptada", "REJECTED": "rechazada", "WITHDRAWN": "retirada", "EXPIRED": "expirada", "CLIENT": "cliente", "CARRIER": "transportista", "PENDING": "pendiente", "ENABLED": "habilitado", "DISABLED": "deshabilitado", "SUSPENDED": "suspendido", "ACTIVE": "activa", "RELEASED": "liberada", "PLANNED": "programado", "AVAILABLE": "disponible", "UNAVAILABLE": "no_disponible", "DUMP_TRUCK": "volteo", "FLATBED": "plataforma", "OTHER": "otro", "M3": "m3", "TON": "ton", "FT": "pie", "MATERIALS": "materiales", "AGGREGATES": "agregados", "MACHINERY": "maquinaria", "DELAY": "retraso", "DAMAGE": "mercancia_danada", "BREAKDOWN": "averia", "ROUTE_DEVIATION": "desvio_ruta"};
const decodings: Record<string,string> = {"borrador": "DRAFT", "abierta": "OPEN", "en_matching": "MATCHING", "con_ofertas": "OFFERED", "asignada": "ASSIGNED", "en_curso": "IN_PROGRESS", "completada": "COMPLETED", "cancelada": "CANCELLED", "enviada": "SUBMITTED", "contraofertada": "COUNTERED", "aceptada": "ACCEPTED", "rechazada": "REJECTED", "retirada": "WITHDRAWN", "expirada": "EXPIRED", "cliente": "CLIENT", "transportista": "CARRIER", "pendiente": "PENDING", "habilitado": "ENABLED", "deshabilitado": "DISABLED", "suspendido": "SUSPENDED", "activa": "ACTIVE", "liberada": "RELEASED", "programado": "PLANNED", "disponible": "AVAILABLE", "no_disponible": "UNAVAILABLE", "volteo": "DUMP_TRUCK", "plataforma": "FLATBED", "otro": "OTHER", "m3": "M3", "ton": "TON", "pie": "FT", "materiales": "MATERIALS", "agregados": "AGGREGATES", "maquinaria": "MACHINERY", "retraso": "DELAY", "mercancia_danada": "DAMAGE", "averia": "BREAKDOWN", "desvio_ruta": "ROUTE_DEVIATION", "en_transito": "IN_PROGRESS", "cancelado": "CANCELLED", "entregado": "COMPLETED", "hacia_origen": "IN_PROGRESS", "en_origen": "IN_PROGRESS", "cargado": "IN_PROGRESS", "en_destino": "IN_PROGRESS", "descargado": "IN_PROGRESS"};
const columns: Record<string,string> = {"usuario_uid": "user_id", "dueno_uid": "owner_id", "solicitante_uid": "requester_id", "transportista_uid": "carrier_id", "solicitud_id": "request_id", "perfil_transportista_id": "driver_profile_id", "vehiculo_id": "vehicle_id", "asignacion_id": "assignment_id", "oferta_aceptada_id": "accepted_offer_id", "asignacion_activa_id": "active_assignment_id", "eliminado_en": "deleted_at", "creado_en": "created_at", "actualizado_en": "updated_at", "liberada_en": "released_at", "iniciado_en": "started_at", "entregado_en": "completed_at", "cancelado_en": "cancelled_at", "estado": "status", "origen_direccion": "origin_address", "origen_latitud": "origin_latitude", "origen_longitud": "origin_longitude", "destino_direccion": "destination_address", "destino_latitud": "destination_latitude", "destino_longitud": "destination_longitude", "ventana_recogida_desde": "window_starts_at", "ventana_recogida_hasta": "window_ends_at", "agregado_version": "aggregate_version", "version_fila": "row_version", "descripcion": "description", "tipo_carga": "cargo_type", "peso_kg": "weight_kg", "volumen_m3": "volume_m3", "monto": "amount", "moneda": "currency", "vigente_hasta": "valid_until", "oferta_padre_id": "parent_offer_id", "propuesta_por": "proposed_by", "ronda": "round", "puntuacion": "score", "distancia_km": "distance_km", "expira_en": "expires_at", "placa": "registration_number", "placa_normalizada": "registration_number_normalized", "tipo_carroceria": "body_type", "capacidad": "capacity_value", "unidad_capacidad": "capacity_unit", "capacidad_kg": "capacity_kg", "desde": "starts_at", "hasta": "ends_at", "viaje_id": "trip_id", "origen_actor": "source", "punto_origen_id": "source_point_id", "latitud": "latitude", "longitud": "longitude", "registrado_en": "recorded_at", "tipo": "type", "ocurrido_en": "occurred_at", "agregado_tipo": "aggregate_type", "agregado_uid": "aggregate_id", "id": "id", "tipo_evento": "event_type", "version_esquema": "schema_version", "correlacion_id": "correlation_id", "carga": "payload", "publicado_en": "published_at"};
export function encode(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const result = encodings[value];
  if (result === undefined) throw new Error('Unsupported transport enum value');
  return result;
}

/** Keep the public API's field names while persisting canonical Spanish columns. */
export function canonicalRows(client: PoolClient): PoolClient {
  return new Proxy(client, {
    get(target, property) {
      if (property !== 'query') {
        const value=Reflect.get(target,property);
        return typeof value==='function' ? value.bind(target) : value;
      }
      return async (sql: string, values?: unknown[]) => {
        const result=await target.query(sql,values);
        result.rows=result.rows.map((row: QueryResultRow) => {
          const mapped: QueryResultRow = {};
          for (const [key,value] of Object.entries(row)) {
            const name=columns[key] ?? key;
            mapped[name]=['status','cargo_type','body_type','capacity_unit','proposed_by','type'].includes(name)
              && typeof value==='string' ? decodings[value] ?? value : value;
          }
          if (sql.includes('FROM baney.outbox')) {
            mapped.event_id=row.id;
            if (row.creado_en !== undefined) mapped.occurred_at=row.creado_en;
          }
          if (row.reemplazada_por_contraoferta === true) mapped.status='COUNTERED';
          return mapped;
        });
        return result;
      };
    },
  });
}
