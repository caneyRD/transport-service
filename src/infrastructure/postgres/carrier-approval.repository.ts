import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { ApprovalStatus, CarrierApprovalRepository } from '../../application/transport/carrier-approval';

/** Documents a carrier needs approved before working (UC-TRA-20). */
export const REQUIRED_CARRIER_DOCUMENTS = ['cedula_frente', 'cedula_reverso', 'licencia_conducir'];

// Quoted aliases on purpose: canonicalRows renames Spanish columns such as "estado".
const CARRIER_FIELDS = `p.id AS "profileId",p.usuario_uid AS "userId",u.nombre_completo AS "fullName",u.email AS "email",u.telefono AS "phone",
  p.estado AS "carrierState",p.induccion_completada_en AS "inductionCompletedAt",p.licencia_numero AS "licenseNumber",
  p.licencia_vencimiento AS "licenseExpiresAt",p.disponible AS "available",p.creado_en AS "registeredAt",
  (SELECT count(*)::int FROM baney.vehiculo v WHERE v.dueno_uid=p.dueno_flota_uid AND v.eliminado_en IS NULL) AS "vehicleCount",
  (SELECT count(*)::int FROM baney.vehiculo v WHERE v.dueno_uid=p.dueno_flota_uid AND v.eliminado_en IS NULL AND v.estado='habilitado') AS "enabledVehicleCount",
  (SELECT count(*)::int FROM baney.documento_usuario d WHERE d.usuario_uid=p.usuario_uid AND d.estado='pendiente_revision') AS "pendingDocuments"`;

export class PostgresCarrierApprovalRepository implements CarrierApprovalRepository {
  constructor(private readonly client: PoolClient) {}

  async reviewerRole(userId: string) {
    const r = await this.client.query(`SELECT rol AS "userRole" FROM baney.usuario WHERE id=$1::uuid AND activo AND eliminado_en IS NULL`, [userId]);
    return r.rows[0]?.userRole as string | undefined;
  }

  async listCarriers(status?: ApprovalStatus) {
    const r = await this.client.query(`SELECT ${CARRIER_FIELDS} FROM baney.perfil_transportista p JOIN baney.usuario u ON u.id=p.usuario_uid
      WHERE p.eliminado_en IS NULL AND ($1::text IS NULL OR p.estado=$1::text) ORDER BY p.creado_en ASC LIMIT 200`, [status ?? null]);
    return r.rows.map(row => this.carrier(row));
  }

  async carrierDetail(carrierUserId: string) {
    const r = await this.client.query(`SELECT ${CARRIER_FIELDS} FROM baney.perfil_transportista p JOIN baney.usuario u ON u.id=p.usuario_uid
      WHERE p.usuario_uid=$1::uuid AND p.eliminado_en IS NULL`, [carrierUserId]);
    if (!r.rows[0]) throw new DomainError('Carrier was not found');
    const vehicles = await this.client.query(`SELECT v.id AS "vehicleId",v.placa AS "plate",v.tipo_carroceria AS "bodyKind",v.capacidad AS "capacityValue",
        v.unidad_capacidad AS "capacityUnit",v.capacidad_kg AS "capacityKg",v.marca AS "brand",v.modelo AS "model",v.anio AS "year",v.estado AS "vehicleState"
      FROM baney.vehiculo v JOIN baney.perfil_transportista p ON v.dueno_uid=p.dueno_flota_uid
      WHERE p.usuario_uid=$1::uuid AND v.eliminado_en IS NULL ORDER BY v.creado_en`, [carrierUserId]);
    const documents = await this.client.query(`SELECT d.id AS "documentId",d.tipo AS "documentType",d.url AS "url",d.tipo_contenido AS "contentType",
        d.estado AS "documentState",d.motivo_estado AS "reason",d.fecha_vencimiento AS "expiresAt",d.subido_en AS "uploadedAt"
      FROM baney.documento_usuario d WHERE d.usuario_uid=$1::uuid ORDER BY d.subido_en DESC`, [carrierUserId]);
    return { ...this.carrier(r.rows[0]),
      vehicles: vehicles.rows.map(v => ({ id: v.vehicleId, plate: v.plate, bodyType: v.bodyKind, capacity: Number(v.capacityValue), capacityUnit: v.capacityUnit,
        capacityKg: Number(v.capacityKg), brand: v.brand, model: v.model, year: v.year, status: v.vehicleState })),
      documents: documents.rows.map(d => ({ id: d.documentId, type: d.documentType, url: d.url, contentType: d.contentType, status: d.documentState,
        reason: d.reason, expiresAt: d.expiresAt, uploadedAt: d.uploadedAt })),
      missingDocuments: await this.missingDocuments(carrierUserId) };
  }

  async setCarrierStatus(carrierUserId: string, status: ApprovalStatus, reviewer: { id: string; role: string }, reason?: string) {
    const before = await this.client.query(`SELECT estado AS "carrierState" FROM baney.perfil_transportista WHERE usuario_uid=$1::uuid AND eliminado_en IS NULL FOR UPDATE`, [carrierUserId]);
    if (!before.rows[0]) throw new DomainError('Carrier was not found');
    // Approving records the induction (required by ck_perfil_transportista_activa);
    // any other status takes the carrier off the map.
    const r = await this.client.query(`UPDATE baney.perfil_transportista SET estado=$2::text,
        induccion_completada_en=CASE WHEN $2::text='habilitado' THEN COALESCE(induccion_completada_en,now()) ELSE induccion_completada_en END,
        disponible=CASE WHEN $2::text='habilitado' THEN disponible ELSE false END,
        disponible_desde=CASE WHEN $2::text='habilitado' THEN disponible_desde ELSE NULL END,
        actualizado_en=now()
      WHERE usuario_uid=$1::uuid AND eliminado_en IS NULL
      RETURNING id AS "profileId",usuario_uid AS "userId",estado AS "carrierState",induccion_completada_en AS "inductionCompletedAt"`, [carrierUserId, status]);
    await this.audit(reviewer, 'transportista.estado', 'perfil_transportista', r.rows[0].profileId, before.rows[0].carrierState, status, reason);
    if (status === 'habilitado' || status === 'deshabilitado' || status === 'suspendido') await this.notify(carrierUserId, status, reason);
    return { profileId: r.rows[0].profileId, userId: r.rows[0].userId, status: r.rows[0].carrierState,
      inductionCompletedAt: r.rows[0].inductionCompletedAt, reason, missingDocuments: await this.missingDocuments(carrierUserId) };
  }

  async setVehicleStatus(vehicleId: string, status: ApprovalStatus, reviewer: { id: string; role: string }, reason?: string) {
    const before = await this.client.query(`SELECT estado AS "vehicleState" FROM baney.vehiculo WHERE id=$1::uuid AND eliminado_en IS NULL FOR UPDATE`, [vehicleId]);
    if (!before.rows[0]) throw new DomainError('Vehicle was not found');
    const r = await this.client.query(`UPDATE baney.vehiculo SET estado=$2::text,actualizado_en=now() WHERE id=$1::uuid
      RETURNING id AS "vehicleId",dueno_uid AS "ownerUid",placa AS "plate",estado AS "vehicleState"`, [vehicleId, status]);
    await this.audit(reviewer, 'vehiculo.estado', 'vehiculo', vehicleId, before.rows[0].vehicleState, status, reason);
    return { id: r.rows[0].vehicleId, ownerId: r.rows[0].ownerUid, plate: r.rows[0].plate, status: r.rows[0].vehicleState, reason };
  }

  private carrier(row: Record<string, unknown>) {
    return { profileId: row.profileId, userId: row.userId, fullName: row.fullName, email: row.email, phone: row.phone, status: row.carrierState,
      inductionCompletedAt: row.inductionCompletedAt, licenseNumber: row.licenseNumber, licenseExpiresAt: row.licenseExpiresAt,
      available: row.available, registeredAt: row.registeredAt, vehicleCount: row.vehicleCount, enabledVehicleCount: row.enabledVehicleCount,
      pendingDocuments: row.pendingDocuments };
  }

  /** Required document types without an approved copy: informative, the reviewer decides. */
  private async missingDocuments(carrierUserId: string): Promise<string[]> {
    const r = await this.client.query(`SELECT DISTINCT tipo AS "documentType" FROM baney.documento_usuario WHERE usuario_uid=$1::uuid AND estado='aprobado'`, [carrierUserId]);
    const approved = new Set(r.rows.map(row => row.documentType as string));
    return REQUIRED_CARRIER_DOCUMENTS.filter(type => !approved.has(type));
  }

  private async audit(reviewer: { id: string; role: string }, action: string, entity: string, entityId: string, before: unknown, after: string, reason?: string) {
    await this.client.query(`INSERT INTO baney.auditoria(modulo,accion,actor_uid,actor_rol,entidad_tipo,entidad_uid,detalle,antes,despues)
      VALUES('transporte',$1,$2::uuid,$3,$4,$5::uuid,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [action, reviewer.id, reviewer.role, entity, entityId, JSON.stringify(reason ? { reason } : {}), JSON.stringify({ estado: before }), JSON.stringify({ estado: after })]);
  }

  private async notify(userId: string, status: string, reason?: string) {
    const titles: Record<string, string> = { habilitado: 'Tu cuenta de transportista fue aprobada', deshabilitado: 'Tu cuenta de transportista fue deshabilitada', suspendido: 'Tu cuenta de transportista fue suspendida' };
    await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      VALUES($1::uuid,'sistema','carrier_status',$2,$3,$4::jsonb,$5)`,
      [userId, titles[status], reason ?? (status === 'habilitado' ? 'Ya puedes ponerte disponible y ofertar en solicitudes cercanas.' : 'Contacta a soporte para más detalles.'),
        JSON.stringify({ status }), `carrier-status:${userId}:${status}:${randomUUID()}`]);
  }
}
