# Reporte de avance — Transporte Fase 1

## Alcance

El alcance de implementación son los 60 casos de uso de Transporte que aparecen como `No iniciado` y `Calendarizado` en la hoja `04 Casos de Uso` del cronograma del 14 de noviembre de 2026. Los 67 casos `Backlog F1` se mantienen fuera de este alcance y no se deben contabilizar como parte de estos 60.

## Casos cubiertos en esta iteración

| Casos | Flujo implementado | Evidencia |
|---|---|---|
| UC-TRA-20 | Registro y consulta de documentos KYC del transportista | `POST/GET /carriers/me/documents`, validación de tipo, MIME, tamaño, SHA-256 y vencimiento |
| UC-TRA-37 | Aprobar o rechazar documentos del transportista | `PATCH /carrier-documents/:id/review`, persiste estado, revisor, fecha y motivo de rechazo |
| UC-TRA-28, UC-TRA-29, UC-TRA-30 | Transiciones de llegada, carga y entrega | `POST /trips/:id/milestones/:milestone`, secuencia validada y `viaje_evento` |
| UC-TRA-83, UC-TRA-128, UC-TRA-129, UC-TRA-130, UC-TRA-133, UC-TRA-138, UC-TRA-140 | Hitos de preparación, asignación, movimiento, check-in, carga, destino y descarga | Milestones `CONFIRM_ASSIGNMENT`, `DEPART_TO_ORIGIN`, `CHECKIN_ORIGIN`, `MARK_LOADED`, `CHECKIN_DESTINATION`, `UNLOAD` y `COMPLETE_DELIVERY`, con transición ordenada y auditoría |
| UC-TRA-31, UC-TRA-134, UC-TRA-141 | Evidencia POD, recogida y firma | `POST /trips/:id/evidence`, persistencia en `viaje_evidencia` |
| UC-TRA-86 | Firma digital de entrega | Evidencia de tipo `firma` en `POST /trips/:id/evidence`, con URL y coordenadas opcionales |
| UC-TRA-13, UC-TRA-14 | Confirmar recibo y consultar POD/evidencias | `GET /trips/:id/evidence`, sólo para participantes; devuelve fotos, firma, ticket y documento asociados al viaje |
| UC-TRA-85, UC-TRA-142 | Confirmación de entrega mediante OTP | `POST /trips/:id/delivery/otp`, hash, límite de intentos y transición a `entregado` |
| UC-TRA-72, UC-TRA-73, UC-TRA-125, UC-TRA-155, UC-TRA-156 | Cálculo de precio estimado, desglose, comisión y payout | `CalculatePriceHandler`, límites de comisión y pruebas de redondeo |
| UC-TRA-87, UC-TRA-88, UC-TRA-90, UC-TRA-91 | Daño, faltante, no-show y solicitud de ayuda | Rutas de incidentes dedicadas y tipos persistidos |
| UC-TRA-144, UC-TRA-154 | Accidente y SOS | Rutas dedicadas; SOS fuerza gravedad `critica` |
| UC-TRA-149, UC-TRA-153 | Cliente ausente y asistencia operativa | Rutas `/trips/:id/customer-absent` y `/trips/:id/assistance`, persistidas como incidentes auditables |
| UC-TRA-26 | Rechazar solicitud por el transportista | `POST /carrier/requests/:id/reject`, registra motivo y fecha en `candidato_matching` |
| UC-TRA-26 | Aceptar solicitud/oferta por el cliente | `POST /transport-requests/:id/offers/:offerId/accept`, asigna la solicitud y valida propietario, estado y oferta vigente |
| UC-TRA-27 | Contraoferta de precio | `POST /transport-requests/:id/offers/:offerId/counter`, crea nueva ronda y marca la oferta padre como contraofertada |
| UC-TRA-32 | Publicar disponibilidad de retorno | `POST/GET /carrier/backhauls`, valida vehículo habilitado, capacidad y ventana; persiste en `oferta_retorno` |
| UC-TRA-76, UC-TRA-77 | Perfil público, rating y cantidad de reseñas del transportista | `GET /carriers/:userId/profile`, expone solo estado operativo, rating, reseñas y cantidad de vehículos |
| UC-TRA-15, UC-TRA-35 | Calificación de transportista y cliente después de la entrega | `POST /trips/:id/rating`, valida participante, viaje entregado, puntuación 1–5 y comentario |
| UC-TRA-70, UC-TRA-71 | Solicitar tipo y capacidad específica de vehículo | Campos `requestedVehicleType` y `requestedCapacityKg` en creación y persistencia de la solicitud |
| UC-TRA-67 | Registrar instrucciones especiales de carga | Campo `specialInstructions` en creación, persistencia y respuesta de la solicitud, con límite de 2.000 caracteres |
| UC-TRA-65 | Adjuntar fotografía de la carga | `POST /transport-requests/:id/photos`, valida propiedad y URL HTTP(S), persiste en `baney.carga_foto` |
| UC-TRA-12, UC-TRA-38 | Compartir ubicación y visualizar viajes activos | `POST /trips/:id/tracking` y `GET /transport-requests/:id/tracking`, con validación de coordenadas, actor y consulta de puntos vivos |
| UC-TRA-33, UC-TRA-34 | Historial de ganancias y solicitud de retiro | `GET /carriers/me/earnings` y `POST /carriers/me/payouts`; consulta `cuenta/saldo_cuenta/movimiento`, valida saldo, cuenta bancaria verificada e idempotencia |
| UC-TRA-18, UC-TRA-39, UC-TRA-40 | Abrir disputa y solicitar reembolso | `POST /transport/disputes` y `POST /transport/disputes/refund`; vincula el viaje con pago capturado, evita duplicados y limita el reembolso al monto disputado |
| UC-TRA-17 | Consultar factura del viaje | `GET /trips/:id/invoice`, restringido al cliente o transportista participante y solo a facturas emitidas/aceptadas |
| UC-TRA-25 | Consultar y marcar notificaciones de transporte | `GET /me/notifications` y `POST /me/notifications/:id/read`, con paginación, aislamiento por usuario y marcado idempotente |
| UC-TRA-10 | Chat seguro del viaje | `GET/POST /trips/:id/messages`, exige participación activa en `conversacion_participante` y persiste mensajes no eliminados |
| UC-TRA-41 | Consultar zonas de servicio activas | `GET /transport/zones`, devuelve zonas activas con centro, radio y/o polígono desde `baney.zona_servicio` |
| UC-TRA-11 | Solicitar llamada con la contraparte del viaje | `POST /trips/:id/call`, valida participación y genera notificación idempotente al otro participante |
| UC-TRA-47 | Cobro automático al completar entrega | Confirmación OTP actualiza el pago del viaje de autorizado/preautorizado a capturado; la condición de estado evita duplicar el cobro en reintentos |
| UC-TRA-48 | Programar payout automático | `PUT /carriers/me/payout-schedule`, configura frecuencia y monto mínimo en `baney.payout_programacion` mediante upsert |
| UC-TRA-42 | Consultar regla vigente de comisión de Transporte | `GET /transport/commission-rule`, selecciona la regla activa por prioridad y vigencia desde `baney.regla_comision` |
| UC-TRA-49 | Calcular penalización por cancelación tardía | `POST /transport/cancellation-penalty`, aplica 20% con menos de 2 horas, 10% con menos de 12 y 0% fuera de ventana |
| UC-TRA-156 | Liquidar payout con comisión y penalización | `POST /transport/payout-settlement`, calcula neto como bruto menos comisión y penalización, rechazando deducciones inválidas |

Además, se corrigió la lectura de disponibilidad actual para usar los nombres y valores reales del esquema (`estado`, `desde`, `hasta`, `disponible`).

## Pruebas verificadas

- Compilación TypeScript: pasa.
- Suite general: 92 pruebas pasan en la última ejecución.
- Suites: 23 pasan; 1 suite de integración PostgreSQL permanece omitida cuando no hay conexión al entorno de base de datos.
- Pruebas específicas de operaciones, evidencias y OTP: pasan.
- `git diff --check`: sin errores de whitespace.

## Estado de evidencia

- Inventario: 60/60 IDs calendarizados de Transporte trazados; 67/67 IDs de backlog listados por separado.
- Automatización: 97 pruebas pasan en la última ejecución y cubren los handlers, validaciones HTTP y persistencia preparada.
- Limitación pendiente: la suite de integración PostgreSQL no se ejecuta sin una instancia activa; por ello los casos que dependen de SQL requieren esa verificación de entorno antes de declararse cerrados definitivamente.

## Verificación contra PostgreSQL real (2026-11-24)

Ejecutada con PostgreSQL 16 local aplicando `database/shared/baseline.sql` y `002_api_compat.sql`:

- Suite completa: 29 suites, 117 pruebas pasan (incluida la integración PostgreSQL, ya no omitida).
- 5 pruebas de integración nuevas: ciclo de viaje (OTP, hitos, evidencias, captura de pago, entrega, calificaciones, disputa y reembolso), chat y llamada, finanzas (ganancias, retiro, programación de payout), documentos KYC y zonas/comisión/foto de carga/rechazo/backhaul/perfil público.
- SQL: las 102 consultas preparan contra el esquema (1 dinámica revisada a mano).
- `tsc`, `eslint` y `npm run build`: pasan.

Errores encontrados y corregidos en esa verificación:

- Lecturas de columnas en español (`row.estado`, `row.moneda`…) que `canonicalRows` ya había renombrado: daban `undefined` en finanzas, disputas, hitos, OTP, rating, comisión y disponibilidad. Ahora usan alias propios.
- `GET /carriers/me/availability` siempre devolvía no disponible: revertido a los campos canónicos.
- 3 consultas inválidas (columna `subido_en`, comparación `uuid = text`, tipos inconsistentes de un mismo parámetro).
- El OTP de entrega nunca se generaba: ahora se crea al iniciar el viaje y se notifica al cliente (`delivery_otp`).
- Un OTP incorrecto lanzaba error y el rollback borraba el intento (sin límite real de 5 intentos): ahora el intento se guarda y la API responde 400 con `attemptsRemaining`.
- La entrega (OTP o hito final) no completaba la solicitud ni liberaba al transportista: ahora sí.
- Rechazar una solicitud no persistía si no había candidato previo, y la solicitud seguía apareciendo: ahora se registra y se oculta a ese transportista.
- La programación semanal/mensual de payout violaba `ck_payout_programacion_fecha`: ahora fija lunes / día 1.
- La revisión de documentos KYC estaba abierta a cualquier usuario: ahora exige rol `moderador` o `superadmin` en el JWT y no permite revisar los propios.

Observaciones de diseño: `start` crea el viaje ya en `en_transito`, por lo que los hitos previos (confirmar asignación, salida a origen, check-in, cargado) no son alcanzables; la factura solo está validada a nivel SQL.

## Segunda verificación: backlog actualizado (2026-11-24, tarde)

Se recorrieron los 95 UC-TRA calendarizados del cronograma actualizado. Varios figuraban como implementados pero no lo estaban; se construyeron o corrigieron y cada uno tiene ahora una prueba de integración contra PostgreSQL real.

- Suite completa: 29 suites, 130 pruebas pasan; integración PostgreSQL: 30 pruebas (ninguna omitida).
- SQL: 160 consultas, 154 preparadas contra el esquema sin error y 6 dinámicas revisadas a mano.
- `tsc`, `eslint`, `npm run build` y `git diff --check`: pasan.

Construido o corregido:

- Back office (moderador/superadmin, rol leído de `baney.usuario.rol`, todo auditado en `baney.auditoria`):
  - Aprobación de transportistas y camiones: `GET /admin/carriers?status=`, `GET /admin/carriers/:userId`, `PATCH /admin/carriers/:userId/status`, `PATCH /admin/vehicles/:id/status`. Al habilitar se registra la inducción y se notifica al transportista.
  - UC-TRA-38 mapa en vivo: `GET /admin/trips/live`.
  - UC-TRA-39/40 disputas: `GET /admin/disputes?status=`, `POST /admin/disputes/:id/resolve` (total, parcial con monto, o sin reembolso; reutiliza la solicitud de reembolso del cliente y la autoriza o la rechaza; header `Idempotency-Key` para reembolsos).
  - UC-TRA-41 zonas: `POST /admin/zones`, `PATCH /admin/zones/:id`.
  - UC-TRA-42 comisión: `POST /admin/commission-rules` (cierra la regla global vigente y conserva el historial).
  - UC-TRA-37: la revisión KYC usa el mismo control de rol.
- Hitos previos (UC-TRA-28/29/128/129/130/133/134/135): `POST /carrier/requests/:id/confirm` crea el viaje `programado`; luego salida, check-in en origen, evidencia de recogida y cargado; `start` pasa a `en_transito`. El cliente recibe una notificación en cada paso. Ya no se puede marcar llegada a destino sin haber iniciado.
- Entrega (UC-TRA-48/156): acredita el flete en la cuenta del transportista y debita la comisión de la regla vigente (registro en `comision`); idempotente. La asignación queda `completada`, no `liberada`.
- Cancelación (UC-TRA-49): con transportista asignado aplica la penalidad (20 % a menos de 2 h, 10 % a menos de 12 h) sobre el precio acordado, cierra el viaje en cualquier paso y avisa al transportista.
- UC-TRA-27: el transportista responde a la contraoferta del cliente (`POST /carrier/offers/:id/accept` o `/counter`), máximo 4 rondas. El cliente ya no puede aceptar su propia contraoferta.
- UC-TRA-25: al publicar una solicitud se avisa a los transportistas disponibles a 30 km o menos.
- UC-TRA-72/73/155: `POST /transport-requests/price-estimate` con desglose (base, distancia, peso, mínimo), comisión y pago al transportista.
- UC-TRA-125: `POST /carrier/earning-estimate`.
- UC-TRA-83: `POST /transport-requests/:id/cargo-ready`.
- UC-TRA-12: `POST /trips/:id/share` devuelve un enlace firmado de 12 h; `GET /shared/trips/:token` es público y solo muestra estado, destino y última posición. Requiere `SHARE_LINK_SECRET` (16+ caracteres).
- UC-TRA-87/88/90/91: el cliente reporta daño, faltante, no-show y pide ayuda (daño y faltante también tras la entrega); el otro participante recibe aviso. El transportista puede reportar desde la confirmación.
- UC-TRA-76/77: el perfil público incluye nombre de pila, antigüedad, viajes completados, camiones (sin placa) y reseñas aprobadas.

Decisiones pendientes para el equipo:

- Fondos del flete: se acreditan como `disponible` al entregar. Si finanzas quiere retención T+N, hay que cambiarlo a `pendiente` y crear el proceso que los libere.
- ITBIS sobre la comisión: se registra en 0.
- La penalidad por cancelación se registra en el viaje y se notifica, pero todavía no se cobra ni se acredita.

## Pendiente

El alcance de 60 todavía no está terminado. Permanecen por implementar y probar validaciones integrales finales entre comisión, factura y payout; la consulta de regla y la programación automática ya están implementadas. Los flujos de aceptación, rechazo, contraoferta, backhaul, ubicación, ganancias/retiros, disputas/reembolsos, factura, notificaciones, chat, llamada, zonas, cobro automático, programación de payout, regla de comisión, precio, perfil, rating, calificaciones, evidencias, OTP e incidentes ya cuentan con implementación o cobertura trazable arriba.

## Criterio de cierre

Un caso solo se marcará como terminado cuando tenga implementación persistida o de dominio, ruta o flujo identificable, prueba funcional positiva, pruebas de validación/autorización y resultado registrado aquí.

## Backlog F1 excluido del alcance (67 casos)

Extraído de `07 F1 Casos Completo` del mismo workbook; estos casos no se contabilizan dentro de los 60 calendarizados:

`UC-TRA-100, UC-TRA-101, UC-TRA-102, UC-TRA-103, UC-TRA-104, UC-TRA-105, UC-TRA-106, UC-TRA-107, UC-TRA-108, UC-TRA-109, UC-TRA-110, UC-TRA-111, UC-TRA-112, UC-TRA-113, UC-TRA-114, UC-TRA-115, UC-TRA-116, UC-TRA-117, UC-TRA-118, UC-TRA-119, UC-TRA-120, UC-TRA-124, UC-TRA-126, UC-TRA-127, UC-TRA-131, UC-TRA-132, UC-TRA-136, UC-TRA-137, UC-TRA-139, UC-TRA-146, UC-TRA-147, UC-TRA-148, UC-TRA-150, UC-TRA-151, UC-TRA-157, UC-TRA-158, UC-TRA-159, UC-TRA-160, UC-TRA-161, UC-TRA-162, UC-TRA-51, UC-TRA-54, UC-TRA-57, UC-TRA-58, UC-TRA-59, UC-TRA-60, UC-TRA-61, UC-TRA-64, UC-TRA-66, UC-TRA-68, UC-TRA-69, UC-TRA-74, UC-TRA-78, UC-TRA-79, UC-TRA-80, UC-TRA-81, UC-TRA-82, UC-TRA-84, UC-TRA-89, UC-TRA-92, UC-TRA-93, UC-TRA-94, UC-TRA-95, UC-TRA-96, UC-TRA-97, UC-TRA-98, UC-TRA-99`.
