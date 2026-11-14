# BANEY Transport Service

Backend del bounded context **Transporte** de BANEY.

## Alcance inicial

Este repositorio implementa el dominio de Transporte. No contiene frontend ni reglas de Identidad, Marketplace, Pagos o Facturaci贸n.

El agregado ra铆z es `TransportRequest`, con las entidades y conceptos del primer modelo de Transporte:

- `Cargo`
- `Route`
- `TransportOffer`
- `Assignment`
- `Trip`
- `Vehicle`
- `DriverProfile`
- `TrackingPoint`
- `PricingRule`
- `TransportException`

Las cantidades conservan unidades expl铆citas mediante `Weight` (kg), `Volume` (m3) y `Distance` (km).

El modelo tambi茅n implementa:

- `TransportOffer` con env铆o, aceptaci贸n, rechazo y retiro.
- `MatchingCandidate` con puntuaci贸n normalizada para el proceso de matching.
- `Assignment` con validaci贸n de transportista y veh铆culo habilitados.
- `Trip` con inicio, finalizaci贸n y cancelaci贸n expl铆citos.
- Eventos `TransportRequestCreated`, `TransportAssigned`, `TripStarted` y `TripCompleted`.
- Evento `TrackingUpdated` emitido por el agregado `Trip` con versionado por viaje.

## Casos de uso implementados

- `UC-TRA-01`: Crear solicitud de transporte.
- `UC-TRA-02`: Seleccionar tipo de carga.
- `UC-TRA-03`: Ver camiones cercanos disponibles.
- `UC-TRA-04`: Ver ofertas recibidas.
- `UC-TRA-05`: Aceptar oferta.
- `UC-TRA-06`: Contraofertar precio.
- `UC-TRA-07`: Cancelar solicitud.
- `UC-TRA-08`: Trackear viaje en vivo (consulta los puntos del viaje activo).

Los casos de uso crean y modifican solicitudes y ofertas mediante puertos de repositorio. El servicio incluye un adapter PostgreSQL transaccional y adapters en memoria para pruebas. Las escrituras publican eventos en `transport.outbox_events` dentro de la misma transacci贸n.

El esquema l贸gico propuesto para la futura base de datos est谩 documentado en [`docs/transport-data-schema.md`](./docs/transport-data-schema.md). Incluye la revisi贸n de consistencia del 13 de octubre y todav铆a requiere aprobaci贸n del equipo de Arquitectura/DB/DevOps antes de crear migraciones.

La definici贸n SQL base para PostgreSQL est谩 en [`database/schema.sql`](./database/schema.sql). La migraci贸n incremental [`database/migrations/001_transport_persistence.sql`](./database/migrations/001_transport_persistence.sql) agrega control de versiones y soporte de contraofertas sobre el esquema unificado.

## Estados de `TransportRequest`

`DRAFT -> OPEN -> MATCHING -> OFFERED -> ASSIGNED -> IN_PROGRESS -> COMPLETED`

Una solicitud tambi茅n puede cancelarse en los estados permitidos. Las transiciones son expl铆citas y no se permite una segunda asignaci贸n activa.

## Arquitectura

La l贸gica de negocio vive en `src/domain`; la infraestructura PostgreSQL est谩 en `src/infrastructure/postgres` y la API HTTP en `src/http`.

Las referencias a usuarios, transportistas y veh铆culos se manejan mediante identificadores estables. Este servicio no accede directamente a las tablas internas de `authServiceCaney`.

## Desarrollo

```bash
npm install
npm run db:migrate   # requiere DATABASE_URL y VPN; aplica migraciones pendientes
npm run db:check     # comprobaci贸n de conexi贸n y tablas de Transporte
npm test
npm run build
```

La API protege los casos de uso con JWT firmado por `authServiceCaney`. Configura `JWT_ISSUER` y `JWT_AUDIENCE`, m谩s `JWT_PUBLIC_KEY` para RS256 o `JWT_SECRET` para HS256. No se incluye una credencial real en el repositorio. La fecha de avance del cronograma es el 5 de noviembre de 2026: UC-TRA-01 a UC-TRA-08 est谩n implementados y persistidos. UC-TRA-09, UC-TRA-43, UC-TRA-44, UC-TRA-45 y UC-TRA-50 siguen pendientes del sprint actual.

## Registro de transportista (UC-TRA-19)

`POST /carriers/me` requiere JWT y un objeto JSON (puede ser `{}`). Registra al usuario autenticado en `transport.driver_profiles` con estado `PENDING`; responde 200 con `id`, `userId` y `status`. Los reintentos devuelven el mismo perfil y conservan su estado. Un perfil archivado requiere soporte (409). El registro no habilita al transportista ni sustituye KYC. No requiere migraciones nuevas.

Validaci髇 del 13 de noviembre de 2026: 53 pruebas exitosas, incluyendo PostgreSQL por VPN con fixtures revertidos; compilaci髇 y lint exitosos. Cronograma actualizado en `outputs/cronograma-2026-11-13/`.

### Flota y disponibilidad (UC-TRA-21 a UC-TRA-24)

- `GET /carriers/me/verification`: estado operativo persistido del perfil autenticado (PENDING/ENABLED/DISABLED/SUSPENDED).
- `POST /vehicles`, `PUT /vehicles/:id`: placa, tipo, capacityValue, capacityUnit y capacityKg. Requiere perfil registrado; solo el propietario edita, sin asignaci髇 activa. Altas y modificaciones requieren aprobaci髇 (`PENDING`).
- `PUT /carriers/me/availability`: available boolean, startsAt y endsAt ISO. Activar exige perfil habilitado; no se permite durante una asignaci髇 activa. Reemplaza ventanas solapadas. Las ventanas UNAVAILABLE vigentes excluyen matching y asignaciones.

Persistencia compatible con vehicles y driver_availability existentes. 58 pruebas exitosas con PostgreSQL por VPN, compilaci髇 y lint (14 noviembre 2026).

### Programaci髇 y cambios antes del matching

UC-TRA-52: `POST /transport-requests/scheduled` usa el mismo JSON de creaci髇 y exige ventana futura. UC-TRA-53 y UC-TRA-55: `PATCH /transport-requests/:id/pickup-window` o `/reschedule` con startsAt/endsAt ISO. UC-TRA-56: `PATCH /transport-requests/:id` admite cargo, origin y destination. UC-TRA-62 y UC-TRA-63: `PATCH /transport-requests/:id/cargo-weight` con weightKg y `/cargo-volume` con volumeM3. Todas las modificaciones requieren propietario y estado OPEN; conservan unidades y tipo de carga, incrementan versiones y escriben el evento TransportRequestRevised transaccionalmente. Ventanas inv醠idas/pasadas y cantidades no positivas se rechazan. 62 pruebas exitosas con PostgreSQL (14 noviembre 2026).
