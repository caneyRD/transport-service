// OpenAPI 3 description of the transport service and the Swagger UI page that renders it.
// Served at GET /docs (UI) and GET /docs/openapi.json (spec); both are public and read-only.
// Keep this file in step with the routes in server.ts (server.spec.ts checks that every documented path answers).

type Schema = Record<string, unknown>;
type Query = [string, Schema, boolean?];
type Op = { summary: string; tag: string; description?: string; body?: Schema; query?: Query[]; idempotency?: boolean; public?: boolean; status?: number };

const str = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
const num = (extra: Schema = {}): Schema => ({ type: 'number', ...extra });
const int = (extra: Schema = {}): Schema => ({ type: 'integer', ...extra });
const bool = (extra: Schema = {}): Schema => ({ type: 'boolean', ...extra });
const isoDate = (example: string): Schema => str({ format: 'date-time', example });
const oneOf = (values: string[], extra: Schema = {}): Schema => str({ enum: values, ...extra });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const empty = obj({});

const page: Query[] = [['limit', int({ default: 25, minimum: 1, maximum: 100 })], ['offset', int({ default: 0, minimum: 0 })]];
const near: Query[] = [['latitude', num({ example: 18.4861 }), true], ['longitude', num({ example: -69.9312 }), true], ['radiusKm', num({ example: 25 })], ['limit', int({ example: 20 })]];
const approval = oneOf(['habilitado', 'deshabilitado', 'suspendido', 'pendiente']);
const timeWindow = obj({ startsAt: isoDate('2026-12-01T13:00:00.000Z'), endsAt: isoDate('2026-12-01T17:00:00.000Z') }, ['startsAt', 'endsAt']);
const statusBody = obj({ status: approval, reason: str({ description: 'Obligatorio al deshabilitar o suspender' }) }, ['status']);
const incident = obj({ description: str({ example: 'Goma ponchada en la autopista Duarte' }) }, ['description']);
const INCIDENTS: [string, string][] = [
  ['breakdown', 'Avería del camión'], ['delay', 'Retraso'], ['cargo-damage', 'Carga dañada'], ['accident', 'Accidente'], ['cargo-missing', 'Carga faltante'],
  ['no-show', 'El cliente no se presentó'], ['customer-absent', 'Cliente ausente en la entrega'], ['assistance', 'Solicitar asistencia'], ['sos', 'Emergencia (SOS)'],
];

const T = {
  sys: 'Sistema', req: 'Cliente: solicitudes', track: 'Cliente: seguimiento', offers: 'Cliente: ofertas', trips: 'Viajes', inc: 'Viajes: incidencias',
  cReq: 'Transportista: solicitudes', cTrip: 'Transportista: viaje', cProf: 'Transportista: perfil', cFin: 'Transportista: finanzas',
  notif: 'Notificaciones', conf: 'Configuración', disp: 'Disputas', admin: 'Admin (moderador / superadmin)',
};

const routes: Record<string, Record<string, Op>> = {
  '/health': { get: { tag: T.sys, summary: 'Estado del servicio y de la base de datos', public: true } },
  '/shared/trips/{token}': { get: { tag: T.sys, summary: 'Vista pública de un viaje compartido (enlace firmado y con vencimiento)', public: true } },

  '/transport-requests': {
    get: { tag: T.req, summary: 'Mis solicitudes (cierra antes las vencidas)', query: page },
    post: { tag: T.req, summary: 'Crear solicitud de transporte', idempotency: true, status: 201, body: ref('NewRequest') },
  },
  '/transport-requests/scheduled': { post: { tag: T.req, summary: 'Crear solicitud programada', idempotency: true, status: 201, body: ref('NewRequest') } },
  '/transport-requests/price-estimate': {
    post: { tag: T.req, summary: 'Estimar precio antes de pedir (ruta de Google o estimada)', body: obj({ origin: ref('Place'), destination: ref('Place'), weightKg: num({ example: 12000 }), cargoType: str({ example: 'AGGREGATES' }), vehicleType: str({ example: 'DUMP_TRUCK' }) }, ['origin', 'destination']) },
  },
  '/transport-requests/{id}': {
    get: { tag: T.req, summary: 'Ver una solicitud (incluye expired:true si venció)' },
    patch: { tag: T.req, summary: 'Editar origen, destino o carga', body: obj({ origin: ref('Place'), destination: ref('Place'), cargo: obj({ description: str(), weightKg: num(), volumeM3: num() }) }) },
  },
  '/transport-requests/{id}/cancel': { post: { tag: T.req, summary: 'Cancelar (con penalidad si ya hay transportista)', body: empty } },
  '/transport-requests/{id}/pickup-window': { patch: { tag: T.req, summary: 'Cambiar la ventana de recogida', body: timeWindow } },
  '/transport-requests/{id}/reschedule': { patch: { tag: T.req, summary: 'Reprogramar', body: timeWindow } },
  '/transport-requests/{id}/cargo-weight': { patch: { tag: T.req, summary: 'Cambiar el peso', body: obj({ weightKg: num({ example: 8000 }) }, ['weightKg']) } },
  '/transport-requests/{id}/cargo-volume': { patch: { tag: T.req, summary: 'Cambiar el volumen', body: obj({ volumeM3: num({ example: 14 }) }, ['volumeM3']) } },
  '/transport-requests/{id}/cargo-type': { patch: { tag: T.req, summary: 'Tipo de carga', body: obj({ type: oneOf(['MATERIALS', 'AGGREGATES', 'MACHINERY', 'OTHER']) }, ['type']) } },
  '/transport-requests/{id}/photos': { post: { tag: T.req, summary: 'Añadir foto de la carga (URL http/https)', status: 201, body: obj({ url: str({ format: 'uri' }) }, ['url']) } },
  '/transport-requests/{id}/cargo-ready': { post: { tag: T.req, summary: 'Avisar que la carga está lista', body: empty } },
  '/transport-requests/{id}/nearby-trucks': { get: { tag: T.req, summary: 'Camiones cercanos a la recogida', query: [['maxDistanceKm', num({ example: 30 })]] } },
  '/transport-requests/{id}/compatible-trucks': { get: { tag: T.req, summary: 'Camiones compatibles' } },
  '/transport-requests/{id}/matching-candidates': { get: { tag: T.req, summary: 'Candidatos (igual que compatible-trucks)' } },
  '/transport-requests/{id}/route': { get: { tag: T.track, summary: 'Ruta origen → destino' } },
  '/transport-requests/{id}/eta': { get: { tag: T.track, summary: 'Ruta y ETA desde el camión (leg PICKUP hacia la recogida, DELIVERY hacia la entrega)' } },
  '/transport-requests/{id}/tracking': { get: { tag: T.track, summary: 'Puntos GPS del viaje (con tripState)' } },
  '/transport-requests/{id}/offers': { get: { tag: T.offers, summary: 'Ofertas recibidas' } },
  '/transport-requests/{id}/compare-offers': { get: { tag: T.offers, summary: 'Comparar ofertas' } },
  '/transport-requests/{id}/offers/expire': { post: { tag: T.offers, summary: 'Vencer ofertas caducadas', body: empty } },
  '/transport-requests/{id}/offers/{offerId}/accept': { post: { tag: T.offers, summary: 'Aceptar una oferta (asigna el viaje)', body: empty } },
  '/transport-requests/{id}/offers/{offerId}/counter': { post: { tag: T.offers, summary: 'Contraofertar', status: 201, body: obj({ amount: num({ example: 3500 }), currency: str({ example: 'DOP' }), validUntil: isoDate('2026-12-01T12:00:00.000Z') }, ['amount', 'currency', 'validUntil']) } },

  '/trips/history': { get: { tag: T.trips, summary: 'Historial de viajes', query: page } },
  '/trips/{id}/messages': {
    get: { tag: T.trips, summary: 'Chat del viaje', query: [['limit', int({ default: 50 })], ['offset', int({ default: 0 })]] },
    post: { tag: T.trips, summary: 'Enviar mensaje', status: 201, body: obj({ body: str({ example: 'Voy llegando' }) }, ['body']) },
  },
  '/trips/{id}/call': { post: { tag: T.trips, summary: 'Solicitar llamada enmascarada', status: 201, body: empty } },
  '/trips/{id}/share': { post: { tag: T.trips, summary: 'Crear enlace público para compartir el viaje', status: 201, body: empty } },
  '/trips/{id}/rating': { post: { tag: T.trips, summary: 'Calificar', status: 201, body: obj({ target: oneOf(['carrier', 'client']), score: int({ minimum: 1, maximum: 5 }), comment: str() }, ['target', 'score']) } },
  '/trips/{id}/invoice': { get: { tag: T.trips, summary: 'Factura del viaje' } },
  '/trips/{id}/incidents': { post: { tag: T.inc, summary: 'Reportar incidencia (cliente o transportista)', body: obj({ type: oneOf(['DELAY', 'DAMAGE', 'BREAKDOWN', 'ROUTE_DEVIATION', 'ACCIDENT', 'CARGO_MISSING', 'NO_SHOW', 'CUSTOMER_ABSENT', 'ASSISTANCE', 'SOS', 'OTHER']), description: str() }, ['type', 'description']) } },
  ...Object.fromEntries(INCIDENTS.map(([path, summary]) => [`/trips/{id}/${path}`, { post: { tag: T.inc, summary, body: incident } }])),

  '/carrier/requests/open': { get: { tag: T.cReq, summary: 'Solicitudes abiertas cerca de mí', query: near } },
  '/carrier/requests/{id}/offers': { post: { tag: T.cReq, summary: 'Ofertar', status: 201, body: obj({ amount: num({ example: 3800 }), currency: str({ example: 'DOP' }), validUntil: isoDate('2026-12-01T12:00:00.000Z'), vehicleId: str({ format: 'uuid' }) }, ['amount']) } },
  '/carrier/requests/{id}/reject': { post: { tag: T.cReq, summary: 'Rechazar solicitud', body: obj({ reason: str({ example: 'Fuera de mi zona' }) }, ['reason']) } },
  '/carrier/requests/{id}/cargo': { get: { tag: T.cReq, summary: 'Detalle de la carga' } },
  '/carrier/requests/{id}/route': { get: { tag: T.cReq, summary: 'Mapa: recogida → destino y, con mi GPS, mi posición → recogida (toPickup)', query: [['latitude', num({ example: 18.4655 })], ['longitude', num({ example: -69.9147 })]] } },
  '/carrier/requests/{id}/eta': { get: { tag: T.cTrip, summary: 'ETA del transportista asignado: hacia la recogida (PICKUP) y, ya cargado, hacia la entrega (DELIVERY)', query: [['latitude', num({ example: 18.4655 })], ['longitude', num({ example: -69.9147 })]] } },
  '/carrier/requests/{id}/distance': { get: { tag: T.cReq, summary: 'Distancia de la solicitud' } },
  '/carrier/offers': { get: { tag: T.cReq, summary: 'Mis ofertas y viajes (con coordenadas)', query: [['limit', int({ default: 30 })]] } },
  '/carrier/offers/{id}/accept': { post: { tag: T.cReq, summary: 'Aceptar la contraoferta del cliente', body: empty } },
  '/carrier/offers/{id}/counter': { post: { tag: T.cReq, summary: 'Responder con otra contraoferta', status: 201, body: obj({ amount: num({ example: 3600 }) }, ['amount']) } },
  '/carrier/backhauls': {
    get: { tag: T.cReq, summary: 'Mis viajes de retorno publicados' },
    post: { tag: T.cReq, summary: 'Publicar viaje de retorno', status: 201, body: obj({ vehicleId: str({ format: 'uuid' }), origin: ref('Place'), destination: ref('Place'), availableFrom: isoDate('2026-12-01T08:00:00.000Z'), availableTo: isoDate('2026-12-01T18:00:00.000Z'), capacityKg: num({ example: 15000 }) }, ['vehicleId', 'origin', 'destination', 'availableFrom', 'availableTo', 'capacityKg']) },
  },
  '/carrier/requests/{id}/confirm': { post: { tag: T.cTrip, summary: 'Confirmar el viaje asignado', body: empty } },
  '/carrier/requests/{id}/start': { post: { tag: T.cTrip, summary: 'Iniciar el viaje (emite el código de entrega al cliente)', body: empty } },
  '/trips/{id}/milestones/{milestone}': { post: { tag: T.cTrip, summary: 'Marcar paso del viaje', body: empty } },
  '/trips/{id}/tracking': { post: { tag: T.cTrip, summary: 'Enviar punto GPS (desde "Voy hacia la recogida")', body: obj({ latitude: num({ example: 18.4655 }), longitude: num({ example: -69.9147 }), recordedAt: isoDate('2026-11-25T17:00:00.000Z'), sourcePointId: str({ example: 'app-trip-1764090000000' }) }, ['latitude', 'longitude', 'recordedAt', 'sourcePointId']) } },
  '/trips/{id}/evidence': {
    get: { tag: T.cTrip, summary: 'Evidencias del viaje' },
    post: { tag: T.cTrip, summary: 'Subir evidencia', status: 201, body: obj({ stage: oneOf(['recogida', 'entrega', 'incidente']), type: oneOf(['foto', 'firma', 'ticket_bascula', 'documento']), url: str({ format: 'uri' }), latitude: num(), longitude: num() }, ['stage', 'type', 'url']) },
  },
  '/trips/{id}/delivery/otp': { post: { tag: T.cTrip, summary: 'Entregar con el código de 6 dígitos del cliente', body: obj({ otp: str({ example: '482915' }), recipientName: str(), recipientDocument: str() }, ['otp']) } },

  '/carriers/me': { post: { tag: T.cProf, summary: 'Registrarme como transportista (queda en revisión)', body: empty } },
  '/carriers/me/verification': { get: { tag: T.cProf, summary: 'Estado de mi verificación' } },
  '/carriers/me/documents': {
    get: { tag: T.cProf, summary: 'Mis documentos' },
    post: { tag: T.cProf, summary: 'Subir documento', status: 201, body: obj({ type: oneOf(['cedula_frente', 'cedula_reverso', 'selfie', 'licencia_conducir', 'certificado_rnc', 'otro']), url: str({ format: 'uri' }), contentType: oneOf(['application/pdf', 'image/jpeg', 'image/png']), bytes: int(), sha256: str(), expiresAt: isoDate('2027-12-31T00:00:00.000Z') }, ['type', 'url', 'contentType', 'bytes', 'sha256']) },
  },
  '/carriers/me/availability': {
    get: { tag: T.cProf, summary: 'Mi disponibilidad actual' },
    put: { tag: T.cProf, summary: 'Ponerme disponible / no disponible', body: obj({ available: bool(), startsAt: isoDate('2026-11-25T12:00:00.000Z'), endsAt: isoDate('2026-11-26T00:00:00.000Z') }, ['available', 'startsAt', 'endsAt']) },
  },
  '/carriers/me/location': { put: { tag: T.cProf, summary: 'Actualizar mi ubicación', body: obj({ latitude: num({ example: 18.4655 }), longitude: num({ example: -69.9147 }), recordedAt: isoDate('2026-11-25T17:00:00.000Z') }, ['latitude', 'longitude']) } },
  '/carriers/nearby': { get: { tag: T.cProf, summary: 'Transportistas disponibles cerca', query: near } },
  '/carriers/{id}/profile': { get: { tag: T.cProf, summary: 'Perfil público de un transportista' } },
  '/vehicles': { post: { tag: T.cProf, summary: 'Registrar camión', status: 201, body: ref('Vehicle') } },
  '/vehicles/{id}': { put: { tag: T.cProf, summary: 'Editar camión', body: ref('Vehicle') } },
  '/carrier/earning-estimate': { post: { tag: T.cFin, summary: 'Cuánto me queda tras la comisión', body: obj({ amount: num({ example: 3800 }), currency: str({ default: 'DOP' }) }, ['amount']) } },
  '/carriers/me/earnings': { get: { tag: T.cFin, summary: 'Mis ganancias', query: page } },
  '/carriers/me/payouts': { post: { tag: T.cFin, summary: 'Solicitar retiro', idempotency: true, status: 201, body: obj({ amount: num({ example: 5000 }), bankAccountId: str({ format: 'uuid' }) }, ['amount', 'bankAccountId']) } },
  '/carriers/me/payout-schedule': { put: { tag: T.cFin, summary: 'Programar retiros automáticos', body: obj({ frequency: oneOf(['diaria', 'semanal', 'quincenal', 'mensual', 'manual']), minimumAmount: num({ example: 500 }) }, ['frequency', 'minimumAmount']) } },

  '/me/notifications': { get: { tag: T.notif, summary: 'Mis notificaciones', query: page } },
  '/me/notifications/{id}/read': { post: { tag: T.notif, summary: 'Marcar como leída', body: empty } },

  '/transport/zones': { get: { tag: T.conf, summary: 'Zonas de servicio activas' } },
  '/transport/commission-rule': { get: { tag: T.conf, summary: 'Regla de comisión vigente' } },
  '/transport/cancellation-penalty': { post: { tag: T.conf, summary: 'Calcular penalidad de cancelación', body: obj({ baseAmount: num({ example: 3800 }), currency: str({ example: 'DOP' }), scheduledAt: isoDate('2026-12-01T13:00:00.000Z') }, ['baseAmount', 'currency', 'scheduledAt']) } },
  '/transport/payout-settlement': { post: { tag: T.conf, summary: 'Calcular liquidación', body: obj({ gross: num({ example: 3800 }), commission: num({ example: 380 }), penalty: num({ example: 0 }), currency: str({ example: 'DOP' }) }, ['gross', 'commission', 'penalty', 'currency']) } },
  '/transport/disputes': { post: { tag: T.disp, summary: 'Abrir disputa', status: 201, body: obj({ tripId: str({ format: 'uuid' }), reason: oneOf(['cobro_incorrecto', 'cobro_duplicado', 'cargo_no_autorizado', 'servicio_no_prestado', 'mercancia_danada', 'mercancia_faltante', 'no_es_lo_acordado', 'retraso', 'mal_trato', 'otro']), description: str(), amount: num() }, ['tripId', 'reason', 'description', 'amount']) } },
  '/transport/disputes/refund': { post: { tag: T.disp, summary: 'Solicitar reembolso de una disputa', idempotency: true, status: 201, body: obj({ disputeId: str({ format: 'uuid' }), amount: num(), reason: str() }, ['disputeId', 'amount', 'reason']) } },

  '/admin/carriers': { get: { tag: T.admin, summary: 'Transportistas, filtrables por estado', query: [['status', approval]] } },
  '/admin/carriers/{id}': { get: { tag: T.admin, summary: 'Detalle: camiones, documentos y lo que falta' } },
  '/admin/carriers/{id}/status': { patch: { tag: T.admin, summary: 'Aprobar / suspender transportista', description: 'Para habilitar: `{"status":"habilitado"}`. El id es el uid del usuario transportista.', body: statusBody } },
  '/admin/vehicles/{id}/status': { patch: { tag: T.admin, summary: 'Aprobar / suspender camión', body: statusBody } },
  '/admin/trips/live': { get: { tag: T.admin, summary: 'Viajes en curso' } },
  '/admin/disputes': { get: { tag: T.admin, summary: 'Disputas', query: [['status', str()]] } },
  '/admin/disputes/{id}/resolve': { post: { tag: T.admin, summary: 'Resolver disputa', idempotency: true, body: obj({ outcome: oneOf(['reembolso_total', 'reembolso_parcial', 'sin_reembolso']), resolution: str(), amount: num({ description: 'Obligatorio en reembolso_parcial' }) }, ['outcome', 'resolution']) } },
  '/admin/zones': { post: { tag: T.admin, summary: 'Crear zona de servicio', status: 201, body: obj({ name: str({ example: 'Gran Santo Domingo' }), latitude: num({ example: 18.4861 }), longitude: num({ example: -69.9312 }), radiusMeters: num({ example: 30000 }), active: bool() }, ['name', 'latitude', 'longitude', 'radiusMeters']) } },
  '/admin/zones/{id}': { patch: { tag: T.admin, summary: 'Editar zona', body: obj({ name: str(), latitude: num(), longitude: num(), radiusMeters: num(), active: bool() }) } },
  '/admin/commission-rules': { post: { tag: T.admin, summary: 'Nueva regla de comisión (cierra la anterior)', status: 201, body: obj({ name: str(), type: oneOf(['porcentaje', 'fijo', 'mixto']), percentage: num({ example: 10 }), fixedAmount: num(), minimum: num(), maximum: num(), currency: str({ default: 'DOP' }) }, ['name', 'type']) } },
};

const PATH_PARAMS: Record<string, Schema> = {
  milestone: oneOf(['CONFIRM_ASSIGNMENT', 'DEPART_TO_ORIGIN', 'CHECKIN_ORIGIN', 'MARK_LOADED', 'CHECKIN_DESTINATION', 'UNLOAD', 'COMPLETE_DELIVERY']),
  token: str(),
};
const ERROR = { $ref: '#/components/responses/Error' };

function operation(path: string, op: Op) {
  const params = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: PATH_PARAMS[name] ?? str() }));
  const query = (op.query ?? []).map(([name, schema, required]) => ({ name, in: 'query', required: !!required, schema }));
  // Creating a request takes an optional key; money movements require one.
  const header = op.idempotency ? [{ name: 'Idempotency-Key', in: 'header', required: !path.startsWith('/transport-requests'), schema: str({ example: 'f3c1d6c2-1b5e-4a8e-9c3b-5d2e7a9b0c11' }) }] : [];
  return {
    tags: [op.tag],
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    ...(op.public ? { security: [] } : {}),
    parameters: [...params, ...query, ...header],
    ...(op.body ? { requestBody: { required: true, content: { 'application/json': { schema: op.body } } } } : {}),
    responses: {
      [String(op.status ?? 200)]: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
      ...(op.public ? {} : { 401: ERROR }),
      400: ERROR,
      ...(path.startsWith('/admin') ? { 403: ERROR } : {}),
      404: ERROR,
      409: ERROR,
    },
  };
}

export function openApiDocument() {
  const tags = [...new Set(Object.values(routes).flatMap((methods) => Object.values(methods).map((op) => op.tag)))];
  return {
    openapi: '3.0.3',
    info: {
      title: 'BANEY · Transport Service',
      version: '0.1.0',
      description: 'API del módulo de transporte de BANEY.\n\n**Token:** inicia sesión en el User Service con `POST /api/users/api/v1/auth/login?session=token` (con `session=token`; el modo por defecto, cookie, es para navegadores), copia el `access_token` de la respuesta y pégalo en **Authorize** (solo el token). Dura poco: si recibes 401 con `reason: expired`, vuelve a iniciar sesión.\n\nUn 401 trae `reason` y `hint` con la causa (expired, signature, audience…). Las rutas de Admin exigen rol moderador o superadmin en `baney.usuario`.',
    },
    servers: [{ url: '/', description: 'Este servidor' }],
    tags: tags.map((name) => ({ name })),
    security: [{ bearerAuth: [] }],
    paths: Object.fromEntries(Object.entries(routes).map(([path, methods]) => [path, Object.fromEntries(Object.entries(methods).map(([method, op]) => [method, operation(path, op)]))])),
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      responses: { Error: { description: 'Error', content: { 'application/json': { schema: obj({ message: str() }) } } } },
      schemas: {
        Place: obj({ address: str({ example: 'Av. Abraham Lincoln, Santo Domingo' }), latitude: num({ example: 18.4735 }), longitude: num({ example: -69.9406 }) }, ['address', 'latitude', 'longitude']),
        NewRequest: obj({
          cargo: obj({ description: str({ example: 'Grava lavada 12 Ton' }), weightKg: num({ example: 12000 }), volumeM3: num() }, ['description']),
          origin: ref('Place'),
          destination: obj({ address: str({ example: 'Bávaro, Verón' }), latitude: num({ example: 18.6826 }), longitude: num({ example: -68.4537 }) }, ['address', 'latitude', 'longitude']),
          timeWindow,
          requestedVehicleType: oneOf(['DUMP_TRUCK', 'FLATBED', 'OTHER']),
          requestedCapacityKg: num({ example: 15000 }),
          specialInstructions: str({ example: 'Se descarga con pala' }),
        }, ['cargo', 'origin', 'destination', 'timeWindow']),
        Vehicle: obj({ registrationNumber: str({ example: 'L123456' }), bodyType: oneOf(['DUMP_TRUCK', 'FLATBED', 'OTHER']), capacityValue: num({ example: 14 }), capacityUnit: oneOf(['M3', 'TON', 'FT']), capacityKg: num({ example: 15000 }) }, ['registrationNumber', 'bodyType', 'capacityValue', 'capacityUnit', 'capacityKg']),
      },
    },
  };
}

/** Documented paths and methods (for tests). */
export const documentedOperations = () => Object.entries(routes).flatMap(([path, methods]) => Object.keys(methods).map((method) => ({ path, method: method.toUpperCase(), public: !!methods[method].public })));

/**
 * Swagger UI page. The spec is fetched next to the page and its server is rewritten to the public base
 * (e.g. https://host/api/transport) so "Try it out" works behind the Nginx prefix.
 */
export const swaggerHtml = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BANEY · Transport API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
<style>body{margin:0}.topbar{display:none}</style></head>
<body><div id="swagger"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  var docs = location.pathname.replace(/\\/+$/, '');
  var base = location.origin + docs.replace(/\\/docs$/, '');
  fetch(docs + '/openapi.json').then(function (r) { return r.json(); }).then(function (spec) {
    spec.servers = [{ url: base, description: 'Este servidor' }];
    SwaggerUIBundle({ spec: spec, dom_id: '#swagger', deepLinking: true, persistAuthorization: true, docExpansion: 'none', filter: true, tryItOutEnabled: true,
      // Pasted "Bearer eyJ…" or with quotes: send the bare token once.
      requestInterceptor: function (req) {
        var auth = req.headers && req.headers.Authorization;
        if (auth) req.headers.Authorization = 'Bearer ' + auth.replace(/^(\\s*Bearer\\s+)+/i, '').replace(/^["']|["']$/g, '').trim();
        return req;
      } });
  });
</script></body></html>`;
