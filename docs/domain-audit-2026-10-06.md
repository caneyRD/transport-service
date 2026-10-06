# Auditoría del dominio de Transporte

Fecha: 6 de octubre de 2026  
Contexto: BANEY / `caneyRD/transport-service`  
Alcance: dominio de Transporte, sin frontend

## Resultado

El núcleo de dominio queda consistente con la definición inicial de BANEY para el contexto Transporte. Las pruebas y la compilación pasan correctamente.

## Correspondencia con la definición

| Elemento de la definición | Estado |
|---|---|
| `TransportRequest` como agregado raíz | Implementado |
| `Cargo` | Implementado |
| `Location` y `TimeWindow` | Implementados |
| `TransportOffer` | Implementado |
| `MatchingCandidate` | Implementado |
| `Assignment` | Implementado |
| `Trip` | Implementado |
| `Vehicle` | Implementado |
| `DriverProfile` | Implementado |
| `Route` | Implementado |
| `TrackingPoint` | Implementado |
| `PricingRule` | Implementado |
| `TransportException` | Implementado |
| `Money`, `Weight`, `Volume`, `Distance` | Implementados con unidades explícitas |
| Estados de solicitud | Implementados con transiciones explícitas |
| Eventos de Transporte | Implementados para solicitud, oferta, asignación, viaje y tracking |

## Invariantes verificadas

- Una solicitud no admite dos asignaciones activas.
- Una asignación requiere conductor y vehículo habilitados.
- Una solicitud no puede iniciar un viaje sin asignación.
- Un viaje solo puede iniciar desde estado `PLANNED`.
- Un viaje solo puede completarse desde `IN_PROGRESS`.
- El tracking solo se registra durante un viaje en progreso.
- Los puntos de tracking deben pertenecer al viaje y respetar orden cronológico.
- Las transiciones inválidas generan `DomainError`.
- Las cantidades conservan sus unidades (`kg`, `m3`, `km`).
- Los eventos contienen `eventId`, `occurredAt`, `aggregateId`, `aggregateType`, `version` y `correlationId`.

## Verificaciones ejecutadas

- `npm test`: 10 pruebas pasando.
- `npm run build`: compilación TypeScript correcta.
- `git diff --check`: sin errores de whitespace.
- Auditoría estática: sin secretos, SQL directo, `TODO/FIXME`, `forEach(async)` ni operaciones asíncronas sin manejar en el código del dominio.
- `npm audit`: el endpoint de auditoría del registro no respondió en este entorno; no se pudo confirmar esta verificación remota en esta ejecución. La instalación anterior reportó 0 vulnerabilidades.

## Límites deliberados

Este corte implementa el dominio, no la aplicación completa. Aún quedan fuera de este alcance:

- Controladores HTTP y DTOs externos.
- Persistencia Prisma y migraciones PostgreSQL.
- Validación del JWT de `authServiceCaney`.
- Publicación/consumo real de eventos con RabbitMQ.
- Observabilidad, auditoría persistida y configuración de despliegue.

Estas piezas deben construirse sobre el dominio, sin mover las reglas de negocio a NestJS, Prisma o los controladores.
