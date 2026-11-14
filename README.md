# BANEY Transport Service

Backend del bounded context **Transporte** de BANEY.

## Alcance inicial

Este repositorio implementa el dominio de Transporte. No contiene frontend ni reglas de Identidad, Marketplace, Pagos o Facturación.

El agregado raíz es `TransportRequest`, con las entidades y conceptos del primer modelo de Transporte:

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

Las cantidades conservan unidades explícitas mediante `Weight` (kg), `Volume` (m3) y `Distance` (km).

El modelo también implementa:

- `TransportOffer` con envío, aceptación, rechazo y retiro.
- `MatchingCandidate` con puntuación normalizada para el proceso de matching.
- `Assignment` con validación de transportista y vehículo habilitados.
- `Trip` con inicio, finalización y cancelación explícitos.
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

Los casos de uso crean y modifican solicitudes y ofertas mediante puertos de repositorio. El servicio incluye un adapter PostgreSQL transaccional y adapters en memoria para pruebas. Las escrituras publican eventos en `transport.outbox_events` dentro de la misma transacción.

El esquema lógico propuesto para la futura base de datos está documentado en [`docs/transport-data-schema.md`](./docs/transport-data-schema.md). Incluye la revisión de consistencia del 13 de octubre y todavía requiere aprobación del equipo de Arquitectura/DB/DevOps antes de crear migraciones.

La definición SQL base para PostgreSQL está en [`database/schema.sql`](./database/schema.sql). La migración incremental [`database/migrations/001_transport_persistence.sql`](./database/migrations/001_transport_persistence.sql) agrega control de versiones y soporte de contraofertas sobre el esquema unificado.

## Estados de `TransportRequest`

`DRAFT -> OPEN -> MATCHING -> OFFERED -> ASSIGNED -> IN_PROGRESS -> COMPLETED`

Una solicitud también puede cancelarse en los estados permitidos. Las transiciones son explícitas y no se permite una segunda asignación activa.

## Arquitectura

La lógica de negocio vive en `src/domain`; la infraestructura PostgreSQL está en `src/infrastructure/postgres` y la API HTTP en `src/http`.

Las referencias a usuarios, transportistas y vehículos se manejan mediante identificadores estables. Este servicio no accede directamente a las tablas internas de `authServiceCaney`.

## Desarrollo

```bash
npm install
npm run db:migrate   # requiere DATABASE_URL y VPN; aplica migraciones pendientes
npm run db:check     # comprobación de conexión y tablas de Transporte
npm test
npm run build
```

La API protege los casos de uso con JWT firmado por `authServiceCaney`. Configura `JWT_ISSUER` y `JWT_AUDIENCE`, más `JWT_PUBLIC_KEY` para RS256 o `JWT_SECRET` para HS256. No se incluye una credencial real en el repositorio. La fecha de avance del cronograma es el 5 de noviembre de 2026: UC-TRA-01 a UC-TRA-08 están implementados y persistidos. UC-TRA-09, UC-TRA-43, UC-TRA-44, UC-TRA-45 y UC-TRA-50 siguen pendientes del sprint actual.

## Registro de transportista (UC-TRA-19)

`POST /carriers/me` requiere JWT y un objeto JSON (puede ser `{}`). Registra al usuario autenticado en `transport.driver_profiles` con estado `PENDING`; responde 200 con `id`, `userId` y `status`. Los reintentos devuelven el mismo perfil y conservan su estado. Un perfil archivado requiere soporte (409). El registro no habilita al transportista ni sustituye KYC. No requiere migraciones nuevas.

Validaci�n del 13 de noviembre de 2026: 53 pruebas exitosas, incluyendo PostgreSQL por VPN con fixtures revertidos; compilaci�n y lint exitosos. Cronograma actualizado en `outputs/cronograma-2026-11-13/`.

### Flota y disponibilidad (UC-TRA-21 a UC-TRA-24)

- `GET /carriers/me/verification`: estado operativo persistido del perfil autenticado (PENDING/ENABLED/DISABLED/SUSPENDED).
- `POST /vehicles`, `PUT /vehicles/:id`: placa, tipo, capacityValue, capacityUnit y capacityKg. Requiere perfil registrado; solo el propietario edita, sin asignaci�n activa. Altas y modificaciones requieren aprobaci�n (`PENDING`).
- `PUT /carriers/me/availability`: available boolean, startsAt y endsAt ISO. Activar exige perfil habilitado; no se permite durante una asignaci�n activa. Reemplaza ventanas solapadas. Las ventanas UNAVAILABLE vigentes excluyen matching y asignaciones.

Persistencia compatible con vehicles y driver_availability existentes. 58 pruebas exitosas con PostgreSQL por VPN, compilaci�n y lint (14 noviembre 2026).

### Programaci�n y cambios antes del matching

UC-TRA-52: `POST /transport-requests/scheduled` usa el mismo JSON de creaci�n y exige ventana futura. UC-TRA-53 y UC-TRA-55: `PATCH /transport-requests/:id/pickup-window` o `/reschedule` con startsAt/endsAt ISO. UC-TRA-56: `PATCH /transport-requests/:id` admite cargo, origin y destination. UC-TRA-62 y UC-TRA-63: `PATCH /transport-requests/:id/cargo-weight` con weightKg y `/cargo-volume` con volumeM3. Todas las modificaciones requieren propietario y estado OPEN; conservan unidades y tipo de carga, incrementan versiones y escriben el evento TransportRequestRevised transaccionalmente. Ventanas inv�lidas/pasadas y cantidades no positivas se rechazan. 62 pruebas exitosas con PostgreSQL (14 noviembre 2026).

### Historial y consultas previas a ofertar

UC-TRA-16: `GET /trips/history?limit=25&offset=0` devuelve solo viajes del cliente autenticado, con paginaci�n (m�ximo 100), fechas, estado y direcciones. UC-TRA-75: `GET /transport-requests/:id/compare-offers` ordena ofertas vigentes por moneda y precio (sin conversi�n entre monedas). UC-TRA-121/122/123: `GET /carrier/requests/:id/cargo`, `/route`, `/distance` requieren transportista habilitado y solicitud abierta a ofertas. Ruta y distancia son estimaciones geod�sicas expl�citas, no navegaci�n por carreteras. Los datos proceden de solicitudes/ofertas/viajes PostgreSQL. 64 pruebas exitosas con PostgreSQL (14 noviembre 2026).

### Operaci�n del viaje e incidentes

UC-TRA-135: `POST /carrier/requests/:id/start` con `{}` inicia el viaje de la asignaci�n activa; solo el transportista asignado y habilitado puede hacerlo. El reintento devuelve el viaje existente. Actualiza solicitud, viaje y outbox en la misma transacci�n.

UC-TRA-46: `POST /trips/:id/tracking` con latitude, longitude, recordedAt ISO y sourcePointId. Solo el transportista asignado puede actualizar un viaje en progreso. Reintentos id�nticos no duplican puntos/eventos; se rechazan datos distintos para el mismo identificador, fechas futuras y puntos fuera de orden. La consulta de tracking del cliente obtiene los puntos persistidos.

UC-TRA-36: `POST /trips/:id/incidents` con type (DELAY/DAMAGE/BREAKDOWN/ROUTE_DEVIATION/OTHER) y description. UC-TRA-143/145/152: `/breakdown`, `/delay`, `/cargo-damage` fijan el tipo y requieren description. Solo el transportista asignado durante el viaje puede reportar; persiste excepci�n y evento con versi�n del viaje. La cancelaci�n de solicitud cancela tambi�n sus viajes abiertos.

Resultado al 14 noviembre 2026: 35 de 95 casos calendarizados de Transporte implementados, 60 pendientes. En esta continuaci�n se completaron 21 casos en cuatro lotes, con 69 pruebas exitosas (19 suites), incluidas integraci�n PostgreSQL por VPN y rollback. El alcance marcado es backend/API/PostgreSQL; no acredita UI ni QA cruzado del equipo.
