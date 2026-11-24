import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { DomainError } from '../../domain/shared/domain-error';
import { CommissionInput, DisputeOutcome, Reviewer, TransportAdminRepository, ZoneInput } from '../../application/transport/transport-admin';

// Quoted aliases on purpose: canonicalRows renames Spanish columns such as "estado" or "monto".
export class PostgresTransportAdminRepository implements TransportAdminRepository {
  constructor(private readonly client: PoolClient) {}

  /** UC-TRA-38: trips under way with their last GPS position. */
  async liveTrips() {
    const r = await this.client.query(`SELECT t.id AS "tripId",t.solicitud_id AS "requestId",t.estado AS "tripState",t.iniciado_en AS "startedAt",
        s.origen_direccion AS "fromAddress",s.origen_latitud AS "fromLat",s.origen_longitud AS "fromLng",
        s.destino_direccion AS "toAddress",s.destino_latitud AS "toLat",s.destino_longitud AS "toLng",
        u.nombre_completo AS "carrierName",p.usuario_uid AS "carrierUid",v.placa AS "plate",
        pr.latitud AS "lastLat",pr.longitud AS "lastLng",pr.registrado_en AS "lastSeenAt"
      FROM baney.viaje t JOIN baney.solicitud_transporte s ON s.id=t.solicitud_id
      JOIN baney.asignacion a ON a.id=t.asignacion_id JOIN baney.perfil_transportista p ON p.id=a.perfil_transportista_id
      JOIN baney.usuario u ON u.id=p.usuario_uid JOIN baney.vehiculo v ON v.id=a.vehiculo_id
      LEFT JOIN LATERAL (SELECT latitud,longitud,registrado_en FROM baney.punto_rastreo WHERE viaje_id=t.id ORDER BY registrado_en DESC LIMIT 1) pr ON true
      WHERE t.eliminado_en IS NULL AND t.estado NOT IN ('programado','entregado','cancelado')
      ORDER BY t.iniciado_en NULLS LAST LIMIT 500`);
    return r.rows.map(x => ({ tripId: x.tripId, requestId: x.requestId, state: x.tripState, startedAt: x.startedAt,
      origin: { address: x.fromAddress, latitude: Number(x.fromLat), longitude: Number(x.fromLng) },
      destination: { address: x.toAddress, latitude: Number(x.toLat), longitude: Number(x.toLng) },
      carrier: { userId: x.carrierUid, name: x.carrierName, plate: x.plate },
      position: x.lastLat === null ? undefined : { latitude: Number(x.lastLat), longitude: Number(x.lastLng), recordedAt: x.lastSeenAt } }));
  }

  async disputes(status?: string) {
    const r = await this.client.query(`SELECT d.id AS "disputeId",d.numero AS "number",d.entidad_id AS "tripId",d.motivo AS "disputeReason",d.descripcion AS "details",
        d.monto AS "disputeAmount",d.moneda AS "disputeCurrency",d.estado AS "disputeState",d.abierta_por_uid AS "openedBy",u.nombre_completo AS "openedByName",
        d.resultado AS "outcome",d.monto_reembolso AS "refundAmount",d.creado_en AS "openedAt",d.resuelta_en AS "resolvedAt"
      FROM baney.disputa d JOIN baney.usuario u ON u.id=d.abierta_por_uid
      WHERE d.entidad_tipo='viaje' AND ($1::text IS NULL OR d.estado=$1::text) ORDER BY d.creado_en ASC LIMIT 200`, [status ?? null]);
    return r.rows.map(x => ({ id: x.disputeId, number: x.number, tripId: x.tripId, reason: x.disputeReason, description: x.details,
      amount: Number(x.disputeAmount), currency: String(x.disputeCurrency).trim(), status: x.disputeState, openedBy: { userId: x.openedBy, name: x.openedByName },
      outcome: x.outcome, refundAmount: x.refundAmount === null ? undefined : Number(x.refundAmount), openedAt: x.openedAt, resolvedAt: x.resolvedAt }));
  }

  /** UC-TRA-39/40: closes the dispute and, when it refunds, issues an authorized refund (reusing the client's request if any). */
  async resolveDispute(reviewer: Reviewer, disputeId: string, outcome: DisputeOutcome, resolution: string, amount: number | undefined, key: string) {
    const d = (await this.client.query(`SELECT id,pago_id AS "paymentId",monto AS "disputeAmount",moneda AS "disputeCurrency",estado AS "disputeState",
        abierta_por_uid AS "openedBy" FROM baney.disputa WHERE id=$1::uuid AND entidad_tipo='viaje' FOR UPDATE`, [disputeId])).rows[0];
    if (!d) throw new DomainError('Dispute was not found');
    if (d.disputeState === 'resuelta') throw new DomainError('Dispute is already resolved');
    const refundAmount = outcome === 'reembolso_total' ? Number(d.disputeAmount) : amount;
    if (refundAmount !== undefined && refundAmount > Number(d.disputeAmount)) throw new DomainError('Refund exceeds dispute amount');
    const requested = (await this.client.query(`SELECT id FROM baney.reembolso WHERE origen='disputa' AND origen_id=$1::uuid AND estado='solicitado' ORDER BY creado_en DESC LIMIT 1 FOR UPDATE`, [disputeId])).rows[0];
    let refundId: string | undefined;
    if (refundAmount !== undefined) {
      if (requested) {
        await this.client.query(`UPDATE baney.reembolso SET estado='autorizado',monto=$2,autorizado_por_uid=$3::uuid,autorizado_en=now() WHERE id=$1`, [requested.id, refundAmount, reviewer.id]);
        refundId = requested.id;
      } else {
        refundId = randomUUID();
        await this.client.query(`INSERT INTO baney.reembolso(id,pago_id,monto,moneda,origen,origen_id,motivo,estado,idempotency_key,solicitado_por_uid,autorizado_por_uid,autorizado_en)
          VALUES($1,$2,$3,$4,'disputa',$5::uuid,$6,'autorizado',$7,$8::uuid,$8::uuid,now())`,
          [refundId, d.paymentId, refundAmount, d.disputeCurrency, disputeId, resolution, key, reviewer.id]);
      }
      await this.client.query(`INSERT INTO baney.disputa_evento(disputa_id,tipo,actor_uid,detalle) VALUES($1::uuid,'reembolso_emitido',$2::uuid,$3::jsonb)`,
        [disputeId, reviewer.id, JSON.stringify({ refundId, amount: refundAmount })]);
    } else if (requested) {
      await this.client.query(`UPDATE baney.reembolso SET estado='rechazado',motivo_rechazo=$2 WHERE id=$1`, [requested.id, resolution]);
    }
    const r = await this.client.query(`UPDATE baney.disputa SET estado='resuelta',resultado=$2,monto_reembolso=$3,reembolso_id=$4::uuid,resuelta_por_uid=$5::uuid,
        resuelta_en=now(),motivo_resolucion=$6,pago_activo_id=NULL,congela_payout=false,actualizado_en=now()
      WHERE id=$1::uuid RETURNING id AS "disputeId",estado AS "disputeState",resultado AS "outcome",monto_reembolso AS "refundAmount",reembolso_id AS "refundId",resuelta_en AS "resolvedAt"`,
      [disputeId, outcome, refundAmount ?? null, refundId ?? null, reviewer.id, resolution]);
    await this.client.query(`INSERT INTO baney.disputa_evento(disputa_id,tipo,actor_uid,detalle) VALUES($1::uuid,'resuelta',$2::uuid,$3::jsonb)`,
      [disputeId, reviewer.id, JSON.stringify({ outcome })]);
    await this.audit(reviewer, 'disputa.resolver', 'disputa', disputeId, { estado: d.disputeState }, { estado: 'resuelta', resultado: outcome, monto_reembolso: refundAmount ?? null });
    await this.client.query(`INSERT INTO baney.notificacion(usuario_uid,categoria,plantilla_codigo,titulo,cuerpo,carga,idempotency_key)
      VALUES($1::uuid,'soporte','dispute_resolved','Tu disputa fue resuelta',$2,$3::jsonb,$4)`,
      [d.openedBy, outcome === 'sin_reembolso' ? `Resolución: ${resolution}` : `Se emitió un reembolso de ${refundAmount} ${String(d.disputeCurrency).trim()}. ${resolution}`,
        JSON.stringify({ disputeId, outcome, refundAmount: refundAmount ?? null }), `dispute-resolved:${disputeId}`]);
    const x = r.rows[0];
    return { id: x.disputeId, status: x.disputeState, outcome: x.outcome, refundAmount: x.refundAmount === null ? undefined : Number(x.refundAmount), refundId: x.refundId ?? undefined, resolvedAt: x.resolvedAt };
  }

  /** UC-TRA-41 */
  async createZone(reviewer: Reviewer, zone: ZoneInput) {
    const r = await this.client.query(`INSERT INTO baney.zona_servicio(nombre,tipo,centro_latitud,centro_longitud,radio_metros,activa,creado_por_uid)
      VALUES($1,'zona_servicio',$2,$3,$4,$5,$6::uuid) RETURNING ${ZONE_FIELDS}`, [zone.name, zone.latitude, zone.longitude, zone.radiusMeters, zone.active ?? true, reviewer.id]);
    await this.audit(reviewer, 'zona.crear', 'zona_servicio', r.rows[0].zoneId, null, zone);
    return zoneDto(r.rows[0]);
  }

  async updateZone(reviewer: Reviewer, zoneId: string, changes: Partial<ZoneInput>) {
    const before = (await this.client.query(`SELECT ${ZONE_FIELDS} FROM baney.zona_servicio WHERE id=$1::uuid AND tipo='zona_servicio' FOR UPDATE`, [zoneId])).rows[0];
    if (!before) throw new DomainError('Service zone was not found');
    const r = await this.client.query(`UPDATE baney.zona_servicio SET nombre=COALESCE($2,nombre),centro_latitud=COALESCE($3,centro_latitud),centro_longitud=COALESCE($4,centro_longitud),
        radio_metros=COALESCE($5,radio_metros),activa=COALESCE($6,activa),actualizado_en=now() WHERE id=$1::uuid RETURNING ${ZONE_FIELDS}`,
      [zoneId, changes.name ?? null, changes.latitude ?? null, changes.longitude ?? null, changes.radiusMeters ?? null, changes.active ?? null]);
    await this.audit(reviewer, 'zona.editar', 'zona_servicio', zoneId, zoneDto(before), changes);
    return zoneDto(r.rows[0]);
  }

  /** UC-TRA-42: a new global transport rule takes effect now and closes the previous ones (history is kept). */
  async createCommissionRule(reviewer: Reviewer, rule: CommissionInput) {
    const closed = await this.client.query(`UPDATE baney.regla_comision SET vigente_hasta=now() WHERE aplica_a='transporte' AND ambito='global'
      AND vigente_desde<now() AND (vigente_hasta IS NULL OR vigente_hasta>now()) RETURNING id`);
    const r = await this.client.query(`INSERT INTO baney.regla_comision(nombre,aplica_a,ambito,tipo,porcentaje,monto_fijo,minimo,maximo,moneda,prioridad,vigente_desde,creado_por_uid)
      VALUES($1,'transporte','global',$2,$3,$4,$5,$6,$7,1,now(),$8::uuid)
      RETURNING id AS "ruleId",nombre AS "ruleName",tipo AS "ruleType",porcentaje AS "rulePercentage",monto_fijo AS "ruleFixed",minimo AS "ruleMin",maximo AS "ruleMax",moneda AS "ruleCurrency",vigente_desde AS "validFrom"`,
      [rule.name, rule.type, rule.percentage, rule.fixedAmount, rule.minimum ?? null, rule.maximum ?? null, rule.currency, reviewer.id]);
    const x = r.rows[0];
    await this.audit(reviewer, 'comision.crear', 'regla_comision', x.ruleId, { reglasCerradas: closed.rows.map(c => c.id) }, rule);
    return { id: x.ruleId, name: x.ruleName, type: x.ruleType, percentage: Number(x.rulePercentage), fixedAmount: Number(x.ruleFixed),
      minimum: x.ruleMin === null ? undefined : Number(x.ruleMin), maximum: x.ruleMax === null ? undefined : Number(x.ruleMax),
      currency: String(x.ruleCurrency).trim(), validFrom: x.validFrom, replaced: closed.rows.length };
  }

  private async audit(reviewer: Reviewer, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
    await this.client.query(`INSERT INTO baney.auditoria(modulo,accion,actor_uid,actor_rol,entidad_tipo,entidad_uid,antes,despues)
      VALUES('transporte',$1,$2::uuid,$3,$4,$5::uuid,$6::jsonb,$7::jsonb)`,
      [action, reviewer.id, reviewer.role, entity, entityId, before === null ? null : JSON.stringify(before), JSON.stringify(after)]);
  }
}

const ZONE_FIELDS = `id AS "zoneId",nombre AS "zoneName",centro_latitud AS "centerLat",centro_longitud AS "centerLng",radio_metros AS "radius",activa AS "isActive"`;
function zoneDto(x: Record<string, unknown>) {
  return { id: x.zoneId, name: x.zoneName, center: { latitude: Number(x.centerLat), longitude: Number(x.centerLng) }, radiusMeters: Number(x.radius), active: x.isActive };
}
