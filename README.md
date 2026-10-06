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

## Estados de `TransportRequest`

`DRAFT -> OPEN -> MATCHING -> OFFERED -> ASSIGNED -> IN_PROGRESS -> COMPLETED`

Una solicitud también puede cancelarse en los estados permitidos. Las transiciones son explícitas y no se permite una segunda asignación activa.

## Arquitectura

La lógica de negocio vive en `src/domain` y no depende de NestJS, Prisma ni de una base de datos. Las capas de aplicación, infraestructura y HTTP se añadirán sobre este núcleo.

Las referencias a usuarios, transportistas y vehículos se manejan mediante identificadores estables. Este servicio no accede directamente a las tablas internas de `authServiceCaney`.

## Desarrollo

```bash
npm install
npm test
npm run build
```
