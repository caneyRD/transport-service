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

La API protege los casos de uso con JWT firmado por `authServiceCaney`. Configura `JWT_ISSUER` y `JWT_AUDIENCE`, más `JWT_PUBLIC_KEY` para RS256 o `JWT_SECRET` para HS256. No se incluye una credencial real en el repositorio. `SHARE_LINK_SECRET` (16+ caracteres aleatorios) firma los enlaces públicos para compartir un viaje; sin ella, compartir responde 503. Las rutas `/admin/*` solo las usan cuentas con `rol` `moderador` o `superadmin` en `baney.usuario`. El estado verificado de cada caso de uso está en `docs/validation/2026-11-24-transport-f1-progress.md`. La fecha de avance del cronograma es el 5 de noviembre de 2026: UC-TRA-01 a UC-TRA-08 están implementados y persistidos. UC-TRA-09, UC-TRA-43, UC-TRA-44, UC-TRA-45 y UC-TRA-50 siguen pendientes del sprint actual.

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

### Transportistas cercanos en el mapa (UC-TRA-03)

- `PUT /carriers/me/location` con `latitude`, `longitude` y `recordedAt` ISO opcional (por defecto, ahora). El transportista la envía cada 10–15 s mientras está disponible. Guarda la última posición en `perfil_transportista.ultima_latitud/ultima_longitud/ultima_ubicacion_en` (columnas ya existentes del esquema compartido; sin migraciones). Rechaza coordenadas fuera de rango, fechas futuras o de hace más de 10 minutos, e ignora reportes fuera de orden.
- `GET /carriers/nearby?latitude=&longitude=&radiusKm=15&limit=30` (máximo 50 km y 50 resultados). Devuelve transportistas **habilitados**, con un vehículo habilitado, disponibles ahora (ventana `disponible` o `perfil.disponible`), sin ventana `no_disponible` vigente, sin asignación activa y con ubicación de los últimos 5 minutos. Ordenado por distancia (Haversine).
- Privacidad: posiciones redondeadas a ~110 m y un `id` opaco que cambia cada día; nunca incluye usuario, nombre, placa ni teléfono.

### Mis solicitudes (cliente)

`GET /transport-requests?limit=25&offset=0` devuelve las solicitudes del cliente autenticado, más recientes primero (máximo 100 por página), incluidas las que aún no tienen transportista: id, estado, carga, origen, destino, ventana y fecha de creación. `/trips/history` sigue devolviendo solo viajes.

### Transportista: ver solicitudes y ofertar

Requieren transportista **habilitado** (si no, 409).

- `GET /carrier/requests/open?latitude=&longitude=&radiusKm=30&limit=30` (radio máximo 100 km): solicitudes `OPEN`, `MATCHING` u `OFFERED` cuya recogida está dentro del radio y cuya ventana no ha vencido, más cercanas primero. Nunca incluye las del propio transportista ni datos personales del cliente. Si ya ofertó, trae `myOffer`.
- `POST /carrier/requests/:id/offers` con `amount` (DOP por defecto), `currency`, `validUntil` (por defecto 24 h, máximo 7 días) y `vehicleId` opcionales (por defecto, su vehículo habilitado de mayor capacidad). Crea la oferta `SUBMITTED` y pasa la solicitud a `OFFERED` en la misma transacción. Una sola oferta vigente por transportista y solicitud (409). El cliente la ve en `GET /transport-requests/:id/offers` y la acepta con el endpoint existente.
- `GET /carrier/offers?limit=30`: ofertas del transportista con el estado de la solicitud y, si ya inició, `tripId` (para `POST /trips/:id/tracking`).
- `GET /carriers/me/availability`: ventana de disponibilidad vigente (`available`, `startsAt`, `endsAt`); una ventana `no_disponible` prevalece.
