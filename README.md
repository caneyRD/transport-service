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
