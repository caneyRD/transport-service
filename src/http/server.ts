import { EvidenceStage, EvidenceType, TripMilestone, TripOperationsRepository, TripOperationsHandler } from '../application/transport/trip-operations';
import { TransportExceptionType } from '../domain/transport/transport-exception';
import { TransportQueries, TripHistoryRepository } from '../application/transport/transport-queries';
import { ReviseRequestHandler, ReviseRequest } from '../application/transport/revise-request';
import { FleetRepository, ManageFleetHandler } from '../application/transport/manage-fleet';
import { VehicleBodyType, VehicleCapacityUnit } from '../domain/transport/vehicle';
import { CarrierRepository, RegisterCarrierHandler } from '../application/transport/register-carrier';
import { BackhaulInput, CarrierRequestRepository, CarrierRequestsHandler } from '../application/transport/carrier-requests';
import { createServer, IncomingMessage } from 'node:http';
import { TransportRequestStatus } from '../domain/transport/transport-request';
import { CreateTransportRequestHandler } from '../application/transport/create-transport-request';
import { SelectCargoTypeHandler } from '../application/transport/select-cargo-type';
import { FindNearbyTrucksHandler } from '../application/transport/find-nearby-trucks';
import { CalculateRouteHandler } from '../application/transport/calculate-route';
import { ViewReceivedOffersHandler } from '../application/transport/view-received-offers';
import { AcceptOfferHandler } from '../application/transport/accept-offer';
import { CounterOfferHandler } from '../application/transport/counter-offer';
import { CancelTransportRequestHandler } from '../application/transport/cancel-transport-request';
import { ExpireOffersHandler } from '../application/transport/expire-offers';
import { TransportRequestRepository } from '../application/transport/ports/transport-request.repository';
import { TransportOfferRepository } from '../application/transport/ports/transport-offer.repository';
import { MatchingCandidateRepository } from '../application/transport/ports/matching-candidate.repository';
import { DomainError } from '../domain/shared/domain-error';
import { TransportRequest } from '../domain/transport/transport-request';
import { TransportOffer } from '../domain/transport/transport-offer';
import { CargoType } from '../domain/transport/cargo';
import { openApiDocument, swaggerHtml } from './openapi';
import { CarrierRouteHandler } from '../application/transport/carrier-route';
import { Authenticate, HttpError } from './auth';
import { CarrierDocumentContentType, CarrierDocumentType, CarrierDocumentsHandler } from '../application/transport/carrier-documents';
import { CarrierApprovalHandler, REVIEWER_ROLES, ReviewerRequiredError } from '../application/transport/carrier-approval';
import { CommissionType, TransportAdminHandler } from '../application/transport/transport-admin';
import { ClientServicesHandler } from '../application/transport/client-services';
import { GeodesicRouteProvider, RouteProvider } from '../application/transport/ports/route-provider';
import { CarrierFinanceHandler } from '../application/transport/carrier-finance';
import { DisputeReason, TransportDisputesHandler } from '../application/transport/disputes';
import { TransportNotificationsHandler } from '../application/transport/notifications';
import { TripChatHandler } from '../application/transport/trip-chat';
import { TripCallHandler } from '../application/transport/trip-call';
import { CancellationPenaltyHandler } from '../application/transport/cancellation-penalty';
import { PayoutSettlementHandler } from '../application/transport/payout-settlement';

export interface Repositories {
  operations: TripOperationsRepository;
  tripHistory: TripHistoryRepository;
  fleet: FleetRepository;
  carriers: CarrierRepository;
  requests: TransportRequestRepository;
  offers: TransportOfferRepository;
  candidates: MatchingCandidateRepository;
  tracking: { findLiveByRequestId(requestId: string): Promise<unknown[]> };
  carrierRequests: CarrierRequestRepository;
  documents?: import('../application/transport/carrier-documents').CarrierDocumentRepository;
  finance?: import('../application/transport/carrier-finance').CarrierFinanceRepository;
  disputes?: import('../application/transport/disputes').TransportDisputeRepository;
  notifications?: import('../application/transport/notifications').TransportNotificationRepository;
  chat?: import('../application/transport/trip-chat').TripChatRepository;
  zones?: import('../application/transport/service-zones').ServiceZoneRepository;
  calls?: import('../application/transport/trip-call').TripCallRepository;
  commission?: import('../application/transport/commission-rule').TransportCommissionRuleRepository;
  approval?: import('../application/transport/carrier-approval').CarrierApprovalRepository;
  admin?: import('../application/transport/transport-admin').TransportAdminRepository;
  clientServices?: import('../application/transport/client-services').ClientServicesRepository;
}
export interface TransportStore {
  execute<T>(action: (repositories: Repositories) => Promise<T>): Promise<T>;
  health(): Promise<void>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Expected a JSON object');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new HttpError(400, `${name} must be a nonempty string (maximum 2000 characters)`);
  return value;
}
function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, `${name} must be a finite number`);
  return value;
}
function date(value: unknown, name: string): Date {
  const result = new Date(text(value, name));
  if (!Number.isFinite(result.getTime())) throw new HttpError(400, `${name} must be a valid date`);
  return result;
}
function location(value: unknown) {
  const body = object(value);
  return { address: text(body.address, 'address'), latitude: number(body.latitude, 'latitude'), longitude: number(body.longitude, 'longitude') };
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415, 'Content-Type must be application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, 'Request body exceeds 64 KiB');
    chunks.push(Buffer.from(chunk));
  }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { throw new HttpError(400, 'Invalid JSON object'); }
}
export function requestDto(request: TransportRequest) {
  return {
    id: request.props.id, requesterId: request.props.requesterId, status: request.currentStatus,
    assignmentId: request.currentAssignmentId, version: request.currentVersion,
    cargo: { description: request.props.cargo.description, type: request.props.cargo.cargoType,
      weightKg: request.props.cargo.weight?.value, volumeM3: request.props.cargo.volume?.value },
    origin: request.props.origin, destination: request.props.destination, timeWindow: request.props.timeWindow,
    requestedVehicleType: request.props.requestedVehicleType, requestedCapacityKg: request.props.requestedCapacityKg,
    specialInstructions: request.props.specialInstructions,
  };
}
export function offerDto(offer: TransportOffer) {
  return { id: offer.id, requestId: offer.requestId, carrierId: offer.carrierId, vehicleId: offer.vehicleId,
    price: offer.price, validUntil: offer.validUntil, status: offer.currentStatus,
    parentOfferId: offer.parentOfferId, proposedBy: offer.proposedBy, round: offer.round };
}

/** Back-office check: the role stored in baney.usuario, or the token's role claim when the store has no approval repository. */
async function reviewer(r: Repositories, userId: string, authorization: string | undefined) {
  if (r.approval) return new CarrierApprovalHandler(r.approval).assertReviewer(userId);
  if (!REVIEWER_ROLES.includes(tokenRole(authorization))) throw new ReviewerRequiredError('Only moderators can review carriers');
}
/** Role claim of a token whose signature `authenticate` already verified. */
export function tokenRole(authorization: string | undefined): string {
  try {
    const payload = JSON.parse(Buffer.from((authorization ?? '').slice(7).split('.')[1] ?? '', 'base64url').toString());
    const role = payload.role ?? payload.rol;
    return typeof role === 'string' ? role : '';
  } catch { return ''; }
}

export function createTransportServer(store: TransportStore, authenticate: Authenticate, options: { shareSecret?: string; routes?: RouteProvider; /** Swagger UI at /docs (on unless false) */ docs?: boolean } = {}) {
  const routes=options.routes ?? new GeodesicRouteProvider();
  const services=(r:Repositories)=>{ if(!r.clientServices) throw new HttpError(503,'Client services are not configured'); return new ClientServicesHandler(r.clientServices,options.shareSecret,routes); };
  return createServer(async (request, response) => {
    const send = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health') {
        try { await store.health(); send(200, { service: 'transport-service', status: 'ok', database: 'connected' }); }
        catch { send(503, { service: 'transport-service', status: 'unavailable', database: 'disconnected' }); }
        return;
      }
      // API documentation (public, read-only): Swagger UI and the OpenAPI document it renders.
      if (request.method === 'GET' && options.docs !== false && (url.pathname === '/docs' || url.pathname === '/docs/')) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(swaggerHtml); return;
      }
      if (request.method === 'GET' && options.docs !== false && url.pathname === '/docs/openapi.json') { send(200, openApiDocument()); return; }
      if (request.method === 'GET' && url.pathname === '/') {
        send(200, { service: 'transport-service', message: 'Backend de Transporte BANEY activo' }); return;
      }
      // UC-TRA-12: public, read-only view of a shared trip (signed, expiring link; no personal data).
      const sharedParts=url.pathname.split('/').filter(Boolean);
      if (sharedParts.length===3 && sharedParts[0]==='shared' && sharedParts[1]==='trips' && request.method==='GET') {
        send(200,await store.execute(r=>services(r).openShared(sharedParts[2]))); return;
      }
      const requesterId = await authenticate(request.headers.authorization);
      if(url.pathname==='/transport/zones' && request.method==='GET') { send(200,await store.execute(r=>{if(!r.zones) throw new HttpError(503,'Service zones are not configured'); return r.zones!.active();})); return; }
      if(url.pathname==='/transport/commission-rule' && request.method==='GET') { send(200,await store.execute(r=>{if(!r.commission) throw new HttpError(503,'Commission rules are not configured'); return r.commission!.current();})); return; }
      if(url.pathname==='/transport/cancellation-penalty' && request.method==='POST') { const body=await readBody(request); send(200,new CancellationPenaltyHandler().execute(number(body.baseAmount,'baseAmount'),text(body.currency,'currency'),date(body.scheduledAt,'scheduledAt'))); return; }
      if(url.pathname==='/transport/payout-settlement' && request.method==='POST') { const body=await readBody(request); send(200,new PayoutSettlementHandler().execute(number(body.gross,'gross'),number(body.commission,'commission'),number(body.penalty,'penalty'),text(body.currency,'currency'))); return; }
      if (url.pathname==='/transport-requests/price-estimate' && request.method==='POST') {
        const body=await readBody(request);
        send(200,await store.execute(r=>services(r).priceEstimate({origin:location(body.origin),destination:location(body.destination),
          weightKg:body.weightKg===undefined?undefined:number(body.weightKg,'weightKg'),cargoType:body.cargoType===undefined?undefined:text(body.cargoType,'cargoType'),
          vehicleType:body.vehicleType===undefined?undefined:text(body.vehicleType,'vehicleType')}))); return;
      }
      if (url.pathname==='/carrier/earning-estimate' && request.method==='POST') {
        const body=await readBody(request);
        send(200,await store.execute(r=>services(r).earningEstimate(number(body.amount,'amount'),body.currency===undefined?'DOP':text(body.currency,'currency')))); return;
      }
      const clientParts=url.pathname.split('/').filter(Boolean);
      if (clientParts.length===3 && clientParts[0]==='transport-requests' && clientParts[2]==='cargo-ready' && request.method==='POST') {
        await readBody(request);
        send(200,await store.execute(r=>services(r).cargoReady(clientParts[1],requesterId))); return;
      }
      if (clientParts.length===3 && clientParts[0]==='trips' && clientParts[2]==='share' && request.method==='POST') {
        await readBody(request);
        send(201,await store.execute(r=>services(r).shareTrip(clientParts[1],requesterId))); return;
      }
      const communicationParts=url.pathname.split('/').filter(Boolean);
      if(communicationParts.length===3 && communicationParts[0]==='trips' && communicationParts[2]==='messages' && (request.method==='GET'||request.method==='POST')) {
        send(request.method==='GET'?200:201,await store.execute(async r=>{if(!r.chat) throw new HttpError(503,'Trip chat is not configured'); const handler=new TripChatHandler(r.chat); if(request.method==='GET'){const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):50,offset=url.searchParams.has('offset')?Number(url.searchParams.get('offset')):0;return handler.list(communicationParts[1],requesterId,limit,offset);} const body=await readBody(request); return handler.send(communicationParts[1],requesterId,text(body.body,'body'));})); return;
      }
      if(communicationParts.length===3 && communicationParts[0]==='trips' && communicationParts[2]==='call' && request.method==='POST') { send(201,await store.execute(r=>{if(!r.calls) throw new HttpError(503,'Trip calls are not configured'); return new TripCallHandler(r.calls).request(communicationParts[1],requesterId);})); return; }
      if (url.pathname === '/carriers/me' && request.method === 'POST') {
        await readBody(request);
        const carrier = await store.execute(({ carriers }) => new RegisterCarrierHandler(carriers).execute(requesterId));
        send(200, carrier); return;
      }
      if (url.pathname === '/carriers/me/documents' && (request.method === 'POST' || request.method === 'GET')) {
        const documents = await store.execute(async r => {
          if (!r.documents) throw new HttpError(503, 'Carrier documents are not configured');
          const handler = new CarrierDocumentsHandler(r.documents);
          if (request.method === 'GET') return handler.list(requesterId);
          const body = await readBody(request);
          return handler.add(requesterId, {
            type: text(body.type, 'type') as CarrierDocumentType,
            url: text(body.url, 'url'),
            contentType: text(body.contentType, 'contentType') as CarrierDocumentContentType,
            bytes: number(body.bytes, 'bytes'),
            sha256: text(body.sha256, 'sha256'),
            expiresAt: body.expiresAt === undefined ? undefined : text(body.expiresAt, 'expiresAt'),
          });
        });
        send(request.method === 'POST' ? 201 : 200, documents); return;
      }
      if (url.pathname.startsWith('/carrier-documents/') && url.pathname.endsWith('/review') && request.method==='PATCH') {
        // KYC review is a back-office action: only moderators/superadmins, by the role stored in baney.usuario.
        const id=url.pathname.split('/')[2],body=await readBody(request);
        send(200,await store.execute(async r=>{if(!r.documents) throw new HttpError(503,'Carrier documents are not configured'); await reviewer(r,requesterId,request.headers.authorization); return new CarrierDocumentsHandler(r.documents).review(id,requesterId,text(body.status,'status') as 'aprobado'|'rechazado',body.reason===undefined?undefined:text(body.reason,'reason'));})); return; }
      // Back-office approval of carriers and vehicles (moderador/superadmin).
      const adminParts=url.pathname.split('/').filter(Boolean);
      if (adminParts[0]==='admin' && ['trips','disputes','zones','commission-rules'].includes(adminParts[1])) {
        const admin=(r:Repositories)=>{ if(!r.admin||!r.approval) throw new HttpError(503,'Transport back office is not configured'); return new TransportAdminHandler(r.admin,r.approval); };
        const optionalNumber=(value:unknown,name:string)=>value===undefined?undefined:number(value,name);
        if (adminParts[1]==='trips' && adminParts[2]==='live' && adminParts.length===3 && request.method==='GET') { send(200,await store.execute(r=>admin(r).liveTrips(requesterId))); return; }
        if (adminParts[1]==='disputes' && adminParts.length===2 && request.method==='GET') { send(200,await store.execute(r=>admin(r).disputes(requesterId,url.searchParams.get('status') ?? undefined))); return; }
        if (adminParts[1]==='disputes' && adminParts.length===4 && adminParts[3]==='resolve' && request.method==='POST') {
          const body=await readBody(request), key=request.headers['idempotency-key'];
          send(200,await store.execute(r=>admin(r).resolveDispute(requesterId,adminParts[2],text(body.outcome,'outcome'),text(body.resolution,'resolution'),optionalNumber(body.amount,'amount'),typeof key==='string'?key:''))); return;
        }
        if (adminParts[1]==='zones' && adminParts.length===2 && request.method==='POST') {
          const body=await readBody(request);
          send(201,await store.execute(r=>admin(r).createZone(requesterId,{name:text(body.name,'name'),latitude:number(body.latitude,'latitude'),longitude:number(body.longitude,'longitude'),radiusMeters:number(body.radiusMeters,'radiusMeters'),active:body.active===undefined?undefined:Boolean(body.active)}))); return;
        }
        if (adminParts[1]==='zones' && adminParts.length===3 && request.method==='PATCH') {
          const body=await readBody(request);
          if (body.active!==undefined && typeof body.active!=='boolean') throw new HttpError(400,'active must be a boolean');
          send(200,await store.execute(r=>admin(r).updateZone(requesterId,adminParts[2],{name:body.name===undefined?undefined:text(body.name,'name'),latitude:optionalNumber(body.latitude,'latitude'),longitude:optionalNumber(body.longitude,'longitude'),radiusMeters:optionalNumber(body.radiusMeters,'radiusMeters'),active:body.active as boolean|undefined}))); return;
        }
        if (adminParts[1]==='commission-rules' && adminParts.length===2 && request.method==='POST') {
          const body=await readBody(request);
          send(201,await store.execute(r=>admin(r).createCommissionRule(requesterId,{name:text(body.name,'name'),type:text(body.type,'type') as CommissionType,percentage:optionalNumber(body.percentage,'percentage') ?? 0,fixedAmount:optionalNumber(body.fixedAmount,'fixedAmount') ?? 0,minimum:optionalNumber(body.minimum,'minimum'),maximum:optionalNumber(body.maximum,'maximum'),currency:body.currency===undefined?'DOP':text(body.currency,'currency')}))); return;
        }
      }
      if (adminParts[0]==='admin' && (adminParts[1]==='carriers' || adminParts[1]==='vehicles')) {
        const approval=(r:Repositories)=>{ if(!r.approval) throw new HttpError(503,'Carrier approval is not configured'); return new CarrierApprovalHandler(r.approval); };
        if (adminParts[1]==='carriers' && adminParts.length===2 && request.method==='GET') {
          const status=url.searchParams.get('status') ?? undefined;
          send(200,await store.execute(r=>approval(r).list(requesterId,status))); return;
        }
        if (adminParts[1]==='carriers' && adminParts.length===3 && request.method==='GET') {
          send(200,await store.execute(r=>approval(r).detail(requesterId,adminParts[2]))); return;
        }
        if (adminParts.length===4 && adminParts[3]==='status' && request.method==='PATCH') {
          const body=await readBody(request), status=text(body.status,'status'), reason=body.reason===undefined?undefined:text(body.reason,'reason');
          send(200,await store.execute(r=>adminParts[1]==='carriers' ? approval(r).setCarrier(requesterId,adminParts[2],status,reason) : approval(r).setVehicle(requesterId,adminParts[2],status,reason))); return;
        }
      }
      if (url.pathname === '/carriers/me/earnings' && request.method === 'GET') {
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 25;
        const offset = url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0;
        send(200, await store.execute(r => { if (!r.finance) throw new HttpError(503,'Carrier finance is not configured'); return new CarrierFinanceHandler(r.finance).earnings(requesterId,limit,offset); })); return;
      }
      if (url.pathname === '/carriers/me/payouts' && request.method === 'POST') {
        const body=await readBody(request);
        const key=request.headers['idempotency-key'];
        if (typeof key !== 'string') throw new HttpError(400,'Idempotency-Key header is required');
        send(201, await store.execute(r => { if (!r.finance) throw new HttpError(503,'Carrier finance is not configured'); return new CarrierFinanceHandler(r.finance).payout(requesterId,number(body.amount,'amount'),text(body.bankAccountId,'bankAccountId'),key); })); return;
      }
      if (url.pathname === '/carriers/me/payout-schedule' && request.method === 'PUT') { const body=await readBody(request); send(200,await store.execute(r=>{if(!r.finance) throw new HttpError(503,'Carrier finance is not configured'); return new CarrierFinanceHandler(r.finance).schedule(requesterId,text(body.frequency,'frequency') as 'diaria'|'semanal'|'quincenal'|'mensual'|'manual',number(body.minimumAmount,'minimumAmount'));})); return; }
      if (url.pathname === '/transport/disputes' && request.method === 'POST') {
        const body=await readBody(request);
        send(201,await store.execute(r=>{if(!r.disputes) throw new HttpError(503,'Transport disputes are not configured'); return new TransportDisputesHandler(r.disputes).open(requesterId,text(body.tripId,'tripId'),text(body.reason,'reason') as DisputeReason,text(body.description,'description'),number(body.amount,'amount'));})); return;
      }
      if (url.pathname === '/me/notifications' && request.method === 'GET') {
        const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):25, offset=url.searchParams.has('offset')?Number(url.searchParams.get('offset')):0;
        send(200,await store.execute(r=>{if(!r.notifications) throw new HttpError(503,'Notifications are not configured'); return new TransportNotificationsHandler(r.notifications).list(requesterId,limit,offset);})); return;
      }
      if (url.pathname.startsWith('/me/notifications/') && url.pathname.endsWith('/read') && request.method==='POST') {
        const notificationId=url.pathname.split('/')[3];
        send(200,await store.execute(r=>{if(!r.notifications) throw new HttpError(503,'Notifications are not configured'); return new TransportNotificationsHandler(r.notifications).read(requesterId,notificationId);})); return;
      }
      if (url.pathname === '/transport/disputes/refund' && request.method==='POST') {
        const body=await readBody(request), key=request.headers['idempotency-key'];
        if(typeof key!=='string') throw new HttpError(400,'Idempotency-Key header is required');
        send(201,await store.execute(r=>{if(!r.disputes) throw new HttpError(503,'Transport disputes are not configured'); return new TransportDisputesHandler(r.disputes).refund(requesterId,text(body.disputeId,'disputeId'),number(body.amount,'amount'),text(body.reason,'reason'),key);})); return;
      }
      if (url.pathname === '/trips/history' && request.method === 'GET') {
        const limit=url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 25;
        const offset=url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0;
        send(200,await store.execute(r=>new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).history(requesterId,limit,offset))); return;
      }
      if (url.pathname === '/transport-requests' && request.method === 'GET') {
        const limit=url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 25;
        const offset=url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : 0;
        send(200,await store.execute(async r=>{
          // Requests nobody took in time are closed before listing (also done by the periodic sweep).
          await r.requests.expireStale?.(requesterId);
          return new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory).myRequests(requesterId,limit,offset);
        })); return;
      }
      const fleetParts = url.pathname.split('/').filter(Boolean);
      if(fleetParts.length===4 && fleetParts[0]==='carrier' && fleetParts[1]==='requests' && fleetParts[3]==='confirm' && request.method==='POST') {
        await readBody(request);
        send(200,await store.execute(r=>new TripOperationsHandler(r.operations).confirm(fleetParts[2],requesterId)));return;
      }
      if(fleetParts.length===4 && fleetParts[0]==='carrier' && fleetParts[1]==='requests' && fleetParts[3]==='start' && request.method==='POST') {
        await readBody(request);
        send(200,await store.execute(r=>new TripOperationsHandler(r.operations).start(fleetParts[2],requesterId)));return;
      }
      if(fleetParts.length===4 && fleetParts[0]==='trips' && fleetParts[2]==='milestones' && request.method==='POST') {
        await readBody(request);
        const milestone=fleetParts[3] as TripMilestone;
        send(200,await store.execute(r=>new TripOperationsHandler(r.operations).milestone(fleetParts[1],requesterId,milestone))); return;
      }
      if(fleetParts.length===3 && fleetParts[0]==='trips' && fleetParts[2]==='evidence' && request.method==='POST') {
        const body=await readBody(request);
        send(201,await store.execute(r=>new TripOperationsHandler(r.operations).evidence(fleetParts[1],requesterId,{stage:text(body.stage,'stage') as EvidenceStage,type:text(body.type,'type') as EvidenceType,url:text(body.url,'url'),latitude:body.latitude===undefined?undefined:number(body.latitude,'latitude'),longitude:body.longitude===undefined?undefined:number(body.longitude,'longitude')}))); return;
      }
      if(fleetParts.length===3 && fleetParts[0]==='trips' && fleetParts[2]==='evidence' && request.method==='GET') { send(200,await store.execute(r=>new TripOperationsHandler(r.operations).listEvidence(fleetParts[1],requesterId))); return; }
      if(fleetParts.length===4 && fleetParts[0]==='trips' && fleetParts[2]==='delivery' && fleetParts[3]==='otp' && request.method==='POST') {
        const body=await readBody(request);
        const delivery=await store.execute(r=>new TripOperationsHandler(r.operations).verifyDeliveryOtp(fleetParts[1],requesterId,text(body.otp,'otp'),body.recipientName===undefined?undefined:text(body.recipientName,'recipientName'),body.recipientDocument===undefined?undefined:text(body.recipientDocument,'recipientDocument'))) as {delivered?:boolean;attemptsRemaining?:number};
        // The failed attempt is already committed; only now report the error.
        if (delivery?.delivered===false) { send(400,{message:'Invalid delivery OTP',attemptsRemaining:delivery.attemptsRemaining}); return; }
        send(200,delivery); return;
      }
      if(fleetParts.length===3 && fleetParts[0]==='trips' && fleetParts[2]==='rating' && request.method==='POST') {
        const body=await readBody(request);
        send(201,await store.execute(r=>new TripOperationsHandler(r.operations).rate(fleetParts[1],requesterId,text(body.target,'target') as 'carrier'|'client',number(body.score,'score'),body.comment===undefined?undefined:text(body.comment,'comment')))); return;
      }
      if(fleetParts.length===3 && fleetParts[0]==='trips' && fleetParts[2]==='invoice' && request.method==='GET') {
        send(200,await store.execute(r=>new TripOperationsHandler(r.operations).invoice(fleetParts[1],requesterId))); return;
      }
      if(fleetParts.length===3 && fleetParts[0]==='trips' && request.method==='POST' && ['tracking','incidents','breakdown','delay','cargo-damage','accident','cargo-missing','no-show','customer-absent','assistance','sos'].includes(fleetParts[2])) {
        const body=await readBody(request);
        const data=await store.execute(r=>{
          const handler=new TripOperationsHandler(r.operations);
          if(fleetParts[2]==='tracking') return handler.track(fleetParts[1],requesterId,{latitude:number(body.latitude,'latitude'),longitude:number(body.longitude,'longitude'),recordedAt:date(body.recordedAt,'recordedAt'),sourcePointId:text(body.sourcePointId,'sourcePointId')});
          const type = fleetParts[2]==='breakdown' ? TransportExceptionType.BREAKDOWN :
            fleetParts[2]==='delay' ? TransportExceptionType.DELAY :
            fleetParts[2]==='cargo-damage' ? TransportExceptionType.DAMAGE :
            fleetParts[2]==='accident' ? TransportExceptionType.ACCIDENT :
            fleetParts[2]==='cargo-missing' ? TransportExceptionType.CARGO_MISSING :
            fleetParts[2]==='no-show' ? TransportExceptionType.NO_SHOW :
            fleetParts[2]==='customer-absent' ? TransportExceptionType.CUSTOMER_ABSENT :
            fleetParts[2]==='assistance' ? TransportExceptionType.ASSISTANCE :
            fleetParts[2]==='sos' ? TransportExceptionType.SOS : text(body.type,'type') as TransportExceptionType;
          return handler.incident(fleetParts[1],requesterId,type,text(body.description,'description'));
        });send(200,data);return;
      }

      if (url.pathname === '/carriers/me/verification' && request.method === 'GET') {
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).verification(requesterId))); return;
      }
      if (fleetParts.length===3 && fleetParts[0]==='carriers' && fleetParts[2]==='profile' && request.method==='GET') {
        send(200,await store.execute(r=>new ManageFleetHandler(r.fleet).publicProfile(fleetParts[1]))); return;
      }
      if (url.pathname === '/carriers/me/availability' && request.method === 'PUT') {
        const body=await readBody(request);
        if (typeof body.available !== 'boolean') throw new HttpError(400,'available must be boolean');
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).availability(requesterId,body.available as boolean,date(body.startsAt,'startsAt'),date(body.endsAt,'endsAt')))); return;
      }
      if (url.pathname === '/carriers/me/availability' && request.method === 'GET') {
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).currentAvailability(requesterId))); return;
      }
      if (url.pathname === '/carrier/requests/open' && request.method === 'GET') {
        const query=(name:string)=>{ const raw=url.searchParams.get(name); return raw===null ? undefined : number(raw.trim()==='' ? NaN : Number(raw), name); };
        const latitude=query('latitude'), longitude=query('longitude');
        if (latitude===undefined || longitude===undefined) throw new HttpError(400,'latitude and longitude are required');
        send(200, await store.execute(r => new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).open(requesterId,latitude,longitude,query('radiusKm'),query('limit')))); return;
      }
      const carrierOfferParts=url.pathname.split('/').filter(Boolean);
      if (carrierOfferParts.length===4 && carrierOfferParts[0]==='carrier' && carrierOfferParts[1]==='offers' && ['accept','counter'].includes(carrierOfferParts[3]) && request.method==='POST') {
        const body=await readBody(request);
        const answer=await store.execute(r=>new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).respondToCounter(requesterId,carrierOfferParts[2],carrierOfferParts[3] as 'accept'|'counter',carrierOfferParts[3]==='counter'?number(body.amount,'amount'):undefined));
        send(carrierOfferParts[3]==='counter'?201:200,{offer:offerDto(answer.offer),assignmentId:answer.assignmentId}); return;
      }
      if (url.pathname === '/carrier/offers' && request.method === 'GET') {
        const limit=url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 30;
        send(200, await store.execute(r => new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).myOffers(requesterId,limit))); return;
      }
      if (url.pathname === '/carrier/backhauls' && (request.method === 'GET' || request.method === 'POST')) {
        if (request.method === 'GET') { send(200,await store.execute(r=>new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).backhaulsOf(requesterId))); return; }
        const body=await readBody(request), origin=object(body.origin), destination=object(body.destination);
        const input:BackhaulInput={vehicleId:text(body.vehicleId,'vehicleId'),origin:{address:text(origin.address,'origin.address'),latitude:number(origin.latitude,'origin.latitude'),longitude:number(origin.longitude,'origin.longitude')},destination:{address:text(destination.address,'destination.address'),latitude:number(destination.latitude,'destination.latitude'),longitude:number(destination.longitude,'destination.longitude')},availableFrom:date(body.availableFrom,'availableFrom'),availableTo:date(body.availableTo,'availableTo'),capacityKg:number(body.capacityKg,'capacityKg')};
        send(201,await store.execute(r=>new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).publishBackhaul(requesterId,input))); return;
      }
      if(fleetParts.length===4 && fleetParts[0]==='carrier' && fleetParts[1]==='requests' && fleetParts[3]==='reject' && request.method==='POST') {
        const body=await readBody(request);
        send(200,await store.execute(r=>new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).reject(requesterId,fleetParts[2],text(body.reason,'reason')))); return;
      }
      if (fleetParts.length===4 && fleetParts[0]==='carrier' && fleetParts[1]==='requests' && fleetParts[3]==='offers' && request.method==='POST') {
        const body=await readBody(request);
        const offer=await store.execute(r => new CarrierRequestsHandler(r.fleet,r.requests,r.offers,r.carrierRequests).offer(requesterId,fleetParts[2],{
          amount:number(body.amount,'amount'), currency:body.currency===undefined ? undefined : text(body.currency,'currency'),
          validUntil:body.validUntil===undefined ? undefined : date(body.validUntil,'validUntil'),
          vehicleId:body.vehicleId===undefined ? undefined : text(body.vehicleId,'vehicleId') }));
        send(201, offerDto(offer)); return;
      }
      if (url.pathname === '/carriers/me/location' && request.method === 'PUT') {
        const body=await readBody(request);
        const recordedAt=body.recordedAt===undefined ? new Date() : date(body.recordedAt,'recordedAt');
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).updateLocation(requesterId,{latitude:number(body.latitude,'latitude'),longitude:number(body.longitude,'longitude'),recordedAt}))); return;
      }
      if (url.pathname === '/carriers/nearby' && request.method === 'GET') {
        const query=(name:string)=>{ const raw=url.searchParams.get(name); return raw===null ? undefined : number(raw.trim()==='' ? NaN : Number(raw), name); };
        const latitude=query('latitude'), longitude=query('longitude');
        if (latitude===undefined || longitude===undefined) throw new HttpError(400,'latitude and longitude are required');
        send(200, await store.execute(({fleet}) => new ManageFleetHandler(fleet).nearby(latitude,longitude,query('radiusKm'),query('limit')))); return;
      }
      // Carrier map: my GPS → pickup → destination (preview of open requests, or my assigned one) and the trip ETA.
      if (fleetParts.length===4 && fleetParts[0]==='carrier' && fleetParts[1]==='requests' && ['route','eta'].includes(fleetParts[3]) && request.method==='GET') {
        const coordinate=(name:string)=>{ const raw=url.searchParams.get(name); return raw===null ? undefined : number(raw.trim()==='' ? NaN : Number(raw), name); };
        const latitude=coordinate('latitude'), longitude=coordinate('longitude');
        if ((latitude===undefined)!==(longitude===undefined)) throw new HttpError(400,'latitude and longitude go together');
        const from=latitude!==undefined && longitude!==undefined ? {latitude,longitude} : undefined;
        send(200,await store.execute(r=>{ const handler=new CarrierRouteHandler(r.fleet,r.requests,r.carrierRequests,routes); return fleetParts[3]==='eta' ? handler.eta(requesterId,fleetParts[2],from) as Promise<unknown> : handler.preview(requesterId,fleetParts[2],from); })); return;
      }
      if (fleetParts.length===4 && fleetParts[0]==='carrier' && fleetParts[1]==='requests' && ['cargo','distance'].includes(fleetParts[3]) && request.method==='GET') {
        const data=await store.execute(async r=>{
          const queries=new TransportQueries(r.requests,r.offers,r.fleet,r.tripHistory,routes);
          if(fleetParts[3]==='cargo') {
            const request=await queries.carrierRequest(fleetParts[2],requesterId);
            return requestDto(request).cargo;
          }
          const route=await queries.route(fleetParts[2],requesterId);
          return {origin:route.origin,destination:route.destination,distanceKm:route.distance.value,estimatedDurationMinutes:route.estimatedDurationMinutes,provider:route.provider,polyline:route.polyline};
        });
        send(200,data);return;
      }
      if (fleetParts[0] === 'vehicles' && ((fleetParts.length === 1 && request.method === 'POST') || (fleetParts.length === 2 && request.method === 'PUT'))) {
        const body=await readBody(request);
        const data=await store.execute(({fleet}) => new ManageFleetHandler(fleet).vehicle(requesterId, {
          registrationNumber:text(body.registrationNumber,'registrationNumber'),bodyType:text(body.bodyType,'bodyType') as VehicleBodyType,
          capacityValue:number(body.capacityValue,'capacityValue'),capacityUnit:text(body.capacityUnit,'capacityUnit') as VehicleCapacityUnit,
          capacityKg:number(body.capacityKg,'capacityKg') },fleetParts[1]));
        send(fleetParts.length === 1 ? 201 : 200,data); return;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'transport-requests') throw new HttpError(404, 'Route not found');
      const body = ['POST', 'PATCH'].includes(request.method ?? '') ? await readBody(request) : {};
      const result = await store.execute(async ({ requests, offers, candidates, tracking, fleet, tripHistory }) => {
        if ((parts.length === 1 || (parts.length === 2 && parts[1] === 'scheduled')) && request.method === 'POST') {
          const cargo = object(body.cargo), window = object(body.timeWindow);
          const key = request.headers['idempotency-key'];
          const creator=parts.length===2 ? new ReviseRequestHandler(requests).schedule.bind(new ReviseRequestHandler(requests)) : new CreateTransportRequestHandler(requests).execute.bind(new CreateTransportRequestHandler(requests));
          const created = await creator({
            requesterId, idempotencyKey: key === undefined ? undefined : text(key, 'Idempotency-Key'),
            cargo: { description: text(cargo.description, 'cargo.description'),
              weightKg: cargo.weightKg === undefined ? undefined : number(cargo.weightKg, 'weightKg'),
              volumeM3: cargo.volumeM3 === undefined ? undefined : number(cargo.volumeM3, 'volumeM3') },
            origin: location(body.origin), destination: location(body.destination),
            timeWindow: { startsAt: date(window.startsAt, 'startsAt'), endsAt: date(window.endsAt, 'endsAt') },
            requestedVehicleType: body.requestedVehicleType === undefined ? undefined : text(body.requestedVehicleType,'requestedVehicleType') as 'DUMP_TRUCK'|'FLATBED'|'OTHER',
            requestedCapacityKg: body.requestedCapacityKg === undefined ? undefined : number(body.requestedCapacityKg,'requestedCapacityKg'),
            specialInstructions: body.specialInstructions === undefined ? undefined : text(body.specialInstructions,'specialInstructions'),
          });
          return { status: 201, data: requestDto(created) };
        }
        if (parts.length < 2) throw new HttpError(404, 'Route not found');
        const requestId = parts[1];
        if (request.method === 'GET') await requests.expireStale?.(requesterId);
        const owned = await requests.findById(requestId);
        if (!owned) throw new HttpError(404, 'Transport request was not found');
        if (owned.props.requesterId !== requesterId) throw new HttpError(403, 'Only the request owner can access this request');
        if (parts.length === 3 && parts[2] === 'photos' && request.method === 'POST') {
          if (!requests.addCargoPhoto) throw new HttpError(503, 'Cargo photos are not configured');
          const urlValue = text(body.url, 'url');
          let parsed: URL;
          try { parsed = new URL(urlValue); } catch { throw new HttpError(400, 'url must be valid'); }
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new HttpError(400, 'url must use http or https');
          return { status: 201, data: await requests.addCargoPhoto(requestId, requesterId, urlValue) };
        }
        if (request.method === 'PATCH' && (parts.length===2 || (parts.length===3 && ['pickup-window','reschedule','cargo-weight','cargo-volume'].includes(parts[2])))) {
          const changes:ReviseRequest={};
          if (parts.length===2) {
            if(body.origin!==undefined) changes.origin=location(body.origin);
            if(body.destination!==undefined) changes.destination=location(body.destination);
            if(body.cargo!==undefined) {
              const cargo=object(body.cargo);
              changes.cargo={description:cargo.description===undefined?undefined:text(cargo.description,'description'),
                weightKg:cargo.weightKg===undefined?undefined:number(cargo.weightKg,'weightKg'),volumeM3:cargo.volumeM3===undefined?undefined:number(cargo.volumeM3,'volumeM3')};
            }
          } else if(parts[2]==='cargo-weight') changes.cargo={weightKg:number(body.weightKg,'weightKg')};
          else if(parts[2]==='cargo-volume') changes.cargo={volumeM3:number(body.volumeM3,'volumeM3')};
          else changes.timeWindow={startsAt:date(body.startsAt,'startsAt'),endsAt:date(body.endsAt,'endsAt')};
          return {status:200,data:requestDto(await new ReviseRequestHandler(requests).execute(requestId,requesterId,changes))};
        }
        if (parts.length === 2 && request.method === 'GET') return { status: 200, data: { ...requestDto(owned), ...(owned.currentStatus === TransportRequestStatus.CANCELLED && await requests.isExpired?.(requestId) ? { expired: true } : {}) } };
        if (parts.length === 3 && parts[2] === 'cargo-type' && request.method === 'PATCH') {
          const type = text(body.type, 'type') as CargoType;
          return { status: 200, data: requestDto(await new SelectCargoTypeHandler(requests).execute({ requestId, type })) };
        }
        if (parts.length === 3 && parts[2] === 'nearby-trucks' && request.method === 'GET') {
          const rawDistance = url.searchParams.get('maxDistanceKm');
          const maxDistanceKm = rawDistance === null ? undefined : number(rawDistance.trim() === '' ? NaN : Number(rawDistance), 'maxDistanceKm');
          const data = await new FindNearbyTrucksHandler(requests, candidates).execute({ requestId, maxDistanceKm });
          return { status: 200, data };
        }
        if (parts.length === 3 && (parts[2] === 'compatible-trucks' || parts[2] === 'matching-candidates') && request.method === 'GET') {
          const data = await new FindNearbyTrucksHandler(requests, candidates).execute({ requestId });
          return { status: 200, data };
        }
        if (parts.length === 3 && (parts[2] === 'route' || parts[2] === 'eta') && request.method === 'GET') {
          // ETA (UC-TRA-09): once the truck sends GPS, from its last position to the destination.
          const live = parts[2] === 'eta' ? (await tracking.findLiveByRequestId(requestId)) as Array<{ latitude?: unknown; longitude?: unknown; tripState?: string }> : [];
          const last = live[0];
          const from = last && Number.isFinite(Number(last.latitude)) && Number.isFinite(Number(last.longitude)) ? { latitude: Number(last.latitude), longitude: Number(last.longitude) } : undefined;
          // While the truck goes to the pickup, the ETA is to the pickup; once loaded, to the destination.
          const leg = from && ['hacia_origen', 'en_origen'].includes(String(last?.tripState)) ? 'PICKUP' : 'DELIVERY';
          const route = await new CalculateRouteHandler(requests, routes).execute(requestId, from, leg === 'PICKUP' ? 'origin' : 'destination');
          return { status: 200, data: { routeId: route.id, distanceKm: route.distance.value,
            estimatedDurationMinutes: route.estimatedDurationMinutes, calculatedAt: new Date().toISOString(),
            provider: route.provider, polyline: route.polyline, from: from ? 'TRUCK' : 'ORIGIN', leg } };
        }
        if (parts.length === 3 && parts[2] === 'tracking' && request.method === 'GET') {
          return { status: 200, data: await tracking.findLiveByRequestId(requestId) };
        }
        if (parts.length===3 && parts[2]==='compare-offers' && request.method==='GET') {
          const data=await new TransportQueries(requests,offers,fleet,tripHistory).compare(requestId,requesterId);
          return {status:200,data:data.map(offerDto)};
        }
        if (parts.length === 3 && parts[2] === 'offers' && request.method === 'GET') {
          const data = await new ViewReceivedOffersHandler(requests, offers).execute({ requestId, requesterId });
          return { status: 200, data: data.map(offerDto) };
        }
        if (parts.length === 4 && parts[2] === 'offers' && parts[3] === 'expire' && request.method === 'POST') {
          return { status: 200, data: (await new ExpireOffersHandler(offers).execute(requestId)).map(offerDto) };
        }
        if (parts.length === 5 && parts[2] === 'offers' && request.method === 'POST') {
          const offerId = parts[3];
          if (parts[4] === 'accept') {
            const accepted = await new AcceptOfferHandler(requests, offers).execute({ requestId, requesterId, offerId });
            return { status: 200, data: { request: requestDto(accepted.request), offer: offerDto(accepted.offer) } };
          }
          if (parts[4] === 'counter') {
            const counter = await new CounterOfferHandler(requests, offers).execute({ requestId, requesterId, offerId,
              amount: number(body.amount, 'amount'), currency: text(body.currency, 'currency'), validUntil: date(body.validUntil, 'validUntil') });
            return { status: 201, data: offerDto(counter) };
          }
        }
        if (parts.length === 3 && parts[2] === 'cancel' && request.method === 'POST') {
          return { status: 200, data: requestDto(await new CancelTransportRequestHandler(requests).execute({ requestId, requesterId })) };
        }
        throw new HttpError(404, 'Route not found');
      });
      send(result.status, result.data);
    } catch (error) {
      if (error instanceof HttpError) send(error.status, { message: error.message });
      else if (error instanceof ReviewerRequiredError) send(403, { message: error.message });
      else if (error instanceof DomainError && /share link/.test(error.message)) send(404, { message: error.message });
      else if (error instanceof DomainError && /not configured/.test(error.message)) send(503, { message: error.message });
      else if (error instanceof DomainError) send(/concurrent|transition|already|Only|Expired/.test(error.message) ? 409 : 400, { message: error.message });
      else {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === '22P02') send(400, { message: 'Invalid identifier or value' });
        else if (code === '23505' || code === '40001' || code === '40P01') send(409, { message: 'Concurrent update; retry the request' });
        else {
          // Unexpected failure: log the cause for the server logs (docker logs), never to the client.
          const detail = error instanceof Error ? error.message : String(error);
          console.error(`[transport] ${request.method} ${request.url?.split('?')[0]} -> 500${code ? ` (pg ${String(code)})` : ''}: ${detail}`);
          send(500, { message: 'Internal server error' });
        }
      }
    }
  });
}
