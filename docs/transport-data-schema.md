# Esquema de datos propuesto — Transporte BANEY

Fecha: 15 de octubre de 2026  
Repositorio: `caneyRD/transport-service`  
Alcance: diseño lógico para revisión del equipo; no crea migraciones ni una base de datos.

## 1. Criterios del diseño

- Transporte es dueño de sus propias tablas e invariantes.
- `authServiceCaney` sigue siendo dueño de usuarios, credenciales, roles y sesiones.
- `requester_id`, `carrier_id` y `user_id` son referencias externas. No deben tener foreign keys hacia la base de Auth.
- Los identificadores propios del servicio pueden ser UUID. Los identificadores provenientes de Auth se conservan como `text` para no acoplar el esquema a una implementación externa.
- Fechas y horas se guardan en UTC como `timestamptz`.
- Dinero usa `numeric(12,2)` más `char(3)` para moneda.
- Peso, volumen y distancia conservan unidades explícitas en el nombre de la columna: `weight_kg`, `volume_m3`, `distance_km`.
- El estado de cada agregado se controla en el dominio; la base de datos agrega restricciones de integridad, no reemplaza las reglas de negocio.

## 2. Relación principal

```text
transport_requests 1──1 transport_cargos
transport_requests 1──N transport_offers
transport_requests 1──N matching_candidates
transport_requests 1──0..1 assignments
assignments         1──0..1 trips
trips               1──0..1 routes
trips               1──N tracking_points
trips               1──N transport_exceptions
driver_profiles     1──N assignments
vehicles            1──N assignments
```

## 3. Tablas del servicio

### `transport_requests`

Agregado raíz de Transporte.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `requester_id` | `text` | ID externo de Auth; requerido |
| `status` | enum | `DRAFT`, `OPEN`, `MATCHING`, `OFFERED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `origin_address` | `text` | Snapshot de origen |
| `origin_latitude` | `numeric(9,6)` | Entre -90 y 90 |
| `origin_longitude` | `numeric(9,6)` | Entre -180 y 180 |
| `destination_address` | `text` | Snapshot de destino |
| `destination_latitude` | `numeric(9,6)` | Entre -90 y 90 |
| `destination_longitude` | `numeric(9,6)` | Entre -180 y 180 |
| `window_starts_at` | `timestamptz` | Menor que `window_ends_at` |
| `window_ends_at` | `timestamptz` | Mayor que `window_starts_at` |
| `active_assignment_id` | `uuid` nullable | Se completa al asignar; puede resolverse también desde `assignments` |
| `version` | `integer` | Optimistic locking; inicia en 1 |
| `created_at` | `timestamptz` | Requerido |
| `updated_at` | `timestamptz` | Requerido |
| `cancelled_at` | `timestamptz` nullable | Se completa al cancelar |

Índices: `(requester_id, created_at desc)`, `(status, window_starts_at)`, `(status)`.

### `transport_cargos`

Parte 1:1 del agregado `TransportRequest`. Permite implementar `UC-TRA-01` y `UC-TRA-02` sin crear una tabla de catálogo de tipos.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK a `transport_requests.id`, UNIQUE |
| `description` | `text` | Requerida |
| `cargo_type` | enum nullable | `MATERIALS`, `AGGREGATES`, `MACHINERY`, `OTHER`; requerida antes de matching |
| `weight_kg` | `numeric(12,3)` nullable | Positiva si existe |
| `volume_m3` | `numeric(12,3)` nullable | Positiva si existe |
| `created_at` | `timestamptz` | Requerido |
| `updated_at` | `timestamptz` | Requerido |

### `driver_profiles`

Perfil operativo local del transportista. La identidad y autenticación permanecen en Auth.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `text` | ID externo de Auth; UNIQUE |
| `status` | enum | `PENDING`, `ENABLED`, `DISABLED`, `SUSPENDED` |
| `created_at` | `timestamptz` | Requerido |
| `updated_at` | `timestamptz` | Requerido |

### `vehicles`

Vehículos habilitados para matching y asignación.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `owner_id` | `text` | ID externo del transportista |
| `registration_number` | `text` | UNIQUE |
| `vehicle_type` | `text` | Catálogo posterior; no acoplarlo a Marketplace |
| `capacity_kg` | `numeric(12,3)` | Positiva |
| `status` | enum | `PENDING`, `ENABLED`, `DISABLED`, `SUSPENDED` |
| `created_at` | `timestamptz` | Requerido |
| `updated_at` | `timestamptz` | Requerido |

Índices: `(owner_id, status)`, `(status, capacity_kg)`.

### `matching_candidates`

Resultado temporal o persistido del matching.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK a solicitud |
| `driver_profile_id` | `uuid` | FK a perfil local |
| `vehicle_id` | `uuid` | FK a vehículo local |
| `score` | `numeric(5,4)` | Entre 0 y 1 |
| `distance_km` | `numeric(12,3)` nullable | Distancia calculada |
| `expires_at` | `timestamptz` nullable | Vencimiento del resultado |
| `created_at` | `timestamptz` | Requerido |

Índice: `(request_id, score desc)`. Restricción recomendada: UNIQUE `(request_id, vehicle_id)` mientras el candidato esté vigente.

### `transport_offers`

Ofertas y contraofertas asociadas a una solicitud.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK a solicitud |
| `carrier_id` | `text` | ID externo de Auth |
| `vehicle_id` | `uuid` nullable | FK a vehículo local |
| `amount` | `numeric(12,2)` | No negativa |
| `currency` | `char(3)` | ISO 4217 |
| `status` | enum | `DRAFT`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `EXPIRED` |
| `valid_until` | `timestamptz` | Requerido |
| `parent_offer_id` | `uuid` nullable | Para contraofertas |
| `created_at` | `timestamptz` | Requerido |
| `updated_at` | `timestamptz` | Requerido |

Índices: `(request_id, created_at desc)`, `(carrier_id, status)`, `(status, valid_until)`.

### `assignments`

Asignación confirmada entre solicitud, transportista/conductor y vehículo.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK a solicitud |
| `driver_profile_id` | `uuid` | FK a perfil habilitado |
| `vehicle_id` | `uuid` | FK a vehículo habilitado |
| `status` | enum | `ACTIVE`, `RELEASED`, `COMPLETED` |
| `assigned_at` | `timestamptz` | Requerido |
| `released_at` | `timestamptz` nullable | Se completa al liberar |
| `completed_at` | `timestamptz` nullable | Se completa al completar |

Restricción crítica: solo una asignación `ACTIVE` por `request_id`. En PostgreSQL se recomienda un índice único parcial: `UNIQUE(request_id) WHERE status = 'ACTIVE'`.

### `trips`

Ejecución operacional de una asignación.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `request_id` | `uuid` | FK a solicitud, UNIQUE |
| `assignment_id` | `uuid` | FK a asignación, UNIQUE |
| `route_id` | `uuid` nullable | FK a ruta |
| `status` | enum | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `started_at` | `timestamptz` nullable | Requerido al iniciar |
| `completed_at` | `timestamptz` nullable | Requerido al completar |
| `created_at` | `timestamptz` | Requerido |
| `updated_at` | `timestamptz` | Requerido |

### `routes`

Ruta calculada y datos de ETA. La integración concreta con proveedor de mapas queda pendiente.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `origin_address` | `text` | Snapshot |
| `origin_latitude` | `numeric(9,6)` | Coordenada válida |
| `origin_longitude` | `numeric(9,6)` | Coordenada válida |
| `destination_address` | `text` | Snapshot |
| `destination_latitude` | `numeric(9,6)` | Coordenada válida |
| `destination_longitude` | `numeric(9,6)` | Coordenada válida |
| `distance_km` | `numeric(12,3)` | Positiva |
| `estimated_duration_minutes` | `integer` | Positivo |
| `provider` | `text` nullable | Proveedor externo |
| `provider_route_id` | `text` nullable | Referencia externa |
| `calculated_at` | `timestamptz` | Requerido |

### `tracking_points`

Posiciones observadas del viaje.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `trip_id` | `uuid` | FK a viaje |
| `latitude` | `numeric(9,6)` | Entre -90 y 90 |
| `longitude` | `numeric(9,6)` | Entre -180 y 180 |
| `recorded_at` | `timestamptz` | Orden cronológico por viaje |
| `source` | `text` nullable | GPS, app, proveedor, etc. |
| `accuracy_meters` | `numeric(10,2)` nullable | No negativa |

Índice: `(trip_id, recorded_at desc)`.

### `pricing_rules`

Reglas versionadas para cálculo de precio. No se usa para cobrar ni liquidar hasta definir el contrato con Pagos.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `name` | `text` | Requerido |
| `base_amount` | `numeric(12,2)` | No negativa |
| `price_per_km` | `numeric(12,2)` | No negativa |
| `currency` | `char(3)` | ISO 4217 |
| `active` | `boolean` | Requerido |
| `effective_from` | `timestamptz` | Requerido |
| `effective_until` | `timestamptz` nullable | Mayor que inicio |
| `created_at` | `timestamptz` | Requerido |

### `transport_exceptions`

Incidentes relacionados con un viaje.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `trip_id` | `uuid` | FK a viaje |
| `type` | enum | `DELAY`, `DAMAGE`, `BREAKDOWN`, `ROUTE_DEVIATION`, `OTHER` |
| `description` | `text` | Requerida |
| `occurred_at` | `timestamptz` | Requerido |
| `resolved_at` | `timestamptz` nullable | Se completa al resolver |
| `created_at` | `timestamptz` | Requerido |

### `transport_domain_events`

Outbox para publicar eventos sin perderlos cuando se agregue mensajería.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `event_id` | `uuid` | PK |
| `aggregate_id` | `uuid` | Requerido |
| `aggregate_type` | `text` | Requerido |
| `event_type` | `text` | Requerido |
| `aggregate_version` | `integer` | UNIQUE con `aggregate_id` |
| `correlation_id` | `text` | Requerido |
| `payload` | `jsonb` | Nunca incluir secretos o tokens |
| `occurred_at` | `timestamptz` | Requerido |
| `published_at` | `timestamptz` nullable | Null mientras esté pendiente |
| `attempts` | `integer` | Inicia en 0 |

Índices: `(published_at, occurred_at)` y `(aggregate_id, aggregate_version)`.

## 4. Implementación por etapa

### Sprint 3 — solicitud y disponibilidad

Tablas necesarias para `UC-TRA-01` a `UC-TRA-07`:

- `transport_requests`
- `transport_cargos`
- `driver_profiles`
- `vehicles`
- `matching_candidates`
- `transport_offers`
- `assignments`

### Sprint 4 — routing y ETA

Agregar:

- `trips`
- `routes`
- `tracking_points`

### Etapas posteriores

- `pricing_rules`
- `transport_exceptions`
- `transport_domain_events`
- Integraciones con Payments, Notifications, Chat y Disputas mediante contratos/eventos.

## 5. Decisiones que debe confirmar el equipo

1. PostgreSQL será la base elegida.
2. Se usarán UUID para IDs propios y `text` para IDs externos de Auth.
3. Si las coordenadas requerirán PostGIS o bastan columnas numéricas en el primer MVP.
4. Proveedor de mapas y cálculo de ETA.
5. Política de retención de `tracking_points`.
6. Si las ofertas y contraofertas serán filas separadas relacionadas por `parent_offer_id`.
7. Si el outbox se implementa desde el primer sprint o después de estabilizar los casos de uso.

## 6. Nota de alcance

Este documento es una propuesta de esquema lógico para revisión de Backend, DB/DevOps y el equipo de dominio. No crea tablas ni migraciones. La migración debe generarse después de confirmar estas decisiones y los criterios de aceptación de los casos de uso.
